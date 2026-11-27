/**
 * Massless test particles.
 *
 * GR model: for each source i, with d = r - r_i, r = |d| and specific angular momentum
 * L_i = d × (v - v_i), the acceleration is
 *
 *     a = -Σ_i M_i d̂ / r² · (1 + 3 L_i² / r²)
 *
 * For a single static mass this is exactly the Schwarzschild geodesic in Schwarzschild
 * coordinates (r is areal, unlike the harmonic r of the bodies in nbody.ts: r_areal = r_harmonic + M),
 * with the velocity and time derivative taken with respect to the particle's own
 * proper time τ:  r̈ = −M/r² + L²/r³ − 3ML²/r⁴  and  r²φ̇ = L. Coordinate time then follows from
 * the conserved energy, dt/dτ = E/(1 − 2M/r) (see properTimeRatio), so both the orbit's shape and
 * its timing are exact for one mass. For several (moving) masses it is a superposition: approximate.
 * L_i mixes the probe's dx/dτ with the source's dx/dt: right for slow sources, another approximation
 * for fast ones.
 *
 * The leading-order perihelion advance per orbit is Δφ = 6πM / (a (1 − e²)).
 */
import { haloEnclosed } from './bodies';
import { isCompact, surfaceRadius, type Body } from './types';

export interface ProbeAccel {
  ax: number;
  ay: number;
}

/**
 * "Not our universe": the laws test particles may be given instead of ours. Neither touches the
 * masses, light, clocks or the drawn sheet.
 *  - n: Newtonian particles feel F = (M/r²)(R/r)^(n − 2), R = POWER_LAW_RADIUS·M, so the pull is
 *    Newton's at R and falls as 1/rⁿ. Ours is n = 2.
 *  - s: the relativistic term 3L²/r² is multiplied by s = (c/c′)², the orbit equation of a universe
 *    whose light is √s times slower. Ours is s = 1; s = 0 is Newton.
 */
export interface ProbeLaw {
  n: number;
  s: number;
}

export const OUR_LAW: ProbeLaw = { n: 2, s: 1 };
/** Where a changed force law still matches Newton's pull, in units of the source's M. */
export const POWER_LAW_RADIUS = 20;

/**
 * Acceleration of a test particle; `gr` is the particle's own model (gold when true). Returns the smallest r_i / R_i seen, with R_i the source's surface
 * or horizon (values < 1 mean the probe has hit it). Only compact objects get the relativistic term:
 * stars are drawn at a compressed scale, so their M/r means nothing physically.
 */
export function probeAcceleration(
  x: number,
  y: number,
  vx: number,
  vy: number,
  sources: readonly Body[],
  gr: boolean,
  out: ProbeAccel,
  law: ProbeLaw = OUR_LAW,
): number {
  let ax = 0;
  let ay = 0;
  let minRatio = Infinity;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const dx = x - s.x;
    const dy = y - s.y;
    const r2 = dx * dx + dy * dy + 1e-12;
    const r = Math.sqrt(r2);
    if (s.kind === 'galaxy') {
      const g = haloEnclosed(s.m, s.soft ?? 1, s.radius ?? 1, r) / (r2 * r);
      ax -= g * dx;
      ay -= g * dy;
      continue;
    }
    const ratio = r / surfaceRadius(s);
    if (ratio < minRatio) minRatio = ratio;
    let f = s.m / (r2 * r);
    if (gr) {
      // A GR test particle keeps the inverse square everywhere (the changed n is for Newtonian
      // particles only); round a compact mass it adds the relativistic term, scaled by s.
      if (isCompact(s)) {
        const L = dx * (vy - s.vy) - dy * (vx - s.vx);
        f *= 1 + (3 * law.s * L * L) / r2;
      }
    } else if (law.n !== 2) {
      f *= Math.pow((POWER_LAW_RADIUS * s.m) / r, law.n - 2);
    }
    ax -= f * dx;
    ay -= f * dy;
  }
  out.ax = ax;
  out.ay = ay;
  return minRatio;
}

/**
 * A marble on the drawn Space sheet: a geodesic of the spatial metric dl² = dr²/f + r²dφ² of the
 * dominant compact mass (f = 1 − 2M/r), with no time curvature and no gravity of any other kind. In
 * the plane, with λ arc length and v = dx/dλ, its acceleration is radial:
 *
 *     a_r = M ṙ² / (r² f) − 2M φ̇²        (so r̈ = M ṙ²/(r² f) + f r φ̇²)
 *
 * On a surface of revolution r sin ψ is conserved (Clairaut), so a marble started tangent at r₀ can
 * only roll outward, and one at rest stays at rest.
 */
