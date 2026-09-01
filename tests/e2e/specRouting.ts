/**
 * **Which Playwright project a Phase 12 spec runs in.**
 *
 * The two patterns live here, imported by `playwright.config.ts` and by
 * `tests/unit/spec-routing.test.ts`, because this file's own history says a routing rule nobody can
 * test is a rule that silently stops routing.
 *
 * 🔴 `playwright.config.ts` records the failure twice already: *"a file that matches neither runs
 * nowhere and reports `0 passed`"*. My first version of this recreated it exactly — `(?!perf)` for
 * behaviour plus an EXACT `phase-12-perf\.spec\.ts` for timing leaves a future
 * `phase-12-perf-b.spec.ts` matching **neither**. Caught by the Codex plan review, round 3.
 *
 * So the partition is total **by construction**: behaviour is defined as *everything minus perf*
 * rather than as a pattern of its own, and perf matches by PREFIX. Every `phase-12-*.spec.ts` lands
 * in exactly one project, a new behaviour spec needs no config edit, and a new perf spec is caught
 * by the prefix rather than by someone remembering.
 */

/**
 * Every spec that needs a touch device. Also what the base `chromium` project must be told to
 * ignore.
 *
 * 🔴 **`phase-13-viewfill-touch.spec.ts` is named here rather than given a pattern of its own**, and
 * the reason is `tests/unit/playwright-projects.test.ts`: `chromium`'s `testIgnore` must be exactly
 * the other projects' `testMatch` patterns, one entry each, and every spec must be selected by
 * EXACTLY ONE project. A second touch pattern would make `chromium-touch`'s `testMatch` an array,
 * which that gate reads as unresolvable, and running the file in two projects is the failure the
 * gate exists to catch. So the touch half of the view-fill work is a separate FILE inside this one
 * pattern — geometry that is true with or without touch stays in `phase-13-viewfill.spec.ts` on the
 * cheap desktop project, and the tap-zone case lives where the zones are actually drawn.
 */
export const TOUCH_ALL_SPECS = /phase-1(2-[a-z0-9-]+|3-viewfill-touch)\.spec\.ts/;

/** The timing ones, by prefix — `phase-12-perf.spec.ts`, `phase-12-perf-b.spec.ts`, ... */
export const TOUCH_PERF_SPECS = /phase-12-perf[a-z0-9-]*\.spec\.ts/;

