import { describe, expect, it } from 'vitest';
import {
  B_CRIT,
  criticalImpact,
  deflectionRemainder,
  deflectionTable,
  einsteinRadius,
  isCaptured,
  isStrongLensScene,
  lensDistance,
  lensMap,
  lensNote,
  occlusionRadius,
  pointLensImages,
  schwarzschildDeflection,
  STRONG_LIMIT_BBAR,
  strongLensMap,
  tableRemainder,
} from './lens';
import { deflectionAngle } from './light';
import type { Source } from './types';

const hole: Source = { x: 0, y: 0, m: 5 };

describe('Einstein radius and image positions of a point lens', () => {
  it('θ_E = √(4 M D)', () => {
    expect(einsteinRadius(5, 200)).toBeCloseTo(Math.sqrt(4 * 5 * 200), 12);
    expect(einsteinRadius(1, 1)).toBeCloseTo(2, 12);
  });

  it('a source exactly behind the mass makes a ring at θ_E', () => {
    const D = 200;
    const tE = einsteinRadius(hole.m, D);
    for (const a of [0, 0.7, 2.1, 4]) {
      const p = lensMap(tE * Math.cos(a), tE * Math.sin(a), [hole], D);
      expect(p.x).toBeCloseTo(0, 10);
      expect(p.y).toBeCloseTo(0, 10);
    }
  });

  it('θ± = (β ± √(β² + 4 θ_E²)) / 2 are the two solutions of the lens equation', () => {
    const D = 300;
    const tE = einsteinRadius(hole.m, D);
    for (const beta of [0.5, 3, 10, 40, 120]) {
      const { plus, minus } = pointLensImages(beta, tE);
      expect(plus).toBeCloseTo((beta + Math.sqrt(beta * beta + 4 * tE * tE)) / 2, 12);
      expect(minus).toBeCloseTo((beta - Math.sqrt(beta * beta + 4 * tE * tE)) / 2, 12);
      expect(plus).toBeGreaterThan(tE);
      expect(minus).toBeLessThan(0);
      expect(plus + minus).toBeCloseTo(beta, 10);
      expect(plus * minus).toBeCloseTo(-tE * tE, 8);
      // Both images land on the source through the map itself (along the x axis).
      expect(lensMap(plus, 0, [hole], D).x).toBeCloseTo(beta, 8);
      expect(lensMap(minus, 0, [hole], D).x).toBeCloseTo(beta, 8);
    }
  });

  it('adds the deflections of several masses', () => {
    const a: Source = { x: -30, y: 0, m: 2 };
    const b: Source = { x: 45, y: 10, m: 3 };
    const D = 100;
    const p = lensMap(7, -3, [a, b], D);
    const single = (s: Source) => lensMap(7, -3, [s], D);
    expect(p.x).toBeCloseTo(single(a).x + single(b).x - 7, 12);
    expect(p.y).toBeCloseTo(single(a).y + single(b).y + 3, 12);
    // On the line between two equal masses at equal distance the deflections cancel.
    const twin: Source[] = [{ x: -40, y: 0, m: 2 }, { x: 40, y: 0, m: 2 }];
    expect(lensMap(0, 0, twin, D).x).toBeCloseTo(0, 12);
  });

  it('softens a galaxy into a Plummer lens, with no occlusion', () => {
    const g: Source = { x: 0, y: 0, m: 1, kind: 'galaxy', soft: 20, radius: 300 };
    expect(occlusionRadius(g)).toBe(0);
    const D = 500;
    const p = lensMap(10, 0, [g], D);
    expect(p.x).toBeCloseTo(10 - (4 * 1 * D * 10) / (100 + 400), 12);
  });
});

