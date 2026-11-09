import { describe, expect, it } from 'vitest';
import { FLAMM_REF, flammWell, flammZ, heightAt, lapse, potential, kretschmann } from './fields';
import { CAPTURE_RATIO, deflectionAngle, makeRay } from './light';
import { addFirstPostNewtonian, addRadiationReaction, advanceBodies, computeAccelerations, DEFAULT_NBODY, mergeBodies, pairOrbit, petersMergerTime, remnantOf, totalEnergy, totalMass, totalMomentum } from './nbody';
import { circularClockRate, circularSpeed, perihelionAdvance, probeDt, properTimeRatio, rk4ProbeStep } from './probes';
import type { Body } from './types';
import { circularBinarySpeed, figureEight, PRESETS, presetById } from './presets';
import { fitDistance, frameObjects, gridScale, planeAxis, PLANE_HALF, snapTo } from '../scene/plane';
import { ESCAPE_RADIUS, World } from '../sim/world';
import { DEFAULT_NBODY as NB } from './nbody';
import { quadrupoleDD, ringdownMode, WaveBuffer, WAVE_SPACING } from '../sim/waves';

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

  it('keep a circular clock at √(1 − 3M/r) of the distant rate', () => {
    const src = [body(0, 0, 0, 0, 0, 1)];
    for (const r of [8, 30]) {
      const p = { x: r, y: 0, vx: 0, vy: circularSpeed(1, r, true) };
      expect(1 / properTimeRatio(p, src)).toBeCloseTo(circularClockRate(1, r), 9);
    }
    expect(1 / properTimeRatio({ x: 1000, y: 0, vx: 0, vy: 0 }, src)).toBeCloseTo(Math.sqrt(1 - 2 / 1000), 9);
  });

  it('in the World, the close orbit ticks slower than the distant clock by the exact factor', () => {
    const w = new World();
    w.addBody(0, 0, 0, 0, 1);
    const p = w.addProbe(10, 0, 0, circularSpeed(1, 10, true))!;
    for (let i = 0; i < 400; i++) w.step(5, { gr: true, gw: false }, NB);
    expect(p.tau / (w.simTime - p.lag)).toBeCloseTo(circularClockRate(1, 10), 3);
    expect(Math.hypot(p.x, p.y)).toBeCloseTo(10, 1);
  });

  it('a particle dropped from rest reaches the horizon', () => {
    const w = new World();
    w.addBody(0, 0, 0, 0, 1);
    const p = w.addProbe(40, 0, 0, 0)!;
    for (let i = 0; i < 4000 && w.probes.length; i++) w.step(1, { gr: true, gw: false }, NB);
    expect(w.probes).toHaveLength(0);
    // Exact cycloid: r = (R/2)(1 + cos η), τ = (R/2)√(R/2M)(η + sin η), up to the capture radius.
    const R = 40;
    const eta = Math.acos((2 * 2 * CAPTURE_RATIO) / R - 1);
    expect(Math.abs(p.tau - (R / 2) * Math.sqrt(R / 2) * (eta + Math.sin(eta)))).toBeLessThan(1);
  });

  it('circular speed has no solution inside 3M (photon sphere) in the GR law', () => {
    expect(circularSpeed(1, 2.9, true)).toBeNaN();
    expect(circularSpeed(1, 6, true)).toBeCloseTo(Math.sqrt(1 / 3), 12);
    expect(circularSpeed(1, 25, false)).toBeCloseTo(0.2, 12);
  });
});

