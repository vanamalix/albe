/**
 * Core data types. Units: G = c = 1 throughout, so masses, lengths and times share one unit
 * (call it "M_unit"). A body of mass M has Schwarzschild radius r_s = 2M.
 *
 * Dynamics live in the 2D equatorial plane (x, y); rendering lifts them onto a 3D surface.
 */

/** What a massive object is. It decides its surface, how it is drawn and which physics applies. */
export type BodyKind = 'bh' | 'ns' | 'wd' | 'star' | 'planet' | 'galaxy';

/** A massive particle. Moves under mutual N-body gravity. Without `kind` it is a black hole. */
export interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
  kind?: BodyKind;
  /** Surface radius; black holes use r_s. For a galaxy, the radius at which its halo is cut off. */
  radius?: number;
  /** Plummer softening (galaxies): the body acts as extended rather than as a point. */
  soft?: number;
  /** Sphere colour, linear RGB. */
  color?: [number, number, number];
  /** Catalogue id (see bodies.ts) and display name. */
  typeId?: string;
  name?: string;
  /** Dimensionless spin a/M left by a merger. Reported only: it does not change the motion. */
  spin?: number;
  /** Cached acceleration from the last force evaluation (velocity Verlet). */
  ax: number;
  ay: number;
}

/** How a massless test particle responds to gravity. */
export type ProbeModel = 'gr' | 'newton';

/** A massless test particle ("probe"). It feels the bodies but does not pull on them. */
export interface Probe {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /**
   * 'follow' uses the global GR/Newtonian toggle; 'newton' is always Newtonian
   * (used for the comparison "ghost" orbits in presets).
   */
  model: 'follow' | 'newton';
  /** Coordinate time not yet integrated (the probe integrator sub-steps on its own clock). */
  lag: number;
  /** Proper time this particle's own clock has measured. */
  tau: number;
  /** Latest clock rate dτ/dt relative to a distant observer (1 for Newtonian particles). */
  rate: number;
  /** Name shown in the clock card; unnamed particles are not listed. */
  label?: string;
}

/** A light ray: position and dx/dλ, with λ the affine parameter of the null geodesic. */
export interface Ray {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 'flying', 'captured' (crossed a horizon) or 'escaped' (left the domain). */
  state: 'flying' | 'captured' | 'escaped';
  /** Path length travelled since the last recorded polyline point. */
  sinceLast: number;
  /** Flattened polyline [x0, y0, x1, y1, ...]. */
  path: number[];
  /** Real-time seconds since the ray stopped (for fading out). */
  age: number;
}

/** A gravitating source as seen by the field functions: only position and mass matter. */
export interface Source {
  x: number;
  y: number;
  m: number;
  kind?: BodyKind;
  radius?: number;
  soft?: number;
}

/** Radius at which a source stops being vacuum exterior; 0 for a galaxy, which has no surface. */
export function surfaceRadius(s: Source): number {
  if (s.kind === 'galaxy') return 0;
  return Math.max(s.radius ?? 0, 2 * s.m);
}

/** True when the object is a black hole (its surface is a horizon). */
export const isBlackHole = (s: Source): boolean => s.kind === undefined || s.kind === 'bh';

/** Objects compact enough that the relativistic terms apply: black holes and neutron stars. */
export const isCompact = (s: Source): boolean => isBlackHole(s) || s.kind === 'ns';

export const schwarzschildRadius = (m: number): number => 2 * m;
