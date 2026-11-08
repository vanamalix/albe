/**
 * The "infinite" sheet: one square mesh, fine in the middle and stretched geometrically out to
 * the horizon, that re-centres on the camera focus. Vertices are snapped to the mesh's own cell
 * so the fine core never shimmers as it moves. Pure maths, so it can be tested without WebGL.
 */

/** Half-width of the fine, uniform core of the mesh (world units at grid scale 1). */
export const CORE_HALF = 200;
/** Segments across the fine core. */
export const CORE_SEGS = 266;
/** Stretched segments on each side of the core. */
export const OUTER_SEGS = 27;
/** Half-width of the whole mesh at grid scale 1: far past the fog, so no edge is ever visible. */
export const PLANE_HALF = 20_000;
/** Cell size of the core at grid scale 1. */
export const CORE_CELL = (2 * CORE_HALF) / CORE_SEGS;
/** The camera may pull back this far; objects are simulated at least this far beyond it. */
export const MAX_CAMERA_DISTANCE = 3000;

/** Sorted vertex coordinates along one axis, symmetric about 0. */
export function planeAxis(coreHalf = CORE_HALF, coreSegs = CORE_SEGS, outerSegs = OUTER_SEGS, half = PLANE_HALF): number[] {
  const cell = (2 * coreHalf) / coreSegs;
  // Find the growth ratio whose geometric series covers the stretched part exactly.
  const target = half - coreHalf;
  let lo = 1.0001;
  let hi = 4;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    const reach = (cell * mid * (Math.pow(mid, outerSegs) - 1)) / (mid - 1);
    if (reach < target) lo = mid;
    else hi = mid;
  }
  const ratio = (lo + hi) / 2;
  const right: number[] = [];
  let x = coreHalf;
  let step = cell;
  for (let i = 0; i < outerSegs; i++) {
    step *= ratio;
    x += step;
    right.push(i === outerSegs - 1 ? half : x);
  }
  const core = Array.from({ length: coreSegs + 1 }, (_, i) => -coreHalf + i * cell);
  return [...right.map((v) => -v).reverse(), ...core, ...right];
}

/** Grid scale for a camera distance: doubles as the camera pulls back, so detail per pixel holds. */
export function gridScale(cameraDistance: number): number {
  return Math.pow(2, Math.max(0, Math.ceil(Math.log2(Math.max(1, cameraDistance / 500)))));
}

export const snapTo = (v: number, step: number): number => Math.round(v / step) * step;

export interface FrameGoal {
  cx: number;
  cy: number;
  radius: number;
}

/**
 * The circle to frame: centred on the masses (mass-weighted) or, with none, on the particles.
 * The radius ignores the farthest 5% so one escaped particle cannot shrink everything else.
 */
export function frameObjects(bodies: readonly { x: number; y: number; m: number }[], others: readonly { x: number; y: number }[]): FrameGoal {
  let cx = 0;
  let cy = 0;
  if (bodies.length) {
    let total = 0;
    for (const b of bodies) {
      cx += b.x * b.m;
      cy += b.y * b.m;
      total += b.m;
    }
    cx /= total;
    cy /= total;
  } else if (others.length) {
    for (const p of others) {
      cx += p.x;
      cy += p.y;
    }
    cx /= others.length;
    cy /= others.length;
  }
  const dists = [...bodies, ...others].map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
  const reach = dists.length ? dists[Math.min(dists.length - 1, Math.floor(dists.length * 0.95))] : 0;
  return { cx, cy, radius: Math.max(60, reach) };
}

/** Camera distance that shows a circle of `radius` at the given vertical fov (degrees) and aspect. */
export function fitDistance(radius: number, fovDeg: number, aspect: number): number {
  const t = Math.tan((fovDeg * Math.PI) / 360);
  return Math.min(MAX_CAMERA_DISTANCE, Math.max(60, (radius * 1.5) / (t * Math.min(1, aspect))));
}
