# albe

**albe** (for Albert Einstein) is an interactive visualiser of curved spacetime. You place masses, test particles and
light rays, and the geometry updates live while you watch. It's served at `albe.vananomad.com` (Cloudflare Workers and
Static Assets, open to anyone with the link).

It's built with Vite, React 19 and TypeScript, with three.js through @react-three/fiber and @react-three/drei, plus
Vitest and Wrangler. Everything is bundled, so nothing loads from a CDN at runtime.

## What you can do

- **An endless plane.** The sheet runs to the horizon and masses stay simulated wherever they drift. The camera follows
  the masses' centre of mass until you pan. **Frame all** (key F) brings everything back, and a prompt appears when a mass
  leaves the screen.
- **Tools** (keys 1 to 6) are View, Mass, Test particle, Light ray, Light fan and Select/move/delete. Click to place a
  mass on a circular orbit (or at rest in empty space), and drag to aim its velocity.
- **Views** (key V cycles them) are Space (Flamm embedding), Time (lapse / g_tt), Tidal (Kretschmann scalar), Waves
  (retarded quadrupole strain), Lattice (illustrative 3D warp) and Lens (the sky seen through the masses, with rings, arcs
  and double images).
- **Objects.** The Mass tool places a black hole, a neutron star, a white dwarf, eight star types from red dwarf to red
  supergiant, a rocky planet, a gas giant or a whole galaxy. When they touch, the densest wins. Compact objects pushed past
  their mass limit collapse, and stars that stray inside a compact object's tidal radius are torn apart.
- **Scenes** come in groups. *Relativity* has a single black hole, clocks, Mercury precession, binary inspiral,
  gravitational waves, a precessing binary, a lensing fan and the photon sphere. *Three bodies* has the figure eight,
  butterfly, moth, yin yang, the Lagrange triangle, the Pythagorean problem (with a chaos twin) and Trojan asteroids.
  *Stars and planets* has the inner and outer solar system, TRAPPIST-1, a star zoo, Sirius A and B, a neutron star merger
  and a star meeting a black hole. *Galaxies* has a self gravitating spiral with a live rotation curve and a dark matter
  switch, a collision with tidal tails, a tidal stream and a cluster. *Exotic* has an Alcubierre warp bubble
  (theoretical), an Ellis wormhole, Kerr frame dragging, the Penrose process and light past a spinning hole. *Sandbox* has
  an empty scene and **Surprise me**, which makes a random system.
- A hover readout shows r to the nearest mass, Φ, dτ/dt and K. A "How it works" panel gives a plain language overview,
  with a second tab for the equations and references.
- On the keyboard, Space pauses, `.` steps, G toggles GR and Newtonian, I opens About, Delete removes the selected mass
  and Esc closes panels.
- On phones, one finger places objects and two fingers orbit and zoom the camera.

## Physics (G = c = 1), exact versus approximate

| Piece | Model | Status |
|---|---|---|
| Space view | Flamm paraboloid z(r) = 2√(r_s(r − r_s)) | Exact for one nonrotating black hole, drawn to true scale at ×1. Several masses are a weak field superposition. |
| Time view | Φ = −ΣM/r, dτ/dt = √(1+2Φ) | Exact for one nonrotating black hole (static observer). Superposed otherwise. |
| Tidal view | K = 48M²/r⁶ | Exact for one nonrotating black hole. Summed otherwise. |
| Lattice | Lines pulled toward masses | Illustrative only. |
| Massive bodies | N body gravity plus 1PN Einstein-Infeld-Hoffmann terms, velocity Verlet, adaptive sub steps | Post Newtonian expansion. Each pair's correction is capped near merger. |
| Gravitational radiation | 2.5PN radiation reaction on every pair (Blanchet 2014) | Leading order. Matches the Peters (1964) rates over an orbit. |
| Mergers | Numerical relativity fits for radiated mass, spin and recoil of nonspinning binaries | Fits. Recoil direction simplified, and spin is reported but not simulated. |
| Waves view | Quadrupole formula with retarded time, then a Kerr ringdown | Quadrupole approximation. Amplitude scaled for display. |
| Stars and planets | Real mass ratios, compressed radii, exterior formulas outside and a uniform density interior inside | Display scale. Orbit corrections apply only to black holes and neutron stars, and light bends around every mass. |
| Three body scenes | Newtonian N body with published initial conditions | Newtonian. Unstable orbits lose their pattern, as they should. |
| Galaxies | Pseudo isothermal halo, exponential disk near Toomre Q ≈ 1.25, Barnes-Hut self gravity or test particle stars, Chandrasekhar friction between halos | Planar, softened and in rescaled units. The sheet draws a galaxy as a uniform sphere (schematic). |
| Lens view | Thin lens equation for many masses, and exact Schwarzschild bending for one black hole | Thin lens approximate in general. Flat invented sky, face on. |
| Warp bubble | Alcubierre (1994) metric, York time and Eulerian energy density | Exact metric. It's a theoretical geometry that needs negative energy. |
| Wormhole and Kerr exhibits | Geodesics on the Ellis and equatorial Kerr geometries | Exact for test particles, with hole mass and spin fixed. |
| Test particles | a = −ΣM r̂/r² (1 + 3L²/r²) in proper time, RK4, dt/dτ = E/(1 − 2M/r) | Orbit and timing exact for one static mass. Several masses are superposed. |
| Light | Null geodesics d²x/dλ² = −Σ3Mh²d/r⁵, dt/dλ = 1/(1 − 2M/r), RK4 | Exact for one static mass (photon sphere, capture at 3√3 M, Shapiro delay). Several masses are superposed. |

