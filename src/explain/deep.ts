/** Explainers for the shadow, microlensing, expanding-universe and collapse exhibits. Numbers come from the physics modules. */
import { radiiAt, star, tauOf, etaAtTau } from '../physics/collapse';
import { ageAt, conformalAt, hubbleTimeGyr, superluminalRedshift, type Cosmos } from '../physics/cosmology';
import { closestApproach, pointMagnification } from '../physics/microlens';
import { criticalCurve, shadowSize } from '../physics/shadow';
import { exhibitStore } from '../state/exhibit';
import type { Explainer } from './content';

const ex = () => exhibitStore.get();
const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : '∞');
const shadowNow = () => {
  const s = ex();
  return shadowSize(criticalCurve(s.shSpin, s.shIncl * (Math.PI / 180), 160));
};
const cosmos = (): Cosmos => ({ H0: ex().H0, om: ex().om, ol: ex().ol, or: ex().or });

export const shadowExplainer: Explainer = {
  title: 'Black hole shadow',
  seeing: 'The gold curve, on an upright screen, is the edge of the shadow of a spinning hole as a distant telescope would see it, for the spin and viewing angle set in the controls. The dashed grey circle is a hole with no spin, 3√3 M in radius. The fainter curves outside stand for the photon subrings.',
  why: {
    words: 'Near a black hole light can travel in circles. Rays that arrive close to one of those circular paths wind round several times before leaving, so a distant camera sees them pile up along one closed curve. Spin drags the paths: on the side turning toward you they can get closer, so the curve is flattened there and shifted the other way.',
    numbers: () => {
      const z = shadowSize(criticalCurve(0.998, Math.PI / 2, 160));
      const s = shadowNow();
      return `With no spin the curve is a circle 10.39M across, whatever the angle. At a = 0.998 seen edge-on it is ${f2(z.width)}M wide and shifted ${f2(z.shift)}M. With the current settings: ${f2(s.width)} × ${f2(s.height)} M. Each subring is narrower than the last by e^−γ: γ = π (4.3%) without spin; here γ runs from ${f2(s.gammaMin)} to ${f2(s.gammaMax)}.`;
    },
    equation:
      'Null geodesics in Kerr separate (Carter): with ξ = L/E and η = Q/E², (Σ ṙ)² = R(r) = (r² + a² − aξ)² − Δ(η + (ξ − a)²). Spherical orbits need R = R′ = 0, which gives ξ(r) and η(r). A ray reaching an observer at inclination i arrives at α = −ξ/sin i, β = ±√Θ(i). Near the orbit, δr grows as e^{√(R″/2) λ} in Mino time; one half-orbit in θ takes G_θ = 2K(u₊/u₋)/(a√−u₋), so each half-orbit multiplies the offset by e^γ, γ = √(R″/2) G_θ, and the n-th image is e^{−γ} closer to the curve and fainter by the same factor.',
    eq: ['ξ = −(r³ − 3r² + a²r + a²)/(a(r − 1)),  η = r³(4a² − r(r − 3)²)/(a²(r − 1)²)', 'α = −ξ/sin i,  β = ±√(η + a²cos²i − ξ²cot²i)', 'γ = 4r√χ K(u₊/u₋)/(a√−u₋),  χ = 1 − Δ/(r(r − 1)²)'],
  },
  watch: [
    { label: 'Width × height', value: () => `${f2(shadowNow().width)} × ${f2(shadowNow().height)} M` },
    { label: 'Lyapunov γ round the curve', value: () => `${f2(shadowNow().gammaMin)} … ${f2(shadowNow().gammaMax)}` },
  ],
  exact: ['The critical curve and γ for a Kerr hole seen from far away, at any spin and inclination: closed forms, checked against kerr.ts and against direct integration.'],
  approx: [
    'It is a contour, not an image. What a telescope records also depends on where the gas around the hole glows and how it moves; making that picture means tracing rays through Kerr pixel by pixel through a model of the gas, which albe does not do.',
    'The ladder ratio e^−γ is the large-n limit; the first subring only roughly follows it, and its distance from the curve depends on the gas.',
    'The EHT comparison multiplies the curve by each source’s θ_g = GM/(Dc²), whose uncertainty (10% for M87*, more for Sgr A*) is larger than the spin’s effect on the size.',
  ],
  myths: [
    {
      picture: 'The black disc in the EHT image is the event horizon.',
      gr: 'The dark region is set by the photon orbits, not the horizon: with no spin it is 3√3 M ≈ 5.2M in radius as seen from far away, more than twice the horizon’s 2M. Lensing magnifies the horizon too, and what looks dark also depends on where the gas emits.',
    },
  ],
  reading: [
    'J. M. Bardeen (1973), “Timelike and null geodesics in the Kerr metric”, in Black Holes (Les Houches 1972), eds. C. DeWitt & B. S. DeWitt, Gordon and Breach.',
    'M. D. Johnson et al. (2020), “Universal interferometric signatures of a black hole’s photon ring”, Sci. Adv. 6, eaaz1310.',
    'S. E. Gralla & A. Lupsasca (2020), “Lensing by Kerr black holes”, Phys. Rev. D 101, 044031.',
    'Event Horizon Telescope Collaboration (2019), “First M87 Event Horizon Telescope Results. I and VI”, ApJL 875, L1 and L6.',
    'Event Horizon Telescope Collaboration (2022), “First Sagittarius A* Event Horizon Telescope Results. I”, ApJL 930, L12.',
  ],
};

