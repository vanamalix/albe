/**
 * The expanding universe: Ω sliders, a(t), and the spacetime diagram of Davis & Lineweaver (2004) in
 * proper or comoving distance, with the light cone, horizons, Hubble sphere and one galaxy whose light
 * reaches us although it recedes faster than light. From src/physics/cosmology.ts.
 */
import { useMemo } from 'react';
import { ageAt, at, E2, hasBigBang, history, hubbleTimeGyr, omegaK, particleHorizon, recession, superluminalRedshift, type Cosmos } from '../../physics/cosmology';
import { useDepth } from '../../state/depth';
import { exhibitStore, FRW_DEFAULTS, useExhibit } from '../../state/exhibit';
import { Axes, Choice, Live, Slider, fx, runs, type Frame } from './kit';

/** The smallest a that E² allows going back from today, for a universe with a bounce. */
function bounce(p: Cosmos): number {
  let a = 1;
  for (let k = 0; k < 4000; k++) {
    const next = a * 0.997;
    if (E2(next, p) <= 0) return a;
    a = next;
  }
  return a;
}

const PRESETS: [string, Partial<Cosmos>][] = [
  ['Planck 2018', FRW_DEFAULTS],
  ['Einstein-de Sitter', { om: 1, ol: 0, or: 0 }],
  ['de Sitter', { om: 0, ol: 1, or: 0 }],
  ['Closed, Ω_m = 2', { om: 2, ol: 0, or: 0 }],
  ['Open, Ω_m = 0.3', { om: 0.3, ol: 0, or: 0 }],
];

