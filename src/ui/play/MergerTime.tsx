/**
 * Hit a merger time: pick a target, choose a separation, run the pair to merger with the app's own
 * law, and set the result beside the Peters estimate. The gap is the lesson; nothing is scored.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { circularBinarySpeed, pairOf } from '../../physics/presets';
import { MERGER_HOLE, MERGER_SEP, MERGER_TARGETS, MergerRun, petersCircular, petersToContact, type MergerResult } from '../../sim/mergerRun';
import { world } from '../../sim/world';
import { loadPreset } from '../../state/actions';
import { useDepth } from '../../state/depth';

const M = 2 * MERGER_HOLE;
const f0 = (v: number) => v.toFixed(0);
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(0)}`;

export default function MergerTime() {
  const depth = useDepth();
  const id = useId();
  const [target, setTarget] = useState(2000);
  const [sep, setSep] = useState(40);
  const [running, setRunning] = useState<number | null>(null);
  const [result, setResult] = useState<MergerResult | null>(null);
  const timer = useRef<number | null>(null);
  useEffect(() => () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
  }, []);

  const run = () => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    const r = new MergerRun(sep);
    setResult(null);
    setRunning(0);
    const tick = () => {
      if (r.slice(12)) {
        timer.current = null;
        setRunning(null);
        setResult(r.result);
        return;
      }
      setRunning(r.world.simTime);
      timer.current = window.setTimeout(tick, 0);
    };
    tick();
  };

  const watch = () => {
    loadPreset('binary');
    for (const b of [...world.bodies]) world.removeBody(b.id);
    for (const b of pairOf(MERGER_HOLE, MERGER_HOLE, sep, circularBinarySpeed(MERGER_HOLE, MERGER_HOLE, sep))) world.addBody(b.x, b.y, b.vx, b.vy, b.m);
    world.trackPins();
  };

  const r = result;
  const before = r && r.capFrom !== null ? r.time - r.cappedTime : null;
  const petersToCap = r && r.capFrom !== null ? r.peters - petersCircular(r.capFrom * M) : null;
  return (
    <section className="toy" aria-label="Hit a merger time">
      <h3>Hit a merger time</h3>
      <p>
        {depth === 'words'
          ? 'Two equal black holes on a round orbit. Pick a target, choose how far apart they start, and run them to merger. Then compare with the classic estimate: the difference says what the estimate leaves out.'
          : depth === 'numbers'
            ? `Each hole has M = ${MERGER_HOLE}, so M = ${M} in total. Peters’ estimate grows as the fourth power of the separation: at 40 it is ${f0(petersCircular(40))}, and doubling the gap multiplies it by 16.`
            : `Peters (1964), leading order, circular: da/dt = −(64/5) m₁m₂M/a³, so T = (5/256) a⁴/(m₁m₂M). The run instead has 1PN conservative terms (an O(M/a) change in how energy maps to separation and frequency), 2.5PN radiation reaction at leading order only, the 1PN cap from about 7.2M with no ISCO and so no plunge, and merger at contact, r = 2M.`}
      </p>
      <div className="depth" role="group" aria-label="Target merger time">
        {MERGER_TARGETS.map((t) => (
          <button key={t} aria-pressed={target === t} className={target === t ? 'on' : ''} onClick={() => setTarget(t)}>
            {t.toLocaleString('en')}
          </button>
        ))}
      </div>
      <div className="slider-row">
        <label htmlFor={`${id}-a`}>
          Separation <output>{sep.toFixed(1)} ({(sep / M).toFixed(2)} M)</output>
        </label>
        <input id={`${id}-a`} type="range" min={MERGER_SEP.min} max={MERGER_SEP.max} step={0.1} value={sep} onChange={(e) => setSep(+e.target.value)} />
      </div>
      <div className="explain-actions">
        <button className="btn small" onClick={run} disabled={running !== null}>
          {running !== null ? `Running… t = ${f0(running)}` : 'Run to merger'}
        </button>
        <button className="btn small" onClick={watch}>
          Watch this pair in the scene
        </button>
      </div>
      {r && (
        <>
          <dl className="live" aria-live="polite">
            <div>
              <dt>{r.merged ? 'Merged at (this run)' : 'Not merged by'}</dt>
              <dd>{f0(r.time)}</dd>
            </div>
            <div>
              <dt>Against the target {target.toLocaleString('en')}</dt>
              <dd>
                {signed(r.time - target)} ({signed((100 * (r.time - target)) / target)}%)
              </dd>
            </div>
            <div>
              <dt>Peters, circular, a = {r.separation.toFixed(1)}</dt>
              <dd>{f0(r.peters)}</dd>
            </div>
            <div>
              <dt>Run minus Peters</dt>
              <dd>
                {signed(r.time - r.peters)} ({signed((100 * (r.time - r.peters)) / r.peters)}%)
              </dd>
            </div>
            <div>
              <dt>Peters on the start’s 1PN energy</dt>
              <dd>{Number.isFinite(r.petersPn) ? f0(r.petersPn) : 'unbound by 1PN energy'}</dd>
            </div>
            {r.capFrom !== null && before !== null && petersToCap !== null && (
              <div>
                <dt>Down to the cap at {r.capFrom.toFixed(2)} M: run, Peters</dt>
                <dd>
                  {f0(before)}, {f0(petersToCap)}
                </dd>
              </div>
            )}
            {r.capFrom !== null && (
              <div>
                <dt>From the cap to contact: run, Peters</dt>
                <dd>
                  {f0(r.cappedTime)}, {f0(petersToContact(r.capFrom * M))}
                </dd>
              </div>
            )}
            {r.belowSix !== null && (
              <div>
                <dt>From 6M to contact: run, Peters</dt>
                <dd>
                  {f0(r.belowSix)}, {f0(petersToContact(6 * M))}
                </dd>
              </div>
            )}
          </dl>
          <p>
            Where the gap comes from. Before the cap, the run’s orbit carries 1PN terms that Peters’ Newtonian circle does not: the same separation has a different energy and frequency, so it shrinks at a different rate, by an amount of order M/a ({(M / r.separation).toFixed(3)} at the start, more later), and not always in the same direction. From the cap on, the 1PN correction is held at half Newton’s pull, which removes the ISCO, so there is no plunge: the pair shrinks smoothly to contact at 2M. Peters has no plunge either: his slow-inspiral law runs all the way to a = 0. Real holes plunge from about the ISCO, and timing that needs numerical relativity, so neither end of either number is real GR.
          </p>
        </>
      )}
      <p className="ref">The run is off screen: the scene’s masses law (1PN EIH, 2.5PN radiation reaction, the 1PN cap, merger at contact) with no test particles, sampled every 2 units of time.</p>
    </section>
  );
}
