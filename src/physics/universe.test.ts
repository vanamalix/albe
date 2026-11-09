import { describe, expect, it } from 'vitest';
import { World } from '../sim/world';
import { blackbody, bodyType, BODY_TYPES, collisionOutcome, displayRadius, haloEnclosed, haloFlatSpeed, SOLAR } from './bodies';
import { flammWell, heightAt, potential, surfaceZ } from './fields';
import { deflectionAngle } from './light';
import { addDynamicalFriction, advanceBodies, computeAccelerations, DEFAULT_NBODY, mergeBodies, totalEnergy, totalMomentum } from './nbody';
import { BUTTERFLY, MOTH, PRESETS, presetById, suvakov, surpriseScene, YINYANG } from './presets';
import { probeAcceleration } from './probes';
import { QuadTree, rotationCurve, seeded, spawnDisk, Swarm } from './swarm';
import type { Body } from './types';

const NEWTON = { ...DEFAULT_NBODY, softening: 1e-3, merge: false };
const mk = (id: number, x: number, y: number, vx: number, vy: number, m: number, extra: Partial<Body> = {}): Body => ({ id, x, y, vx, vy, m, ax: 0, ay: 0, ...extra });
const CFG = { gr: false, gw: false, pn: false };

/** Runs a Newtonian three-body orbit for `time` and returns the largest distance from the start. */
function closure(bodies: Body[], time: number): number {
  const start = bodies.map((b) => [b.x, b.y]);
  let t = 0;
  while (t < time) {
    const h = Math.min(5, time - t);
    advanceBodies(bodies, h, NEWTON, 0.002, 200000);
    t += h;
  }
  return Math.max(...bodies.map((b, i) => Math.hypot(b.x - start[i][0], b.y - start[i][1])));
}

describe('catalogue', () => {
  it('blackbody colours run from red to blue with temperature', () => {
    const cool = blackbody(3200);
    const hot = blackbody(38000);
    expect(cool[0]).toBeGreaterThan(cool[2]);
    expect(hot[2]).toBeGreaterThan(hot[0]);
    for (const c of [...cool, ...hot]) expect(c).toBeLessThanOrEqual(1);
  });

  it('every object with a surface stays clear of its own horizon', () => {
    for (const t of BODY_TYPES) {
      if (!t.radius || t.kind === 'galaxy') continue;
      expect(t.radius).toBeGreaterThan(2 * t.solarMass * SOLAR);
    }
  });

  it('mass ratios between stars are the real ones', () => {
    expect(bodyType('o').solarMass / bodyType('m').solarMass).toBeCloseTo(124.7, 1);
    expect(displayRadius(500, 15)).toBeGreaterThan(displayRadius(1, 1));
  });
});

describe('surfaces and interiors', () => {
  const rs = 2;
  const R = 6;

  it('the interior embedding joins Flamm smoothly at the surface', () => {
    const e = 1e-5;
    expect(surfaceZ(R - e, rs, R)).toBeCloseTo(surfaceZ(R + e, rs, R), 4);
    const inner = (surfaceZ(R, rs, R) - surfaceZ(R - 2 * e, rs, R)) / (2 * e);
    const outer = (surfaceZ(R + 2 * e, rs, R) - surfaceZ(R, rs, R)) / (2 * e);
    expect(inner).toBeCloseTo(outer, 3);
  });

  it('a star keeps a floor rather than a throat, and is shallower than a hole of its mass', () => {
    expect(flammWell(0, rs, 225, R)).toBeLessThan(flammWell(R, rs, 225, R));
    expect(flammWell(0, rs, 225, R)).toBeGreaterThan(flammWell(0, rs));
  });

  it('the potential is continuous at a surface and deepest at the centre', () => {
    const s = [{ x: 0, y: 0, m: 1, kind: 'star' as const, radius: 10 }];
    expect(potential(10 - 1e-6, 0, s)).toBeCloseTo(potential(10 + 1e-6, 0, s), 5);
    expect(potential(0, 0, s)).toBeCloseTo(-1.5 / 10, 9);
  });

  it('black holes without a kind behave exactly as before', () => {
    const b = [{ x: 0, y: 0, m: 2 }];
    expect(heightAt('space', 50, 0, b, 1)).toBeCloseTo(flammWell(50, 4), 10);
  });

  it('test particles and rays stop at a star surface, not at its r_s', () => {
    const star = mk(1, 0, 0, 0, 0, 1, { kind: 'star', radius: 8 });
    const out = { ax: 0, ay: 0 };
    expect(probeAcceleration(16, 0, 0, 0, [star], true, out)).toBeCloseTo(2, 6);
    expect(out.ax).toBeCloseTo(-1 / 256, 9); // no relativistic term for a star
    const world = new World();
    world.addBody(0, 0, 0, 0, 1, { kind: 'star', radius: 8 });
    world.fireRay(-60, 0, 1, 0);
    for (let i = 0; i < 200; i++) world.step(1, CFG, DEFAULT_NBODY);
    expect(world.rays[0].state).toBe('captured');
  });

  it('light still bends by 4M/b around a point mass', () => {
    expect(deflectionAngle(1, 300, 40000)).toBeCloseTo(4 / 300, 3);
  });
});

