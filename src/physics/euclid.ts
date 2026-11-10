/**
 * Euclid's postulates, switched off one at a time, and the same measurements on albe's own folds.
 *
 * Each geometry is a conformal chart (src/physics/conformal.ts), so the angles drawn are true angles:
 *  - flat plane, σ = 0;
 *  - unit sphere by stereographic projection, e^σ = 2/(1 + |x|²), K = +1;
 *  - hyperbolic plane as the Poincaré disk, e^σ = 2/(1 − |x|²), K = −1;
 *  - the Flamm slice (t = const, θ = π/2) of Schwarzschild in isotropic radius R, r = R(1 + M/2R)²,
 *    e^σ = (1 + M/2R)², K = −M/r³; R = M/2 is the throat (r = 2M), R < M/2 the other sheet;
 *  - the Ellis wormhole, l = (R − b²/4R), e^σ = 1 + b²/4R², K = −b²/(l² + b²)²; R = b/2 is the throat;
 *  - the Alcubierre bubble's t = const slice, whose spatial metric is exactly δᵢⱼ, so K = 0.
 *
 * Triangles use the shortest geodesic between their vertices; the curvature integral is a separate
 * quadrature of K e^{2σ} over the chart region, so the check of Gauss-Bonnet is not circular.
 */
import { angleBetween, fanIntegral, geodesicBetween, shoot, winding, type Chart, type Geodesic } from './conformal';

export type GeometryId = 'flat' | 'sphere' | 'hyperbolic' | 'flamm' | 'ellis' | 'alcubierre';

/** Euclid's five postulates (Heath's translation, shortened). */
export const POSTULATES = [
  { n: 1, short: 'One line through two points', text: 'A straight line can be drawn from any point to any point (and, as Euclid uses it, only one).' },
  { n: 2, short: 'Lines extend for ever', text: 'A finite straight line can be produced continuously in a straight line.' },
  { n: 3, short: 'Circles of any radius', text: 'A circle can be described with any centre and any radius.' },
  { n: 4, short: 'All right angles are equal', text: 'All right angles are equal to one another.' },
  { n: 5, short: 'One parallel', text: 'Through a point off a line there is exactly one line that never meets it (Playfair’s form).' },
] as const;

export type Holds = 'holds' | 'fails' | 'holds, with a caveat';

export interface GeometryInfo {
  id: GeometryId;
  name: string;
  chart: Chart;
  /** Half-width of the drawn chart. */
  view: number;
  /** Throat or edge circle radius in the chart, if any. */
  throat?: number;
  /** Does each postulate hold, and why (index 0 = postulate 1). */
  postulates: [Holds, string][];
  /** A default triangle that shows the geometry off. */
  triangle: [number, number][];
  /** Euler characteristic of the whole surface (for the Gauss-Bonnet total). */
  totalCurvature: number | null;
  /** How the chart draws it. */
  chartNote: string;
}

const flatChart: Chart = {
  sigma(_x, _y, out) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
  },
  K: () => 0,
  inside: () => true,
  scale: 1,
};

/** Unit sphere, stereographic from the north pole: the south pole is the origin, the equator |x| = 1. */
export const sphereChart: Chart = {
  sigma(x, y, out) {
    const q = 1 + x * x + y * y;
    out[0] = Math.log(2 / q);
    out[1] = (-2 * x) / q;
    out[2] = (-2 * y) / q;
  },
  K: () => 1,
  inside: (x, y) => x * x + y * y < 2500,
  scale: 1,
};

/** Poincaré disk, curvature −1. */
export const hyperbolicChart: Chart = {
  sigma(x, y, out) {
    const q = 1 - x * x - y * y;
    out[0] = Math.log(2 / q);
    out[1] = (2 * x) / q;
    out[2] = (2 * y) / q;
  },
  K: () => -1,
  inside: (x, y) => x * x + y * y < 0.999999,
  scale: 0.5,
};

