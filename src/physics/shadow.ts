/**
 * The Kerr critical curve ("shadow" edge) and the photon-ring ladder, G = c = M = 1, spin 0 ≤ a < 1.
 *
 * A bound (spherical) photon orbit at Boyer-Lindquist radius r has energy-scaled constants
 *   ξ = L/E = −(r³ − 3r² + a²r + a²) / (a(r − 1)),   η = Q/E² = r³(4a² − r(r − 3)²) / (a²(r − 1)²)
 * and a distant observer at inclination i (from the spin axis) sees it at the image-plane point
 *   α = −ξ / sin i,   β = ±√(η + a²cos²i − ξ²cot²i)            (Bardeen 1973).
 * The radii with β² ≥ 0 trace a closed curve: the critical curve. It is exact, and it is not an image:
 * it is where rays that wind round the hole arbitrarily often arrive. What is bright near it depends
 * on where the emitting gas is, which needs a ray tracer and a model of the gas.
 *
 * Rays near the curve make n half-orbits before leaving; each extra half-orbit brings the ray e^{−γ}
 * closer to the curve, so the n-th subring is about e^{−γ} narrower (and fainter) than the (n−1)-th.
 * γ is the Lyapunov exponent of the orbit per half-orbit in θ (Johnson et al. 2020, eq. 8):
 *   γ = (4/a) r√χ ∫₀¹ dt / √((1 − t²)(u₊t² − u₋)) = 4r√χ K(u₊/u₋) / (a√(−u₋)),
 *   χ = 1 − Δ/(r(r − 1)²),   u± = Δθ ± √(Δθ² + η/a²),   Δθ = ½(1 − (η + ξ²)/a²).
 * For Schwarzschild γ = π at every point, so each subring is e^{−π} ≈ 4.3% of the last.
 */
import { delta, rPhoton } from './kerr';
import { ellipticK } from './lens';

/** Below this spin the formulas lose precision to cancellation; the curve is the a = 0 circle to O(a). */
export const SPIN_FLOOR = 1e-3;
export const SCHWARZSCHILD_SHADOW_RADIUS = 3 * Math.sqrt(3);

export const xiOf = (r: number, a: number): number => -(r * r * r - 3 * r * r + a * a * r + a * a) / (a * (r - 1));
export const etaOf = (r: number, a: number): number => (r * r * r * (4 * a * a - r * (r - 3) * (r - 3))) / (a * a * (r - 1) * (r - 1));

/** β² for the orbit at r seen from inclination i (radians). */
export function beta2(r: number, a: number, i: number): number {
  const xi = xiOf(r, a);
  const c = Math.cos(i);
  const s = Math.sin(i);
  return etaOf(r, a) + a * a * c * c - (xi * xi * c * c) / (s * s);
}

export interface CriticalPoint {
  /** Orbit radius. */
  r: number;
  alpha: number;
  beta: number;
  /** Lyapunov exponent per half-orbit at this point of the curve. */
  gamma: number;
}

/** Johnson et al. (2020) γ for the spherical photon orbit at r, by the elliptic K. */
export function lyapunov(r: number, a: number): number {
  if (a < SPIN_FLOOR) return Math.PI;
  const xi = xiOf(r, a);
  const eta = etaOf(r, a);
  const chi = 1 - delta(r, a) / (r * (r - 1) * (r - 1));
  const dth = 0.5 * (1 - (eta + xi * xi) / (a * a));
  const root = Math.sqrt(dth * dth + eta / (a * a));
  const up = dth + root;
  const um = dth - root;
  return (4 * r * Math.sqrt(Math.max(0, chi)) * ellipticK(up / um)) / (a * Math.sqrt(-um));
}

/** The range of orbit radii seen from inclination i: where β² ≥ 0, found by scan and bisection. */
export function visibleRadii(a: number, i: number): [number, number] {
  const lo = rPhoton(a, 1);
  const hi = rPhoton(a, -1);
  const n = 400;
  let first = -1;
  let last = -1;
  for (let k = 0; k <= n; k++) {
    const r = lo + ((hi - lo) * k) / n;
    if (beta2(r, a, i) >= 0) {
      if (first < 0) first = k;
      last = k;
    }
  }
  if (first < 0) return [NaN, NaN];
  const edge = (inside: number, outside: number): number => {
    let p = inside;
    let q = outside;
    for (let j = 0; j < 60; j++) {
      const m = (p + q) / 2;
      if (beta2(m, a, i) >= 0) p = m;
      else q = m;
    }
    return p;
  };
  const at = (k: number) => lo + ((hi - lo) * k) / n;
  const r0 = first > 0 ? edge(at(first), at(first - 1)) : lo;
  const r1 = last < n ? edge(at(last), at(last + 1)) : hi;
  return [r0, r1];
}

