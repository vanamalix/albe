/**
 * "Not our universe": a changed force law for Newtonian test particles and a scaled relativistic
 * term, to show what is special about ours. Clearly headed, flagged by a chip while active, and
 * reset by every scene load.
 */
import { useId } from 'react';
import { textbookAdvance } from '../../physics/measure';
import { dominantSource } from '../../physics/probes';
import { isCompact } from '../../physics/types';
import { apsisAngle, nearCircularApsis, scaledApsidalAngle } from '../../physics/whatif';
import { world } from '../../sim/world';
import { loadPreset } from '../../state/actions';
import { useDepth } from '../../state/depth';
import { store, useStore } from '../../state/store';
import { deg } from './format';

/** Changing a law invalidates the closest-approach pins measured under the old one. */
function setLaw(patch: { forceExponent?: number; grScale?: number }): void {
  store.set(patch);
  world.trackPins();
}

export function backToOurs(): void {
  setLaw({ forceExponent: 2, grScale: 1 });
}

export default function NotOurUniverse() {
  useStore((s) => s.stats);
  const n = useStore((s) => s.forceExponent);
  const sc = useStore((s) => s.grScale);
  const gr = useStore((s) => s.gr);
  const presetId = useStore((s) => s.presetId);
  const depth = useDepth();
  const id = useId();
  const pins = world.pins;
  // The pinned particle and the mass it orbits.
  const target = world.pinTarget?.kind === 'probe' ? world.probes.find((p) => p.id === (world.pinTarget as { id: number }).id) : undefined;
  const src = target ? world.bodies[dominantSource(target.x, target.y, world.bodies)] : undefined;
  const hole = src && isCompact(src) ? src : world.bodies.find(isCompact);
  const pinned = target && pins.rmax > 0 && pins.pins.length > 0 && hole;
  const exactApsis = pinned && !gr ? deg(apsisAngle(hole.m, n, pins.rmin, pins.rmax)) : NaN;
  // The pins report the advance wrapped to ±180°, which is ambiguous near n = −1 (−180°): shown only
  // where the apsis angle is safely inside (90°, 270°).
  const measuredApsis = Number.isFinite(pins.advance) && n > -0.5 ? 180 + deg(pins.advance) / 2 : NaN;
  const ours = n === 2 && sc === 1;
  const exactScaled = gr && target && src && isCompact(src) ? deg(scaledApsidalAngle(src.m, sc, target.x - src.x, target.y - src.y, target.vx - src.vx, target.vy - src.vy)) - 360 : NaN;
  const restartGrOff = () => {
    loadPreset(presetId);
    store.set({ gr: false, forceExponent: n, grScale: sc });
    world.trackPins();
  };
  return (
    <section className="toy not-ours" aria-label="Not our universe">
      <h3>Not our universe</h3>
      <p>
        These switches change the laws for test particles only, to show what is special about ours. Nothing they produce is real physics. Masses, light, clocks and the sheet keep our laws, a chip stays on screen while either is changed, and loading a scene puts both back.
      </p>

      <h4>Force law for Newtonian particles</h4>
      <div className="slider-row">
        <label htmlFor={`${id}-n`}>
          F ∝ 1/rⁿ, n <output>{n.toFixed(2)}{n === 2 ? ' (ours)' : ''}</output>
        </label>
        <input id={`${id}-n`} type="range" min={-1} max={2.95} step={0.05} value={n} onChange={(e) => setLaw({ forceExponent: +e.target.value })} />
      </div>
      <p>
        {depth === 'words'
          ? 'Only two force laws close every orbit: the inverse square, and a spring-like pull that grows with distance. Any other makes the closest point creep round, even without relativity.'
          : depth === 'numbers'
            ? `The pull is Newton’s at 20M and goes as 1/rⁿ from there. A near-circular orbit turns ${deg(nearCircularApsis(n)).toFixed(1)}° from closest to farthest point here, against 180° at n = 2 and 90° at n = −1.`
            : 'For F ∝ 1/rⁿ a near-circular orbit oscillates radially at κ² = (3 − n)Ω², so closest to farthest point is π/√(3 − n). Bertrand’s theorem (1873): the only central forces whose bound orbits all close are n = 2 and n = −1. At n ≥ 3 no circular orbit is stable.'}
      </p>
      <dl className="live">
        <div>
          <dt>Apsis angle, near-circular, 180°/√(3 − n)</dt>
          <dd>{deg(nearCircularApsis(n)).toFixed(2)}°</dd>
        </div>
        {Number.isFinite(exactApsis) && (
          <div>
            <dt>Apsis angle, exact for the pinned orbit</dt>
            <dd>{exactApsis.toFixed(2)}°</dd>
          </div>
        )}
        {!gr && Number.isFinite(measuredApsis) && (
          <div>
            <dt>Apsis angle, measured (pins)</dt>
            <dd>{measuredApsis.toFixed(2)}°</dd>
          </div>
        )}
        <div>
          <dt>Every bound orbit closes</dt>
          <dd>{n === 2 || n === -1 ? 'yes (Bertrand)' : 'no'}</dd>
        </div>
      </dl>
      <p className="ref">Blue (Newtonian) particles always feel this law; gold ones only while GR test particles are off. The pins follow a gold particle, so turn GR off to measure the angle.</p>
      {gr && (
        <div className="explain-actions">
          <button className="btn small" onClick={restartGrOff}>
            Restart with GR off, keeping these laws
          </button>
        </div>
      )}

      <h4>Strength of the relativistic term</h4>
      <div className="slider-row">
        <label htmlFor={`${id}-s`}>
          (c/c′)² <output>{sc.toFixed(2)}{sc === 1 ? ' (ours)' : sc === 0 ? ' (Newton)' : ''}</output>
        </label>
        <input id={`${id}-s`} type="range" min={0} max={3} step={0.05} value={sc} onChange={(e) => setLaw({ grScale: +e.target.value })} />
      </div>
      <p>
        {depth === 'words'
          ? 'This pretends light is slower or faster than ours, for the gold particles only. Slower light makes relativity matter further out: orbits turn more, and the innermost stable orbit moves outward.'
          : depth === 'numbers'
            ? `The innermost stable orbit sits at 6sM = ${(6 * sc).toFixed(2)}M${hole ? ` (r = ${(6 * sc * hole.m).toFixed(1)} here)` : ''}, circular orbits end at 3sM, and the first-order advance is s times ours.`
            : 'Multiplying the 3L²/r² term by s = (c/c′)² gives exactly u″ + u = M/L² + 3sMu², the Schwarzschild orbit equation of a universe whose light is √s times slower (G M fixed). Circular orbits end at 3sM, the ISCO is at 6sM, and the weak-field advance is 6πsM/p. Exact for the orbits; clocks, rays and the drawn horizon keep ours.'}
      </p>
      <dl className="live">
        <div>
          <dt>ISCO, 6sM</dt>
          <dd>{(6 * sc).toFixed(2)} M</dd>
        </div>
        {gr && Number.isFinite(pins.advance) && (
          <div>
            <dt>Advance, measured (pins)</dt>
            <dd>{deg(pins.advance).toFixed(1)}° per orbit</dd>
          </div>
        )}
        {Number.isFinite(exactScaled) && (
          <div>
            <dt>Advance, exact for this law (elliptic integral)</dt>
            <dd>{exactScaled.toFixed(1)}° per orbit</dd>
          </div>
        )}
        {gr && pinned && (
          <div>
            <dt>6πsM/p on the orbit flown (first order)</dt>
            <dd>{deg(textbookAdvance(sc * hole.m, pins.rmin, pins.rmax)).toFixed(1)}°</dd>
          </div>
        )}
      </dl>
      {!ours && (
        <div className="explain-actions">
          <button className="btn small" onClick={backToOurs}>
            Back to our universe
          </button>
        </div>
      )}
    </section>
  );
}