describe('collisions', () => {
  const body = (id: string, x: number, m?: number): Body => {
    const t = bodyType(id);
    return mk(x + 1, x, 0, 0, 0, m ?? (t.kind === 'bh' ? 1 : t.solarMass * SOLAR), { kind: t.kind, radius: t.radius, color: t.color, typeId: t.id });
  };

  it('two white dwarfs over the Chandrasekhar mass collapse', () => {
    const out = collisionOutcome(body('wd', 0, 0.8 * SOLAR), body('wd', 1, 0.8 * SOLAR), 1.6 * SOLAR);
    expect(out.kind).toBe('ns');
    expect(out.supernova).toBe(true);
  });

  it('two neutron stars over the maximum mass make a black hole', () => {
    expect(collisionOutcome(body('ns', 0), body('ns', 1), 2.8 * SOLAR).kind).toBe('bh');
  });

  it('a planet falling into a star leaves the star', () => {
    const list = [body('g', 0), body('earth', 2)];
    mergeBodies(list);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe('star');
    expect(list[0].radius).toBe(bodyType('g').radius);
  });

  it('only black-hole pairs use the numerical-relativity fits', () => {
    const list = [body('g', 0), body('g', 1)];
    const before = list[0].m + list[1].m;
    const events = mergeBodies(list, true);
    expect(events[0].remnant).toBeUndefined();
    expect(list[0].m).toBe(before);
  });

  it('galaxies pass through each other', () => {
    const a = mk(1, 0, 0, 0, 0, 1, { kind: 'galaxy', soft: 20, radius: 200 });
    const b = mk(2, 1, 0, 0, 0, 1, { kind: 'galaxy', soft: 20, radius: 200 });
    const list = [a, b];
    expect(mergeBodies(list)).toHaveLength(0);
    expect(list).toHaveLength(2);
  });

  it('a hole lighter than a star does not pass through it', () => {
    const list = [body('o', 0), mk(9, 20, 0, 0, 0, 1)];
    mergeBodies(list);
    expect(list).toHaveLength(1);
  });

  it('a white dwarf that takes on a giant mass ends as a black hole, not a neutron star', () => {
    expect(collisionOutcome(body('wd', 0), body('super', 1), 15.6 * SOLAR).kind).toBe('bh');
  });

  it('a star inside the tidal radius of a black hole is torn apart', () => {
    const w = new World();
    w.loadPreset(presetById('tde'));
    expect(w.bodies).toHaveLength(2);
    for (let i = 0; i < 4000 && w.bodies.length > 1; i++) w.step(0.5, CFG, DEFAULT_NBODY);
    expect(w.bodies).toHaveLength(1);
    expect(w.swarm.n).toBeGreaterThan(200);
  });
});

