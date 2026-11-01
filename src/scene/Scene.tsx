import { OrbitControls, Stars } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { DOMAIN, heightAt, MAX_SHADER_MASSES, sampleFields, type ViewMode } from '../physics/fields';
import { DEFAULT_NBODY } from '../physics/nbody';
import { MAX_BODIES, MAX_PROBES, MAX_RAYS, VEL_SCALE, world } from '../sim/world';
import { store, useStore } from '../state/store';
import { Interaction, preview } from './Interaction';
import {
  latticeFragment,
  latticeVertex,
  pointsFragment,
  pointsVertex,
  sharedUniforms,
  sheetFragment,
  sheetVertex,
} from './shaders';

const MODE_INDEX: Record<ViewMode, number> = { space: 0, time: 1, tidal: 2, lattice: 3 };
const LIFT = 0.35;

let stepRequested = 0;
/** Advance the paused simulation by one frame's worth of time. */
export const requestStep = (): void => {
  stepRequested++;
};

function Sheet() {
  const seg = 256;
  const size = DOMAIN * 2;
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { ...sharedUniforms, uCell: { value: size / seg } },
        vertexShader: sheetVertex,
        fragmentShader: sheetFragment,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: true,
      }),
    [size],
  );
  const geometry = useMemo(() => new THREE.PlaneGeometry(size, size, seg, seg), [size]);
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={0} />;
}

function Lattice() {
  const mode = useStore((s) => s.mode);
  const { geometry, material } = useMemo(() => {
    const pts: number[] = [];
    const step = 15;
    const half = DOMAIN;
    const zs = [-60, -45, -30, -15, 0, 15, 30, 45, 60];
    const seg = 60;
    const line = (a: THREE.Vector3, b: THREE.Vector3, n: number) => {
      for (let i = 0; i < n; i++) {
        const p = a.clone().lerp(b, i / n);
        const q = a.clone().lerp(b, (i + 1) / n);
        pts.push(p.x, p.y, p.z, q.x, q.y, q.z);
      }
    };
    for (const z of zs) {
      for (let v = -half; v <= half; v += step) {
        line(new THREE.Vector3(-half, v, z), new THREE.Vector3(half, v, z), seg);
        line(new THREE.Vector3(v, -half, z), new THREE.Vector3(v, half, z), seg);
      }
    }
    for (let x = -half; x <= half; x += step) {
      for (let y = -half; y <= half; y += step) line(new THREE.Vector3(x, y, -60), new THREE.Vector3(x, y, 60), 16);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: sharedUniforms,
      vertexShader: latticeVertex,
      fragmentShader: latticeFragment,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    return { geometry: g, material: m };
  }, []);
  return <lineSegments geometry={geometry} material={material} visible={mode === 'lattice'} frustumCulled={false} />;
}

/** A dynamic line-segment buffer with RGBA vertex colours. */
function makeLines(maxVerts: number) {
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
    max: maxVerts,
    reset() {
      n = 0;
    },
    /** Push one segment. Returns false when full. */
    seg(ax: number, ay: number, az: number, bx: number, by: number, bz: number, r: number, g: number, b: number, a0: number, a1 = a0) {
      if (n + 2 > maxVerts) return false;
      const p = pos.array as Float32Array;
      const c = col.array as Float32Array;
      p.set([ax, ay, az, bx, by, bz], n * 3);
      c.set([r, g, b, a0, r, g, b, a1], n * 4);
      n += 2;
      return true;
    },
    commit() {
      geo.setDrawRange(0, n);
      pos.needsUpdate = true;
      col.needsUpdate = true;
      pos.addUpdateRange(0, n * 3);
      col.addUpdateRange(0, n * 4);
    },
  };
}

