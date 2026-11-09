import { useCallback, useEffect, useMemo, useRef } from 'react';
import { BODY_TYPES, bodyType } from './physics/bodies';
import { MAX_SHADER_MASSES, VIEW_MODES, type ViewMode } from './physics/fields';
import { lensNote } from './physics/lens';
import { kickKmPerSecond, pairOrbit } from './physics/nbody';
import { PRESETS, presetById, surpriseScene, type SceneGroup } from './physics/presets';
import { circularClockRate } from './physics/probes';
import { rotationCurve } from './physics/swarm';
import { isBlackHole, isCompact } from './physics/types';
import { requestCamera, requestStep, Scene, setLabelLayer } from './scene/Scene';
import { WarpPanel } from './scene/warpView';
import { world } from './sim/world';
import { massFromLog, store, TOOLS, useStore, type Settings, type Tool } from './state/store';
import { About } from './ui/About';
import { ExhibitPanel } from './ui/ExhibitPanel';
import { SiteFoot } from './ui/SiteFoot';
import { openExhibit, useExhibit } from './state/exhibit';
import { IconChevron, IconClear, IconClose, IconFrame, IconInfo, IconLayers, IconPause, IconPlay, IconReset, IconSliders, IconStep, toolIcons } from './ui/icons';

const MODE_LABEL: Record<ViewMode, string> = { space: 'Space', time: 'Time', tidal: 'Tidal', waves: 'Waves', lattice: 'Lattice', lens: 'Lens', warp: 'Warp' };

/** Short titles and one-line pitches for the scene picker (the full notes appear once loaded). */
const SCENE_COPY: Record<string, { title: string; blurb: string }> = {
  single: { title: 'Single black hole', blurb: 'Precessing orbits, photon sphere and ISCO' },
  clocks: { title: 'Black hole clocks', blurb: 'Time runs slower the closer you get' },
  mercury: { title: 'Mercury precession', blurb: 'Einstein’s first test, exaggerated about 10⁶×' },
  binary: { title: 'Binary inspiral', blurb: 'Two black holes radiate and merge' },
  chirp: { title: 'Gravitational waves', blurb: 'Ripples spread as an orbit collapses' },
  eccentric: { title: 'Precessing binary', blurb: 'An elongated orbit turns as it decays' },
  eight: { title: 'Figure-eight', blurb: 'Three equal masses on one shared path' },
  butterfly: { title: 'Butterfly', blurb: 'A periodic orbit found by computer search' },
  moth: { title: 'Moth', blurb: 'Three loops that close after one period' },
  yinyang: { title: 'Yin-yang', blurb: 'Two paths twisted round each other' },
  lagrange: { title: 'Lagrange triangle', blurb: 'An exact solution that cannot last' },
  burrau: { title: 'Pythagorean problem', blurb: 'Chaos, with a twin to prove it' },
  trojans: { title: 'Trojan asteroids', blurb: 'Stable clouds 60° from Jupiter' },
  solar: { title: 'Inner solar system', blurb: 'Mercury to Jupiter, true orbits' },
  outer: { title: 'Outer solar system', blurb: 'The giants, at true distances' },
  trappist: { title: 'TRAPPIST-1', blurb: 'Seven planets in a resonant chain' },
  zoo: { title: 'Star zoo', blurb: 'Every kind of star, side by side' },
  sirius: { title: 'Sirius A and B', blurb: 'A star and its white dwarf' },
  kilonova: { title: 'Neutron star merger', blurb: 'Two dead stars collide' },
  tde: { title: 'Star meets black hole', blurb: 'A star torn apart by tides' },
  spiral: { title: 'Spiral galaxy', blurb: '6,000 stars grow their own arms' },
  antennae: { title: 'Galaxy collision', blurb: 'Two disks raise long tidal tails' },
  stream: { title: 'Tidal stream', blurb: 'A satellite galaxy unwinds' },
  cluster: { title: 'Galaxy cluster', blurb: 'Twenty-six galaxies fall together' },
  surprise: { title: 'Surprise', blurb: 'A system dealt at random' },
  warp: { title: 'Alcubierre warp bubble', blurb: 'Theoretical: needs negative energy' },
  wormhole: { title: 'Ellis wormhole', blurb: 'Light and matter through a throat' },
  'kerr-drag': { title: 'Frame dragging', blurb: 'A spinning hole sweeps space round' },
  'kerr-penrose': { title: 'Penrose process', blurb: 'Stealing energy from black-hole spin' },
  'kerr-light': { title: 'Light past a spinning hole', blurb: 'A lopsided capture window' },
  lensing: { title: 'Lensing fan', blurb: 'A fan of light bends around a mass' },
  photon: { title: 'Photon sphere', blurb: 'Light caught orbiting a black hole' },
  empty: { title: 'Empty space', blurb: 'Flat spacetime: build your own' },
};