describe('periodic three-body orbits', () => {
  it.each([
    ['butterfly I', BUTTERFLY],
    ['moth I', MOTH],
    ['yin-yang I', YINYANG],
  ])('%s closes after one period to well within its size', (_n, o) => {
    const lambda = 45;
    const bodies = suvakov(o.p1, o.p2, lambda, 1).map((b, i) => mk(i, b.x, b.y, b.vx, b.vy, b.m));
    const err = closure(bodies, o.T * Math.pow(lambda, 1.5));
    expect(err).toBeLessThan(0.01 * lambda);
  });

  it('the Lagrange triangle keeps its shape for an orbit before instability grows', () => {
    const p = presetById('lagrange');
    const bodies = p.bodies.map((b, i) => mk(i, b.x, b.y, b.vx, b.vy, b.m));
    const L0 = Math.hypot(bodies[0].x - bodies[1].x, bodies[0].y - bodies[1].y);
    advanceBodies(bodies, 2 * Math.PI * Math.sqrt(Math.pow(90, 3) / 3), NEWTON, 0.004, 200000);
    expect(Math.hypot(bodies[0].x - bodies[1].x, bodies[0].y - bodies[1].y)).toBeCloseTo(L0, -1);
  });

  it('Trojans stay near L4 and L5 for 25 orbits', () => {
    const w = new World();
    w.loadPreset(presetById('trojans'));
    const orbit = 2 * Math.PI * Math.sqrt(Math.pow(160, 3) / w.bodies.reduce((s, b) => s + b.m, 0));
    const steps = 25 * 120;
    for (let i = 0; i < steps; i++) w.step(orbit / 120, CFG, DEFAULT_NBODY);
    const jup = w.bodies[1];
    expect(w.probes.length).toBe(80);
    let stray = 0;
    for (const p of w.probes) {
      let delta = Math.atan2(p.y, p.x) - Math.atan2(jup.y, jup.x);
      delta = Math.atan2(Math.sin(delta), Math.cos(delta));
      if (Math.abs(Math.abs(delta) - Math.PI / 3) > 1.05) stray++;
    }
    expect(stray / w.probes.length).toBeLessThan(0.2);
  }, 60000);

  it('the twin of a chaotic system separates from it', () => {
    const w = new World();
    w.loadPreset(presetById('burrau'));
    expect(w.ghost).toHaveLength(3);
    const first = w.bodies[0];
    for (let i = 0; i < 2600; i++) w.step(10, CFG, DEFAULT_NBODY);
    const twin = w.ghost[0];
    expect(Math.hypot(first.x - twin.x, first.y - twin.y)).toBeGreaterThan(1);
  }, 60000);
});

describe('planets', () => {
  it('Earth comes round in the period Kepler gives', () => {
    const w = new World();
    w.loadPreset(presetById('solar'));
    const earth = w.bodies.find((b) => b.name === 'Earth')!;
    const sun = w.bodies[0];
    const start = Math.atan2(earth.y - sun.y, earth.x - sun.x);
    const rp = Math.hypot(earth.x - sun.x, earth.y - sun.y);
    const a = rp / (1 - 0.017);
    const T = 2 * Math.PI * Math.sqrt((a * a * a) / sun.m);
    for (let i = 0; i < 400; i++) w.step(T / 400, CFG, DEFAULT_NBODY);
    let d = Math.atan2(earth.y - sun.y, earth.x - sun.x) - start;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    expect(Math.abs(d)).toBeLessThan(0.02);
  });

  it('planets keep their orbits for many years', () => {
    const w = new World();
    w.loadPreset(presetById('trappist'));
    const radii = w.bodies.slice(1).map((b) => Math.hypot(b.x - w.bodies[0].x, b.y - w.bodies[0].y));
    for (let i = 0; i < 6000; i++) w.step(40, CFG, DEFAULT_NBODY);
    expect(w.bodies).toHaveLength(8);
    w.bodies.slice(1).forEach((b, i) => {
      const r = Math.hypot(b.x - w.bodies[0].x, b.y - w.bodies[0].y);
      expect(Math.abs(r - radii[i]) / radii[i]).toBeLessThan(0.25);
    });
  }, 60000);
});

describe('Barnes-Hut tree', () => {
  it('matches direct summation to within ten per cent of the typical force', () => {
    const rand = seeded(9);
    const n = 1500;
    const x = new Float64Array(n);
    const y = new Float64Array(n);
    const m = new Float64Array(n).fill(1 / n);
    for (let i = 0; i < n; i++) {
      x[i] = rand() * 100;
      y[i] = rand() * 100;
    }
    const tree = new QuadTree();
    tree.build(x, y, m, n);
    const out = { ax: 0, ay: 0 };
    let errorSq = 0;
    let forceSq = 0;
    for (let i = 0; i < n; i += 7) {
      tree.force(x[i], y[i], i, 1, out);
      let ax = 0;
      let ay = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = x[j] - x[i];
        const dy = y[j] - y[i];
        const r2 = dx * dx + dy * dy + 1;
        const inv = m[j] / (r2 * Math.sqrt(r2));
        ax += dx * inv;
        ay += dy * inv;
      }
      errorSq += (out.ax - ax) ** 2 + (out.ay - ay) ** 2;
      forceSq += ax * ax + ay * ay;
    }
    expect(Math.sqrt(errorSq / forceSq)).toBeLessThan(0.1);
  });

  it('copes with stars at the same point', () => {
    const x = new Float64Array([5, 5, 5, 40]);
    const y = new Float64Array([5, 5, 5, 40]);
    const m = new Float64Array([1, 1, 1, 1]);
    const tree = new QuadTree();
    tree.build(x, y, m, 4);
    const out = { ax: 0, ay: 0 };
    tree.force(40, 40, 3, 1, out);
    expect(out.ax).toBeLessThan(0);
    expect(Number.isFinite(out.ax)).toBe(true);
  });
});

