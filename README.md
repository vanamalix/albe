# albe

**albe** (for Albert Einstein) is an interactive visualiser of curved spacetime. You place masses, test
particles and light rays, and the geometry updates live as you watch. It is served at
`albe.vananomad.com` (Cloudflare Workers + Static Assets, open to anyone with the link). Made for Wesley
from NYU.

Stack: Vite + React 19 + TypeScript, three.js via @react-three/fiber and @react-three/drei, Vitest,
Wrangler. Everything is bundled, so nothing loads from a CDN at runtime.

## What you can do

- **An endless plane**: the sheet runs to the horizon and masses stay simulated wherever they drift. The
  camera follows the masses' centre of mass until you pan; **Frame all** (key F) brings everything back,
  and a prompt appears when a mass leaves the screen.
- **Tools** (keys 1–6): View, Mass, Test particle, Light ray, Light fan, Select/move/delete.
  Click to place a mass on a circular orbit (or at rest in empty space); drag to aim its velocity.
- **Views** (key V cycles them): Space (Flamm embedding), Time (lapse / g_tt), Tidal (Kretschmann
  scalar), Waves (retarded quadrupole strain), Lattice (illustrative 3D warp), Lens (the sky seen through the masses: rings, arcs and double images).
- **Objects**: the Mass tool places a black hole, neutron star, white dwarf, eight star types from
  red dwarf to red supergiant, a rocky planet, a gas giant, or a whole galaxy. When they touch, the
  densest wins; compact objects pushed past their mass limit collapse, and stars that stray inside
  a compact object's tidal radius are torn apart.
- **Scenes**, in groups. *Relativity*: single black hole, clocks, gyroscope round a hole, dust ring, Mercury
  precession, binary inspiral, gravitational waves, precessing binary, lensing fan, photon sphere, black hole
  shadow, microlensing, collapse to a black hole. *Geometry*: Euclid's postulates. *Cosmology*: an expanding
  universe. *Three bodies*: figure-eight,
  butterfly, moth, yin-yang, the Lagrange triangle, the Pythagorean problem (with a chaos twin), Trojan
  asteroids. *Stars and planets*: inner and outer solar system, TRAPPIST-1, star zoo, Sirius A and B,
  neutron star merger, star meets black hole. *Galaxies*: a self-gravitating spiral with a live
  rotation curve and a dark-matter switch, a collision with tidal tails, a tidal stream, a cluster.
  *Exotic*: an Alcubierre warp bubble (theoretical), an Ellis wormhole, Kerr frame dragging, the Penrose
  process, light past a spinning hole, and two exactly balanced (extremally charged) holes. *Sandbox*: an empty scene, and **Surprise me** for a random system.
- A hover readout (a tap on phones, which stays until closed) shows r to the nearest mass, Φ, dτ/dt, K, the
  largest M/r (the post-Newtonian expansion parameter) and the 1PN g_tt cross term 4M_aM_b/(r_a r_b) that
  adding the masses leaves out. A "How it works" panel has a plain-language overview, and a second tab with
  the equations and references.
- **Depth**: the info card and the explainers switch between Words, Numbers (live values from the scene) and
  Equation (the expression and a reference). Equation is the default; the choice is remembered in
  localStorage when the browser allows it.
- **Explain** (info card, or Explain in the scene picker): notes to read while the scene runs. What you are
  seeing, why (a brief derivation at Equation depth), live numbers to watch, what is exact and approximate,
  "common picture vs what GR says" for the rubber sheet, frozen horizon, slow clocks and sucking holes, and
  primary references. Single black hole, clocks, Mercury, binary inspiral, gravitational waves and the inner
  solar system have their own; every other scene gets one built from its note and the current view.
- **Measure** (info card, where an orbit is pinned): closest approaches leave pins; drag a two-armed
  protractor on a true-angle plan view, then show the app's values (pins, the exact elliptic integral, and
  6πM/p with its (M/p)² term).
- **Why is this approximate?** chips appear above the dock only while an approximation is on screen (summed
  lens angles, removal at 2.04M, the 1PN cap, summed tides, compressed star radii), each with the neglected
  order, the source and a live error estimate at Equation depth.
- **Wave cursor**: in the Waves view, tap crests or troughs on the strain scope (or Mark newest pair); two
  marks give f, four give ḟ and the leading-order chirp mass.
- **Listen** (wave scope): the app's own strain history as sound. One unit of mass is taken as 20 M☉ (the
  Gravitational waves pair is then 60 + 24 M☉: about 24 to 196 Hz over 0.19 s, ending on the ringdown) or 5 M☉
  (4× higher and shorter). Pitch and duration are true for that mass; loudness is normalised. The AudioContext
  is created only when Listen is pressed: a plain AudioBuffer, no worklet, nothing fetched.