describe('Light rays', () => {
  const exactDeflection = (M: number, b: number): number => {
    const g = (u: number) => 1 / (b * b) - u * u + 2 * M * u * u * u;
    let lo = 0;
    let hi = 1 / (3 * M);
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (g(mid) > 0) lo = mid;
      else hi = mid;
    }
    const u0 = (lo + hi) / 2;
    // u = u0(1 − s²) removes the square-root singularity at the turning point.
    const f = (s: number) => {
      const v = g(u0 * (1 - s * s));
      return s === 0 ? 0 : (2 * u0 * s) / Math.sqrt(Math.max(v, 1e-30));
    };
    const n = 20000;
    let sum = 0;
    for (let i = 1; i < n; i++) sum += f(i / n) * (i % 2 ? 4 : 2);
    // The integrand's limit at s = 0 is finite: take it from the neighbouring point.
    sum += f(1e-7) + f(1);
    return (2 * sum) / (3 * n) - Math.PI;
  };
  it.each([7, 10, 30])('match the exact Schwarzschild deflection at b = %d M', (b) => {
    const expected = exactDeflection(1, b);
    expect(expected).toBeGreaterThan((4 / b) * 1.05);
    expect(Math.abs(deflectionAngle(1, b, 40000) - expected) / expected).toBeLessThan(0.02);
  });
  it('are captured just inside b = 3√3 M and escape just outside', () => {
    const critical = 3 * Math.sqrt(3);
    expect(deflectionAngle(1, critical - 0.02, 3000)).toBeNaN();
    expect(deflectionAngle(1, critical + 0.02, 3000)).not.toBeNaN();
  });
  it('travel at the exact coordinate speed: radially f, tangentially √f', () => {
    const src = [{ x: 0, y: 0, m: 1 }];
    const f = 1 - 2 / 10;
    const radial = makeRay(1, 10, 0, 1, 0, src);
    expect(Math.hypot(radial.vx, radial.vy) * f).toBeCloseTo(f, 9);
    const tangent = makeRay(2, 10, 0, 0, 1, src);
    expect(Math.hypot(tangent.vx, tangent.vy) * f).toBeCloseTo(Math.sqrt(f), 9);
  });
  it.each([200, 1000])('deflect by ≈ 4M/b for b = %d M', (b) => {
    const M = 1;
    const angle = deflectionAngle(M, b, 400 * b);
    expect(Math.abs(angle - (4 * M) / b) / ((4 * M) / b)).toBeLessThan(0.1);
  });
  it('are captured at small impact parameter', () => {
    expect(deflectionAngle(1, 1.5, 300)).toBeNaN();
  });
});