const LEGENDS: Partial<Record<ViewMode, { cls: string; low: string; high: string; label: string }>> = {
  space: { cls: 'ramp-space', low: 'flat', high: 'deep', label: 'Depth of the well' },
  time: { cls: 'ramp-time', low: 'clocks normal', high: 'clocks slow', label: 'Clock rate' },
  tidal: { cls: 'ramp-tidal', low: 'gentle', high: 'extreme', label: 'Tidal curvature (log scale)' },
  waves: { cls: 'ramp-waves', low: 'trough', high: 'crest', label: 'Wave height (scaled to be visible)' },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function loadPreset(id: string): void {
  const p = presetById(id);
  world.loadPreset(p);
  const st = p.settings;
  openExhibit(st.exhibit ?? null);
  store.set((s) => ({
    presetId: p.id,
    note: p.note,
    timeScale: st.timeScale,
    mode: st.mode ?? s.mode,
    gr: st.gr ?? s.gr,
    gw: st.gw ?? false,
    pn: st.pn ?? true,
    rings: st.rings ?? s.rings,
    playing: !st.paused,
    darkMatter: true,
    selectedId: null,
    scenesOpen: false,
  }));
}

/** Switching scene from the UI also flies the camera back, wherever it had wandered. */
function openPreset(id: string): void {
  loadPreset(id);
  requestCamera('home', presetById(id).settings.view ?? 1);
}

/** Deals a new random system. */
function openSurprise(): void {
  surpriseScene(Math.floor(Math.random() * 2 ** 31));
  openPreset('surprise');
}

function clearAll(): void {
  world.clear();
  openExhibit(null);
  const empty = presetById('empty');
  store.set({ mode: store.get().mode === 'warp' ? 'space' : store.get().mode, selectedId: null, presetId: empty.id, note: empty.note, timeScale: empty.settings.timeScale, gr: true, gw: false, pn: true, rings: true, darkMatter: true, playing: true, scenesOpen: false });
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2'); // three.js and the sheet's shaders both need WebGL 2
  } catch {
    return false;
  }
}

function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2).replace('e', '×10^').replace('^+', '^');
  return v.toFixed(digits);
}

function modeNote(mode: ViewMode, nBodies: number, exag: number): { title: string; body: string; tag: string } {
  const multi = nBodies > 1;
  const note = baseModeNote(mode, nBodies, exag, multi);
  // The "exact" claims are about black holes. Anything else on the sheet qualifies them.
  const curved = mode === 'space' || mode === 'time' || mode === 'tidal';
  const plain = { ...note, body: note.body.replace(', drawn to true scale', '') };
  if (curved && world.bodies.some((b) => b.kind === 'galaxy')) return { ...plain, tag: 'schematic: a galaxy is drawn as a uniform sphere' };
  if (curved && world.bodies.some((b) => !isBlackHole(b))) return { ...plain, tag: 'exterior formula, uniform sphere inside, sizes compressed' };
  if (curved && world.bodies.some((b) => b.spin)) return { ...note, tag: 'Schwarzschild: this remnant’s spin is not drawn' };
  return note;
}

