/**
 * The 3D layers of the shadow, microlensing, expanding-universe and collapse exhibits. Each draws
 * the geometry its panel computes, from the same physics modules; the panels hold the plots and the
 * numbers. When the scene is playing, the layer moves the exhibit's clock forward a few times a second.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { radiiAt, shellRadius, star, etaAtTau, tauOf } from '../physics/collapse';
import { at, comovingDistance, history, hubbleTimeGyr, type Cosmos } from '../physics/cosmology';
import { binary, binaryImages, criticalAndCaustic, pointImages, trackPoint } from '../physics/microlens';
import { criticalCurve, SCHWARZSCHILD_SHADOW_RADIUS } from '../physics/shadow';
import { exhibitStore, useExhibit, type ExhibitSettings } from '../state/exhibit';
import { store } from '../state/store';
import { BLUE, dotBuffer, GOLD, lineBuffer, PALE, TEXT } from './exhibitKit';

const RED: [number, number, number] = [0.97, 0.32, 0.29];
const GREY: [number, number, number] = [0.55, 0.6, 0.68];

type Lines = ReturnType<typeof lineBuffer>;
type Plane = 'xy' | 'xz';
const put = (plane: Plane, x: number, y: number, lift = 0.5): number[] => (plane === 'xy' ? [x, y, lift] : [x, lift, y]);

function circle(l: Lines, plane: Plane, cx: number, cy: number, r: number, c: readonly number[], alpha: number, dashed = false, lift = 0.5, n = 128) {
  for (let k = 0; k < n; k++) {
    if (dashed && k % 2) continue;
    const a0 = (2 * Math.PI * k) / n;
    const a1 = (2 * Math.PI * (k + 1)) / n;
    l.seg(put(plane, cx + r * Math.cos(a0), cy + r * Math.sin(a0), lift), put(plane, cx + r * Math.cos(a1), cy + r * Math.sin(a1), lift), c, alpha);
  }
}

/** Moves one exhibit field forward while the scene plays, writing it about ten times a second. */
function useClock(field: keyof ExhibitSettings, rate: number, lo: number, hi: number, hold = 0) {
  const acc = useRef(0);
  const local = useRef(0);
  const last = useRef<number | null>(null);
  useFrame((_, delta) => {
    const cur = exhibitStore.get()[field] as number;
    // A slider moved it: carry on from there.
    if (last.current === null || cur !== last.current) {
      local.current = cur;
      last.current = cur;
    }
    const s = store.get();
    if (!s.playing) return;
    local.current += Math.min(delta, 1 / 20) * rate * (s.timeScale / 60);
    if (local.current > hi + hold) local.current = lo;
    acc.current += delta;
    if (acc.current > 0.1) {
      acc.current = 0;
      const v = Math.min(Math.max(local.current, lo), hi);
      last.current = v;
      exhibitStore.set({ [field]: v } as Partial<ExhibitSettings>);
    }
  });
}

/** Kerr critical curve on an upright screen facing the camera, with the a = 0 circle for scale. */
export function ShadowExhibit() {
  const a = useExhibit((s) => s.shSpin);
  const i = useExhibit((s) => s.shIncl);
  const lines = useMemo(() => lineBuffer(6000, false, false), []);
  const S = 10;
  useMemo(() => {
    lines.reset();
    const curve = criticalCurve(a, Math.max(0.5, i) * (Math.PI / 180), 200);
    circle(lines, 'xz', 0, 0, SCHWARZSCHILD_SHADOW_RADIUS * S, GREY, 0.35, true, 30);
    // Subrings, drawn outward from the curve at e^−(n−1)γ times a first offset of 0.7M (only the ratio is exact).
    for (const [n, alpha] of [[1, 0.55], [2, 0.35]] as const) {
      for (let k = 0; k < curve.length; k++) {
        const p = curve[k];
        const q = curve[(k + 1) % curve.length];
        const off = (pt: typeof p, nx: number, ny: number) => {
          const d = 0.7 * Math.exp(-(n - 1) * pt.gamma);
          return [pt.alpha + nx * d, pt.beta + ny * d];
        };
        const tx = q.alpha - p.alpha;
        const ty = q.beta - p.beta;
        const len = Math.hypot(tx, ty) || 1;
        // Outward normal: the curve runs clockwise (upper branch left to right, then the lower back).
        const nx = -ty / len;
        const ny = tx / len;
        const [x0, y0] = off(p, nx, ny);
        const [x1, y1] = off(q, nx, ny);
        lines.seg(put('xz', x0 * S, y0 * S, 30), put('xz', x1 * S, y1 * S, 30), PALE, alpha);
      }
    }
    for (let k = 0; k < curve.length; k++) {
      const p = curve[k];
      const q = curve[(k + 1) % curve.length];
      lines.seg(put('xz', p.alpha * S, p.beta * S, 30), put('xz', q.alpha * S, q.beta * S, 30), GOLD, 1);
    }
    // The spin axis, projected onto the sky: up the screen.
    lines.seg(put('xz', 0, -9 * S, 30), put('xz', 0, 9 * S, 30), BLUE, 0.25);
    lines.commit();
  }, [a, i, lines]);
  return <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} position={[0, 0, 15]} />;
}

