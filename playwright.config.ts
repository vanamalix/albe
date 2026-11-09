import { defineConfig } from '@playwright/test';

// Runs against dist/ under wrangler, so the real public/_headers (CSP included) applies.
const PORT = 8878;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  reporter: 'list',
  // Software WebGL is heavy, so one page at a time.
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    // The scene is WebGL. Headless Chromium has no GPU, so it uses the software renderer.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  webServer: {
    command: `npx wrangler dev --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    env: { WRANGLER_SEND_METRICS: 'false' },
  },
});
