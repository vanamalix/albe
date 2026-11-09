/**
 * The live simulation: bodies, probes, rays, trails and transient events. Pure TypeScript
 * (no three.js); the scene reads it every frame.
 */
import { DOMAIN } from '../physics/fields';
import { advanceRay, CAPTURE_RATIO, makeRay } from '../physics/light';
import { haloEnclosed } from '../physics/bodies';
import { advanceBodies, type NBodyOptions, type Remnant } from '../physics/nbody';
import type { Preset } from '../physics/presets';
import { circularSpeed, dominantSource, probeDt, properTimeRatio, rk4ProbeStep } from '../physics/probes';
import { MAX_STARS, spawnDisk, Swarm } from '../physics/swarm';
import { isCompact, surfaceRadius, type Body, type Probe, type Ray } from '../physics/types';
import { WaveBuffer } from './waves';

export const MAX_BODIES = 32;
export const MAX_PROBES = 600;
export const MAX_RAYS = 72;
export const BODY_TRAIL = 500;
export const PROBE_TRAIL = 140;
/** World units of drag per unit of velocity (v = drag / VEL_SCALE). */
export const VEL_SCALE = 150;
export const MAX_SPEED = 0.6;
/** Masses and particles are only forgotten this far out: well past the farthest camera view. */
export const ESCAPE_RADIUS = 18_000;
/** A light ray counts as escaped this far beyond the masses and its own start. */
export const RAY_MARGIN = 900;

export class Trail {
  readonly buf: Float32Array;
  start = 0;
  count = 0;
  constructor(readonly cap: number) {
    this.buf = new Float32Array(cap * 2);
  }
  push(x: number, y: number): void {
    const i = (this.start + this.count) % this.cap;
    this.buf[i * 2] = x;
    this.buf[i * 2 + 1] = y;
    if (this.count < this.cap) this.count++;
    else this.start = (this.start + 1) % this.cap;
  }
  /** k-th point from oldest (0) to newest (count-1). */
  at(k: number): [number, number] {
    const i = (this.start + k) % this.cap;
    return [this.buf[i * 2], this.buf[i * 2 + 1]];
  }
  last(): [number, number] | null {
    return this.count ? this.at(this.count - 1) : null;
  }
  clear(): void {
    this.start = 0;
    this.count = 0;
  }
}

export interface Flash {
  x: number;
  y: number;
  size: number;
  age: number;
  kind: 'merge' | 'capture' | 'supernova';
}

/** Everything about a new body beyond its position, velocity and mass. */
export type BodyTraits = Partial<Pick<Body, 'kind' | 'radius' | 'soft' | 'color' | 'typeId' | 'name'>>;

/** Stars in a galaxy placed by hand. */
const PLACED_DISK_STARS = 2500;
/** Pieces a star breaks into when a compact object tears it apart. */
const DEBRIS_PIECES = 500;
/** Most real time one frame may spend on the stars, in milliseconds. */
const SWARM_BUDGET_MS = 12;

export interface StepConfig {
  gr: boolean;
  gw: boolean;
  /** 1PN corrections for the masses. Defaults to the value in the N-body options. */
  pn?: boolean;
}

export class World {
  bodies: Body[] = [];
  probes: Probe[] = [];
  rays: Ray[] = [];
  trails = new Map<number, Trail>();
  flashes: Flash[] = [];
  simTime = 0;
  throttled = false;
  /** Body pinned under the pointer while being moved. */
  held: { id: number; x: number; y: number } | null = null;
  /** History of the gravitational-wave signal. */
  readonly waves = new WaveBuffer();
  /** What the most recent relativistic merger left behind. */
  lastMerger: (Remnant & { mass: number }) | null = null;
  /** Thousands of stars, for galaxies and tidal debris. */
  readonly swarm = new Swarm();
  /** A twin of the system started a hair away, to show chaos. Not felt by anything else. */
  ghost: Body[] = [];
  readonly ghostIds = new Set<number>();
  /** False when the scene needs close approaches without collisions. */
  merge = true;
  /** Friction multiplier for this scene. */
  friction = 1;
  /** In the browser, stars may take only part of each frame, so drawing stays smooth. */
  realtime = false;
  private swarmRestAt = 0;
  private nextId = 1;

