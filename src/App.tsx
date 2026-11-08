import { useCallback, useEffect, useMemo, useRef } from 'react';
import { VIEW_MODES, type ViewMode } from './physics/fields';
import { PRESETS, presetById } from './physics/presets';
import { requestCamera, requestStep, Scene } from './scene/Scene';
import { world } from './sim/world';
import { massFromLog, store, TOOLS, useStore, type Settings, type Tool } from './state/store';
import { About } from './ui/About';
import { IconChevron, IconClear, IconClose, IconFrame, IconInfo, IconLayers, IconPause, IconPlay, IconReset, IconSliders, IconStep, toolIcons } from './ui/icons';

const MODE_LABEL: Record<ViewMode, string> = { space: 'Space', time: 'Time', tidal: 'Tidal', lattice: 'Lattice' };

/** Short titles and one-line pitches for the scene picker (the full notes appear once loaded). */
const SCENE_COPY: Record<string, { title: string; blurb: string }> = {
  single: { title: 'Single black hole', blurb: 'Precessing orbits, photon sphere and ISCO' },
  mercury: { title: 'Mercury precession', blurb: 'Einstein’s first test, exaggerated about 10⁶×' },
  binary: { title: 'Binary inspiral', blurb: 'Two black holes radiate and merge' },
  eight: { title: 'Figure-eight', blurb: 'Three equal masses on one shared path' },
  lensing: { title: 'Lensing fan', blurb: 'A fan of light bends around a mass' },
  empty: { title: 'Empty space', blurb: 'Flat spacetime: build your own' },
};

const LEGENDS: Partial<Record<ViewMode, { cls: string; low: string; high: string; label: string }>> = {
  space: { cls: 'ramp-space', low: 'flat', high: 'deep', label: 'Depth of the well' },
  time: { cls: 'ramp-time', low: 'clocks normal', high: 'clocks slow', label: 'Clock rate' },
  tidal: { cls: 'ramp-tidal', low: 'gentle', high: 'extreme', label: 'Tidal curvature (log scale)' },
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

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
    scenesOpen: false,
  }));
}

/** Switching scene from the UI also flies the camera back, wherever it had wandered. */
function openPreset(id: string): void {
  loadPreset(id);
  requestCamera('home');
}

function clearAll(): void {
  world.clear();
  const empty = presetById('empty');
  store.set({ selectedId: null, presetId: empty.id, note: empty.note, gw: false, scenesOpen: false });
}

function supportsWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
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
      <Toggle k="follow" label="Follow the masses" desc="camera tracks their centre of mass; panning turns it off" />
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

function InfoCard({ mode, exag, bodies, probes }: { mode: ViewMode; exag: number; bodies: number; probes: number }) {
  const open = useStore((s) => s.infoOpen);
  const note = useStore((s) => s.note);
  const rings = useStore((s) => s.rings);
  const mn = modeNote(mode, bodies, exag);
  const legend = LEGENDS[mode];
  const exact = mn.tag.startsWith('exact');
  return (
    <section className={`info card ${open ? 'open' : ''}`} aria-label="About this view">
      <h2>
        <button className="info-head" aria-expanded={open} onClick={() => store.set({ infoOpen: !open })}>
          <span className="info-title">{mn.title}</span>
          <span className={`dot ${exact ? 'exact' : 'approx'}`} aria-hidden="true" />
          <span className="chev">
            <IconChevron />
          </span>
        </button>
      </h2>
      {open && (
        <div className="info-body">
          <p>{mn.body}</p>
          <span className={`tag ${exact ? 'exact' : 'approx'}`}>{mn.tag}</span>
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
          {(probes > 0 || (rings && bodies > 0)) && (
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
              {rings && bodies > 0 && (
                <li>
                  <i className="swatch dash-gold" />
                  Photon sphere 3M
                </li>
              )}
              {rings && bodies > 0 && (
                <li>
                  <i className="swatch dash-cyan" />
                  ISCO 6M
                </li>
              )}
            </ul>
          )}
          {note && <p className="preset-note">{note}</p>}
        </div>
      )}
    </section>
  );
}

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
          <div className="scene-list">
            {PRESETS.map((p) => {
              const c = SCENE_COPY[p.id] ?? { title: p.name, blurb: '' };
              return (
                <button key={p.id} className={`scene-item ${p.id === presetId ? 'on' : ''}`} aria-current={p.id === presetId ? 'true' : undefined} onClick={() => openPreset(p.id)}>
                  <b>{c.title}</b>
                  <small>{c.blurb}</small>
                </button>
              );
            })}
          </div>
          <div className="scene-actions">
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
  const tool = useStore((s) => s.tool);
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

      <header className="topbar">
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          <div>
            <h1>albe</h1>
            <p>Made for Wesley from NYU</p>
          </div>
        </div>
        <div className="top-actions">
          <div className="segmented" role="group" aria-label="What the sheet shows">
            {VIEW_MODES.map((m) => (
              <button key={m} aria-pressed={mode === m} className={mode === m ? 'on' : ''} onClick={() => store.set({ mode: m })}>
                {MODE_LABEL[m]}
              </button>
            ))}
          </div>
          <button className="icon-btn glass about-btn" aria-label="About the physics" title="About the physics (i)" onClick={() => store.set({ aboutOpen: true })}>
            <IconInfo />
          </button>
        </div>
      </header>

      <InfoCard mode={mode} exag={exag} bodies={stats.bodies} probes={stats.probes} />

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
          t = {stats.simTime.toFixed(0)} M · {plural(stats.bodies, 'mass', 'masses')} · {plural(stats.probes, 'particle')} · {plural(stats.rays, 'ray')} · {stats.fps} fps
          {stats.throttled && <span className="warn"> · slowed for accuracy</span>}
        </div>
      </div>

      {aboutOpen && <About />}
    </div>
  );
}
