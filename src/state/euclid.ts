/** State for the Euclid exhibit, shared by its panel and its 3D view. */
import { useSyncExternalStore } from 'react';
import type { GeometryId } from '../physics/euclid';

export type EuclidDemo = 'none' | 'antipodes' | 'edge' | 'taxicab';

export interface EuclidState {
  geometry: GeometryId;
  /** Triangle vertices in the geometry's chart. */
  verts: [number, number][];
  /** Proper radius of the circle about vertex A (0 = none). */
  circle: number;
  /** Perpendiculars raised at A and B. */
  perpendiculars: boolean;
  demo: EuclidDemo;
  /** True while a vertex is being dragged (cheaper geodesics). */
  dragging: boolean;
}

let state: EuclidState = { geometry: 'flat', verts: [], circle: 0, perpendiculars: true, demo: 'none', dragging: false };
const listeners = new Set<() => void>();

export const euclidStore = {
  get: (): EuclidState => state,
  set(patch: Partial<EuclidState>): void {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useEuclid<T>(selector: (s: EuclidState) => T): T {
  return useSyncExternalStore(euclidStore.subscribe, () => selector(state));
}
