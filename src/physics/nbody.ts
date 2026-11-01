/**
 * Massive-body dynamics: Newtonian N-body gravity integrated with velocity Verlet
 * (kick-drift-kick) on adaptive sub-steps, plus merging and an optional, clearly approximate,
 * gravitational-wave energy-loss term from the Peters (1964) quadrupole formula.
 *
 * Honest labelling: the bodies themselves move on Newtonian trajectories (no post-Newtonian
 * terms). GR enters the massive-body sector only through the optional Peters radiation drag.
 */
import type { Body } from './types';

export interface NBodyOptions {
  /** Plummer softening length (keeps close passes finite before the merge check catches them). */
  softening: number;
  /** Apply the Peters GW energy loss to bound pairs. */
  gw: boolean;
  /** Multiplier on the GW loss rate (1 = Peters' value). */
  gwBoost: number;
}

export const DEFAULT_NBODY: NBodyOptions = { softening: 0.05, gw: false, gwBoost: 1 };

/** Overwrites body.ax/ay with the Newtonian acceleration from all other bodies. */
export function computeAccelerations(bodies: Body[], softening: number): void {
  const n = bodies.length;
  const eps2 = softening * softening;
  for (let i = 0; i < n; i++) {
    bodies[i].ax = 0;
    bodies[i].ay = 0;
  }
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      const r2 = dx * dx + dy * dy + eps2;
      const inv = 1 / (r2 * Math.sqrt(r2));
      bi.ax += bj.m * dx * inv;
      bi.ay += bj.m * dy * inv;
      bj.ax -= bi.m * dx * inv;
      bj.ay -= bi.m * dy * inv;
    }
  }
}

/**
 * Peters (1964) energy loss for a binary on a (quasi-)circular orbit of separation a:
 *   dE/dt = -(32/5) m1² m2² (m1 + m2) / a⁵        (G = c = 1)
 * Applied as a drag force F = (dE/dt) v_rel / |v_rel|² on the relative motion, which removes
 * exactly that power. Only bound pairs radiate. This is a crude, orbit-averaged estimate used
 * instantaneously: it is illustrative, not a waveform model.
 */
export function petersPower(m1: number, m2: number, a: number): number {
  return -(32 / 5) * (m1 * m1 * m2 * m2 * (m1 + m2)) / Math.pow(a, 5);
}

/** Adds the GW drag to body.ax/ay (call after computeAccelerations). */
export function addGwDrag(bodies: Body[], boost: number): void {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bi.x - bj.x;
      const dy = bi.y - bj.y;
      const dvx = bi.vx - bj.vx;
      const dvy = bi.vy - bj.vy;
      const r = Math.hypot(dx, dy);
      const v2 = dvx * dvx + dvy * dvy;
      if (r <= 0 || v2 <= 1e-12) continue;
      const mu = (bi.m * bj.m) / (bi.m + bj.m);
      const eRel = 0.5 * mu * v2 - (bi.m * bj.m) / r;
      if (eRel >= 0) continue; // unbound pairs do not get this circular-orbit formula
      const power = petersPower(bi.m, bj.m, r) * boost; // < 0
      const fx = (power * dvx) / v2;
      const fy = (power * dvy) / v2;
      bi.ax += fx / bi.m;
      bi.ay += fy / bi.m;
      bj.ax -= fx / bj.m;
      bj.ay -= fy / bj.m;
    }
  }
}

/**
 * A stable step: a fraction eta of the shortest pairwise dynamical time sqrt(r³/(m1+m2)),
 * also limited by the pairwise crossing time r/|v_rel|. Returns Infinity for < 2 bodies.
 */
export function stableDt(bodies: Body[], eta: number): number {
  let dt = Infinity;
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bj.x - bi.x;
      const dy = bj.y - bi.y;
      const r = Math.hypot(dx, dy) + 1e-9;
      const tDyn = Math.sqrt((r * r * r) / (bi.m + bj.m));
      const vRel = Math.hypot(bj.vx - bi.vx, bj.vy - bi.vy);
      const tCross = vRel > 0 ? r / vRel : Infinity;
      dt = Math.min(dt, eta * tDyn, eta * 4 * tCross);
    }
  }
  return dt;
}

