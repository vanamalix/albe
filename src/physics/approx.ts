/**
 * "Why is this approximate?" chips: each appears only while its approximation is on screen, says
 * what is left out at the chosen depth, and at Equation depth states the neglected order, the source
 * of the formula and a live estimate of the error. Every number is computed from the state passed in.
 */
import { bodyType, trueLimbArcsec } from './bodies';
import { kretschmann, type ViewMode } from './fields';
import { nonlinearEstimate, occlusionRadius, schwarzschildDeflection } from './lens';
import { properTimeBetween } from './measure';
import { isCompact, type Body } from './types';
import type { Depth } from '../state/depth';

export type ChipId = 'lens-sum' | 'removal' | 'cap' | 'tidal-sum' | 'compressed';

/** A particle removed at the horizon (see World.lastCapture). */
export interface CaptureFact {
  r: number;
  m: number;
  t: number;
  tau: number;
  E2: number;
  L2: number;
  gr: boolean;
}

export interface ChipContext {
  mode: ViewMode;
  bodies: readonly Body[];
  /** The 1PN cap limited a pair in the last step. */
  capActive: boolean;
  /** A relativistic particle removed at a horizon recently enough to still be on the viewer's mind. */
  capture: CaptureFact | null;
}

export interface ChipText {
  label: string;
  body: string;
  eq?: string;
  order?: string;
  source?: string;
  error?: string;
}

const pct = (x: number) => (x >= 0.1 ? `${(x * 100).toFixed(0)}%` : x >= 0.001 ? `${(x * 100).toFixed(1)}%` : `${(x * 100).toExponential(1)}%`);
const deg = (r: number) => (r * 180) / Math.PI;
const curvedViews: ViewMode[] = ['space', 'time', 'tidal', 'lens'];

/** The compressed body with the largest drawn limb bending, and its true value when known. */
export function compressedLimb(bodies: readonly Body[]): { body: Body; drawnDeg: number; trueArcsec: number | null } | null {
  let best: { body: Body; drawnDeg: number; trueArcsec: number | null } | null = null;
  for (const b of bodies) {
    if (b.kind !== 'star' && b.kind !== 'planet' && b.kind !== 'wd') continue;
    const R = occlusionRadius(b);
    const drawnDeg = deg(schwarzschildDeflection(R, b.m));
    if (!Number.isFinite(drawnDeg) || (best && best.drawnDeg >= drawnDeg)) continue;
    const t = b.typeId ? bodyType(b.typeId) : null;
    const trueArcsec = t?.solarRadius ? trueLimbArcsec(t.solarMass, t.solarRadius) : null;
    best = { body: b, drawnDeg, trueArcsec };
  }
  return best;
}

/** K at the midpoint of the two heaviest masses, against the sum of their separate K values there. */
export function tidalInterference(bodies: readonly Body[]): { together: number; summed: number; d: number; a: Body; b: Body } | null {
  const sorted = bodies.filter((b) => b.kind !== 'galaxy').sort((p, q) => q.m - p.m);
  if (sorted.length < 2) return null;
  const [a, b] = sorted;
  const x = (a.x + b.x) / 2;
  const y = (a.y + b.y) / 2;
  return { together: kretschmann(x, y, [a, b]), summed: kretschmann(x, y, [a]) + kretschmann(x, y, [b]), d: Math.hypot(a.x - b.x, a.y - b.y), a, b };
}

/** The closest compact pair: separation over total mass. */
export function closestCompactPair(bodies: readonly Body[]): { r: number; M: number } | null {
  let best: { r: number; M: number } | null = null;
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const p = bodies[i];
      const q = bodies[j];
      if (!isCompact(p) || !isCompact(q)) continue;
      const r = Math.hypot(p.x - q.x, p.y - q.y);
      const M = p.m + q.m;
      if (!best || r / M < best.r / best.M) best = { r, M };
    }
  }
  return best;
}

export function activeChips(ctx: ChipContext): ChipId[] {
  const out: ChipId[] = [];
  const solid = ctx.bodies.filter((b) => b.kind !== 'galaxy');
  if (ctx.mode === 'lens' && ctx.bodies.length >= 2) out.push('lens-sum');
  if (ctx.capture?.gr) out.push('removal');
  if (ctx.capActive) out.push('cap');
  if (ctx.mode === 'tidal' && solid.length >= 2) out.push('tidal-sum');
  if (curvedViews.includes(ctx.mode) && compressedLimb(ctx.bodies)) out.push('compressed');
  return out;
}

const fastest = (bodies: readonly Body[]) => bodies.reduce((v, b) => Math.max(v, b.vx * b.vx + b.vy * b.vy), 0);