function baseModeNote(mode: ViewMode, nBodies: number, exag: number, multi: boolean): { title: string; body: string; tag: string } {
  switch (mode) {
    case 'lens':
      return lensNote(world.bodies, MAX_SHADER_MASSES);
    case 'warp':
      return { title: 'Alcubierre metric · York time', body: 'Height and colour show θ = v_s (x_s/r_s) df/dr_s, or the Eulerian energy density T⁰⁰. Both are normalised to their peak; v_s only scales the numbers.', tag: 'field normalised to its peak' };
    case 'space':
      return {
        title: 'Space curvature · Flamm paraboloid',
        body: `z(r) = 2√(r_s(r − r_s)), the shape of the t = const equatorial slice${exag === 1 ? ', drawn to true scale' : ` (depth ×${exag.toFixed(2)})`}.`,
        tag: multi ? 'weak-field superposition (approximate)' : 'exact for one mass',
      };
    case 'time':
      return {
        title: 'Time curvature · lapse √(−g_tt)',
        body: 'Height ∝ Φ, colour = clock rate dτ/dt = √(1 + 2Φ). For slow particles it is this curvature of time, not of space, that drives the motion.',
        tag: multi ? 'superposed (approximate)' : 'exact for one mass',
      };
    case 'tidal':
      return {
        title: 'Tidal curvature · Kretschmann scalar',
        body: 'Colour = log₁₀ of K = 48M²/r⁶: a coordinate-free measure of where spacetime is strongly curved.',
        tag: multi ? 'summed (approximate)' : 'exact for one mass',
      };
    case 'waves':
      return {
        title: 'Gravitational waves · quadrupole',
        body: nBodies > 1 ? 'What an observer in the orbital plane would measure, h₊ = −Ï_tt(t − r)/r: ripples leave the masses at the speed of light.' : 'Waves need moving masses. Try the Gravitational waves scene, or place two masses in orbit.',
        tag: 'quadrupole approximation, amplitude scaled',
      };
    default:
      return { title: '3D lattice warp', body: 'Grid lines pulled toward each mass.', tag: 'illustrative only' };
  }
}

function Toggle({ k, label, desc }: { k: keyof Settings; label: string; desc?: string }) {
  const v = useStore((s) => s[k] as boolean);
  return (
    <label className="toggle">
      <input type="checkbox" checked={v} onChange={(e) => store.set({ [k]: e.target.checked } as Partial<Settings>)} />
      <span className="switch" aria-hidden="true" />
      <span className="toggle-text">
        {label}
        {desc && <small>{desc}</small>}
      </span>
    </label>
  );
}

function SettingsPanel() {
  const timeScale = useStore((s) => s.timeScale);
  const exag = useStore((s) => s.exaggeration);
  const lens = useStore((s) => s.mode === 'lens');
  return (
    <aside className="panel settings" aria-label="Display and physics settings">
      <header className="panel-head">
        <h2>Settings</h2>
        <button className="icon-btn" aria-label="Close settings" onClick={() => store.set({ settingsOpen: false })}>
          <IconClose />
        </button>
      </header>
      <div className="slider-row">
        <label htmlFor="ts">
          Time scale <output>{timeScale.toFixed(0)} M/s</output>
        </label>
        <input id="ts" type="range" min={0} max={4} step={0.01} value={Math.log10(timeScale)} onChange={(e) => store.set({ timeScale: Math.pow(10, +e.target.value) })} />
      </div>
      <div className="slider-row">
        <label htmlFor="ex">
          {lens ? 'Lens distance' : 'Depth exaggeration'} <output>×{exag.toFixed(2)}</output>
        </label>
        <input id="ex" type="range" min={0.25} max={4} step={0.05} value={exag} onChange={(e) => store.set({ exaggeration: +e.target.value })} />
      </div>
      <Toggle k="follow" label="Follow the masses" desc="camera tracks their centre of mass; panning turns it off" />
      <Toggle k="labels" label="Names" desc="planets, stars and galaxies" />
      <Toggle k="darkMatter" label="Dark matter" desc="off = stars no longer feel their halo; galaxies still pull on each other" />
      <Toggle k="gr" label="GR test particles" desc="off = Newtonian (closed ellipses)" />
      <Toggle k="pn" label="Relativistic masses" desc="first post-Newtonian (EIH): orbits precess" />
      <Toggle k="gw" label="Gravitational radiation" desc="2.5PN: orbits decay and merge" />
      <Toggle k="grid" label="Grid lines" />
      <Toggle k="trails" label="Trails" />
      <Toggle k="rings" label="Photon sphere & ISCO" desc="3M dashed gold · 6M dashed cyan" />
      <Toggle k="arrows" label="Velocity arrows" />
    </aside>
  );
}

