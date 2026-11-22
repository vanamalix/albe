/**
 * The chirp scope: face-on strain over the last 800 units of time, with a cursor. Tapping the plot
 * (or "Mark newest pair") marks the nearest crest or trough; two marks give f, four give ḟ and the
 * leading-order chirp mass. Loaded only in the Waves view.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { strainExtrema } from '../physics/chirp';
import { isCompact } from '../physics/types';
import type { ChirpSound } from '../sim/chirpSound';
import { WAVE_SAMPLES, WAVE_SPACING } from '../sim/waves';
import { closeAudio } from './closeAudio';
import { world } from '../sim/world';
import { addMark, chirpReading, clearMarks, getMarks, useMarks } from '../state/scopeMarks';
import { useStore } from '../state/store';

const COUNT = 400;

/** Times of the extrema now on the scope. */
function extremaTimes(): number[] {
  const h = world.waves.recentStrain(COUNT);
  const newest = world.waves.newestTime;
  return strainExtrema(h).map((e) => newest - (COUNT - 1 - e.index) * WAVE_SPACING);
}

const sci = (v: number) => v.toExponential(3).replace('e', '×10^');

/** What one unit of mass is taken to be, in solar masses, for the sound. */
const UNITS = [20, 5] as const;
type Unit = (typeof UNITS)[number];

type AudioCtor = typeof AudioContext;

/** The masses on the sheet, in solar masses at the chosen unit. */
function massesAt(unit: number): string {
  const holes = world.bodies.filter(isCompact);
  if (holes.length === 2) return `this pair is ${(holes[0].m * unit).toFixed(0)} + ${(holes[1].m * unit).toFixed(0)} M☉`;
  if (holes.length === 1) return `the hole now is ${(holes[0].m * unit).toFixed(0)} M☉`;
  return 'no holes are on the sheet';
}

/** Listen: the strain history as sound, at the pitch and duration a chosen mass implies. */
function Listen() {
  const [unit, setUnit] = useState<Unit>(20);
  const [state, setState] = useState<{ status: 'idle' | 'playing' | 'played' | 'silent' | 'no-audio'; clip?: ChirpSound }>({ status: 'idle' });
  const live = useRef<AudioContext | null>(null);
  // Leaving the Waves view stops the sound and releases the context.
  useEffect(
    () => () => {
      closeAudio(live.current);
      live.current = null;
    },
    [],
  );
  const listen = () => {
    // The context is made here, inside the press, and nowhere else.
    const Ctor: AudioCtor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
    if (!Ctor) return setState({ status: 'no-audio' });
    closeAudio(live.current);
    const ctx = new Ctor();
    live.current = ctx;
    void ctx.resume();
    const strain = world.waves.recentStrain(WAVE_SAMPLES);
    const oldest = world.waves.newestTime - (WAVE_SAMPLES - 1) * WAVE_SPACING;
    import('./chirpAudio')
      .then(({ playChirp }) => {
        if (live.current !== ctx) return closeAudio(ctx); // closed or replaced meanwhile
        const clip = playChirp(ctx, strain, unit, oldest, () => {
          if (live.current === ctx) live.current = null;
          setState((s) => ({ ...s, status: 'played' }));
        });
        // No signal: playChirp has closed the context, so it is no longer ours to close.
        if (!clip && live.current === ctx) live.current = null;
        setState(clip ? { status: 'playing', clip } : { status: 'silent' });
      })
      .catch(() => {
        closeAudio(ctx);
        if (live.current === ctx) live.current = null;
        setState({ status: 'silent' });
      });
  };
  const c = state.clip;
  return (
    <div className="listen">
      <div className="depth" role="group" aria-label="One unit of mass is">
        {UNITS.map((u) => (
          <button key={u} aria-pressed={unit === u} className={unit === u ? 'on' : ''} onClick={() => setUnit(u)}>
            {u} M☉
          </button>
        ))}
      </div>
      <button className="btn small" onClick={listen} disabled={state.status === 'playing'}>
        {state.status === 'playing' ? 'Playing…' : 'Listen'}
      </button>
      <p className="ref" aria-live="polite">
        {state.status === 'no-audio'
          ? 'This browser has no Web Audio, so there is nothing to play.'
          : state.status === 'silent'
            ? 'No signal in the last 2,048 units of time yet.'
            : c
              ? `Clip: ${c.seconds.toFixed(2)} s${Number.isFinite(c.fLow) ? `, rising from ${c.fLow.toFixed(0)} to ${c.fHigh.toFixed(0)} Hz` : ', too short yet to read a pitch'}.${c.drops ? ' The pitch falls somewhere along the way: at merger the last orbit and the ringdown need not join smoothly in this model.' : ''}`
              : ''}{' '}
        Assumes one unit of mass is {unit} M☉, so {massesAt(unit)}: true pitch and true duration for that mass{unit === 5 ? ', 4× higher and 4× shorter than at 20 M☉, which small speakers reproduce better' : ''}. Loudness is normalised: how the amplitude rises is the simulation’s, the overall level is not. Silent until pressed.
      </p>
    </div>
  );
}

