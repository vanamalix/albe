import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { WARP_CAVEATS, WARP_REFERENCES } from '../physics/warp';
import { store } from '../state/store';
import { IconClose } from './icons';
import { SiteFoot } from './SiteFoot';

function Overview() {
  return (
    <>
      <p className="credit-line">Made for Wesley from NYU.</p>
      <p className="lead">
        albe is a playground for Einstein’s general relativity. Drop black holes on a sheet, fire light past them, and watch how
        gravity bends space, slows time and sends out waves.
      </p>

      <h3>What you’re looking at</h3>
      <p>
        In general relativity, mass curves spacetime and everything moves along the straightest path that curved spacetime allows.
        The real thing is four-dimensional, so albe draws a two-dimensional slice of it as a sheet. Each view below paints a
        different property of that same slice.
      </p>
      <ul className="plain">
        <li><b>Space</b> shows how much distance is stretched near a mass: the true shape of the geometry around a black hole.</li>
        <li><b>Time</b> shows how slowly clocks tick. This, more than bent space, is what makes things fall.</li>
        <li><b>Tidal</b> shows where gravity would stretch and squeeze you hardest.</li>
        <li><b>Waves</b> shows ripples in spacetime leaving orbiting masses at the speed of light.</li>
        <li><b>Lattice</b> is a simple 3D grid pulled toward each mass, for intuition only.</li>
        <li><b>Lens</b> shows the sky behind the masses, bent by their gravity: rings, arcs and double images, seen from straight above.</li>
      </ul>

      <h3>Things to try</h3>
      <ul className="plain">
        <li>Open <b>Scenes</b> and pick <b>Gravitational waves</b>, then watch the orbit shrink until the two holes merge.</li>
        <li>Pick <b>Black hole clocks</b> and compare how much time each particle has lived through.</li>
        <li>Choose the <b>Mass</b> tool and click anywhere. Drag as you click to throw it.</li>
        <li>Choose the <b>Light fan</b> tool and aim it just beside a black hole.</li>
        <li>Open <b>Spiral galaxy</b> and watch arms form, then switch off the <b>dark matter halo</b>.</li>
        <li>Open <b>Pythagorean problem</b>: the blue twin starts a hair away and ends up somewhere else entirely.</li>
        <li>Open <b>Exotic</b> in Scenes for a warp bubble, a wormhole, a spinning black hole and two exactly balanced holes, and try the <b>Lens</b> view on anything.</li>
        <li>Open <b>Euclid’s postulates</b> under <b>Geometry</b>, switch one off, and drag a triangle until its angles stop adding to 180°.</li>
        <li>With the <b>Mass</b> tool, pick a star type or a planet, or press <b>Surprise me</b> in Scenes.</li>
      </ul>

      <h3>How the simulation works</h3>
      <p>
        Nothing is a pre-recorded animation. Your browser solves the equations of motion many times per frame, using units where the
        speed of light and the gravitational constant are both 1.
      </p>
      <ul className="plain">
        <li><b>Particles</b> follow the exact paths general relativity predicts around one black hole, and each carries its own clock.</li>
        <li><b>Light</b> follows exact light paths too, so it can be bent, captured or caught briefly in orbit.</li>
        <li><b>Masses</b> pull on each other using Newton’s gravity plus the leading relativistic corrections, and lose energy to gravitational waves until they merge.</li>
        <li><b>Mergers</b> use results from supercomputer simulations: a few per cent of the mass vanishes into waves, and the new hole spins and recoils.</li>
      </ul>

      <h3>What’s real and what’s simplified</h3>
      <p>
        For a single non-rotating black hole, the orbits, light paths and clocks are exact. Once there are several masses, albe combines
        their effects, which is a good approximation when they are far apart and a rough one when they are close. Everything happens in
        one plane, black holes don’t drag space round as they spin, and wave heights are scaled up enormously so you can see them. Stars
        and planets are drawn far bigger than life, and galaxy scenes use rescaled units, so their speeds are not fractions of light speed. The{' '}
        <b>physics</b> tab says exactly which parts are which.
      </p>
      <p>
        <b>Lens</b> bends each ray by the exact Schwarzschild angle of each mass and adds the angles. For one black hole that is exact; for several it leaves out the way the masses change each other’s field (relative order M/d, where d is the distance between masses). A galaxy uses a softened law, the same as the ray tools. Near a star, bending and clock rates come from a radius drawn far bigger than life, so they are not the real values. The sky is a flat, invented background behind a flat lens, viewed face on, and the distance to it is a display choice rather than a measurement.
      </p>

      <h3>Your privacy</h3>
      <p>
        Everything runs in your browser. There are no accounts, cookies or analytics. If you press the Shielded button, your browser
        loads Shielded’s page from their server, which sees your IP address. Nothing is sent before that.
      </p>
    </>
  );
}

