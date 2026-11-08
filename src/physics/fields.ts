/**
 * Scalar fields drawn on the manifold sheet. The GLSL in src/scene/shaders.ts mirrors these
 * functions exactly so that particles placed with heightAt() sit on the rendered surface.
 *
 * Exact for a single mass, approximate (superposed) for several:
 *  - Flamm paraboloid z(r) = 2√(r_s (r − r_s)): the exact embedding of the t = const equatorial
 *    slice of Schwarzschild space (Flamm 1916; MTW §23.8). Drawn to true scale (z and r share
 *    units) when the exaggeration is 1.
 *  - Lapse dτ/dt = √(1 − 2M/r) = √(1 + 2Φ) with Φ = −M/r: exact for a static observer outside a
 *    single Schwarzschild mass (r is the areal radius).
 *  - Kretschmann scalar K = R_abcd R^abcd = 48 M² / r⁶: exact for a single mass.
 * For several masses these are summed, which is only a weak-field superposition.
 */
import type { Source } from './types';

export type ViewMode = 'space' | 'time' | 'tidal' | 'lattice';

export const VIEW_MODES: ViewMode[] = ['space', 'time', 'tidal', 'lattice'];

/** Half-size of the region presets are built in (G = c = 1 lengths). The sheet itself has no edge. */
export const DOMAIN = 150;
/** Radius at which each Flamm well is pinned to height 0; the sheet is flat beyond it. */
export const FLAMM_REF = DOMAIN * 1.5;
/** Height units per unit of |Φ| in the time / tidal views (pure display scale). */
export const PHI_HEIGHT = 70;
/** Maximum number of masses passed to the shaders. */
export const MAX_SHADER_MASSES = 32;

/** Exact Flamm paraboloid height above the throat: z(r) = 2√(r_s (r − r_s)), r ≥ r_s. */
export function flammZ(r: number, rs: number): number {
  if (r <= rs) return 0;
  return 2 * Math.sqrt(rs * (r - rs));
}

/**
 * The Flamm surface drawn as a well: z(r) − z(R_ref), clamped to ≤ 0, flat floor inside the
 * throat (r < r_s, which is not part of the t = const exterior slice).
 */
export function flammWell(r: number, rs: number, rRef = FLAMM_REF): number {
  const ref = flammZ(rRef, rs);
  if (r <= rs) return -ref;
  return Math.min(0, flammZ(r, rs) - ref);
}

/** Newtonian-limit potential Φ = −Σ M_i / max(r_i, r_s,i) (clamped at each horizon). */
export function potential(x: number, y: number, sources: readonly Source[]): number {
  let phi = 0;
  for (const s of sources) {
    const r = Math.max(Math.hypot(x - s.x, y - s.y), 2 * s.m);
    phi -= s.m / r;
  }
  return phi;
}

/** Static-observer time-dilation factor dτ/dt = √(1 + 2Φ), clamped to [0, 1]. */
export function lapse(phi: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, 1 + 2 * phi)));
}

/** Σ 48 M² / r⁶ (each r clamped at its horizon). */
export function kretschmann(x: number, y: number, sources: readonly Source[]): number {
  let k = 0;
  for (const s of sources) {
    const r = Math.max(Math.hypot(x - s.x, y - s.y), 2 * s.m);
    const r2 = r * r;
    k += (48 * s.m * s.m) / (r2 * r2 * r2);
  }
  return k;
}

/** Height of the drawn sheet at (x, y) in the given mode (mirrors the vertex shader). */
export function heightAt(mode: ViewMode, x: number, y: number, sources: readonly Source[], exaggeration: number): number {
  if (mode === 'lattice') return 0;
  if (mode === 'space') {
    let h = 0;
    for (const s of sources) h += flammWell(Math.hypot(x - s.x, y - s.y), 2 * s.m);
    return h * exaggeration;
  }
  return potential(x, y, sources) * PHI_HEIGHT * exaggeration;
}

export interface FieldSample {
  /** Distance to the nearest mass (Infinity if none). */
  r: number;
  /** Mass of that nearest mass. */
  m: number;
  phi: number;
  lapse: number;
  kretschmann: number;
  insideHorizon: boolean;
}

export function sampleFields(x: number, y: number, sources: readonly Source[]): FieldSample {
  let r = Infinity;
  let m = 0;
  let inside = false;
  for (const s of sources) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < r) {
      r = d;
      m = s.m;
    }
    if (d < 2 * s.m) inside = true;
  }
  const phi = potential(x, y, sources);
  return { r, m, phi, lapse: inside ? 0 : lapse(phi), kretschmann: kretschmann(x, y, sources), insideHorizon: inside };
}
