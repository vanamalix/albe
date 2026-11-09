/**
 * Massless test particles.
 *
 * GR model: for each source i, with d = r - r_i, r = |d| and specific angular momentum
 * L_i = d × (v - v_i), the acceleration is
 *
 *     a = -Σ_i M_i d̂ / r² · (1 + 3 L_i² / r²)
 *
 * For a single static mass this is exactly the Schwarzschild geodesic in Schwarzschild
 * coordinates, with the velocity and time derivative taken with respect to the particle's own
 * proper time τ:  r̈ = −M/r² + L²/r³ − 3ML²/r⁴  and  r²φ̇ = L. Coordinate time then follows from
 * the conserved energy, dt/dτ = E/(1 − 2M/r) (see properTimeRatio), so both the orbit's shape and
 * its timing are exact for one mass. For several (moving) masses it is a superposition: approximate.
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
 * Acceleration of a test particle. Returns the smallest r_i / R_i seen, with R_i the source's surface
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
    if (gr && isCompact(s)) {
      const L = dx * (vy - s.vy) - dy * (vx - s.vx);
      f *= 1 + (3 * L * L) / r2;
    }
    ax -= f * dx;
    ay -= f * dy;
  }
  out.ax = ax;
  out.ay = ay;
  return minRatio;
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
): number {
  const { x, y, vx, vy } = p;
  const ratio = probeAcceleration(x, y, vx, vy, sources, gr, k1);
  const h = dt / 2;
  probeAcceleration(x + vx * h, y + vy * h, vx + k1.ax * h, vy + k1.ay * h, sources, gr, k2);
  const v2x = vx + k1.ax * h;
  const v2y = vy + k1.ay * h;
  probeAcceleration(x + v2x * h, y + v2y * h, vx + k2.ax * h, vy + k2.ay * h, sources, gr, k3);
  const v3x = vx + k2.ax * h;
  const v3y = vy + k2.ay * h;
  probeAcceleration(x + v3x * dt, y + v3y * dt, vx + k3.ax * dt, vy + k3.ay * dt, sources, gr, k4);
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
 * Exact for one static mass. For several, f is the superposed 1 + 2Φ.
 */
export function properTimeRatio(p: { x: number; y: number; vx: number; vy: number }, sources: readonly Body[]): number {
  const i = dominantSource(p.x, p.y, sources);
  if (i < 0) return Math.sqrt(1 + p.vx * p.vx + p.vy * p.vy);
  let f = 1;
  for (const s of sources) f -= (2 * s.m) / (Math.hypot(p.x - s.x, p.y - s.y) + (s.soft ?? 0) + 1e-9);
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
 *  Newtonian: v² = M / r.
 *  This GR force law: v²/r = M/r² (1 + 3 v²)  ⇒  v² = M / (r − 3M), the exact Schwarzschild
 *  relation for L² = M r² / (r − 3M). No circular orbit exists for r ≤ 3M.
 */
export function circularSpeed(m: number, r: number, gr: boolean): number {
  if (!gr) return Math.sqrt(m / r);
  if (r <= 3 * m) return NaN;
  return Math.sqrt(m / (r - 3 * m));
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

/** dτ/dt on a circular Schwarzschild orbit of radius r: √(1 − 3M/r). Zero at and inside 3M. */
export const circularClockRate = (m: number, r: number): number => Math.sqrt(Math.max(0, 1 - (3 * m) / r));

/** Leading-order GR perihelion advance per orbit (radians). */
export const perihelionAdvance = (m: number, a: number, e: number): number => (6 * Math.PI * m) / (a * (1 - e * e));