function makePoints(max: number, soft: boolean) {
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
    uniforms: { uPixelScale: { value: 800 }, uSoft: { value: soft ? 1 : 0 } },
    vertexShader: pointsVertex,
    fragmentShader: pointsFragment,
    transparent: true,
    depthWrite: false,
    blending: soft ? THREE.AdditiveBlending : THREE.NormalBlending,
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

const RING_SEGS = 64;

function Dynamic() {
  const { size, camera } = useThree();
  const trails = useMemo(() => makeLines(210_000), []);
  const rays = useMemo(() => makeLines(MAX_RAYS * 700 * 2 + 64), []);
  const rings = useMemo(() => makeLines(MAX_BODIES * 4 * RING_SEGS * 2), []);
  const arrows = useMemo(() => makeLines((MAX_BODIES + MAX_PROBES) * 6 + 400), []);
  const glow = useMemo(() => makePoints(MAX_BODIES + 96, true), []);
  const dots = useMemo(() => makePoints(MAX_PROBES + MAX_RAYS + 8, false), []);
  const lineMat = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false }),
    [],
  );
  const addMat = useMemo(
    () => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
    [],
  );
  const holes = useRef<THREE.InstancedMesh>(null);
  const sphere = useMemo(() => new THREE.SphereGeometry(1, 28, 18), []);
  const black = useMemo(() => new THREE.MeshBasicMaterial({ color: '#000000' }), []);
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const lastStats = useRef(0);
  const fps = useRef({ frames: 0, t: 0, value: 60 });

  useEffect(() => {
    const persp = camera as THREE.PerspectiveCamera;
    const scale = size.height / (2 * Math.tan(THREE.MathUtils.degToRad(persp.fov) / 2));
    glow.mat.uniforms.uPixelScale.value = scale;
    dots.mat.uniforms.uPixelScale.value = scale;
  }, [size, camera, glow, dots]);

  useFrame((state, delta) => {
    const s = store.get();
    const real = Math.min(delta, 1 / 20);
    const cfg = { gr: s.gr, gw: s.gw };
    if (!document.hidden) {
      if (s.playing) world.step(real * s.timeScale, cfg, DEFAULT_NBODY);
      else if (stepRequested > 0) {
        world.step(s.timeScale / 60, cfg, DEFAULT_NBODY);
        stepRequested = 0;
      }
      world.age(real);
    }
    const bodies = world.bodies;
    const mode = s.mode;
    const ex = s.exaggeration;
    const H = (x: number, y: number) => heightAt(mode, x, y, bodies, ex);

    // Shader uniforms.
    const u = sharedUniforms;
    const count = Math.min(bodies.length, MAX_SHADER_MASSES);
    for (let i = 0; i < count; i++) u.uMasses.value[i].set(bodies[i].x, bodies[i].y, bodies[i].m, 0);
    u.uCount.value = count;
    u.uMode.value = MODE_INDEX[mode];
    u.uExag.value = ex;
    u.uGrid.value = s.grid ? 1 : 0;
    u.uTime.value = state.clock.elapsedTime;

    // Holes (black spheres of radius r_s at the bottom of their wells).
    const inst = holes.current;
    if (inst) {
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i];
        const r = Math.max(2 * b.m, 0.6);
        tmp.position.set(b.x, b.y, H(b.x, b.y));
        tmp.scale.setScalar(r);
        tmp.updateMatrix();
        inst.setMatrixAt(i, tmp.matrix);
      }
      inst.count = bodies.length;
      inst.instanceMatrix.needsUpdate = true;
    }

    // Trails.
    trails.reset();
    if (s.trails) {
      const probeModel = new Map<number, boolean>();
      for (const p of world.probes) probeModel.set(p.id, s.gr && p.model === 'follow');
      for (const [id, t] of world.trails) {
        if (t.count < 2) continue;
        const isProbe = probeModel.has(id);
        const gr = probeModel.get(id);
        const [cr, cg, cb] = !isProbe ? [0.95, 0.93, 1.0] : gr ? [1.0, 0.78, 0.32] : [0.45, 0.75, 1.0];
        const amax = isProbe ? 0.75 : 0.9;
        let [px, py] = t.at(0);
        let pz = H(px, py) + LIFT;
        for (let k = 1; k < t.count; k++) {
          const [x, y] = t.at(k);
          const z = H(x, y) + LIFT;
          const a0 = ((k - 1) / t.count) * amax;
          const a1 = (k / t.count) * amax;
          if (!trails.seg(px, py, pz, x, y, z, cr, cg, cb, a0, a1)) break;
          px = x;
          py = y;
          pz = z;
        }
      }
    }
    trails.commit();

    // Rays.
    rays.reset();
    dots.reset();
    for (const r of world.rays) {
      const fade = r.state === 'flying' ? 1 : Math.max(0, 1 - r.age / 12);
      const path = r.path;
      const npts = path.length / 2;
      const pts: number[] = [];
      for (let k = 0; k < npts; k++) pts.push(path[2 * k], path[2 * k + 1]);
      if (r.state === 'flying') pts.push(r.x, r.y);
      let px = pts[0];
      let py = pts[1];
      let pz = H(px, py) + LIFT;
      const m = pts.length / 2;
      for (let k = 1; k < m; k++) {
        const x = pts[2 * k];
        const y = pts[2 * k + 1];
        const z = H(x, y) + LIFT;
        const tail = r.state === 'captured' && k > m - 6;
        rays.seg(px, py, pz, x, y, z, tail ? 1 : 1, tail ? 0.35 : 0.93, tail ? 0.25 : 0.62, 0.85 * fade);
        px = x;
        py = y;
        pz = z;
      }
      if (r.state === 'flying') dots.add(r.x, r.y, H(r.x, r.y) + LIFT, 1, 0.97, 0.8, 2.2);
    }
    rays.commit();

    // Probes.
    for (const p of world.probes) {
      const gr = s.gr && p.model === 'follow';
      dots.add(p.x, p.y, H(p.x, p.y) + LIFT + 0.3, gr ? 1 : 0.5, gr ? 0.8 : 0.78, gr ? 0.35 : 1, 2.6);
    }
    if (preview.active && (preview.tool === 'probe' || preview.tool === 'mass')) {
      dots.add(preview.x0, preview.y0, H(preview.x0, preview.y0) + LIFT + 0.3, 0.6, 1, 0.9, preview.tool === 'mass' ? 4 : 2.6);
    }
    dots.commit();

    // Glow halos and flashes.
    glow.reset();
    for (const b of bodies) glow.add(b.x, b.y, H(b.x, b.y) + 1, 1.0, 0.55, 0.22, Math.max(2 * b.m, 0.6) * 5.5);
    for (const f of world.flashes) {
      const k = f.age / 1.2;
      const a = 1 - k;
      const c = f.kind === 'merge' ? [1, 0.8, 0.5] : [1, 0.4, 0.3];
      glow.add(f.x, f.y, H(f.x, f.y) + 1, c[0] * a, c[1] * a, c[2] * a, f.size * (0.6 + 2.5 * k));
    }
    glow.commit();

    // Rings: horizon, photon sphere, ISCO, selection.
    rings.reset();
    const ring = (cx: number, cy: number, R: number, c: [number, number, number], a: number, dashed = false) => {
      let px = cx + R;
      let py = cy;
      let pz = H(px, py) + LIFT;
      for (let i = 1; i <= RING_SEGS; i++) {
        const t = (i / RING_SEGS) * Math.PI * 2;
        const x = cx + R * Math.cos(t);
        const y = cy + R * Math.sin(t);
        const z = H(x, y) + LIFT;
        if (!dashed || i % 2 === 0) rings.seg(px, py, pz, x, y, z, c[0], c[1], c[2], a);
        px = x;
        py = y;
        pz = z;
      }
    };
    for (const b of bodies) {
      ring(b.x, b.y, 2 * b.m * 1.02, [1, 0.55, 0.2], 0.95);
      if (s.rings) {
        ring(b.x, b.y, 3 * b.m, [1, 0.85, 0.4], 0.75, true);
        ring(b.x, b.y, 6 * b.m, [0.4, 0.85, 1], 0.7, true);
      }
      if (b.id === s.selectedId) ring(b.x, b.y, Math.max(8 * b.m, 6), [1, 1, 1], 0.9);
    }
    rings.commit();

    // Velocity arrows and the placement preview.
    arrows.reset();
    const arrow = (x0: number, y0: number, x1: number, y1: number, c: [number, number, number], a: number) => {
      const z0 = H(x0, y0) + LIFT + 0.4;
      const z1 = H(x1, y1) + LIFT + 0.4;
      arrows.seg(x0, y0, z0, x1, y1, z1, c[0], c[1], c[2], a * 0.5, a);
      const dx = x1 - x0;
      const dy = y1 - y0;
      const l = Math.hypot(dx, dy);
      if (l < 1e-3) return;
      const hl = Math.min(6, l * 0.3);
      const ux = dx / l;
      const uy = dy / l;
      for (const sgn of [1, -1]) {
        const hx = x1 - ux * hl - uy * hl * 0.5 * sgn;
        const hy = y1 - uy * hl + ux * hl * 0.5 * sgn;
        arrows.seg(x1, y1, z1, hx, hy, H(hx, hy) + LIFT + 0.4, c[0], c[1], c[2], a);
      }
    };
    if (s.arrows) {
      for (const b of bodies) arrow(b.x, b.y, b.x + b.vx * VEL_SCALE, b.y + b.vy * VEL_SCALE, [0.5, 1, 0.85], 0.9);
      for (const p of world.probes) arrow(p.x, p.y, p.x + p.vx * VEL_SCALE * 0.5, p.y + p.vy * VEL_SCALE * 0.5, [0.5, 0.8, 1], 0.5);
    }
    if (preview.active && preview.tool !== 'select' && preview.tool !== 'view') {
      const { x0, y0, x1, y1 } = preview;
      const dragged = Math.hypot(x1 - x0, y1 - y0) > 0.5;
      if (preview.tool === 'fan') {
        const dx = dragged ? x1 - x0 : 1;
        const dy = dragged ? y1 - y0 : 0;
        const l = Math.hypot(dx, dy);
        const ux = dx / l;
        const uy = dy / l;
        for (let i = 0; i < 7; i++) {
          const sOff = (i / 6 - 0.5) * 120;
          const sx = x0 - uy * sOff;
          const sy = y0 + ux * sOff;
          arrow(sx, sy, sx + ux * 25, sy + uy * 25, [1, 0.93, 0.6], 0.8);
        }
      } else if (preview.tool === 'ray') {
        const dx = dragged ? x1 - x0 : 1;
        const dy = dragged ? y1 - y0 : 0;
        const l = Math.hypot(dx, dy);
        arrow(x0, y0, x0 + (dx / l) * 30, y0 + (dy / l) * 30, [1, 0.93, 0.6], 0.9);
      } else if (dragged) {
        arrow(x0, y0, x1, y1, [0.5, 1, 0.85], 1);
      }
    }
    arrows.commit();

    // Stats for the UI (4 Hz).
    const f = fps.current;
    f.frames++;
    f.t += delta;
    if (f.t >= 1) {
      f.value = Math.round(f.frames / f.t);
      f.frames = 0;
      f.t = 0;
    }
    const now = state.clock.elapsedTime;
    if (now - lastStats.current > 0.25) {
      lastStats.current = now;
      store.set({
        stats: {
          bodies: bodies.length,
          probes: world.probes.length,
          rays: world.rays.length,
          simTime: world.simTime,
          throttled: world.throttled,
          fps: f.value,
        },
      });
      if (s.selectedId != null && !world.bodyById(s.selectedId)) store.set({ selectedId: null });
    }
  });

  return (
    <>
      <instancedMesh ref={holes} args={[sphere, black, MAX_BODIES]} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={trails.geo} material={lineMat} frustumCulled={false} renderOrder={2} />
      <lineSegments geometry={rays.geo} material={addMat} frustumCulled={false} renderOrder={3} />
      <lineSegments geometry={rings.geo} material={lineMat} frustumCulled={false} renderOrder={3} />
      <lineSegments geometry={arrows.geo} material={lineMat} frustumCulled={false} renderOrder={4} />
      <points geometry={glow.geo} material={glow.mat} frustumCulled={false} renderOrder={5} />
      <points geometry={dots.geo} material={dots.mat} frustumCulled={false} renderOrder={6} />
    </>
  );
}

