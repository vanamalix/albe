/** The waveform cursor's marks: times of extrema the visitor picked on the strain scope. */
import { useSyncExternalStore } from 'react';
import { readChirp, type ChirpReading } from '../physics/chirp';

let marks: number[] = [];
/** Half-periods between marks 2i and 2i + 1, counted when the second of the pair is placed. */
let halves: number[] = [];
let version = 0;
const listeners = new Set<() => void>();
const emit = () => {
  version++;
  listeners.forEach((l) => l());
};

export function addMark(t: number, extremaTimes: readonly number[]): void {
  if (marks.length >= 4) {
    marks = [];
    halves = [];
  }
  if (marks.length % 2 === 1) {
    const a = marks[marks.length - 1];
    if (Math.abs(t - a) < 1e-6) return;
    const [lo, hi] = a < t ? [a, t] : [t, a];
    marks[marks.length - 1] = lo;
    marks.push(hi);
    halves.push(Math.max(1, extremaTimes.filter((x) => x > lo + 1e-6 && x < hi - 1e-6).length + 1));
  } else marks.push(t);
  emit();
}

export function clearMarks(): void {
  marks = [];
  halves = [];
  emit();
}

export const getMarks = (): { marks: readonly number[]; halves: readonly number[] } => ({ marks, halves });
export function chirpReading(): ChirpReading {
  // Pairs may be marked in either order; the reading wants the earlier pair first.
  if (marks.length >= 4 && marks[2] + marks[3] < marks[0] + marks[1]) return readChirp([marks[2], marks[3], marks[0], marks[1]], [halves[1], halves[0]]);
  return readChirp(marks, halves);
}

export function useMarks(): number {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
  );
}
