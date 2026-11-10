/** What the Euclid panel and 3D view both draw, computed once per state change. */
import { shoot, type Geodesic } from '../../physics/conformal';
import {
  antipode,
  circleCircumference,
  circleClosedForm,
  flammChart,
  flammProperRadius,
  flammR,
  geodesic,
  GEOMETRIES,
  POSTULATES,
  triangle,
  type GeometryInfo,
  type Holds,
  type Triangle,
} from '../../physics/euclid';
import { euclidStore, type EuclidState } from '../../state/euclid';

export interface EuclidModel {
  g: GeometryInfo;
  tri: Triangle | null;
  circle: { s: number; length: number; closed: number | null; xs: number[]; ys: number[] } | null;
  perp: { a: Geodesic; b: Geodesic; base: number; gap: number } | null;
  /** Great circles through antipodal A and B. */
  antipodal: Geodesic[];
  /** A geodesic from A aimed at the hole: stopped at the throat, and continued on the full bridge. */
  edge: { stopped: Geodesic; continued: Geodesic; toThroat: number } | null;
  postulates: [Holds, string][];
}

/** Taxicab plane: only postulate 4 fails (its lines are the Euclidean ones; its circles are squares). */
export const TAXICAB: [Holds, string][] = [
  ['holds', 'Two points fix one straight line (though many paths share the shortest length).'],
  ['holds', 'Lines run on for ever.'],
  ['holds', 'Circles of every radius exist: they are squares standing on a corner.'],
  ['fails', 'Lengths depend on direction, so a right angle turned by 45° cannot be laid on one along the axes: the only length-keeping turns are multiples of 90°.'],
  ['holds', 'One parallel, as in the Euclidean plane, since the lines are the same.'],
];

let cache: { s: EuclidState; m: EuclidModel } | null = null;

export function euclidModel(s: EuclidState = euclidStore.get()): EuclidModel {
  if (cache && cache.s === s) return cache.m;
  const g = GEOMETRIES[s.geometry];
  const v = s.verts.length === 3 ? s.verts : g.triangle;
  const antipodes = s.demo === 'antipodes' && g.id === 'sphere';
  const tri = antipodes ? null : triangle(g, v, s.dragging);
  let circle: EuclidModel['circle'] = null;
  if (s.circle > 0 && s.demo !== 'taxicab') {
    const c = circleCircumference(g.chart, v[0][0], v[0][1], s.circle, s.dragging ? 96 : 240);
    circle = { s: s.circle, length: c.length, closed: circleClosedForm(g.id, s.circle), xs: c.xs, ys: c.ys };
  }
  let perp: EuclidModel['perp'] = null;
  if (s.perpendiculars && tri && s.demo !== 'taxicab') {
    const ab = tri.edges[0];
    const base = ab.length;
    // Raise a geodesic at right angles to AB at each end, on the side of C, each as long as AB.
    const side = Math.sign(Math.cos(ab.theta0) * (v[2][1] - v[0][1]) - Math.sin(ab.theta0) * (v[2][0] - v[0][0])) || 1;
    const eta = s.dragging ? 0.012 : 0.004;
    const a = shoot(g.chart, v[0][0], v[0][1], ab.theta0 + (side * Math.PI) / 2, base, { eta });
    const b = shoot(g.chart, v[1][0], v[1][1], ab.theta1 + (side * Math.PI) / 2, base, { eta });
    const ea: [number, number] = [a.x[a.x.length - 1], a.y[a.y.length - 1]];
    const eb: [number, number] = [b.x[b.x.length - 1], b.y[b.y.length - 1]];
    const top = a.end === 'length' && b.end === 'length' ? geodesic(g, ea, eb, s.dragging) : null;
    perp = { a, b, base, gap: top ? top.length : NaN };
  }
  const antipodal: Geodesic[] = [];
  if (antipodes) {
    for (let k = 0; k < 6; k++) antipodal.push(shoot(g.chart, v[0][0], v[0][1], (k * Math.PI) / 6, Math.PI, { eta: 0.006 }));
  }
  let edge: EuclidModel['edge'] = null;
  if (s.demo === 'edge' && g.id === 'flamm') {
    const [x, y] = v[0];
    const inward = Math.atan2(-y, -x);
    const R = Math.hypot(x, y);
    const toThroat = flammProperRadius(flammR(R, 1), 1);
    const stopped = shoot(flammChart(1, true), x, y, inward, 4 * toThroat + 10, { eta: 0.004 });
    const continued = shoot(g.chart, x, y, inward, 2 * toThroat, { eta: 0.004 });
    edge = { stopped, continued, toThroat };
  }
  const postulates = s.demo === 'taxicab' ? TAXICAB : g.postulates;
  const m: EuclidModel = { g, tri, circle, perp, antipodal, edge, postulates };
  cache = { s, m };
  return m;
}

/** Postulate k (1-based) switched off: the geometry and demo that show it failing. */
export function exampleFor(k: number): Partial<EuclidState> {
  const sph = GEOMETRIES.sphere;
  switch (k) {
    case 1:
      return { geometry: 'sphere', demo: 'antipodes', verts: [sph.triangle[0], antipode(...sph.triangle[0]), sph.triangle[2]], circle: 0 };
    case 2:
      return { geometry: 'flamm', demo: 'edge', verts: GEOMETRIES.flamm.triangle, circle: 0 };
    case 3:
      return { geometry: 'sphere', demo: 'none', verts: sph.triangle, circle: 2.4 };
    case 4:
      return { geometry: 'flat', demo: 'taxicab', verts: GEOMETRIES.flat.triangle, circle: 0 };
    default:
      return { geometry: 'hyperbolic', demo: 'none', verts: GEOMETRIES.hyperbolic.triangle, circle: 0, perpendiculars: true };
  }
}

export const POSTULATE_LIST = POSTULATES;
