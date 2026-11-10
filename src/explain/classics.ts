/** Explainers for the gyroscope and dust-ring scenes. Their interactive parts are toys in ui/play. */
import { deviationAlongFall, deviationAt, measureRing, positionNow, ringAxes } from '../physics/dust';
import { geodetic, sliceTransport } from '../physics/gyro';
import { DUST, GYRO } from '../physics/presets';
import type { World } from '../sim/world';
import type { Explainer } from './content';

const deg = (r: number) => (r * 180) / Math.PI;

function gyroRadius(w: World): { M: number; r: number } | null {
  const h = w.bodies[0];
  const p = w.probes.find((q) => q.label === 'Gyroscope');
  return h && p ? { M: h.m, r: Math.hypot(p.x - h.x, p.y - h.y) } : null;
}

export const gyroExplainer: Explainer = {
  title: 'Gyroscope round a hole',
  seeing: 'One particle on a circular orbit carries a gyroscope. The diagram in the challenge below follows it round with two arrows: one carried round the curved slice of space, one as a real gyroscope.',
  why: {
    words:
      'Carry an arrow round a loop on a curved surface, keeping it as straight as you can, and it comes back turned: that is what curvature means. Around a hole space is curved, so an arrow carried round the orbit turns. A real gyroscope turns about half as much again, because it also moves through curved time. Gravity Probe B measured this for a gyroscope orbiting the Earth.',
    numbers: () => {
      const { M, r } = GYRO;
      return `At 8M the slice turns an arrow by ${deg(sliceTransport(M, r)).toFixed(1)}° per loop and the gyroscope by ${deg(geodetic(M, r)).toFixed(1)}°; at 6M, 66.1° and 105.4°. Far from the hole they approach 2πM/r and 3πM/r.`;
    },
    equation:
      'On the slice dl² = dr²/f + r²dφ² the circle r is not a geodesic: its geodesic curvature is √f/r, so a parallel-transported vector turns back at √f per radian relative to e_r and leads the stars by 2π(1 − √f) per loop. Gauss-Bonnet gives the same number: 2π plus ∫K dA over the annulus between the throat and the circle, −2π√f. The gyroscope obeys Fermi-Walker transport, dS/dτ = 0 along the geodesic in the full spacetime: in the comoving frame it turns back at √(1 − 3M/r), so the geodetic precession is 2π(1 − √(1 − 3M/r)) per orbit. Weak field: (γ + ½)·2πM/r with γ = 1: the γ part is the slice’s, the ½ comes from g_tt.',
    eq: ['Slice: Δ = 2π(1 − √(1 − 2M/r))', 'Gyroscope: Δ = 2π(1 − √(1 − 3M/r)) → 3πM/r = (γ + ½) 2πM/r'],
  },
  watch: [
    { label: 'Orbit radius', value: ({ world }) => (gyroRadius(world) ? `${(gyroRadius(world)!.r / gyroRadius(world)!.M).toFixed(2)} M` : null) },
    { label: 'Slice, per loop', value: ({ world }) => (gyroRadius(world) ? `${deg(sliceTransport(gyroRadius(world)!.M, gyroRadius(world)!.r)).toFixed(2)}°` : null) },
    { label: 'Gyroscope, per orbit', value: ({ world }) => (gyroRadius(world) ? `${deg(geodetic(gyroRadius(world)!.M, gyroRadius(world)!.r)).toFixed(2)}°` : null) },
  ],
  exact: [
    'Both closed forms, for a test gyroscope on a circular orbit round one non-spinning hole with its spin in the orbital plane. Tests integrate the transport numerically (the slice’s Christoffel symbols, and the spin along the geodesic) and recover both.',
    'The particle’s orbit: the scene’s Schwarzschild geodesic.',
  ],
  approx: [
    'The arrows are not integrated live: they are the closed forms evaluated at the particle’s own orbital angle u^φτ, which is exact on a circular geodesic.',
    'Gravity Probe B: our point-mass circular formula at 642 km gives about 0.2% more than the published prediction, which uses the real orbit and Earth’s oblateness. Frame dragging, the other GP-B effect, needs a spinning mass and is not drawn.',
  ],
  myths: [
    {
      picture: 'A gyroscope in free fall keeps pointing at the same distant star.',
      gr: 'Only in flat spacetime. In free fall there is no torque, and the gyroscope keeps its direction as straight as spacetime allows, which after an orbit is not the direction it started in. Gravity Probe B saw it drift 6.6″ a year in Earth orbit, as predicted.',
    },
  ],
  reading: [
    'W. de Sitter (1916), “On Einstein’s theory of gravitation and its astronomical consequences”, Mon. Not. R. Astron. Soc. 77, 155.',
    'C. W. F. Everitt et al. (2011), “Gravity Probe B: final results of a space experiment to test general relativity”, Phys. Rev. Lett. 106, 221101.',
    'J. B. Hartle (2003), Gravity: An Introduction to Einstein’s General Relativity, Addison-Wesley, ch. 14 (gyroscopes in curved spacetime).',
    'C. W. Misner, K. S. Thorne & J. A. Wheeler (1973), Gravitation, W. H. Freeman, §40.7 (geodetic precession).',
  ],
};

