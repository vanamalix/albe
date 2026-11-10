/** The measure tool's two protractor arms, as angles from the orbit's centre (radians). */
import { useSyncExternalStore } from 'react';

let arms = { a: 0, b: Math.PI / 4 };
const listeners = new Set<() => void>();

export function setArm(which: 'a' | 'b', angle: number): void {
  arms = { ...arms, [which]: angle };
  listeners.forEach((l) => l());
}

export const getArms = () => arms;

export function useArms(): { a: number; b: number } {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => arms,
  );
}