export function About() {
  const [tab, setTab] = useState<'overview' | 'physics'>('overview');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    return () => opener?.focus?.(); // hand focus back to whatever opened the panel
  }, []);
  const close = () => store.set({ aboutOpen: false });
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') close();
    if (e.key !== 'Tab' || !ref.current) return;
    // Keep Tab inside the dialog.
    const items = ref.current.querySelectorAll<HTMLElement>('button, [href]');
    const first = items[0];
    const last = items[items.length - 1];
    const at = document.activeElement;
    if (e.shiftKey && (at === first || at === ref.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && at === last) {
      e.preventDefault();
      first.focus();
    }
  };
  return (
    <div className="modal-backdrop" onClick={close}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <header className="modal-head">
          <h2 id="about-title">How albe works</h2>
          <button className="icon-btn" onClick={close} aria-label="Close">
            <IconClose />
          </button>
        </header>
        <div className="tabs" role="tablist" aria-label="Sections">
          <button role="tab" id="tab-overview" aria-selected={tab === 'overview'} aria-controls="about-panel" onClick={() => setTab('overview')}>
            Overview
          </button>
          <button role="tab" id="tab-physics" aria-selected={tab === 'physics'} aria-controls="about-panel" onClick={() => setTab('physics')}>
            The physics
          </button>
        </div>
        <div className="modal-body" id="about-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
          {tab === 'overview' ? <Overview /> : <Physics />}
        </div>
        <SiteFoot />
      </div>
    </div>
  );
}

