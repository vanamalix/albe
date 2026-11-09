// src/ui/credit.css copies the credit and Shielded rules from @vanamalix/ui (its full stylesheet would restyle albe).
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const flat = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{};:,])\s*/g, '$1');

const pkg = flat(readFileSync(createRequire(import.meta.url).resolve('@vanamalix/ui/styles.css'), 'utf8'));
const local = readFileSync(new URL('../src/ui/credit.css', import.meta.url), 'utf8');
const copied = local.split('copied from @vanamalix/ui: start')[1].split('/* copied from @vanamalix/ui: end')[0].replace(/^ \*\//, '');
const rulesOf = (css: string) => (css.match(/[^{}]+\{[^{}]*\}/g) ?? []).map((r) => r.trim());
const rules = rulesOf(flat(copied));
const pkgRules = rulesOf(pkg).filter((r) => /vn-credit|vn-shielded|vn-sr-only/.test(r.split('{')[0]));

describe('src/ui/credit.css', () => {
  it('holds a real copy', () => {
    expect(rules.length).toBeGreaterThan(15);
  });

  it.each(rules)('matches the package: %s', (rule) => {
    expect(pkg).toContain(rule);
  });

  it.each(pkgRules)('has the package rule: %s', (rule) => {
    expect(rules).toContain(rule);
  });
});
