/**
 * Plays a chirp clip into an AudioContext that the Listen button created inside its own click (so
 * strict autoplay rules are met), loaded only then. A plain AudioBuffer, no worklet, nothing
 * fetched; the context is closed when the clip ends.
 */
import { chirpSound, type ChirpSound } from '../sim/chirpSound';
import { closeAudio } from './closeAudio';

/** Plays the strain as sound. Returns what was played, or null (and closes ctx) when there is no signal. */
export function playChirp(ctx: AudioContext, strain: ArrayLike<number>, solarPerUnit: number, oldestTime: number, onEnd: () => void): ChirpSound | null {
  const clip = chirpSound(strain, solarPerUnit, ctx.sampleRate, oldestTime);
  if (!clip) {
    closeAudio(ctx);
    return null;
  }
  const buffer = ctx.createBuffer(1, clip.samples.length, ctx.sampleRate);
  buffer.getChannelData(0).set(clip.samples);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => {
    closeAudio(ctx);
    onEnd();
  };
  source.start();
  return clip;
}
