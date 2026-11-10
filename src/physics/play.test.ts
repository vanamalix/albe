/**
 * The challenges and the "not our universe" laws, each against a closed form or an independent
 * calculation: winding light, the tightest nudged orbit, the merger-time run, the chirp as sound,
 * the force-law apsis angle (Bertrand) and the scaled relativistic term.
 */
import { describe, expect, it } from 'vitest';
import { schwarzschildDeflection, B_CRIT, STRONG_LIMIT_BBAR } from './lens';
import { ApsisTracker, apsidalAngle } from './measure';
import { DEFAULT_NBODY } from './nbody';
import { circularV, effectivePotential, effectiveVerdict, NUDGE, nudgedEdge, nudgedRun } from './orbitEdge';
import { presetById } from './presets';
import { circularSpeed, OUR_LAW, probeDt, rk4ProbeStep } from './probes';
import { captureSweep, exactSweep, strongLimitSweep, TURN_FACTOR, windReading, windRay, WIND_TOLERANCE } from './winding';
import { apsisAngle, nearCircularApsis, scaledApsidalAngle } from './whatif';
import { chirpSound, PEAK_LEVEL, SUN_TIME_S } from '../sim/chirpSound';
import { MergerRun, petersCircular, petersSeparation } from '../sim/mergerRun';
import { ringdownMode, WAVE_SAMPLES, WAVE_SPACING } from '../sim/waves';
import { World } from '../sim/world';
import type { Body } from './types';

const deg = (r: number) => (r * 180) / Math.PI;
const hole = (m: number): Body[] => [{ id: 0, x: 0, y: 0, vx: 0, vy: 0, m, ax: 0, ay: 0 }];

describe('wind the light', () => {
  const m = 4;
  it('the integrator agrees with the exact sweep wherever it counts, on both sides', () => {
    for (const delta of [1e-1, 1e-3, 1e-5, 1e-7, 1e-8, -1e-1, -1e-3, -1e-5, -1e-7, -1e-8]) {
      const r = windReading(m, delta);
      expect(r.turns).not.toBeNull();
      expect(r.fate).toBe(delta > 0 ? 'escapes' : 'falls in');
      // The cautious estimate covers the true error.
      expect(Math.abs(r.turns! - r.exact)).toBeLessThanOrEqual(Math.max(r.error, 1e-6));
    }
    // An escaping ray sweeps π + α̂: at 10⁻⁸ about 3.37 turns.
    expect(windReading(m, 1e-8).exact).toBeCloseTo((Math.PI + schwarzschildDeflection(B_CRIT * m * (1 + 1e-8), m)) / (2 * Math.PI), 10);
    expect(windReading(m, 1e-8).turns).toBeCloseTo(3.368, 3);
  });

  it('withholds the count once the error estimate passes the tolerance, and it grows tenfold per decade', () => {
    const e7 = windReading(m, 1e-7).error;
    const e8 = windReading(m, 1e-8).error;
    expect(e8 / e7).toBeGreaterThan(7);
    expect(e8 / e7).toBeLessThan(14);
    for (const delta of [1e-10, -1e-10, 1e-12]) {
      const r = windReading(m, delta);
      expect(r.turns).toBeNull();
      expect(r.error).toBeGreaterThan(WIND_TOLERANCE);
    }
  });

  it('obeys the e^{2π} law: one more turn per factor e^{2π} closer, on either side', () => {
    expect(TURN_FACTOR).toBeCloseTo(535.49, 1);
    expect(STRONG_LIMIT_BBAR).toBeCloseTo(-0.4002, 4);
    // An aim 535× wider would be past b = 0: no comparison is offered.
    expect(windReading(m, -1.5 / TURN_FACTOR).gainedPerFactor).toBeNaN();
    for (const delta of [1e-6, 1e-9, 1e-12, -1e-6, -1e-9, -1e-12]) expect(windReading(m, delta).gainedPerFactor).toBeCloseTo(1, 3);
    // Bozza's strong-deflection limit converges on the exact escape sweep.
    for (const d of [1e-4, 1e-8]) expect(strongLimitSweep(d) / (2 * Math.PI)).toBeCloseTo(exactSweep(m, B_CRIT * m * (1 + d)).sweep / (2 * Math.PI), d < 1e-6 ? 6 : 3);
  });

  it('the capture quadrature matches a direct ray, and tends to zero for a head-on ray', () => {
    const b = B_CRIT * m * (1 - 1e-2);
    const direct = windRay(m, b, 0.001);
    expect(direct.fate).toBe('falls in');
    expect(direct.sweep).toBeCloseTo(captureSweep(m, b, 2 * m * 1.02), 4);
    expect(captureSweep(m, 1e-3 * m, 2 * m)).toBeLessThan(1e-3);
    // Continuing from 2.04M to the horizon adds a little.
    expect(captureSweep(m, b, 2 * m)).toBeGreaterThan(captureSweep(m, b, 2.04 * m));
  });
});

