/**
 * The Alcubierre scene: its own sheet (York time or energy density), the bubble and ship, test
 * particles and light. Everything is drawn in the bubble's frame, so the ship stays at the origin and
 * the grid and particles stream past it. The maths is in src/physics/warp.ts.
 *
 * WebGL 2 only (three.js compiles these as GLSL ES 3.00). No eval, no CDN.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from 'react';
import * as THREE from 'three';
import {
  heldClockRate,
  horizonRadius,
  peakEnergyDensity,
  peakExpansion,
  SOLAR_MASSES_PER_METRE,
  surfaceGravity,
  totalEnergy,
  WARP_CAVEATS,
  WARP_HEIGHT,
  WARP_MAX_LIGHT,
  WARP_MAX_PARTICLES,
  warpHeight,
  warpPeak,
  WarpSim,
  wallThickness,
  shapeF,
  type WarpOverlay,
} from '../physics/warp';
import { store, useStore } from '../state/store';
import { CORE_CELL, gridScale, planeAxis, snapTo } from './plane';
import { pointsFragment, pointsVertex } from './shaders';

/** The simulation, read by the layer and the panel. */
export const warpSim = new WarpSim();

/** Settings the panel changes. */
let ui: { overlay: WarpOverlay } = { overlay: 'theta' };
const listeners = new Set<() => void>();
const setOverlay = (overlay: WarpOverlay): void => {
  ui = { overlay };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void): (() => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const RING_SEGS = 96;
const LIFT = 0.35;
/** Largest grid spacing the sheet draws: the sliding grid repeats at this period, with no float drift. */
const GRID_PERIOD = 1250;

// ColorBrewer RdBu ends (#b2182b, #2166ac) around GitHub Primer canvas (#161b22).
const SHEET_GLSL = /* glsl */ `
  uniform vec3 uBubble;    // v, R, sigma
  uniform float uPeak;
  uniform float uOverlay;  // 0 = theta, 1 = T00
  float sech2(float u) {
    float e = exp(-2.0 * abs(u));
    return 4.0 * e / ((1.0 + e) * (1.0 + e));
  }
  float shapeDF(float r) {
    float s = uBubble.z * uBubble.y;
    return uBubble.z * (sech2(uBubble.z * (r + uBubble.y)) - sech2(uBubble.z * (r - uBubble.y))) / (2.0 * tanh(s));
  }
  // Mirrors warpDisplay() in src/physics/warp.ts.
  float warpDisplay(vec2 p) {
    float r2 = dot(p, p);
    if (r2 < 1e-12 || uPeak <= 0.0) return 0.0;
    float r = sqrt(r2);
    float df = shapeDF(r);
    if (uOverlay < 0.5) return uBubble.x * (p.x / r) * df / uPeak;
    return -(uBubble.x * uBubble.x * p.y * p.y / (4.0 * r2)) * df * df / (8.0 * 3.141592653589793) / uPeak;
  }
`;

const sheetVertex = /* glsl */ `
  ${SHEET_GLSL}
  uniform float uHeight;
  uniform float uCell;
  uniform vec2 uOrigin;
  uniform float uScale;
  varying vec2 vXY;
  varying vec3 vN;
  void main() {
    vec2 p = position.xy * uScale + uOrigin;
    float h = warpDisplay(p) * uHeight;
    float e = uCell * uScale;
    float hx = (warpDisplay(p + vec2(e, 0.0)) - warpDisplay(p - vec2(e, 0.0))) * uHeight;
    float hy = (warpDisplay(p + vec2(0.0, e)) - warpDisplay(p - vec2(0.0, e))) * uHeight;
    vN = normalize(vec3(-hx, -hy, 2.0 * e));
    vXY = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, h, 1.0);
  }
`;

const sheetFragment = /* glsl */ `
  ${SHEET_GLSL}
  uniform float uGrid;
  uniform float uGridPhase;
  varying vec2 vXY;
  varying vec3 vN;
  float gridLine(vec2 p, float spacing, float width) {
    vec2 q = p / spacing;
    vec2 w = max(fwidth(q), vec2(1e-5));
    vec2 g = abs(fract(q - 0.5) - 0.5) / w;
    float line = 1.0 - min(min(g.x, g.y) / width, 1.0);
    return line * (1.0 - smoothstep(0.08, 0.3, max(w.x, w.y)));
  }
  void main() {
    float t = clamp(warpDisplay(vXY), -1.0, 1.0);
    float k = pow(abs(t), 0.7);
    vec3 mid = vec3(0.086, 0.106, 0.133);
    vec3 base = t < 0.0 ? mix(mid, vec3(0.129, 0.4, 0.675), k) : mix(mid, vec3(0.698, 0.094, 0.169), k);
    vec3 n = normalize(vN);
    float diff = clamp(dot(n, normalize(vec3(0.35, -0.55, 0.75))), 0.0, 1.0);
    vec3 col = base * (0.6 + 0.6 * diff);
    float alpha = 1.0;
    if (uGrid > 0.5) {
      // The grid is the rest frame: it slides backwards past the bubble.
      vec2 g = vXY + vec2(uGridPhase, 0.0);
      float minor = gridLine(g, 10.0, 1.2);
      float major = gridLine(g, 50.0, 1.6);
      float huge = gridLine(g, 250.0, 1.8);
      col += vec3(0.60, 0.65, 0.71) * max(max(minor * 0.11, major * 0.2), huge * 0.28);
    }
    alpha *= 1.0 - smoothstep(5000.0, 15000.0, length(vXY - cameraPosition.xy));
    gl_FragColor = vec4(col, alpha);
  }
`;

function buildPlane(): THREE.BufferGeometry {
  const axis = planeAxis();
  const n = axis.length;
  const positions = new Float32Array(n * n * 3);
  let k = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      positions[k++] = axis[i];
      positions[k++] = axis[j];
      positions[k++] = 0;
    }
  }
  const index = new Uint32Array((n - 1) * (n - 1) * 6);
  k = 0;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = j * n + i;
      index[k++] = a;
      index[k++] = a + 1;
      index[k++] = a + n + 1;
      index[k++] = a;
      index[k++] = a + n + 1;
      index[k++] = a + n;
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(index, 1));
  return g;
}

