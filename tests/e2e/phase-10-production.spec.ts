/**
 * The SHIPPED artifact, played. Phase 10 — criteria 10.2, 10.6 and 10.12.
 *
 * Every other spec in this directory runs against the Vite dev server, where `window.__game` and
 * `window.__phaserGame` exist and a spec can teleport the player, read the drawn objects and ask
 * the sim what tick it is on. **None of that is in `dist/`**, and proving it is not there is this
 * phase's job. So this file runs against `tools/dev/prod-server.mjs` — the real build, served with
 * the real `vercel.json` headers — and is restricted to what a player can reach: the keyboard, the
 * pixels, the response headers and `localStorage`. `prodHarness.ts` holds the readers and the
 * reasoning; read its header first.
 *
 * ## What this file is NOT
 *
 * It is not the mechanical regression. `phase-01` through `phase-09` remain the tick-level cover,
 * and they keep running against the dev build at the same commit. This spec asks one question those
 * cannot: *does the thing we are about to put on the internet boot, draw, simulate and finish a
 * level, with no dev affordance left in it?*
 *
 * It is also not the hands-on pass. Criterion 10.12's human half is the owner's at approval
 * *(vault C4)* — a playthrough criterion is never closed on automated evidence alone.
 */

import { expect, test } from '@playwright/test';

import {
  ENTRY_LEVEL,
  assertNotYetCompleted,
  cspViolations,
  expectedHeaders,
  gotoProduction,
  playToExit,
  readSave,
} from './prodHarness';

/** Playwright creates the parent directories for a screenshot path, so nothing here makes them. */
const EVIDENCE = 'docs/evidence/phase-10';

/**
 * A frame with something in it. Full-screen PNGs of this game weigh ~1.1 MB; an all-black 1920x1080
 * frame compresses to a few kilobytes, so this separates "the compositor handed back the game" from
 * "the compositor handed back a blank canvas" without decoding a pixel.
 *
 * It is a SMOKE signal and is labelled as one. The evidence that the game is alive is the
 * completion transition below — a still frame proves a frame was drawn, never that the loop runs.
 */
const DRAWN_FRAME_MIN_BYTES = 100_000;

/**
 * Every dev query flag `src/` has ever read, and the two dev-only overlay switches.
 *
 * 🔴 They go in the URL at `goto`, never applied afterwards. `tune` and `probe` are read during
 * overlay attachment (`gameDev.ts:84-98`) and `breakAsset`/`breakFilter` during boot — setting any
 * of them after the page exists tests a code path that has already run, and would pass however live
 * the seam was.
 */
const DEV_QUERY =
  '?tune=1&probe=1&feel=2&hitstop=0&perfMutation=cue-stall&breakAsset=catalog&breakFilter=1';

/**
 * Every dev-only key binding (`gameInput.ts:153-166`).
 *
 * ESC is deliberately absent — it opens the level select, which is a SHIPPED feature.
 */
const DEV_KEYS = ['p', 'o', 'g', 'n', 'k'] as const;

/**
 * 90 s, against Playwright's 30 s default.
 *
 * Two of these tests PLAY a level end to end, which took 22.5 s and 22.8 s on this machine — inside
 * the default, but not by enough. A budget a healthy run sits at 75 % of is a flake generator, and
 * the failure it generates ("did not complete within the budget") reads exactly like the production
 * defect this spec exists to catch. `playToExit`'s own 60 s budget is what actually bounds the run;
 * this only has to be comfortably larger than that, so the spec's message is the one that prints.
 */
test.describe.configure({ timeout: 90_000 });

