/** Kerr shadow, microlensing, FRW universes and Oppenheimer-Snyder collapse, against closed forms. */
import { describe, expect, it } from 'vitest';
import { apparentHorizonChi, eventHorizonChi, etaAtTau, kruskalChart, massInside, radiiAt, scaleFactor, shellRadius, star, surfaceRadius, tauOf } from './collapse';
import { ageAt, comovingDistance, conformalAt, E2, hasBigBang, history, hubbleTimeGyr, omegaRadiation, planck2018, recession, superluminalRedshift, type Cosmos } from './cosmology';
import { criticalImpact, delta } from './kerr';
import { fallWorldline } from './kruskal';
import { binary, binaryImages, binaryMagnification, closestApproach, criticalAndCaustic, lensEquation, lightCurve, mapAt, pointImages, pointMagnification, shootMap, type C } from './microlens';
import { FRW_DEFAULTS } from '../state/exhibit';
import { beta2, criticalCurve, etaOf, lyapunov, SCHWARZSCHILD_SHADOW_RADIUS, shadowSize, visibleRadii, xiOf } from './shadow';

const DEG = Math.PI / 180;

describe('Kerr critical curve (Bardeen)', () => {
  it('a → 0: a circle of radius 3√3 M, at any inclination', () => {
    for (const i of [17 * DEG, 60 * DEG, 90 * DEG]) {
      const c = criticalCurve(0.002, i);
      for (const p of c) expect(Math.hypot(p.alpha - shadowSize(c).shift, p.beta)).toBeCloseTo(SCHWARZSCHILD_SHADOW_RADIUS, 2);
    }
  });

  it('edge-on, the curve’s ends are the equatorial photon orbits: α = −b_c(±) from kerr.ts', () => {
    for (const a of [0.3, 0.7, 0.998]) {
      const s = shadowSize(criticalCurve(a, 90 * DEG, 400));
      expect(s.width).toBeCloseTo(criticalImpact(a, 1) - criticalImpact(a, -1), 6);
      const [r0, r1] = visibleRadii(a, 90 * DEG);
      expect(-xiOf(r0, a)).toBeCloseTo(-criticalImpact(a, 1), 6);
      expect(-xiOf(r1, a)).toBeCloseTo(-criticalImpact(a, -1), 6);
    }
  });

  it('every point satisfies α² + β² = η + ξ² + a²cos²i (the identity behind the contour)', () => {
    const a = 0.9;
    const i = 50 * DEG;
    for (const p of criticalCurve(a, i, 60)) expect(p.alpha ** 2 + p.beta ** 2).toBeCloseTo(etaOf(p.r, a) + xiOf(p.r, a) ** 2 + a * a * Math.cos(i) ** 2, 8);
  });

  it('seen from near the pole it is a circle of radius √(η + a²) at the orbit with ξ = 0', () => {
    const a = 0.998;
    // ξ = 0: r³ − 3r² + a²r + a² = 0, by bisection between the photon orbits.
    let lo = 1.1;
    let hi = 4;
    for (let k = 0; k < 80; k++) {
      const m = (lo + hi) / 2;
      if (xiOf(m, a) > 0) lo = m;
      else hi = m;
    }
    const r0 = (lo + hi) / 2;
    const want = Math.sqrt(etaOf(r0, a) + a * a);
    const s = shadowSize(criticalCurve(a, 0.05 * DEG, 200));
    expect(s.meanDiameter / 2).toBeCloseTo(want, 3);
  });

  it('β² is zero at the ends of the visible range and positive inside', () => {
    const [r0, r1] = visibleRadii(0.7, 30 * DEG);
    expect(Math.abs(beta2(r0, 0.7, 30 * DEG))).toBeLessThan(1e-6);
    expect(Math.abs(beta2(r1, 0.7, 30 * DEG))).toBeLessThan(1e-6);
    expect(beta2((r0 + r1) / 2, 0.7, 30 * DEG)).toBeGreaterThan(0);
  });
});

