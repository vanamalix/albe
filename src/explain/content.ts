/**
 * Explainers: notes to read at your own pace beside a running scene. Each says what you are seeing,
 * why it happens (a derivation in brief at Equation depth), the live numbers to watch (read from the
 * simulation every refresh), what is exact and what is approximate, and where to read more. A scene
 * without its own explainer gets one assembled from its note and the current view.
 *
 * Every number on screen comes from a function of the live world; the few physical constants (the
 * real Sun and Mercury) are stated with their source and pinned by explain.test.ts.
 */
import { activeChips, chipText, compressedLimb, tidalInterference } from '../physics/approx';
import { SUN_GM_METRES } from '../physics/bodies';
import { chirpMassOf } from '../physics/chirp';
import { lapse, potential, type ViewMode } from '../physics/fields';
import { apsidalAngle, geodesicConstants, properTimeBetween, radialFall, secondOrderAdvance, textbookAdvance } from '../physics/measure';
import { pairOrbit } from '../physics/nbody';
import { presetById } from '../physics/presets';
import { circularClockRate, circularSpeed, clockReading, dominantSource, probeAcceleration } from '../physics/probes';
import { isCompact, type Body, type Probe } from '../physics/types';
import type { Depth } from '../state/depth';
import type { World } from '../sim/world';
import { viewCopy } from '../ui/viewCopy';
import { dustExplainer, gyroExplainer } from './classics';
import { collapseExplainer, cosmosExplainer, microlensExplainer, shadowExplainer } from './deep';
import { balancedExplainer, euclidExplainer } from './geometry';

export interface ExplainContext {
  world: World;
  depth: Depth;
  mode: ViewMode;
  gr: boolean;
}

type Text = string | ((c: ExplainContext) => string);

export interface Watch {
  label: string;
  /** Null hides the row (the quantity does not exist right now). */
  value: (c: ExplainContext) => string | null;
}

export interface Myth {
  picture: string;
  gr: Text;
}

/** What an explainer's buttons may ask of the app. */
export interface AppApi {
  restart: (gr?: boolean) => void;
  openMeasure: () => void;
}

export interface Action {
  label: string;
  run: (c: ExplainContext, app: AppApi) => void;
}

export interface Explainer {
  title: string;
  seeing: Text;
  why: { words: Text; numbers: Text; equation: Text; eq?: string[] };
  watch: Watch[];
  exact: Text[];
  approx: Text[];
  myths?: Myth[];
  actions?: Action[];
  reading: string[];
}

export const resolve = (t: Text, c: ExplainContext): string => (typeof t === 'string' ? t : t(c));

const deg = (r: number) => (r * 180) / Math.PI;
const f1 = (v: number) => v.toFixed(1);
const f3 = (v: number) => v.toFixed(3);

/** Real Mercury (JPL mean elements): semi-major axis, eccentricity and sidereal period in days. */
export const MERCURY = { a: 5.7909e10, e: 0.2056, periodDays: 87.969 };
/** Mercury's relativistic advance per orbit and per Julian century, in arcseconds (leading order). */
export function mercuryAdvance(): { perOrbit: number; perCentury: number; mOverR: number } {
  const perOrbit = ((6 * Math.PI * SUN_GM_METRES) / (MERCURY.a * (1 - MERCURY.e ** 2))) * (180 / Math.PI) * 3600;
  return { perOrbit, perCentury: perOrbit * (36525 / MERCURY.periodDays), mOverR: SUN_GM_METRES / (MERCURY.a * (1 - MERCURY.e)) };
}

const hole = (w: World): Body | undefined => w.bodies.find(isCompact);
const probeById = (w: World, id: number): Probe | undefined => w.probes.find((p) => p.id === id);

/** The pinned particle relative to its dominant mass: E², L² and the mass. */
function pinnedOrbit(w: World): { m: number; E2: number; L2: number } | null {
  if (w.pinTarget?.kind !== 'probe') return null;
  const p = probeById(w, w.pinTarget.id);
  if (!p) return null;
  const i = dominantSource(p.x, p.y, w.bodies);
  if (i < 0) return null;
  const s = w.bodies[i];
  return { m: s.m, ...geodesicConstants(s.m, p.x - s.x, p.y - s.y, p.vx - s.vx, p.vy - s.vy) };
}

