/**
 * Kruskal-Szekeres coordinates for Schwarzschild, and the falling clock carried through the horizon.
 *
 * With r* = r + 2M ln|r/2M − 1|, outside the horizon U = −e^{−(t − r*)/4M}, V = e^{(t + r*)/4M}, and
 * everywhere UV = −(r/2M − 1) e^{r/2M}. T = (U + V)/2, X = (V − U)/2, so T² − X² = UV. Light moves at 45°.
 * The horizon is U = 0 (future) and V = 0 (past); the singularity r = 0 is UV = 1. Regions: I our
 * exterior (U < 0 < V), II the black hole (U, V > 0), III the other exterior, IV the white hole.
 *
 * A clock let go from rest at R: r = (R/2)(1 + cos η), τ = √(R³/8M)(η + sin η). Its ingoing coordinate
 * v = t + r* obeys dv/dτ = 1/(E + √(E² − f)), E = √(1 − 2M/R), which is finite through the horizon, so
 * V = e^{v/4M} and U = −(r/2M − 1)e^{r/2M}/V carry the worldline on to r = 0 at η = π.
 */

export const tortoise = (M: number, r: number): number => r + 2 * M * Math.log(Math.abs(r / (2 * M) - 1));

/** Kruskal U, V outside the horizon from Schwarzschild t and r. */
export function uvOutside(M: number, r: number, t: number): { U: number; V: number } {
  const rs = tortoise(M, r);
  return { U: -Math.exp(-(t - rs) / (4 * M)), V: Math.exp((t + rs) / (4 * M)) };
}

/** UV at areal radius r (any r). */
export const uvProduct = (M: number, r: number): number => -(r / (2 * M) - 1) * Math.exp(r / (2 * M));

export interface FallPoint {
  tau: number;
  r: number;
  U: number;
  V: number;
}

/** The fall from rest at R to r = 0, sampled at n + 1 points in η, with v found by Simpson's rule. */
export function fallWorldline(M: number, R: number, n = 400): FallPoint[] {
  const E = Math.sqrt(1 - (2 * M) / R);
  const k = Math.sqrt((R * R * R) / (8 * M));
  const dvdeta = (eta: number): number => {
    const r = (R / 2) * (1 + Math.cos(eta));
    if (r <= 0) return 0;
    const f = 1 - (2 * M) / r;
    return (k * (1 + Math.cos(eta))) / (E + Math.sqrt(E * E - f));
  };
  const out: FallPoint[] = [];
  let v = tortoise(M, R); // t = 0 at release
  const h = Math.PI / n;
  for (let i = 0; i <= n; i++) {
    const eta = i * h;
    if (i > 0) v += (h / 6) * (dvdeta(eta - h) + 4 * dvdeta(eta - h / 2) + dvdeta(eta));
    const r = (R / 2) * (1 + Math.cos(eta));
    const V = Math.exp(v / (4 * M));
    out.push({ tau: k * (eta + Math.sin(eta)), r, U: uvProduct(M, r) / V, V });
  }
  return out;
}

/** The worldline at the clock's own time τ (linear between samples). */
export function fallAt(line: readonly FallPoint[], tau: number): FallPoint {
  if (tau <= 0) return line[0];
  for (let i = 1; i < line.length; i++) {
    if (line[i].tau >= tau) {
      const a = line[i - 1];
      const b = line[i];
      const s = (tau - a.tau) / (b.tau - a.tau);
      return { tau, r: a.r + s * (b.r - a.r), U: a.U + s * (b.U - a.U), V: a.V + s * (b.V - a.V) };
    }
  }
  return line[line.length - 1];
}

/**
 * A compactified map for drawing: Ũ = arctan(U/a), Ṽ = arctan(V/b). Any map of U alone and V alone
 * keeps light rays at 45°, so this is a Penrose-type diagram; a = b = 1 is the standard one, other
 * scales only frame a chosen stretch of the worldline.
 */
export function compact(U: number, V: number, a = 1, b = 1): { x: number; y: number } {
  const u = Math.atan(U / a);
  const w = Math.atan(V / b);
  return { x: (w - u) / 2, y: (w + u) / 2 };
}
