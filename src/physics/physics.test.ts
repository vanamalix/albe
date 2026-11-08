import { describe, expect, it } from 'vitest';
import { FLAMM_REF, flammWell, flammZ, heightAt, lapse, potential, kretschmann } from './fields';
import { deflectionAngle } from './light';
import { advanceBodies, DEFAULT_NBODY, mergeBodies, totalEnergy, totalMass, totalMomentum } from './nbody';
import { circularSpeed, perihelionAdvance, probeDt, rk4ProbeStep } from './probes';
import type { Body } from './types';
import { figureEight } from './presets';
import { fitDistance, frameObjects, gridScale, planeAxis, PLANE_HALF, snapTo } from '../scene/plane';
import { ESCAPE_RADIUS, World } from '../sim/world';
import { DEFAULT_NBODY as NB } from './nbody';

const body = (id: number, x: number, y: number, vx: number, vy: number, m: number): Body => ({ id, x, y, vx, vy, m, ax: 0, ay: 0 });

describe('Flamm paraboloid', () => {
  it('matches z(r) = 2√(r_s(r − r_s))', () => {
    const rs = 2;
    expect(flammZ(rs, rs)).toBe(0);
    expect(flammZ(0.5 * rs, rs)).toBe(0);
    expect(flammZ(2 * rs, rs)).toBeCloseTo(2 * rs, 12);
    expect(flammZ(5 * rs, rs)).toBeCloseTo(4 * rs, 12);
    expect(flammZ(10, 2)).toBeCloseTo(2 * Math.sqrt(16), 12);
  });
  it('is pinned to 0 at the reference radius and deepest at the throat', () => {
    const rs = 2;
    expect(flammWell(FLAMM_REF, rs)).toBeCloseTo(0, 12);
    expect(flammWell(rs, rs)).toBeCloseTo(-flammZ(FLAMM_REF, rs), 12);
    expect(flammWell(rs / 2, rs)).toBe(flammWell(rs, rs));
    expect(flammWell(50, rs)).toBeLessThan(0);
    expect(flammWell(50, rs)).toBeGreaterThan(flammWell(10, rs));
  });
  it('heightAt superposes per-mass wells and lattice mode is flat', () => {
    const s = [{ x: 0, y: 0, m: 1 }, { x: 60, y: 0, m: 2 }];
    expect(heightAt('space', 10, 5, s, 1)).toBeCloseTo(flammWell(Math.hypot(10, 5), 2) + flammWell(Math.hypot(50, 5), 4), 12);
    expect(heightAt('lattice', 10, 5, s, 1)).toBe(0);
  });
  it('lapse and Kretschmann match Schwarzschild for one mass', () => {
    const s = [{ x: 0, y: 0, m: 1 }];
    expect(lapse(potential(8, 0, s))).toBeCloseTo(Math.sqrt(1 - 2 / 8), 12);
    expect(kretschmann(4, 0, s)).toBeCloseTo(48 / 4 ** 6, 12);
  });
});

describe('Newtonian N-body integrator', () => {
  it('conserves the energy of a Kepler orbit over many orbits', () => {
    const M = 1;
    const m = 1e-3;
    const a = 20;
    const e = 0.5;
    const ra = a * (1 + e);
    const mu = M + m;
    const vRel = Math.sqrt(mu * (2 / ra - 1 / a));
    // Centre-of-mass frame.
    const bodies = [body(1, (-m / mu) * ra, 0, 0, (-m / mu) * vRel, M), body(2, (M / mu) * ra, 0, 0, (M / mu) * vRel, m)];
    const opts = { ...DEFAULT_NBODY, softening: 0 };
    const e0 = totalEnergy(bodies, 0);
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / mu);
    let maxDrift = 0;
    for (let k = 0; k < 50; k++) {
      advanceBodies(bodies, period, opts, 0.01, 1e7);
      maxDrift = Math.max(maxDrift, Math.abs((totalEnergy(bodies, 0) - e0) / e0));
    }
    expect(bodies.length).toBe(2);
    expect(maxDrift).toBeLessThan(1e-3);
  });

  it('keeps the figure-eight choreography bounded for a period', () => {
    const bodies = figureEight(40, 1).map((b, i) => body(i, b.x, b.y, b.vx, b.vy, b.m));
    const opts = { ...DEFAULT_NBODY, softening: 0 };
    const e0 = totalEnergy(bodies, 0);
    const T = 6.3259 * Math.pow(40, 1.5);
    advanceBodies(bodies, T, opts, 0.005, 1e7);
    expect(bodies.length).toBe(3);
    expect(Math.abs((totalEnergy(bodies, 0) - e0) / e0)).toBeLessThan(1e-3);
    // After one period body 0 is back near its start.
    expect(Math.hypot(bodies[0].x - 0.97000436 * 40, bodies[0].y + 0.24308753 * 40)).toBeLessThan(2);
  });

  it('merging conserves mass and linear momentum', () => {
    const bodies = [body(1, -1, 0, 0.3, 0.1, 2), body(2, 1.5, 0.5, -0.2, 0.05, 1), body(3, 80, 0, 0, 0, 1)];
    const p0 = totalMomentum(bodies);
    const m0 = totalMass(bodies);
    const comX = (2 * -1 + 1 * 1.5) / 3;
    const events = mergeBodies(bodies);
    expect(events.length).toBe(1);
    expect(bodies.length).toBe(2);
    const p1 = totalMomentum(bodies);
    expect(p1.px).toBeCloseTo(p0.px, 12);
    expect(p1.py).toBeCloseTo(p0.py, 12);
    expect(totalMass(bodies)).toBeCloseTo(m0, 12);
    const remnant = bodies.find((b) => b.id === 1)!;
    expect(remnant.m).toBe(3);
    expect(remnant.x).toBeCloseTo(comX, 12);
  });
});

