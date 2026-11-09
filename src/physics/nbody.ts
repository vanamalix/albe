/**
 * Massive-body dynamics: N-body gravity integrated with velocity Verlet (kick-drift-kick) on
 * adaptive sub-steps, with optional relativistic corrections and merger remnants.
 *
 *  - 1PN: the Einstein-Infeld-Hoffmann equations, the first relativistic correction for any
 *    number of bodies (orbits precess, in harmonic coordinates).
 *  - 2.5PN: gravitational radiation reaction for each pair (Blanchet 2014, eqs 358c and 359c).
 *  - Mergers: mass, spin and recoil from numerical-relativity fits for non-spinning binaries.
 *
 * Post-Newtonian expansions fail near merger, so each pair's correction is capped at half of its
 * Newtonian pull. Without the cap the 1PN force turns repulsive at a few M.
 */
import { collisionOutcome, haloDensity0, haloEnclosed, haloFlatSpeed } from './bodies';
import { isBlackHole, isCompact, surfaceRadius, type Body } from './types';

export interface NBodyOptions {
  /** Plummer softening length (keeps close passes finite before the merge check catches them). */
  softening: number;
  /** Add the first post-Newtonian (Einstein-Infeld-Hoffmann) corrections. */
  pn: boolean;
  /** Add 2.5PN gravitational radiation reaction. */
  gw: boolean;
  /** Multiplier on the radiation reaction (1 = the physical value). */
  gwBoost: number;
  /** Set false to let bodies pass through each other (for orbits that need very close approaches). */
  merge?: boolean;
  /** Multiplier on galaxy-galaxy dynamical friction (default 1). */
  friction?: number;
}

export const DEFAULT_NBODY: NBodyOptions = { softening: 0.05, pn: false, gw: false, gwBoost: 1 };

/** Acceleration per unit separation on the lighter `target` from `source`, when one is a galaxy. */
function pullFrom(source: Body, target: Body, dx: number, dy: number): number {
  const r2 = dx * dx + dy * dy;
  if (source.kind === 'galaxy') {
    const r = Math.sqrt(r2) + 1e-9;
    return haloEnclosed(source.m, source.soft ?? 1, source.radius ?? 1, r) / (r * r * r);
  }
  const s = r2 + (target.soft ?? 0) ** 2;
  return source.m / (s * Math.sqrt(s));
}

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
      if (bi.kind === 'galaxy' || bj.kind === 'galaxy') {
        // The lighter body feels the heavier one's field exactly as stars there do, so it does not
        // fall away from its own stars. The heavier takes the equal and opposite reaction.
        const lightIsI = bi.m <= bj.m;
        const heavy = lightIsI ? bj : bi;
        const light = lightIsI ? bi : bj;
        const pull = pullFrom(heavy, light, dx, dy);
        const pi = lightIsI ? pull : (pull * light.m) / heavy.m;
        const pj = lightIsI ? (pull * light.m) / heavy.m : pull;
        bi.ax += pi * dx;
        bi.ay += pi * dy;
        bj.ax -= pj * dx;
        bj.ay -= pj * dy;
        continue;
      }
      const r2 = dx * dx + dy * dy + eps2;
      const inv = 1 / (r2 * Math.sqrt(r2));
      bi.ax += bj.m * dx * inv;
      bi.ay += bj.m * dy * inv;
      bj.ax -= bi.m * dx * inv;
      bj.ay -= bi.m * dy * inv;
    }
  }
}

/** A post-Newtonian correction may not exceed this fraction of the pair's Newtonian pull. */
const PN_CAP = 0.5;

let potentials = new Float64Array(64);
let newtonX = new Float64Array(64);
let newtonY = new Float64Array(64);

/**
 * Adds the 1PN Einstein-Infeld-Hoffmann acceleration (call straight after computeAccelerations,
 * whose Newtonian result it uses). With n_ab = (x_a − x_b)/r_ab and G = c = 1:
 *
 *   a_a = Σ_b −(m_b n_ab / r²) [ −4 φ_a − φ_b + v_a² − 4 v_a·v_b + 2 v_b² − (3/2)(v_b·n_ab)²
 *                                 − (1/2) r_ab·a_b ]
 *         + (m_b / r²) [n_ab·(4 v_a − 3 v_b)] (v_a − v_b) + (7/2)(m_b / r) a_b
 *
 * where φ_a = Σ_{c≠a} m_c / r_ac and a_b is the Newtonian acceleration of body b.
 */
