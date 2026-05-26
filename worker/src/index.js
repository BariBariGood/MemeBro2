/**
 * @module index
 * Cloudflare Worker entry point for the MemeBro backend gateway.
 * Accepts client requests, validates upload payloads, and routes supported
 * modes to upstream APIs without exposing external URLs or API keys.
 */

import { callAPI, redactSecrets } from "./callManager.js";
import { ErrorCodes } from "./errors.js";
import { handleCaptionRequest } from "./openai/caption.js";
import {
  buildImageResponseFromBody,
  handleImageRequest,
} from "./openai/image.js";
import { compositeImage } from "./image-compositor.js";
import { MAX_FILE_SIZE, sanitizeFilename, validateUpload } from "./validator.js";

const GATEWAY_PATH = "/api/process";
const CAPTION_PATH = "/api/caption";
const IMAGE_PATH = "/api/image";

/**
 * Builds a JSON Response with the gateway's common content type.
 *
 * @param {unknown} body - JSON-serializable response body
 * @param {number} status - HTTP status code
 * @returns {Response} Worker response
 */
function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Converts known gateway errors into HTTP response statuses.
 *
 * @param {Error} err - Error thrown by validation or upstream routing
 * @returns {number} HTTP status code
 */
function statusForError(err) {
  if (err.code === ErrorCodes.PAYLOAD_TOO_LARGE) return 413;
  if (err.code === ErrorCodes.INVALID_MODE) return 400;
  if (err.code === ErrorCodes.CLIENT_ERROR) return 400;
  if (err.code === ErrorCodes.RATE_LIMITED) return 429;
  if (err.code === ErrorCodes.MISSING_API_KEY) return 500;
  return 502;
}

/**
 * Builds a structured error response without leaking configured secrets.
 *
 * @param {Error} err - Error thrown while handling the request
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Response} JSON error response
 */
function errorResponse(err, env) {
  const code = err.code || ErrorCodes.SERVER_ERROR;
  return jsonResponse(
    {
      code,
      message: redactSecrets(err.message, env),
      retryable: Boolean(err.retryable),
    },
    statusForError(err)
  );
}

/**
 * Throws PAYLOAD_TOO_LARGE when Content-Length already exceeds the limit.
 *
 * @param {Request} request - Incoming Worker request
 * @throws {Error} PAYLOAD_TOO_LARGE when Content-Length is over 10 MB
 */
function rejectOversizedContentLength(request) {
  const contentLength = request.headers.get("Content-Length");

  if (contentLength && Number(contentLength) > MAX_FILE_SIZE) {
    const err = new Error("Maximum upload size is 10 MB");
    err.code = ErrorCodes.PAYLOAD_TOO_LARGE;
    err.retryable = false;
    throw err;
  }
}

/**
 * Reads the request body and enforces the 10 MB upload limit.
 *
 * @param {Request} request - Incoming Worker request
 * @returns {Promise<ArrayBuffer>} Raw request body
 * @throws {Error} PAYLOAD_TOO_LARGE when the body exceeds 10 MB
 */
async function readLimitedBody(request) {
  rejectOversizedContentLength(request);

  const buffer = await request.arrayBuffer();

  if (buffer.byteLength > MAX_FILE_SIZE) {
    const err = new Error("Maximum upload size is 10 MB");
    err.code = ErrorCodes.PAYLOAD_TOO_LARGE;
    err.retryable = false;
    throw err;
  }

  return buffer;
}

/**
 * Extracts a gateway mode from URL search params, headers, or JSON payload.
 *
 * @param {Request} request - Incoming Worker request
 * @param {Object|null} payload - Parsed JSON payload, when available
 * @returns {string|undefined} Requested gateway mode
 */
function getMode(request, payload = null) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("mode") ||
    request.headers.get("X-MemeBro-Mode") ||
    payload?.mode
  );
}

/**
 * Prepares an outbound request from a JSON client payload.
 *
 * @param {Request} request - Incoming Worker request
 * @param {ArrayBuffer} buffer - Raw request body
 * @returns {{ mode: string|undefined, options: RequestInit }} Outbound call
 */
