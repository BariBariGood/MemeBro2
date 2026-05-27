/**
 * @module fallback
 * Maps gateway modes to feature names and decides whether a feature should be
 * disabled based on the cached health-check status (issues #32 + #33).
 *
 * When the upstream that powers a feature is unhealthy, we surface a stable
 * FEATURE_DISABLED error code so the frontend can show a user-friendly
 * message and disable the relevant UI affordance instead of crashing or
 * displaying a raw stack trace.
 */

import { ErrorCodes } from "./errors.js";
import { getServiceHealth } from "./healthCheck.js";

/**
 * Maps each gateway mode to the upstream service whose health it depends on.
 * Modes that do not appear here are treated as always-available.
 */
const MODE_TO_SERVICE = {
  face_swap: "face_swap",
};

/**
 * Human-readable labels per feature. Surfaced in the error message so the
 * frontend can render a sensible default even before parsing the error code.
 */
const FEATURE_LABELS = {
  face_swap: "Face swap",
};

/**
 * Builds a FEATURE_DISABLED error tied to a specific gateway feature.
 *
 * @param {string} feature - Mode/feature name being rejected
 * @param {string} [detail] - Optional probe-failure reason for logs
 * @returns {Error}
 */
export function featureDisabledError(feature, detail) {
  const label = FEATURE_LABELS[feature] || feature;
  const err = new Error(
    `${label} is temporarily unavailable. Please try again in a few minutes.`
  );
  err.code = ErrorCodes.FEATURE_DISABLED;
  err.retryable = true;
  err.feature = feature;
  if (detail) err.detail = detail;
  return err;
}

/**
 * Throws a FEATURE_DISABLED error when the upstream powering this mode is
 * unhealthy. No-op for modes without a registered upstream dependency, so
 * health-checked features can be added incrementally.
 *
 * @param {string|undefined} mode - Gateway mode requested by the client
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Promise<void>}
 */
export async function assertFeatureEnabled(mode, env) {
  const service = MODE_TO_SERVICE[mode];
  if (!service) return;

  const health = await getServiceHealth(service, env);
  if (!health.healthy) {
    throw featureDisabledError(mode, health.reason);
  }
}

/**
 * Returns the public-facing availability snapshot for every health-checked
 * mode. Used by the /api/health endpoint and the frontend to decide which
 * features to enable.
 *
 * @param {Object} env - Cloudflare Workers env object
 * @returns {Promise<Record<string, { healthy: boolean, checkedAt: number, reason?: string }>>}
 */
export async function getFeatureAvailability(env) {
  const entries = await Promise.all(
    Object.entries(MODE_TO_SERVICE).map(async ([mode, service]) => {
      const health = await getServiceHealth(service, env);
      return [
        mode,
        {
          healthy: health.healthy,
          checkedAt: health.checkedAt,
          reason: health.reason,
        },
      ];
    })
  );
  return Object.fromEntries(entries);
}

export const __FALLBACK_INTERNALS = {
  MODE_TO_SERVICE,
  FEATURE_LABELS,
};
