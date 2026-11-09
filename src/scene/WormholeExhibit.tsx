/**
 * The Ellis wormhole, drawn as its exact catenoid embedding with rays traced through src/physics/wormhole.ts.
 * The grid lines are spaced in proper distance, so they are true lengths on the surface.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { ellisEmbed, ellisRadius, traceWormhole, type WormholeRay } from '../physics/wormhole';
import { useExhibit } from '../state/exhibit';
import { store, useStore } from '../state/store';
import { BLUE, cividisGlsl, dotBuffer, GOLD, lineBuffer, lowerIndex, PALE, TEXT } from './exhibitKit';

/** Half-range of proper distance drawn on the sheet, in world units. */
const LMAX = 150;
/** Where rays start, just inside the sheet's rim. */
const LSTART = 140;

const catenoidVertex = /* glsl */ `
  uniform float uB;
  varying float vL;
  varying float vPhi;
  varying float vR;
  varying vec3 vN;
  void main() {
    float l = position.x;
    float phi = position.y;
    float r = sqrt(l * l + uB * uB);
    vL = l;
    vPhi = phi;
    vR = r;
    vN = normalize(vec3(-(uB / r) * cos(phi), -(uB / r) * sin(phi), l / r));
    float z = uB * asinh(l / uB);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(r * cos(phi), r * sin(phi), z, 1.0);
  }
`;

const catenoidFragment = /* glsl */ `
  uniform float uB;
  varying float vL;
  varying float vPhi;
  varying float vR;
  varying vec3 vN;
  ${cividisGlsl}
  void main() {
    // Gaussian curvature relative to the throat's: (b/r)⁴.
    float t = pow(uB / vR, 1.2);
    vec3 col = cividisRamp(t) * (0.55 + 0.6 * abs(dot(normalize(vN), normalize(vec3(0.3, -0.5, 0.8)))));
    float minor = gridLine(vL, 20.0, 1.2);
    float angular = gridLine(vPhi, 3.14159265 / 6.0, 1.2);
    float line = max(minor, angular);
    // Upper sheet tinted Primer blue, lower amber, so the two universes read apart.
    vec3 lineColour = vL > 0.0 ? vec3(0.345, 0.651, 1.0) : vec3(0.82, 0.6, 0.13);
    col += lineColour * line * 0.55;
    float alpha = 0.58 + 0.3 * line;
    alpha *= 1.0 - smoothstep(0.9 * ${LMAX.toFixed(1)}, ${LMAX.toFixed(1)}, abs(vL));
    gl_FragColor = vec4(col, alpha);
  }
`;