/** Areal radius r of the Flamm slice at isotropic radius R. */
export const flammR = (R: number, M: number): number => R * (1 + M / (2 * R)) ** 2;

export function flammChart(M: number, outsideOnly = false): Chart {
  return {
    sigma(x, y, out) {
      const R = Math.hypot(x, y);
      const a = 1 + M / (2 * R);
      out[0] = 2 * Math.log(a);
      const dR = -M / (R * (R + M / 2));
      out[1] = (dR * x) / R;
      out[2] = (dR * y) / R;
    },
    K(x, y) {
      const R = Math.hypot(x, y);
      return -M / flammR(R, M) ** 3;
    },
    inside: (x, y) => Math.hypot(x, y) > (outsideOnly ? M / 2 : 1e-3 * M),
    scale: M,
  };
}

/** Proper radial distance from the throat to areal radius r on the Flamm slice (closed form). */
export function flammProperRadius(r: number, M: number): number {
  const s = Math.sqrt(r * (r - 2 * M));
  return s + M * Math.log((r - M + s) / M);
}

/** Ellis wormhole of throat radius b. Proper radial distance l = R − b²/(4R), areal radius R + b²/(4R). */
export function ellisChart(b: number): Chart {
  const c = (b * b) / 4;
  return {
    sigma(x, y, out) {
      const R2 = x * x + y * y;
      out[0] = Math.log(1 + c / R2);
      const k = (-2 * c) / (R2 * (R2 + c));
      out[1] = k * x;
      out[2] = k * y;
    },
    K(x, y) {
      const R = Math.hypot(x, y);
      const areal = R + c / R;
      return -(b * b) / areal ** 4;
    },
    inside: (x, y) => Math.hypot(x, y) > 1e-3 * b,
    scale: b,
  };
}

/** The bubble's spatial slice: Alcubierre's line element at t = const is dx² + dy² + dz². */
const alcubierreChart: Chart = { ...flatChart };

const holdsAll: [Holds, string][] = [
  ['holds', 'Two points fix one straight line.'],
  ['holds', 'A line runs on for ever.'],
  ['holds', 'Any centre, any radius.'],
  ['holds', 'Turn and slide one right angle onto another: the plane looks the same in every direction.'],
  ['holds', 'Exactly one parallel; angles of a triangle sum to 180°.'],
];

