/**
 * The info card's text for each view, at three depths: plain words, live numbers computed from the
 * masses on the sheet, and the equations with a reference. The tag (exact or approximate) is the same
 * at every depth: depth changes how much is said, not what is true.
 */
import { lapse, MAX_SHADER_MASSES, type ViewMode } from '../physics/fields';
import { criticalImpact, einsteinRadius, lensDistance, lensNote, schwarzschildDeflection } from '../physics/lens';
import { pairOrbit } from '../physics/nbody';
import { circularClockRate } from '../physics/probes';
import { isBlackHole, isCompact, type Body } from '../physics/types';
import type { Depth } from '../state/depth';

export interface ViewCopy {
  title: string;
  body: string;
  tag: string;
  /** Equation depth: the governing expression, set as an equation. */
  eq?: string;
  /** Equation depth: where the formula comes from. */
  ref?: string;
}

const deg = (r: number) => (r * 180) / Math.PI;
const n3 = (v: number) => v.toFixed(3);

/** Proper radial distance between r1 and r2 outside a mass m: ∫ dr/√(1 − 2m/r). */
export function radialRuler(m: number, r1: number, r2: number): number {
  const F = (r: number) => Math.sqrt(r * (r - 2 * m)) + 2 * m * Math.log(Math.sqrt(r) + Math.sqrt(r - 2 * m));
  return F(r2) - F(r1);
}

/** The heaviest black hole on the sheet, or failing that the heaviest compact object. */
function heaviestHole(bodies: readonly Body[]): Body | null {
  let best: Body | null = null;
  for (const b of bodies) if (isCompact(b) && (!best || b.m > best.m)) best = b;
  return best;
}

const fmtM = (m: number) => (m >= 10 ? m.toFixed(0) : m >= 1 ? m.toFixed(1) : m.toFixed(2));

function words(mode: ViewMode, multi: boolean): string {
  switch (mode) {
    case 'space':
      return `Mass stretches distance. The sheet is the true shape of space around ${multi ? 'each' : 'a'} black hole: a ruler laid toward the hole covers more ground than the flat grid suggests.`;
    case 'time':
      return 'Clocks near mass run slow, and slow-moving things drift toward slower clocks. That, more than bent space, is what makes things fall.';
    case 'tidal':
      return 'Where gravity changes fastest over a short distance. Something here is stretched toward the mass and squeezed from the sides.';
    case 'waves':
      return 'Orbiting masses send out ripples in spacetime at the speed of light. The heights are scaled up enormously so they can be seen.';
    case 'lens':
      return 'The sky behind the masses, bent by their gravity into rings, arcs and double images.';
    case 'warp':
      return 'A theoretical warp bubble: space shrinks ahead of it and grows behind. It would need negative energy, which no known matter has.';
    default:
      return 'A grid pulled toward each mass. It is for intuition only.';
  }
}