export function addFirstPostNewtonian(bodies: Body[]): void {
  const n = bodies.length;
  if (n < 2) return;
  if (potentials.length < n) {
    potentials = new Float64Array(n * 2);
    newtonX = new Float64Array(n * 2);
    newtonY = new Float64Array(n * 2);
  }
  potentials.fill(0, 0, n);
  for (let i = 0; i < n; i++) {
    newtonX[i] = bodies[i].ax;
    newtonY[i] = bodies[i].ay;
    for (let j = i + 1; j < n; j++) {
      const r = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].y - bodies[j].y) + 1e-9;
      potentials[i] += bodies[j].m / r;
      potentials[j] += bodies[i].m / r;
    }
  }
  for (let a = 0; a < n; a++) {
    const A = bodies[a];
    const va2 = A.vx * A.vx + A.vy * A.vy;
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const B = bodies[b];
      const rx = A.x - B.x;
      const ry = A.y - B.y;
      const r = Math.hypot(rx, ry) + 1e-9;
      const nx = rx / r;
      const ny = ry / r;
      const pull = B.m / (r * r);
      const vbn = B.vx * nx + B.vy * ny;
      const bracket =
        -4 * potentials[a] -
        potentials[b] +
        va2 -
        4 * (A.vx * B.vx + A.vy * B.vy) +
        2 * (B.vx * B.vx + B.vy * B.vy) -
        1.5 * vbn * vbn -
        0.5 * (rx * newtonX[b] + ry * newtonY[b]);
      const drive = nx * (4 * A.vx - 3 * B.vx) + ny * (4 * A.vy - 3 * B.vy);
      let cx = -pull * nx * bracket + pull * drive * (A.vx - B.vx) + 3.5 * (B.m / r) * newtonX[b];
      let cy = -pull * ny * bracket + pull * drive * (A.vy - B.vy) + 3.5 * (B.m / r) * newtonY[b];
      const size = Math.hypot(cx, cy);
      if (size > PN_CAP * pull) {
        cx *= (PN_CAP * pull) / size;
        cy *= (PN_CAP * pull) / size;
      }
      A.ax += cx;
      A.ay += cy;
    }
  }
}

/**
 * Adds 2.5PN radiation reaction to every pair: a = −(M/r²)(A n + B v) on the relative motion, with
 *   A = (8Mν/5r) ṙ (−(17/3) M/r − 3v²),   B = (8Mν/5r) (3 M/r + v²)
 * Unlike an orbit-averaged drag this handles eccentric orbits and close fly-bys, and over an orbit
 * it reproduces the Peters (1964) decay rates. Linear momentum is conserved.
 */
export function addRadiationReaction(bodies: Body[], boost: number): void {
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const bi = bodies[i];
    for (let j = i + 1; j < n; j++) {
      const bj = bodies[j];
      const dx = bi.x - bj.x;
      const dy = bi.y - bj.y;
      const r = Math.hypot(dx, dy) + 1e-9;
      const nx = dx / r;
      const ny = dy / r;
      const vx = bi.vx - bj.vx;
      const vy = bi.vy - bj.vy;
      const M = bi.m + bj.m;
      const nu = (bi.m * bj.m) / (M * M);
      const v2 = vx * vx + vy * vy;
      const rdot = nx * vx + ny * vy;
      const k = (8 * M * nu) / (5 * r);
      const A = k * rdot * ((-17 / 3) * (M / r) - 3 * v2);
      const B = k * ((3 * M) / r + v2);
      const pull = M / (r * r);
      let ax = -pull * (A * nx + B * vx) * boost;
      let ay = -pull * (A * ny + B * vy) * boost;
      const size = Math.hypot(ax, ay);
      if (size > PN_CAP * pull) {
        ax *= (PN_CAP * pull) / size;
        ay *= (PN_CAP * pull) / size;
      }
      bi.ax += (bj.m / M) * ax;
      bi.ay += (bj.m / M) * ay;
      bj.ax -= (bi.m / M) * ax;
      bj.ay -= (bi.m / M) * ay;
    }
  }
}

