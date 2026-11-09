/**
 * The Alcubierre warp-drive metric (Alcubierre 1994, Class. Quantum Grav. 11, L73), G = c = 1:
 *
 *   ds² = −dt² + (dx − v_s f(r_s) dt)² + dy² + dz²,   r_s = √((x − x_s(t))² + y² + z²)
 *   f(r_s) = [tanh σ(r_s + R) − tanh σ(r_s − R)] / (2 tanh σR)
 *
 * THIS IS A THEORETICAL METRIC. It is an exact solution only in the trivial sense that any metric
 * solves Einstein's equations if you accept whatever matter they then demand, and here they demand
 * negative energy density. Nothing here says such a thing can be built. See WARP_CAVEATS.
 *
 * In ADM form the lapse is 1, the slices are flat, and the shift is β^x = −v_s f. Consequences used below:
 *  - York time (expansion of Eulerian observers): θ = v_s (x_s/r_s) df/dr_s, Alcubierre eq. (12).
 *    Negative (contracting) ahead of the ship, positive (expanding) behind.
 *  - Eulerian energy density: T⁰⁰ = −(1/8π)(v_s²ρ²/(4 r_s²))(df/dr_s)², ρ² = y² + z², eq. (19).
 *  - Geodesics follow H = E + v_s f p_x, E = √(m² + p²), the standard ADM Hamiltonian for this
 *    lapse and shift. Massive particles get dτ/dt = m/E.
 *
 * Pure maths: no three.js, no DOM.
 */

export interface WarpShape {
  /** Bubble radius. */
  R: number;
  /** Inverse wall thickness: larger is a sharper top hat. */
  sigma: number;
}

export interface WarpParams extends WarpShape {
  /** Bubble speed v_s, in units of c. May exceed 1. */
  v: number;
}

/** What the sheet shows. */
export type WarpOverlay = 'theta' | 'energy';

/** sech²(u) = 4e^(−2|u|)/(1 + e^(−2|u|))². Written this way it never overflows. */
export function sech2(u: number): number {
  const e = Math.exp(-2 * Math.abs(u));
  return (4 * e) / ((1 + e) * (1 + e));
}

/**
 * The top-hat shape f(r_s), r_s ≥ 0. Evaluates tanh a − tanh b = sinh(a − b)/(cosh a cosh b) in
 * exponentials, so the tail keeps its accuracy where the two tanh terms would cancel to zero.
 * Mirrored in GLSL in src/scene/warpView.tsx.
 */
export function shapeF(r: number, { R, sigma }: WarpShape): number {
  const a = sigma * (r + R);
  const b = sigma * (r - R);
  const s = sigma * R;
  const ea = Math.exp(-2 * Math.abs(a));
  const eb = Math.exp(-2 * Math.abs(b));
  const difference = (2 * Math.exp(2 * s - Math.abs(a) - Math.abs(b)) * (1 - Math.exp(-4 * s))) / ((1 + ea) * (1 + eb));
  return difference / (2 * Math.tanh(s));
}

/** df/dr_s, always ≤ 0 for r_s > 0. Mirrored in GLSL. */
export function shapeDF(r: number, { R, sigma }: WarpShape): number {
  return (sigma * (sech2(sigma * (r + R)) - sech2(sigma * (r - R)))) / (2 * Math.tanh(sigma * R));
}

/** York time θ = v_s (x_s/r_s) df/dr_s at an offset (dx, y, z) from the bubble centre. */
export function expansion(dx: number, y: number, z: number, p: WarpParams): number {
  const r = Math.sqrt(dx * dx + y * y + z * z);
  if (r < 1e-12) return 0; // df/dr vanishes linearly at the centre.
  return p.v * (dx / r) * shapeDF(r, p);
}

/** Eulerian energy density T⁰⁰ = −(1/8π)(v_s²ρ²/(4 r_s²))(df/dr_s)². Never positive. */
export function energyDensity(dx: number, y: number, z: number, p: WarpParams): number {
  const r2 = dx * dx + y * y + z * z;
  if (r2 < 1e-24) return 0;
  const df = shapeDF(Math.sqrt(r2), p);
  return -((p.v * p.v * (y * y + z * z)) / (4 * r2)) * df * df / (8 * Math.PI);
}

