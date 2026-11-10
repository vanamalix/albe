/**
 * Friedmann-Lemaître-Robertson-Walker universes: exactly homogeneous and isotropic.
 *
 *   H²(a) = H₀² E²(a),  E² = Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_k a⁻² + Ω_Λ,  Ω_k = 1 − Ω_r − Ω_m − Ω_Λ,
 *   ä/a = −H₀² (Ω_r a⁻⁴ + ½ Ω_m a⁻³ − Ω_Λ).
 * Units inside: time in 1/H₀, distance in c/H₀, a = 1 today. Radial light obeys dχ = c dt/a, so in
 * conformal time η = ∫ c dt/a light moves at 45° on the comoving grid for any curvature, and on a
 * flat comoving grid every ray is a straight line.
 *
 * Distances (Davis & Lineweaver 2004): comoving χ, proper D = a χ, recession velocity v = Ḋ = H D
 * for a galaxy at fixed χ. v > c is allowed: it is not motion through space. Horizons, in comoving
 * distance at time t: particle horizon η(t) (the farthest anything seen at t can be now), event
 * horizon η_end − η(t) (the farthest a signal sent at t can ever reach), Hubble sphere c/(aH).
 *
 * The past comes from quadrature in a (substituting a = x², which removes the a → 0 behaviour of
 * matter and radiation), the future from RK4 on ä, which also follows a turnaround and crunch.
 */

export interface Cosmos {
  /** Hubble constant today, km/s/Mpc. */
  H0: number;
  om: number;
  ol: number;
  or: number;
}

/** 1/H₀ in Gyr for H₀ in km/s/Mpc (and c/H₀ in Gly: c = 1 Gly per Gyr). */
export const hubbleTimeGyr = (H0: number): number => 977.792221 / H0;

export const omegaK = (p: Cosmos): number => 1 - p.om - p.ol - p.or;

export const E2 = (a: number, p: Cosmos): number => p.or / a ** 4 + p.om / a ** 3 + omegaK(p) / (a * a) + p.ol;

/** ä in units of H₀² (a times the acceleration equation). */
const accel = (a: number, p: Cosmos): number => -a * (p.or / a ** 4 + (0.5 * p.om) / a ** 3 - p.ol);

/**
 * Radiation density today from the CMB temperature (Fixsen 2009: 2.7255 K) with three neutrino
 * species treated as massless (N_eff = 3.046): Ω_r = ρ_r / ρ_crit.
 */
export function omegaRadiation(H0: number, T = 2.7255, nEff = 3.046): number {
  const aRad = 7.565733e-16; // J m⁻³ K⁻⁴
  const c = 299792458;
  const G = 6.6743e-11;
  const H = (H0 * 1000) / 3.0856775814913673e22; // s⁻¹
  const rhoGamma = (aRad * T ** 4) / (c * c); // kg m⁻³
  const rhoCrit = (3 * H * H) / (8 * Math.PI * G);
  return (rhoGamma / rhoCrit) * (1 + (7 / 8) * Math.pow(4 / 11, 4 / 3) * nEff);
}

/** Planck 2018 base ΛCDM (TT,TE,EE+lowE+lensing): H₀ = 67.4, Ω_m = 0.315, made flat with Ω_Λ. */
export function planck2018(): Cosmos {
  const H0 = 67.4;
  const or = omegaRadiation(H0);
  return { H0, om: 0.315, or, ol: 1 - 0.315 - or };
}

/** True when E² > 0 on (0, 1]: the universe expanded from a = 0 (a big bang) to today. */
export function hasBigBang(p: Cosmos): boolean {
  for (let k = 0; k <= 3000; k++) {
    const a = Math.pow(10, -8 + (8 * k) / 3000);
    if (E2(a, p) <= 0) return false;
  }
  return true;
}

/** Composite Simpson on [x0, x1] of g(x), n even. */
function simpson(g: (x: number) => number, x0: number, x1: number, n = 2000): number {
  const h = (x1 - x0) / n;
  let s = g(x0) + g(x1);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * g(x0 + k * h);
  return (s * h) / 3;
}

