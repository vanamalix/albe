/**
 * Hit a merger time: two equal holes started on a round 1PN orbit at a chosen separation, run with
 * the app's own masses law (1PN EIH plus 2.5PN radiation reaction, the 1PN cap, merger at contact)
 * until they merge, off screen and in slices so the page stays responsive.
 *
 * Peters (1964) at leading order gives T = (5/256) a⁴ / (m₁ m₂ M) for a circular orbit. The run
 * differs because it is not that idealisation: its orbit has 1PN terms, so the same separation has a
 * different energy and frequency; the 1PN term is capped near the end (from about 7.2M), which
 * removes the ISCO, so there is no plunge and the last stretch is a smooth shrink to contact at
 * 2M rather than a fast fall; and it ends at contact rather than at a = 0 (a few M of time).
 */
import { DEFAULT_NBODY, pairOrbit, petersMergerTime, pnCapFired } from '../physics/nbody';
import { circularBinarySpeed, pairOf } from '../physics/presets';
import { World } from './world';

/** Each hole's mass, as in the Binary inspiral scene. */
export const MERGER_HOLE = 2;
/** Separations the slider offers, in code units (total mass M = 4). */
export const MERGER_SEP = { min: 24, max: 64 };
/** Targets to aim for, in units of time. */
export const MERGER_TARGETS = [500, 1000, 2000, 5000, 10000];

export interface MergerResult {
  separation: number;
  /** False when the run gave up (far past Peters' time) before the holes touched. */
  merged: boolean;
  /** When the run merged. */
  time: number;
  /** Peters at leading order for a circular orbit of a = separation. */
  peters: number;
  /** Peters from the 1PN energy of the start, the value the scene card shows. */
  petersPn: number;
  /** Separation over total mass when the 1PN cap first acted, and how long it acted. */
  capFrom: number | null;
  cappedTime: number;
  /** Time from separation 6M (the ISCO's place, total M) to contact. */
  belowSix: number | null;
}

export const petersCircular = (sep: number): number => petersMergerTime(MERGER_HOLE, MERGER_HOLE, sep, 0);

/** Peters' time from separation a down to contact at 2M (not to a = 0), as the run ends there. */
export const petersToContact = (sep: number): number => petersCircular(sep) - petersCircular(2 * 2 * MERGER_HOLE);

/** Separation Peters would choose for a target time: a = (256 T m₁m₂M / 5)^¼. */
export const petersSeparation = (T: number): number => Math.pow((256 * T * MERGER_HOLE * MERGER_HOLE * 2 * MERGER_HOLE) / 5, 0.25);

export function mergerWorld(sep: number): World {
  const w = new World();
  for (const b of pairOf(MERGER_HOLE, MERGER_HOLE, sep, circularBinarySpeed(MERGER_HOLE, MERGER_HOLE, sep))) w.addBody(b.x, b.y, b.vx, b.vy, b.m);
  return w;
}

/** A run that advances in slices of at most `sliceMs` of real time. */
export class MergerRun {
  readonly world: World;
  readonly separation: number;
  readonly petersPn: number;
  result: MergerResult | null = null;
  private capFrom: number | null = null;
  private cappedTime = 0;
  private sixAt: number | null = null;

  constructor(sep: number) {
    this.separation = sep;
    this.world = mergerWorld(sep);
    this.petersPn = pairOrbit(this.world.bodies[0], this.world.bodies[1], true).mergerTime;
  }

  /** Advances until merged or out of time. Returns true when finished. */
  slice(sliceMs = 12): boolean {
    if (this.result) return true;
    const w = this.world;
    const began = performance.now();
    const cfg = { gr: true, gw: true, pn: true };
    while (w.bodies.length > 1 && performance.now() - began < sliceMs) {
      const before = pnCapFired.count;
      const [a, b] = w.bodies;
      const sep = Math.hypot(a.x - b.x, a.y - b.y) / (a.m + b.m);
      const t0 = w.simTime;
      w.step(2, cfg, DEFAULT_NBODY);
      if (this.sixAt === null && sep <= 6) this.sixAt = t0;
      if (pnCapFired.count > before) {
        if (this.capFrom === null) this.capFrom = sep;
        this.cappedTime += w.simTime - t0;
      }
      if (w.simTime > 40 * petersCircular(this.separation) + 1e4) break;
    }
    if (w.bodies.length > 1 && w.simTime <= 40 * petersCircular(this.separation) + 1e4) return false;
    this.result = { separation: this.separation, merged: w.bodies.length < 2, time: w.simTime, peters: petersCircular(this.separation), petersPn: this.petersPn, capFrom: this.capFrom, cappedTime: this.cappedTime, belowSix: this.sixAt === null ? null : w.simTime - this.sixAt };
    return true;
  }
}
