/**
 * Gravitational-lens maps for the Lens view. Pure maths, no rendering; the GLSL in
 * src/scene/lensView.tsx mirrors lensMap() and strongLensMap() (keep them in sync).
 *
 * Units G = c = 1. Everything is a length measured in the lens plane: θ is where a ray crosses the
 * plane, β is the point on the sky behind it, mapped back to the plane so that a ray with no mass
 * nearby has β = θ. The geometry enters only through D = D_L D_LS / D_S, the "effective" distance.
 *
 *   β = θ − Σ θ_E,i² (θ − θ_i) / |θ − θ_i|²        θ_E,i² = 4 M_i D
 *
 * What is exact and what is not:
 *  - Exact: b_c = 3√3 M as the capture threshold of a single Schwarzschild hole, and the bending
 *    angle α̂(b) of schwarzschildDeflection(), used alone when the scene holds one black hole.
 *  - Thin-lens approximation: every scene with more than one mass (or one that is not a black
 *    hole). Bending is the weak-field 4M/b summed over the masses, each treated as isolated, so the
 *    strong-field photon rings are not present and a hole's capture disc is just its own b_c.
 *  - Display choice: the geometry is a flat source plane behind a flat lens plane (2D masses, face-on
 *    observer), and D is not a physical distance. Beyond small angles the plane is a stereographic
 *    chart of the sky directions, the only way a flat sky can also receive strongly bent rays.
 */
import { isBlackHole, surfaceRadius, type Source } from './types';

/** b_c / M: rays arriving with b < 3√3 M fall into a Schwarzschild hole. */
export const B_CRIT = 3 * Math.sqrt(3);

export const criticalImpact = (m: number): number => B_CRIT * m;

/** True when a ray with impact parameter b is captured by a mass-m Schwarzschild hole. */
export const isCaptured = (b: number, m: number): boolean => b < criticalImpact(m);

/** Einstein radius θ_E = √(4 M D) of a point lens, as a length in the lens plane. */
export const einsteinRadius = (m: number, dEff: number): number => 2 * Math.sqrt(m * dEff);

/** The two images of a point lens: θ± = (β ± √(β² + 4 θ_E²)) / 2. θ₋ is on the far side of the lens. */
export function pointLensImages(beta: number, thetaE: number): { plus: number; minus: number } {
  const root = Math.sqrt(beta * beta + 4 * thetaE * thetaE);
  return { plus: (beta + root) / 2, minus: (beta - root) / 2 };
}

/**
 * Impact parameter inside which a ray cannot reach the far side of a mass: b_c for a hole, the
 * grazing ray R / √(1 − 2M/R) for a solid body (b_c if R < 3M, where the photon sphere is outside
 * the surface), 0 for a galaxy, which has no surface.
 */
export function occlusionRadius(s: Source): number {
  if (s.kind === 'galaxy') return 0;
  if (isBlackHole(s)) return criticalImpact(s.m);
  const R = surfaceRadius(s);
  if (R < 3 * s.m) return criticalImpact(s.m);
  return R / Math.sqrt(1 - (2 * s.m) / R);
}

/**
 * The thin-lens map for any number of masses, softened where a mass is extended. A softening a is
 * a projected Plummer sphere, whose reduced deflection is 4M b / (b² + a²). A point mass is
 * clamped at its occlusion radius so the map stays smooth where the disc hides it anyway.
 */
export function lensMap(thX: number, thY: number, sources: readonly Source[], dEff: number): { x: number; y: number } {
  let bx = thX;
  let by = thY;
  for (const s of sources) {
    const dx = thX - s.x;
    const dy = thY - s.y;
    const b2 = dx * dx + dy * dy;
    const a = s.soft ?? 0;
    const denominator = a > 0 ? b2 + a * a : Math.max(b2, occlusionRadius(s) ** 2, 1e-12);
    const k = (4 * s.m * dEff) / denominator;
    bx -= k * dx;
    by -= k * dy;
  }
  return { x: bx, y: by };
}

/** Carlson's symmetric elliptic integral R_F, by the duplication theorem. */
function carlsonRF(x: number, y: number, z: number): number {
  let [a, b, c] = [x, y, z];
  for (let i = 0; i < 60; i++) {
    const l = Math.sqrt(a * b) + Math.sqrt(b * c) + Math.sqrt(c * a);
    a = (a + l) / 4;
    b = (b + l) / 4;
    c = (c + l) / 4;
    const m = (a + b + c) / 3;
    const dx = 1 - a / m;
    const dy = 1 - b / m;
    const dz = 1 - c / m;
    if (Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) < 1e-6) {
      const e2 = dx * dy - dz * dz;
      const e3 = dx * dy * dz;
      return (1 - e2 / 10 + e3 / 14 + (e2 * e2) / 24 - (3 * e2 * e3) / 44) / Math.sqrt(m);
    }
  }
  return NaN;
}

const ellipticK = (k2: number): number => carlsonRF(0, 1 - k2, 1);

/** The incomplete integral F(φ | k²), with sin²φ given. */
function ellipticF(sin2: number, k2: number): number {
  return Math.sqrt(sin2) * carlsonRF(1 - sin2, 1 - k2 * sin2, 1);
}

/**
 * Exact bending angle of one Schwarzschild mass for a ray of impact parameter b, from the elliptic
 * integral for the deflection. NaN when the ray is captured. Far from the mass it is 4M/b.
 *
 * Below M/b = 5×10⁻⁴ this switches to the weak-field series, where the elliptic form loses
 * precision (the result is a small difference of large terms).
 */