/** What a circular orbit would do here. Exact around one mass. */
function orbitNote(ratio: number, m: number, r: number): string {
  if (ratio <= 3) return 'impossible';
  const clock = circularClockRate(m, r).toFixed(3);
  return ratio < 6 ? `unstable · clock ${clock}` : `stable · clock ${clock}`;
}

function Readout() {
  const r = useStore((s) => s.readout);
  const mode = useStore((s) => s.mode);
  if (!r || mode === 'warp') return null;
  return (
    <div className="readout" aria-live="off">
      <div>
        <span>x, y</span>
        <b>
          {r.x.toFixed(1)}, {r.y.toFixed(1)}
        </b>
      </div>
      {Number.isFinite(r.r) && (
        <div>
          <span>r to nearest</span>
          <b>
            {r.r.toFixed(1)} {r.hole && <small>({(r.r / r.m).toFixed(1)} M)</small>}
          </b>
        </div>
      )}
      <div>
        <span>Φ</span>
        <b>{fmt(r.phi, 4)}</b>
      </div>
      <div>
        <span>dτ/dt</span>
        <b>{r.insideHorizon ? 'inside r_s' : fmt(r.lapse, 4)}</b>
      </div>
      <div>
        <span>K</span>
        <b>{fmt(r.kretschmann)}</b>
      </div>
      {Number.isFinite(r.r) && r.hole && !r.insideHorizon && (
        <div>
          <span>Circular orbit</span>
          <b>{orbitNote(r.r / r.m, r.m, r.r)}</b>
        </div>
      )}
    </div>
  );
}

function Selection() {
  const id = useStore((s) => s.selectedId);
  useStore((s) => s.stats); // refresh a few times per second
  const b = world.bodyById(id);
  if (!b) return null;
  return (
    <div className="selection card" role="region" aria-label="Selected mass">
      <div className="sel-text">
        <b>
          {b.name ?? bodyType(b.typeId ?? 'bh').label} · M = {b.m < 0.01 ? b.m.toExponential(1) : b.m.toFixed(2)}
        </b>
        <small>
          {b.kind === 'galaxy' ? `halo to r = ${(b.radius ?? 0).toFixed(0)}` : `r_s = ${(2 * b.m).toFixed(2)}`} · |v| = {Math.hypot(b.vx, b.vy).toFixed(3)}{b.kind === 'galaxy' ? '' : 'c'}
          {b.spin ? ` · spin ${b.spin.toFixed(2)}` : ''}
        </small>
      </div>
      <button
        className="btn danger"
        onClick={() => {
          world.removeBody(b.id);
          store.set({ selectedId: null });
        }}
      >
        Delete
      </button>
      <button className="icon-btn" aria-label="Deselect" onClick={() => store.set({ selectedId: null })}>
        <IconClose />
      </button>
    </div>
  );
}

function Swatch({ id }: { id: string }) {
  const t = bodyType(id);
  if (t.kind === 'bh') return <i className="dot-swatch bh" />;
  if (t.kind === 'galaxy') return <i className="dot-swatch galaxy" />;
  const [r, g, b] = (t.color ?? [1, 1, 1]).map((c) => Math.round(c * 255));
  return <i className="dot-swatch" style={{ background: `rgb(${r}, ${g}, ${b})` }} />;
}

function MassOption() {
  const logMass = useStore((s) => s.logMass);
  const id = useStore((s) => s.bodyType);
  const t = bodyType(id);
  const m = massFromLog(logMass);
  return (
    <div className="tool-option mass-picker card">
      <div className="type-grid" role="group" aria-label="What to place">
        {BODY_TYPES.map((x) => (
          <button key={x.id} className={`type-chip ${x.id === id ? 'on' : ''}`} aria-pressed={x.id === id} title={x.blurb} onClick={() => store.set({ bodyType: x.id })}>
            <Swatch id={x.id} />
            {x.label}
          </button>
        ))}
      </div>
      {t.kind === 'bh' ? (
        <div className="mass-slider">
          <label htmlFor="mass">
            Mass <output>M = {m < 1 ? m.toFixed(2) : m.toFixed(1)}</output> <small>r_s = {(2 * m).toFixed(2)}</small>
          </label>
          <input id="mass" type="range" min={-1} max={1} step={0.01} value={logMass} onChange={(e) => store.set({ logMass: +e.target.value })} />
        </div>
      ) : (
        <p className="type-blurb">{t.blurb}</p>
      )}
    </div>
  );
}

