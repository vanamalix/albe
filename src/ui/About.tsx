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
        <li>Open <b>Exotic</b> in Scenes for a warp bubble, a wormhole and a spinning black hole, and try the <b>Lens</b> view on anything.</li>
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
        <b>Lens</b> uses the exact Schwarzschild bending only when the scene holds one black hole. With any other set of masses it adds each mass’s weak-field deflection (the thin-lens equation), so close to a black hole the image is approximate and the thin photon rings are missing. The sky is a flat, invented background behind a flat lens, viewed face on, and the distance to it is a display choice rather than a measurement.
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
            (Middleton &amp; Langston 2014).
          </p>

          <h3>Tidal curvature</h3>
          <p className="eq">K = R<sub>abcd</sub>R<sup>abcd</sup> = 48 M²/r⁶</p>
          <p>
            The Kretschmann scalar is a coordinate-independent measure of curvature (log-scale colour).{' '}
            <span className="tag exact">exact for one mass</span>; summed over masses <span className="tag approx">approximate</span>.
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
            Newtonian pull.
          </p>

          <h3>Gravitational radiation</h3>
          <p className="eq">a = −(M/r²)(A n + B v),&nbsp; A = (8Mν/5r) ṙ (−17M/3r − 3v²),&nbsp; B = (8Mν/5r)(3M/r + v²)</p>
          <p>
            The 2.5PN radiation reaction on every pair (Blanchet 2014). Averaged over an orbit it gives the Peters (1964) decay rates,
            including the faster decay of eccentric orbits. <span className="tag approx">leading order</span>. The “merges in” figure uses
            Peters’ formula, so treat it as an estimate.
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
            <span className="tag approx">approximate</span>. A distant observer never sees anything cross a horizon, so particles are
            removed at r = 2.04M. Switch GR off to see Newton’s closed ellipses.
          </p>

          <h3>Light rays</h3>
          <p className="eq">d²x/dλ² = −Σ 3M<sub>i</sub>h<sub>i</sub>² d<sub>i</sub>/r<sub>i</sub>⁵,&nbsp;&nbsp; dt/dλ = 1/(1 − 2M/r)</p>
          <p>
            Null geodesics in Schwarzschild coordinates, equivalent to u″ + u = 3Mu². Distant rays bend by <b>4M/b</b>, twice the Newtonian
            value, as measured in the 1919 eclipse (Dyson, Eddington &amp; Davidson 1920). Close rays bend far more, rays inside b = 3√3 M
            are captured, and light slows in coordinate time (the Shapiro delay). <span className="tag exact">exact for one static mass</span>;
            superposed for several <span className="tag approx">approximate</span>.
          </p>

          <h3>Stars and planets</h3>
          <p>
            Mass ratios are real, with 1 solar mass = 0.5 scene units. Sizes are not: the Sun’s radius is 235,000 of its own Schwarzschild radii, so star
            and planet radii are <span className="tag approx">compressed for display</span>. Outside a star the sheet uses the exterior formulas. Inside, the
            Space view uses Schwarzschild’s constant-density interior, which joins the outside smoothly; the Time view uses a uniform sphere’s Newtonian
            potential, and the Tidal view holds its surface value. Post-Newtonian corrections to orbits and test-particle precession apply only to black
            holes and neutron stars, since a compressed star’s M/r means nothing; light still bends around every mass. Colour comes from a blackbody at the
            star’s temperature. Neutron stars are drawn at their true ratio of radius to r<sub>s</sub>.
          </p>

          <h3>Collisions</h3>
          <p>
            Bodies merge when their surfaces touch, and the densest kind wins. A white dwarf pushed past the Chandrasekhar mass (1.44 M☉) collapses to a
            neutron star, which is one real outcome; a neutron star above about 2.3 M☉ collapses to a black hole. A star inside the tidal radius
            R(M/m)<sup>⅓</sup> of a compact object breaks into test particles (Rees 1988). <span className="tag approx">outcomes simplified</span>
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
            <li>E. Agol et al. (2021), “Refining the transit-timing and photometric analysis of TRAPPIST-1”, Planetary Science Journal 2, 1.</li>
          </ol>
          <p className="muted">Keyboard: Space pause · 1–6 tools · V cycle view · F frame everything · G toggle GR · . step · Delete remove selected · Esc close.</p>
    </>
  );
}