  clear(): void {
    this.bodies = [];
    this.probes = [];
    this.rays = [];
    this.trails.clear();
    this.flashes = [];
    this.simTime = 0;
    this.held = null;
    this.waves.reset();
    this.lastMerger = null;
    this.swarm.clear();
    this.ghost = [];
    this.ghostIds.clear();
    this.merge = true;
    this.friction = 1;
  }

  loadPreset(p: Preset): void {
    this.clear();
    this.merge = p.settings.merge ?? true;
    this.friction = p.settings.friction ?? 1;
    for (const b of p.bodies) {
      const { x, y, vx, vy, m, ...traits } = b;
      this.addBody(x, y, vx, vy, m, traits);
    }
    for (const q of p.probes) this.addProbe(q.x, q.y, q.vx, q.vy, q.model, q.label);
    for (const f of p.fans) this.fireFan(f.x, f.y, f.dx, f.dy, f.width, f.count);
    if (p.swarm) {
      this.swarm.selfGravity = p.swarm.selfGravity;
      this.swarm.softening = p.swarm.softening;
      this.swarm.dt = p.swarm.dt;
    }
    for (const d of p.disks ?? []) spawnDisk(this.swarm, this.bodies[d.host], d, this.bodies);
    if (p.settings.ghost) {
      this.ghost = this.bodies.map((b) => ({ ...b, id: this.nextId++ }));
      if (this.ghost.length) this.ghost[0].x += p.settings.ghost;
      for (const b of this.ghost) {
        this.ghostIds.add(b.id);
        const t = new Trail(BODY_TRAIL);
        t.push(b.x, b.y);
        this.trails.set(b.id, t);
      }
    }
  }

  addBody(x: number, y: number, vx: number, vy: number, m: number, traits: BodyTraits = {}): Body | null {
    if (this.bodies.length >= MAX_BODIES) return null;
    const b: Body = { id: this.nextId++, x, y, vx, vy, m, ax: 0, ay: 0, ...traits };
    this.bodies.push(b);
    const t = new Trail(BODY_TRAIL);
    t.push(x, y);
    this.trails.set(b.id, t);
    return b;
  }

  addProbe(x: number, y: number, vx: number, vy: number, model: Probe['model'] = 'follow', label?: string): Probe | null {
    if (this.probes.length >= MAX_PROBES) {
      const old = this.probes.shift();
      if (old) this.trails.delete(old.id);
    }
    if (this.insideHorizon(x, y)) return null; // nothing spawns inside a horizon or a star
    const p: Probe = { id: this.nextId++, x, y, vx, vy, model, lag: 0, tau: 0, rate: 1, label };
    this.probes.push(p);
    const t = new Trail(PROBE_TRAIL);
    t.push(x, y);
    this.trails.set(p.id, t);
    return p;
  }

  /** Adds a galaxy: a halo body and a disk of test stars turning around it. */
  spawnGalaxy(x: number, y: number, vx: number, vy: number): Body | null {
    if (this.swarm.n + PLACED_DISK_STARS > MAX_STARS) return null;
    const b = this.addBody(x, y, vx, vy, 1, { kind: 'galaxy', soft: 28, radius: 210, color: [1, 0.86, 0.6], typeId: 'galaxy', name: 'Galaxy' });
    if (!b) return null;
    if (this.swarm.n === 0) this.swarm.softening = 3;
    // A step this size suits a galaxy; finer steps left over from close debris would waste the frame.
    this.swarm.dt = Math.max(this.swarm.dt, 20);
    spawnDisk(this.swarm, b, { count: PLACED_DISK_STARS, scale: 26, edge: 115, mass: 0, q: 1.3, sense: 1, seed: this.nextId }, this.bodies);
    return b;
  }

