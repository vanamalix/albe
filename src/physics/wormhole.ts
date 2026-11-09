/**
 * The Ellis wormhole, the simplest of the Morris-Thorne class (Morris & Thorne 1988), G = c = 1:
 *
 *   ds² = −dt² + dl² + (l² + b²)(dθ² + sin²θ dφ²)
 *
 * l is proper radial distance and runs from −∞ (one universe) to +∞ (the other), through a throat of
 * radius b at l = 0. Everything in this file is exact for this metric, except that the rays are found
 * by RK4 (tested against the closed forms below).
 *
 * Because g_tt = −1 there is no gravitational pull and no time dilation between static observers.
 * Consequently geodesics are straight lines of the spatial metric, and light and matter sent with the
 * same impact parameter follow the SAME path; they differ only in speed. Its equatorial slice embeds in
 * flat space as a catenoid.
 *
 * Not physical: the metric solves Einstein's equations only with negative energy density at the
 * throat (a violation of the null energy condition, see ellisMatter), which no known classical
 * matter provides. Nobody knows of one in nature, or how to make one.
 */

const asinh = Math.asinh;

export type WormholeFate = 'cross' | 'reflect' | 'ring';

/** Areal radius of the 2-sphere at proper distance l. */
export const ellisRadius = (l: number, b: number): number => Math.sqrt(l * l + b * b);

/** Height of the catenoid: the embedding of the equatorial slice into flat 3-space. */
export const ellisZ = (l: number, b: number): number => b * asinh(l / b);

/** World position of (l, φ) on the embedding surface. */
export function ellisEmbed(l: number, phi: number, b: number): [number, number, number] {
  const r = ellisRadius(l, b);
  return [r * Math.cos(phi), r * Math.sin(phi), ellisZ(l, b)];
}

/** Gaussian curvature of the equatorial slice: −b²/(l² + b²)². Strongest at the throat, −1/b². */
export function ellisGaussK(l: number, b: number): number {
  const r2 = l * l + b * b;
  return -(b * b) / (r2 * r2);
}

/** Density and pressures the Einstein equations demand of the source: ρ = p_r = −p_t = −b²/(8π r⁴). */
export function ellisMatter(l: number, b: number): { rho: number; pr: number; pt: number; nec: number } {
  const r2 = l * l + b * b;
  const rho = -(b * b) / (8 * Math.PI * r2 * r2);
  return { rho, pr: rho, pt: -rho, nec: rho + rho };
}

/** ∫ρ dV over both sides of the throat, in geometric units of length: exactly −πb/2. */
export const ellisTotalEnergy = (b: number): number => (-Math.PI * b) / 2;

/** Geometric length to kilograms, c²/G (CODATA 2018). */
export const KG_PER_METRE = 299792458 ** 2 / 6.6743e-11;
export const JUPITER_KG = 1.898e27;

/** How many Jupiter masses of negative energy a throat of b metres needs, integrated over both sides. */
export const ellisJupiters = (bMetres: number): number => (-ellisTotalEnergy(bMetres) * KG_PER_METRE) / JUPITER_KG;

/**
 * The lateral tidal acceleration per unit length on a traveller crossing at speed v, in units of 1/length²:
 * γ²v²b²/r⁴ (from boosting R_θlθl along l; Φ = 0 here). It vanishes for a static observer and grows
 * with speed, the opposite of what a black hole does.
 */
export function ellisTide(l: number, b: number, v: number): number {
  const r2 = l * l + b * b;
  const g2 = 1 / (1 - v * v);
  return (g2 * v * v * b * b) / (r2 * r2);
}

/** Complete elliptic integral K(k) with modulus k, by the arithmetic-geometric mean. */
export function ellipticK(k: number): number {
  const m = Math.abs(k);
  if (m >= 1) return Infinity;
  let a = 1;
  let g = Math.sqrt(1 - m * m);
  for (let i = 0; i < 60 && Math.abs(a - g) > 1e-15; i++) {
    const next = (a + g) / 2;
    g = Math.sqrt(a * g);
    a = next;
  }
  return Math.PI / (2 * a);
}

