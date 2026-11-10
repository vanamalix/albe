/**
 * Geodesics of a two-dimensional metric written in a conformal chart, g = e^{2σ}(dx² + dy²).
 *
 * Every surface used here has such a chart: the plane, the sphere (stereographic), the hyperbolic
 * plane (Poincaré disk), the Flamm slice of Schwarzschild (isotropic radius), the Ellis wormhole and
 * the optical plane of two extremal holes. In a conformal chart angles on the page are the true
 * angles, and a geodesic is a curve whose chart curvature equals the normal derivative of σ:
 *
 *   dθ/ds = −σₓ sin θ + σ_y cos θ,   dl/ds = e^σ,
 *
 * with s the chart arc length, θ the chart direction and l the proper length. The Gaussian curvature
 * is K = −e^{−2σ} Δσ. Integration is RK4 in s with steps that turn the direction by a small angle.
 */

export interface Chart {
  /** Writes σ, ∂σ/∂x and ∂σ/∂y at (x, y) into out[0..2]. */
  sigma(x: number, y: number, out: Float64Array): void;
  /** Gaussian curvature, closed form. */
  K(x: number, y: number): number;
  /** False where the chart ends: an edge, a puncture or a cut the geometry keeps. */
  inside(x: number, y: number): boolean;
  /** A length that sets the step far from any feature (the scale of the drawing). */
  scale: number;
}

export interface Geodesic {
  x: number[];
  y: number[];
  /** Proper length from the start, at each point. */
  l: number[];
  /** Chart direction at the start and at the end. */
  theta0: number;
  theta1: number;
  length: number;
  /** Why it stopped. */
  end: 'length' | 'edge' | 'target' | 'steps';
}

const tmp = new Float64Array(3);

/** Chart step that turns the direction by about `eta` radians, and is never above eta × scale. */
function stepAt(c: Chart, x: number, y: number, eta: number): number {
  c.sigma(x, y, tmp);
  return eta / (Math.hypot(tmp[1], tmp[2]) + 1 / c.scale);
}

function deriv(c: Chart, x: number, y: number, th: number, out: number[]): void {
  c.sigma(x, y, tmp);
  const cs = Math.cos(th);
  const sn = Math.sin(th);
  out[0] = cs;
  out[1] = sn;
  out[2] = -tmp[1] * sn + tmp[2] * cs;
  out[3] = Math.exp(tmp[0]);
}

const k1 = [0, 0, 0, 0];
const k2 = [0, 0, 0, 0];
const k3 = [0, 0, 0, 0];
const k4 = [0, 0, 0, 0];

/** One RK4 step of chart length h from (x, y, θ, l). */
function rk4(c: Chart, s: number[], h: number): void {
  const [x, y, th, l] = s;
  deriv(c, x, y, th, k1);
  deriv(c, x + (h / 2) * k1[0], y + (h / 2) * k1[1], th + (h / 2) * k1[2], k2);
  deriv(c, x + (h / 2) * k2[0], y + (h / 2) * k2[1], th + (h / 2) * k2[2], k3);
  deriv(c, x + h * k3[0], y + h * k3[1], th + h * k3[2], k4);
  s[0] = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
  s[1] = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
  s[2] = th + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  s[3] = l + (h / 6) * (k1[3] + 2 * k2[3] + 2 * k3[3] + k4[3]);
}

export interface ShootOptions {
  /** Turn per step, radians (default 0.01). */
  eta?: number;
  maxSteps?: number;
  /** Stop at the closest approach to this point once the geodesic has passed it. */
  target?: readonly [number, number];
  /** Keep every n-th point only (the end point is always kept). */
  every?: number;
}

