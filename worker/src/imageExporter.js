/**
 * @module imageExporter
 * Encodes a flat RGBA image as JPEG or PNG, guaranteeing output ≤ maxBytes (US-04).
 *
 * Encoding strategy:
 *  1. Encode at requested quality (default 85 for JPEG).
 *  2. If output exceeds maxBytes and format is JPEG: lower quality in QUALITY_STEP
 *     increments down to MIN_QUALITY (60).
 *  3. If still over limit: downscale dimensions by SCALE_FACTOR (0.75) per iteration,
 *     nearest-neighbour, stopping when both edges reach MIN_EDGE (800 px, per
 *     scenario 7.6 min 800 px width) or file fits.
 *  4. Throws EXPORT_TOO_LARGE if all strategies are exhausted.
 */

import { MAX_FILE_SIZE } from "./validator.js";
import { ErrorCodes } from "./errors.js";
import { encodePNG, decodePNG } from "./pngUtil.js";
import jpeg from "jpeg-js";

const DEFAULT_QUALITY = 85;
const MIN_QUALITY = 60;
const QUALITY_STEP = 10;
export const MIN_EDGE = 800;
const SCALE_FACTOR = 0.75;
const MAX_SCALE_ITERS = 10;

function scaleDown(rgba, srcW, srcH, dstW, dstH) {
  const out = new Uint8Array(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const sy = Math.floor(y * yRatio);
    for (let x = 0; x < dstW; x++) {
      const sx = Math.floor(x * xRatio);
      const si = (sy * srcW + sx) * 4;
      const di = (y * dstW + x) * 4;
      out[di]     = rgba[si];
      out[di + 1] = rgba[si + 1];
      out[di + 2] = rgba[si + 2];
      out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

async function encodeToBuffer(format, rgba, w, h, q) {
  if (format === "jpeg") {
    const encoded = jpeg.encode({ data: rgba, width: w, height: h }, q);
    const buf = new ArrayBuffer(encoded.data.length);
    new Uint8Array(buf).set(encoded.data);
    return buf;
  }
  return encodePNG(w, h, rgba);
}

/**
 * Exports a flat RGBA image as JPEG or PNG, guaranteeing output ≤ maxBytes.
 *
 * @param {Object} opts
 * @param {Uint8Array|ArrayBuffer} opts.data
 *   RGBA pixel buffer (width×height×4, row-major) OR a PNG ArrayBuffer.
 *   PNG input is detected by magic bytes and decoded automatically.
 * @param {number} opts.width  - Image width in pixels
 * @param {number} opts.height - Image height in pixels
 * @param {"jpeg"|"png"} [opts.format="jpeg"] - Output format
 * @param {number} [opts.quality=85] - JPEG quality 1–100; ignored for PNG
 * @param {number} [opts.maxBytes] - Size cap; defaults to MAX_FILE_SIZE (10 MB)
 * @returns {Promise<{
 *   buffer: ArrayBuffer,
 *   format: string,
 *   mimeType: string,
 *   byteLength: number,
 *   width: number,
 *   height: number,
 *   qualityUsed?: number
 * }>}
 * @throws {Error} with code EXPORT_TOO_LARGE if the image cannot fit in maxBytes
 */
export async function exportImage({
  data,
  width,
  height,
  format = "jpeg",
  quality = DEFAULT_QUALITY,
  maxBytes = MAX_FILE_SIZE,
}) {
  if (format !== "jpeg" && format !== "png") {
    const err = new Error(`Unsupported export format: ${format}`);
    err.code = ErrorCodes.CLIENT_ERROR;
    throw err;
  }

  let rgba;
  let w = width;
  let h = height;

  if (data instanceof ArrayBuffer) {
    const probe = new Uint8Array(data, 0, Math.min(4, data.byteLength));
    const isPng =
      probe[0] === 0x89 && probe[1] === 0x50 &&
      probe[2] === 0x4e && probe[3] === 0x47;
    if (isPng) {
      const decoded = await decodePNG(data);
      rgba = decoded.rgba;
      w = decoded.width;
      h = decoded.height;
    } else {
      rgba = new Uint8Array(data);
    }
  } else {
    rgba = data instanceof Uint8Array ? data : new Uint8Array(data);
  }

  let currentQ = Math.max(MIN_QUALITY, Math.min(100, quality));
  let buf = await encodeToBuffer(format, rgba, w, h, currentQ);

  if (buf.byteLength <= maxBytes) {
    return buildResult(buf, format, w, h, format === "jpeg" ? currentQ : undefined);
  }

  if (format === "jpeg") {
    while (currentQ > MIN_QUALITY) {
      currentQ = Math.max(MIN_QUALITY, currentQ - QUALITY_STEP);
      buf = await encodeToBuffer(format, rgba, w, h, currentQ);
      if (buf.byteLength <= maxBytes) {
        return buildResult(buf, format, w, h, currentQ);
      }
    }
  }

  let scaledRgba = rgba;
  let scaledW = w;
  let scaledH = h;

  for (let i = 0; i < MAX_SCALE_ITERS; i++) {
    const newW = scaledW > MIN_EDGE
      ? Math.max(MIN_EDGE, Math.round(scaledW * SCALE_FACTOR))
      : scaledW;
    const newH = scaledH > MIN_EDGE
      ? Math.max(MIN_EDGE, Math.round(scaledH * SCALE_FACTOR))
      : scaledH;

    if (newW === scaledW && newH === scaledH) break;

    scaledRgba = scaleDown(scaledRgba, scaledW, scaledH, newW, newH);
    scaledW = newW;
    scaledH = newH;

    const q = format === "jpeg" ? MIN_QUALITY : currentQ;
    buf = await encodeToBuffer(format, scaledRgba, scaledW, scaledH, q);

    if (buf.byteLength <= maxBytes) {
      return buildResult(buf, format, scaledW, scaledH,
        format === "jpeg" ? q : undefined);
    }
  }

  const err = new Error(
    `Cannot compress image below ${maxBytes} bytes ` +
    `(tried JPEG quality ${MIN_QUALITY} and dimensions ${scaledW}×${scaledH})`,
  );
  err.code = ErrorCodes.EXPORT_TOO_LARGE;
  throw err;
}

function buildResult(buffer, format, width, height, qualityUsed) {
  const result = {
    buffer,
    format,
    mimeType: format === "jpeg" ? "image/jpeg" : "image/png",
    byteLength: buffer.byteLength,
    width,
    height,
  };
  if (qualityUsed !== undefined) result.qualityUsed = qualityUsed;
  return result;
}