function numbers(mode: ViewMode, bodies: readonly Body[]): string {
  const hole = heaviestHole(bodies);
  const which = bodies.length > 1 ? ' (the heaviest mass, taken alone)' : '';
  const noHole = 'Place a black hole to see its numbers here.';
  switch (mode) {
    case 'space': {
      if (!hole) return noHole;
      const m = hole.m;
      const ruler = radialRuler(m, 3 * m, 6 * m) / m;
      const depth = (2 * Math.sqrt(2 * m * 4 * m) - 2 * Math.sqrt(2 * m * m)) / m;
      return `M = ${fmtM(m)}${which}. A ruler laid radially from 3M to 6M measures ${ruler.toFixed(2)}M, not 3M, and the sheet drops ${depth.toFixed(2)}M over that stretch.`;
    }
    case 'time': {
      if (!hole) return noHole;
      const m = hole.m;
      return `M = ${fmtM(m)}${which}. A clock parked at 8M runs at ×${n3(lapse(-1 / 8))}; one orbiting there at ×${n3(circularClockRate(m, 8 * m))}. At 3M a parked clock runs at ×${n3(lapse(-1 / 3))}, and only light can orbit there.`;
    }
    case 'tidal': {
      if (!hole) return noHole;
      const m = hole.m;
      const k = (r: number) => (48 * m * m) / r ** 6;
      return `M = ${fmtM(m)}${which}. K is ${k(2 * m).toExponential(2)} at the horizon and ${k(6 * m).toExponential(2)} at 6M. At the horizon K = 3/(4M⁴), so bigger holes have gentler horizons.`;
    }
    case 'waves': {
      const pair = bodies.length === 2 && bodies.every((b) => b.kind !== 'galaxy') ? pairOrbit(bodies[0], bodies[1], bodies.every(isCompact)) : null;
      if (!pair?.bound) return 'Two masses in a bound orbit give a clean signal; their numbers appear here.';
      const M = bodies[0].m + bodies[1].m;
      const mu = (bodies[0].m * bodies[1].m) / M;
      const period = 2 * Math.PI * Math.sqrt(pair.a ** 3 / M);
      return `Orbit a = ${pair.a.toFixed(1)}, period ${period.toFixed(0)}, so the waves repeat every ${(period / 2).toFixed(0)} (twice per orbit). Seen face-on, the true strain times distance is 4μM/a = ${((4 * mu * M) / pair.a).toFixed(3)}.`;
    }
    case 'lens': {
      if (bodies.length === 0) return 'Nothing here bends light.';
      let heavy = bodies[0];
      for (const b of bodies) if (b.m > heavy.m) heavy = b;
      const D = lensDistance(bodies);
      const m = heavy.m;
      if (!isBlackHole(heavy)) return `Heaviest mass M = ${fmtM(m)}. Its Einstein radius on this sky is ${einsteinRadius(m, D).toFixed(1)}.`;
      const exact = deg(schwarzschildDeflection(13 * m, m));
      const weak = deg(4 / 13);
      return `M = ${fmtM(m)}${which}. Rays inside b = ${(criticalImpact(m) / m).toFixed(3)}M are captured. At b = 13M the exact bending is ${exact.toFixed(1)}°; the weak-field 4M/b would give ${weak.toFixed(1)}°. Einstein radius on this sky: ${einsteinRadius(m, D).toFixed(1)}.`;
    }
    case 'warp':
      return 'Both fields are normalised to their peak, so the colours are shapes, not sizes. The bubble speed v_s only scales the numbers.';
    default:
      return 'No numbers: the displacement law is invented for the picture.';
  }
}

interface EquationCopy {
  title: string;
  body: string;
  tag: string;
  eq?: string;
  ref?: string;
}