describe('photon-ring Lyapunov exponent', () => {
  /** γ = √(R″/2) × (Mino time of one half-orbit in θ), each found numerically. */
  function numericGamma(r: number, a: number): number {
    const xi = xiOf(r, a);
    const eta = etaOf(r, a);
    const R = (x: number) => (x * x + a * a - a * xi) ** 2 - delta(x, a) * (eta + (xi - a) ** 2);
    const h = 1e-4;
    const R2 = (R(r + h) - 2 * R(r) + R(r - h)) / (h * h);
    // Θ(u = cos θ) = η + a²u² − ξ²u²/(1 − u²); dλ = du / √((1 − u²)Θ). Turning point u₊; u = u₊ sin ψ.
    const Th = (u: number) => eta + a * a * u * u - (xi * xi * u * u) / (1 - u * u);
    let lo = 0;
    let hi = 1 - 1e-15;
    for (let k = 0; k < 200; k++) {
      const m = (lo + hi) / 2;
      if (Th(m) > 0) lo = m;
      else hi = m;
    }
    const up = lo;
    const n = 4000;
    let G = 0;
    for (let k = 0; k < n; k++) {
      const psi = ((k + 0.5) / n) * (Math.PI / 2);
      const u = up * Math.sin(psi);
      const du = up * Math.cos(psi);
      G += du / Math.sqrt(Math.max(1e-300, (1 - u * u) * Th(u)));
    }
    G *= (Math.PI / 2 / n) * 2; // both halves, −u₊ to u₊
    return Math.sqrt(R2 / 2) * G;
  }

  it('is π for Schwarzschild (each subring e^−π ≈ 4.3% of the last)', () => {
    expect(lyapunov(3, 1e-4)).toBe(Math.PI);
    expect(lyapunov(3, 0.01)).toBeCloseTo(Math.PI, 3);
  });

  it('Johnson et al.’s closed form agrees with R″ and the θ half-period integrated directly', () => {
    for (const [r, a] of [[2.5, 0.5], [2.0, 0.9], [3.6, 0.9], [2.4, 0.998]]) expect(lyapunov(r, a)).toBeCloseTo(numericGamma(r, a), 3);
  });

  it('equatorial orbits give π at both ends; just inside the prograde end it falls steeply (to 1.33 at a = 0.998)', () => {
    const [r0, r1] = visibleRadii(0.998, 90 * DEG);
    expect(lyapunov(r0, 0.998)).toBeCloseTo(Math.PI, 4);
    expect(lyapunov(r1, 0.998)).toBeCloseTo(Math.PI, 4);
    expect(lyapunov(r0 + 0.05, 0.998)).toBeCloseTo(numericGamma(r0 + 0.05, 0.998), 3);
    expect(shadowSize(criticalCurve(0.998, 90 * DEG)).gammaMin).toBeLessThan(1.4);
  });
});

describe('microlensing: point lens', () => {
  it('A(u) = (u² + 2)/(u√(u² + 4)): 3/√5 at u = 1, → 1/u small, → 1 + 2/u⁴ large', () => {
    expect(pointMagnification(1)).toBeCloseTo(3 / Math.sqrt(5), 12);
    expect(pointMagnification(1e-4) * 1e-4).toBeCloseTo(1, 6);
    expect((pointMagnification(200) - 1) * 200 ** 4).toBeCloseTo(2, 3);
  });

  it('the two images obey the lens equation and their magnifications add to A(u)', () => {
    const u = 0.4;
    const { plus, minus } = pointImages(u);
    expect(plus - 1 / plus).toBeCloseTo(u, 12);
    expect(minus - 1 / minus).toBeCloseTo(u, 12);
    const mu = (t: number) => 1 / Math.abs(1 - 1 / t ** 4);
    expect(mu(plus) + mu(minus)).toBeCloseTo(pointMagnification(u), 10);
  });

  it('the binary polynomial with a vanishing companion recovers the point lens', () => {
    const L = binary(1e-7, 1.2);
    for (const z of [[0.3, 0.1], [1.1, -0.4], [0.05, 0.02]] as C[]) expect(binaryMagnification(L, z)).toBeCloseTo(pointMagnification(Math.hypot(z[0] - L.z1, z[1])), 3);
  });

  it('closest approach and the light curve peak at A(u₀)', () => {
    const t = { x: 0.3, y: 0.3, angle: 0 };
    expect(closestApproach(t).u0).toBeCloseTo(0.3, 12);
    const lc = lightCurve(t, null, -2, 2, 401);
    expect(Math.max(...lc.A)).toBeCloseTo(pointMagnification(0.3), 10);
  });
});