/** Time for a binary to merge under Peters (1964), integrating his a(e) relation (G = c = 1). */
export function petersMergerTime(m1: number, m2: number, a: number, e: number): number {
  const beta = (64 / 5) * m1 * m2 * (m1 + m2);
  const circular = (a * a * a * a) / (4 * beta);
  const ecc = Math.min(e, 0.99);
  if (ecc < 1e-4) return circular;
  const shape = (x: number): number => Math.pow(x, 12 / 19) / (1 - x * x) * Math.pow(1 + (121 / 304) * x * x, 870 / 2299);
  const c0 = a / shape(ecc);
  const f = (x: number): number =>
    x <= 0 ? 0 : (Math.pow(x, 29 / 19) * Math.pow(1 + (121 / 304) * x * x, 1181 / 2299)) / Math.pow(1 - x * x, 1.5);
  const steps = 400;
  const h = ecc / steps;
  let sum = f(0) + f(ecc);
  for (let i = 1; i < steps; i++) sum += f(i * h) * (i % 2 ? 4 : 2);
  return ((12 / 19) * Math.pow(c0, 4) * (sum * h)) / (3 * beta);
}

export interface PairOrbit {
  /** Semi-major axis, or Infinity when the pair is unbound. */
  a: number;
  e: number;
  separation: number;
  bound: boolean;
  /** Relativistic periapsis advance per orbit, radians. */
  advance: number;
  /** Peters merger time. Infinity when unbound. */
  mergerTime: number;
}

/**
 * Instantaneous orbital elements of a pair. With `pn`, energy and angular momentum include their
 * 1PN terms: plain Kepler elements read a round relativistic orbit as a markedly eccentric one.
 */
export function pairOrbit(p: Body, q: Body, pn = false): PairOrbit {
  const M = p.m + q.m;
  const nu = (p.m * q.m) / (M * M);
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  const vx = p.vx - q.vx;
  const vy = p.vy - q.vy;
  const r = Math.hypot(dx, dy) + 1e-9;
  const v2 = vx * vx + vy * vy;
  const x = M / r;
  const rdot = (dx * vx + dy * vy) / r;
  let energy = 0.5 * v2 - x;
  let h = dx * vy - dy * vx;
  if (pn) {
    energy += (3 / 8) * (1 - 3 * nu) * v2 * v2 + 0.5 * (3 + nu) * v2 * x + 0.5 * nu * x * rdot * rdot + 0.5 * x * x;
    h *= 1 + 0.5 * (1 - 3 * nu) * v2 + (3 + nu) * x;
  }
  const e = Math.sqrt(Math.max(0, 1 + (2 * energy * h * h) / (M * M)));
  if (energy >= 0) return { a: Infinity, e, separation: r, bound: false, advance: 0, mergerTime: Infinity };
  const a = -M / (2 * energy);
  return { a, e, separation: r, bound: true, advance: (6 * Math.PI * M) / (a * (1 - e * e)), mergerTime: petersMergerTime(p.m, q.m, a, e) };
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
      const s2 = (bi.soft ?? 0) ** 2 + (bj.soft ?? 0) ** 2;
      const r = Math.sqrt(dx * dx + dy * dy + s2) + 1e-9;
      const tDyn = Math.sqrt((r * r * r) / (bi.m + bj.m));
      const vRel = Math.hypot(bj.vx - bi.vx, bj.vy - bi.vy);
      const tCross = vRel > 0 ? r / vRel : Infinity;
      dt = Math.min(dt, eta * tDyn, eta * 4 * tCross);
    }
  }
  return dt;
}

/** Recomputes accelerations: Newtonian, then the enabled relativistic corrections. */
export function refreshAccelerations(bodies: Body[], opts: NBodyOptions): void {
  computeAccelerations(bodies, opts.softening);
  if (opts.pn || opts.gw) {
    // Stars and planets are drawn at a compressed scale, so their M/r means nothing physically.
    const compact = bodies.every(isCompact) ? bodies : bodies.filter(isCompact);
    if (opts.pn) addFirstPostNewtonian(compact);
    if (opts.gw) addRadiationReaction(compact, opts.gwBoost);
  }
  addDynamicalFriction(bodies, opts.friction ?? 1);
}

/** Coulomb logarithm for galaxy-galaxy drag: small, since the two are of comparable size. */
const COULOMB_LOG = 2;

/** Error function (Abramowitz & Stegun 7.1.26). */
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}

/**
 * Dynamical friction between galaxies (Chandrasekhar 1943): each one drags a wake through the
 * other's halo, F = −4π ρ M² lnΛ [erf X − 2X e^(−X²)/√π] / v², with X = v/(√2 σ) and σ = v_flat/√2.
 * The halos themselves are rigid, so this is what lets a passing pair lose energy and merge.
 * Equal and opposite, so momentum is conserved.
 */
