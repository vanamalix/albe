/**
 * A spinning black hole, drawn on the exact embedding of its equatorial slice (the Kerr analogue of
 * Flamm's paraboloid). The geodesics and the frame-dragging rate come from src/physics/kerr.ts.
 * Radius is drawn as the circumferential radius, azimuth as the Boyer-Lindquist one; the animation clock
 * is Kerr-Schild time, which stays finite at the horizon.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import {
  criticalImpact,
  embeddingTable,
  omega,
  penroseDecay,
  rho,
  restEnergy,
  rIsco,
  rMarginallyBound,
  rPhoton,
  rPlus,
  R_ERGO_EQUATOR,
  traceKerr,
  type KerrPath,
} from '../physics/kerr';
import { penroseMinSpin, useExhibit, type ExhibitId } from '../state/exhibit';
import { store, useStore } from '../state/store';
import { BLUE, cividisGlsl, dotBuffer, GOLD, lineBuffer, lowerIndex, PALE } from './exhibitKit';

/** World units per M. */
const S = 11;
/** Rim of the sheet, in M. */
const RIM = 16;

const sheetVertex = /* glsl */ `
  attribute float aR;
  varying float vR;
  varying vec3 vN;
  varying float vDepth;
  void main() {
    vR = aR;
    vN = normalize(normalMatrix * normal);
    vDepth = position.z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const sheetFragment = /* glsl */ `
  uniform float uDeep;
  varying float vR;
  varying vec3 vN;
  varying float vDepth;
  ${cividisGlsl}
  void main() {
    float t = clamp(-vDepth / uDeep, 0.0, 1.0);
    vec3 col = cividisRamp(pow(t, 0.85)) * (0.5 + 0.6 * clamp(dot(normalize(vN), normalize(vec3(0.35, -0.5, 0.75))) * 0.5 + 0.5, 0.0, 1.0));
    float lines = max(gridLine(vR, 2.0, 1.2), 0.0);
    col += vec3(0.6, 0.65, 0.71) * lines * 0.22;
    // The ergosphere, afmhot: nothing here can stay still relative to the distant stars.
    float ergo = 1.0 - smoothstep(${R_ERGO_EQUATOR.toFixed(1)} - 0.02, ${R_ERGO_EQUATOR.toFixed(1)}, vR);
    col = mix(col, vec3(0.72, 0.22, 0.0) + 0.5 * vec3(1.0, 0.86, 0.36) * (1.0 - t), 0.55 * ergo);
    gl_FragColor = vec4(col, 1.0);
  }
