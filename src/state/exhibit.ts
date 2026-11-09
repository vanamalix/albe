/** State for the wormhole and Kerr exhibits, kept apart from the main store. */
import { useSyncExternalStore } from 'react';

export type ExhibitId = 'wormhole' | 'kerr-drag' | 'kerr-penrose' | 'kerr-light';

export interface ExhibitSettings {
  /** The exhibit on screen, or null for the normal sheet. */
  id: ExhibitId | null;
  /** Wormhole throat radius, in world units. */
  b: number;
  /** The aimed ray's impact parameter, as a fraction of b. */
  aim: number;
  /** The matter traveller's speed, as a fraction of c. */
  speed: number;
  /** Kerr spin a/M. */
  spin: number;
  /** Where the Penrose parent turns round, 0 = deepest allowed, 1 = the edge of the ergosphere. */
  decay: number;
}

let state: ExhibitSettings = { id: null, b: 22, aim: 0.6, speed: 0.6, spin: 0.9, decay: 0.45 };

const listeners = new Set<() => void>();

export const exhibitStore = {
  get: (): ExhibitSettings => state,
  set(patch: Partial<ExhibitSettings>): void {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useExhibit<T>(selector: (s: ExhibitSettings) => T): T {
  return useSyncExternalStore(exhibitStore.subscribe, () => selector(state));
}

/** Sets the exhibit with defaults that show it off. Call from the preset loader; pass null for the normal sheet. */
export function openExhibit(id: ExhibitId | null): void {
  if (id === 'kerr-penrose') exhibitStore.set({ id, spin: 0.998, decay: 0.12 });
  else if (id === 'kerr-drag' || id === 'kerr-light') exhibitStore.set({ id, spin: 0.9 });
  else if (id === 'wormhole') exhibitStore.set({ id, b: 22, aim: 0.6, speed: 0.6 });
  else exhibitStore.set({ id: null });
}

/** Penrose decays need a turning point inside the ergosphere for a particle from infinity (a > 0.828). */
export const penroseMinSpin = 0.85;
