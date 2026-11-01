/**
 * Massless test particles.
 *
 * GR model: for each source i, with d = r - r_i, r = |d| and specific angular momentum
 * L_i = d × (v - v_i), the acceleration is
 *
 *     a = -Σ_i M_i d̂ / r² · (1 + 3 L_i² / r²)
 *
 * For a single static mass this force law reproduces the Schwarzschild orbit equation exactly
 * in the (r, φ) plane:  u'' + u = M/L² + 3 M u²  (u = 1/r, ' = d/dφ). So orbit *shapes*
 * (perihelion advance, the ISCO at 6M, the unstable photon-sphere-like orbit at 3M, plunges) are
 * those of Schwarzschild geodesics in Schwarzschild coordinates; only the time parametrisation
 * along the orbit is Newtonian. For several (moving) masses it is a superposition: approximate.
 *
 * The leading-order perihelion advance per orbit is Δφ = 6πM / (a (1 − e²)).
 */
import type { Body } from './types';

export interface ProbeAccel {
  ax: number;
  ay: number;
}

/**
 * Acceleration of a test particle. Returns the smallest r_i / r_s,i seen (values < 1 mean the
 * probe is inside a horizon).
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
    const ratio = r / (2 * s.m);
    if (ratio < minRatio) minRatio = ratio;
    let f = s.m / (r2 * r);
    if (gr) {
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
    const r = Math.hypot(p.x - s.x, p.y - s.y) + 1e-9;
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

/** Leading-order GR perihelion advance per orbit (radians). */
export const perihelionAdvance = (m: number, a: number, e: number): number => (6 * Math.PI * m) / (a * (1 - e * e));
