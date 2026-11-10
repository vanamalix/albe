/**
 * Euclid's five postulates, each with a switch. Turning one off moves to a geometry where it fails;
 * the visitor drags a geodesic triangle and reads its angles against the curvature it encloses.
 * Every figure is computed by src/physics/euclid.ts; the chart is conformal, so angles drawn are true.
 */
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import { GEOMETRIES, gaussBonnetExcess, taxicabLength, type GeometryId } from '../../physics/euclid';
import { euclidStore, useEuclid } from '../../state/euclid';
import { useDepth } from '../../state/depth';
import { euclidModel, exampleFor, POSTULATE_LIST } from './euclidModel';

const deg = (r: number) => (r * 180) / Math.PI;
const d2 = (r: number) => `${deg(r).toFixed(2)}°`;
const NAMES = ['A', 'B', 'C'];

const PICK: { id: GeometryId; label: string }[] = [
  { id: 'flat', label: 'Plane' },
  { id: 'sphere', label: 'Sphere' },
  { id: 'hyperbolic', label: 'Hyperbolic' },
  { id: 'flamm', label: 'Black hole slice' },
  { id: 'ellis', label: 'Wormhole' },
  { id: 'alcubierre', label: 'Warp slice' },
];

function choose(id: GeometryId): void {
  euclidStore.set({ geometry: id, verts: GEOMETRIES[id].triangle, demo: 'none', circle: 0 });
}

const pts = (xs: readonly number[], ys: readonly number[]) => xs.map((x, i) => `${x.toFixed(4)},${(-ys[i]).toFixed(4)}`).join(' ');

