/** Gyroscope, Kruskal diagram, dust ring and effective potential, against closed forms and the simulation. */
import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { deviationAlongFall, deviationAt, fallRadius, measureRing, positionNow, ringAxes } from './dust';
import { EARTH_EQUATORIAL_RADIUS, EARTH_GM, geodetic, geodeticRateMasPerYear, GPB, GPB_ALTITUDE, sliceTransport, transportGyroscope, transportOnSlice } from './gyro';
import { compact, fallAt, fallWorldline, tortoise, uvOutside, uvProduct } from './kruskal';
import { apsidalAngle } from './measure';
import { radialFall } from './measure';
import { DEFAULT_NBODY } from './nbody';
import { circularConstants, circularRadius, epicycleAdvance, radialToOrbital, V2 } from './potential';
import { DUST, presetById } from './presets';

const deg = (r: number) => (r * 180) / Math.PI;

describe('gyroscope round a hole', () => {
  it('closed forms: 66.1° on the slice against 105.4° for the gyroscope at 6M', () => {
    expect(deg(sliceTransport(1, 6))).toBeCloseTo(66.06, 2);
    expect(deg(geodetic(1, 6))).toBeCloseTo(105.44, 2);
  });

  it('numerical parallel transport on the Flamm circle turns by −2π√(1 − 2M/r)', () => {
    for (const r of [4, 6, 20]) expect(transportOnSlice(1, r)).toBeCloseTo(-2 * Math.PI * Math.sqrt(1 - 2 / r), 8);
  });

  it('numerical spin transport on the circular geodesic turns by −2π√(1 − 3M/r) in the comoving frame', () => {
    for (const r of [4, 6, 20]) expect(transportGyroscope(1, r)).toBeCloseTo(-2 * Math.PI * Math.sqrt(1 - 3 / r), 6);
  });

  it('weak field: the gyroscope gets 3πM/r, of which the slice’s 2πM/r is the space-curvature share', () => {
    const r = 1e5;
    expect(geodetic(1, r) / ((3 * Math.PI) / r)).toBeCloseTo(1, 4);
    expect(sliceTransport(1, r) / geodetic(1, r)).toBeCloseTo(2 / 3, 4);
  });

  it('Gravity Probe B: 642 km above the equator gives 6621 mas/yr, 0.2% above the quoted 6606.1', () => {
    const rate = geodeticRateMasPerYear(EARTH_GM, EARTH_EQUATORIAL_RADIUS + GPB_ALTITUDE);
    expect(rate).toBeCloseTo(6621.3, 0);
    expect(Math.abs(rate / GPB.geodeticPredicted - 1)).toBeLessThan(0.003);
    expect(Math.abs(GPB.geodeticMeasured - GPB.geodeticPredicted)).toBeLessThan(GPB.geodeticError);
  });
});

describe('Kruskal diagram', () => {
  const M = 4;
  const R = 100;
  const line = fallWorldline(M, R, 800);

  it('outside the horizon the integrated v agrees with the closed-form t(η) of the fall', () => {
    for (const r of [90, 50, 20, 10]) {
      const { t } = radialFall(M, R, r);
      const want = uvOutside(M, r, t);
      const p = line.reduce((a, q) => (Math.abs(q.r - r) < Math.abs(a.r - r) ? q : a));
      const got = uvOutside(M, p.r, radialFall(M, R, p.r).t);
      expect(p.V / got.V).toBeCloseTo(1, 6);
      expect(p.U / got.U).toBeCloseTo(1, 6);
      expect(want.U * want.V).toBeCloseTo(uvProduct(M, r), 6);
    }
  });

  it('it crosses the future horizon (U = 0) at finite V and finite τ, and ends on r = 0 (UV = 1)', () => {
    const cross = line.find((p) => p.r < 2 * M)!;
    expect(cross.U).toBeGreaterThan(0);
    expect(Number.isFinite(cross.V)).toBe(true);
    const end = line[line.length - 1];
    expect(end.r).toBeCloseTo(0, 9);
    expect(end.U * end.V).toBeCloseTo(1, 9);
    // Total proper time π√(R³/8M), about 555 for the Clocks scene.
    expect(end.tau).toBeCloseTo(Math.PI * Math.sqrt((R * R * R) / (8 * M)), 6);
    expect(end.tau).toBeCloseTo(555.4, 1);
    expect(fallAt(line, end.tau / 2).tau).toBeCloseTo(end.tau / 2, 9);
  });

  it('T² − X² = UV, and the compactified map keeps light at 45°', () => {
    const p = line[100];
    const T = (p.U + p.V) / 2;
    const X = (p.V - p.U) / 2;
    expect((T * T - X * X) / (p.U * p.V)).toBeCloseTo(1, 7);
    // A radial light ray has U or V constant: its image moves along x = ±y.
    const a = compact(0.3, 1);
    const b = compact(0.3, 5);
    expect(Math.abs(b.x - a.x)).toBeCloseTo(Math.abs(b.y - a.y), 12);
    expect(tortoise(1, 3)).toBeCloseTo(3 + 2 * Math.log(0.5), 12);
  });
});

