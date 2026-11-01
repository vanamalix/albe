/**
 * GLSL for the manifold sheet and the 3D lattice. sheetHeight() mirrors heightAt() in
 * src/physics/fields.ts exactly (keep them in sync).
 */
import * as THREE from 'three';
import { DOMAIN, FLAMM_REF, MAX_SHADER_MASSES, PHI_HEIGHT } from '../physics/fields';

/** Shared uniforms: one object, referenced by every material, updated once per frame. */
export const sharedUniforms = {
  uMasses: { value: Array.from({ length: MAX_SHADER_MASSES }, () => new THREE.Vector4()) },
  uCount: { value: 0 },
  uMode: { value: 0 },
  uExag: { value: 1 },
  uRef: { value: FLAMM_REF },
  uPhiH: { value: PHI_HEIGHT },
  uDomain: { value: DOMAIN },
  uGrid: { value: 1 },
  uTime: { value: 0 },
};

const common = /* glsl */ `
  #define MAXM ${MAX_SHADER_MASSES}
  uniform vec4 uMasses[MAXM];
  uniform int uCount;
  uniform int uMode;
  uniform float uExag;
  uniform float uRef;
  uniform float uPhiH;
  uniform float uDomain;

  float flammZ(float r, float rs) { return r <= rs ? 0.0 : 2.0 * sqrt(rs * (r - rs)); }

  float sheetHeight(vec2 p) {
    if (uMode == 3) return 0.0;
    float h = 0.0;
    for (int i = 0; i < MAXM; i++) {
      if (i >= uCount) break;
      vec4 m = uMasses[i];
      float rs = 2.0 * m.z;
      float r = length(p - m.xy);
      if (uMode == 0) {
        float ref = flammZ(uRef, rs);
        h += r <= rs ? -ref : min(0.0, flammZ(r, rs) - ref);
      } else {
        h -= m.z / max(r, rs);
      }
    }
    return uMode == 0 ? h * uExag : h * uPhiH * uExag;
  }
`;

export const sheetVertex = /* glsl */ `
  ${common}
  uniform float uCell;
  varying vec2 vXY;
  varying vec3 vN;
  varying float vH;
  void main() {
    vec2 p = position.xy;
    float h = sheetHeight(p);
    float e = uCell;
    float hx = sheetHeight(p + vec2(e, 0.0)) - sheetHeight(p - vec2(e, 0.0));
    float hy = sheetHeight(p + vec2(0.0, e)) - sheetHeight(p - vec2(0.0, e));
    vN = normalize(vec3(-hx, -hy, 2.0 * e));
    vXY = p;
    vH = h;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, h, 1.0);
  }
`;