function Chart() {
  const s = useEuclid((x) => x);
  const m = euclidModel(s);
  const V = m.g.view;
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const v = s.verts.length === 3 ? s.verts : m.g.triangle;
  const at = (e: PointerEvent<SVGSVGElement>): [number, number] => {
    const r = svg.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 2 * V - V, -(((e.clientY - r.top) / r.height) * 2 * V - V)];
  };
  // Keep vertices inside the chart: off the hyperbolic rim, outside the throat for the folds.
  const clamp = ([x, y]: [number, number]): [number, number] => {
    const R = Math.hypot(x, y);
    const lo = m.g.id === 'flamm' || m.g.id === 'ellis' ? (m.g.throat ?? 0) * 1.08 : 0;
    const hi = m.g.id === 'hyperbolic' ? 0.93 : V * 0.97;
    const k = R < lo ? lo / Math.max(R, 1e-9) : R > hi ? hi / R : 1;
    return [x * k, y * k];
  };
  const move = (i: number, p: [number, number], dragging: boolean) => {
    const next = v.map((q) => [q[0], q[1]] as [number, number]);
    next[i] = clamp(p);
    euclidStore.set({ verts: next, dragging, demo: s.demo === 'antipodes' ? 'none' : s.demo });
  };
  const onDown = (e: PointerEvent<SVGSVGElement>) => {
    const p = at(e);
    let best = -1;
    let bd = Infinity;
    v.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    if (bd > 0.18 * V) return;
    drag.current = best;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (drag.current !== null) move(drag.current, at(e), true);
  };
  const onUp = () => {
    if (drag.current === null) return;
    drag.current = null;
    euclidStore.set({ dragging: false });
  };
  const onKey = (i: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    const step = (e.shiftKey ? 0.005 : 0.03) * V;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const k = d[e.key];
    if (!k) return;
    e.preventDefault();
    move(i, [v[i][0] + k[0], v[i][1] + k[1]], false);
  };
  const sw = V / 160;
  return (
    <svg
      ref={svg}
      className="plan euclid-chart"
      viewBox={`${-V} ${-V} ${2 * V} ${2 * V}`}
      role="group"
      aria-label={`${m.g.name}, drawn in a conformal chart. Drag a vertex, or focus one and use the arrow keys.`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
    >
      {m.g.throat && <circle className={m.g.id === 'flamm' || m.g.id === 'ellis' ? 'throat' : 'rim'} cx={0} cy={0} r={m.g.throat} strokeWidth={sw * 1.5} />}
      {m.g.id === 'flamm' && <circle className="inner" cx={0} cy={0} r={m.g.throat} />}
      {m.circle && m.circle.xs.length > 2 && <polygon className="circle" points={pts(m.circle.xs, m.circle.ys)} strokeWidth={sw} />}
      {m.perp && (
        <>
          <polyline className="perp" points={pts(m.perp.a.x, m.perp.a.y)} strokeWidth={sw} />
          <polyline className="perp" points={pts(m.perp.b.x, m.perp.b.y)} strokeWidth={sw} />
        </>
      )}
      {m.antipodal.map((gc, i) => (
        <polyline key={i} className="great" points={pts(gc.x, gc.y)} strokeWidth={sw} />
      ))}
      {m.edge && (
        <>
          <polyline className="continued" points={pts(m.edge.continued.x, m.edge.continued.y)} strokeWidth={sw} />
          <polyline className="stopped" points={pts(m.edge.stopped.x, m.edge.stopped.y)} strokeWidth={sw * 1.6} />
        </>
      )}
      {m.tri?.edges.map((e, i) => (
        <polyline key={i} className="edge" points={pts(e.x, e.y)} strokeWidth={sw * 1.6} />
      ))}
      {v.map((q, i) => (
        <g key={i}>
          <circle
            className="vertex"
            cx={q[0]}
            cy={-q[1]}
            r={V * 0.04}
            strokeWidth={sw}
            tabIndex={0}
            role="button"
            aria-roledescription="draggable vertex"
            aria-label={`Vertex ${NAMES[i]} at ${q[0].toFixed(2)}, ${q[1].toFixed(2)}`}
            onKeyDown={onKey(i)}
          />
          <text x={q[0] + V * 0.06} y={-q[1] - V * 0.05} fontSize={V * 0.08}>
            {NAMES[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Taxicab() {
  // The ℓ¹ unit circle (a square on its corner), with a right angle along the axes and one turned 45°.
  const r2 = Math.SQRT1_2;
  return (
    <>
      <svg className="plan euclid-chart" viewBox="-1.3 -1.3 2.6 2.6" role="img" aria-label="Taxicab plane: its unit circle is a square on its corner. A unit ruler along the axes reaches the square; turned 45° it overshoots, reading √2.">
        <polygon className="circle" points="1,0 0,-1 -1,0 0,1" strokeWidth={0.012} />
        <line className="edge" x1={0} y1={0} x2={1} y2={0} strokeWidth={0.02} />
        <line className="edge" x1={0} y1={0} x2={0} y2={-1} strokeWidth={0.02} />
        <line className="perp" x1={0} y1={0} x2={r2} y2={-r2} strokeWidth={0.02} />
        <line className="perp" x1={0} y1={0} x2={-r2} y2={-r2} strokeWidth={0.02} />
      </svg>
      <dl className="live">
        <div>
          <dt>Ruler along an axis (ℓ¹ length)</dt>
          <dd>{taxicabLength(0).toFixed(3)}</dd>
        </div>
        <div>
          <dt>Same ruler turned 45°</dt>
          <dd>{taxicabLength(Math.PI / 4).toFixed(3)}</dd>
        </div>
      </dl>
      <p className="ref">
        Gold: a right angle along the axes. Blue: the same right angle turned 45°, its arms the same Euclidean length. Each is half a straight angle, yet no motion of the taxicab plane lays one on the other,
        because the only turns that keep |dx| + |dy| are multiples of 90°. Every Riemannian geometry, the sphere and albe’s folds included, keeps postulate 4 at each point, because its metric is quadratic.
      </p>
    </>
  );
}

export default function EuclidPanel() {
  const s = useEuclid((x) => x);
  const depth = useDepth();
  const m = euclidModel(s);
  const t = m.tri;
  const taxi = s.demo === 'taxicab';
  const maxCircle = m.g.id === 'sphere' ? Math.PI * 0.98 : m.g.id === 'hyperbolic' ? 2.2 : m.g.id === 'flamm' ? 3 : m.g.id === 'ellis' ? 2.2 : 1.6;
  const onSwitch = (k: number, on: boolean) => {
    if (on) choose('flat');
    else euclidStore.set(exampleFor(k));
  };
  return (
    <section className="exhibit-panel tall" aria-label="Euclid’s postulates controls">
      <strong>Euclid’s postulates</strong>
      <p className="ref">Switch one off to move to a geometry where it fails. Others may fail with it, and their switches follow. Only the plane keeps all five.</p>
      {POSTULATE_LIST.map((p, i) => {
        const [holds, why] = m.postulates[i];
        return (
          <label key={p.n} className="toggle" title={p.text}>
            <input type="checkbox" checked={holds !== 'fails'} onChange={(e) => onSwitch(p.n, e.target.checked)} />
            <span className="switch" aria-hidden="true" />
            <span className="toggle-text">
              {p.n}. {p.short}
              <small>
                {holds}: {why}
              </small>
            </span>
          </label>
        );
      })}
      {m.g.id === 'hyperbolic' || m.g.id === 'sphere' ? (
        s.demo === 'none' && (
          <div className="explain-actions">
            <button className="btn small" onClick={() => choose(m.g.id === 'sphere' ? 'hyperbolic' : 'sphere')}>
              {m.g.id === 'sphere' ? 'Many parallels instead (hyperbolic)' : 'No parallels instead (sphere)'}
            </button>
          </div>
        )
      ) : null}
      <h4>Geometry</h4>
      <div className="depth wrap" role="group" aria-label="Geometry">
        {PICK.map((g) => (
          <button key={g.id} aria-pressed={!taxi && s.geometry === g.id} className={!taxi && s.geometry === g.id ? 'on' : ''} onClick={() => choose(g.id)}>
            {g.label}
          </button>
        ))}
      </div>
      {taxi ? (
        <Taxicab />
      ) : (
        <>
          <Chart />
          <p className="ref">{m.g.chartNote}</p>
          <dl className="live" aria-live="polite">
            {t ? (
              <>
                <div>
                  <dt>Angles A, B, C</dt>
                  <dd>
                    {t.angles.map((a) => deg(a).toFixed(2)).join(' · ')}
                  </dd>
                </div>
                <div>
                  <dt>Sum</dt>
                  <dd>{d2(t.sum)}</dd>
                </div>
                <div>
                  <dt>{t.chi === 1 ? 'Excess, Σ − 180°' : 'Σ − 540° (wraps the throat)'}</dt>
                  <dd>{d2(t.sum - Math.PI * (t.chi === 1 ? 1 : 3))}</dd>
                </div>
                <div>
                  <dt>∫K dA inside (quadrature)</dt>
                  <dd>{d2(t.curvature)}</dd>
                </div>
                {depth !== 'words' && (
                  <div>
                    <dt>Gauss-Bonnet gap</dt>
                    <dd>{Math.abs(gaussBonnetExcess(t) - (t.sum - Math.PI)).toExponential(1)} rad</dd>
                  </div>
                )}
                <div>
                  <dt>Area (proper)</dt>
                  <dd>{t.area.toFixed(4)}</dd>
                </div>
              </>
            ) : (
              <div>
                <dt>Triangle</dt>
                <dd>{s.demo === 'antipodes' ? 'A and B are antipodal: no single edge AB' : 'no geodesic found for an edge'}</dd>
              </div>
            )}
            {m.perp && (
              <div>
                <dt>Perpendiculars at A and B, after |AB|: gap / |AB|</dt>
                <dd>{Number.isFinite(m.perp.gap) ? (m.perp.gap / m.perp.base).toFixed(4) : 'one ran off the chart'}</dd>
              </div>
            )}
            {m.circle && (
              <>
                <div>
                  <dt>Circle about A: radius s, circumference</dt>
                  <dd>
                    {m.circle.s.toFixed(2)} · {Number.isFinite(m.circle.length) ? m.circle.length.toFixed(4) : 'reaches the edge'}
                  </dd>
                </div>
                <div>
                  <dt>2πs{m.circle.closed !== null ? ', closed form' : ''}</dt>
                  <dd>
                    {(2 * Math.PI * m.circle.s).toFixed(4)}
                    {m.circle.closed !== null ? ` · ${m.circle.closed.toFixed(4)}` : ''}
                  </dd>
                </div>
              </>
            )}
            {m.edge && (
              <div>
                <dt>Aimed at the hole: proper length to the throat</dt>
                <dd>{m.edge.toThroat.toFixed(3)} M, then it stops (r ≥ 2M kept)</dd>
              </div>
            )}
          </dl>
          <div className="slider-row">
            <label htmlFor="eu-circle">
              Circle about A, proper radius <output>{s.circle ? s.circle.toFixed(2) : 'off'}</output>
            </label>
            <input id="eu-circle" type="range" min={0} max={maxCircle} step={0.01} value={s.circle} onChange={(e) => euclidStore.set({ circle: +e.target.value })} />
          </div>
          <label className="toggle compact">
            <input type="checkbox" checked={s.perpendiculars} onChange={(e) => euclidStore.set({ perpendiculars: e.target.checked })} />
            <span className="switch" aria-hidden="true" />
            <span className="toggle-text">Perpendiculars at A and B (parallel, meeting or diverging)</span>
          </label>
          {m.g.id === 'flamm' && (
            <label className="toggle compact">
              <input type="checkbox" checked={s.demo === 'edge'} onChange={(e) => euclidStore.set({ demo: e.target.checked ? 'edge' : 'none' })} />
              <span className="switch" aria-hidden="true" />
              <span className="toggle-text">Keep only r ≥ 2M (a line aimed at the hole ends)</span>
            </label>
          )}
          <p className="ref">
            Gold: the triangle’s geodesic edges. Blue: perpendiculars. Green: the circle. {m.antipodal.length ? 'Pale: six great circles through A, all meeting at B. ' : ''}
            {m.edge ? 'Red: the line aimed at the hole, stopped at the throat; dashed: where it goes on the whole bridge. ' : ''}
          </p>
        </>
      )}
      <p className="tag-line exact">Exact geometry: geodesics by RK4 in the chart, ∫K dA by quadrature of the closed-form K. Tests match spherical and hyperbolic trigonometry, Girard, Lobachevsky and Gauss-Bonnet to 5 or more digits.</p>
      <p className="tag-line approx">The folds are spatial slices at one instant. Spacetime is Lorentzian, so this is not its whole curvature: see Explain.</p>
    </section>
  );
}
