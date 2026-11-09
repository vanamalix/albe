/**
 * Preset scenes. Pure data (initial conditions); the World turns them into live objects.
 */
import { BODY_TYPES, bodyType, blackbody, displayRadius, haloEnclosed, SOLAR, typeMass } from './bodies';
import type { ViewMode } from './fields';
import { circularSpeed } from './probes';
import { seeded, type DiskOptions } from './swarm';
import type { BodyKind } from './types';
import type { ExhibitId } from '../state/exhibit';

export interface PresetBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
  kind?: BodyKind;
  radius?: number;
  soft?: number;
  color?: [number, number, number];
  typeId?: string;
  name?: string;
}

export interface PresetProbe extends Omit<PresetBody, 'm'> {
  model: 'follow' | 'newton';
  /** Shown in the clock card. */
  label?: string;
}

export interface PresetFan {
  x: number;
  y: number;
  dx: number;
  dy: number;
  width: number;
  count: number;
}

export interface PresetDisk extends DiskOptions {
  /** Index into `bodies` of the galaxy this disk belongs to. */
  host: number;
}

export type SceneGroup = 'Relativity' | 'Three bodies' | 'Stars and planets' | 'Galaxies' | 'Exotic' | 'Sandbox';

export interface Preset {
  id: string;
  name: string;
  group: SceneGroup;
  /** One-line description shown when the preset loads. */
  note: string;
  bodies: PresetBody[];
  probes: PresetProbe[];
  fans: PresetFan[];
  disks?: PresetDisk[];
  swarm?: { selfGravity: boolean; softening: number; dt: number };
  settings: {
    timeScale: number;
    mode?: ViewMode;
    gr?: boolean;
    gw?: boolean;
    /** 1PN corrections for the masses (default on). */
    pn?: boolean;
    rings?: boolean;
    /** Start paused. */
    paused?: boolean;
    /** How much farther away the camera starts. */
    view?: number;
    /** False lets bodies pass through each other. */
    merge?: boolean;
    /** Multiplier on galaxy-galaxy friction. */
    friction?: number;
    /** Start a twin of the system displaced by this much (chaos). */
    ghost?: number;
    /** Replaces the sheet with a self-contained exact-geometry exhibit. */
    exhibit?: ExhibitId;
  };
}

/** Speed at apoapsis/periapsis radius r of a Newtonian ellipse with semi-major axis a (vis-viva). */
const visViva = (m: number, r: number, a: number): number => Math.sqrt(m * (2 / r - 1 / a));

/**
 * Relative speed for a circular orbit under the 1PN force law used for the masses: solving
 * v²/r = (M/r²)(1 + (1 + 3ν) v² − (4 + 2ν) M/r) for v², so the orbit starts exactly round.
 */
export function circularBinarySpeed(m1: number, m2: number, r: number): number {
  const M = m1 + m2;
  const nu = (m1 * m2) / (M * M);
  const x = M / r;
  return Math.sqrt((x * (1 - (4 + 2 * nu) * x)) / (1 - (1 + 3 * nu) * x));
}

/** Two bodies at separation r in the centre-of-mass frame, on the x axis, moving along ±y. */
function pairOf(m1: number, m2: number, r: number, speed: number): PresetBody[] {
  const M = m1 + m2;
  return [
    { x: (m2 / M) * r, y: 0, vx: 0, vy: (m2 / M) * speed, m: m1 },
    { x: (-m1 / M) * r, y: 0, vx: 0, vy: (-m1 / M) * speed, m: m2 },
  ];
}

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
    group: 'Relativity',
    name: 'Single black hole',
    note: 'M = 4: horizon 2M = 8, photon sphere 3M = 12, ISCO 6M = 24. The gold particle traces a GR rosette. The blue ghost is the same start under Newton, a closed ellipse.',
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
    group: 'Relativity',
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
    group: 'Relativity',
    name: 'Binary black holes (inspiral)',
    note: 'Two M = 2 holes, 40 apart, losing energy to gravitational waves through 2.5PN radiation reaction. When they merge, about 4.8% of the mass leaves as waves and the remnant spins at a/M ≈ 0.69.',
    bodies: pairOf(m, m, sep, circularBinarySpeed(m, m, sep)),
    probes,
    fans: [],
    settings: { timeScale: 90, mode: 'space', gr: true, gw: true, pn: true, rings: true },
  };
}

