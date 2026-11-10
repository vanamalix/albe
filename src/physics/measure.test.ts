/**
 * The measure tool and the closed forms it is compared with, checked against the simulation that
 * produces the pins, and against literature values.
 */
import { describe, expect, it } from 'vitest';
import { pnSample } from './fields';
import { ApsisTracker, apsidalAngle, geodesicConstants, properTimeBetween, protractorReading, radialFall, secondOrderAdvance, textbookAdvance } from './measure';
import { DEFAULT_NBODY } from './nbody';
import { presetById } from './presets';
import { rk4ProbeStep, rk4SheetStep, circularSpeed } from './probes';
import { World } from '../sim/world';
import type { Body } from './types';

const deg = (r: number) => (r * 180) / Math.PI;

/** Runs a preset's world in fixed steps until `done`, at most `limit` time. */
function run(world: World, done: (w: World) => boolean, limit: number, dt = 2, cfg = { gr: true, gw: false, pn: true }) {
  while (world.simTime < limit && !done(world)) world.step(dt, cfg, DEFAULT_NBODY);
}

describe('closest-approach pins', () => {
  it('Mercury: the tracker reads 35.4° per orbit, matching the elliptic integral', () => {
    const world = new World();
    world.loadPreset(presetById('mercury'));
    expect(world.pinTarget?.kind).toBe('probe');
    run(world, (w) => w.pins.pins.length >= 3, 8000);
    const pins = world.pins.pins;
    expect(pins[0].angle).toBe(0); // the start is a periapsis
    expect(pins[0].r).toBeCloseTo(32, 6);
    const q = presetById('mercury').probes[0];
    const { E2, L2 } = geodesicConstants(1, q.x, q.y, q.vx, q.vy);
    const exact = deg(apsidalAngle(1, E2, L2)) - 360;
    expect(exact).toBeCloseTo(35.36, 1);
    expect(deg(pins[1].angle - pins[0].angle) - 360).toBeCloseTo(exact, 1);
    expect(deg(world.pins.advance)).toBeCloseTo(exact, 1);
    // The textbook formula on the orbit flown, and the second-order series.
    expect(deg(textbookAdvance(1, world.pins.rmin, world.pins.rmax))).toBeCloseTo(30.76, 1);
    const second = deg(secondOrderAdvance(1, world.pins.rmin, world.pins.rmax));
    expect(Math.abs(second - exact)).toBeLessThan(Math.abs(30.76 - exact) / 4);
  });

  it('the single-hole rosette runs r = 31.2 to 90 and advances 161.6°', () => {
    const world = new World();
    world.loadPreset(presetById('single'));
    run(world, (w) => w.pins.pins.length >= 2, 30000);
    expect(world.pins.rmin).toBeCloseTo(31.2, 1);
    expect(world.pins.rmax).toBeCloseTo(90, 1);
    const p = presetById('single').probes[0];
    const { E2, L2 } = geodesicConstants(4, p.x, p.y, p.vx, p.vy);
    const exact = deg(apsidalAngle(4, E2, L2)) - 360;
    expect(exact).toBeCloseTo(161.6, 1);
    expect(deg(world.pins.advance)).toBeCloseTo(exact, 0);
  });

  it('the second-order series converges on the exact angle as M/p shrinks', () => {
    for (const rp of [60, 200, 1000]) {
      const ra = 1.5 * rp;
      // E² and L² from the turning-point conditions E² = f(r)(1 + L²/r²) at r = rp and r = ra.
      const f = (r: number) => 1 - 2 / r;
      const L2t = (f(ra) - f(rp)) / (f(rp) / (rp * rp) - f(ra) / (ra * ra));
      const E2 = f(rp) * (1 + L2t / (rp * rp));
      const exact = apsidalAngle(1, E2, L2t) - 2 * Math.PI;
      const first = textbookAdvance(1, rp, ra);
      const second = secondOrderAdvance(1, rp, ra);
      const x = 1 / ((2 * rp * ra) / (rp + ra));
      // (exact − first)/x² tends to (3π/2)(18 + e²), with a remainder of order x.
      const e = 0.5 / 2.5;
      expect(Math.abs((exact - first) / (x * x) - (3 * Math.PI / 2) * (18 + e * e))).toBeLessThan(600 * x);
      expect(Math.abs(first - exact)).toBeGreaterThan(Math.abs(second - exact));
    }
  });

  it('a circular orbit leaves no pins, however long it runs', () => {
    const t = new ApsisTracker();
    const st = { x: 40, y: 0, vx: 0, vy: circularSpeed(1, 40, true) };
    const src: Body[] = [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, m: 1, ax: 0, ay: 0 }];
    for (let i = 0; i < 20000; i++) {
      rk4ProbeStep(st, 1, src, true);
      t.observe(st.x, st.y, st.vx, st.vy, i);
    }
    expect(t.pins.length).toBe(0);
  });

  it('the protractor reads the angle swept in the sense of motion', () => {
    expect(protractorReading(0, Math.PI / 6)).toBeCloseTo(30, 10);
    expect(protractorReading(Math.PI / 6, 0)).toBeCloseTo(330, 10);
    expect(protractorReading(Math.PI / 6, 0, -1)).toBeCloseTo(30, 10);
    expect(protractorReading(3, 3 + 2 * Math.PI + 0.1)).toBeCloseTo(deg(0.1), 8);
  });
});

