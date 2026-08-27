import { expect, test } from '@playwright/test';

import {
  ALL_LEVELS,
  DRAWN_FRAME_MIN_BYTES,
  assertNotYetCompleted,
  cspViolations,
  gotoProduction,
  playToExit,
  readSave,
} from './prodHarness';

/**
 * **Criterion 10.12's progression half, against `dist/`.**
 *
 * Split out of `phase-10-production.spec.ts` when that file crossed the 400-line rule — and it is a
 * split worth having on its own merits. That file asks *"is this bundle clean, and is the sim
 * alive"*, in tests measured in seconds. This one asks *"does the shipped game carry a player from
 * one level to the next"*, and takes minutes. They fail for different reasons and they belong apart.
 *
 * `playwright.config.ts`'s `PROD_SPECS` matches both, so both run under `chromium-prod` against the
 * production server on 4173 and neither runs under the dev-server projects.
 *
 * ---
 *
 * ## 🔴 What this asserts, and why it is not the five-level run that was tried first
 *
 * The Codex implementation review pointed out that `README.md` advertises five levels while the spec
 * proved one, and that calling that a *"full playthrough"* overclaimed. The right response was to
 * play more, so the driver got a **back-up move** — release RIGHT, hold LEFT for 420 ms, resume,
 * which is what a stuck player does — and the reach was measured:
 *
 * | levels | budget/level | result |
 * |---|---|---|
 * | 01 | 60 s | completes, 18.5–22.9 s |
 * | 01→02 | 60 s, no back-up move | **stopped at 02** — no way past a wall needing a run-up |
 * | 01→03 | 60 s + back-up move | reaches 04 |
 * | 01→04 | 120 s + back-up move | reaches 05, **all four completed** |
 * | 05 | 240 s | **not completed** |
 *
 * ⚠️ **And then the four-level version failed in the full suite while passing alone** — it stopped at
 * level 03 during `npm run test:e2e`, having completed the same three levels comfortably on a quiet
 * box minutes earlier. That is precisely CLAUDE.md §5's *"its wall-clock-bounded specs read a busy
 * box as a broken game"*, and a test that passes alone and fails in the suite is **a flake
 * generator, not a gate**. Widening the budget until it stops flaking is the move this project has
 * a rule against: the bound would then be measuring the box, not the game.
 *
 * So the two things are separated by what they are:
 *
 *   - **The GATE, here** — level 01 completes, ENTER advances, level 02 boots and draws. Every step
 *     is a shipped production behaviour, none is wall-clock-marginal, and it is strictly more than
 *     the single-level assertion it replaces: nothing before this proved the game had a *second*
 *     level a player could reach.
 *   - **The MEASUREMENT** — levels 01–04 completed end to end on a quiet box, level 05 did not.
 *     Recorded in `docs/qa/phase-10-ship.md` § 10.12 with the budget each needed, because a number
 *     that cannot be a stable gate is still evidence.
 *
 * `playCampaign()` stays in `prodHarness.ts` and is what produced the table above. It is the tool
 * for re-running that measurement deliberately; it is not wired into the suite.
 *
 * **Level 05 is unmeasured, not broken and not proven.** A position-blind driver cannot navigate —
 * it cannot choose a route, backtrack meaningfully, or decide to kill something. It is owed to the
 * owner's hands-on playthrough, which criterion 10.12 requires anyway *(vault C4)*.
 */
test.describe('phase 10 — the production playthrough', () => {
  test('completes a level and the SHIPPED flow carries the player to the next', async ({ page }) => {
    // Two levels plus a transition, at a 60 s driver budget for a run measured at 18.5–22.9 s.
    test.setTimeout(240_000);

    await gotoProduction(page);
    for (const levelId of ALL_LEVELS) await assertNotYetCompleted(page, levelId);

    const first = await playToExit(page, 'level-01');
    expect(
      first,
      'level-01 did not complete within the budget under real keyboard input. The same driver ' +
        'completes it in 18.5-22.9 s, so a timeout here is a production defect, not a slow box.',
    ).not.toBeNull();

    // The shipped advance: `gameComplete.ts` binds ENTER on the completion overlay to
    // `nextLevelId(levelId, order)`. No save-file surgery, no level-select shortcut, no `simWorld`.
    await page.keyboard.press('Enter');
    await page.waitForFunction(
      (key: string) => {
        try {
          const raw = window.localStorage.getItem(key);
          return raw !== null && (JSON.parse(raw) as { lastLevel?: string }).lastLevel === 'level-02';
        } catch {
          return false;
        }
      },
      'steampunk.progress',
      { timeout: 60_000 },
    );

    const save = await readSave(page);
    expect(save?.levels?.['level-01']?.completed, 'level-01 never recorded completion').toBe(true);
    expect(
      save?.lastLevel,
      'ENTER on the completion overlay did not carry the run onto level-02',
    ).toBe('level-02');

    // ...and level 02 is a RUNNING level, not just a save-file value. A progression that advances
    // the record while the next level fails to boot is exactly the shape a save-only assertion
    // cannot see.
    const frame = await page.screenshot();
    expect(
      frame.length,
      'level-02 is recorded as current but the canvas is blank — the advance moved the save and ' +
        'not the game.',
    ).toBeGreaterThan(DRAWN_FRAME_MIN_BYTES);

    const violations = await cspViolations(page);
    expect(violations, 'no CSP violation collector was installed on this page').not.toBeNull();
    expect(violations, 'the page violated its own CSP during the playthrough').toEqual([]);
  });
});
