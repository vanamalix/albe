/**
 * Two exactly balanced black holes: the Majumdar-Papapetrou solution of Einstein-Maxwell theory,
 *
 *   ds² = −U⁻² dt² + U² (dx² + dy² + dz²),   U = 1 + Σ Mᵢ / |x − xᵢ|,
 *
 * for holes of charge Qᵢ = Mᵢ (extremal). Electric repulsion then cancels gravitational attraction
 * exactly, the holes stay put at any separation, and the field equations reduce to Laplace's equation
 * ∇²U = 0 in flat space, which is linear: U simply adds. Nothing else in albe is an exact multi-hole
 * spacetime. Each horizon is the point xᵢ in these coordinates (a sphere of area 4πMᵢ²).
 *
 * Light: a static metric's null geodesics are the geodesics of the optical metric U⁴ dx², and the
 * plane through both holes is mapped to itself by reflection, so rays in it stay in it. In that plane
 * a ray turns at dθ/ds = 2 n̂·∇U / U (chart arc length s). One hole is extremal Reissner-Nordström,
 * with its photon sphere at areal r = 2M (here |x| = M) and capture below b = 4M.
 */

export interface Hole {
  x: number;
  y: number;
  m: number;
}

/** Two equal holes of mass m on the y axis, separation d (coordinate distance). */
export const balancedPair = (d: number, m = 1): Hole[] => [
  { x: 0, y: d / 2, m },
  { x: 0, y: -d / 2, m },
];

export function potentialU(holes: readonly Hole[], x: number, y: number): number {
  let u = 1;
  for (const h of holes) u += h.m / Math.hypot(x - h.x, y - h.y);
  return u;
}

export type Fate = { kind: 'escape'; angle: number } | { kind: 'capture'; hole: number } | { kind: 'unresolved' };

export interface MPRay {
  x: number[];
  y: number[];
  fate: Fate;
  /** Turns made round the pair: total change of the polar angle, over 2π. */
  turns: number;
}

/** Where rays start and are judged to have escaped, in units of the total mass. */
export const MP_FAR = 200;
/** A ray this close to a horizon point (in units of that hole's M) is captured. */
export const MP_CAPTURE = 0.02;

function rhs(holes: readonly Hole[], x: number, y: number, th: number, out: number[]): void {
  let u = 1;
  let ux = 0;
  let uy = 0;
  for (const h of holes) {
    const dx = x - h.x;
    const dy = y - h.y;
    const r2 = dx * dx + dy * dy;
    const r = Math.sqrt(r2);
    u += h.m / r;
    ux -= (h.m * dx) / (r2 * r);
    uy -= (h.m * dy) / (r2 * r);
  }
  const c = Math.cos(th);
  const s = Math.sin(th);
  out[0] = c;
  out[1] = s;
  // σ = 2 ln U, and the geodesic turns at the normal derivative of σ.
  out[2] = (2 * (-ux * s + uy * c)) / u;
}

/**
 * Traces one ray in the plane of the holes, from far to the left moving along +x with impact
 * parameter b, by RK4 in chart arc length with steps of eta times the distance to the nearest hole.
 * The start offset is set so the ray's angular momentum about the origin, U²·(x × x̂′), equals b,
 * which is the impact parameter at infinity exactly for one hole and to O(M/MP_FAR) for two.
 */
