/**
 * Tightest stable orbit: start a test particle at radius r with a chosen speed, give it a fixed
 * inward nudge, and see whether it survives five turns round a single hole.
 *
 * The nudge is what tests stability. A perfectly circular start just inside 6M would coast round
 * (an unstable circular orbit is still an orbit); a small kick shows which way it goes.
 *
 * Exact for one mass: the run uses the app's own test-particle law and RK4 step (probes.ts), which
 * is the Schwarzschild geodesic in proper time. Its energy integral is
 *
 *     ½ ṙ² + W(r) = const,   W(r) = −M/r + L²/(2r²) − s M L²/r³        (s = 1 in our universe)
 *
 * (for s = 1 this is (E² − 1)/2 = ½ṙ² + ½(1 − 2M/r)(1 + L²/r²) − ½). W has a barrier at the
 * smaller root of M r² − L² r + 3 s M L² = 0 and a well at the larger, and the two merge at
 * L² = 12 s M², r = 6 s M: the ISCO. So the exact fate follows from the start alone, and
 * effectiveVerdict() gives it beside the run.
 */
import { CAPTURE_RATIO } from './light';
import { OUR_LAW, probeDt, rk4ProbeStep, type ProbeLaw } from './probes';
import type { Body } from './types';
import { powerLawPotential } from './whatif';

/** The fixed nudge: this much inward radial speed (dr/dτ, in units of c) added at the start. */
export const NUDGE = 0.01;
/** Turns a start must complete to count as surviving. */
export const SURVIVE_TURNS = 5;

export type OrbitFate = 'survives' | 'falls in' | 'flies off';

export interface NudgedRun {
  fate: OrbitFate;
  /** Turns completed before the fate was settled (5 when it survives). */
  turns: number;
  /** Closest and farthest r/M reached. */
  rMin: number;
  rMax: number;
  steps: number;
}

/**
 * Runs a particle from (r, 0) with tangential speed v and the nudge, round a hole of mass m at rest
 * at the origin, with the app's own RK4 proper-time step (η = 0.01, as in the scene). It falls in at
 * the first step inside 2.04M, as the scene's particles do, and flies off past 200 r while unbound.
 * `gr` is the scene's GR switch: on, the particle is gold (inverse square plus s times the
 * relativistic term, n unused); off, it is Newtonian under F ∝ 1/rⁿ.
 */
export function nudgedRun(m: number, rOverM: number, v: number, law: ProbeLaw = OUR_LAW, nudge = NUDGE, gr = true): NudgedRun {
  const src: Body[] = [{ id: 0, x: 0, y: 0, vx: 0, vy: 0, m, ax: 0, ay: 0 }];
  const r0 = rOverM * m;
  const p = { x: r0, y: 0, vx: -nudge, vy: v };
  let sweep = 0;
  let prev = 0;
  let rMin = rOverM;
  let rMax = rOverM;
  let steps = 0;
  while (steps < 400_000) {
    const ratio = rk4ProbeStep(p, probeDt(p, src, 0.01), src, gr, law);
    steps++;
    const a = Math.atan2(p.y, p.x);
    let d = a - prev;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    sweep += d;
    prev = a;
    const r = Math.hypot(p.x, p.y) / m;
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    const turns = Math.abs(sweep) / (2 * Math.PI);
    if (ratio < CAPTURE_RATIO) return { fate: 'falls in', turns, rMin, rMax, steps };
    if (turns >= SURVIVE_TURNS) return { fate: 'survives', turns: SURVIVE_TURNS, rMin, rMax, steps };
    if (r > 200 * rOverM) return { fate: 'flies off', turns, rMin, rMax, steps };
  }
  return { fate: 'survives', turns: Math.abs(sweep) / (2 * Math.PI), rMin, rMax, steps };
}

/** The effective potential W(r) of the header, per unit mass. */
export const effectivePotential = (m: number, L2: number, r: number, s = 1): number => -m / r + L2 / (2 * r * r) - (s * m * L2) / (r * r * r);

/**
 * The exact fate of a start at r with tangential speed v and radial speed vr (dx/dτ), from W alone:
 * above the barrier (or inside it) it falls in, below it it stays bound if its energy is negative,
 * and otherwise it leaves. "Falls in" here means reaches r → 0, so any drawn horizon.
 *
 * With s = 0 (GR off) the particle is Newtonian under F ∝ 1/rⁿ (probes.ts ProbeLaw): for n < 3 the
 * centrifugal term wins at small r, so nothing falls in, and for n ≤ 1 the potential grows without
 * bound, so nothing leaves either.
 */
export function effectiveVerdict(m: number, rOverM: number, v: number, vr = -NUDGE, s = 1, n = 2): OrbitFate {
  const r = rOverM * m;
  const L2 = (r * v) ** 2;
  if (s <= 0) {
    if (n <= 1) return 'survives';
    const U = n === 2 ? -m / r : powerLawPotential(m, n, r);
    return 0.5 * vr * vr + L2 / (2 * r * r) + U < 0 ? 'survives' : 'flies off';
  }
  const energy = 0.5 * vr * vr + effectivePotential(m, L2, r, s);
  const disc = L2 * L2 - 12 * s * m * m * L2;
  if (disc <= 0) return 'falls in'; // no barrier at all
  const rBarrier = (L2 - Math.sqrt(disc)) / (2 * m);
  if (r <= rBarrier) return vr > 0 && energy >= 0 && energy >= effectivePotential(m, L2, rBarrier, s) ? 'flies off' : 'falls in';
  if (energy >= effectivePotential(m, L2, rBarrier, s)) return vr > 0 && energy >= 0 ? 'flies off' : 'falls in';
  return energy < 0 ? 'survives' : 'flies off';
}

/** Speed of a circular orbit at r = rOverM·M under the law with term s: v² = M/(r − 3sM) (dx/dτ). */
export const circularV = (rOverM: number, s = 1): number => Math.sqrt(1 / (rOverM - 3 * s));

/**
 * The exact edge: the smallest r/M from which a circular start plus the inward nudge stays bound,
 * found by bisection on effectiveVerdict. It lies a little outside 6sM because the nudge has to
 * fit under a barrier that vanishes at the ISCO.
 */
export function nudgedEdge(s = 1, nudge = NUDGE): number {
  if (s <= 0) return 0;
  let lo = 3 * s * 1.0001;
  let hi = 6 * s * 3;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (effectiveVerdict(1, mid, circularV(mid, s), -nudge, s) === 'survives') hi = mid;
    else lo = mid;
  }
  return hi;
}
