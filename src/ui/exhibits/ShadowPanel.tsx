/**
 * Kerr shadow: Bardeen's critical curve for the spin and inclination set here, the photon-ring ladder
 * from the Lyapunov exponent, and the two EHT ring sizes for comparison. From src/physics/shadow.ts.
 */
import { useMemo } from 'react';
import { criticalCurve, EHT, SCHWARZSCHILD_SHADOW_RADIUS, shadowSize, subringRatio } from '../../physics/shadow';
import { useDepth } from '../../state/depth';
import { exhibitStore, SHADOW_DEFAULTS, useExhibit } from '../../state/exhibit';
import { Live, Slider, fx } from './kit';

const DEG = Math.PI / 180;

export default function ShadowPanel() {
  const a = useExhibit((s) => s.shSpin);
  const iDeg = useExhibit((s) => s.shIncl);
  const depth = useDepth();
  const curve = useMemo(() => criticalCurve(a, iDeg * DEG, 240), [a, iDeg]);
  const size = shadowSize(curve);
  const pts = curve.map((p) => `${p.alpha.toFixed(3)},${(-p.beta).toFixed(3)}`).join(' ');
  const ladder = [0, 1, 2, 3, 4];
  // Predicted angular diameter: the curve's mean diameter in M times θ_g = GM/(Dc²).
  const m87 = size.meanDiameter * EHT.m87.thetaG;
  const m87Err = size.meanDiameter * EHT.m87.thetaGErr;
  const sgr = size.meanDiameter * EHT.sgra.thetaG;
  return (
    <section className="exhibit-panel tall" aria-label="Black hole shadow controls">
      <strong>The edge of a spinning hole’s shadow</strong>
      <p className="ref">
        {depth === 'words'
          ? 'Light that skims a black hole can circle it many times before escaping. Seen from far away, such rays pile up along one closed curve on the sky: the edge of the shadow. Spin squashes it on the side moving toward you and shifts it sideways.'
          : depth === 'numbers'
            ? `At a = ${a.toFixed(3)}, seen ${iDeg.toFixed(0)}° from the spin axis, the curve is ${fx(size.width)} M wide and ${fx(size.height)} M tall (a non-spinning hole: ${fx(2 * SCHWARZSCHILD_SHADOW_RADIUS)} M round), shifted ${fx(size.shift)} M sideways. Each subring is narrower by e^−γ, γ from ${fx(size.gammaMin)} to ${fx(size.gammaMax)} round the curve.`
            : 'Spherical photon orbits at r have ξ = −(r³ − 3r² + a²r + a²)/(a(r − 1)) and η = r³(4a² − r(r − 3)²)/(a²(r − 1)²). A distant observer at inclination i sees them at α = −ξ/sin i, β = ±√(η + a²cos²i − ξ²cot²i) (Bardeen 1973); the radii where β² ≥ 0 trace the curve. γ is the Lyapunov exponent per half-orbit, 4r√χ K(u₊/u₋)/(a√−u₋) (Johnson et al. 2020, eq. 8), π for Schwarzschild.'}
      </p>
      <Slider id="sh-spin" label="Spin a / M" value={a} min={0} max={0.998} step={0.002} show={a.toFixed(3)} onChange={(v) => exhibitStore.set({ shSpin: v })} />
      <Slider id="sh-incl" label="Inclination i (from the spin axis)" value={iDeg} min={1} max={90} step={1} show={`${iDeg.toFixed(0)}°`} onChange={(v) => exhibitStore.set({ shIncl: v })} />
      <div className="explain-actions">
        <button className="btn small" onClick={() => exhibitStore.set({ ...SHADOW_DEFAULTS })}>
          M87*-like (a = 0.94, i = 17°)
        </button>
        <button className="btn small" onClick={() => exhibitStore.set({ shSpin: 0.998, shIncl: 90 })}>
          Fastest spin, edge-on
        </button>
      </div>
      <svg className="plan shadow-plan" viewBox="-7.5 -7.5 15 15" role="img" aria-label={`Critical curve, ${fx(size.width)} by ${fx(size.height)} M, shifted ${fx(size.shift)} M; dashed circle: no spin, radius 5.20 M.`}>
        <line className="axis" x1={-7.5} x2={7.5} y1={0} y2={0} />
        <line className="axis" x1={0} x2={0} y1={-7.5} y2={7.5} />
        <circle className="ref-circle" cx={0} cy={0} r={SCHWARZSCHILD_SHADOW_RADIUS} />
        <polygon className="curve" points={pts} />
        <circle className="centre" cx={size.shift} cy={0} r={0.12} />
        <text x={-7.2} y={-6.6}>
          β (M), spin axis up
        </text>
        <text x={3.2} y={7.1}>
          α (M)
        </text>
      </svg>
      <h4>The photon-ring ladder</h4>
      <svg className="bars ladder" viewBox="0 0 300 96" role="img" aria-label={`Subring n is e^(−nγ) of the first: with γ = ${fx(size.gammaMin)} that is ${subringRatio(size.gammaMin, 2).toFixed(3)} per step, with γ = ${fx(size.gammaMax)} ${subringRatio(size.gammaMax, 2).toFixed(3)}.`}>
        {ladder.map((n) => {
          const lo = subringRatio(size.gammaMin, n + 1);
          const hi = subringRatio(size.gammaMax, n + 1);
          // Log scale: 1 down to 10⁻⁶ over 240 px.
          const w = (v: number) => Math.max(1, 240 * (1 + Math.log10(v) / 6));
          return (
            <g key={n} transform={`translate(40, ${6 + n * 18})`}>
              <rect className="measured" x={0} y={0} width={w(lo)} height={6} />
              <rect className="predicted" x={0} y={7} width={w(hi)} height={6} />
              <text x={-6} y={11} textAnchor="end">
                n = {n}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="ref">
        Width of subring n relative to n = 0, log scale (full bar 1, empty 10⁻⁶). Gold: the least γ on the curve ({fx(size.gammaMin, 3)}), so e^−γ = {subringRatio(size.gammaMin, 2).toFixed(3)} per step. Grey: the greatest ({fx(size.gammaMax, 3)}),
        e^−γ = {subringRatio(size.gammaMax, 2).toFixed(3)}. Without spin γ = π everywhere: 0.043 per step.
      </p>
      <Live
        rows={[
          ['Width × height', `${fx(size.width, 3)} × ${fx(size.height, 3)} M`],
          ['Mean diameter (about the centre)', `${fx(size.meanDiameter, 3)} M`],
          ['Sideways shift', `${fx(size.shift, 3)} M`],
          ['Lyapunov γ round the curve', `${fx(size.gammaMin, 3)} … ${fx(size.gammaMax, 3)}`],
          ['M87*: this curve × θ_g = 3.8 ± 0.4 μas', `${m87.toFixed(1)} ± ${m87Err.toFixed(1)} μas`],
          ['M87*: EHT ring, 2019', `${EHT.m87.ring} ± ${EHT.m87.ringErr} μas`],
          ['Sgr A*: this curve × θ_g = 4.8 (+1.4 −0.7) μas', `${sgr.toFixed(1)} μas`],
          ['Sgr A*: EHT ring, 2022', `${EHT.sgra.ring} ± ${EHT.sgra.ringErr} μas`],
        ]}
      />
      <p className="ref">
        The EHT rings are bright emission, not this curve: hot gas near the hole shines from in front of and around it, and the collaboration relates ring size to curve size with simulated images. Here the
        rings are ×{(EHT.m87.ring / m87).toFixed(2)} (M87*) and ×{(EHT.sgra.ring / sgr).toFixed(2)} (Sgr A*) this curve, within the spread of θ_g and of that calibration: consistent with Kerr, but not enough to pin down a or i.
      </p>
      <p className="tag-line exact">Exact: the critical curve for a Kerr hole seen from far away, and γ, for every spin and inclination. Tests check the no-spin circle, the edge-on ends against the equatorial photon orbits, the pole-on circle and γ against direct integration.</p>
      <p className="tag-line approx">
        Not an image: what you would see also depends on where the gas glows and how it moves, which needs a ray tracer through Kerr and a model of the gas. The ladder ratio e^−γ holds for large n, so “about” for n = 1. The first ring’s
        offset from the curve (0.7 M in the 3D view) is chosen for display; only the ratios are exact.
      </p>
    </section>
  );
}
