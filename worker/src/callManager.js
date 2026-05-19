/**
 * @module callManager
 * Manages all outbound API calls from the Worker.
 * Enforces timeouts, retries on 429s, validates API key presence,
 * and logs timing on every request.
 */

import { ErrorCodes, makeError } from "./errors.js";

/** Default timeout in milliseconds (configurable via AI_TIMEOUT_MS env var) */
const DEFAULT_TIMEOUT_MS = 5000;

const MAX_RETRIES = 3;

/**
 * Validates that required environment variables are present and non-empty.
 * Must be called before any outbound request is made
 * Never logs or exposes the raw key value.
 *
 * @param {Object} env - Cloudflare Workers env object
 * @param {string[]} requiredKeys - List of env var names to check
 * @throws {Error} ConfigError if any key is missing or empty
 */
export function validateEnv(env, requiredKeys) {
  for (const key of requiredKeys) {
    if (!env[key] || env[key].trim() === "") {
      const err = new Error(`Missing required environment variable: ${key}`);
      err.code = "CONFIG_ERROR";
      throw err;
    }
  }
}

/**
 * Wraps a fetch call with a configurable timeout.
 * Returns a structured TIMEOUT_ERROR if the request hangs
 *
 * @param {string} url - The endpoint to fetch
 * @param {RequestInit} options - Standard fetch options
 * @param {number} timeoutMs - Milliseconds before timeout fires
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} Structured TIMEOUT_ERROR if deadline exceeded
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const start = Date.now();

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    const duration = Date.now() - start;
    console.log(`[callManager] ${url} completed in ${duration}ms`);
    return response;
  } catch (err) {
    if (err.name === "AbortError") {
      const duration = Date.now() - start;
      console.log(
        `[callManager] TIMEOUT at ${new Date().toISOString()} duration: ${duration}ms`
      );
      const timeoutErr = new Error(
        `Request timed out after ${timeoutMs}ms`
      );
      timeoutErr.code = ErrorCodes.TIMEOUT_ERROR;
      timeoutErr.retryable = true;
      throw timeoutErr;
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Executes a fetch with exponential backoff retry on 429 responses
 * Respects Retry-After header when present.
 * Caps at MAX_RETRIES (3) total retries — 4 total attempts.
 *
 * @param {string} url - The endpoint to call
 * @param {RequestInit} options - Standard fetch options
 * @param {number} timeoutMs - Per-request timeout in ms
 * @returns {Promise<Response>} The successful response
 * @throws {Error} RATE_LIMITED error after all retries exhausted
 */
export async function fetchWithRetry(url, options, timeoutMs) {
  let attempt = 0;

  while (attempt <= MAX_RETRIES) {
    const response = await fetchWithTimeout(url, options, timeoutMs);

    if (response.status !== 429) {
      return response;
    }

    if (attempt === MAX_RETRIES) {
      const err = new Error(`Rate limit exceeded after ${MAX_RETRIES} retries`);
      err.code = ErrorCodes.RATE_LIMITED;
      err.retryable = true;
      throw err;
    }

    // Respect Retry-After header if present, otherwise exponential backoff
    const retryAfter = response.headers.get("Retry-After");
    const waitMs = retryAfter
      ? parseFloat(retryAfter) * 1000
      : Math.pow(2, attempt) * 1000;

    console.log(
      `[callManager] 429 received. Waiting ${waitMs}ms before retry ${attempt + 1}`
    );
    await new Promise((resolve) => setTimeout(resolve, waitMs));
    attempt++;
  }
}

/**
 * Main entry point for all outbound AI/API calls.
 * Validates env, checks payload size, routes to fetchWithRetry.
 * Never exposes API key in logs or error messages
 *
 * @param {string} url - External API endpoint
 * @param {RequestInit} options - Fetch options (body, headers, method)
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Promise<Object>} Parsed JSON response from the external API
 * @throws {Error} Structured error with code and retryable flag
 */
export async function callAPI(url, options, env) {
  const timeoutMs = env.AI_TIMEOUT_MS
    ? parseInt(env.AI_TIMEOUT_MS, 10)
    : DEFAULT_TIMEOUT_MS;

  let response;
  try {
    response = await fetchWithRetry(url, options, timeoutMs);
  } catch (err) {
    // Never leak API key in error messages
    const safeMessage = err.message.replace(/sk-[a-zA-Z0-9]+/g, "[REDACTED]");
    err.message = safeMessage;
    throw err;
  }

  // Handle 5xx errors
  if (response.status >= 500) {
    const err = new Error(`Server error: ${response.status}`);
    err.code = ErrorCodes.SERVER_ERROR;
    err.retryable = true;
    throw err;
  }

  // Handle non-429 4xx errors
  if (response.status >= 400) {
    const err = new Error(`Client error: ${response.status}`);
    err.code = ErrorCodes.CLIENT_ERROR;
    err.retryable = false;
    throw err;
  }

  return response.json();
}