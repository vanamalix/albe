/** Sliders and live numbers for the wormhole and Kerr exhibits. Every figure comes from a tested physics module. */
import type { CSSProperties, ReactNode } from 'react';
import { extractable, omega, penroseDecay, penroseMaxGain, rIsco, rMarginallyBound, rPhoton, rPlus, R_ERGO_EQUATOR, criticalImpact } from '../physics/kerr';
import { crossingSweep, ellisJupiters, ellisTide, reflectDeflection, wormholeFate } from '../physics/wormhole';
import { exhibitStore, penroseMinSpin, useExhibit, type ExhibitId } from '../state/exhibit';

const panel: CSSProperties = {
  position: 'absolute',
  right: 'var(--gutter)',
  top: 'calc(var(--safe-top) + 58px)',
  width: 300,
  maxWidth: 'calc(100vw - 2 * var(--gutter))',
  padding: 14,
  zIndex: 6,
  background: 'var(--panel)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  color: 'var(--text)',
  font: '13px/1.45 system-ui',
};
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12 };
const sub: CSSProperties = { color: 'var(--muted)', fontSize: 12, marginTop: 8 };

function Slider({ label, value, min, max, step, onChange, display }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void; display: string }) {
  return (
    <label style={{ display: 'block', marginTop: 8 }}>
      <span style={row}>
        <span>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--muted)' }}>{display}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} style={{ width: '100%' }} />
    </label>
  );
}

const Fig = ({ k, v }: { k: ReactNode; v: ReactNode }) => (
  <div style={row}>
    <span style={{ color: 'var(--muted)' }}>{k}</span>
    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{v}</span>
  </div>
);

const Tag = ({ exact, children }: { exact: boolean; children: ReactNode }) => (
  <p style={{ ...sub, color: exact ? 'var(--exact)' : 'var(--approx)', margin: '8px 0 0' }}>{children}</p>
);

const fmt = (v: number, d = 3): string => (Number.isFinite(v) ? v.toFixed(d) : '∞');

function WormholePanel() {
  const b = useExhibit((s) => s.b);
  const aim = useExhibit((s) => s.aim);
  const speed = useExhibit((s) => s.speed);
  const fate = wormholeFate(aim * b, b);
  const sweep = fate === 'cross' ? crossingSweep(aim * b, b) : reflectDeflection(aim * b, b);
  const tideAtThroat = ellisTide(0, 1, speed);
  return (
    <section style={panel} aria-label="Wormhole controls">
      <strong>Ellis wormhole</strong>
      <Slider label="Throat radius b" value={b} min={8} max={60} step={1} display={`${b}`} onChange={(v) => exhibitStore.set({ b: v })} />
      <Slider label="Aim, h / b" value={aim} min={-1.8} max={1.8} step={0.01} display={aim.toFixed(2)} onChange={(v) => exhibitStore.set({ aim: v })} />
      <Slider label="Traveller speed" value={speed} min={0.1} max={0.99} step={0.01} display={`${speed.toFixed(2)} c`} onChange={(v) => exhibitStore.set({ speed: v })} />
      <div style={{ marginTop: 10 }}>
        <Fig k="Fate" v={fate === 'cross' ? 'through the throat' : fate === 'reflect' ? 'turned back' : 'wound on the throat'} />
        <Fig k={fate === 'cross' ? 'Sweep Δφ' : 'Bending'} v={`${fmt((sweep * 180) / Math.PI, 2)}°`} />
        <Fig k="Tide at throat" v={`${fmt(tideAtThroat * 1, 3)}/b²`} />
        <Fig k="Energy for 1 m throat" v={`−${ellisJupiters(1).toFixed(2)} Jupiters`} />
      </div>
      <p style={sub}>Blue grid: universe A, where the rays start. Amber grid: universe B. Gold ring: the throat. Gold rays pass through, blue rays turn back.</p>
      <Tag exact>Exact: the catenoid (at true scale), every ray, and the bookkeeping above. Light and matter share a path; only the clocks differ, because g_tt = −1 means no gravity pulls on either.</Tag>
      <Tag exact={false}>The negative energy is what the equations demand, not a design. Nobody knows of a source for it in nature.</Tag>
    </section>
  );
}

