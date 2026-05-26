/**
 * @module validator
 * Validates image uploads before they enter the processing pipeline.
 * Checks MIME type, file size, magic bytes (spoof detection), and filename safety.
 * Called by index.js before any upload reaches face detection or AI services.
 */
import { ErrorCodes } from "./errors.js";

/** Maximum allowed file size: 10 MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** Minimum image dimension in pixels */
export const MIN_DIMENSION = 100;

/** Maximum image dimension in pixels */
export const MAX_DIMENSION = 4096;

/** Minimum face crop dimension for compositing */
const MIN_FACE_CROP_DIMENSION = 50;

/** Maximum face crop dimension for compositing */
const MAX_FACE_CROP_DIMENSION = MAX_DIMENSION;

/** Maximum meme text length */
const MAX_MEME_TEXT_LENGTH = 200;

/** MIME types the pipeline accepts */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

function detectMimeFromBytes(bytes) {
  if (!bytes || bytes.length < 12) return null;

  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }

  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function isKnownNonImageContent(bytes) {
  if (!bytes || bytes.length < 4) return false;

  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

export function sanitizeFilename(filename) {
  if (!filename) return "upload";

  let safe = filename.replace(/[/\\]/g, "");
  safe = safe.replace(/\.\./g, "");
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, "");

  return safe || "upload";
}

function validationError(message, code = ErrorCodes.CLIENT_ERROR) {
  const err = new Error(message);
  err.code = code;
  err.isValidationError = true;
  return err;
}

/**
 * Reads dimensions from a PNG IHDR chunk. Bytes 16-23 of a valid PNG hold
 * the big-endian width and height of the image.
 *
 * @param {Uint8Array} bytes - Raw file bytes
 * @returns {{ width: number, height: number } | null}
 */
function readPngDimensions(bytes) {
  if (bytes.length < 24) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint32(16, false);
  const height = view.getUint32(20, false);
  if (width <= 0 || height <= 0) return null;
  return { width, height };
}

/**
 * Reads dimensions from a JPEG by walking marker segments until it hits one
 * of the SOFn frame markers, which carry the image dimensions. Skips the
 * APPn metadata blocks and ignores restart and standalone markers.
 *
 * @param {Uint8Array} bytes - Raw file bytes
 * @returns {{ width: number, height: number } | null}
 */
function readJpegDimensions(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

  let offset = 2;
  const length = bytes.length;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  while (offset < length) {
    while (offset < length && bytes[offset] !== 0xff) offset += 1;
    while (offset < length && bytes[offset] === 0xff) offset += 1;
    if (offset >= length) return null;

    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00) continue;
    if (marker >= 0xd0 && marker <= 0xd7) continue;

    if (offset + 2 > length) return null;
    const segLength = view.getUint16(offset, false);
    if (segLength < 2) return null;

    const isSofFrame =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);

    if (isSofFrame) {
      if (offset + 7 > length) return null;
      const height = view.getUint16(offset + 3, false);
      const width = view.getUint16(offset + 5, false);
      if (width <= 0 || height <= 0) return null;
      return { width, height };
    }

    offset += segLength;
  }

  return null;
}

/**
 * Reads dimensions from a WebP file. Supports the three sub-formats: lossy
 * (VP8 ), lossless (VP8L), and extended (VP8X). Returns null when the chunk
 * header is malformed or unrecognized.
 *
 * @param {Uint8Array} bytes - Raw file bytes
 * @returns {{ width: number, height: number } | null}
 */
