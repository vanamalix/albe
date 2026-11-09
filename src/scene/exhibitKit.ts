/** Small render helpers shared by the wormhole and Kerr exhibits: dynamic lines and points. */
import * as THREE from 'three';

export const GOLD: [number, number, number] = [0.82, 0.6, 0.13];
export const BLUE: [number, number, number] = [0.35, 0.65, 1];
export const PALE: [number, number, number] = [1, 0.93, 0.62];
export const TEXT: [number, number, number] = [0.94, 0.96, 0.99];

/** A dynamic line-segment buffer with RGBA vertex colours. */
export function lineBuffer(maxVerts: number, additive = false, depthTest = true) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(maxVerts * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(maxVerts * 4), 4);
  pos.setUsage(THREE.DynamicDrawUsage);
  col.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  geo.setDrawRange(0, 0);
  const material = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    depthTest,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  let n = 0;
  return {
    geo,
    material,
    reset() {
      n = 0;
    },
    seg(a: readonly number[], b: readonly number[], c: readonly number[], alpha0: number, alpha1 = alpha0) {
      if (n + 2 > maxVerts) return;
      const p = pos.array as Float32Array;
      const q = col.array as Float32Array;
      p[n * 3] = a[0];
      p[n * 3 + 1] = a[1];
      p[n * 3 + 2] = a[2];
      p[n * 3 + 3] = b[0];
      p[n * 3 + 4] = b[1];
      p[n * 3 + 5] = b[2];
      q[n * 4] = c[0];
      q[n * 4 + 1] = c[1];
      q[n * 4 + 2] = c[2];
      q[n * 4 + 3] = alpha0;
      q[n * 4 + 4] = c[0];
      q[n * 4 + 5] = c[1];
      q[n * 4 + 6] = c[2];
      q[n * 4 + 7] = alpha1;
      n += 2;
    },
    commit() {
      geo.setDrawRange(0, n);
      pos.needsUpdate = true;
      col.needsUpdate = true;
    },
  };
}

/** Round dots of a fixed pixel size. */
export function dotBuffer(max: number, depthTest = true) {
  const geo = new THREE.BufferGeometry();
  const pos = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
  const col = new THREE.BufferAttribute(new Float32Array(max * 3), 3);
  const size = new THREE.BufferAttribute(new Float32Array(max), 1);
  for (const a of [pos, col, size]) a.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('position', pos);
  geo.setAttribute('color', col);
  geo.setAttribute('size', size);
  geo.setDrawRange(0, 0);
  const material = new THREE.ShaderMaterial({
    uniforms: { uRatio: { value: typeof window === 'undefined' ? 1 : Math.min(2, window.devicePixelRatio || 1) } },
    vertexShader: /* glsl */ `
      attribute vec3 color;
      attribute float size;
      uniform float uRatio;
      varying vec3 vColor;
      void main() {
        vColor = color;
        gl_PointSize = size * uRatio;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      varying vec3 vColor;
      void main() {
        float d = length(gl_PointCoord - 0.5) * 2.0;
        if (d > 1.0) discard;
        gl_FragColor = vec4(vColor, smoothstep(1.0, 0.65, d));
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest,
  });
  let n = 0;
  return {
    geo,
    material,
    reset() {
      n = 0;
    },
    add(p: readonly number[], c: readonly number[], s: number) {
      if (n >= max) return;
      (pos.array as Float32Array).set(p as number[], n * 3);
      (col.array as Float32Array).set(c as number[], n * 3);
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

/** The muted cividis ramp the main sheet uses, from the page's graphite to its brownish end. */
export const cividisGlsl = /* glsl */ `
  vec3 cividisRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 a = vec3(0.082, 0.106, 0.137);
    vec3 b = vec3(0.17, 0.215, 0.27);
    vec3 c = vec3(0.367, 0.384, 0.433);
    vec3 d = vec3(0.664, 0.623, 0.45);
    if (t < 0.333) return mix(a, b, t / 0.333);
    if (t < 0.666) return mix(b, c, (t - 0.333) / 0.333);
    return mix(c, d, (t - 0.666) / 0.334);
  }
  float gridLine(float q, float spacing, float width) {
    float v = q / spacing;
    float w = max(fwidth(v), 1e-5);
    float g = abs(fract(v - 0.5) - 0.5) / w;
    return (1.0 - min(g / width, 1.0)) * (1.0 - smoothstep(0.08, 0.3, w));
  }
`;

/** Index of the last entry of a sorted array that is ≤ x (0 if none). */
export function lowerIndex(values: readonly number[], x: number): number {
  let lo = 0;
  let hi = values.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (values[mid] <= x) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}
