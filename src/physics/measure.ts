/**
 * Measuring orbits the way an observer would: closest-approach pins, the angle between them, and
 * the closed forms the measurement is compared with. Pure maths, no rendering.
 *
 * Exact (one Schwarzschild mass, test particle):
 *  - apsidalAngle(): periapsis-to-periapsis angle from the elliptic integral (Darwin 1959).
 *  - radialFall(): proper and coordinate time for a fall from rest (MTW §31.4, Oppenheimer-Snyder cycloid).
 *  - properTimeBetween(): ∫ dr/√(E² − f(1 + L²/r²)), the clock time between two radii on one plunge.
 * Approximate, and labelled so: textbookAdvance() is the leading order 6πM/p, and
 * secondOrderAdvance() adds the (M/p)² term.
 */

/** A closest approach: the relative position, the radius and the unwrapped angle swept so far. */
export interface Pin {
  x: number;
  y: number;
  r: number;
  /** Total angle swept since tracking began, radians, signed with the sense of motion. */
  angle: number;
  /** Coordinate time of the closest approach. */
  t: number;
}

export const MAX_PINS = 16;
const PATH_POINTS = 1200;

/**
 * Watches a relative orbit (the separation vector and its rate) and drops a pin at each closest
 * approach, interpolated to where ṙ = 0 between samples. A pin needs the radius to have risen by a
 * small fraction since the last one, so the numerical jitter of a circular orbit leaves none.
 */
export class ApsisTracker {
  pins: Pin[] = [];
  /** Relative path, for the plan view: x0, y0, x1, y1, ... (oldest first, capped). */
  path: number[] = [];
  rmin = Infinity;
  rmax = 0;
  /** +1 for counter-clockwise motion. */
  sense = 1;
  private started = false;
  /** A start with ṙ = 0, held until the radius shows whether it was a periapsis. */
  private pendingStart: Pin | null = null;
  private prev = { x: 0, y: 0, rdot: 0, angle: 0, t: 0, r: 0 };
  private angle = 0;
  private highSince = 0;
  private lastPathR = 0;

  reset(): void {
    this.pins = [];
    this.path = [];
    this.rmin = Infinity;
    this.rmax = 0;
    this.started = false;
    this.pendingStart = null;
    this.angle = 0;
    this.highSince = 0;
  }

  observe(dx: number, dy: number, dvx: number, dvy: number, t: number): void {
    const r = Math.hypot(dx, dy);
    if (r <= 0) return;
    const rdot = (dx * dvx + dy * dvy) / r;
    if (!this.started) {
      this.started = true;
      this.sense = dx * dvy - dy * dvx >= 0 ? 1 : -1;
      const v = Math.hypot(dvx, dvy);
      // A start exactly at a turning point (ṙ = 0) is the first pin if the radius then rises.
      this.pendingStart = v > 0 && Math.abs(rdot) < 1e-9 * v ? { x: dx, y: dy, r, angle: 0, t } : null;
      this.prev = { x: dx, y: dy, rdot, angle: 0, t, r };
      this.highSince = r;
      this.pushPath(dx, dy, r, true);
      return;
    }
    const p = this.prev;
    let d = Math.atan2(dy, dx) - Math.atan2(p.y, p.x);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    this.angle += d;
    this.rmin = Math.min(this.rmin, r);
    this.rmax = Math.max(this.rmax, r);
    this.highSince = Math.max(this.highSince, r);
    const start = this.pendingStart;
    if (start && r > start.r * (1 + 1e-3)) {
      this.pendingStart = null;
      this.addPin(start);
    } else if (start && r < start.r * (1 - 1e-3)) {
      this.pendingStart = null; // it was the far point
    }
    if (p.rdot < 0 && rdot >= 0) {
      // Linear in ṙ between the two samples: the closest point, to second order in the step.
      const f = p.rdot / (p.rdot - rdot);
      const x = p.x + (dx - p.x) * f;
      const y = p.y + (dy - p.y) * f;
      const rr = Math.hypot(x, y);
      if (this.highSince - rr > 1e-3 * rr) {
        this.addPin({ x, y, r: rr, angle: p.angle + d * f, t: p.t + (t - p.t) * f });
        this.highSince = rr;
      }
    }
    this.prev = { x: dx, y: dy, rdot, angle: this.angle, t, r };
    this.pushPath(dx, dy, r, false);
  }

  /** Periapsis advance per orbit from the last two pins, radians (NaN until there are two). */
  get advance(): number {
    const n = this.pins.length;
    if (n < 2) return NaN;
    return Math.abs(this.pins[n - 1].angle - this.pins[n - 2].angle) - 2 * Math.PI;
  }

  private addPin(p: Pin): void {
    this.pins.push(p);
    if (this.pins.length > MAX_PINS) this.pins.shift();
  }

  private pushPath(x: number, y: number, r: number, force: boolean): void {
    const n = this.path.length;
    if (!force && n >= 2 && Math.hypot(x - this.path[n - 2], y - this.path[n - 1]) < 0.01 * Math.max(r, this.lastPathR)) return;
    this.lastPathR = r;
    this.path.push(x, y);
    if (this.path.length > PATH_POINTS * 2) this.path.splice(0, 2);
  }
}

