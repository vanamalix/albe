/** Scene loading shared by the app and the guided lessons (no rendering imports, so tests can use it). */
import { presetById } from '../physics/presets';
import { world } from '../sim/world';
import { openExhibit } from './exhibit';
import { store } from './store';

export function loadPreset(id: string): void {
  const p = presetById(id);
  world.loadPreset(p);
  const st = p.settings;
  openExhibit(st.exhibit ?? null);
  store.set((s) => ({
    presetId: p.id,
    note: p.note,
    timeScale: st.timeScale,
    mode: st.mode ?? s.mode,
    gr: st.gr ?? s.gr,
    gw: st.gw ?? false,
    pn: st.pn ?? true,
    rings: st.rings ?? s.rings,
    playing: !st.paused,
    darkMatter: true,
    selectedId: null,
    scenesOpen: false,
  }));
}