export function addDynamicalFriction(bodies: Body[], factor = 1): void {
  if (factor <= 0) return;
  const n = bodies.length;
  for (let i = 0; i < n; i++) {
    const A = bodies[i];
    if (A.kind !== 'galaxy') continue;
    for (let j = i + 1; j < n; j++) {
      const B = bodies[j];
      if (B.kind !== 'galaxy') continue;
      const r = Math.hypot(A.x - B.x, A.y - B.y);
      const vx = A.vx - B.vx;
      const vy = A.vy - B.vy;
      const v = Math.hypot(vx, vy);
      if (v < 1e-9) continue;
      const wake = (host: Body, m: number): number => {
        // The formula is for a body moving through a larger medium; a small halo cannot brake a giant.
        if (m > host.m) return 0;
        const a = host.soft ?? 1;
        const R = host.radius ?? 1;
        if (r >= R) return 0;
        const rho = haloDensity0(host.m, a, R) / (1 + (r * r) / (a * a));
        const X = v / haloFlatSpeed(host.m, a, R);
        return rho * m * m * (erf(X) - ((2 * X) / Math.sqrt(Math.PI)) * Math.exp(-X * X));
      };
      const F = (factor * 4 * Math.PI * COULOMB_LOG * (wake(B, A.m) + wake(A, B.m))) / (v * v);
      if (F <= 0) continue;
      A.ax -= ((F / A.m) * vx) / v;
      A.ay -= ((F / A.m) * vy) / v;
      B.ax += ((F / B.m) * vx) / v;
      B.ay += ((F / B.m) * vy) / v;
    }
  }
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
  if (opts.pn || opts.gw) {
    // These forces depend on velocity, so evaluate them again at the end-of-step velocity.
    const mid = bodies.map((b) => [b.vx, b.vy]);
    for (const b of bodies) {
      b.vx += b.ax * h;
      b.vy += b.ay * h;
    }
    refreshAccelerations(bodies, opts);
    bodies.forEach((b, i) => {
      b.vx = mid[i][0];
      b.vy = mid[i][1];
    });
  }
  for (const b of bodies) {
    b.vx += b.ax * h;
    b.vy += b.ay * h;
  }
}

export interface Remnant {
  /** Fraction of the total mass carried away by gravitational waves. */
  radiated: number;
  /** Dimensionless spin a/M of the remnant. */
  spin: number;
  /** Recoil speed in units of c. */
  kick: number;
}

const ISCO_ENERGY = Math.sqrt(8 / 9);
const SPEED_OF_LIGHT_KM_S = 299_792.458;

/**
 * Remnant of two non-spinning black holes on a quasi-circular orbit, with ν = m₁m₂/M²:
 *   radiated: Barausse, Morozova & Rezzolla (2012) eq 18 at zero spin (p₀ = 0.04827)
 *   spin:     Rezzolla et al. (2008): 2√3 ν − 3.454 ν² + 2.353 ν³
 *   recoil:   González et al. (2007): 1.20×10⁴ km/s · ν² √(1 − 4ν) (1 − 0.93 ν)
 */
export function remnantOf(m1: number, m2: number): Remnant {
  const M = m1 + m2;
  const nu = (m1 * m2) / (M * M);
  const radiated = (1 - ISCO_ENERGY) * nu + 4 * nu * nu * (4 * 0.04827 + ISCO_ENERGY - 1);
  const spin = 2 * Math.sqrt(3) * nu - 3.454 * nu * nu + 2.353 * nu * nu * nu;
  const kick = (1.2e4 * nu * nu * Math.sqrt(Math.max(0, 1 - 4 * nu)) * (1 - 0.93 * nu)) / SPEED_OF_LIGHT_KM_S;
  return { radiated, spin, kick };
}

export const kickKmPerSecond = (kick: number): number => kick * SPEED_OF_LIGHT_KM_S;

export interface MergeEvent {
  x: number;
  y: number;
  m: number;
  survivorId: number;
  absorbedId: number;
  /** Set when the merger used the relativistic remnant fits. */
  remnant?: Remnant;
  /** Size of the object left behind. */
  radius: number;
  /** A compact object was driven past its mass limit and collapsed. */
  supernova: boolean;
}

