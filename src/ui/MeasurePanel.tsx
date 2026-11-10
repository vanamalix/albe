/**
 * The measure tool: a plan view of the pinned orbit, drawn relative to its centre so angles are
 * true (the 3D camera would distort them), with a two-armed protractor to drag onto the pins. The
 * app's own values are shown only when asked for. Loaded on demand.
 */
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { apsidalAngle, geodesicConstants, protractorReading, secondOrderAdvance, textbookAdvance } from '../physics/measure';
import { dominantSource } from '../physics/probes';
import { world } from '../sim/world';
import { getArms, setArm, useArms } from '../state/protractor';
import { store, useStore } from '../state/store';
import { IconClose } from './icons';

const deg = (r: number) => (r * 180) / Math.PI;

/** The app's values for the pinned orbit (exact integral only for a test particle with GR on). */
function appValues(gr: boolean): { measured: number; exact: number; first: number; second: number; m: number } | null {
  const pins = world.pins;
  if (pins.pins.length < 2) return null;
  let m = 0;
  let exact = NaN;
  if (world.pinTarget?.kind === 'probe') {
    const id = world.pinTarget.id;
    const p = world.probes.find((q) => q.id === id);
    const i = p ? dominantSource(p.x, p.y, world.bodies) : -1;
    if (p && i >= 0) {
      const s = world.bodies[i];
      m = s.m;
      const { E2, L2 } = geodesicConstants(s.m, p.x - s.x, p.y - s.y, p.vx - s.vx, p.vy - s.vy);
      if (gr && E2 < 1) exact = deg(apsidalAngle(s.m, E2, L2)) - 360;
    }
  } else if (world.bodies.length === 2) m = world.bodies[0].m + world.bodies[1].m;
  return { measured: deg(pins.advance), exact, first: m ? deg(textbookAdvance(m, pins.rmin, pins.rmax)) : NaN, second: m && world.pinTarget?.kind === 'probe' ? deg(secondOrderAdvance(m, pins.rmin, pins.rmax)) : NaN, m };
}

export default function MeasurePanel() {
  useStore((s) => s.stats);
  const gr = useStore((s) => s.gr);
  const arms = useArms();
  const [show, setShow] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<'a' | 'b' | null>(null);
  const pins = world.pins;
  const path = pins.path;
  let R = 1;
  for (let i = 0; i < path.length; i += 2) R = Math.max(R, Math.hypot(path[i], path[i + 1]));
  R *= 1.1;
  const pt = (x: number, y: number) => `${x.toFixed(2)},${(-y).toFixed(2)}`;
  const line = Array.from({ length: path.length / 2 }, (_, i) => pt(path[2 * i], path[2 * i + 1])).join(' ');
  const reading = protractorReading(arms.a, arms.b, pins.sense);
  const values = show ? appValues(gr) : null;

  const angleAt = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 2 * R - R;
    const y = ((e.clientY - r.top) / r.height) * 2 * R - R;
    return Math.atan2(-y, x);
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    const t = angleAt(e);
    const d = (u: number) => Math.abs(Math.atan2(Math.sin(u - t), Math.cos(u - t)));
    drag.current = d(getArms().a) <= d(getArms().b) ? 'a' : 'b';
    setArm(drag.current, t);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current) setArm(drag.current, angleAt(e));
  };
  const onKey = (which: 'a' | 'b') => (e: KeyboardEvent<SVGCircleElement>) => {
    const step = ((e.shiftKey ? 0.1 : 1) * Math.PI) / 180;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') setArm(which, getArms()[which] - step);
    else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') setArm(which, getArms()[which] + step);
    else return;
    e.preventDefault();
  };
  const arm = (which: 'a' | 'b') => {
    const t = arms[which];
    const [x, y] = [R * 0.92 * Math.cos(t), R * 0.92 * Math.sin(t)];
    const label = which === 'a' ? 'First arm' : 'Second arm';
    return (
      <g key={which} className={`arm arm-${which}`}>
        <line x1={0} y1={0} x2={x} y2={-y} />
        <circle
          cx={x}
          cy={-y}
          r={R * 0.05}
          tabIndex={0}
          role="slider"
          aria-label={`${label}, angle`}
          aria-valuemin={-180}
          aria-valuemax={180}
          aria-valuenow={Math.round(deg(Math.atan2(Math.sin(t), Math.cos(t))) * 10) / 10}
          aria-valuetext={`${deg(Math.atan2(Math.sin(t), Math.cos(t))).toFixed(1)} degrees`}
          onKeyDown={onKey(which)}
        />
      </g>
    );
  };

  return (
    <aside className="panel measure" aria-label="Measure the advance">
      <header className="panel-head">
        <h2>Measure</h2>
        <button className="icon-btn" aria-label="Close measure" onClick={() => store.set({ measureOpen: false })}>
          <IconClose />
        </button>
      </header>
      {!world.pinTarget ? (
        <p className="muted">This scene has no orbit to pin. Try Mercury precession, the single black hole or the precessing binary.</p>
      ) : (
        <>
          <p className="measure-note">
            The orbit seen from straight above, centred on {world.pinTarget.kind === 'pair' ? 'the other mass' : 'its mass'}, so angles are true. Each dot is a closest approach. Drag the arms onto two
            neighbouring dots (or focus an arm and use the arrow keys; Shift for tenths).
          </p>
          <svg
            ref={svg}
            className="plan"
            viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`}
            role="group"
            aria-label={`Plan view of the orbit with ${pins.pins.length} closest approaches pinned`}
            onPointerDown={onDown}
            onPointerMove={onMove}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            <polyline className="orbit" points={line} vectorEffect="non-scaling-stroke" />
            <circle className="centre" cx={0} cy={0} r={R * 0.025} />
            {pins.pins.map((p, i) => (
              <circle key={i} className="pin" cx={p.x} cy={-p.y} r={R * 0.03} />
            ))}
            {arm('a')}
            {arm('b')}
          </svg>
          <dl className="live" aria-live="polite">
            <div>
              <dt>Your reading</dt>
              <dd>{reading.toFixed(1)}°</dd>
            </div>
            <div>
              <dt>Pins so far</dt>
              <dd>{pins.pins.length}</dd>
            </div>
          </dl>
          <button className="btn small" aria-expanded={show} onClick={() => setShow(!show)}>
            {show ? 'Hide the app’s values' : 'Show the app’s values'}
          </button>
          {show &&
            (values ? (
              <dl className="live">
                <div>
                  <dt>Advance from the pins</dt>
                  <dd>{values.measured.toFixed(1)}°</dd>
                </div>
                {Number.isFinite(values.exact) && (
                  <div>
                    <dt>Exact (elliptic integral)</dt>
                    <dd>{values.exact.toFixed(1)}°</dd>
                  </div>
                )}
                {Number.isFinite(values.first) && (
                  <div>
                    <dt>6πM/p, orbit flown</dt>
                    <dd>{values.first.toFixed(1)}°</dd>
                  </div>
                )}
                {Number.isFinite(values.second) && (
                  <div>
                    <dt>with the (M/p)² term</dt>
                    <dd>{values.second.toFixed(1)}°</dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="muted">Two closest approaches are needed. Let the scene run.</p>
            ))}
          <p className="muted">
            Pins are placed where ṙ = 0, interpolated between steps: exact up to the integrator’s step error. The series values are approximate by construction{world.pinTarget.kind === 'pair' ? '; for a pair they use the total mass and are only indicative' : ''}.
          </p>
        </>
      )}
    </aside>
  );
}
