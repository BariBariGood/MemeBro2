/**
 * Linear interpolation between two values.
 *
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0 = a, 1 = b)
 * @returns {number} Interpolated result
 */
export function lerp(a, b, t) {
  return a + (b - a) * t
}