describe('microlensing: binary lens', () => {
  const L = binary(1, 1);

  it('every image found satisfies the lens equation; there are 3 or 5', () => {
    for (const z of [[0.01, 0.4], [0.9, 0.9], [0, 0.05], [-0.3, -0.02]] as C[]) {
      const im = binaryImages(L, z);
      expect([3, 5]).toContain(im.length);
      for (const i of im) {
        const back = lensEquation(L, i.z);
        expect(Math.hypot(back[0] - z[0], back[1] - z[1])).toBeLessThan(1e-9);
      }
    }
  });

  it('the image count changes by two across a caustic; the sum of signed magnifications is 1 far away', () => {
    const { caustic } = criticalAndCaustic(L, 180);
    expect(caustic.length).toBe(720);
    // Equal masses at d = 1: the central (resonant) caustic crosses the axis at ±x_c; inside, 5 images.
    expect(binaryImages(L, [0, 0.001]).length).toBe(5);
    expect(binaryImages(L, [0, 1.5]).length).toBe(3);
    const far = binaryImages(L, [8, 6]);
    expect(far.reduce((s, i) => s + i.mu, 0)).toBeCloseTo(1, 2);
  });

  it('caustic points are where the Jacobian vanishes: magnification there is very large', () => {
    const { critical } = criticalAndCaustic(L, 36);
    for (const z of critical.slice(0, 20)) {
      const s = [0, 0];
      for (const [m, zi] of [[L.m1, L.z1], [L.m2, L.z2]]) {
        const dx = z[0] - zi;
        const dy = -z[1];
        const r2 = dx * dx + dy * dy;
        // m/(z̄ − zᵢ)² has modulus m/r².
        s[0] += (m * (dx * dx - dy * dy)) / (r2 * r2);
        s[1] += (-2 * m * dx * dy) / (r2 * r2);
      }
      expect(Math.hypot(s[0], s[1])).toBeCloseTo(1, 8);
    }
  });

  it('inverse ray shooting through lensMap agrees with the exact polynomial magnification within counting noise', () => {
    const job = shootMap(L, { pixels: 60, half: 1.5, rays: 1200, lensHalf: 2.6 });
    while (!job.step(400));
    const m = job.map;
    let n = 0;
    let within = 0;
    for (const [x, y] of [[1.2, 1.2], [-1.0, 0.8], [0.7, -1.1], [1.3, 0.3], [-1.2, -1.2], [0.2, 1.3]]) {
      const pix = (2 * m.half) / m.pixels;
      const cx = -m.half + (Math.floor((x + m.half) / pix) + 0.5) * pix;
      const cy = -m.half + (Math.floor((y + m.half) / pix) + 0.5) * pix;
      const exact = binaryMagnification(L, [cx, cy]);
      const shot = mapAt(m, cx, cy);
      const sigma = exact / Math.sqrt(m.raysPerPixel * exact);
      n++;
      if (Math.abs(shot - exact) < 3 * sigma + 0.02 * exact) within++;
    }
    expect(within).toBe(n);
  });
});

