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
const MIN_DIMENSION = 100;

/** Maximum image dimension in pixels */
const MAX_DIMENSION = 4096;

/** Minimum face crop dimension for compositing */
const MIN_FACE_CROP_DIMENSION = 50;

/** Maximum face crop dimension for compositing */
const MAX_FACE_CROP_DIMENSION = 500;

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
 * Issue #18 requires face crop size >50x50px and <500x500px.
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
 *
 * @param {Object} upload
 * @param {ArrayBuffer} upload.buffer
 * @param {string} upload.mimeType
 * @param {string} upload.filename
 * @param {number} upload.size
 * @returns {{ valid: true, format: string, filename: string }}
 * @throws {Error}
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

  // TODO (issue #39): Parse image dimensions from buffer headers and enforce
  // MIN_DIMENSION (100px) and MAX_DIMENSION (4096px) per DS-09 unit tests.
  // JPEG: scan for SOF0/SOF2 markers. PNG: bytes 16-23. WebP: VP8 chunk header.

  const format = (detectedMime ?? mimeType).split("/")[1];

  return {
    valid: true,
    format,
    filename: safeFilename,
  };
}