/**
 * Equatorial Kerr geometry, G = c = M = 1, spin 0 ≤ a < 1, in Boyer-Lindquist r and
 * Kerr-Schild ("ingoing") time and azimuth, which stay finite across the horizon where Boyer-Lindquist
 * t and φ diverge. Results here are exact for a test particle in the equatorial plane; the geodesics
 * are integrated by RK4 and tested against the conserved quantities and closed forms. The hole's mass
 * and spin are held fixed: the particles do not act back on it.
 *
 * Sign convention: the hole spins toward +φ, so prograde means L > 0.
 */

export const delta = (r: number, a: number): number => r * r - 2 * r + a * a;

/** Outer horizon r₊ = 1 + √(1 − a²). */
export const rPlus = (a: number): number => 1 + Math.sqrt(Math.max(0, 1 - a * a));

/** The static limit on the equator: r = 2M for every spin. */
export const R_ERGO_EQUATOR = 2;

/** A = (r² + a²)² − a²Δ on the equator. */
const bigA = (r: number, a: number): number => r * r * r * r + a * a * r * r + 2 * a * a * r;

/** g_φφ on the equator (the square of the circumferential radius). */
export const gPhiPhi = (r: number, a: number): number => r * r + a * a + (2 * a * a) / r;

/** Circumferential radius ρ(r) = √g_φφ: the radius the embedding surface is drawn at. */
export const rho = (r: number, a: number): number => Math.sqrt(gPhiPhi(r, a));

/** The frame-dragging rate ω(r) = −g_tφ/g_φφ: the angular velocity of a zero-angular-momentum observer. */
export const omega = (r: number, a: number): number => (2 * a * r) / bigA(r, a);

/** Lapse of the zero-angular-momentum observers. */
export const lapseKerr = (r: number, a: number): number => (r * Math.sqrt(Math.max(0, delta(r, a)))) / Math.sqrt(bigA(r, a));

/** Slowest and fastest angular velocities an observer can have at r (speed-of-light limits). */
export function omegaRange(r: number, a: number): { min: number; max: number } {
  const w = omega(r, a);
  const span = lapseKerr(r, a) / rho(r, a);
  return { min: w - span, max: w + span };
}

/** Radius of the photon orbit. dir = +1 prograde, −1 retrograde (Bardeen, Press & Teukolsky 1972). */
export function rPhoton(a: number, dir: 1 | -1): number {
  return 2 * (1 + Math.cos((2 / 3) * Math.acos(-dir * a)));
}

/** Innermost stable circular orbit. dir = +1 prograde, −1 retrograde (Bardeen, Press & Teukolsky 1972). */
export function rIsco(a: number, dir: 1 | -1): number {
  const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  return 3 + z2 - dir * Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
}

/**
 * Marginally bound prograde circular orbit, E = 1: the deepest radius a particle from rest at infinity can turn at.
 * It lies inside the ergosphere only for a > 2√2 − 2 ≈ 0.828, so below that spin no such particle can decay there.
 */
export const rMarginallyBound = (a: number): number => 2 - a + 2 * Math.sqrt(1 - a);

/** Energy and angular momentum per unit mass on a circular equatorial orbit, dir = ±1. */
export function circularOrbit(r: number, a: number, dir: 1 | -1): { E: number; L: number } {
  const s = Math.sqrt(r);
  const denom = Math.pow(r, 0.75) * Math.sqrt(r * s - 3 * s + 2 * dir * a);
  return {
    E: (r * s - 2 * s + dir * a) / denom,
    L: (dir * (r * r - 2 * dir * a * s + a * a)) / denom,
  };
}

/** The critical photon impact parameter L/E, dir = ±1. Rays with b between these two are captured. */
export function criticalImpact(a: number, dir: 1 | -1): number {
  if (a < 1e-9) return dir * 3 * Math.sqrt(3);
  const r = rPhoton(a, dir);
  return -(r * r * r - 3 * r * r + a * a * r + a * a) / (a * (r - 1));
}

/** R(r) = r⁴ ṙ² for a geodesic with energy E, angular momentum L; κ = 1 timelike, 0 null. */
export function radialR(r: number, a: number, E: number, L: number, kappa: number): number {
  const P = E * (r * r + a * a) - a * L;
  const Q = (L - a * E) * (L - a * E) + kappa * r * r;
  return P * P - delta(r, a) * Q;
}

export interface KerrPath {
  r: number[];
  /** Ingoing (Kerr-Schild) azimuth: regular at the horizon, but it hides the dragging. Prefer phiBL for display. */
  phi: number[];
  /** Kerr-Schild time: finite at the horizon, equal to t at large r for an outgoing ray. */
  t: number[];
  /** Boyer-Lindquist azimuth: the frame-dragging one, dφ/dt = ω for L = 0. Diverges (slowly) at the horizon. */
  phiBL: number[];
  /** Proper time along a massive particle. Stays 0 for light. */
  tau: number[];
  E: number;
  L: number;
  fate: 'horizon' | 'escape' | 'orbit';
}