/**
 * The angle a protractor reads between two arms from the centre, in the sense of motion, in
 * degrees on [0, 360).
 */
export function protractorReading(armA: number, armB: number, sense = 1): number {
  const deg = (((armB - armA) * sense * 180) / Math.PI) % 360;
  return deg < 0 ? deg + 360 : deg;
}

/** Real roots of a x³ + b x² + c x + d with three real roots (trigonometric form), ascending. */
function cubicRoots(a: number, b: number, c: number, d: number): number[] {
  const p = (3 * a * c - b * b) / (3 * a * a);
  const q = (2 * b ** 3 - 9 * a * b * c + 27 * a * a * d) / (27 * a ** 3);
  const r = 2 * Math.sqrt(-p / 3);
  const theta = Math.acos(Math.max(-1, Math.min(1, (3 * q) / (p * r))));
  return [0, 1, 2].map((k) => r * Math.cos((theta + 2 * Math.PI * k) / 3) - b / (3 * a)).sort((x, y) => x - y);
}

/**
 * Periapsis-to-periapsis angle (radians) of a bound Schwarzschild geodesic with specific energy E and
 * angular momentum L (both per unit rest mass): (du/dφ)² = 2M u³ − u² + (2M/L²) u + (E² − 1)/L², so
 * Δφ = 4 K(k) / √(2M (u₃ − u₁)), k² = (u₂ − u₁)/(u₃ − u₁). Exact (Darwin 1959).
 */
export function apsidalAngle(m: number, E2: number, L2: number): number {
  const [u1, u2, u3] = cubicRoots(2 * m, -1, (2 * m) / L2, (E2 - 1) / L2);
  const k2 = (u2 - u1) / (u3 - u1);
  let a = 1;
  let b = Math.sqrt(1 - k2);
  for (let i = 0; i < 40; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  return (4 * (Math.PI / (2 * a))) / Math.sqrt(2 * m * (u3 - u1));
}

/** E² and L² of a test particle at (dx, dy) from a mass m with proper velocity (ux, uy) = dx/dτ. */
export function geodesicConstants(m: number, dx: number, dy: number, ux: number, uy: number): { E2: number; L2: number } {
  const r = Math.hypot(dx, dy);
  const L = dx * uy - dy * ux;
  const rdot = (dx * ux + dy * uy) / r;
  const f = 1 - (2 * m) / r;
  return { E2: rdot * rdot + f * (1 + (L * L) / (r * r)), L2: L * L };
}

/** Semi-latus rectum p = a(1 − e²) from the closest and farthest radii. */
export const semiLatus = (rmin: number, rmax: number): number => (2 * rmin * rmax) / (rmin + rmax);

/** Leading-order advance 6πM/p per orbit, radians. First order in M/p. */
export const textbookAdvance = (m: number, rmin: number, rmax: number): number => (6 * Math.PI * m) / semiLatus(rmin, rmax);

/**
 * Advance to second order, 6πM/p + (3π/2)(18 + e²)(M/p)² (test-mass limit, Schwarzschild p). The
 * remainder is O((M/p)³). A test checks it against apsidalAngle().
 */
export function secondOrderAdvance(m: number, rmin: number, rmax: number): number {
  const p = semiLatus(rmin, rmax);
  const e = (rmax - rmin) / (rmax + rmin);
  const x = m / p;
  return 6 * Math.PI * x + ((3 * Math.PI) / 2) * (18 + e * e) * x * x;
}

/**
 * A fall from rest at R into mass m, at radius r (Schwarzschild r): proper time τ and coordinate
 * time t, with r = (R/2)(1 + cos η) (MTW eqs. 31.10). t diverges as r → 2M; τ stays finite.
 */
export function radialFall(m: number, R: number, r: number): { tau: number; t: number } {
  const eta = Math.acos(Math.max(-1, Math.min(1, (2 * r) / R - 1)));
  const k = Math.sqrt((R * R * R) / (8 * m));
  const tau = k * (eta + Math.sin(eta));
  const q = Math.sqrt(R / (2 * m) - 1);
  const tn = Math.tan(eta / 2);
  const t = 2 * m * Math.log(Math.abs((q + tn) / (q - tn))) + 2 * m * q * (eta + (R / (4 * m)) * (eta + Math.sin(eta)));
  return { tau, t };
}

/**
 * Proper time between radii r1 < r2 on an infalling geodesic with constants E², L²:
 * Δτ = ∫ dr / √(E² − f(1 + L²/r²)), with r = r1 + (r2 − r1)s², which removes an inverse-square-root
 * end point if r2 is a turning point.
 */
export function properTimeBetween(m: number, r1: number, r2: number, E2: number, L2: number): number {
  const span = r2 - r1;
  const g = (s: number): number => {
    const r = r1 + span * s * s;
    const radicand = E2 - (1 - (2 * m) / r) * (1 + L2 / (r * r));
    return radicand > 0 ? (2 * span * s) / Math.sqrt(radicand) : 0;
  };
  // Composite Simpson on s in [0, 1]: the substitution leaves a smooth integrand.
  const n = 400;
  let sum = g(0) + g(1);
  for (let i = 1; i < n; i++) sum += (i % 2 ? 4 : 2) * g(i / n);
  return (sum / (3 * n));
}