const advanceRows: Watch[] = [
  { label: 'Closest approaches pinned', value: ({ world }) => (world.pinTarget ? `${world.pins.pins.length}` : null) },
  { label: 'Advance, measured (pins)', value: ({ world }) => (Number.isFinite(world.pins.advance) ? `${f1(deg(world.pins.advance))}°` : null) },
  {
    label: 'Advance, exact (elliptic integral)',
    value: ({ world, gr }) => {
      const o = pinnedOrbit(world);
      if (!o || !gr || o.E2 >= 1) return null;
      const a = deg(apsidalAngle(o.m, o.E2, o.L2)) - 360;
      return Number.isFinite(a) ? `${f1(a)}°` : null;
    },
  },
  { label: '6πM/p on the orbit flown', value: ({ world }) => (world.pins.rmax > 0 && hole(world) && world.pins.pins.length ? `${f1(deg(textbookAdvance(hole(world)!.m, world.pins.rmin, world.pins.rmax)))}°` : null) },
  { label: 'With the (M/p)² term', value: ({ world }) => (world.pins.rmax > 0 && hole(world) && world.pins.pins.length ? `${f1(deg(secondOrderAdvance(hole(world)!.m, world.pins.rmin, world.pins.rmax)))}°` : null) },
];

const sheetMyth: Myth = {
  picture: 'Mass dents a rubber sheet, and things roll into the dent.',
  gr: ({ world }) => {
    const share = (v: number) => (100 * v * v) / (1 + v * v);
    const marbles = world.probes.filter((p) => p.model === 'sheet');
    const seen = marbles.length ? ' Use “Add the marbles” to watch one roll outward on the drawn geometry.' : ' Press “Add the marbles” to try it.';
    return `The sheet in the Space view is the true geometry of space around a hole, and a marble rolling freely on it does not fall in: on a surface of revolution r sin ψ is conserved (Clairaut), so a marble started tangent can only move outward, and one at rest stays put. Slow motion is ruled by the curvature of time, g_tt. Space curvature still counts: a particle passing at speed v bends by 2M(1 + v²)/(bv²), and the space part 2M/b is a share v²/(1 + v²) of it, ${share(0.18).toFixed(1)}% at v = 0.18 and ${share(1).toFixed(0)}% for light.${seen}`;
  },
};

const horizonMyth: Myth = {
  picture: 'Time stops at the horizon, so nothing ever falls in.',
  gr: 'Only the distant observer’s coordinate time t diverges, as −2M ln(r/2M − 1). The falling clock’s own time stays finite all the way to r = 2M and beyond: in Kruskal coordinates the worldline crosses the horizon smoothly. albe stops the particle just outside, at 2.04M, because its distant-time clock would never get there.',
};

const slowClockMyth: Myth = {
  picture: 'Clocks run slow near mass, and that slowness is what pulls you in.',
  gr: 'A clock at rest midway between two equal holes runs slower than one further out, yet feels no pull at all: by symmetry ∇Φ = 0 there. In the slow-motion limit the geodesic equation gives d²x/dt² = −∇Φ: it is the gradient of the clock rate that accelerates, not the rate. Use “Put a clock at the midpoint” to see it.',
};

const suckMyth: Myth = {
  picture: 'Black holes suck everything in.',
  gr: 'Outside any spherical mass the field is the same Schwarzschild exterior (Birkhoff’s theorem). Swap the Sun for a black hole of equal mass and Earth’s orbit does not change: a hole only differs from a star within a few r_s, and the Sun’s r_s is about 3 km. Use “Swap the Sun for a black hole”.',
};

