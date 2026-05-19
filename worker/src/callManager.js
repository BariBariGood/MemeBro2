/**
 * @module callManager
 * Manages all outbound API calls from the Worker.
 * Enforces timeouts, retries on 429s, validates API key presence,
 * and logs timing on every request.
 */

import { ErrorCodes } from "./errors.js";

/** Default timeout in milliseconds (configurable via AI_TIMEOUT_MS env var) */
const DEFAULT_TIMEOUT_MS = 5000;

const MAX_RETRIES = 3;

const SECRET_NAME_PATTERN = /(KEY|TOKEN|SECRET|PASSWORD)/i;

/**
 * Internal route table for API modes supported by the gateway.
 * The value is the environment variable that stores the upstream URL.
 */
const MODE_ROUTES = {
  face_swap: {
    urlKeys: ["FACE_SWAP_API_URL"],
  },
  extra_roast: {
    urlKeys: ["EXTRA_ROAST_API_URL", "IMAGE_GEN_API_URL"],
  },
};

/**
 * Redacts known secret shapes and configured secret values from text.
 * This keeps thrown errors and Worker logs from exposing API credentials.
 *
 * @param {unknown} value - Value to safely convert to a string
 * @param {Object} [env={}] - Cloudflare Workers env object
 * @returns {string} Redacted string safe for logs and client-facing errors
 */
export function redactSecrets(value, env = {}) {
  let safe = String(value).replace(/sk-[a-zA-Z0-9_-]+/g, "[REDACTED]");

  for (const [key, secret] of Object.entries(env ?? {})) {
    if (
      SECRET_NAME_PATTERN.test(key) &&
      typeof secret === "string" &&
      secret.length >= 4
    ) {
      safe = safe.split(secret).join("[REDACTED]");
    }
  }

  return safe;
}

/**
 * Returns a URL without query parameters so logs cannot expose key-bearing
 * query strings.
 *
 * @param {string} url - Upstream URL
 * @returns {string} URL origin and pathname, or a generic placeholder
 */
function safeUrlForLog(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "[invalid-url]";
  }
}

/**
 * Builds an INVALID_MODE error for unsupported gateway modes.
 *
 * @param {string} mode - Incoming mode value
 * @returns {Error} Structured invalid mode error
 */
function invalidModeError(mode) {
  const err = new Error(`Invalid mode: ${mode}`);
  err.code = ErrorCodes.INVALID_MODE;
  err.retryable = false;
  return err;
}

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
    if (!env?.[key] || String(env[key]).trim() === "") {
      const err = new Error(`Missing required environment variable: ${key}`);
      err.name = "ConfigError";
      err.code = ErrorCodes.MISSING_API_KEY;
      err.retryable = false;
      throw err;
    }
  }
}

/**
 * Resolves a supported gateway mode to its upstream endpoint URL.
 *
 * @param {string} mode - API mode requested by the client
 * @param {Object} env - Cloudflare Workers env object
 * @returns {{ url: string, requiredEnv: string[] }} Route metadata
 * @throws {Error} INVALID_MODE when mode is unsupported
 */
export function routeRequest(mode, env) {
  const route = MODE_ROUTES[mode];

  if (!route) {
    throw invalidModeError(mode);
  }

  const urlKey = route.urlKeys.find((key) => String(env?.[key] ?? "").trim());

  return {
    url: urlKey ? env[urlKey] : "",
    requiredEnv: ["OPENAI_API_KEY", urlKey ?? route.urlKeys[0]],
  };
}

/**
 * Adds the gateway-managed API key to outbound fetch options.
 *
 * @param {RequestInit} options - Caller-provided fetch options
 * @param {Object} env - Cloudflare Workers env object
 * @returns {RequestInit} Fetch options with gateway authentication headers
 */
function withGatewayAuth(options = {}, env) {
  const headers = new Headers(options.headers ?? {});

  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${env.OPENAI_API_KEY}`);
  }

  return {
    ...options,
    headers,
  };
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
    console.log(`[callManager] ${safeUrlForLog(url)} completed in ${duration}ms`);
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
 * Main entry point for all outbound AI/API calls. The caller supplies a mode,
 * never a raw external URL, so the Worker controls all upstream routing.
 * Validates env, attaches gateway auth, and routes to fetchWithRetry.
 * Never exposes API keys in logs or error messages.
 *
 * @param {string} mode - Gateway mode, such as face_swap or extra_roast
 * @param {RequestInit} options - Fetch options (body, headers, method)
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Promise<Object>} Parsed JSON response from the external API
 * @throws {Error} Structured error with code and retryable flag
 */
export async function callAPI(mode, options, env) {
  const route = routeRequest(mode, env);
  validateEnv(env, route.requiredEnv);

  const timeoutMs = env.AI_TIMEOUT_MS
    ? parseInt(env.AI_TIMEOUT_MS, 10)
    : DEFAULT_TIMEOUT_MS;
  const outboundOptions = withGatewayAuth(options, env);

  let response;
  try {
    response = await fetchWithRetry(route.url, outboundOptions, timeoutMs);
  } catch (err) {
    // Never leak API key in error messages
    err.message = redactSecrets(err.message, env);
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
