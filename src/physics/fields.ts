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
 *
 * A star, planet or galaxy has no horizon, so the exterior formulas stop at its surface. Inside, the
 * sheet follows a uniform sphere: the Schwarzschild interior embedding for space, and the Newtonian
 * interior potential for time. The tidal view holds its surface value.
 */
import { isBlackHole, type Source } from './types';

export type ViewMode = 'space' | 'time' | 'tidal' | 'waves' | 'lattice' | 'lens' | 'warp';

export const VIEW_MODES: ViewMode[] = ['space', 'time', 'tidal', 'waves', 'lattice', 'lens'];

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
 * Embedding height with a surface at R > r_s. Inside it is Schwarzschild's constant-density
 * interior, dz/dr = √(k r² / (1 − k r²)) with k = r_s/R³, which joins Flamm's exterior smoothly.
 */
export function surfaceZ(r: number, rs: number, R: number): number {
  if (r >= R || R <= rs) return flammZ(r, rs);
  const k = rs / (R * R * R);
  return flammZ(R, rs) - (Math.sqrt(1 - k * r * r) - Math.sqrt(1 - k * R * R)) / Math.sqrt(k);
}

/**
 * The surface drawn as a well: z(r) − z(R_ref), clamped to ≤ 0. For a black hole (R = r_s) the floor
 * inside the throat is flat, since r < r_s is not part of the t = const exterior slice.
 */
export function flammWell(r: number, rs: number, rRef = FLAMM_REF, R = rs): number {
  return Math.min(0, surfaceZ(r, rs, R) - surfaceZ(rRef, rs, R));
}

/** The radius where a source's vacuum exterior ends. */
const fieldRadius = (s: Source): number => Math.max(s.radius ?? 0, 2 * s.m);

/** Newtonian-limit potential: −M/r outside, a uniform sphere's interior inside (clamped at a horizon). */
export function potential(x: number, y: number, sources: readonly Source[]): number {
  let phi = 0;
  for (const s of sources) {
    const R = fieldRadius(s);
    const d = Math.hypot(x - s.x, y - s.y);
    if (d >= R) phi -= s.m / d;
    else if (R > 2 * s.m) phi -= (s.m * (3 * R * R - d * d)) / (2 * R * R * R);
    else phi -= s.m / R;
  }
  return phi;
}

/** Static-observer time-dilation factor dτ/dt = √(1 + 2Φ), clamped to [0, 1]. */
export function lapse(phi: number): number {
  return Math.sqrt(Math.max(0, Math.min(1, 1 + 2 * phi)));
}

/** Σ 48 M² / r⁶ (each r clamped at its surface or horizon). */
export function kretschmann(x: number, y: number, sources: readonly Source[]): number {
  let k = 0;
  for (const s of sources) {
    const r = Math.max(Math.hypot(x - s.x, y - s.y), fieldRadius(s));
    const r2 = r * r;
    k += (48 * s.m * s.m) / (r2 * r2 * r2);
  }
  return k;
}

/** Height of the drawn sheet at (x, y) in the given mode (mirrors the vertex shader). */
export function heightAt(mode: ViewMode, x: number, y: number, sources: readonly Source[], exaggeration: number): number {
  // The waves view adds its ripple in the scene (it needs the wave history, see sim/waves.ts).
  if (mode === 'lattice' || mode === 'waves' || mode === 'lens' || mode === 'warp') return 0;
  if (mode === 'space') {
    let h = 0;
    for (const s of sources) h += flammWell(Math.hypot(x - s.x, y - s.y), 2 * s.m, FLAMM_REF, fieldRadius(s));
    return h * exaggeration;
  }
  return potential(x, y, sources) * PHI_HEIGHT * exaggeration;
}

export interface FieldSample {
  /** Distance to the nearest mass (Infinity if none). */
  r: number;
  /** Mass of that nearest mass. */
  m: number;
  /** Whether that nearest mass is a black hole (the orbit figures assume one). */
  hole: boolean;
  phi: number;
  lapse: number;
  kretschmann: number;
  insideHorizon: boolean;
}

export function sampleFields(x: number, y: number, sources: readonly Source[]): FieldSample {
  let r = Infinity;
  let m = 0;
  let inside = false;
  let hole = false;
  for (const s of sources) {
    const d = Math.hypot(x - s.x, y - s.y);
    if (d < r) {
      r = d;
      m = s.m;
      hole = isBlackHole(s);
    }
    if (isBlackHole(s) && d < 2 * s.m) inside = true;
  }
  const phi = potential(x, y, sources);
  return { r, m, hole, phi, lapse: inside ? 0 : lapse(phi), kretschmann: kretschmann(x, y, sources), insideHorizon: inside };
}
