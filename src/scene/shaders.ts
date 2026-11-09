/**
 * GLSL for the manifold sheet and the 3D lattice. sheetHeight() mirrors heightAt() in
 * src/physics/fields.ts exactly (keep them in sync).
 */
import * as THREE from 'three';
import { DOMAIN, FLAMM_REF, MAX_SHADER_MASSES, PHI_HEIGHT } from '../physics/fields';
import { WAVE_DISPLAY_HEIGHT, WAVE_SAMPLES, WAVE_SOFTENING, WAVE_SPACING } from '../sim/waves';
import { world } from '../sim/world';

/** The gravitational-wave history as a 1-pixel-tall float texture, sampled in the vertex shader. */
export const waveTexture = new THREE.DataTexture(world.waves.data, WAVE_SAMPLES, 1, THREE.RGBAFormat, THREE.FloatType);
waveTexture.minFilter = THREE.NearestFilter;
waveTexture.magFilter = THREE.NearestFilter;

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
  /** Where the mesh is centred, and how much it is scaled (see plane.ts). */
  uOrigin: { value: new THREE.Vector2() },
  uScale: { value: 1 },
  /** Where the 3D lattice is centred (snapped to its own spacing). */
  uLatticeOrigin: { value: new THREE.Vector2() },
  uTime: { value: 0 },
  uWave: { value: waveTexture },
  uWaveHead: { value: 0 },
  uWaveCentre: { value: new THREE.Vector2() },
  uWaveGain: { value: 0 },
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
  uniform highp sampler2D uWave;
  uniform int uWaveHead;
  uniform vec2 uWaveCentre;
  uniform float uWaveGain;
  #define WAVE_N ${WAVE_SAMPLES}

  // Mirrors WaveBuffer.ripple() in src/sim/waves.ts.
  float waveHeight(vec2 p) {
    if (uWaveGain <= 0.0) return 0.0;
    vec2 d = p - uWaveCentre;
    float r = length(d);
    if (r < 1e-6) return 0.0;
    float k = r / ${WAVE_SPACING.toFixed(1)};
    if (k >= float(WAVE_N - 1)) return 0.0;
    int i0 = int(floor(k));
    vec3 a = texelFetch(uWave, ivec2((uWaveHead - i0 + 2 * WAVE_N) % WAVE_N, 0), 0).xyz;
    vec3 b = texelFetch(uWave, ivec2((uWaveHead - i0 - 1 + 2 * WAVE_N) % WAVE_N, 0), 0).xyz;
    vec3 q = mix(a, b, k - float(i0));
    float s = d.y / r;
    float c = d.x / r;
    float tt = s * s * q.x + c * c * q.y - 2.0 * s * c * q.z;
    float fade = 1.0 - smoothstep(0.8 * float(WAVE_N), float(WAVE_N), k);
    return -tt * uWaveGain * r * fade / (r * r + ${(WAVE_SOFTENING * WAVE_SOFTENING).toFixed(1)});
  }

  float flammZ(float r, float rs) { return r <= rs ? 0.0 : 2.0 * sqrt(rs * (r - rs)); }

  // Mirrors surfaceZ() in fields.ts. m.w is the surface radius (r_s for a black hole).
  float surfaceZ(float r, float rs, float R) {
    if (r >= R || R <= rs) return flammZ(r, rs);
    float k = rs / (R * R * R);
    return flammZ(R, rs) - (sqrt(1.0 - k * r * r) - sqrt(1.0 - k * R * R)) / sqrt(k);
  }

  float sourcePhi(float r, float M, float R, float rs) {
    if (r >= R) return M / r;
    if (R > rs) return M * (3.0 * R * R - r * r) / (2.0 * R * R * R);
    return M / R;
  }

  float sheetHeight(vec2 p) {
    if (uMode == 3) return 0.0;
    if (uMode == 4) return waveHeight(p) * uExag;
    float h = 0.0;
    for (int i = 0; i < MAXM; i++) {
      if (i >= uCount) break;
      vec4 m = uMasses[i];
      float rs = 2.0 * m.z;
      float r = length(p - m.xy);
      if (uMode == 0) {
        h += min(0.0, surfaceZ(r, rs, m.w) - surfaceZ(uRef, rs, m.w));
      } else {
        h -= sourcePhi(r, m.z, m.w, rs);
      }
    }
    return uMode == 0 ? h * uExag : h * uPhiH * uExag;
  }