/** Integrates a probe around a static mass and returns the mean periapsis advance per orbit. */
function measurePrecession(gr: boolean, M: number, rp0: number, a0: number, orbits: number) {
  const src = [body(0, 0, 0, 0, 0, M)];
  const v = Math.sqrt(M * (2 / rp0 - 1 / a0));
  const p = { x: rp0, y: 0, vx: 0, vy: v };
  let phi = 0;
  let lastAngle = 0;
  let prevRadial = -1;
  const periapsisPhis: number[] = [];
  let rMin = Infinity;
  let rMax = 0;
  let guard = 0;
  while (periapsisPhis.length < orbits + 1 && guard++ < 5e6) {
    const dt = probeDt(p, src, 0.004);
    rk4ProbeStep(p, dt, src, gr);
    const ang = Math.atan2(p.y, p.x);
    let d = ang - lastAngle;
    if (d < -Math.PI) d += 2 * Math.PI;
    if (d > Math.PI) d -= 2 * Math.PI;
    phi += d;
    lastAngle = ang;
    const r = Math.hypot(p.x, p.y);
    rMin = Math.min(rMin, r);
    rMax = Math.max(rMax, r);
    const radial = p.x * p.vx + p.y * p.vy;
    if (prevRadial < 0 && radial >= 0) periapsisPhis.push(phi);
    prevRadial = radial;
  }
  const advances = periapsisPhis.slice(1).map((v, i) => v - periapsisPhis[i] - 2 * Math.PI);
  const mean = advances.reduce((s, x) => s + x, 0) / advances.length;
  return { mean, rMin, rMax };
}

describe('GR test particles', () => {
  it('advance the perihelion by ≈ 6πM/(a(1−e²)) per orbit', () => {
    const M = 1;
    const { mean, rMin, rMax } = measurePrecession(true, M, 70, 100, 4);
    const a = (rMin + rMax) / 2;
    const e = (rMax - rMin) / (rMax + rMin);
    const expected = perihelionAdvance(M, a, e);
    expect(expected).toBeGreaterThan(0.1); // moderately relativistic (~10° per orbit)
    expect(Math.abs(mean - expected) / expected).toBeLessThan(0.1);
  });

  it('Newtonian probes trace closed ellipses', () => {
    const { mean } = measurePrecession(false, 1, 70, 100, 3);
    expect(Math.abs(mean)).toBeLessThan(1e-3);
  });

  it('circular speed has no solution inside 3M (photon sphere) in the GR law', () => {
    expect(circularSpeed(1, 2.9, true)).toBeNaN();
    expect(circularSpeed(1, 6, true)).toBeCloseTo(Math.sqrt(1 / 3), 12);
    expect(circularSpeed(1, 25, false)).toBeCloseTo(0.2, 12);
  });
});

describe('Light rays', () => {
  it.each([200, 1000])('deflect by ≈ 4M/b for b = %d M', (b) => {
    const M = 1;
    const angle = deflectionAngle(M, b, 400 * b);
    expect(Math.abs(angle - (4 * M) / b) / ((4 * M) / b)).toBeLessThan(0.1);
  });
  it('are captured at small impact parameter', () => {
    expect(deflectionAngle(1, 1.5, 300)).toBeNaN();
  });
});

describe('endless plane', () => {
  it('axis is strictly increasing, symmetric, and reaches the far edge', () => {
    const a = planeAxis();
    for (let i = 1; i < a.length; i++) expect(a[i]).toBeGreaterThan(a[i - 1]);
    expect(a[0]).toBeCloseTo(-PLANE_HALF, 6);
    expect(a[a.length - 1]).toBeCloseTo(PLANE_HALF, 6);
    a.forEach((v, i) => expect(v).toBeCloseTo(-a[a.length - 1 - i], 6));
  });
  it('grid scale doubles with distance and never drops below 1', () => {
    expect(gridScale(100)).toBe(1);
    expect(gridScale(500)).toBe(1);
    expect(gridScale(501)).toBe(2);
    expect(gridScale(3000)).toBe(8);
    expect(snapTo(7.4, 3)).toBe(6);
  });
  it('frames the masses and ignores one escaped particle', () => {
    const bodies = [{ x: 500, y: 0, m: 1 }, { x: 600, y: 0, m: 1 }];
    const near = Array.from({ length: 40 }, (_, i) => ({ x: 550 + i, y: 10 }));
    const g = frameObjects(bodies, [...near, { x: 15000, y: 0 }]);
    expect(g.cx).toBeCloseTo(550, 6);
    expect(g.radius).toBeLessThan(200);
    expect(fitDistance(g.radius, 45, 1.6)).toBeGreaterThan(g.radius);
    expect(frameObjects([], []).radius).toBe(60);
  });
  it('keeps objects simulated far beyond the old domain limits', () => {
    const w = new World();
    w.addBody(5000, 0, 0.1, 0, 1);
    w.addProbe(4000, 0, 0, 0.05, 'newton');
    w.fireRay(1, 40, 1, 0);
    w.step(10, { gr: false, gw: false }, NB);
    expect(w.bodies).toHaveLength(1);
    expect(w.probes).toHaveLength(1);
    expect(w.rays[0].state).toBe('flying');
    expect(w.bodies[0].x).toBeGreaterThan(5000);
  });
  it('still forgets objects that have truly left', () => {
    const w = new World();
    w.addBody(ESCAPE_RADIUS + 10, 0, 0, 0, 1);
    w.step(1, { gr: false, gw: false }, NB);
    expect(w.bodies).toHaveLength(0);
  });
});