function KerrPanel({ id }: { id: ExhibitId }) {
  const a = useExhibit((s) => s.spin);
  const decay = useExhibit((s) => s.decay);
  const rp = rPlus(a);
  const penrose = id === 'kerr-penrose';
  const spin = penrose ? Math.max(a, penroseMinSpin) : a;
  let body: ReactNode;
  if (penrose) {
    const rMb = rMarginallyBound(spin);
    const r = rMb + decay * (R_ERGO_EQUATOR - rMb) * 0.98;
    const event = penroseDecay(r, spin);
    body = event ? (
      <>
        <Slider label="Decay radius" value={decay} min={0.02} max={1} step={0.01} display={`r = ${r.toFixed(3)} M`} onChange={(v) => exhibitStore.set({ decay: v })} />
        <div style={{ marginTop: 10 }}>
          <Fig k="Parent energy" v="1.000" />
          <Fig k="Escaping fragment" v={<span style={{ color: 'var(--text)' }}>{event.out.E.toFixed(3)}</span>} />
          <Fig k="Captured fragment" v={event.captured.E.toFixed(3)} />
          <Fig k="Gain" v={`${(event.gain * 100).toFixed(1)}%`} />
          <Fig k="Ceiling at this spin" v={`${(penroseMaxGain(spin) * 100).toFixed(1)}%`} />
          <Fig k="Hole could still lose" v={`${(extractable(spin) * 100).toFixed(1)}% of its mass`} />
        </div>
        <p style={sub}>Gold: the parent, from far away. Pale: the escaping fragment. Blue: the negative-energy fragment, which falls in.</p>
        <Tag exact>Exact conservation of energy and momentum, on exact geodesics, with hole mass and spin held fixed. The fragments are massless and emitted along ±φ: Penrose’s idealised decay.</Tag>
        <Tag exact={false}>Bardeen, Press &amp; Teukolsky showed the required burst is far stronger than natural decays, so this is the principle, not an astrophysical engine. Needs a &gt; 0.83 for a parent from far away.</Tag>
      </>
    ) : <p style={sub}>No turning point inside the ergosphere at this spin.</p>;
  } else {
    body = (
      <>
        <div style={{ marginTop: 10 }}>
          <Fig k="Horizon" v={`${rp.toFixed(3)} M`} />
          <Fig k="Ergosphere (equator)" v="2.000 M" />
          <Fig k="ω at the horizon" v={`${omega(rp, a).toFixed(3)} /M`} />
          <Fig k="Photon orbit (pro / retro)" v={`${rPhoton(a, 1).toFixed(2)} / ${rPhoton(a, -1).toFixed(2)}`} />
          <Fig k="ISCO (pro / retro)" v={`${rIsco(a, 1).toFixed(2)} / ${rIsco(a, -1).toFixed(2)}`} />
          {id === 'kerr-light' && <Fig k="Captured impact range" v={`${criticalImpact(a, -1).toFixed(2)} … ${criticalImpact(a, 1).toFixed(2)}`} />}
        </div>
        <p style={sub}>Orange band: the ergosphere, 2M at the equator. Solid gold: horizon. Dashed gold: photon orbits. Dashed blue: ISCOs. Green dots: zero-angular-momentum observers, turning at ω(r).</p>
        <Tag exact>Exact equatorial geometry and geodesics for a test particle. The sheet is the true embedding of the slice, as for the single black hole, and the dots turn at exactly ω(r).</Tag>
        <Tag exact={false}>Only the equatorial plane is drawn. Spin is held fixed: particles do not act back on the hole.</Tag>
      </>
    );
  }
  return (
    <section style={panel} aria-label="Kerr black hole controls">
      <strong>{penrose ? 'Penrose process' : id === 'kerr-light' ? 'Light past a spinning hole' : 'Frame dragging'}</strong>
      <Slider label="Spin a / M" value={spin} min={penrose ? penroseMinSpin : 0} max={0.998} step={0.002} display={spin.toFixed(3)} onChange={(v) => exhibitStore.set({ spin: v })} />
      {body}
    </section>
  );
}

export function ExhibitPanel() {
  const id = useExhibit((s) => s.id);
  if (!id) return null;
  return id === 'wormhole' ? <WormholePanel /> : <KerrPanel id={id} />;
}
