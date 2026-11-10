import { describe, expect, it } from 'vitest';
import { activeChips, chipText, compressedLimb, tidalInterference, type ChipContext, type ChipId } from './approx';
import { DEFAULT_NBODY } from './nbody';
import { presetById } from './presets';
import { DEPTHS } from '../state/depth';
import { World } from '../sim/world';

function sceneCtx(id: string, mode: ChipContext['mode']): ChipContext {
  const w = new World();
  w.loadPreset(presetById(id));
  return { mode, bodies: w.bodies, capActive: w.capActive, capture: w.lastCapture };
}

describe('approximation chips', () => {
  it('appear only where their approximation is on screen', () => {
    expect(activeChips(sceneCtx('single', 'lens'))).toEqual([]);
    expect(activeChips(sceneCtx('single', 'space'))).toEqual([]);
    expect(activeChips(sceneCtx('binary', 'lens'))).toEqual(['lens-sum']);
    expect(activeChips(sceneCtx('binary', 'tidal'))).toEqual(['tidal-sum']);
    expect(activeChips(sceneCtx('binary', 'space'))).toEqual([]);
    expect(activeChips(sceneCtx('solar', 'lens'))).toContain('compressed');
    expect(activeChips(sceneCtx('solar', 'waves'))).not.toContain('compressed');
  });

  it('every chip gives the neglected order, the source and an error estimate at Equation depth', () => {
    const w = new World();
    w.loadPreset(presetById('clocks'));
    while (!w.lastCapture && w.simTime < 3000) w.step(1, { gr: true, gw: false }, DEFAULT_NBODY);
    const b = new World();
    b.loadPreset(presetById('binary'));
    while (!b.capActive && b.simTime < 8000) b.step(1, { gr: true, gw: true, pn: true }, DEFAULT_NBODY);
    const cases: [ChipId, ChipContext][] = [
      ['lens-sum', sceneCtx('binary', 'lens')],
      ['tidal-sum', sceneCtx('binary', 'tidal')],
      ['compressed', sceneCtx('solar', 'lens')],
      ['removal', { mode: 'time', bodies: w.bodies, capActive: false, capture: w.lastCapture }],
      ['cap', { mode: 'space', bodies: b.bodies, capActive: b.capActive, capture: null }],
    ];
    for (const [id, ctx] of cases) {
      expect(activeChips(ctx)).toContain(id);
      const eq = chipText(id, 'equation', ctx);
      expect(eq.order, id).toBeTruthy();
      expect(eq.source, id).toMatch(/\(\d{4}\)/);
      expect(eq.error, id).toMatch(/\d/);
      expect(eq.eq, id).toBeTruthy();
      for (const d of DEPTHS) expect(chipText(id, d.id, ctx).body.length, `${id} ${d.id}`).toBeGreaterThan(20);
      expect(chipText(id, 'words', ctx).body).not.toMatch(/\d/);
    }
    // The live figures.
    expect(chipText('lens-sum', 'numbers', cases[0][1]).body).toMatch(/5\.0%/); // M/d = 2/40
    expect(chipText('tidal-sum', 'numbers', cases[1][1]).body).toMatch(/2\.00×/); // 4× one mass, not 2×
    expect(chipText('compressed', 'numbers', cases[2][1]).body).toMatch(/22\.9° at its drawn limb; at its true size, 1\.75″/);
    expect(chipText('removal', 'numbers', cases[3][1]).body).toMatch(/Removed at r = 2\.0\d\dM/);
    const cap = chipText('cap', 'numbers', cases[4][1]).body;
    const sep = Number(cap.match(/Separation ([\d.]+)M/)![1]);
    expect(sep).toBeGreaterThan(7);
    expect(sep).toBeLessThan(7.5);
  });

  it('the figures behind them', () => {
    const solar = sceneCtx('solar', 'lens');
    const sun = compressedLimb(solar.bodies)!;
    expect(sun.body.name).toBe('Sun');
    expect(sun.drawnDeg).toBeCloseTo(22.9, 1);
    expect(sun.trueArcsec).toBeCloseTo(1.751, 3);
    const ti = tidalInterference(sceneCtx('binary', 'tidal').bodies)!;
    expect(ti.together / ti.summed).toBeCloseTo(2, 10);
    expect(chipText('compressed', 'equation', solar).error).toMatch(/about 47,?100× too large/);
  });
});