describe('relativistic masses', () => {
  it('EIH matches the published two-body 1PN acceleration', () => {
    const m1 = 2;
    const m2 = 0.7;
    const M = m1 + m2;
    const nu = (m1 * m2) / (M * M);
    const rx = 60;
    const ry = 25;
    const vx = 0.06;
    const vy = 0.13;
    const bs = [body(1, (m2 / M) * rx, (m2 / M) * ry, (m2 / M) * vx, (m2 / M) * vy, m1), body(2, (-m1 / M) * rx, (-m1 / M) * ry, (-m1 / M) * vx, (-m1 / M) * vy, m2)];
    computeAccelerations(bs, 0);
    const nX = bs[0].ax - bs[1].ax;
    const nY = bs[0].ay - bs[1].ay;
    addFirstPostNewtonian(bs);
    const gotX = bs[0].ax - bs[1].ax - nX;
    const gotY = bs[0].ay - bs[1].ay - nY;
    const r = Math.hypot(rx, ry);
    const n = [rx / r, ry / r];
    const v2 = vx * vx + vy * vy;
    const rdot = n[0] * vx + n[1] * vy;
    const A = -1.5 * rdot * rdot * nu + v2 + 3 * nu * v2 - (M / r) * (4 + 2 * nu);
    const B = rdot * (-4 + 2 * nu);
    const k = -M / (r * r);
    expect(gotX).toBeCloseTo(k * (A * n[0] + B * vx), 10);
    expect(gotY).toBeCloseTo(k * (A * n[1] + B * vy), 10);
  });

  it('radiation reaction matches the published 2.5PN relative acceleration and keeps momentum', () => {
    const bs = [body(1, 30, 10, 0.05, 0.1, 2), body(2, -30, -10, -0.05, -0.1, 2)];
    computeAccelerations(bs, 0);
    const nX = bs[0].ax - bs[1].ax;
    addRadiationReaction(bs, 1);
    const r = Math.hypot(60, 20);
    const n = [60 / r, 20 / r];
    const v = [0.1, 0.2];
    const v2 = v[0] * v[0] + v[1] * v[1];
    const rdot = n[0] * v[0] + n[1] * v[1];
    const nu = 0.25;
    const M = 4;
    const A = ((8 * M * nu) / (5 * r)) * rdot * ((-17 / 3) * (M / r) - 3 * v2);
    const B = ((8 * M * nu) / (5 * r)) * ((3 * M) / r + v2);
    expect(bs[0].ax - bs[1].ax - nX).toBeCloseTo((-M / (r * r)) * (A * n[0] + B * v[0]), 12);
    expect(bs[0].m * bs[0].ax + bs[1].m * bs[1].ax).toBeCloseTo(0, 12);
  });

  const makeBinary = (m1: number, m2: number, ra: number, speed: number) => {
    const M = m1 + m2;
    return [body(1, (m2 / M) * ra, 0, 0, (m2 / M) * speed, m1), body(2, (-m1 / M) * ra, 0, 0, (-m1 / M) * speed, m2)];
  };

  it('a bound pair precesses by 6πM/(a(1−e²)) per orbit, at any mass ratio', () => {
    const m1 = 1;
    const m2 = 0.5;
    const M = m1 + m2;
    const a = 300;
    const e = 0.3;
    const rp = a * (1 - e);
    const bs = makeBinary(m1, m2, rp, Math.sqrt(M * (2 / rp - 1 / a)));
    const opts = { ...DEFAULT_NBODY, softening: 0, pn: true };
    const peri: number[] = [];
    let last = Infinity;
    let prev = Infinity;
    let phi = 0;
    let lastAng = 0;
    const period = 2 * Math.PI * Math.sqrt((a * a * a) / M);
    for (let i = 0; i < 60000 && peri.length < 5; i++) {
      advanceBodies(bs, period / 3000, opts, 0.005, 100000);
      const dx = bs[0].x - bs[1].x;
      const dy = bs[0].y - bs[1].y;
      const r = Math.hypot(dx, dy);
      const ang = Math.atan2(dy, dx);
      let d = ang - lastAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      phi += d;
      lastAng = ang;
      if (last < prev && last < r) peri.push(phi);
      prev = last;
      last = r;
    }
    const mean = (peri[peri.length - 1] - peri[0]) / (peri.length - 1) - 2 * Math.PI;
    const expected = (6 * Math.PI * M) / (a * (1 - e * e));
    expect(Math.abs(mean - expected) / expected).toBeLessThan(0.06);
  });

  it('a circular binary decays at the Peters rate', () => {
    const m = 1;
    const a = 70;
    const bs = makeBinary(m, m, a, Math.sqrt((2 * m) / a));
    const opts = { ...DEFAULT_NBODY, softening: 0, gw: true };
    const T = 2 * Math.PI * Math.sqrt((a * a * a) / (2 * m));
    const before = pairOrbit(bs[0], bs[1]).a;
    advanceBodies(bs, 30 * T, opts, 0.004, 1e7);
    const after = pairOrbit(bs[0], bs[1]).a;
    const predicted = Math.pow(Math.pow(before, 4) - 4 * (64 / 5) * m * m * 2 * m * (30 * T), 0.25);
    expect(Math.abs(before - after - (before - predicted)) / (before - predicted)).toBeLessThan(0.05);
  });

  it('an eccentric binary decays faster, as Peters predicts', () => {
    const m = 1;
    const a = 80;
    const e = 0.6;
    const ra = a * (1 + e);
    const bs = makeBinary(m, m, ra, Math.sqrt(2 * m * (2 / ra - 1 / a)));
    const opts = { ...DEFAULT_NBODY, softening: 0, gw: true };
    const T = 2 * Math.PI * Math.sqrt((a * a * a) / (2 * m));
    advanceBodies(bs, 10 * T, opts, 0.003, 1e7);
    const after = pairOrbit(bs[0], bs[1]);
    const enhancement = (1 + (73 / 24) * e * e + (37 / 96) * e ** 4) / Math.pow(1 - e * e, 3.5);
    const expected = ((64 / 5) * m * m * 2 * m * enhancement * (10 * T)) / (a * a * a);
    expect(Math.abs(a - after.a - expected) / expected).toBeLessThan(0.15);
    expect(after.e).toBeLessThan(e);
  });

  it('the Peters merger time reduces to a⁴/(4β) and shrinks with eccentricity', () => {
    const circular = (40 ** 4 * 5) / (256 * 2 * 2 * 4);
    expect(petersMergerTime(2, 2, 40, 0)).toBeCloseTo(circular, 6);
    expect(petersMergerTime(2, 2, 40, 0.01)).toBeCloseTo(circular, -1);
    expect(petersMergerTime(2, 2, 40, 0.8)).toBeLessThan(circular * 0.2);
  });

  it('the 1PN circular speed keeps a binary close to round', () => {
    const m = 2;
    const sep = 60;
    const bs = makeBinary(m, m, sep, circularBinarySpeed(m, m, sep));
    const opts = { ...DEFAULT_NBODY, softening: 0, pn: true };
    let lo = Infinity;
    let hi = 0;
    for (let i = 0; i < 2000; i++) {
      advanceBodies(bs, 3, opts, 0.005, 100000);
      const r = Math.hypot(bs[0].x - bs[1].x, bs[0].y - bs[1].y);
      lo = Math.min(lo, r);
      hi = Math.max(hi, r);
    }
    expect((hi - lo) / sep).toBeLessThan(0.05);
  });

  it('remnants match the published numerical-relativity values', () => {
    const equal = remnantOf(5, 5);
    expect(equal.radiated).toBeCloseTo(0.04827, 5);
    expect(equal.spin).toBeCloseTo(0.6869, 3);
    expect(equal.kick).toBe(0);
    const nu = 0.195; // González et al.: the largest kick, 175 km/s
    const q = (1 - 2 * nu - Math.sqrt(1 - 4 * nu)) / (2 * nu);
    const peak = remnantOf(1, q);
    expect(peak.kick * 299792.458).toBeGreaterThan(172);
    expect(peak.kick * 299792.458).toBeLessThan(178);
    expect(remnantOf(1, 1e-6).radiated).toBeLessThan(1e-6);
  });

  it('a relativistic merger radiates mass and recoils; a Newtonian one does not', () => {
    const a = [body(1, -2, 0, 0, 0.3, 2), body(2, 2, 0, 0, -0.1, 1)];
    const events = mergeBodies(a, true);
    expect(a[0].m).toBeCloseTo(3 * (1 - remnantOf(2, 1).radiated), 12);
    expect(events[0].remnant?.spin).toBeGreaterThan(0.5);
    expect(a[0].spin).toBe(events[0].remnant?.spin);
    const before = (2 * 0.3 + 1 * -0.1) / 3;
    expect(a[0].vy).not.toBeCloseTo(before, 6);
    const b = [body(1, -2, 0, 0, 0.3, 2), body(2, 2, 0, 0, -0.1, 1)];
    mergeBodies(b);
    expect(b[0].m).toBe(3);
  });

  it('the binary preset really merges, with the right remnant', () => {
    const w = new World();
    w.loadPreset(presetById('binary'));
    const start = pairOrbit(w.bodies[0], w.bodies[1], true);
    expect(start.e).toBeLessThan(0.1); // it is a round orbit, whatever Kepler elements would say
    expect(Math.abs(start.mergerTime - 3125) / 3125).toBeLessThan(0.25);
    for (let i = 0; i < 9000 && w.bodies.length > 1; i++) w.step(1, { gr: true, gw: true, pn: true }, NB);
    // Peters gives 3125 for this pair; 1PN motion and the finite merger radius shift it a little.
    expect(Math.abs(w.simTime - 3125)).toBeLessThan(400);
    expect(w.bodies).toHaveLength(1);
    expect(w.lastMerger?.radiated).toBeCloseTo(0.04827, 4);
  });

  it('every preset loads and runs without a non-finite position', () => {
    for (const p of PRESETS) {
      const w = new World();
      w.loadPreset(p);
      for (let i = 0; i < 150; i++) w.step(p.settings.timeScale / 60, { gr: true, gw: !!p.settings.gw, pn: p.settings.pn ?? true }, NB);
      for (const b of w.bodies) expect(Number.isFinite(b.x + b.y + b.vx + b.vy)).toBe(true);
      for (const q of w.probes) expect(Number.isFinite(q.x + q.y)).toBe(true);
    }
  }, 60000);
});