export const microlensExplainer: Explainer = {
  title: 'Microlensing light curve',
  seeing: 'The lens plane, seen face on: the lens (grey), its Einstein ring (dashed), the source star’s track and the star itself (white), and the images the lens makes of it (gold, sized by magnification). With a binary lens the caustics (red) and critical curves (blue) appear. The panel plots the star’s brightness as it moves.',
  why: {
    words: 'A star or planet passing almost in front of a distant star bends its light into two images, one each side of the lens. They are far too close together to tell apart, so a telescope sees one star that brightens and fades again, symmetrically, over days to weeks. A second lens, such as a planet, adds caustics: lines where the brightness of a point star would be infinite, crossed as sharp spikes.',
    numbers: () => {
      const s = ex();
      const { u0 } = closestApproach({ x: s.mlX, y: s.mlY, angle: s.mlAngle });
      return `At u = 1 Einstein radius the star is ${pointMagnification(1).toFixed(3)}× brighter; at u = 0.1, ${pointMagnification(0.1).toFixed(2)}×. This track passes u₀ = ${u0.toFixed(3)}, so a single lens peaks at ${pointMagnification(u0).toFixed(3)}×. A planet of q = 0.001 disturbs the curve for about √q t_E, roughly a day, within an event lasting about a month.`;
    },
    equation:
      'Thin lens, weak field: β = θ − α(θ), α = θ_E²/θ for a point mass, θ_E² = 4GM D_LS/(c² D_L D_S). Magnification is the inverse Jacobian of the map, μ = |det ∂β/∂θ|⁻¹; for the point lens the two images sum to A(u) = (u² + 2)/(u√(u² + 4)). For several point masses in complex form ζ = z − Σ mᵢ/(z̄ − zᵢ), det J = 1 − |Σ mᵢ/(z̄ − zᵢ)²|², and for two masses the images are roots of a fifth-order polynomial.',
    eq: ['A(u) = (u² + 2) / (u √(u² + 4)),  u(t) = √(u₀² + ((t − t₀)/t_E)²)', 'ζ = z − Σ mᵢ/(z̄ − zᵢ),  μ = 1/|1 − |Σ mᵢ/(z̄ − zᵢ)²|²|'],
  },
  watch: [
    { label: 'Closest approach u₀', value: () => `${closestApproach({ x: ex().mlX, y: ex().mlY, angle: ex().mlAngle }).u0.toFixed(3)} θ_E` },
    { label: 'Lens', value: () => (ex().mlBinary ? `binary, q = ${ex().mlQ.toPrecision(2)}, d = ${ex().mlD.toFixed(2)} θ_E` : 'point') },
  ],
  exact: ['The point-lens curve, the binary’s images, light curve and caustics: exact solutions of the thin-lens equation, whose neglected terms are of order M/b, parts in 10⁹ for stars.'],
  approx: [
    'The source is a point; a real star’s disc rounds off the caustic spikes.',
    'The shaded magnification map is made by inverse ray shooting through albe’s own lens map: finite pixels cap the infinite peaks, and counting noise is about 1/√(nA). It is a picture; the light curve does not use it.',
    'The lenses do not orbit and the Earth does not move (no parallax).',
  ],
  myths: [
    {
      picture: 'Lensing makes the star look bigger, like a magnifying glass.',
      gr: 'For a star in our galaxy the images are about a milliarcsecond apart, far below what a telescope resolves. All that shows is the total brightness. Surface brightness is conserved by lensing, so the extra light comes from the images covering more solid angle.',
    },
  ],
  reading: [
    'B. Paczyński (1986), “Gravitational microlensing by the galactic halo”, ApJ 304, 1.',
    'S. Mao & B. Paczyński (1991), “Gravitational microlensing by double stars and planetary systems”, ApJL 374, L37.',
    'P. Schneider, J. Ehlers & E. E. Falco (1992), Gravitational Lenses, Springer (the binary lens, caustics and inverse ray shooting).',
  ],
};