function chirp(): Preset {
  const m1 = 3;
  const m2 = 1.2;
  const sep = 36;
  return {
    id: 'chirp',
    group: 'Relativity',
    name: 'Gravitational waves',
    note: 'Unequal masses, so the remnant recoils. The ripples spread at the speed of light and tighten as the orbit shrinks, the rising “chirp” that LIGO detects. Amplitude is scaled up to be visible.',
    bodies: pairOf(m1, m2, sep, circularBinarySpeed(m1, m2, sep)),
    probes: [],
    fans: [],
    settings: { timeScale: 120, mode: 'waves', gr: true, gw: true, pn: true, rings: false },
  };
}

function eccentric(): Preset {
  const m1 = 2;
  const m2 = 1;
  const a = 70;
  const e = 0.5;
  const M = m1 + m2;
  const ra = a * (1 + e);
  return {
    id: 'eccentric',
    group: 'Relativity',
    name: 'Precessing binary',
    note: 'Two masses on an elongated orbit, about 70 across. Einstein-Infeld-Hoffmann 1PN motion turns the orbit by about 50° each time round, and radiation slowly rounds it off.',
    bodies: pairOf(m1, m2, ra, visViva(M, ra, a)),
    probes: [],
    fans: [],
    settings: { timeScale: 200, mode: 'space', gr: true, gw: true, pn: true, rings: false },
  };
}

function clocks(): Preset {
  const M = 4;
  const near = 8 * M;
  const far = 30 * M;
  return {
    id: 'clocks',
    group: 'Relativity',
    name: 'Clocks near a black hole',
    note: 'Each particle carries a clock. On a circular orbit it ticks at √(1 − 3M/r) of a distant observer’s rate. The falling clock reaches the horizon in finite time of its own, while seeming to freeze from far away.',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: M }],
    probes: [
      { x: near, y: 0, vx: 0, vy: circularSpeed(M, near, true), model: 'follow', label: 'Close orbit, 8M' },
      { x: -far, y: 0, vx: 0, vy: -circularSpeed(M, far, true), model: 'follow', label: 'Wide orbit, 30M' },
      { x: 0, y: 100, vx: 0, vy: 0, model: 'follow', label: 'Falling from rest' },
    ],
    fans: [],
    settings: { timeScale: 40, mode: 'time', gr: true, gw: false, rings: true },
  };
}

function photonSphere(): Preset {
  const M = 4;
  const critical = 3 * Math.sqrt(3) * M;
  const width = 5;
  const count = 13;
  return {
    id: 'photon',
    group: 'Relativity',
    name: 'Photon sphere',
    note: 'Rays aimed around the critical impact parameter 3√3 M ≈ 20.8. Slightly inside, they are captured. Slightly outside, they whirl round the photon sphere at 3M before escaping.',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: M }],
    probes: [],
    fans: [
      { x: -145, y: critical, dx: 1, dy: 0, width, count },
      { x: -145, y: -critical, dx: 1, dy: 0, width, count },
    ],
    settings: { timeScale: 45, mode: 'space', gr: true, gw: false, rings: true },
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
    group: 'Three bodies',
    name: 'Three-body figure-eight',
    note: 'Chenciner–Montgomery (2000) choreography: three equal masses chase each other around one figure-eight. This solution is Newtonian, so the relativistic corrections are off here.',
    bodies: tagThree(figureEight()),
    probes: [],
    fans: [],
    settings: { timeScale: 150, mode: 'time', gr: true, gw: false, pn: false, rings: false },
  };
}

/** Okabe-Ito orange, sky blue and bluish green: distinct even with colour-blind vision. */
const THREE_COLOURS: [number, number, number][] = [[0.9, 0.62, 0], [0.34, 0.71, 0.91], [0, 0.62, 0.45]];

/** Marks three point masses as small stars, each in its own colour. */
function tagThree(bodies: PresetBody[], radius = 1.6): PresetBody[] {
  return bodies.map((b, i) => ({ ...b, kind: 'star', radius, color: THREE_COLOURS[i % 3], typeId: 'g' }));
}

/** Šuvakov & Dmitrašinović (2013): x = (∓1, 0), (0, 0), velocities (p₁, p₂) twice and −2(p₁, p₂). */
export function suvakov(p1: number, p2: number, lambda = 45, m = 1): PresetBody[] {
  const vs = Math.sqrt(m / lambda);
  return [
    { x: -lambda, y: 0, vx: p1 * vs, vy: p2 * vs, m },
    { x: lambda, y: 0, vx: p1 * vs, vy: p2 * vs, m },
    { x: 0, y: 0, vx: -2 * p1 * vs, vy: -2 * p2 * vs, m },
  ];
}