describe('capture and the exact Schwarzschild deflection', () => {
  it('b_c = 3√3 M, and rays below it are captured', () => {
    expect(B_CRIT).toBeCloseTo(5.196152422706632, 12);
    expect(criticalImpact(2)).toBeCloseTo(6 * Math.sqrt(3), 12);
    expect(isCaptured(5.19, 1)).toBe(true);
    expect(isCaptured(5.2, 1)).toBe(false);
    expect(schwarzschildDeflection(5.19, 1)).toBeNaN();
    expect(strongLensMap(5.19, 0, { x: 0, y: 0, m: 1 }, 40)).toBeNull();
    expect(strongLensMap(5.2, 0, { x: 0, y: 0, m: 1 }, 40)).not.toBeNull();
  });

  it('matches a direct integration of the null geodesic (light.ts)', () => {
    for (const [b, tol] of [
      [12, 2e-3],
      [8, 3e-3],
      [6, 6e-3],
      [5.4, 2e-2],
    ] as const) {
      const direct = deflectionAngle(1, b, 2000);
      expect(Math.abs(schwarzschildDeflection(b, 1) - direct)).toBeLessThan(tol);
    }
  });

  it('reduces to the weak-field series far from the mass', () => {
    for (const u of [1e-5, 1e-4, 1e-3, 3e-3]) {
      const series = (4 + ((15 * Math.PI) / 4 + ((128 / 3) + ((3465 * Math.PI) / 64) * u) * u) * u) * u;
      expect(schwarzschildDeflection(1 / u, 1)).toBeCloseTo(series, 9);
    }
    expect(schwarzschildDeflection(2000, 2)).toBeCloseTo(8 / 2000 + (15 * Math.PI * 4) / (4 * 2000 * 2000), 5);
  });

  it('is continuous across the series switch and scales with the mass', () => {
    const just = (u: number) => schwarzschildDeflection(1 / u, 1);
    expect(Math.abs(just(5e-4 * (1 + 1e-9)) - just(5e-4 * (1 - 1e-9)))).toBeLessThan(1e-9);
    expect(schwarzschildDeflection(30, 3)).toBeCloseTo(schwarzschildDeflection(10, 1), 10);
  });

  it('diverges logarithmically at b_c with the strong-limit constant', () => {
    for (const eps of [1e-4, 1e-6, 1e-8]) {
      const strong = -Math.log(eps) + STRONG_LIMIT_BBAR;
      expect(schwarzschildDeflection(B_CRIT * (1 + eps), 1)).toBeCloseTo(strong, 3);
    }
    expect(STRONG_LIMIT_BBAR).toBeCloseTo(-0.4002, 3);
  });

  it('the lookup table reproduces the exact angle over the whole range', () => {
    const table = deflectionTable();
    expect(table[0]).toBe(0);
    expect(table[table.length - 1]).toBeCloseTo(STRONG_LIMIT_BBAR, 3);
    for (const b of [5.21, 5.5, 6, 8, 15, 40, 300, 5000]) {
      const x = B_CRIT / b;
      const exact = schwarzschildDeflection(b, 1);
      expect(Math.abs(-Math.log(1 - x) + tableRemainder(table, x) - exact)).toBeLessThan(5e-4);
    }
    // h is smooth near the divergence, where the log has taken its singular part.
    expect(Math.abs(deflectionRemainder(0.9999) - deflectionRemainder(0.99995))).toBeLessThan(0.002);
  });

  it('the strong map tends to the thin-lens map when the bending is small', () => {
    const s: Source = { x: 0, y: 0, m: 1 };
    const D = 4000;
    const strong = strongLensMap(400, 0, s, D)!;
    expect(strong.x).toBeCloseTo(lensMap(400, 0, [s], D).x, 0);
    expect(strong.y).toBeCloseTo(0, 10);
    // Close to the hole the bending is strong: the weak map is no longer the same.
    const near = strongLensMap(6, 0, s, D)!;
    expect(Math.abs(near.x - lensMap(6, 0, [s], D).x)).toBeGreaterThan(100);
  });
});

describe('occlusion, distance and labels', () => {
  it('a solid body grazes at R / √(1 − 2M/R), a compact body at b_c', () => {
    const star: Source = { x: 0, y: 0, m: 0.5, radius: 9, kind: 'star' };
    expect(occlusionRadius(star)).toBeCloseTo(9 / Math.sqrt(1 - 1 / 9), 12);
    expect(occlusionRadius(hole)).toBeCloseTo(B_CRIT * 5, 12);
    expect(occlusionRadius({ x: 0, y: 0, m: 2, radius: 5, kind: 'ns' })).toBeCloseTo(B_CRIT * 2, 12);
  });

  it('the view distance puts a hole’s ring outside its shadow', () => {
    const d = lensDistance([hole]);
    expect(einsteinRadius(hole.m, d) / criticalImpact(hole.m)).toBeGreaterThan(2);
    expect(lensDistance([])).toBe(0);
    expect(lensDistance([{ x: 0, y: 0, m: 1, kind: 'galaxy', soft: 20, radius: 340 }])).toBe(400);
  });

  it('labels the exact case and the thin-lens case honestly', () => {
    expect(isStrongLensScene([hole])).toBe(true);
    expect(isStrongLensScene([{ x: 0, y: 0, m: 1, kind: 'star', radius: 9 }])).toBe(false);
    expect(isStrongLensScene([hole, { x: 90, y: 0, m: 1 }])).toBe(false);
    expect(lensNote([hole], 32).tag).toMatch(/exact bending/);
    expect(lensNote([hole], 32).tag).toMatch(/2D source plane/);
    const two = lensNote([hole, { x: 90, y: 0, m: 1 }], 32);
    expect(two.tag).toMatch(/thin lens/);
    expect(two.tag).toMatch(/no strong-field/);
    expect(two.tag).toMatch(/2D source plane/);
    expect(lensNote([], 32).tag).toMatch(/no lens/);
    expect(lensNote(new Array(40).fill(hole), 32).body).toMatch(/first 32/);
  });
});
