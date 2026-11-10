import { describe, expect, it } from 'vitest';
import { SUN_GM_METRES } from '../physics/bodies';
import { DEFAULT_NBODY, pairOrbit } from '../physics/nbody';
import { PRESETS, presetById } from '../physics/presets';
import { DEPTHS } from '../state/depth';
import { World } from '../sim/world';
import { explainerFor, hasOwnExplainer, mercuryAdvance, resolve, type ExplainContext } from './content';

function ctxFor(id: string, gr = true): ExplainContext {
  const world = new World();
  world.loadPreset(presetById(id));
  return { world, depth: 'equation', mode: presetById(id).settings.mode ?? 'space', gr };
}
const advance = (c: ExplainContext, t: number, gw = false, pn = true) => {
  while (c.world.simTime < t) c.world.step(Math.min(1, t - c.world.simTime), { gr: c.gr, gw, pn }, DEFAULT_NBODY);
};
const watch = (id: string, c: ExplainContext, label: RegExp): string | null => {
  const r = explainerFor(id, c).watch.find((x) => label.test(x.label));
  if (!r) throw new Error(`no row ${label}`);
  return r.value(c);
};

describe('explainers', () => {
  it('every scene has one, and every text and live value resolves at every depth', () => {
    for (const p of PRESETS) {
      const c = ctxFor(p.id);
      advance(c, 50, p.settings.gw ?? false, p.settings.pn ?? true);
      for (const d of DEPTHS) {
        const e = explainerFor(p.id, { ...c, depth: d.id });
        const texts = [e.seeing, e.why.words, e.why.numbers, e.why.equation, ...e.exact, ...e.approx, ...(e.myths ?? []).flatMap((m) => [m.picture, m.gr])].map((t) => resolve(t, c));
        for (const t of texts) expect(t, p.id).not.toMatch(/NaN|undefined|Infinity/);
        for (const w of e.watch) expect(w.value(c) ?? '', `${p.id} ${w.label}`).not.toMatch(/NaN|undefined/);
      }
    }
    for (const id of ['single', 'mercury', 'clocks', 'binary', 'chirp', 'solar']) {
      expect(hasOwnExplainer(id)).toBe(true);
      const e = explainerFor(id, ctxFor(id));
      expect(e.reading.length).toBeGreaterThan(0);
      for (const r of e.reading) expect(r).toMatch(/\(\d{4}\)/);
      expect(e.why.eq?.length).toBeGreaterThan(0);
    }
  });

  it('real Mercury: 0.10″ per orbit, 43″ per century; the Sun’s r_s about 3 km', () => {
    const m = mercuryAdvance();
    expect(m.perOrbit).toBeCloseTo(0.1035, 3);
    expect(m.perCentury).toBeCloseTo(43.0, 0);
    expect((2 * SUN_GM_METRES) / 1000).toBeCloseTo(2.95, 2);
  });

  it('Mercury: the pins read 35.4°, against 30.8° to first order', () => {
    const c = ctxFor('mercury');
    while (c.world.pins.pins.length < 2) advance(c, c.world.simTime + 20);
    expect(watch('mercury', c, /measured/)).toBe('35.4°');
    expect(watch('mercury', c, /exact/)).toBe('35.4°');
    expect(watch('mercury', c, /6πM/)).toBe('30.8°');
    expect(watch('mercury', c, /M\/r at/)).toBe('1/32.0');
  });

  it('three clocks: at t = 1000 each orbiting clock matches t√(1 − 3M/r)', () => {
    const c = ctxFor('clocks');
    advance(c, 1000);
    expect(watch('clocks', c, /Close orbit/)).toMatch(/^790\.\d · 790\.6$/);
    expect(watch('clocks', c, /Wide orbit/)).toMatch(/^948\.\d · 948\.7$/);
    expect(watch('clocks', c, /Removed at/)).toMatch(/^2\.0\d\dM · 549\.\d · 638\.\d$/);
  });

  it('binary: zero pull at the midpoint, K twice the summed value, and the midpoint clock', () => {
    const c = ctxFor('binary');
    expect(watch('binary', c, /K both/)).toBe('2.00×');
    const mid = watch('binary', c, /Midpoint clock: /)!;
    expect(mid.startsWith('×0.775')).toBe(true);
    expect(Number(mid.split('= ')[1])).toBeLessThan(1e-12);
    explainerFor('binary', c).actions![0].run(c, { restart: () => undefined, openMeasure: () => undefined });
    advance(c, 400, true);
    const p = c.world.probes.find((q) => q.label === 'Midpoint clock')!;
    expect(Math.hypot(p.x, p.y)).toBeLessThan(1e-6);
    expect(p.rate).toBeLessThan(0.775);
    expect(p.rate).toBeGreaterThan(0.75);
  });

  it('solar: swapping the Sun for a black hole leaves Earth’s orbit as it was', () => {
    const c = ctxFor('solar');
    const earth = () => c.world.bodies.find((b) => b.name === 'Earth')!;
    const centre = () => c.world.bodies.reduce((h, b) => (b.m > h.m ? b : h));
    const a0 = pairOrbit(earth(), centre()).a;
    explainerFor('solar', c).actions![0].run(c, { restart: () => undefined, openMeasure: () => undefined });
    expect(watch('solar', c, /Central/)).toBe('a black hole');
    const year = 2 * Math.PI * Math.sqrt(a0 ** 3 / centre().m);
    advance(c, year, false, false);
    expect(Math.abs(pairOrbit(earth(), centre()).a / a0 - 1)).toBeLessThan(1e-2);
  });
});