describe('FRW universes', () => {
  const flat = (om: number, ol: number, or = 0): Cosmos => ({ H0: 70, om, ol, or });

  it('Einstein-de Sitter: t₀ = 2/3H₀, particle horizon 2c/H₀, χ(z) = 2(1 − 1/√(1 + z)), no event horizon', () => {
    const p = flat(1, 0);
    expect(ageAt(p, 1)).toBeCloseTo(2 / 3, 8);
    expect(conformalAt(p, 1)).toBeCloseTo(2, 8);
    expect(comovingDistance(p, 3)).toBeCloseTo(1, 6);
    const h = history(p, 3);
    expect(h.etaEnd).toBe(Infinity);
    // a ∝ t^(2/3) into the future.
    const k = h.t.findIndex((t) => t > 2.5);
    expect(h.a[k]).toBeCloseTo(Math.pow(h.t[k] / (2 / 3), 2 / 3), 4);
  });

  it('de Sitter: no beginning, a = e^{H₀(t − t₀)}, event horizon c/H₀, χ(z) = z', () => {
    const p = flat(0, 1);
    expect(ageAt(p, 1)).toBe(Infinity);
    expect(comovingDistance(p, 2)).toBeCloseTo(2, 6);
    const h = history(p, 2);
    expect(h.infinitePast).toBe(true);
    expect(h.etaEnd - h.eta0).toBeCloseTo(1, 4);
    const k = h.t.findIndex((t) => t > 1.5);
    expect(h.a[k]).toBeCloseTo(Math.exp(h.t[k] - h.t0), 4);
  });

  it('radiation only: t₀ = 1/2H₀; open matter: the closed form with acosh', () => {
    expect(ageAt(flat(0, 0, 1), 1)).toBeCloseTo(0.5, 8);
    const om = 0.3;
    const want = 1 / (1 - om) - (om / (2 * (1 - om) ** 1.5)) * Math.acosh(2 / om - 1);
    expect(ageAt({ H0: 70, om, ol: 0, or: 0 }, 1)).toBeCloseTo(want, 8);
  });

  it('flat ΛCDM: quadrature age equals (2/3√Ω_Λ) asinh √(Ω_Λ/Ω_m)', () => {
    for (const om of [0.2, 0.3, 0.5]) {
      const ol = 1 - om;
      expect(ageAt(flat(om, ol), 1)).toBeCloseTo((2 / (3 * Math.sqrt(ol))) * Math.asinh(Math.sqrt(ol / om)), 8);
    }
  });

  it('closed matter universe (Ω_m = 2): crunch at 2π/H₀, η₀ = π/2, event horizon 3π/2 curvature radii', () => {
    const p: Cosmos = { H0: 70, om: 2, ol: 0, or: 0 };
    expect(conformalAt(p, 1)).toBeCloseTo(Math.PI / 2, 6);
    const h = history(p, 10);
    expect(h.fate).toBe('crunch');
    expect(h.etaEnd).toBeCloseTo(2 * Math.PI, 2);
    expect(h.t[h.t.length - 1]).toBeLessThan(2 * Math.PI);
    expect(h.t[h.t.length - 1]).toBeGreaterThan(2 * Math.PI - 0.05);
  });

  it('Planck 2018 parameters: radiation Ω_r ≈ 9.2 × 10⁻⁵, age ≈ 13.8 Gyr', () => {
    const p = planck2018();
    expect(omegaRadiation(67.4) * 0.674 ** 2).toBeCloseTo(4.18e-5, 6);
    expect(ageAt(p, 1) * hubbleTimeGyr(p.H0)).toBeCloseTo(13.8, 1);
  });

  it('the exhibit’s default Ω_r is the CMB value, and its Ω_Λ makes the default flat', () => {
    expect(FRW_DEFAULTS.or).toBeCloseTo(omegaRadiation(FRW_DEFAULTS.H0), 6);
    expect(FRW_DEFAULTS.om + FRW_DEFAULTS.ol + FRW_DEFAULTS.or).toBeCloseTo(1, 12);
  });

  it('a bounce instead of a big bang is detected (Ω_Λ large, little matter)', () => {
    expect(hasBigBang({ H0: 70, om: 0.05, ol: 1.6, or: 0 })).toBe(false);
    expect(hasBigBang(planck2018())).toBe(true);
    expect(E2(1, planck2018())).toBeCloseTo(1, 12);
  });

  it('Davis & Lineweaver: in (0.3, 0.7) ΛCDM galaxies beyond z ≈ 1.46 recede faster than light, yet are seen', () => {
    const p = flat(0.3, 0.7);
    expect(superluminalRedshift(p)).toBeCloseTo(1.46, 1);
    const h = history(p, 3);
    const r = recession(p, h, 3);
    expect(r.vNow).toBeGreaterThan(1);
    expect(r.vEmit).toBeGreaterThan(1);
    // The photon first receded: its largest proper distance exceeds where it set out.
    expect(r.dPhotonMax).toBeGreaterThan(r.dEmit);
  });
});

