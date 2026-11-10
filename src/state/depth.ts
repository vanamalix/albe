/**
 * How deep the explanations go: plain words, live numbers, or the equations with a reference. The
 * choice is remembered in localStorage when the browser allows it; the page works the same without.
 */
import { useSyncExternalStore } from 'react';

export type Depth = 'words' | 'numbers' | 'equation';
export const DEPTHS: { id: Depth; label: string }[] = [
  { id: 'words', label: 'Words' },
  { id: 'numbers', label: 'Numbers' },
  { id: 'equation', label: 'Equation' },
];

const KEY = 'albe.depth';
/** Equation by default: albe is pitched at a physics graduate. */
export const DEFAULT_DEPTH: Depth = 'equation';

const isDepth = (v: unknown): v is Depth => v === 'words' || v === 'numbers' || v === 'equation';

function read(): Depth {
  if (typeof window === 'undefined') return DEFAULT_DEPTH;
  try {
    const v = window.localStorage.getItem(KEY);
    return isDepth(v) ? v : DEFAULT_DEPTH;
  } catch {
    return DEFAULT_DEPTH;
  }
}

let depth: Depth = read();
const listeners = new Set<() => void>();

export function setDepth(d: Depth): void {
  depth = d;
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(KEY, d);
  } catch {
    // Storage blocked (private window, settings): the choice lasts for this visit only.
  }
  listeners.forEach((l) => l());
}

export const getDepth = (): Depth => depth;

export function useDepth(): Depth {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => depth,
  );
}
