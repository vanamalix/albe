/**
 * Light rays as Schwarzschild null geodesics, written in the same form as the test-particle law.
 *
 * With λ the affine parameter and h = d × dx/dλ, a photon around one mass obeys
 *
 *     d²x/dλ² = −3 M h² d / r⁵         dt/dλ = 1 / (1 − 2M/r)      (E = 1)
 *
 * which is exactly u″ + u = 3Mu² in Schwarzschild coordinates. So the photon sphere at 3M, the
 * critical impact parameter 3√3 M, strong deflection, the capture of rays and the Shapiro delay
 * are all exact for one static mass. Several masses are superposed: each still bends a distant
 * ray by the correct 4M/b, but the combined field is an approximation.
 */
import { surfaceRadius, type Ray, type Source } from './types';

/** Rays and particles count as captured this close to r_s (coordinate time freezes at r_s itself). */
export const CAPTURE_RATIO = 1.02;

/** 1 + 2Φ with Φ = −Σ M/r, kept positive: it is dλ/dt. */
export function lightSpeedFactor(x: number, y: number, sources: readonly Source[]): number {
  let f = 1;
  for (const s of sources) f -= (2 * s.m) / (Math.hypot(x - s.x, y - s.y) + (s.soft ?? 0) + 1e-9);
  return Math.max(f, 0.02);
}

interface Deriv {
  dx: number;
  dy: number;
  dvx: number;
  dvy: number;
}

function deriv(x: number, y: number, vx: number, vy: number, sources: readonly Source[], out: Deriv): void {
  let ax = 0;
  let ay = 0;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    // A galaxy's mass is spread out, so a ray through it is softened instead of scattered by a point.
    const r2 = dx * dx + dy * dy + (s.soft ?? 0) ** 2 + 1e-12;
    const h = dx * vy - dy * vx;
    const f = (-3 * s.m * h * h) / (r2 * r2 * Math.sqrt(r2));
    ax += f * dx;
    ay += f * dy;
  }
  out.dx = vx;
  out.dy = vy;
  out.dvx = ax;
  out.dvy = ay;
}

const d1: Deriv = { dx: 0, dy: 0, dvx: 0, dvy: 0 };
const d2: Deriv = { dx: 0, dy: 0, dvx: 0, dvy: 0 };
const d3: Deriv = { dx: 0, dy: 0, dvx: 0, dvy: 0 };
const d4: Deriv = { dx: 0, dy: 0, dvx: 0, dvy: 0 };

/** One RK4 step of affine length h. */
export function rayStep(r: { x: number; y: number; vx: number; vy: number }, h: number, sources: readonly Source[]): void {
  const { x, y, vx, vy } = r;
  const m = h / 2;
  deriv(x, y, vx, vy, sources, d1);
  deriv(x + d1.dx * m, y + d1.dy * m, vx + d1.dvx * m, vy + d1.dvy * m, sources, d2);
  deriv(x + d2.dx * m, y + d2.dy * m, vx + d2.dvx * m, vy + d2.dvy * m, sources, d3);
  deriv(x + d3.dx * h, y + d3.dy * h, vx + d3.dvx * h, vy + d3.dvy * h, sources, d4);
  r.x = x + (h / 6) * (d1.dx + 2 * d2.dx + 2 * d3.dx + d4.dx);
  r.y = y + (h / 6) * (d1.dy + 2 * d2.dy + 2 * d3.dy + d4.dy);
  r.vx = vx + (h / 6) * (d1.dvx + 2 * d2.dvx + 2 * d3.dvx + d4.dvx);
  r.vy = vy + (h / 6) * (d1.dvy + 2 * d2.dvy + 2 * d3.dvy + d4.dvy);
}