/** a⁴E² at a = x², the quantity under the root after substituting a = x². */
const sOf = (p: Cosmos, x: number): number => p.or + p.om * x * x + omegaK(p) * x ** 4 + p.ol * x ** 8;

/** t(a) = ∫₀^a da′/(a′E), in 1/H₀. Infinite when nothing but Λ (and curvature ≤ 0) is present. */
export function ageAt(p: Cosmos, a: number): number {
  if (p.om <= 0 && p.or <= 0 && omegaK(p) <= 0) return Infinity;
  // a = x²: da/(aE) = 2x³ dx / √S, S = Ω_r + Ω_m x² + Ω_k x⁴ + Ω_Λ x⁸, regular at x = 0.
  return simpson((x) => (2 * x ** 3) / Math.sqrt(Math.max(1e-300, sOf(p, x))), 1e-12, Math.sqrt(a));
}

/** Conformal time (comoving distance light covers) from a = 0 to a, in c/H₀. */
export function conformalAt(p: Cosmos, a: number): number {
  if (p.om <= 0 && p.or <= 0) return Infinity;
  // a = x²: da/(a²E) = 2x dx / √S, finite at x = 0 when matter or radiation is present.
  return simpson((x) => (2 * x) / Math.sqrt(Math.max(1e-300, sOf(p, x))), 1e-12, Math.sqrt(a));
}

/** Comoving distance to redshift z, in c/H₀: ∫ da/(a²E) from 1/(1 + z) to 1. */
export function comovingDistance(p: Cosmos, z: number): number {
  const ae = 1 / (1 + z);
  // Direct in a, which is smooth away from 0.
  return simpson((a) => 1 / (a * a * Math.sqrt(E2(a, p))), ae, 1, 2000);
}

export interface History {
  /** Cosmic time in 1/H₀ (today t0), scale factor, conformal time in c/H₀, and ȧ in H₀. */
  t: number[];
  a: number[];
  eta: number[];
  adot: number[];
  t0: number;
  eta0: number;
  /** Conformal time at the end (crunch or t → ∞); Infinity when there is no event horizon. */
  etaEnd: number;
  fate: 'forever' | 'crunch';
  /** True when the past has no finite age within the table (de Sitter-like): t starts at aMin. */
  infinitePast: boolean;
}

/**
 * The scale factor from (near) the big bang to tFuture past today, with conformal time. Past points
 * are spaced in a, future points come from RK4 steps of at most dtMax.
 */
export function history(p: Cosmos, tFuture = 3, nPast = 240): History {
  const t: number[] = [];
  const a: number[] = [];
  const eta: number[] = [];
  const adot: number[] = [];
  const age = ageAt(p, 1);
  const infinitePast = !Number.isFinite(age);
  const aMin = 1e-4;
  // Past: a from aMin to 1, quadrature each point from 0 (or, with an infinite past, relative to today).
  const etaNow = conformalAt(p, 1);
  for (let k = 0; k <= nPast; k++) {
    const ak = aMin * Math.pow(1 / aMin, k / nPast);
    // With no finite age, time and conformal time are counted back from today, in u = ln a.
    const tk = infinitePast ? -simpson((u) => 1 / Math.sqrt(E2(Math.exp(u), p)), Math.log(ak), 0, 400) : ageAt(p, ak);
    const ek = Number.isFinite(etaNow) ? conformalAt(p, ak) : -simpson((u) => 1 / (Math.exp(u) * Math.sqrt(E2(Math.exp(u), p))), Math.log(ak), 0, 400);
    t.push(tk);
    a.push(ak);
    eta.push(ek);
    adot.push(ak * Math.sqrt(Math.max(0, E2(ak, p))));
  }
  const t0 = t[t.length - 1];
  const eta0 = eta[eta.length - 1];
  // Future: RK4 on (a, ȧ, η) in t.
  let A = 1;
  let V = 1;
  let H = eta0;
  let T = t0;
  let fate: History['fate'] = 'forever';
  const f = (x: number, v: number) => ({ da: v, dv: accel(x, p), de: 1 / x });
  const tEnd = t0 + tFuture;
  let tailEta = H;
  while (T < tEnd + 200) {
    const dt = Math.min(0.01, 0.01 * A / Math.max(1e-9, Math.abs(V)));
    const k1 = f(A, V);
    const k2 = f(A + (dt / 2) * k1.da, V + (dt / 2) * k1.dv);
    const k3 = f(A + (dt / 2) * k2.da, V + (dt / 2) * k2.dv);
    const k4 = f(A + dt * k3.da, V + dt * k3.dv);
    A += (dt / 6) * (k1.da + 2 * k2.da + 2 * k3.da + k4.da);
    V += (dt / 6) * (k1.dv + 2 * k2.dv + 2 * k3.dv + k4.dv);
    H += (dt / 6) * (k1.de + 2 * k2.de + 2 * k3.de + k4.de);
    T += dt;
    if (T <= tEnd && (t.length === 0 || T - t[t.length - 1] > 0.004)) {
      t.push(T);
      a.push(A);
      eta.push(H);
      adot.push(V);
    }
    if (A < aMin) {
      fate = 'crunch';
      // The last stretch to a = 0 mirrors the first (the Friedmann equation depends on a alone).
      tailEta = H + conformalAt(p, A);
      break;
    }
    if (A > 1e3) {
      tailEta = p.ol > 0 && V > 0 ? H + 1 / (A * Math.sqrt(p.ol)) : Infinity;
      break;
    }
    tailEta = Infinity;
  }
  // Ran out of time without a crunch or a Λ-driven run-away: no event horizon (still decelerating).
  return { t, a, eta, adot, t0, eta0, etaEnd: tailEta, fate, infinitePast };
}

