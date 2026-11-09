/**
 * The catalogue of objects you can place, and what happens when two of them touch.
 *
 * Scene scale: 1 solar mass = SOLAR scene mass units, so a mass ratio between any two objects is
 * real. Sizes are not: the Sun's true radius is 235,000 of its Schwarzschild radii, which would
 * leave every star an invisible dot or a flat sheet. Star and planet radii are compressed for
 * display and kept clear of the object's own r_s. Black holes and neutron stars are compact enough
 * to be drawn at their true ratio of radius to r_s.
 */
import type { Body, BodyKind } from './types';

/** Scene mass of one solar mass. */
export const SOLAR = 0.5;
/** Chandrasekhar mass and an upper estimate of the maximum neutron-star mass, in solar masses. */
export const CHANDRASEKHAR = 1.44;
export const MAX_NEUTRON_STAR = 2.3;

export type Rgb = [number, number, number];

export interface BodyType {
  id: string;
  label: string;
  kind: BodyKind;
  /** Mass in solar masses (black holes take theirs from the slider). */
  solarMass: number;
  /** Scene radius. Omitted for black holes. */
  radius?: number;
  /** Effective temperature, for stars. */
  tempK?: number;
  color?: Rgb;
  blurb: string;
}

/**
 * Colour of a blackbody at temperature T, as linear RGB in [0, 1]: the usual fit to the Planckian
 * locus (Tanner Helland), normalised so the brightest channel is 1.
 */
