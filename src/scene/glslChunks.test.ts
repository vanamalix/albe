import { describe, expect, it } from 'vitest';
import { deflectionPerImpact, deflectionTable, skyChart, tableRemainder } from '../physics/lens';
import { kretschmann, MAX_SHADER_MASSES } from '../physics/fields';
import { LENS_GLSL, TIDAL_GLSL } from './glslChunks';
import lens from './lensView.tsx?raw';
import sheet from './shaders.ts?raw';
import type { Source } from '../physics/types';

const BC_FACTOR = 5.196152422706632;

/** Turns the scalar GLSL subset into JavaScript source, so the shader's own text can be run here. */
function toJs(glsl: string): string {
  return glsl
    .replace(/\b(?:float|int|bool|vec2|vec3|vec4)\s+(\w+)\s*\(([^)]*)\)\s*\{/g, (_all, name: string, params: string) => {
      const names = params
        .split(',')
        .map((p) => p.trim().split(/\s+/).pop())
        .filter(Boolean);
      return `function ${name}(${names.join(', ')}) {`;
    })
    .replace(/\b(?:float|int|bool|vec2|vec3|vec4)\s+(?=\w+\s*(?:=|;|,))/g, 'let ')
    .replace(/(\d)\.0\b/g, '$1')
    .replace(/1\.000001/g, '1.000001');
}

type Fns = Record<string, (...a: number[]) => number>;

function compile(glsl: string, names: string[], scope: Record<string, unknown>): Fns {
  const math = { sqrt: Math.sqrt, max: Math.max, min: Math.min, tan: Math.tan, log: Math.log, clamp: (x: number, a: number, b: number) => Math.min(b, Math.max(a, x)), MAXM: MAX_SHADER_MASSES, ...scope };
  const keys = Object.keys(math);
  const body = `${toJs(glsl)}; return { ${names.join(', ')} };`;
  // eslint-disable-next-line no-new-func
  return new Function(...keys, body)(...keys.map((k) => math[k as keyof typeof math])) as Fns;
}

const uniforms = (list: Source[]) =>
  list.map((s) => ({ x: s.x, y: s.y, z: s.m, w: Math.max(s.radius ?? 0, 2 * s.m) }));

describe('the shader chunks compute the same numbers as the physics', () => {
  it('the real shaders are built from these chunks, with no second path', () => {
    expect(lens).toContain('\${LENS_GLSL}');
    expect(lens).not.toContain('uStrong');
    expect(sheet).toContain('\${TIDAL_GLSL}');
    expect(sheet).not.toContain('48.0 * m.z');
  });

  const masses: Source[] = [
    { x: -30, y: 4, m: 2 },
    { x: 45, y: -10, m: 3 },
    { x: 12, y: 60, m: 0.5, radius: 6, kind: 'star' },
    { x: -80, y: -50, m: 1, kind: 'galaxy', radius: 200, soft: 28 },
  ];

  it('tidalK matches kretschmann', () => {
    const fns = compile(TIDAL_GLSL, ['tidalK'], { uMasses: uniforms(masses), uCount: masses.length });
    for (const [x, y] of [[0, 0], [10, -20], [-30, 4], [44, -11], [300, 200], [12.5, 60.5]]) {
      const shader = fns.tidalK(x, y);
      const physics = kretschmann(x, y, masses);
      expect(Math.abs(shader - physics) / physics).toBeLessThan(1e-12);
    }
  });

  it('massDeflection and skyChart match deflectionPerImpact and skyChart', () => {
    const table = deflectionTable();
    const remainder = (x: number) => tableRemainder(table, x);
    const fns = compile(LENS_GLSL, ['occlusion', 'massDeflection', 'skyChart'], { BC_FACTOR, remainder });
    for (const s of masses) {
      const R = Math.max(s.radius ?? 0, 2 * s.m);
      for (const b of [0, 0.5, 3, 7, 13, 25, 80, 500, 5000]) {
        const shader = fns.massDeflection(b * b, s.m, R, s.soft ?? 0);
        const physics = deflectionPerImpact(s, b);
        if (physics === 0) expect(shader).toBe(0);
        else expect(Math.abs(shader - physics) / physics).toBeLessThan(2e-3);
      }
    }
    for (const t of [0, 1e-9, 0.1, 1, 3, 3.15, 7]) expect(fns.skyChart(t)).toBeCloseTo(skyChart(t), 12);
  });
});
