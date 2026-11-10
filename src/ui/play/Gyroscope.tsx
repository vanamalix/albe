/**
 * Gyroscope round a hole: two arrows carried round the circular orbit of the scene's particle, one
 * by parallel transport on the Flamm slice, one as a real gyroscope (the full spacetime), with
 * Gravity Probe B for scale. Angles come from src/physics/gyro.ts.
 */
import { useId, useState } from 'react';
import { EARTH_EQUATORIAL_RADIUS, EARTH_GM, geodetic, geodeticRateMasPerYear, GPB, GPB_ALTITUDE, sliceTransport } from '../../physics/gyro';
import { circularSpeed, clockReading } from '../../physics/probes';
import { isBlackHole } from '../../physics/types';
import { world } from '../../sim/world';
import { useDepth } from '../../state/depth';
import { useStore } from '../../state/store';
import { deg } from './format';

const LABEL = 'Gyroscope';

export default function Gyroscope() {
  useStore((s) => s.stats);
  const depth = useDepth();
  const id = useId().replace(/[^a-zA-Z0-9-]/g, '');
  const hole = world.bodies.length === 1 && isBlackHole(world.bodies[0]) ? world.bodies[0] : null;
  const p = world.probes.find((q) => q.label === LABEL);
  const M = hole?.m ?? 4;
  const rNow = hole && p ? Math.hypot(p.x - hole.x, p.y - hole.y) : NaN;
  const [rOverM, setROverM] = useState(() => (Number.isFinite(rNow) ? Math.round((rNow / M) * 10) / 10 : 8));
  const r = rOverM * M;
  const slice = sliceTransport(M, r);
  const gyro = geodetic(M, r);
  const gpb = geodeticRateMasPerYear(EARTH_GM, EARTH_EQUATORIAL_RADIUS + GPB_ALTITUDE);
  const launch = () => {
    if (!hole) return;
    world.probes = world.probes.filter((q) => q.label !== LABEL);
    world.addProbe(hole.x + r, hole.y, hole.vx, hole.vy + circularSpeed(M, r, true), 'follow', LABEL);
  };

  // Live arrows: orbital angle swept so far is u^φ τ, exact on a circular geodesic.
  let drawing = null;
  let swept = NaN;
  if (hole && p && Number.isFinite(rNow)) {
    const rr = rNow;
    const uphi = Math.sqrt(M / rr ** 3) / Math.sqrt(1 - (3 * M) / rr);
    swept = uphi * clockReading(p);
    const phi = Math.atan2(p.y - hole.y, p.x - hole.x);
    const start = phi - swept;
    const sliceAngle = start + swept * (1 - Math.sqrt(1 - (2 * M) / rr));
    const gyroAngle = start + swept * (1 - Math.sqrt(1 - (3 * M) / rr));
    const R = 1;
    const [px, py] = [Math.cos(phi) * 0.62, Math.sin(phi) * 0.62];
    const arrow = (a: number, cls: string) => (
      <line className={cls} x1={px} y1={-py} x2={px + 0.3 * Math.cos(a)} y2={-(py + 0.3 * Math.sin(a))} markerEnd={`url(#${id}-${cls})`} />
    );
    drawing = (
      <svg className="plan gyro-plan" viewBox={`${-R} ${-R} ${2 * R} ${2 * R}`} role="img" aria-label={`Orbit at ${(rr / M).toFixed(1)} M. Grey: the starting direction. Blue: carried round the slice, ${deg(sliceAngle - start).toFixed(1)}° ahead. Gold: the gyroscope, ${deg(gyroAngle - start).toFixed(1)}° ahead.`}>
        <defs>
          {['fixed', 'slice', 'spin'].map((c) => (
            <marker key={c} id={`${id}-${c}`} className={c} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" />
            </marker>
          ))}
        </defs>
        <circle className="orbit" cx={0} cy={0} r={0.62} />
        <circle className="centre" cx={0} cy={0} r={0.05} />
        {arrow(start, 'fixed')}
        {arrow(sliceAngle, 'slice')}
        {arrow(gyroAngle, 'spin')}
      </svg>
    );
  }

  return (
    <section className="toy" aria-label="Gyroscope round a hole">
      <h3>Gyroscope round a hole</h3>
      <p>
        {depth === 'words'
          ? 'Carry an arrow round the orbit, always keeping it as straight as the curved surface allows, and it comes back turned. A real gyroscope turns further, because it also moves through curved time.'
          : depth === 'numbers'
            ? `At ${rOverM.toFixed(1)}M: the slice turns an arrow by ${deg(slice).toFixed(1)}° per loop, the gyroscope by ${deg(gyro).toFixed(1)}°. Far out the split is 2:1 of 3πM/r, space curvature first.`
            : 'Slice: parallel transport round r on dl² = dr²/f + r²dφ² turns a vector back at √f per radian relative to e_r, so it leads the stars by 2π(1 − √(1 − 2M/r)). Gyroscope: Fermi-Walker transport on the circular geodesic, back at √(1 − 3M/r) in the comoving frame: 2π(1 − √(1 − 3M/r)) per orbit, the geodetic (de Sitter) precession. Weak field: 3πM/r = 2πM/r (space, γ = 1) + πM/r (time).'}
      </p>
      {drawing ?? <p className="ref">Restart the scene to bring the gyroscope back.</p>}
      <ul className="key">
        <li>
          <i className="swatch grey" /> Starting direction
        </li>
        <li>
          <i className="swatch blue" /> Carried round the slice
        </li>
        <li>
          <i className="swatch gold" /> Gyroscope
        </li>
      </ul>
      <div className="slider-row">
        <label htmlFor={`${id}-r`}>
          Orbit radius <output>{rOverM.toFixed(1)} M</output>
        </label>
        <input id={`${id}-r`} type="range" min={6.5} max={40} step={0.1} value={rOverM} onChange={(e) => setROverM(+e.target.value)} />
      </div>
      <div className="explain-actions">
        <button className="btn small" onClick={launch} disabled={!hole}>
          Launch at this radius
        </button>
      </div>
      <dl className="live">
        <div>
          <dt>Slice transport per loop</dt>
          <dd>{deg(slice).toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Gyroscope per orbit</dt>
          <dd>{deg(gyro).toFixed(2)}°</dd>
        </div>
        <div>
          <dt>Share from space curvature</dt>
          <dd>{((100 * slice) / gyro).toFixed(1)}%</dd>
        </div>
        {Number.isFinite(swept) && (
          <div>
            <dt>Orbits flown (u^φ τ / 2π)</dt>
            <dd>{(swept / (2 * Math.PI)).toFixed(2)}</dd>
          </div>
        )}
        <div>
          <dt>Gravity Probe B, this formula (circular, 642 km)</dt>
          <dd>{gpb.toFixed(0)} mas/yr</dd>
        </div>
        <div>
          <dt>GP-B: GR prediction · measured</dt>
          <dd>
            {GPB.geodeticPredicted} · {GPB.geodeticMeasured} ± {GPB.geodeticError} mas/yr
          </dd>
        </div>
        <div>
          <dt>GP-B frame dragging (not drawn)</dt>
          <dd>
            {GPB.dragPredicted} · {GPB.dragMeasured} ± {GPB.dragError} mas/yr
          </dd>
        </div>
      </dl>
      <p className="ref">
        Exact for a test gyroscope on a circular orbit round one non-spinning hole, with its spin in the orbital plane. The arrows are computed from the particle’s own clock (orbital angle u^φτ), measured in the
        orbiting frame. Our point-mass circular orbit 642 km above the equator gives {gpb.toFixed(0)} mas/yr, 0.2% above Everitt et al.’s 6606.1, which uses the real orbit and Earth’s oblateness. Frame
        dragging needs a spinning Earth and a polar orbit, which a planar, non-spinning scene cannot draw.
      </p>
    </section>
  );
}