export function blackbody(tempK: number): Rgb {
  const t = Math.min(40000, Math.max(1000, tempK)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255;
  const c: Rgb = [clamp(r), clamp(g), clamp(b)];
  const peak = Math.max(c[0], c[1], c[2]) || 1;
  return [c[0] / peak, c[1] / peak, c[2] / peak];
}

/** Compresses a radius in solar radii to scene units, never inside 1.5 r_s of a star of that mass. */
export function displayRadius(solarRadius: number, solarMass: number): number {
  return Math.max(6 * Math.pow(solarRadius, 0.35), 1.5 * 2 * solarMass * SOLAR);
}

/** Main-sequence rows follow Pecaut & Mamajek (2013, table of 2022); see reference/refs.json. */
function star(id: string, label: string, solarMass: number, solarRadius: number, tempK: number, blurb: string): BodyType {
  return { id, label, kind: 'star', solarMass, radius: displayRadius(solarRadius, solarMass), tempK, color: blackbody(tempK), blurb };
}

export const BODY_TYPES: BodyType[] = [
  { id: 'bh', label: 'Black hole', kind: 'bh', solarMass: 0, blurb: 'A horizon at r_s = 2M. Mass from the slider.' },
  // Radius is the true ratio to r_s: 12.45 km (Miller et al. 2021) for a star whose r_s is 4.13 km.
  { id: 'ns', label: 'Neutron star', kind: 'ns', solarMass: 1.4, radius: 3.01 * 2 * 1.4 * SOLAR, tempK: 600000, color: [0.72, 0.84, 1], blurb: '1.4 M☉ in about 12 km.' },
  { id: 'wd', label: 'White dwarf', kind: 'wd', solarMass: 0.6, radius: 1.5, tempK: 15000, color: blackbody(15000), blurb: '0.6 M☉, about the size of Earth.' },
  star('m', 'Red dwarf', 0.162, 0.196, 3060, 'Type M. The commonest star in the Galaxy.'),
  star('k', 'Orange dwarf', 0.7, 0.701, 4440, 'Type K.'),
  star('g', 'Sun-like star', 1, 1, 5772, 'Type G, 5772 K.'),
  star('a', 'White star', 1.88, 1.785, 8100, 'Type A, like Sirius A.'),
  star('b', 'Blue star', 4.7, 3.36, 15700, 'Type B.'),
  star('o', 'Blue giant', 20.2, 7.72, 33300, 'Type O. Short-lived and very hot.'),
  star('giant', 'Red giant', 1.08, 25.4, 4286, 'Arcturus-class: a Sun-like star late in life.'),
  star('super', 'Red supergiant', 17, 764, 3600, 'Betelgeuse-class, hundreds of solar radii across.'),
  { id: 'earth', label: 'Rocky planet', kind: 'planet', solarMass: 3.003e-6, radius: 1.1, color: [0.32, 0.55, 0.9], blurb: 'One Earth mass.' },
  { id: 'jupiter', label: 'Gas giant', kind: 'planet', solarMass: 9.546e-4, radius: 3, color: [0.85, 0.7, 0.5], blurb: 'One Jupiter mass.' },
  { id: 'galaxy', label: 'Galaxy', kind: 'galaxy', solarMass: 0, blurb: 'A disk of stars in a dark halo.' },
];

export const bodyType = (id: string): BodyType => BODY_TYPES.find((t) => t.id === id) ?? BODY_TYPES[0];

/** Scene mass for a type; black holes use the given mass. */
export const typeMass = (t: BodyType, blackHoleMass: number): number => (t.kind === 'bh' ? blackHoleMass : t.solarMass * SOLAR);

const RANK: Record<BodyKind, number> = { galaxy: -1, planet: 0, star: 1, wd: 2, ns: 3, bh: 4 };

export interface Outcome {
  kind: BodyKind;
  radius: number | undefined;
  color: Rgb | undefined;
  typeId: string | undefined;
  /** True when the collapse of the remnant should be drawn as a supernova. */
  supernova: boolean;
}

/** Temperature and radius of a star of `solarMass`, by interpolating the catalogue in log mass. */
function mainSequence(solarMass: number): { tempK: number; radius: number } {
  const table = BODY_TYPES.filter((t) => t.kind === 'star' && t.id !== 'giant' && t.id !== 'super');
  let lo = table[0];
  let hi = table[table.length - 1];
  for (const t of table) {
    if (t.solarMass <= solarMass && t.solarMass >= lo.solarMass) lo = t;
    if (t.solarMass >= solarMass && t.solarMass <= hi.solarMass) hi = t;
  }
  const span = Math.log(hi.solarMass / lo.solarMass);
  const f = span > 0 ? Math.min(1, Math.max(0, Math.log(solarMass / lo.solarMass) / span)) : 0;
  return { tempK: lo.tempK! + f * (hi.tempK! - lo.tempK!), radius: lo.radius! + f * (hi.radius! - lo.radius!) };
}

/**
 * What two touching objects leave behind. The densest wins; a compact object driven past its
 * mass limit collapses (a white dwarf over the Chandrasekhar mass to a neutron star, which is one
 * real channel, accretion-induced collapse; a neutron star over its maximum to a black hole).
 */
export function collisionOutcome(a: Body, b: Body, mass: number): Outcome {
  const ka = a.kind ?? 'bh';
  const kb = b.kind ?? 'bh';
  const top = RANK[ka] >= RANK[kb] ? a : b;
  const kind = top.kind ?? 'bh';
  const solar = mass / SOLAR;
  if (kind === 'bh') return { kind, radius: undefined, color: undefined, typeId: 'bh', supernova: false };
  if (kind === 'ns' && solar > MAX_NEUTRON_STAR) return { kind: 'bh', radius: undefined, color: undefined, typeId: 'bh', supernova: true };
  if (kind === 'wd' && solar > MAX_NEUTRON_STAR) return { kind: 'bh', radius: undefined, color: undefined, typeId: 'bh', supernova: true };
  if (kind === 'wd' && solar > CHANDRASEKHAR) {
    const ns = bodyType('ns');
    return { kind: 'ns', radius: ns.radius, color: ns.color, typeId: 'ns', supernova: true };
  }
  if (kind === 'star' && ka === 'star' && kb === 'star') {
    const ms = mainSequence(solar);
    return { kind, radius: Math.max(ms.radius, 3 * mass), color: blackbody(ms.tempK), typeId: top.typeId, supernova: false };
  }
  if (ka === 'planet' && kb === 'planet') {
    // Equal density: volumes add.
    const radius = Math.cbrt((a.radius ?? 1) ** 3 + (b.radius ?? 1) ** 3);
    return { kind, radius, color: top.color, typeId: top.typeId, supernova: false };
  }
  return { kind, radius: top.radius, color: top.color, typeId: top.typeId, supernova: false };
}

/**
 * Mass inside radius r of a galaxy's halo, a pseudo-isothermal sphere ρ ∝ 1/(1 + r²/a²) cut off at
 * radius R: M(r) ∝ r − a·atan(r/a). Its circular speed rises and then stays flat, the shape
 * measured in spiral galaxies (Rubin, Ford & Thonnard 1980).
 */
export function haloEnclosed(m: number, a: number, R: number, r: number): number {
  if (r >= R) return m;
  return (m * (r - a * Math.atan(r / a))) / (R - a * Math.atan(R / a));
}

/** Central density of that halo. */
export const haloDensity0 = (m: number, a: number, R: number): number => m / (4 * Math.PI * a * a * (R - a * Math.atan(R / a)));

/** The speed the halo's rotation curve flattens to. */
export const haloFlatSpeed = (m: number, a: number, R: number): number => Math.sqrt(m / (R - a * Math.atan(R / a)));
