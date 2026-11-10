/**
 * Two exactly balanced holes (Majumdar-Papapetrou), seen from above: a fan of rays across the panel's
 * window of impact parameters, traced in the plane of the holes by src/physics/majumdar.ts.
 */
import { useMemo } from 'react';
import { balancedPair, traceMP, type MPRay } from '../physics/majumdar';
import { useExhibit } from '../state/exhibit';
import { dotBuffer, GOLD, lineBuffer } from './exhibitKit';

/** World units per M. */
const S = 9;
/** Rays are drawn within this half-width, in M. */
const CLIP = 24;
const RAYS = 41;

const hex = (h: string): [number, number, number] => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
const UP = hex('#d29922');
const DOWN = hex('#f0e6a0');
const C0 = hex('#58a6ff');
const C1 = hex('#f85149');
const GREY = hex('#8b949e');
const GRID: [number, number, number] = [0.55, 0.6, 0.68];

const colourOf = (r: MPRay) => (r.fate.kind === 'escape' ? (r.fate.angle > 0 ? UP : DOWN) : r.fate.kind === 'capture' ? (r.fate.hole === 0 ? C0 : C1) : GREY);

export function BalancedExhibit() {
  const sep = useExhibit((s) => s.mpSep);
  const b0 = useExhibit((s) => s.mpB0);
  const b1 = useExhibit((s) => s.mpB1);
  const lines = useMemo(() => lineBuffer(200_000, false, false), []);
  const grid = useMemo(() => lineBuffer(4000, false, true), []);
  const dots = useMemo(() => dotBuffer(4, false), []);

  useMemo(() => {
    grid.reset();
    for (let k = -CLIP; k <= CLIP; k += 4) {
      grid.seg([k * S, -CLIP * S, 0], [k * S, CLIP * S, 0], GRID, 0.16);
      grid.seg([-CLIP * S, k * S, 0], [CLIP * S, k * S, 0], GRID, 0.16);
    }
    grid.commit();
  }, [grid]);

  useMemo(() => {
    const holes = balancedPair(sep);
    lines.reset();
    dots.reset();
    for (let i = 0; i < RAYS; i++) {
      const b = b0 + ((i + 0.5) / RAYS) * (b1 - b0);
      const ray = traceMP(holes, b, { eta: 0.02, keep: true });
      const c = colourOf(ray);
      let prev: number[] | null = null;
      for (let k = 0; k < ray.x.length; k++) {
        const x = ray.x[k];
        const y = ray.y[k];
        if (Math.abs(x) > CLIP || Math.abs(y) > CLIP) {
          prev = null;
          continue;
        }
        const p = [x * S, y * S, 0.5];
        if (prev) lines.seg(prev, p, c, 0.85);
        prev = p;
      }
    }
    // Each horizon is a point in these coordinates; a gold dot marks it.
    for (const h of holes) dots.add([h.x * S, h.y * S, 1], GOLD, 12);
    lines.commit();
    dots.commit();
  }, [sep, b0, b1, lines, dots]);

  return (
    <>
      <lineSegments geometry={grid.geo} material={grid.material} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.material} frustumCulled={false} renderOrder={4} />
    </>
  );
}