let fall: ReturnType<typeof deviationAlongFall> | null = null;
function ringNow(w: World) {
  const h = w.bodies[0];
  const c = w.probes.find((p) => p.label === 'Ring centre');
  const ring = w.probes.filter((p) => !p.label && p.model === 'follow');
  if (!h || !c || ring.length !== DUST.n) return null;
  const ax = ringAxes(DUST.n);
  const at = (p: (typeof ring)[number]) => {
    const q = positionNow(p);
    return { x: q.x - h.x, y: q.y - h.y };
  };
  const m = measureRing(DUST.M, DUST.R, DUST.xi, at(c), at(ring[ax.outer]), at(ring[ax.inner]), at(ring[ax.left]), at(ring[ax.right]));
  fall ??= deviationAlongFall(DUST.M, DUST.R, 2.2 * DUST.M);
  return { m, p: deviationAt(fall, m.r) };
}

export const dustExplainer: Explainer = {
  title: 'Dust ring',
  seeing: 'Twenty-four particles in a ring of radius 4 round a centre particle, all let go from rest at 30M. Watch the ring stretch toward the hole and narrow across it. The sheet is coloured by tidal curvature.',
  why: {
    words:
      'Tides are differences in gravity across a body. The side of the ring nearer the hole is pulled harder than the far side, so the ring stretches; every particle heads for the same point, so it narrows across. That is what curvature of spacetime does to a cloud of free particles, and it is all that is left of gravity in a small falling laboratory.',
    numbers: ({ world }) => {
      const n = ringNow(world);
      return n
        ? `Now at ${(n.m.r / DUST.M).toFixed(1)}M: stretched ×${n.m.radial.toFixed(2)} toward the hole and ×${n.m.tangential.toFixed(2)} across (predicted ×${n.p.radial.toFixed(2)} and ×${n.p.tangential.toFixed(2)}). The undrawn third axis is at ×${n.p.normal.toFixed(2)}, so the volume is ×${(n.p.radial * n.p.tangential * n.p.normal).toFixed(3)} while the area on screen is ×${(n.m.radial * n.m.tangential).toFixed(2)}.`
        : 'The ring is no longer complete: restart the scene.';
    },
    equation:
      'Geodesic deviation: D²ξ^a/dτ² = −R^a_{bcd}u^bξ^cu^d = −E^a_bξ^b. For Schwarzschild in a radially falling frame E = (M/r³)diag(−2, 1, 1), unchanged by the radial boost. With r(τ) on the cycloid this is integrated from rest. In vacuum E is trace-free (R_ab = 0), so a ball released at rest keeps its volume to second order; Raychaudhuri’s equation, dθ/dτ = −θ²/3 − σ_abσ^ab, then focuses it once shear has built up.',
    eq: ['ξ̈ⁱ = −Eⁱⱼ ξʲ,   E = (M/r³) diag(−2, 1, 1)', 'tr E = 0  ⇒  d²(volume)/dτ² = 0 at release'],
  },
  watch: [
    { label: 'Centre at', value: ({ world }) => (ringNow(world) ? `${(ringNow(world)!.m.r / DUST.M).toFixed(1)} M` : null) },
    { label: 'Toward the hole: measured · predicted', value: ({ world }) => (ringNow(world) ? `×${ringNow(world)!.m.radial.toFixed(3)} · ×${ringNow(world)!.p.radial.toFixed(3)}` : null) },
    { label: 'Across: measured · predicted', value: ({ world }) => (ringNow(world) ? `×${ringNow(world)!.m.tangential.toFixed(3)} · ×${ringNow(world)!.p.tangential.toFixed(3)}` : null) },
  ],
  exact: ['Each particle: a Schwarzschild geodesic from rest. The tidal tensor and its trace-free form are exact.'],
  approx: [
    'Linear deviation assumes the ring is small against r. Here it starts at 4/120 and agrees with the simulation to 2% down to 8M (a test); nearer the hole the ring is large against r and the gap grows.',
    'The measurement compares positions at equal distant time t, carried into the centre’s falling frame (radial EΔr/f). Each particle may trail the world by part of a step; that lag is carried forward at its own velocity.',
    'albe is planar: the out-of-plane axis is computed from the same equation, not simulated, and drawn as a separate bar.',
  ],
  myths: [
    {
      picture: 'Vacuum preserves volume, so the ring’s area should stay the same.',
      gr: 'Only in three dimensions. The ring shows two of the three axes: in its plane the area grows, because the stretch toward the hole is twice the squeeze across. The third axis, out of the plane, squeezes as well, and the three together keep the volume at second order.',
    },
  ],
  reading: [
    'F. A. E. Pirani (1956), “On the physical significance of the Riemann tensor”, Acta Phys. Pol. 15, 389.',
    'A. K. Raychaudhuri (1955), “Relativistic cosmology. I”, Phys. Rev. 98, 1123.',
    'C. W. Misner, K. S. Thorne & J. A. Wheeler (1973), Gravitation, W. H. Freeman, ch. 11 and 31.',
  ],
};
