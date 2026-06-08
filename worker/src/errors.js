/**
 * Shared error codes for the MemeBro API gateway.
 * All error responses from the Worker use these constants.
 * @module errors
 */

export const ErrorCodes = {
  TIMEOUT_ERROR: "TIMEOUT_ERROR",
  RATE_LIMITED: "RATE_LIMITED",
  PAYLOAD_TOO_LARGE: "PAYLOAD_TOO_LARGE",
  MISSING_API_KEY: "MISSING_API_KEY",
  NO_API_KEY: "NO_API_KEY",
  INVALID_MODE: "INVALID_MODE",
  SERVER_ERROR: "SERVER_ERROR",
  CLIENT_ERROR: "CLIENT_ERROR",
  EMPTY_PROMPT: "EMPTY_PROMPT",
  PROMPT_TOO_LONG: "PROMPT_TOO_LONG",
  UPSTREAM_BLOCKED: "UPSTREAM_BLOCKED",
  OPENAI_ERROR: "OPENAI_ERROR",
  // Resilience-related codes (issues #32, #33, #34, #48).
  SERVICE_UNAVAILABLE: "SERVICE_UNAVAILABLE",
  FEATURE_DISABLED: "FEATURE_DISABLED",
  QUEUE_FULL: "QUEUE_FULL",
  INVALID_DIMENSIONS: "INVALID_DIMENSIONS",
  EXPORT_TOO_LARGE: "EXPORT_TOO_LARGE", // Merged from main
};

/**
 * Use when a module needs to return a serialized API error payload instead of
 * interrupting control flow. Throw an Error with code/retryable fields when
 * the caller should stop the current request and let the Worker catch boundary
 * choose the HTTP status; use makeError for values that are already becoming
 * JSON response bodies.
 *
 * @param {string} code - One of ErrorCodes
 * @param {string} message - Human-readable message
 * @param {boolean} retryable - Whether the client should retry
 * @returns {{ code: string, message: string, retryable: boolean }}
 */
export function makeError(code, message, retryable = false) {
  return { code, message, retryable };
}
