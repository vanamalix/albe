/**
 * A gyroscope carried round a hole, against a vector carried round the Flamm slice.
 *
 * Slice: parallel transport round the circle r on dl² = dr²/f + r²dφ², f = 1 − 2M/r. In the orthonormal
 * frame (e_r, e_φ) the vector turns back at √f per radian of φ, so after one loop it leads the distant
 * stars by 2π(1 − √(1 − 2M/r)). Gyroscope: Fermi-Walker (here parallel) transport of the spin along a
 * circular geodesic of the full spacetime; in the comoving frame it turns back at √(1 − 3M/r), so the
 * geodetic precession per orbit is 2π(1 − √(1 − 3M/r)). The extra M/r comes from time: weak-field, the
 * gyroscope's 3πM/r per orbit is 2πM/r from space curvature plus πM/r from moving through curved time
 * (de Sitter 1916; Fokker 1920).
 */

/** Per loop, the slice-transported vector's lead on the distant stars, radians. */
export const sliceTransport = (M: number, r: number): number => 2 * Math.PI * (1 - Math.sqrt(1 - (2 * M) / r));

/** Per orbit, the geodetic precession of a gyroscope on a circular geodesic, radians. */
export const geodetic = (M: number, r: number): number => 2 * Math.PI * (1 - Math.sqrt(1 - (3 * M) / r));

/** Turn rates relative to the radial direction, per radian of orbital angle (negative: backwards). */
export const sliceRate = (M: number, r: number): number => -Math.sqrt(1 - (2 * M) / r);
export const gyroRate = (M: number, r: number): number => -Math.sqrt(1 - (3 * M) / r);

/**
 * Numerical parallel transport round the Flamm circle (RK4 in φ on the components V^r, V^φ with the
 * slice's Christoffel symbols Γ^r_φφ = −rf, Γ^φ_rφ = 1/r). Returns the total angle the vector turns
 * relative to the radial direction over one loop (expect −2π√f).
 */
export function transportOnSlice(M: number, r: number, steps = 2000): number {
  const f = 1 - (2 * M) / r;
  let vr = Math.sqrt(f); // unit radial vector: g_rr (V^r)² = 1
  let vp = 0;
  const h = (2 * Math.PI) / steps;
  const d = (a: number, b: number): [number, number] => [r * f * b, -a / r];
  let prev = 0;
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const k1 = d(vr, vp);
    const k2 = d(vr + (h / 2) * k1[0], vp + (h / 2) * k1[1]);
    const k3 = d(vr + (h / 2) * k2[0], vp + (h / 2) * k2[1]);
    const k4 = d(vr + h * k3[0], vp + h * k3[1]);
    vr += (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    vp += (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    // Angle from e_r in the orthonormal frame.
    const ang = Math.atan2(r * vp, vr / Math.sqrt(f));
    let dA = ang - prev;
    if (dA > Math.PI) dA -= 2 * Math.PI;
    if (dA < -Math.PI) dA += 2 * Math.PI;
    total += dA;
    prev = ang;
  }
  return total;
}

/**
 * Numerical spin transport along a circular equatorial geodesic of Schwarzschild: dS^μ/dτ = −Γ^μ_αβ u^α S^β,
 * RK4 in proper time over one orbit (Δφ = 2π). Returns the total angle the spin turns relative to the
 * radial direction, measured in the comoving frame (expect −2π√(1 − 3M/r)).
 */
export function transportGyroscope(M: number, r: number, steps = 4000): number {
  const f = 1 - (2 * M) / r;
  const ut = 1 / Math.sqrt(1 - (3 * M) / r);
  const up = Math.sqrt(M / (r * r * r)) * ut;
  // Speed measured by a static observer, and its Lorentz factor.
  const v = (r * up) / (Math.sqrt(f) * ut);
  const gamma = 1 / Math.sqrt(1 - v * v);
  const G_t_tr = M / (r * r * f);
  const G_r_tt = (M * f) / (r * r);
  const G_r_pp = -r * f;
  const G_p_rp = 1 / r;
  const d = (s: number[]): number[] => [-G_t_tr * ut * s[1], -G_r_tt * ut * s[0] - G_r_pp * up * s[2], -G_p_rp * up * s[1]];
  // S = (S^t, S^r, S^φ), starting along the unit radial direction.
  let s = [0, Math.sqrt(f), 0];
  const T = (2 * Math.PI) / up;
  const h = T / steps;
  const angle = (q: number[]) => {
    const sr = q[1] / Math.sqrt(f);
    // Component along the comoving φ direction e_φ' = γ(e_φ̂ + v e_t̂).
    const sp = gamma * (r * q[2] - v * Math.sqrt(f) * q[0]);
    return Math.atan2(sp, sr);
  };
  let prev = angle(s);
  let total = 0;
  for (let i = 0; i < steps; i++) {
    const k1 = d(s);
    const k2 = d(s.map((x, j) => x + (h / 2) * k1[j]));
    const k3 = d(s.map((x, j) => x + (h / 2) * k2[j]));
    const k4 = d(s.map((x, j) => x + h * k3[j]));
    s = s.map((x, j) => x + (h / 6) * (k1[j] + 2 * k2[j] + 2 * k3[j] + k4[j]));
    const a = angle(s);
    let dA = a - prev;
    if (dA > Math.PI) dA -= 2 * Math.PI;
    if (dA < -Math.PI) dA += 2 * Math.PI;
    total += dA;
    prev = a;
  }
  return total;
}

/** SI constants for the Gravity Probe B comparison. */
export const EARTH_GM = 3.986004418e14; // m³/s² (IERS)
export const C_LIGHT = 299_792_458;
export const EARTH_EQUATORIAL_RADIUS = 6.378137e6; // m (WGS 84)
/** Gravity Probe B's orbit was about 642 km up, nearly circular and polar (Everitt et al. 2011). */
export const GPB_ALTITUDE = 642e3;
/** Everitt et al. (2011), PRL 106, 221101: measured and predicted drift rates, milliarcseconds per year. */
export const GPB = { geodeticMeasured: 6601.8, geodeticError: 18.3, geodeticPredicted: 6606.1, dragMeasured: 37.2, dragError: 7.2, dragPredicted: 39.2 };

/** Geodetic precession rate for a circular orbit of radius r round a point mass, mas per Julian year. */
export function geodeticRateMasPerYear(GM: number, r: number): number {
  const omega = Math.sqrt(GM / (r * r * r));
  const rate = omega * (1 - Math.sqrt(1 - (3 * GM) / (C_LIGHT * C_LIGHT * r)));
  return rate * 365.25 * 86400 * (180 / Math.PI) * 3600 * 1000;
}
