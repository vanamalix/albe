/**
 * Hear the chirp: the app's own strain history turned into sound. Pure arithmetic, no Web Audio, so
 * it can be tested; ui/chirpAudio.ts plays the result.
 *
 * Time in albe is in units of G·(1 unit of mass)/c³. Choosing what one unit of mass is fixes the
 * pitch and duration: with 1 unit = 20 M☉ the time unit is 20 × 4.93 µs. Frequencies scale as
 * 1/mass, so a lighter choice is higher and shorter by the same factor, and still a real binary.
 *
 * Loudness is not real: the samples are scaled so the loudest is at a fixed level. The shape of
 * the waveform, including how its amplitude rises, is the simulation's.
 */
import { SUN_GM_METRES } from '../physics/bodies';
import { strainExtrema } from '../physics/chirp';
import { WAVE_FADE_IN, WAVE_SPACING } from './waves';

/** G M☉ / c³ in seconds. */
export const SUN_TIME_S = SUN_GM_METRES / 299_792_458;
/** The loudest sample's level after normalising. */
export const PEAK_LEVEL = 0.8;
/** Raised-cosine fades at each end, seconds, so the start and stop do not click. */
const EDGE_S = 0.004;

export interface ChirpSound {
  samples: Float32Array;
  rate: number;
  seconds: number;
  /** Lowest and highest wave frequency in the clip, Hz (from neighbouring extrema). */
  fLow: number;
  fHigh: number;
  /** Whether the pitch ever falls by more than 10% from its highest so far (it can at merger, where
   * the last orbit's frequency and the ringdown's need not join smoothly). */
  drops: boolean;
  /** Seconds per unit of simulation time. */
  unitSeconds: number;
}

/**
 * Builds the clip from the strain history (oldest first, spaced WAVE_SPACING in time), with one unit
 * of mass taken as `solarPerUnit` M☉, resampled linearly to `rate` per second. Leading and trailing
 * stretches quieter than 0.1% of the peak are dropped. Null when there is no signal.
 *
 * `oldestTime` is the simulation time of strain[0]: frequencies are read only after the scene's
 * fade-in (WAVE_FADE_IN), which distorts the first half-cycle.
 */
export function chirpSound(strain: ArrayLike<number>, solarPerUnit: number, rate: number, oldestTime = Infinity): ChirpSound | null {
  let peak = 0;
  for (let i = 0; i < strain.length; i++) peak = Math.max(peak, Math.abs(strain[i]));
  if (!(peak > 0)) return null;
  let a = 0;
  let b = strain.length - 1;
  while (a < b && Math.abs(strain[a]) < 1e-3 * peak) a++;
  while (b > a && Math.abs(strain[b]) < 1e-3 * peak) b--;
  if (b - a < 4) return null;
  const unitSeconds = solarPerUnit * SUN_TIME_S;
  const step = WAVE_SPACING * unitSeconds;
  const seconds = (b - a) * step;
  const n = Math.max(2, Math.round(seconds * rate));
  const out = new Float32Array(n);
  const edge = Math.max(1, Math.round(EDGE_S * rate));
  for (let i = 0; i < n; i++) {
    const k = a + i / rate / step;
    const k0 = Math.min(b - 1, Math.floor(k));
    const f = k - k0;
    let v = ((strain[k0] * (1 - f) + strain[k0 + 1] * f) / peak) * PEAK_LEVEL;
    const fromEnd = Math.min(i, n - 1 - i);
    if (fromEnd < edge) v *= 0.5 - 0.5 * Math.cos((Math.PI * fromEnd) / edge);
    out[i] = v;
  }
  const ext = strainExtrema(Array.from({ length: b - a + 1 }, (_, i) => strain[a + i]));
  let fLow = Infinity;
  let fHigh = 0;
  let drops = false;
  const settled = (WAVE_FADE_IN - oldestTime) / WAVE_SPACING - a;
  for (let i = 1; i < ext.length; i++) {
    if (ext[i - 1].index < settled) continue;
    // Neighbouring extrema are half a period apart.
    const f = 1 / (2 * (ext[i].index - ext[i - 1].index) * step);
    if (f < 0.9 * fHigh) drops = true;
    fLow = Math.min(fLow, f);
    fHigh = Math.max(fHigh, f);
  }
  return { samples: out, rate, seconds, fLow, fHigh, drops, unitSeconds };
}