function prepareJsonOutbound(request, buffer) {
  const text = new TextDecoder().decode(buffer);
  const payload = text ? JSON.parse(text) : {};
  const mode = getMode(request, payload);
  const outboundBody = JSON.stringify(payload);

  return {
    mode,
    payload,
    isJson: true,
    options: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: outboundBody,
    },
  };
}

/**
 * Validates a raw image upload and prepares it for upstream forwarding.
 *
 * @param {Request} request - Incoming Worker request
 * @param {ArrayBuffer} buffer - Raw request body
 * @returns {{ mode: string|undefined, options: RequestInit }} Outbound call
 */
function prepareImageOutbound(request, buffer) {
  const mimeType = request.headers.get("Content-Type")?.split(";")[0] || "";
  const filename = request.headers.get("X-MemeBro-Filename") || "upload";
  const validation = validateUpload({
    buffer,
    mimeType,
    filename,
    size: buffer.byteLength,
  });

  return {
    mode: getMode(request),
    payload: null,
    isJson: false,
    buffer,
    mimeType,
    requestHeaders: request.headers,
    options: {
      method: "POST",
      headers: {
        "Content-Type": mimeType,
        "X-MemeBro-Filename": sanitizeFilename(validation.filename),
      },
      body: buffer,
    },
  };
}

/**
 * Parses and validates the gateway request body before an upstream call.
 *
 * @param {Request} request - Incoming Worker request
 * @returns {Promise<{ mode: string|undefined, options: RequestInit }>}
 * Prepared outbound request
 */
async function prepareOutboundRequest(request) {
  const buffer = await readLimitedBody(request);
  const contentType = request.headers.get("Content-Type") || "";

  if (contentType.includes("application/json")) {
    return prepareJsonOutbound(request, buffer);
  }

  if (contentType.startsWith("image/")) {
    return prepareImageOutbound(request, buffer);
  }

  const err = new Error("Unsupported request content type");
  err.code = ErrorCodes.CLIENT_ERROR;
  err.retryable = false;
  throw err;
}

/**
 * Determines whether the old `extra_roast` gateway mode should run against
 * the worker-local /api/image implementation instead of an external URL.
 * We only use the local path when neither EXTRA_ROAST_API_URL nor
 * IMAGE_GEN_API_URL is configured, so existing deployments keep their
 * current upstream behavior without any changes.
 *
 * @param {string|undefined} mode - Requested gateway mode
 * @param {Object} env - Cloudflare Workers env object
 * @returns {boolean}
 */
function shouldUseLocalImageGeneration(mode, env) {
  if (mode !== "extra_roast") return false;
  const hasExtraRoastUrl = Boolean(String(env?.EXTRA_ROAST_API_URL ?? "").trim());
  const hasImageGenUrl = Boolean(String(env?.IMAGE_GEN_API_URL ?? "").trim());
  return !hasExtraRoastUrl && !hasImageGenUrl;
}

function shouldUseLocalFaceSwap(mode, isJson, requestHeaders) {
  return mode === "face_swap" && !isJson && Boolean(requestHeaders?.get("X-MemeBro-Face-Crop"));
}

async function handleLocalFaceSwap({ buffer, mimeType, requestHeaders }, env) {
  const selectedTemplateId = requestHeaders.get("X-MemeBro-Template") || "";
  const faceCropBounds = parseJsonHeader(requestHeaders, "X-MemeBro-Face-Crop") || {};
  const textOptions = parseJsonHeader(requestHeaders, "X-MemeBro-Text-Style") || {};
  const memeText = requestHeaders.get("X-MemeBro-Meme-Text") || "TAP TO EDIT TEXT";
  const templateImage = await loadTemplateImage(selectedTemplateId, env);
  const faceRegion = getTemplateFaceRegion(templateImage.template);

  const result = await compositeImage({
    templateImage,
    faceCrop: {
      b64: arrayBufferToBase64(buffer),
      mimeType,
      width: Number(faceCropBounds.width),
      height: Number(faceCropBounds.height),
      bounds: faceCropBounds,
    },
    text: memeText,
    faceRegion,
    textOptions,
    env,
  });

  if (result instanceof Response) return result;
  return jsonResponse(result);
}

