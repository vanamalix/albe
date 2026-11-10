/**
 * The corrections from the physics audit: each test states a closed form, or pins a number that the
 * interface states to the simulation that produces it.
 */
import { describe, expect, it } from 'vitest';
import { bodyType, haloEnclosed, SOLAR, swallowMass, tidalRadius, tornBeforeHorizon } from './bodies';
import { kretschmann } from './fields';
import { makeRay, rayStep } from './light';
import { lensMap, lensNote, lensSkyMap, occlusionRadius, schwarzschildDeflection, strongLensMap } from './lens';
import { DEFAULT_NBODY, pnCapFired } from './nbody';
import { presetById } from './presets';
import { properTimeRatio, rk4ProbeStep } from './probes';
import { World } from '../sim/world';
import type { Body, Source } from './types';

const hole: Source = { x: 0, y: 0, m: 1 };
const D = 42;

describe('the lens seam: every mass bends with its own exact angle', () => {
  it('one hole is unchanged', () => {
    for (const [x, y] of [[13, 0], [6, 8], [-20, 3], [300, -40]] as const) {
      const a = lensSkyMap(x, y, [hole], D)!;
      const b = strongLensMap(x, y, hole, D)!;
      expect(a.x).toBeCloseTo(b.x, 8);
      expect(a.y).toBeCloseTo(b.y, 8);
    }
  });

  it('a distant speck moves the map by almost nothing: there is no jump to 4M/b', () => {
    const speck: Source = { x: 900, y: 0, m: 1e-6 };
    for (const b of [8, 13, 20, 40]) {
      const alone = lensSkyMap(b, 0, [hole], D)!;
      const withSpeck = lensSkyMap(b, 0, [hole, speck], D)!;
      expect(Math.abs(withSpeck.x - alone.x)).toBeLessThan(1e-3);
      expect(Math.abs(withSpeck.y - alone.y)).toBeLessThan(1e-3);
    }
  });

  it('several masses add the exact angles of each as vectors, then use the sky chart', () => {
    const a: Source = { x: -30, y: 0, m: 2 };
    const b: Source = { x: 45, y: 10, m: 3 };
    const [px, py] = [7, -3];
    const vec = (s: Source) => {
      const dx = px - s.x;
      const dy = py - s.y;
      const r = Math.hypot(dx, dy);
      const alpha = schwarzschildDeflection(r, s.m);
      return [(alpha * dx) / r, (alpha * dy) / r];
    };
    const sx = vec(a)[0] + vec(b)[0];
    const sy = vec(a)[1] + vec(b)[1];
    const t = Math.hypot(sx, sy);
    const k = (2 * Math.tan(t / 2)) / t;
    const out = lensSkyMap(px, py, [a, b], D)!;
    expect(out.x).toBeCloseTo(px - D * k * sx, 8);
    expect(out.y).toBeCloseTo(py - D * k * sy, 8);
  });

  it('reduces to the thin-lens map far from every mass', () => {
    const list: Source[] = [{ x: -30, y: 0, m: 0.5 }, { x: 45, y: 10, m: 0.7 }];
    const out = lensSkyMap(9000, 4000, list, D)!;
    const weak = lensMap(9000, 4000, list, D);
    expect(Math.abs(out.x - weak.x)).toBeLessThan(0.02);
    expect(Math.abs(out.y - weak.y)).toBeLessThan(0.02);
  });

  it('is captured inside either hole, and only there', () => {
    const list: Source[] = [{ x: -40, y: 0, m: 2 }, { x: 40, y: 0, m: 1 }];
    expect(lensSkyMap(-40 + 5.2 * 2 - 0.5, 0, list, D)).toBeNull();
    expect(lensSkyMap(40 + 5.1, 0, list, D)).toBeNull();
    expect(lensSkyMap(0, 0, list, D)).not.toBeNull();
  });

  it('a solid body uses the exact angle outside its limb, and no more inside it', () => {
    const star: Source = { x: 0, y: 0, m: 0.5, radius: 6, kind: 'star' };
    const limb = occlusionRadius(star);
    const out = lensSkyMap(limb * 1.2, 0, [star], D)!;
    const alpha = schwarzschildDeflection(limb * 1.2, star.m);
    expect(out.x).toBeCloseTo(limb * 1.2 - D * 2 * Math.tan(alpha / 2), 8);
    const inside = lensSkyMap(limb / 2, 0, [star], D)!;
    const atLimb = schwarzschildDeflection(limb, star.m);
    expect(limb / 2 - inside.x).toBeLessThan(D * 2 * Math.tan(atLimb / 2));
  });

  it('a galaxy keeps its softened law', () => {
    const g: Source = { x: 0, y: 0, m: 1, kind: 'galaxy', soft: 20, radius: 300 };
    const out = lensSkyMap(10, 0, [g], 500)!;
    const alpha = (4 * 1 * 10) / (100 + 400);
    const k = (2 * Math.tan(alpha / 2)) / alpha;
    expect(out.x).toBeCloseTo(10 - 500 * k * alpha, 8);
  });

  it('labels the sum as exact per mass but not exact overall, with a live size', () => {
    const note = lensNote([hole, { x: 40, y: 0, m: 1 }], 32);
    expect(note.tag.startsWith('exact')).toBe(false);
    expect(note.tag).toMatch(/exact bending per mass/);
    expect(note.body).toMatch(/nonlinear/);
    expect(note.body).toMatch(/2\.5%/); // M/d = 1/40
    expect(lensNote([hole], 32).tag.startsWith('exact')).toBe(true);
    // A compressed star says what its limb bending really is.
    const star = lensNote([{ x: 0, y: 0, m: 0.5, radius: 6, kind: 'star' }], 32);
    expect(star.body).toMatch(/22\.9° at its limb here, 1\.75″/);
    const galaxy = lensNote([{ x: 0, y: 0, m: 1, kind: 'galaxy', soft: 28, radius: 210 }], 32);
    expect(galaxy.body).toMatch(/4Mb/);
    expect(galaxy.body).not.toMatch(/Schwarzschild/);
  });
});

