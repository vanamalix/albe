/**
 * Two exactly balanced holes (Majumdar-Papapetrou): a separation slider and a plot of where each ray
 * leaves against its impact parameter b. Tap the plot to zoom in; the fractal edges keep coming.
 */
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { balancedPair, fateChanges, scanMP, type ScanPoint } from '../../physics/majumdar';
import { useDepth } from '../../state/depth';
import { exhibitStore, useExhibit } from '../../state/exhibit';

const N = 240;
/** Colours shared with the 3D view: escaping up, escaping down, captured by the upper or lower hole. */
export const FATE_COLOURS = { up: '#d29922', down: '#f0e6a0', c0: '#58a6ff', c1: '#f85149', unresolved: '#8b949e' };

export function fateColour(p: ScanPoint['fate']): string {
  if (p.kind === 'escape') return p.angle > 0 ? FATE_COLOURS.up : FATE_COLOURS.down;
  if (p.kind === 'capture') return p.hole === 0 ? FATE_COLOURS.c0 : FATE_COLOURS.c1;
  return FATE_COLOURS.unresolved;
}

export default function BalancedPanel() {
  const sep = useExhibit((s) => s.mpSep);
  const b0 = useExhibit((s) => s.mpB0);
  const b1 = useExhibit((s) => s.mpB1);
  const depth = useDepth();
  const [scan, setScan] = useState<ScanPoint[] | null>(null);
  const ref = useRef<HTMLCanvasElement>(null);

  // Scan after the sliders settle: about a tenth of a second of work.
  useEffect(() => {
    const id = window.setTimeout(() => setScan(scanMP(balancedPair(sep), b0, b1, N, 0.02)), 120);
    return () => window.clearTimeout(id);
  }, [sep, b0, b1]);

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext('2d');
    if (!c || !g || !scan) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth * dpr;
    const h = c.clientHeight * dpr;
    c.width = w;
    c.height = h;
    g.clearRect(0, 0, w, h);
    // Axis: exit angle −180° to 180°; captures in a band along the bottom.
    const band = 14 * dpr;
    g.strokeStyle = 'rgba(201, 209, 217, 0.25)';
    g.lineWidth = dpr;
    for (const a of [-90, 0, 90]) {
      const y = (h - band) * (0.5 - a / 360);
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(w, y);
      g.stroke();
    }
    for (const p of scan) {
      const x = ((p.b - b0) / (b1 - b0)) * w;
      g.fillStyle = fateColour(p.fate);
      if (p.fate.kind === 'escape') {
        const y = (h - band) * (0.5 - (p.fate.angle * 180) / Math.PI / 360);
        g.fillRect(x - dpr, y - dpr, 2.5 * dpr, 2.5 * dpr);
      } else g.fillRect(x - dpr, h - band + 3 * dpr, 2.5 * dpr, band - 6 * dpr);
      if (!p.resolved) {
        g.fillStyle = FATE_COLOURS.unresolved;
        g.fillRect(x - 0.5 * dpr, 0, dpr, 3 * dpr);
      }
    }
  }, [scan, b0, b1]);

  const zoomAt = (b: number, factor: number) => {
    const half = ((b1 - b0) * factor) / 2;
    exhibitStore.set({ mpB0: b - half, mpB1: b + half });
  };
  const onTap = (e: PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    zoomAt(b0 + ((e.clientX - r.left) / r.width) * (b1 - b0), 1 / 6);
  };
  const changes = scan ? fateChanges(scan) : 0;
  const unresolved = scan ? scan.filter((p) => !p.resolved).length : 0;
  const captured = scan ? scan.filter((p) => p.fate.kind === 'capture').length : 0;
  const width = b1 - b0;
  return (
    <section className="exhibit-panel tall" aria-label="Balanced holes controls">
      <strong>Two exactly balanced holes</strong>
      <p className="ref">
        {depth === 'words'
          ? 'Each hole carries the largest electric charge a black hole can have. Their electric push cancels their gravitational pull exactly, so they stay put, and their fields simply add.'
          : depth === 'numbers'
            ? 'Each hole has charge Q = M (extremal). Then U = 1 + M₁/r₁ + M₂/r₂ is exact: one hole alone captures light below b = 4M, the pair together below 8M when they touch.'
            : 'Q = M for each hole: the Einstein-Maxwell equations reduce to ∇²U = 0 in flat space, linear, so U = 1 + Σ Mᵢ/|x − xᵢ| is exact at any separation, with no motion. Rays in the plane of the holes are geodesics of the optical metric U⁴(dx² + dy²).'}
      </p>
      <div className="slider-row">
        <label htmlFor="mp-sep">
          Separation <output>{sep.toFixed(2)} M</output>
        </label>
        <input id="mp-sep" type="range" min={0.5} max={8} step={0.05} value={sep} onChange={(e) => exhibitStore.set({ mpSep: +e.target.value })} />
      </div>
      <figure className="scope">
        <canvas ref={ref} className="scope-tap mp-plot" role="img" aria-label={`Exit angle against impact parameter, b from ${b0.toFixed(4)} to ${b1.toFixed(4)} M. Tap to zoom in six times.`} onPointerDown={onTap} />
        <figcaption>
          Exit angle (−180° to 180°) against b, from {b0.toPrecision(5)} to {b1.toPrecision(5)} M. Bottom band: captured, <span className="cap-blue">by the upper hole</span> or <span className="cap-red">the lower</span>. Tap to zoom ×6.
        </figcaption>
      </figure>
      <div className="explain-actions">
        <button className="btn small" onClick={() => zoomAt((b0 + b1) / 2, 1 / 6)}>
          Zoom in at the centre
        </button>
        <button className="btn small" onClick={() => zoomAt((b0 + b1) / 2, 6)} disabled={width >= 12}>
          Zoom out
        </button>
        <button className="btn small" onClick={() => exhibitStore.set({ mpB0: -6, mpB1: 6 })}>
          Reset
        </button>
      </div>
      <dl className="live" aria-live="polite">
        <div>
          <dt>Window width</dt>
          <dd>{width.toExponential(2)} M</dd>
        </div>
        <div>
          <dt>Changes of fate across {N} rays</dt>
          <dd>{scan ? changes : '…'}</dd>
        </div>
        <div>
          <dt>Captured</dt>
          <dd>{scan ? `${captured} of ${N}` : '…'}</dd>
        </div>
        <div>
          <dt>Unresolved (two step sizes disagree)</dt>
          <dd>{scan ? unresolved : '…'}</dd>
        </div>
      </dl>
      <p className="ref">
        Gold rays leave upward, pale downward, blue and red fall into the upper or lower hole. Zoom into any edge between colours and more edges appear at every scale: the rays that never leave form a Cantor set, the hallmark of chaotic scattering.
      </p>
      <p className="tag-line exact">Exact spacetime: superposition is exact here because the holes are extremally charged. Rays: RK4 at two step sizes; a grey tick marks a ray whose fate they disagree on.</p>
      <p className="tag-line approx">Not astrophysical: real black holes carry almost no charge. Rays start and end 200 M_total away: the bending left outside that, about 1° in all, is not in the exit angle.</p>
    </section>
  );
}
