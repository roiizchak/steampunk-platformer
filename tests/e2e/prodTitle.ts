/**
 * The Phase 11 welcome screen, dismissed in `dist/` — where there is nothing to ask.
 *
 * Split out of `prodHarness.ts` purely for the 400-line ceiling
 * (`tests/unit/file-size.test.ts`), which the barrier plus its pixel statistic pushed that file
 * past. Codex plan review round 3, finding 6, anticipated exactly this.
 */

import { expect } from '@playwright/test';

type Page = import('@playwright/test').Page;

/**
 * How much brighter the canvas must get when the welcome screen is dismissed.
 *
 * ## Why a RATIO and not an absolute luminance
 *
 * The first version asserted `luma < 26` with the title up. That is a bound chosen by guessing, and
 * it false-redded on the very first run that had a say in it — the real figure is **27.04**. Worse,
 * an absolute bound is a hostage to the art: any change to the first level's brightness moves it,
 * and the failure would look like a broken title screen.
 *
 * A ratio is self-calibrating, and it collapses Codex plan review round 3 finding 6's two required
 * halves into one statistic:
 *
 *  - if the title never appeared (tree-shaken out of the bundle), `before` and `after` are the same
 *    frame and the ratio is ~1.0 — **red**;
 *  - if the title appeared and never dismissed, likewise ~1.0 — **red**.
 *
 * Only a screen that both shipped and dismissed produces a large ratio.
 *
 * ## The number
 *
 * Measured over 6 runs against `dist/` on the production server: `before` **27.04** every run,
 * `after` **68.43-68.44**, ratio **2.530-2.531**. Confirmed on a held-out set of fresh runs that had
 * no say in the choice. 1.5 sits far below the observed 2.53 and far above the 1.0 that either
 * failure mode produces, so it is not resting on either distribution's tail.
 */
export const TITLE_SCRIM_MIN_BRIGHTENING = 1.5;

/**
 * How much DARKER the canvas must get on the way from the welcome screen to the level menu.
 *
 * ## Why a second bound exists at all
 *
 * ⚠️ **One `Enter` no longer reaches a level.** The owner's 2026-08-29 decision made the level menu
 * the only way in, so the production route is title → **menu** → level and a single press lands on a
 * screen that is *darker* than the title, not brighter. Every `chromium-prod` spec failed on
 * exactly that: ratio **0.729** against a bound of `> 1.5`. The gate was right and the harness was
 * out of date.
 *
 * ## Why darkening, and why it is not a sleep in disguise
 *
 * The menu needs a POSITIVE barrier before the second press, and production ships no debug surface
 * to ask — pixels are the only signal *(this file's header)*. The menu is a plain dark list over no
 * art, while the title now draws the parallax backdrop behind its band, so the step down is large
 * and in the opposite direction to the step that follows it.
 *
 * It also cannot be satisfied by the failure it guards: if `TitleScene` were tree-shaken out of the
 * bundle, the first `Enter` would reach an already-running level, the ratio would sit at ~1.0, and
 * this poll would time out **red** — the same discriminator the brightening bound carries, pointing
 * the other way.
 *
 * ## The number
 *
 * Measured against `dist/` on the production server, 5 runs (1 + `--repeat-each=4`): title
 * **27.547**, menu **20.082**, level **60.593** — **identical to twelve decimal places** on every
 * run. That stability is observed, not explained; the earlier claim here that *"the centre patch
 * sits inside the static band, so the parallax drift does not reach it"* was a guess, and a wrong
 * one — the band is 82 % alpha, so the drifting layers do show through it. Codex implementation
 * review of the redesign, round 3. **The bound does not rest on the explanation**: it is a ratio
 * between two screens, and it is watched red rather than argued. That is menu/title **0.7289** and level/title **2.200**. `0.85` sits comfortably
 * ABOVE the observed 0.729 and comfortably BELOW the 1.0 that "no title in the bundle" produces,
 * so it rests on neither distribution's tail.
 *
 * ⚠️ The brightening bound is now measured against a **brighter** title than the 2.53 recorded when
 * it was chosen (the parallax backdrop replaced a flat scrim), so the observed ratio fell 2.53 →
 * 2.20. **1.5 still clears both distributions** and is left alone rather than re-tuned toward a
 * tighter fit it does not need.
 */
export const TITLE_MENU_MAX_DARKENING = 0.85;