describe('the tidal view: K = 8 E_ij E^ij from summed tidal tensors', () => {
  it('one mass is still 48M²/r⁶', () => {
    expect(kretschmann(6, 8, [{ x: 0, y: 0, m: 3 }])).toBeCloseTo((48 * 9) / 10 ** 6, 12);
    expect(kretschmann(0, 0, [{ x: 0, y: 0, m: 2, radius: 5 }])).toBeCloseTo((48 * 4) / 5 ** 6, 12);
  });

  it('the midpoint of two equal masses is 4× one mass, not 2×', () => {
    const one = 48 / 30 ** 6;
    const pair = [{ x: -30, y: 0, m: 1 }, { x: 30, y: 0, m: 1 }];
    expect(kretschmann(0, 0, pair)).toBeCloseTo(4 * one, 15);
  });

  it('two equal masses at right angles interfere: K equals one mass alone', () => {
    // E = (M/R³)[diag(−2, 1, 1) + diag(1, −2, 1)] = (M/R³) diag(−1, −1, 2), so E:E = 6 M²/R⁶.
    const pair = [{ x: 20, y: 0, m: 2 }, { x: 0, y: 20, m: 2 }];
    expect(kretschmann(0, 0, pair)).toBeCloseTo((48 * 4) / 20 ** 6, 14);
  });
});