/** Measured rotation speed against radius, beside what the visible stars alone would produce. */
function RotationScope() {
  useStore((s) => s.stats);
  const dark = useStore((s) => s.darkMatter);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    const host = world.bodies.find((b) => b.kind === 'galaxy');
    if (!c || !g || !host) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth * dpr;
    const h = c.clientHeight * dpr;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    g.clearRect(0, 0, w, h);
    const curve = rotationCurve(world.swarm, host.x, host.y, (host.radius ?? 200) * 0.6, 28);
    const peak = Math.max(1e-6, ...curve.v.filter(Number.isFinite), ...curve.luminous) * 1.1;
    const line = (ys: number[], colour: string, dash: number[]) => {
      g.strokeStyle = colour;
      g.setLineDash(dash.map((d) => d * dpr));
      g.lineWidth = 1.75 * dpr;
      g.beginPath();
      let pen = false;
      ys.forEach((v, i) => {
        if (!Number.isFinite(v)) {
          pen = false;
          return;
        }
        const x = (i / (ys.length - 1)) * w;
        const y = h - (v / peak) * h * 0.92;
        if (pen) g.lineTo(x, y);
        else g.moveTo(x, y);
        pen = true;
      });
      g.stroke();
    };
    line(curve.luminous, '#58a6ff', [5, 4]);
    line(curve.v, '#d29922', []);
  });
  return (
    <figure className="scope">
      <canvas ref={ref} role="img" aria-label="Rotation speed of the stars against radius" />
      <figcaption>
        <span className="cap-gold">Measured speed</span> against radius, with <span className="cap-blue">what the stars alone could hold</span>
        {!dark && '. Dark matter is off, so nothing is holding the outer stars.'}
      </figcaption>
      <label className="toggle compact">
        <input type="checkbox" checked={dark} onChange={(e) => store.set({ darkMatter: e.target.checked })} />
        <span className="switch" aria-hidden="true" />
        <span className="toggle-text">Dark matter halo</span>
      </label>
    </figure>
  );
}

/** The chirp: face-on strain over recent history, drawn at the rate the stats refresh. */
function WaveScope() {
  useStore((s) => s.stats);
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const w = c.clientWidth * (window.devicePixelRatio || 1);
    const h = c.clientHeight * (window.devicePixelRatio || 1);
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    g.clearRect(0, 0, w, h);
    const strain = world.waves.recentStrain(400);
    let peak = 0;
    for (const v of strain) peak = Math.max(peak, Math.abs(v));
    g.strokeStyle = '#d29922';
    g.lineWidth = 1.5 * (window.devicePixelRatio || 1);
    g.beginPath();
    strain.forEach((v, i) => {
      const x = (i / (strain.length - 1)) * w;
      const y = h / 2 - (peak > 0 ? v / peak : 0) * h * 0.44;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
  });
  return (
    <figure className="scope">
      <canvas ref={ref} role="img" aria-label="Recent gravitational-wave strain" />
      <figcaption>Strain seen face-on, last 800 M of time</figcaption>
    </figure>
  );
}

function compact(v: number): string {
  if (!Number.isFinite(v)) return '∞';
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(0);
}