/**
 * The closed critical curve, upper branch then lower, n points per branch. Points cluster near the
 * ends (cosine spacing), where β changes fastest. For a < SPIN_FLOOR it is the circle of radius 3√3.
 */
export function criticalCurve(a: number, i: number, n = 240): CriticalPoint[] {
  if (a < SPIN_FLOOR) {
    return Array.from({ length: 2 * n }, (_, k) => {
      const t = (k / (2 * n)) * 2 * Math.PI;
      return { r: 3, alpha: SCHWARZSCHILD_SHADOW_RADIUS * Math.cos(t), beta: -SCHWARZSCHILD_SHADOW_RADIUS * Math.sin(t), gamma: Math.PI }; // clockwise, like the spinning case
    });
  }
  const [r0, r1] = visibleRadii(a, i);
  const upper: CriticalPoint[] = [];
  for (let k = 0; k < n; k++) {
    const r = r0 + ((r1 - r0) * (1 - Math.cos((Math.PI * k) / (n - 1)))) / 2;
    const b = Math.sqrt(Math.max(0, beta2(r, a, i)));
    upper.push({ r, alpha: -xiOf(r, a) / Math.sin(i), beta: b, gamma: lyapunov(r, a) });
  }
  const lower = upper
    .slice(1, -1)
    .reverse()
    .map((p) => ({ ...p, beta: -p.beta }));
  return [...upper, ...lower];
}

export interface ShadowSize {
  /** Widest horizontal extent, α_max − α_min. */
  width: number;
  /** Tallest vertical extent, 2 β_max. */
  height: number;
  /** Mean diameter: twice the mean distance from the centroid, over angle (the EHT-style average). */
  meanDiameter: number;
  /** Horizontal centroid offset (the shift toward the receding side). */
  shift: number;
  /** Least and greatest Lyapunov exponent round the curve. */
  gammaMin: number;
  gammaMax: number;
}

/** Sizes of a critical curve; the mean diameter averages the radius over polar angle about the centroid. */
export function shadowSize(curve: readonly CriticalPoint[]): ShadowSize {
  let aMin = Infinity;
  let aMax = -Infinity;
  let bMax = 0;
  let gMin = Infinity;
  let gMax = -Infinity;
  for (const p of curve) {
    aMin = Math.min(aMin, p.alpha);
    aMax = Math.max(aMax, p.alpha);
    bMax = Math.max(bMax, Math.abs(p.beta));
    gMin = Math.min(gMin, p.gamma);
    gMax = Math.max(gMax, p.gamma);
  }
  const shift = (aMin + aMax) / 2;
  // Mean radius over polar angle about the centre: ∮ ρ dφ / 2π, by the trapezium rule round the loop.
  let num = 0;
  let den = 0;
  for (let k = 0; k < curve.length; k++) {
    const p = curve[k];
    const q = curve[(k + 1) % curve.length];
    const rp = Math.hypot(p.alpha - shift, p.beta);
    const rq = Math.hypot(q.alpha - shift, q.beta);
    let dphi = Math.atan2(q.beta, q.alpha - shift) - Math.atan2(p.beta, p.alpha - shift);
    if (dphi > Math.PI) dphi -= 2 * Math.PI;
    if (dphi < -Math.PI) dphi += 2 * Math.PI;
    num += ((rp + rq) / 2) * Math.abs(dphi);
    den += Math.abs(dphi);
  }
  return { width: aMax - aMin, height: 2 * bMax, meanDiameter: (2 * num) / den, shift, gammaMin: gMin, gammaMax: gMax };
}

/**
 * The n-th subring offset from the critical curve, relative to the first: e^{−(n − 1)γ}. Only the
 * ratio is exact; the first subring's own offset depends on the emitting gas.
 */
export const subringRatio = (gamma: number, n: number): number => Math.exp(-(n - 1) * gamma);

/** Angular gravitational radius GM/(Dc²) of a source, and published ring diameters (μas). */
export const EHT = {
  m87: { ring: 42, ringErr: 3, thetaG: 3.8, thetaGErr: 0.4, ref: 'EHT Collaboration (2019), ApJL 875, L1 and L6' },
  sgra: { ring: 51.8, ringErr: 2.3, thetaG: 4.8, thetaGLo: 0.7, thetaGHi: 1.4, ref: 'EHT Collaboration (2022), ApJL 930, L12' },
} as const;