/** Periapsis-to-periapsis angle of a Schwarzschild geodesic, from the elliptic integral (Darwin 1959). */
function apsidalAngle(m: number, x0: number, vy: number): number {
  const L2 = (x0 * vy) ** 2;
  const f = 1 - (2 * m) / x0;
  const E2 = f * (1 + L2 / x0 ** 2);
  // du/dφ² = 2M u³ − u² + (2M/L²) u + (E² − 1)/L²: three real roots u1 < u2 < u3.
  const c = [2 * m, -1, (2 * m) / L2, (E2 - 1) / L2];
  const roots = cubicRoots(c[0], c[1], c[2], c[3]).sort((p, q) => p - q);
  const [u1, u2, u3] = roots;
  const k2 = (u2 - u1) / (u3 - u1);
  // K(k) by arithmetic-geometric mean; the apsidal angle is 2 ∫ du/√(2M(u−u₁)(u₂−u)(u₃−u)).
  let [a, b] = [1, Math.sqrt(1 - k2)];
  for (let i = 0; i < 40; i++) [a, b] = [(a + b) / 2, Math.sqrt(a * b)];
  const K = Math.PI / (2 * a);
  return (4 * K) / Math.sqrt(2 * m * (u3 - u1));
}

function cubicRoots(a: number, b: number, c: number, d: number): number[] {
  const p = (3 * a * c - b * b) / (3 * a * a);
  const q = (2 * b ** 3 - 9 * a * b * c + 27 * a * a * d) / (27 * a ** 3);
  const r = 2 * Math.sqrt(-p / 3);
  const theta = Math.acos((3 * q) / (p * r));
  return [0, 1, 2].map((k) => r * Math.cos((theta + 2 * Math.PI * k) / 3) - b / (3 * a));
}

