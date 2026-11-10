/**
 * Oppenheimer-Snyder collapse: a ball of pressureless dust, uniform and at rest at areal radius R₀,
 * mass M. Exact solution of Einstein's equations (Oppenheimer & Snyder 1939).
 *
 * Inside, each shell is a closed dust FRW universe: ds² = −dτ² + a²(η)(dχ² + sin²χ dΩ²), with
 *   a(η) = (a_m/2)(1 + cos η),  τ = (a_m/2)(η + sin η),  a_m = √(R₀³/2M),  sin χ₀ = √(2M/R₀).
 * The surface χ = χ₀ has areal radius R = (R₀/2)(1 + cos η): the same cycloid as a particle let go
 * from rest at R₀ in Schwarzschild, which is the exterior (Birkhoff). Shell χ holds Misner-Sharp
 * mass m(χ) = M sin³χ / sin³χ₀.
 *
 * Radial light inside moves at dχ = ±dη. Closed forms that follow:
 *  - the surface crosses r = 2M at η_h = π − 2χ₀;
 *  - the event horizon is the outgoing ray that reaches the surface there, so it leaves the centre at
 *    η_f = π − 3χ₀, earlier than η_h: the horizon forms at the centre and grows out to meet the surface;
 *  - the apparent horizon (outgoing light momentarily not gaining area, a′sin χ + a cos χ = 0) is
 *    χ = (π − η)/2: it appears at the surface at η_h, exactly as the surface crosses 2M, and moves in
 *    to the centre at η = π, when the whole ball reaches r = 0 at once.
 *
 * For the Penrose diagram the interior is glued to the Kruskal exterior along the surface: an outgoing
 * ray keeps its U across the surface and an ingoing one its V, so an interior point (η, χ) gets
 * U = U_s(η − χ + χ₀) and V = V_s(η + χ − χ₀), with (U_s, V_s) the surface's Kruskal worldline from
 * kruskal.ts. Outgoing rays from deep inside meet r = 0 before reaching the surface; for them U is
 * continued linearly, a free drawing choice (any monotonic continuation is an equally valid diagram).
 */
import { fallWorldline, type FallPoint } from './kruskal';

export interface Star {
  M: number;
  R0: number;
  chi0: number;
  am: number;
  /** η when the surface crosses r = 2M, and when the event horizon leaves the centre. */
  etaCross: number;
  etaForm: number;
}

export function star(M: number, R0: number): Star {
  const chi0 = Math.asin(Math.sqrt((2 * M) / R0));
  return { M, R0, chi0, am: Math.sqrt((R0 * R0 * R0) / (2 * M)), etaCross: Math.PI - 2 * chi0, etaForm: Math.PI - 3 * chi0 };
}

export const scaleFactor = (s: Star, eta: number): number => (s.am / 2) * (1 + Math.cos(eta));
export const tauOf = (s: Star, eta: number): number => (s.am / 2) * (eta + Math.sin(eta));
/** Areal radius of shell χ at conformal time η. */
export const shellRadius = (s: Star, eta: number, chi: number): number => scaleFactor(s, eta) * Math.sin(chi);
export const surfaceRadius = (s: Star, eta: number): number => (s.R0 / 2) * (1 + Math.cos(eta));
/** Mass inside shell χ. */
export const massInside = (s: Star, chi: number): number => (s.M * Math.sin(chi) ** 3) / Math.sin(s.chi0) ** 3;

/** η at the dust's proper time τ (0 ≤ τ ≤ τ at r = 0), by bisection. */
export function etaAtTau(s: Star, tau: number): number {
  let lo = 0;
  let hi = Math.PI;
  if (tau <= 0) return 0;
  if (tau >= tauOf(s, Math.PI)) return Math.PI;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (tauOf(s, m) < tau) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}

/** Comoving χ of the event horizon at η inside the star, or null before it forms or after it leaves. */
export function eventHorizonChi(s: Star, eta: number): number | null {
  const chi = s.chi0 - (s.etaCross - eta);
  return chi >= 0 && chi <= s.chi0 ? chi : null;
}

/** Comoving χ of the apparent horizon at η inside the star, or null before it appears. */
export function apparentHorizonChi(s: Star, eta: number): number | null {
  const chi = (Math.PI - eta) / 2;
  return chi >= 0 && chi <= s.chi0 ? chi : null;
}

/** The areal radii on show at η: surface, event horizon and apparent horizon (null where absent). */
export function radiiAt(s: Star, eta: number): { surface: number; eh: number | null; ah: number | null } {
  const surface = surfaceRadius(s, eta);
  const ehChi = eventHorizonChi(s, eta);
  const ahChi = apparentHorizonChi(s, eta);
  const outside = eta >= s.etaCross;
  return {
    surface,
    eh: ehChi !== null ? shellRadius(s, eta, ehChi) : outside ? 2 * s.M : null,
    ah: ahChi !== null ? shellRadius(s, eta, ahChi) : null,
  };
}

/** The glued Kruskal map for the star: the surface worldline and the interior chart. */
export function kruskalChart(s: Star, n = 1200) {
  const line: FallPoint[] = fallWorldline(s.M, s.R0, n);
  const h = Math.PI / n;
  /** The surface's U, V at η in [−π, π] (time-symmetric about the moment of rest: U ↔ −V). */
  const surface = (eta: number): { U: number; V: number } => {
    if (eta < 0) {
      const q = surface(-eta);
      return { U: -q.V, V: -q.U };
    }
    const x = Math.min(eta / h, n);
    const i = Math.min(Math.floor(x), n - 1);
    const f = x - i;
    return { U: line[i].U + f * (line[i + 1].U - line[i].U), V: line[i].V + f * (line[i + 1].V - line[i].V) };
  };
  const end = line[n];
  const slope = (line[n].U - line[n - 1].U) / h;
  const G = (x: number): number => {
    const eta = x + s.chi0;
    return eta <= Math.PI ? surface(eta).U : end.U + slope * (eta - Math.PI);
  };
  const F = (y: number): number => surface(y - s.chi0).V;
  return {
    line,
    surface,
    /** Kruskal U, V of the interior point (η, χ), 0 ≤ χ ≤ χ₀. */
    interior: (eta: number, chi: number): { U: number; V: number } => ({ U: G(eta - chi), V: F(eta + chi) }),
    /** True where U was continued past the surface's own data (the drawing choice above). */
    continued: (eta: number, chi: number): boolean => eta - chi + s.chi0 > Math.PI,
  };
}