/**
 * Table I of Šuvakov & Dmitrašinović (2013), refined to about 11 digits by Newton shooting with
 * REBOUND's IAS15 and SciPy's DOP853, which agree. See reference/refs.json.
 */
export const BUTTERFLY = { p1: 0.30689342046, p2: 0.12550656702, T: 6.2346748387 };
export const MOTH = { p1: 0.46444517282, p2: 0.39606001465, T: 14.894305175 };
export const YINYANG = { p1: 0.51393853746, p2: 0.30473591935, T: 17.3288340186 };

function periodic(id: string, name: string, p1: number, p2: number, period: number, note: string): Preset {
  const lambda = 45;
  const m = 1;
  // Ten seconds per period, whatever the orbit.
  const timeScale = (period * Math.pow(lambda, 1.5)) / Math.sqrt(m) / 10;
  return {
    id,
    group: 'Three bodies',
    name,
    note,
    bodies: tagThree(suvakov(p1, p2, lambda, m)),
    probes: [],
    fans: [],
    settings: { timeScale, mode: 'time', gr: true, gw: false, pn: false, rings: false, merge: false },
  };
}

function lagrange(): Preset {
  const L = 90;
  const m = 1;
  const r = L / Math.sqrt(3);
  const v = r * Math.sqrt((3 * m) / (L * L * L));
  const bodies: PresetBody[] = [0, 1, 2].map((i) => {
    const t = (i / 3) * Math.PI * 2;
    return { x: r * Math.cos(t), y: r * Math.sin(t), vx: -v * Math.sin(t), vy: v * Math.cos(t), m };
  });
  // Equal masses fail Routh's stability test, so any disturbance grows. Give it a small one.
  bodies[0].x += 0.02;
  return {
    id: 'lagrange',
    group: 'Three bodies',
    name: 'Lagrange triangle',
    note: 'Three equal masses at the corners of a turning triangle: Lagrange’s exact solution of 1772. It is only stable if one mass dominates (Routh 1875), so with equal masses a tiny nudge grows until the triangle breaks up.',
    bodies: tagThree(bodies),
    probes: [],
    fans: [],
    settings: { timeScale: 160, mode: 'time', gr: true, gw: false, pn: false, rings: false, merge: false },
  };
}

function burrau(): Preset {
  const k = 30;
  const unit = 0.4;
  const bodies: PresetBody[] = [
    { x: k, y: 3 * k, vx: 0, vy: 0, m: 3 * unit },
    { x: -2 * k, y: -k, vx: 0, vy: 0, m: 4 * unit },
    { x: k, y: -k, vx: 0, vy: 0, m: 5 * unit },
  ];
  return {
    id: 'burrau',
    group: 'Three bodies',
    name: 'Pythagorean problem',
    note: 'Masses 3, 4 and 5 at rest on a 3-4-5 triangle (Burrau 1913). High-precision integrators (REBOUND) find the mass-3 body escaping and 4 and 5 leaving as a binary. This browser integrator is not that exact, so its ending can differ. The blue twin starts 0.001 away: watch the two histories part.',
    bodies: tagThree(bodies, 1.8),
    probes: [],
    fans: [],
    settings: { timeScale: 450, mode: 'time', gr: true, gw: false, pn: false, rings: false, merge: false, ghost: 1e-3, view: 1.3 },
  };
}

/** A body from the catalogue. */
function ofType(id: string, x: number, y: number, vx = 0, vy = 0, extra: Partial<PresetBody> = {}): PresetBody {
  const t = bodyType(id);
  return { x, y, vx, vy, m: typeMass(t, 2), kind: t.kind, radius: t.radius, color: t.color, typeId: t.id, name: t.kind === 'bh' ? undefined : t.label, ...extra };
}

/** A planet on a Kepler ellipse about a central mass, starting at perihelion at angle th. */
function planet(M: number, a: number, e: number, th: number, m: number, radius: number, color: [number, number, number], name: string): PresetBody {
  const rp = a * (1 - e);
  const v = visViva(M, rp, a);
  return { x: rp * Math.cos(th), y: rp * Math.sin(th), vx: -v * Math.sin(th), vy: v * Math.cos(th), m, kind: 'planet', radius, color, typeId: 'earth', name };
}