/** The largest |df/dr_s| of the shape, located by a grid search and a golden-section polish. */
export function maxSlope(shape: WarpShape): number {
  const { R, sigma } = shape;
  const lo = Math.max(0, R - 12 / sigma);
  const hi = R + 12 / sigma;
  const N = 400;
  let best = lo;
  let bestValue = -1;
  for (let i = 0; i <= N; i++) {
    const r = lo + ((hi - lo) * i) / N;
    const v = Math.abs(shapeDF(r, shape));
    if (v > bestValue) {
      bestValue = v;
      best = r;
    }
  }
  const step = (hi - lo) / N;
  let a = Math.max(0, best - step);
  let b = best + step;
  const g = (Math.sqrt(5) - 1) / 2;
  for (let i = 0; i < 40; i++) {
    const c = b - g * (b - a);
    const d = a + g * (b - a);
    if (Math.abs(shapeDF(c, shape)) > Math.abs(shapeDF(d, shape))) b = d;
    else a = c;
  }
  return Math.abs(shapeDF((a + b) / 2, shape));
}

/** Peak |θ| anywhere: on the axis, where x_s/r_s = ±1. */
export const peakExpansion = (p: WarpParams): number => Math.abs(p.v) * maxSlope(p);
/** Peak |T⁰⁰| anywhere: in the plane x = x_s, where ρ = r_s. */
export const peakEnergyDensity = (p: WarpParams): number => {
  const s = maxSlope(p);
  return (p.v * p.v * s * s) / (32 * Math.PI);
};

/** Wall thickness Δ in Pfenning & Ford (1997) eq. (5): the top hat's slope at R equals 1/Δ. */
export function wallThickness({ R, sigma }: WarpShape): number {
  const t = Math.tanh(sigma * R);
  return ((1 + t * t) * (1 + t * t)) / (2 * sigma * t);
}

/**
 * Total Eulerian energy on a t = const slice. The slices are flat, so the integral is the ordinary
 * volume integral, and doing the angles gives E = −(v_s²/12) ∫ f′(r)² r² dr. Simpson's rule, finite.
 */
export function totalEnergy(p: WarpParams): number {
  const { R, sigma, v } = p;
  const lo = Math.max(0, R - 40 / sigma);
  const hi = R + 40 / sigma;
  const N = 4000; // even
  const h = (hi - lo) / N;
  const g = (r: number): number => {
    const d = shapeDF(r, p);
    return d * d * r * r;
  };
  let sum = g(lo) + g(hi);
  for (let i = 1; i < N; i++) sum += g(lo + i * h) * (i % 2 ? 4 : 2);
  return (-(v * v) / 12) * ((sum * h) / 3);
}

/** Pfenning & Ford (1997) eq. (28): the same energy for a wall of constant slope 1/Δ. */
export const piecewiseWallEnergy = (v: number, R: number, delta: number): number => (-(v * v) / 12) * ((R * R) / delta + delta / 12);

/**
 * Where, on the axis, the bubble-frame speed of the flow reaches c: f(r) = 1 − 1/v_s. A forward-going
 * photon stalls there, which makes it a horizon. It exists only for v_s > 1. Off the axis it is the
 * radius where the flow reaches c, not by itself the horizon.
 */