describe('numbers stated on screen', () => {
  it('the Mercury scene advances by 35.4° per orbit, not the 28° of the Newtonian elements', () => {
    const preset = presetById('mercury')!;
    const q = preset.probes[0];
    const src: Body[] = [{ ...preset.bodies[0], id: 1, ax: 0, ay: 0 }];
    const exact = (apsidalAngle(1, q.x, q.vy) * 180) / Math.PI - 360;
    expect(exact).toBeCloseTo(35.36, 1);
    // The integrator the scene actually runs.
    const st = { x: q.x, y: q.y, vx: q.vx, vy: q.vy };
    let angle = 0;
    let prevAng = Math.atan2(st.y, st.x);
    let prevR = Infinity;
    let prevR2 = Infinity;
    let rmin = Infinity;
    let rmax = 0;
    const peris: number[] = [];
    for (let i = 0; peris.length < 3 && i < 4_000_000; i++) {
      rk4ProbeStep(st, 0.02, src, true);
      const r = Math.hypot(st.x, st.y);
      const th = Math.atan2(st.y, st.x);
      let d = th - prevAng;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      angle += d;
      prevAng = th;
      if (prevR < prevR2 && prevR < r) peris.push((angle * 180) / Math.PI);
      rmin = Math.min(rmin, r);
      rmax = Math.max(rmax, r);
      prevR2 = prevR;
      prevR = r;
    }
    expect(peris[1] - peris[0] - 360).toBeCloseTo(exact, 1);
    expect(rmin).toBeCloseTo(32, 3);
    expect(rmax).toBeCloseTo(38.89, 1);
    // The textbook formula on the orbit actually flown, and what the note says.
    const a = (rmin + rmax) / 2;
    const e = (rmax - rmin) / (rmax + rmin);
    expect((6 * Math.PI * 1) / (a * (1 - e * e)) * (180 / Math.PI)).toBeCloseTo(30.76, 1);
    expect(preset.note).toMatch(/35°/);
    expect(preset.note).toMatch(/30\.8°/);
    expect(preset.note).not.toMatch(/28°/);
  });

  it('the precessing binary: semi-major axis 70, about 60° per turn', () => {
    const preset = presetById('eccentric')!;
    expect(preset.note).toMatch(/140/);
    expect(preset.note).toMatch(/about 60°/);
    const world = new World();
    world.loadPreset(preset);
    const peris: number[] = [];
    let prev = Infinity;
    let prev2 = Infinity;
    for (let t = 0; t < 16000 && peris.length < 4 && world.bodies.length > 1; t += 2) {
      world.step(2, { gr: true, gw: true, pn: true }, DEFAULT_NBODY);
      const [a, b] = world.bodies;
      const r = Math.hypot(a.x - b.x, a.y - b.y);
      if (prev < prev2 && prev < r) peris.push((Math.atan2(a.y - b.y, a.x - b.x) * 180) / Math.PI);
      prev2 = prev;
      prev = r;
    }
    const steps = peris.slice(1).map((p, i) => (((p - peris[i]) % 360) + 360) % 360);
    for (const s of steps) expect(s).toBeGreaterThan(50);
    expect(Math.max(...steps)).toBeLessThan(70);
  });

  function capRun(id: string) {
    const world = new World();
    world.loadPreset(presetById(id)!);
    const M = world.bodies[0].m + world.bodies[1].m;
    let t = 0;
    let firstCap = 0;
    let firstCapT = 0;
    let t6 = 0;
    let t2 = 0;
    let om6 = 0;
    let om2 = 0;
    pnCapFired.count = 0;
    while (t < 8000 && world.bodies.length > 1) {
      const before = pnCapFired.count;
      world.step(0.5, { gr: true, gw: true, pn: true }, DEFAULT_NBODY);
      t += 0.5;
      if (world.bodies.length < 2) break;
      const [a, b] = world.bodies;
      const r = Math.hypot(a.x - b.x, a.y - b.y);
      if (pnCapFired.count > before && !firstCap) {
        firstCap = r / M;
        firstCapT = t;
      }
      const h = Math.abs((a.x - b.x) * (a.vy - b.vy) - (a.y - b.y) * (a.vx - b.vx));
      if (!t6 && r / M <= 6) {
        t6 = t;
        om6 = (h / (r * r)) * M;
      }
      if (!t2 && r / M <= 2.05) {
        t2 = t;
        om2 = (h / (r * r)) * M;
      }
    }
    return { firstCap, frac: (t - firstCapT) / t, t6, t2, M, om6, om2 };
  }

  it('the cap first fires at about 7.2M in the binary scene and governs its last sixth', () => {
    const run = capRun('binary');
    expect(run.firstCap).toBeGreaterThan(7);
    expect(run.firstCap).toBeLessThan(7.5);
    expect(run.frac).toBeGreaterThan(0.13);
    expect(run.frac).toBeLessThan(0.2);
    // No plunge: from 6M to 2M the separation shrinks over many orbital times, not one.
    expect(run.t2 - run.t6).toBeGreaterThan(30 * run.M);
    expect(run.t2 - run.t6).toBeLessThan(50 * run.M);
    expect(run.om6).toBeCloseTo(0.046, 2);
    expect(run.om2).toBeGreaterThan(0.15);
    expect(run.om2).toBeLessThan(0.25);
    expect(presetById('binary')!.note).toMatch(/7\.2M/);
    expect(presetById('binary')!.note).toMatch(/16%/);
  });

  it('the chirp scene is capped for its last third, from about 7.4M', () => {
    const run = capRun('chirp');
    expect(run.firstCap).toBeGreaterThan(7.1);
    expect(run.firstCap).toBeLessThan(7.7);
    expect(run.frac).toBeGreaterThan(0.28);
    expect(run.frac).toBeLessThan(0.4);
    expect(presetById('chirp')!.note).toMatch(/7\.4M/);
    expect(presetById('chirp')!.note).toMatch(/last third/);
  });

  it('a compressed star bends light at its limb by 22.9° (real: 1.75″), and swallows at 15 M☉, not 10⁸', () => {
    const sun = bodyType('g');
    const s: Source = { x: 0, y: 0, m: SOLAR, kind: 'star', radius: sun.radius };
    expect((schwarzschildDeflection(occlusionRadius(s), SOLAR) * 180) / Math.PI).toBeCloseTo(22.9, 1);
    expect(swallowMass(sun.radius!, SOLAR) / SOLAR).toBeCloseTo(14.7, 1);
    expect(swallowMass(2 * 235000, 1)).toBeCloseTo(235000 ** 1.5, -3);
    expect(tidalRadius(6, 0.5, 4)).toBeCloseTo(6 * Math.cbrt(8), 10);
    expect(tornBeforeHorizon(6, 0.5, 4)).toBe(true);
    expect(tornBeforeHorizon(6, 0.5, 8)).toBe(false);
    const note = presetById('tde')!.note;
    expect(note).toMatch(/15 M☉/);
    expect(note).toMatch(/10⁸/);
  });

  it('the cluster scene states its friction factor', () => {
    const p = presetById('cluster')!;
    expect(p.settings.friction).toBe(0.04);
    expect(p.note).toMatch(/4%/);
  });
});