const SUN_M = 1 * SOLAR;
/** Mass, semi-major axis (AU), eccentricity, radius drawn, colour, name. */
const PLANETS: [number, number, number, number, [number, number, number], string][] = [
  [1.66e-7, 0.387, 0.206, 0.9, [0.65, 0.62, 0.58], 'Mercury'],
  [2.447e-6, 0.723, 0.007, 1.2, [0.92, 0.82, 0.6], 'Venus'],
  [3.003e-6, 1, 0.017, 1.3, [0.34, 0.58, 0.95], 'Earth'],
  [3.227e-7, 1.524, 0.093, 1, [0.85, 0.45, 0.3], 'Mars'],
  [9.546e-4, 5.203, 0.049, 3.6, [0.86, 0.72, 0.52], 'Jupiter'],
  [2.858e-4, 9.537, 0.057, 3.1, [0.9, 0.8, 0.58], 'Saturn'],
  [4.366e-5, 19.19, 0.046, 2.2, [0.6, 0.85, 0.9], 'Uranus'],
  [5.15e-5, 30.07, 0.009, 2.2, [0.38, 0.55, 0.95], 'Neptune'],
];

function solarScene(id: string, name: string, slice: [number, number], auScale: number, timeScale: number, view: number, note: string): Preset {
  const rand = seeded(1789);
  return {
    id,
    group: 'Stars and planets',
    name,
    note,
    bodies: [
      ofType('g', 0, 0, 0, 0, { name: 'Sun' }),
      ...PLANETS.slice(...slice).map(([m, a, e, r, c, label]) => planet(SUN_M, a * auScale, e, rand() * Math.PI * 2, m * SOLAR, r, c, label)),
    ],
    probes: [],
    fans: [],
    settings: { timeScale, mode: 'space', gr: true, gw: false, pn: false, rings: false, view },
  };
}

function trojans(): Preset {
  const M = SUN_M;
  const a = 160;
  const mj = 9.546e-4 * SOLAR;
  const total = M + mj;
  const v = Math.sqrt(total / a);
  const rand = seeded(5);
  const probes: PresetProbe[] = [];
  for (const sign of [1, -1]) {
    for (let i = 0; i < 40; i++) {
      // Near L4 and L5, 60° ahead of and behind Jupiter, with a small spread.
      const th = sign * (Math.PI / 3) + (rand() - 0.5) * 0.35;
      const r = a * (1 + (rand() - 0.5) * 0.04);
      const vk = Math.sqrt(total / r);
      probes.push({ x: r * Math.cos(th), y: r * Math.sin(th), vx: -vk * Math.sin(th), vy: vk * Math.cos(th), model: 'newton' });
    }
  }
  return {
    id: 'trojans',
    group: 'Three bodies',
    name: 'Trojan asteroids',
    note: 'Asteroids near the L4 and L5 points, 60° either side of Jupiter. These points are stable because the Sun outweighs Jupiter by far more than Routh’s limit of about 25:1. The clouds librate and stay put, as the real Trojans do.',
    bodies: [
      ofType('g', -a * (mj / total), 0, 0, -v * (mj / total), { name: 'Sun' }),
      { ...ofType('jupiter', a * (M / total), 0, 0, v * (M / total)), m: mj, name: 'Jupiter' },
    ],
    probes,
    fans: [],
    settings: { timeScale: 1800, mode: 'space', gr: false, gw: false, pn: false, rings: false, view: 1.05 },
  };
}

function trappist(): Preset {
  const M = 0.0898 * SOLAR;
  const scale = 3000;
  const earth = 3.003e-6 * SOLAR;
  const rand = seeded(11);
  const data: [number, number, string][] = [
    [0.01154, 1.374, 'b'],
    [0.0158, 1.308, 'c'],
    [0.02227, 0.388, 'd'],
    [0.02925, 0.692, 'e'],
    [0.03849, 1.039, 'f'],
    [0.04683, 1.321, 'g'],
    [0.06189, 0.326, 'h'],
  ];
  return {
    id: 'trappist',
    group: 'Stars and planets',
    name: 'TRAPPIST-1',
    note: 'Seven Earth-sized worlds packed around a dwarf star, in a chain of near-resonant orbits (Gillon et al. 2017, Agol et al. 2021). Masses and spacing are the measured ones. All seven orbits would fit well inside Mercury’s.',
    bodies: [
      { ...ofType('m', 0, 0), m: M, radius: displayRadius(0.119, 0.0898), color: blackbody(2566), name: 'TRAPPIST-1' },
      ...data.map(([a, mass, label], i) => planet(M, a * scale, 0, rand() * Math.PI * 2, mass * earth, 1.3, [0.45 + i * 0.05, 0.6, 0.95 - i * 0.06], label)),
    ],
    probes: [],
    fans: [],
    settings: { timeScale: 1200, mode: 'space', gr: false, gw: false, pn: false, rings: false, view: 0.8 },
  };
}