export function traceMP(holes: readonly Hole[], b: number, opt: { eta?: number; keep?: boolean; maxSteps?: number } = {}): MPRay {
  const eta = opt.eta ?? 0.02;
  const keep = opt.keep ?? false;
  const total = holes.reduce((a, h) => a + h.m, 0);
  const far = MP_FAR * total;
  const x0 = -far;
  let y0 = b;
  for (let i = 0; i < 4; i++) y0 = b / potentialU(holes, x0, y0) ** 2;
  let x = x0;
  let y = y0;
  let th = 0;
  const xs: number[] = keep ? [x] : [];
  const ys: number[] = keep ? [y] : [];
  let phi = Math.atan2(y, x);
  let swept = 0;
  const maxSteps = opt.maxSteps ?? 400_000;
  const k1 = [0, 0, 0];
  const k2 = [0, 0, 0];
  const k3 = [0, 0, 0];
  const k4 = [0, 0, 0];
  for (let n = 0; n < maxSteps; n++) {
    let near = Infinity;
    for (let i = 0; i < holes.length; i++) {
      const r = Math.hypot(x - holes[i].x, y - holes[i].y);
      if (r < MP_CAPTURE * holes[i].m) return { x: xs, y: ys, fate: { kind: 'capture', hole: i }, turns: swept / (2 * Math.PI) };
      near = Math.min(near, r);
    }
    const R = Math.hypot(x, y);
    if (R > far && x * Math.cos(th) + y * Math.sin(th) > 0 && n > 0) {
      return { x: xs, y: ys, fate: { kind: 'escape', angle: Math.atan2(Math.sin(th), Math.cos(th)) }, turns: swept / (2 * Math.PI) };
    }
    const h = eta * Math.max(near, 1e-3);
    rhs(holes, x, y, th, k1);
    rhs(holes, x + (h / 2) * k1[0], y + (h / 2) * k1[1], th + (h / 2) * k1[2], k2);
    rhs(holes, x + (h / 2) * k2[0], y + (h / 2) * k2[1], th + (h / 2) * k2[2], k3);
    rhs(holes, x + h * k3[0], y + h * k3[1], th + h * k3[2], k4);
    x += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    y += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    th += (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
    const p = Math.atan2(y, x);
    let dp = p - phi;
    if (dp > Math.PI) dp -= 2 * Math.PI;
    if (dp < -Math.PI) dp += 2 * Math.PI;
    swept += dp;
    phi = p;
    if (keep && (n % 2 === 1 || near < 4 * total)) {
      xs.push(x);
      ys.push(y);
    }
  }
  return { x: xs, y: ys, fate: { kind: 'unresolved' }, turns: swept / (2 * Math.PI) };
}

export interface ScanPoint {
  b: number;
  fate: Fate;
  /** True when a run at half the step agrees on the fate (and, on escape, the angle to 1°). */
  resolved: boolean;
}

/** Exit angle (or capture) against b across [b0, b1], each checked at two step sizes. */
export function scanMP(holes: readonly Hole[], b0: number, b1: number, n: number, eta = 0.02): ScanPoint[] {
  const out: ScanPoint[] = [];
  for (let i = 0; i < n; i++) {
    const b = b0 + ((i + 0.5) / n) * (b1 - b0);
    const a = traceMP(holes, b, { eta }).fate;
    const c = traceMP(holes, b, { eta: eta / 2 }).fate;
    const same = a.kind === c.kind && (a.kind !== 'capture' || c.kind !== 'capture' || a.hole === c.hole) && (a.kind !== 'escape' || c.kind !== 'escape' || Math.abs(Math.atan2(Math.sin(a.angle - c.angle), Math.cos(a.angle - c.angle))) < Math.PI / 180);
    out.push({ b, fate: c, resolved: same && a.kind !== 'unresolved' });
  }
  return out;
}

/** How many times the fate changes from one sample to the next: a Cantor set keeps adding these as you zoom. */
export function fateChanges(scan: readonly ScanPoint[]): number {
  let n = 0;
  const key = (f: Fate) => (f.kind === 'escape' ? `e${f.angle > 0 ? '+' : '-'}` : f.kind === 'capture' ? `c${f.hole}` : 'u');
  for (let i = 1; i < scan.length; i++) if (key(scan[i].fate) !== key(scan[i - 1].fate)) n++;
  return n;
}

/** Extremal Reissner-Nordström: photon sphere at areal r = 2M and critical impact parameter 4M. */
export const extremalCritical = (m: number): number => 4 * m;