describe('Oppenheimer-Snyder collapse', () => {
  it('kruskal.ts: the fall from rest is finite at every sample for any start (R = 10M rounded E² − f below 0)', () => {
    for (const R of [10, 25, 7.3]) for (const q of fallWorldline(1, R, 300)) expect(Number.isFinite(q.U) && Number.isFinite(q.V)).toBe(true);
  });

  const s = star(1, 10);

  it('the surface follows the Schwarzschild cycloid from kruskal.ts, in the same proper time', () => {
    const line = fallWorldline(1, 10, 200);
    for (const q of [line[20], line[100], line[180]]) {
      const eta = etaAtTau(s, q.tau);
      expect(surfaceRadius(s, eta)).toBeCloseTo(q.r, 6);
      expect(shellRadius(s, eta, s.chi0)).toBeCloseTo(q.r, 9);
    }
  });

  it('crosses r = 2M at η = π − 2χ₀; the event horizon left the centre at π − 3χ₀, earlier in τ', () => {
    expect(surfaceRadius(s, s.etaCross)).toBeCloseTo(2, 12);
    expect(eventHorizonChi(s, s.etaForm)).toBeCloseTo(0, 12);
    expect(radiiAt(s, s.etaCross).eh).toBeCloseTo(2, 10);
    expect(tauOf(s, s.etaForm)).toBeLessThan(tauOf(s, s.etaCross));
  });

  it('the event horizon is a light ray: integrating dχ/dτ = 1/a from the centre reaches the surface as it crosses 2M', () => {
    let chi = 0;
    const t0 = tauOf(s, s.etaForm);
    const t1 = tauOf(s, s.etaCross);
    const n = 20000;
    for (let k = 0; k < n; k++) {
      const tm = t0 + ((k + 0.5) / n) * (t1 - t0);
      chi += (t1 - t0) / n / scaleFactor(s, etaAtTau(s, tm));
    }
    expect(chi).toBeCloseTo(s.chi0, 4);
  });

  it('apparent horizon: outgoing expansion a′sin χ + a cos χ vanishes at χ = (π − η)/2, where r = 2m(χ)', () => {
    for (const eta of [2.3, 2.6, 3.0]) {
      const chi = apparentHorizonChi(s, eta);
      expect(chi).not.toBeNull();
      const h = 1e-6;
      const da = (scaleFactor(s, eta + h) - scaleFactor(s, eta - h)) / (2 * h);
      expect(da * Math.sin(chi!) + scaleFactor(s, eta) * Math.cos(chi!)).toBeCloseTo(0, 6);
      expect(shellRadius(s, eta, chi!)).toBeCloseTo(2 * massInside(s, chi!), 9);
    }
    expect(apparentHorizonChi(s, s.etaCross - 0.01)).toBeNull();
  });

  it('Misner-Sharp mass from the metric: 1 − 2m/r = cos²χ − (da/dτ)² sin²χ', () => {
    const eta = 1.2;
    const chi = 0.3;
    const h = 1e-6;
    const dadtau = (scaleFactor(s, eta + h) - scaleFactor(s, eta - h)) / (tauOf(s, eta + h) - tauOf(s, eta - h));
    const lhs = 1 - (2 * massInside(s, chi)) / shellRadius(s, eta, chi);
    expect(lhs).toBeCloseTo(Math.cos(chi) ** 2 - dadtau ** 2 * Math.sin(chi) ** 2, 6);
  });

  it('the glued chart is continuous at the surface, and the event horizon maps to U = 0', () => {
    const k = kruskalChart(s);
    for (const eta of [0.5, 1.5, 2.5]) {
      const a = k.interior(eta, s.chi0);
      const b = k.surface(eta);
      expect(a.U).toBeCloseTo(b.U, 6);
      expect(a.V).toBeCloseTo(b.V, 6);
    }
    for (const eta of [s.etaForm, (s.etaForm + s.etaCross) / 2]) expect(Math.abs(k.interior(eta, eventHorizonChi(s, eta)!).U)).toBeLessThan(1e-3);
    // Time symmetry: at the moment of rest, U = −V on the surface.
    expect(k.surface(0).U).toBeCloseTo(-k.surface(0).V, 12);
  });
});
