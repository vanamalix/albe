const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };

/** 1.0 × 10⁻⁸ style, for small numbers on the challenge cards. */
export function sci(v: number, digits = 1): string {
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  const m = v / 10 ** e;
  const sup = String(e)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');
  return `${m.toFixed(digits)} × 10${sup}`;
}

export const deg = (rad: number): number => (rad * 180) / Math.PI;
