/**
 * @module index
 * Cloudflare Worker entry point for the MemeBro backend gateway.
 * Accepts client requests, validates upload payloads, and routes supported
 * modes to upstream APIs without exposing external URLs or API keys.
 */

import { callAPI, redactSecrets } from "./callManager.js";
import { ErrorCodes } from "./errors.js";
import {
  assertFeatureEnabled,
  getFeatureAvailability,
} from "./fallback.js";
import { getServiceHealth } from "./healthCheck.js";
import { handleCaptionRequest } from "./openai/caption.js";
import {
  buildImageResponseFromBody,
  handleImageRequest,
} from "./openai/image.js";
import { enqueueRequest } from "./requestQueue.js";
import { MAX_FILE_SIZE, sanitizeFilename, validateUpload } from "./validator.js";

const GATEWAY_PATH = "/api/process";
const CAPTION_PATH = "/api/caption";
const IMAGE_PATH = "/api/image";
const HEALTH_PATH = "/api/health";

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
  if (err.code === ErrorCodes.INVALID_DIMENSIONS) return 400;
  if (err.code === ErrorCodes.RATE_LIMITED) return 429;
  if (err.code === ErrorCodes.QUEUE_FULL) return 503;
  if (err.code === ErrorCodes.FEATURE_DISABLED) return 503;
  if (err.code === ErrorCodes.SERVICE_UNAVAILABLE) return 503;
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
  const body = {
    code,
    message: redactSecrets(err.message, env),
    retryable: Boolean(err.retryable),
  };
  if (err.feature) body.feature = err.feature;
  return jsonResponse(body, statusForError(err));
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

    const { mode, options, payload, isJson } = await prepareOutboundRequest(request);

    // Fallback strategy (issue #33): refuse the request early when the
    // upstream powering this mode is currently unhealthy. The client sees a
    // FEATURE_DISABLED error code so it can disable the affected UI affordance
    // instead of looking like the whole app crashed.
    await assertFeatureEnabled(mode, env);

    if (isJson && shouldUseLocalImageGeneration(mode, env)) {
      return enqueueRequest(() => buildImageResponseFromBody(payload ?? {}, env));
    }

    // Request queue (issue #34): smooths bursts above 10 req/s and applies
    // backpressure once the FIFO queue is saturated.
    const data = await enqueueRequest(() => callAPI(mode, options, env));

    return jsonResponse(data);
  } catch (err) {
    return errorResponse(err, env);
  }
}

/**
 * Handles GET /api/health. Returns the current upstream health snapshot so
 * monitoring tools and the frontend can detect degraded modes without
 * hitting the real API.
 *
 * @param {Request} request - Incoming Worker request
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Promise<Response>}
 */
export async function handleHealthRequest(request, env) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return jsonResponse(
      { code: "METHOD_NOT_ALLOWED", message: "Use GET for /api/health" },
      405
    );
  }

  try {
    const url = new URL(request.url);
    const force = url.searchParams.get("force") === "1";

    const features = await getFeatureAvailability(env);
    const faceSwap = await getServiceHealth("face_swap", env, { force });

    const allHealthy = Object.values(features).every((f) => f.healthy);

    return jsonResponse({
      status: allHealthy ? "ok" : "degraded",
      timestamp: Date.now(),
      services: {
        face_swap: {
          healthy: faceSwap.healthy,
          checkedAt: faceSwap.checkedAt,
          cached: faceSwap.cached,
          statusCode: faceSwap.statusCode,
          reason: faceSwap.reason,
        },
      },
      features,
    });
  } catch (err) {
    return jsonResponse(
      {
        status: "error",
        timestamp: Date.now(),
        message: redactSecrets(err.message, env),
      },
      500
    );
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

    if (url.pathname === HEALTH_PATH) {
      return handleHealthRequest(request, env);
    }

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
