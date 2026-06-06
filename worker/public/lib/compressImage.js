/**
 * @module compressImage
 * Client-side image compression for face photo uploads.
 * Resizes oversized images to max 1024px on the longest side,
 * re-encodes as JPEG at quality 0.85, and strips EXIF metadata.
 */

const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.85;

/**
 * Compress a face-crop blob before uploading to the API.
 * - Applies EXIF orientation correction via createImageBitmap.
 * - Resizes if longest side exceeds 1024px.
 * - Re-encodes as JPEG at quality 0.85 (strips all metadata).
 *
 * @param {Blob} blob - The source image blob (face crop).
 * @returns {Promise<Blob>} Compressed JPEG blob.
 */
export async function compressForUpload(blob) {
  if (typeof createImageBitmap === "undefined") {
    return blob;
  }

  const bitmap = await createImageBitmap(blob, {
    imageOrientation: "from-image",
  });

  let targetWidth = bitmap.width;
  let targetHeight = bitmap.height;
  const longest = Math.max(targetWidth, targetHeight);

  if (longest > MAX_EDGE) {
    const scale = MAX_EDGE / longest;
    targetWidth = Math.round(targetWidth * scale);
    targetHeight = Math.round(targetHeight * scale);
  }

  let canvas;
  let ctx;

  if (typeof OffscreenCanvas !== "undefined") {
    canvas = new OffscreenCanvas(targetWidth, targetHeight);
    ctx = canvas.getContext("2d");
  } else {
    canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    ctx = canvas.getContext("2d");
  }

  if (!ctx) {
    bitmap.close();
    return blob;
  }

  ctx.drawImage(bitmap, 0, 0, targetWidth, targetHeight);
  bitmap.close();

  let compressed;
  if (canvas instanceof OffscreenCanvas) {
    compressed = await canvas.convertToBlob({
      type: "image/jpeg",
      quality: JPEG_QUALITY,
    });
  } else {
    compressed = await new Promise((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
  }

  if (!compressed || compressed.size >= blob.size) {
    return blob;
  }

  return compressed;
}
