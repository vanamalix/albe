/**
 * Explainer for the Euclid exhibit: from Euclid to Gauss to Riemann to Einstein, with the triangle
 * on screen and the same measurement made once on each of albe's folds.
 */
import { GEOMETRIES, triangle, type GeometryId } from '../physics/euclid';
import { extremalCritical } from '../physics/majumdar';
import { euclidStore } from '../state/euclid';
import { exhibitStore } from '../state/exhibit';
import { euclidModel } from '../ui/exhibits/euclidModel';
import type { Explainer } from './content';

const deg = (r: number) => (r * 180) / Math.PI;

/** The default triangle on each fold, computed once (each takes tens of milliseconds). */
let folds: Record<'flamm' | 'ellis' | 'alcubierre', { excess: number; curvature: number }> | null = null;
export function foldTriangles() {
  if (folds) return folds;
  const one = (id: GeometryId) => {
    const t = triangle(GEOMETRIES[id], GEOMETRIES[id].triangle)!;
    return { excess: t.sum - Math.PI, curvature: t.curvature };
  };
  folds = { flamm: one('flamm'), ellis: one('ellis'), alcubierre: one('alcubierre') };
  return folds;
}

const live = () => {
  const s = euclidStore.get();
  return s.demo === 'taxicab' ? null : euclidModel(s);
};

