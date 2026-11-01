/** Tiny external store for UI settings (read reactively by React, imperatively by the render loop). */
import { useSyncExternalStore } from 'react';
import type { FieldSample, ViewMode } from '../physics/fields';

export type Tool = 'view' | 'mass' | 'probe' | 'ray' | 'fan' | 'select';

export const TOOLS: { id: Tool; label: string; key: string; hint: string }[] = [
  { id: 'view', label: 'View', key: '1', hint: 'Drag to orbit the camera, scroll or pinch to zoom, right-drag to pan.' },
  { id: 'mass', label: 'Mass', key: '2', hint: 'Click: mass on a circular orbit (or at rest in empty space). Drag: aim its velocity.' },
  { id: 'probe', label: 'Test particle', key: '3', hint: 'Click: circular orbit about the strongest pull. Drag: aim its velocity.' },
  { id: 'ray', label: 'Light ray', key: '4', hint: 'Click and drag to aim a single light ray.' },
  { id: 'fan', label: 'Light fan', key: '5', hint: 'Click and drag to aim a parallel fan of rays (lensing).' },
  { id: 'select', label: 'Select', key: '6', hint: 'Click a mass to select it, drag to move it. Delete key removes it.' },
];

export interface Readout extends FieldSample {
  x: number;
  y: number;
}

export interface Settings {
  tool: Tool;
  /** log10 of the mass to place. */
  logMass: number;
  playing: boolean;
  /** Simulation time units per real second. */
  timeScale: number;
  mode: ViewMode;
  grid: boolean;
  trails: boolean;
  rings: boolean;
  arrows: boolean;
  gr: boolean;
  gw: boolean;
  exaggeration: number;
  selectedId: number | null;
  aboutOpen: boolean;
  settingsOpen: boolean;
  presetId: string;
  note: string;
  readout: Readout | null;
  stats: { bodies: number; probes: number; rays: number; simTime: number; throttled: boolean; fps: number };
  /** Bumped to ask the scene to reload the current preset. */
  resetToken: number;
}

let state: Settings = {
  tool: 'view',
  logMass: 0,
  playing: true,
  timeScale: 60,
  mode: 'space',
  grid: true,
  trails: true,
  rings: true,
  arrows: false,
  gr: true,
  gw: false,
  exaggeration: 1,
  selectedId: null,
  aboutOpen: false,
  settingsOpen: false,
  presetId: 'single',
  note: '',
  readout: null,
  stats: { bodies: 0, probes: 0, rays: 0, simTime: 0, throttled: false, fps: 60 },
  resetToken: 0,
};

const listeners = new Set<() => void>();

export const store = {
  get: (): Settings => state,
  set(patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)): void {
    const p = typeof patch === 'function' ? patch(state) : patch;
    state = { ...state, ...p };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

export function useStore<T>(selector: (s: Settings) => T): T {
  return useSyncExternalStore(store.subscribe, () => selector(state));
}

export const massFromLog = (l: number): number => Math.pow(10, l);
