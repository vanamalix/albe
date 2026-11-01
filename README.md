# albe

**albe** (for Albert Einstein) is an interactive visualiser of curved spacetime. You place masses, test
particles and light rays, and the geometry updates live as you watch. It will be served at
`albe.vananomad.com` (Cloudflare Workers + Static Assets, behind Cloudflare Access).

Stack: Vite + React 19 + TypeScript, three.js via @react-three/fiber and @react-three/drei, Vitest,
Wrangler. Everything is bundled, so nothing loads from a CDN at runtime.

## What you can do

- **Tools** (keys 1–6): View, Mass, Test particle, Light ray, Light fan, Select/move/delete.
  Click to place a mass on a circular orbit (or at rest in empty space); drag to aim its velocity.
- **Views** (key V cycles them): Space (Flamm embedding), Time (lapse / g_tt), Tidal (Kretschmann
  scalar), Lattice (illustrative 3D warp).
- **Presets**: single black hole (photon sphere, ISCO, precessing orbit plus a Newtonian ghost);
  Sun–Mercury precession (exaggerated about 10⁶×); binary black holes with a Peters GW inspiral;
  the Chenciner–Montgomery figure-eight; a lensing fan; and an empty scene.
- A hover readout shows r to the nearest mass, Φ, dτ/dt and K. An "About the physics" panel gives
  the equations and references.
- Keyboard: Space pauses, `.` steps, G toggles GR/Newtonian, I opens About, Delete removes the
  selected mass, Esc closes panels.
- On phones: one finger places objects, two fingers orbit and zoom the camera.

## Physics (G = c = 1). Exact vs approximate

| Piece | Model | Status |
|---|---|---|
| Space view | Flamm paraboloid z(r) = 2√(r_s(r − r_s)) | Exact for one mass, drawn to true scale at ×1. Several masses are a weak-field superposition. |
| Time view | Φ = −ΣM/r, dτ/dt = √(1+2Φ) | Exact for one mass (static observer). Superposed otherwise. |
| Tidal view | K = 48M²/r⁶ | Exact for one mass. Summed otherwise. |
| Lattice | Lines pulled toward masses | Illustrative only. |
| Massive bodies | Newtonian N-body, velocity Verlet, adaptive sub-steps; merge at d < 2(m₁+m₂), conserving mass and momentum | Newtonian. No post-Newtonian terms. |
| GW inspiral | Peters (1964) circular-orbit dE/dt, applied as a drag | Crude, orbit-averaged estimate. |
| Test particles | a = −ΣM r̂/r² (1 + 3L²/r²), RK4 | Orbit *shape* is exact for one static mass (it gives u″+u = M/L² + 3Mu²), so the precession, ISCO and photon sphere are right. Timing along the orbit is Newtonian, and many masses are superposed. |
| Light | n = 1 + 2ΣM/r, d/ds(n dx/ds) = ∇n, coordinate speed c/n | Weak field. Gives 4M/b for b ≫ M. Not exact near 3M. |

## Code layout

- `src/physics/`: pure, render-free physics (`nbody`, `probes`, `light`, `fields`, `presets`) and
  `physics.test.ts`.
- `src/sim/world.ts`: the live simulation state (trails, caps, merges, captures).
- `src/scene/`: the r3f scene. The sheet is a 256×256 grid that is displaced and coloured in GLSL,
  with the masses passed as a uniform array (up to 32). `shaders.ts` mirrors `fields.ts`.
- `src/ui/`, `src/App.tsx`: the toolbar, panels and keyboard handling.

## Scripts

```sh
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc
npm test           # Vitest physics tests
npm run check      # typecheck + test + build
npm run build      # -> dist/
npx wrangler dev   # serve dist/ with _headers (CSP etc.) like production
npm run deploy     # build + wrangler deploy (owner only)
```

## Deploy

`wrangler.jsonc` sets up a static-assets-only Worker called `vananomad-albe`. Its custom domain is
`albe.vananomad.com`, `workers_dev` and `preview_urls` are off, observability is off, and unknown paths
get the branded `public/404.html`. Security headers (CSP `'self'` only, without `'unsafe-eval'`;
HSTS, nosniff, frame-ancestors none, noindex) are in `public/_headers`. Logins are handled at the
edge by Cloudflare Access, so the app itself has no auth code.

## References

Schwarzschild (1916); Flamm (1916) *Phys. Z.* 17:448; Einstein (1915) on Mercury's perihelion;
Dyson, Eddington & Davidson (1920) *Phil. Trans. R. Soc. A* 220:291; Peters (1964) *Phys. Rev.* 136
B1224; Misner, Thorne & Wheeler (1973) *Gravitation* §23.8; Chenciner & Montgomery (2000) *Ann.
Math.* 152:881; Nichols et al. (2011) *Phys. Rev. D* 84:124014; Middleton & Langston (2014) *Am. J.
Phys.* 82:287.