const EXPLAINERS: Record<string, Explainer> = {
  euclid: euclidExplainer,
  mp: balancedExplainer,
  gyro: gyroExplainer,
  dust: dustExplainer,
  shadow: shadowExplainer,
  microlens: microlensExplainer,
  frw: cosmosExplainer,
  collapse: collapseExplainer,
  single: {
    title: 'Single black hole',
    seeing: 'A hole of M = 4 on the true Flamm geometry. Gold traces a relativistic rosette; blue started the same way under Newton and closes. The dashed rings are the photon sphere (3M) and the innermost stable circular orbit (6M).',
    why: {
      words: 'Close to a hole an orbit’s in-and-out swing takes longer than its trip round, so each closest point lands further on. Inside 6M no circular orbit is stable; at 3M only light can circle.',
      numbers: ({ world }) => {
        const m = hole(world)?.m ?? 4;
        return `M = ${m}: horizon r = ${2 * m}, photon sphere ${3 * m}, ISCO ${6 * m}. A circular orbit at 6M moves at ${f3(circularSpeed(m, 6 * m, true))} (dx/dτ) with its clock at ×${f3(circularClockRate(m, 6 * m))}.`;
      },
      equation: 'For a test particle with energy E and angular momentum L per unit mass, (dr/dτ)² = E² − V², V² = (1 − 2M/r)(1 + L²/r²). Circular orbits sit at extrema of V; the minimum and maximum merge at L² = 12M², r = 6M. The radial and angular frequencies satisfy ω_r²/Ω² = 1 − 6M/r, so the closest point advances by 2π[(1 − 6M/r)^(−½) − 1] per orbit for near-circular orbits, and by the elliptic integral for the rosette.',
      eq: ['(dr/dτ)² = E² − (1 − 2M/r)(1 + L²/r²)', 'ω_r² / Ω² = 1 − 6M/r'],
    },
    watch: advanceRows,
    exact: ['Test-particle orbits and clocks: the Schwarzschild geodesic in proper time, for one static mass.', 'The pins and the elliptic integral agree to a tenth of a degree (a test runs this scene).'],
    approx: ['RK4 steps of 1% of the local dynamical time; the measured advance carries that small step error.', '6πM/p is first order in M/p and badly low here, since M/r reaches about 1/8.'],
    myths: [sheetMyth],
    actions: [
      {
        label: 'Add the marbles',
        run: ({ world }) => {
          const m = hole(world)?.m ?? 4;
          world.addProbe(34, 0, 0, circularSpeed(m, 34, true), 'sheet');
          world.addProbe(0, 50, 0, 0, 'sheet');
        },
      },
    ],
    reading: ['C. Darwin (1959), “The gravity field of a particle”, Proc. R. Soc. A 249, 180.', 'J. M. Bardeen, W. H. Press & S. A. Teukolsky (1972), ApJ 178, 347.', 'C. A. Middleton & M. Langston (2014), Am. J. Phys. 82, 287.', 'C. M. Will (2014), “The confrontation between general relativity and experiment”, Living Rev. Relativ. 17, 4.'],
  },
  mercury: {
    title: 'Why this orbit doesn’t close',
    seeing: 'A particle started at r = 32M with the speed of a Newtonian ellipse a = 40M, e = 0.2. Blue keeps that ellipse; gold follows relativity, and its closest point moves on each time round. The pins mark each closest approach.',
    why: {
      words: 'In relativity the in-and-out swing of an orbit is a little slower than the trip round, so the orbit does not close and the closest point creeps forward.',
      numbers: ({ world }) => {
        const r = mercuryAdvance();
        const mr = world.pins.rmin < Infinity && hole(world) ? hole(world)!.m / world.pins.rmin : NaN;
        return `Here M/r at the closest point is ${Number.isFinite(mr) ? `1/${(1 / mr).toFixed(0)}` : 'about 1/32'}. Real Mercury has M/r = ${r.mOverR.toExponential(2)} at perihelion and advances ${r.perOrbit.toFixed(3)}″ per orbit, ${r.perCentury.toFixed(1)}″ per century.`;
      },
      equation: 'With u = 1/r the orbit obeys u″ + u = M/L² + 3Mu². The last term is the relativistic one. Treating it as a perturbation of the Kepler ellipse gives the advance Δφ = 6πM/p, p = a(1 − e²), at first order in M/p; the next term adds (3π/2)(18 + e²)(M/p)². The exact answer is an elliptic integral over the three roots of 2Mu³ − u² + 2Mu/L² + (E² − 1)/L².',
      eq: ['u″ + u = M/L² + 3Mu²', 'Δφ = 6πM/p + (3π/2)(18 + e²)(M/p)² + O((M/p)³)'],
    },
    watch: [
      ...advanceRows,
      { label: 'M/r at the closest point', value: ({ world }) => (world.pins.rmin < Infinity && hole(world) ? `1/${(world.pins.rmin / hole(world)!.m).toFixed(1)}` : null) },
    ],
    exact: ['The gold particle’s geodesic, and the elliptic integral it is compared with.', 'Newton’s 1/r potential closes every bound orbit (Bertrand’s theorem): turn GR off and the advance falls to zero.'],
    approx: ['6πM/p is the first term of a series in M/p; at M/p near 1/35 the second-order term is worth several degrees.', 'The scene exaggerates real Mercury’s M/r about a millionfold, which is what makes the advance visible.'],
    actions: [
      { label: 'Open the measure tool', run: (_c, app) => app.openMeasure() },
      { label: 'Restart with GR off', run: (_c, app) => app.restart(false) },
      { label: 'Restart with GR on', run: (_c, app) => app.restart(true) },
    ],
    reading: ['A. Einstein (1915), Sitzungsber. Preuss. Akad. Wiss., 831–839.', 'C. Darwin (1959), Proc. R. Soc. A 249, 180.', 'C. M. Will (2014), Living Rev. Relativ. 17, 4, on the measured perihelion shift.'],
  },
  clocks: {
    title: 'Three clocks',
    seeing: 'Round a hole of M = 4: clocks on circular orbits at 8M (r = 32) and 30M (r = 120), and one let go from rest at 25M (r = 100). The card’s “Distant observer” is coordinate time t. Times are in code units, G = c = 1 with unit mass, so this hole’s M is 4 of them.',
    why: {
      words: 'A clock deeper in the well runs slower, and moving costs a little more on top. The falling clock keeps ticking all the way down; only from far away does it seem to freeze.',
      numbers: ({ world }) => {
        const m = hole(world)?.m ?? 4;
        return `Parked at 8M a clock runs at ×${f3(lapse(-1 / 8))}; orbiting there at ×${f3(circularClockRate(m, 8 * m))}; orbiting at 30M at ×${f3(circularClockRate(m, 30 * m))}.`;
      },
      equation: 'On a circular geodesic dτ/dt = √(1 − 3M/r). It factors as the static lapse √(1 − 2M/r) times the Lorentz factor √(1 − v²) of the orbital speed a static observer measures, v² = M/(r − 2M). A fall from rest at R follows the cycloid r = (R/2)(1 + cos η), τ = √(R³/8M)(η + sin η): finite at r = 2M, while t diverges.',
      eq: ['dτ/dt = √(1 − 2M/r) · √(1 − M/(r − 2M)) = √(1 − 3M/r)', 'τ = √(R³/8M) (η + sin η)'],
    },
    watch: [
      { label: 'Distant time t', value: ({ world }) => f1(world.simTime) },
      ...['Close orbit, 8M', 'Wide orbit, 30M'].map(
        (label): Watch => ({
          label: `${label}: τ, and t·√(1 − 3M/r)`,
          value: ({ world }) => {
            const p = world.probes.find((q) => q.label === label);
            const h = hole(world);
            if (!p || !h) return null;
            const r = Math.hypot(p.x - h.x, p.y - h.y);
            return `${f1(clockReading(p))} · ${f1(world.simTime * circularClockRate(h.m, r))}`;
          },
        }),
      ),
      {
        label: 'Falling clock: τ, and the cycloid’s τ at its r',
        value: ({ world }) => {
          const p = world.probes.find((q) => q.label === 'Falling from rest');
          const h = hole(world);
          if (!p || !h) return null;
          return `${f1(clockReading(p))} · ${f1(radialFall(h.m, 100, Math.hypot(p.x - h.x, p.y - h.y)).tau)}`;
        },
      },
      { label: 'Removed at (r, τ, t)', value: ({ world }) => (world.lastCapture ? `${f3(world.lastCapture.r / world.lastCapture.m)}M · ${f1(world.lastCapture.tau)} · ${f1(world.lastCapture.t)}` : null) },
      {
        label: 'Its own time still to r = 2M',
        value: ({ world }) => {
          const c = world.lastCapture;
          return c ? `${f3(properTimeBetween(c.m, 2 * c.m, c.r, c.E2, c.L2))} (${f3(properTimeBetween(c.m, 2 * c.m, c.r, c.E2, c.L2) / c.m)}M)` : null;
        },
      },
    ],
    exact: ['Every clock here: geodesics of one Schwarzschild mass, with dt/dτ = E/(1 − 2M/r).'],
    approx: ['The falling clock is removed at the first step inside 2.04M, a few hundredths of M of its own time before the horizon. A chip appears when it happens.'],
    myths: [horizonMyth],
    reading: ['C. W. Misner, K. S. Thorne & J. A. Wheeler (1973), Gravitation, ch. 25 and 31.', 'M. D. Kruskal (1960), “Maximal extension of Schwarzschild metric”, Phys. Rev. 119, 1743.'],
  },
  binary: {
    title: 'Binary inspiral',
    seeing: 'Two M = 2 holes, 40 apart, with relativistic (1PN) motion and radiation reaction (2.5PN). The orbit shrinks, the 1PN correction is capped near the end, and the pair merges into a spinning remnant.',
    why: {
      words: 'Radiating waves carries energy away, so the orbit shrinks and speeds up. Close to merger the approximation stops working, and albe holds the correction back rather than let it blow up.',
      numbers: ({ world }) => {
        const [a, b] = world.bodies;
        if (!a || !b) return 'The pair has merged; the card gives the remnant.';
        const r = Math.hypot(a.x - b.x, a.y - b.y);
        return `Separation ${f1(r / (a.m + b.m))}M (total mass), so M/r = ${f3((a.m + b.m) / r)}. The 1PN cap first acts near 7.2M.`;
      },
      equation: 'Each pair feels the Einstein-Infeld-Hoffmann 1PN acceleration plus the leading radiation reaction. Orbit-averaged, the reaction gives Peters’ da/dt = −(64/5) m₁m₂M/a³ for a circular orbit, so a⁴ shrinks linearly and T = (5/256) a⁴/(m₁m₂M). The 1PN series is in M/r; where it exceeds half the Newtonian pull it is capped, which also removes the ISCO, so there is no plunge.',
      eq: ['da/dt = −(64/5) m₁m₂M / a³', 'T = (5/256) a⁴ / (m₁m₂M)'],
    },
    watch: [
      { label: 'Separation / M', value: ({ world }) => (world.bodies.length === 2 ? f3(Math.hypot(world.bodies[0].x - world.bodies[1].x, world.bodies[0].y - world.bodies[1].y) / (world.bodies[0].m + world.bodies[1].m)) : null) },
      { label: '1PN cap acting', value: ({ world }) => (world.bodies.length === 2 ? (world.capActive ? 'yes' : 'no') : null) },
      { label: 'Peters merger time', value: ({ world }) => (world.bodies.length === 2 ? f1(pairOrbit(world.bodies[0], world.bodies[1], true).mergerTime) : null) },
      {
        label: 'Midpoint: K both / K summed',
        value: ({ world }) => {
          const t = tidalInterference(world.bodies);
          return t ? `${(t.together / t.summed).toFixed(2)}×` : null;
        },
      },
      {
        label: 'Midpoint clock: √(1 + 2Φ), and its pull',
        value: ({ world }) => {
          if (world.bodies.length !== 2) return null;
          const [a, b] = world.bodies;
          const M = a.m + b.m;
          const x = (a.m * a.x + b.m * b.x) / M;
          const y = (a.m * a.y + b.m * b.y) / M;
          const out = { ax: 0, ay: 0 };
          probeAcceleration(x, y, 0, 0, world.bodies, false, out);
          return `×${f3(lapse(potential(x, y, world.bodies)))} · |a| = ${Math.hypot(out.ax, out.ay).toExponential(1)}`;
        },
      },
      { label: 'Midpoint clock placed: rate', value: ({ world }) => {
        const p = world.probes.find((q) => q.label === 'Midpoint clock');
        return p ? `×${f3(p.rate)}` : null;
      } },
    ],
    exact: ['Nothing for two holes: no exact moving two-body metric exists.', 'By symmetry the pull at the midpoint of equal masses is exactly zero in any of these approximations.'],
    approx: [
      '1PN motion, a series in M/r; capped at half Newton’s pull from about 7.2M, for the last 16% of this run, so the smooth shrink to 2M is the cap’s, not GR’s.',
      'Radiation at leading order (Peters 1964); the remnant from fits to numerical relativity.',
      'The particle clock placed at the midpoint shows a rate a little below √(1 + 2Φ): its clock mixes its own dx/dτ with the moving holes’ dx/dt, an error of relative order v².',
    ],
    myths: [slowClockMyth],
    actions: [{ label: 'Put a clock at the midpoint', run: ({ world }) => void world.addProbe(0, 0, 0, 0, 'follow', 'Midpoint clock') }],
    reading: ['A. Einstein, L. Infeld & B. Hoffmann (1938), Annals of Mathematics 39, 65.', 'P. C. Peters (1964), Phys. Rev. 136, B1224.', 'L. Blanchet (2014), Living Rev. Relativ. 17, 2.', 'D. A. Nichols et al. (2011), Phys. Rev. D 84, 124014 (tidal tendexes).'],
  },
  chirp: {
    title: 'Weigh a binary from its waves',
    seeing: 'Two holes, m₁ = 3 and m₂ = 1.2, spiralling in. The scope on the card plots the strain seen face-on. Tap two neighbouring crests or troughs early on, and two more later: the frequency and its rise give the chirp mass, as a detector would get it.',
    why: {
      words: 'As the orbit shrinks the waves come faster. How quickly the frequency rises depends on one combination of the masses, the chirp mass, so timing the crests weighs the binary.',
      numbers: ({ world }) => {
        const [a, b] = world.bodies;
        if (!a || !b) return 'The pair has merged.';
        const o = pairOrbit(a, b, true);
        const fgw = (1 / Math.PI) * Math.sqrt((a.m + b.m) / o.a ** 3);
        return `Wave frequency now about ${fgw.toExponential(2)} per unit time (twice the orbit’s), so v² = (πMf)^(2/3) = ${f3(Math.pow(Math.PI * (a.m + b.m) * fgw, 2 / 3))}.`;
      },
      equation: 'For a circular orbit the quadrupole luminosity is L = (32/5) μ²M³/a⁵ and the orbital energy −μM/2a. With πf = √(M/a³) the balance dE/dt = −L gives ḟ = (96/5) π^(8/3) ℳ^(5/3) f^(11/3), ℳ = (m₁m₂)^(3/5)/M^(1/5). Integrated, f^(−8/3) falls linearly in time, so two frequency readings any time apart give ℳ.',
      eq: ['ḟ = (96/5) π^(8/3) ℳ^(5/3) f^(11/3)', 'ℳ = (m₁m₂)^(3/5) / (m₁ + m₂)^(1/5)'],
    },
    watch: [
      { label: 'True chirp mass', value: () => f3(chirpMassOf(presetById('chirp').bodies[0].m, presetById('chirp').bodies[1].m)) },
      { label: 'Peters merger time', value: ({ world }) => (world.bodies.length === 2 ? f1(pairOrbit(world.bodies[0], world.bodies[1], true).mergerTime) : null) },
      { label: '1PN cap acting', value: ({ world }) => (world.bodies.length === 2 ? (world.capActive ? 'yes: readings now drift high' : 'no') : null) },
    ],
    exact: ['ℳ from f and ḟ is exact for the leading-order chirp; a test recovers it to ten digits from an ideal signal.'],
    approx: [
      'The orbit has 1PN terms that the leading-order formula assumes away, so a reading from crests marked before t ≈ 1200 comes out about 15% high, the same order as v² ≈ 0.1. That gap is real physics the formula leaves out, not noise.',
      'From about t = 1200 the 1PN cap acts, and readings that use later crests climb higher still.',
      'Strain is the quadrupole formula, scaled for display; the scope plots shape, not size.',
    ],
    reading: ['P. C. Peters (1964), Phys. Rev. 136, B1224.', 'C. Cutler & É. É. Flanagan (1994), Phys. Rev. D 49, 2658.', 'L. Blanchet (2014), Living Rev. Relativ. 17, 2, for the PN corrections to the phase.'],
  },
  solar: {
    title: 'Inner solar system',
    seeing: 'Mercury to Jupiter on true orbits round the Sun, with true mass ratios. Sizes are drawn far bigger than life.',
    why: {
      words: 'Planets orbit by Newton’s law to excellent accuracy here. What a mass is made of does not matter from outside it: only how much there is.',
      numbers: ({ world }) => {
        const c = compressedLimb(world.bodies);
        return c ? `The drawn ${c.body.name ?? 'star'} bends grazing light by ${f1(c.drawnDeg)}°; at its true size, ${c.trueArcsec?.toFixed(2) ?? '?'}″.` : 'No star on the sheet.';
      },
      equation: 'Outside a spherical mass the vacuum field is Schwarzschild (Birkhoff’s theorem), so an orbit cannot distinguish a star from a hole of equal mass. The grazing deflection at the limb is 4M/R at first order; with the drawn R the full Schwarzschild α̂ is used.',
      eq: ['α̂_limb ≈ 4M/R'],
    },
    watch: [
      {
        label: 'Earth’s semi-major axis',
        value: ({ world }) => {
          const e = world.bodies.find((b) => b.name === 'Earth');
          const c = world.bodies.reduce<Body | null>((h, b) => (!h || b.m > h.m ? b : h), null);
          return e && c ? f3(pairOrbit(e, c).a) : null;
        },
      },
      { label: 'Central mass is', value: ({ world }) => {
        const c = world.bodies.reduce<Body | null>((h, b) => (!h || b.m > h.m ? b : h), null);
        return c ? (isCompact(c) ? 'a black hole' : 'the Sun') : null;
      } },
    ],
    exact: ['Newtonian N-body orbits, to the integrator’s accuracy; the relativistic terms are switched off for stars and planets.'],
    approx: ['Radii compressed for display: bending and depth near the Sun are about 47,000× too large. The “Sizes compressed” chip gives the live figure.'],
    myths: [suckMyth],
    actions: [
      {
        label: 'Swap the Sun for a black hole',
        run: ({ world }) => {
          const sun = world.bodies.find((b) => b.name === 'Sun');
          if (!sun) return;
          sun.kind = 'bh';
          sun.radius = undefined;
          sun.color = undefined;
          sun.typeId = 'bh';
          sun.name = undefined;
        },
      },
    ],
    reading: ['G. D. Birkhoff (1923), Relativity and Modern Physics, Harvard University Press.', 'F. W. Dyson, A. S. Eddington & C. Davidson (1920), Phil. Trans. R. Soc. A 220, 291.'],
  },
};