export default function CosmosPanel() {
  const st = useExhibit((s) => s);
  const depth = useDepth();
  const p: Cosmos = useMemo(() => ({ H0: st.H0, om: st.om, ol: st.ol, or: st.or }), [st.H0, st.om, st.ol, st.or]);
  const ok = useMemo(() => hasBigBang(p), [p]);
  const h = useMemo(() => (ok ? history(p, 3) : null), [p, ok]);
  const tH = hubbleTimeGyr(p.H0);
  // Rounding can leave −0.000 on a flat universe.
  const ok0 = Math.abs(omegaK(p)) < 5e-4 ? 0 : omegaK(p);
  const sliders = (
    <>
      <Slider id="frw-h0" label="H₀ (km/s/Mpc)" value={st.H0} min={50} max={80} step={0.1} show={st.H0.toFixed(1)} onChange={(v) => exhibitStore.set({ H0: v })} />
      <Slider id="frw-om" label="Ω_m, matter" value={st.om} min={0} max={2} step={0.005} show={st.om.toFixed(3)} onChange={(v) => exhibitStore.set({ om: v })} />
      <Slider id="frw-ol" label="Ω_Λ, dark energy" value={st.ol} min={-0.5} max={2} step={0.005} show={st.ol.toFixed(3)} onChange={(v) => exhibitStore.set({ ol: v })} />
      <Slider id="frw-or" label="Ω_r, radiation (log)" value={Math.log10(Math.max(st.or, 1e-6))} min={-6} max={-0.5} step={0.05} show={st.or < 1e-6 ? '0' : st.or.toExponential(1)} onChange={(v) => exhibitStore.set({ or: v <= -6 ? 0 : 10 ** v })} />
      <Slider id="frw-ok" label="Ω_k, curvature (sets Ω_Λ = 1 − Ω_m − Ω_r − Ω_k)" value={ok0} min={-1} max={1} step={0.005} show={ok0.toFixed(3)} onChange={(v) => exhibitStore.set({ ol: 1 - st.om - st.or - v })} />
      <div className="explain-actions">
        {PRESETS.map(([name, q]) => (
          <button key={name} className="btn small" onClick={() => exhibitStore.set({ ...q, frwT: 13.8 })}>
            {name}
          </button>
        ))}
      </div>
    </>
  );
  if (!h) {
    const amin = bounce(p);
    return (
      <section className="exhibit-panel tall" aria-label="Expanding universe controls">
        <strong>Expanding universe</strong>
        {sliders}
        <p className="tag-line approx">
          No big bang for these values: going back in time, H² = H₀²E²(a) reaches zero at a = {amin.toFixed(3)}, where the universe stops contracting and re-expands (a bounce). Nothing could then be seen beyond redshift{' '}
          {(1 / amin - 1).toFixed(2)}, yet the cosmic microwave background arrives from z ≈ 1100. Choose other values.
        </p>
      </section>
    );
  }
  const off = h.infinitePast ? h.t[0] : 0;
  const tEnd = (h.t[h.t.length - 1] - off) * tH;
  const tNow = (h.t0 - off) * tH;
  const t = Math.min(st.frwT, tEnd) / tH + off;
  const a = at(h, t, 'a');
  const eta = at(h, t, 'eta');
  const adot = at(h, t, 'adot');
  const r = recession(p, h, st.frwZ);
  const zSL = superluminalRedshift(p);
  const proper = st.frwProper;
  // Spacetime diagram series, in Gly against Gyr.
  const T = h.t.map((x) => (x - off) * tH);
  const D = (chi: number[], k: number) => (proper ? chi[k] * h.a[k] : chi[k]) * tH;
  const idx = h.t.map((_, k) => k);
  const back = h.eta.map((e) => h.eta0 - e);
  const cone = idx.map((k) => (h.t[k] <= h.t0 ? D(back, k) : NaN));
  // Infinite when the conformal time since a = 0 diverges, which can happen with a finite age (Milne).
  const particle = h.particleInfinite ? [] : idx.map((k) => D(h.eta, k));
  const event = Number.isFinite(h.etaEnd) ? idx.map((k) => D(h.eta.map((e) => h.etaEnd - e), k)) : [];
  const hubble = idx.map((k) => (h.adot[k] > 0 ? (proper ? h.a[k] / h.adot[k] : 1 / h.adot[k]) * tH : NaN));
  const galaxy = idx.map((k) => (proper ? h.a[k] : 1) * r.chi * tH);
  const etaE = h.eta0 - r.chi;
  const photon = idx.map((k) => (h.eta[k] >= etaE && h.t[k] <= h.t0 ? (proper ? h.a[k] : 1) * (r.chi - (h.eta[k] - etaE)) * tH : NaN));
  const xMax = Math.min(120, Math.max(20, 1.25 * Math.max(r.chi * tH, !h.particleInfinite ? h.eta0 * tH : 0, (h.etaEnd - h.eta0) * tH || 0)));
  const f: Frame = { x0: 0, x1: Number.isFinite(xMax) ? xMax : 60, y0: 0, y1: tEnd };
  const xt = [0, 1, 2, 3, 4].map((k) => Math.round((k * f.x1) / 4));
  const yt = [0, 1, 2, 3].map((k) => Math.round((k * tEnd) / 3));
  const fa: Frame = { x0: 0, x1: tEnd, y0: 0, y1: Math.max(1.2, Math.min(8, Math.max(...h.a) * 1.05)) };
  const lines: [string, number[], string][] = [
    ['gold', particle, 'Particle horizon'],
    ['red dash', event, 'Event horizon'],
    ['blue dash', hubble, 'Hubble sphere'],
    ['pale', cone, 'Our past light cone'],
    ['grey', galaxy, `Galaxy at z = ${st.frwZ.toFixed(1)}`],
    ['gold thick', photon, 'Its light'],
  ];
  return (
    <section className="exhibit-panel tall" aria-label="Expanding universe controls">
      <strong>Expanding universe</strong>
      <p className="ref">
        {depth === 'words'
          ? 'Galaxies are not flying apart through space: space between them grows, and they sit still on the comoving grid. Far enough away the distance grows faster than light can cross it, yet light from some of those galaxies still reaches us, because the stretching slows relative to the distance as the universe ages.'
          : depth === 'numbers'
            ? `With these values the universe is ${fx(ageAt(p, 1) * tH, 2)} Gyr old. Galaxies beyond z = ${fx(zSL, 2)} recede faster than light today; the one at z = ${st.frwZ.toFixed(1)} is ${fx(r.chi * tH, 1)} Gly away and recedes at ${fx(r.vNow, 2)}c, yet we see it.`
            : 'H² = H₀²(Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_k a⁻² + Ω_Λ), Ω_k = 1 − ΣΩ. Proper distance D = aχ for comoving χ, so Ḋ = HD: Hubble’s law is exact, and v > c is no paradox, it is not motion through space. Light moves at dχ = c dt/a; a photon’s proper distance obeys Ḋ = HD − c, so it recedes until it crosses the Hubble sphere D = c/H. Horizons: particle, η(t) = ∫ c dt/a so far; event, ∫ c dt/a still to come.'}
      </p>
      {sliders}
      <Slider id="frw-t" label="Cosmic time shown" value={Math.min(st.frwT, tEnd)} min={0} max={tEnd} step={0.05} show={`${Math.min(st.frwT, tEnd).toFixed(2)} Gyr`} onChange={(v) => exhibitStore.set({ frwT: v })} />
      <Slider id="frw-z" label="Galaxy redshift z" value={st.frwZ} min={0.1} max={10} step={0.1} show={st.frwZ.toFixed(1)} onChange={(v) => exhibitStore.set({ frwZ: v })} />
      <div className="explain-actions">
        <button className="btn small" onClick={() => exhibitStore.set({ frwT: tNow })}>
          Today
        </button>
      </div>
      <Choice label="Distances" value={proper} options={[[true, 'Proper distance'], [false, 'Comoving distance']]} onChange={(v) => exhibitStore.set({ frwProper: v })} />
      <svg className="chart" viewBox="0 0 300 170" role="img" aria-label={`Spacetime diagram in ${proper ? 'proper' : 'comoving'} distance: light cone, horizons, Hubble sphere and the galaxy at z = ${st.frwZ.toFixed(1)}.`}>
        <Axes f={f} xLabel={`${proper ? 'proper' : 'comoving'} distance (Gly)`} yLabel="t (Gyr)" xTicks={xt} yTicks={yt} />
        {lines.flatMap(([cls, ys, name]) => runs(f, ys, T).map((pts, k) => <polyline key={`${name}${k}`} className={`series ${cls}`} points={pts} />))}
        {runs(f, [0, f.x1], [tNow, tNow]).map((pts) => (
          <polyline key="now" className="series now" points={pts} />
        ))}
        {runs(f, [0, f.x1], [st.frwT, st.frwT]).map((pts) => (
          <polyline key="shown" className="series shown" points={pts} />
        ))}
      </svg>
      <ul className="key">
        <li>
          <i className="swatch gold" /> Particle horizon
        </li>
        <li>
          <i className="swatch dash-red" /> Event horizon
        </li>
        <li>
          <i className="swatch dash-cyan" /> Hubble sphere
        </li>
        <li>
          <i className="swatch pale" /> Our past light cone
        </li>
        <li>
          <i className="swatch grey" /> The galaxy
        </li>
        <li>
          <i className="swatch thick-gold" /> Its light
        </li>
      </ul>
      <svg className="chart small" viewBox="0 0 300 170" role="img" aria-label={`Scale factor a(t); now a = 1 at ${fx(tNow, 2)} Gyr.`}>
        <Axes f={fa} xLabel="t (Gyr)" yLabel="a" xTicks={yt} yTicks={[0, 1, ...(fa.y1 > 3 ? [Math.floor(fa.y1)] : [])]} />
        {runs(fa, T, h.a).map((pts, k) => (
          <polyline key={k} className="series gold" points={pts} />
        ))}
        {runs(fa, [st.frwT, st.frwT], [0, fa.y1]).map((pts) => (
          <polyline key="shown" className="series shown" points={pts} />
        ))}
      </svg>
      <Live
        rows={[
          ['Age today', h.infinitePast ? '∞ (no beginning)' : `${fx(ageAt(p, 1) * tH, 3)} Gyr`],
          ['Fate', h.fate === 'crunch' ? `big crunch at ${fx(tEnd, 1)} Gyr` : Number.isFinite(h.etaEnd) ? 'expands forever, accelerating' : 'expands forever, decelerating'],
          [`At t = ${Math.min(st.frwT, tEnd).toFixed(2)} Gyr: a, H`, `${fx(a, 3)} · ${fx((p.H0 * adot) / a, 1)} km/s/Mpc`],
          ['Particle horizon then (proper)', h.particleInfinite ? '∞' : `${fx(particleHorizon(h, t) * tH, 2)} Gly`],
          ['Event horizon then (proper)', Number.isFinite(h.etaEnd) ? `${fx(a * (h.etaEnd - eta) * tH, 2)} Gly` : 'none'],
          ['Hubble radius c/H then', adot > 0 ? `${fx((a / adot) * tH, 2)} Gly` : '—'],
          ['Receding faster than light today beyond', `z = ${fx(zSL, 3)}`],
          [`Galaxy at z = ${st.frwZ.toFixed(1)}: distance now`, `${fx(r.chi * tH, 2)} Gly`],
          ['Its recession now · when the light left', `${fx(r.vNow, 3)}c · ${fx(r.vEmit, 3)}c`],
          ['Distance when the light left · light’s farthest from us', `${fx(r.dEmit * tH, 2)} · ${fx(r.dPhotonMax * tH, 2)} Gly`],
        ]}
      />
      {r.vNow > 1 && (
        <p className="ref">
          This galaxy recedes at {fx(r.vNow, 2)}c today{r.vEmit > 1 ? ` and at ${fx(r.vEmit, 2)}c when the light left it` : ''}, yet its light reaches us: the light first moved away from us in proper distance, out to {fx(r.dPhotonMax * tH, 2)} Gly, and turned
          toward us once the Hubble sphere grew past it.
        </p>
      )}
      <p className="tag-line exact">
        Exact for a perfectly uniform universe (FRW). Tests: Einstein-de Sitter (age 2/3H₀, horizon 2c/H₀), de Sitter (no beginning, event horizon c/H₀), radiation, open matter, flat ΛCDM ages against closed forms, and the closed Ω_m = 2
        crunch at 2π/H₀. Ages match the closed forms to 10⁻⁸/H₀; the future (RK4) gives horizons to about 10⁻³.
      </p>
      <p className="tag-line approx">
        It cannot be mixed with albe’s masses: FRW assumes the same density everywhere, and a hole or star placed in it is not a solution of the same equations. A bound system does not expand with the grid at all; joining the two needs a
        different exact solution (Einstein-Straus, a vacuum region cut out and matched). Radiation here treats the three neutrinos as massless; Planck’s fit gives one a small mass.
      </p>
    </section>
  );
}
