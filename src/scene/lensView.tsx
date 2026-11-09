/**
 * The Lens view: a full-screen pass that, for every pixel, follows the ray back through the current
 * masses to a procedural sky. It solves the lens equation by inverse ray-shooting, which is exact
 * and cheap: β(θ) is a direct formula, so the multiple images, rings and arcs need no root-finding.
 * The maths and what is exact in it are in src/physics/lens.ts; this GLSL mirrors lensMap() and
 * strongLensMap() there.
 *
 * The observer looks straight down at the (x, y) plane of the simulation, so the camera sets only
 * the centre, the zoom and the azimuth of the image. WebGL 2 only (texelFetch, integer hashing).
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { MAX_SHADER_MASSES } from '../physics/fields';
import { DEFLECTION_TABLE_SIZE, deflectionTable, isStrongLensScene, lensDistance } from '../physics/lens';
import { world } from '../sim/world';
import { store } from '../state/store';
import { sharedUniforms } from './shaders';

const vertex = /* glsl */ `
  varying vec2 vNdc;
  void main() {
    vNdc = position.xy;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragment = /* glsl */ `
  #define MAXM ${MAX_SHADER_MASSES}
  #define LUT_N ${DEFLECTION_TABLE_SIZE}
  #define BC_FACTOR 5.196152422706632
  uniform vec4 uMasses[MAXM];
  uniform int uCount;
  uniform float uSoftening[MAXM];
  uniform highp sampler2D uDeflection;
  uniform float uDeff;
  uniform int uStrong;
  uniform vec2 uCentre;
  uniform vec2 uRight;
  uniform vec2 uHalf;
  varying vec2 vNdc;

  // GitHub Primer neutrals, as sRGB display values.
  const vec3 CANVAS = vec3(0.0039, 0.0157, 0.0353); // #010409
  const vec3 INSET = vec3(0.0510, 0.0667, 0.0902);  // #0d1117
  const vec3 SUBTLE = vec3(0.0824, 0.1059, 0.1373); // #151b23

  uvec3 scramble(uvec3 v) {
    for (int i = 0; i < 3; i++) {
      v = v * 2654435761u + uvec3(2166136261u, 16777619u, 40503u);
      v += v.yzx * v.zxy;
      v ^= v >> 15u;
    }
    return v;
  }

  vec3 hash3(ivec2 cell, uint seed) {
    return vec3(scramble(uvec3(uint(cell.x), uint(cell.y), seed))) / 4294967295.0;
  }

  float valueNoise(vec2 q, uint seed) {
    vec2 g = floor(q);
    vec2 f = q - g;
    vec2 u = f * f * (3.0 - 2.0 * f);
    ivec2 c = ivec2(g);
    float a = hash3(c, seed).x;
    float b = hash3(c + ivec2(1, 0), seed).x;
    float d = hash3(c + ivec2(0, 1), seed).x;
    float e = hash3(c + ivec2(1, 1), seed).x;
    return mix(mix(a, b, u.x), mix(d, e, u.x), u.y);
  }

  // One layer of stars in square cells of size s. f is the width of this pixel's footprint on the
  // sky, so a star under a strongly stretched pixel is averaged instead of flickering: its Gaussian
  // widens with the footprint at constant energy, and fades to the layer's mean brightness once
  // the footprint spans a whole cell.
  vec3 starLayer(vec2 q, float s, float f, float radius, float amp, float occupancy, uint seed) {
    vec2 g = q / s;
    ivec2 c = ivec2(floor(g));
    vec3 h = hash3(c, seed);
    vec2 d = (g - vec2(c)) - mix(vec2(0.1), vec2(0.9), h.xy);
    float fc = f / s;
    float rr = radius * radius;
    float rw = rr + 0.5 * fc * fc;
    float glow = h.z < occupancy ? (amp * rr / rw) * exp(-dot(d, d) / (2.0 * rw)) : 0.0;
    // Star colours run from cool white to warm white, the hot-to-cool sequence with no pinks.
    vec3 tint = mix(vec3(0.74, 0.84, 1.0), vec3(1.0, 0.86, 0.68), fract(h.z * 7.0));
    float mean = amp * 6.2832 * rr * occupancy;
    float w = smoothstep(0.35, 1.0, fc);
    return mix(tint * glow, vec3(mean), w);
  }

  // Distant galaxies: rare, faint ellipses at a random angle.
  vec3 galaxyLayer(vec2 q, float s, float f, uint seed) {
    vec2 g = q / s;
    ivec2 c = ivec2(floor(g));
    vec3 h = hash3(c, seed);
    vec2 d = (g - vec2(c)) - mix(vec2(0.25), vec2(0.75), h.xy);
    float angle = h.z * 3.1416;
    float ca = cos(angle);
    float sa = sin(angle);
    d = mat2(ca, -sa, sa, ca) * d;
    d.y /= 0.42;
    float fc = f / s;
    float rr = 0.0064 + 0.5 * fc * fc;
    float glow = h.x < 0.55 ? 0.22 * (0.0064 / rr) * exp(-dot(d, d) / (2.0 * rr)) : 0.0;
    float w = smoothstep(0.35, 1.0, fc);
    return mix(vec3(0.78, 0.74, 0.66) * glow, vec3(0.22 * 6.2832 * 0.0064 * 0.42 * 0.55), w);
  }

  vec3 sky(vec2 q, float f) {
    // A faint, large-scale neutral background: shears and arcs are visible in it even without stars.
    float n = 0.6 * valueNoise(q / 720.0, 11u) + 0.4 * valueNoise(q / 240.0, 12u);
    vec3 col = mix(CANVAS, INSET, smoothstep(0.42, 0.78, n));
    col = mix(col, SUBTLE, 0.25 * smoothstep(0.6, 0.85, n));
    col += starLayer(q, 7.0, f, 0.06, 0.7, 0.45, 21u);
    col += starLayer(q, 21.0, f, 0.035, 1.1, 0.6, 22u);
    col += starLayer(q, 63.0, f, 0.022, 1.6, 0.5, 23u);
    col += galaxyLayer(q, 180.0, f, 24u);
    return min(col, vec3(1.0));
  }

  // h(x) = α̂ + ln(1 − x), x = b_c / b, tabulated by deflectionTable() in physics/lens.ts.
  float remainder(float x) {
    float i = clamp(x, 0.0, 1.0) * float(LUT_N - 1);
    int i0 = int(floor(i));
    int i1 = min(i0 + 1, LUT_N - 1);
    float a = texelFetch(uDeflection, ivec2(i0, 0), 0).r;
    float b = texelFetch(uDeflection, ivec2(i1, 0), 0).r;
    return mix(a, b, i - float(i0));
  }

  void main() {
    vec2 up = vec2(-uRight.y, uRight.x);
    vec2 p = uCentre + uRight * vNdc.x * uHalf.x + up * vNdc.y * uHalf.y;
    float px = fwidth(p.x) + fwidth(p.y);
    float visible = 1.0;   // 0 inside a capture disc
    float solid = 1.0;     // 0 on the surface of a star or planet
    vec2 q = p;

    if (uStrong == 1 && uCount == 1) {
      // One black hole: the exact Schwarzschild bending, wound round a stereographic sky.
      vec4 m = uMasses[0];
      vec2 d = p - m.xy;
      float bc = BC_FACTOR * m.z;
      float b = length(d);
      visible = smoothstep(bc - px, bc + px, b);
      float clamped = max(b, bc * 1.000001);
      float x = bc / clamped;
      float alpha = -log(1.0 - x) + remainder(x);
      float t = clamp(tan(alpha * 0.5), -4000.0, 4000.0);
      q = p - uDeff * 2.0 * t * d / clamped;
    } else {
      // Thin lens: β = θ − Σ 4 M_i D (θ − θ_i) / |θ − θ_i|². Mirrors lensMap().
      vec2 pull = vec2(0.0);
      for (int i = 0; i < MAXM; i++) {
        if (i >= uCount) break;
        vec4 m = uMasses[i];
        vec2 d = p - m.xy;
        float b2 = dot(d, d);
        float a = uSoftening[i];
        if (a > 0.0) {
          pull += d * 4.0 * m.z / (b2 + a * a);
          continue;
        }
        float rs = 2.0 * m.z;
        bool hole = m.w <= rs * 1.0001;
        float occlude = (hole || m.w < 3.0 * m.z) ? BC_FACTOR * m.z : m.w / sqrt(1.0 - rs / m.w);
        float b = sqrt(b2);
        float cover = smoothstep(occlude - px, occlude + px, b);
        if (hole) visible = min(visible, cover);
        else solid = min(solid, cover);
        pull += d * 4.0 * m.z / max(b2, occlude * occlude);
      }
      q = p - uDeff * pull;
    }

    // How far a pixel reaches on the sky: lensing shears pixels into long footprints.
    vec2 dq = fwidth(q);
    float f = min(length(dq), 1.0e6);
    vec3 col = sky(q, f);
    col = mix(INSET, col, solid);
    col *= visible;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/** Creates the pass material. Its masses come straight from the shared uniforms. */
export function createLensMaterial(): THREE.ShaderMaterial {
  const table = new THREE.DataTexture(deflectionTable(), DEFLECTION_TABLE_SIZE, 1, THREE.RedFormat, THREE.FloatType);
  table.minFilter = THREE.NearestFilter;
  table.magFilter = THREE.NearestFilter;
  table.needsUpdate = true;
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: fragment,
    depthTest: false,
    depthWrite: false,
    uniforms: {
      uMasses: sharedUniforms.uMasses,
      uCount: sharedUniforms.uCount,
      uSoftening: { value: new Float32Array(MAX_SHADER_MASSES) },
      uDeflection: { value: table },
      uDeff: { value: 0 },
      uStrong: { value: 0 },
      uCentre: { value: new THREE.Vector2() },
      uRight: { value: new THREE.Vector2(1, 0) },
      uHalf: { value: new THREE.Vector2(1, 1) },
    },
  });
}

