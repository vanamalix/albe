/**
 * "Why is this approximate?" chips, shown just above the dock while (and only while) an
 * approximation is on screen. Each opens a short note at the chosen depth. Loaded on demand.
 */
import { useEffect, useRef, useState } from 'react';
import { activeChips, chipText, type ChipContext, type ChipId } from '../physics/approx';
import { world, type Capture } from '../sim/world';
import { useDepth } from '../state/depth';
import { useStore } from '../state/store';
import { IconClose } from './icons';

/** A horizon removal stays explained this long, in real seconds. */
const CAPTURE_SHOWN_S = 15;

export default function Chips() {
  useStore((s) => s.stats);
  const mode = useStore((s) => s.mode);
  const depth = useDepth();
  const [open, setOpen] = useState<ChipId | null>(null);
  const seen = useRef<{ capture: Capture | null; at: number }>({ capture: null, at: 0 });
  const now = performance.now();
  if (world.lastCapture !== seen.current.capture) seen.current = { capture: world.lastCapture, at: now };
  const capture = seen.current.capture && now - seen.current.at < CAPTURE_SHOWN_S * 1000 ? seen.current.capture : null;
  const ctx: ChipContext = { mode, bodies: world.bodies, capActive: world.capActive, capture };
  const ids = mode === 'warp' ? [] : activeChips(ctx);
  // A chip that has gone keeps its note only while it is still true.
  useEffect(() => {
    if (open && !ids.includes(open)) setOpen(null);
  });
  if (!ids.length) return null;
  const text = open && ids.includes(open) ? chipText(open, depth, ctx) : null;
  return (
    <div className="chips">
      {text && (
        <section className="chip-note card" aria-label={`Why is this approximate: ${text.label}`}>
          <header>
            <h2>{text.label}</h2>
            <button className="icon-btn" aria-label="Close note" onClick={() => setOpen(null)}>
              <IconClose />
            </button>
          </header>
          <p>{text.body}</p>
          {text.eq && <p className="eq">{text.eq}</p>}
          {text.order && (
            <p>
              <b>Neglected:</b> {text.order}
            </p>
          )}
          {text.source && (
            <p>
              <b>Source:</b> {text.source}
            </p>
          )}
          {text.error && (
            <p>
              <b>Estimated error:</b> {text.error}
            </p>
          )}
        </section>
      )}
      <div className="chip-row" role="group" aria-label="Why is this approximate?">
        {ids.map((id) => (
          <button key={id} className={`chip ${open === id ? 'on' : ''}`} aria-expanded={open === id} onClick={() => setOpen(open === id ? null : id)}>
            <span className="dot approx" aria-hidden="true" />
            {chipText(id, 'words', ctx).label}
          </button>
        ))}
      </div>
    </div>
  );
}
