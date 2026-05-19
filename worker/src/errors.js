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
    INVALID_MODE: "INVALID_MODE",
    SERVER_ERROR: "SERVER_ERROR",
    CLIENT_ERROR: "CLIENT_ERROR",
  };
  
  /**
   * Builds a structured error response object.
   * @param {string} code - One of ErrorCodes
   * @param {string} message - Human-readable message
   * @param {boolean} retryable - Whether the client should retry
   * @returns {{ code: string, message: string, retryable: boolean }}
   */
  export function makeError(code, message, retryable = false) {
    return { code, message, retryable };
  }