function equation(mode: ViewMode, bodies: readonly Body[], exag: number): EquationCopy {
  const nBodies = bodies.length;
  const multi = nBodies > 1;
  switch (mode) {
    case 'lens': {
      const n = lensNote(bodies, MAX_SHADER_MASSES);
      return { ...n, eq: 'β = θ − D·c(|Σα̂ᵢ|) Σ α̂ᵢ(bᵢ) b̂ᵢ,  α̂(b) → 4M/b for b ≫ M', ref: 'Darwin (1959) for the exact α̂(b); Bozza (2002) for its strong-field limit.' };
    }
    case 'warp':
      return { title: 'Alcubierre metric · York time', body: 'Height and colour show θ = v_s (x_s/r_s) df/dr_s, or the Eulerian energy density T⁰⁰. Both are normalised to their peak; v_s only scales the numbers.', tag: 'field normalised to its peak', eq: 'ds² = −dt² + (dx − v_s f(r_s) dt)² + dy² + dz²', ref: 'Alcubierre (1994), Class. Quantum Grav. 11, L73.' };
    case 'space':
      return {
        title: 'Space curvature · Flamm paraboloid',
        body: `z(r) = 2√(r_s(r − r_s)), the shape of the t = const equatorial slice${exag === 1 ? ', drawn to true scale' : ` (depth ×${exag.toFixed(2)})`}.`,
        tag: multi ? 'weak-field superposition (approximate)' : 'exact for one mass',
        eq: 'dl² = dr²/(1 − 2M/r) + r²dφ²',
        ref: 'Flamm (1916); Misner, Thorne & Wheeler (1973) §23.8.',
      };
    case 'time':
      return {
        title: 'Time curvature · lapse √(−g_tt)',
        body: `Height ∝ Φ, colour = clock rate dτ/dt = √(1 + 2Φ). For slow particles it is this curvature of time, not of space, that drives the motion.${multi ? ' Where 1 + 2Φ reaches 0 the colour saturates: that is the superposition’s limit, not a common horizon.' : ''}`,
        tag: multi ? 'superposed (approximate)' : 'exact for one mass',
        eq: 'dτ/dt = √(1 + 2Φ),  Φ = −Σ Mᵢ/rᵢ;  slow motion: d²x/dt² = −∇Φ',
        ref: 'Schwarzschild (1916); on the rubber-sheet picture, Middleton & Langston (2014).',
      };
    case 'tidal':
      return {
        title: 'Tidal curvature · Kretschmann scalar',
        body: `Colour = log₁₀ of K = 8 E_ij E^ij, ${multi ? 'with the tidal tensors of the masses added, so tides from two masses reinforce or cancel' : 'which is 48M²/r⁶ for one mass'}: a coordinate-free measure of where spacetime is strongly curved.`,
        tag: multi ? 'tidal tensors superposed (approximate)' : 'exact for one mass',
        eq: 'K = R_abcd R^abcd = 8 E_ij E^ij,  E_ij = Σ (M/r³)(δ_ij − 3nᵢnⱼ)',
        ref: 'Nichols et al. (2011), Phys. Rev. D 84, 124014.',
      };
    case 'waves':
      return {
        title: 'Gravitational waves · quadrupole',
        body: nBodies > 1 ? 'What an observer in the orbital plane would measure, h₊ = −Ï_tt(t − r)/r: ripples leave the masses at the speed of light.' : 'Waves need moving masses. Try the Gravitational waves scene, or place two masses in orbit.',
        tag: 'quadrupole approximation, amplitude scaled',
        eq: 'Ï_ij = Σ m (2vᵢvⱼ + xᵢaⱼ + aᵢxⱼ),  h₊ = −Ï_tt(t − r)/r',
        ref: 'Einstein (1918); Peters (1964) for the orbit’s decay.',
      };
    default:
      return { title: '3D lattice warp', body: 'Grid lines pulled toward each mass.', tag: 'illustrative only' };
  }
}

/** Short titles for the two plainer depths, so the card head stays readable. */
const PLAIN_TITLE: Record<ViewMode, string> = {
  space: 'Space curvature',
  time: 'Time curvature',
  tidal: 'Tidal curvature',
  waves: 'Gravitational waves',
  lattice: '3D lattice warp',
  lens: 'Lens · the sky behind these masses',
  warp: 'Alcubierre warp bubble',
};

/** The card's text for this view at this depth, with the sheet's qualifiers applied. */
export function viewCopy(mode: ViewMode, depth: Depth, bodies: readonly Body[], exag: number): ViewCopy {
  const base = equation(mode, bodies, exag);
  const copy: ViewCopy = depth === 'equation' ? base : { title: PLAIN_TITLE[mode], body: depth === 'words' ? words(mode, bodies.length > 1) : numbers(mode, bodies), tag: base.tag };
  // The "exact" claims are about black holes. Anything else on the sheet qualifies them.
  const curved = mode === 'space' || mode === 'time' || mode === 'tidal';
  const plain = { ...copy, body: copy.body.replace(', drawn to true scale', '') };
  if (curved && bodies.some((b) => b.kind === 'galaxy')) return { ...plain, tag: 'schematic: a galaxy is drawn as a uniform sphere' };
  if (curved && bodies.some((b) => !isBlackHole(b))) return { ...plain, body: `${plain.body} Stars and planets are drawn far bigger than life, so the depth and curvature near them are not their real values.`, tag: 'exterior formula, uniform sphere inside, sizes compressed' };
  if (curved && bodies.some((b) => b.spin)) return { ...copy, tag: 'Schwarzschild: this remnant’s spin is not drawn' };
  return copy;
}
