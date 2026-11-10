/**
 * The Euclid exhibit's surface, drawn as a wireframe of its chart grid carried onto the embedding,
 * with the triangle, circle and perpendiculars from the panel. The sphere, the Flamm bridge and the
 * Ellis catenoid are true isometric embeddings; the hyperbolic plane has none in ordinary space
 * (Hilbert 1901), so it is drawn as its Poincaré disk, flat.
 */
import { useMemo } from 'react';
import { flammR, sphereToUnit, type GeometryId } from '../physics/euclid';
import { ellisEmbed } from '../physics/wormhole';
import { useEuclid } from '../state/euclid';
import { euclidModel } from '../ui/exhibits/euclidModel';
import { BLUE, dotBuffer, GOLD, lineBuffer, PALE, TEXT } from './exhibitKit';

const GREEN: [number, number, number] = [0.25, 0.73, 0.31];
const RED: [number, number, number] = [0.97, 0.32, 0.29];
const GRID: [number, number, number] = [0.55, 0.6, 0.68];

/** Chart point to world point, for each geometry. */
function embed(id: GeometryId, x: number, y: number): [number, number, number] {
  switch (id) {
    case 'sphere': {
      const u = sphereToUnit(x, y);
      return [90 * u[0], 90 * u[1], 90 * u[2]];
    }
    case 'flamm': {
      // M = 1, 26 world units per M. Outer sheet up, the other sheet (R < M/2) mirrored below.
      const R = Math.hypot(x, y);
      const r = flammR(R, 1);
      const z = 2 * Math.sqrt(Math.max(0, 2 * (r - 2))) * (R >= 0.5 ? 1 : -1);
      return [(26 * r * x) / R, (26 * r * y) / R, 26 * z - 40];
    }
    case 'ellis': {
      const R = Math.hypot(x, y);
      const p = ellisEmbed(40 * (R - 1 / (4 * R)), Math.atan2(y, x), 40);
      return [p[0], p[1], p[2] - 20];
    }
    case 'hyperbolic':
      return [130 * x, 130 * y, 0];
    default:
      return [65 * x, 65 * y, 0];
  }
}

/** The chart region drawn: radii in the chart, and how far in to go (the folds stop short of the other infinity). */
function gridRadii(id: GeometryId, view: number): number[] {
  if (id === 'sphere') return [];
  if (id === 'hyperbolic') return [0.2, 0.4, 0.6, 0.75, 0.85, 0.92, 0.97];
  if (id === 'flamm' || id === 'ellis') return [0.06, 0.1, 0.16, 0.25, 0.35, 0.5, 0.7, 1, 1.6, 2.5, 4].filter((r) => r <= view * 1.5);
  return [0.5, 1, 1.5, 2, 2.5, 3];
}

export function EuclidExhibit() {
  const s = useEuclid((x) => x);
  const m = euclidModel(s);
  const id = m.g.id;
  const grid = useMemo(() => lineBuffer(40_000, false, true), []);
  const lines = useMemo(() => lineBuffer(60_000, false, false), []);
  const dots = useMemo(() => dotBuffer(8, false), []);

  // Grid: rebuilt when the geometry changes.
  useMemo(() => {
    grid.reset();
    const poly = (f: (t: number) => [number, number], n: number, c: readonly number[], a: number) => {
      let prev = embed(id, ...f(0));
      for (let i = 1; i <= n; i++) {
        const next = embed(id, ...f(i / n));
        grid.seg(prev, next, c, a);
        prev = next;
      }
    };
    if (id === 'sphere') {
      for (let k = 1; k < 12; k++) {
        const lat = -Math.PI / 2 + (k * Math.PI) / 12;
        poly((t) => {
          const v = [Math.cos(lat) * Math.cos(2 * Math.PI * t), Math.cos(lat) * Math.sin(2 * Math.PI * t), Math.sin(lat)];
          return [v[0] / (1 - v[2]), v[1] / (1 - v[2])];
        }, 96, k === 6 ? PALE : GRID, k === 6 ? 0.6 : 0.25);
      }
      for (let k = 0; k < 12; k++) {
        const lon = (k * Math.PI) / 6;
        poly((t) => {
          const lat = -Math.PI / 2 + 0.02 + t * (Math.PI - 0.04);
          const v = [Math.cos(lat) * Math.cos(lon), Math.cos(lat) * Math.sin(lon), Math.sin(lat)];
          return [v[0] / (1 - v[2]), v[1] / (1 - v[2])];
        }, 64, GRID, 0.25);
      }
    } else {
      const radii = gridRadii(id, m.g.view);
      const rMax = radii[radii.length - 1];
      const rMin = id === 'flamm' || id === 'ellis' ? radii[0] : 0;
      for (const r of radii) poly((t) => [r * Math.cos(2 * Math.PI * t), r * Math.sin(2 * Math.PI * t)], 96, r === m.g.throat ? GOLD : GRID, r === m.g.throat ? 0.9 : 0.25);
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI) / 8;
        poly((t) => {
          const r = rMin > 0 ? rMin * (rMax / rMin) ** t : t * rMax;
          return [r * Math.cos(a), r * Math.sin(a)];
        }, 80, GRID, 0.22);
      }
    }
    grid.commit();
  }, [grid, id, m.g.view, m.g.throat]);

  useMemo(() => {
    lines.reset();
    dots.reset();
    const path = (xs: readonly number[], ys: readonly number[], c: readonly number[], a: number, closed = false) => {
      const n = xs.length;
      if (n < 2) return;
      const stride = Math.max(1, Math.floor(n / 400));
      const idx: number[] = [];
      for (let i = 0; i < n; i += stride) idx.push(i);
      if (idx[idx.length - 1] !== n - 1) idx.push(n - 1);
      if (closed) idx.push(0);
      let prev = embed(id, xs[idx[0]], ys[idx[0]]);
      for (let k = 1; k < idx.length; k++) {
        const next = embed(id, xs[idx[k]], ys[idx[k]]);
        lines.seg(prev, next, c, a);
        prev = next;
      }
    };
    if (s.demo !== 'taxicab') {
      m.tri?.edges.forEach((e) => path(e.x, e.y, GOLD, 1));
      if (m.perp) {
        path(m.perp.a.x, m.perp.a.y, BLUE, 0.95);
        path(m.perp.b.x, m.perp.b.y, BLUE, 0.95);
      }
      if (m.circle && m.circle.xs.length > 2) path(m.circle.xs, m.circle.ys, GREEN, 0.95, true);
      m.antipodal.forEach((g) => path(g.x, g.y, PALE, 0.8));
      if (m.edge) {
        path(m.edge.continued.x, m.edge.continued.y, PALE, 0.5);
        path(m.edge.stopped.x, m.edge.stopped.y, RED, 1);
      }
      const v = s.verts.length === 3 ? s.verts : m.g.triangle;
      for (const q of v) dots.add(embed(id, q[0], q[1]), TEXT, 9);
    }
    lines.commit();
    dots.commit();
  }, [m, s.demo, s.verts, id, lines, dots]);

  return (
    <>
      <lineSegments geometry={grid.geo} material={grid.material} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.material} frustumCulled={false} renderOrder={4} />
    </>
  );
}