/** Sets the frame's sky mapping from the camera: pixels on the plane z = 0, seen face on. */
export function setLensCamera(material: THREE.ShaderMaterial, camera: THREE.PerspectiveCamera, target: THREE.Vector3, aspect: number): void {
  const u = material.uniforms;
  u.uCentre.value.set(target.x, target.y);
  const e = camera.matrixWorld.elements;
  const l = Math.hypot(e[0], e[1]) || 1;
  u.uRight.value.set(e[0] / l, e[1] / l);
  const half = Math.max(1, camera.position.distanceTo(target) + target.z) * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  u.uHalf.value.set(half * aspect, half);
}

/** Masses from the simulation that the shared uniforms cannot carry. */
export function setLensMasses(material: THREE.ShaderMaterial, exaggeration: number): void {
  const u = material.uniforms;
  const bodies = world.bodies;
  const soft = u.uSoftening.value as Float32Array;
  soft.fill(0);
  const n = Math.min(bodies.length, MAX_SHADER_MASSES);
  for (let i = 0; i < n; i++) soft[i] = bodies[i].soft ?? 0;
  u.uDeff.value = lensDistance(bodies) * exaggeration;
  u.uStrong.value = isStrongLensScene(bodies) ? 1 : 0;
}

/**
 * The full-screen pass, drawn before everything else. Mount it only in the Lens view. It lowers the
 * canvas resolution a step at a time if the frame rate falls short, and restores it on unmount.
 */
