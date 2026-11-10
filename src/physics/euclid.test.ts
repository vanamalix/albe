import { describe, expect, it } from 'vitest';
import { fanIntegral, shoot } from './conformal';
import {
  angleOfParallelism,
  antipode,
  circleCircumference,
  circleClosedForm,
  deviation,
  ellisChart,
  flammChart,
  flammProperRadius,
  flammR,
  gaussBonnetExcess,
  geodesic,
  GEOMETRIES,
  hyperbolicChart,
  hyperbolicTriangle,
  measuredParallelism,
  sphereChart,
  sphericalTriangle,
  taxicabLength,
  triangle,
} from './euclid';

const P = (pts: number[][]) => pts.map(([x, y]) => [x, y] as [number, number]);

describe('Euclid: triangles against closed forms', () => {
  it('flat plane: angles sum to π and enclose no curvature', () => {
    const t = triangle(GEOMETRIES.flat, GEOMETRIES.flat.triangle)!;
    expect(t.sum).toBeCloseTo(Math.PI, 10);
    expect(t.curvature).toBe(0);
    // Shoelace area of the default triangle.
    const [[ax, ay], [bx, by], [cx, cy]] = GEOMETRIES.flat.triangle;
    expect(t.area).toBeCloseTo(Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay)) / 2, 8);
  });

  it('sphere: each angle matches spherical trigonometry, and the excess is Girard’s area', () => {
    for (const v of [GEOMETRIES.sphere.triangle, P([[0, 0], [1.4, 0.1], [0.3, 1.9]]), P([[-0.2, -0.1], [0.1, -0.2], [0, 0.15]])]) {
      const t = triangle(GEOMETRIES.sphere, v)!;
      const closed = sphericalTriangle(v);
      for (let i = 0; i < 3; i++) expect(t.angles[i]).toBeCloseTo(closed.angles[i], 7);
      expect(t.sum - Math.PI).toBeCloseTo(closed.excess, 7);
      // K = 1, so the area quadrature and the curvature quadrature are the same number.
      expect(t.curvature).toBeCloseTo(closed.excess, 5);
      expect(gaussBonnetExcess(t)).toBeCloseTo(t.sum - Math.PI, 5);
    }
  });

  it('hyperbolic plane: angles match the hyperbolic law of cosines, and the defect is the area', () => {
    for (const v of [GEOMETRIES.hyperbolic.triangle, P([[-0.8, -0.2], [0.7, -0.4], [0.1, 0.85]]), P([[0.1, 0.1], [0.3, 0.12], [0.2, 0.3]])]) {
      const t = triangle(GEOMETRIES.hyperbolic, v)!;
      const closed = hyperbolicTriangle(v);
      for (let i = 0; i < 3; i++) expect(t.angles[i]).toBeCloseTo(closed.angles[i], 7);
      expect(Math.PI - t.sum).toBeCloseTo(closed.defect, 7);
      expect(-t.curvature).toBeCloseTo(closed.defect, 5);
      // Each edge's proper length is the closed-form distance.
      expect(t.edges[0].length).toBeCloseTo(closed.sides[2], 6);
    }
  });

  it('Flamm slice and Ellis wormhole: angle sum minus π equals ∫K dA (Gauss-Bonnet)', () => {
    for (const g of [GEOMETRIES.flamm, GEOMETRIES.ellis]) {
      const t = triangle(g, g.triangle)!;
      expect(t.chi).toBe(1);
      expect(t.sum).toBeLessThan(Math.PI);
      expect(t.sum - Math.PI).toBeCloseTo(t.curvature, 5);
    }
  });

  it('a triangle round the throat bounds an annulus: Σα − 3π = ∫K dA', () => {
    for (const g of [GEOMETRIES.flamm, GEOMETRIES.ellis]) {
      const v = P([[2.2, 0], [-1.1, 1.9], [-1.1, -1.9]]);
      const t = triangle(g, v)!;
      expect(t.chi).toBe(0);
      expect(t.sum - 3 * Math.PI).toBeCloseTo(t.curvature, 4);
      expect(gaussBonnetExcess(t)).toBeCloseTo(t.sum - Math.PI, 4);
    }
  });

  it('the warp bubble’s slice is flat: no excess at all', () => {
    const t = triangle(GEOMETRIES.alcubierre, GEOMETRIES.alcubierre.triangle)!;
    expect(t.sum).toBeCloseTo(Math.PI, 10);
  });
});