/**
 * Dismiss the Phase 11 welcome screen in `dist/`, where there is nothing to ask.
 *
 * ## Why this cannot be `gameHarness.dismissTitle`
 *
 * That one waits on `window.__phaserGame.scene.isActive('Title')` and on `window.__game.tick`.
 * **Production ships neither** — that absence is this file's first criterion. So the only signals
 * available are pixels, storage, headers and input, and the barrier has to be built from pixels.
 *
 * ## The signature, and why BOTH halves are asserted
 *
 * `TitleScene` draws its text over a dimmed band, so the centre of the frame is much darker while it
 * is up and returns to the lit level once it is not. Nothing else at boot dims the centre patch.
 *
 * ⚠️ **The route is two presses now**, and the middle screen is darker still — see
 * `TITLE_MENU_MAX_DARKENING`. The barrier between them is a bound, not a sleep.
 *
 * 🔴 Asserting only that the title is GONE afterwards would also pass if `TitleScene` had been
 * tree-shaken out of the production bundle and never appeared at all — a green earned by the
 * feature being missing. Codex plan review round 3, finding 6.
 *
 * ⚠️ **This used to say the dark frame is "asserted FIRST" and the bright one second.** It is not,
 * and there is no separate assertion on `before`: it is the ratio's **denominator**. The single
 * statistic still carries both halves, which is why the wording was wrong rather than the code — a
 * bundle with no title screen starts bright, so `after / before` lands near 1.0 and the bound fails
 * exactly as it should. Corrected after the criterion 11.14 review found the two docstrings in this
 * file contradicting each other.
 */
export async function dismissTitleProduction(page: Page): Promise<void> {
  /**
   * 🔴 The DARKEST of three samples, not the first one.
   *
   * `before` is only reliably a title frame because `gotoProduction`'s `DRAWN_FRAME_MIN_BYTES` check
   * screenshots the canvas just ahead of it. That is an accident of another gate's cost, and this
   * file's own header is about making screenshots cheaper — so a future optimisation there could
   * start sampling `before` a frame early, put a bright level pixel in the denominator, and
   * **false-red** this gate. Taking the minimum removes the dependency without introducing an
   * absolute luminance number, which is the thing that false-redded this bound once already.
   *
   * It cannot manufacture a green: with no title in the bundle every sample is a bright level frame,
   * so the minimum is bright too and the ratio still lands near 1.0.
   */
  const samples: number[] = [];
  for (let i = 0; i < 3; i += 1) {
    samples.push(await centrePatchLuminance(page));
  }
  const before = Math.min(...samples);

  await page.locator('canvas').click();

  // 🔴 TWO presses, with a positive barrier between them — title → level MENU → level. Pressing
  // twice in a row would be a race dressed as a fix: `scene.start` is queued, so the second press
  // can land before `LevelSelectScene.create()` has bound a key and simply be swallowed.
  await page.keyboard.press('Enter');

  // Poll the pixels, never a sleep: the scene stop and the start are both queued.
  await expect
    .poll(async () => (await centrePatchLuminance(page)) / before, { timeout: 15_000 })
    .toBeLessThan(TITLE_MENU_MAX_DARKENING);

  await page.keyboard.press('Enter');

  await expect
    .poll(async () => (await centrePatchLuminance(page)) / before, { timeout: 15_000 })
    .toBeGreaterThan(TITLE_SCRIM_MIN_BRIGHTENING);
}

/**
 * Mean 0-255 luminance of a SMALL patch at the centre of the canvas.
 *
 * ## 🔴 Why a patch and not the whole frame
 *
 * The first version screenshotted the full 1920x1080 canvas and decoded the PNG in Node, on every
 * production boot and again on every poll iteration. In isolation that is invisible; across the full
 * suite it pushed two wall-clock-bounded specs over their budget —
 * `phase-10-campaign` already uses ~60 s of its own 60 s-per-level allowance, and
 * `playwright.config.ts` warns in detail that a busy box reads as a broken game and is
 * indistinguishable from the defect these specs exist to catch.
 *
 * The dimmed band spans the full width across the centre of the canvas, so a centre patch is exactly
 * as good a discriminator as the frame and costs about a thousandth as much. (It said *"the scrim
 * covers the entire canvas"* until the 2026-08-29 redesign replaced the full-canvas scrim with a
 * band over a parallax backdrop — still true of the patch, no longer true of the frame.) Measured either side of the change: the ratio is unmoved.
 */
async function centrePatchLuminance(page: Page): Promise<number> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null || box.width <= 0) {
    throw new Error('no canvas to measure the welcome screen against');
  }
  const w = Math.min(240, Math.floor(box.width / 4));
  const h = Math.min(135, Math.floor(box.height / 4));
  const shot = await page.screenshot({
    clip: { x: box.x + (box.width - w) / 2, y: box.y + (box.height - h) / 2, width: w, height: h },
  });
  const { decodePng } = await import('../../tools/gen/png.mjs');
  const img = decodePng(new Uint8Array(shot));
  let total = 0;
  let seen = 0;
  for (let i = 0; i < img.data.length; i += 4) {
    // Rec. 601 luma. The exact weights do not matter for a light/dark discriminator, but a named
    // standard beats three magic numbers nobody can check.
    total += 0.299 * (img.data[i] ?? 0) + 0.587 * (img.data[i + 1] ?? 0) + 0.114 * (img.data[i + 2] ?? 0);
    seen += 1;
  }
  return seen === 0 ? 0 : total / seen;
}