function buildLines(maxVerts: number) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4);
  pos.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  geo.setDrawRange(0, 0);
  let n = 0;
  return {
    geo,
    reset() {
      n = 0;
    },
    seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, g: number, b: number, a: number) {
      if (n + 2 > maxVerts) return;
      (pos.array as Float32Array).set([ax, ay, az, bx, by, bz], n * 3);
      (col.array as Float32Array).set([r, g, b, a, r, g, b, a], n * 4);
      n += 2;
    },
    commit() {
      geo.setDrawRange(0, n);
      pos.needsUpdate = true;
      col.needsUpdate = true;
    },
  };
}

function buildPoints(max: number) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
  const size = new THREE.BufferAttribute(new Float32Array(max), 1);
  for (const a of [pos, col, size]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  geo.setAttribute('size', size);
  geo.setDrawRange(0, 0);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uPixelScale: { value: 800 }, uSoft: { value: 0 } },
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    transparent: true,
    depthWrite: false,
  });
  let n = 0;
  return {
    geo,
    mat,
    reset() {
      n = 0;
    },
    add(x: number, y: number, z: number, r: number, g: number, b: number, s: number) {
      if (n >= max) return;
      (pos.array as Float32Array).set([x, y, z], n * 3);
      (col.array as Float32Array).set([r, g, b], n * 3);
      (size.array as Float32Array)[n] = s;
      n++;
    },
    commit() {
      geo.setDrawRange(0, n);
      pos.needsUpdate = true;
      col.needsUpdate = true;
      size.needsUpdate = true;
    },
  };
}

/**
 * Add inside the Canvas, and hide the normal Sheet while `active`. Inactive, it draws and advances
 * nothing. It reads play/pause and the time scale from the shared store.
 */
