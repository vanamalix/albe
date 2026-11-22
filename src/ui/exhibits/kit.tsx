/** Small pieces shared by the shadow, microlensing, universe and collapse panels: sliders, readouts, SVG plots. */
import type { ReactNode } from 'react';

export function Slider({ id, label, value, min, max, step, show, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; show: string; onChange: (v: number) => void }) {
  return (
    <div className="slider-row">
      <label htmlFor={id}>
        {label} <output htmlFor={id}>{show}</output>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
    </div>
  );
}

export function Live({ rows }: { rows: [ReactNode, ReactNode][] }) {
  return (
    <dl className="live">
      {rows.map(([k, v], i) => (
        <div key={i}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Choice<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="depth wrap" role="group" aria-label={label}>
      {options.map(([v, text]) => (
        <button key={String(v)} aria-pressed={v === value} className={v === value ? 'on' : ''} onClick={() => onChange(v)}>
          {text}
        </button>
      ))}
    </div>
  );
}

/** A plot box: maps data to a 300 × 170 viewBox with a margin for tick labels. */
export interface Frame {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  logY?: boolean;
}
export const W = 300;
export const H = 170;
const ML = 34;
const MB = 22;
const MT = 16;
const MR = 8;
export function sx(f: Frame, x: number): number {
  return ML + ((x - f.x0) / (f.x1 - f.x0)) * (W - ML - MR);
}
export function sy(f: Frame, y: number): number {
  const t = f.logY ? (Math.log10(y) - Math.log10(f.y0)) / (Math.log10(f.y1) - Math.log10(f.y0)) : (y - f.y0) / (f.y1 - f.y0);
  return H - MB - t * (H - MB - MT);
}
/** A polyline's points, dropping non-finite values and clipping to the frame (a break starts a new run). */
export function runs(f: Frame, xs: readonly number[], ys: readonly number[]): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i];
    const y = ys[i];
    const ok = Number.isFinite(x) && Number.isFinite(y) && x >= f.x0 && x <= f.x1 && y >= f.y0 && y <= f.y1 && (!f.logY || y > 0);
    if (ok) cur.push(`${sx(f, x).toFixed(1)},${sy(f, y).toFixed(1)}`);
    else if (cur.length) {
      if (cur.length > 1) out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length > 1) out.push(cur.join(' '));
  return out;
}

export function Axes({ f, xLabel, yLabel, xTicks, yTicks }: { f: Frame; xLabel: string; yLabel: string; xTicks: number[]; yTicks: number[] }) {
  const fmt = (v: number) => (Math.abs(v) >= 100 || Number.isInteger(v) ? v.toFixed(0) : Math.abs(v) < 0.01 ? v.toExponential(0) : String(+v.toPrecision(2)));
  return (
    <g className="axes">
      <line x1={sx(f, f.x0)} x2={sx(f, f.x1)} y1={H - MB} y2={H - MB} />
      <line x1={ML} x2={ML} y1={MT} y2={H - MB} />
      {xTicks.map((t) => (
        <text key={`x${t}`} x={sx(f, t)} y={H - MB + 11} textAnchor="middle">
          {fmt(t)}
        </text>
      ))}
      {yTicks.map((t) => (
        <text key={`y${t}`} x={ML - 3} y={sy(f, t) + 3} textAnchor="end">
          {fmt(t)}
        </text>
      ))}
      <text x={(ML + W - MR) / 2} y={H - 2} textAnchor="middle" className="axis-label">
        {xLabel}
      </text>
      <text x={4} y={10} className="axis-label">
        {yLabel}
      </text>
    </g>
  );
}

/** Fixed decimals; ±∞ as infinity, and NaN (an undefined value) as a dash, never as ∞ or "NaN". */
export const fx = (v: number, d = 2): string => (Number.isFinite(v) ? v.toFixed(d) : Number.isNaN(v) ? '–' : v > 0 ? '∞' : '−∞');