  fireRay(x: number, y: number, dx: number, dy: number): void {
    if (this.insideHorizon(x, y)) return;
    this.rays.push(makeRay(this.nextId++, x, y, dx, dy, this.bodies));
    while (this.rays.length > MAX_RAYS) this.rays.shift();
  }

  /** A fan of `count` parallel rays centred on (x, y), spread across `width` perpendicular to (dx, dy). */
  fireFan(x: number, y: number, dx: number, dy: number, width: number, count: number): void {
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    for (let i = 0; i < count; i++) {
      const s = count === 1 ? 0 : (i / (count - 1) - 0.5) * width;
      this.fireRay(x - uy * s, y + ux * s, ux, uy);
    }
  }

  removeBody(id: number): void {
    if (this.bodyById(id)?.kind === 'galaxy') this.swarm.removeHost(id);
    this.bodies = this.bodies.filter((b) => b.id !== id);
    this.trails.delete(id);
    if (this.held?.id === id) this.held = null;
  }

  bodyById(id: number | null): Body | undefined {
    return id == null ? undefined : this.bodies.find((b) => b.id === id);
  }

  nearestBody(x: number, y: number, maxDist: number): Body | null {
    let best: Body | null = null;
    let bd = Infinity;
    for (const b of this.bodies) {
      const d = Math.hypot(x - b.x, y - b.y);
      const reach = Math.max(maxDist, 1.25 * (surfaceRadius(b) || (b.soft ?? 0)));
      if (d < reach && d < bd) {
        bd = d;
        best = b;
      }
    }
    return best;
  }

  /**
   * Velocity for a click without drag: a circular orbit about the dominant mass (CCW), or rest.
   * Probes use the GR circular speed when GR is on (exact for one mass); masses use the
   * two-body Newtonian speed.
   */
  autoVelocity(x: number, y: number, newMass: number, gr: boolean): [number, number] {
    const i = dominantSource(x, y, this.bodies);
    if (i < 0) return [0, 0];
    const s = this.bodies[i];
    const dx = x - s.x;
    const dy = y - s.y;
    const r = Math.hypot(dx, dy);
    if (r < 1e-6) return [s.vx, s.vy];
    // Inside a halo only the mass within r counts; stars have no relativistic orbit here.
    const pull = s.kind === 'galaxy' ? haloEnclosed(s.m, s.soft ?? 1, s.radius ?? 1, r) : s.m;
    const useGr = gr && isCompact(s);
    let v = newMass > 0 ? circularSpeed(pull + newMass, r, false) : circularSpeed(pull, r, useGr);
    if (!Number.isFinite(v)) v = circularSpeed(pull, r, false);
    if (newMass > 0) {
      // Share the relative velocity so the pair's centre of mass keeps the source's velocity:
      // the source recoils by -m/(M+m)·v_rel and the newcomer gets +M/(M+m)·v_rel.
      const rvx = (-dy / r) * v;
      const rvy = (dx / r) * v;
      const q = newMass / (s.m + newMass);
      s.vx -= q * rvx;
      s.vy -= q * rvy;
      return [s.vx + rvx, s.vy + rvy];
    }
    return [s.vx + (-dy / r) * v, s.vy + (dx / r) * v];
  }

  step(dt: number, cfg: StepConfig, opts: NBodyOptions): void {
    if (dt <= 0) return;
    if (this.swarm.n === 0) {
      this.throttled = this.advance(dt, cfg, opts) < dt * 0.999;
    } else {
      // Equal steps no longer than swarm.dt, so everything still moves every frame at low speeds.
      // If a frame runs out of budget the simulation slows rather than losing accuracy.
      const steps = Math.ceil(dt / this.swarm.dt - 1e-9);
      const h = dt / steps;
      const began = performance.now();
      // After an expensive step, sit out for as long as it took: sim time slows and frames stay even.
      let short = this.realtime && began < this.swarmRestAt;
      for (let k = 0; k < steps && !short; k++) {
        const before = performance.now();
        this.swarm.step(h, () => this.bodies, (hb) => this.advance(hb, cfg, opts), ESCAPE_RADIUS);
        const now = performance.now();
        if (this.realtime && now - began > SWARM_BUDGET_MS) {
          short = true;
          this.swarmRestAt = now + (now - before);
        }
      }
      this.throttled = short;
    }
    this.recordTrails();
  }