- **Challenges** in the Explain panel, each a reading rather than a score (the only thing stored is a
  per-browser best in localStorage, inside try/catch):
  - *Wind the light* (Photon sphere, Lensing fan): a log slider sets |b − b_c|/b_c from 10⁻¹ to 10⁻¹³ on
    either side. The turns round the hole are counted with the app's RK4 null-geodesic step at 0.4% of r and
    again at 0.8%; their difference is the error estimate, and past 0.01 turn the count is withheld (from
    about 10⁻⁹). Beside it: the exact sweep (π + α̂ by the elliptic integral, or a quadrature to 2.04M on
    capture), Bozza's strong-deflection limit, and the turns gained per factor e^{2π} ≈ 535 (exactly 1 in the
    limit).
  - *Tightest stable orbit* (Single black hole): radius and speed, then a fixed inward nudge of 0.01c; does it
    survive five turns? Shown beside the ISCO and the effective potential's exact verdict. For a circular
    start the edge is 6.388M, a margin beyond 6M that goes as the nudge to the 2/3 power.
  - *Hit a merger time* (Binary inspiral): pick a target and a separation, run the pair off screen with the
    scene's own law, and compare with Peters' T = (5/256)a⁴/(m₁m₂M), broken down before and after the 1PN cap
    (at 35.8: 1882 against 2005).
- **Euclid's postulates** (Geometry): five switches, one per postulate. Switching one off moves to a geometry
  where it fails (the sphere for 1 and 3, the Flamm sheet cut at r = 2M for 2, the taxicab plane for 4, the
  hyperbolic plane or the sphere for 5); the others follow. Drag a geodesic triangle in a conformal chart (angles
  on the page are true) and read its angle sum against ∫K dA (Gauss-Bonnet, including Σα − 3π for a triangle round
  a throat), a circle's circumference against 2πs, and perpendiculars meeting or diverging. The same runs on the
  Flamm slice of a black hole, the Ellis wormhole and the Alcubierre bubble's slice (flat: exactly 180°). The
  explainer goes from Euclid to Gauss, Riemann and Einstein and says what changes in Lorentzian spacetime.
- **Two balanced holes** (Exotic): Majumdar-Papapetrou. With Q = M for each hole, U = 1 + ΣMᵢ/|x − xᵢ| is exact at
  any separation, so this is the one multi-hole scene where adding fields is not an approximation, and it says
  why. A fan of rays in the plane of the holes, and exit angle against b that zooms ×6 on a tap, showing the
  Cantor-set edges of chaotic scattering; each ray runs at two step sizes and disagreements are flagged.
  Labelled not astrophysical.
- **Black hole shadow** (Relativity): Bardeen's exact Kerr critical curve for a spin and inclination you set, with
  the photon-ring ladder: each subring about e^−γ narrower, γ the Lyapunov exponent per half-orbit (Johnson et al.
  2020, π without spin), shown as a range round the curve. The curve times θ_g is set beside the EHT rings of M87*
  (42 ± 3 μas) and Sgr A* (51.8 ± 2.3 μas). Labelled a contour, not a ray-traced image.
- **Microlensing light curve** (Relativity): drag the source's track across a point lens and the light curve,
  Paczyński's exact A(u), redraws. A binary lens uses the exact fifth-order image polynomial for the curve and
  caustics, over a magnification map made by inverse ray shooting through the app's own lens map (2000² rays, 150²
  pixels, its resolution and counting noise stated). A one-click planet, q = 0.001.
- **Collapse to a black hole** (Relativity): Oppenheimer-Snyder dust, exact. The ball shrinks by areal radius with
  its event horizon born at the centre at η = π − 3χ₀, before the surface crosses 2M at π − 2χ₀, and the apparent
  horizon χ = (π − η)/2; on the Clocks scene's Penrose diagram, interior glued to the Kruskal exterior along the
  surface. Says what pressure and spin would change.
- **Expanding universe** (Cosmology): FRW with Ω_m, Ω_Λ, Ω_r, Ω_k (setting Ω_Λ) and H₀, presets from Planck 2018
  to de Sitter. a(t), the Davis-Lineweaver spacetime diagram in proper or comoving distance (light cone, particle
  and event horizons, Hubble sphere), and a galaxy at a chosen z that recedes faster than light today and when its
  light left, yet is seen, with the numbers. The 3D view switches the grid between comoving and proper. Detects a
  bounce (no big bang). Exact when homogeneous; it says why it cannot be mixed with the other scenes' masses.