describe('dust ring', () => {
  const { M, R } = DUST;

  it('the centre falls on the cycloid', () => {
    const k = Math.sqrt((R * R * R) / (8 * M));
    expect(fallRadius(M, R, 0)).toBeCloseTo(R, 9);
    expect(fallRadius(M, R, k * (Math.PI / 2 + 1))).toBeCloseTo(R / 2, 6);
  });

  it('linear deviation from rest: radial ξ ≈ 1 + (M/r³)τ², tangential 1 − (M/2r³)τ², volume flat at second order', () => {
    const s = deviationAlongFall(M, R, 0.98 * R, 2000);
    const end = s[s.length - 1];
    const q = (M / R ** 3) * end.tau ** 2;
    expect((end.radial - 1) / q).toBeCloseTo(1, 1);
    expect((end.tangential - 1) / (-q / 2)).toBeCloseTo(1, 1);
    const volume = end.radial * end.tangential * end.normal - 1;
    const area = end.radial * end.tangential - 1;
    expect(Math.abs(volume)).toBeLessThan(0.05 * Math.abs(area));
    expect(area).toBeGreaterThan(0);
  });

  /** Ratios measured / linear prediction (radial, tangential) at three radii, for a ring of size xi. */
  function ringRatios(xi: number): number[] {
    const w = new World();
    const p = presetById('dust');
    w.loadPreset({ ...p, probes: p.probes.map((q, i) => (i === 0 ? q : { ...q, x: R + ((q.x - R) * xi) / DUST.xi, y: (q.y * xi) / DUST.xi })) });
    const predicted = deviationAlongFall(M, R, 5 * M);
    const out: number[] = [];
    for (const target of [80, 50, 32]) {
      while (true) {
        const c = w.probes.find((q) => q.label === 'Ring centre')!;
        if (Math.hypot(c.x, c.y) <= target) break;
        w.step(0.5, { gr: true, gw: false, pn: true }, DEFAULT_NBODY);
      }
      const c = w.probes.find((q) => q.label === 'Ring centre')!;
      const ring = w.probes.filter((q) => !q.label);
      expect(ring.length).toBe(DUST.n);
      const ax = ringAxes(DUST.n);
      const m = measureRing(M, R, xi, positionNow(c), positionNow(ring[ax.outer]), positionNow(ring[ax.inner]), positionNow(ring[ax.left]), positionNow(ring[ax.right]));
      const d = deviationAt(predicted, m.r);
      out.push(m.radial / d.radial, m.tangential / d.tangential);
    }
    return out;
  }

  it('the simulated ring follows the linear prediction while the ring is small against r', () => {
    // A quarter-size ring agrees to 0.5% all the way to 8M; the scene's ring to 2%, and the gap is
    // the ring's own size over r (nonlinear tides), which grows as it nears the hole.
    for (const c of ringRatios(DUST.xi / 4)) expect(Math.abs(c - 1)).toBeLessThan(0.005);
    for (const c of ringRatios(DUST.xi)) expect(Math.abs(c - 1)).toBeLessThan(0.02);
  });
});

describe('effective potential and epicycles', () => {
  it('circular orbits sit at the extrema of V², merging at the ISCO, L² = 12M², r = 6M', () => {
    const M = 1;
    for (const L of [3.7, 4.5, 6]) {
      const r = circularRadius(M, L);
      const h = 1e-5 * r;
      expect((V2(M, L, r + h) - V2(M, L, r - h)) / (2 * h)).toBeCloseTo(0, 8);
      expect(circularConstants(M, r).L2).toBeCloseTo(L * L, 9);
    }
    expect(circularRadius(M, Math.sqrt(12))).toBeCloseTo(6, 9);
    expect(radialToOrbital(M, 6)).toBe(0);
    expect(Number.isNaN(circularRadius(M, 3))).toBe(true);
  });

  it('the epicyclic advance is the elliptic integral’s limit as the orbit becomes circular', () => {
    const M = 1;
    for (const r of [8, 12, 30]) {
      const { E2, L2 } = circularConstants(M, r);
      // Raise E² a hair above the circular value: a slightly eccentric orbit about the same L.
      const V2min = (1 - (2 * M) / r) * (1 + L2 / (r * r));
      const exact = apsidalAngle(M, V2min + 1e-9, L2) - 2 * Math.PI;
      expect(exact).toBeCloseTo(epicycleAdvance(M, r), 3);
      expect(E2).toBeCloseTo(V2min, 9);
    }
    // The Explain toy's default: L = 4.2M round M = 4 is r ≈ 9.8M.
    expect(deg(epicycleAdvance(1, 12))).toBeCloseTo(149.1, 1);
  });
});
