/**
 * Thousands of stars at once, for galaxy scenes. They move by leapfrog in the field of the massive
 * bodies, and optionally under their own gravity through a Barnes-Hut tree (Barnes & Hut 1986).
 *
 * A galaxy body supplies a pseudo-isothermal dark halo. With self-gravity off the stars are test
 * particles, the restricted method Toomre & Toomre (1972) used to explain tidal tails. With it on,
 * a disk set up near Toomre Q ≈ 1.3 grows spiral arms from its own graininess.
 */
import { haloEnclosed } from './bodies';
import { surfaceRadius, type Body } from './types';

export const MAX_STARS = 14_000;

/** Barnes-Hut opening angle: larger is faster and rougher. */
const THETA = 0.75;
const MAX_DEPTH = 40;

/** A quadtree stored in flat arrays. Rebuilt every force evaluation; nothing is allocated per step. */
export class QuadTree {
  private cap = 0;
  private count = 0;
  private cx = new Float64Array(0);
  private cy = new Float64Array(0);
  private half = new Float64Array(0);
  private mass = new Float64Array(0);
  private comX = new Float64Array(0);
  private comY = new Float64Array(0);
  /** First of four consecutive children, or -1 for a leaf. */
  private child = new Int32Array(0);
  /** The star held by a leaf, or -1 when empty. */
  private point = new Int32Array(0);
  private stack = new Int32Array(1024);

  private ensure(n: number): void {
    if (n <= this.cap) return;
    const cap = Math.max(n, this.cap * 2, 1024);
    const f = (old: Float64Array) => {
      const a = new Float64Array(cap);
      a.set(old);
      return a;
    };
    const i = (old: Int32Array) => {
      const a = new Int32Array(cap);
      a.set(old);
      return a;
    };
    this.cx = f(this.cx);
    this.cy = f(this.cy);
    this.half = f(this.half);
    this.mass = f(this.mass);
    this.comX = f(this.comX);
    this.comY = f(this.comY);
    this.child = i(this.child);
    this.point = i(this.point);
    this.cap = cap;
  }

  private addNode(cx: number, cy: number, half: number): number {
    const k = this.count++;
    this.cx[k] = cx;
    this.cy[k] = cy;
    this.half[k] = half;
    this.child[k] = -1;
    this.point[k] = -1;
    this.mass[k] = 0;
    return k;
  }

  private split(k: number): void {
    this.ensure(this.count + 4);
    const h = this.half[k] / 2;
    const c = this.count;
    const x = this.cx[k];
    const y = this.cy[k];
    this.addNode(x - h, y - h, h);
    this.addNode(x + h, y - h, h);
    this.addNode(x - h, y + h, h);
    this.addNode(x + h, y + h, h);
    this.child[k] = c;
  }

  private quadrant(k: number, x: number, y: number): number {
    return this.child[k] + (x >= this.cx[k] ? 1 : 0) + (y >= this.cy[k] ? 2 : 0);
  }

