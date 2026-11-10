/**
 * Explainer for the Euclid exhibit: from Euclid to Gauss to Riemann to Einstein, with the triangle
 * on screen and the same measurement made once on each of albe's folds.
 */
import { GEOMETRIES, triangle, type GeometryId } from '../physics/euclid';
import { euclidStore } from '../state/euclid';
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