export const GEOMETRIES: Record<GeometryId, GeometryInfo> = {
  flat: {
    id: 'flat',
    name: 'Flat plane',
    chart: flatChart,
    view: 2,
    postulates: holdsAll,
    triangle: [
      [-1.2, -0.7],
      [1.1, -0.9],
      [0.1, 1.2],
    ],
    totalCurvature: null,
    chartNote: 'The page is the plane itself.',
  },
  sphere: {
    id: 'sphere',
    name: 'Sphere (positive K)',
    chart: sphereChart,
    view: 2.4,
    throat: 1,
    postulates: [
      ['fails', 'Antipodal points are joined by every great circle through them. (Identify antipodes, the elliptic plane, and uniqueness comes back.)'],
      ['holds, with a caveat', 'A great circle can be continued for ever, but it closes after 2π: unbounded, yet finite (Riemann’s distinction).'],
      ['fails', 'No circle is wider than a great circle: a radius past π reaches the far pole, and circumference 2π sin s shrinks after s = π/2.'],
      ['holds', 'The sphere looks the same in every direction at every point: right angles can be moved onto each other.'],
      ['fails', 'No parallels: any two great circles meet, twice. Angle sums exceed 180° by the enclosed area.'],
    ],
    triangle: [
      [-0.55, -0.4],
      [0.75, -0.35],
      [0.05, 0.85],
    ],
    totalCurvature: 4 * Math.PI,
    chartNote: 'Stereographic chart: the south pole at the centre, the equator is the dashed circle, the north pole off at infinity. Angles on the page are true; lengths are not.',
  },
  hyperbolic: {
    id: 'hyperbolic',
    name: 'Hyperbolic plane (negative K)',
    chart: hyperbolicChart,
    view: 1.05,
    throat: 1,
    postulates: [
      ['holds', 'Two points fix one geodesic.'],
      ['holds', 'Geodesics run on for ever: the disk’s rim is infinitely far away.'],
      ['holds', 'Any radius, and circumference 2π sinh s grows faster than 2πs.'],
      ['holds', 'Homogeneous and isotropic, like the plane.'],
      ['fails', 'Infinitely many lines through a point miss a given line. Angle sums fall short of 180° by the enclosed area.'],
    ],
    triangle: [
      [-0.45, -0.3],
      [0.55, -0.3],
      [0.05, 0.55],
    ],
    totalCurvature: null,
    chartNote: 'Poincaré disk: geodesics are arcs meeting the rim at right angles, and the rim is infinitely far. Angles on the page are true; lengths are not.',
  },
  flamm: {
    id: 'flamm',
    name: 'Black hole: Flamm slice',
    chart: flammChart(1),
    view: 4,
    throat: 0.5,
    postulates: [
      ['fails', 'The throat makes the surface an annulus: two points are joined by geodesics on either side of it, and by more that wind round it.'],
      ['holds, with a caveat', 'On the whole Einstein-Rosen bridge a geodesic crosses the throat into the other sheet and runs on. Keep only r ≥ 2M, as an outside observer does, and it ends at the throat after finite length.'],
      ['holds, with a caveat', 'Circles of every radius exist, but past the distance to the throat they wrap it and stop being simple loops.'],
      ['holds', 'Every point is isotropic to first order, as in any Riemannian geometry.'],
      ['fails', 'K = −M/r³ < 0: nearby geodesics diverge, and angle sums fall short of 180°.'],
    ],
    triangle: [
      [1.0, -0.9],
      [2.2, 0.3],
      [0.7, 1.3],
    ],
    totalCurvature: -4 * Math.PI,
    chartNote: 'Isotropic chart, M = 1: r = R(1 + M/2R)². The throat (r = 2M) is the gold circle; inside it is the other sheet, with its far infinity at the centre. Angles on the page are true; lengths are not.',
  },
  ellis: {
    id: 'ellis',
    name: 'Ellis wormhole',
    chart: ellisChart(1),
    view: 2.6,
    throat: 0.5,
    postulates: [
      ['fails', 'Two points are joined on either side of the throat, and by geodesics that wind round it.'],
      ['holds', 'Geodesics cross the throat into the other universe and run on.'],
      ['holds, with a caveat', 'Every radius exists, but large circles wrap the throat.'],
      ['holds', 'Isotropic at every point, to first order.'],
      ['fails', 'K = −b²/(l² + b²)² < 0: angle sums fall short of 180°.'],
    ],
    triangle: [
      [0.75, -0.65],
      [1.7, 0.25],
      [0.55, 1.05],
    ],
    totalCurvature: -4 * Math.PI,
    chartNote: 'Conformal chart, b = 1: proper distance from the throat l = R − b²/4R. The throat is the gold circle; inside it is universe B. Angles on the page are true; lengths are not.',
  },
  alcubierre: {
    id: 'alcubierre',
    name: 'Warp bubble: spatial slice',
    chart: alcubierreChart,
    view: 2,
    throat: 1,
    postulates: holdsAll,
    triangle: [
      [-1.2, -0.7],
      [1.1, -0.9],
      [0.1, 1.2],
    ],
    totalCurvature: null,
    chartNote: 'Alcubierre’s metric at fixed t is dx² + dy² + dz²: the page is the slice itself. The dashed circle marks the bubble wall, which this slice cannot see.',
  },
};

