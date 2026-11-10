/**
 * Gravitational microlensing: a star passes behind a lens too small to resolve, and only its total
 * brightness changes. Lengths are in units of the Einstein radius θ_E of the total lens mass.
 *
 * Point lens (Paczyński 1986), exact in the thin-lens, weak-field limit:
 *   β = θ − 1/θ,  two images θ± = (u ± √(u² + 4))/2,  A(u) = (u² + 2) / (u√(u² + 4)).
 * A straight track at closest approach u₀ gives u(t) = √(u₀² + ((t − t₀)/t_E)²).
 *
 * Binary lens, masses m₁ + m₂ = 1 on the real axis, in complex notation ζ = z − Σ mᵢ/(z̄ − zᵢ):
 *  - Exact magnifications: conjugating the lens equation and substituting back gives a polynomial
 *    of degree five in z. Its roots that satisfy the lens equation are the images (three or five),
 *    each magnified by 1/|1 − |Σ mᵢ/(z̄ − zᵢ)²|²|.
 *  - Critical curves: Σ mᵢ/(z − zᵢ)² = e^{iφ}, a quartic for each φ. Caustics are their images under
 *    the lens map: where the magnification of a point source is infinite.
 *  - The magnification map, by inverse ray shooting through lens.ts's lensMap (the app's own thin-lens
 *    map): rays on a uniform grid are mapped to the source plane and counted per pixel. Its limits are
 *    the pixel size (a caustic's infinite peak becomes finite) and counting noise ~1/√(nA).
 */
import { lensMap } from './lens';
import type { Source } from './types';

export type C = [number, number];

const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
const conj = (a: C): C => [a[0], -a[1]];
const abs = (a: C): number => Math.hypot(a[0], a[1]);
const scale = (a: C, k: number): C => [a[0] * k, a[1] * k];

/** Polynomials as complex coefficient arrays, lowest power first. */
type Poly = C[];
function pmul(p: Poly, q: Poly): Poly {
  const out: Poly = Array.from({ length: p.length + q.length - 1 }, () => [0, 0] as C);
  for (let i = 0; i < p.length; i++) for (let j = 0; j < q.length; j++) out[i + j] = add(out[i + j], mul(p[i], q[j]));
  return out;
}
function padd(p: Poly, q: Poly): Poly {
  const n = Math.max(p.length, q.length);
  return Array.from({ length: n }, (_, i) => add(p[i] ?? [0, 0], q[i] ?? [0, 0]));
}
const pscale = (p: Poly, k: C): Poly => p.map((c) => mul(c, k));
function peval(p: Poly, z: C): C {
  let v: C = [0, 0];
  for (let i = p.length - 1; i >= 0; i--) v = add(mul(v, z), p[i]);
  return v;
}

/** All roots of a complex polynomial (Aberth-Ehrlich iteration), polished by Newton. */
export function polyRoots(p: Poly): C[] {
  let coeffs = p.slice();
  while (coeffs.length > 1 && abs(coeffs[coeffs.length - 1]) === 0) coeffs = coeffs.slice(0, -1);
  const n = coeffs.length - 1;
  if (n < 1) return [];
  const lead = coeffs[n];
  const monic = coeffs.map((c) => div(c, lead));
  const dp: Poly = monic.slice(1).map((c, i) => scale(c, i + 1));
  // Start on a circle that bounds the roots (Cauchy), slightly rotated off any symmetry axis.
  const R = 1 + Math.max(...monic.slice(0, n).map(abs));
  let z: C[] = Array.from({ length: n }, (_, k) => [R * Math.cos((2 * Math.PI * k) / n + 0.4), R * Math.sin((2 * Math.PI * k) / n + 0.4)] as C);
  for (let it = 0; it < 500; it++) {
    let worst = 0;
    const next = z.map((zi, i) => {
      const ratio = div(peval(monic, zi), peval(dp, zi));
      let s: C = [0, 0];
      for (let j = 0; j < n; j++) if (j !== i) s = add(s, div([1, 0], sub(zi, z[j])));
      const w = div(ratio, sub([1, 0], mul(ratio, s)));
      worst = Math.max(worst, abs(w) / Math.max(1, abs(zi)));
      return sub(zi, w);
    });
    z = next;
    if (worst < 1e-14) break;
  }
  return z.map((zi) => {
    let r = zi;
    for (let k = 0; k < 3; k++) {
      const d = peval(dp, r);
      if (abs(d) === 0) break;
      r = sub(r, div(peval(monic, r), d));
    }
    return r;
  });
}