describe('the falling clock', () => {
  it('a fall from rest at 25M reaches 2.04M with the cycloid’s proper and coordinate times', () => {
    const world = new World();
    world.loadPreset(presetById('clocks'));
    run(world, (w) => w.lastCapture?.label === 'Falling from rest', 4000, 1);
    const c = world.lastCapture!;
    expect(c.label).toBe('Falling from rest');
    expect(c.r / c.m).toBeGreaterThan(2);
    expect(c.r / c.m).toBeLessThan(2.05);
    const closed = radialFall(4, 100, c.r);
    expect(c.tau).toBeCloseTo(closed.tau, -1);
    expect(Math.abs(c.tau - closed.tau) / closed.tau).toBeLessThan(0.005);
    expect(Math.abs(c.t - closed.t) / closed.t).toBeLessThan(0.02);
    expect(c.tau).toBeGreaterThan(540);
    expect(c.tau).toBeLessThan(560);
    expect(c.t).toBeGreaterThan(625);
    expect(c.t).toBeLessThan(655);
    // What is left to the horizon on its own clock, from the constants recorded at removal.
    const left = properTimeBetween(4, 8, c.r, c.E2, c.L2);
    expect(left).toBeCloseTo(radialFall(4, 100, 8).tau - radialFall(4, 100, c.r).tau, 2);
    // Removal comes on the first step inside 2.04M, so a few hundredths of M of its own time remain.
    expect(left / 4).toBeGreaterThan(0.005);
    expect(left / 4).toBeLessThan(0.06);
  });

  it('coordinate time diverges logarithmically at the horizon, proper time does not', () => {
    const near = radialFall(1, 20, 2 + 1e-6);
    const nearer = radialFall(1, 20, 2 + 1e-9);
    expect(nearer.t - near.t).toBeCloseTo(2 * Math.log(1000), 1);
    expect(nearer.tau - near.tau).toBeLessThan(1e-3);
  });
});

