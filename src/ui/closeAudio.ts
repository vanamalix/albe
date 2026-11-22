/** Closing the Listen sound's AudioContext from any path (no signal, the next press, leaving the view). */

/**
 * Closes ctx once. A second close() on a real AudioContext rejects with InvalidStateError, and a
 * close that rejects for any other reason has nothing left to release, so the rejection is handled.
 */
const asked = new WeakSet<AudioContext>();

export function closeAudio(ctx: AudioContext | null | undefined): void {
  // `state` turns to 'closed' only once the close completes in some engines: remember the request too.
  if (!ctx || ctx.state === 'closed' || asked.has(ctx)) return;
  asked.add(ctx);
  ctx.close().catch(() => {});
}