function catenoidGeometry(): THREE.BufferGeometry {
  const nl = 190;
  const np = 132;
  const positions = new Float32Array(nl * np * 3);
  const uMax = Math.asinh(LMAX / 20);
  let k = 0;
  for (let j = 0; j < nl; j++) {
    const u = -uMax + (2 * uMax * j) / (nl - 1);
    const l = 20 * Math.sinh(u);
    for (let i = 0; i < np; i++) {
      positions[k++] = l;
      positions[k++] = (i / (np - 1)) * Math.PI * 2;
      positions[k++] = 0;
    }
  }
  const index = new Uint32Array((nl - 1) * (np - 1) * 6);
  k = 0;
  for (let j = 0; j < nl - 1; j++) {
    for (let i = 0; i < np - 1; i++) {
      const a = j * np + i;
      const b = a + 1;
      const c = a + np;
      const d = c + 1;
      index[k++] = a;
      index[k++] = b;
      index[k++] = d;
      index[k++] = a;
      index[k++] = d;
      index[k++] = c;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(new THREE.BufferAttribute(index, 1));
  return geometry;
}

const colourOf = (ray: WormholeRay): [number, number, number] => (ray.fate === 'cross' ? GOLD : ray.fate === 'reflect' ? BLUE : TEXT);

/** A ray entering from the −x side, moving along +x at impact parameter h, from universe A (l > 0). */
function launch(b: number, h: number): WormholeRay {
  const r0 = ellisRadius(LSTART, b);
  return traceWormhole(b, h, LSTART, Math.PI + Math.asin(h / r0), LSTART, { rel: 0.02, maxArc: 30 * Math.PI * b + 2 * LSTART, maxPoints: 4000 });
}

export function WormholeExhibit() {
  const b = useExhibit((s) => s.b);
  const aim = useExhibit((s) => s.aim);
  const speed = useExhibit((s) => s.speed);
  const resetToken = useStore((s) => s.resetToken);

  const geometry = useMemo(catenoidGeometry, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { uB: { value: b } },
        vertexShader: catenoidVertex,
        fragmentShader: catenoidFragment,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    // The shader's uB is updated each frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const fan = useMemo(() => {
    const rays: WormholeRay[] = [];
    for (let k = -1.7; k <= 1.701; k += 0.2) rays.push(launch(b, k * b));
    return rays;
  }, [b]);
  const aimed = useMemo(() => launch(b, aim * b), [b, aim]);
  const lines = useMemo(() => lineBuffer(160_000, false, false), []);
  const dots = useMemo(() => dotBuffer(80, false), []);
  const throat = useMemo(() => lineBuffer(2 * 128, false, false), []);
  const clock = useRef(0);
  const resetSeen = useRef(resetToken);

  useFrame((_, delta) => {
    const s = store.get();
    material.uniforms.uB.value = b;
    if (resetSeen.current !== s.resetToken) {
      resetSeen.current = s.resetToken;
      clock.current = 0;
    }
    if (s.playing) clock.current += Math.min(delta, 1 / 20) * s.timeScale;
    const longest = Math.max(...fan.map((ray) => ray.s[ray.s.length - 1]));
    const period = Math.max(longest, aimed.s[aimed.s.length - 1]) / Math.max(0.05, speed) + 90;
    const t = clock.current % period;

    lines.reset();
    dots.reset();
    const drawRay = (ray: WormholeRay, c: readonly number[], alpha: number, headS: number, headSize: number, headColour: readonly number[]) => {
      const last = lowerIndex(ray.s, headS);
      let prev = ellisEmbed(ray.l[0], ray.phi[0], b);
      for (let i = 1; i <= last; i++) {
        const next = ellisEmbed(ray.l[i], ray.phi[i], b);
        lines.seg(prev, next, c, alpha * (0.35 + (0.65 * i) / (last + 1)));
        prev = next;
      }
      if (headS < ray.s[ray.s.length - 1]) dots.add(prev, headColour, headSize);
    };
    for (const ray of fan) drawRay(ray, colourOf(ray), 0.55, t, 5, PALE);
    drawRay(aimed, colourOf(aimed), 1, t, 8, TEXT); // The light signal, with a matter traveller behind it.
    const matter = t * speed;
    if (matter < aimed.s[aimed.s.length - 1]) {
      const i = lowerIndex(aimed.s, matter);
      dots.add(ellisEmbed(aimed.l[i], aimed.phi[i], b), GOLD, 10);
    }
    lines.commit();
    dots.commit();

    throat.reset();
    let last = ellisEmbed(0, 0, b);
    for (let i = 1; i <= 120; i++) {
      const next = ellisEmbed(0, (i / 120) * Math.PI * 2, b);
      throat.seg(last, next, GOLD, 0.95);
      last = next;
    }
    throat.commit();
  });

  return (
    <>
      <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={1} />
      <lineSegments geometry={throat.geo} material={throat.material} frustumCulled={false} renderOrder={2} />
      <lineSegments geometry={lines.geo} material={lines.material} frustumCulled={false} renderOrder={3} />
      <points geometry={dots.geo} material={dots.material} frustumCulled={false} renderOrder={4} />
    </>
  );
}