export const sheetFragment = /* glsl */ `
  ${common}
  uniform float uGrid;
  varying vec2 vXY;
  varying vec3 vN;
  varying float vH;

  vec3 ramp(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    t = clamp(t, 0.0, 1.0);
    if (t < 0.333) return mix(a, b, t / 0.333);
    if (t < 0.666) return mix(b, c, (t - 0.333) / 0.333);
    return mix(c, d, (t - 0.666) / 0.334);
  }

  float gridLine(vec2 p, float spacing, float width) {
    vec2 q = p / spacing;
    vec2 g = abs(fract(q - 0.5) - 0.5) / max(fwidth(q), vec2(1e-5));
    return 1.0 - min(min(g.x, g.y) / width, 1.0);
  }

  void main() {
    float phi = 0.0;
    float K = 0.0;
    float minRatio = 1e9;
    for (int i = 0; i < MAXM; i++) {
      if (i >= uCount) break;
      vec4 m = uMasses[i];
      float rs = 2.0 * m.z;
      float r = length(vXY - m.xy);
      minRatio = min(minRatio, r / rs);
      float rr = max(r, rs);
      phi -= m.z / rr;
      float r2 = rr * rr;
      K += 48.0 * m.z * m.z / (r2 * r2 * r2);
    }
    float lapse = sqrt(clamp(1.0 + 2.0 * phi, 0.0, 1.0));
    vec3 base;
    float alpha = 1.0;
    if (uMode == 0) {
      float t = clamp(-vH / (uExag * 34.0 + 1e-3), 0.0, 1.0);
      base = ramp(pow(t, 0.7), vec3(0.10, 0.16, 0.32), vec3(0.20, 0.17, 0.48), vec3(0.36, 0.14, 0.52), vec3(0.62, 0.20, 0.42));
    } else if (uMode == 1) {
      float t = pow(1.0 - lapse, 0.4);
      base = ramp(t, vec3(0.07, 0.12, 0.30), vec3(0.08, 0.42, 0.55), vec3(0.95, 0.55, 0.18), vec3(1.0, 0.92, 0.75));
    } else if (uMode == 2) {
      float t = (log(K + 1e-30) / log(10.0) + 11.0) / 11.0;
      base = ramp(t, vec3(0.02, 0.02, 0.07), vec3(0.34, 0.06, 0.42), vec3(0.86, 0.27, 0.22), vec3(0.99, 0.90, 0.45));
    } else {
      base = vec3(0.05, 0.07, 0.14);
      alpha = 0.55;
    }
    vec3 n = normalize(vN);
    vec3 L = normalize(vec3(0.35, -0.55, 0.75));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    vec3 col = base * (0.45 + 0.75 * diff);
    if (uGrid > 0.5) {
      float minor = gridLine(vXY, 10.0, 1.2);
      float major = gridLine(vXY, 50.0, 1.6);
      vec3 gc = uMode == 2 ? vec3(0.75, 0.70, 0.95) : vec3(0.55, 0.80, 1.0);
      col += gc * (minor * 0.22 + major * 0.38);
      alpha = max(alpha, minor * 0.6);
    }
    // Horizon: black inside r_s with a thin hot rim just outside.
    if (minRatio < 1.0) {
      col = vec3(0.0);
      alpha = 1.0;
    } else {
      col += vec3(1.0, 0.55, 0.2) * smoothstep(1.12, 1.0, minRatio) * 0.9;
    }
    float edge = max(abs(vXY.x), abs(vXY.y)) / uDomain;
    alpha *= 1.0 - smoothstep(0.82, 1.0, edge);
    gl_FragColor = vec4(col, alpha);
  }
`;

export const latticeVertex = /* glsl */ `
  ${common}
  varying float vPhi;
  varying float vFade;
  void main() {
    vec3 p = position;
    vec3 disp = vec3(0.0);
    float phi = 0.0;
    for (int i = 0; i < MAXM; i++) {
      if (i >= uCount) break;
      vec4 m = uMasses[i];
      vec3 d = p - vec3(m.xy, 0.0);
      float r = length(d) + 1e-3;
      float M = m.z;
      float pull = min(0.85 * r, 120.0 * M * r / (r * r + 30.0 * M * M) * uExag);
      disp -= d / r * pull;
      phi -= M / max(r, 2.0 * M);
    }
    vPhi = phi;
    vFade = 1.0 - smoothstep(0.8, 1.0, max(abs(p.x), abs(p.y)) / uDomain);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p + disp, 1.0);
  }
`;

export const latticeFragment = /* glsl */ `
  varying float vPhi;
  varying float vFade;
  void main() {
    float t = clamp(-vPhi * 6.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.30, 0.50, 0.95), vec3(1.0, 0.72, 0.35), t);
    gl_FragColor = vec4(col, (0.22 + 0.6 * t) * vFade);
  }
`;

/** Round, soft points with per-vertex colour and world-space size. */
export const pointsVertex = /* glsl */ `
  attribute vec3 color;
  attribute float size;
  uniform float uPixelScale;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(size * uPixelScale / -mv.z, 2.0, 256.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const pointsFragment = /* glsl */ `
  uniform float uSoft;
  varying vec3 vColor;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    if (d > 1.0) discard;
    float a = uSoft > 0.5 ? pow(1.0 - d, 2.2) : smoothstep(1.0, 0.7, d);
    gl_FragColor = vec4(vColor * (uSoft > 0.5 ? 1.0 : 1.0), a);
  }
`;
