import { describe, expect, it } from 'vitest';
import {
  circularOrbit,
  criticalImpact,
  delta,
  embeddingTable,
  extractable,
  gPhiPhi,
  lapseKerr,
  omega,
  omegaRange,
  penroseDecay,
  penroseMaxGain,
  radialR,
  rho,
  restEnergy,
  rIsco,
  rMarginallyBound,
  rPhoton,
  rPlus,
  traceKerr,
  turningL,
} from './kerr';

const dR = (r: number, a: number, E: number, L: number, k: number) => (radialR(r + 1e-5, a, E, L, k) - radialR(r - 1e-5, a, E, L, k)) / 2e-5;

describe('Kerr equatorial geometry', () => {
  it('has the right horizons, orbits and ISCO', () => {
    expect(rPlus(0)).toBe(2);
    expect(rPlus(1)).toBe(1);
    expect(rIsco(0, 1)).toBeCloseTo(6, 10);
    expect(rIsco(1, 1)).toBeCloseTo(1, 6);
    expect(rIsco(1, -1)).toBeCloseTo(9, 10);
    expect(rPhoton(0, 1)).toBeCloseTo(3, 10);
    expect(rPhoton(1, 1)).toBeCloseTo(1, 6);
    expect(rPhoton(1, -1)).toBeCloseTo(4, 10);
    // BPT values at a = 0.9.
    expect(rIsco(0.9, 1)).toBeCloseTo(2.32088, 4);
    expect(rIsco(0.9, -1)).toBeCloseTo(8.71735, 4);
  });

  it('agrees with R = R′ = 0 at the photon orbits and the critical impact parameters', () => {
    for (const a of [0.1, 0.5, 0.9, 0.998]) {
      for (const dir of [1, -1] as const) {
        const r = rPhoton(a, dir);
        const b = criticalImpact(a, dir);
        expect(radialR(r, a, 1, b, 0)).toBeCloseTo(0, 6);
        expect(dR(r, a, 1, b, 0)).toBeCloseTo(0, 4);
        expect(Math.sign(b)).toBe(dir);
      }
    }
    expect(criticalImpact(0, 1)).toBeCloseTo(3 * Math.sqrt(3), 10);
    expect(criticalImpact(1, 1)).toBeCloseTo(2, 3);
    expect(criticalImpact(1, -1)).toBeCloseTo(-7, 3);
  });

  it('has ω equal to the horizon rate at r₊, and a horizon circumference of 4πM at any spin', () => {
    for (const a of [0.2, 0.7, 0.99]) {
      const rp = rPlus(a);
      expect(omega(rp, a)).toBeCloseTo(a / (2 * rp), 10);
      expect(rho(rp, a)).toBeCloseTo(2, 10);
    }
  });

  it('makes co-rotation compulsory inside the ergosphere and only there', () => {
    const a = 0.9;
    expect(omegaRange(2, a).min).toBeCloseTo(0, 10);
    expect(omegaRange(1.7, a).min).toBeGreaterThan(0);
    expect(omegaRange(2.5, a).min).toBeLessThan(0);
    // Static limit: g_tt = 0 at r = 2 means α = ω ρ there.
    expect(lapseKerr(2, a)).toBeCloseTo(omega(2, a) * Math.sqrt(gPhiPhi(2, a)), 10);
  });

  it('builds a real embedding, reproducing Flamm at a = 0', () => {
    const t = embeddingTable(0, 100);
    for (const r of [2.5, 6, 20, 90]) expect(t.zAt(r)).toBeCloseTo(2 * Math.sqrt(2 * (r - 2)), 2);
    for (const a of [0, 0.3, 0.6, 0.9, 0.99, 0.998]) {
      const rp = rPlus(a);
      for (let r = rp * 1.0001; r < 200; r *= 1.003) {
        const rhoV = rho(r, a);
        const drho = (r - (a * a) / (r * r)) / rhoV;
        expect((r * r) / delta(r, a) - drho * drho).toBeGreaterThan(0);
      }
    }
  });

  it('gives circular orbits R = R′ = 0', () => {
    for (const a of [0, 0.5, 0.9]) {
      for (const dir of [1, -1] as const) {
        const r = rIsco(a, dir) * 1.5;
        const { E, L } = circularOrbit(r, a, dir);
        expect(radialR(r, a, E, L, 1)).toBeCloseTo(0, 5);
        expect(dR(r, a, E, L, 1)).toBeCloseTo(0, 3);
      }
    }
  });
});