export default function WaveScope() {
  useStore((s) => s.stats);
  useMarks();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth * dpr;
    const h = c.clientHeight * dpr;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    g.clearRect(0, 0, w, h);
    const strain = world.waves.recentStrain(COUNT);
    let peak = 0;
    for (const v of strain) peak = Math.max(peak, Math.abs(v));
    g.strokeStyle = '#d29922';
    g.lineWidth = 1.5 * dpr;
    g.beginPath();
    strain.forEach((v, i) => {
      const x = (i / (strain.length - 1)) * w;
      const y = h / 2 - (peak > 0 ? v / peak : 0) * h * 0.44;
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    });
    g.stroke();
    const newest = world.waves.newestTime;
    const span = (COUNT - 1) * WAVE_SPACING;
    g.strokeStyle = '#58a6ff';
    g.lineWidth = 1.25 * dpr;
    for (const t of getMarks().marks) {
      const x = (1 - (newest - t) / span) * w;
      if (x < 0 || x > w) continue;
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, h);
      g.stroke();
    }
  });

  const onTap = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const span = (COUNT - 1) * WAVE_SPACING;
    const t = world.waves.newestTime - (1 - (e.clientX - r.left) / r.width) * span;
    const ext = extremaTimes();
    if (!ext.length) return;
    const nearest = ext.reduce((a, b) => (Math.abs(b - t) < Math.abs(a - t) ? b : a));
    addMark(nearest, ext);
  };
  const markNewest = () => {
    const ext = extremaTimes();
    if (ext.length < 2) return;
    if (getMarks().marks.length % 2 === 1) clearMarks();
    addMark(ext[ext.length - 2], ext);
    addMark(ext[ext.length - 1], ext);
  };

  const r = chirpReading();
  const n = getMarks().marks.length;
  return (
    <figure className="scope">
      <canvas ref={ref} className="scope-tap" role="img" aria-label="Recent gravitational-wave strain. Tap a crest or trough to mark it." onPointerDown={onTap} />
      <figcaption>Strain seen face-on, last 800 of time. Tap two neighbouring crests or troughs, then two more later.</figcaption>
      <div className="scope-tools">
        <button className="btn small" onClick={markNewest}>
          Mark newest pair
        </button>
        <button className="btn small" onClick={clearMarks} disabled={n === 0}>
          Clear marks
        </button>
      </div>
      <dl className="live" aria-live="polite">
        {r.f1 !== undefined && (
          <div>
            <dt>f, first pair</dt>
            <dd>{sci(r.f1)}</dd>
          </div>
        )}
        {r.f2 !== undefined && (
          <div>
            <dt>f, second pair</dt>
            <dd>{sci(r.f2)}</dd>
          </div>
        )}
        {r.fdot !== undefined && (
          <div>
            <dt>ḟ between them</dt>
            <dd>{sci(r.fdot)}</dd>
          </div>
        )}
        {r.chirpMass !== undefined && (
          <div>
            <dt>Chirp mass, leading order</dt>
            <dd>{Number.isFinite(r.chirpMass) ? r.chirpMass.toFixed(2) : 'f must rise: mark the later pair later'}</dd>
          </div>
        )}
      </dl>
      <Listen />
    </figure>
  );
}
