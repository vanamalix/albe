/** State for the wormhole and Kerr exhibits, kept apart from the main store. */
import { useSyncExternalStore } from 'react';
import { euclidStore } from './euclid';

export type ExhibitId = 'wormhole' | 'kerr-drag' | 'kerr-penrose' | 'kerr-light' | 'euclid' | 'mp' | 'shadow' | 'microlens' | 'frw' | 'collapse';

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
  /** Balanced holes: coordinate separation, in units of one hole's M. */
  mpSep: number;
  /** Balanced holes: the window of impact parameters the fan and the plot cover. */
  mpB0: number;
  mpB1: number;
  /** Kerr shadow: spin a/M and inclination in degrees from the spin axis. */
  shSpin: number;
  shIncl: number;
  /** Microlensing: binary or point lens, mass ratio, separation (θ_E), the track's anchor and angle, and the source's place on it. */
  mlBinary: boolean;
  mlQ: number;
  mlD: number;
  mlX: number;
  mlY: number;
  mlAngle: number;
  mlS: number;
  /** Expanding universe: H₀ (km/s/Mpc), Ω_m, Ω_Λ, Ω_r; the time shown (Gyr since the start); the galaxy's redshift; proper or comoving grid. */
  H0: number;
  om: number;
  ol: number;
  or: number;
  frwT: number;
  frwZ: number;
  frwProper: boolean;
  /** Collapse: starting radius R₀/M and the dust's proper time as a fraction of the time to r = 0. */
  osR0: number;
  osTau: number;
}

/** Planck 2018 (H₀ = 67.4, Ω_m = 0.315), flat; Ω_r from the CMB with massless neutrinos (cosmology.ts). */
export const FRW_DEFAULTS = { H0: 67.4, om: 0.315, or: 9.2e-5, ol: 1 - 0.315 - 9.2e-5 };
export const SHADOW_DEFAULTS = { shSpin: 0.94, shIncl: 17 };
export const ML_DEFAULTS = { mlBinary: false, mlQ: 1, mlD: 1, mlX: 0, mlY: 0.3, mlAngle: 0.35, mlS: -1.2 };

let state: ExhibitSettings = {
  id: null,
  b: 22,
  aim: 0.6,
  speed: 0.6,
  spin: 0.9,
  decay: 0.45,
  mpSep: 3,
  mpB0: -6,
  mpB1: 6,
  ...SHADOW_DEFAULTS,
  ...ML_DEFAULTS,
  ...FRW_DEFAULTS,
  frwT: 13.8,
  frwZ: 2,
  frwProper: true,
  osR0: 10,
  osTau: 0.6,
};

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
  else if (id === 'mp') exhibitStore.set({ id, mpSep: 3, mpB0: -6, mpB1: 6 });
  else if (id === 'shadow') exhibitStore.set({ id, ...SHADOW_DEFAULTS });
  else if (id === 'microlens') exhibitStore.set({ id, ...ML_DEFAULTS });
  else if (id === 'frw') exhibitStore.set({ id, ...FRW_DEFAULTS, frwT: 13.8, frwZ: 2, frwProper: true });
  else if (id === 'collapse') exhibitStore.set({ id, osR0: 10, osTau: 0.6 });
  else if (id === 'euclid') {
    euclidStore.set({ geometry: 'flat', verts: [], circle: 0, perpendiculars: true, demo: 'none', dragging: false });
    exhibitStore.set({ id });
  }
  else exhibitStore.set({ id: null });
}

/** Penrose decays need a turning point inside the ergosphere for a particle from infinity (a > 0.828). */
export const penroseMinSpin = 0.85;
