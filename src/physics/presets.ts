/**
 * Preset scenes. Pure data (initial conditions); the World turns them into live objects.
 */
import type { ViewMode } from './fields';
import { circularSpeed } from './probes';

export interface PresetBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
}

export interface PresetProbe extends Omit<PresetBody, 'm'> {
  model: 'follow' | 'newton';
}

export interface PresetFan {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  count: number;
}

export interface Preset {
  id: string;
  name: string;
  /** One-line description shown when the preset loads. */
  note: string;
  bodies: PresetBody[];
  probes: PresetProbe[];
  fans: PresetFan[];
  settings: {
    timeScale: number;
    mode?: ViewMode;
    gr?: boolean;
    gw?: boolean;
    rings?: boolean;
  };
}

/** Speed at apoapsis/periapsis radius r of a Newtonian ellipse with semi-major axis a (vis-viva). */
const visViva = (m: number, r: number, a: number): number => Math.sqrt(m * (2 / r - 1 / a));

function singleBlackHole(): Preset {
  const M = 4;
  const ra = 90;
  // Newtonian periapsis 50; under the GR force law the same start dips to r ≈ 30 and precesses.
  const rp = 50;
  const a = (ra + rp) / 2;
  const vApo = visViva(M, ra, a);
  const rc = 34;
  const vc = circularSpeed(M, rc, true);
  return {
    id: 'single',
    name: 'Single black hole',
    note: 'M = 4: horizon 2M = 8, photon sphere 3M = 12, ISCO 6M = 24. The gold probe traces a GR rosette; the blue ghost is the same start under Newton (a closed ellipse).',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: M }],
    probes: [
      { x: ra, y: 0, vx: 0, vy: vApo, model: 'follow' },
      { x: ra, y: 0, vx: 0, vy: vApo, model: 'newton' },
      { x: -rc, y: 0, vx: 0, vy: -vc, model: 'follow' },
      { x: 0, y: 26, vx: -circularSpeed(M, 26, true), vy: 0, model: 'follow' },
    ],
    fans: [],
    settings: { timeScale: 160, mode: 'space', gr: true, gw: false, rings: true },
  };
}

function mercury(): Preset {
  const M = 1;
  const a = 40;
  const e = 0.2;
  const rp = a * (1 - e);
  return {
    id: 'mercury',
    name: 'Sun–Mercury precession (exaggerated)',
    note: 'Orbit with a = 40M, e = 0.2: GR predicts Δφ = 6πM/(a(1−e²)) ≈ 28° per orbit. Mercury’s real orbit has a ≈ 4×10⁷ solar M, so its 43″/century (0.1″ per orbit) is ~10⁶× smaller. Blue = Newtonian ghost.',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: M }],
    probes: [
      { x: rp, y: 0, vx: 0, vy: visViva(M, rp, a), model: 'follow' },
      { x: rp, y: 0, vx: 0, vy: visViva(M, rp, a), model: 'newton' },
    ],
    fans: [],
    settings: { timeScale: 220, mode: 'time', gr: true, gw: false, rings: false },
  };
}

function binary(): Preset {
  const m = 2;
  const sep = 40;
  const v = Math.sqrt((2 * m) / sep) / 2;
  const probes: PresetProbe[] = [];
  const R = 115;
  const n = 24;
  const vc = circularSpeed(2 * m, R, true);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    probes.push({ x: R * Math.cos(t), y: R * Math.sin(t), vx: -vc * Math.sin(t), vy: vc * Math.cos(t), model: 'follow' });
  }
  return {
    id: 'binary',
    name: 'Binary black holes (GW inspiral)',
    note: 'Two M = 2 holes, 40 apart. Inspiral uses the Peters (1964) quadrupole energy loss applied as a drag: an orbit-averaged estimate, not a waveform model. Toggle “GW inspiral” off for a steady orbit.',
    bodies: [
      { x: sep / 2, y: 0, vx: 0, vy: v, m },
      { x: -sep / 2, y: 0, vx: 0, vy: -v, m },
    ],
    probes,
    fans: [],
    settings: { timeScale: 60, mode: 'space', gr: true, gw: true, rings: true },
  };
}

/** Chenciner & Montgomery (2000) figure-eight, G = m = 1 initial conditions, rescaled by λ. */
export function figureEight(lambda = 40, m = 1): PresetBody[] {
  const x1 = 0.97000436;
  const y1 = -0.24308753;
  const vx3 = -0.93240737;
  const vy3 = -0.86473146;
  const vs = Math.sqrt(m / lambda);
  return [
    { x: x1 * lambda, y: y1 * lambda, vx: (-vx3 / 2) * vs, vy: (-vy3 / 2) * vs, m },
    { x: -x1 * lambda, y: -y1 * lambda, vx: (-vx3 / 2) * vs, vy: (-vy3 / 2) * vs, m },
    { x: 0, y: 0, vx: vx3 * vs, vy: vy3 * vs, m },
  ];
}

function eight(): Preset {
  return {
    id: 'eight',
    name: 'Three-body figure-eight',
    note: 'Chenciner–Montgomery (2000) choreography: three equal masses chase each other around one figure-eight (Newtonian N-body; period ≈ 6.33 λ^{3/2} with λ = 40).',
    bodies: figureEight(),
    probes: [],
    fans: [],
    settings: { timeScale: 150, mode: 'time', gr: true, gw: false, rings: false },
  };
}

function lensing(): Preset {
  return {
    id: 'lensing',
    name: 'Gravitational lensing fan',
    note: 'A parallel fan of light rays passes a mass M = 3. Weak-field deflection ≈ 4M/b (twice Newton’s value; Dyson, Eddington & Davidson 1920). Rays crossing r = 2M are captured. Use the Light fan tool to fire more.',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: 3 }],
    probes: [],
    fans: [{ x: -145, y: 0, dx: 1, dy: 0, width: 150, count: 31 }],
    settings: { timeScale: 60, mode: 'space', gr: true, gw: false, rings: true },
  };
}

function empty(): Preset {
  return {
    id: 'empty',
    name: 'Empty: build your own',
    note: 'Flat spacetime. Pick the Mass tool and click to place a mass; drag to give it a velocity.',
    bodies: [],
    probes: [],
    fans: [],
    settings: { timeScale: 60, mode: 'space', gw: false },
  };
}

export const PRESETS: Preset[] = [singleBlackHole(), mercury(), binary(), eight(), lensing(), empty()];

export const presetById = (id: string): Preset => PRESETS.find((p) => p.id === id) ?? PRESETS[0];