export interface Triangle {
  edges: Geodesic[];
  /** Interior angles at the three vertices, radians. */
  angles: [number, number, number];
  sum: number;
  /** ∫ K dA over the region, by quadrature. */
  curvature: number;
  /** Proper area, by quadrature. */
  area: number;
  /** Euler characteristic of the region the edges bound: 1 for a disc, 0 if it wraps the throat. */
  chi: number;
}

/** Points on the sphere's chart: p ↔ unit vector (south pole at the origin). */
export function sphereToUnit(x: number, y: number): [number, number, number] {
  const q = 1 + x * x + y * y;
  return [(2 * x) / q, (2 * y) / q, (x * x + y * y - 1) / q];
}

export function unitToSphere(v: readonly number[]): [number, number] {
  return [v[0] / (1 - v[2]), v[1] / (1 - v[2])];
}

/** Antipode in the stereographic chart: p ↦ −p/|p|². */
export const antipode = (x: number, y: number): [number, number] => {
  const q = x * x + y * y;
  return [-x / q, -y / q];
};

/** The shortest geodesic from a to b, or null where there is no single one (antipodes on the sphere). */
export function geodesic(g: GeometryInfo, a: readonly [number, number], b: readonly [number, number], fast = false): Geodesic | null {
  if (g.id === 'sphere') {
    const u = sphereToUnit(a[0], a[1]);
    const w = sphereToUnit(b[0], b[1]);
    if (Math.hypot(u[0] + w[0], u[1] + w[1], u[2] + w[2]) < 1e-6) return null;
  }
  // Fast (while a vertex is dragged): coarser steps, still RK4, angles good to about 10⁻⁶.
  return geodesicBetween(g.chart, a, b, fast ? { eta: 0.012 } : {});
}

/** The geodesic triangle with these vertices, or null if an edge could not be found. */
export function triangle(g: GeometryInfo, v: readonly (readonly [number, number])[], fast = false): Triangle | null {
  const edges: Geodesic[] = [];
  for (let i = 0; i < 3; i++) {
    const e = geodesic(g, v[i], v[(i + 1) % 3], fast);
    if (!e) return null;
    edges.push(e);
  }
  // Interior angle at vertex i: between the edge leaving it and the reverse of the edge arriving.
  const angles = [0, 1, 2].map((i) => angleBetween(edges[i].theta0, edges[(i + 2) % 3].theta1 + Math.PI)) as [number, number, number];
  const px: number[] = [];
  const py: number[] = [];
  const stride = fast ? 3 : 1;
  for (const e of edges) {
    for (let k = 0; k < e.x.length - 1; k += stride) {
      px.push(e.x[k]);
      py.push(e.y[k]);
    }
  }
  const c = g.chart;
  const KA = (x: number, y: number) => c.K(x, y) * areaOf(c, x, y);
  const A = (x: number, y: number) => areaOf(c, x, y);
  let chi = 1;
  let curvature: number;
  let area: number;
  if (g.throat && (g.id === 'flamm' || g.id === 'ellis') && winding(px, py, 0, 0) !== 0) {
    // The edges wrap the throat: the region is the annulus between the throat circle and the edges.
    chi = 0;
    curvature = Math.abs(fanIntegral(px, py, 0, 0, g.throat, KA));
    curvature = -curvature;
    area = Math.abs(fanIntegral(px, py, 0, 0, g.throat, A));
  } else {
    const cx = (v[0][0] + v[1][0] + v[2][0]) / 3;
    const cy = (v[0][1] + v[1][1] + v[2][1]) / 3;
    const sign = Math.sign(fanIntegral(px, py, cx, cy, 0, () => 1)) || 1;
    curvature = sign * fanIntegral(px, py, cx, cy, 0, KA);
    area = sign * fanIntegral(px, py, cx, cy, 0, A);
  }
  const sum = angles[0] + angles[1] + angles[2];
  return { edges, angles, sum, curvature, area, chi };
}

