/**
 * The one thing a challenge may remember: a per-browser best value, in localStorage when the browser
 * allows it. Nothing else is stored, and the page works the same without it.
 */
export function readBest(key: string): number | null {
  try {
    const v = Number(window.localStorage.getItem(`albe.best.${key}`));
    return Number.isFinite(v) && v !== 0 ? v : null;
  } catch {
    return null;
  }
}

export function writeBest(key: string, v: number): void {
  try {
    window.localStorage.setItem(`albe.best.${key}`, String(v));
  } catch {
    // Storage blocked (private window, settings): the best lasts for this visit only.
  }
}