function parseJsonHeader(headers, name) {
  const raw = headers.get(name);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const err = new Error(`Invalid ${name} header`);
    err.code = ErrorCodes.CLIENT_ERROR;
    err.retryable = false;
    throw err;
  }
}

async function loadTemplateImage(templateId, env) {
  if (!env?.ASSETS?.fetch) {
    const err = new Error("Static assets are required for local face compositing");
    err.code = ErrorCodes.CLIENT_ERROR;
    err.retryable = false;
    throw err;
  }

  const catalogResponse = await env.ASSETS.fetch(new Request("https://assets.local/templates.json"));
  if (!catalogResponse.ok) {
    const err = new Error("Template catalog could not be loaded");
    err.code = ErrorCodes.SERVER_ERROR;
    err.retryable = true;
    throw err;
  }

  const catalog = await catalogResponse.json();
  const template = catalog.templates?.find((entry) => entry.id === templateId);
  if (!template) {
    const err = new Error("Selected template was not found");
    err.code = ErrorCodes.CLIENT_ERROR;
    err.retryable = false;
    throw err;
  }

  const imagePath = template.templateImage || template.images?.main || template.previewImage;
  const imageResponse = await env.ASSETS.fetch(new Request(`https://assets.local${imagePath}`));
  if (!imageResponse.ok) {
    const err = new Error("Template image could not be loaded");
    err.code = ErrorCodes.SERVER_ERROR;
    err.retryable = true;
    throw err;
  }

  const mimeType = imageResponse.headers.get("content-type")?.split(";")[0] || "image/png";
  const buffer = await imageResponse.arrayBuffer();
  return {
    template,
    b64: arrayBufferToBase64(buffer),
    mimeType,
    width: template.images?.width,
    height: template.images?.height,
    path: imagePath,
  };
}

function getTemplateFaceRegion(template) {
  const region = template?.faceRegions?.[0];
  if (!region) {
    const err = new Error("Selected template does not define a face region");
    err.code = ErrorCodes.CLIENT_ERROR;
    err.retryable = false;
    throw err;
  }
  return region;
}

function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

/**
 * Handles the MemeBro API gateway route.
 *
 * @param {Request} request - Incoming Worker request
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Promise<Response>} JSON response from the gateway
 */
export async function handleGatewayRequest(request, env) {
  try {
    if (request.method !== "POST") {
      return jsonResponse(
        { code: "METHOD_NOT_ALLOWED", message: "Use POST for API requests" },
        405
      );
    }

    const prepared = await prepareOutboundRequest(request);
    const { mode, options, payload, isJson } = prepared;

    if (isJson && shouldUseLocalImageGeneration(mode, env)) {
      return buildImageResponseFromBody(payload ?? {}, env);
    }

    if (shouldUseLocalFaceSwap(mode, isJson, prepared.requestHeaders)) {
      return handleLocalFaceSwap(prepared, env);
    }

    const data = await callAPI(mode, options, env);

    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err, env);
  }
}

export default {
  /**
   * Cloudflare Worker fetch handler.
   *
   * @param {Request} request - Incoming Worker request
   * @param {Object} env - Cloudflare Workers env object
   * @returns {Promise<Response>} Worker response
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === CAPTION_PATH) {
      return handleCaptionRequest(request, env);
    }

    if (url.pathname === IMAGE_PATH) {
      return handleImageRequest(request, env);
    }

    if (url.pathname === GATEWAY_PATH) {
      return handleGatewayRequest(request, env);
    }

    // Serve static frontend/docs assets in dev and production deployments.
    if (env.ASSETS?.fetch) {
      return env.ASSETS.fetch(request);
    }

    return jsonResponse({
      name: "MemeBro API gateway",
      route: GATEWAY_PATH,
    });
  },
};