export function schwarzschildDeflection(b: number, m: number): number {
  if (m <= 0) return 0;
  if (b < criticalImpact(m)) return NaN;
  const u = m / b;
  if (u < 5e-4) return (4 + ((15 * Math.PI) / 4 + (128 / 3) * u) * u) * u;
  // P is the periastron: the largest root of b² = P³ / (P − 2M).
  const P = ((2 * b) / Math.sqrt(3)) * Math.cos(Math.acos(Math.min(1, -B_CRIT * u)) / 3);
  const Q = Math.sqrt((P - 2 * m) * (P + 6 * m));
  const k2 = (Q - P + 6 * m) / (2 * Q);
  const sin2 = (Q - P + 2 * m) / (Q - P + 6 * m);
  return 4 * Math.sqrt(P / Q) * (ellipticK(k2) - ellipticF(sin2, k2)) - Math.PI;
}

/** The strong-deflection-limit constant: α̂ → −ln(b / b_c − 1) + B̄ as b → b_c. */
export const STRONG_LIMIT_BBAR = Math.log(216 * (7 - 4 * Math.sqrt(3))) - Math.PI;

/**
 * The smooth part of α̂ that the shader tabulates, h(x) = α̂ + ln(1 − x) with x = b_c/b. The log
 * carries the divergence at the critical impact parameter, leaving h finite on [0, 1].
 */
export function deflectionRemainder(x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return STRONG_LIMIT_BBAR;
  return schwarzschildDeflection(B_CRIT / x, 1) + Math.log(1 - x);
}

export const DEFLECTION_TABLE_SIZE = 1024;

/** h(x) sampled uniformly on [0, 1], for the one-dimensional lookup texture. */
export function deflectionTable(n = DEFLECTION_TABLE_SIZE): Float32Array<ArrayBuffer> {
  const table = new Float32Array(n);
  for (let i = 0; i < n; i++) table[i] = deflectionRemainder(i / (n - 1));
  return table;
}

/** Linear interpolation of a deflectionTable(), as the shader does it. */
export function tableRemainder(table: ArrayLike<number>, x: number): number {
  const i = Math.min(Math.max(x, 0), 1) * (table.length - 1);
  const i0 = Math.floor(i);
  const i1 = Math.min(i0 + 1, table.length - 1);
  return table[i0] + (table[i1] - table[i0]) * (i - i0);
}

/** One mass that is a black hole: the only case the exact deflection is applied to. */
export const isStrongLensScene = (sources: readonly Source[]): boolean => sources.length === 1 && isBlackHole(sources[0]);

/**
 * The map for a single black hole with the exact deflection. Past small angles it uses the
 * stereographic chart 2 tan(α̂/2) of the sky, which reduces to the thin-lens α̂ as α̂ → 0 and winds
 * rays that loop the hole round to the correct direction. Returns null inside the capture disc.
 */
export function strongLensMap(thX: number, thY: number, s: Source, dEff: number): { x: number; y: number } | null {
  const dx = thX - s.x;
  const dy = thY - s.y;
  const b = Math.hypot(dx, dy);
  if (isCaptured(b, s.m)) return null;
  const k = (2 * Math.tan(schwarzschildDeflection(b, s.m) / 2) * dEff) / b;
  return { x: thX - k * dx, y: thY - k * dy };
}

/**
 * The effective distance D of the view, picked from the heaviest mass so that its Einstein radius
 * sits outside its shadow or surface: 42 M puts a hole's ring at about 2.5 b_c. This is a display
 * choice, not a measured distance: the simulation has no observer or source distances to use.
 */
export function lensDistance(sources: readonly Source[]): number {
  let heaviest: Source | null = null;
  for (const s of sources) if (!heaviest || s.m > heaviest.m) heaviest = s;
  if (!heaviest || heaviest.m <= 0) return 0;
  const m = heaviest.m;
  const a = heaviest.soft ?? 0;
  if (a > 0) return Math.max(42 * m, (a * a) / m);
  if (isBlackHole(heaviest)) return 42 * m;
  const R = surfaceRadius(heaviest);
  return Math.max(42 * m, (0.6 * R * R) / m);
}

/** The note for the UI: the tag states which approximation is on screen for this set of masses. */
export function lensNote(sources: readonly Source[], maxShaderMasses: number): { title: string; body: string; tag: string } {
  const title = 'Lens · the sky behind these masses';
  if (sources.length === 0) {
    return { title, body: 'Nothing here bends light. Place a mass to see the sky behind it distort.', tag: 'flat: no lens' };
  }
  const plane = '2D source plane';
  const distance = 'The distance D is a display choice.';
  if (isStrongLensScene(sources)) {
    return {
      title,
      body: `One black hole with the exact Schwarzschild bending. Rays with b < b_c = 3√3 M are captured and black, and the thin rings at that edge are rays that wound round the hole. ${distance}`,
      tag: `exact bending (one hole), ${plane}, face-on`,
    };
  }
  const dropped = sources.length > maxShaderMasses ? ` Only the first ${maxShaderMasses} masses are drawn.` : '';
  const holes = sources.some(isBlackHole);
  return {
    title,
    body: `β = θ − Σ θ_E² (θ − θ_i) / |θ − θ_i|²: each mass deflects by the weak-field 4M/b and the deflections add. ${holes ? 'Black holes are shadowed at their own b_c = 3√3 M, but the strong-field bending near that edge is not used here, so photon rings are absent. ' : ''}${distance}${dropped}`,
    tag: `thin lens (weak field), ${holes ? 'no strong-field bending, ' : ''}${plane}, face-on`,
  };
}