  /** Advances everything except the stars. Returns the time actually simulated. */
  private advance(dt: number, cfg: StepConfig, opts: NBodyOptions): number {
    const held = this.held;
    const start = this.simTime;
    let elapsed = 0;
    // Scenes with collisions off pass extremely close: softening there would change the orbit.
    const nb = { ...opts, softening: this.merge ? opts.softening : 1e-3, gw: cfg.gw, pn: cfg.pn ?? opts.pn, merge: this.merge, friction: this.friction };
    // Three-body scenes can afford far finer steps, and their close passes need them.
    const eta = this.merge ? 0.01 : 0.0015;
    const budget = this.merge ? 900 : 8000;
    const res = advanceBodies(
      this.bodies,
      dt,
      nb,
      eta,
      budget,
      (h) => {
        if (held) this.pin(held);
        this.advanceProbes(h, cfg.gr);
        elapsed += h;
        this.waves.advance(start + elapsed, this.bodies);
        this.tearStars();
      },
      (e, sense) => {
        this.flashes.push({ x: e.x, y: e.y, size: e.supernova ? 150 : Math.max(12 * e.m, 4 * e.radius), age: 0, kind: e.supernova ? 'supernova' : 'merge' });
        this.trails.delete(e.absorbedId);
        if (this.held?.id === e.absorbedId) this.held = null;
        if (e.remnant) {
          this.lastMerger = { ...e.remnant, mass: e.m };
          this.waves.beginRingdown(start + elapsed, e.m, e.remnant.spin, sense);
        }
      },
    );
    if (held) this.pin(held);
    this.simTime += res.simulated;
    if (this.ghost.length) {
      advanceBodies(this.ghost, res.simulated, nb, eta, budget);
    }
    // Only objects that have left for good are dropped, far beyond anything the camera can show.
    this.bodies = this.bodies.filter((b) => {
      const keep = Math.hypot(b.x, b.y) < ESCAPE_RADIUS;
      if (!keep) this.trails.delete(b.id);
      return keep;
    });
    this.probes = this.probes.filter((p) => {
      const keep = Math.hypot(p.x, p.y) < ESCAPE_RADIUS;
      if (!keep) this.trails.delete(p.id);
      return keep;
    });
    let reach = DOMAIN;
    for (const b of this.bodies) reach = Math.max(reach, Math.abs(b.x), Math.abs(b.y));
    for (const r of this.rays) advanceRay(r, res.simulated, this.bodies, reach + RAY_MARGIN);
    return res.simulated;
  }

  /**
   * A star passing inside the tidal radius r_t = R (M/m)^(1/3) of a compact object comes apart (Rees
   * 1988). If r_t is inside the horizon the star is swallowed whole, as happens for very large holes.
   */
  private tearStars(): void {
    for (let i = this.bodies.length - 1; i >= 0; i--) {
      const star = this.bodies[i];
      if (star.kind !== 'star') continue;
      for (const hole of this.bodies) {
        if (!isCompact(hole) || hole.m <= star.m) continue;
        const R = surfaceRadius(star);
        const tidal = R * Math.cbrt(hole.m / star.m);
        const d = Math.hypot(star.x - hole.x, star.y - hole.y);
        if (d < tidal && tidal > surfaceRadius(hole)) {
          this.shred(star, hole, d);
          break;
        }
      }
    }
  }

