/**
 * GLSL shared by the shaders, written in a plain scalar subset so the test in glslChunks.test.ts can
 * run this very text as JavaScript and compare it with the physics. Keep it scalar: no vec2 or swizzles.
 */

/** Mirrors kretschmann() in src/physics/fields.ts: K = 8 E_ij E^ij from the summed tidal tensors. */
export const TIDAL_GLSL = /* glsl */ `
  float tidalK(float px, float py) {
    float exx = 0.0;
    float eyy = 0.0;
    float exy = 0.0;
    float ezz = 0.0;
    for (int i = 0; i < MAXM; i++) {
      if (i >= uCount) break;
      vec4 m = uMasses[i];
      float dx = px - m.x;
      float dy = py - m.y;
      float d = sqrt(dx * dx + dy * dy);
      float r = max(d, m.w);
      float g = m.z / (r * r * r);
      float nx = d > 0.0 ? dx / d : 1.0;
      float ny = d > 0.0 ? dy / d : 0.0;
      exx += g * (1.0 - 3.0 * nx * nx);
      eyy += g * (1.0 - 3.0 * ny * ny);
      exy -= g * 3.0 * nx * ny;
      ezz += g;
    }
    return 8.0 * (exx * exx + eyy * eyy + 2.0 * exy * exy + ezz * ezz);
  }
`;

/**
 * Mirrors occlusionRadius(), deflectionPerImpact() and skyChart() in src/physics/lens.ts. Needs a
 * remainder(x) function (the α̂ lookup) and BC_FACTOR defined before it.
 */
export const LENS_GLSL = /* glsl */ `
  float occlusion(float m, float R) {
    float rs = 2.0 * m;
    return (R <= rs * 1.0001 || R < 3.0 * m) ? BC_FACTOR * m : R / sqrt(1.0 - rs / R);
  }

  float massDeflection(float b2, float m, float R, float soft) {
    if (soft > 0.0) return 4.0 * m / (b2 + soft * soft);
    if (m <= 0.0) return 0.0;
    float bc = BC_FACTOR * m;
    float b = sqrt(b2);
    float clamped = max(b, max(occlusion(m, R), bc * 1.000001));
    float x = bc / clamped;
    float alpha = -log(1.0 - x) + remainder(x);
    return alpha / clamped;
  }

  float skyChart(float t) {
    if (t < 1e-6) return 1.0;
    return 2.0 * clamp(tan(t * 0.5), -4000.0, 4000.0) / t;
  }
`;