/** The explainer for a scene: its own, or one assembled from the scene note and the view on screen. */
export function explainerFor(presetId: string, c: ExplainContext): Explainer {
  const own = EXPLAINERS[presetId];
  if (own) return own;
  const preset = presetById(presetId);
  const words = viewCopy(c.mode, 'words', c.world.bodies, 1);
  const numbers = viewCopy(c.mode, 'numbers', c.world.bodies, 1);
  const eq = viewCopy(c.mode, 'equation', c.world.bodies, 1);
  const chips = activeChips({ mode: c.mode, bodies: c.world.bodies, capActive: c.world.capActive, capture: c.world.lastCapture });
  const tagged = eq.tag.startsWith('exact') ? [eq.tag] : [];
  return {
    title: preset.name,
    seeing: preset.note,
    why: { words: words.body, numbers: numbers.body, equation: eq.body, eq: eq.eq ? [eq.eq] : undefined },
    watch: [],
    exact: tagged.length ? tagged : ['This view is not exact for this scene; see below.'],
    approx: [...(eq.tag.startsWith('exact') ? [] : [eq.tag]), ...chips.map((id) => chipText(id, 'words', { mode: c.mode, bodies: c.world.bodies, capActive: c.world.capActive, capture: c.world.lastCapture }).body)],
    reading: eq.ref ? [eq.ref] : [],
  };
}

export const hasOwnExplainer = (presetId: string): boolean => presetId in EXPLAINERS;

/** The self-paced challenges an explainer offers: each shows a physics result, not a score. */
export type ToyId = 'wind' | 'tightest' | 'merger' | 'potential' | 'kruskal' | 'gyro' | 'dust';

const TOYS: Record<string, ToyId[]> = { photon: ['wind'], lensing: ['wind'], single: ['potential', 'tightest'], binary: ['merger'], clocks: ['kruskal'], gyro: ['gyro'], dust: ['dust'] };

export const toysFor = (presetId: string): ToyId[] => TOYS[presetId] ?? [];

/** Whether to offer the "Not our universe" switches: a scene with test particles round a compact mass. */
export const offersWhatIf = (c: ExplainContext): boolean => c.world.probes.some((p) => p.model !== 'sheet') && c.world.bodies.some(isCompact);
