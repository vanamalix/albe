/**
 * The effective potential, with epicycles: drag L, see V²(r) with the particle's E² and position, launch
 * a near-circular orbit and compare the predicted advance with the one the pins measure.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { apsidalAngle, geodesicConstants } from '../../physics/measure';
import { circularRadius, epicycleAdvance, radialToOrbital, V2 } from '../../physics/potential';
import { circularSpeed } from '../../physics/probes';
import { isBlackHole } from '../../physics/types';
import { world } from '../../sim/world';
import { useDepth } from '../../state/depth';
import { useStore } from '../../state/store';
import { deg } from './format';

const LABEL = 'Epicycle';
/** The inward nudge given at launch, dx/dτ. Small, so the orbit is nearly circular. */
const NUDGE = 0.01;

export default function Potential() {
  useStore((s) => s.stats);
  const depth = useDepth();
  const id = useId();
  const [L, setL] = useState(4.2);
  const ref = useRef<HTMLCanvasElement>(null);
  const hole = world.bodies.length === 1 && isBlackHole(world.bodies[0]) ? world.bodies[0] : null;
  const M = hole?.m ?? 4;
  const Lm = L * M;
  const rc = circularRadius(M, Lm);
  const p = world.probes.find((q) => q.label === LABEL);
  const live = hole && p ? geodesicConstants(M, p.x - hole.x, p.y - hole.y, p.vx - hole.vx, p.vy - hole.vy) : null;
  const rNow = hole && p ? Math.hypot(p.x - hole.x, p.y - hole.y) : NaN;
  const tracked = !!p && world.pinTarget?.kind === 'probe' && world.pinTarget.id === p.id;

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
    const r0 = 2;
    const r1 = 30;
    const vMax = 1.02;
    const vMin = Math.min(0.85, V2(1, L, Math.max(4, circularRadius(1, L) || 6)) - 0.01);
    const X = (r: number) => ((r - r0) / (r1 - r0)) * w;
    const Y = (v: number) => h - ((v - vMin) / (vMax - vMin)) * h;
    // V²(r) for this L (in units of M), then the particle's E² and where it is.
    g.strokeStyle = '#d29922';
    g.lineWidth = 1.75 * dpr;
    g.beginPath();
    for (let i = 0; i <= 300; i++) {
      const r = r0 + ((r1 - r0) * i) / 300;
      const y = Y(V2(1, L, r));
      if (i === 0) g.moveTo(X(r), y);
      else g.lineTo(X(r), y);
    }
    g.stroke();
    g.strokeStyle = 'rgba(201, 209, 217, 0.35)';
    g.lineWidth = dpr;
    g.setLineDash([4 * dpr, 4 * dpr]);
    g.beginPath();
    g.moveTo(X(6), 0);
    g.lineTo(X(6), h);
    g.stroke();
    g.setLineDash([]);
    if (live && Number.isFinite(rNow)) {
      g.strokeStyle = '#58a6ff';
      g.beginPath();
      g.moveTo(0, Y(live.E2));
      g.lineTo(w, Y(live.E2));
      g.stroke();
      g.fillStyle = '#f0f6fc';
      g.beginPath();
      g.arc(X(rNow / M), Y(live.E2), 3.5 * dpr, 0, 2 * Math.PI);
      g.fill();
    }
  });

  const launch = () => {
    if (!hole || !Number.isFinite(rc)) return;
    world.probes = world.probes.filter((q) => q.label !== LABEL);
    const q = world.addProbe(hole.x + rc, hole.y, hole.vx - NUDGE, hole.vy + circularSpeed(M, rc, true), 'follow', LABEL);
    if (q) world.trackPins({ kind: 'probe', id: q.id });
  };

  const exact = live && live.E2 < 1 ? deg(apsidalAngle(M, live.E2, live.L2)) - 360 : NaN;
  const measured = tracked && Number.isFinite(world.pins.advance) ? deg(world.pins.advance) : NaN;
  return (
    <section className="toy" aria-label="Effective potential and epicycles">
      <h3>Effective potential and epicycles</h3>
      <p>
        {depth === 'words'
          ? 'For a given angular momentum, the curve is the energy needed to sit at each radius. A circular orbit sits in the dip; nudge it and it rocks in and out. Close to the hole the rocking slows down relative to the trip round, so each closest point lands further on. At 6M the dip vanishes: no stable orbit is left.'
          : depth === 'numbers'
            ? `L = ${L.toFixed(2)}M puts the circular orbit at ${Number.isFinite(rc) ? `${(rc / M).toFixed(2)}M` : 'nowhere: below √12 M there is none'}. There ω_r²/Ω² = ${Number.isFinite(rc) ? radialToOrbital(M, rc).toFixed(3) : '—'}, so a nudged orbit’s closest point advances about ${Number.isFinite(rc) ? deg(epicycleAdvance(M, rc)).toFixed(1) : '—'}° each time.`
            : '(dr/dτ)² = E² − V², V² = (1 − 2M/r)(1 + L²/r²). Stable circular orbits sit at the minimum, r = (L²/2M)(1 + √(1 − 12M²/L²)). Small radial oscillations about it have, in the distant observer’s time, ω_r²/Ω² = 1 − 6M/r, so the advance per radial period is 2π[(1 − 6M/r)^(−½) − 1]: the epicycle, the e → 0 limit of the elliptic integral. At L² = 12M² the minimum and maximum merge at r = 6M (ISCO).'}
      </p>
      <figure className="scope">
        <canvas ref={ref} className="potential-plot" role="img" aria-label={`Effective potential V² against r from 2M to 30M for L = ${L.toFixed(2)}M, with the dashed ISCO at 6M${live ? ` and the particle at ${(rNow / M).toFixed(1)}M` : ''}.`} />
        <figcaption>
          <span className="cap-gold">V²(r)</span>, 2M to 30M; <span className="cap-blue">the particle’s E²</span> and its position; dashed: 6M.
        </figcaption>
      </figure>
      <div className="slider-row">
        <label htmlFor={`${id}-L`}>
          Angular momentum L <output>{L.toFixed(2)} M</output>
        </label>
        <input id={`${id}-L`} type="range" min={3.3} max={6} step={0.01} value={L} onChange={(e) => setL(+e.target.value)} />
      </div>
      <div className="explain-actions">
        <button className="btn small" onClick={launch} disabled={!hole || !Number.isFinite(rc)}>
          Launch near-circular at this L
        </button>
      </div>
      <dl className="live">
        <div>
          <dt>Circular orbit for this L</dt>
          <dd>{Number.isFinite(rc) ? `${(rc / M).toFixed(2)} M` : 'none (L < √12 M)'}</dd>
        </div>
        <div>
          <dt>Predicted advance (epicycle, at that r)</dt>
          <dd>{Number.isFinite(rc) ? `${deg(epicycleAdvance(M, rc)).toFixed(1)}°` : '—'}</dd>
        </div>
        {p && (
          <div>
            <dt>Exact for the orbit launched (elliptic integral)</dt>
            <dd>{Number.isFinite(exact) ? `${exact.toFixed(1)}°` : 'unbound or plunging'}</dd>
          </div>
        )}
        {p && (
          <div>
            <dt>Measured by the pins</dt>
            <dd>{Number.isFinite(measured) ? `${measured.toFixed(1)}°` : 'waiting for two closest approaches'}</dd>
          </div>
        )}
      </dl>
      <p className="ref">
        Exact for one hole. The launch adds an inward nudge of {NUDGE}c, so the orbit is slightly eccentric and the exact advance sits a little off the epicycle value, which is its e → 0 limit. Pins are
        interpolated closest approaches of the scene’s own particle. Near 6M the advance diverges, and the smallest nudge can tip the orbit in.
      </p>
    </section>
  );
}
