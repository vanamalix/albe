import { DEPTHS, setDepth, useDepth } from '../state/depth';

/** Words, Numbers or Equation: how deep the card and the explainers go. */
export function DepthSwitch() {
  const depth = useDepth();
  return (
    <div className="depth" role="group" aria-label="How much detail">
      {DEPTHS.map((d) => (
        <button key={d.id} aria-pressed={depth === d.id} className={depth === d.id ? 'on' : ''} onClick={() => setDepth(d.id)}>
          {d.label}
        </button>
      ))}
    </div>
  );
}
