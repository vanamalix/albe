// public/_headers is generated from headers.config.ts on the @vanamalix/edge baseline. This keeps it from drifting.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { renderHeaders } from './headers.ts';

const text = readFileSync(new URL('../public/_headers', import.meta.url), 'utf8');
const csp = text.match(/Content-Security-Policy: (.+)/)![1];
const directive = (name: string) =>
  csp
    .split('; ')
    .find((d) => d.startsWith(`${name} `))
    ?.slice(name.length + 1);

describe('public/_headers', () => {
  it('is exactly what the edge baseline generates (run npm run headers after a change)', () => {
    expect(text).toBe(renderHeaders());
  });

  it("frames only the Shielded site and otherwise stays 'self'", () => {
    expect(directive('frame-src')).toBe('https://staticcdn.co.nz');
    for (const name of ['default-src', 'script-src', 'style-src', 'connect-src', 'font-src', 'worker-src']) {
      expect(directive(name)).toBe("'self'");
    }
    expect(directive('img-src')).toBe("'self' data: blob:");
    for (const name of ['frame-ancestors', 'form-action', 'base-uri', 'object-src']) {
      expect(directive(name)).toBe("'none'");
    }
    expect(text.match(/Content-Security-Policy:/g)).toHaveLength(1);
    expect(csp).not.toContain('unsafe');
  });

  it('keeps the baseline headers', () => {
    expect(text).toContain('X-Content-Type-Options: nosniff');
    expect(text).toContain('X-Frame-Options: DENY');
    expect(text).toContain('Referrer-Policy: no-referrer');
    expect(text).toContain('Permissions-Policy: camera=(), microphone=(), geolocation=(), interest-cohort=()');
  });

  it('stays out of search engines, and keeps the cache rules and HSTS scope', () => {
    expect(text).toContain('X-Robots-Tag: noindex, nofollow');
    expect(text).toMatch(/^\/assets\/\*\n {2}Cache-Control: public, max-age=31536000, immutable$/m);
    expect(text).toMatch(/^\/index\.html\n {2}Cache-Control: no-cache$/m);
    expect(text).toMatch(/Strict-Transport-Security: max-age=31536000$/m);
    expect(text).toContain('Cross-Origin-Opener-Policy: same-origin');
  });
});