/** Fate of a ray with impact parameter h through a throat b. */
export function wormholeFate(h: number, b: number): WormholeFate {
  const k = Math.abs(h) / b;
  return k < 1 - 1e-9 ? 'cross' : k > 1 + 1e-9 ? 'reflect' : 'ring';
}

/** Total change of φ from l = −∞ to l = +∞ for |h| < b: 2 (h/b) K(h/b). Exact. */
export function crossingSweep(h: number, b: number): number {
  const k = h / b;
  return 2 * k * ellipticK(k);
}

/** Total change of φ for a ray that comes in from infinity, turns round and leaves, |h| > b: 2 K(b/h). Exact. */
export const reflectSweep = (h: number, b: number): number => 2 * ellipticK(b / h);

/** Bending angle of a reflected ray away from a straight line: 2 K(b/h) − π, ≈ πb²/(4h²) for h ≫ b. */
export const reflectDeflection = (h: number, b: number): number => reflectSweep(h, b) - Math.PI;

export interface WormholeRay {
  b: number;
  h: number;
  fate: WormholeFate;
  l: number[];
  phi: number[];
  /** Proper length along the ray (for a massive traveller at speed v, the coordinate time is s/v). */
  s: number[];
}

export interface TraceOptions {
  /** Step, as a fraction of the local scale √(l² + b²). */
  rel?: number;
  /** Stop after this length, for rays that wind round the throat. */
  maxArc?: number;
  maxPoints?: number;
}

/**
 * Follows a geodesic of the wormhole by RK4 in proper length s, starting at l0 and heading toward the
 * throat, until it leaves through |l| = lEnd. Works for light and for matter: see the file comment.
 */
export function traceWormhole(b: number, h: number, l0: number, phi0: number, lEnd: number, options: TraceOptions = {}): WormholeRay {
  const rel = options.rel ?? 0.01;
  const maxArc = options.maxArc ?? Math.max(80 * Math.PI * b, 6 * lEnd);
  const maxPoints = options.maxPoints ?? 6000;
  const h2 = h * h;
  const accel = (x: number): number => {
    const r2 = x * x + b * b;
    return (x * h2) / (r2 * r2);
  };
  const rate = (x: number): number => h / (x * x + b * b);

  let x = l0;
  let phi = phi0;
  const inward = Math.sqrt(Math.max(0, 1 - h2 / (l0 * l0 + b * b)));
  let p = l0 >= 0 ? -inward : inward;
  let s = 0;
  const ray: WormholeRay = { b, h, fate: wormholeFate(h, b), l: [x], phi: [phi], s: [0] };

  while (ray.l.length < maxPoints && s < maxArc) {
    const ds = rel * Math.sqrt(x * x + b * b);
    const k1x = p;
    const k1p = accel(x);
    const k1f = rate(x);
    const x2 = x + 0.5 * ds * k1x;
    const k2x = p + 0.5 * ds * k1p;
    const k2p = accel(x2);
    const k2f = rate(x2);
    const x3 = x + 0.5 * ds * k2x;
    const k3x = p + 0.5 * ds * k2p;
    const k3p = accel(x3);
    const k3f = rate(x3);
    const x4 = x + ds * k3x;
    const k4x = p + ds * k3p;
    const k4p = accel(x4);
    const k4f = rate(x4);
    x += (ds / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
    p += (ds / 6) * (k1p + 2 * k2p + 2 * k3p + k4p);
    phi += (ds / 6) * (k1f + 2 * k2f + 2 * k3f + k4f);
    s += ds;
    ray.l.push(x);
    ray.phi.push(phi);
    ray.s.push(s);
    if (Math.abs(x) >= lEnd && x * p > 0) break;
  }
  return ray;
}
