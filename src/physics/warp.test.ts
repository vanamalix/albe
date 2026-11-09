import { describe, expect, it } from 'vitest';
import {
  bubbleFrameEnergy,
  energyDensity,
  expansion,
  heldClockRate,
  horizonRadius,
  maxSlope,
  peakEnergyDensity,
  peakExpansion,
  piecewiseWallEnergy,
  shapeDF,
  shapeF,
  stepGeodesic,
  surfaceGravity,
  totalEnergy,
  wallThickness,
  warpDisplay,
  warpStepLimit,
  WarpSim,
  type WarpGeodesic,
  type WarpParams,
} from './warp';

const P: WarpParams = { v: 2, R: 30, sigma: 0.4 };
const SHAPES: WarpParams[] = [P, { v: 0.5, R: 10, sigma: 1 }, { v: 6, R: 60, sigma: 0.1 }, { v: 1, R: 1, sigma: 8 }];

/** Runs a geodesic in a bubble that starts at xs0, returning it and the final bubble position. */
function run(g: WarpGeodesic, T: number, p: WarpParams, xs0 = 0): { g: WarpGeodesic; xs: number } {
  const h = warpStepLimit(p);
  const n = Math.ceil(T / h);
  const dt = T / n;
  let xs = xs0;
  for (let i = 0; i < n; i++) {
    stepGeodesic(g, dt, xs, p);
    xs += p.v * dt;
  }
  return { g, xs };
}

const rest = (x: number, y: number): WarpGeodesic => ({ x, y, px: 0, py: 0, m: 1, tau: 0 });

describe('the shape function', () => {
  it('is 1 at the centre', () => {
    for (const p of SHAPES) expect(shapeF(0, p)).toBeCloseTo(1, 12);
  });

  it('falls to 0 far away, and stays positive and monotone', () => {
    for (const p of SHAPES) {
      expect(shapeF(p.R + 200 / p.sigma, p)).toBeLessThan(1e-100);
      let prev = Infinity;
      for (let r = 0; r < p.R + 30 / p.sigma; r += 0.05 / p.sigma) {
        const f = shapeF(r, p);
        expect(f).toBeGreaterThanOrEqual(0);
        expect(f).toBeLessThanOrEqual(1 + 1e-12);
        expect(f).toBeLessThanOrEqual(prev + 1e-12);
        prev = f;
      }
    }
  });

  it('matches the tanh form as Alcubierre wrote it', () => {
    for (const p of SHAPES) {
      for (let r = 0; r < p.R + 5 / p.sigma; r += 0.31 / p.sigma) {
        const direct = (Math.tanh(p.sigma * (r + p.R)) - Math.tanh(p.sigma * (r - p.R))) / (2 * Math.tanh(p.sigma * p.R));
        expect(shapeF(r, p)).toBeCloseTo(direct, 10);
      }
    }
  });

  it('has the slope of a finite difference of f', () => {
    for (const p of SHAPES) {
      const e = 1e-5 / p.sigma;
      for (let r = 0.2 / p.sigma; r < p.R + 8 / p.sigma; r += 0.37 / p.sigma) {
        const fd = (shapeF(r + e, p) - shapeF(r - e, p)) / (2 * e);
        expect(shapeDF(r, p)).toBeCloseTo(fd, 4);
      }
    }
  });
});

describe('York time θ', () => {
  it('equals v_s ∂f/∂x taken by finite differences of f', () => {
    const p = P;
    const e = 1e-5;
    for (const [dx, y, z] of [[35, 0, 0], [-29, 4, 3], [12, 28, 0], [31, -3, 7]]) {
      const fx = (shapeF(Math.hypot(dx + e, y, z), p) - shapeF(Math.hypot(dx - e, y, z), p)) / (2 * e);
      expect(expansion(dx, y, z, p)).toBeCloseTo(p.v * fx, 6);
    }
  });

  it('is antisymmetric front to back: contraction ahead, expansion behind', () => {
    for (const p of SHAPES) {
      for (const [dx, y] of [[p.R, 0], [p.R * 1.1, p.R * 0.3], [0.8 * p.R, p.R]]) {
        expect(expansion(dx, y, 0, p)).toBeCloseTo(-expansion(-dx, y, 0, p), 12);
        expect(expansion(dx, y, 0, p)).toBeLessThan(0);
      }
    }
  });

  it('is zero in the mid-plane, at the centre and far away', () => {
    expect(expansion(0, 33, 0, P)).toBeCloseTo(0, 12);
    expect(expansion(0, 0, 0, P)).toBeCloseTo(0, 12);
    expect(Math.abs(expansion(10000, 0, 0, P))).toBeLessThan(1e-100);
  });

  it('is linear in v_s', () => {
    expect(expansion(30, 5, 0, { ...P, v: 5 })).toBeCloseTo(2.5 * expansion(30, 5, 0, P), 10);
  });
});