/** Recomputes accelerations (Newtonian plus optional GW drag). */
export function refreshAccelerations(bodies: Body[], opts: NBodyOptions): void {
  computeAccelerations(bodies, opts.softening);
  if (opts.gw) addGwDrag(bodies, opts.gwBoost);
}

/**
 * One velocity-Verlet (kick-drift-kick) step. Assumes body.ax/ay hold the accelerations at the
 * current positions (call refreshAccelerations once before the first step).
 */
export function verletStep(bodies: Body[], dt: number, opts: NBodyOptions): void {
  const h = 0.5 * dt;
  for (const b of bodies) {
    b.vx += b.ax * h;
    b.vy += b.ay * h;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
  }
  refreshAccelerations(bodies, opts);
  for (const b of bodies) {
    b.vx += b.ax * h;
    b.vy += b.ay * h;
  }
}

export interface MergeEvent {
  x: number;
  y: number;
  m: number;
  survivorId: number;
  absorbedId: number;
}

/**
 * Merges every pair closer than the sum of their Schwarzschild radii 2(m1 + m2).
 * Conserves total mass and linear momentum exactly; the remnant sits at the centre of mass.
 * (Real mergers radiate a few per cent of the mass-energy and can recoil; ignored here.)
 * Mutates the array in place and returns the merge events.
 */
export function mergeBodies(bodies: Body[]): MergeEvent[] {
  const events: MergeEvent[] = [];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 2 * (a.m + b.m)) {
          const m = a.m + b.m;
          const keep = a.m >= b.m ? a : b;
          const lose = keep === a ? b : a;
          const x = (a.m * a.x + b.m * b.x) / m;
          const y = (a.m * a.y + b.m * b.y) / m;
          const vx = (a.m * a.vx + b.m * b.vx) / m;
          const vy = (a.m * a.vy + b.m * b.vy) / m;
          keep.x = x;
          keep.y = y;
          keep.vx = vx;
          keep.vy = vy;
          keep.m = m;
          bodies.splice(bodies.indexOf(lose), 1);
          events.push({ x, y, m, survivorId: keep.id, absorbedId: lose.id });
          merged = true;
          break outer;
        }
      }
    }
  }
  return events;
}

export function totalMomentum(bodies: Body[]): { px: number; py: number } {
  let px = 0;
  let py = 0;
  for (const b of bodies) {
    px += b.m * b.vx;
    py += b.m * b.vy;
  }
  return { px, py };
}

export function totalMass(bodies: Body[]): number {
  return bodies.reduce((s, b) => s + b.m, 0);
}

/** Newtonian kinetic + (softened) potential energy. */
export function totalEnergy(bodies: Body[], softening: number): number {
  let e = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < bodies.length; i++) {
    const bi = bodies[i];
    e += 0.5 * bi.m * (bi.vx * bi.vx + bi.vy * bi.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const bj = bodies[j];
      const r = Math.sqrt((bi.x - bj.x) ** 2 + (bi.y - bj.y) ** 2 + eps2);
      e -= (bi.m * bj.m) / r;
    }
  }
  return e;
}

/**
 * Advances the bodies by `dt` using adaptive sub-steps. Returns the number of sub-steps taken and
 * the time actually simulated (less than dt if the step budget ran out).
 * `onSubstep` runs after each sub-step (used to advance probes in lock-step with the sources).
 */
export function advanceBodies(
  bodies: Body[],
  dt: number,
  opts: NBodyOptions,
  eta: number,
  maxSteps: number,
  onSubstep?: (h: number) => void,
  onMerge?: (e: MergeEvent) => void,
): { steps: number; simulated: number } {
  let t = 0;
  let steps = 0;
  refreshAccelerations(bodies, opts);
  while (t < dt - 1e-12) {
    if (steps >= maxSteps) break;
    let h = Math.min(dt - t, stableDt(bodies, eta));
    if (!Number.isFinite(h)) h = dt - t;
    // Never take a vanishingly small step (a merge resolves the singular case).
    h = Math.min(dt - t, Math.max(h, dt * 1e-4));
    verletStep(bodies, h, opts);
    const events = mergeBodies(bodies);
    if (events.length) {
      refreshAccelerations(bodies, opts);
      if (onMerge) for (const e of events) onMerge(e);
    }
    onSubstep?.(h);
    t += h;
    steps++;
  }
  return { steps, simulated: t };
}