/** Linear interpolation of a History field at time t. */
export function at(h: History, t: number, field: 'a' | 'eta' | 'adot'): number {
  const ts = h.t;
  if (t <= ts[0]) return h[field][0];
  if (t >= ts[ts.length - 1]) return h[field][ts.length - 1];
  let lo = 0;
  let hi = ts.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (ts[m] <= t) lo = m;
    else hi = m;
  }
  const s = (t - ts[lo]) / (ts[hi] - ts[lo]);
  return h[field][lo] + s * (h[field][hi] - h[field][lo]);
}

export interface Recession {
  z: number;
  /** Comoving (= proper today) distance, c/H₀. */
  chi: number;
  /** Recession velocity today and at emission, in units of c. */
  vNow: number;
  vEmit: number;
  /** Proper distance at emission, and the largest proper distance the photon reached from us. */
  dEmit: number;
  dPhotonMax: number;
  /** Time of emission (1/H₀). */
  tEmit: number;
}

/**
 * A galaxy seen today at redshift z: its distances and recession speeds, and the photon's proper
 * distance from us, D_γ(t) = a(t)(χ − (η(t) − η_e)), whose maximum lies on the Hubble sphere.
 */
export function recession(p: Cosmos, h: History, z: number): Recession {
  const ae = 1 / (1 + z);
  const chi = comovingDistance(p, z);
  const etaE = h.eta0 - chi;
  const tEmit = Number.isFinite(h.t[0]) ? ageAt(p, ae) : NaN;
  let dMax = 0;
  for (let k = 0; k < h.t.length; k++) {
    if (h.t[k] > h.t0 || h.eta[k] < etaE) continue;
    dMax = Math.max(dMax, h.a[k] * (chi - (h.eta[k] - etaE)));
  }
  return { z, chi, vNow: chi, vEmit: ae * Math.sqrt(E2(ae, p)) * chi, dEmit: ae * chi, dPhotonMax: Math.max(dMax, ae * chi), tEmit };
}

/** The redshift beyond which galaxies recede faster than light today: χ(z) = c/H₀. */
export function superluminalRedshift(p: Cosmos): number {
  let lo = 0;
  let hi = 50;
  if (comovingDistance(p, hi) < 1) return Infinity;
  for (let k = 0; k < 60; k++) {
    const m = (lo + hi) / 2;
    if (comovingDistance(p, m) < 1) lo = m;
    else hi = m;
  }
  return (lo + hi) / 2;
}