function starZoo(): Preset {
  const ids = ['m', 'k', 'g', 'a', 'b', 'o', 'giant', 'super', 'wd', 'ns', 'bh'];
  const gap = 12;
  const radiusOf = (id: string) => {
    const t = bodyType(id);
    return t.kind === 'bh' ? 4 : (t.radius ?? 1);
  };
  const total = ids.reduce((sum, id) => sum + 2 * radiusOf(id), 0) + gap * (ids.length - 1);
  let x = -total / 2;
  const bodies = ids.map((id) => {
    const r = radiusOf(id);
    const b = ofType(id, x + r, 0, 0, 0, id === 'bh' ? { m: 2, name: 'Black hole' } : {});
    x += 2 * r + gap;
    return b;
  });
  return {
    id: 'zoo',
    group: 'Stars and planets',
    name: 'Star zoo',
    note: 'A line-up from a red dwarf to a supergiant, then the dead ends of stars. Colours follow surface temperature. Sizes are squeezed: a true red supergiant is hundreds of times the Sun’s width, and the neutron star and black hole would be invisible. Paused: press play and they fall together.',
    bodies,
    probes: [],
    fans: [],
    settings: { timeScale: 200, mode: 'space', gr: true, gw: false, pn: false, rings: false, paused: true, view: 1.5 },
  };
}

function sirius(): Preset {
  const m1 = 2.06 * SOLAR;
  const m2 = 1.02 * SOLAR;
  const a = 110;
  const e = 0.59;
  const M = m1 + m2;
  const ra = a * (1 + e);
  const [p, q] = pairOf(m1, m2, ra, visViva(M, ra, a));
  return {
    id: 'sirius',
    group: 'Stars and planets',
    name: 'Sirius A and B',
    note: 'The brightest star in the night sky has a white dwarf companion on a long, 50-year ellipse. The masses and the shape of the orbit are the measured ones (Bond et al. 2017). The dwarf holds as much mass as the Sun in the volume of the Earth.',
    bodies: [ofType('a', p.x, p.y, p.vx, p.vy, { m: m1, name: 'Sirius A' }), ofType('wd', q.x, q.y, q.vx, q.vy, { m: m2, name: 'Sirius B' })],
    probes: [],
    fans: [],
    settings: { timeScale: 1400, mode: 'time', gr: true, gw: false, pn: false, rings: false },
  };
}

function kilonova(): Preset {
  const m = 1.4 * SOLAR;
  const sep = 24;
  const [p, q] = pairOf(m, m, sep, circularBinarySpeed(m, m, sep));
  return {
    id: 'kilonova',
    group: 'Stars and planets',
    name: 'Neutron star merger',
    note: 'Two 1.4 M☉ neutron stars spiral together as they radiate, then collapse to a black hole. This is the kind of event seen in gravitational waves and light in 2017 (GW170817). The flash stands in for the kilonova; its matter is not simulated.',
    bodies: [ofType('ns', p.x, p.y, p.vx, p.vy), ofType('ns', q.x, q.y, q.vx, q.vy)],
    probes: [],
    fans: [],
    settings: { timeScale: 70, mode: 'waves', gr: true, gw: true, pn: true, rings: false, view: 0.7 },
  };
}

function tidalDisruption(): Preset {
  const M = 2.5;
  const r = 140;
  const rp = 8;
  // A parabolic plunge: speed from E = 0, sideways part from L = √(2 M r_p).
  const v = Math.sqrt((2 * M) / r);
  const vt = Math.sqrt(2 * M * rp) / r;
  const vr = Math.sqrt(Math.max(0, v * v - vt * vt));
  return {
    id: 'tde',
    group: 'Stars and planets',
    name: 'Star meets black hole',
    note: 'A star on a plunging orbit crosses the tidal radius, R(M/m)^⅓, and is pulled apart (Rees 1988). About half the debris stays bound and falls in, and the rest is flung away. A large enough hole would swallow the star whole instead.',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: M }, ofType('g', r, 0, -vr, vt)],
    probes: [],
    fans: [],
    settings: { timeScale: 70, mode: 'space', gr: true, gw: false, pn: false, rings: true, view: 0.8 },
  };
}

/** A galaxy halo body. */
function galaxyBody(x: number, y: number, vx: number, vy: number, m: number, a: number, R: number, name?: string): PresetBody {
  return { x, y, vx, vy, m, kind: 'galaxy', soft: a, radius: R, color: [1, 0.86, 0.6], typeId: 'galaxy', name };
}

const GALAXY_NOTE = 'Newtonian, with units rescaled so a whole galaxy fits: speeds here are not fractions of c. ';

