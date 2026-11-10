import { describe, expect, it } from 'vitest';
import { balancedPair, extremalCritical, fateChanges, potentialU, scanMP, traceMP, type Hole } from './majumdar';

/** Bisect the capture edge in b for a single hole of mass m. */
function criticalB(holes: Hole[], lo: number, hi: number): number {
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (traceMP(holes, mid, { eta: 0.01 }).fate.kind === 'capture') lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

describe('Majumdar-Papapetrou: two balanced extremal holes', () => {
  it('U solves Laplace’s equation away from the holes, so adding the holes is exact', () => {
    const holes = balancedPair(3);
    const h = 1e-3;
    for (const [x, y] of [
      [2, 1],
      [-0.7, 0.4],
      [5, -3],
    ]) {
      const lap = (potentialU(holes, x + h, y) + potentialU(holes, x - h, y) + potentialU(holes, x, y + h) + potentialU(holes, x, y - h) - 4 * potentialU(holes, x, y)) / (h * h);
      // In the plane z = 0 the 3D Laplacian adds ∂²U/∂z² = −Σ M/r³, which the 2D sum lacks.
      const zz = -holes.reduce((a, q) => a + q.m / Math.hypot(x - q.x, y - q.y) ** 3, 0);
      expect(lap + zz).toBeCloseTo(0, 4);
    }
  });

  it('one hole is extremal Reissner-Nordström: rays are captured below b = 4M', () => {
    expect(criticalB([{ x: 0, y: 0, m: 1 }], 2, 6)).toBeCloseTo(extremalCritical(1), 3);
    expect(criticalB([{ x: 0, y: 0, m: 2.5 }], 5, 15)).toBeCloseTo(extremalCritical(2.5), 2);
  });

  it('two holes at zero separation act as one of the total mass: b_c = 8M for M = 1 each', () => {
    expect(criticalB(balancedPair(1e-9), 4, 12)).toBeCloseTo(8, 2);
  });

  it('far rays bend by the weak-field 4M_total/b toward the pair', () => {
    const r = traceMP(balancedPair(2), 120, { eta: 0.01 });
    expect(r.fate.kind).toBe('escape');
    if (r.fate.kind === 'escape') {
      // Deflection toward the holes (downward for b > 0); the start and end at 200M_total leave out about 2M/(200M) each side.
      expect(-r.fate.angle / (8 / 120)).toBeGreaterThan(0.95);
      expect(-r.fate.angle / (8 / 120)).toBeLessThan(1.05);
    }
  });

  it('scattering is chaotic: zooming into a fate boundary keeps finding new changes of fate', () => {
    const holes = balancedPair(2);
    const wide = scanMP(holes, 0, 6, 240, 0.02);
    // Find a narrow window that holds a change of fate, then zoom into it.
    let i = wide.findIndex((p, k) => k > 0 && (p.fate.kind !== wide[k - 1].fate.kind || (p.fate.kind === 'capture' && wide[k - 1].fate.kind === 'capture' && p.fate.hole !== (wide[k - 1].fate as { hole: number }).hole)));
    expect(i).toBeGreaterThan(0);
    const step = wide[1].b - wide[0].b;
    let lo = wide[i - 1].b;
    let hi = wide[i].b;
    let total = 0;
    for (let level = 0; level < 2; level++) {
      const zoom = scanMP(holes, lo, hi, 80, 0.02);
      const n = fateChanges(zoom);
      total += n;
      expect(n).toBeGreaterThan(0);
      i = zoom.findIndex((p, k) => k > 0 && p.fate.kind !== zoom[k - 1].fate.kind);
      if (i <= 0) break;
      lo = zoom[i - 1].b;
      hi = zoom[i].b;
    }
    expect(total).toBeGreaterThan(1);
    expect(step).toBeGreaterThan(0);
    // Most samples agree between the two step sizes; the rest are flagged, not hidden.
    expect(wide.filter((p) => p.resolved).length / wide.length).toBeGreaterThan(0.9);
  });

  it('a ray aimed straight between equal holes passes through undeflected, by symmetry', () => {
    const r = traceMP(balancedPair(4), 0, { eta: 0.01 });
    expect(r.fate.kind).toBe('escape');
    if (r.fate.kind === 'escape') expect(Math.abs(r.fate.angle)).toBeLessThan(1e-9);
  });
});