export const euclidExplainer: Explainer = {
  title: 'Euclid’s postulates',
  seeing:
    'Five switches, one per postulate, and a geodesic triangle to drag. The chart beside it is conformal: angles on the page are the true angles, lengths are not. Switching a postulate off moves to a geometry where it fails. The same measurements then run on three of albe’s folds: the Flamm slice of a black hole, the Ellis wormhole and the warp bubble’s slice.',
  why: {
    words:
      'For two thousand years the fifth postulate, about parallels, looked as if it should follow from the other four. It does not. On a sphere there are no parallels and a triangle’s angles add to more than 180°; on a saddle-shaped surface there are many and they add to less. Gauss showed that this curvature can be measured from inside the surface, just by measuring triangles. Riemann built geometry in any number of dimensions on that idea, and Einstein used Riemann’s geometry for spacetime: gravity is curvature. Around a black hole a triangle in space adds to less than 180°.',
    numbers: () => {
      const f = foldTriangles();
      const m = live();
      const now = m?.tri ? `Here: angles sum to ${deg(m.tri.sum).toFixed(2)}°, and the curvature inside is ${deg(m.tri.curvature).toFixed(2)}°. ` : '';
      return `${now}The default triangle on each fold: black hole slice ${deg(f.flamm.excess).toFixed(2)}° from 180° (curvature inside ${deg(f.flamm.curvature).toFixed(2)}°), wormhole ${deg(f.ellis.excess).toFixed(2)}° (${deg(f.ellis.curvature).toFixed(2)}°), warp bubble slice ${deg(f.alcubierre.excess).toFixed(2)}°. The whole outer Flamm sheet holds −360° of curvature, the whole wormhole −720°.`;
    },
    equation:
      'Gauss’s theorema egregium (1827): K is intrinsic. In a conformal chart g = e^{2σ}(dx² + dy²) it is K = −e^{−2σ}Δσ, and geodesics are the curves whose chart curvature is ∂σ/∂n. For a geodesic triangle Gauss-Bonnet gives Σα − π = ∫K dA. In general ∫K dA + ∮k_g ds + Σ(π − αᵢ) = 2πχ, so a triangle round a throat, bounding an annulus with χ = 0, has Σα − 3π = ∫K dA. Riemann (1854) replaced K by the curvature tensor R^a_{bcd}; in two dimensions it has one component, R₁₂₁₂ = K det g. Einstein (1915) set G_ab = 8πT_ab for a Lorentzian metric. The Flamm slice of Schwarzschild has K = −M/r³ (its exterior holds −2π in all, −2π√(1 − 2M/r) inside areal radius r); the Ellis slice K = −b²/(l² + b²)². Alcubierre’s slice is dx² + dy² + dz², K = 0: the warp is in how the slices are stacked, the extrinsic curvature K_ij = ½(∂ᵢβⱼ + ∂ⱼβᵢ) with lapse 1, whose trace is the θ the Warp view paints.',
    eq: [
      'Σα − π = ∫∫ K dA   (geodesic triangle bounding a disc)',
      'K = −e^{−2σ} Δσ   for g = e^{2σ}(dx² + dy²)',
      'C(s) = 2πs (1 − K s²/6 + …);  sphere 2π sin s, hyperbolic 2π sinh s',
      'Flamm: K = −M/r³ · Ellis: K = −b²/(l² + b²)² · Alcubierre slice: K = 0',
    ],
  },
  watch: [
    { label: 'Geometry', value: () => (euclidStore.get().demo === 'taxicab' ? 'taxicab plane' : GEOMETRIES[euclidStore.get().geometry].name) },
    { label: 'Angle sum', value: () => (live()?.tri ? `${deg(live()!.tri!.sum).toFixed(2)}°` : null) },
    { label: '∫K dA inside', value: () => (live()?.tri ? `${deg(live()!.tri!.curvature).toFixed(2)}°` : null) },
    { label: 'Black hole slice, default triangle: Σ − 180°', value: () => `${deg(foldTriangles().flamm.excess).toFixed(2)}°` },
    { label: 'Wormhole, default triangle: Σ − 180°', value: () => `${deg(foldTriangles().ellis.excess).toFixed(2)}°` },
    { label: 'Warp bubble slice: Σ − 180°', value: () => `${deg(foldTriangles().alcubierre.excess).toFixed(2)}°` },
  ],
  exact: [
    'Each geometry: closed-form σ and K, with geodesics integrated in the chart and checked against spherical and hyperbolic trigonometry, Girard’s area, Lobachevsky’s angle of parallelism, Jacobi’s cos and cosh, and Gauss-Bonnet (tests, five digits or better).',
    'Black hole slice: postulates 1 and 5 fail (a throat, and K < 0); 2 holds on the whole bridge but fails if only r ≥ 2M is kept; 3 holds, with circles wrapping the throat past a certain size; 4 holds.',
    'Wormhole: the same, except that 2 always holds, since geodesics cross into the other universe.',
    'Warp bubble slice: all five hold, and every triangle sums to exactly 180°.',
  ],
  approx: [
    'Nothing in the geometry is approximate, but the numbers are numerical: RK4 steps and Gauss-Legendre quadrature. While a vertex is dragged the steps are three times coarser; the readout settles when it is let go.',
    'These are spatial slices at one instant, t = const. Spacetime is Lorentzian (signature −+++), so they show one part of its curvature, and which part depends on how time is sliced: Schwarzschild’s slices are curved, Alcubierre’s flat, and both spacetimes are curved.',
  ],
  myths: [
    {
      picture: 'Curved space is what gravity is.',
      gr: 'Space curvature is only part of it. In spacetime the metric is Lorentzian, and four things change. The “angle” between two velocities is a rapidity, unbounded, so there is no 180° to compare with. A straight worldline is the longest path in proper time between two events, not the shortest: the triangle inequality reverses, which is the twin paradox. Circles become hyperbolae. And curvature has 20 components, not one; a vacuum keeps the 10 of the Weyl tensor. For slow motion the pull comes from g_tt, the curvature of time: on the Flamm slice alone a marble at rest stays at rest.',
    },
  ],
  reading: [
    'T. L. Heath (1908), The Thirteen Books of Euclid’s Elements, Cambridge University Press (the postulates, and Playfair’s form of the fifth).',
    'C. F. Gauss (1827), “Disquisitiones generales circa superficies curvas”, Comm. Soc. Reg. Sci. Gotting. Recent. 6, 99.',
    'B. Riemann (1868, lecture of 1854), “Über die Hypothesen, welche der Geometrie zu Grunde liegen”, Abh. Königl. Ges. Wiss. Göttingen 13, 133.',
    'E. Beltrami (1868), “Saggio di interpretazione della geometria non-euclidea”, Giornale di Matematiche 6, 284.',
    'D. Hilbert (1901), “Über Flächen von constanter Gaussscher Krümmung”, Trans. Amer. Math. Soc. 2, 87 (no complete hyperbolic plane in ordinary space).',
    'A. Einstein (1915), “Die Feldgleichungen der Gravitation”, Sitzungsber. Preuss. Akad. Wiss., 844.',
    'L. Flamm (1916), Physikalische Zeitschrift 17, 448; H. G. Ellis (1973), J. Math. Phys. 14, 104; M. Alcubierre (1994), Class. Quantum Grav. 11, L73.',
    'C. W. Misner, K. S. Thorne & J. A. Wheeler (1973), Gravitation, W. H. Freeman, ch. 21 (slices and extrinsic curvature).',
  ],
};