describe('probes near a star: the clock ignores the compressed M/r', () => {
  it('leaves only the kinematic factor, unlike the same mass as a black hole', () => {
    const star: Body = { id: 1, x: 0, y: 0, vx: 0, vy: 0, m: 0.5, ax: 0, ay: 0, kind: 'star', radius: 6 };
    const p = { x: 20, y: 0, vx: 0, vy: 0.2 };
    expect(properTimeRatio(p, [star])).toBeCloseTo(Math.sqrt(1 + 0.04), 10);
    const bh: Body = { ...star, kind: undefined, radius: undefined };
    expect(properTimeRatio(p, [bh])).toBeGreaterThan(Math.sqrt(1 + 0.04) * 1.02);
  });
});

describe('rays through a galaxy use the lens view’s law', () => {
  it('4Mb/(b²+a²), the softened thin-lens deflection', () => {
    const g: Body = { id: 1, x: 0, y: 0, vx: 0, vy: 0, m: 0.2, ax: 0, ay: 0, kind: 'galaxy', soft: 28, radius: 210 };
    const a = 28;
    for (const b of [14, 28, 56, 200]) {
      const ray = makeRay(1, -3000, b, 1, 0, [g]);
      for (let guard = 0; ray.x < 3000 && guard < 300000; guard++) {
        const r = Math.hypot(ray.x, ray.y) + a;
        rayStep(ray, Math.min(3, 0.05 * r) / Math.hypot(ray.vx, ray.vy), [g]);
      }
      const angle = -Math.atan2(ray.vy, ray.vx);
      const expected = (4 * g.m * b) / (b * b + a * a);
      expect(Math.abs(angle - expected) / expected).toBeLessThan(0.02);
      // The lens view reads this same number.
      const k = lensMap(b, 0, [g], 1).x;
      expect(b - k).toBeCloseTo(expected, 12);
    }
  });

  it('the law bends about 5× more than the halo’s own projected mass at b = a', () => {
    const [a, R] = [28, 210];
    const rho0 = 1 / (4 * Math.PI * a * a * (R - a * Math.atan(R / a)));
    const proj = (b: number) => {
      let sum = 0;
      const nr = 1500;
      for (let i = 0; i < nr; i++) {
        const bb = ((i + 0.5) * b) / nr;
        const zmax = Math.sqrt(R * R - bb * bb);
        let sig = 0;
        for (let j = 0; j < 300; j++) {
          const z = ((j + 0.5) * zmax) / 300;
          sig += ((2 * rho0) / (1 + (bb * bb + z * z) / (a * a))) * (zmax / 300);
        }
        sum += sig * 2 * Math.PI * bb * (b / nr);
      }
      return sum;
    };
    expect(haloEnclosed(1, a, R, R)).toBeCloseTo(1, 12);
    const halo = (4 * proj(a)) / a;
    const plummer = (4 * a) / (2 * a * a);
    expect(plummer / halo).toBeGreaterThan(4.5);
    expect(plummer / halo).toBeLessThan(5.8);
  });
});
