/**
 * Gravitational waves from the quadrupole formula, with finite speed c = 1.
 *
 * Keeps a history of Ï_ij, the second time derivative of the mass quadrupole, so the sheet can show
 * the signal each point has received so far: an observer in the orbital plane at distance r in
 * direction φ measures h₊ = −Ï_tt(t − r) / r, with t̂ the in-plane tangent. Amplitudes are real in
 * shape but scaled for display, since true strain is far too small to draw.
 *
 * After a merger, a damped l = m = 2 ringdown continues the signal, using the Kerr quasinormal
 * frequency and quality factor of Berti, Cardoso & Will (2006).
 */
import type { Body } from '../physics/types';

export const WAVE_SAMPLES = 1024;
/** Simulation time between samples. With c = 1 this is also the radial spacing of the history. */
export const WAVE_SPACING = 2;
/** Height of the largest ripple on the sheet at its softening radius. */
export const WAVE_DISPLAY_HEIGHT = 12;
/** A new scene eases its signal in over this long, so no artificial wavefront spreads from t = 0. */
const WAVE_FADE_IN = 120;
/** The 1/r falloff is softened inside this radius, where the far-field formula does not hold. */
export const WAVE_SOFTENING = 40;

export interface Quadrupole {
  xx: number;
  yy: number;
  xy: number;
}

/** Ï_ij = Σ m (2 v_i v_j + x_i a_j + a_i x_j), about the centre of mass. */
export function quadrupoleDD(bodies: readonly Body[]): Quadrupole {
  const out = { xx: 0, yy: 0, xy: 0 };
  let M = 0;
  let cx = 0;
  let cy = 0;
  let cvx = 0;
  let cvy = 0;
  for (const b of bodies) {
    M += b.m;
    cx += b.m * b.x;
    cy += b.m * b.y;
    cvx += b.m * b.vx;
    cvy += b.m * b.vy;
  }
  if (M === 0) return out;
  cx /= M;
  cy /= M;
  cvx /= M;
  cvy /= M;
  for (const b of bodies) {
    const x = b.x - cx;
    const y = b.y - cy;
    const vx = b.vx - cvx;
    const vy = b.vy - cvy;
    out.xx += b.m * (2 * vx * vx + 2 * x * b.ax);
    out.yy += b.m * (2 * vy * vy + 2 * y * b.ay);
    out.xy += b.m * (2 * vx * vy + x * b.ay + y * b.ax);
  }
  return out;
}

/** Fundamental l = m = 2 Kerr mode: angular frequency ω (for mass M) and damping time. */
export function ringdownMode(mass: number, spin: number): { omega: number; tau: number } {
  const b = Math.max(1e-3, 1 - spin);
  const omega = (1.5251 - 1.1568 * Math.pow(b, 0.1292)) / mass;
  const quality = 0.7 + 1.4187 * Math.pow(b, -0.499);
  return { omega, tau: (2 * quality) / omega };
}

interface Ringdown {
  start: number;
  plus: number;
  cross: number;
  omega: number;
  tau: number;
  /** +1 for counter-clockwise rotation. */
  sense: number;
}

