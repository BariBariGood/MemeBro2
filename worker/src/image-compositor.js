/**
 * @module image-compositor
 * Server-side image compositing pipeline.
 * Validates inputs, composites a face crop and optional text overlay
 * onto the template image, and returns the final PNG.
 */

import {
  validateFaceCrop,
  validateMemeText,
  validateTemplateImage,
} from "./validator.js";
import { buildImageResponseFromBody } from "./openai/image.js";
import { renderTextOverlay } from "./textRenderer.js";
import { decodePNG } from "./pngUtil.js";
import { exportImage } from "./imageExporter.js";

/**
 * Composites a face crop and optional text onto a template image.
 *
 * @param {object} params
 * @param {string} params.templateImage - Base-64 PNG of the meme template
 * @param {string} params.faceCrop - Base-64 PNG of the cropped face
 * @param {string} [params.text] - Optional meme caption text
 * @param {object} [params.faceRegion] - Placement rectangle for the face
 * @param {object} [params.textOptions] - Font, color, and position options
 * @param {object} params.env - Cloudflare Workers env object
 * @returns {Promise<Response>} PNG response
 */
export async function compositeImage({
  templateImage,
  faceCrop,
  text,
  faceRegion,
  textOptions,
  env,
}) {
  validateTemplateImage(templateImage);
  validateFaceCrop(faceCrop);

  const safeText = validateMemeText(text);
  const prompt = buildCompositePrompt({ safeText, faceRegion, textOptions });
  const imageResponse = await buildImageResponseFromBody(
    {
      mode: "cast",
      prompt,
      referenceB64: faceCrop.b64,
      referenceMime: faceCrop.mimeType,
      templateRefB64: templateImage.b64,
      templateRefMime: templateImage.mimeType,
      quality: "low",
      size: "1024x1024",
    },
    env
  );

  if (!imageResponse.ok) return imageResponse;

  const generated = await imageResponse.json().catch(() => null);
  const b64 = generated?.b64;
  if (!b64) {
    return jsonResponse({ error: "no_image_returned" }, 502);
  }

  // Return the raw OpenAI image directly. The server-side text overlay
  // (applyTextAndOptimize) uses a minimal PNG decoder that doesn't handle
  // all color types and filter modes, corrupting the image. Text is added
  // client-side in the editor instead.
  const mimeType = "image/png";

  return {
    generatedImageUrl: `data:${mimeType};base64,${b64}`,
    b64,
    mimeType,
    model: generated.model,
    quality: generated.quality,
    size: generated.size,
    mode: "face_swap",
  };
}

function buildCompositePrompt({ safeText, faceRegion, textOptions }) {
  const region = faceRegion
    ? `Template face region: x=${faceRegion.x}, y=${faceRegion.y}, width=${faceRegion.width}, height=${faceRegion.height}.`
    : "Use the most obvious face region in the template.";
  const outline = textOptions?.outlineEnabled === false
    ? "without an outline"
    : `with a ${textOptions?.outlineColor || "white"} outline`;
  return [
    "Create a meme image by casting the subject face crop into the provided meme template.",
    region,
    "Preserve the original template composition and avoid distorting the subject face.",
    `Render the meme text "${safeText}" clearly on top of the result ${outline}.`,
    `Use ${textOptions?.textColor || "black"} text color when possible.`,
  ].join(" ");
}

async function applyTextAndOptimize(generatedB64, text, textOptions = {}) {
  try {
    const imageBuffer = base64ToArrayBuffer(generatedB64);
    const decoded = await decodePNG(imageBuffer);
    const bbox = {
      x: 0,
      y: Math.floor(decoded.height * 0.72),
      width: decoded.width,
      height: Math.max(1, Math.floor(decoded.height * 0.25)),
    };
    const overlay = await renderTextOverlay({
      text,
      fontSize: Number(textOptions.fontPx) || Math.max(24, Math.floor(decoded.width / 16)),
      bbox,
      strokeWidth: textOptions.outlineEnabled === false ? 0 : 2,
      strokeColor: textOptions.outlineColor || "#ffffff",
      fillColor: textOptions.textColor || "#000000",
    });
    const overlayDecoded = await decodePNG(overlay.png);
    const rgba = compositeOverlay(decoded.rgba, decoded.width, decoded.height, overlayDecoded.rgba, bbox.x, bbox.y, overlayDecoded.width, overlayDecoded.height);
    const exported = await exportImage({
      data: rgba,
      width: decoded.width,
      height: decoded.height,
      format: "png",
    });
    return {
      b64: arrayBufferToBase64(exported.buffer),
      mimeType: exported.mimeType,
    };
  } catch {
    return {
      b64: generatedB64,
      mimeType: "image/png",
    };
  }
}

function compositeOverlay(base, baseWidth, baseHeight, overlay, x, y, overlayWidth, overlayHeight) {
  const out = new Uint8Array(base);
  for (let oy = 0; oy < overlayHeight; oy += 1) {
    const by = y + oy;
    if (by < 0 || by >= baseHeight) continue;
    for (let ox = 0; ox < overlayWidth; ox += 1) {
      const bx = x + ox;
      if (bx < 0 || bx >= baseWidth) continue;
      const si = (oy * overlayWidth + ox) * 4;
      const alpha = overlay[si + 3] / 255;
      if (alpha <= 0) continue;
      const di = (by * baseWidth + bx) * 4;
      out[di] = Math.round(overlay[si] * alpha + out[di] * (1 - alpha));
      out[di + 1] = Math.round(overlay[si + 1] * alpha + out[di + 1] * (1 - alpha));
      out[di + 2] = Math.round(overlay[si + 2] * alpha + out[di + 2] * (1 - alpha));
      out[di + 3] = 255;
    }
  }
  return out;
}

function base64ToArrayBuffer(b64) {
  const clean = String(b64).replace(/^data:[^,]+,/, "");
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}