describe('tightest stable orbit', () => {
  it('the effective potential has its extrema at the circular orbits, merging at 6M', () => {
    const m = 1;
    for (const r of [5, 8, 20]) {
      const L2 = (m * r * r) / (r - 3 * m); // exact circular L² for this law
      const h = 1e-5 * r;
      const slope = (effectivePotential(m, L2, r + h) - effectivePotential(m, L2, r - h)) / (2 * h);
      expect(Math.abs(slope)).toBeLessThan(1e-9);
      expect(L2).toBeCloseTo(r * r * circularV(r) ** 2, 10);
    }
  });

  it('the nudge needs a margin beyond the ISCO that shrinks with the nudge, and scales with s', () => {
    const edge = nudgedEdge(1, NUDGE);
    expect(edge).toBeGreaterThan(6);
    expect(edge).toBeCloseTo(6.388, 2);
    // Near the ISCO the barrier above a circular orbit grows as (r − 6M)³, so the margin goes as δ^(2/3).
    const ratio = (nudgedEdge(1, 1e-2) - 6) / (nudgedEdge(1, 1e-4) - 6);
    expect(Math.log(ratio) / Math.log(100)).toBeCloseTo(2 / 3, 1);
    expect(nudgedEdge(2, 1e-4) / 12).toBeCloseTo(1, 2);
  });

  it('runs with the app’s step agree with the exact verdict on either side of the edge', () => {
    const m = 4;
    for (const r of [5.9, 6.2, 6.3, 6.5, 7, 9]) {
      const v = circularV(r);
      const run = nudgedRun(m, r, v);
      expect(run.fate).toBe(effectiveVerdict(m, r, v));
    }
    // With GR off and another force law, the verdict uses that law's potential: under F ∝ 1/r (a
    // logarithmic potential) nothing escapes, though Newton's energy would say it does.
    const fast = 0.55; // above Newton's escape speed √(2M/r) = 0.5 at r = 8M
    expect(nudgedRun(1, 8, fast, { n: 1, s: 0 }).fate).toBe('survives');
    expect(effectiveVerdict(1, 8, fast, -NUDGE, 0, 1)).toBe('survives');
    expect(effectiveVerdict(1, 8, fast, -NUDGE, 0)).toBe('flies off');
    // Without the nudge a circular start just inside 6M still coasts round.
    expect(nudgedRun(m, 5.9, circularV(5.9), OUR_LAW, 0).fate).toBe('survives');
  });
});