/** Point-lens magnification, exact. */
export const pointMagnification = (u: number): number => (u * u + 2) / (u * Math.sqrt(u * u + 4));

/** The two point-lens images, as distances along the source direction (θ₋ < 0 is on the far side). */
export const pointImages = (u: number): { plus: number; minus: number } => ({ plus: (u + Math.sqrt(u * u + 4)) / 2, minus: (u - Math.sqrt(u * u + 4)) / 2 });

export interface BinaryLens {
  /** Mass fractions, m₁ + m₂ = 1. */
  m1: number;
  m2: number;
  /** Positions on the real axis, centre of mass at 0. */
  z1: number;
  z2: number;
}

/** A binary of mass ratio q = m₂/m₁ and separation d (in θ_E of the total mass). */
export function binary(q: number, d: number): BinaryLens {
  const m1 = 1 / (1 + q);
  const m2 = q / (1 + q);
  return { m1, m2, z1: -d * m2, z2: d * m1 };
}

/** The lens equation ζ(z). */
export function lensEquation(L: BinaryLens, z: C): C {
  const zb = conj(z);
  return sub(sub(z, div([L.m1, 0], sub(zb, [L.z1, 0]))), div([L.m2, 0], sub(zb, [L.z2, 0])));
}

/** ∂ζ/∂z̄ = Σ mᵢ/(z̄ − zᵢ)²; the Jacobian determinant is 1 − |∂ζ/∂z̄|². */
function shear(L: BinaryLens, z: C): C {
  const zb = conj(z);
  const a = sub(zb, [L.z1, 0]);
  const b = sub(zb, [L.z2, 0]);
  return add(div([L.m1, 0], mul(a, a)), div([L.m2, 0], mul(b, b)));
}

export interface Image {
  z: C;
  /** Signed magnification: negative for images of odd parity. */
  mu: number;
}

/** The fifth-order polynomial whose roots include every image of the source at ζ. */
export function imagePolynomial(L: BinaryLens, zeta: C): Poly {
  const w = conj(zeta);
  const D = pmul([[-L.z1, 0], [1, 0]], [[-L.z2, 0], [1, 0]]);
  const N = padd(pscale(D, w), padd(pscale([[-L.z2, 0], [1, 0]], [L.m1, 0]), pscale([[-L.z1, 0], [1, 0]], [L.m2, 0])));
  const P1 = padd(N, pscale(D, [-L.z1, 0]));
  const P2 = padd(N, pscale(D, [-L.z2, 0]));
  const lhs = pmul(pmul([[-zeta[0], -zeta[1]], [1, 0]], P1), P2);
  return padd(lhs, padd(pscale(pmul(D, P2), [-L.m1, 0]), pscale(pmul(D, P1), [-L.m2, 0])));
}

/** The images of a point source at ζ, with their magnifications. Spurious roots are dropped. */
export function binaryImages(L: BinaryLens, zeta: C): Image[] {
  const roots = polyRoots(imagePolynomial(L, zeta));
  const out: Image[] = [];
  for (const z of roots) {
    if (!Number.isFinite(z[0]) || !Number.isFinite(z[1])) continue;
    const back = lensEquation(L, z);
    if (abs(sub(back, zeta)) > 1e-6 * Math.max(1, abs(zeta))) continue;
    if (out.some((o) => abs(sub(o.z, z)) < 1e-9)) continue;
    const s = shear(L, z);
    const det = 1 - (s[0] * s[0] + s[1] * s[1]);
    out.push({ z, mu: 1 / det });
  }
  return out;
}

/** Total magnification of a point source at ζ, exact (to the root finder's precision). */
export const binaryMagnification = (L: BinaryLens, zeta: C): number => binaryImages(L, zeta).reduce((s, im) => s + Math.abs(im.mu), 0);

/** Critical-curve points (lens plane) and their caustic images (source plane), n phases × 4 roots. */
export function criticalAndCaustic(L: BinaryLens, n = 360): { critical: C[]; caustic: C[] } {
  const critical: C[] = [];
  const caustic: C[] = [];
  const a: Poly = [[-L.z1, 0], [1, 0]];
  const b: Poly = [[-L.z2, 0], [1, 0]];
  const a2 = pmul(a, a);
  const b2 = pmul(b, b);
  const base = padd(pscale(b2, [L.m1, 0]), pscale(a2, [L.m2, 0]));
  const quart = pmul(a2, b2);
  for (let k = 0; k < n; k++) {
    const phi = (2 * Math.PI * k) / n;
    const p = padd(base, pscale(quart, [-Math.cos(phi), -Math.sin(phi)]));
    for (const z of polyRoots(p)) {
      if (!Number.isFinite(z[0])) continue;
      critical.push(z);
      caustic.push(lensEquation(L, z));
    }
  }
  return { critical, caustic };
}