  build(x: Float64Array, y: Float64Array, m: Float64Array, n: number): void {
    this.count = 0;
    this.ensure(4 * n + 16);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (x[i] < minX) minX = x[i];
      if (x[i] > maxX) maxX = x[i];
      if (y[i] < minY) minY = y[i];
      if (y[i] > maxY) maxY = y[i];
    }
    const half = Math.max(maxX - minX, maxY - minY, 1e-6) / 2 + 1e-6;
    this.addNode((minX + maxX) / 2, (minY + maxY) / 2, half);
    for (let i = 0; i < n; i++) this.insert(i, x, y, m);
    // Children always have larger indices than their parent, so one backward pass suffices.
    for (let k = this.count - 1; k >= 0; k--) {
      const c = this.child[k];
      if (c < 0) {
        const p = this.point[k];
        if (p >= 0) {
          // A leaf that stopped splitting at MAX_DEPTH already holds its running totals.
          if (this.mass[k] === 0) {
            this.mass[k] = m[p];
            this.comX[k] = x[p];
            this.comY[k] = y[p];
          } else {
            this.mass[k] += m[p];
            this.comX[k] = (this.comX[k] * (this.mass[k] - m[p]) + x[p] * m[p]) / this.mass[k];
            this.comY[k] = (this.comY[k] * (this.mass[k] - m[p]) + y[p] * m[p]) / this.mass[k];
          }
        }
        continue;
      }
      let total = 0;
      let sx = 0;
      let sy = 0;
      for (let q = 0; q < 4; q++) {
        const mq = this.mass[c + q];
        total += mq;
        sx += this.comX[c + q] * mq;
        sy += this.comY[c + q] * mq;
      }
      this.mass[k] = total;
      this.comX[k] = total > 0 ? sx / total : this.cx[k];
      this.comY[k] = total > 0 ? sy / total : this.cy[k];
    }
  }

  private insert(i: number, x: Float64Array, y: Float64Array, m: Float64Array): void {
    let k = 0;
    let depth = 0;
    for (;;) {
      if (this.child[k] >= 0) {
        k = this.quadrant(k, x[i], y[i]);
        depth++;
        continue;
      }
      const held = this.point[k];
      if (held < 0) {
        this.point[k] = i;
        return;
      }
      if (depth >= MAX_DEPTH) {
        // Effectively coincident stars: fold the held one into this leaf's running totals.
        const total = this.mass[k] + m[held];
        this.comX[k] = total > 0 ? (this.comX[k] * this.mass[k] + x[held] * m[held]) / total : x[held];
        this.comY[k] = total > 0 ? (this.comY[k] * this.mass[k] + y[held] * m[held]) / total : y[held];
        this.mass[k] = total;
        this.point[k] = i;
        return;
      }
      this.split(k);
      this.point[k] = -1;
      const q = this.quadrant(k, x[held], y[held]);
      this.point[q] = held;
    }
  }

  /** Softened acceleration at (px, py), skipping star `self`. Writes to `out`. */
  force(px: number, py: number, self: number, eps2: number, out: { ax: number; ay: number }): void {
    let ax = 0;
    let ay = 0;
    let top = 0;
    this.stack[top++] = 0;
    while (top > 0) {
      const k = this.stack[--top];
      const mk = this.mass[k];
      if (mk === 0) continue;
      const dx = this.comX[k] - px;
      const dy = this.comY[k] - py;
      const d2 = dx * dx + dy * dy;
      const c = this.child[k];
      if (c < 0) {
        if (this.point[k] === self) continue;
      } else if ((2 * this.half[k]) ** 2 >= THETA * THETA * d2) {
        if (top + 4 > this.stack.length) {
          const grown = new Int32Array(this.stack.length * 2);
          grown.set(this.stack);
          this.stack = grown;
        }
        for (let q = 0; q < 4; q++) this.stack[top++] = c + q;
        continue;
      }
      const r2 = d2 + eps2;
      const inv = mk / (r2 * Math.sqrt(r2));
      ax += dx * inv;
      ay += dy * inv;
    }
    out.ax = ax;
    out.ay = ay;
  }
}

export class Swarm {
  n = 0;
  readonly x = new Float64Array(MAX_STARS);
  readonly y = new Float64Array(MAX_STARS);
  readonly vx = new Float64Array(MAX_STARS);
  readonly vy = new Float64Array(MAX_STARS);
  readonly ax = new Float64Array(MAX_STARS);
  readonly ay = new Float64Array(MAX_STARS);
  /** Mass of each star: zero for a test star. */
  readonly m = new Float64Array(MAX_STARS);
  readonly color = new Float32Array(MAX_STARS * 3);
  /** Id of the galaxy each star belongs to; 0 for debris. */
  readonly host = new Int32Array(MAX_STARS);
  selfGravity = false;
  softening = 3;
  /** Fixed step of the leapfrog. */
  dt = 20;
  /** 1 with the dark halo, 0 without: only the stars themselves are left to hold the disk. */
  haloFactor = 1;
  private readonly tree = new QuadTree();
  private readonly out = { ax: 0, ay: 0 };
  private forcesValid = false;

