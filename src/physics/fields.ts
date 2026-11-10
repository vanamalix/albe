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
 *  - Kretschmann scalar K = R_abcd R^abcd = 8 E_ij E^ij (vacuum, static), with the tidal tensor E the
 *    sum over masses: 48 M² / r⁶ for one mass, and interference for several.
 * For several masses these are superposed, which is only a weak-field approximation. Where Φ is so
 * deep that 1 + 2Φ ≤ 0, lapse() clamps at 0: a superposition artefact, not a common horizon.
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

/**
 * K = 8 E_ij E^ij, with the tidal tensor E summed over the masses: each contributes
 * (M/r³)(δ_ij − 3 n_i n_j) (each r clamped at its surface or horizon). Mirrors tidalK() in
 * src/scene/glslChunks.ts, and a test holds them to the same value.
 */
export function kretschmann(x: number, y: number, sources: readonly Source[]): number {
  let exx = 0;
  let eyy = 0;
  let exy = 0;
  let ezz = 0;
  for (const s of sources) {
    const dx = x - s.x;
    const dy = y - s.y;
    const d = Math.hypot(dx, dy);
    const r = Math.max(d, fieldRadius(s));
    const g = s.m / (r * r * r);
    const nx = d > 0 ? dx / d : 1;
    const ny = d > 0 ? dy / d : 0;
    exx += g * (1 - 3 * nx * nx);
    eyy += g * (1 - 3 * ny * ny);
    exy -= g * 3 * nx * ny;
    ezz += g;
  }
  return 8 * (exx * exx + eyy * eyy + 2 * exy * exy + ezz * ezz);
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

/**
 * How far the weak-field picture is being pushed here: the largest single M/r (the post-Newtonian
 * expansion parameter) and the 1PN cross term of g_tt between every pair of masses. With U = Σ M_a/r_a,
 * the 1PN g_tt = −1 + 2U − 2U² + …, whose cross part −4 Σ_{a<b} U_a U_b is what summing the masses
 * one by one leaves out. Galaxies are extended and are skipped.
 */
export function pnSample(x: number, y: number, sources: readonly Source[]): { mOverR: number; cross: number } {
  let mOverR = 0;
  let sum = 0;
  let sumSq = 0;
  for (const s of sources) {
    if (s.kind === 'galaxy') continue;
    const u = s.m / Math.max(Math.hypot(x - s.x, y - s.y), fieldRadius(s));
    mOverR = Math.max(mOverR, u);
    sum += u;
    sumSq += u * u;
  }
  // 4 Σ_{a<b} U_a U_b = 2 [(Σ U)² − Σ U²].
  return { mOverR, cross: 2 * (sum * sum - sumSq) };
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