/** The lens plane: Einstein ring, lenses, critical curves, caustics, the track and the images. */
export function MicrolensExhibit() {
  const st = useExhibit((s) => s);
  const S = 60;
  const lines = useMemo(() => lineBuffer(20000, false, false), []);
  const dots = useMemo(() => dotBuffer(6000, false), []);
  const lens = st.mlBinary ? binary(st.mlQ, st.mlD) : null;
  const curves = useMemo(() => (st.mlBinary ? criticalAndCaustic(binary(st.mlQ, st.mlD), 360) : null), [st.mlBinary, st.mlQ, st.mlD]);
  useClock('mlS', 0.25, -2.2, 2.2, 0.6);
  useMemo(() => {
    lines.reset();
    dots.reset();
    circle(lines, 'xy', 0, 0, S, GREY, 0.4, true);
    const track = { x: st.mlX, y: st.mlY, angle: st.mlAngle };
    const p0 = trackPoint(track, -2.4);
    const p1 = trackPoint(track, 2.4);
    lines.seg(put('xy', p0[0] * S, p0[1] * S), put('xy', p1[0] * S, p1[1] * S), PALE, 0.5);
    const src = trackPoint(track, st.mlS);
    dots.add(put('xy', src[0] * S, src[1] * S, 2), TEXT, 9);
    if (curves && lens) {
      for (const z of curves.critical) dots.add(put('xy', z[0] * S, z[1] * S, 1), BLUE, 2.5);
      for (const z of curves.caustic) dots.add(put('xy', z[0] * S, z[1] * S, 1), RED, 2.5);
      dots.add(put('xy', lens.z1 * S, 0, 1), GREY, 7);
      dots.add(put('xy', lens.z2 * S, 0, 1), GREY, 7);
      for (const im of binaryImages(lens, src)) dots.add(put('xy', im.z[0] * S, im.z[1] * S, 3), GOLD, Math.min(26, 5 + 5 * Math.sqrt(Math.abs(im.mu))));
    } else {
      dots.add(put('xy', 0, 0, 1), GREY, 7);
      const u = Math.hypot(src[0], src[1]);
      const { plus, minus } = pointImages(u);
      const ux = u > 0 ? src[0] / u : 1;
      const uy = u > 0 ? src[1] / u : 0;
      const mu = (t: number) => 1 / Math.abs(1 - 1 / t ** 4);
      for (const t of [plus, minus]) dots.add(put('xy', t * ux * S, t * uy * S, 3), GOLD, Math.min(26, 5 + 5 * Math.sqrt(mu(t))));
    }
    lines.commit();
    dots.commit();
  }, [st.mlX, st.mlY, st.mlAngle, st.mlS, curves, lens, lines, dots]);
  return (
    <>
      <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.material} frustumCulled={false} renderOrder={4} />
    </>
  );
}

/** Units per Gly on the grid. */
const GLY = 3;