describe('gravitational waves', () => {
  const circular = (m: number, a: number, phase: number) => {
    const v = Math.sqrt((2 * m) / a) / 2;
    const c = Math.cos(phase);
    const s = Math.sin(phase);
    const bs = [body(1, (a / 2) * c, (a / 2) * s, -v * s, v * c, m), body(2, (-a / 2) * c, (-a / 2) * s, v * s, -v * c, m)];
    computeAccelerations(bs, 0);
    return bs;
  };
  it('the quadrupole of a circular binary gives the textbook strain 4μa²ω²', () => {
    const m = 1;
    const a = 40;
    const q = quadrupoleDD(circular(m, a, 0));
    const omega2 = (2 * m) / (a * a * a);
    expect(q.xx - q.yy).toBeCloseTo(-4 * (m / 2) * a * a * omega2, 9);
    expect(q.xy).toBeCloseTo(0, 9);
  });
  it('waves travel outward at the speed of light', () => {
    const w = new WaveBuffer();
    const bs = [body(1, 10, 0, 0, 0.1, 1), body(2, -10, 0, 0, -0.1, 1)];
    computeAccelerations(bs, 0);
    w.advance(0, bs);
    const r = 40 * WAVE_SPACING;
    expect(w.ripple(r, 0)).toBeCloseTo(0, 12); // the signal has not arrived
    for (let t = WAVE_SPACING; t <= r + WAVE_SPACING; t += WAVE_SPACING) w.advance(t, bs);
    expect(w.ripple(r, 0)).not.toBe(0);
  });
  it('the ringdown mode of the equal-mass remnant is the known one', () => {
    const { omega, tau } = ringdownMode(1, 0.687);
    expect(omega).toBeCloseTo(0.53, 1);
    expect((omega * tau) / 2).toBeGreaterThan(3);
    expect((omega * tau) / 2).toBeLessThan(3.4);
  });
  it('clears with the scene', () => {
    const w = new World();
    w.loadPreset(presetById('binary'));
    w.step(50, { gr: true, gw: true, pn: true }, NB);
    expect(w.waves.peak).toBeGreaterThan(0);
    w.clear();
    expect(w.waves.peak).toBe(0);
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
