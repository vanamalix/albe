/**
 * Kruskal and Penrose diagram for the Clocks scene: the falling clock's worldline continued through
 * the horizon to r = 0, where albe's sheet has to stop it at 2.04M. From src/physics/kruskal.ts.
 */
import { useMemo, useState } from 'react';
import { compact, fallAt, fallWorldline, tortoise, uvProduct } from '../../physics/kruskal';
import { clockReading } from '../../physics/probes';
import { isBlackHole } from '../../physics/types';
import { world } from '../../sim/world';
import { useDepth } from '../../state/depth';
import { useStore } from '../../state/store';

const FALLER = 'Falling from rest';

export default function Kruskal() {
  const t = useStore((s) => s.stats.simTime);
  const depth = useDepth();
  const [framed, setFramed] = useState(true);
  const hole = world.bodies.find(isBlackHole);
  const M = hole?.m ?? 4;
  const R = 100;
  const line = useMemo(() => fallWorldline(M, R, 600), [M]);
  // Centred: shift the time origin (U → U·V_c, V → V/V_c, a boost, which is an isometry) so the
  // horizon crossing sits at V = 1. The diagram is the same; only where t = 0 falls moves.
  const cross = line.find((q) => q.r < 2 * M) ?? line[line.length - 1];
  const a = framed ? 1 / cross.V : 1;
  const b = framed ? cross.V : 1;
  const P = (U: number, V: number) => {
    const c = compact(U, V, a, b);
    return `${c.x.toFixed(4)},${(-c.y).toFixed(4)}`;
  };
  const poly = (pts: [number, number][]) => pts.map(([U, V]) => P(U, V)).join(' ');
  const BIG = 1e12;
  const span = (n: number, f: (s: number) => [number, number]) => Array.from({ length: n + 1 }, (_, i) => f(i / n));
  // Hyperbola UV = k sampled along log V.
  const hyper = (k: number, sign: 1 | -1) => span(200, (s) => {
    const V = sign * Math.exp(-28 + 56 * s) * Math.max(b, 1);
    return [k / V, V];
  });

  const p = world.probes.find((q) => q.label === FALLER);
  const cap = world.lastCapture?.label === FALLER ? world.lastCapture : null;
  const tauNow = p ? clockReading(p) : cap ? cap.tau : null;
  const here = tauNow !== null ? fallAt(line, tauNow) : null;
  const solid = here ? line.filter((q) => q.tau <= here.tau) : [];
  const total = line[line.length - 1].tau;
  // The distant observer's "now": the line t = const in region I, through the bifurcation point.
  const nowLine = span(120, (s) => {
    const e = Math.exp(-30 + 60 * s);
    return [-Math.exp(-t / (4 * M)) * e, Math.exp(t / (4 * M)) * e] as [number, number];
  });
  const k8 = uvProduct(M, 8 * M);
  const k30 = uvProduct(M, 30 * M);

  return (
    <section className="toy" aria-label="Kruskal and Penrose diagram">
      <h3>Through the horizon: Kruskal and Penrose</h3>
      <p>
        {depth === 'words'
          ? 'albe has to stop the falling clock just outside the horizon, because its sheet uses the distant observer’s time, which never gets there. This diagram uses coordinates that do: light always moves at 45°, and the clock carries on through the horizon to the singularity in a finite time of its own.'
          : depth === 'numbers'
            ? `Let go at 25M, the clock reaches r = 0 after ${total.toFixed(1)} of its own time (M = ${M}); the horizon about ${(cross.tau).toFixed(1)}. The distant time t of each line through the centre is fixed, and every one of them, for any t, meets the horizon only at the centre point.`
            : 'Kruskal: UV = −(r/2M − 1)e^{r/2M}, with U = −e^{−(t − r*)/4M}, V = e^{(t + r*)/4M} outside. Along the fall from rest at R, v = t + r* obeys dv/dτ = 1/(E + √(E² − f)), finite through r = 2M, so V = e^{v/4M} and U = (UV)/V continue to UV = 1 (r = 0). Drawn as the standard Penrose diagram, Ũ = arctan U, Ṽ = arctan V. “Centred” first shifts t, which multiplies U and divides V by one constant: an isometry, so it is the same diagram with t = 0 moved.'}
      </p>
      <div className="depth" role="group" aria-label="Diagram scale">
        <button aria-pressed={framed} className={framed ? 'on' : ''} onClick={() => setFramed(true)}>
          Centred on the crossing
        </button>
        <button aria-pressed={!framed} className={framed ? '' : 'on'} onClick={() => setFramed(false)}>
          Release at t = 0
        </button>
      </div>
      <svg className="plan kruskal" viewBox="-1.65 -1.0 3.3 2.0" role="img" aria-label={`Penrose-type diagram. The falling clock ${here ? `is at r = ${(here.r / M).toFixed(2)} M, its own time ${here.tau.toFixed(1)}` : 'has not started'}; its worldline continues to r = 0 at ${total.toFixed(1)}.`}>
        {/* Infinity: the edges U, V → ±∞. */}
        <polyline className="edge" points={poly([[-BIG, 1e-9], [-BIG, BIG], [1e-9, BIG]].map(([U, V]) => [U, V] as [number, number]))} />
        <polyline className="edge" points={poly([[BIG, -1e-9], [BIG, -BIG], [-1e-9, -BIG]].map(([U, V]) => [U, V] as [number, number]))} />
        {/* Horizons U = 0 and V = 0. */}
        <polyline className="horizon" points={poly(span(100, (s) => [0, Math.tan((s - 0.5) * Math.PI * 0.999) * b]))} />
        <polyline className="horizon" points={poly(span(100, (s) => [Math.tan((s - 0.5) * Math.PI * 0.999) * a, 0]))} />
        {/* Singularities r = 0: UV = 1, in the black hole (top) and white hole (bottom). */}
        <polyline className="singular" points={poly(hyper(1, 1))} />
        <polyline className="singular" points={poly(hyper(1, -1))} />
        {/* The two orbiting clocks' radii, 8M and 30M. */}
        <polyline className="orbit8" points={poly(hyper(k8, 1))} />
        <polyline className="orbit30" points={poly(hyper(k30, 1))} />
        <polyline className="now" points={poly(nowLine)} />
        <polyline className="fall-ahead" points={poly(line.map((q) => [q.U, q.V]))} />
        {solid.length > 1 && <polyline className="fall" points={poly(solid.map((q) => [q.U, q.V]))} />}
        {here && <circle className="clock" cx={compact(here.U, here.V, a, b).x} cy={-compact(here.U, here.V, a, b).y} r={0.035} />}
        {cap && (() => {
          const c = fallAt(line, cap.tau);
          const q = compact(c.U, c.V, a, b);
          return <circle className="removed" cx={q.x} cy={-q.y} r={0.045} />;
        })()}
        <text x={0.75} y={0.05}>I</text>
        <text x={-0.03} y={-0.6}>II</text>
        <text x={-0.85} y={0.05}>III</text>
        <text x={-0.04} y={0.7}>IV</text>
      </svg>
      <ul className="key">
        <li>
          <i className="swatch gold" /> The falling clock (solid: so far; faint: still to come)
        </li>
        <li>
          <i className="swatch red" /> Where albe removes it, 2.04M
        </li>
        <li>
          <i className="swatch blue" /> Distant observer’s “now”, t = {t.toFixed(0)}
        </li>
        <li>
          <i className="swatch dash-gold" /> Horizons · <i className="swatch dash-red" /> r = 0
        </li>
      </ul>
      <dl className="live">
        <div>
          <dt>Clock’s own time now</dt>
          <dd>{tauNow !== null ? tauNow.toFixed(1) : '—'}</dd>
        </div>
        <div>
          <dt>Its own time at the horizon · at r = 0</dt>
          <dd>
            {cross.tau.toFixed(1)} · {total.toFixed(1)}
          </dd>
        </div>
        {cap && (
          <div>
            <dt>Removed by albe at τ (still to the horizon)</dt>
            <dd>
              {cap.tau.toFixed(1)} ({Math.max(0, cross.tau - cap.tau).toFixed(2)})
            </dd>
          </div>
        )}
        <div>
          <dt>r* at release (tortoise)</dt>
          <dd>{tortoise(M, R).toFixed(1)}</dd>
        </div>
      </dl>
      <p className="ref">
        I: our outside. II: inside the black hole; every future there ends on r = 0. III: a second outside, and IV: a white hole, both part of the eternal (vacuum) solution but not of a hole formed by a
        collapsing star, whose surface covers them (Oppenheimer and Snyder 1939). Nothing astrophysical comes out of IV. Grey hyperbolae: the orbiting clocks at 8M and 30M. Exact for one Schwarzschild hole;
        the worldline uses quadrature to about 10⁻⁶.
      </p>
    </section>
  );
}