/** Live numbers for the current scene: clocks, the orbit of a pair, and the last merger. */
function LiveNumbers({ time }: { time: number }) {
  useStore((s) => s.stats);
  const gw = useStore((s) => s.gw);
  const pn = useStore((s) => s.pn);
  const clocks = world.probes.filter((p) => p.label);
  // The relativistic terms act only on compact objects, and a galaxy has no Keplerian orbit.
  const compactPair = world.bodies.length === 2 && world.bodies.every(isCompact);
  const pair = world.bodies.length === 2 && world.bodies.every((b) => b.kind !== 'galaxy') ? pairOrbit(world.bodies[0], world.bodies[1], pn && compactPair) : null;
  // Orbital elements stop meaning much in the final plunge.
  const settled = pair?.bound && pair.separation > 8 * (world.bodies[0].m + world.bodies[1].m);
  const merger = world.lastMerger;
  const twin = world.ghost.length && world.bodies.length ? Math.hypot(world.bodies[0].x - world.ghost[0].x, world.bodies[0].y - world.ghost[0].y) : null;
  if (!clocks.length && !pair && !merger && twin === null) return null;
  return (
    <dl className="live">
      {twin !== null && (
        <div>
          <dt>Twin has drifted</dt>
          <dd>{twin < 0.1 ? twin.toExponential(1) : twin.toFixed(1)}</dd>
        </div>
      )}
      {clocks.length > 0 && (
        <div>
          <dt>Distant observer</dt>
          <dd>{compact(time)} M</dd>
        </div>
      )}
      {clocks.map((p) => (
        <div key={p.id}>
          <dt>{p.label}</dt>
          <dd>
            {compact(p.tau)} M · ×{p.rate.toFixed(3)}
          </dd>
        </div>
      ))}
      {pair && !settled && (
        <div>
          <dt>Separation</dt>
          <dd>{pair.separation.toFixed(1)}</dd>
        </div>
      )}
      {settled && pair && (
        <div>
          <dt>Orbit</dt>
          <dd>
            a {pair.a.toFixed(1)} · e {pair.e.toFixed(2)}
          </dd>
        </div>
      )}
      {settled && pair && pn && compactPair && (
        <div>
          <dt>Turns per orbit</dt>
          <dd>{((pair.advance * 180) / Math.PI).toFixed(1)}°</dd>
        </div>
      )}
      {settled && pair && gw && compactPair && (
        <div>
          <dt>Merges in about</dt>
          <dd>{compact(pair.mergerTime)} M</dd>
        </div>
      )}
      {merger && (
        <div>
          <dt>Last merger</dt>
          <dd>
            {(merger.radiated * 100).toFixed(1)}% radiated · spin {merger.spin.toFixed(2)} · {kickKmPerSecond(merger.kick).toFixed(0)} km/s kick
          </dd>
        </div>
      )}
    </dl>
  );
}

function InfoCard({ mode, exag, bodies, probes, time }: { mode: ViewMode; exag: number; bodies: number; probes: number; time: number }) {
  const open = useStore((s) => s.infoOpen);
  const note = useStore((s) => s.note);
  const rings = useStore((s) => s.rings);
  const mn = modeNote(mode, bodies, exag);
  const exhibit = useExhibit((s) => s.id);
  const legend = exhibit ? undefined : LEGENDS[mode];
  // Rings are not drawn on the lens view.
  const hasHole = mode !== 'lens' && world.bodies.some(isBlackHole);
  const exact = mn.tag.startsWith('exact');
  return (
    <section className={`info card ${open ? 'open' : ''}`} aria-label="About this view">
      <h2>
        <button className="info-head" aria-expanded={open} onClick={() => store.set({ infoOpen: !open })}>
          <span className="info-title">{exhibit ? (SCENE_COPY[exhibit]?.title ?? mn.title) : mn.title}</span>
          <span className={`dot ${exact ? 'exact' : 'approx'}`} aria-hidden="true" />
          <span className="chev">
            <IconChevron />
          </span>
        </button>
      </h2>
      {open && (
        <div className="info-body">
          {!exhibit && <p>{mn.body}</p>}
          {!exhibit && <span className={`tag ${exact ? 'exact' : 'approx'}`}>{mn.tag}</span>}
          {legend && (
            <div className="legend">
              <span className="legend-label">{legend.label}</span>
              <span className={`ramp ${legend.cls}`} aria-hidden="true" />
              <span className="legend-ends">
                <span>{legend.low}</span>
                <span>{legend.high}</span>
              </span>
            </div>
          )}
          {(probes > 0 || (rings && hasHole)) && (
            <ul className="key">
              {probes > 0 && (
                <li>
                  <i className="swatch gold" />
                  GR orbit
                </li>
              )}
              {probes > 0 && (
                <li>
                  <i className="swatch blue" />
                  Newtonian
                </li>
              )}
              {rings && hasHole && (
                <li>
                  <i className="swatch dash-gold" />
                  Photon sphere 3M
                </li>
              )}
              {rings && hasHole && (
                <li>
                  <i className="swatch dash-cyan" />
                  ISCO 6M
                </li>
              )}
            </ul>
          )}
          {mode === 'waves' && <WaveScope />}
          {mode === 'warp' && <WarpPanel />}
          {world.swarm.selfGravity && world.swarm.n > 0 && <RotationScope />}
          <LiveNumbers time={time} />
          {note && <p className="preset-note">{note}</p>}
        </div>
      )}
    </section>
  );
}