export function sheetAcceleration(x: number, y: number, vx: number, vy: number, sources: readonly Body[], out: ProbeAccel): number {
  out.ax = 0;
  out.ay = 0;
  const i = dominantSource(x, y, sources);
  if (i < 0) return Infinity;
  const s = sources[i];
  const dx = x - s.x;
  const dy = y - s.y;
  const r = Math.hypot(dx, dy) + 1e-12;
  const ratio = r / surfaceRadius(s);
  if (!isCompact(s)) return ratio;
  const f = Math.max(1e-6, 1 - (2 * s.m) / r);
  const rdot = (dx * vx + dy * vy) / r;
  const phidot = (dx * vy - dy * vx) / (r * r);
  const ar = (s.m * rdot * rdot) / (r * r * f) - 2 * s.m * phidot * phidot;
  out.ax = (ar * dx) / r;
  out.ay = (ar * dy) / r;
  return ratio;
}

/** One RK4 step of a sheet marble (sources frozen). Returns the smallest r/R seen. */
export function rk4SheetStep(p: { x: number; y: number; vx: number; vy: number }, dt: number, sources: readonly Body[]): number {
  const { x, y, vx, vy } = p;
  const ratio = sheetAcceleration(x, y, vx, vy, sources, k1);
  const h = dt / 2;
  sheetAcceleration(x + vx * h, y + vy * h, vx + k1.ax * h, vy + k1.ay * h, sources, k2);
  const v2x = vx + k1.ax * h;
  const v2y = vy + k1.ay * h;
  sheetAcceleration(x + v2x * h, y + v2y * h, vx + k2.ax * h, vy + k2.ay * h, sources, k3);
  const v3x = vx + k2.ax * h;
  const v3y = vy + k2.ay * h;
  sheetAcceleration(x + v3x * dt, y + v3y * dt, vx + k3.ax * dt, vy + k3.ay * dt, sources, k4);
  const v4x = vx + k3.ax * dt;
  const v4y = vy + k3.ay * dt;
  p.x = x + (dt / 6) * (vx + 2 * v2x + 2 * v3x + v4x);
  p.y = y + (dt / 6) * (vy + 2 * v2y + 2 * v3y + v4y);
  p.vx = vx + (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax);
  p.vy = vy + (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay);
  return ratio;
}

const k1 = { ax: 0, ay: 0 };
const k2 = { ax: 0, ay: 0 };
const k3 = { ax: 0, ay: 0 };
const k4 = { ax: 0, ay: 0 };

/** One classical RK4 step for a probe state (sources frozen during the step). */
export function rk4ProbeStep(
  p: { x: number; y: number; vx: number; vy: number },
  dt: number,
  sources: readonly Body[],
  gr: boolean,
  law: ProbeLaw = OUR_LAW,
): number {
  const { x, y, vx, vy } = p;
  const ratio = probeAcceleration(x, y, vx, vy, sources, gr, k1, law);
  const h = dt / 2;
  probeAcceleration(x + vx * h, y + vy * h, vx + k1.ax * h, vy + k1.ay * h, sources, gr, k2, law);
  const v2x = vx + k1.ax * h;
  const v2y = vy + k1.ay * h;
  probeAcceleration(x + v2x * h, y + v2y * h, vx + k2.ax * h, vy + k2.ay * h, sources, gr, k3, law);
  const v3x = vx + k2.ax * h;
  const v3y = vy + k2.ay * h;
  probeAcceleration(x + v3x * dt, y + v3y * dt, vx + k3.ax * dt, vy + k3.ay * dt, sources, gr, k4, law);
  const v4x = vx + k3.ax * dt;
  const v4y = vy + k3.ay * dt;
  p.x = x + (dt / 6) * (vx + 2 * v2x + 2 * v3x + v4x);
  p.y = y + (dt / 6) * (vy + 2 * v2y + 2 * v3y + v4y);
  p.vx = vx + (dt / 6) * (k1.ax + 2 * k2.ax + 2 * k3.ax + k4.ax);
  p.vy = vy + (dt / 6) * (k1.ay + 2 * k2.ay + 2 * k3.ay + k4.ay);
  return ratio;
}