  clear(): void {
    this.n = 0;
    this.selfGravity = false;
    this.haloFactor = 1;
    this.forcesValid = false;
  }

  add(x: number, y: number, vx: number, vy: number, m: number, r: number, g: number, b: number, host = 0): boolean {
    if (this.n >= MAX_STARS) return false;
    const i = this.n++;
    this.host[i] = host;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.m[i] = m;
    this.color[i * 3] = r;
    this.color[i * 3 + 1] = g;
    this.color[i * 3 + 2] = b;
    this.forcesValid = false;
    return true;
  }

  private remove(i: number): void {
    const l = --this.n;
    this.x[i] = this.x[l];
    this.y[i] = this.y[l];
    this.vx[i] = this.vx[l];
    this.vy[i] = this.vy[l];
    this.ax[i] = this.ax[l];
    this.ay[i] = this.ay[l];
    this.m[i] = this.m[l];
    this.host[i] = this.host[l];
    for (let c = 0; c < 3; c++) this.color[i * 3 + c] = this.color[l * 3 + c];
  }

  /** Removes every star belonging to one galaxy. */
  removeHost(id: number): void {
    for (let i = this.n - 1; i >= 0; i--) if (this.host[i] === id) this.remove(i);
    this.forcesValid = false;
  }

  /** Acceleration from the massive bodies alone. */
  bodyPull(px: number, py: number, bodies: readonly Body[], out: { ax: number; ay: number }): void {
    let ax = 0;
    let ay = 0;
    for (const b of bodies) {
      const dx = b.x - px;
      const dy = b.y - py;
      const r2 = dx * dx + dy * dy;
      if (b.kind === 'galaxy') {
        const r = Math.sqrt(r2) + 1e-9;
        const f = (this.haloFactor * haloEnclosed(b.m, b.soft ?? 1, b.radius ?? 1, r)) / (r * r * r);
        ax += f * dx;
        ay += f * dy;
      } else {
        const s = r2 + this.softening * this.softening * 0.04;
        const f = b.m / (s * Math.sqrt(s));
        ax += f * dx;
        ay += f * dy;
      }
    }
    out.ax = ax;
    out.ay = ay;
  }

  /** Recomputes every star's acceleration. */
  computeForces(bodies: readonly Body[]): void {
    const self = this.selfGravity && this.n > 1;
    if (self) this.tree.build(this.x, this.y, this.m, this.n);
    const eps2 = this.softening * this.softening;
    const o = this.out;
    for (let i = 0; i < this.n; i++) {
      this.bodyPull(this.x[i], this.y[i], bodies, o);
      let ax = o.ax;
      let ay = o.ay;
      if (self) {
        this.tree.force(this.x[i], this.y[i], i, eps2, o);
        ax += o.ax;
        ay += o.ay;
      }
      this.ax[i] = ax;
      this.ay[i] = ay;
    }
    this.forcesValid = true;
  }

  /** Stars are now inconsistent with their forces (the bodies jumped, or a star was changed). */
  invalidate(): void {
    this.forcesValid = false;
  }

  /** One kick-drift-kick step. `moveBodies` advances the massive bodies across the drift. */
  step(h: number, bodies: () => readonly Body[], moveBodies: (h: number) => void, escape: number): void {
    if (!this.forcesValid) this.computeForces(bodies());
    const half = h / 2;
    for (let i = 0; i < this.n; i++) {
      this.vx[i] += this.ax[i] * half;
      this.vy[i] += this.ay[i] * half;
      this.x[i] += this.vx[i] * h;
      this.y[i] += this.vy[i] * h;
    }
    moveBodies(h);
    const live = bodies();
    this.computeForces(live);
    for (let i = this.n - 1; i >= 0; i--) {
      this.vx[i] += this.ax[i] * half;
      this.vy[i] += this.ay[i] * half;
      if (this.x[i] * this.x[i] + this.y[i] * this.y[i] > escape * escape || this.swallowed(i, live)) this.remove(i);
    }
  }

