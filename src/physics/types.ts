/**
 * Core data types. Units: G = c = 1 throughout, so masses, lengths and times share one unit
 * (call it "M_unit"). A body of mass M has Schwarzschild radius r_s = 2M.
 *
 * Dynamics live in the 2D equatorial plane (x, y); rendering lifts them onto a 3D surface.
 */

/** A massive particle (a point mass / black hole). Moves under mutual Newtonian N-body gravity. */
export interface Body {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  m: number;
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
  /** Time not yet integrated (the probe integrator sub-steps on its own clock). */
  lag: number;
}

/** A light ray in the weak-field optical-medium picture. p = n dx/ds, so |p| = n. */
export interface Ray {
  id: number;
  x: number;
  y: number;
  px: number;
  py: number;
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
}

export const schwarzschildRadius = (m: number): number => 2 * m;