export interface Track {
  /** A point the track passes through, in θ_E. */
  x: number;
  y: number;
  /** Direction of motion, radians. */
  angle: number;
}

/** The source position at s Einstein radii along the track from its anchor point. */
export const trackPoint = (t: Track, s: number): C => [t.x + s * Math.cos(t.angle), t.y + s * Math.sin(t.angle)];

/** Closest approach of the track to the origin (the lens, or the binary's centre of mass). */
export function closestApproach(t: Track): { u0: number; s0: number } {
  const s0 = -(t.x * Math.cos(t.angle) + t.y * Math.sin(t.angle));
  const p = trackPoint(t, s0);
  return { u0: Math.hypot(p[0], p[1]), s0 };
}

/** A light curve: magnification at n points for s in [s0, s1] along the track. */
export function lightCurve(t: Track, lens: BinaryLens | null, s0: number, s1: number, n: number): { s: number[]; A: number[] } {
  const s: number[] = [];
  const A: number[] = [];
  for (let k = 0; k < n; k++) {
    const sk = s0 + ((s1 - s0) * k) / (n - 1);
    const z = trackPoint(t, sk);
    s.push(sk);
    A.push(lens ? binaryMagnification(lens, z) : pointMagnification(Math.hypot(z[0], z[1])));
  }
  return { s, A };
}

export interface MagMap {
  /** Magnification per pixel, row-major from (−half, −half). */
  A: Float32Array;
  pixels: number;
  /** Source-plane half-width covered, in θ_E. */
  half: number;
  /** Rays per pixel with no lens: the counting noise in a pixel is about 1/√(this × A). */
  raysPerPixel: number;
  /** Rays shot per side, over the lens-plane half-width. */
  rays: number;
  lensHalf: number;
}

/** Sources for lens.ts's lensMap that make its units θ_E: tiny masses, D chosen so 4ΣmD = 1. */
export function lensSources(L: BinaryLens): { sources: Source[]; dEff: number } {
  const mu = 1e-6;
  return { sources: [{ x: L.z1, y: 0, m: L.m1 * mu }, { x: L.z2, y: 0, m: L.m2 * mu }].filter((s) => s.m > 0), dEff: 1 / (4 * mu) };
}

/**
 * Inverse ray shooting, in slices so a page can stay responsive: call step() until it returns true.
 * Rays on an N × N grid over the lens-plane square of half-width lensHalf are mapped by lensMap and
 * counted in a P × P grid over the source square of half-width half.
 */
export function shootMap(L: BinaryLens, opts: { pixels?: number; half?: number; rays?: number; lensHalf?: number } = {}) {
  const P = opts.pixels ?? 150;
  const half = opts.half ?? 1.5;
  const N = opts.rays ?? 2000;
  const lensHalf = opts.lensHalf ?? 2.6;
  const { sources, dEff } = lensSources(L);
  const counts = new Float32Array(P * P);
  const cell = (2 * lensHalf) / N;
  const pix = (2 * half) / P;
  const raysPerPixel = (pix / cell) ** 2;
  let row = 0;
  const map: MagMap = { A: counts, pixels: P, half, raysPerPixel, rays: N, lensHalf };
  return {
    map,
    /** Shoots up to `rows` more rows; true when the map is complete (and normalised). */
    step(rows = 100): boolean {
      const end = Math.min(N, row + rows);
      for (; row < end; row++) {
        const ty = -lensHalf + (row + 0.5) * cell;
        for (let c = 0; c < N; c++) {
          const tx = -lensHalf + (c + 0.5) * cell;
          const b = lensMap(tx, ty, sources, dEff);
          const i = Math.floor((b.x + half) / pix);
          const j = Math.floor((b.y + half) / pix);
          if (i >= 0 && i < P && j >= 0 && j < P) counts[j * P + i] += 1;
        }
      }
      if (row < N) return false;
      if (row === N) {
        for (let k = 0; k < counts.length; k++) counts[k] /= raysPerPixel;
        row++;
      }
      return true;
    },
  };
}

/** The map's value at a source point (nearest pixel), or NaN outside it. */
export function mapAt(m: MagMap, x: number, y: number): number {
  const pix = (2 * m.half) / m.pixels;
  const i = Math.floor((x + m.half) / pix);
  const j = Math.floor((y + m.half) / pix);
  if (i < 0 || i >= m.pixels || j < 0 || j >= m.pixels) return NaN;
  return m.A[j * m.pixels + i];
}
