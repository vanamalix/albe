import { describe, expect, it } from 'vitest';
import { VIEW_MODES } from '../physics/fields';
import { presetById } from '../physics/presets';
import type { Body } from '../physics/types';
import { DEPTHS } from '../state/depth';
import { radialRuler, viewCopy } from './viewCopy';

const hole = (m: number, x = 0, y = 0): Body => ({ id: 1, x, y, vx: 0, vy: 0, m, ax: 0, ay: 0 });
const bodiesOf = (id: string): Body[] => presetById(id).bodies.map((b, i) => ({ ...b, id: i + 1, ax: 0, ay: 0 }));

describe('the info card at three depths', () => {
  it('keeps the same exact or approximate tag at every depth', () => {
    for (const mode of [...VIEW_MODES, 'warp' as const]) {
      for (const bodies of [[hole(4)], bodiesOf('binary'), bodiesOf('solar')]) {
        const tags = DEPTHS.map((d) => viewCopy(mode, d.id, bodies, 1).tag);
        expect(new Set(tags).size).toBe(1);
      }
    }
  });

  it('Equation carries an expression and a reference for every view but the illustrative lattice', () => {
    for (const mode of [...VIEW_MODES, 'warp' as const]) {
      const c = viewCopy(mode, 'equation', [hole(4)], 1);
      if (mode === 'lattice') expect(c.eq).toBeUndefined();
      else {
        expect(c.eq).toBeTruthy();
        expect(c.ref).toMatch(/\(\d{4}\)/);
      }
    }
    expect(viewCopy('time', 'equation', [hole(4)], 1).title).toMatch(/lapse/);
    expect(viewCopy('tidal', 'equation', [hole(4)], 1).title).toMatch(/Tidal/);
  });

  it('Words has no equations and Numbers has live values', () => {
    const w = viewCopy('time', 'words', [hole(4)], 1);
    expect(w.body).not.toMatch(/[√Φ=]/);
    const n = viewCopy('time', 'numbers', [hole(4)], 1).body;
    expect(n).toMatch(/×0\.866/);
    expect(n).toMatch(/×0\.791/);
    expect(n).toMatch(/×0\.577/);
    expect(viewCopy('space', 'numbers', [hole(4)], 1).body).toMatch(/4\.14M, not 3M/);
    expect(radialRuler(1, 3, 6)).toBeCloseTo(4.142, 3);
    const lens = viewCopy('lens', 'numbers', [hole(4)], 1).body;
    expect(lens).toMatch(/5\.196M/);
    expect(lens).toMatch(/23\.2°/);
    expect(lens).toMatch(/17\.6°/);
    const tidal = viewCopy('tidal', 'numbers', [hole(1)], 1).body;
    expect(tidal).toMatch(/7\.50e-1 at the horizon/);
    expect(viewCopy('waves', 'numbers', bodiesOf('chirp'), 1).body).toMatch(/period \d+/);
  });

  it('stars qualify the exact claim at every depth', () => {
    for (const d of DEPTHS) expect(viewCopy('space', d.id, bodiesOf('solar'), 1).body).toMatch(/far bigger than life/);
  });
});
