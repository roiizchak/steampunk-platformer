import { chromium } from '@playwright/test';

/**
 * # Warm the dev server before the first spec, and never by loosening a bound
 *
 * Session inventory item **0.2**: criterion 1.4 (`phase-01-boot.spec.ts:50`) failed **6 runs of 6**
 * with `Test timeout of 30000ms exceeded`, while every other spec in the same file passed in ~4 s.
 *
 * ## What it actually is — measured, because the recorded diagnosis was wrong
 *
 * The inventory blamed a leftover `node_modules/.vite/deps_temp_<hash>/` from an interrupted
 * optimizer run, and prescribed clearing the cache. **That was measured on 2026-08-23 and it is not
 * the cause.** The cache was cleared and criterion 1.4 failed again; the cache was then warm from
 * that run and it failed again.
 *
 * Measured directly against a dev server instead, three page loads on one browser:
 *
 * | load | to `ready:true` |
 * |---|---|
 * | first | **33.4 s** |
 * | second | 3.2 s |
 * | third | 2.6 s |
 *
 * `ready:true`, `bootError:null`, `sceneKey:'Game'` every time. **The game is not slow and it is not
 * hanging.** Vite optimizes dependencies and transforms on the **first page request**, not at server
 * start — and Phaser unbundled is ~1000 ES modules served one request at a time. `webServer` starts
 * a *fresh* server for every run with `reuseExistingServer: false`, so whichever spec loads the page
 * first pays that 33 s, alone, inside its own 30 s budget. It is always criterion 1.4, because it is
 * first in the file.
 *
 * ## Why this is a warm-up and not a softened bound
 *
 * ⚠️ **Do NOT "fix" this by raising `BOOT_TIMEOUT`, `REFUSAL_TIMEOUT` or the test timeout.** There
 * is deliberately no loader timeout *(vault 1.4)*: `ready` and `bootError` exist because without
 * them a successful boot, a refused boot and an infinite hang are indistinguishable. A bound loose
 * enough to survive a 33 s cold transform is loose enough to hide a genuine hang, and
 * `playwright.config.ts` already refuses that trade once, for `workers`.
 *
 * This moves the one-time cost **out of** a test instead. Every bound stays exactly where it was,
 * and each spec still measures a warm server against its original budget — which is the thing those
 * budgets were chosen against in the first place (boot was measured at ~2.1 s in Phase 4).
 *
 * It also makes the failure *louder*, not quieter: a genuinely hung boot now fails **here**, with
 * the message below, before a single spec runs — rather than presenting as one arbitrary spec
 * timing out.
 *
 * ⚠️ **A globalSetup failure aborts the run with zero tests collected**, which is the shape
 * `free-port.mjs` exists to warn about — `expected: 0, unexpected: 0`. Read the test COUNT, never
 * the exit code. The throw below names itself so that count has an explanation beside it.
 *
 * ## Why globalSetup and not `e2e-server.mjs`
 *
 * `free-port.mjs` records that a `globalSetup` **port guard** does not work, because Playwright
 * starts `webServer` *before* `globalSetup`. That ordering is a problem for a guard that must run
 * first, and is exactly what a warm-up wants: the server is already up, and no test has started.
 *
 * Warming inside `e2e-server.mjs` was rejected for the mirror-image reason — `server.listen()` opens
 * the port, so Playwright's URL probe succeeds and tests begin while the warm-up is still running.
 * The work would simply move, not disappear.
 */

const PORT = 5173;

/** Generous, and deliberately unrelated to any test's budget — this is the cost being absorbed. */
const WARMUP_TIMEOUT_MS = 180_000;

export default async function globalSetup(): Promise<void> {
  const started = Date.now();
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: 'commit' });
    await page.waitForFunction(
      () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
      undefined,
      { timeout: WARMUP_TIMEOUT_MS },
    );

    // Read the terminal state rather than assuming it. A refusal here is a real defect and must not
    // be warmed past in silence — every spec after this one would fail for a reason this run already
    // knew and did not say.
    const view = await page.evaluate(() => window.__game);
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    if (view?.bootError !== null) {
      throw new Error(
        `[e2e warmup] the dev server booted to a REFUSAL in ${seconds}s: ${String(view?.bootError)}. ` +
          `Every spec would fail against this. Fix the boot, do not re-run.`,
      );
    }
    console.log(`[e2e warmup] dev server warm in ${seconds}s (ready:true) — specs now run warm.`);
  } catch (error) {
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    throw new Error(
      `[e2e warmup] the dev server did not reach a terminal state in ${seconds}s ` +
        `(budget ${WARMUP_TIMEOUT_MS / 1000}s). This is the boot HANG that ready/bootError exist to ` +
        `make visible (vault 1.4) — not a slow transform, which measures ~33s. ` +
        `⚠️ The run aborts with ZERO tests collected: read the count, not the exit code. ` +
        `Cause: ${String(error)}`,
    );
  } finally {
    await browser.close();
  }
}
