import { describe, expect, it } from 'vitest';
import { closeAudio } from './closeAudio';

/** A stand-in AudioContext whose close() rejects once it is closed, as the real one does. Records what it returned. */
function fakeContext(reject = false) {
  const ctx = {
    state: 'running' as AudioContextState,
    returned: [] as Promise<void>[],
    close() {
      const p = reject || ctx.state === 'closed' ? Promise.reject(new Error('InvalidStateError: Cannot close a closed AudioContext.')) : Promise.resolve();
      ctx.state = 'closed';
      ctx.returned.push(p);
      return p;
    },
  };
  return ctx;
}

describe('closing the Listen audio context', () => {
  it('closes once, however often it is asked: playChirp with no signal, the next press, then leaving the view', () => {
    const ctx = fakeContext();
    closeAudio(ctx as unknown as AudioContext);
    closeAudio(ctx as unknown as AudioContext);
    closeAudio(ctx as unknown as AudioContext);
    closeAudio(null);
    expect(ctx.returned.length).toBe(1);
  });

  it('handles a close that rejects, so nothing reaches the console as an unhandled rejection', async () => {
    const ctx = fakeContext(true);
    const seen: Promise<void>[] = [];
    const real = Promise.prototype.catch;
    // Record the promises a handler is attached to.
    Promise.prototype.catch = function (this: Promise<void>, f) {
      seen.push(this);
      return real.call(this, f);
    } as typeof Promise.prototype.catch;
    try {
      closeAudio(ctx as unknown as AudioContext);
    } finally {
      Promise.prototype.catch = real;
    }
    expect(ctx.returned.length).toBe(1);
    expect(seen).toContain(ctx.returned[0]);
  });
});