## Reference data

`reference/refs.json` records the numbers the scenes and tests rest on, each with its source. The three body orbits are
refined to about 11 digits with REBOUND's IAS15 and SciPy's DOP853, the planets come from JPL, TRAPPIST-1 comes from Agol
et al. (2021), main sequence stars come from Mamajek's table and halo rotation curves were checked against galpy. Those
libraries ran offline. Nothing from them ships in the app, and only numerical output from REBOUND (GPL) is used.

## Code layout

- `src/physics/` holds the pure, render free physics (`nbody`, `probes`, `light`, `fields`, `presets`, the object
  catalogue in `bodies`, and the star swarm and Barnes-Hut tree in `swarm`) and the tests (`physics.test.ts`,
  `universe.test.ts`).
- `src/sim/world.ts` is the live simulation state (trails, caps, merges, captures).
- `src/scene/` is the r3f scene. The sheet is one stretched mesh (`plane.ts`) that follows the camera focus and is
  displaced and coloured in GLSL, with the masses passed as a uniform array (up to 32). `shaders.ts` mirrors `fields.ts`.
- `src/ui/` and `src/App.tsx` hold the dock, scene picker, panels and keyboard handling.

## Scripts

```sh
pnpm install
pnpm run dev        # Vite dev server
pnpm run typecheck  # tsc
pnpm test           # Vitest physics tests
pnpm run check      # typecheck + test + build + JS budget
pnpm run test:e2e   # Playwright and axe at 390px and 1280px, against wrangler
pnpm run headers    # regenerate public/_headers from headers.config.ts
pnpm run build      # -> dist/
pnpm exec wrangler dev   # serve dist/ with _headers (CSP etc.) like production
pnpm run deploy     # build + wrangler deploy (owner only)
```

## Deploy

`wrangler.jsonc` sets up a static assets only Worker called `vananomad-albe`. Its custom domain is `albe.vananomad.com`,
`workers_dev` and `preview_urls` are off and observability is off. Unknown paths get the branded `public/404.html`.
Security headers are in `public/_headers`, which is generated from `headers.config.ts` on the `@vanamalix/edge`
baseline. They are a CSP of `'self'` only (without `'unsafe-eval'`, except a frame for the Shielded button), HSTS, nosniff,
`frame-ancestors` none and noindex. The site is public, with no Cloudflare Access application in front of it and no login.

## References

- Schwarzschild (1916)
- Flamm (1916) *Phys. Z.* 17, 448
- Einstein (1915) on Mercury's perihelion
- Dyson, Eddington & Davidson (1920) *Phil. Trans. R. Soc. A* 220, 291
- Peters (1964) *Phys. Rev.* 136 B1224
- Misner, Thorne & Wheeler (1973) *Gravitation* §23.8
- Chenciner & Montgomery (2000) *Ann. Math.* 152, 881
- Nichols et al. (2011) *Phys. Rev. D* 84, 124014
- Middleton & Langston (2014) *Am. J. Phys.* 82, 287
- Šuvakov & Dmitrašinović (2013) *Phys. Rev. Lett.* 110, 114301
- Barnes & Hut (1986) *Nature* 324, 446
- Toomre (1964) *ApJ* 139, 1217
- Toomre & Toomre (1972) *ApJ* 178, 623
- Chandrasekhar (1943) *ApJ* 97, 255
- Rubin, Ford & Thonnard (1980) *ApJ* 238, 471
- Rees (1988) *Nature* 333, 523

## Licence

MIT. See `LICENSE`.
