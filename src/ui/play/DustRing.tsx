/**
 * The dust ring's stretch and squeeze, measured from the simulation against geodesic deviation, with
 * the out-of-plane axis that a planar scene cannot draw shown as computed, and labelled so.
 */
import { useMemo } from 'react';
import { deviationAlongFall, deviationAt, measureRing, positionNow, ringAxes } from '../../physics/dust';
import { DUST } from '../../physics/presets';
import { isBlackHole } from '../../physics/types';
import { world } from '../../sim/world';
import { useDepth } from '../../state/depth';
import { useStore } from '../../state/store';

export default function DustRing() {
  useStore((s) => s.stats);
  const depth = useDepth();
  const { M, R, xi, n } = DUST;
  const predicted = useMemo(() => deviationAlongFall(M, R, 2.2 * M), [M, R]);
  const hole = world.bodies.length === 1 && isBlackHole(world.bodies[0]) ? world.bodies[0] : null;
  const c = world.probes.find((p) => p.label === 'Ring centre');
  const ring = world.probes.filter((p) => !p.label && p.model === 'follow');
  const whole = !!hole && hole.m === M && !!c && ring.length === n;
  let rows: { label: string; value: string }[] = [];
  let bars: { name: string; measured: number | null; predicted: number }[] = [];
  let size = NaN;
  if (whole && c && hole) {
    const ax = ringAxes(n);
    const at = (p: (typeof ring)[number]) => {
      const q = positionNow(p);
      return { x: q.x - hole.x, y: q.y - hole.y };
    };
    const m = measureRing(M, R, xi, at(c), at(ring[ax.outer]), at(ring[ax.inner]), at(ring[ax.left]), at(ring[ax.right]));
    const p = deviationAt(predicted, m.r);
    size = (m.radial * xi) / m.r;
    bars = [
      { name: 'Toward the hole', measured: m.radial, predicted: p.radial },
      { name: 'Across, in the plane', measured: m.tangential, predicted: p.tangential },
      { name: 'Out of the plane (computed, not simulated)', measured: null, predicted: p.normal },
    ];
    rows = [
      { label: 'Centre at r', value: `${(m.r / M).toFixed(1)} M` },
      { label: 'Area in the plane, measured · predicted', value: `×${(m.radial * m.tangential).toFixed(3)} · ×${(p.radial * p.tangential).toFixed(3)}` },
      { label: 'Volume, predicted (all three axes)', value: `×${(p.radial * p.tangential * p.normal).toFixed(3)}` },
      { label: 'Ring size over r (linear theory needs it small)', value: size.toFixed(3) },
    ];
  }
  const top = Math.max(2, ...bars.map((b) => Math.max(b.measured ?? 0, b.predicted)));
  return (
    <section className="toy" aria-label="Dust ring">
      <h3>Stretch and squeeze</h3>
      <p>
        {depth === 'words'
          ? 'Each particle falls straight at the hole. The near ones fall faster than the far ones, so the ring stretches toward the hole; all of them head for the same point, so it narrows across. In the plane the ring’s area grows, but the third direction, which albe does not draw, narrows too, and a small ball keeps its volume.'
          : depth === 'numbers'
            ? `Released at ${R / M}M with radius ${xi}. Tidal rates are +2M/r³ toward the hole and −M/r³ along each of the two other axes: the three sum to zero.`
            : 'Geodesic deviation in the centre’s falling frame: ξ̈ⁱ = −Eⁱⱼξʲ with E = (M/r³)diag(−2, 1, 1) (radial, in-plane, out of plane), integrated along the cycloid. Tr E = 0 (Rᵢⱼ = 0), so from rest the volume has zero second derivative; later the shear focuses it at fourth order (Raychaudhuri). Measured: the four particles that started on the axes, at equal coordinate time, carried into the falling frame (radial span EΔr/f, tangential rΔφ).'}
      </p>
      {whole ? (
        <>
          <svg className="bars" viewBox="0 0 300 120" role="img" aria-label={bars.map((b) => `${b.name}: ${b.measured !== null ? `measured ×${b.measured.toFixed(2)}, ` : ''}predicted ×${b.predicted.toFixed(2)}`).join('; ')}>
            <line className="unit" x1={(1 / top) * 280 + 10} y1={0} x2={(1 / top) * 280 + 10} y2={120} />
            {bars.map((b, i) => (
              <g key={b.name} transform={`translate(0 ${i * 40})`}>
                {b.measured !== null && <rect className="measured" x={10} y={4} width={(b.measured / top) * 280} height={12} />}
                <rect className={b.measured === null ? 'computed' : 'predicted'} x={10} y={b.measured === null ? 4 : 18} width={(b.predicted / top) * 280} height={b.measured === null ? 12 : 6} />
                <text x={12} y={34}>
                  {b.name}
                </text>
              </g>
            ))}
          </svg>
          <ul className="key">
            <li>
              <i className="swatch gold" /> Measured from the particles
            </li>
            <li>
              <i className="swatch grey" /> Linear deviation, predicted
            </li>
            <li>
              <i className="swatch blue" /> Third axis: computed only (albe is planar)
            </li>
          </ul>
          <dl className="live">
            {rows.map((r) => (
              <div key={r.label}>
                <dt>{r.label}</dt>
                <dd>{r.value}</dd>
              </div>
            ))}
          </dl>
        </>
      ) : (
        <p className="ref">The ring is incomplete (a particle has reached the horizon, or one was removed). Restart the scene to see it again.</p>
      )}
      <p className="ref">
        The thin line marks ×1. Measured and predicted agree to within 2% down to 8M (a test runs this scene); nearer the hole the ring is no longer small against r and the linear law starts to miss. The
        tidal colours of the sheet show the same field.
      </p>
    </section>
  );
}
