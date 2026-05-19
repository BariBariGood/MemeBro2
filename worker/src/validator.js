/**
 * @module validator
 * Validates image uploads before they enter the processing pipeline.
 * Checks MIME type, file size, magic bytes (spoof detection), and filename safety.
 * Called by index.js before any upload reaches face detection or AI services.
 */
import { ErrorCodes } from "./errors.js";
/** Maximum allowed file size: 10 MB */
const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Minimum image dimension in pixels */
const MIN_DIMENSION = 100;
/** Maximum image dimension in pixels */
const MAX_DIMENSION = 4096;

/** MIME types the pipeline accepts */
const ALLOWED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

/**
 * Detects the real image format by inspecting magic bytes.
 * Prevents MIME spoofing (e.g. a PDF renamed to .jpg).
 * @param {Uint8Array} bytes - Raw file bytes
 * @returns {string|null} Detected MIME type, or null if unrecognized/corrupt
 */
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
    bytes[0] === 0x52 && bytes[1] === 0x49 && // RI
    bytes[2] === 0x46 && bytes[3] === 0x46 && // FF
    bytes[8] === 0x57 && bytes[9] === 0x45 && // WE
    bytes[10] === 0x42 && bytes[11] === 0x50  // BP
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Returns true when magic bytes match a known non-image format (e.g. PDF).
 * @param {Uint8Array} bytes - Raw file bytes
 * @returns {boolean}
 */
function isKnownNonImageContent(bytes) {
  if (!bytes || bytes.length < 4) return false;
  // PDF: %PDF
  return (
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46
  );
}

/**
 * Strips path traversal characters from a filename.
 * Prevents attacks like "../../etc/passwd.jpg".
 * @param {string} filename - Raw filename from the upload
 * @returns {string} Sanitized filename safe for logging and storage
 */
export function sanitizeFilename(filename) {
  if (!filename) return "upload";
  let safe = filename.replace(/[/\\]/g, "");
  safe = safe.replace(/\.\./g, "");
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, "");
  return safe || "upload";
}

/**
 * Builds a ValidationError with a code attached.
 * @param {string} message - Human-readable error message
 * @param {string} code - One of ErrorCodes
 * @returns {Error}
 */
function validationError(message, code = ErrorCodes.CLIENT_ERROR) {
  const err = new Error(message);
  err.code = code;
  err.isValidationError = true;
  return err;
}

/**
 * Validates an image upload before it enters the face detection pipeline.
 * Checks in this order: empty file → size → SVG block → MIME type → magic bytes → spoof → filename.
 * Dimension validation (MIN/MAX) is a TODO pending image parsing in issue #39.
 *
 * @param {Object} upload - Upload descriptor extracted from the incoming Request
 * @param {ArrayBuffer} upload.buffer - Raw file bytes
 * @param {string} upload.mimeType - Declared MIME type from Content-Type header
 * @param {string} upload.filename - Original filename from the upload
 * @param {number} upload.size - File size in bytes
 * @returns {{ valid: true, format: string, filename: string }} Validation result on success
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