const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class WaveBuffer {
  /** RGBA float texture data: Ï_xx, Ï_yy, Ï_xy, unused. Slot `head` is the newest sample. */
  readonly data = new Float32Array(WAVE_SAMPLES * 4);
  head = 0;
  /** Recent peak of |Ï|, used to scale the drawing. */
  peak = 0;
  cx = 0;
  cy = 0;
  /** Bumped when the data changes, so the texture is only uploaded when needed. */
  version = 0;
  private nextTime = 0;
  private last: Quadrupole = { xx: 0, yy: 0, xy: 0 };
  private ring: Ringdown | null = null;

  reset(): void {
    this.data.fill(0);
    this.head = 0;
    this.peak = 0;
    this.nextTime = 0;
    this.last = { xx: 0, yy: 0, xy: 0 };
    this.ring = null;
    this.version++;
  }

  /** Starts the ringdown, continuing smoothly from the last quadrupole sample. */
  beginRingdown(time: number, mass: number, spin: number, sense: number): void {
    const { omega, tau } = ringdownMode(mass, spin);
    this.ring = { start: time, plus: (this.last.xx - this.last.yy) / 2, cross: this.last.xy, omega, tau, sense: sense >= 0 ? 1 : -1 };
  }

  private ringdownAt(time: number): Quadrupole {
    const r = this.ring;
    if (!r) return { xx: 0, yy: 0, xy: 0 };
    const dt = time - r.start;
    if (dt > r.tau * 12) {
      this.ring = null;
      return { xx: 0, yy: 0, xy: 0 };
    }
    const decay = Math.exp(-dt / r.tau);
    const c = Math.cos(r.omega * dt);
    const s = Math.sin(r.omega * dt) * r.sense;
    const plus = decay * (r.plus * c - r.cross * s);
    const cross = decay * (r.cross * c + r.plus * s);
    return { xx: plus, yy: -plus, xy: cross };
  }

  /** Records every sample due up to `time`. Call once per simulation sub-step. */
  advance(time: number, bodies: readonly Body[]): void {
    if (time < this.nextTime) return;
    const q = bodies.length > 1 ? quadrupoleDD(bodies) : { xx: 0, yy: 0, xy: 0 };
    if (bodies.length > 1) this.last = q;
    let M = 0;
    let cx = 0;
    let cy = 0;
    for (const b of bodies) {
      M += b.m;
      cx += b.m * b.x;
      cy += b.m * b.y;
    }
    if (M > 0) {
      this.cx = cx / M;
      this.cy = cy / M;
    }
    while (time >= this.nextTime) {
      const r = this.ringdownAt(this.nextTime);
      const ease = Math.min(1, this.nextTime / WAVE_FADE_IN);
      const xx = (q.xx + r.xx) * ease;
      const yy = (q.yy + r.yy) * ease;
      const xy = (q.xy + r.xy) * ease;
      this.head = (this.head + 1) % WAVE_SAMPLES;
      const i = this.head * 4;
      this.data[i] = xx;
      this.data[i + 1] = yy;
      this.data[i + 2] = xy;
      this.peak = Math.max(this.peak * 0.998, Math.abs(xx - yy) / 2, Math.abs(xy));
      this.nextTime += WAVE_SPACING;
    }
    this.version++;
  }

  /** Display gain: the shader multiplies by this too. */
  get gain(): number {
    return this.peak > 0 ? (WAVE_DISPLAY_HEIGHT * 2 * WAVE_SOFTENING) / this.peak : 0;
  }

  /** Quadrupole received `age` time units after emission (linear between samples). */
  sampleAt(age: number): Quadrupole | null {
    const k = age / WAVE_SPACING;
    if (k >= WAVE_SAMPLES - 1) return null;
    const i0 = Math.floor(k);
    const f = k - i0;
    const a = ((this.head - i0 + WAVE_SAMPLES * 2) % WAVE_SAMPLES) * 4;
    const b = ((this.head - i0 - 1 + WAVE_SAMPLES * 2) % WAVE_SAMPLES) * 4;
    const d = this.data;
    return { xx: d[a] + (d[b] - d[a]) * f, yy: d[a + 1] + (d[b + 1] - d[a + 1]) * f, xy: d[a + 2] + (d[b + 2] - d[a + 2]) * f };
  }

  /** Sheet height at (x, y). Mirrors waveHeight() in scene/shaders.ts. */
  ripple(x: number, y: number): number {
    const dx = x - this.cx;
    const dy = y - this.cy;
    const r = Math.hypot(dx, dy);
    if (r < 1e-6 || this.peak === 0) return 0;
    const q = this.sampleAt(r);
    if (!q) return 0;
    const sin = dy / r;
    const cos = dx / r;
    const tt = sin * sin * q.xx + cos * cos * q.yy - 2 * sin * cos * q.xy;
    const fade = 1 - smoothstep(0.8 * WAVE_SAMPLES, WAVE_SAMPLES, r / WAVE_SPACING);
    return (-tt * this.gain * r * fade) / (r * r + WAVE_SOFTENING * WAVE_SOFTENING);
  }

  /** Face-on strain h₊·D, newest last, for the chirp plot. */
  recentStrain(count: number): Float32Array {
    const out = new Float32Array(count);
    for (let k = 0; k < count; k++) {
      const i = ((this.head - k + WAVE_SAMPLES * 2) % WAVE_SAMPLES) * 4;
      out[count - 1 - k] = this.data[i] - this.data[i + 1];
    }
    return out;
  }
}