export function WarpLayer({ active }: { active: boolean }) {
  const { size, camera } = useThree();
  const resetToken = useStore((s) => s.resetToken);
  const geometry = useMemo(buildPlane, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uBubble: { value: new THREE.Vector3() },
          uPeak: { value: 1 },
          uOverlay: { value: 0 },
          uHeight: { value: WARP_HEIGHT },
          uCell: { value: CORE_CELL },
          uOrigin: { value: new THREE.Vector2() },
          uScale: { value: 1 },
          uGrid: { value: 1 },
          uGridPhase: { value: 0 },
        },
        vertexShader: sheetVertex,
        fragmentShader: sheetFragment,
        transparent: true,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const lines = useMemo(() => buildLines(4 * RING_SEGS * 2 + WARP_MAX_PARTICLES * 2), []);
  const dots = useMemo(() => buildPoints(WARP_MAX_PARTICLES + WARP_MAX_LIGHT), []);
  const lineMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }), []);
  const ship = useRef<THREE.Mesh>(null);

  useEffect(() => {
    if (active) warpSim.reset();
  }, [active, resetToken]);

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    dots.mat.uniforms.uPixelScale.value = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2));
  }, [size, camera, dots]);

  useFrame((state, delta) => {
    if (!active) return;
    const s = store.get();
    if (s.playing && !document.hidden) warpSim.step(Math.min(delta, 1 / 20) * s.timeScale);
    const p = warpSim.params;
    const overlay = ui.overlay;
    const peak = warpPeak(overlay, p);
    const ex = s.exaggeration;
    const H = (x: number, y: number): number => warpHeight(overlay, x, y, p, peak, ex);
    const u = material.uniforms;
    u.uBubble.value.set(p.v, p.R, p.sigma);
    u.uPeak.value = peak;
    u.uOverlay.value = overlay === 'theta' ? 0 : 1;
    u.uHeight.value = WARP_HEIGHT * ex;
    u.uGrid.value = s.grid ? 1 : 0;
    u.uGridPhase.value = warpSim.xs % GRID_PERIOD;

    // The mesh follows the camera focus, like the main sheet does.
    const target = (state.controls as unknown as { target?: THREE.Vector3 } | null)?.target;
    const scale = gridScale(target ? state.camera.position.distanceTo(target) : 400);
    const cell = CORE_CELL * scale;
    u.uScale.value = scale;
    u.uOrigin.value.set(snapTo(target?.x ?? 0, cell), snapTo(target?.y ?? 0, cell));

    const hull = ship.current;
    if (hull) {
      const size = Math.max(3, 0.18 * p.R);
      hull.position.set(0, 0, H(0, 0) + 1.4);
      hull.scale.setScalar(size);
    }

    // Wall, horizon, and how far each particle has been moved.
    lines.reset();
    const ring = (R: number, r: number, g: number, b: number, a: number, dashed: boolean) => {
      let px = R;
      let py = 0;
      let pz = H(px, py) + LIFT;
      for (let i = 1; i <= RING_SEGS; i++) {
        const th = (i / RING_SEGS) * Math.PI * 2;
        const x = R * Math.cos(th);
        const y = R * Math.sin(th);
        const z = H(x, y) + LIFT;
        if (!dashed || i % 2 === 0) lines.seg(px, py, pz, x, y, z, r, g, b, a);
        px = x;
        py = y;
        pz = z;
      }
    };
    if (s.rings) {
      ring(p.R, 0.75, 0.79, 0.84, 0.75, false);
      const horizon = horizonRadius(p);
      if (horizon !== null) ring(horizon, 0.82, 0.6, 0.13, 0.95, true);
    }

    dots.reset();
    const xs = warpSim.xs;
    for (const q of warpSim.particles) {
      const dx = q.x - xs;
      const r = Math.hypot(dx, q.y);
      const z = H(dx, q.y) + LIFT + 0.3;
      const f = shapeF(r, p);
      const moved = Math.abs(q.x - q.x0);
      if (moved > 0.5) lines.seg(q.x0 - xs, q.y0, H(q.x0 - xs, q.y0) + LIFT, dx, q.y, z, 0.57, 0.6, 0.63, 0.35);
      if (f > 0.5) dots.add(dx, q.y, z, 0.82, 0.6, 0.13, 3);
      else if (moved > 0.5) dots.add(dx, q.y, z, 0.35, 0.65, 1, 2.6);
      else dots.add(dx, q.y, z, 0.57, 0.6, 0.63, 2.2);
    }
    for (const g of warpSim.light) {
      dots.add(g.x - xs, g.y, H(g.x - xs, g.y) + LIFT + 0.5, 1, 0.97, 0.8, 2.6);
    }
    lines.commit();
    dots.commit();
  });

  return (
    <group visible={active}>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />
      <lineSegments geometry={lines.geo} material={lineMat} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.mat} frustumCulled={false} renderOrder={6} />
      <mesh ref={ship} rotation={[0, 0, -Math.PI / 2]} frustumCulled={false} renderOrder={7}>
        <coneGeometry args={[0.28, 1, 16]} />
        <meshBasicMaterial color="#e6edf3" />
      </mesh>
    </group>
  );
}

function num(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2);
  return v.toFixed(digits);
}

const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', gap: 12, fontVariantNumeric: 'tabular-nums' };
const muted: CSSProperties = { color: 'var(--muted)' };