export function chipText(id: ChipId, depth: Depth, ctx: ChipContext): ChipText {
  switch (id) {
    case 'lens-sum': {
      const md = nonlinearEstimate(ctx.bodies);
      const t: ChipText = { label: 'Lens: angles added', body: 'Each mass bends light by its exact one-mass angle, and the angles are added. How the masses change each other’s field is left out.' };
      if (depth === 'numbers') t.body = `The largest M/d between two masses here is ${pct(md)}: roughly the share of the bending left out.`;
      if (depth === 'equation') {
        t.body = 'Each mass contributes its exact Schwarzschild α̂(b); the deflections are summed as vectors in one thin lens plane.';
        t.eq = 'α = Σᵢ α̂(bᵢ) b̂ᵢ';
        t.order = 'Drops the mass-mass nonlinearity, relative order M/d, and the masses’ motion, order v.';
        t.source = 'Darwin (1959) for α̂(b); the summed thin lens of Schneider, Ehlers & Falco (1992).';
        t.error = `About M/d = ${pct(md)} of the bending, for the closest pair here.`;
      }
      return t;
    }
    case 'removal': {
      const c = ctx.capture!;
      const left = properTimeBetween(c.m, 2 * c.m, c.r, c.E2, c.L2);
      const t: ChipText = { label: 'Particle removed at 2.04M', body: 'That particle was taken off just outside the horizon. Its own clock would have crossed a moment later; a distant observer would never see it cross.' };
      if (depth === 'numbers') t.body = `Removed at r = ${(c.r / c.m).toFixed(3)}M after ${c.tau.toFixed(1)} of its own time (${c.t.toFixed(1)} distant). It needed ${left.toFixed(3)} more, ${(left / c.m).toFixed(3)}M, to reach r = 2M.`;
      if (depth === 'equation') {
        t.body = 'The geodesic is integrated exactly and stopped at the first step inside r = 1.02 r_s, because distant time diverges there.';
        t.eq = 'Δτ = ∫ dr / √(E² − (1 − 2M/r)(1 + L²/r²)),  t ≈ −2M ln(r/2M − 1)';
        t.order = 'No series is truncated: the worldline is cut. What is lost is the last stretch to the horizon.';
        t.source = 'Schwarzschild geodesics; radial infall in Misner, Thorne & Wheeler (1973) §31.4.';
        t.error = `Δτ = ${left.toFixed(3)} (${(left / c.m).toFixed(3)}M), ${pct(left / Math.max(c.tau, 1e-9))} of the clock’s total.`;
      }
      return t;
    }
    case 'cap': {
      const pair = closestCompactPair(ctx.bodies);
      const x = pair ? pair.M / pair.r : NaN;
      const t: ChipText = { label: '1PN capped: no plunge', body: 'The masses are so close that the relativistic correction is held at half of Newton’s pull. Real black holes would plunge; these spiral in smoothly.' };
      if (depth === 'numbers') t.body = pair ? `Separation ${(pair.r / pair.M).toFixed(1)}M (total mass), so M/r = ${x.toFixed(3)}. The cap first acts near 7.2M, and below 6M there is no ISCO here.` : t.body;
      if (depth === 'equation') {
        t.body = 'Einstein-Infeld-Hoffmann 1PN plus 2.5PN radiation reaction, with each pair’s 1PN term limited in size.';
        t.eq = '|a₁PN| ≤ ½ M/r²';
        t.order = 'The next conservative order is O((M/r)²); here 1PN itself exceeds half of Newton, so the series has failed, not just been truncated.';
        t.source = 'Einstein, Infeld & Hoffmann (1938); Blanchet (2014), Living Rev. Relativ. 17, 2.';
        t.error = pair ? `Order one in phase near merger. (M/r)² = ${(x * x).toFixed(3)} at this separation.` : 'Order one in phase near merger.';
      }
      return t;
    }
    case 'tidal-sum': {
      const ti = tidalInterference(ctx.bodies)!;
      const md = Math.max(ti.a.m, ti.b.m) / Math.max(ti.d, 1e-9);
      const v2 = fastest(ctx.bodies);
      const t: ChipText = { label: 'Tides added as tensors', body: 'Each mass’s stretch and squeeze is added before squaring, so tides from two masses reinforce or cancel. The masses’ effect on each other is left out.' };
      if (depth === 'numbers') t.body = `Midway between the two heaviest masses K is ${(ti.together / ti.summed).toFixed(2)}× what adding their separate K values would give.`;
      if (depth === 'equation') {
        t.body = 'The electric parts of the Weyl tensor are summed, then K is formed from the sum.';
        t.eq = 'K = 8(E_ijE^ij − B_ijB^ij) ≈ 8 E_ijE^ij,  E = Σ_a E_a';
        t.order = 'Linear in each E: drops relative O(M/d). Static: drops the magnetic part B_ij, relative O(v²).';
        t.source = 'Vacuum Kretschmann decomposition; tendex picture of Nichols et al. (2011).';
        t.error = `M/d = ${pct(md)}, v² = ${pct(v2)} for the fastest mass.`;
      }
      return t;
    }
    case 'compressed': {
      const c = compressedLimb(ctx.bodies)!;
      const name = c.body.name ?? 'star';
      const truth = c.trueArcsec !== null ? `${c.trueArcsec.toFixed(c.trueArcsec < 10 ? 2 : 0)}″` : null;
      const t: ChipText = { label: 'Sizes compressed', body: 'Stars and planets are drawn far bigger than life and much denser in M/r than real ones, so bending and depth near them are exaggerated.' };
      if (depth === 'numbers') t.body = `The ${name} here bends light by ${c.drawnDeg.toFixed(1)}° at its drawn limb${truth ? `; at its true size, ${truth}` : ''}.`;
      if (depth === 'equation') {
        t.body = 'The drawn radius is a display choice, R = 6 (R/R☉)^0.35 scene units, kept clear of r_s; the exterior formulas are then applied at that radius.';
        t.eq = 'α̂_limb = α̂(R/√(1 − 2M/R)) → 4M/R for M ≪ R';
        t.order = 'Not an expansion: the input radius is wrong by design.';
        t.source = 'True radii from Pecaut & Mamajek (2013); GM☉/c² = 1476.6 m and R☉ = 6.957×10⁸ m (IAU 2015).';
        t.error = c.trueArcsec !== null ? `Limb bending about ${Math.round((c.drawnDeg * 3600) / c.trueArcsec / 100) * 100}× too large here.` : 'Bending near it is far too large; its true radius is not catalogued here.';
      }
      return t;
    }
  }
}
