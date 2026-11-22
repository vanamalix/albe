import { describe, expect, it } from 'vitest';
import { fx } from './kit';

describe('fx, the exhibits’ number format', () => {
  it('prints finite values, ±∞ as infinity, and NaN as a dash rather than ∞', () => {
    expect(fx(1.23456)).toBe('1.23');
    expect(fx(2, 3)).toBe('2.000');
    expect(fx(Infinity)).toBe('∞');
    expect(fx(-Infinity)).toBe('−∞');
    expect(fx(NaN)).toBe('–');
    expect(fx(0 / 0, 1)).not.toContain('∞');
    expect(fx(NaN)).not.toContain('NaN');
  });
});
