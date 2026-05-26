/**
 * @module imageExporter
 * Encodes a flat RGBA image as PNG, guaranteeing output ≤ maxBytes (US-04).
 *
 * Encoding strategy:
 *  1. Encode at native dimensions as PNG.
 *  2. If output exceeds maxBytes, downscale by SCALE_FACTOR (0.75) per iteration
 *     using nearest-neighbour, stopping when both edges reach MIN_EDGE (800 px,
 *     per scenario 7.6 min 800 px width) or the file fits.
 *  3. Throws EXPORT_TOO_LARGE if downscaling cannot bring the image under maxBytes.
 *
 * Note: This module is PNG-only by design. Cloudflare Workers do not ship with a
 * JPEG encoder and pulling in a JS encoder bloats the worker bundle. PNG keeps
 * the pipeline lossless and works for every browser MemeBro targets.
 */

import { MAX_FILE_SIZE } from "./validator.js";
import { ErrorCodes } from "./errors.js";
import { encodePNG, decodePNG } from "./pngUtil.js";

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

/**
 * Exports a flat RGBA image as a PNG ArrayBuffer, guaranteeing output ≤ maxBytes.
 *
 * @param {Object} opts
 * @param {Uint8Array|ArrayBuffer} opts.data
 *   RGBA pixel buffer (width×height×4, row-major) OR a PNG ArrayBuffer.
 *   PNG input is detected by magic bytes and decoded automatically.
 * @param {number} opts.width  - Image width in pixels
 * @param {number} opts.height - Image height in pixels
 * @param {"png"} [opts.format="png"] - Only "png" is supported.
 * @param {number} [opts.maxBytes] - Size cap; defaults to MAX_FILE_SIZE (10 MB)
 * @returns {Promise<{
 *   buffer: ArrayBuffer,
 *   format: "png",
 *   mimeType: "image/png",
 *   byteLength: number,
 *   width: number,
 *   height: number
 * }>}
 * @throws {Error} with code EXPORT_TOO_LARGE if the image cannot fit in maxBytes
 */
export async function exportImage({
  data,
  width,
  height,
  format = "png",
  maxBytes = MAX_FILE_SIZE,
}) {
  if (format !== "png") {
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

  let buf = await encodePNG(w, h, rgba);
  if (buf.byteLength <= maxBytes) {
    return buildResult(buf, w, h);
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

    buf = await encodePNG(scaledW, scaledH, scaledRgba);

    if (buf.byteLength <= maxBytes) {
      return buildResult(buf, scaledW, scaledH);
    }
  }

  const err = new Error(
    `Cannot compress image below ${maxBytes} bytes ` +
    `(PNG, downscaled to ${scaledW}×${scaledH})`,
  );
  err.code = ErrorCodes.EXPORT_TOO_LARGE;
  throw err;
}

function buildResult(buffer, width, height) {
  return {
    buffer,
    format: "png",
    mimeType: "image/png",
    byteLength: buffer.byteLength,
    width,
    height,
  };
}