`;

interface Track {
  path: KerrPath;
  colour: readonly number[];
  alpha: number;
  t0: number;
}

/** The set of rays and particles for one of the three Kerr scenes. */
function buildTracks(id: ExhibitId, a: number, decay: number): Track[] {
  const start = RIM - 1.5;
  const tracks: Track[] = [];
  if (id === 'kerr-drag') {
    const E = restEnergy(start, a);
    for (let k = 0; k < 6; k++) {
      const phi0 = (k / 6) * Math.PI * 2;
      tracks.push({ path: traceKerr(a, E, 0, 1, start, phi0, false), colour: GOLD, alpha: 0.95, t0: 0 });
    }
    // Two particles thrown against the spin: L < 0. They are turned round all the same.
    for (let k = 0; k < 2; k++) {
      const phi0 = (k + 0.5) * Math.PI;
      tracks.push({ path: traceKerr(a, 1.02, -3.2, 1, start, phi0, false), colour: BLUE, alpha: 0.95, t0: 0 });
    }
  } else if (id === 'kerr-penrose') {
    const spin = Math.max(a, penroseMinSpin);
    const r = rMarginallyBound(spin) + decay * (R_ERGO_EQUATOR - rMarginallyBound(spin)) * 0.98;
    const event = penroseDecay(r, spin);
    if (!event) return [];
    // The parent falls from far away to its turning point.
    const parent = traceKerr(spin, 1, event.L0, 1, RIM, -2.2, false, { stopAtTurn: true, step: 0.005, maxPoints: 12000 });
    const tEnd = parent.t[parent.t.length - 1];
    const phiEnd = parent.phiBL[parent.phiBL.length - 1];
    const rTurn = parent.r[parent.r.length - 1];
    tracks.push({ path: parent, colour: GOLD, alpha: 0.95, t0: 0 });
    tracks.push({ path: traceKerr(spin, event.out.E, event.out.L, 0, rTurn, phiEnd, true, { rEscape: RIM, maxPoints: 12000 }), colour: PALE, alpha: 1, t0: tEnd });
    tracks.push({ path: traceKerr(spin, event.captured.E, event.captured.L, 0, rTurn, phiEnd, false, { rEscape: RIM, maxPoints: 12000 }), colour: BLUE, alpha: 1, t0: tEnd });
  } else {
    // Started just inside the rim, at the right angle for impact parameter h; L and E fix the geodesic exactly.
    const rs = RIM - 0.5;
    for (let k = 0; k < 41; k++) {
      const h = -11 + (k / 40) * 22;
      const phi0 = Math.atan2(h, -Math.sqrt(rs * rs - h * h));
      // A photon moving along +x at height h has L = −h for E = 1.
      const path = traceKerr(a, 1, -h, 0, rs, phi0, false, { rEscape: RIM, maxPoints: 9000 });
      tracks.push({ path, colour: path.fate === 'horizon' ? GOLD : PALE, alpha: path.fate === 'horizon' ? 0.9 : 0.55, t0: 0 });
    }
  }
  return tracks;
}

export function KerrExhibit({ id }: { id: ExhibitId }) {
  const a = useExhibit((s) => s.spin);
  const decay = useExhibit((s) => s.decay);
  const spin = id === 'kerr-penrose' ? Math.max(a, penroseMinSpin) : a;
  const resetToken = useStore((s) => s.resetToken);

  const table = useMemo(() => embeddingTable(spin, RIM + 1, 3200), [spin]);
  const rimZ = table.zAt(RIM);
  const pos = useMemo(() => (r: number, phi: number, lift = 0.4): [number, number, number] => {
    const rr = rho(r, spin);
    return [S * rr * Math.cos(phi), S * rr * Math.sin(phi), S * (table.zAt(r) - rimZ) + lift];
  }, [spin, table, rimZ]);

  const { geometry, depth, hole } = useMemo(() => {
    const nr = 200;
    const np = 180;
    const positions = new Float32Array(nr * np * 3);
    const radii = new Float32Array(nr * np);
    const rp = rPlus(spin);
    const xMax = Math.sqrt(RIM - rp);
    let k = 0;
    for (let j = 0; j < nr; j++) {
      const x = (j / (nr - 1)) * xMax;
      const r = rp + x * x;
      const rr = rho(r, spin);
      const z = S * (table.zAt(r) - rimZ);
      for (let i = 0; i < np; i++) {
        const t = (i / (np - 1)) * Math.PI * 2;
        positions[k * 3] = S * rr * Math.cos(t);
        positions[k * 3 + 1] = S * rr * Math.sin(t);
        positions[k * 3 + 2] = z;
        radii[k++] = r;
      }
    }
    const index = new Uint32Array((nr - 1) * (np - 1) * 6);
    k = 0;
    for (let j = 0; j < nr - 1; j++) {
      for (let i = 0; i < np - 1; i++) {
        const q = j * np + i;
        index[k++] = q;
        index[k++] = q + np + 1;
        index[k++] = q + 1;
        index[k++] = q;
        index[k++] = q + np;
        index[k++] = q + np + 1;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(radii, 1));
    g.setIndex(new THREE.BufferAttribute(index, 1));
    g.computeVertexNormals();
    return { geometry: g, depth: S * (rimZ - table.zAt(rp)), hole: { r: S * rho(rp, spin), z: S * (table.zAt(rp) - rimZ) } };
  }, [spin, table, rimZ]);

  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uDeep: { value: depth } },
        vertexShader: sheetVertex,
        fragmentShader: sheetFragment,
        side: THREE.DoubleSide,
      }),
    [depth],
  );

  const tracks = useMemo(() => buildTracks(id, spin, decay), [id, spin, decay]);
  const rings = useMemo(() => lineBuffer(16000), []);
  const paths = useMemo(() => lineBuffer(200_000), []);
  const dots = useMemo(() => dotBuffer(1200), []);
  const clock = useRef(0);
  const resetSeen = useRef(resetToken);

  // Rings are static for a given spin.
  useMemo(() => {
    rings.reset();
    const ring = (r: number, c: readonly number[], alpha: number, dashed: boolean) => {
      const n = 160;
      let last = pos(r, 0, 0.6);
      for (let i = 1; i <= n; i++) {
        const next = pos(r, (i / n) * Math.PI * 2, 0.6);
        if (!dashed || i % 2 === 0) rings.seg(last, next, c, alpha);
        last = next;
      }
    };
    ring(rPlus(spin) * 1.002, GOLD, 1, false);
    ring(R_ERGO_EQUATOR, [1, 0.86, 0.36], 0.95, false);
    ring(rPhoton(spin, 1), GOLD, 0.8, true);
    ring(rPhoton(spin, -1), GOLD, 0.8, true);
    ring(rIsco(spin, 1), BLUE, 0.8, true);
    ring(rIsco(spin, -1), BLUE, 0.8, true);
    rings.commit();
  }, [rings, pos, spin]);

  useFrame((_, delta) => {
    const s = store.get();
    if (resetSeen.current !== s.resetToken) {
      resetSeen.current = s.resetToken;
      clock.current = 0;
    }
    if (s.playing) clock.current += (Math.min(delta, 1 / 20) * s.timeScale) / S;
    let end = 0;
    for (const track of tracks) end = Math.max(end, track.t0 + track.path.t[track.path.t.length - 1]);
    const period = end + 24;
    const t = clock.current % period;

    paths.reset();
    dots.reset();
    for (const track of tracks) {
      const elapsed = t - track.t0;
      if (elapsed <= 0) continue;
      const path = track.path;
      const last = lowerIndex(path.t, elapsed);
      let prev = pos(path.r[0], path.phiBL[0]);
      for (let i = 1; i <= last; i++) {
        const next = pos(path.r[i], path.phiBL[i]);
        paths.seg(prev, next, track.colour, track.alpha * (0.4 + (0.6 * i) / (last + 1)));
        prev = next;
      }
      if (elapsed < path.t[path.t.length - 1]) dots.add(prev, track.colour, 6);
    }
    paths.commit();

    // The zero-angular-momentum observers, turned at the local ω. The frame-dragging itself.
    if (id === 'kerr-drag' || id === 'kerr-light') {
      const rp = rPlus(spin);
      const count = 18;
      for (let ringIndex = 0; ringIndex < 13; ringIndex++) {
        const r = rp + 0.12 + ringIndex * ringIndex * 0.075;
        const w = omega(r, spin);
        const tRing = (Math.min(1, w / omega(rp, spin)) * 0.75);
        const colour: [number, number, number] = [0.2 + 0.03 * tRing, 0.45 + 0.42 * tRing, 0.45 + 0.05 * tRing];
        for (let i = 0; i < count; i++) dots.add(pos(r, (i / count) * Math.PI * 2 + w * clock.current, 0.9), colour, 3.4);
      }
    }
    dots.commit();
  });

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />
      <mesh position={[0, 0, hole.z - 0.05]} frustumCulled={false} renderOrder={1}>
        <circleGeometry args={[hole.r + 1, 48]} />
        <meshBasicMaterial color="#000000" />
      </mesh>
      <lineSegments geometry={rings.geo} material={rings.material} frustumCulled={false} renderOrder={2} />
      <lineSegments geometry={paths.geo} material={paths.material} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.material} frustumCulled={false} renderOrder={4} />
    </>
  );
}

/** Critical impact parameters, for the panel. */
export const shadowEdges = (a: number): [number, number] => [criticalImpact(a, -1), criticalImpact(a, 1)];
