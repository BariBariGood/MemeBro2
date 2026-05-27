/**
 * @module healthCheck
 * Lightweight upstream-service health probe used by the Worker.
 *
 * The Worker's fetch handler is called per-request, so there is no real
 * "init" lifecycle in which we can run a one-time check at startup. Instead,
 * the first request that touches an upstream mode triggers a probe, and the
 * result is cached for HEALTH_TTL_MS so that subsequent requests reuse it.
 * This satisfies issue #32's requirement of pinging the external face-swap
 * API on startup and caching the health status for 5 minutes, while staying
 * compatible with the Workers execution model where a fresh isolate may be
 * created per request.
 *
 * The probe is intentionally defensive: it never throws, never blocks the
 * request path beyond the configured timeout, and always returns a
 * boolean-shaped result so callers can drive fallback decisions without
 * additional try/catch wrappers.
 */

/** Default time-to-live for a cached health-check result (5 minutes). */
const HEALTH_TTL_MS = 5 * 60 * 1000;

/** Default per-probe timeout in milliseconds. */
const HEALTH_PROBE_TIMEOUT_MS = 2000;

/**
 * In-memory cache keyed by service name. Survives for the lifetime of the
 * Worker isolate, which is typically reused across requests in the same
 * region. Cleared automatically once the TTL elapses.
 *
 * @type {Map<string, { healthy: boolean, checkedAt: number, statusCode?: number, reason?: string }>}
 */
const healthCache = new Map();

/**
 * In-flight probe promises so multiple concurrent requests share a single
 * upstream ping when the cache is cold. The promise is removed once the
 * probe resolves so a future expired entry can refresh again.
 *
 * @type {Map<string, Promise<{ healthy: boolean, checkedAt: number, statusCode?: number, reason?: string }>>}
 */
const inFlightProbes = new Map();

/**
 * Mapping of logical service names to the env var that stores their URL.
 * Each entry can optionally specify a `path` appended to the base URL for
 * probing, so we never spam the actual mutation endpoint with empty bodies.
 */
const SERVICE_HEALTH_TARGETS = {
  face_swap: { urlKey: "FACE_SWAP_API_URL", path: "" },
};

/**
 * Resets all cached health state. Test-only helper.
 */
export function resetHealthCache() {
  healthCache.clear();
  inFlightProbes.clear();
}

/**
 * Returns the URL to ping for a given service, or null when the upstream is
 * not configured. The probe URL stays close to the configured base URL so
 * misconfigured deployments still fail closed instead of silently passing.
 *
 * @param {string} service - Logical service name (e.g. "face_swap")
 * @param {Object} env - Cloudflare Workers env object
 * @returns {string|null}
 */
function resolveProbeUrl(service, env) {
  const target = SERVICE_HEALTH_TARGETS[service];
  if (!target) return null;

  const base = String(env?.[target.urlKey] ?? "").trim();
  if (!base) return null;

  try {
    const url = new URL(base);
    if (target.path) {
      url.pathname = target.path;
    }
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Performs a single HEAD request against the upstream service. Falls back to
 * GET for servers that reject HEAD, and treats network errors, timeouts, and
 * 5xx responses as "unhealthy". 4xx responses are treated as "healthy" since
 * the upstream is reachable - it simply rejected our probe payload, which
 * still proves the service is alive.
 *
 * @param {string} url - Fully qualified probe URL
 * @param {number} timeoutMs - Per-probe timeout in ms
 * @returns {Promise<{ healthy: boolean, statusCode?: number, reason?: string }>}
 */
async function pingService(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let response;
    try {
      response = await fetch(url, {
        method: "HEAD",
        signal: controller.signal,
      });
    } catch (headErr) {
      if (headErr?.name === "AbortError") throw headErr;
      response = await fetch(url, {
        method: "GET",
        signal: controller.signal,
      });
    }

    if (response.status >= 500) {
      return {
        healthy: false,
        statusCode: response.status,
        reason: `upstream returned ${response.status}`,
      };
    }

    return { healthy: true, statusCode: response.status };
  } catch (err) {
    if (err?.name === "AbortError") {
      return { healthy: false, reason: `probe timed out after ${timeoutMs}ms` };
    }
    return { healthy: false, reason: err?.message || "probe failed" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Returns the cached health status for a service. Performs a fresh probe and
 * stores the result when the cache is cold or stale. Never throws - callers
 * can use the boolean `healthy` flag to drive fallback behavior.
 *
 * @param {string} service - Logical service name (e.g. "face_swap")
 * @param {Object} env - Cloudflare Workers env object
 * @param {Object} [options]
 * @param {number} [options.ttlMs] - Override the default 5-minute TTL
 * @param {number} [options.timeoutMs] - Override the default 2-second timeout
 * @param {boolean} [options.force] - Bypass the cache and probe immediately
 * @returns {Promise<{ healthy: boolean, checkedAt: number, statusCode?: number, reason?: string, cached: boolean }>}
 */
export async function getServiceHealth(service, env, options = {}) {
  const ttlMs = Number.isFinite(options.ttlMs) ? options.ttlMs : HEALTH_TTL_MS;
  const timeoutMs = Number.isFinite(options.timeoutMs)
    ? options.timeoutMs
    : HEALTH_PROBE_TIMEOUT_MS;
  const now = Date.now();

  if (!options.force) {
    const cached = healthCache.get(service);
    if (cached && now - cached.checkedAt < ttlMs) {
      return { ...cached, cached: true };
    }
  }

  const probeUrl = resolveProbeUrl(service, env);
  if (!probeUrl) {
    // Unconfigured services are treated as unhealthy so callers fall back
    // gracefully without ever attempting an outbound call.
    const result = {
      healthy: false,
      checkedAt: now,
      reason: `${service} upstream URL is not configured`,
    };
    healthCache.set(service, result);
    return { ...result, cached: false };
  }

  const existing = inFlightProbes.get(service);
  if (existing) {
    const shared = await existing;
    return { ...shared, cached: true };
  }

  const promise = pingService(probeUrl, timeoutMs).then((probe) => {
    const result = { ...probe, checkedAt: Date.now() };
    healthCache.set(service, result);
    return result;
  });
  inFlightProbes.set(service, promise);

  try {
    const result = await promise;
    return { ...result, cached: false };
  } finally {
    inFlightProbes.delete(service);
  }
}

/**
 * Convenience wrapper that returns a plain boolean. Useful for guard clauses
 * that just need to know whether to attempt the upstream call.
 *
 * @param {string} service - Logical service name
 * @param {Object} env - Cloudflare Workers env object
 * @param {Object} [options]
 * @returns {Promise<boolean>}
 */
export async function isServiceHealthy(service, env, options = {}) {
  const { healthy } = await getServiceHealth(service, env, options);
  return healthy;
}

export const __HEALTH_INTERNALS = {
  HEALTH_TTL_MS,
  HEALTH_PROBE_TIMEOUT_MS,
  SERVICE_HEALTH_TARGETS,
};
