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

/** Opens a scene, then its explainer, and returns the named section of it. */
async function openExplain(page: Page, scene: RegExp, section: string) {
  await page.locator('.scene-btn').click();
  await page.locator('.scene-menu').getByRole('button', { name: scene }).click();
  await page.locator('.scene-btn').click();
  await page.locator('.scene-actions').getByRole('button', { name: 'Explain' }).click();
  const region = page.locator('.panel.explain').getByRole('region', { name: section });
  await expect(region).toBeVisible();
  return region;
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

    test('the Tidal and Lens shaders compile and run with no errors', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const title = page.locator('.info-title');
      for (const [presses, name] of [[2, /Tidal/], [3, /Lens/]] as const) {
        for (let i = 0; i < presses; i++) await page.keyboard.press('v');
        await expect(title).toContainText(name);
        await page.waitForTimeout(1200);
      }
      await shot(page, `lens-${name}`);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
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

    test('the lazily loaded warp panel and exhibits arrive with no errors', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const info = page.locator('.info');
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Alcubierre warp bubble/ }).click();
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      await expect(info.getByRole('group', { name: 'What the warp sheet shows' })).toBeVisible();
      for (const [scene, region] of [
        [/Ellis wormhole/, 'Wormhole controls'],
        [/Frame dragging/, 'Kerr black hole controls'],
      ] as const) {
        await page.locator('.scene-btn').click();
        await page.locator('.scene-menu').getByRole('button', { name: scene }).click();
        const toggle = page.locator('.exhibit-toggle');
        await expect(page.locator('.exhibit-dock')).toBeAttached();
        if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
        await expect(page.getByRole('region', { name: region })).toBeVisible();
        await page.waitForTimeout(800);
      }
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
    });

    test('a lazy part that fails to load (a redeploy, or offline) shows a reload message and leaves the app working', async ({ page }) => {
      test.setTimeout(150_000);
      const uncaught: string[] = [];
      page.on('pageerror', (e) => uncaught.push(String(e)));
      await offline(page);
      // As after a redeploy: these hashed chunks of the old build are gone.
      const gone = /\/assets\/(Kruskal|About|DeepExhibits)-[\w-]+\.js$/;
      const refused: string[] = [];
      await page.route(gone, (route) => {
        refused.push(route.request().url());
        return route.abort();
      });
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');

      // A toy inside Explain: the message takes its place; the rest of the explainer stays.
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Black hole clocks/ }).click();
      await page.locator('.scene-btn').click();
      await page.locator('.scene-actions').getByRole('button', { name: 'Explain' }).click();
      const explain = page.locator('.panel.explain');
      await expect(explain.locator('.load-failed')).toHaveText(/This part didn’t load\. Reload the page\./);
      await expect(explain.locator('.load-failed').getByRole('button', { name: 'Reload' })).toBeVisible();
      await expect(explain.getByRole('heading', { name: /Explain · / })).toBeVisible();
      await expect(explain.getByRole('region', { name: 'Kruskal and Penrose diagram' })).toHaveCount(0);
      await expect(page.locator('.load-notice')).toHaveCount(0);
      expect(await axeViolations(page)).toEqual([]);
      await shot(page, `load-failed-${name}`);
      await page.getByRole('button', { name: 'Close explainer' }).click();

      // A whole panel (How it works): nowhere to show it in place, so the page-wide notice says so.
      await page.locator('.about-btn').click();
      const notice = page.locator('.load-notice');
      await expect(notice).toHaveText(/didn’t load\. Reload the page\./);
      await expect(page.locator('.modal')).toHaveCount(0);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);

      // Inside the 3D view: the exhibit is missing, and the rest of the app still runs.
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Black hole shadow/ }).click();
      await expect(page.locator('.exhibit-dock')).toBeAttached();
      await expect(page.locator('canvas').first()).toBeVisible();
      await expect(page.getByRole('heading', { name: 'albe', level: 1 })).toBeVisible();
      const play = page.locator('.dock .icon-btn.play');
      const before = await play.getAttribute('aria-label');
      await play.click();
      await expect(play).not.toHaveAttribute('aria-label', before ?? '');
      await expect(notice).toBeVisible();

      expect(refused.length).toBeGreaterThan(0);
      expect(uncaught).toEqual([]);
      await notice.getByRole('button', { name: 'Reload' }).click();
      await expect(page.locator('.status')).toContainText('fps');
      await expect(page.locator('.load-notice')).toHaveCount(0);
      expect(uncaught).toEqual([]);
    });

    test('Euclid: switching off postulate 5 bends the angle sum, and the folds are measured the same way', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Euclid’s postulates/ }).click();
      await expect(page.locator('.exhibit-dock')).toBeAttached();
      const toggle = page.locator('.exhibit-toggle');
      if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      const panel = page.getByRole('region', { name: 'Euclid’s postulates controls' });
      await expect(panel).toBeVisible();
      const row = (name: string | RegExp) => panel.locator('.live div').filter({ hasText: name }).locator('dd');
      await expect(row(/^Sum/)).toHaveText('180.00°');
      await panel.locator('label.toggle', { hasText: '5. One parallel' }).click();
      await expect(panel.getByRole('button', { name: 'Hyperbolic', pressed: true })).toBeVisible();
      const sum = parseFloat((await row(/^Sum/).textContent()) ?? '');
      expect(sum).toBeLessThan(180);
      // The excess equals the enclosed curvature (Gauss-Bonnet), both shown.
      const excess = parseFloat((await row(/Excess/).textContent()) ?? '');
      const curvature = parseFloat((await row(/∫K dA inside/).textContent()) ?? '');
      expect(Math.abs(excess - curvature)).toBeLessThan(0.02);
      // A vertex moves by keyboard.
      await panel.getByRole('button', { name: /Vertex C/ }).focus();
      await page.keyboard.press('ArrowUp');
      await expect.poll(async () => parseFloat((await row(/^Sum/).textContent()) ?? '')).not.toBe(sum);
      await panel.getByRole('button', { name: 'Black hole slice' }).click();
      await expect(panel).toContainText('Isotropic chart, M = 1');
      // The explainer and the controls share a side: opening one steps the other aside, and back.
      await page.locator('.scene-btn').click();
      await page.locator('.scene-actions').getByRole('button', { name: 'Explain' }).click();
      await expect(page.locator('.panel.explain').getByRole('heading', { name: /Explain · Euclid’s postulates/ })).toBeVisible();
      await expect(panel).toBeHidden();
      if (await toggle.isVisible()) {
        await toggle.click();
        await expect(page.locator('.panel.explain')).toBeHidden();
      } else await page.keyboard.press('Escape');
      await expect(panel).toBeVisible();
      expect(parseFloat((await row(/Excess/).textContent()) ?? '')).toBeLessThan(0);
      await panel.getByRole('button', { name: 'Warp slice' }).click();
      await expect(row(/^Sum/)).toHaveText('180.00°');
      const p4 = panel.locator('label.toggle', { hasText: '4. All right angles' });
      await p4.click();
      await expect(panel).toContainText('Same ruler turned 45°');
      await expect(panel.getByRole('checkbox', { name: /4\. All right angles/ })).not.toBeChecked();
      await p4.click();
      await page.waitForTimeout(600);
      await shot(page, `euclid-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
    });

    test('Two balanced holes: the exit-angle plot zooms in and keeps finding changes of fate', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Two balanced holes/ }).click();
      await expect(page.locator('.exhibit-dock')).toBeAttached();
      const toggle = page.locator('.exhibit-toggle');
      if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
      const panel = page.getByRole('region', { name: 'Balanced holes controls' });
      await expect(panel).toContainText('extremal');
      const changes = panel.locator('.live div').filter({ hasText: 'Changes of fate' }).locator('dd');
      await expect(changes).toHaveText(/^\d+$/, { timeout: 20_000 });
      expect(Number(await changes.textContent())).toBeGreaterThan(2);
      await panel.getByRole('button', { name: 'Zoom in at the centre' }).click();
      await expect(panel.locator('.live div').filter({ hasText: 'Window width' }).locator('dd')).toHaveText('2.00e+0 M');
      await expect(changes).toHaveText(/^\d+$/, { timeout: 20_000 });
      await shot(page, `balanced-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
    });

    test('Gyroscope, Kruskal diagram, dust ring and effective potential: each toy draws and reads out', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const dd = (toy: ReturnType<Page['locator']>, name: string | RegExp) => toy.locator('.live div').filter({ hasText: name }).locator('dd');

      const gyro = await openExplain(page, /Gyroscope round a hole/, 'Gyroscope round a hole');
      await expect(gyro.locator('svg.gyro-plan')).toBeVisible();
      await expect(dd(gyro, 'Slice transport per loop')).toHaveText('48.23°');
      await expect(dd(gyro, 'Gyroscope per orbit')).toHaveText('75.40°');
      await expect(dd(gyro, /GP-B: GR prediction/)).toContainText('6606.1 · 6601.8 ± 18.3');
      await gyro.getByLabel('Orbit radius').fill('12');
      await gyro.getByRole('button', { name: 'Launch at this radius' }).click();
      await expect(dd(gyro, /Orbits flown/)).toBeVisible();
      await shot(page, `gyro-${name}`);
      expect(await axeViolations(page)).toEqual([]);

      const kruskal = await openExplain(page, /Black hole clocks/, 'Kruskal and Penrose diagram');
      await expect(kruskal.locator('svg.kruskal')).toBeVisible();
      await expect(dd(kruskal, /at r = 0/)).toContainText('555.4');
      await kruskal.getByRole('button', { name: 'Release at t = 0' }).click();
      await shot(page, `kruskal-${name}`);
      expect(await axeViolations(page)).toEqual([]);

      const dust = await openExplain(page, /Dust ring/, 'Dust ring');
      await expect(dust.locator('svg.bars')).toBeVisible();
      await expect(dd(dust, /Volume, predicted/)).toHaveText(/^×1\.0\d\d$/);
      await shot(page, `dust-${name}`);
      expect(await axeViolations(page)).toEqual([]);

      const pot = await openExplain(page, /Single black hole/, 'Effective potential and epicycles');
      await expect(pot.locator('canvas.potential-plot')).toBeVisible();
      await pot.getByLabel('Angular momentum L').fill('4.2');
      await expect(dd(pot, 'Circular orbit for this L')).toHaveText('13.81 M');
      await expect(dd(pot, /Predicted advance/)).toHaveText('118.7°');
      await pot.getByRole('button', { name: 'Launch near-circular at this L' }).click();
      await expect(dd(pot, /Exact for the orbit launched/)).toHaveText(/^\d+\.\d°$/);
      await shot(page, `potential-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
    });

    test('Shadow, microlensing, expanding universe and collapse: each exhibit draws, reads out and explains itself', async ({ page }) => {
      test.setTimeout(150_000);
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const open = async (scene: RegExp, region: string) => {
        await page.locator('.scene-btn').click();
        await page.locator('.scene-menu').getByRole('button', { name: scene }).click();
        await expect(page.locator('.exhibit-dock')).toBeAttached();
        const toggle = page.locator('.exhibit-toggle');
        if ((await toggle.isVisible()) && (await toggle.getAttribute('aria-expanded')) === 'false') await toggle.click();
        const panel = page.getByRole('region', { name: region });
        await expect(panel).toBeVisible();
        return panel;
      };
      const dd = (panel: ReturnType<Page['locator']>, name: string | RegExp) => panel.locator('.live div').filter({ hasText: name }).locator('dd');

      const shadow = await open(/Black hole shadow/, 'Black hole shadow controls');
      await expect(shadow.locator('svg.shadow-plan')).toBeVisible();
      await shadow.getByLabel('Spin a / M').fill('0');
      await expect(dd(shadow, 'Width × height')).toHaveText('10.392 × 10.392 M');
      await expect(dd(shadow, 'Lyapunov')).toHaveText('3.142 … 3.142');
      await shadow.getByRole('button', { name: 'Fastest spin, edge-on' }).click();
      await expect(dd(shadow, 'Width × height')).toHaveText('9.108 × 10.392 M');
      await expect(dd(shadow, 'M87*: EHT ring')).toHaveText('42 ± 3 μas');
      await shot(page, `shadow-${name}`);
      expect(await axeViolations(page)).toEqual([]);

      const lens = await open(/Microlensing/, 'Microlensing controls');
      await expect(dd(lens, /Closest approach/)).toHaveText('0.282 θ_E');
      await expect(dd(lens, 'Point lens peak')).toHaveText('3.653');
      await lens.getByRole('button', { name: /Track handle/ }).focus();
      await page.keyboard.press('ArrowUp');
      await expect(dd(lens, /Closest approach/)).toHaveText('0.301 θ_E');
      await lens.getByRole('button', { name: 'A planet: q = 0.001' }).click();
      await expect(lens).toContainText('rays per pixel unlensed', { timeout: 30_000 });
      await expect(dd(lens, 'Images now')).toHaveText(/^[35]$/);
      await shot(page, `microlens-${name}`);
      expect(await axeViolations(page)).toEqual([]);

      const frw = await open(/Expanding universe/, 'Expanding universe controls');
      await expect(dd(frw, 'Age today')).toHaveText('13.791 Gyr');
      await expect(dd(frw, /faster than light today beyond/)).toHaveText('z = 1.482');
      await expect(dd(frw, /recession now/)).toHaveText(/^1\.19\dc · 1\.20\dc$/);
      await frw.getByRole('button', { name: 'Comoving distance' }).click();
      await frw.getByRole('button', { name: 'Einstein-de Sitter' }).click();
      await expect(dd(frw, 'Age today')).toHaveText('9.672 Gyr');
      await expect(dd(frw, /Event horizon then/)).toHaveText('none');
      await frw.getByRole('button', { name: 'de Sitter', exact: true }).click();
      await expect(dd(frw, 'Age today')).toHaveText('∞ (no beginning)');
      await frw.getByRole('button', { name: 'Planck 2018' }).click();
      await shot(page, `universe-${name}`);
      expect(await axeViolations(page)).toEqual([]);

      const os = await open(/Collapse to a black hole/, 'Collapse controls');
      await expect(os.locator('svg.collapse-plan')).toBeVisible();
      await expect(dd(os, 'Event horizon forms at the centre')).toHaveText('τ = 30.57 M');
      await expect(dd(os, 'Surface crosses r = 2M')).toHaveText('τ = 33.70 M');
      await os.getByLabel('Dust’s proper time τ').fill('0.3');
      await expect(dd(os, 'Event horizon r')).toHaveText('not yet formed');
      await shot(page, `collapse-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      // The explainer, at Equation depth by default, with its references.
      await page.locator('.scene-btn').click();
      await page.locator('.scene-actions').getByRole('button', { name: 'Explain' }).click();
      const ex = page.locator('.panel.explain');
      await expect(ex.getByRole('heading', { name: /Explain · Collapse to a black hole/ })).toBeVisible();
      await expect(ex).toContainText('π − 3χ₀');
      await expect(ex).toContainText('Oppenheimer & H. Snyder (1939)');
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
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

    test('the depth switch changes the card, is remembered, and the page works without storage', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const info = page.locator('.info');
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      await expect(info.getByRole('button', { name: 'Equation', pressed: true })).toBeVisible();
      await expect(info.locator('.eq')).toBeVisible();
      await info.getByRole('button', { name: 'Words' }).click();
      await expect(info.locator('.eq')).toHaveCount(0);
      await expect(info.locator('.info-title')).toHaveText('Space curvature');
      await info.getByRole('button', { name: 'Numbers' }).click();
      await expect(info.locator('.info-body > p').first()).toContainText('not 3M');
      await page.reload();
      await expect(page.locator('.status')).toContainText('fps');
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      await expect(info.getByRole('button', { name: 'Numbers', pressed: true })).toBeVisible();
      expect(await axeViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('blocked storage: the card still defaults to Equation and switching still works', async ({ page }) => {
      const errors = watch(page);
      await page.addInitScript("Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } })");
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const info = page.locator('.info');
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      await expect(info.getByRole('button', { name: 'Equation', pressed: true })).toBeVisible();
      await info.getByRole('button', { name: 'Words' }).click();
      await expect(info.getByRole('button', { name: 'Words', pressed: true })).toBeVisible();
      expect(errors).toEqual([]);
    });

    test('Explain opens beside the running scene, with live numbers, and passes axe', async ({ page }) => {
      const errors = watch(page);
      const net = await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Black hole clocks/ }).click();
      await page.locator('.scene-btn').click();
      await page.locator('.scene-actions').getByRole('button', { name: 'Explain' }).click();
      const panel = page.locator('.panel.explain');
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('heading', { name: /Explain · Three clocks/ })).toBeVisible();
      await expect(panel.getByRole('heading', { name: 'Common picture vs what GR says' })).toBeVisible();
      const t0 = await panel.locator('dd').first().textContent();
      await page.waitForTimeout(1500);
      // The scene keeps running while the explainer is open.
      await expect.poll(async () => panel.locator('dd').first().textContent()).not.toBe(t0);
      await panel.getByRole('button', { name: 'Words' }).click();
      await expect(panel.locator('.eq')).toHaveCount(0);
      await shot(page, `explain-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      await page.keyboard.press('Escape');
      await expect(panel).toBeHidden();
      expect(errors).toEqual([]);
      expect(net.blocked).toEqual([]);
    });

    test('the measure tool: pins, a protractor moved by keyboard, and the app’s values on request', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Mercury precession/ }).click();
      const info = page.locator('.info');
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      await info.getByRole('button', { name: 'Measure the advance' }).click();
      const panel = page.locator('.panel.measure');
      await expect(panel).toBeVisible();
      await expect(panel.locator('svg.plan')).toBeVisible();
      const reading = panel.locator('dd').first();
      await expect(reading).toHaveText('45.0°');
      const arm = panel.getByRole('slider', { name: 'Second arm, angle' });
      await arm.focus();
      for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
      await expect(reading).toHaveText('35.0°');
      await panel.getByRole('button', { name: 'Show the app’s values' }).click();
      await expect(panel).toContainText(/Two closest approaches are needed|Advance from the pins/);
      await shot(page, `measure-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('approximation chips appear with their approximation, and the wave cursor reads f', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      await expect(page.locator('.chip')).toHaveCount(0);
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Binary inspiral/ }).click();
      await page.locator('.segmented').getByRole('button', { name: 'Lens' }).click();
      const chip = page.getByRole('button', { name: 'Lens: angles added' });
      await expect(chip).toBeVisible();
      await chip.click();
      const note = page.getByRole('region', { name: /Why is this approximate: Lens/ });
      await expect(note).toContainText('Neglected:');
      await expect(note).toContainText('Estimated error:');
      await shot(page, `chips-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Gravitational waves/ }).click();
      const info = page.locator('.info');
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      // Software WebGL runs slowly: keep trying until two extrema have been emitted.
      await expect(async () => {
        await info.getByRole('button', { name: 'Mark newest pair' }).click();
        await expect(info.locator('.scope dl')).toContainText('f, first pair', { timeout: 1000 });
      }).toPass({ timeout: 40_000 });
      expect(errors).toEqual([]);
    });

    test('Wind the light counts turns with the app’s integrator, and withholds the count past its tolerance', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const toy = await openExplain(page, /Photon sphere/, 'Wind the light');
      const k = toy.getByLabel('|b − b_c| / b_c');
      await k.fill('-8');
      const row = (name: string | RegExp) => toy.locator('.live div').filter({ hasText: name }).locator('dd');
      await expect(row('Turns counted (RK4)')).toContainText(/^3\.368/);
      await expect(row('Exact, π + α̂(b)')).toHaveText('3.3680');
      await expect(row(/Gained since an aim/)).toHaveText('1.0000 turn');
      await k.fill('-11');
      await expect(row('Turns counted (RK4)')).toHaveText('not counted');
      await expect(row('Exact, π + α̂(b)')).toHaveText('4.4674');
      await toy.getByRole('button', { name: 'Just inside' }).click();
      await expect(row('The ray')).toHaveText('falls in');
      await k.fill('-8');
      await expect(row('Turns counted (RK4)')).toContainText(/^3\.1499/);
      await toy.getByRole('button', { name: 'Fire it in the scene' }).click();
      await shot(page, `wind-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(await page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')).toBe(true);
      expect(errors).toEqual([]);
    });

    test('Tightest stable orbit: a nudged start falls in at 6.3M, survives at 6.5M, and theory puts the edge at 6.388M', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const toy = await openExplain(page, /Single black hole/, 'Tightest stable orbit');
      const r = toy.getByLabel('Start radius');
      const run = toy.locator('.live div').filter({ hasText: 'Run (app’s RK4)' }).locator('dd');
      await r.fill('6.3');
      await toy.getByRole('button', { name: 'Launch with the nudge' }).click();
      await expect(run).toContainText('falls in');
      await expect(toy).toContainText('Effective potential says');
      await r.fill('6.5');
      await toy.getByRole('button', { name: 'Launch with the nudge' }).click();
      await expect(run).toContainText('survives 5 turns');
      await expect(toy.locator('.live div').filter({ hasText: 'Smallest r that survived on this browser' }).locator('dd')).toHaveText('6.50 M');
      await toy.getByRole('button', { name: /where theory puts the edge/ }).click();
      await expect(toy).toContainText('r = 6.388 M');
      await shot(page, `tightest-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('Hit a merger time: a run at 35.8 sits beside Peters’ 2005, with the gap broken down', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const toy = await openExplain(page, /Binary inspiral/, 'Hit a merger time');
      await toy.getByRole('button', { name: '2,000' }).click();
      await toy.getByLabel('Separation').fill('35.8');
      await toy.getByRole('button', { name: 'Run to merger' }).click();
      const row = (name: string | RegExp) => toy.locator('.live div').filter({ hasText: name }).locator('dd');
      await expect(row('Merged at (this run)')).toHaveText(/^\d+$/, { timeout: 30_000 });
      await expect(row(/Peters, circular/)).toHaveText('2005');
      await expect(row(/From 6M to contact/)).toBeVisible();
      await expect(toy).toContainText('Where the gap comes from');
      await shot(page, `merger-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('Not our universe: a changed force law shows its apsis angle and a chip, and goes back', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      const panel = await openExplain(page, /Mercury precession/, 'Not our universe');
      await expect(page.getByRole('button', { name: 'Not our universe' })).toHaveCount(0);
      await panel.getByLabel('F ∝ 1/rⁿ, n').fill('2.5');
      await expect(panel.locator('.live div').filter({ hasText: 'near-circular' }).locator('dd')).toHaveText('254.56°');
      await expect(panel.locator('.live div').filter({ hasText: 'Every bound orbit closes' }).locator('dd')).toHaveText('no');
      await panel.getByLabel('(c/c′)²').fill('2');
      await expect(panel.locator('.live div').filter({ hasText: 'ISCO, 6sM' }).locator('dd')).toHaveText('12.00 M');
      const chip = page.locator('.chip.fiction');
      await expect(chip).toBeVisible();
      await page.keyboard.press('Escape');
      await chip.click();
      await expect(page.locator('.panel.explain')).toBeHidden();
      const note = page.getByRole('region', { name: 'Not our universe: what is changed' });
      await expect(note).toContainText('F ∝ 1/r^2.50');
      await shot(page, `not-ours-${name}`);
      expect(await axeViolations(page)).toEqual([]);
      await note.getByRole('button', { name: 'Back to our universe' }).click();
      await expect(chip).toHaveCount(0);
      expect(errors).toEqual([]);
    });

    test('Listen: no AudioContext until pressed, then the strain plays with its mass stated', async ({ page }) => {
      const errors = watch(page);
      await offline(page);
      // Counts AudioContexts made: there must be none until Listen is pressed.
      await page.addInitScript(`
        window.__audioContexts = 0;
        const Real = window.AudioContext;
        window.AudioContext = class extends Real {
          constructor(o) {
            super(o);
            window.__audioContexts++;
          }
        };
      `);
      await page.goto('/');
      await expect(page.locator('.status')).toContainText('fps');
      await page.locator('.scene-btn').click();
      await page.locator('.scene-menu').getByRole('button', { name: /Gravitational waves/ }).click();
      const info = page.locator('.info');
      if (!(await info.evaluate((el) => el.classList.contains('open')))) await page.locator('.info-head').click();
      const listen = info.locator('.listen');
      await expect(listen).toContainText('Assumes one unit of mass is 20 M☉, so this pair is 60 + 24 M☉');
      await expect(listen).toContainText('Loudness is normalised');
      expect(await page.evaluate('window.__audioContexts')).toBe(0);
      await page.waitForTimeout(1500);
      await listen.getByRole('button', { name: 'Listen' }).click();
      await expect(listen.locator('.ref')).toContainText(/Clip: \d\.\d\d s(, rising from \d+ to \d+ Hz|, too short yet)|No signal/);
      expect(await page.evaluate('window.__audioContexts')).toBe(1);
      await listen.getByRole('button', { name: '5 M☉' }).click();
      await expect(listen).toContainText('4× higher and 4× shorter');
      expect(await axeViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
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

test.describe('phone readout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('a tap in the View tool pins the readout, with M/r, until it is closed', async ({ page }) => {
    const errors = watch(page);
    await offline(page);
    await page.goto('/');
    await expect(page.locator('.status')).toBeAttached();
    await page.waitForTimeout(1000);
    const canvas = page.locator('canvas').first();
    const box = (await canvas.boundingBox())!;
    await page.touchscreen.tap(box.x + box.width * 0.55, box.y + box.height * 0.45);
    const readout = page.locator('.readout');
    await expect(readout).toBeVisible();
    await expect(readout).toContainText('M/r');
    await page.waitForTimeout(500);
    await expect(readout).toBeVisible();
    await readout.getByRole('button', { name: 'Close readout' }).click();
    await expect(readout).toBeHidden();
    expect(errors).toEqual([]);
  });
});