function Physics() {
  return (
    <>
          <p>
            Units are geometric: <b>G = c = 1</b>, so mass, length and time share one unit. A mass <i>M</i> has a
            Schwarzschild radius <b>r<sub>s</sub> = 2M</b>. Dynamics are computed in the 2D equatorial plane; the
            third dimension is a picture of the geometry. Each item below says whether it is <span className="tag exact">exact</span>{' '}
            or <span className="tag approx">approximate</span>.
          </p>

          <h3>Space curvature: Flamm’s paraboloid</h3>
          <p>
            The equatorial slice (t = const, θ = π/2) of the Schwarzschild metric has spatial line element
            dl² = dr²/(1 − 2M/r) + r²dφ². Embedding it as a surface of revolution in flat 3D space gives
          </p>
          <p className="eq">z(r) = 2 √( r<sub>s</sub> (r − r<sub>s</sub>) )</p>
          <p>
            <span className="tag exact">exact for one mass</span> and drawn to true scale when the exaggeration is 1
            (depth is measured from r = 225, beyond which the sheet is drawn flat, so the surface appears as a well on an endless plane). Inside r<sub>s</sub> the slice is not
            part of this exterior surface; the throat is drawn black. With several masses the per-mass profiles are added:{' '}
            <span className="tag approx">weak-field superposition</span>; it is not an embedding of any exact multi-black-hole
            spacetime.
          </p>

          <h3>Time curvature: the lapse g<sub>tt</sub></h3>
          <p className="eq">Φ = −Σ M<sub>i</sub>/r<sub>i</sub>,&nbsp;&nbsp; dτ/dt = √(1 + 2Φ) = √(−g<sub>tt</sub>)</p>
          <p>
            Height is proportional to Φ (a display scale) and colour shows how slowly a static clock ticks.{' '}
            <span className="tag exact">exact for one mass</span> (static observer, Schwarzschild r), superposed otherwise.
            For slowly moving bodies the geodesic equation reduces to <b>a = −∇Φ</b>: it is the curvature of <i>time</i>, not of
            space, that makes apples fall and planets orbit. The rubber-sheet picture misleads on exactly this point
            (Middleton &amp; Langston 2014). Where 1 + 2Φ reaches 0 the superposed rate is clamped at 0, so equal holes closer than about 4M<sub>total</sub> seem to share a saturated
            region. This is the limit of adding potentials, not a common horizon: the Brill-Lindquist common horizon appears near d ≈ 1.53 M<sub>total</sub>, in a different gauge, and a saturated colour here is no measure of it.
          </p>

          <h3>Tidal curvature</h3>
          <p className="eq">K = R<sub>abcd</sub>R<sup>abcd</sup> = 8 E<sub>ij</sub>E<sup>ij</sup>,&nbsp;&nbsp; E<sub>ij</sub> = Σ (M/r³)(δ<sub>ij</sub> − 3 n<sub>i</sub>n<sub>j</sub>)</p>
          <p>
            The Kretschmann scalar is a coordinate-independent measure of curvature (log-scale colour), 48 M²/r⁶ for one mass.{' '}
            <span className="tag exact">exact for one mass</span>; for several the tidal tensors E<sub>ij</sub> are summed, then squared, so tides
            interfere: at the midpoint of two equal masses K is 4× one mass, and with two masses at right angles it equals one.{' '}
            <span className="tag approx">linear superposition of E, static</span>.
            It is finite at the horizon (curvature there can be tiny for large holes) and diverges only at r = 0. Nichols et al.
            (2011) show richer ways to see tidal fields (“tendexes”).
          </p>

          <h3>3D lattice warp</h3>
          <p>
            A grid of lines pulled toward the masses. <span className="tag approx">illustrative only</span>: it conveys “something
            happens near mass”, but the displacement law is invented for the picture, not derived from the metric.
          </p>

          <h3>Gravitational waves view</h3>
          <p className="eq">Ï<sub>ij</sub> = Σ m (2v<sub>i</sub>v<sub>j</sub> + x<sub>i</sub>a<sub>j</sub> + a<sub>i</sub>x<sub>j</sub>),&nbsp;&nbsp; h₊ = −Ï<sub>tt</sub>(t − r)/r</p>
          <p>
            The strain an observer in the orbital plane would measure, from a stored history of the quadrupole, so the signal really does
            travel at c. <span className="tag approx">quadrupole formula, amplitude scaled for display</span>. After a merger the signal
            between two black holes continues as a damped l = m = 2 Kerr ringdown (Berti, Cardoso &amp; Will 2006). Other mergers have no ringdown here.
          </p>

          <h3>Massive bodies</h3>
          <p>
            Newtonian gravity plus the <b>Einstein-Infeld-Hoffmann</b> first post-Newtonian (1PN) correction, for any number of bodies, in
            harmonic coordinates. A bound pair’s orbit advances by 6πM/(a(1−e²)) per turn at any mass ratio. Integrated with velocity
            Verlet on adaptive sub-steps, with the velocity-dependent terms evaluated twice per step.{' '}
            <span className="tag approx">expansion in M/r</span>: it fails near merger, so each pair’s correction is capped at half its
            Newtonian pull. The cap first fires near r ≈ 7.2M (M the total mass), governs the last 16% of the binary scene and the last third of the
            Gravitational waves scene, and removes the ISCO: a capped binary has no plunge, it shrinks smoothly to 2M (from 6M to 2M in about 39M of time).
            That smooth shrink is a feature of the cap, not of general relativity. Bodies are in harmonic coordinates, while test particles use Schwarzschild
            r (r<sub>Schwarzschild</sub> = r<sub>harmonic</sub> + M, an offset of M at any radius).
          </p>

          <h3>Gravitational radiation</h3>
          <p className="eq">a = −(M/r²)(A n + B v),&nbsp; A = (8Mν/5r) ṙ (−17M/3r − 3v²),&nbsp; B = (8Mν/5r)(3M/r + v²)</p>
          <p>
            The 2.5PN radiation reaction on every pair (Blanchet 2014). Averaged over an orbit it gives the Peters (1964) decay rates,
            including the faster decay of eccentric orbits. <span className="tag approx">leading order</span>. The “merges in” figure uses
            Peters’ formula, so treat it as an estimate. With three or more masses each pair radiates on its own, so the cross terms of the system’s
            quadrupole are dropped, an order-one error when masses are comparable: the full N-body reaction needs the system’s fifth quadrupole derivative.{' '}
            <span className="tag approx">exact form only for two bodies</span>
          </p>

          <h3>Mergers</h3>
          <p>
            Bodies merge when closer than the sum of their Schwarzschild radii. With relativity on, the remnant follows fits to numerical
            relativity for non-spinning binaries: radiated energy (Barausse, Morozova &amp; Rezzolla 2012; 4.8% for equal masses), spin
            2√3 ν − 3.454 ν² + 2.353 ν³ (Rezzolla et al. 2008; 0.69 for equal masses) and recoil up to 175 km/s (González et al. 2007).{' '}
            <span className="tag approx">fits; recoil direction simplified</span>. The merger itself is not simulated, and the remnant’s spin
            is reported but does not affect its gravity.
          </p>

          <h3>Test particles</h3>
          <p className="eq">a = −Σ M<sub>i</sub> r̂/r² (1 + 3L<sub>i</sub>²/r²),&nbsp;&nbsp; dt/dτ = E/(1 − 2M/r)</p>
          <p>
            With derivatives taken in the particle’s own proper time τ, this is the Schwarzschild geodesic equation, and the conserved energy E
            converts proper time to the distant observer’s time. Perihelion advance, the ISCO at 6M, the photon sphere at 3M and the time
            dilation of each clock all follow. <span className="tag exact">exact for one mass</span>; for several masses the terms are summed:{' '}
            <span className="tag approx">approximate</span>. The velocity is dx/dτ for the particle and dx/dt for a moving source, a further approximation for fast
            sources. A distant observer never sees anything cross a horizon, so particles are removed at r = 2.04M. Switch GR off to see Newton’s closed ellipses.
          </p>

          <h3>Light rays</h3>
          <p className="eq">d²x/dλ² = −Σ 3M<sub>i</sub>h<sub>i</sub>² d<sub>i</sub>/r<sub>i</sub>⁵,&nbsp;&nbsp; dt/dλ = 1/(1 − 2M/r)</p>
          <p>
            Null geodesics in Schwarzschild coordinates, equivalent to u″ + u = 3Mu². Distant rays bend by <b>4M/b</b>, twice the Newtonian
            value, as measured in the 1919 eclipse (Dyson, Eddington &amp; Davidson 1920). Close rays bend far more, rays inside b = 3√3 M
            are captured, and light slows in coordinate time (the Shapiro delay). <span className="tag exact">exact for one static mass</span>;
            superposed for several <span className="tag approx">approximate</span>. The ray tools and the Lens view use the same deflection law: the exact
            α̂(b) of each mass, summed, with the sum’s neglected nonlinear terms of relative order M/d (about 1% for another equal mass at d = 100M, about 8% at d = 13M).
            A ray through a galaxy bends by 4Mb/(b²+a²), the Born deflection of a Plummer sphere of scale a; this law, not the dynamical halo, is what both
            views draw (at b = a it bends about 5× more than the halo’s own projected mass, reaching agreement at the edge).
          </p>

          <h3>Stars and planets</h3>
          <p>
            Mass ratios are real, with 1 solar mass = 0.5 scene units. Sizes are not: the Sun’s radius is 235,000 of its own Schwarzschild radii, so star
            and planet radii are <span className="tag approx">compressed for display</span>. Outside a star the sheet uses the exterior formulas. Inside, the
            Space view uses Schwarzschild’s constant-density interior, which joins the outside smoothly; the Time view uses a uniform sphere’s Newtonian
            potential, and the Tidal view holds its surface value. Post-Newtonian corrections to orbits and test-particle precession apply only to black
            holes and neutron stars, since a compressed star’s M/r means nothing, and particle clocks near a star keep only their kinematic factor. Light still
            bends around every mass, and the Time view still draws Φ, but those come from the compressed radius: a Sun-like star bends light by 22.9° at its limb here,
            against 1.75″ for the real Sun, about 47,000× too much, so treat them as a picture of the idea, not the value. Colour comes from a blackbody at the
            star’s temperature. Neutron stars are drawn at their true ratio of radius to r<sub>s</sub>.
          </p>

          <h3>Collisions</h3>
          <p>
            Bodies merge when their surfaces touch, and the densest kind wins. A white dwarf pushed past the Chandrasekhar mass (1.44 M☉) collapses to a
            neutron star, which is one real outcome; a neutron star above about 2.3 M☉ collapses to a black hole. A star inside the tidal radius
            R(M/m)<sup>⅓</sup> of a compact object breaks into test particles (Rees 1988). With compressed radii a Sun-like star is swallowed whole by holes above about 15 M☉, whereas
            for the real Sun that takes about 10⁸ M☉ (the Hills mass). <span className="tag approx">outcomes simplified</span>
          </p>

          <h3>Three bodies</h3>
          <p>
            The figure-eight uses Chenciner &amp; Montgomery (2000), and the butterfly, moth and yin-yang use the Šuvakov &amp; Dmitrašinović (2013) tables.
            Lagrange’s triangle needs one body to dominate to be stable (Routh’s condition), which is why equal masses break up and why the Trojan asteroids
            are safe. These scenes are purely Newtonian. <span className="tag exact">Newtonian N-body</span>
          </p>

          <h3>Galaxies</h3>
          <p className="eq">M(r) ∝ r − a·atan(r/a),&nbsp;&nbsp; σ<sub>R</sub> = 3.36 Q Σ / κ</p>
          <p>
            A galaxy is a pseudo-isothermal dark halo, whose rotation curve flattens as real ones do (Rubin, Ford &amp; Thonnard 1980), holding an exponential
            disk of stars. In the spiral scene the stars attract each other through a Barnes-Hut tree (Barnes &amp; Hut 1986) with softening, in a disk built near
            Toomre’s stability limit (Toomre 1964), and the arms grow by themselves. In collisions the stars are test particles, the method of Toomre &amp; Toomre
            (1972), and the halos are rigid, so Chandrasekhar’s dynamical friction (1943) supplies the drag that makes them merge. The lighter of a
            pair feels the heavier halo exactly as its own stars do, so it does not fall away from them, and the heavier takes the equal and opposite reaction.
            The cluster scene sets friction to 4% of Chandrasekhar’s value so the galaxies do not all sink at once: a display choice, not a measurement. The disk’s
            velocity dispersion uses κ = √2Ω, right on a flat curve, so inside the rising core the true Q runs up to √2 ≈ 1.41× its nominal value.
            Everything here is in one plane and uses rescaled units. <span className="tag approx">restricted or softened N-body</span>
          </p>

          <h3>The warp bubble</h3>
          <p>The Alcubierre scene draws a theoretical metric. It needs exotic matter, and nothing here claims it can exist.</p>
          <ul className="plain">{WARP_CAVEATS.map((c) => <li key={c}>{c}</li>)}</ul>

          <h3>Wormholes and spinning black holes</h3>
          <p>
            The exotic scenes are <span className="tag exact">exact for test particles</span> on the Ellis and equatorial Kerr geometries, drawn on true embeddings. Fragments in
            the Penrose scene are idealised, the hole’s mass and spin are held fixed, and the wormhole’s negative energy has no known source.
          </p>

          <h3>Measuring, explaining and flagging approximations</h3>
          <p>
            <b>Measure</b> drops a pin at each closest approach, interpolated to ṙ = 0 between integration steps, and draws the orbit
            relative to its centre so the protractor reads true angles. The app compares the pins with Darwin’s elliptic integral for the
            same E and L <span className="tag exact">exact for one mass</span>, and with 6πM/p and its (M/p)² term{' '}
            <span className="tag approx">series in M/p</span>. In the Mercury scene they give 35.4°, 35.4° and 30.8°.
          </p>
          <p>
            The <b>wave cursor</b> marks extrema of the face-on strain: neighbouring ones are half a period apart. Two readings of f give
            the chirp mass through f<sup>−8/3</sup> falling linearly at (256/5)π<sup>8/3</sup>ℳ<sup>5/3</sup> (Cutler &amp; Flanagan 1994){' '}
            <span className="tag approx">leading order</span>. In the Gravitational waves scene it reads about 14% above the true ℳ = 1.62
            before the 1PN cap acts: the orbit’s 1PN terms, of order v² ≈ 0.1, are what the formula leaves out.
          </p>
          <p>
            The <b>readout</b> adds the largest M/r, the expansion parameter of the post-Newtonian terms, and 4M<sub>a</sub>M<sub>b</sub>/(r<sub>a</sub>r<sub>b</sub>), the
            1PN cross term of g<sub>tt</sub> that summing the masses one by one leaves out. <b>Why is this approximate?</b> chips appear only
            while their approximation is on screen. The <b>Explain</b> panel collects, for each scene, what is exact, what is approximate
            and why, with the live numbers to watch.
          </p>

          <h3>Challenges, sound and “not our universe”</h3>
          <p>
            <b>Wind the light</b> counts the turns a ray makes round one hole for b = b<sub>c</sub>(1 ± δ). With t = u − 1/(3M) the orbit
            equation is exactly (dt/dφ)² = ε + t² + 2Mt³, so a deviation from the photon orbit grows as e<sup>φ</sup> and each extra turn
            needs δ about e<sup>2π</sup> ≈ 535 times smaller, on either side. The count is the app’s RK4 null-geodesic step at 0.4% of r,
            checked against 0.8%; their difference is the error estimate, which grows about tenfold per decade of δ, and past 0.01 turn
            the count is withheld. The exact sweep is π + α̂ (elliptic integral) on escape and a quadrature to 2.04M on capture{' '}
            <span className="tag exact">exact for one mass</span>; Bozza’s strong-deflection limit is shown beside it.
          </p>
          <p>
            <b>Tightest stable orbit</b> launches a test particle with a fixed inward nudge of 0.01c and asks whether it survives five
            turns. With W(r) = −M/r + L²/(2r²) − ML²/r³ the fate follows from the start alone: for a circular start the edge is 6.388M,
            a margin beyond the ISCO that scales as the nudge to the 2/3 power <span className="tag exact">exact for one mass</span>.
          </p>
          <p>
            <b>Hit a merger time</b> runs two M = 2 holes off screen with the scene’s own law and sets the result beside Peters’
            T = (5/256)a⁴/(m₁m₂M), split at the 1PN cap. At a = 35.8 the run merges at 1882 against Peters’ 2005: 1PN terms change the
            shrink rate by order M/a, and from about 7.2M the cap removes the ISCO, so neither number has the plunge real holes make{' '}
            <span className="tag approx">1PN + 2.5PN, capped</span>.
          </p>
          <p>
            <b>Listen</b> plays the strain history as sound, with one unit of mass taken as 20 M☉ (or 5 M☉): pitch and duration are
            true for that mass, about 24 to 196 Hz over 0.19 s for the Gravitational waves pair; loudness is normalised. Nothing
            plays, and no audio context exists, until it is pressed.
          </p>
          <p>
            <b>Not our universe</b> changes test particles’ laws only, and says so with a chip. A force F ∝ 1/rⁿ (Newton’s at 20M)
            turns a near-circular orbit by 180°/√(3 − n) between apsides; Bertrand’s theorem says only n = 2 and n = −1 close every
            bound orbit. Scaling the relativistic term by s = (c/c′)² gives u″ + u = M/L² + 3sMu², Schwarzschild’s equation for M′ = sM,
            so the ISCO moves to 6sM and the exact advance is the same elliptic integral. Masses, light, clocks and the sheet keep ours.
          </p>

          <h3>Geometry: Euclid’s postulates and albe’s folds</h3>
          <p>
            Each geometry is written in a conformal chart, g = e<sup>2σ</sup>(dx² + dy²), so angles on the page are true angles. Geodesics turn at
            dθ/ds = ∂σ/∂n and are integrated by RK4, with two-point shooting for a triangle’s edges; ∫K dA, K = −e<sup>−2σ</sup>Δσ, is a separate
            quadrature, so Gauss-Bonnet (Σα − π = ∫K dA, or Σα − 3π for a triangle round a throat) is a check, not an identity. Tests match
            spherical and hyperbolic trigonometry, Girard, Lobachevsky’s angle of parallelism, 2π sin s and 2π sinh s, and the Flamm proper
            radius √(r(r − 2M)) + M ln((r − M + √(r(r − 2M)))/M) to five digits or better. The folds are the Flamm slice (K = −M/r³, isotropic
            radius), the Ellis wormhole (K = −b²/(l² + b²)²) and the Alcubierre slice, which is flat. <span className="tag exact">exact geometry</span>{' '}
            These are spatial slices at one instant: spacetime is Lorentzian, and its curvature is not one number.
          </p>

          <h3>Two balanced holes</h3>
          <p>
            Majumdar-Papapetrou: ds² = −U⁻²dt² + U²dx², U = 1 + ΣM<sub>i</sub>/|x − x<sub>i</sub>|, for holes with charge equal to mass. Electric
            repulsion cancels attraction, the field equations reduce to ∇²U = 0, and U adds exactly. Rays in the plane of the holes are geodesics
            of the optical metric U⁴dx². One hole is extremal Reissner-Nordström, capturing below b = 4M (a test recovers it); the exit angle
            against b has the Cantor-set structure of chaotic scattering (Shipley &amp; Dolan 2016). <span className="tag exact">exact spacetime</span>{' '}
            <span className="tag approx">not astrophysical: real holes are nearly neutral</span>
          </p>

          <h3>Gyroscope, Kruskal diagram, dust ring and epicycles</h3>
          <p>
            A vector carried round the circle r on the Flamm slice leads the stars by 2π(1 − √(1 − 2M/r)) per loop; a gyroscope on the circular
            geodesic by 2π(1 − √(1 − 3M/r)) (de Sitter 1916), 66.1° against 105.4° at 6M. Both are recovered by integrating the transport in tests.
            Gravity Probe B measured 6601.8 ± 18.3 mas/yr against GR’s 6606.1 (Everitt et al. 2011). The Clocks scene’s falling clock is carried
            through the horizon in Kruskal U, V, with v = t + r* integrated from dv/dτ = 1/(E + √(E² − f)), to r = 0 at τ = π√(R³/8M). The dust
            ring is read from its four axis particles in the falling frame and compared with ξ̈ = −Eξ, E = (M/r³)diag(−2, 1, 1): within 2% to
            8M; the out-of-plane axis is computed, not simulated. The epicyclic advance 2π[(1 − 6M/r)<sup>−½</sup> − 1] is the elliptic
            integral’s e → 0 limit. <span className="tag exact">exact for one mass</span>
          </p>

          <h3>Presets</h3>
          <p>
            The Mercury preset exaggerates the effect about a millionfold: a = 40M instead of ≈ 4×10⁷ solar M.
          </p>

          <h3>References</h3>
          <ol className="refs">
            <li>K. Schwarzschild (1916), “Über das Gravitationsfeld eines Massenpunktes nach der Einsteinschen Theorie”, Sitzungsberichte der Königlich Preussischen Akademie der Wissenschaften, 189–196.</li>
            <li>L. Flamm (1916), “Beiträge zur Einsteinschen Gravitationstheorie”, Physikalische Zeitschrift 17, 448.</li>
            <li>A. Einstein (1915), “Erklärung der Perihelbewegung des Merkur aus der allgemeinen Relativitätstheorie”, Sitzungsberichte der Preussischen Akademie der Wissenschaften, 831–839.</li>
            <li>F. W. Dyson, A. S. Eddington &amp; C. Davidson (1920), “A determination of the deflection of light by the Sun’s gravitational field…”, Phil. Trans. R. Soc. A 220, 291–333.</li>
            <li>P. C. Peters (1964), “Gravitational radiation and the motion of two point masses”, Phys. Rev. 136, B1224.</li>
            <li>C. W. Misner, K. S. Thorne &amp; J. A. Wheeler (1973), <i>Gravitation</i>, W. H. Freeman, §23.8 (embedding diagrams).</li>
            <li>A. Chenciner &amp; R. Montgomery (2000), “A remarkable periodic solution of the three-body problem in the case of equal masses”, Annals of Mathematics 152, 881–901.</li>
            <li>D. A. Nichols et al. (2011), “Visualizing spacetime curvature via frame-drag vortexes and tidal tendexes”, Phys. Rev. D 84, 124014.</li>
            <li>C. A. Middleton &amp; M. Langston (2014), “Circular orbits on a warped spandex fabric”, Am. J. Phys. 82, 287.</li>
            <li>A. Einstein, L. Infeld &amp; B. Hoffmann (1938), “The gravitational equations and the problem of motion”, Annals of Mathematics 39, 65–100.</li>
            <li>L. Blanchet (2014), “Gravitational radiation from post-Newtonian sources and inspiralling compact binaries”, Living Reviews in Relativity 17, 2.</li>
            <li>E. Barausse, V. Morozova &amp; L. Rezzolla (2012), “On the mass radiated by coalescing black hole binaries”, ApJ 758, 63.</li>
            <li>L. Rezzolla et al. (2008), “Final spin from the coalescence of two black holes”, Phys. Rev. D 78, 044002.</li>
            <li>J. A. González et al. (2007), “Maximum kick from nonspinning black-hole binary inspiral”, Phys. Rev. Lett. 98, 091101.</li>
            <li>E. Berti, V. Cardoso &amp; C. M. Will (2006), “Gravitational-wave spectroscopy of massive black holes with the space interferometer LISA”, Phys. Rev. D 73, 064030.</li>
            <li>M. Šuvakov &amp; V. Dmitrašinović (2013), “Three classes of Newtonian three-body planar periodic orbits”, Phys. Rev. Lett. 110, 114301.</li>
            <li>J. Barnes &amp; P. Hut (1986), “A hierarchical O(N log N) force-calculation algorithm”, Nature 324, 446.</li>
            <li>A. Toomre (1964), “On the gravitational stability of a disk of stars”, ApJ 139, 1217.</li>
            <li>A. Toomre &amp; J. Toomre (1972), “Galactic bridges and tails”, ApJ 178, 623.</li>
            <li>A. Toomre (1981), “What amplifies the spirals?”, in <i>The Structure and Evolution of Normal Galaxies</i>, Cambridge University Press.</li>
            <li>S. Chandrasekhar (1943), “Dynamical friction”, ApJ 97, 255.</li>
            <li>V. C. Rubin, W. K. Ford &amp; N. Thonnard (1980), “Rotational properties of 21 Sc galaxies”, ApJ 238, 471.</li>
            <li>M. J. Rees (1988), “Tidal disruption of stars by black holes of 10⁶–10⁸ solar masses in nearby galaxies”, Nature 333, 523.</li>
            <li>H. E. Bond et al. (2017), “The Sirius system and its astrophysical puzzles”, ApJ 840, 70.</li>
            {WARP_REFERENCES.map((r) => <li key={r}>{r}</li>)}
            <li>M. S. Morris &amp; K. S. Thorne (1988), Am. J. Phys.; T. Müller (2004), Am. J. Phys.; O. James et al. (2015), Am. J. Phys.; N. Tsukamoto (2016), Phys. Rev. D (wormholes).</li>
            <li>J. M. Bardeen, W. H. Press &amp; S. A. Teukolsky (1972), ApJ; J. D. Schnittman (2014), Phys. Rev. Lett.; L. Resca et al. (2020), Am. J. Phys.; R. Ruffini et al. (2025), Phys. Rev. Lett. (Kerr orbits and the Penrose process).</li>
            <li>C. Darwin (1959), “The gravity field of a particle”, Proc. R. Soc. A 249, 180.</li>
            <li>V. Bozza (2002), “Gravitational lensing in the strong field limit”, Phys. Rev. D 66, 103001.</li>
            <li>J. Bertrand (1873), “Théorème relatif au mouvement d’un point attiré vers un centre fixe”, C. R. Acad. Sci. Paris 77, 849.</li>
            <li>C. Cutler &amp; É. É. Flanagan (1994), “Gravitational waves from merging compact binaries”, Phys. Rev. D 49, 2658.</li>
            <li>M. D. Kruskal (1960), “Maximal extension of Schwarzschild metric”, Phys. Rev. 119, 1743.</li>
            <li>C. M. Will (2014), “The confrontation between general relativity and experiment”, Living Rev. Relativ. 17, 4.</li>
            <li>C. F. Gauss (1827), “Disquisitiones generales circa superficies curvas”; B. Riemann (1868), “Über die Hypothesen, welche der Geometrie zu Grunde liegen”; D. Hilbert (1901), Trans. Amer. Math. Soc. 2, 87.</li>
            <li>S. D. Majumdar (1947), Phys. Rev. 72, 390; A. Papapetrou (1947), Proc. R. Irish Acad. A 51, 191; J. B. Hartle &amp; S. W. Hawking (1972), Commun. Math. Phys. 26, 87; J. O. Shipley &amp; S. R. Dolan (2016), Class. Quantum Grav. 33, 175001.</li>
            <li>W. de Sitter (1916), MNRAS 77, 155; C. W. F. Everitt et al. (2011), “Gravity Probe B: final results”, Phys. Rev. Lett. 106, 221101.</li>
            <li>F. A. E. Pirani (1956), Acta Phys. Pol. 15, 389; A. K. Raychaudhuri (1955), Phys. Rev. 98, 1123.</li>
            <li>E. Agol et al. (2021), “Refining the transit-timing and photometric analysis of TRAPPIST-1”, Planetary Science Journal 2, 1.</li>
          </ol>
          <p className="muted">Keyboard: Space pause · 1–6 tools · V cycle view · F frame everything · G toggle GR · . step · Delete remove selected · Esc close.</p>
    </>
  );
}