export function horizonRadius(p: WarpParams): number | null {
  if (p.v <= 1) return null;
  const target = 1 - 1 / p.v;
  let lo = 0;
  let hi = p.R + 60 / p.sigma;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (shapeF(mid, p) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Surface gravity v_s |f′(r_h)|: the rate at which a stalling photon closes on the horizon. */
export function surfaceGravity(p: WarpParams): number | null {
  const r = horizonRadius(p);
  return r === null ? null : p.v * Math.abs(shapeDF(r, p));
}

/**
 * dτ/dt for an observer held at distance r from the centre along the axis, at rest in the bubble frame
 * (dx/dt = v_s): √(1 − v_s²(1 − f)²). Exactly 1 at the centre. NaN where no timelike worldline can
 * stay put, beyond a superluminal bubble's horizon.
 */
export function heldClockRate(r: number, p: WarpParams): number {
  const q = p.v * (1 - shapeF(r, p));
  const k = 1 - q * q;
  return k < 0 ? NaN : Math.sqrt(k);
}

/** A geodesic in the plane z = 0. m = 1 is a massive test particle, m = 0 is light. */
export interface WarpGeodesic {
  x: number;
  y: number;
  px: number;
  py: number;
  m: number;
  /** Proper time elapsed (massive particles only). */
  tau: number;
}

const k1 = new Float64Array(5);
const k2 = new Float64Array(5);
const k3 = new Float64Array(5);
const k4 = new Float64Array(5);

function rhs(out: Float64Array, x: number, y: number, px: number, py: number, m: number, xs: number, p: WarpParams): void {
  const dx = x - xs;
  const r = Math.sqrt(dx * dx + y * y);
  const f = shapeF(r, p);
  const df = r > 1e-12 ? shapeDF(r, p) : 0;
  const E = Math.sqrt(m * m + px * px + py * py);
  out[0] = px / E + p.v * f;
  out[1] = py / E;
  out[2] = r > 1e-12 ? -p.v * px * df * (dx / r) : 0;
  out[3] = r > 1e-12 ? -p.v * px * df * (y / r) : 0;
  out[4] = m / E;
}

/** One RK4 step of Hamilton's equations, with the bubble at xs at the start and moving at v_s. */
export function stepGeodesic(g: WarpGeodesic, h: number, xs: number, p: WarpParams): void {
  rhs(k1, g.x, g.y, g.px, g.py, g.m, xs, p);
  rhs(k2, g.x + (h / 2) * k1[0], g.y + (h / 2) * k1[1], g.px + (h / 2) * k1[2], g.py + (h / 2) * k1[3], g.m, xs + (p.v * h) / 2, p);
  rhs(k3, g.x + (h / 2) * k2[0], g.y + (h / 2) * k2[1], g.px + (h / 2) * k2[2], g.py + (h / 2) * k2[3], g.m, xs + (p.v * h) / 2, p);
  rhs(k4, g.x + h * k3[0], g.y + h * k3[1], g.px + h * k3[2], g.py + h * k3[3], g.m, xs + p.v * h, p);
  g.x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  g.y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  g.px += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  g.py += (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
  g.tau += (h / 6) * (k1[4] + 2 * k2[4] + 2 * k3[4] + k4[4]);
}

/** The Hamiltonian in the bubble frame, E + v_s(f − 1)p_x: conserved while v_s is constant. */
export function bubbleFrameEnergy(g: WarpGeodesic, xs: number, p: WarpParams): number {
  const r = Math.hypot(g.x - xs, g.y);
  return Math.sqrt(g.m * g.m + g.px * g.px + g.py * g.py) + p.v * (shapeF(r, p) - 1) * g.px;
}

/** Largest RK4 step that resolves the wall as it sweeps by. */
export const warpStepLimit = (p: WarpParams): number => Math.min(1, 0.2 / (p.sigma * (1 + Math.abs(p.v))));

export interface WarpParticle extends WarpGeodesic {
  /** Where it started: the ticks on the sheet show how far the bubble has moved it. */
  x0: number;
  y0: number;
}

export const WARP_MAX_PARTICLES = 720;
export const WARP_MAX_LIGHT = 40;
/** Half-length of the strip of particles around the bubble. */
export const WARP_LANE = 320;
const LIGHT_EVERY = 40;
const MAX_SUBSTEPS = 200;

/**
 * A bubble moving along +x, test particles it sweeps through, and light from the ship. Particles start
 * at rest in the far field (p = 0), and follow the exact geodesics of the metric: the bubble does not
 * know they are there, since test particles do not source the geometry.
 */
export class WarpSim {
  params: WarpParams = { v: 2, R: 30, sigma: 0.4 };
  particles: WarpParticle[] = [];
  light: WarpGeodesic[] = [];
  /** Coordinate time. */
  t = 0;
  /** The bubble centre on the x axis. */
  xs = 0;
  /** Proper time on the ship. Exactly the coordinate time, Alcubierre eq. (13). */
  tauShip = 0;
  private lapStart = 0;
  private nextLight = 0;
  private seed = 1;

  constructor() {
    this.reset();
  }

  /** Back to the start: t = 0, a fresh strip of particles. */
  reset(): void {
    this.t = 0;
    this.xs = 0;
    this.tauShip = 0;
    this.lapStart = 0;
    this.nextLight = 0;
    this.seed = 1;
    this.light = [];
    this.scatter();
  }

  /** Change the bubble. The speed may change on the fly (the metric allows any v_s(t)); a new shape re-lays the particles. */
  configure(p: Partial<WarpParams>): void {
    const reshape = (p.R !== undefined && p.R !== this.params.R) || (p.sigma !== undefined && p.sigma !== this.params.sigma);
    this.params = { ...this.params, ...p };
    if (reshape) this.scatter();
  }

  private rand(): number {
    this.seed = (this.seed * 48271) % 2147483647;
    return this.seed / 2147483647;
  }

  private scatter(): void {
    const { R } = this.params;
    this.particles = [];
    const dy = Math.max(5, R / 3);
    const rows = Math.ceil((2.4 * R) / dy);
    const perRow = Math.floor(WARP_MAX_PARTICLES / (2 * rows));
    const spacing = (2 * WARP_LANE) / perRow;
    for (let j = 0; j < rows; j++) {
      for (const sign of [1, -1]) {
        const y = sign * (j + 0.5) * dy;
        for (let i = 0; i < perRow; i++) {
          const x = this.xs - WARP_LANE + (i + this.rand() * 0.6) * spacing;
          this.particles.push({ x, y, px: 0, py: 0, m: 1, tau: 0, x0: x, y0: y });
        }
      }
    }
  }

  /** Light from the ship, forwards and backwards along the axis. */
  private emitLight(): void {
    this.light.push({ x: this.xs, y: 0, px: 1, py: 0, m: 0, tau: 0 }, { x: this.xs, y: 0, px: -1, py: 0, m: 0, tau: 0 });
    while (this.light.length > WARP_MAX_LIGHT) this.light.shift();
  }

  /** Advances by dt of coordinate time. */
  step(dt: number): void {
    if (dt <= 0) return;
    const p = this.params;
    const n = Math.min(MAX_SUBSTEPS, Math.ceil(dt / warpStepLimit(p)));
    const h = dt / n;
    for (let k = 0; k < n; k++) {
      if (this.t >= this.nextLight) {
        this.emitLight();
        this.nextLight = this.t + LIGHT_EVERY;
      }
      for (const q of this.particles) stepGeodesic(q, h, this.xs, p);
      for (const g of this.light) {
        stepGeodesic(g, h, this.xs, p);
        // Light is blueshifted without limit as it nears a horizon. Only its direction matters here.
        const s = Math.hypot(g.px, g.py);
        if (s > 1e6) {
          g.px /= s;
          g.py /= s;
        }
      }
      this.xs += p.v * h;
      this.t += h;
      this.tauShip += h;
    }
    const lane = WARP_LANE;
    for (const q of this.particles) {
      if (q.x - this.xs < -lane) {
        q.x = this.xs + lane - this.rand() * 12;
        q.x0 = q.x;
        q.px = 0;
        q.py = 0;
        q.tau = 0;
      }
    }
    this.light = this.light.filter((g) => Math.abs(g.x - this.xs) < lane);
    // Particles the bubble swept up never come back into the lane: start a fresh strip once it has gone by.
    if (this.xs - this.lapStart > 2 * lane) {
      this.lapStart = this.xs;
      this.scatter();
    }
  }
}

/** Display: height and colour are the field divided by its peak, so v_s scales only the numbers. */
export const WARP_HEIGHT = 30;

/** The peak the overlay is normalised to. */
export const warpPeak = (overlay: WarpOverlay, p: WarpParams): number => (overlay === 'theta' ? peakExpansion(p) : peakEnergyDensity(p));

/** The normalised overlay value: θ/θ_peak in [−1, 1], or T⁰⁰/|T⁰⁰|_peak in [−1, 0]. */
export function warpDisplay(overlay: WarpOverlay, dx: number, y: number, p: WarpParams, peak: number): number {
  if (peak <= 0) return 0;
  return (overlay === 'theta' ? expansion(dx, y, 0, p) : energyDensity(dx, y, 0, p)) / peak;
}

/** Height of the warp sheet (mirrors the vertex shader in src/scene/warpView.tsx). */
export const warpHeight = (overlay: WarpOverlay, dx: number, y: number, p: WarpParams, peak: number, exaggeration: number): number =>
  warpDisplay(overlay, dx, y, p, peak) * WARP_HEIGHT * exaggeration;

/** One G = c = 1 metre of mass, in solar masses: 1 M☉ is 1476.6 m. */
export const SOLAR_MASSES_PER_METRE = 1 / 1476.6;

/** Honest statements for the UI. Each is backed by a paper in WARP_REFERENCES. */
export const WARP_CAVEATS: readonly string[] = [
  'This is a theoretical metric. Nothing here says such a bubble can be built, and the simulation cannot show that it can: it only draws what the equations say if the metric is simply assumed.',
  'It needs exotic matter. Eulerian observers see negative energy density in the walls (Alcubierre 1994), violating the weak and dominant energy conditions, and no known classical matter supplies it.',
  'The energy is prohibitive. Quantum inequalities confine the wall to about 100 v Planck lengths, which puts the energy of a 100 m bubble near −6×10⁶⁵ v grams, some ten orders of magnitude more than the visible universe holds (Pfenning & Ford 1997).',
  'Above light speed the crew is cut off. Light sent forward from the centre never reaches the front wall, so the crew can neither create nor steer the bubble from inside (Everett & Roman 1997).',
  'Above light speed it is expected to destroy itself. The walls act as black (rear) and white (front) horizons, and the semiclassical stress-energy grows exponentially at the front wall (Finazzi, Liberati & Barceló 2009).',
  'Later work disputes the details, not the difficulty. Lentz (2021) proposed positive-energy solitons, but Celmaster et al. (2025) report that those spacetimes do violate the weak energy condition. Bobrick & Martire (2021) treat a warp drive as a shell of material needing its own propulsion. Santiago, Schuster & Visser (2022) argue that generic warp drives violate the null energy condition.',
];

export const WARP_REFERENCES: readonly string[] = [
  'M. Alcubierre (1994), “The warp drive: hyper-fast travel within general relativity”, Class. Quantum Grav. 11, L73–L77.',
  'M. J. Pfenning & L. H. Ford (1997), “The unphysical nature of ‘warp drive’”, Class. Quantum Grav. 14, 1743–1751.',
  'A. E. Everett & T. A. Roman (1997), “Superluminal subway: the Krasnikov tube”, Phys. Rev. D 56, 2100–2108.',
  'S. Finazzi, S. Liberati & C. Barceló (2009), “Semiclassical instability of dynamical warp drives”, Phys. Rev. D 79, 124017.',
  'E. W. Lentz (2021), “Breaking the warp barrier: hyper-fast solitons in Einstein–Maxwell-plasma theory”, Class. Quantum Grav. 38, 075015.',
  'A. Bobrick & G. Martire (2021), “Introducing physical warp drives”, Class. Quantum Grav. 38, 105009.',
  'J. Santiago, S. Schuster & M. Visser (2022), “Generic warp drives violate the null energy condition”, Phys. Rev. D 105, 064038.',
  'B. Celmaster et al. (2025), “Violations of the weak energy condition for Lentz warp drives” (preprint record).',
];
