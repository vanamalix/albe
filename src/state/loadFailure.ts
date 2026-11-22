/**
 * Lazily loaded parts that failed to arrive: usually a chunk from an older build after a redeploy,
 * or the network gone. Kept apart from React so the vite:preloadError handler can report too.
 */
import { useSyncExternalStore } from 'react';

let failed = false;
/** Inline "didn't load" messages on screen now; while any is showing, the page-wide notice stays away. */
let inline = 0;
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

/** A part failed to load somewhere no inline message can be shown (the 3D view, a preload). */
export function reportLoadFailure(): void {
  if (failed) return;
  failed = true;
  emit();
}

export function inlineShown(delta: 1 | -1): void {
  inline += delta;
  emit();
}

/** Whether the page-wide notice should show. */
export const noticeWanted = (): boolean => failed && inline === 0;

export function useLoadFailure(): boolean {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
  return noticeWanted();
}
