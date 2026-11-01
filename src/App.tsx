import { useCallback, useEffect } from 'react';
import { VIEW_MODES, type ViewMode } from './physics/fields';
import { PRESETS, presetById } from './physics/presets';
import { requestStep, Scene } from './scene/Scene';
import { world } from './sim/world';
import { massFromLog, store, TOOLS, useStore, type Settings, type Tool } from './state/store';
import { About } from './ui/About';
import { IconClear, IconClose, IconInfo, IconPause, IconPlay, IconReset, IconSliders, IconStep, toolIcons } from './ui/icons';

const MODE_LABEL: Record<ViewMode, string> = { space: 'Space', time: 'Time', tidal: 'Tidal', lattice: 'Lattice' };

function loadPreset(id: string): void {
  const p = presetById(id);
  world.loadPreset(p);
  const st = p.settings;
  store.set((s) => ({
    presetId: p.id,
    note: p.note,
    timeScale: st.timeScale,
    mode: st.mode ?? s.mode,
    gr: st.gr ?? s.gr,
    gw: st.gw ?? false,
    rings: st.rings ?? s.rings,
    selectedId: null,
  }));
}

function fmt(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '∞';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2).replace('e', '×10^').replace('^+', '^');
  return v.toFixed(digits);
}

function modeNote(mode: ViewMode, nBodies: number, exag: number): { title: string; body: string; tag: string } {
  const multi = nBodies > 1;
  switch (mode) {
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
        <input id="ts" type="range" min={0} max={3} step={0.01} value={Math.log10(timeScale)} onChange={(e) => store.set({ timeScale: Math.pow(10, +e.target.value) })} />
      </div>
      <div className="slider-row">
        <label htmlFor="ex">
          Depth exaggeration <output>×{exag.toFixed(2)}</output>
        </label>
        <input id="ex" type="range" min={0.25} max={4} step={0.05} value={exag} onChange={(e) => store.set({ exaggeration: +e.target.value })} />
      </div>
      <Toggle k="gr" label="GR test particles" desc="off = Newtonian (closed ellipses)" />
      <Toggle k="gw" label="GW inspiral" desc="Peters (1964) drag, approximate" />
      <Toggle k="grid" label="Grid lines" />
      <Toggle k="trails" label="Trails" />
      <Toggle k="rings" label="Photon sphere & ISCO" desc="3M dashed gold · 6M dashed cyan" />
      <Toggle k="arrows" label="Velocity arrows" />
    </aside>
  );
}

