/**
 * The live simulation: bodies, probes, rays, trails and transient events. Pure TypeScript
 * (no three.js); the scene reads it every frame.
 */
import { DOMAIN } from '../physics/fields';
import { advanceRay, makeRay } from '../physics/light';
import { advanceBodies, type NBodyOptions } from '../physics/nbody';
import type { Preset } from '../physics/presets';
import { circularSpeed, dominantSource, probeDt, rk4ProbeStep } from '../physics/probes';
import type { Body, Probe, Ray } from '../physics/types';

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
  kind: 'merge' | 'capture';
}

export interface StepConfig {
  gr: boolean;
  gw: boolean;
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
  private nextId = 1;

  clear(): void {
    this.bodies = [];
    this.probes = [];
    this.rays = [];
    this.trails.clear();
    this.flashes = [];
    this.simTime = 0;
    this.held = null;
  }

  loadPreset(p: Preset): void {
    this.clear();
    for (const b of p.bodies) this.addBody(b.x, b.y, b.vx, b.vy, b.m);
    for (const q of p.probes) this.addProbe(q.x, q.y, q.vx, q.vy, q.model);
    for (const f of p.fans) this.fireFan(f.x, f.y, f.dx, f.dy, f.width, f.count);
  }

  addBody(x: number, y: number, vx: number, vy: number, m: number): Body | null {
    if (this.bodies.length >= MAX_BODIES) return null;
    const b: Body = { id: this.nextId++, x, y, vx, vy, m, ax: 0, ay: 0 };
    this.bodies.push(b);
    const t = new Trail(BODY_TRAIL);
    t.push(x, y);
    this.trails.set(b.id, t);
    return b;
  }

  addProbe(x: number, y: number, vx: number, vy: number, model: Probe['model'] = 'follow'): Probe | null {
    if (this.probes.length >= MAX_PROBES) {
      const old = this.probes.shift();
      if (old) this.trails.delete(old.id);
    }
    // Do not spawn inside a horizon.
    for (const b of this.bodies) if (Math.hypot(x - b.x, y - b.y) < 2 * b.m) return null;
    const p: Probe = { id: this.nextId++, x, y, vx, vy, model, lag: 0 };
    this.probes.push(p);
    const t = new Trail(PROBE_TRAIL);
    t.push(x, y);
    this.trails.set(p.id, t);
    return p;
  }

  fireRay(x: number, y: number, dx: number, dy: number): void {
    for (const b of this.bodies) if (Math.hypot(x - b.x, y - b.y) < 2 * b.m) return;
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
      const reach = Math.max(maxDist, 2.5 * b.m);
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
    let v = newMass > 0 ? circularSpeed(s.m + newMass, r, false) : circularSpeed(s.m, r, gr);
    if (!Number.isFinite(v)) v = circularSpeed(s.m, r, false);
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
    const held = this.held;
    const res = advanceBodies(
      this.bodies,
      dt,
      { ...opts, gw: cfg.gw },
      0.01,
      900,
      (h) => {
        if (held) this.pin(held);
        this.advanceProbes(h, cfg.gr);
      },
      (e) => {
        this.flashes.push({ x: e.x, y: e.y, size: 12 * e.m, age: 0, kind: 'merge' });
        this.trails.delete(e.absorbedId);
        if (this.held?.id === e.absorbedId) this.held = null;
      },
    );
    if (held) this.pin(held);
    this.throttled = res.simulated < dt * 0.999;
    this.simTime += res.simulated;
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
    this.recordTrails();
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
        const d = probeDt(p, src, 0.01);
        if (!Number.isFinite(d)) {
          p.x += p.vx * p.lag;
          p.y += p.vy * p.lag;
          p.lag = 0;
          break;
        }
        if (p.lag < d) break;
        const ratio = rk4ProbeStep(p, d, src, useGr);
        p.lag -= d;
        if (ratio < 1 || this.insideHorizon(p.x, p.y)) {
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
    for (const b of this.bodies) if (Math.hypot(x - b.x, y - b.y) < 2 * b.m) return true;
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