/** The geodesic from (x0, y0) leaving at chart angle θ, to proper length maxLength (or an edge). */
export function shoot(c: Chart, x0: number, y0: number, theta: number, maxLength: number, opt: ShootOptions = {}): Geodesic {
  const eta = opt.eta ?? 0.01;
  const maxSteps = opt.maxSteps ?? 200_000;
  const every = opt.every ?? 1;
  const s = [x0, y0, theta, 0];
  const g: Geodesic = { x: [x0], y: [y0], l: [0], theta0: theta, theta1: theta, length: 0, end: 'steps' };
  const tgt = opt.target;
  let prevDot = tgt ? (tgt[0] - x0) * Math.cos(theta) + (tgt[1] - y0) * Math.sin(theta) : 0;
  for (let n = 0; n < maxSteps; n++) {
    let h = stepAt(c, s[0], s[1], eta);
    // Do not overshoot the requested length: dl/ds = e^σ.
    c.sigma(s[0], s[1], tmp);
    const left = maxLength - s[3];
    if (h * Math.exp(tmp[0]) > left) h = left / Math.exp(tmp[0]);
    const before = [s[0], s[1], s[2], s[3]];
    rk4(c, s, h);
    if (!c.inside(s[0], s[1]) || !Number.isFinite(s[0] + s[1] + s[2] + s[3])) {
      g.end = 'edge';
      break;
    }
    if (tgt) {
      const d = (tgt[0] - s[0]) * Math.cos(s[2]) + (tgt[1] - s[1]) * Math.sin(s[2]);
      if (prevDot > 0 && d <= 0) {
        // The closest approach lies inside this step: find it by secant on the step length, each
        // trial a full RK4 step from the start of the step, so the end point keeps RK4 accuracy.
        let h0 = 0;
        let d0 = prevDot;
        let h1 = h;
        let d1 = d;
        for (let it = 0; it < 8 && Math.abs(d1) > 1e-15 * c.scale; it++) {
          const h2 = h1 - (d1 * (h1 - h0)) / (d1 - d0);
          for (let i = 0; i < 4; i++) s[i] = before[i];
          rk4(c, s, h2);
          h0 = h1;
          d0 = d1;
          h1 = h2;
          d1 = (tgt[0] - s[0]) * Math.cos(s[2]) + (tgt[1] - s[1]) * Math.sin(s[2]);
        }
        g.end = 'target';
        g.x.push(s[0]);
        g.y.push(s[1]);
        g.l.push(s[3]);
        break;
      }
      prevDot = d;
    }
    if (n % every === every - 1 || s[3] >= maxLength * (1 - 1e-12)) {
      g.x.push(s[0]);
      g.y.push(s[1]);
      g.l.push(s[3]);
    }
    if (s[3] >= maxLength * (1 - 1e-12)) {
      g.end = 'length';
      break;
    }
  }
  if (g.x[g.x.length - 1] !== s[0] && g.end !== 'target') {
    g.x.push(s[0]);
    g.y.push(s[1]);
    g.l.push(s[3]);
  }
  g.theta1 = s[2];
  g.length = s[3];
  return g;
}

/** Proper length of the chart's straight segment from A to B (a quick upper bound for the geodesic). */
export function straightLength(c: Chart, ax: number, ay: number, bx: number, by: number, n = 64): number {
  let sum = 0;
  const d = Math.hypot(bx - ax, by - ay);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    c.sigma(ax + t * (bx - ax), ay + t * (by - ay), tmp);
    sum += Math.exp(tmp[0]);
  }
  return (sum * d) / n;
}

/** Signed miss of the geodesic leaving A at θ, at its closest approach to B, and the geodesic itself. */
function miss(c: Chart, a: readonly [number, number], b: readonly [number, number], th: number, L: number, eta: number) {
  const g = shoot(c, a[0], a[1], th, L, { target: b, eta });
  const n = g.x.length - 1;
  const ex = b[0] - g.x[n];
  const ey = b[1] - g.y[n];
  // Cross product of the final direction with the vector to B: which side B lies on.
  const side = Math.cos(g.theta1) * ey - Math.sin(g.theta1) * ex;
  return { g, side, dist: Math.hypot(ex, ey) };
}

/**
 * The geodesic from A to B found by shooting: the root of the signed miss nearest the chart's straight
 * direction, bracketed and then refined (Illinois). Null if no bracket is found (B unreachable, or every
 * direction reaches it, as for antipodal points on a sphere). The last point is B itself.
 */
export function geodesicBetween(c: Chart, a: readonly [number, number], b: readonly [number, number], opt: { eta?: number; tol?: number } = {}): Geodesic | null {
  const eta = opt.eta ?? 0.004;
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (d === 0) return null;
  const tol = opt.tol ?? 1e-10 * Math.max(d, c.scale * 1e-3);
  const L = 4 * straightLength(c, a[0], a[1], b[0], b[1]) + 1e-9;
  const th0 = Math.atan2(b[1] - a[1], b[0] - a[0]);
  const f = (th: number) => miss(c, a, b, th, L, eta);
  const m0 = f(th0);
  if (m0.dist < tol) return finish(m0.g, b);
  // Bracket: widen the search on both sides until the miss changes sign; the first change is the
  // root nearest the straight direction.
  let lo = NaN;
  let flo = NaN;
  let hi = NaN;
  let fhi = NaN;
  const prev = { [1]: { t: th0, side: m0.side }, [-1]: { t: th0, side: m0.side } } as Record<number, { t: number; side: number }>;
  for (let k = 0; k < 40 && Number.isNaN(hi); k++) {
    const dth = 0.01 * 1.3 ** k;
    if (dth > Math.PI) break;
    for (const dir of [1, -1]) {
      const t = th0 + dir * dth;
      const m = f(t);
      const p = prev[dir];
      if (m.g.end === 'target' && Math.sign(m.side) !== Math.sign(p.side)) {
        lo = p.t;
        flo = p.side;
        hi = t;
        fhi = m.side;
        break;
      }
      prev[dir] = { t, side: m.side };
    }
  }
  if (Number.isNaN(hi)) return null;
  let side = 0;
  let best = m0;
  for (let it = 0; it < 80; it++) {
    const t = hi - (fhi * (hi - lo)) / (fhi - flo);
    const m = f(Number.isFinite(t) ? t : (lo + hi) / 2);
    best = m;
    if (m.dist < tol || Math.abs(hi - lo) < 1e-14) break;
    if (Math.sign(m.side) === Math.sign(fhi)) {
      hi = t;
      fhi = m.side;
      if (side === -1) flo /= 2;
      side = -1;
    } else {
      lo = t;
      flo = m.side;
      if (side === 1) fhi /= 2;
      side = 1;
    }
  }
  return best.dist < Math.max(tol * 1e3, 1e-6 * d) ? finish(best.g, b) : null;
}

