/**
 * Wind the light: set how close a ray's impact parameter is to the critical one and count the turns
 * it makes round the hole. The count is the app's own ray integrator, withheld past a stated error.
 */
import { useEffect, useId, useMemo, useState } from 'react';
import { B_CRIT } from '../../physics/lens';
import { makeRay } from '../../physics/light';
import { isBlackHole } from '../../physics/types';
import { TURN_FACTOR, WIND_ETA, WIND_TOLERANCE, windReading } from '../../physics/winding';
import { world } from '../../sim/world';
import { useDepth } from '../../state/depth';
import { useStore } from '../../state/store';
import { readBest, writeBest } from './best';
import { sci } from './format';

const f4 = (v: number) => v.toFixed(4);

export default function WindLight() {
  useStore((s) => s.stats.bodies);
  const depth = useDepth();
  const id = useId();
  const [inside, setInside] = useState(false);
  const [k, setK] = useState(-6);
  const [best, setBest] = useState(() => readBest('wind'));
  const holes = world.bodies.filter(isBlackHole);
  const hole = holes.length === 1 && world.bodies.length === 1 ? holes[0] : null;
  const m = hole?.m ?? 0;
  const delta = (inside ? -1 : 1) * 10 ** k;
  const r = useMemo(() => (m > 0 ? windReading(m, delta) : null), [m, delta]);
  const counted = r?.turns ?? null;
  useEffect(() => {
    if (counted === null || (best !== null && counted <= best)) return;
    setBest(counted);
    writeBest('wind', counted);
  }, [counted, best]);
  if (!hole || !r) {
    return (
      <section className="toy" aria-label="Wind the light">
        <h3>Wind the light</h3>
        <p>This needs one black hole on its own: the count is exact only for a single mass. Restart the scene to try it.</p>
      </section>
    );
  }
  const fire = () => {
    // At a finite start the null condition makes |v| a little above 1, and the impact parameter is
    // L/E = y|v|: choose y so that it is b itself.
    const x = hole.x - 145;
    let y = r.b;
    for (let i = 0; i < 4; i++) {
      const ray = makeRay(0, x, hole.y + y, 1, 0, world.bodies);
      y = r.b / Math.hypot(ray.vx, ray.vy);
    }
    world.fireRay(x, hole.y + y, 1, 0);
  };
  return (
    <section className="toy" aria-label="Wind the light">
      <h3>Wind the light</h3>
      <p>
        {depth === 'words'
          ? 'Aim a ray ever closer to the critical line and it circles the hole more times before it gets away or falls in. Each extra turn needs an aim about 535 times finer.'
          : depth === 'numbers'
            ? `Here b_c = 3√3 M = ${(B_CRIT * m).toFixed(4)}. Each factor e^{2π} ≈ ${TURN_FACTOR.toFixed(1)} closer to b_c adds one turn, so each factor of 10 adds ln 10 / 2π ≈ 0.366 of a turn.`
            : 'With t = u − 1/(3M), the orbit equation is exactly (dt/dφ)² = ε + t² + 2Mt³, ε = 1/b² − 1/(27M²). Near the photon orbit a deviation grows as e^φ, so the angle spent there is −ln|ε| plus a constant, and ε ∝ b − b_c: one turn per factor e^{2π} on either side. On escape, Bozza’s strong-deflection limit is α̂ = −ln(b/b_c − 1) + b̄, b̄ = ln[216(7 − 4√3)] − π ≈ −0.400.'}
      </p>
      <div className="depth" role="group" aria-label="Which side of the critical line">
        <button aria-pressed={!inside} className={inside ? '' : 'on'} onClick={() => setInside(false)}>
          Just outside
        </button>
        <button aria-pressed={inside} className={inside ? 'on' : ''} onClick={() => setInside(true)}>
          Just inside
        </button>
      </div>
      <div className="slider-row">
        <label htmlFor={`${id}-k`}>
          |b − b_c| / b_c <output>{sci(10 ** k)}</output>
        </label>
        <input id={`${id}-k`} type="range" min={-13} max={-1} step={0.05} value={k} aria-valuetext={sci(10 ** k)} onChange={(e) => setK(+e.target.value)} />
      </div>
      <dl className="live">
        <div>
          <dt>Impact parameter b / M</dt>
          <dd>{(r.b / m).toFixed(Math.min(14, Math.ceil(2 - k)))}</dd>
        </div>
        <div>
          <dt>The ray</dt>
          <dd>{r.fate}</dd>
        </div>
        <div>
          <dt>Turns counted (RK4)</dt>
          <dd>{r.turns !== null ? `${f4(r.turns)} ± ${sci(Math.max(r.error, 1e-12))}` : 'not counted'}</dd>
        </div>
        {r.turns === null && (
          <div>
            <dt>Why not</dt>
            <dd>{Number.isFinite(r.error) ? `estimated error ${r.error.toFixed(3)} turn passes ${WIND_TOLERANCE}` : 'the two step sizes disagree on its fate'}</dd>
          </div>
        )}
        <div>
          <dt>{r.fate === 'escapes' ? 'Exact, π + α̂(b) (elliptic integral)' : 'Exact, to 2.04M (quadrature)'}</dt>
          <dd>{f4(r.exact)}</dd>
        </div>
        {r.exactToHorizon !== null && (
          <div>
            <dt>Exact, on to the horizon 2M</dt>
            <dd>{f4(r.exactToHorizon)}</dd>
          </div>
        )}
        {r.strong !== null && (
          <div>
            <dt>Strong-deflection law</dt>
            <dd>{f4(r.strong)}</dd>
          </div>
        )}
        {Number.isFinite(r.gainedPerFactor) && (
          <div>
            <dt>Gained since an aim {TURN_FACTOR.toFixed(0)}× wider</dt>
            <dd>{f4(r.gainedPerFactor)} turn</dd>
          </div>
        )}
        {best !== null && (
          <div>
            <dt>Most turns counted on this browser</dt>
            <dd>{f4(best)}</dd>
          </div>
        )}
      </dl>
      <p className="ref">
        Exact for one hole. Turns are the angle swept round the hole over 360°, from far in to far out (or to 2.04M, where albe removes a ray). The count runs the app’s null-geodesic RK4 at steps of {WIND_ETA * 100}% of r and again at {WIND_ETA * 200}%; their whole difference is the error estimate, a cautious one, and past {WIND_TOLERANCE} turn the count is withheld. That error grows about tenfold for each tenfold closer aim: the same instability amplifies it.
      </p>
      <div className="explain-actions">
        <button className="btn small" onClick={fire}>
          Fire it in the scene
        </button>
      </div>
      <p className="ref">The scene’s ray takes coarser steps (5% of r), so close to b_c it can turn a different number of times from the count above.</p>
    </section>
  );
}