/**
 * Merges every pair whose surfaces touch (for black holes, closer than 2(m1 + m2)). Galaxies pass
 * through one another. The remnant sits at the centre of mass, and collisionOutcome decides what it is. By default mass and linear momentum are conserved exactly. With
 * `relativistic`, a few per cent of the mass leaves as waves and the remnant recoils against the
 * lighter body's motion. The fits give the recoil speed; its direction here is a simplification.
 * Mutates the array in place and returns the merge events.
 */
export function mergeBodies(bodies: Body[], relativistic = false): MergeEvent[] {
  const events: MergeEvent[] = [];
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i];
        const b = bodies[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (a.kind === 'galaxy' || b.kind === 'galaxy') continue;
        // A star is torn apart by a heavier compact object before they touch, so only the horizon counts.
        const hole = isCompact(a) ? a : isCompact(b) ? b : null;
        const other = hole === a ? b : a;
        const tears = hole !== null && other.kind === 'star' && hole.m > other.m;
        const reach = tears ? surfaceRadius(hole) : surfaceRadius(a) + surfaceRadius(b);
        if (d < reach) {
          const total = a.m + b.m;
          const keep = a.m >= b.m ? a : b;
          const lose = keep === a ? b : a;
          const x = (a.m * a.x + b.m * b.x) / total;
          const y = (a.m * a.y + b.m * b.y) / total;
          let vx = (a.m * a.vx + b.m * b.vx) / total;
          let vy = (a.m * a.vy + b.m * b.vy) / total;
          let m = total;
          let remnant: Remnant | undefined;
          // The fits are for pairs of black holes; nothing else radiates like this here.
          if (relativistic && isBlackHole(a) && isBlackHole(b)) {
            remnant = remnantOf(a.m, b.m);
            m = total * (1 - remnant.radiated);
            const rvx = lose.vx - keep.vx;
            const rvy = lose.vy - keep.vy;
            const speed = Math.hypot(rvx, rvy);
            if (speed > 0) {
              vx -= (rvx / speed) * remnant.kick;
              vy -= (rvy / speed) * remnant.kick;
            }
            keep.spin = remnant.spin;
          }
          keep.x = x;
          keep.y = y;
          keep.vx = vx;
          keep.vy = vy;
          keep.m = m;
          const out = collisionOutcome(a, b, m);
          if (out.kind !== (keep.kind ?? 'bh')) keep.name = undefined;
          keep.kind = out.kind;
          keep.radius = out.radius;
          keep.color = out.color;
          keep.typeId = out.typeId;
          bodies.splice(bodies.indexOf(lose), 1);
          events.push({ x, y, m, survivorId: keep.id, absorbedId: lose.id, remnant, radius: surfaceRadius(keep), supernova: out.supernova });
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

/** Newtonian kinetic + (softened) potential energy. Galaxies count as Plummer spheres: approximate for them. */
export function totalEnergy(bodies: Body[], softening: number): number {
  let e = 0;
  const eps2 = softening * softening;
  for (let i = 0; i < bodies.length; i++) {
    const bi = bodies[i];
    e += 0.5 * bi.m * (bi.vx * bi.vx + bi.vy * bi.vy);
    for (let j = i + 1; j < bodies.length; j++) {
      const bj = bodies[j];
      const r = Math.sqrt((bi.x - bj.x) ** 2 + (bi.y - bj.y) ** 2 + eps2 + (bi.soft ?? 0) ** 2 + (bj.soft ?? 0) ** 2);
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
  onMerge?: (e: MergeEvent, sense: number) => void,
): { steps: number; simulated: number } {
  let t = 0;
  let steps = 0;
  refreshAccelerations(bodies, opts);
  while (t < dt - 1e-12) {
    if (steps >= maxSteps) break;
    let h = Math.min(dt - t, stableDt(bodies, eta));
    if (!Number.isFinite(h)) h = dt - t;
    // Never take a vanishingly small step (a merge resolves the singular case).
    h = Math.min(dt - t, Math.max(h, dt * 1e-6));
    verletStep(bodies, h, opts);
    // Orbital sense before the merge removes the pair: it sets which way the ringdown rotates.
    let sense = 0;
    for (const b of bodies) sense += b.m * (b.x * b.vy - b.y * b.vx);
    const events = opts.merge === false ? [] : mergeBodies(bodies, opts.pn || opts.gw);
    if (events.length) {
      refreshAccelerations(bodies, opts);
      if (onMerge) for (const e of events) onMerge(e, sense);
    }
    onSubstep?.(h);
    t += h;
    steps++;
  }
  return { steps, simulated: t };
}
