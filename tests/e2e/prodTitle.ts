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
 * Mean frame luminance below this means the welcome screen's scrim is up.
 *
 * Chosen from a measured pair, not guessed, and confirmed against the run that had no say in it —
 * see the QA log for phase 11. The gap either side of it is wide because the scrim is 82 % alpha
 * over a dark base, so a bound in the middle is not sitting on either distribution's tail.
 */
export const TITLE_SCRIM_MAX_LUMA = 26;

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
 * `TitleScene` draws a full-canvas scrim at 82 % alpha, so the whole frame is much darker while it
 * is up and returns to the lit level once it is not. Nothing else at boot dims the entire canvas.
 *
 * 🔴 Asserting only that the title is GONE afterwards would also pass if `TitleScene` had been
 * tree-shaken out of the production bundle and never appeared at all — a green earned by the
 * feature being missing. So the dark frame is asserted FIRST, as evidence the screen shipped, and
 * the brighter frame second, as evidence the key dismissed it. Codex plan review round 3, finding 6.
 */
export async function dismissTitleProduction(page: Page): Promise<void> {
  const before = await meanLuminance(page);
  expect(
    before,
    'the production build drew no welcome screen — its scrim should darken the whole canvas',
  ).toBeLessThan(TITLE_SCRIM_MAX_LUMA);

  await page.locator('canvas').click();
  await page.keyboard.press('Enter');

  // Poll the pixels, never a sleep: the scene stop and the resume are both queued.
  await expect
    .poll(async () => meanLuminance(page), { timeout: 15_000 })
    .toBeGreaterThan(TITLE_SCRIM_MAX_LUMA);
}

/**
 * Mean 0-255 luminance of the whole screenshot.
 *
 * A frame-wide statistic on purpose: a region would need coordinates, and the thing being detected
 * is a full-canvas scrim. Sampled every 4th pixel — this runs on a 1920x1080 shot and the answer is
 * a mean, so a quarter of the rows and columns is the same number for a sixteenth of the work.
 */
export async function meanLuminance(page: Page): Promise<number> {
  const shot = await page.screenshot();
  const { decodePng } = await import('../../tools/gen/png.mjs');
  const img = decodePng(new Uint8Array(shot));
  let total = 0;
  let seen = 0;
  for (let y = 0; y < img.height; y += 4) {
    for (let x = 0; x < img.width; x += 4) {
      const i = (y * img.width + x) * 4;
      // Rec. 601 luma. The exact weights do not matter for a light/dark discriminator, but a
      // named standard beats three magic numbers nobody can check.
      total +=
        0.299 * (img.data[i] ?? 0) + 0.587 * (img.data[i + 1] ?? 0) + 0.114 * (img.data[i + 2] ?? 0);
      seen += 1;
    }
  }
  return seen === 0 ? 0 : total / seen;
}