describe('not our universe', () => {
  it('apsis angle: 180°/√(3 − n) near circular, and Bertrand’s closed orbits for n = 2 and −1', () => {
    expect(deg(nearCircularApsis(2))).toBeCloseTo(180, 10);
    expect(deg(nearCircularApsis(2.1))).toBeCloseTo(189.737, 3);
    expect(deg(nearCircularApsis(1))).toBeCloseTo(127.279, 3);
    expect(deg(nearCircularApsis(-1))).toBeCloseTo(90, 10);
    for (const [rp, ra] of [[30, 31], [20, 60], [10, 90]]) {
      expect(deg(apsisAngle(1, 2, rp, ra))).toBeCloseTo(180, 3);
      expect(deg(apsisAngle(1, -1, rp, ra))).toBeCloseTo(90, 3);
    }
    expect(deg(apsisAngle(1, 2.5, 39.99, 40.01))).toBeCloseTo(deg(nearCircularApsis(2.5)), 2);
    // Away from the two, a finite orbit's angle differs from the near-circular value.
    expect(Math.abs(deg(apsisAngle(1, 2.5, 20, 60)) - deg(nearCircularApsis(2.5)))).toBeGreaterThan(1);
  });

  it('a particle under F ∝ 1/r^2.5 turns by the exact apsis angle, measured by the pins', () => {
    const m = 1;
    const law = { n: 2.5, s: 1 };
    const src = hole(m);
    const p = { x: 30, y: 0, vx: 0, vy: 1.15 * circularSpeed(m, 30, false, law) };
    const pins = new ApsisTracker();
    let rmin = Infinity;
    let rmax = 0;
    for (let i = 0; i < 400_000 && pins.pins.length < 3; i++) {
      rk4ProbeStep(p, probeDt(p, src, 0.002), src, false, law);
      pins.observe(p.x, p.y, p.vx, p.vy, i);
      const r = Math.hypot(p.x, p.y);
      rmin = Math.min(rmin, r);
      rmax = Math.max(rmax, r);
    }
    expect(pins.pins.length).toBe(3);
    expect(deg(Math.PI + pins.advance / 2)).toBeCloseTo(deg(apsisAngle(m, 2.5, rmin, rmax)), 1);
  });

  it('circular speeds stay circular under a changed law', () => {
    const m = 2;
    for (const law of [{ n: 1.5, s: 1 }, { n: 2, s: 2 }]) {
      const gr = law.n === 2;
      const src = hole(m);
      const r0 = 20 * m;
      const p = { x: r0, y: 0, vx: 0, vy: circularSpeed(m, r0, gr, law) };
      for (let i = 0; i < 3000; i++) rk4ProbeStep(p, probeDt(p, src, 0.01), src, gr, law);
      expect(Math.abs(Math.hypot(p.x, p.y) - r0) / r0).toBeLessThan(1e-6);
    }
  });

  it('the scaled relativistic term is Schwarzschild for M′ = sM: advance matches the elliptic integral', () => {
    const m = 1;
    const s = 2;
    const law = { n: 2, s };
    const src = hole(m);
    const p = { x: 60, y: 0, vx: 0, vy: 0.12 };
    const pins = new ApsisTracker();
    const want = scaledApsidalAngle(m, s, p.x, p.y, p.vx, p.vy);
    for (let i = 0; i < 400_000 && pins.pins.length < 3; i++) {
      rk4ProbeStep(p, probeDt(p, src, 0.002), src, true, law);
      pins.observe(p.x, p.y, p.vx, p.vy, i);
    }
    expect(deg(pins.advance)).toBeCloseTo(deg(want - 2 * Math.PI), 1);
    // s = 1 is our law: the same function gives the usual elliptic integral.
    const E2 = 1 + 2 * (0.5 * 0.12 ** 2 - 1 / 60 - (60 * 0.12) ** 2 / 60 ** 3);
    expect(scaledApsidalAngle(m, 1, 60, 0, 0, 0.12)).toBeCloseTo(apsidalAngle(m, E2, (60 * 0.12) ** 2), 10);
  });

  it('a world step with the default law is unchanged, and the law reaches the particles', () => {
    const run = (law?: { n: number; s: number }) => {
      const w = new World();
      w.loadPreset(presetById('mercury'));
      for (let i = 0; i < 200; i++) w.step(4, { gr: true, gw: false, law }, DEFAULT_NBODY);
      return w.probes.map((q) => [q.x, q.y]);
    };
    expect(run(OUR_LAW)).toEqual(run());
    const changed = run({ n: 2.3, s: 1 });
    // The gold particle follows GR and is untouched; the blue Newtonian one moves differently.
    expect(changed[0]).toEqual(run()[0]);
    expect(changed[1]).not.toEqual(run()[1]);
  });
});