function finish(g: Geodesic, b: readonly [number, number]): Geodesic {
  const n = g.x.length - 1;
  g.x[n] = b[0];
  g.y[n] = b[1];
  return g;
}

// Gauss-Legendre nodes and weights on [0, 1].
const GL = (() => {
  const x = [-0.9602898564975363, -0.7966664774136267, -0.5255324099163290, -0.1834346424956498, 0.1834346424956498, 0.525532409916329, 0.7966664774136267, 0.9602898564975363];
  const w = [0.1012285362903763, 0.2223810344533745, 0.3137066458778873, 0.362683783378362, 0.362683783378362, 0.3137066458778873, 0.2223810344533745, 0.1012285362903763];
  return { x: x.map((v) => (v + 1) / 2), w: w.map((v) => v / 2) };
})();

/**
 * ∫ f dA_chart over the region between a closed chart polygon and a centre, seen as a fan of thin
 * wedges from (cx, cy), starting at radius r0 from the centre (0 for a full fan). The polygon must be
 * star-shaped about the centre. Gauss-Legendre in the radial direction, two points across each wedge.
 */
export function fanIntegral(px: readonly number[], py: readonly number[], cx: number, cy: number, r0: number, f: (x: number, y: number) => number): number {
  let total = 0;
  const n = px.length;
  for (let i = 0; i < n; i++) {
    const ax = px[i] - cx;
    const ay = py[i] - cy;
    const bx = px[(i + 1) % n] - cx;
    const by = py[(i + 1) % n] - cy;
    for (const v of [0.2113248654051871, 0.7886751345948129]) {
      const qx = ax + v * (bx - ax);
      const qy = ay + v * (by - ay);
      const q = Math.hypot(qx, qy);
      if (q <= r0) continue;
      // Polar: dA = ρ dρ dφ with dφ/dv = (q × q′)/|q|².
      const dphi = (qx * (by - ay) - qy * (bx - ax)) / (q * q);
      // Radial panels: geometric from an inner radius (the integrand peaks there), uniform from the centre.
      let radial = 0;
      for (let p = 0; p < PANELS; p++) {
        const a = r0 > 0 ? r0 * (q / r0) ** (p / PANELS) : (q * p) / PANELS;
        const b = r0 > 0 ? r0 * (q / r0) ** ((p + 1) / PANELS) : (q * (p + 1)) / PANELS;
        for (let k = 0; k < GL.x.length; k++) {
          const rho = a + GL.x[k] * (b - a);
          radial += GL.w[k] * (b - a) * rho * f(cx + (rho / q) * qx, cy + (rho / q) * qy);
        }
      }
      total += 0.5 * dphi * radial;
    }
  }
  return total;
}

const PANELS = 4;

/** Winding number of a closed chart polygon about a point. */
export function winding(px: readonly number[], py: readonly number[], x: number, y: number): number {
  let sum = 0;
  const n = px.length;
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(py[i] - y, px[i] - x);
    const b = Math.atan2(py[(i + 1) % n] - y, px[(i + 1) % n] - x);
    let d = b - a;
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    sum += d;
  }
  return Math.round(sum / (2 * Math.PI));
}

/** Angle between two chart directions, in [0, π]. True angle, since the chart is conformal. */
export function angleBetween(t1: number, t2: number): number {
  return Math.acos(Math.max(-1, Math.min(1, Math.cos(t1) * Math.cos(t2) + Math.sin(t1) * Math.sin(t2))));
}

/** e^{2σ}: the area factor of the chart. */
export function areaFactor(c: Chart, x: number, y: number): number {
  c.sigma(x, y, tmp);
  return Math.exp(2 * tmp[0]);
}