`;

export const sheetVertex = /* glsl */ `
  ${common}
  uniform float uCell;
  uniform vec2 uOrigin;
  uniform float uScale;
  varying vec2 vXY;
  varying vec3 vN;
  varying float vH;
  void main() {
    vec2 p = position.xy * uScale + uOrigin;
    float h = sheetHeight(p);
    float e = uCell * uScale;
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

  // Lines fade out once they get closer together than a few pixels, so the far plane stays calm
  // instead of aliasing to solid colour. Each coarser level takes over from the one below it.
  float gridLine(vec2 p, float spacing, float width) {
    vec2 q = p / spacing;
    vec2 w = max(fwidth(q), vec2(1e-5));
    vec2 g = abs(fract(q - 0.5) - 0.5) / w;
    float line = 1.0 - min(min(g.x, g.y) / width, 1.0);
    return line * (1.0 - smoothstep(0.08, 0.3, max(w.x, w.y)));
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
      // Only a real horizon paints the sheet black; a star's sphere covers its own interior.
      if (m.w <= rs * 1.0001) minRatio = min(minRatio, r / rs);
      phi -= sourcePhi(r, m.z, m.w, rs);
      float rr = max(r, m.w);
      float r2 = rr * rr;
      K += 48.0 * m.z * m.z / (r2 * r2 * r2);
    }
    float lapse = sqrt(clamp(1.0 + 2.0 * phi, 0.0, 1.0));
    vec3 base;
    float alpha = 1.0;
    if (uMode == 0) {
      float t = clamp(-vH / (uExag * 70.0 + 1e-3), 0.0, 1.0);
      // The muted middle of cividis (Nuñez, Anderton & Renslow 2018), from the page's graphite.
      // Its yellow end is left out: on a surface this large it glares.
      base = ramp(pow(t, 0.75), vec3(0.082, 0.106, 0.137), vec3(0.17, 0.215, 0.27), vec3(0.367, 0.384, 0.433), vec3(0.664, 0.623, 0.45));
    } else if (uMode == 1) {
      float t = pow(1.0 - lapse, 0.4);
      // viridis, without its purple end.
      base = ramp(t, vec3(0.082, 0.106, 0.137), vec3(0.12, 0.3, 0.4), vec3(0.179, 0.434, 0.557), vec3(0.233, 0.732, 0.459));
    } else if (uMode == 2) {
      float t = (log(K + 1e-30) / log(10.0) + 11.0) / 11.0;
      // afmhot: black through red to white, the usual look of an intensity map.
      base = ramp(t, vec3(0.05, 0.04, 0.04), vec3(0.72, 0.22, 0.0), vec3(1.0, 0.86, 0.36), vec3(1.0, 1.0, 0.94));
    } else if (uMode == 4) {
      float t = 0.5 + 0.5 * clamp(vH / (uExag * ${WAVE_DISPLAY_HEIGHT.toFixed(1)}), -1.0, 1.0);
      // The ends of ColorBrewer RdBu, around a dark centre so the flat sheet stays quiet.
      base = t < 0.5 ? mix(vec3(0.13, 0.40, 0.66), vec3(0.086, 0.106, 0.133), t * 2.0) : mix(vec3(0.086, 0.106, 0.133), vec3(0.78, 0.18, 0.18), t * 2.0 - 1.0);
    } else {
      base = vec3(0.07, 0.08, 0.1);
      alpha = 0.55;
    }
    vec3 n = normalize(vN);
    vec3 L = normalize(vec3(0.35, -0.55, 0.75));
    float diff = clamp(dot(n, L), 0.0, 1.0);
    vec3 col = base * (0.45 + 0.75 * diff);
    if (uGrid > 0.5) {
      float minor = gridLine(vXY, 10.0, 1.2);
      float major = gridLine(vXY, 50.0, 1.6);
      float huge = gridLine(vXY, 250.0, 1.8);
      float vast = gridLine(vXY, 1250.0, 1.8);
      vec3 gc = vec3(0.60, 0.65, 0.71);
      // max, not sum: where levels coincide (the axes) the line must not blow out to white.
      col += gc * max(max(minor * 0.11, major * 0.2), max(huge * 0.28, vast * 0.28));
      alpha = max(alpha, minor * 0.6);
    }
    // Horizon: black inside r_s with a thin hot rim just outside.
    if (minRatio < 1.0) {
      col = vec3(0.0);
      alpha = 1.0;
    } else {
      col += vec3(0.82, 0.6, 0.13) * smoothstep(1.12, 1.0, minRatio) * 0.75;
    }
    // The plane has no edge: it dissolves into the sky with distance from the camera.
    alpha *= 1.0 - smoothstep(5000.0, 15000.0, length(vXY - cameraPosition.xy));
    gl_FragColor = vec4(col, alpha);
  }
`;

export const latticeVertex = /* glsl */ `
  ${common}
  uniform vec2 uLatticeOrigin;
  varying float vPhi;
  varying float vFade;
  void main() {
    vec3 p = position + vec3(uLatticeOrigin, 0.0);
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
    vFade = 1.0 - smoothstep(0.8, 1.0, max(abs(position.x), abs(position.y)) / uDomain);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p + disp, 1.0);
  }
`;

export const latticeFragment = /* glsl */ `
  varying float vPhi;
  varying float vFade;
  void main() {
    float t = clamp(-vPhi * 6.0, 0.0, 1.0);
    vec3 col = mix(vec3(0.42, 0.47, 0.54), vec3(0.82, 0.6, 0.13), t);
    gl_FragColor = vec4(col, (0.22 + 0.6 * t) * vFade);
  }
`;

/** Stars and planets: a sphere coloured per instance, darkening toward the limb. */
export const bodyVertex = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vColor = instanceColor;
    vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }
`;

export const bodyFragment = /* glsl */ `
  varying vec3 vColor;
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    float mu = clamp(dot(normalize(vNormal), normalize(vView)), 0.0, 1.0);
    // Linear limb darkening with u = 0.6, close to the Sun's in visible light.
    gl_FragColor = vec4(vColor * (0.4 + 0.6 * mu), 1.0);
  }
`;

/** The swarm: tiny additive points, with a size that does not collapse to nothing far away. */
export const starsVertex = /* glsl */ `
  attribute vec3 color;
  uniform float uPixelScale;
  uniform float uSize;
  varying vec3 vColor;
  void main() {
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = clamp(uSize * uPixelScale / -mv.z, 1.5, 8.0);
    gl_Position = projectionMatrix * mv;
  }
`;

export const starsFragment = /* glsl */ `
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    gl_FragColor = vec4(vColor, pow(1.0 - d, 1.4) * 0.85);
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