/** The largest dt/dτ used: it only limits how long a particle can hang just outside a horizon. */
export const MAX_TIME_RATIO = 200;

/**
 * dt/dτ, the distant observer's time per unit of the particle's proper time. E comes from the
 * source with the strongest pull: E² = ṙ² + f (1 + L²/r²), with f = 1 − 2M/r; dt/dτ = E/f.
 * Exact for one static mass. For several, f is the superposed 1 + 2Φ. Only compact objects count
 * in f, the same rule as the force: a compressed star's M/r means nothing, so near one the clock
 * keeps only its kinematic factor √(1 + v²).
 */
export function properTimeRatio(p: { x: number; y: number; vx: number; vy: number }, sources: readonly Body[]): number {
  const i = dominantSource(p.x, p.y, sources);
  if (i < 0) return Math.sqrt(1 + p.vx * p.vx + p.vy * p.vy);
  let f = 1;
  for (const s of sources) {
    if (!isCompact(s)) continue;
    f -= (2 * s.m) / (Math.hypot(p.x - s.x, p.y - s.y) + (s.soft ?? 0) + 1e-9);
  }
  f = Math.max(f, 1 / MAX_TIME_RATIO);
  const s = sources[i];
  const dx = p.x - s.x;
  const dy = p.y - s.y;
  const r2 = dx * dx + dy * dy + 1e-12;
  const r = Math.sqrt(r2);
  const vx = p.vx - s.vx;
  const vy = p.vy - s.vy;
  const rdot = (dx * vx + dy * vy) / r;
  const L = dx * vy - dy * vx;
  const E = Math.sqrt(rdot * rdot + f * (1 + (L * L) / r2));
  return Math.min(MAX_TIME_RATIO, E / f);
}

/**
 * Adaptive step for a probe: eta times the shortest local dynamical time sqrt(r³/M) over
 * sources, and never more than eta·4·r/|v| (fast fly-bys).
 */
export function probeDt(
  p: { x: number; y: number; vx: number; vy: number },
  sources: readonly Body[],
  eta: number,
): number {
  let dt = Infinity;
  const v = Math.hypot(p.vx, p.vy);
  for (const s of sources) {
    const r = Math.hypot(p.x - s.x, p.y - s.y) + (s.soft ?? 0) + 1e-9;
    dt = Math.min(dt, eta * Math.sqrt((r * r * r) / s.m));
    if (v > 0) dt = Math.min(dt, (eta * 4 * r) / v);
  }
  return dt;
}

/**
 * Circular-orbit speed about a mass M at radius r.
 *  Newtonian: v² = M / r (and v² = r F(r) under a changed force law).
 *  This GR force law: v²/r = M/r² (1 + 3 v²)  ⇒  v² = M / (r − 3M), the exact Schwarzschild
 *  relation for L² = M r² / (r − 3M). No circular orbit exists for r ≤ 3M (3sM with the term scaled).
 */
export function circularSpeed(m: number, r: number, gr: boolean, law: ProbeLaw = OUR_LAW): number {
  if (!gr) return Math.sqrt((m / r) * (law.n === 2 ? 1 : Math.pow((POWER_LAW_RADIUS * m) / r, law.n - 2)));
  if (r <= 3 * law.s * m) return NaN;
  return Math.sqrt(m / (r - 3 * law.s * m));
}

/** Index of the source with the strongest pull |M/r²| at (x, y), or -1. */
export function dominantSource(x: number, y: number, sources: readonly { x: number; y: number; m: number }[]): number {
  let best = -1;
  let bestPull = 0;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const r2 = (x - s.x) ** 2 + (y - s.y) ** 2 + 1e-9;
    const pull = s.m / r2;
    if (pull > bestPull) {
      bestPull = pull;
      best = i;
    }
  }
  return best;
}

/**
 * A particle's clock as it would read now: the proper time integrated so far, plus the coordinate
 * time not yet integrated (lag, at most one step) at its current rate.
 */
export const clockReading = (p: { tau: number; lag: number; rate: number }): number => p.tau + p.lag * p.rate;

/** dτ/dt on a circular Schwarzschild orbit of radius r: √(1 − 3M/r). Zero at and inside 3M. */
export const circularClockRate = (m: number, r: number): number => Math.sqrt(Math.max(0, 1 - (3 * m) / r));

/** Leading-order GR perihelion advance per orbit (radians). */
export const perihelionAdvance = (m: number, a: number, e: number): number => (6 * Math.PI * m) / (a * (1 - e * e));