const SCENE_GROUPS: SceneGroup[] = ['Relativity', 'Three bodies', 'Stars and planets', 'Galaxies', 'Exotic', 'Sandbox'];

function ScenePicker() {
  const open = useStore((s) => s.scenesOpen);
  const presetId = useStore((s) => s.presetId);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) store.set({ scenesOpen: false });
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [open]);
  const current = SCENE_COPY[presetId] ?? SCENE_COPY.single;
  return (
    <div className="picker" ref={ref}>
      <button className="scene-btn" aria-expanded={open} aria-haspopup="true" aria-label={`Scene: ${current.title}. Change scene`} onClick={() => store.set({ scenesOpen: !open })}>
        <IconLayers />
        <span className="scene-name">{current.title}</span>
        <span className="chev">
          <IconChevron />
        </span>
      </button>
      {open && (
        <div className="scene-menu card" role="group" aria-label="Scenes">
          <h2>Scenes</h2>
          {SCENE_GROUPS.map((group) => (
            <section key={group} className="scene-group" aria-label={group}>
              <h3>{group}</h3>
              <div className="scene-list">
                {PRESETS.filter((p) => p.group === group).map((p) => {
                  const c = SCENE_COPY[p.id] ?? { title: p.name, blurb: '' };
                  return (
                    <button key={p.id} className={`scene-item ${p.id === presetId ? 'on' : ''}`} aria-current={p.id === presetId ? 'true' : undefined} onClick={() => openPreset(p.id)}>
                      <b>{c.title}</b>
                      <small>{c.blurb}</small>
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
          <div className="scene-actions">
            <button className="btn" onClick={openSurprise}>
              Surprise me
            </button>
            <button className="btn" onClick={() => openPreset(presetId)}>
              <IconReset /> Restart
            </button>
            <button className="btn danger" onClick={clearAll}>
              <IconClear /> Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function App() {
  const exhibit = useExhibit((s) => s.id);
  const tool = useStore((s) => s.tool);
  const presetId = useStore((s) => s.presetId);
  const mode = useStore((s) => s.mode);
  const playing = useStore((s) => s.playing);
  const aboutOpen = useStore((s) => s.aboutOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const stats = useStore((s) => s.stats);
  const exag = useStore((s) => s.exaggeration);
  const webgl = useMemo(supportsWebGL, []);

  useEffect(() => {
    loadPreset(store.get().presetId);
  }, []);

  const setTool = useCallback((t: Tool) => store.set({ tool: t }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (e.key === 'Escape') {
        const s = store.get();
        // One layer at a time: the open menu first, the selection last.
        if (s.scenesOpen) store.set({ scenesOpen: false });
        else if (s.aboutOpen || s.settingsOpen) store.set({ aboutOpen: false, settingsOpen: false });
        else store.set({ selectedId: null });
        return;
      }
      if (store.get().aboutOpen) return;
      if (e.key === ' ') {
        // Space belongs to a focused control (it presses buttons and flips switches).
        if (t.closest?.('button, a, select, textarea, input:not([type="range"])')) return;
        e.preventDefault();
        if (!e.repeat) store.set((s) => ({ playing: !s.playing }));
        return;
      }
      if (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox'].includes((t as HTMLInputElement).type))) return;
      const tl = TOOLS.find((x) => x.key === e.key);
      if (tl) return setTool(tl.id);
      const k = e.key.toLowerCase();
      if (k === 'v') {
        const i = VIEW_MODES.indexOf(store.get().mode);
        store.set({ mode: VIEW_MODES[(i + 1) % VIEW_MODES.length] });
      } else if (k === 'g') store.set((s) => ({ gr: !s.gr }));
      else if (k === 'f') requestCamera('frame');
      else if (k === '.') {
        store.set({ playing: false });
        requestStep();
      } else if (k === 'i' || k === '?') store.set({ aboutOpen: true });
      else if (e.key === 'Delete' || e.key === 'Backspace') {
        const id = store.get().selectedId;
        if (id != null) {
          world.removeBody(id);
          store.set({ selectedId: null });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setTool]);

  if (!webgl) {
    return (
      <main className="no-webgl">
        <h1>albe needs WebGL</h1>
        <p>This browser or device has WebGL turned off, so the spacetime sheet can’t be drawn. Try turning on hardware acceleration, or open albe in another browser.</p>
        <SiteFoot />
      </main>
    );
  }

  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  let hint = TOOLS.find((t) => t.id === tool)!.hint;
  if (coarse) hint = tool === 'view' ? 'Drag to orbit, pinch to zoom, two fingers to pan.' : hint.replace(/Click/g, 'Tap').replace('Delete key removes it', 'Delete removes it');
  const touchHint = tool === 'view' ? '' : coarse ? ' Two fingers orbit the camera.' : ' Right-drag orbits the camera.';

  return (
    <div className="app" data-tool={tool}>
      <Scene />
      <div className="labels" ref={setLabelLayer} aria-hidden="true" />

      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>albe</h1>
            <p>Made for Wesley from NYU</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="segmented" role="group" aria-label="What the sheet shows" hidden={exhibit !== null}>
            {(presetId === 'warp' ? [...VIEW_MODES, 'warp' as const] : VIEW_MODES).map((m) => (
              <button key={m} aria-pressed={mode === m} className={mode === m ? 'on' : ''} onClick={() => store.set({ mode: m })}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <button className="icon-btn glass about-btn" title="How it works (i)" onClick={() => store.set({ aboutOpen: true })}>
            <IconInfo />
            <span>How it works</span>
          </button>
        </div>
      </header>

      <InfoCard mode={mode} exag={exag} bodies={stats.bodies} probes={stats.probes} time={stats.simTime} />
      <ExhibitPanel />

      {settingsOpen && <SettingsPanel />}

      <Readout />

      <div className="bottom">
        <div className="bottom-stack">
          {stats.offscreen > 0 && (
            <button className="return-pill" onClick={() => requestCamera('frame')}>
              <IconFrame />
              {plural(stats.offscreen, stats.offscreenKind, stats.offscreenKind === 'mass' ? 'masses' : 'particles')} off screen · Bring back
            </button>
          )}
          <Selection />
          {tool === 'mass' && <MassOption />}
          <p className="hint">
            {hint}
            {touchHint}
          </p>
        </div>
        <nav className="dock" aria-label="Tools and controls">
          <div className="dock-tools" role="toolbar" aria-label="Tools">
            {TOOLS.map((t) => (
              <button key={t.id} className={`tool ${tool === t.id ? 'on' : ''}`} aria-pressed={tool === t.id} aria-label={`${t.label} tool (key ${t.key})`} title={`${t.label} (${t.key})`} onClick={() => setTool(t.id)}>
                {toolIcons[t.id]}
                <span className="long">{t.label}</span>
                <span className="short">{t.short}</span>
              </button>
            ))}
          </div>
          <span className="dock-rule" aria-hidden="true" />
          <div className="dock-controls">
            <button className="icon-btn play" aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} title={playing ? 'Pause (Space)' : 'Play (Space)'} onClick={() => store.set({ playing: !playing })}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <button
              className="icon-btn"
              aria-label="Step one frame"
              title="Step (.)"
              onClick={() => {
                store.set({ playing: false });
                requestStep();
              }}
            >
              <IconStep />
            </button>
            <ScenePicker />
            <button className="icon-btn" aria-label="Frame everything (F)" title="Frame everything (F)" onClick={() => requestCamera('frame')}>
              <IconFrame />
            </button>
            <button className={`icon-btn ${settingsOpen ? 'on' : ''}`} aria-label="Settings" aria-expanded={settingsOpen} title="Settings" onClick={() => store.set({ settingsOpen: !settingsOpen })}>
              <IconSliders />
            </button>
          </div>
        </nav>
        <div className="status" aria-hidden="true">
          t = {stats.simTime.toFixed(0)} M · {plural(stats.bodies, 'mass', 'masses')} · {plural(stats.probes, 'particle')} · {plural(stats.rays, 'ray')}
          {stats.stars > 0 && ` · ${stats.stars.toLocaleString('en')} stars`} · {stats.fps} fps
          {stats.throttled && <span className="warn"> · slowed for accuracy</span>}
        </div>
      </div>

      {aboutOpen && <About />}
    </div>
  );
}
