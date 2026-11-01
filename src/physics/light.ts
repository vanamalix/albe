/**
 * Light rays in the weak-field "optical medium" picture.
 *
 * In the weak-field (linearised, isotropic) metric, light behaves as if travelling through a
 * medium of refractive index  n = 1 + 2 Σ M_i / r_i. The ray equation (Fermat's principle) is
 *
 *     d/ds ( n dx/ds ) = ∇n
 *
 * Writing p = n dx/ds (so |p| = n) gives the first-order system dx/ds = p/n, dp/ds = ∇n.
 * For b ≫ M this yields the GR deflection angle 4M/b (twice the Newtonian corpuscle value).
 * Close to a horizon the weak-field index is only approximate (e.g. the true photon sphere at
 * 3M is not reproduced exactly). Rays that reach r < 2M are counted as captured.
 * The coordinate speed of light is c/n (Shapiro delay), which is how rays are advanced in time.
 */
import type { Ray, Source } from './types';

export function refractiveIndex(x: number, y: number, sources: readonly Source[]): number {
  let n = 1;
  for (const s of sources) {
    const r = Math.hypot(x - s.x, y - s.y) + 1e-9;
    n += (2 * s.m) / r;
  }
  return n;
}

interface Deriv {
  dx: number;
  dy: number;
  dpx: number;
  dpy: number;
}

function deriv(x: number, y: number, px: number, py: number, sources: readonly Source[], out: Deriv): void {
  let n = 1;
  let gx = 0;
  let gy = 0;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    const r2 = dx * dx + dy * dy + 1e-12;
    const r = Math.sqrt(r2);
    n += (2 * s.m) / r;
    const f = (-2 * s.m) / (r2 * r);
    gx += f * dx;
    gy += f * dy;
  }
  out.dx = px / n;
  out.dy = py / n;
  out.dpx = gx;
  out.dpy = gy;
}

const d1: Deriv = { dx: 0, dy: 0, dpx: 0, dpy: 0 };
const d2: Deriv = { dx: 0, dy: 0, dpx: 0, dpy: 0 };
const d3: Deriv = { dx: 0, dy: 0, dpx: 0, dpy: 0 };
const d4: Deriv = { dx: 0, dy: 0, dpx: 0, dpy: 0 };

/** One RK4 step of path length ds, then |p| is re-normalised to n (removes drift). */
export function rayStep(r: { x: number; y: number; px: number; py: number }, ds: number, sources: readonly Source[]): void {
  const { x, y, px, py } = r;
  const h = ds / 2;
  deriv(x, y, px, py, sources, d1);
  deriv(x + d1.dx * h, y + d1.dy * h, px + d1.dpx * h, py + d1.dpy * h, sources, d2);
  deriv(x + d2.dx * h, y + d2.dy * h, px + d2.dpx * h, py + d2.dpy * h, sources, d3);
  deriv(x + d3.dx * ds, y + d3.dy * ds, px + d3.dpx * ds, py + d3.dpy * ds, sources, d4);
  r.x = x + (ds / 6) * (d1.dx + 2 * d2.dx + 2 * d3.dx + d4.dx);
  r.y = y + (ds / 6) * (d1.dy + 2 * d2.dy + 2 * d3.dy + d4.dy);
  let npx = px + (ds / 6) * (d1.dpx + 2 * d2.dpx + 2 * d3.dpx + d4.dpx);
  let npy = py + (ds / 6) * (d1.dpy + 2 * d2.dpy + 2 * d3.dpy + d4.dpy);
  const n = refractiveIndex(r.x, r.y, sources);
  const pl = Math.hypot(npx, npy) || 1;
  npx *= n / pl;
  npy *= n / pl;
  r.px = npx;
  r.py = npy;
}

/** Distance to the nearest source surface-ish scale: min over sources of r_i (and r_i / r_s,i). */
function nearest(x: number, y: number, sources: readonly Source[]): { r: number; ratio: number } {
  let r = Infinity;
  let ratio = Infinity;
  for (const s of sources) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < r) r = d;
    const q = d / (2 * s.m);
    if (q < ratio) ratio = q;
  }
  return { r, ratio };
}

/** Builds a ray at (x, y) heading along (dx, dy). */
export function makeRay(id: number, x: number, y: number, dx: number, dy: number, sources: readonly Source[]): Ray {
  const l = Math.hypot(dx, dy) || 1;
  const n = refractiveIndex(x, y, sources);
  return { id, x, y, px: (n * dx) / l, py: (n * dy) / l, state: 'flying', sinceLast: 0, path: [x, y], age: 0 };
}

/**
 * Advances a ray by coordinate time dt (path length ds = dt / n, so light slows near masses).
 * Records a polyline point every `spacing` units of path, keeping at most `maxPoints` points.
 */
export function advanceRay(
  ray: Ray,
  dt: number,
  sources: readonly Source[],
  bound: number,
  spacing = 1.5,
  maxPoints = 700,
): void {
  if (ray.state !== 'flying') return;
  let t = 0;
  let guard = 0;
  while (t < dt && guard++ < 2000) {
    const near = nearest(ray.x, ray.y, sources);
    const n = refractiveIndex(ray.x, ray.y, sources);
    // Path step: a tenth of the distance to the nearest mass, within [0.02, 4].
    let ds = Math.min(4, Math.max(0.02, 0.1 * near.r));
    const dtStep = ds * n;
    if (t + dtStep > dt) ds = (dt - t) / n;
    rayStep(ray, ds, sources);
    t += ds * n;
    ray.sinceLast += ds;
    const after = nearest(ray.x, ray.y, sources);
    if (after.ratio < 1) {
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
 * x = -X to x = +X (used by tests; X ≫ b gives ≈ 4M/b).
 */
export function deflectionAngle(m: number, b: number, X: number): number {
  const sources = [{ x: 0, y: 0, m }];
  const ray = makeRay(0, -X, b, 1, 0, sources);
  let guard = 0;
  while (ray.x < X && guard++ < 1_000_000) {
    const r = Math.hypot(ray.x, ray.y);
    const ds = Math.max(0.01, 0.02 * r);
    rayStep(ray, ds, sources);
    if (Math.hypot(ray.x, ray.y) < 2 * m) return NaN;
  }
  // Deflection toward the mass is positive.
  return -Math.atan2(ray.py, ray.px);
}
