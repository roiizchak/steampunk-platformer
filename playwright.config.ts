import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // retries: 0. A refusal test that only passes on retry is a defect, not a flake — retrying
  // it away is how the hang in Codex finding F1 would have stayed invisible.
  retries: 0,
  /**
   * `workers: 1` — a STOPGAP with a measured cause, not a preference. Phase 4.
   *
   * Every boot loads **34.5 MB of PNG**, 21.4 MB of it the three parallax layers (`mid.png` alone
   * is 9.1 MB). Phases 1-3 booted greybox art measured in kilobytes, so the suite's parallelism was
   * sized against a payload that no longer exists — the real art landing silently invalidated it.
   *
   * Measured on this machine (16 logical cores, Playwright's default is 8 workers):
   *
   * | workers | result |
   * |---|---|
   * | 8 (default) | **29 failed / 15 passed** |
   * | 4 | failed |
   * | 2 | failed |
   * | 1 | **44 passed**, twice, in ~260 s |
   *
   * Every failure presents as `bootToGame` timing out with neither `ready` nor `bootError` — and
   * one run surfaced `ECONNRESET` on `GET /assets/index.json`, which is the dev server dropping a
   * connection, not the game hanging.
   *
   * ⚠️ **This failure mode is indistinguishable from the boot-hang defect the suite exists to
   * catch** *(vault 1.4)*. That is the danger: it trains a reader to dismiss a red suite as "just
   * flaky", which is precisely how a real `ready:false / bootError:null` hang would ship.
   *
   * **Do NOT "fix" this by raising `BOOT_TIMEOUT`.** A bound loose enough to survive a contended
   * dev server is loose enough to hide a genuine hang — the same reasoning that bans
   * `waitForTimeout`. The real fix is to make the payload smaller (the parallax layers are
   * uncompressed and enormous for what they draw); restore parallelism when that lands.
   */
  workers: 1,
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