describe('galaxies', () => {
  it('the halo gives v² = M(r)/r and a rotation curve that flattens', () => {
    const m = 1;
    const a = 40;
    const R = 340;
    expect(haloEnclosed(m, a, R, R * 2)).toBe(m);
    const v = (r: number) => Math.sqrt(haloEnclosed(m, a, R, r) / r);
    expect(v(50)).toBeGreaterThan(v(10));
    expect(Math.abs(v(250) - v(200)) / v(200)).toBeLessThan(0.05);
    expect(v(300)).toBeLessThan(haloFlatSpeed(m, a, R) * 1.05);
    expect(v(300)).toBeGreaterThan(haloFlatSpeed(m, a, R) * 0.85);
  });

  it('a self-gravitating disk stays together, and a rotating curve is measured', () => {
    const w = new World();
    w.loadPreset(presetById('spiral'));
    const sw = w.swarm;
    expect(sw.n).toBe(6000);
    const mean = () => {
      let s = 0;
      for (let i = 0; i < sw.n; i++) s += Math.hypot(sw.x[i], sw.y[i]);
      return s / sw.n;
    };
    const r0 = mean();
    const e0 = sw.energy(w.bodies);
    // Two full turns at r = 100.
    const steps = 450;
    for (let i = 0; i < steps; i++) sw.step(sw.dt, () => w.bodies, () => undefined, 1e6);
    const curve = rotationCurve(sw, 0, 0, 170, 12);
    expect(Math.abs(mean() - r0) / r0).toBeLessThan(0.18);
    expect(Math.abs(sw.energy(w.bodies) - e0) / Math.abs(e0)).toBeLessThan(0.02);
    expect(curve.v[6]).toBeGreaterThan(0.04);
  }, 60000);

  it('without its dark halo the same disk comes apart', () => {
    const run = (halo: number): number => {
      const w = new World();
      w.loadPreset(presetById('spiral'));
      const sw = w.swarm;
      sw.haloFactor = halo;
      for (let i = 0; i < 200; i++) sw.step(sw.dt, () => w.bodies, () => undefined, 1e6);
      let s = 0;
      for (let i = 0; i < sw.n; i++) s += Math.hypot(sw.x[i], sw.y[i]);
      return s / sw.n;
    };
    expect(run(0)).toBeGreaterThan(1.3 * run(1));
  }, 60000);

  it('friction slows a passing pair, keeps momentum, and acts only inside the halos', () => {
    const a = mk(1, -30, 0, 0.1, 0, 1, { kind: 'galaxy', soft: 28, radius: 210 });
    const b = mk(2, 30, 0, -0.05, 0, 2, { kind: 'galaxy', soft: 28, radius: 210 });
    addDynamicalFriction([a, b]);
    expect(a.ax).toBeLessThan(0);
    expect(b.ax).toBeGreaterThan(0);
    expect(a.m * a.ax + b.m * b.ax).toBeCloseTo(0, 12);
    const far = [mk(1, -500, 0, 0.1, 0, 1, { kind: 'galaxy', soft: 28, radius: 210 }), mk(2, 500, 0, -0.1, 0, 1, { kind: 'galaxy', soft: 28, radius: 210 })];
    addDynamicalFriction(far);
    expect(far[0].ax).toBe(0);
  });

  it('colliding galaxies raise tidal tails and sink together', () => {
    const w = new World();
    w.loadPreset(presetById('antennae'));
    const [a, b] = w.bodies;
    const sep = () => Math.hypot(a.x - b.x, a.y - b.y);
    const s0 = sep();
    let closest = s0;
    for (let i = 0; i < 700; i++) {
      w.swarm.step(w.swarm.dt, () => w.bodies, (h) => advanceBodies(w.bodies, h, DEFAULT_NBODY, 0.01, 900), 1e6);
      closest = Math.min(closest, sep());
    }
    expect(closest).toBeLessThan(90);
    let far = 0;
    for (let i = 0; i < w.swarm.n; i++) if (Math.hypot(w.swarm.x[i] - a.x, w.swarm.y[i] - a.y) > 180 && Math.hypot(w.swarm.x[i] - b.x, w.swarm.y[i] - b.y) > 180) far++;
    expect(far / w.swarm.n).toBeGreaterThan(0.02);
    expect(totalEnergy([a, b], 0.05)).toBeLessThan(0);
  }, 60000);

  it('a galaxy falls at the same rate as its own stars', () => {
    const host = mk(1, 0, 0, 0, 0, 1, { kind: 'galaxy', soft: 34, radius: 300 });
    const sat = mk(2, 150, 0, 0, 0, 0.05, { kind: 'galaxy', soft: 9, radius: 44 });
    const sw = new Swarm();
    const out = { ax: 0, ay: 0 };
    sw.bodyPull(150, 0, [host], out);
    computeAccelerations([host, sat], 0.05);
    expect(sat.ax).toBeCloseTo(out.ax, 10);
  });

  it('a placed galaxy moves every frame at the default speed, and takes its stars when deleted', () => {
    const w = new World();
    const g = w.spawnGalaxy(0, 0, 0, 0)!;
    w.step(1, CFG, DEFAULT_NBODY);
    expect(w.simTime).toBeCloseTo(1, 6);
    expect(w.swarm.n).toBe(2500);
    w.addBody(400, 0, 0, 0, 1);
    w.removeBody(g.id);
    expect(w.swarm.n).toBe(0);
  });

  it('a mass placed on a circular orbit inside a galaxy stays near its radius', () => {
    const w = new World();
    w.spawnGalaxy(0, 0, 0, 0);
    const [vx, vy] = w.autoVelocity(100, 0, 1e-6, false);
    const b = w.addBody(100, 0, vx, vy, 1e-6, { kind: 'planet', radius: 1 })!;
    let low = Infinity;
    for (let i = 0; i < 500; i++) {
      w.step(20, CFG, DEFAULT_NBODY);
      low = Math.min(low, Math.hypot(b.x, b.y));
    }
    expect(low).toBeGreaterThan(80);
  });

  it('unequal galaxies conserve momentum', () => {
    const list = [mk(1, 0, 0, 0, 0, 1, { kind: 'galaxy', soft: 34, radius: 300 }), mk(2, 150, 40, 0, 0.05, 0.05, { kind: 'galaxy', soft: 9, radius: 44 })];
    computeAccelerations(list, 0.05);
    expect(list[0].m * list[0].ax + list[1].m * list[1].ax).toBeCloseTo(0, 12);
    expect(list[0].m * list[0].ay + list[1].m * list[1].ay).toBeCloseTo(0, 12);
  });

  it('a disk spawned around a moving host moves with it', () => {
    const sw = new Swarm();
    const host = mk(1, 0, 0, 0.1, 0, 1, { kind: 'galaxy', soft: 20, radius: 200 });
    spawnDisk(sw, host, { count: 500, scale: 20, edge: 90, mass: 0, q: 1.3, sense: 1, seed: 1 }, [host]);
    let vx = 0;
    for (let i = 0; i < sw.n; i++) vx += sw.vx[i];
    expect(vx / sw.n).toBeCloseTo(0.1, 2);
  });
});

