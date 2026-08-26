import { defineConfig, devices } from '@playwright/test';

const PORT = 5173;

/** `tools/dev/prod-server.mjs` — `dist/` with the real `vercel.json` headers. Phase 10. */
const PROD_PORT = 4173;

/**
 * The specs that need a real GPU, as ONE value.
 *
 * 🔴 This used to be the same regex literal written out twice — once as `chromium`'s `testIgnore`
 * and once as `chromium-gpu`'s `testMatch` — under a comment saying the two "must stay identical".
 * A file matching neither runs nowhere and reports `0 passed`; a file matching both runs twice, once
 * on a rasteriser its assertions are meaningless on. Phase 10 needed to add a third project, which
 * meant editing one of the two copies — so the invariant is now structural instead of a promise.
 * The pattern itself is unchanged; every reason it has the shape it has is on the projects below.
 */
const GPU_SPECS = /phase-0(5-perf|6-[a-z0-9-]+|7-[a-z0-9-]+|8-[a-z0-9-]+|9-(?!polish)[a-z0-9-]+)\.spec\.ts/;

/** The spec that runs against `dist/` rather than the dev server. Phase 10. */
const PROD_SPECS = /phase-10-production\.spec\.ts/;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  // retries: 0. A refusal test that only passes on retry is a defect, not a flake — retrying
  // it away is how the hang in Codex finding F1 would have stayed invisible.
  retries: 0,
  /**
   * `workers: 1` — a STOPGAP with a measured cause, not a preference. Phase 4.
   *
   * Every boot loads the shipped PNG payload — **31.27 MB** when this was written, ~21 MB of it the
   * three parallax layers. Phases 1-3 booted greybox art measured in kilobytes, so the suite's
   * parallelism was sized against a payload that no longer exists — the real art landing silently
   * invalidated it.
   *
   * *(The figure said 34.5 MB until 2026-08-14. The gap was `anchor.png` / `anchor-original.png`
   * under `public/assets/`, which boot never requests. Those are **17.6 MB** of uncatalogued Phase 4
   * debt — five times the 3.2 MB previously recorded — copied to `dist/` and never fetched.)*
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
   * `waitForTimeout`.
   *
   * ## 🔴 2026-08-14: the payload was shrunk, and it did NOT move boot time
   *
   * The paragraph here used to end *"the real fix is to make the payload smaller; restore
   * parallelism when that lands."* The payload got smaller and **that prediction was wrong**, so it
   * is corrected rather than quietly dropped.
   *
   * `encodePng` gained an adaptive per-row filter (lossless, decoded pixels bit-identical). Shipped
   * PNGs fell **48.88 MB → 44.15 MB**, the boot payload **31.27 → 26.5 MB**, every file smaller.
   * Then boot was measured either side — the conversion from *bytes* to *seconds* that D8's whole
   * premise rested on and **nobody had ever taken**:
   *
   * | | boot median (n=5, cold context) | transferred |
   * |---|---|---|
   * | before | **2147 ms** | 84.7 MB |
   * | after | **2196 ms** | 75.2 MB |
   *
   * Unchanged, well inside noise (before spanned 2091-2817 ms). **Boot is ~2.1 s, not 30 s**, so
   * −11 % of bytes buys ~0 ms. On localhost the transfer is nearly free; the 2.1 s is Phaser init,
   * texture decode and GPU upload — work that is a function of *pixels*, which a lossless re-encode
   * does not change by one.
   *
   * So `workers: 1` **stays**, and the reason is now named correctly:
   *
   *  - `BOOT_TIMEOUT` is **20 s** (`tests/e2e/gameHarness.ts`), and boot uses ~2.1 s of it. Boot was
   *    never close to its own bound.
   *  - The ~31 s figure that started this is **Playwright's default per-test timeout** — this config
   *    sets no top-level `timeout`. Criterion 3.2 is `bootToGame` **plus** `waitTicks(10)` **plus**
   *    `sampleHorizontalRun` (>200 samples, >30 stable frames). Boot is one small term in that
   *    budget, not the budget.
   *  - Under 8 workers the contention is 8 browsers decoding and uploading the same ~26 MB of
   *    texture at once. That is memory and GPU pressure, not download, and shrinking the *file* does
   *    not shrink the *texture*.
   *
   * **Restoring parallelism therefore needs its own session and its own evidence.** Changing
   * `workers` now would be a guess dressed as a fix — the measurement above says bytes were not the
   * cause, so there is no reason to believe fewer bytes changed the outcome. The 15.1 % saving is
   * banked because it is free and correct, not because it solved this.
   */
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      // Everything except the specs that need a browser this one cannot be: the frame-budget spec,
      // and EVERY Phase 6 spec, which read actual PIXELS. SwiftShader is a software rasteriser, so
      // its output is not what a player's GPU draws — a colour assertion taken from it is a
      // measurement of the wrong thing, which is the root rule's whole complaint.
      //
      // 🔴 The Phase 6 half is a PREFIX match (`6-[a-z]+`) rather than a list of file names, and
      // deliberately so. It was `6-hud|6-chrome`, and every split of those files — this phase alone
      // produced three — silently opted the new file back into SwiftShader unless someone
      // remembered to edit two regexes in lockstep. A spec that quietly runs on the wrong
      // rasteriser still passes; it just stops measuring the thing it names.
      //
      // 🔴 **Phase 7 (audio) joins on the same prefix, and for THREE reasons rather than one.**
      // The frame-budget argument above is only the first. Headless Chromium's audio stack is also
      // not the one a player runs, so a cue that decodes and plays there proves less than it looks;
      // and the WebAudio unlock is a real user-gesture path, which deserves a real browser rather
      // than a headless approximation of one. Criteria 7.1, 7.2 and 7.5 all measure sound, not
      // pixels, and all three are worth taking on the substrate the player has.
      //
      // 🔴 **Phase 8 joins for both reasons at once.** 8.6 asserts the exit graphic, the fade and the
      // overlay are DRAWN, and 8.7 names a frame budget. This regex and the `chromium-gpu`
      // `testMatch` below are the SAME pattern and must stay identical — a file that matches neither
      // runs nowhere, and a file that matches both runs twice, once on the rasteriser its assertions
      // are meaningless on.
      //
      // 🔴 **Phase 9 joins as a prefix with ONE named exclusion, and the shape is deliberate.**
      // `phase-09-polish.spec.ts` asserts behaviour — tick indices, hp drops, camera offsets — and
      // belongs here, on the cheap headless browser. Everything else under `phase-09-` measures time
      // or draw submission (`phase-09-perf`, `phase-09-draw`), calls `assertRealGpu`, and must have
      // the substrate this phase agreed to measure on.
      //
      // It was `9-perf` alone for one commit, and the review was right that an exact name is the
      // failure this file already recorded at :98-102: a future `phase-09-perf-b.spec.ts` would have
      // matched NEITHER pattern and run silently on SwiftShader. A negative lookahead inverts the
      // default — a new Phase 9 spec is assumed to need the real GPU unless it is named as not
      // needing it — because the two failure modes are not symmetric. Getting it wrong this way
      // costs a headed window and some seconds; getting it wrong the other way ships a measurement
      // of a software rasteriser with a green tick beside it.
      //
      // 🔴 **Phase 10 joins for a third reason: it does not run against this server at all.**
      // `phase-10-production.spec.ts` drives `dist/` on port 4173 and asserts that `window.__game`
      // is absent — against the dev server on 5173 it would fail on its first assertion, correctly
      // and uselessly. It runs in `chromium-prod` below.
      testIgnore: [GPU_SPECS, PROD_SPECS],
    },
    /**
     * 🔴 **The frame-budget project, and the only reason it exists.**
     *
     * Default headless Chromium has no GPU: it rasterises through **SwiftShader**, on the CPU.
     * HANDOFF §14 measured the same scene at **90.10 ms** headless against **4.2 ms** on the real
     * GPU — a factor of 21 — so every pre-session-8 frame number in this project was a measurement
     * of a software rasteriser, and criterion 5.11's 100 ms "budget" was a 10 fps hang detector
     * that had been read as a budget.
     *
     * `headless: false` is what gets a real GPU context on this machine. It is scoped to one spec
     * on purpose: a headed browser opens a window, cannot run on a display-less CI box, and is
     * unnecessary for every other test here, all of which assert behaviour rather than speed.
     *
     * ⚠️ Even on the GPU an absolute millisecond figure from this harness means little — Vite is
     * still compiling, the box is shared. The spec therefore measures a **ratio** against a control
     * sampled in the same page seconds earlier, which is why it can be trusted at all.
     */
    {
      // Phase 6 joined this project for a different reason than Phase 5 did. Phase 5 needed a real
      // GPU because it measures TIME; Phase 6 needs one because it reads PIXELS — criterion 6.4
      // asserts the health bar's drawn rectangle and 6.8 inspects the chroma-keyed art. Both are
      // claims about rasterised output, and both are meaningless taken from SwiftShader.
      name: 'chromium-gpu',
      // 🔴 Phase 8 joins for BOTH of the earlier reasons at once. Criterion 8.6 asserts the exit
      // graphic, the fade and the overlay are DRAWN — a rasterised-pixel claim, meaningless from
      // SwiftShader — and 8.7 names a frame budget, where the headless harness is not the frame rate
      // (HANDOFF §14 measured the same scene 21x slower). A `phase-08-*.spec.ts` did not match this
      // regex and would have run headless in silence, which is the failure mode the whole project is
      // built against.
      // 🔴 Phase 9's perf spec joins for the TIME reason alone (criteria 9.5 and 9.6), and by exact
      // name rather than by prefix — see the `testIgnore` above. This pattern and that one are the
      // SAME pattern and must stay identical: a file matching neither runs nowhere, and a file
      // matching both runs twice, once on a rasteriser its assertions are meaningless on.
      testMatch: GPU_SPECS,
      // 🔴 ONE named exclusion, the shape Phase 9 established above. `phase-06-dpr2` matches the
      // pattern by prefix but must NOT run here: this project is DPR 1, and a DPR-2 spec running at
      // DPR 1 would pass while measuring the exact case inventory 2b.6 says is untested. It runs in
      // `chromium-dpr2` instead, whose `testMatch` is the mirror of this line.
      testIgnore: /phase-06-dpr2\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        launchOptions: {
          // `--disable-gpu` is what the headless default effectively implies; these say the opposite
          // as loudly as the flags allow, so a driver that CAN give hardware acceleration does.
          args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
        },
      },
    },
    /**
     * 🔴 **Device pixel ratio 2 — inventory 2b.6, and the only project that is not DPR 1.**
     *
     * *"DPR ≠ 1 never tested"* was recorded in Phase 6, deferred to Phase 9, deferred again, and
     * still open when the UI/UX gate owner re-found it. **Most laptops are HiDPI**, so this is the
     * common case rather than an edge one.
     *
     * A separate project rather than a flag on an existing one, because the question is a
     * COMPARISON: the same viewports are asserted at DPR 1 in `phase-06-chrome.spec.ts` and here at
     * DPR 2, and "FIT sizes off CSS pixels so DPR changes nothing" is only a claim until both have
     * been run.
     *
     * `headless: false` and the GPU flags match `chromium-gpu`: this reads real pixel geometry, and
     * SwiftShader is not what a player's display does.
     *
     * ⚠️ Its `testMatch` is the mirror of `chromium-gpu`'s `testIgnore`. A file matching neither
     * runs nowhere and reports `0 passed` — the false green this config already warns about twice.
     */
    {
      name: 'chromium-dpr2',
      testMatch: /phase-06-dpr2\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        headless: false,
        deviceScaleFactor: 2,
        launchOptions: {
          args: ['--enable-gpu-rasterization', '--ignore-gpu-blocklist'],
        },
      },
    },
    /**
     * 🔴 **The only project that does not test the dev server.** Phase 10.
     *
     * It points at `tools/dev/prod-server.mjs` on port 4173 — the built `dist/`, served with the
     * headers `vercel.json` declares — because criteria 10.2, 10.6 and 10.12 are claims about the
     * SHIPPED artifact, and every other project measures a build that carries `window.__game`,
     * `window.__phaserGame`, three dev scenes and seven dev query flags that `dist/` must not have.
     *
     * ⚠️ **It must never be `projects[0]`.** `tests/e2e/globalSetup.ts` reads the FIRST project's
     * `baseURL` and warms that origin up by waiting on `window.__game` — which is absent here by
     * design, so the warm-up would hang for its full 180 s and then abort the run having collected
     * zero tests. That file asserts the ordering rather than trusting this comment.
     *
     * `testMatch` is explicit and narrow. Adding `phase-10-` to `chromium`'s `testIgnore` does NOT
     * constrain this project — without a `testMatch` of its own it would run every spec in the
     * directory against production, and most of them would fail for the right reason in the wrong
     * place.
     */
    {
      name: 'chromium-prod',
      testMatch: PROD_SPECS,
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${PROD_PORT}` },
    },
  ],
  /**
   * Absorbs Vite's one-time cold transform (~33 s, measured) BEFORE the first spec, so no test
   * budget has to accommodate it. Session inventory 0.2 — the recorded "stale dep cache" diagnosis
   * was measured and refuted; read `tests/e2e/globalSetup.ts` before touching any boot timeout.
   *
   * Runs AFTER `webServer` — the ordering that makes a globalSetup port guard impossible is the
   * ordering a warm-up wants.
   */
  globalSetup: './tests/e2e/globalSetup.ts',
  webServer: [
    {
      // The production substrate for `chromium-prod`. Same in-process shape as the dev server
      // below, for the same measured reason — read `tools/dev/prod-server.mjs`'s header.
      //
      // ⚠️ It **throws** if `dist/index.html` is missing rather than serving nothing, and
      // `npm run test:e2e` builds before it runs. Serving a stale `dist/` would be vault C13's
      // original failure with a production label on it: the suite would report on an artifact
      // nobody built, and a green would mean nothing at all.
      command: `node ./tools/dev/prod-server.mjs ${PROD_PORT}`,
      url: `http://localhost:${PROD_PORT}/index.html`,
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
    // Vault C13: launch the dev server's REAL entry point, never `npm run dev`. On Windows the
    // package script is a shell wrapper; killing the wrapper orphans the real process, which
    // then keeps serving stale content after an asset rebuild.
    // 🔴 **Not vite's CLI directly — `tools/dev/e2e-server.mjs`, which frees the port first and then
    // serves IN-PROCESS.** Playwright spawns this through `cmd.exe` on Windows and kills the shell at
    // the end, orphaning whatever the shell launched — the same wrapper-orphans-the-real-process
    // shape the note above describes for `npm run dev`, one layer further out. The orphan keeps the
    // port, so the NEXT run cannot bind, aborts before collecting a single test, and **exits 0** with
    // `expected: 0`. That is a false green, and it is not fixable from a command string.
    //
    // A `globalSetup` guard was tried and does not work: **Playwright starts `webServer` BEFORE
    // `globalSetup`**, so the run aborts on the busy port before the guard's first line runs. Read
    // that file's header before changing this line.
    command: `node ./tools/dev/e2e-server.mjs ${PORT}`,
    url: `http://localhost:${PORT}`,
    // false, deliberately. Reusing whatever already answers on this port is how vault C13's
    // stale-server failure happens — "serves stale art after an asset rebuild", presenting as
    // "the sprite didn't update". Costs a few seconds per run; buys knowing what was tested.
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