function Readout() {
  const r = useStore((s) => s.readout);
  if (!r) return null;
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
            {r.r.toFixed(1)} <small>({(r.r / r.m).toFixed(1)} M)</small>
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
        <b>Mass {b.m.toFixed(2)}</b>
        <small>
          r_s = {(2 * b.m).toFixed(2)} · |v| = {Math.hypot(b.vx, b.vy).toFixed(3)}c
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

function MassOption() {
  const logMass = useStore((s) => s.logMass);
  const m = massFromLog(logMass);
  return (
    <div className="tool-option card">
      <label htmlFor="mass">
        Mass <output>M = {m < 1 ? m.toFixed(2) : m.toFixed(1)}</output> <small>r_s = {(2 * m).toFixed(2)}</small>
      </label>
      <input id="mass" type="range" min={-1} max={1} step={0.01} value={logMass} onChange={(e) => store.set({ logMass: +e.target.value })} />
    </div>
  );
}

export function App() {
  const tool = useStore((s) => s.tool);
  const mode = useStore((s) => s.mode);
  const playing = useStore((s) => s.playing);
  const presetId = useStore((s) => s.presetId);
  const note = useStore((s) => s.note);
  const aboutOpen = useStore((s) => s.aboutOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const stats = useStore((s) => s.stats);
  const exag = useStore((s) => s.exaggeration);

  useEffect(() => {
    loadPreset(store.get().presetId);
  }, []);

  const setTool = useCallback((t: Tool) => store.set({ tool: t }), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target as HTMLElement;
      const typing = t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        store.set({ aboutOpen: false, settingsOpen: false, selectedId: null });
        return;
      }
      if (typing && e.key !== ' ') return;
      if (store.get().aboutOpen) return;
      if (e.key === ' ') {
        if (t && t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range' && (t as HTMLInputElement).type !== 'checkbox') return;
        e.preventDefault();
        store.set((s) => ({ playing: !s.playing }));
        return;
      }
      const tl = TOOLS.find((x) => x.key === e.key);
      if (tl) return setTool(tl.id);
      const k = e.key.toLowerCase();
      if (k === 'v') {
        const i = VIEW_MODES.indexOf(store.get().mode);
        store.set({ mode: VIEW_MODES[(i + 1) % VIEW_MODES.length] });
      } else if (k === 'g') store.set((s) => ({ gr: !s.gr }));
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

  const mn = modeNote(mode, stats.bodies, exag);
  const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;
  let hint = TOOLS.find((t) => t.id === tool)!.hint;
  if (coarse) hint = tool === 'view' ? 'Drag to orbit, pinch to zoom, two fingers to pan.' : hint.replace(/Click/g, 'Tap').replace('Delete key removes it', 'Delete removes it');
  const touchHint = tool === 'view' ? '' : coarse ? ' Two fingers orbit the camera.' : ' Right-drag orbits the camera.';

  return (
    <div className="app">
      <Scene />

      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>albe</h1>
            <p>spacetime manifold explorer</p>
          </div>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Visualisation mode">
          {VIEW_MODES.map((m) => (
            <button key={m} role="radio" aria-checked={mode === m} className={mode === m ? 'on' : ''} onClick={() => store.set({ mode: m })}>
              {MODE_LABEL[m]}
            </button>
          ))}
        </div>
      </header>

      <section className="mode-note card" aria-live="polite">
        <h2>{mn.title}</h2>
        <p>{mn.body}</p>
        <span className={`tag ${mn.tag.startsWith('exact') ? 'exact' : 'approx'}`}>{mn.tag}</span>
        {note && <p className="preset-note">{note}</p>}
      </section>

      {settingsOpen && <SettingsPanel />}

      <div className="bottom">
        <div className="bottom-stack">
          <Readout />
          <Selection />
          {tool === 'mass' && <MassOption />}
          <p className="hint">
            {hint}
            {touchHint}
          </p>
        </div>
        <nav className="toolbar" aria-label="Tools and controls">
          <div className="group" role="toolbar" aria-label="Tools">
            {TOOLS.map((t) => (
              <button
                key={t.id}
                className={`tool ${tool === t.id ? 'on' : ''}`}
                aria-pressed={tool === t.id}
                aria-label={`${t.label} tool (key ${t.key})`}
                title={`${t.label} (${t.key})`}
                onClick={() => setTool(t.id)}
              >
                {toolIcons[t.id]}
                <span>{t.label}</span>
              </button>
            ))}
          </div>
          <div className="group">
            <button className="icon-btn" aria-label={playing ? 'Pause (Space)' : 'Play (Space)'} title={playing ? 'Pause' : 'Play'} onClick={() => store.set({ playing: !playing })}>
              {playing ? <IconPause /> : <IconPlay />}
            </button>
            <button
              className="icon-btn"
              aria-label="Step one frame"
              title="Step"
              onClick={() => {
                store.set({ playing: false });
                requestStep();
              }}
            >
              <IconStep />
            </button>
            <select aria-label="Preset scene" value={presetId} onChange={(e) => loadPreset(e.target.value)}>
              {PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <button className="icon-btn" aria-label="Reset preset" title="Reset" onClick={() => loadPreset(presetId)}>
              <IconReset />
            </button>
            <button
              className="icon-btn"
              aria-label="Clear everything"
              title="Clear"
              onClick={() => {
                world.clear();
                store.set({ selectedId: null, note: '', gw: false });
              }}
            >
              <IconClear />
            </button>
            <button className={`icon-btn ${settingsOpen ? 'on' : ''}`} aria-label="Settings" aria-expanded={settingsOpen} title="Settings" onClick={() => store.set({ settingsOpen: !settingsOpen })}>
              <IconSliders />
            </button>
            <button className="icon-btn" aria-label="About the physics" title="About the physics (i)" onClick={() => store.set({ aboutOpen: true })}>
              <IconInfo />
            </button>
          </div>
        </nav>
        <div className="status" aria-hidden="true">
          t = {stats.simTime.toFixed(0)} M · {stats.bodies} masses · {stats.probes} probes · {stats.rays} rays · {stats.fps} fps
          {stats.throttled && <span className="warn"> · slowed for accuracy</span>}
        </div>
      </div>

      {aboutOpen && <About />}
    </div>
  );
}