describe('scenes', () => {
  it('every scene runs for a while without a non-finite value', () => {
    for (const p of PRESETS) {
      const w = new World();
      w.loadPreset(p);
      const cfg = { gr: p.settings.gr ?? true, gw: p.settings.gw ?? false, pn: p.settings.pn ?? true };
      for (let i = 0; i < 12; i++) w.step(p.settings.timeScale / 60, cfg, DEFAULT_NBODY);
      for (const b of w.bodies) expect(Number.isFinite(b.x + b.y + b.vx + b.vy), p.id).toBe(true);
      for (let i = 0; i < w.swarm.n; i++) expect(Number.isFinite(w.swarm.x[i] + w.swarm.y[i]), p.id).toBe(true);
      computeAccelerations(w.bodies, 0.05);
      expect(Number.isFinite(totalMomentum(w.bodies).px), p.id).toBe(true);
    }
  }, 60000);

  it('every scene has a group, and surprise scenes are valid across many seeds', () => {
    for (const p of PRESETS) expect(p.group).toBeTruthy();
    for (let seed = 0; seed < 60; seed++) {
      const p = surpriseScene(seed);
      const w = new World();
      w.loadPreset(p);
      for (let i = 0; i < 30; i++) w.step(p.settings.timeScale / 60, CFG, DEFAULT_NBODY);
      expect(w.bodies.length).toBeGreaterThan(0);
      for (const b of w.bodies) expect(Number.isFinite(b.x), `seed ${seed}`).toBe(true);
    }
  }, 60000);
});
