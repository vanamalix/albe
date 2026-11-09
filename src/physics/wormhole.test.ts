import { describe, expect, it } from 'vitest';
import {
  crossingSweep,
  ellipticK,
  ellisEmbed,
  ellisGaussK,
  ellisJupiters,
  ellisMatter,
  ellisRadius,
  ellisTide,
  ellisTotalEnergy,
  ellisZ,
  reflectDeflection,
  reflectSweep,
  traceWormhole,
  wormholeFate,
} from './wormhole';

const b = 1;

describe('Ellis wormhole geometry', () => {
  it('computes K(k) by AGM', () => {
    expect(ellipticK(0)).toBeCloseTo(Math.PI / 2, 12);
    expect(ellipticK(0.5)).toBeCloseTo(1.6857503548125961, 12);
  });

  it('embeds with l as true proper distance (a catenoid)', () => {
    for (const l of [-7, -1, -0.1, 0, 0.4, 3, 40]) {
      const e = 1e-5;
      const dr = (ellisRadius(l + e, b) - ellisRadius(l - e, b)) / (2 * e);
      const dz = (ellisZ(l + e, b) - ellisZ(l - e, b)) / (2 * e);
      expect(dr * dr + dz * dz).toBeCloseTo(1, 8);
      expect(ellisZ(-l, b)).toBeCloseTo(-ellisZ(l, b), 12);
    }
    const [x, y, z] = ellisEmbed(0, 1.2, 3);
    expect(Math.hypot(x, y)).toBeCloseTo(3, 12);
    expect(z).toBeCloseTo(0, 12);
    expect(ellisGaussK(0, 2)).toBeCloseTo(-1 / 4, 12);
  });

  it('requires negative energy, and the amount is exactly −πb/2', () => {
    let total = 0;
    const n = 2_000_000;
    const lim = 4000;
    const dl = (2 * lim) / n;
    for (let i = 0; i < n; i++) {
      const l = -lim + (i + 0.5) * dl;
      const r = ellisRadius(l, b);
      total += ellisMatter(l, b).rho * 4 * Math.PI * r * r * dl;
    }
    // The tails beyond |l| = lim contribute −b²/(2l) each.
    total += -(b * b) / lim;
    expect(total).toBeCloseTo(ellisTotalEnergy(b), 6);
    expect(ellisMatter(0, b).nec).toBeLessThan(0);
    expect(ellisMatter(50, b).nec).toBeLessThan(0);
    expect(ellisJupiters(1)).toBeCloseTo(1.11, 1);
  });

  it('has no tide for a static observer, and γ²v²/b² at the throat for a moving one', () => {
    expect(ellisTide(0, 2, 0)).toBe(0);
    const v = 0.6;
    expect(ellisTide(0, 2, v)).toBeCloseTo((v * v) / (1 - v * v) / 4, 12);
  });
});

describe('Ellis wormhole geodesics', () => {
  const far = 1000;
  // The sweep from −L to L is short of the sweep from −∞ to ∞ by the two tails, 2 h/L to leading order.
  const tail = (h: number, L: number) => (2 * h) / L;

  it('sends |h| < b through to the other side, by the exact sweep', () => {
    for (const k of [0, 0.3, 0.7, 0.95]) {
      const ray = traceWormhole(b, k * b, far, 0, far, { rel: 0.002, maxPoints: 200000 });
      const last = ray.l.length - 1;
      expect(ray.fate).toBe(k === 1 ? 'ring' : 'cross');
      expect(ray.l[last]).toBeLessThan(-far * 0.99);
      expect(ray.phi[last]).toBeCloseTo(crossingSweep(k * b, b) - tail(k * b, far), 4);
    }
  });

  it('turns |h| > b back, by the exact sweep, at |l| = √(h² − b²)', () => {
    for (const k of [1.2, 3, 10]) {
      const h = k * b;
      const ray = traceWormhole(b, h, far, 0, far, { rel: 0.002, maxPoints: 200000 });
      const last = ray.l.length - 1;
      expect(ray.fate).toBe('reflect');
      expect(ray.l[last]).toBeGreaterThan(far * 0.99);
      const lMin = Math.min(...ray.l);
      expect(lMin).toBeCloseTo(Math.sqrt(h * h - b * b), 3);
      expect(ray.phi[last]).toBeCloseTo(reflectSweep(h, b) - tail(h, far), 4);
    }
  });

  it('matches the weak-field deflection πb²/(4h²)', () => {
    const h = 40;
    // The next term of K's expansion, 9πk⁴/64, is included so the comparison is tight.
    const k2 = (b * b) / (h * h);
    expect(reflectDeflection(h, b)).toBeCloseTo(Math.PI * (k2 / 4 + (9 * k2 * k2) / 64), 9);
  });

  it('keeps the constraint l′² + h²/(l² + b²) = 1', () => {
    const h = 0.8;
    const ray = traceWormhole(b, h, 30, 0.3, 30, { rel: 0.005 });
    for (let i = 1; i < ray.l.length - 1; i += 7) {
      const l = ray.l[i];
      const dl = (ray.l[i + 1] - ray.l[i - 1]) / (ray.s[i + 1] - ray.s[i - 1]);
      expect(dl * dl + (h * h) / (l * l + b * b)).toBeCloseTo(1, 2);
    }
  });

  it('classifies the critical ring and passes a radial ray straight through', () => {
    expect(wormholeFate(1, 1)).toBe('ring');
    expect(wormholeFate(0.5, 1)).toBe('cross');
    expect(wormholeFate(2, 1)).toBe('reflect');
    const ray = traceWormhole(b, 0, 20, 1.1, 20);
    expect(ray.l[ray.l.length - 1]).toBeLessThan(-19);
    expect(ray.phi[ray.phi.length - 1]).toBeCloseTo(1.1, 12);
  });
});