function spiral(): Preset {
  return {
    id: 'spiral',
    group: 'Galaxies',
    name: 'Spiral galaxy',
    note: GALAXY_NOTE + 'Six thousand stars pulling on one another, inside a dark halo. No arms were put in: they grow out of the disk’s own graininess and shear into spirals (Toomre 1981), and a bar often forms at the centre. Switch off dark matter to see why galaxies need it.',
    bodies: [galaxyBody(0, 0, 0, 0, 1, 20, 340, 'Halo')],
    probes: [],
    fans: [],
    disks: [{ host: 0, count: 6000, scale: 38, edge: 170, mass: 0.42, q: 1.25, sense: 1, seed: 42 }],
    swarm: { selfGravity: true, softening: 3, dt: 32 },
    settings: { timeScale: 1100, mode: 'space', gr: false, gw: false, pn: false, rings: false, view: 1.25 },
  };
}

function antennae(): Preset {
  const d: Omit<PresetDisk, 'host' | 'seed' | 'sense'> = { count: 5000, scale: 26, edge: 115, mass: 0, q: 1.3 };
  return {
    id: 'antennae',
    group: 'Galaxies',
    name: 'Galaxy collision',
    note: GALAXY_NOTE + 'Two disks swing past each other. Tides draw out long curved tails, the shape of the Antennae galaxies, which Toomre & Toomre (1972) explained this same way, with stars as test particles. Dynamical friction brings the pair back together.',
    bodies: [galaxyBody(-230, -70, 0.075, 0.026, 1, 28, 210, 'Galaxy A'), galaxyBody(230, 70, -0.075, -0.026, 1, 28, 210, 'Galaxy B')],
    probes: [],
    fans: [],
    disks: [
      { ...d, host: 0, sense: 1, seed: 7 },
      { ...d, host: 1, sense: 1, seed: 8 },
    ],
    swarm: { selfGravity: false, softening: 3, dt: 16 },
    settings: { timeScale: 900, mode: 'space', gr: false, gw: false, pn: false, rings: false, view: 1.7 },
  };
}

function stream(): Preset {
  const R = 115;
  const ms = 0.02;
  const v = Math.sqrt(haloEnclosed(1, 34, 300, R) / R);
  // The host recoils so the pair's centre of mass stays at rest.
  const host = galaxyBody(0, 0, 0, -ms * v, 1, 34, 300, 'Host');
  return {
    id: 'stream',
    group: 'Galaxies',
    name: 'Tidal stream',
    note: GALAXY_NOTE + 'A small satellite galaxy circles a big one and is slowly unwound by tides into a thin stream of stars along its orbit. The Milky Way has several of these, from dwarf galaxies it has eaten.',
    bodies: [host, galaxyBody(R, 0, 0, v, ms, 9, 44, 'Satellite')],
    probes: [],
    fans: [],
    disks: [
      { host: 0, count: 5500, scale: 32, edge: 140, mass: 0, q: 1.3, sense: 1, seed: 3 },
      { host: 1, count: 2200, scale: 10, edge: 42, mass: 0, q: 1.3, sense: 1, seed: 4 },
    ],
    swarm: { selfGravity: false, softening: 1.5, dt: 10 },
    settings: { timeScale: 620, mode: 'space', gr: false, gw: false, pn: false, rings: false, view: 1.5 },
  };
}

function cluster(): Preset {
  const rand = seeded(2026);
  const n = 26;
  const scale = 300;
  const m = 0.4;
  const bodies: PresetBody[] = [];
  const disks: PresetDisk[] = [];
  const speed = Math.sqrt((0.35 * n * m) / scale);
  for (let i = 0; i < n; i++) {
    const r = scale * Math.sqrt(rand());
    const th = rand() * Math.PI * 2;
    const pick = () => speed * Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());
    bodies.push(galaxyBody(r * Math.cos(th), r * Math.sin(th), pick(), pick(), m, 11, 55));
    disks.push({ host: i, count: 260, scale: 7, edge: 28, mass: 0, q: 1.3, sense: rand() < 0.5 ? 1 : -1, seed: 100 + i });
  }
  // Random velocities have a net drift: take it out so the cluster stays put.
  const driftX = bodies.reduce((s, b) => s + b.vx, 0) / n;
  const driftY = bodies.reduce((s, b) => s + b.vy, 0) / n;
  for (const b of bodies) {
    b.vx -= driftX;
    b.vy -= driftY;
  }
  return {
    id: 'cluster',
    group: 'Galaxies',
    name: 'Galaxy cluster',
    note: GALAXY_NOTE + 'Twenty-six galaxies falling together under their shared gravity. Each is a dot of stars in a halo. Close passes strip stars off, and friction slowly sinks the galaxies toward the middle.',
    bodies,
    probes: [],
    fans: [],
    disks,
    swarm: { selfGravity: false, softening: 1, dt: 12 },
    settings: { timeScale: 500, mode: 'space', gr: false, gw: false, pn: false, rings: false, view: 2.1, friction: 0.04 },
  };
}