export const cosmosExplainer: Explainer = {
  title: 'Expanding universe',
  seeing: 'A grid of galaxies seen from ours (blue, centre). Gold ring: the particle horizon, the farthest anything we can see has got to; red dashed: the event horizon, beyond which light sent now never reaches us; blue dashed: the Hubble sphere, where the recession speed is c. The red dot is a galaxy at the chosen redshift, and the gold dot its light on the way to us. Switch the panel to comoving distance and the grid stops expanding.',
  why: {
    words: 'On large scales the universe is the same everywhere, and its expansion is the growth of the distances between galaxies, not galaxies flying through space. Far enough away the distance grows faster than light. Light from such a galaxy at first loses ground, but the rate of growth per unit distance falls as the universe ages, the region where recession is slower than light catches up with the light, and it then reaches us.',
    numbers: () => {
      const p = cosmos();
      const tH = hubbleTimeGyr(p.H0);
      return `With the current values: age ${f2(ageAt(p, 1) * tH)} Gyr, particle horizon ${f2(conformalAt(p, 1) * tH)} Gly, and galaxies beyond z = ${f2(superluminalRedshift(p))} receding faster than light today. Davis and Lineweaver found z = 1.46 for Ω_m = 0.3, Ω_Λ = 0.7.`;
    },
    equation:
      'The FRW metric ds² = −c²dt² + a²(t)[dχ² + S_k(χ)²dΩ²] with dust, radiation, curvature and Λ gives the Friedmann equation H² = H₀²E²(a). Proper distance D = aχ gives Ḋ = HD exactly. A radial photon has dχ/dt = −c/a, so its proper distance obeys Ḋ = HD − c: it recedes while D > c/H, and arrives if the Hubble sphere overtakes it, which happens when the expansion decelerates or, with Λ, if it was emitted inside the event horizon.',
    eq: ['H² = H₀² (Ω_r a⁻⁴ + Ω_m a⁻³ + Ω_k a⁻² + Ω_Λ)', 'D = aχ,  Ḋ = HD,  photon: Ḋ = HD − c', 'particle: χ_p = ∫₀ᵗ c dt′/a,  event: χ_e = ∫ₜ^∞ c dt′/a'],
  },
  watch: [
    { label: 'Ω_m, Ω_Λ, Ω_k', value: () => `${ex().om.toFixed(3)}, ${ex().ol.toFixed(3)}, ${(Math.abs(1 - ex().om - ex().ol - ex().or) < 5e-4 ? 0 : 1 - ex().om - ex().ol - ex().or).toFixed(3)}` },
    { label: 'Time shown', value: () => `${ex().frwT.toFixed(2)} Gyr` },
  ],
  exact: ['Every curve, for an exactly homogeneous universe. Tests: Einstein-de Sitter, de Sitter, radiation, open and flat ΛCDM ages against their closed forms, the closed universe’s crunch, and Davis and Lineweaver’s z = 1.46.'],
  approx: [
    'It cannot be combined with albe’s other scenes. FRW is a solution only when the density is the same everywhere; place a star or a hole in it and the metric is no longer FRW. A galaxy or the solar system does not expand with the grid. Exact joins exist (Einstein-Straus: a vacuum ball cut out and matched; McVittie for a mass in an expanding background), but they are different solutions.',
    'Radiation from the CMB temperature with three massless neutrinos; real neutrinos have small masses.',
  ],
  myths: [
    {
      picture: 'Nothing can move away from us faster than light, so we cannot see galaxies receding faster than light.',
      gr: 'Special relativity limits motion through space relative to light passing by. The recession speed Ḋ = HD is the rate at which proper distance grows, which has no such limit. Galaxies at z ≈ 2 recede faster than light today, and receded faster than light when they emitted the light we now see.',
    },
  ],
  reading: [
    'T. M. Davis & C. H. Lineweaver (2004), “Expanding confusion: common misconceptions of cosmological horizons and the superluminal expansion of the universe”, PASA 21, 97.',
    'Planck Collaboration (2020), “Planck 2018 results. VI. Cosmological parameters”, A&A 641, A6.',
    'D. W. Hogg (1999), “Distance measures in cosmology”, arXiv:astro-ph/9905116.',
    'A. Einstein & E. G. Straus (1945), “The influence of the expansion of space on the gravitation fields surrounding the individual stars”, Rev. Mod. Phys. 17, 120.',
    'S. Weinberg (2008), Cosmology, Oxford University Press, ch. 1.',
  ],
};

