/**
 * Reading the chirp: the cursor maths against an exact quadrupole chirp, then against the waves the
 * simulation actually emits.
 */
import { describe, expect, it } from 'vitest';
import { chirpMassBetween, chirpMassFrom, chirpMassOf, quadrupoleFrequency, readChirp, strainExtrema } from './chirp';
import { DEFAULT_NBODY, pairOrbit, petersMergerTime, pnCapFired } from './nbody';
import { presetById } from './presets';
import { World } from '../sim/world';
import { WAVE_SPACING } from '../sim/waves';

describe('chirp-mass reading', () => {
  it('recovers ℳ from an exact leading-order chirp', () => {
    const M = 1.62;
    const f = (tau: number) => quadrupoleFrequency(M, tau);
    // ḟ = (96/5) π^(8/3) ℳ^(5/3) f^(11/3) at leading order.
    const tau = 3000;
    const fdot = (96 / 5) * Math.pow(Math.PI, 8 / 3) * Math.pow(M, 5 / 3) * Math.pow(f(tau), 11 / 3);
    expect(chirpMassFrom(f(tau), fdot)).toBeCloseTo(M, 10);
    expect(chirpMassBetween(f(3000), 0, f(1000), 2000)).toBeCloseTo(M, 10);
    expect(chirpMassOf(3, 1.2)).toBeCloseTo(1.6186, 3);
    expect(chirpMassBetween(0.01, 0, 0.009, 10)).toBeNaN();
  });

  it('finds the extrema of a sampled sinusoid to a small fraction of a sample', () => {
    const h = Array.from({ length: 400 }, (_, i) => Math.cos((2 * Math.PI * i) / 37.3 + 0.4));
    const ext = strainExtrema(h);
    const spacing = ext.slice(1).map((e, i) => e.index - ext[i].index);
    for (const s of spacing) expect(s).toBeCloseTo(37.3 / 2, 1);
    const r = readChirp([ext[0].index, ext[1].index], [1]);
    expect(r.f1).toBeCloseTo(1 / 37.3, 3);
  });

  it('the simulated chirp: extrema about 200 apart early, and a reading that overshoots ℳ by an O(v²) amount', () => {
    const preset = presetById('chirp');
    const world = new World();
    world.loadPreset(preset);
    const [m1, m2] = [preset.bodies[0].m, preset.bodies[1].m];
    const T0 = pairOrbit(world.bodies[0], world.bodies[1], true).mergerTime;
    const sep = Math.hypot(world.bodies[0].x - world.bodies[1].x, world.bodies[0].y - world.bodies[1].y);
    // Peters, circular: T ∝ a⁴, so halving the gap gives 1/16.
    expect(petersMergerTime(m1, m2, sep / 2, 0) / petersMergerTime(m1, m2, sep, 0)).toBeCloseTo(1 / 16, 10);
    const cfg = { gr: true, gw: true, pn: true };
    let firstCap = 0;
    const reading = (t: number) => {
      while (world.simTime < t) {
        const before = pnCapFired.count;
        world.step(2, cfg, DEFAULT_NBODY);
        if (!firstCap && pnCapFired.count > before) firstCap = world.simTime;
      }
      const h = world.waves.recentStrain(400);
      const ext = strainExtrema(h);
      const n = ext.length;
      const newest = world.waves.newestTime;
      const time = (e: { index: number }) => newest - (399 - e.index) * WAVE_SPACING;
      return [time(ext[n - 2]), time(ext[n - 1])];
    };
    // The guided lesson stops at these times; the newest extrema then are both before the 1PN cap
    // first acts (near t = 1200).
    const early = reading(500);
    const late = reading(1250);
    expect(late[1]).toBeLessThan(1200);
    const r = readChirp([...early, ...late], [1, 1]);
    // The explainer says "about 14% high".
    expect(r.chirpMass! / chirpMassOf(m1, m2) - 1).toBeGreaterThan(0.1);
    expect(r.chirpMass! / chirpMassOf(m1, m2) - 1).toBeLessThan(0.18);
    expect(T0).toBeGreaterThan(1700);
    expect(T0).toBeLessThan(1900);
    expect(early[1] - early[0]).toBeGreaterThan(190);
    expect(early[1] - early[0]).toBeLessThan(215);
    expect(late[1] - late[0]).toBeLessThan(early[1] - early[0]);
    // The orbit has 1PN terms the leading-order formula ignores: the gap is of order v² = (πMf)^(2/3).
    const v2 = Math.pow(Math.PI * (m1 + m2) * r.f1!, 2 / 3);
    const gap = r.chirpMass! / chirpMassOf(m1, m2) - 1;
    expect(v2).toBeGreaterThan(0.08);
    expect(v2).toBeLessThan(0.12);
    expect(gap).toBeGreaterThan(0.5 * v2);
    expect(gap).toBeLessThan(2 * v2);
    // Readings taken after the cap starts climb higher: the cap, not GR, then sets the chirp.
    const capped = readChirp([...early, ...reading(1650)], [1, 1]);
    expect(firstCap).toBeGreaterThan(1150);
    expect(firstCap).toBeLessThan(1250);
    expect(capped.chirpMass! / chirpMassOf(m1, m2)).toBeGreaterThan(gap + 1.1);
  });
});