describe('the Eulerian energy density T⁰⁰', () => {
  it('is never positive anywhere', () => {
    for (const p of SHAPES) {
      for (let dx = -2 * p.R; dx <= 2 * p.R; dx += p.R / 7) {
        for (let y = -2 * p.R; y <= 2 * p.R; y += p.R / 7) {
          for (const z of [0, p.R / 3]) expect(energyDensity(dx, y, z, p)).toBeLessThanOrEqual(0);
        }
      }
    }
  });

  it('is strictly negative in the wall and vanishes on the axis of motion', () => {
    expect(energyDensity(0, 30, 0, P)).toBeLessThan(0);
    expect(energyDensity(30, 0, 0, P)).toBe(-0);
  });

  it('agrees with the Hamiltonian constraint, 16π T⁰⁰ = K² − K_ij K^ij, from finite differences of the shift', () => {
    const p = P;
    const e = 1e-4;
    const dfd = (dx: number, y: number, z: number, axis: 0 | 1 | 2): number => {
      const s = [0, 0, 0];
      s[axis] = e;
      return (shapeF(Math.hypot(dx + s[0], y + s[1], z + s[2]), p) - shapeF(Math.hypot(dx - s[0], y - s[1], z - s[2]), p)) / (2 * e);
    };
    for (const [dx, y, z] of [[20, 24, 0], [-5, 31, 2], [25, 18, 9]]) {
      // β_x = −v f, so K_xx = −v f,x and K_xy = −½ v f,y and so on (flat slices, unit lapse).
      const Kxx = -p.v * dfd(dx, y, z, 0);
      const Kxy = -0.5 * p.v * dfd(dx, y, z, 1);
      const Kxz = -0.5 * p.v * dfd(dx, y, z, 2);
      const K2 = Kxx * Kxx;
      const KijKij = Kxx * Kxx + 2 * Kxy * Kxy + 2 * Kxz * Kxz;
      expect(energyDensity(dx, y, z, p)).toBeCloseTo((K2 - KijKij) / (16 * Math.PI), 7);
    }
  });

  it('scales as v_s²', () => {
    expect(energyDensity(5, 30, 0, { ...P, v: 6 })).toBeCloseTo(9 * energyDensity(5, 30, 0, P), 10);
  });

  it('has its peak where the sheet says it does', () => {
    for (const p of SHAPES) {
      expect(peakExpansion(p)).toBeCloseTo(p.v * maxSlope(p), 12);
      expect(peakEnergyDensity(p)).toBeCloseTo((p.v * p.v * maxSlope(p) ** 2) / (32 * Math.PI), 12);
    }
  });
});

describe('total energy', () => {
  it('is negative, and matches the thin-wall limit −v²R²σ/36', () => {
    const p = { v: 1, R: 30, sigma: 2 };
    expect(totalEnergy(p)).toBeLessThan(0);
    expect(totalEnergy(p) / (-(p.R * p.R) * p.sigma / 36)).toBeCloseTo(1, 3);
  });

  it('is two thirds of Pfenning & Ford’s estimate for a linear wall of the same central slope', () => {
    const p = { v: 3, R: 40, sigma: 3 };
    expect(totalEnergy(p) / piecewiseWallEnergy(p.v, p.R, wallThickness(p))).toBeCloseTo(2 / 3, 2);
  });

  it('reproduces a direct volume integral of T⁰⁰', () => {
    const p = { v: 1.5, R: 3, sigma: 2 };
    const steps = 80;
    const rMax = 8;
    const h = rMax / steps;
    let sum = 0;
    for (let i = 0; i < steps; i++) {
      const r = (i + 0.5) * h;
      for (let j = 0; j < 80; j++) {
        const th = ((j + 0.5) * Math.PI) / 80;
        sum += energyDensity(r * Math.cos(th), r * Math.sin(th), 0, p) * r * r * Math.sin(th) * h * (Math.PI / 80) * 2 * Math.PI;
      }
    }
    expect(sum / totalEnergy(p)).toBeCloseTo(1, 2);
  });
});

describe('clocks', () => {
  it('a particle at the centre stays there and has τ = t, whatever the speed', () => {
    for (const v of [0.5, 2, 6]) {
      const p = { ...P, v };
      const { g, xs } = run(rest(0, 0), 200, p);
      expect(g.x).toBeCloseTo(xs, 6);
      expect(g.tau).toBeCloseTo(200, 8);
    }
  });

  it('a clock held still off-centre runs slow, and stops mattering past the horizon', () => {
    expect(heldClockRate(0, P)).toBeCloseTo(1, 12);
    expect(heldClockRate(25, P)).toBeLessThan(1);
    expect(heldClockRate(1000, P)).toBeNaN();
  });
});