function readWebpDimensions(bytes) {
  if (bytes.length < 30) return null;
  const tag = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (tag === "VP8 ") {
    if (bytes.length < 30) return null;
    const sig0 = bytes[23];
    const sig1 = bytes[24];
    const sig2 = bytes[25];
    if (sig0 !== 0x9d || sig1 !== 0x01 || sig2 !== 0x2a) return null;
    const width = view.getUint16(26, true) & 0x3fff;
    const height = view.getUint16(28, true) & 0x3fff;
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (tag === "VP8L") {
    if (bytes.length < 25) return null;
    if (bytes[20] !== 0x2f) return null;
    const b0 = bytes[21];
    const b1 = bytes[22];
    const b2 = bytes[23];
    const b3 = bytes[24];
    const width = 1 + ((((b1 & 0x3f) << 8) | b0) & 0x3fff);
    const height = 1 + ((((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) & 0x3fff);
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  if (tag === "VP8X") {
    if (bytes.length < 30) return null;
    const width =
      1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
    const height =
      1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
    if (width <= 0 || height <= 0) return null;
    return { width, height };
  }

  return null;
}

/**
 * Best-effort dimension reader that dispatches to the format-specific parser.
 * Returns null when the format is unknown or the header is too short to
 * decode safely; callers decide whether to treat that as a hard failure.
 *
 * @param {Uint8Array} bytes - Raw file bytes
 * @param {string} format - Detected MIME type (e.g. "image/png")
 * @returns {{ width: number, height: number } | null}
 */
export function readImageDimensions(bytes, format) {
  if (format === "image/png") return readPngDimensions(bytes);
  if (format === "image/jpeg") return readJpegDimensions(bytes);
  if (format === "image/webp") return readWebpDimensions(bytes);
  return null;
}

/**
 * Removes HTML tags from user-provided meme text.
 * Prevents HTML/script injection in rendered text.
 *
 * @param {string} text
 * @returns {string}
 */
export function sanitizeMemeText(text) {
  if (typeof text !== "string") return "";

  return text
    .replace(/<[^>]*>/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

/**
 * Validates meme text before it is rendered onto the final meme.
 *
 * @param {string} text
 * @returns {string} Sanitized text
 * @throws {Error}
 */
export function validateMemeText(text) {
  const sanitized = sanitizeMemeText(text);

  if (!sanitized) {
    throw validationError("Meme text cannot be empty");
  }

  if (sanitized.length > MAX_MEME_TEXT_LENGTH) {
    throw validationError(
      `Meme text must be ${MAX_MEME_TEXT_LENGTH} characters or fewer`
    );
  }

  return sanitized;
}

/**
 * Validates the cropped face before compositing.
 * Issue #18 requires a valid crop large enough for compositing without
 * rejecting high-resolution user photos.
 *
 * @param {{ width: number, height: number }} faceCrop
 * @returns {true}
 * @throws {Error}
 */
export function validateFaceCrop(faceCrop) {
  if (!faceCrop) {
    throw validationError("Missing face crop for compositing");
  }

  const { width, height } = faceCrop;

  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw validationError("Invalid face crop dimensions");
  }

  if (
    width <= MIN_FACE_CROP_DIMENSION ||
    height <= MIN_FACE_CROP_DIMENSION
  ) {
    throw validationError(
      `Face crop must be larger than ${MIN_FACE_CROP_DIMENSION}x${MIN_FACE_CROP_DIMENSION} pixels`
    );
  }

  if (
    width >= MAX_FACE_CROP_DIMENSION ||
    height >= MAX_FACE_CROP_DIMENSION
  ) {
    throw validationError(
      `Face crop must be smaller than ${MAX_FACE_CROP_DIMENSION}x${MAX_FACE_CROP_DIMENSION} pixels`
    );
  }

  return true;
}

/**
 * Validates that the template image loaded correctly.
 *
 * @param {unknown} templateImage
 * @returns {true}
 * @throws {Error}
 */
export function validateTemplateImage(templateImage) {
  if (!templateImage) {
    throw validationError("Template image failed to load");
  }

  return true;
}

/**
 * Validates an image upload before it enters the face detection pipeline.
 * Order: empty file -> size -> SVG block -> MIME type -> magic bytes ->
 * spoof check -> dimensions -> filename.
 *
 * Dimension validation enforces the 100px-4096px window for JPEG/PNG/WebP
 * (issue #48). HEIC is exempt because we cannot decode its container in the
 * Worker without pulling in a heavyweight parser; HEIC uploads remain limited
 * by the existing 10 MB size cap.
 *
 * @param {Object} upload - Upload descriptor extracted from the incoming Request
 * @param {ArrayBuffer} upload.buffer - Raw file bytes
 * @param {string} upload.mimeType - Declared MIME type from Content-Type header
 * @param {string} upload.filename - Original filename from the upload
 * @param {number} upload.size - File size in bytes
 * @returns {{ valid: true, format: string, filename: string, width?: number, height?: number }}
 * @throws {Error} ValidationError if any check fails
 */
export function validateUpload({ buffer, mimeType, filename, size }) {
  if (!buffer || size === 0) {
    throw validationError("Empty file — no image data to process");
  }

  if (size > MAX_FILE_SIZE) {
    throw validationError(
      "File exceeds 10 MB upload limit",
      ErrorCodes.PAYLOAD_TOO_LARGE
    );
  }

  if (mimeType === "image/svg+xml") {
    throw validationError("SVG uploads are not supported for security reasons");
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw validationError(
      "Unsupported format — accepted types: JPEG, PNG, WebP"
    );
  }

  const bytes = new Uint8Array(buffer);
  const detectedMime = detectMimeFromBytes(bytes);

  if (mimeType !== "image/heic") {
    if (detectedMime === null) {
      if (isKnownNonImageContent(bytes)) {
        throw validationError("File content does not match declared type");
      }

      throw validationError("Unable to decode image — file may be corrupt");
    }

    if (detectedMime !== mimeType) {
      throw validationError("File content does not match declared type");
    }
  }

  const safeFilename = sanitizeFilename(filename);
  const effectiveMime = detectedMime ?? mimeType;
  let width;
  let height;

  if (effectiveMime !== "image/heic") {
    const dimensions = readImageDimensions(bytes, effectiveMime);
    if (!dimensions) {
      throw validationError(
        "Unable to read image dimensions — file may be corrupt",
        ErrorCodes.INVALID_DIMENSIONS
      );
    }

    if (
      dimensions.width < MIN_DIMENSION ||
      dimensions.height < MIN_DIMENSION
    ) {
      throw validationError(
        `Image is too small — minimum ${MIN_DIMENSION}px on each side`,
        ErrorCodes.INVALID_DIMENSIONS
      );
    }

    if (
      dimensions.width > MAX_DIMENSION ||
      dimensions.height > MAX_DIMENSION
    ) {
      throw validationError(
        `Image is too large — maximum ${MAX_DIMENSION}px on each side`,
        ErrorCodes.INVALID_DIMENSIONS
      );
    }

    width = dimensions.width;
    height = dimensions.height;
  }

  const format = effectiveMime.split("/")[1];

  return {
    valid: true,
    format,
    filename: safeFilename,
    width,
    height,
  };
}