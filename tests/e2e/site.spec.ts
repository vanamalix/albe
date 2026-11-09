import { expect, test, type Page } from '@playwright/test';
import { axeViolations, shot } from '@vanamalix/testing/playwright';

const SHIELDED = 'https://staticcdn.co.nz';

/** Stands in for the Shielded frame and keeps the test off the real network. Returns the requests it saw. */
async function offline(page: Page) {
  const shielded: string[] = [];
  const blocked: string[] = [];
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => {
      const url = route.request().url();
      if (url.startsWith(SHIELDED)) {
        shielded.push(url);
        return route.fulfill({
          contentType: 'text/html',
          body: `<!doctype html><title>stand-in</title><button id="x">x</button><script>
            document.getElementById('x').onclick = () => parent.postMessage('closeModal', '*');
          </script>`,
        });
      }
      blocked.push(url);
      return route.abort();
    },
  );
  return { shielded, blocked };
}

function watch(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  return errors;
}

async function openAbout(page: Page) {
  await page.locator('.about-btn').click();
  await expect(page.locator('.modal')).toBeVisible();
}

for (const [name, width, height] of [
  ['phone', 390, 844],
  ['desktop', 1280, 800],
] as const) {
  test.describe(name, () => {
    test.use({ viewport: { width, height } });

    test('the scene renders with the real headers, no CSP errors and no third-party requests', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      const response = await page.goto('/');
      const csp = response?.headers()['content-security-policy'] ?? '';
      expect(csp).toContain(`frame-src ${SHIELDED}`);
      expect(csp).toContain("script-src 'self'");
      expect(csp).not.toContain('unsafe');
      expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
      await expect(page.locator('canvas').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'albe', level: 1 })).toBeVisible();
      await expect(page.locator('.status')).toContainText('fps');
      await page.waitForTimeout(1500);
      await shot(page, `scene-${name}`);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
      expect(net.shielded, 'nothing goes to Shielded before the button is pressed').toEqual([]);
    });

    test('How it works carries the credit and passes axe', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await openAbout(page);
      const credit = page.locator('.modal .site-foot .vn-credit');
      await expect(credit).toBeVisible();
      await expect(page.locator('.modal .site-foot .vn-shielded')).toBeVisible();
      // The logo's strokes need a variable the package's full stylesheet would set.
      await expect(credit.locator('.vn-credit__mark circle')).toHaveCSS('fill', 'rgb(28, 27, 24)');
      for (const [label, href] of [
        ['Site by vananomad', 'https://vananomad.com'],
        ['Angel Ora', 'https://angelora.nz'],
        ['Cloudflare', 'https://www.cloudflare.com'],
      ] as const) {
        const link = credit.locator(`a[href^="${href}"]`);
        await expect(link, label).toHaveAttribute('target', '_blank');
        await expect(link, label).toHaveAttribute('rel', 'external noopener noreferrer');
      }
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      await shot(page, `about-${name}`);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
      expect(net.shielded).toEqual([]);
    });

    test('without WebGL the page still carries the credit and passes axe', async ({ page }) => {
      await page.addInitScript('HTMLCanvasElement.prototype.getContext = () => null');
      const net = await offline(page);
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'albe needs WebGL' })).toBeVisible();
      await expect(page.locator('.site-foot .vn-credit')).toBeVisible();
      await expect(page.locator('.site-foot .vn-shielded')).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      await shot(page, `no-webgl-${name}`);
      expect(net.blocked).toEqual([]);
      expect(net.shielded).toEqual([]);
    });

    test('Shielded opens in a sandboxed frame and closes every way, leaving How it works open', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await openAbout(page);
      const open = page.locator('.modal .site-foot .vn-shielded');
      const dialog = page.locator('dialog.vn-shielded__dialog');
      const frame = dialog.locator('iframe');

      await open.click();
      await expect(dialog).toBeVisible();
      await expect(frame).toHaveAttribute('sandbox', 'allow-forms allow-scripts allow-same-origin allow-popups');
      await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
      await expect(frame).toHaveAttribute('src', SHIELDED);
      await expect.poll(() => net.shielded.length).toBeGreaterThan(0);
      await shot(page, `shielded-${name}`);

      // Only the Shielded origin can close it: the same message from this page is ignored.
      await page.evaluate("window.postMessage('closeModal', '*')");
      await page.waitForTimeout(100);
      await expect(dialog).toBeVisible();

      await dialog.locator('.vn-shielded__close').click();
      await expect(dialog).toBeHidden();
      await expect(frame).toHaveCount(0);
      await expect(open).toBeFocused();

      // Escape closes the Shielded dialog only, not the panel underneath.
      await open.click();
      await expect(dialog).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(frame).toHaveCount(0);
      await expect(open).toBeFocused();
      await expect(page.locator('.modal')).toBeVisible();

      await open.click();
      await expect(dialog).toBeVisible();
      await page.mouse.click(5, 5);
      await expect(dialog).toBeHidden();
      await expect(open).toBeFocused();
      await expect(page.locator('.modal')).toBeVisible();

      await open.click();
      await page.frameLocator('dialog.vn-shielded__dialog iframe').locator('#x').click();
      await expect(dialog).toBeHidden();
      await expect(frame).toHaveCount(0);
      await expect(page.locator('.modal')).toBeVisible();
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
    });
  });
}