describe('the sim', () => {
  it('keeps the ship clock equal to coordinate time and the bubble on x = v t', () => {
    const s = new WarpSim();
    s.configure({ v: 3.5 });
    for (let i = 0; i < 300; i++) s.step(0.2);
    expect(s.tauShip).toBeCloseTo(s.t, 9);
    expect(s.xs).toBeCloseTo(3.5 * s.t, 9);
  });

  it('carries a particle on the axis ahead of the bubble', () => {
    const { g, xs } = run(rest(60, 0), 2000, P);
    expect(Math.abs(g.x - xs)).toBeLessThan(P.R);
    expect(g.tau).toBeCloseTo(2000, 6);
  });

  it('leaves a far-off particle behind, displaced forward by a speed-independent amount', () => {
    const shift = (v: number) => {
      const p = { ...P, v };
      const g = rest(150, 45);
      run(g, 600 / v, p);
      return g.x - 150;
    };
    expect(shift(2)).toBeGreaterThan(0);
    expect(shift(5)).toBeCloseTo(shift(2), 4);
  });

  it('leaves a particle far from the bubble where it is', () => {
    const g = rest(400, 400);
    run(g, 50, P);
    expect(g.x).toBe(400);
    expect(g.y).toBe(400);
  });
});

describe('conservation', () => {
  // A particle moving forward can stall at the horizon, where its momentum grows exponentially without
  // limit. That is real: it is the blueshift behind the instability Finazzi et al. describe. So the error
  // is measured against the momentum, not as an absolute difference of a large cancelling sum.
  it('holds the bubble-frame Hamiltonian for massive and null geodesics crossing the wall', () => {
    for (const g0 of [
      { x: 80, y: 25, px: -0.6, py: 0.3, m: 1, tau: 0 },
      { x: 90, y: 8, px: 0.2, py: -0.1, m: 1, tau: 0 },
      { x: 120, y: 30, px: -1, py: 0.2, m: 0, tau: 0 },
    ]) {
      const p = { ...P, v: 1.5 };
      const before = bubbleFrameEnergy(g0, 0, p);
      const { g, xs } = run({ ...g0 }, 120, p);
      const scale = 1 + Math.hypot(g.px, g.py);
      expect(Math.abs(bubbleFrameEnergy(g, xs, p) - before) / scale).toBeLessThan(1e-6);
    }
  });

  it('shows a forward-moving particle pinned at the horizon with growing momentum', () => {
    const p = { ...P, v: 1.5 };
    const { g, xs } = run({ x: 90, y: 0, px: 0.2, py: 0, m: 1, tau: 0 }, 300, p);
    expect(g.x - xs).toBeCloseTo(horizonRadius(p)!, 1);
    expect(g.px).toBeGreaterThan(1e3);
  });
});

describe('horizons', () => {
  it('do not exist at or below c', () => {
    expect(horizonRadius({ ...P, v: 0.5 })).toBeNull();
    expect(horizonRadius({ ...P, v: 1 })).toBeNull();
    expect(surfaceGravity({ ...P, v: 1 })).toBeNull();
  });

  it('sit where f = 1 − 1/v', () => {
    for (const v of [1.2, 2, 6]) {
      const p = { ...P, v };
      expect(shapeF(horizonRadius(p)!, p)).toBeCloseTo(1 - 1 / v, 10);
    }
  });

  it('stop forward light from the ship: it stalls at the horizon instead of escaping', () => {
    const p = { ...P, v: 2 };
    const g: WarpGeodesic = { x: 0, y: 0, px: 1, py: 0, m: 0, tau: 0 };
    const { g: end, xs } = run(g, 400, p);
    expect(end.x - xs).toBeCloseTo(horizonRadius(p)!, 3);
  });

  it('let forward light out when the bubble is subluminal', () => {
    const p = { ...P, v: 0.5 };
    const g: WarpGeodesic = { x: 0, y: 0, px: 1, py: 0, m: 0, tau: 0 };
    const { g: end, xs } = run(g, 400, p);
    expect(end.x - xs).toBeGreaterThan(100);
  });
});

describe('the display', () => {
  it('is θ/θ_peak, reaching ±1 and normalised for every speed', () => {
    const p = P;
    const peak = peakExpansion(p);
    let top = 0;
    for (let x = -50; x <= 50; x += 0.05) top = Math.max(top, Math.abs(warpDisplay('theta', x, 0, p, peak)));
    expect(top).toBeCloseTo(1, 3);
  });

  it('never makes the energy overlay positive', () => {
    const peak = peakEnergyDensity(P);
    for (let x = -60; x <= 60; x += 7) for (let y = -60; y <= 60; y += 7) expect(warpDisplay('energy', x, y, P, peak)).toBeLessThanOrEqual(0);
  });
});