- **More in the Explain panel**: *Gyroscope round a hole* (its own scene): an arrow carried round the Flamm slice,
  2π(1 − √(1 − 2M/r)) per loop, against a gyroscope, 2π(1 − √(1 − 3M/r)), with Gravity Probe B's numbers.
  *Through the horizon* (Clocks): a Penrose diagram with the falling clock continued past where albe removes it to
  r = 0, and the white hole tagged as not formed by collapse. *Stretch and squeeze* (Dust ring scene): the ring's
  measured stretch against linear geodesic deviation, with the undrawn third axis as a computed bar.
  *Effective potential and epicycles* (Single black hole): V²(r) with an L slider, and the epicyclic advance
  2π[(1 − 6M/r)^(−½) − 1] beside the exact integral and the pins.
- **Not our universe** (Explain panel, any scene with test particles round a hole), headed as such and flagged
  by a chip while active; every scene load puts our laws back. A force-law exponent n for Newtonian test
  particles (F ∝ 1/rⁿ, equal to Newton's at 20M) with the apsis angle 180°/√(3 − n), the exact angle for the
  pinned orbit and Bertrand's theorem; and a scale s = (c/c′)² on the test particles' relativistic term, which
  is exactly Schwarzschild for M′ = sM (ISCO at 6sM, advance by the same elliptic integral). Masses, light,
  clocks and the sheet keep our laws.
- Keyboard: Space pauses, `.` steps, G toggles GR/Newtonian, I opens About, Delete removes the
  selected mass, Esc closes panels.
- On phones: one finger places objects, two fingers orbit and zoom the camera.

## Physics (G = c = 1). Exact vs approximate

| Piece | Model | Status |
|---|---|---|
| Space view | Flamm paraboloid z(r) = 2√(r_s(r − r_s)) | Exact for one non-rotating black hole, drawn to true scale at ×1. Several masses are a weak-field superposition. |
| Time view | Φ = −ΣM/r, dτ/dt = √(1+2Φ) | Exact for one non-rotating black hole (static observer). Superposed otherwise; the clamp at 1+2Φ = 0 is not a common horizon. |
| Tidal view | K = 8 E_ij E^ij with the tidal tensor summed over masses (48M²/r⁶ for one) | Exact for one non-rotating black hole. Tidal tensors superposed otherwise, so tides interfere. |
| Lattice | Lines pulled toward masses | Illustrative only. |
| Massive bodies | N-body gravity plus 1PN Einstein-Infeld-Hoffmann terms, velocity Verlet, adaptive sub-steps | Post-Newtonian expansion, harmonic r. Each pair's correction is capped at half its Newtonian pull: the cap fires from r ≈ 7.2M, so capped binaries have no ISCO and no plunge. |
| Gravitational radiation | 2.5PN radiation reaction on every pair (Blanchet 2014) | Leading order. Matches the Peters (1964) rates over an orbit. Pairs radiate independently, so quadrupole cross terms are dropped for three or more bodies. |
| Mergers | Numerical-relativity fits for radiated mass, spin and recoil of non-spinning binaries | Fits. Recoil direction simplified; spin is reported but not simulated. |
| Waves view | Quadrupole formula with retarded time, then a Kerr ringdown | Quadrupole approximation. Amplitude scaled for display. |
| Stars and planets | Real mass ratios, compressed radii; exterior formulas outside, uniform-density interior inside | Display scale. Orbit corrections apply only to black holes and neutron stars; light bends around every mass. |
| Three-body scenes | Newtonian N-body with published initial conditions | Newtonian; unstable orbits lose their pattern, as they should. |
| Galaxies | Pseudo-isothermal halo, exponential disk near Toomre Q ≈ 1.25, Barnes-Hut self-gravity or test-particle stars, Chandrasekhar friction between halos | Planar, softened and in rescaled units. The sheet draws a galaxy as a uniform sphere (schematic). |
| Lens view | Exact Schwarzschild bending of each mass, summed; a galaxy uses the softened law 4Mb/(b²+a²) | Exact for one black hole; several masses add their exact angles, leaving nonlinear terms of order M/d. Stars are at compressed radius. Flat invented sky, face-on. |
| Warp bubble | Alcubierre (1994) metric, York time and Eulerian energy density | Exact metric; a theoretical geometry needing negative energy. |
| Wormhole and Kerr exhibits | Geodesics on the Ellis and equatorial Kerr geometries | Exact for test particles; hole mass and spin fixed. |
| Euclid exhibit | Geodesics of e^{2σ}(dx² + dy²) by RK4 with two-point shooting; ∫K dA by quadrature of the closed-form K | Exact geometries (plane, sphere, Poincaré disk, Flamm, Ellis, Alcubierre slice), numerical to 5+ digits against spherical and hyperbolic trigonometry and Gauss-Bonnet. Spatial slices only. |
| Balanced holes | Majumdar-Papapetrou metric; rays as geodesics of the optical metric U⁴dx² in the plane of the holes | Exact spacetime (extremal charge); rays by RK4 at two step sizes; start and end 200 M_total out (about 1° of far bending left out). |
| Gyroscope, Kruskal, dust ring, epicycles | Closed forms (slice transport, geodetic precession, Kruskal U, V, linear deviation, V²) beside the scene's own particles | Exact for one hole. The dust ring's linear law holds to 2% down to 8M; the out-of-plane axis is computed, not simulated. |
| Black hole shadow | Bardeen critical curve; Lyapunov exponent by Johnson et al.'s closed form | Exact contour for any spin and inclination; not an image (no emission model, no ray tracing). Ladder ratio e^−γ is the large-n limit. |
| Microlensing | Point lens A(u); binary images from the fifth-order polynomial; caustics from the critical quartic; map by inverse ray shooting | Exact thin-lens, weak-field (next term of order M/b). Point source, static lenses. The map is limited by 0.02 θ_E pixels and ~1/√(nA) noise. |
| Expanding universe | Friedmann equation by quadrature (past, a = x²) and RK4 on ä (future) | Exact FRW; ages match closed forms to 10⁻⁸. Massless neutrinos. Not combinable with local masses. |
| Collapse | Oppenheimer-Snyder closed forms; interior glued to Kruskal along the surface | Exact for pressureless uniform dust. Part of the interior chart is a drawing choice. |
| Test particles | a = −ΣM r̂/r² (1 + 3L²/r²) in proper time, RK4; dt/dτ = E/(1 − 2M/r) | Orbit and timing exact for one static mass, in Schwarzschild r (bodies are harmonic r, offset M). Several masses are superposed, and particle clocks near a star are kinematic only. |
| Light | Null geodesics d²x/dλ² = −Σ3Mh²d/r⁵, dt/dλ = 1/(1 − 2M/r), RK4; a galaxy deflects by 4Mb/(b²+a²), the same law as the Lens view | Exact for one static mass (photon sphere, capture at 3√3 M, Shapiro delay). Several masses are superposed. |

## Reference data

`reference/refs.json` records the numbers the scenes and tests rest on, each with its source: three-body orbits
refined to about 11 digits with REBOUND's IAS15 and SciPy's DOP853, the planets from JPL, TRAPPIST-1 from Agol et al.
(2021), main-sequence stars from Mamajek's table, and halo rotation curves checked against galpy. Those libraries ran
offline. Nothing from them ships in the app, and only numerical output from REBOUND (GPL) is used.

## Code layout

- `src/physics/`: pure, render-free physics (`nbody`, `probes`, `light`, `fields`, `presets`, the object
  catalogue in `bodies`, the star swarm and Barnes-Hut tree in `swarm`) and the tests
  (`physics.test.ts`, `universe.test.ts`).
- `src/sim/world.ts`: the live simulation state (trails, caps, merges, captures).
- `src/scene/`: the r3f scene. The sheet is one stretched mesh (`plane.ts`) that follows the camera focus and is displaced and
  coloured in GLSL, with the masses passed as a uniform array (up to 32). `shaders.ts` mirrors `fields.ts`.
- `src/physics/measure.ts` (pins and the closed forms they are checked against), `chirp.ts` (the wave cursor's
  maths), `approx.ts` (the chips), each with tests.
- `src/explain/`: the explainers (lazy-loaded, with tests that pin every figure they show).
- `src/physics/conformal.ts` (geodesics in a conformal chart) and `euclid.ts`, `majumdar.ts`, `gyro.ts`,
  `kruskal.ts`, `dust.ts`, `potential.ts`, tested in `euclid.test.ts`, `majumdar.test.ts` and `classics.test.ts`;
  `shadow.ts`, `microlens.ts`, `cosmology.ts` and `collapse.ts`, tested in `cosmos.test.ts`, with their panels in
  `src/ui/exhibits/` and 3D views in `src/scene/DeepExhibits.tsx`.
  The geometry exhibits' controls are in `src/ui/exhibits/`, their 3D views `src/scene/EuclidExhibit.tsx` and
  `BalancedExhibit.tsx`, all lazy.
- `src/physics/winding.ts`, `orbitEdge.ts`, `whatif.ts`, `src/sim/mergerRun.ts` and `chirpSound.ts`: the
  challenges, the "not our universe" laws and the sound, tested in `play.test.ts`. Their panels are in
  `src/ui/play/`, each its own lazy chunk.
- `src/ui/`, `src/App.tsx`: the dock, scene picker, panels and keyboard handling. `ExplainPanel`, `MeasurePanel`,
  `Chips`, `WaveScope`, How it works (`About`), the exhibit controls, the exhibits and the warp layer load on
  demand, outside the initial JS budget (368.7 of 400 KB gzipped).

## Scripts

```sh
npm install
npm run dev        # Vite dev server
npm run typecheck  # tsc
npm test           # Vitest physics tests
npm run check      # typecheck + test + build + JS budget
npm run test:e2e   # Playwright and axe at 390px and 1280px, against wrangler
npm run headers    # regenerate public/_headers from headers.config.ts
npm run build      # -> dist/
npx wrangler dev   # serve dist/ with _headers (CSP etc.) like production
npm run deploy     # build + wrangler deploy (owner only)
```

## Deploy

`wrangler.jsonc` sets up a static-assets-only Worker called `vananomad-albe`. Its custom domain is
`albe.vananomad.com`, `workers_dev` and `preview_urls` are off, observability is off, and unknown paths
get the branded `public/404.html`. Security headers (CSP `'self'` only, without `'unsafe-eval'`, except a frame for the Shielded button;
HSTS, nosniff, frame-ancestors none, noindex) are in `public/_headers`, which is generated from
`headers.config.ts` on the `@vanamalix/edge` baseline. The site is public: there is no
Cloudflare Access application in front of it, and no login.

## References

Schwarzschild (1916); Flamm (1916) *Phys. Z.* 17:448; Einstein (1915) on Mercury's perihelion;
Dyson, Eddington & Davidson (1920) *Phil. Trans. R. Soc. A* 220:291; Peters (1964) *Phys. Rev.* 136
B1224; Misner, Thorne & Wheeler (1973) *Gravitation* §23.8; Chenciner & Montgomery (2000) *Ann.
Math.* 152:881; Nichols et al. (2011) *Phys. Rev. D* 84:124014; Middleton & Langston (2014) *Am. J.
Phys.* 82:287; Šuvakov & Dmitrašinović (2013) *Phys. Rev. Lett.* 110:114301; Barnes & Hut (1986)
*Nature* 324:446; Toomre (1964) *ApJ* 139:1217; Toomre & Toomre (1972) *ApJ* 178:623; Chandrasekhar
(1943) *ApJ* 97:255; Rubin, Ford & Thonnard (1980) *ApJ* 238:471; Rees (1988) *Nature* 333:523; Gauss (1827);
Riemann (1868); Hilbert (1901) *Trans. AMS* 2:87; Majumdar (1947) *Phys. Rev.* 72:390; Papapetrou (1947) *Proc.
R. Irish Acad. A* 51:191; Hartle & Hawking (1972) *Commun. Math. Phys.* 26:87; Shipley & Dolan (2016) *Class. Quantum
Grav.* 33:175001; de Sitter (1916) *MNRAS* 77:155; Everitt et al. (2011) *Phys. Rev. Lett.* 106:221101; Kruskal (1960)
*Phys. Rev.* 119:1743; Pirani (1956) *Acta Phys. Pol.* 15:389; Bardeen, Press & Teukolsky (1972) *ApJ* 178:347;
Bardeen (1973) in *Black Holes* (Les Houches); Johnson et al. (2020) *Sci. Adv.* 6:eaaz1310; Gralla & Lupsasca (2020)
*Phys. Rev. D* 101:044031; EHT Collaboration (2019) *ApJL* 875:L1, L6 and (2022) *ApJL* 930:L12; Paczyński (1986)
*ApJ* 304:1; Mao & Paczyński (1991) *ApJL* 374:L37; Schneider, Ehlers & Falco (1992) *Gravitational Lenses*; Davis &
Lineweaver (2004) *PASA* 21:97; Planck Collaboration (2020) *A&A* 641:A6; Hogg (1999) astro-ph/9905116; Oppenheimer
& Snyder (1939) *Phys. Rev.* 56:455; Penrose (1965) *Phys. Rev. Lett.* 14:57; Christodoulou (1984) *Commun. Math.
Phys.* 93:171.

## Licence

MIT. See `LICENSE`.