describe('Euclid: circles, parallels and deviation', () => {
  it('circumference of a geodesic circle: 2π sin s on the sphere, 2π sinh s on the hyperbolic plane', () => {
    for (const s of [0.4, 1.2, 2.6]) {
      expect(circleCircumference(sphereChart, 0.2, -0.1, s).length).toBeCloseTo(circleClosedForm('sphere', s)!, 3);
    }
    for (const s of [0.3, 1, 2]) {
      expect(circleCircumference(hyperbolicChart, 0.1, 0, s).length).toBeCloseTo(circleClosedForm('hyperbolic', s)!, 3);
    }
  });

  it('Flamm slice: a radial geodesic from the throat has the closed-form proper radius', () => {
    const M = 1;
    const c = flammChart(M);
    for (const rho of [0.5, 2, 6]) {
      // Leave the throat (R = M/2) straight outward.
      const g = shoot(c, M / 2, 0, 0, rho, { eta: 0.002 });
      const R = Math.hypot(g.x[g.x.length - 1], g.y[g.y.length - 1]);
      expect(flammProperRadius(flammR(R, M), M)).toBeCloseTo(rho, 6);
    }
    // A circle round the hole at areal radius r has circumference 2πr, less than 2π × its proper radius.
    expect(flammProperRadius(10, 1)).toBeGreaterThan(10);
  });

  it('Flamm slice: a small geodesic circle has C = 2πs(1 − Ks²/6), with K = −M/r³', () => {
    const c = flammChart(1);
    const [x, y] = [1.2, 0];
    const K = c.K(x, y);
    const s = 0.15;
    const C = circleCircumference(c, x, y, s, 360).length;
    expect((C / (2 * Math.PI * s) - 1) / (-(K * s * s) / 6)).toBeCloseTo(1, 1);
    expect(K).toBeCloseTo(-1 / flammR(1.2, 1) ** 3, 12);
  });

  it('total curvature: the Flamm outer sheet to areal radius r holds −2π√(1 − 2M/r); the Ellis throat region −4π in all', () => {
    const M = 1;
    const c = flammChart(M);
    const n = 720;
    const R = 6;
    const xs = Array.from({ length: n }, (_, i) => R * Math.cos((2 * Math.PI * i) / n));
    const ys = Array.from({ length: n }, (_, i) => R * Math.sin((2 * Math.PI * i) / n));
    const sig = new Float64Array(3);
    const KA = (x: number, y: number) => {
      c.sigma(x, y, sig);
      return c.K(x, y) * Math.exp(2 * sig[0]);
    };
    expect(fanIntegral(xs, ys, 0, 0, M / 2, KA)).toBeCloseTo(-2 * Math.PI * Math.sqrt(1 - (2 * M) / flammR(R, M)), 4);
    // Ellis: by the symmetry R ↦ b²/4R, both universes out to proper distance l hold −4π l/√(l² + b²).
    const e = ellisChart(1);
    const KE = (x: number, y: number) => {
      e.sigma(x, y, sig);
      return e.K(x, y) * Math.exp(2 * sig[0]);
    };
    const l = R - 1 / (4 * R);
    expect(2 * fanIntegral(xs, ys, 0, 0, 0.5, KE)).toBeCloseTo((-4 * Math.PI * l) / Math.hypot(l, 1), 5);
  });

  it('hyperbolic angle of parallelism: the integrator finds Lobachevsky’s 2 arctan e^(−d)', () => {
    for (const d of [0.3, 1, 2]) expect(measuredParallelism(d)).toBeCloseTo(angleOfParallelism(d), 4);
  });

  it('geodesic deviation: J/J₀ = cos L on the sphere, cosh L on the hyperbolic plane, 1 on the plane', () => {
    expect(deviation(sphereChart, 0, 0, 0, 0.01, 1).ratio).toBeCloseTo(Math.cos(1), 3);
    expect(deviation(hyperbolicChart, 0, 0, 0, 0.01, 1.2).ratio).toBeCloseTo(Math.cosh(1.2), 3);
    expect(deviation(GEOMETRIES.flat.chart, 0, 0, 0.3, 0.1, 2).ratio).toBeCloseTo(1, 8);
  });

  it('postulate 1 fails on the sphere: antipodal points have no single geodesic, others do', () => {
    const a: [number, number] = [0.4, 0.2];
    expect(geodesic(GEOMETRIES.sphere, a, antipode(...a))).toBeNull();
    expect(geodesic(GEOMETRIES.sphere, a, [0.1, 0.9])).not.toBeNull();
    // Several great circles through a and its antipode, all of length π.
    for (const th of [0, 1, 2.5]) {
      const g = shoot(sphereChart, a[0], a[1], th, Math.PI, { eta: 0.002 });
      const [x, y] = [g.x[g.x.length - 1], g.y[g.y.length - 1]];
      const [px, py] = antipode(...a);
      expect(Math.hypot(x - px, y - py)).toBeLessThan(1e-6);
    }
  });

  it('postulate 4 fails in the taxicab plane: a unit ruler turned 45° reads √2', () => {
    expect(taxicabLength(0)).toBe(1);
    expect(taxicabLength(Math.PI / 4)).toBeCloseTo(Math.SQRT2, 12);
  });
});