function warp(): Preset {
  return {
    id: 'warp',
    group: 'Exotic',
    name: 'Alcubierre warp bubble (theoretical)',
    note: 'Alcubierre’s 1994 metric: space contracts ahead of the ship and expands behind it, and the ship’s clock never slows. It is a theoretical geometry that needs negative energy, and the simulation does not claim such a bubble is possible. Open “What this does not show” for the caveats.',
    bodies: [],
    probes: [],
    fans: [],
    settings: { timeScale: 12, mode: 'warp', gr: false, gw: false, pn: false, rings: true, view: 1.1 },
  };
}

const exhibitScene = (id: string, name: string, exhibit: ExhibitId, timeScale: number, note: string): Preset => ({
  id,
  name,
  group: 'Exotic',
  note,
  bodies: [],
  probes: [],
  fans: [],
  settings: { timeScale, mode: 'space', gr: true, gw: false, rings: false, exhibit },
});

let surprise: Preset | null = null;

/** Builds a random system: a planetary system, a double star with planets, stars round a hole, or a triple. */
export function surpriseScene(seed: number): Preset {
  const rand = seeded(seed);
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rand() * xs.length)];
  const bodies: PresetBody[] = [];
  const name = (rand() * 4) | 0;
  const addPlanets = (M: number, inner: number, count: number) => {
    let a = inner;
    for (let i = 0; i < count; i++) {
      const giant = rand() < 0.35;
      const t = bodyType(giant ? 'jupiter' : 'earth');
      bodies.push(planet(M, a, rand() * 0.08, rand() * Math.PI * 2, t.solarMass * SOLAR * (0.5 + rand() * 2), giant ? 3 : 1.2, pick([[0.34, 0.58, 0.95], [0.85, 0.5, 0.35], [0.8, 0.75, 0.55], [0.5, 0.85, 0.8]] as [number, number, number][]), `Planet ${i + 1}`));
      a *= 1.35 + rand() * 0.45;
    }
  };
  let view = 1;
  let note = '';
  if (name === 0) {
    const star = pick(BODY_TYPES.filter((t) => t.kind === 'star' && t.id !== 'super' && t.id !== 'giant' && t.id !== 'o'));
    bodies.push(ofType(star.id, 0, 0));
    addPlanets(typeMass(star, 1), Math.max(26, 2.6 * (star.radius ?? 6)), 3 + ((rand() * 4) | 0));
    note = `A ${star.label.toLowerCase()} with its planets, dealt at random. Watch whether they all last.`;
    view = 1.2;
  } else if (name === 1) {
    const m = 0.5 + rand() * 0.5;
    const sep = 30 + rand() * 20;
    const [p, q] = pairOf(m, m * (0.5 + rand() * 0.5), sep, Math.sqrt((1.6 * m) / sep));
    bodies.push(ofType('k', p.x, p.y, p.vx, p.vy, { m: p.m }), ofType('g', q.x, q.y, q.vx, q.vy, { m: q.m }));
    addPlanets(p.m + q.m, 3.5 * sep, 3);
    note = 'A double star with planets circling both, like Kepler-16. Orbits too near the pair get thrown out.';
    view = 1.3;
  } else if (name === 2) {
    const M = 3 + rand() * 4;
    bodies.push({ x: 0, y: 0, vx: 0, vy: 0, m: M });
    const count = 3 + ((rand() * 4) | 0);
    for (let i = 0; i < count; i++) {
      const r = 45 + i * 28 + rand() * 12;
      const th = rand() * Math.PI * 2;
      const v = Math.sqrt(M / r) * (0.8 + rand() * 0.3);
      const t = pick(BODY_TYPES.filter((b) => b.id === 'm' || b.id === 'k' || b.id === 'g'));
      bodies.push(ofType(t.id, r * Math.cos(th), r * Math.sin(th), -v * Math.sin(th), v * Math.cos(th)));
    }
    note = 'Stars on rough orbits around a black hole. Some get too close and are torn apart.';
  } else {
    for (let i = 0; i < 3; i++) {
      const r = 45 + rand() * 45;
      const th = (i / 3) * Math.PI * 2 + rand() * 0.9;
      const v = 0.05 + rand() * 0.08;
      const dir = rand() * Math.PI * 2;
      bodies.push({ x: r * Math.cos(th), y: r * Math.sin(th), vx: v * Math.cos(dir), vy: v * Math.sin(dir), m: 0.6 + rand() * 1.2 });
    }
    note = 'Three masses thrown together with no plan. Almost every such system ends with one thrown out.';
    return (surprise = { id: 'surprise', group: 'Sandbox', name: 'Surprise', note, bodies: tagThree(bodies), probes: [], fans: [], settings: { timeScale: 130, mode: 'time', gr: true, gw: false, pn: false, rings: false, merge: true, view: 1.2 } });
  }
  return (surprise = { id: 'surprise', group: 'Sandbox', name: 'Surprise', note, bodies, probes: [], fans: [], settings: { timeScale: 260, mode: 'space', gr: true, gw: false, pn: false, rings: name === 2, view } });
}