/** The comoving (or proper) grid with galaxies, horizons, the Hubble sphere and one photon on its way to us. */
export function CosmosExhibit() {
  const st = useExhibit((s) => s);
  const p: Cosmos = { H0: st.H0, om: st.om, ol: st.ol, or: st.or };
  const tH = hubbleTimeGyr(st.H0);
  const h = useMemo(() => history({ H0: st.H0, om: st.om, ol: st.ol, or: st.or }, 3), [st.H0, st.om, st.ol, st.or]);
  const tEndGyr = (h.t[h.t.length - 1] - (h.infinitePast ? h.t[0] : 0)) * tH;
  useClock('frwT', 1.2, 0.05, Math.max(1, tEndGyr), 1.5);
  const lines = useMemo(() => lineBuffer(30000, false, false), []);
  const dots = useMemo(() => dotBuffer(2000, false), []);
  useMemo(() => {
    lines.reset();
    dots.reset();
    const t = st.frwT / tH + (h.infinitePast ? h.t[0] : 0);
    const a = at(h, t, 'a');
    const eta = at(h, t, 'eta');
    const adot = at(h, t, 'adot');
    const k = st.frwProper ? a : 1;
    const R = 60; // Gly, comoving extent of the grid
    for (let g = -R; g <= R; g += 10) {
      lines.seg(put('xy', g * k * GLY, -R * k * GLY), put('xy', g * k * GLY, R * k * GLY), GREY, 0.14);
      lines.seg(put('xy', -R * k * GLY, g * k * GLY), put('xy', R * k * GLY, g * k * GLY), GREY, 0.14);
      for (let q = -R; q <= R; q += 10) dots.add(put('xy', g * k * GLY, q * k * GLY, 1), PALE, 3.5);
    }
    dots.add(put('xy', 0, 0, 2), BLUE, 9);
    const ring = (chi: number, c: readonly number[], alpha: number, dashed: boolean) => {
      if (Number.isFinite(chi) && chi > 0 && chi * k * tH < 400) circle(lines, 'xy', 0, 0, chi * k * tH * GLY, c, alpha, dashed);
    };
    if (!h.infinitePast) ring(eta, GOLD, 0.9, false); // particle horizon
    if (Number.isFinite(h.etaEnd)) ring(h.etaEnd - eta, RED, 0.8, true); // event horizon
    if (adot > 0) ring(1 / adot, BLUE, 0.6, true); // Hubble sphere, comoving c/(aH) = c/ȧ
    // The galaxy at redshift z today and its photon, on the +x axis.
    const chiG = comovingDistance(p, st.frwZ);
    dots.add(put('xy', chiG * k * tH * GLY, 0, 2), RED, 10);
    const etaE = h.eta0 - chiG;
    if (eta >= etaE && eta <= h.eta0) {
      const x = chiG - (eta - etaE);
      lines.seg(put('xy', x * k * tH * GLY, 0, 1.5), put('xy', chiG * k * tH * GLY, 0, 1.5), GOLD, 0.6, 0.15);
      dots.add(put('xy', x * k * tH * GLY, 0, 3), GOLD, 8);
    }
    lines.commit();
    dots.commit();
  }, [st.frwT, st.frwProper, st.frwZ, h, tH, lines, dots, p]);
  return (
    <>
      <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.material} frustumCulled={false} renderOrder={4} />
    </>
  );
}

/** The collapsing ball in areal radius: surface, dust shells, r = 2M, event and apparent horizons. */
export function CollapseExhibit() {
  const R0 = useExhibit((s) => s.osR0);
  const f = useExhibit((s) => s.osTau);
  useClock('osTau', 0.08, 0, 1, 0.25);
  const lines = useMemo(() => lineBuffer(8000, false, false), []);
  const S = 110 / R0;
  useMemo(() => {
    lines.reset();
    const s = star(1, R0);
    const eta = etaAtTau(s, f * tauOf(s, Math.PI));
    const r = radiiAt(s, eta);
    circle(lines, 'xy', 0, 0, 2 * S, GOLD, 0.6, true);
    for (let k = 1; k <= 4; k++) circle(lines, 'xy', 0, 0, shellRadius(s, eta, (s.chi0 * k) / 5) * S, GREY, 0.3);
    circle(lines, 'xy', 0, 0, r.surface * S, TEXT, 0.9);
    if (r.eh !== null && r.eh > 0) circle(lines, 'xy', 0, 0, r.eh * S, GOLD, 1);
    if (r.ah !== null && r.ah > 0) circle(lines, 'xy', 0, 0, r.ah * S, RED, 0.9, true);
    lines.commit();
  }, [R0, f, lines, S]);
  return <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} />;
}
