/**
 * Wind the light: how many times a ray goes round a Schwarzschild hole before it escapes or falls
 * in, as a function of how close its impact parameter b is to the critical b_c = 3√3 M.
 *
 * Near b_c the ray skims the unstable photon orbit at r = 3M. With u = 1/r and t = u − 1/(3M), the
 * orbit equation (du/dφ)² = 1/b² − u² + 2Mu³ becomes exactly
 *
 *     (dt/dφ)² = ε + t² + 2M t³,      ε = 1/b² − 1/(27 M²),
 *
 * so a small deviation grows as e^φ: every extra turn (Δφ = 2π) needs |b − b_c| about e^{2π} ≈ 535
 * times smaller, on either side. On the escape side the total sweep is π + α̂(b), with α̂ the exact
 * elliptic-integral deflection (lens.ts); in the strong-deflection limit α̂ → −ln(b/b_c − 1) + b̄
 * (Bozza 2002). On the capture side the sweep to a radius r_e is the quadrature below.
 *
 * The count itself comes from the app's own null-geodesic integrator (light.ts rayStep, RK4), run
 * twice, at step sizes 2η·r and η·r. RK4 is fourth order, so the finer run's error is about a
 * fifteenth of their difference; the whole difference is used as the estimate, a deliberately
 * cautious bound, and the count is withheld once it passes WIND_TOLERANCE.
 */
import { B_CRIT, schwarzschildDeflection, STRONG_LIMIT_BBAR } from './lens';
import { CAPTURE_RATIO, makeRay, rayStep } from './light';

/** Largest estimated integrator error, in turns, at which a count is still shown. */
export const WIND_TOLERANCE = 0.01;
/** The fine step: η = 0.004 of the distance to the hole (the scene's own rays use 0.05). */
export const WIND_ETA = 0.004;
/** Rays start and finish this many M from the hole; the straight-line tails beyond are added exactly. */
const START_M = 1e6;
/** e^{2π}: the factor in |b − b_c| that buys one more turn. */
export const TURN_FACTOR = Math.exp(2 * Math.PI);

export type WindFate = 'escapes' | 'falls in';

export interface WindRun {
  fate: WindFate;
  /** Angle swept round the hole, radians. Escape: from far in to far out; capture: to r = 2.04M. */
  sweep: number;
  steps: number;
}

const signedAngle = (ax: number, ay: number, bx: number, by: number) => Math.atan2(ax * by - ay * bx, ax * bx + ay * by);

/**
 * Integrates one ray of impact parameter b past a hole of mass m with the app's RK4 null-geodesic
 * step, accumulating the polar angle. The straight tails before the start and after the finish
 * (at 10⁶ M) are added from the asymptote, which leaves an error of order M/10⁶.
 */
export function windRay(m: number, b: number, eta = WIND_ETA): WindRun {
  const src = [{ x: 0, y: 0, m }];
  const X = START_M * m;
  const r0 = makeRay(0, -X, b, 1, 0, src);
  const ray = { x: r0.x, y: r0.y, vx: r0.vx, vy: r0.vy };
  // The straight line in from infinity has already swept the angle between −v and the position.
  let sweep = signedAngle(-ray.vx, -ray.vy, ray.x, ray.y);
  let prev = Math.atan2(ray.y, ray.x);
  let steps = 0;
  const capture = 2 * m * CAPTURE_RATIO;
  for (;;) {
    const r = Math.hypot(ray.x, ray.y);
    rayStep(ray, (eta * r) / Math.hypot(ray.vx, ray.vy), src);
    steps++;
    const a = Math.atan2(ray.y, ray.x);
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    const rn = Math.hypot(ray.x, ray.y);
    if (rn < capture) {
      // Stop at r = 2.04M itself, not wherever the last step happened to land inside it.
      const f = (r - capture) / (r - rn);
      return { fate: 'falls in', sweep: Math.abs(sweep + f * d), steps };
    }
    sweep += d;
    prev = a;
    if (rn > X && ray.x * ray.vx + ray.y * ray.vy > 0) {
      // From here to infinity a straight line sweeps the angle between the position and v.
      sweep += signedAngle(ray.x, ray.y, ray.vx, ray.vy);
      return { fate: 'escapes', sweep: Math.abs(sweep), steps };
    }
    if (steps > 2_000_000) return { fate: 'falls in', sweep: NaN, steps };
  }
}

