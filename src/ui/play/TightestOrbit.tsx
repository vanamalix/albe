/**
 * Tightest stable orbit: choose a radius and a speed, launch with a fixed inward nudge, and see
 * whether the particle survives five turns. The result sits beside the ISCO and the exact verdict
 * of the effective potential; it is a reading, not a score.
 */
import { useEffect, useId, useState } from 'react';
import { circularV, effectiveVerdict, NUDGE, nudgedEdge, nudgedRun, SURVIVE_TURNS, type NudgedRun } from '../../physics/orbitEdge';
import { circularSpeed } from '../../physics/probes';
import { isBlackHole } from '../../physics/types';
import { world } from '../../sim/world';
import { useDepth } from '../../state/depth';
import { useStore } from '../../state/store';
import { readBest, writeBest } from './best';

const LABEL = 'Nudged orbit';

interface Tried {
  rOverM: number;
  v: number;
  run: NudgedRun;
  exact: ReturnType<typeof effectiveVerdict>;
  ours: boolean;
}

export default function TightestOrbit() {
  useStore((s) => s.stats.bodies);
  const gr = useStore((s) => s.gr);
  const grScale = useStore((s) => s.grScale);
  const n = useStore((s) => s.forceExponent);
  const depth = useDepth();
  const id = useId();
  const [rOverM, setR] = useState(8);
  const [v, setV] = useState(() => circularV(8));
  const [tried, setTried] = useState<Tried | null>(null);
  const [best, setBest] = useState(() => readBest('tightest'));
  const [theory, setTheory] = useState(false);
  const s = gr ? grScale : 0;
  const ours = gr && grScale === 1;
  useEffect(() => {
    if (!tried || !tried.ours || tried.run.fate !== 'survives' || (best !== null && tried.rOverM >= best)) return;
    setBest(tried.rOverM);
    writeBest('tightest', tried.rOverM);
  }, [tried, best]);

  const holes = world.bodies.filter(isBlackHole);
  const hole = holes.length === 1 && world.bodies.length === 1 ? holes[0] : null;
  if (!hole) {
    return (
      <section className="toy" aria-label="Tightest stable orbit">
        <h3>Tightest stable orbit</h3>
        <p>This needs the single black hole on its own. Restart the scene to try it.</p>
      </section>
    );
  }
  const m = hole.m;
  const vCirc = circularSpeed(1, rOverM, s > 0, { n, s });
  const launch = () => {
    const law = { n, s };
    const run = nudgedRun(m, rOverM, v, law);
    setTried({ rOverM, v, run, exact: effectiveVerdict(m, rOverM, v, -NUDGE, s, n), ours });
    world.probes = world.probes.filter((p) => p.label !== LABEL);
    world.addProbe(hole.x + rOverM * m, hole.y, hole.vx - NUDGE, hole.vy + v, 'follow', LABEL);
  };
  const isco = 6 * s;
  return (
    <section className="toy" aria-label="Tightest stable orbit">
      <h3>Tightest stable orbit</h3>
      <p>
        {depth === 'words'
          ? `Start a particle on a near-circular orbit, then give it a small push inward. Far out it wobbles and carries on; close in it spirals into the hole. How close can you start and still see it make ${SURVIVE_TURNS} turns?`
          : depth === 'numbers'
            ? `The push is ${NUDGE}c inward. In our universe circular orbits exist down to 3M but are stable only outside the ISCO, 6M = ${6 * m} here. A perfect circle inside 6M would coast; the push is what tests it.${ours ? '' : ` With the laws set below the ISCO is ${s > 0 ? `${(6 * s).toFixed(2)}M` : 'gone'}.`}`
            : (ours ? '' : 'In our universe (with the term scaled by s, read 3sM and 6sM): ') + 'With W(r) = −M/r + L²/(2r²) − ML²/r³, ½ṙ² + W = const along the geodesic. W has a barrier and a well, at the roots of Mr² − L²r + 3ML² = 0, which merge at L² = 12M², r = 6M. Inside that, any push inward goes over the top. Outside it, a push of size δ survives only if ½δ² fits under the barrier, which needs a margin beyond 6M. Near 6M the barrier grows as (r − 6M)³, so the margin goes as δ^(2/3).'}
      </p>
      <div className="slider-row">
        <label htmlFor={`${id}-r`}>
          Start radius <output>{rOverM.toFixed(2)} M</output>
        </label>
        <input
          id={`${id}-r`}
          type="range"
          min={5}
          max={24}
          step={0.01}
          value={rOverM}
          onChange={(e) => {
            const r = +e.target.value;
            setR(r);
            const c = circularSpeed(1, r, s > 0, { n, s });
            if (Number.isFinite(c)) setV(Math.min(0.9, c));
          }}
        />
      </div>
      <div className="slider-row">
        <label htmlFor={`${id}-v`}>
          Speed <output>{v.toFixed(4)} c</output>
        </label>
        <input id={`${id}-v`} type="range" min={0.2} max={0.9} step={0.0005} value={v} onChange={(e) => setV(+e.target.value)} />
      </div>
      <p className="ref">
        Circular speed at this radius: {Number.isFinite(vCirc) ? `${vCirc.toFixed(4)} c` : 'none'} (dx/dτ). Moving the radius resets the speed to it.
      </p>
      <div className="explain-actions">
        <button className="btn small" onClick={() => setV(vCirc)} disabled={!Number.isFinite(vCirc)}>
          Circular speed
        </button>
        <button className="btn small" onClick={launch}>
          Launch with the nudge
        </button>
      </div>
      {tried && (
        <dl className="live" aria-live="polite">
          <div>
            <dt>Started at</dt>
            <dd>
              {tried.rOverM.toFixed(2)} M, {tried.v.toFixed(4)} c
            </dd>
          </div>
          <div>
            <dt>Run (app’s RK4)</dt>
            <dd>
              {tried.run.fate}
              {tried.run.fate === 'survives' ? ` ${SURVIVE_TURNS} turns` : ` after ${tried.run.turns.toFixed(2)} turns`}
            </dd>
          </div>
          <div>
            <dt>r ranged over</dt>
            <dd>
              {tried.run.rMin.toFixed(2)} to {tried.run.rMax.toFixed(2)} M
            </dd>
          </div>
          <div>
            <dt>Effective potential says</dt>
            <dd>{tried.exact === 'survives' ? 'bound for ever' : tried.exact}</dd>
          </div>
          <div>
            <dt>ISCO</dt>
            <dd>{s > 0 ? `${isco.toFixed(2)} M` : 'none (Newton)'}</dd>
          </div>
        </dl>
      )}
      {best !== null && (
        <dl className="live">
          <div>
            <dt>Smallest r that survived on this browser</dt>
            <dd>{best.toFixed(2)} M</dd>
          </div>
        </dl>
      )}
      <div className="explain-actions">
        <button className="btn small" aria-expanded={theory} onClick={() => setTheory(!theory)}>
          {theory ? 'Hide' : 'Show'} where theory puts the edge
        </button>
      </div>
      {theory && (
        <p>
          {s > 0
            ? `For a circular start and this nudge, the effective potential keeps the orbit bound from r = ${nudgedEdge(s).toFixed(3)} M outward: ${(nudgedEdge(s) - isco).toFixed(3)} M beyond the ISCO at ${isco.toFixed(2)} M. A smaller nudge brings the edge closer to 6M; an exact circle inside it is unstable but would still coast. A run near the edge can whirl for a few turns before it falls, so five turns is a slightly generous test.`
            : 'With the relativistic term off there is no ISCO: Newton’s circular orbits are stable at every radius, so a nudged orbit survives anywhere outside the drawn hole.'}
        </p>
      )}
      <p className="ref">
        Exact for one hole: the run uses the scene’s own test-particle law and step, and the particle is also launched in the scene (gold, labelled “{LABEL}”).
        {!ours && ' Not our universe: the laws in use are the ones set below, and the browser best is kept only for ours.'}
      </p>
    </section>
  );
}