const collapseNow = () => {
  const s = star(1, ex().osR0);
  const eta = etaAtTau(s, ex().osTau * tauOf(s, Math.PI));
  return { s, r: radiiAt(s, eta) };
};

export const collapseExplainer: Explainer = {
  title: 'Collapse to a black hole',
  seeing: 'The collapsing ball seen from above, drawn by areal radius (circumference over 2π): the surface (white), shells of dust inside it (grey), r = 2M (dashed gold), the event horizon (gold) and the apparent horizon (dashed red). The panel puts the same collapse on the Penrose diagram from the Clocks scene.',
  why: {
    words: 'Whether light can escape depends on the whole future, so the event horizon is defined by the future: its edge is the last light from the centre that will ever get out. For a collapsing star that light must leave the centre while the surface is still well outside 2M, so the horizon is born at the centre and grows out to meet the surface just as the surface crosses 2M. The apparent horizon, where light is trapped right now, appears only at that moment.',
    numbers: () => {
      const s = star(1, ex().osR0);
      return `From rest at ${ex().osR0.toFixed(1)}M: the event horizon appears at the centre at τ = ${f2(tauOf(s, s.etaForm))}M, the surface crosses 2M at τ = ${f2(tauOf(s, s.etaCross))}M, and all the dust reaches r = 0 together at τ = ${f2(tauOf(s, Math.PI))}M of its own time. For the Sun’s mass, M is 4.9 μs.`;
    },
    equation:
      'With p = 0 a uniform ball’s interior is a closed dust FRW universe: a = (a_m/2)(1 + cos η), τ = (a_m/2)(η + sin η), a_m = √(R₀³/2M), and the surface at χ₀ (sin²χ₀ = 2M/R₀) obeys the Schwarzschild free-fall cycloid, as Birkhoff’s theorem requires of the outside. Radial light moves at dχ = ±dη. The surface reaches r = 2M at η = π − 2χ₀; the outgoing ray that gets there left the centre at η = π − 3χ₀. The outgoing expansion ∝ a′ sin χ + a cos χ vanishes on χ = (π − η)/2, which is r = 2m(χ).',
    eq: ['a(η) = (a_m/2)(1 + cos η),  τ = (a_m/2)(η + sin η),  sin²χ₀ = 2M/R₀', 'event horizon from η = π − 3χ₀;  surface at 2M at η = π − 2χ₀', 'apparent horizon: χ = (π − η)/2'],
  },
  watch: [
    { label: 'Surface r', value: () => `${collapseNow().r.surface.toFixed(3)} M` },
    { label: 'Event horizon r', value: () => (collapseNow().r.eh !== null ? `${collapseNow().r.eh!.toFixed(3)} M` : 'not yet formed') },
  ],
  exact: ['Oppenheimer and Snyder’s solution, inside and outside, for a uniform ball of pressureless dust starting at rest. Tests check the cycloid against kruskal.ts, the event horizon by integrating light from the centre, the apparent horizon as zero expansion, and the mass function from the metric.'],
  approx: [
    'Inside the star the Penrose drawing is a choice of chart; near the top left, where light from the centre meets r = 0 before reaching the surface, it is extended by hand.',
    'Pressure: real stars are held up until their cores exceed the maximum neutron-star mass, and the collapse that follows has shocks, bounce and outflow. Once a trapped surface forms, Penrose’s 1965 theorem still predicts a singularity; that a horizon then hides it is the unproved cosmic censorship conjecture.',
    'Spin: the outside settles to Kerr, but no exact collapse with spin is known. Uneven dust (Lemaître-Tolman-Bondi) can form a singularity visible from outside, briefly, before the horizon covers it.',
  ],
  myths: [
    {
      picture: 'A black hole forms when the star’s surface falls through its Schwarzschild radius.',
      gr: 'The event horizon exists before that, growing from the centre: inside the star it is the last outgoing light ray that escapes. What forms when the surface passes 2M is the apparent horizon, the first trapped light. From far away neither is ever seen; the surface only dims and reddens.',
    },
  ],
  reading: [
    'J. R. Oppenheimer & H. Snyder (1939), “On continued gravitational contraction”, Phys. Rev. 56, 455.',
    'C. W. Misner, K. S. Thorne & J. A. Wheeler (1973), Gravitation, W. H. Freeman, ch. 32.',
    'R. Penrose (1965), “Gravitational collapse and space-time singularities”, Phys. Rev. Lett. 14, 57.',
    'D. Christodoulou (1984), “Violation of cosmic censorship in the gravitational collapse of a dust cloud”, Commun. Math. Phys. 93, 171.',
  ],
};