/** Distance to the nearest mass, and the smallest r_i / R_i (R_i the surface or horizon). */
function nearest(x: number, y: number, sources: readonly Source[]): { r: number; ratio: number; index: number } {
  let r = Infinity;
  let ratio = Infinity;
  let index = -1;
  for (let i = 0; i < sources.length; i++) {
    const s = sources[i];
    const d = Math.hypot(x - s.x, y - s.y);
    if (d + (s.soft ?? 0) < r) {
      r = d + (s.soft ?? 0);
      index = i;
    }
    const surface = surfaceRadius(s);
    const q = surface > 0 ? d / surface : Infinity;
    if (q < ratio) ratio = q;
  }
  return { r, ratio, index };
}

/**
 * Builds a ray at (x, y) heading along (dx, dy), with E = 1. The null condition
 * ṙ² + f L²/r² = 1 sets its speed: |v|² = 1 / (1 − (1 − f) sin²α), α measured from the radial.
 */
export function makeRay(id: number, x: number, y: number, dx: number, dy: number, sources: readonly Source[]): Ray {
  const l = Math.hypot(dx, dy) || 1;
  const ux = dx / l;
  const uy = dy / l;
  const f = lightSpeedFactor(x, y, sources);
  let sin2 = 1;
  const { index, r } = nearest(x, y, sources);
  if (index >= 0 && r > 0) {
    const cross = ((x - sources[index].x) * uy - (y - sources[index].y) * ux) / r;
    sin2 = cross * cross;
  }
  const speed = 1 / Math.sqrt(Math.max(0.02, 1 - (1 - f) * sin2));
  return { id, x, y, vx: ux * speed, vy: uy * speed, state: 'flying', sinceLast: 0, path: [x, y], age: 0 };
}

/**
 * Advances a ray by coordinate time dt, so light visibly slows near masses as a distant observer
 * would measure. Records a polyline point every `spacing` units of path, keeping `maxPoints`.
 */
export function advanceRay(ray: Ray, dt: number, sources: readonly Source[], bound: number, spacing = 1.5, maxPoints = 700): void {
  if (ray.state !== 'flying') return;
  let t = 0;
  let guard = 0;
  while (t < dt && guard++ < 2000) {
    const near = nearest(ray.x, ray.y, sources);
    const f = lightSpeedFactor(ray.x, ray.y, sources);
    const speed = Math.hypot(ray.vx, ray.vy) || 1;
    // A twentieth of the distance to the nearest mass, within [0.02, 4] of path.
    const ds = Math.min(4, Math.max(0.02, 0.05 * near.r));
    let h = ds / speed;
    if (t + h / f > dt) h = (dt - t) * f;
    rayStep(ray, h, sources);
    t += h / f;
    ray.sinceLast += h * speed;
    if (nearest(ray.x, ray.y, sources).ratio < CAPTURE_RATIO) {
      ray.state = 'captured';
      pushPoint(ray, maxPoints);
      return;
    }
    if (Math.abs(ray.x) > bound || Math.abs(ray.y) > bound) {
      ray.state = 'escaped';
      pushPoint(ray, maxPoints);
      return;
    }
    if (ray.sinceLast >= spacing) pushPoint(ray, maxPoints);
  }
}

function pushPoint(ray: Ray, maxPoints: number): void {
  ray.path.push(ray.x, ray.y);
  ray.sinceLast = 0;
  if (ray.path.length > maxPoints * 2) ray.path.splice(0, 2);
}

/**
 * Total deflection of a ray passing a single mass M at impact parameter b, integrated from
 * x = −X to the far side. NaN when the ray is captured.
 */
export function deflectionAngle(m: number, b: number, X: number): number {
  const sources = [{ x: 0, y: 0, m }];
  const ray = makeRay(0, -X, b, 1, 0, sources);
  let guard = 0;
  while (Math.hypot(ray.x, ray.y) <= X * 1.0001 && guard++ < 2_000_000) {
    const r = Math.hypot(ray.x, ray.y);
    rayStep(ray, Math.max(0.005, 0.01 * r) / Math.hypot(ray.vx, ray.vy), sources);
    if (Math.hypot(ray.x, ray.y) < 2 * m * CAPTURE_RATIO) return NaN;
  }
  // Deflection toward the mass is positive. Unwrapped so rays bent past 180° still read correctly.
  return -Math.atan2(ray.vy, ray.vx);
}