  private swallowed(i: number, bodies: readonly Body[]): boolean {
    for (const b of bodies) {
      const R = surfaceRadius(b);
      if (R > 0 && (this.x[i] - b.x) ** 2 + (this.y[i] - b.y) ** 2 < R * R) return true;
    }
    return false;
  }

  /** Total energy of a self-gravitating swarm by direct summation. O(n²): for tests. */
  energy(bodies: readonly Body[]): number {
    const eps2 = this.softening * this.softening;
    let e = 0;
    for (let i = 0; i < this.n; i++) {
      const m = this.m[i];
      e += 0.5 * m * (this.vx[i] * this.vx[i] + this.vy[i] * this.vy[i]);
      for (let j = i + 1; j < this.n; j++) {
        const dx = this.x[i] - this.x[j];
        const dy = this.y[i] - this.y[j];
        e -= (m * this.m[j]) / Math.sqrt(dx * dx + dy * dy + eps2);
      }
      for (const b of bodies) {
        if (b.kind === 'galaxy') e += m * haloPotential(b, Math.hypot(this.x[i] - b.x, this.y[i] - b.y));
      }
    }
    return e;
  }
}

/** Potential of a galaxy's halo at radius r, by numerical integration of M(r)/r² outward. */
export function haloPotential(b: Body, r: number): number {
  const R = b.radius ?? 1;
  const a = b.soft ?? 1;
  if (r >= R) return -b.m / r;
  const steps = 200;
  const h = (R - r) / steps;
  let sum = 0;
  for (let i = 0; i < steps; i++) {
    const s = r + (i + 0.5) * h;
    sum += (haloEnclosed(b.m, a, R, s) / (s * s)) * h;
  }
  return -b.m / R - sum;
}

/** Mulberry32: a small seeded generator, so a scene looks the same each time it loads. */
export function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  return Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
}

export interface DiskOptions {
  count: number;
  /** Exponential scale length. */
  scale: number;
  /** Outer edge. */
  edge: number;
  /** Disk mass; 0 makes test stars. */
  mass: number;
  /** Toomre Q used for the velocity dispersion. */
  q: number;
  /** Rotation sense: +1 counter-clockwise. */
  sense: number;
  seed: number;
}