  private shred(star: Body, hole: Body, d: number): void {
    const [r, g, b] = star.color ?? [1, 0.9, 0.7];
    if (this.swarm.n === 0) this.swarm.dt = 0.01 * Math.sqrt((d * d * d) / hole.m);
    const R = surfaceRadius(star);
    const spread = 0.05 * Math.sqrt(star.m / R);
    for (let k = 0; k < DEBRIS_PIECES; k++) {
      const q = R * Math.sqrt(Math.random());
      const t = Math.random() * Math.PI * 2;
      this.swarm.add(star.x + q * Math.cos(t), star.y + q * Math.sin(t), star.vx + spread * (Math.random() - 0.5), star.vy + spread * (Math.random() - 0.5), 0, r, g, b);
    }
    this.flashes.push({ x: star.x, y: star.y, size: 8 * R, age: 0, kind: 'merge' });
    this.trails.delete(star.id);
    if (this.held?.id === star.id) this.held = null;
    // In place: the integrator holds a reference to this array.
    this.bodies.splice(this.bodies.indexOf(star), 1);
  }

  private pin(h: { id: number; x: number; y: number }): void {
    const b = this.bodyById(h.id);
    if (!b) return;
    b.x = h.x;
    b.y = h.y;
    b.vx = 0;
    b.vy = 0;
  }

  private advanceProbes(h: number, gr: boolean): void {
    const src = this.bodies;
    const dead: number[] = [];
    for (const p of this.probes) {
      p.lag += h;
      const useGr = gr && p.model === 'follow';
      let guard = 0;
      for (;;) {
        // The step is in the particle's proper time; `lag` counts the distant observer's time.
        const dTau = probeDt(p, src, 0.01);
        if (!Number.isFinite(dTau)) {
          p.x += p.vx * p.lag;
          p.y += p.vy * p.lag;
          p.tau += p.lag;
          p.rate = 1;
          p.lag = 0;
          break;
        }
        const ratio = useGr ? properTimeRatio(p, src) : 1;
        p.rate = 1 / ratio;
        const d = dTau * ratio;
        if (p.lag < d) break;
        const nearest = rk4ProbeStep(p, dTau, src, useGr);
        p.lag -= d;
        p.tau += dTau;
        if (nearest < (useGr ? CAPTURE_RATIO : 1) || this.insideHorizon(p.x, p.y)) {
          dead.push(p.id);
          this.flashes.push({ x: p.x, y: p.y, size: 5, age: 0, kind: 'capture' });
          break;
        }
        if (++guard > 300) {
          p.lag = 0; // budget exhausted: this probe falls slightly behind
          break;
        }
      }
    }
    if (dead.length) {
      const s = new Set(dead);
      this.probes = this.probes.filter((p) => !s.has(p.id));
      for (const id of dead) this.trails.delete(id);
    }
  }

  private insideHorizon(x: number, y: number): boolean {
    for (const b of this.bodies) if (Math.hypot(x - b.x, y - b.y) < surfaceRadius(b)) return true;
    return false;
  }

  private recordTrails(): void {
    const rec = (id: number, x: number, y: number, spacing: number) => {
      const t = this.trails.get(id);
      if (!t) return;
      const l = t.last();
      if (!l || Math.hypot(x - l[0], y - l[1]) >= spacing) t.push(x, y);
    };
    for (const b of this.bodies) rec(b.id, b.x, b.y, 0.8);
    for (const b of this.ghost) rec(b.id, b.x, b.y, 0.8);
    for (const p of this.probes) rec(p.id, p.x, p.y, 1.0);
  }

  /** Real-time ageing of flashes and finished rays. */
  age(realDt: number): void {
    for (const f of this.flashes) f.age += realDt;
    this.flashes = this.flashes.filter((f) => f.age < 1.2);
    for (const r of this.rays) if (r.state !== 'flying') r.age += realDt;
    this.rays = this.rays.filter((r) => r.age < 12);
  }
}

export const world = new World();