export const balancedExplainer: Explainer = {
  title: 'Two balanced holes',
  seeing:
    'Two black holes, each carrying the largest charge a black hole can have (Q = M), held at the separation set in the panel. A fan of light rays crosses the plane of both holes, coloured by where it ends up, and the plot shows each ray’s exit angle against its impact parameter b.',
  why: {
    words:
      'Two ordinary black holes fall together, and no exact formula describes them. Give each the maximum charge and the electric push cancels the gravitational pull exactly: they sit still, and the field of the pair is just the sum of their fields. That makes these light paths exact. Light can bounce between the holes any number of times before it leaves, and the rays that bounce for ever form a fractal: zoom into any edge between colours and more edges appear.',
    numbers: () => {
      const s = exhibitStore.get();
      return `Separation ${s.mpSep.toFixed(2)} M (coordinate distance). One hole alone captures rays with b < 4M, its photon sphere at areal radius 2M; two touching act as one of mass 2M and capture below 8M. The panel’s window is now ${(s.mpB1 - s.mpB0).toExponential(1)} M wide.`;
    },
    equation:
      'Majumdar (1947) and Papapetrou (1947): for static Einstein-Maxwell fields with A_t = U⁻¹ and every charge equal to its mass, the field equations reduce to ∇²U = 0 for ds² = −U⁻²dt² + U²dx², so U = 1 + Σ Mᵢ/|x − xᵢ| is exact. Hartle and Hawking (1972) showed each xᵢ is a regular horizon of area 4πMᵢ². Null geodesics of a static metric are the geodesics of the optical metric gᵢⱼ/(−g_tt) = U⁴δᵢⱼ (Fermat), so in the plane of the holes a ray turns at dθ/ds = 2n̂·∇U/U. One hole is extremal Reissner-Nordström: areal r = |x| + M, photon sphere r = 2M, critical b = 4M. Between two holes there are unstable periodic orbits bouncing from one to the other; rays near them escape after many bounces, and the set of b that never escapes is a Cantor set of measure zero (Shipley and Dolan 2016).',
    eq: ['ds² = −U⁻² dt² + U² (dx² + dy² + dz²)', 'U = 1 + M₁/|x − x₁| + M₂/|x − x₂|,   ∇²U = 0', 'dθ/ds = 2 n̂·∇U / U   (rays in the plane of the holes)'],
  },
  watch: [
    { label: 'Separation (coordinate)', value: () => `${exhibitStore.get().mpSep.toFixed(2)} M` },
    { label: 'Window of b', value: () => `${exhibitStore.get().mpB0.toPrecision(5)} to ${exhibitStore.get().mpB1.toPrecision(5)} M` },
    { label: 'One hole’s capture edge (extremal RN)', value: () => `b = ${extremalCritical(1).toFixed(1)} M` },
  ],
  exact: [
    'The spacetime, at any separation: superposition is exact because each hole has Q = M. No other multi-hole scene in albe is exact.',
    'The rays are null geodesics of it, in the plane of the holes, which by reflection symmetry they never leave. One hole alone gives b_c = 4M to three digits, the pair touching 8M (tests).',
  ],
  approx: [
    'Rays are integrated by RK4 at two step sizes; a ray whose fate they disagree on is marked grey. Near the fractal set the outcome is sensitive to everything, including the step.',
    'Rays start and stop 200 M_total away, so about 1° of far-field bending is left out of the exit angle.',
    'Not astrophysical. Real black holes are expected to be nearly neutral, since surrounding plasma would cancel any charge. This is a laboratory for exact multi-hole geometry, not a forecast.',
  ],
  myths: [
    {
      picture: 'Adding the fields of two masses is a shortcut that more computing would make exact.',
      gr: 'General relativity is nonlinear: the fields of two masses do not add, and no exact metric for two orbiting holes is known; numerical relativity solves them on supercomputers. This scene is one of the few exact multi-hole solutions, and it needs both holes extremally charged so that nothing moves. albe’s other multi-mass scenes add fields as a labelled approximation.',
    },
  ],
  reading: [
    'S. D. Majumdar (1947), “A class of exact solutions of Einstein’s field equations”, Phys. Rev. 72, 390.',
    'A. Papapetrou (1947), “A static solution of the equations of the gravitational field for an arbitrary charge-distribution”, Proc. R. Irish Acad. A 51, 191.',
    'J. B. Hartle & S. W. Hawking (1972), “Solutions of the Einstein-Maxwell equations with many black holes”, Commun. Math. Phys. 26, 87.',
    'J. O. Shipley & S. R. Dolan (2016), “Binary black hole shadows, chaotic scattering and the Cantor set”, Class. Quantum Grav. 33, 175001.',
  ],
};