/** Controls and readouts. Put it inside the info card while the warp view is showing. */
export function WarpPanel() {
  const overlay = useSyncExternalStore(subscribe, () => ui.overlay);
  const [, tick] = useState(0);
  const [params, setParams] = useState(warpSim.params);
  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 250);
    return () => window.clearInterval(id);
  }, []);
  const change = (patch: Partial<typeof params>) => {
    warpSim.configure(patch);
    setParams(warpSim.params);
  };
  const p = params;
  const r = horizonRadius(p);
  const kappa = surfaceGravity(p);
  const energy = totalEnergy(p);
  const ramp =
    overlay === 'theta'
      ? 'linear-gradient(90deg, #2166ac, #161b22 50%, #b2182b)'
      : 'linear-gradient(90deg, #2166ac, #161b22)';
  return (
    <div style={{ fontSize: '0.84rem', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr)', gap: 6, marginTop: 8 }}>
      <span className="tag approx" style={{ whiteSpace: 'normal', justifySelf: 'start' }}>
        theoretical metric · needs exotic matter
      </span>
      <div style={{ ...muted, fontSize: '0.78rem' }}>This draws what the equations say if the metric is assumed. It is not a claim that such a bubble is possible.</div>
      <div className="segmented" role="group" aria-label="What the warp sheet shows">
        {(
          [
            ['theta', 'York time θ'],
            ['energy', 'Energy T⁰⁰'],
          ] as const
        ).map(([id, label]) => (
          <button key={id} aria-pressed={overlay === id} className={overlay === id ? 'on' : ''} onClick={() => setOverlay(id)}>
            {label}
          </button>
        ))}
      </div>
      <div aria-hidden="true" style={{ height: 8, borderRadius: 4, background: ramp }} />
      <div style={{ ...row, ...muted, fontSize: '0.78rem' }}>
        {overlay === 'theta' ? (
          <>
            <span>contracting (ahead)</span>
            <span>expanding (behind)</span>
          </>
        ) : (
          <>
            <span>most negative</span>
            <span>0</span>
          </>
        )}
      </div>
      <label className="slider-row">
        <span>
          Bubble speed v<output>{p.v.toFixed(2)} c</output>
        </span>
        <input type="range" min={0.1} max={6} step={0.01} value={p.v} onChange={(e) => change({ v: Number(e.target.value) })} />
      </label>
      <label className="slider-row">
        <span>
          Radius R<output>{p.R.toFixed(0)}</output>
        </span>
        <input type="range" min={10} max={60} step={1} value={p.R} onChange={(e) => change({ R: Number(e.target.value) })} />
      </label>
      <label className="slider-row">
        <span>
          Wall σ<output>{p.sigma.toFixed(2)}</output>
        </span>
        <input type="range" min={0.1} max={1} step={0.01} value={p.sigma} onChange={(e) => change({ sigma: Number(e.target.value) })} />
      </label>
      <div style={row}>
        <span>Coordinate time t</span>
        <span>{num(warpSim.t, 1)}</span>
      </div>
      <div style={row}>
        <span>Ship proper time τ</span>
        <span>{num(warpSim.tauShip, 1)}</span>
      </div>
      <div style={{ ...muted, fontSize: '0.78rem' }}>Ship clock rate dτ/dt = {num(heldClockRate(0, p), 3)}: no time dilation at the centre, at any speed.</div>
      <div style={row}>
        <span>Peak |θ|</span>
        <span>{num(peakExpansion(p))}</span>
      </div>
      <div style={row}>
        <span>Peak T⁰⁰</span>
        <span>−{num(peakEnergyDensity(p))}</span>
      </div>
      <div style={row}>
        <span>Total energy E</span>
        <span>{num(energy, 1)}</span>
      </div>
      <div style={{ ...muted, fontSize: '0.78rem' }}>
        E &lt; 0 in the scene’s mass units, for this wall (Δ ≈ {num(wallThickness(p), 1)}). If 1 unit were 1 m, that is {num(energy * SOLAR_MASSES_PER_METRE, 2)} M☉ of negative energy.
      </div>
      <div style={row}>
        <span>Horizon on the axis</span>
        <span>{r === null ? 'none (v ≤ c)' : `r = ${num(r, 1)}`}</span>
      </div>
      {kappa !== null && (
        <div style={{ ...muted, fontSize: '0.78rem' }}>
          Light sent forward from the ship stalls at the gold ring, and the crew cannot reach the wall ahead. Instability timescale 1/κ ≈ {num(1 / kappa, 1)}.
        </div>
      )}
      <details>
        <summary style={{ cursor: 'pointer' }}>What this does not show</summary>
        <ul style={{ margin: '6px 0 0', paddingLeft: 18, display: 'grid', gap: 4 }}>
          {WARP_CAVEATS.map((c) => (
            <li key={c} style={muted}>
              {c}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
