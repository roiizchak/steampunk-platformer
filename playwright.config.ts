import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // retries: 0. A refusal test that only passes on retry is a defect, not a flake — retrying
  // it away is how the hang in Codex finding F1 would have stayed invisible.
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // Vault C13: launch the dev server's REAL entry point, never `npm run dev`. On Windows the
    // package script is a shell wrapper; killing the wrapper orphans the real process, which
    // then keeps serving stale content after an asset rebuild.
    command: `node ./node_modules/vite/bin/vite.js --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    // false, deliberately. Reusing whatever already answers on this port is how vault C13's
    // stale-server failure happens — "serves stale art after an asset rebuild", presenting as
    // "the sprite didn't update". Costs a few seconds per run; buys knowing what was tested.
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
