/**
 * Oppenheimer-Snyder collapse on the Penrose diagram of the Clocks scene: the dust ball's interior
 * glued to the Kruskal exterior along its surface, with the event horizon growing from the centre and
 * the apparent horizon. From src/physics/collapse.ts and src/physics/kruskal.ts.
 */
import { useMemo } from 'react';
import { apparentHorizonChi, etaAtTau, kruskalChart, radiiAt, star, tauOf } from '../../physics/collapse';
import { compact } from '../../physics/kruskal';
import { useDepth } from '../../state/depth';
import { exhibitStore, useExhibit } from '../../state/exhibit';
import { Live, Slider, fx } from './kit';

const BIG = 1e12;

export default function CollapsePanel() {
  const R0 = useExhibit((s) => s.osR0);
  const f = useExhibit((s) => s.osTau);
  const depth = useDepth();
  const s = useMemo(() => star(1, R0), [R0]);
  const k = useMemo(() => kruskalChart(s), [s]);
  const tauEnd = tauOf(s, Math.PI);
  const tauForm = tauOf(s, s.etaForm);
  const tauCross = tauOf(s, s.etaCross);
  const tau = f * tauEnd;
  const eta = etaAtTau(s, tau);
  const r = radiiAt(s, eta);
  // Centred on the surface's horizon crossing, as the Clocks diagram is (a boost: same diagram).
  const Vc = k.surface(s.etaCross).V;
  const P = (U: number, V: number) => {
    const c = compact(U, V, 1 / Vc, Vc);
    return `${c.x.toFixed(4)},${(-c.y).toFixed(4)}`;
  };
  const span = (n: number, g: (t: number) => [number, number]) =>
    Array.from({ length: n + 1 }, (_, i) => g(i / n))
      .map(([U, V]) => P(U, V))
      .join(' ');
  const svg = useMemo(() => {
    const surfaceLine = span(200, (t) => {
      const q = k.surface(t * Math.PI);
      return [q.U, q.V];
    });
    const centre = span(200, (t) => {
      const q = k.interior(t * Math.PI, 0);
      return [q.U, q.V];
    });
    const sing = span(60, (t) => {
      const q = k.interior(Math.PI, t * s.chi0);
      return [q.U, q.V];
    });
    const s0 = k.surface(0);
    const start = span(60, (t) => {
      const q = k.interior(0, t * s.chi0);
      return [q.U, q.V];
    });
    const sEnd = k.surface(Math.PI);
    const extSing = span(200, (t) => {
      const V = sEnd.V * Math.exp(t * 30);
      return [1 / V, V];
    });
    const slice0 = span(120, (t) => {
      const V = s0.V * Math.exp(t * 30);
      return [-V, V];
    });
    const scri = span(120, (t) => [-Math.exp(30 - t * 60) * Vc, BIG]);
    const qf = k.interior(s.etaForm, 0);
    const eh = span(120, (t) => [0, qf.V * Math.exp(t * 30)]);
    const ah = span(80, (t) => {
      const e = s.etaCross + t * (Math.PI - s.etaCross);
      const q = k.interior(e, apparentHorizonChi(s, e) ?? 0);
      return [q.U, q.V];
    });
    const fill = `${centre} ${sing} ${surfaceLine.split(' ').reverse().join(' ')} ${start.split(' ').reverse().join(' ')}`;
    // Frame whatever is drawn (the boost that centres the crossing tilts the t = 0 slice).
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    for (const pts of [surfaceLine, centre, sing, start, extSing, slice0, eh])
      for (const pair of pts.split(' ')) {
        const [x, y] = pair.split(',').map(Number);
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
    const pad = 0.06;
    const box = `${(x0 - pad).toFixed(3)} ${(y0 - pad).toFixed(3)} ${(x1 - x0 + 2 * pad).toFixed(3)} ${(y1 - y0 + 2 * pad).toFixed(3)}`;
    const lab = (U: number, V: number) => compact(U, V, 1 / Vc, Vc);
    return { surfaceLine, centre, sing, start, extSing, slice0, scri, eh, ah, fill, qf, box, l1: lab(-0.6 / Vc, 4 * Vc), l2: lab(0.2 / Vc, 3 * Vc) };
  }, [k, s, Vc]);
  const nowSlice = span(40, (t) => {
    const q = k.interior(eta, t * s.chi0);
    return [q.U, q.V];
  });
  const here = k.surface(eta);
  const hp = compact(here.U, here.V, 1 / Vc, Vc);
  const fp = compact(svg.qf.U, svg.qf.V, 1 / Vc, Vc);
  return (
    <section className="exhibit-panel tall" aria-label="Collapse controls">
      <strong>Collapse to a black hole</strong>
      <p className="ref">
        {depth === 'words'
          ? 'A ball of dust with no pressure falls in on itself. The horizon is not something the surface reaches: it starts as a point at the centre, before the surface gets anywhere near, and grows outward. Its edge is the last light from the centre that would ever escape. It meets the surface just as the surface passes r = 2M, and then stays there.'
          : depth === 'numbers'
            ? `From rest at ${R0.toFixed(1)}M the surface reaches r = 2M after τ = ${fx(tauCross, 2)}M of the dust’s own time, and r = 0 at ${fx(tauEnd, 2)}M. The event horizon appeared at the centre at τ = ${fx(tauForm, 2)}M, ${fx(tauCross - tauForm, 2)}M earlier.`
            : 'Inside: closed dust FRW, a = (a_m/2)(1 + cos η), τ = (a_m/2)(η + sin η), a_m = √(R₀³/2M), sin χ₀ = √(2M/R₀); the surface χ₀ follows the Schwarzschild cycloid (Birkhoff). Light: dχ = ±dη. The surface crosses 2M at η_h = π − 2χ₀, so the event horizon is the ray χ = η − (π − 3χ₀): it leaves the centre at η = π − 3χ₀. Apparent horizon: a′ sin χ + a cos χ = 0, χ = (π − η)/2, where r = 2m(χ).'}
      </p>
      <Slider id="os-r0" label="Starting radius R₀" value={R0} min={4} max={30} step={0.5} show={`${R0.toFixed(1)} M`} onChange={(v) => exhibitStore.set({ osR0: v })} />
      <Slider id="os-tau" label="Dust’s proper time τ" value={f} min={0} max={1} step={0.002} show={`${fx(tau, 2)} M`} onChange={(v) => exhibitStore.set({ osTau: v })} />
      <svg className="plan kruskal collapse-plan" preserveAspectRatio="xMidYMid meet" viewBox={svg.box} role="img" aria-label={`Penrose diagram of the collapse. τ = ${fx(tau, 1)} M; the surface is at r = ${fx(r.surface, 2)} M; the event horizon ${r.eh !== null ? `has radius ${fx(r.eh, 2)} M` : 'has not formed'}.`}>
        <polygon className="star" points={svg.fill} />
        <polyline className="edge" points={svg.scri} />
        <polyline className="edge" points={svg.slice0} />
        <polyline className="horizon" points={svg.eh} />
        <polyline className="singular" points={svg.extSing} />
        <polyline className="singular" points={svg.sing} />
        <polyline className="centre-line" points={svg.centre} />
        <polyline className="apparent" points={svg.ah} />
        <polyline className="surface" points={svg.surfaceLine} />
        <polyline className="now" points={nowSlice} />
        <circle className="clock" cx={hp.x} cy={-hp.y} r={0.03} />
        <circle className="form" cx={fp.x} cy={-fp.y} r={0.03} />
        <text x={svg.l1.x} y={-svg.l1.y}>
          I
        </text>
        <text x={svg.l2.x} y={-svg.l2.y}>
          II
        </text>
      </svg>
      <ul className="key wide">
        <li>
          <i className="swatch grey" /> Star (shaded); white line: its surface, dot: now · blue: the dust’s “now”, η = const
        </li>
        <li>
          <i className="swatch dash-gold" /> Event horizon, from the gold dot at the centre · <i className="swatch dash-red" /> r = 0 · <i className="swatch red" /> apparent horizon (inside)
        </li>
      </ul>
      <Live
        rows={[
          ['τ now', `${fx(tau, 2)} M`],
          ['Surface r', `${fx(r.surface, 3)} M`],
          ['Event horizon r', r.eh !== null ? `${fx(r.eh, 3)} M` : 'not yet formed'],
          ['Apparent horizon r', r.ah !== null ? `${fx(r.ah, 3)} M` : eta >= s.etaCross ? 'at 2M, outside' : 'none yet'],
          ['Event horizon forms at the centre', `τ = ${fx(tauForm, 2)} M`],
          ['Surface crosses r = 2M', `τ = ${fx(tauCross, 2)} M`],
          ['Whole ball at r = 0', `τ = ${fx(tauEnd, 2)} M`],
        ]}
      />
      <p className="ref">
        The diagram is the Clocks scene’s, Ũ = arctan U, Ṽ = arctan V, now with a star in it: regions III and IV of the eternal hole are gone, covered by the star’s interior on the left. The vertical left edge is the star’s centre,
        r = 0 but regular. Inside the star the drawing is a choice: any map that keeps light at 45° and joins the outside along the surface would do, and near the top left (light from the centre meeting r = 0) it is extended by hand. A
        distant observer never sees the surface cross 2M: its light arrives ever more redshifted.
      </p>
      <p className="tag-line exact">
        Exact for a uniform ball of pressureless dust, inside and out. Tests: the surface’s cycloid against kruskal.ts, the event horizon as a light ray integrated from the centre, the apparent horizon as zero expansion with r = 2m, and
        the Misner-Sharp mass from the metric.
      </p>
      <p className="tag-line approx">
        Real stars have pressure: it holds them up until the core passes the maximum neutron-star mass, and then shocks, bounces and outflows replace this neat cycloid, though once a trapped surface forms Penrose’s theorem still guarantees a
        singularity, and cosmic censorship (unproved) says a horizon hides it. Real stars spin: the outside settles to Kerr, and no exact collapse solution is known. Uneven dust (Lemaître-Tolman-Bondi) can even form a singularity seen from outside before a horizon covers it.
      </p>
    </section>
  );
}