function Controls() {
  const tool = useStore((s) => s.tool);
  const ref = useRef<OrbitControlsImpl>(null);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const placing = tool !== 'view';
    c.mouseButtons = placing
      ? { LEFT: null as unknown as THREE.MOUSE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE }
      : { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.PAN };
    c.touches = placing
      ? { ONE: null as unknown as THREE.TOUCH, TWO: THREE.TOUCH.DOLLY_ROTATE }
      : { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
  }, [tool]);
  return (
    <OrbitControls
      ref={ref}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      target={[0, 0, -12]}
      minDistance={15}
      maxDistance={1200}
    />
  );
}

/** Pulls the camera back on narrow (portrait) screens so the whole domain fits. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const k = aspect < 1.2 ? Math.min(1.9, Math.pow(1.2 / aspect, 0.75)) : 1;
    camera.position.set(0, -265 * k, 225 * k);
    camera.lookAt(0, 0, -12);
    // Only on mount: later resizes keep the user's camera.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

export function Scene() {
  return (
    <Canvas
      className="scene"
      flat
      dpr={[1, 2]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ position: [0, -265, 225], up: [0, 0, 1], fov: 45, near: 0.5, far: 6000 }}
      onCreated={({ gl }) => gl.setClearColor('#04050a')}
      aria-label="Spacetime manifold view"
    >
      <FitCamera />
      <Stars radius={1600} depth={600} count={4000} factor={18} saturation={0} fade speed={0.3} />
      <Sheet />
      <Lattice />
      <Dynamic />
      <Controls />
      <Interaction />
    </Canvas>
  );
}

/** Field values at a point (shared with the readout). */
export const probeFields = (x: number, y: number) => sampleFields(x, y, world.bodies);