test.describe('phase 10 — the production build', () => {
  /**
   * Criterion 10.2, from the outside. `tools/gen/devSeamGate.mjs` and `verify-dist.mjs` assert this
   * against the bundle's BYTES at build time; this asserts it against the running page, which is
   * the only place a surface installed by some path neither of them reads would show up.
   */
  test('ships no debug surface', async ({ page }) => {
    await gotoProduction(page);
    const surface = await page.evaluate(() => ({
      game: typeof (window as unknown as { __game?: unknown }).__game,
      phaser: typeof (window as unknown as { __phaserGame?: unknown }).__phaserGame,
    }));
    expect(surface.game, '`window.__game` is installed in the PRODUCTION bundle').toBe('undefined');
    expect(surface.phaser, '`window.__phaserGame` is installed in the PRODUCTION bundle').toBe(
      'undefined',
    );
  });

  /**
   * Criterion 10.6, first check of two.
   *
   * ⚠️ This server is not Vercel. It applies the header VALUES `vercel.json` declares, but it does
   * not exercise Vercel's `source` route matching, its CDN, or the artifact Vercel rebuilds on its
   * own machine. `curl -sI` against the real preview deployment is the production-relevant check
   * and is recorded beside this one in `docs/qa/phase-10-ship.md`. Neither substitutes for the
   * other, and a green here is not a claim about the edge.
   */
  test('serves the CSP from vercel.json on every response', async ({ page }) => {
    const want = expectedHeaders();
    // The document, a static asset, and a MISS. A rule that only covers 200s leaves the error page
    // — the one most likely to reflect a URL back — without a policy.
    for (const path of ['/', '/assets/index.json', '/no-such-file-here']) {
      const res = await page.request.get(path);
      const got = res.headers();
      for (const [key, value] of Object.entries(want)) {
        expect(got[key.toLowerCase()], `${key} on ${path} (status ${res.status()})`).toBe(value);
      }
    }
    /**
     * The quoting, over the WHOLE policy — vault 10.5. A bare `self` is not a syntax error; the
     * browser reads it as a host named "self", finds nothing, and blocks the resource silently.
     *
     * 🔴 The loop above cannot catch this on its own and it is worth being exact about why: the
     * expectation and the served value come from the same `vercel.json`, so they agree however
     * wrong the file is. Single-sourcing the policy is right — a second copy would drift — but it
     * makes the equality check a *drift* detector, not a *correctness* one. This assertion and the
     * playthrough below are the two that can see a policy that is wrong everywhere at once.
     *
     * ⚠️ **Measured, because the obvious version of this proof does not work.** Unquoting
     * `default-src` alone leaves the game fully playable: `script-src`, `img-src`, `media-src`,
     * `connect-src` and `font-src` are all declared explicitly here, and an explicit directive
     * overrides `default-src` for its own resource type. It is unquoting `script-src` that blanks
     * the page. Both were run; `docs/qa/phase-10-ship.md` records both results under 10.6.
     */
    expect(
      want['Content-Security-Policy'],
      'a CSP keyword is unquoted. The browser will read it as a HOST NAME and silently block ' +
        'everything the directive was meant to allow.',
    ).not.toMatch(/(?:^|[;\s])(?:self|none|unsafe-inline|unsafe-eval)(?=[;\s]|$)/);
    expect(want['Content-Security-Policy']).toContain("default-src 'self'");
  });

  /**
   * Criterion 10.12's automated half — and the only assertion in this file that witnesses the SIM.
   *
   * The predicate is the false -> true transition on `levels['level-01'].completed`, baselined
   * before a key is pressed. `steampunk.progress` is written on level ENTRY too, so neither "the
   * key exists" nor "the value changed" would mean anything here.
   *
   * It also proves persistence rather than presentation: `gameComplete.ts:75-87` writes the save
   * before building the overlay, and `ctx.ui?.levelComplete(...)` silently no-ops when the UI scene
   * is absent. The drawn overlay is asserted by `phase-08-complete.spec.ts` on the dev build, where
   * the drawn objects can actually be read.
   */
  test('boots, draws, simulates, and completes a level on real keyboard input', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    await gotoProduction(page);
    await assertNotYetCompleted(page);

    const idle = await page.screenshot({ path: `${EVIDENCE}/prod-idle.png` });
    expect(
      idle.byteLength,
      'the production build handed back a blank frame — nothing is being drawn',
    ).toBeGreaterThan(DRAWN_FRAME_MIN_BYTES);

    const elapsed = await playToExit(page);
    expect(
      elapsed,
      `${ENTRY_LEVEL} did not complete within the budget under real keyboard input. The dev build ` +
        `at this commit completes it in 18.5-21.3 s with the same driver, so a timeout here is a ` +
        `production defect, not a slow box.`,
    ).not.toBeNull();

    const save = await readSave(page);
    expect(save?.levels?.[ENTRY_LEVEL]?.completed).toBe(true);
    expect(
      save?.levels?.[ENTRY_LEVEL]?.bestGears,
      'the level completed but recorded no gears — the run did not actually happen',
    ).toBeGreaterThan(0);

    const finished = await page.screenshot({ path: `${EVIDENCE}/prod-complete.png` });
    expect(finished.byteLength).toBeGreaterThan(DRAWN_FRAME_MIN_BYTES);
    expect(
      finished.equals(idle),
      'the frame after a full playthrough is byte-identical to the frame before it',
    ).toBe(false);

    expect(await cspViolations(page), 'the page violated its own CSP while being played').toEqual(
      [],
    );
    expect(errors, 'the production build threw while being played').toEqual([]);
  });

  /**
   * Criterion 10.2's behavioural half: every dev seam, exercised the way it would be exercised if it
   * were live, against a build where it must not be.
   *
   * 🔴 **The discriminator is the completion, not "nothing visibly changed".** `P`, `O` and `G`
   * switch `GameScene` out for `PlaygroundScene`, `ElementEditorScene` and `GymScene`; a live
   * binding therefore makes finishing level 01 impossible, because the level is no longer running.
   * `breakAsset` and `breakFilter` make boot REFUSE, so a live flag never reaches the readiness gate
   * at all. That is a production-observable consequence for five of the seven seams, which is more
   * than a pixel diff could give: the idle animation loops at 7.5 fps with `repeat: -1`, so "the
   * screen changed" is satisfied by a healthy build standing still.
   *
   * ⚠️ **`feel`, `hitstop`, `perfMutation=cue-stall` and the `N`/`K` spawn keys have NO production
   * observation source**, and this test does not pretend otherwise. Their coverage is
   * `verify-dist.mjs`'s `URLSearchParams` sweep and the sentinel gate in `tools/gen/devSeamGate.mjs`
   * — build-time absence, not runtime behaviour. They are pressed here as a no-error smoke check and
   * nothing more; `docs/qa/phase-10-ship.md` records them in that column rather than implying a
   * behavioural check that does not exist.
   *
   * Red-proved against the DEV build, where every one of these seams genuinely exists — a negative
   * assertion that has never been watched failing is decoration *(vault C1, C2)*.
   */
  test('carries no live dev seam — every flag and key is inert', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));

    // If `breakAsset` or `breakFilter` were live, boot would refuse and this would never return.
    await gotoProduction(page, DEV_QUERY);
    await assertNotYetCompleted(page);

    // Only AFTER the readiness gate: the bindings are installed during input setup, and a press
    // issued before `bindKeys` runs passes even if the binding leaked.
    for (const key of DEV_KEYS) await page.keyboard.press(key);

    const elapsed = await playToExit(page);
    expect(
      elapsed,
      `${ENTRY_LEVEL} did not complete after every dev flag and dev key was applied. In the dev ` +
        `build P, O or G replaces the running scene and this is exactly what fails — which is the ` +
        `point: if it fails here, a seam is live in dist/.`,
    ).not.toBeNull();

    expect(await cspViolations(page)).toEqual([]);
    expect(errors, 'a dev key or flag threw in the production build').toEqual([]);
  });
});