describe('Kerr geodesics', () => {
  it('drags a zero-angular-momentum particle at exactly ω, and it reaches the horizon finitely', () => {
    const a = 0.9;
    const r0 = 15;
    const E = restEnergy(r0, a);
    const path = traceKerr(a, E, 0, 1, r0, 0, false);
    expect(path.fate).toBe('horizon');
    const last = path.r.length - 1;
    // The Boyer-Lindquist azimuth winds up prograde; the ingoing one stays finite but is a different coordinate.
    expect(path.phiBL[last]).toBeGreaterThan(1);
    expect(Math.abs(path.phi[last])).toBeLessThan(10);
    expect(path.tau[last]).toBeGreaterThan(10);
    expect(path.t[last]).toBeLessThan(2000);
    // With L = 0 the Boyer-Lindquist rate dφ/dt is ω, at every radius.
    for (const i of [Math.floor(last * 0.3), Math.floor(last * 0.6), Math.floor(last * 0.85)]) {
      const r = path.r[i];
      const dPhi = path.phiBL[i + 1] - path.phiBL[i - 1];
      const dTBL = blTime(path, i, a);
      expect(dPhi / dTBL).toBeCloseTo(omega(r, a), 3);
    }
  });

  it('turns a retrograde particle round: it co-rotates by the time it is near the horizon', () => {
    const a = 0.95;
    const path = traceKerr(a, 1, -2.5, 1, 40, 0, false, { maxPoints: 20000 });
    expect(path.fate).toBe('horizon');
    const i = path.phiBL.findIndex((_, k) => k > 0 && path.phiBL[k] > path.phiBL[k - 1]);
    expect(i).toBeGreaterThan(0);
    expect(path.r[i]).toBeGreaterThan(rPlus(a));
    expect(path.r[i]).toBeLessThan(4);
  });

  it('holds a circular orbit and conserves the radial integral', () => {
    const a = 0.7;
    const r = 8;
    const { E, L } = circularOrbit(r, a, 1);
    const path = traceKerr(a, E, L, 1, r, 0, true, { maxPoints: 12000 });
    expect(Math.max(...path.r) - Math.min(...path.r)).toBeLessThan(1e-3);
  });

  it('captures photons between the critical impact parameters and frees the rest', () => {
    const a = 0.9;
    const inside = [criticalImpact(a, -1) * 0.98, criticalImpact(a, 1) * 0.98];
    const outside = [criticalImpact(a, -1) * 1.02, criticalImpact(a, 1) * 1.02];
    for (const b of inside) expect(traceKerr(a, 1, b, 0, 60, 0, false, { maxPoints: 40000 }).fate).toBe('horizon');
    for (const b of outside) expect(traceKerr(a, 1, b, 0, 60, 0, false, { maxPoints: 40000 }).fate).toBe('escape');
  });
});

describe('Penrose process', () => {
  it('finds a turning point with R = 0 and conserves four-momentum', () => {
    for (const a of [0.86, 0.9, 0.99]) {
      const r = 0.5 * (rMarginallyBound(a) + 2);
      const L0 = turningL(r, a);
      expect(L0).not.toBeNull();
      expect(radialR(r, a, 1, L0!, 1)).toBeCloseTo(0, 9);
      const event = penroseDecay(r, a)!;
      expect(event.out.E + event.captured.E).toBeCloseTo(1, 10);
      expect(event.out.L + event.captured.L).toBeCloseTo(event.L0, 10);
      // Each fragment is null, tangential, at r: R = 0 for each.
      expect(radialR(r, a, event.out.E, event.out.L, 0)).toBeCloseTo(0, 8);
      expect(radialR(r, a, event.captured.E, event.captured.L, 0)).toBeCloseTo(0, 8);
    }
  });

  it('gives one fragment negative energy, which falls in, and the other more than the parent, which escapes', () => {
    const a = 0.99;
    const r = 1.5;
    const event = penroseDecay(r, a)!;
    expect(event.captured.E).toBeLessThan(0);
    expect(event.out.E).toBeGreaterThan(1);
    expect(event.gain).toBeGreaterThan(0);
    expect(traceKerr(a, event.out.E, event.out.L, 0, r, 0, true, { maxPoints: 20000 }).fate).toBe('escape');
    expect(traceKerr(a, event.captured.E, event.captured.L, 0, r, 0, false, { maxPoints: 20000 }).fate).toBe('horizon');
  });

  it('approaches the classic 20.7% near extremality and never exceeds the ceiling', () => {
    const a = 1 - 1e-9;
    const e = penroseDecay(rMarginallyBound(a) * (1 + 1e-6), a)!;
    expect(e.gain).toBeCloseTo((Math.SQRT2 - 1) / 2, 2);
    for (const spin of [0.86, 0.9, 0.99]) {
      for (let r = rMarginallyBound(spin) * 1.001; r < 2; r += 0.05) {
        expect(penroseDecay(r, spin)!.gain).toBeLessThanOrEqual(penroseMaxGain(spin) + 1e-9);
      }
    }
  });

  it('caps the rotational energy at 29% of the mass', () => {
    expect(extractable(1)).toBeCloseTo(1 - Math.SQRT1_2, 10);
    expect(extractable(0)).toBeCloseTo(0, 10);
  });
});

function blTime(path: ReturnType<typeof traceKerr>, i: number, a: number): number {
  // dt_BL from the Kerr-Schild time: t_BL = t_KS − ∫2r/Δ dr.
  const dr = path.r[i + 1] - path.r[i - 1];
  const r = path.r[i];
  return path.t[i + 1] - path.t[i - 1] - (2 * r * dr) / delta(r, a);
}