export interface KerrTraceOptions {
  rEscape?: number;
  /** Stop when the radial motion first turns round (used for the Penrose parent). */
  stopAtTurn?: boolean;
  step?: number;
  maxPoints?: number;
  maxLambda?: number;
}

/**
 * Integrates an equatorial geodesic by RK4 in affine parameter (proper time for matter).
 * `outward` chooses the initial sign of ṙ; a turning point (R = 0) is handled by the second-order form.
 */
export function traceKerr(a: number, E: number, L: number, kappa: number, r0: number, phi0: number, outward: boolean, options: KerrTraceOptions = {}): KerrPath {
  const horizon = rPlus(a) + 1e-3;
  const rEscape = options.rEscape ?? 60;
  const maxPoints = options.maxPoints ?? 6000;
  const maxLambda = options.maxLambda ?? 1e5;
  const eps = options.step ?? 0.01;
  const B = L - a * E;

  /** The accel and rates at (r, pr). */
  const deriv = (r: number, pr: number) => {
    const dd = delta(r, a);
    const P = E * (r * r + a * a) - a * L;
    const Q = B * B + kappa * r * r;
    const R = P * P - dd * Q;
    const r2 = r * r;
    const r4 = r2 * r2;
    const dR = 4 * E * r * P - (2 * r - 2) * Q - dd * 2 * kappa * r;
    const accel = 0.5 * (dR / r4 - (4 * R) / (r4 * r));
    // F = (P + r²ṙ)/Δ, written without the 0/0 on the way in.
    const F = pr <= 0 ? Q / Math.max(1e-30, P - r2 * pr) : (P + r2 * pr) / Math.max(1e-30, dd);
    const phiDot = (B + a * F) / r2;
    const vDot = (-a * (a * E - L) + (r2 + a * a) * F) / r2;
    return { pr, accel, phi: phiDot, t: vDot - pr };
  };
  /** Boyer-Lindquist dφ/dλ, for the frame-dragging tests only. */
  const phiBLrate = (r: number): number => {
    const P = E * (r * r + a * a) - a * L;
    return (-(a * E - L) + (a * P) / delta(r, a)) / (r * r);
  };

  let r = r0;
  let phi = phi0;
  let t = 0;
  let phiBL = phi0;
  let tau = 0;
  let lambda = 0;
  let pr = Math.sqrt(Math.max(0, radialR(r0, a, E, L, kappa))) / (r0 * r0);
  if (!outward) pr = -pr;
  const path: KerrPath = { r: [r], phi: [phi], t: [0], phiBL: [phi], tau: [0], E, L, fate: 'orbit' };

  while (path.r.length < maxPoints && lambda < maxLambda) {
    const h = eps * Math.max(0.2, Math.min(r, 8));
    const k1 = deriv(r, pr);
    const k2 = deriv(r + 0.5 * h * k1.pr, pr + 0.5 * h * k1.accel);
    const k3 = deriv(r + 0.5 * h * k2.pr, pr + 0.5 * h * k2.accel);
    const k4 = deriv(r + h * k3.pr, pr + h * k3.accel);
    const nr = r + (h / 6) * (k1.pr + 2 * k2.pr + 2 * k3.pr + k4.pr);
    const npr = pr + (h / 6) * (k1.accel + 2 * k2.accel + 2 * k3.accel + k4.accel);
    phi += (h / 6) * (k1.phi + 2 * k2.phi + 2 * k3.phi + k4.phi);
    t += (h / 6) * (k1.t + 2 * k2.t + 2 * k3.t + k4.t);
    phiBL += (h / 6) * (phiBLrate(r) + 4 * phiBLrate(Math.max(horizon, 0.5 * (r + nr))) + phiBLrate(Math.max(horizon, nr)));
    if (kappa > 0) tau += h;
    lambda += h;
    const turning = pr * npr < 0;
    r = nr;
    pr = npr;
    if (r <= horizon) {
      path.fate = 'horizon';
      path.r.push(Math.max(r, horizon));
      path.phi.push(phi);
      path.t.push(t);
      path.phiBL.push(phiBL);
      path.tau.push(tau);
      break;
    }
    path.r.push(r);
    path.phi.push(phi);
    path.t.push(t);
    path.phiBL.push(phiBL);
    path.tau.push(tau);
    if (options.stopAtTurn && turning) break;
    if (r >= rEscape && pr > 0) {
      path.fate = 'escape';
      break;
    }
  }
  return path;
}

/** Energy per unit mass of a particle released from rest at r (zero angular momentum): E² = Δr²/A. */
export function restEnergy(r: number, a: number): number {
  return Math.sqrt((delta(r, a) * r * r) / bigA(r, a));
}

