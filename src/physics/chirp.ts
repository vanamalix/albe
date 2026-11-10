/**
 * Reading a chirp off the strain, as a detector would. Pure maths.
 *
 * Neighbouring extrema of h₊ are half a gravitational-wave period apart, so two of them give f, and
 * two such readings give ḟ (and, integrated, ℳ: chirpMassBetween). At leading (quadrupole, Newtonian-orbit) order the chirp mass follows:
 *
 *     ℳ = (5/96)^(3/5) π^(−8/5) f^(−11/5) ḟ^(3/5)          (G = c = 1)
 *
 * (Cutler & Flanagan 1994). The simulated orbit also has 1PN terms, so the reading differs from the
 * true ℳ = (m₁m₂)^(3/5)/M^(1/5) by a relative amount of order v² = (πMf)^(2/3): that gap is real.
 */

export interface Extremum {
  /** Fractional sample index (parabolic refinement). */
  index: number;
  value: number;
}

/**
 * Local maxima and minima of a sampled signal, refined by a parabola through three samples. Extrema
 * smaller than `floor` × the largest |value| are skipped (the faded-in start, numerical noise).
 */
export function strainExtrema(h: ArrayLike<number>, floor = 0.05): Extremum[] {
  let peak = 0;
  for (let i = 0; i < h.length; i++) peak = Math.max(peak, Math.abs(h[i]));
  const out: Extremum[] = [];
  if (peak === 0) return out;
  for (let i = 1; i < h.length - 1; i++) {
    const a = h[i - 1];
    const b = h[i];
    const c = h[i + 1];
    const isMax = b > a && b >= c;
    const isMin = b < a && b <= c;
    if (!isMax && !isMin) continue;
    if (Math.abs(b) < floor * peak) continue;
    const denom = a - 2 * b + c;
    const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
    out.push({ index: i + Math.max(-0.5, Math.min(0.5, shift)), value: b - 0.25 * (a - c) * shift });
  }
  return out;
}

/** Gravitational-wave frequency from two extrema `halfCycles` half-periods apart, Δt apart in time. */
export const frequencyFromExtrema = (dt: number, halfCycles = 1): number => halfCycles / (2 * Math.abs(dt));

/** Leading-order chirp mass from f and ḟ (G = c = 1). NaN unless ḟ > 0. */
export function chirpMassFrom(f: number, fdot: number): number {
  if (!(f > 0) || !(fdot > 0)) return NaN;
  return Math.pow(5 / 96, 3 / 5) * Math.pow(Math.PI, -8 / 5) * Math.pow(f, -11 / 5) * Math.pow(fdot, 3 / 5);
}

/**
 * The same leading-order law, integrated: f^(−8/3) falls linearly in time at the rate
 * (256/5) π^(8/3) ℳ^(5/3), so two frequency readings any distance apart give ℳ without
 * differencing. NaN unless f rises.
 */
export function chirpMassBetween(f1: number, t1: number, f2: number, t2: number): number {
  const drop = Math.pow(f1, -8 / 3) - Math.pow(f2, -8 / 3);
  const dt = t2 - t1;
  if (!(drop > 0) || !(dt > 0)) return NaN;
  return Math.pow((5 / 256) * (drop / (Math.pow(Math.PI, 8 / 3) * dt)), 3 / 5);
}

/** The true chirp mass of a pair. */
export const chirpMassOf = (m1: number, m2: number): number => Math.pow(m1 * m2, 3 / 5) / Math.pow(m1 + m2, 1 / 5);

/**
 * Leading-order f(τ) of a circular inspiral τ before coalescence: f = (1/π)(5/(256 τ))^(3/8) ℳ^(−5/8).
 * Used by the tests to build an exact quadrupole chirp.
 */
export const quadrupoleFrequency = (chirpMass: number, tau: number): number => (1 / Math.PI) * Math.pow(5 / (256 * tau), 3 / 8) * Math.pow(chirpMass, -5 / 8);

/** A reading built from up to four marked extrema: two pairs, each giving f at its midpoint. */
export interface ChirpReading {
  f1?: number;
  t1?: number;
  f2?: number;
  t2?: number;
  fdot?: number;
  chirpMass?: number;
}

/**
 * Marks are times of extrema, in order of time; `halfCycles[i]` is how many half-periods lie
 * between marks 2i and 2i+1. Two marks give f; four give ḟ and ℳ.
 */
export function readChirp(marks: readonly number[], halfCycles: readonly number[]): ChirpReading {
  const out: ChirpReading = {};
  if (marks.length >= 2) {
    out.f1 = frequencyFromExtrema(marks[1] - marks[0], halfCycles[0] ?? 1);
    out.t1 = (marks[0] + marks[1]) / 2;
  }
  if (marks.length >= 4) {
    out.f2 = frequencyFromExtrema(marks[3] - marks[2], halfCycles[1] ?? 1);
    out.t2 = (marks[2] + marks[3]) / 2;
    const dt = out.t2 - out.t1!;
    if (dt !== 0) {
      out.fdot = (out.f2 - out.f1!) / dt;
      out.chirpMass = chirpMassBetween(out.f1!, out.t1!, out.f2, out.t2);
    }
  }
  return out;
}