/** Radius from the exponential disk's cumulative mass P(R) = 1 − (1 + R/h) e^(−R/h). */
function diskRadius(u: number, h: number, edge: number): number {
  const target = u * (1 - (1 + edge / h) * Math.exp(-edge / h));
  let lo = 0;
  let hi = edge;
  for (let i = 0; i < 44; i++) {
    const mid = (lo + hi) / 2;
    if (1 - (1 + mid / h) * Math.exp(-mid / h) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Fills a disk around `host`. Speeds come from the force actually felt at each star (halo, other
 * bodies and, if self-gravitating, the rest of the disk), so the disk starts near equilibrium.
 * The radial spread follows Toomre's criterion σ_R = 3.36 Q Σ / κ, with κ = √2 Ω for a flat curve.
 */
export function spawnDisk(swarm: Swarm, host: Body, opts: DiskOptions, bodies: readonly Body[]): number {
  const rand = seeded(opts.seed);
  const start = swarm.n;
  const massEach = opts.mass > 0 ? opts.mass / opts.count : 0;
  for (let i = 0; i < opts.count; i++) {
    const R = diskRadius(rand(), opts.scale, opts.edge);
    const th = rand() * Math.PI * 2;
    // Colour: an old, warm centre and a blue-white outer disk, with some scatter between stars.
    const warm = Math.exp(-R / (opts.scale * 0.9));
    const jitter = 0.82 + 0.18 * rand();
    const r = (0.6 + 0.4 * warm) * jitter;
    const g = (0.72 + 0.1 * warm) * jitter;
    const b = (1 - 0.55 * warm) * jitter;
    const ok = swarm.add(host.x + R * Math.cos(th), host.y + R * Math.sin(th), host.vx, host.vy, massEach, r, g, b, host.id);
    if (!ok) break;
  }
  const added = swarm.n - start;
  swarm.computeForces(bodies);
  const surface = (R: number) => (opts.mass / (2 * Math.PI * opts.scale * opts.scale)) * Math.exp(-R / opts.scale);
  // Average the pull in rings: a single star's force is grainy, and the speed should not be.
  const RINGS = 48;
  const ringPull = new Float64Array(RINGS);
  const ringCount = new Float64Array(RINGS);
  const ringOf = (R: number) => Math.min(RINGS - 1, Math.floor((R / opts.edge) * RINGS));
  const inwardPull = (i: number, ux: number, uy: number) => Math.max(0, -(swarm.ax[i] * ux + swarm.ay[i] * uy));
  for (let i = start; i < swarm.n; i++) {
    const dx = swarm.x[i] - host.x;
    const dy = swarm.y[i] - host.y;
    const R = Math.hypot(dx, dy) + 1e-6;
    const k = ringOf(R);
    ringPull[k] += inwardPull(i, dx / R, dy / R);
    ringCount[k]++;
  }
  for (let i = start; i < swarm.n; i++) {
    const dx = swarm.x[i] - host.x;
    const dy = swarm.y[i] - host.y;
    const R = Math.hypot(dx, dy) + 1e-6;
    const ux = dx / R;
    const uy = dy / R;
    const k = ringOf(R);
    const vc2 = (ringCount[k] > 0 ? ringPull[k] / ringCount[k] : inwardPull(i, ux, uy)) * R;
    const vc = Math.sqrt(vc2);
    const omega = vc / R;
    const kappa = Math.SQRT2 * omega;
    const sigma = opts.mass > 0 ? Math.min(0.45 * vc, (3.36 * opts.q * surface(R)) / Math.max(kappa, 1e-9)) : 0.03 * vc;
    // Asymmetric drift: a disk with random motions rotates a little below the circular speed.
    const mean = Math.sqrt(Math.max(0, vc2 - sigma * sigma * (R / opts.scale)));
    const vR = sigma * gaussian(rand);
    const vT = opts.sense * (mean + (sigma / Math.SQRT2) * gaussian(rand));
    swarm.vx[i] = host.vx + vR * ux - vT * uy;
    swarm.vy[i] = host.vy + vR * uy + vT * ux;
  }
  swarm.invalidate();
  return added;
}

/** Binned rotation curve about (cx, cy): measured speed, and the speed the stars' mass alone would give. */
export function rotationCurve(swarm: Swarm, cx: number, cy: number, rMax: number, bins: number): { r: number[]; v: number[]; luminous: number[] } {
  const speed = new Float64Array(bins);
  const count = new Float64Array(bins);
  const mass = new Float64Array(bins);
  const w = rMax / bins;
  for (let i = 0; i < swarm.n; i++) {
    const dx = swarm.x[i] - cx;
    const dy = swarm.y[i] - cy;
    const R = Math.hypot(dx, dy);
    const k = Math.floor(R / w);
    if (k >= bins || R < 1e-6) continue;
    speed[k] += (dx * swarm.vy[i] - dy * swarm.vx[i]) / R;
    count[k]++;
    mass[k] += swarm.m[i];
  }
  const r: number[] = [];
  const v: number[] = [];
  const luminous: number[] = [];
  let enclosed = 0;
  for (let k = 0; k < bins; k++) {
    enclosed += mass[k];
    const R = (k + 0.5) * w;
    r.push(R);
    v.push(count[k] ? Math.abs(speed[k] / count[k]) : NaN);
    luminous.push(Math.sqrt(enclosed / R));
  }
  return { r, v, luminous };
}
