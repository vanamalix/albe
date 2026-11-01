import { useEffect, useRef } from 'react';
import { store } from '../state/store';
import { IconClose } from './icons';

export function About() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const close = () => store.set({ aboutOpen: false });
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
        onKeyDown={(e) => e.key === 'Escape' && close()}
      >
        <header className="modal-head">
          <h2 id="about-title">About the physics</h2>
          <button className="icon-btn" onClick={close} aria-label="Close about panel">
            <IconClose />
          </button>
        </header>
        <div className="modal-body">
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
            (depth is measured from the domain edge, so the surface appears as a well). Inside r<sub>s</sub> the slice is not
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

          <h3>Massive particles</h3>
          <p>
            Bodies move under <b>Newtonian N-body</b> gravity (velocity Verlet with adaptive sub-steps and a small softening).
            They merge when closer than the sum of their Schwarzschild radii, conserving mass and momentum (real mergers radiate
            a few per cent of the mass and can recoil). The optional <b>GW inspiral</b> removes orbital energy at the rate of
            the Peters (1964) quadrupole formula for circular orbits,
          </p>
          <p className="eq">dE/dt = −(32/5) m₁² m₂² (m₁+m₂) / a⁵,</p>
          <p>
            applied as a drag force: <span className="tag approx">crude, orbit-averaged estimate</span>.
          </p>

          <h3>Test particles (GR geodesics)</h3>
          <p className="eq">a = −Σ M<sub>i</sub> r̂/r² (1 + 3L<sub>i</sub>²/r²)</p>
          <p>
            with L<sub>i</sub> the specific angular momentum about source <i>i</i>. For one static mass this reproduces the
            Schwarzschild orbit equation u″ + u = M/L² + 3Mu² exactly, so orbit <i>shapes</i> are true geodesic shapes:
            perihelion advance Δφ ≈ 6πM/(a(1−e²)) per orbit (Einstein 1915), no stable circular orbits inside the ISCO at 6M, and
            no circular orbits at all inside the photon sphere at 3M. <span className="tag exact">orbit shape exact for one mass</span>;
            the timing along the orbit is Newtonian, and the many-body superposition is <span className="tag approx">approximate</span>.
            Switch GR off to see Newton’s closed ellipses.
          </p>

          <h3>Light rays</h3>
          <p className="eq">n = 1 + 2Σ M<sub>i</sub>/r<sub>i</sub>,&nbsp;&nbsp; d/ds(n dx/ds) = ∇n</p>
          <p>
            In the weak field, light moves as if through a medium of refractive index n (coordinate speed c/n, the Shapiro delay).
            A ray with impact parameter b ≫ M is bent by <b>4M/b</b>, twice the Newtonian value, as measured in the 1919 eclipse
            (Dyson, Eddington &amp; Davidson 1920). <span className="tag approx">weak field</span>: near a hole the true photon sphere
            (3M) is not reproduced exactly. Rays reaching r = 2M are captured.
          </p>

          <h3>Presets</h3>
          <p>
            The Mercury preset exaggerates the effect about a millionfold: a = 40M instead of ≈ 4×10⁷ solar M. The figure-eight
            uses the Chenciner–Montgomery (2000) initial conditions.
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
          </ol>
          <p className="muted">Keyboard: Space pause · 1–6 tools · V cycle view · G toggle GR · . step · Delete remove selected · Esc close.</p>
        </div>
      </div>
    </div>
  );
}