describe('hit a merger time', () => {
  it('Peters inverts, and a run lands within 15% of Peters away from the cap', () => {
    expect(petersCircular(petersSeparation(2000))).toBeCloseTo(2000, 6);
    expect(petersCircular(40)).toBeCloseTo(3125, 6);
    for (const a of [36, 50]) {
      const r = new MergerRun(a);
      while (!r.slice(1000));
      const res = r.result!;
      expect(res.merged).toBe(true);
      expect(Math.abs(res.time - res.peters) / res.peters).toBeLessThan(0.15);
      expect(res.capFrom).toBeGreaterThan(7);
      expect(res.capFrom).toBeLessThan(7.5);
      // No plunge: the run takes a few hundred units from 6M to contact, less than Peters' tail there.
      expect(res.belowSix).toBeGreaterThan(50);
      expect(res.belowSix).toBeLessThan(petersCircular(24));
    }
  });

  it('the figure quoted in How it works: a = 35.8 merges at 1882 against Peters’ 2005', () => {
    const r = new MergerRun(35.8);
    while (!r.slice(1000));
    expect(Math.round(r.result!.time / 2) * 2).toBe(1882);
    expect(Math.round(r.result!.peters)).toBe(2005);
  });

  it('starting near the cap, the gap is large: most of the run is capped', () => {
    const r = new MergerRun(28);
    while (!r.slice(1000));
    expect(r.result!.time / r.result!.peters).toBeLessThan(0.7);
    expect(r.result!.cappedTime / r.result!.time).toBeGreaterThan(0.9);
  });
});

describe('hear the chirp', () => {
  it('a pure tone keeps its frequency, duration and a normalised peak', () => {
    const fCode = 0.01; // per unit time
    const strain = Array.from({ length: 800 }, (_, i) => Math.sin(2 * Math.PI * fCode * i * WAVE_SPACING) * 1e-7);
    const clip = chirpSound(strain, 20, 48000)!;
    const unit = 20 * SUN_TIME_S;
    expect(clip.fLow).toBeCloseTo(fCode / unit, -1);
    expect(clip.fHigh / clip.fLow).toBeLessThan(1.01);
    expect(clip.seconds).toBeCloseTo(799 * WAVE_SPACING * unit, 3);
    let peak = 0;
    for (const v of clip.samples) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(PEAK_LEVEL + 1e-6);
    expect(peak).toBeGreaterThan(0.99 * PEAK_LEVEL);
    // Four times lighter: four times higher and shorter.
    const light = chirpSound(strain, 5, 48000)!;
    expect(light.fLow / clip.fLow).toBeCloseTo(4, 6);
    expect(clip.seconds / light.seconds).toBeCloseTo(4, 6);
    expect(chirpSound(new Float32Array(100), 20, 48000)).toBeNull();
  });

  it('the simulated chirp at 20 M☉ per unit: about 24 to 196 Hz over 0.19 s, ending on the ringdown, with no pitch drop', () => {
    const w = new World();
    w.loadPreset(presetById('chirp'));
    const cfg = { gr: true, gw: true, pn: true };
    while (w.bodies.length > 1) w.step(2, cfg, DEFAULT_NBODY);
    for (let i = 0; i < 100; i++) w.step(2, cfg, DEFAULT_NBODY);
    const oldest = w.waves.newestTime - (WAVE_SAMPLES - 1) * WAVE_SPACING;
    const clip = chirpSound(w.waves.recentStrain(WAVE_SAMPLES), 20, 48000, oldest)!;
    expect(clip.seconds).toBeGreaterThan(0.18);
    expect(clip.seconds).toBeLessThan(0.21);
    expect(clip.fLow).toBeGreaterThan(22);
    expect(clip.fLow).toBeLessThan(26);
    const ring = ringdownMode(w.lastMerger!.mass, w.lastMerger!.spin);
    expect(clip.fHigh / (ring.omega / (2 * Math.PI) / clip.unitSeconds)).toBeCloseTo(1, 1);
    expect(clip.fHigh).toBeGreaterThan(190);
    expect(clip.fHigh).toBeLessThan(202);
    expect(clip.drops).toBe(false);
  }, 60000);
});