/**
 * Exact sweep for a captured ray (b < b_c), from infinity to radius rEnd: ∫ dt/√(ε + t² + 2Mt³)
 * over t from −1/(3M) to 1/rEnd − 1/(3M). With t = √ε sinh s the integrand is smooth however small
 * ε is, so composite Simpson on s converges fast.
 */
export function captureSweep(m: number, b: number, rEnd = 2 * m): number {
  const up = 1 / (3 * m);
  const eps = 1 / (b * b) - 1 / (27 * m * m);
  if (!(eps > 0)) return NaN;
  const se = Math.sqrt(eps);
  const s0 = Math.asinh(-up / se);
  const s1 = Math.asinh((1 / rEnd - up) / se);
  const f = (s: number) => {
    const sh = Math.sinh(s);
    const ch = Math.cosh(s);
    return ch / Math.sqrt(ch * ch + 2 * m * se * sh * sh * sh);
  };
  const n = 4000;
  const h = (s1 - s0) / n;
  let sum = f(s0) + f(s1);
  for (let i = 1; i < n; i++) sum += f(s0 + i * h) * (i % 2 ? 4 : 2);
  return (sum * h) / 3;
}

/** Exact sweep: π + α̂(b) on escape, the quadrature to rEnd on capture. */
export function exactSweep(m: number, b: number, rEnd = 2 * m * CAPTURE_RATIO): { fate: WindFate; sweep: number } {
  if (b > B_CRIT * m) return { fate: 'escapes', sweep: Math.PI + schwarzschildDeflection(b, m) };
  return { fate: 'falls in', sweep: captureSweep(m, b, rEnd) };
}

/** Strong-deflection limit of the escape sweep: π − ln(b/b_c − 1) + b̄ (Bozza 2002, b̄ = −0.4002). */
export const strongLimitSweep = (delta: number): number => Math.PI - Math.log(delta) + STRONG_LIMIT_BBAR;

export interface WindReading {
  /** b / b_c − 1 (negative: inside, captured). */
  delta: number;
  b: number;
  fate: WindFate;
  /** The integrator's count in turns (sweep / 2π), or null when its error passes the tolerance. */
  turns: number | null;
  /** Estimated error of the integrator's count, turns. */
  error: number;
  /** Exact turns (to 2.04M on capture, where albe removes a ray, and to 2M for comparison). */
  exact: number;
  exactToHorizon: number | null;
  /** Turns gained since an aim e^{2π} times further from b_c (exact): the sensitivity law says 1. */
  gainedPerFactor: number;
  /** Strong-deflection estimate (escape only). */
  strong: number | null;
}

/**
 * Everything the Wind the light card shows for b = b_c (1 + delta). Exact values are good to the
 * last digit shown down to |delta| ≈ 10⁻¹³; below that b itself is no longer representable well
 * enough in double precision.
 */
export function windReading(m: number, delta: number): WindReading {
  const b = B_CRIT * m * (1 + delta);
  const coarse = windRay(m, b, WIND_ETA * 2);
  const fine = windRay(m, b, WIND_ETA);
  const turn = 2 * Math.PI;
  // The whole difference, not a fifteenth of it: near b_c the runs leave the asymptotic regime
  // where Richardson's factor holds, and a bound that is too generous is the safer error.
  const error = coarse.fate === fine.fate ? Math.abs(fine.sweep - coarse.sweep) / turn : Infinity;
  const ex = exactSweep(m, b);
  // Only meaningful while the wider aim is still on the same side and b stays positive.
  const widerDelta = delta * TURN_FACTOR;
  const wider = widerDelta > -1 ? exactSweep(m, B_CRIT * m * (1 + widerDelta)) : { fate: 'escapes' as WindFate, sweep: NaN };
  return {
    delta,
    b,
    fate: ex.fate,
    turns: error <= WIND_TOLERANCE && fine.fate === ex.fate ? fine.sweep / turn : null,
    error,
    exact: ex.sweep / turn,
    exactToHorizon: ex.fate === 'falls in' ? captureSweep(m, b, 2 * m) / turn : null,
    gainedPerFactor: wider.fate === ex.fate ? (ex.sweep - wider.sweep) / turn : NaN,
    strong: delta > 0 ? strongLimitSweep(delta) / turn : null,
  };
}