const sig = new Float64Array(3);
function areaOf(c: Chart, x: number, y: number): number {
  c.sigma(x, y, sig);
  return Math.exp(2 * sig[0]);
}

/**
 * Gauss-Bonnet for a geodesic triangle: Σα − π = ∫K dA + 2π(1 − χ). For a disc (χ = 1) the excess is the
 * enclosed curvature; a triangle round a throat bounds an annulus (χ = 0) and gains 2π.
 */
export const gaussBonnetExcess = (t: Triangle): number => t.curvature + 2 * Math.PI * (1 - t.chi);

/** Circumference of the geodesic circle of proper radius s about (x, y), from n radial geodesics. */
export function circleCircumference(c: Chart, x: number, y: number, s: number, n = 240): { length: number; xs: number[]; ys: number[] } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const g = shoot(c, x, y, (2 * Math.PI * i) / n, s, { eta: 0.004 });
    if (g.end === 'edge') return { length: NaN, xs, ys };
    xs.push(g.x[g.x.length - 1]);
    ys.push(g.y[g.y.length - 1]);
  }
  // Proper length of each short chord: e^σ at its midpoint times its chart length, error O(1/n²),
  // removed by Richardson extrapolation against the chords of every other point.
  const chords = (k: number) => {
    let sum = 0;
    for (let i = 0; i < n; i += k) {
      const j = (i + k) % n;
      const mx = (xs[i] + xs[j]) / 2;
      const my = (ys[i] + ys[j]) / 2;
      sum += Math.sqrt(areaOf(c, mx, my)) * Math.hypot(xs[j] - xs[i], ys[j] - ys[i]);
    }
    return sum;
  };
  return { length: (4 * chords(1) - chords(2)) / 3, xs, ys };
}

/** Closed-form circumference of a geodesic circle of radius s, where one exists. */
export function circleClosedForm(id: GeometryId, s: number): number | null {
  if (id === 'flat' || id === 'alcubierre') return 2 * Math.PI * s;
  if (id === 'sphere') return 2 * Math.PI * Math.sin(s);
  if (id === 'hyperbolic') return 2 * Math.PI * Math.sinh(s);
  return null;
}

/**
 * Two geodesics leaving perpendicular to a short base of proper length d at (x, y) along chart
 * direction θ: their proper separation after running length L each, against d. Jacobi's equation
 * J″ + KJ = 0 gives cos L on the unit sphere and cosh L on the hyperbolic plane.
 */
export function deviation(c: Chart, x: number, y: number, theta: number, d: number, L: number): { ratio: number; a: Geodesic; b: Geodesic } {
  // Ends of the base: half a proper length d/2 along ±(normal) from (x, y).
  const n = theta + Math.PI / 2;
  const e1 = shoot(c, x, y, n, d / 2, { eta: 0.002 });
  const e2 = shoot(c, x, y, n + Math.PI, d / 2, { eta: 0.002 });
  // The base is a geodesic through (x, y); at each end the parallel lines leave at right angles to it.
  const a = shoot(c, e1.x[e1.x.length - 1], e1.y[e1.y.length - 1], e1.theta1 - Math.PI / 2, L, { eta: 0.002 });
  const b = shoot(c, e2.x[e2.x.length - 1], e2.y[e2.y.length - 1], e2.theta1 + Math.PI / 2, L, { eta: 0.002 });
  const ax = a.x[a.x.length - 1];
  const ay = a.y[a.y.length - 1];
  const bx = b.x[b.x.length - 1];
  const by = b.y[b.y.length - 1];
  const sep = geodesicBetween(c, [ax, ay], [bx, by]);
  const proper = sep ? sep.length : Math.sqrt(areaOf(c, (ax + bx) / 2, (ay + by) / 2)) * Math.hypot(bx - ax, by - ay);
  return { ratio: proper / d, a, b };
}