describe('the rubber-sheet marble', () => {
  const hole: Body[] = [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, m: 4, ax: 0, ay: 0 }];

  it('started tangent it only rolls outward (Clairaut), and at rest it stays put', () => {
    const v = circularSpeed(4, 34, true);
    const m = { x: 34, y: 0, vx: 0, vy: v };
    let rmin = Infinity;
    for (let i = 0; i < 4000; i++) {
      rk4SheetStep(m, 0.2, hole);
      rmin = Math.min(rmin, Math.hypot(m.x, m.y));
    }
    expect(rmin).toBeGreaterThan(34 - 1e-6);
    expect(Math.hypot(m.x, m.y)).toBeGreaterThan(60);
    // Clairaut: r sin ψ = r0 for a tangent start. In the curved metric the conserved speed is √(ṙ²/f + r²φ̇²).
    const r = Math.hypot(m.x, m.y);
    const rdot = (m.x * m.vx + m.y * m.vy) / r;
    const phidot = (m.x * m.vy - m.y * m.vx) / (r * r);
    const speed = Math.sqrt((rdot * rdot) / (1 - 8 / r) + r * r * phidot * phidot);
    expect(speed).toBeCloseTo(v, 6);
    expect((r * r * phidot) / speed).toBeCloseTo(34, 5);
    const rest = { x: 50, y: 0, vx: 0, vy: 0 };
    for (let i = 0; i < 1000; i++) rk4SheetStep(rest, 0.5, hole);
    expect(rest.x).toBe(50);
    expect(rest.y).toBe(0);
  });

  it('space curvature’s share of a slow particle’s bending is v²/(1 + v²): 3% at v = 0.18', () => {
    const share = (v: number) => (v * v) / (1 + v * v);
    expect(share(0.18)).toBeCloseTo(0.0314, 4);
    expect(share(1)).toBe(0.5);
    // The particle law the app runs bends by 2M(1 + v²)/(b v²) in the weak field.
    const v = 0.18;
    const gamma = 1 / Math.sqrt(1 - v * v);
    const b = 4000;
    const src: Body[] = [{ id: 1, x: 0, y: 0, vx: 0, vy: 0, m: 1, ax: 0, ay: 0 }];
    const st = { x: -400000, y: b, vx: gamma * v, vy: 0 };
    while (st.x < 400000) rk4ProbeStep(st, Math.max(20, 0.02 * Math.hypot(st.x, st.y)) / (gamma * v), src, true);
    const angle = -Math.atan2(st.vy, st.vx);
    const expected = (2 * (1 + v * v)) / (b * v * v);
    expect(Math.abs(angle - expected) / expected).toBeLessThan(0.02);
  });
});

describe('the readout’s expansion parameters', () => {
  it('M/r is the largest single ratio, and the cross term is 4 M_a M_b / (r_a r_b)', () => {
    const pair = [{ x: -20, y: 0, m: 2 }, { x: 20, y: 0, m: 2 }];
    const at = pnSample(0, 0, pair);
    expect(at.mOverR).toBeCloseTo(0.1, 12);
    expect(at.cross).toBeCloseTo((4 * 2 * 2) / (20 * 20), 12);
    const three = [...pair, { x: 0, y: 30, m: 3 }];
    const s = pnSample(0, 0, three);
    expect(s.cross).toBeCloseTo(4 * (0.1 * 0.1 + 0.1 * 0.1 + 0.1 * 0.1), 12);
    expect(pnSample(0, 0, [{ x: 10, y: 0, m: 1 }]).cross).toBe(0);
    expect(pnSample(0, 0, [{ x: 10, y: 0, m: 1, kind: 'galaxy' as const, soft: 5 }]).mOverR).toBe(0);
  });
});

describe('the clocks scene', () => {
  it('at t = 1000 the 8M clock reads 791 and the 30M clock 949, √(1 − 3M/r) of distant time', async () => {
    const { clockReading } = await import('./probes');
    const world = new World();
    world.loadPreset(presetById('clocks'));
    while (world.simTime < 1000) world.step(Math.min(1, 1000 - world.simTime), { gr: true, gw: false }, DEFAULT_NBODY);
    const close = world.probes.find((p) => p.label === 'Close orbit, 8M')!;
    const wide = world.probes.find((p) => p.label === 'Wide orbit, 30M')!;
    expect(clockReading(close)).toBeCloseTo(1000 * Math.sqrt(1 - 3 / 8), 0);
    expect(clockReading(wide)).toBeCloseTo(1000 * Math.sqrt(1 - 3 / 30), 0);
    expect(Math.round(clockReading(close))).toBe(791);
    expect(Math.round(clockReading(wide))).toBe(949);
  });
});