function lensing(): Preset {
  return {
    id: 'lensing',
    group: 'Relativity',
    name: 'Gravitational lensing fan',
    note: 'A parallel fan of light passes a mass M = 3. Distant rays bend by about 4M/b, twice Newton’s value (Dyson, Eddington & Davidson 1920). Close rays bend far more, and those inside b = 3√3 M are captured.',
    bodies: [{ x: 0, y: 0, vx: 0, vy: 0, m: 3 }],
    probes: [],
    fans: [{ x: -145, y: 0, dx: 1, dy: 0, width: 150, count: 31 }],
    settings: { timeScale: 60, mode: 'space', gr: true, gw: false, rings: true },
  };
}

function empty(): Preset {
  return {
    id: 'empty',
    group: 'Sandbox',
    name: 'Empty: build your own',
    note: 'Flat spacetime. Pick the Mass tool and click to place a mass; drag to give it a velocity.',
    bodies: [],
    probes: [],
    fans: [],
    settings: { timeScale: 60, mode: 'space', gr: true, gw: false, rings: true },
  };
}

export const PRESETS: Preset[] = [
  singleBlackHole(),
  clocks(),
  mercury(),
  binary(),
  chirp(),
  eccentric(),
  lensing(),
  photonSphere(),
  eight(),
  periodic('butterfly', 'Butterfly', BUTTERFLY.p1, BUTTERFLY.p2, BUTTERFLY.T, 'Šuvakov & Dmitrašinović (2013) found thirteen new families of periodic three-body orbits by computer search. This is butterfly I. It is unstable, so after a few rounds it loses the pattern.'),
  periodic('moth', 'Moth', MOTH.p1, MOTH.p2, MOTH.T, 'Moth I, from the same 2013 search. All three bodies trace their own loops and return to where they began after one period.'),
  periodic('yinyang', 'Yin-yang', YINYANG.p1, YINYANG.p2, YINYANG.T, 'Yin-yang I, from the same 2013 search: the paths of two bodies twist round each other like the symbol.'),
  lagrange(),
  burrau(),
  trojans(),
  solarScene('solar', 'Inner solar system', [0, 5], 40, 280, 1.9, 'True masses and true orbit shapes out to Jupiter, with 1 AU = 40 units. Planet sizes are enlarged: to scale, Earth would be a speck 0.003 units across.'),
  solarScene('outer', 'Outer solar system', [4, 8], 8, 1500, 1.3, 'The four giant planets at true relative distances, 1 AU = 8 units. Neptune takes 165 of our years to go round once; watch how slowly it crawls compared with Jupiter.'),
  trappist(),
  starZoo(),
  sirius(),
  kilonova(),
  tidalDisruption(),
  spiral(),
  antennae(),
  stream(),
  cluster(),
  warp(),
  exhibitScene('wormhole', 'Ellis wormhole', 'wormhole', 60, 'Rays with |h| < b pass through; others turn back. Light and matter share paths.'),
  exhibitScene('kerr-drag', 'Frame dragging', 'kerr-drag', 120, 'Dropped particles are swept along with the spin.'),
  exhibitScene('kerr-penrose', 'Penrose process', 'kerr-penrose', 120, 'One fragment falls in with negative energy; the other leaves with more than the parent had.'),
  exhibitScene('kerr-light', 'Light past a spinning hole', 'kerr-light', 120, 'The capture window is lopsided.'),
  empty(),
];

export const presetById = (id: string): Preset => (id === 'surprise' && surprise ? surprise : (PRESETS.find((p) => p.id === id) ?? PRESETS[0]));
