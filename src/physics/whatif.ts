/**
 * "Not our universe": what the changed laws of ProbeLaw (probes.ts) predict.
 *
 * Force exponent. Under a central force F ∝ 1/rⁿ a near-circular orbit oscillates radially at
 * κ² = (3 − n) Ω², so the angle from closest to farthest point is π/√(3 − n): 180° for n = 2,
 * 90° for n = −1 (the harmonic force, an ellipse centred on the mass), and no stable circle at all
 * for n ≥ 3. Bertrand's theorem (1873): the only central forces for which every bound orbit
 * closes are n = 2 and n = −1. For a finite orbit the angle is the integral apsisAngle() below.
 *
 * GR scale. Multiplying the relativistic term by s = (c/c′)² gives exactly the Schwarzschild orbit
 * equation of a universe with light √s times slower: u″ + u = M/L² + 3sMu². Its circular orbits stop
 * at 3sM and stop being stable at 6sM, and its weak-field advance is 6πsM/p.
 */
import { apsidalAngle } from './measure';
import { POWER_LAW_RADIUS } from './probes';

/** Apsis angle (closest to farthest point) of a near-circular orbit under F ∝ 1/rⁿ, radians. */
export const nearCircularApsis = (n: number): number => (n < 3 ? Math.PI / Math.sqrt(3 - n) : NaN);

/** Bertrand's two exponents: every bound orbit closes. */
export const BERTRAND = [2, -1] as const;

/** Potential per unit mass of F = (M/r²)(R/r)^(n − 2), R = POWER_LAW_RADIUS·M. */
export function powerLawPotential(m: number, n: number, r: number): number {
  const k = m * Math.pow(POWER_LAW_RADIUS * m, n - 2);
  if (Math.abs(n - 1) < 1e-9) return k * Math.log(r);
  return (-k * Math.pow(r, 1 - n)) / (n - 1);
}

/**
 * Exact apsis angle of the orbit with turning points rp < ra under the power law:
 * ∫ L dr / (r² √(2(E − U) − L²/r²)) from rp to ra, with r = c − h cos θ so the square-root ends
 * become smooth, then the midpoint rule.
 */
export function apsisAngle(m: number, n: number, rp: number, ra: number): number {
  if (!(ra > rp && rp > 0)) return NaN;
  const U = (r: number) => powerLawPotential(m, n, r);
  const L2 = (2 * (U(ra) - U(rp))) / (1 / (rp * rp) - 1 / (ra * ra));
  if (!(L2 > 0)) return NaN;
  const E = U(rp) + L2 / (2 * rp * rp);
  const c = (ra + rp) / 2;
  const h = (ra - rp) / 2;
  const N = 2000;
  let sum = 0;
  for (let i = 0; i < N; i++) {
    const th = ((i + 0.5) * Math.PI) / N;
    const r = c - h * Math.cos(th);
    const k = 2 * (E - U(r)) - L2 / (r * r);
    if (k <= 0) continue;
    sum += (Math.sqrt(L2) / (r * r)) * ((h * Math.sin(th)) / Math.sqrt(k));
  }
  return (sum * Math.PI) / N;
}

/**
 * Exact periapsis-to-periapsis angle under the scaled law, for a particle at relative position
 * (dx, dy) with velocity (ux, uy) = dx/dτ about mass m. With M′ = sM and L′² = sL² the scaled orbit
 * equation is Schwarzschild's for mass M′, and its energy integral ½v² − M/r − sML²/r³ = ε gives
 * E′² = 1 + 2sε, so the elliptic integral of measure.ts applies unchanged.
 */
export function scaledApsidalAngle(m: number, s: number, dx: number, dy: number, ux: number, uy: number): number {
  if (s <= 0) return 2 * Math.PI;
  const r = Math.hypot(dx, dy);
  const L = dx * uy - dy * ux;
  const eps = 0.5 * (ux * ux + uy * uy) - m / r - (s * m * L * L) / (r * r * r);
  if (eps >= 0) return NaN;
  return apsidalAngle(s * m, 1 + 2 * s * eps, s * L * L);
}
