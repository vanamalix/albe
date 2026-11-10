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