/**
 * The surface-of-revolution height of the equatorial t = const slice, the Kerr analogue of Flamm's
 * paraboloid (a = 0 reproduces it). Integrates dz² = g_rr dr² − dρ² from the horizon with r = r₊ + x²,
 * which tames the 1/√Δ. The embedding exists at every r ≥ r₊ for a ≤ 0.998 (kerr.test.ts checks this).
 */
export function embeddingTable(a: number, rMax: number, n = 2400): { x: Float64Array; z: Float64Array; rp: number; dx: number; zAt: (r: number) => number } {
  const rp = rPlus(a);
  const xMax = Math.sqrt(rMax - rp);
  const dx = xMax / n;
  const x = new Float64Array(n + 1);
  const z = new Float64Array(n + 1);
  const dzdx = (xi: number): number => {
    const r = rp + xi * xi;
    const d = delta(r, a);
    const rhoV = rho(r, a);
    const drho = (r - (a * a) / (r * r)) / rhoV;
    const value = (r * r) / Math.max(1e-30, d) - drho * drho;
    return 2 * xi * Math.sqrt(Math.max(0, value));
  };
  for (let i = 1; i <= n; i++) {
    x[i] = i * dx;
    // Simpson on each interval.
    z[i] = z[i - 1] + (dx / 6) * (dzdx(x[i - 1]) + 4 * dzdx(x[i - 1] + 0.5 * dx) + dzdx(x[i]));
  }
  return {
    x,
    z,
    rp,
    dx,
    zAt(r: number): number {
      const xi = Math.sqrt(Math.max(0, r - rp));
      const f = Math.min(n - 1e-9, Math.max(0, xi / dx));
      const i = Math.floor(f);
      return z[i] + (f - i) * (z[i + 1] - z[i]);
    },
  };
}

/** Angular momentum per unit mass that gives E (default 1) and a radial turning point at r, or null. */
export function turningL(r: number, a: number, E = 1): number | null {
  // (a² − Δ)L² + 2aEL(Δ − r² − a²) + E²A − Δr² = 0, with a² − Δ = r(2 − r) and Δ − r² − a² = −2r.
  const qa = r * (2 - r);
  const qb = -4 * a * r * E;
  const qc = E * E * bigA(r, a) - delta(r, a) * r * r;
  if (Math.abs(qa) < 1e-12) return -qc / qb;
  const disc = qb * qb - 4 * qa * qc;
  if (disc < 0) return null;
  const root = Math.sqrt(disc);
  const candidates = [(-qb + root) / (2 * qa), (-qb - root) / (2 * qa)];
  // A particle falling in from infinity must have R > 0 all the way from far away down to r.
  for (const L of candidates) {
    let open = true;
    for (let s = r + 1e-3; s < 200; s *= 1.05) {
      if (radialR(s, a, E, L, 1) < 0) {
        open = false;
        break;
      }
    }
    if (open && E * (r * r + a * a) - a * L > 0) return L;
  }
  return null;
}

export interface PenroseDecay {
  r: number;
  a: number;
  L0: number;
  /** The escaping fragment. */
  out: { E: number; L: number };
  /** The negative-energy fragment. */
  captured: { E: number; L: number };
  /** Fractional energy gain: (E_out − E₀)/E₀. */
  gain: number;
}

/**
 * Penrose's process, idealised: a particle of unit mass and energy E₀ reaches a radial turning point at
 * r inside the ergosphere and splits instantly into two massless fragments, emitted along ±φ in its own
 * rest frame. Worked in the zero-angular-momentum frame; four-momentum is conserved exactly.
 * Returns null when no such turning point exists.
 */
export function penroseDecay(r: number, a: number, E0 = 1): PenroseDecay | null {
  const L0 = turningL(r, a, E0);
  if (L0 === null) return null;
  const alpha = lapseKerr(r, a);
  const w = omega(r, a);
  const g = rho(r, a);
  const eps = (E0 - w * L0) / alpha;
  const gamma = eps; // m = 1
  const p = L0 / g;
  const v = p / eps;
  const fraction = 0.5 * gamma * (1 + v);
  const fractionMinus = 0.5 * gamma * (1 - v);
  const out = { E: fraction * (alpha + w * g), L: fraction * g };
  const captured = { E: fractionMinus * (alpha - w * g), L: -fractionMinus * g };
  return { r, a, L0, out, captured, gain: (out.E - E0) / E0 };
}

/** The Bardeen-Press-Teukolsky ceiling on the gain of this process: ½(√(2/r₊) − 1). 20.7% at a → 1. */
export const penroseMaxGain = (a: number): number => 0.5 * (Math.sqrt(2 / rPlus(a)) - 1);

/** The largest energy a hole of mass 1 can give up by spin-down, keeping its area: 1 − M_irr. */
export const extractable = (a: number): number => 1 - Math.sqrt(rPlus(a) / 2);