export function LensView() {
  const material = useMemo(createLensMaterial, []);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    return g;
  }, []);
  const setDpr = useThree((s) => s.setDpr);
  const dpr = useThree((s) => s.viewport.dpr);
  const initialDpr = useRef(dpr);
  const pacing = useRef({ frames: 0, time: 0 });

  useEffect(() => {
    return () => {
      setDpr(initialDpr.current);
      (material.uniforms.uDeflection.value as THREE.DataTexture).dispose();
      material.dispose();
      geometry.dispose();
    };
  }, [material, geometry, setDpr]);

  useFrame((state, delta) => {
    const target = (state.controls as { target?: THREE.Vector3 } | null)?.target;
    if (target) setLensCamera(material, state.camera as THREE.PerspectiveCamera, target, state.size.width / Math.max(1, state.size.height));
    setLensMasses(material, store.get().exaggeration);
    if (delta < 0.25 && !document.hidden) {
      const p = pacing.current;
      p.frames++;
      p.time += delta;
      if (p.time >= 1) {
        const fps = p.frames / p.time;
        p.frames = 0;
        p.time = 0;
        if (fps < 50 && state.viewport.dpr > 0.75) setDpr(Math.max(0.75, state.viewport.dpr - 0.25));
      }
    }
  });

  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={-10} />;
}
