/**
 * The effective potential of Schwarzschild test particles, and the epicycles it predicts.
 *
 *   (dr/dτ)² = E² − V²(r),   V² = (1 − 2M/r)(1 + L²/r²).
 *
 * Circular orbits sit at the extrema of V²: r = (L²/2M)(1 ± √(1 − 12M²/L²)), the + root stable. They merge
 * at L² = 12M², r = 6M, the ISCO: there the radial restoring force vanishes. A slightly eccentric orbit
 * oscillates in r at ω_r with ω_r²/Ω² = 1 − 6M/r, so its closest point advances by
 * 2π[(1 − 6M/r)^(−½) − 1] per radial period (Bardeen, Press & Teukolsky 1972 for the frequencies).
 */

export const V2 = (M: number, L: number, r: number): number => (1 - (2 * M) / r) * (1 + (L * L) / (r * r));

/** Stable (sign +1) or unstable (−1) circular radius for angular momentum L; NaN below L² = 12M². */
export function circularRadius(M: number, L: number, sign: 1 | -1 = 1): number {
  let disc = 1 - (12 * M * M) / (L * L);
  if (disc < -1e-12) return NaN;
  disc = Math.max(0, disc);
  return ((L * L) / (2 * M)) * (1 + sign * Math.sqrt(disc));
}

/** E² and L² of the circular geodesic at r (r > 3M). */
export function circularConstants(M: number, r: number): { E2: number; L2: number } {
  return { E2: (1 - (2 * M) / r) ** 2 / (1 - (3 * M) / r), L2: (M * r * r) / (r - 3 * M) };
}

/** Epicyclic advance per radial period at r: exact as the eccentricity goes to zero. */
export const epicycleAdvance = (M: number, r: number): number => 2 * Math.PI * (1 / Math.sqrt(1 - (6 * M) / r) - 1);

/** ω_r²/Ω² at r: positive outside 6M, zero at the ISCO, negative inside. */
export const radialToOrbital = (M: number, r: number): number => 1 - (6 * M) / r;
