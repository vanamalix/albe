/**
 * Microlensing: drag the source's track across the lens; the light curve redraws. A point lens uses
 * Paczyński's exact A(u); a binary lens uses the exact image polynomial for the curve and inverse
 * ray shooting (lens.ts's lensMap) for the magnification map behind it. From src/physics/microlens.ts.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { binary, binaryImages, closestApproach, criticalAndCaustic, lightCurve, pointMagnification, shootMap, trackPoint, type MagMap } from '../../physics/microlens';
import { useDepth } from '../../state/depth';
import { exhibitStore, ML_DEFAULTS, useExhibit } from '../../state/exhibit';
import { Axes, Choice, Live, Slider, fx, runs, type Frame } from './kit';

const HALF = 1.5;
const S0 = -2.2;
const S1 = 2.2;

export default function MicrolensPanel() {
  const st = useExhibit((s) => s);
  const depth = useDepth();
  const lens = useMemo(() => (st.mlBinary ? binary(st.mlQ, st.mlD) : null), [st.mlBinary, st.mlQ, st.mlD]);
  const track = useMemo(() => ({ x: st.mlX, y: st.mlY, angle: st.mlAngle }), [st.mlX, st.mlY, st.mlAngle]);
  const curve = useMemo(() => lightCurve(track, lens, S0, S1, lens ? 600 : 300), [track, lens]);
  const caustic = useMemo(() => (lens ? criticalAndCaustic(lens, 360).caustic : []), [lens]);
  const { u0, s0 } = closestApproach(track);
  const src = trackPoint(track, st.mlS);
  const images = lens ? binaryImages(lens, src) : null;
  const Anow = lens ? images!.reduce((s, i) => s + Math.abs(i.mu), 0) : pointMagnification(Math.hypot(src[0], src[1]));
  const Amax = Math.max(...curve.A);

  // The binary's magnification map, shot in slices so the page stays responsive.
  const [map, setMap] = useState<MagMap | null>(null);
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    setMap(null);
    setProgress(0);
    if (!lens) return;
    const job = shootMap(lens, { pixels: 150, half: HALF, rays: 2000 });
    let rows = 0;
    let timer = 0;
    const tick = () => {
      const done = job.step(120);
      rows += 120;
      if (done) setMap(job.map);
      else {
        setProgress(rows / job.map.rays);
        timer = window.setTimeout(tick, 0);
      }
    };
    timer = window.setTimeout(tick, 60);
    return () => window.clearTimeout(timer);
  }, [lens]);

  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g || !map) return;
    const P = map.pixels;
    c.width = P;
    c.height = P;
    const img = g.createImageData(P, P);
    for (let j = 0; j < P; j++)
      for (let i = 0; i < P; i++) {
        const A = map.A[j * P + i];
        // log A from 1 to 30 onto the panel's graphite-to-gold ramp; rows flipped so +y is up.
        const t = Math.min(1, Math.max(0, Math.log10(Math.max(A, 1e-3)) / Math.log10(30)));
        const k = ((P - 1 - j) * P + i) * 4;
        img.data[k] = 21 + t * 189;
        img.data[k + 1] = 27 + t * 126;
        img.data[k + 2] = 35 + t * 0;
        img.data[k + 3] = 255;
      }
    g.putImageData(img, 0, 0);
  }, [map]);

  const drag = useRef(false);
  const setAnchor = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = -HALF + ((e.clientX - r.left) / r.width) * 2 * HALF;
    const y = HALF - ((e.clientY - r.top) / r.height) * 2 * HALF;
    exhibitStore.set({ mlX: Math.max(-HALF, Math.min(HALF, x)), mlY: Math.max(-HALF, Math.min(HALF, y)) });
  };
  const onKey = (e: KeyboardEvent) => {
    const d = e.shiftKey ? 0.1 : 0.02;
    const move: Record<string, [number, number]> = { ArrowLeft: [-d, 0], ArrowRight: [d, 0], ArrowUp: [0, d], ArrowDown: [0, -d] };
    const m = move[e.key];
    if (!m) return;
    e.preventDefault();
    exhibitStore.set({ mlX: Math.max(-HALF, Math.min(HALF, st.mlX + m[0])), mlY: Math.max(-HALF, Math.min(HALF, st.mlY + m[1])) });
  };

  const p0 = trackPoint(track, -4);
  const p1 = trackPoint(track, 4);
  const yTop = Math.min(100, Math.max(2, Amax * 1.3));
  const f: Frame = { x0: S0, x1: S1, y0: 0.8, y1: yTop, logY: true };
  const yTicks = [1, 2, 5, 10, 20, 50, 100].filter((v) => v <= yTop);
  const marker = Math.min(S1, Math.max(S0, st.mlS));
  return (
    <section className="exhibit-panel tall" aria-label="Microlensing controls">
      <strong>Microlensing light curve</strong>
      <p className="ref">
        {depth === 'words'
          ? 'A star or planet passing in front of a distant star bends its light into images too close together to separate. You see one star brighten and fade. A single lens gives a smooth, symmetric bump; a pair of lenses adds sharp spikes where the star crosses a caustic.'
          : depth === 'numbers'
            ? `The track passes u₀ = ${fx(u0, 3)} Einstein radii from the lens, so a point lens peaks at A = ${fx(pointMagnification(u0), 3)}. At u = 1 the star is ×${fx(pointMagnification(1), 3)} brighter (3/√5). The event lasts about 2t_E, the time to cross one Einstein radius each way.`
            : 'Point lens: β = θ − θ_E²/θ, two images θ± = (u ± √(u² + 4))/2 with magnifications |1 − θ±⁻⁴|⁻¹ summing to A(u) = (u² + 2)/(u√(u² + 4)) (Paczyński 1986). Binary: ζ = z − Σ mᵢ/(z̄ − zᵢ); conjugating and substituting gives a fifth-order polynomial in z whose roots that solve the lens equation are the 3 or 5 images, each magnified 1/|1 − |Σ mᵢ/(z̄ − zᵢ)²|²|. Caustics map the critical curves |Σ mᵢ/(z − zᵢ)²| = 1 to the source plane.'}
      </p>
      <Choice label="Lens" value={st.mlBinary} options={[[false, 'Point lens'], [true, 'Binary lens']]} onChange={(v) => exhibitStore.set({ mlBinary: v })} />
      {st.mlBinary && (
        <>
          <Slider id="ml-q" label="Mass ratio q = m₂/m₁" value={Math.log10(st.mlQ)} min={-3} max={0} step={0.05} show={st.mlQ < 0.01 ? st.mlQ.toExponential(1) : st.mlQ.toFixed(2)} onChange={(v) => exhibitStore.set({ mlQ: 10 ** v })} />
          <Slider id="ml-d" label="Separation d (θ_E)" value={st.mlD} min={0.3} max={2.5} step={0.01} show={st.mlD.toFixed(2)} onChange={(v) => exhibitStore.set({ mlD: v })} />
        </>
      )}
      <Slider id="ml-angle" label="Track direction" value={st.mlAngle} min={-Math.PI / 2} max={Math.PI / 2} step={0.01} show={`${((st.mlAngle * 180) / Math.PI).toFixed(0)}°`} onChange={(v) => exhibitStore.set({ mlAngle: v })} />
      <Slider id="ml-s" label="Source along the track (t / t_E)" value={st.mlS} min={S0} max={S1} step={0.01} show={st.mlS.toFixed(2)} onChange={(v) => exhibitStore.set({ mlS: v })} />
      <div className="lens-plane">
        {st.mlBinary && <canvas ref={canvas} className="ml-map" aria-hidden="true" />}
        <svg
          className="ml-overlay"
          viewBox={`${-HALF} ${-HALF} ${2 * HALF} ${2 * HALF}`}
          role="group"
          aria-label={`Source plane, ${2 * HALF} Einstein radii across. The track passes ${fx(u0, 3)} θ_E from the ${st.mlBinary ? 'centre of mass' : 'lens'}. Drag to move it.`}
          onPointerDown={(e) => {
            drag.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setAnchor(e);
          }}
          onPointerMove={(e) => drag.current && setAnchor(e)}
          onPointerUp={() => (drag.current = false)}
        >
          <circle className="einstein" cx={0} cy={0} r={1} />
          {lens ? (
            <>
              {caustic.map((z, k) => (k % 2 === 0 ? <circle key={k} className="caustic" cx={z[0]} cy={-z[1]} r={0.012} /> : null))}
              <circle className="lens" cx={lens.z1} cy={0} r={0.035} />
              <circle className="lens" cx={lens.z2} cy={0} r={0.035} />
            </>
          ) : (
            <circle className="lens" cx={0} cy={0} r={0.04} />
          )}
          <line className="track" x1={p0[0]} y1={-p0[1]} x2={p1[0]} y2={-p1[1]} />
          <circle className="source" cx={src[0]} cy={-src[1]} r={0.05} />
          <circle className="handle" cx={st.mlX} cy={-st.mlY} r={0.08} tabIndex={0} role="button" aria-label={`Track handle at (${st.mlX.toFixed(2)}, ${st.mlY.toFixed(2)}) θ_E: arrow keys move it`} onKeyDown={onKey} />
        </svg>
      </div>
      <p className="ref">
        {st.mlBinary
          ? map
            ? `Shading: magnification by inverse ray shooting, log scale from 1 (dark) to 30 (gold). ${map.rays}² rays, ${map.pixels}² pixels of ${((2 * HALF) / map.pixels).toFixed(2)} θ_E, ${map.raysPerPixel.toFixed(0)} rays per pixel unlensed.`
            : `Shooting rays… ${Math.round(progress * 100)}%`
          : 'Dashed: the Einstein ring. Grey: the lens. Line: the track; drag anywhere, or use the arrow keys on its handle. White: the source now.'}
        {st.mlBinary && ' Red dots: the caustics, exact. The light curve below is exact too; the map is only a picture of it.'}
      </p>
      <svg className="chart" viewBox="0 0 300 170" role="img" aria-label={`Light curve: peak magnification ${fx(Amax, 2)}, now ${fx(Anow, 3)}.`}>
        <Axes f={f} xLabel="time from the anchor, in t_E" yLabel="A (log)" xTicks={[-2, -1, 0, 1, 2]} yTicks={yTicks} />
        {runs(f, curve.s, curve.A).map((pts, k) => (
          <polyline key={k} className="series gold" points={pts} />
        ))}
        {runs(f, [marker, marker], [0.8, yTop]).map((pts, k) => (
          <polyline key={`m${k}`} className="series now" points={pts} />
        ))}
      </svg>
      <Live
        rows={[
          ['Closest approach u₀ (at t = ' + fx(s0, 2) + ' t_E)', `${fx(u0, 3)} θ_E`],
          ['Point lens peak A(u₀)', fx(pointMagnification(u0), 3)],
          ['Peak on this curve', fx(Amax, 3)],
          ['Magnification now', fx(Anow, 3)],
          ['Images now', lens ? `${images!.length}` : '2'],
        ]}
      />
      <p className="tag-line exact">
        Exact for point lenses in the thin-lens, weak-field limit, whose next term is of order M/b, a few parts in 10⁹ for a star lensing at a few AU. The binary curve and caustics are exact roots of the lens equation (tests check them
        against the point lens and against ray shooting).
      </p>
      <p className="tag-line approx">
        The source is a point: a real star has a disc, which rounds off caustic spikes (a finite-source effect not modelled). The map’s resolution limits it: within a pixel ({((2 * HALF) / 150).toFixed(2)} θ_E) a caustic’s infinite peak
        becomes finite, and counting noise is about 1/√(nA) with n rays per pixel. Lenses and source are held still apart from the track: no orbital motion of the binary, no parallax.
      </p>
      <div className="explain-actions">
        <button className="btn small" onClick={() => exhibitStore.set({ ...ML_DEFAULTS, mlBinary: st.mlBinary })}>
          Reset the track
        </button>
        <button className="btn small" onClick={() => exhibitStore.set({ mlBinary: true, mlQ: 1e-3, mlD: 1.1, mlX: 0.19, mlY: 0, mlAngle: 0.5, mlS: -1.2 })}>
          A planet: q = 0.001
        </button>
      </div>
    </section>
  );
}
