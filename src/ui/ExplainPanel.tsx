/**
 * The scene's explainer: notes to read at your own pace while the scene keeps running. Loaded on
 * demand; a side panel on wide screens and a sheet on phones.
 */
import { explainerFor, resolve, type AppApi, type ExplainContext } from '../explain/content';
import { world } from '../sim/world';
import { loadPreset } from '../state/actions';
import { useDepth } from '../state/depth';
import { store, useStore } from '../state/store';
import { DepthSwitch } from './DepthSwitch';
import { IconClose } from './icons';

const app: AppApi = {
  restart: (gr) => {
    loadPreset(store.get().presetId);
    if (gr !== undefined) store.set({ gr });
  },
  openMeasure: () => store.set({ measureOpen: true, explainOpen: false, settingsOpen: false }),
};

export default function ExplainPanel() {
  useStore((s) => s.stats); // live numbers refresh with the stats
  const presetId = useStore((s) => s.presetId);
  const mode = useStore((s) => s.mode);
  const gr = useStore((s) => s.gr);
  const depth = useDepth();
  const c: ExplainContext = { world, depth, mode, gr };
  const e = explainerFor(presetId, c);
  const rows = e.watch.map((w) => ({ label: w.label, value: w.value(c) })).filter((r) => r.value !== null);
  return (
    <aside className="panel explain" aria-label={`Explain: ${e.title}`}>
      <header className="panel-head">
        <h2>Explain · {e.title}</h2>
        <button className="icon-btn" aria-label="Close explainer" onClick={() => store.set({ explainOpen: false })}>
          <IconClose />
        </button>
      </header>
      <div className="explain-body">
        <DepthSwitch />
        <h3>What you are seeing</h3>
        <p>{resolve(e.seeing, c)}</p>
        <h3>Why it happens</h3>
        <p>{resolve(e.why[depth], c)}</p>
        {depth === 'equation' && e.why.eq?.map((q) => <p key={q} className="eq">{q}</p>)}
        {rows.length > 0 && (
          <>
            <h3>Live numbers to watch</h3>
            <dl className="live">
              {rows.map((r) => (
                <div key={r.label}>
                  <dt>{r.label}</dt>
                  <dd>{r.value}</dd>
                </div>
              ))}
            </dl>
          </>
        )}
        <h3>Exact</h3>
        <ul className="plain">{e.exact.map((t, i) => <li key={i}>{resolve(t, c)}</li>)}</ul>
        <h3>Approximate, and why</h3>
        <ul className="plain">{e.approx.map((t, i) => <li key={i}>{resolve(t, c)}</li>)}</ul>
        {e.myths?.map((m) => (
          <div key={m.picture} className="myth">
            <h3>Common picture vs what GR says</h3>
            <p>
              <b>Picture:</b> {m.picture}
            </p>
            <p>
              <b>GR:</b> {resolve(m.gr, c)}
            </p>
          </div>
        ))}
        {e.actions && (
          <div className="explain-actions">
            {e.actions.map((a) => (
              <button key={a.label} className="btn small" onClick={() => a.run(c, app)}>
                {a.label}
              </button>
            ))}
          </div>
        )}
        {e.reading.length > 0 && (
          <>
            <h3>Further reading</h3>
            <ol className="refs">{e.reading.map((r) => <li key={r}>{r}</li>)}</ol>
          </>
        )}
      </div>
    </aside>
  );
}
