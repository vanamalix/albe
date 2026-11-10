/**
 * A ring of dust falling into a hole: geodesic deviation, ξ̈ⁱ = −Eⁱⱼ ξʲ, in the frame of the ring's
 * centre, which falls from rest at R. For Schwarzschild, E = (M/r³) diag(−2, 1, 1) in (radial,
 * tangential, out of plane): stretched radially at +2M/r³, squeezed at −M/r³ along both other axes.
 *
 * The trace is zero (vacuum, Rᵢⱼ = 0), so a small ball released at rest keeps its volume to second order
 * in time. albe is planar: the ring shows the radial and one tangential axis, and its area alone is
 * not conserved (it grows); the third axis, out of the plane, carries the matching squeeze. Later, shear
 * focuses the ball and its volume falls at fourth order (Raychaudhuri).
 */

export interface DeviationSample {
  tau: number;
  r: number;
  /** Stretch factors ξ/ξ₀ along the radial, in-plane tangential and out-of-plane axes. */
  radial: number;
  tangential: number;
  normal: number;
}

/** r at the centre's proper time τ on a fall from rest at R (cycloid, solved for η by Newton). */
export function fallRadius(M: number, R: number, tau: number): number {
  const k = Math.sqrt((R * R * R) / (8 * M));
  let eta = Math.min(Math.PI, Math.max(0, Math.cbrt((6 * tau) / k)));
  for (let i = 0; i < 40; i++) {
    const g = k * (eta + Math.sin(eta)) - tau;
    const dg = k * (1 + Math.cos(eta));
    if (dg < 1e-12) break;
    eta = Math.min(Math.PI, Math.max(0, eta - g / dg));
  }
  return (R / 2) * (1 + Math.cos(eta));
}

/** Linear deviation along the fall, from rest, RK4 in τ until r reaches rStop. */
export function deviationAlongFall(M: number, R: number, rStop: number, steps = 4000): DeviationSample[] {
  const k = Math.sqrt((R * R * R) / (8 * M));
  // Proper time to reach rStop.
  const etaStop = Math.acos((2 * rStop) / R - 1);
  const T = k * (etaStop + Math.sin(etaStop));
  const h = T / steps;
  // State: [ξr, ξr', ξt, ξt']; the out-of-plane axis obeys the tangential equation.
  let y = [1, 0, 1, 0];
  const d = (tau: number, s: number[]) => {
    const r = fallRadius(M, R, tau);
    const q = M / (r * r * r);
    return [s[1], 2 * q * s[0], s[3], -q * s[2]];
  };
  const out: DeviationSample[] = [{ tau: 0, r: R, radial: 1, tangential: 1, normal: 1 }];
  for (let i = 0; i < steps; i++) {
    const t = i * h;
    const k1 = d(t, y);
    const k2 = d(t + h / 2, y.map((v, j) => v + (h / 2) * k1[j]));
    const k3 = d(t + h / 2, y.map((v, j) => v + (h / 2) * k2[j]));
    const k4 = d(t + h, y.map((v, j) => v + h * k3[j]));
    y = y.map((v, j) => v + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    out.push({ tau: t + h, r: fallRadius(M, R, t + h), radial: y[0], tangential: y[2], normal: y[2] });
  }
  return out;
}

/** The sample whose centre radius is nearest r (the fall is monotonic). */
export function deviationAt(samples: readonly DeviationSample[], r: number): DeviationSample {
  let best = samples[0];
  for (const s of samples) if (Math.abs(s.r - r) < Math.abs(best.r - r)) best = s;
  return best;
}

/**
 * The ring as the simulation has it, read from the four particles that started on the axes (outer and
 * inner along the line to the hole, and the two across it): the deviation vectors of the linear
 * equation. Averaging each pair cancels the first nonlinear term, of order ξ/r. Converted to the
 * centre's falling frame: a coordinate span Δr at equal t is Δr/√f to static observers and γ = E/√f
 * times that at rest with the ring, so E Δr/f; across, r Δφ is unchanged by the radial boost. Returned
 * as stretch factors against the ring's starting proper size: ξ₀/√f(R) = ξ₀/E radially (it starts at
 * rest, coordinate radius ξ₀), ξ₀ across.
 */
export function measureRing(M: number, R: number, xi0: number, c: { x: number; y: number }, outer: { x: number; y: number }, inner: { x: number; y: number }, left: { x: number; y: number }, right: { x: number; y: number }): { radial: number; tangential: number; r: number } {
  const r = Math.hypot(c.x, c.y);
  const nx = c.x / r;
  const ny = c.y / r;
  const along = (p: { x: number; y: number }) => (p.x - c.x) * nx + (p.y - c.y) * ny;
  const across = (p: { x: number; y: number }) => -(p.x - c.x) * ny + (p.y - c.y) * nx;
  const f = 1 - (2 * M) / r;
  const E = Math.sqrt(1 - (2 * M) / R);
  const radial = ((along(outer) - along(inner)) / 2) * (E / f);
  return { radial: radial / (xi0 / E), tangential: (across(left) - across(right)) / 2 / xi0, r };
}

/**
 * A particle's position at the world's current coordinate time. Each particle steps in its own proper
 * time and may trail the world by up to one step (its lag); carry it forward at dx/dt = (dx/dτ)(dτ/dt).
 */
export const positionNow = (p: { x: number; y: number; vx: number; vy: number; rate: number; lag: number }) => ({ x: p.x + p.vx * p.rate * p.lag, y: p.y + p.vy * p.rate * p.lag });

/** Indices (into the ring, not counting the centre) of the particles that started on the axes. */
export const ringAxes = (n: number) => ({ outer: 0, left: n / 4, inner: n / 2, right: (3 * n) / 4 });