/**
 * The hyperbolic angle of parallelism Π(d) = 2 arctan(e^{−d}): through a point at distance d from a
 * line, the geodesics within Π(d) of the perpendicular meet the line; the rest never do (Lobachevsky).
 */
export const angleOfParallelism = (d: number): number => 2 * Math.atan(Math.exp(-d));

/**
 * In the Poincaré disk, the point at hyperbolic distance d from the origin up the y axis, and the angle
 * from the perpendicular (straight down) at which a geodesic from it first misses the x axis, found by
 * bisection with the integrator. Compare angleOfParallelism(d).
 */
export function measuredParallelism(d: number): number {
  const y0 = Math.tanh(d / 2);
  const c = hyperbolicChart;
  const meets = (a: number) => {
    const g = shoot(c, 0, y0, -Math.PI / 2 + a, 60, { eta: 0.003 });
    return g.y.some((y) => y <= 0);
  };
  let lo = 0;
  let hi = Math.PI / 2;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (meets(mid)) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Closed-form spherical triangle: angles from the unit vectors (spherical trigonometry), and Girard's excess. */
export function sphericalTriangle(v: readonly (readonly [number, number])[]): { angles: number[]; excess: number } {
  const u = v.map(([x, y]) => sphereToUnit(x, y));
  const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const angles = [0, 1, 2].map((i) => {
    const A = u[i];
    const B = u[(i + 1) % 3];
    const C = u[(i + 2) % 3];
    // Side lengths, then the spherical law of cosines for the angle at A.
    const a = Math.acos(dot(B, C));
    const b = Math.acos(dot(A, C));
    const c = Math.acos(dot(A, B));
    return Math.acos((Math.cos(a) - Math.cos(b) * Math.cos(c)) / (Math.sin(b) * Math.sin(c)));
  });
  // Van Oosterom & Strackee (1983): tan(E/2) = |A·(B×C)| / (1 + A·B + B·C + C·A).
  const [A, B, C] = u;
  const triple = Math.abs(A[0] * (B[1] * C[2] - B[2] * C[1]) - A[1] * (B[0] * C[2] - B[2] * C[0]) + A[2] * (B[0] * C[1] - B[1] * C[0]));
  const excess = 2 * Math.atan2(triple, 1 + dot(A, B) + dot(B, C) + dot(C, A));
  return { angles, excess };
}

/** Closed-form hyperbolic triangle in the Poincaré disk: sides, angles (hyperbolic law of cosines), defect. */
export function hyperbolicTriangle(v: readonly (readonly [number, number])[]): { sides: number[]; angles: number[]; defect: number } {
  const dist = (p: readonly number[], q: readonly number[]) => {
    const pp = p[0] ** 2 + p[1] ** 2;
    const qq = q[0] ** 2 + q[1] ** 2;
    const pq = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2;
    return Math.acosh(1 + (2 * pq) / ((1 - pp) * (1 - qq)));
  };
  const sides = [dist(v[1], v[2]), dist(v[0], v[2]), dist(v[0], v[1])];
  const angles = [0, 1, 2].map((i) => {
    const a = sides[i];
    const b = sides[(i + 1) % 3];
    const c = sides[(i + 2) % 3];
    return Math.acos((Math.cosh(b) * Math.cosh(c) - Math.cosh(a)) / (Math.sinh(b) * Math.sinh(c)));
  });
  return { sides, angles, defect: Math.PI - angles[0] - angles[1] - angles[2] };
}

/**
 * Taxicab (ℓ¹) lengths: the plane with |dx| + |dy|. Its unit "circle" is a square, so it is not
 * isotropic: a right angle turned by 45° is not congruent to one along the axes, because the only
 * rotations that keep ℓ¹ lengths are multiples of 90°. Returns the ℓ¹ length of a Euclidean unit
 * vector at angle φ, which a turned ruler would read.
 */
export const taxicabLength = (phi: number): number => Math.abs(Math.cos(phi)) + Math.abs(Math.sin(phi));
