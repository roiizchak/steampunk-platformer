import { expect, type Page } from '@playwright/test';

import { CRISP_IMAGE_RENDERING } from '../../src/game/constants';
import { SMOOTH_IMAGE_RENDERING, isIntegerScale } from '../../src/render/canvasScaling';

/**
 * Fixtures and page-driving helpers for phase-01-boot.spec.ts, extracted when that file crossed
 * 400 lines. DATA AND SETUP ONLY — no test assertion beyond the type-checks these helpers were
 * already making lives here; every `test()`/`expect` that verifies a CRITERION stays in the spec.
 *
 * Not named `*.test.ts` / `*.spec.ts` on purpose: `playwright.config.ts`'s `testDir` is
 * `./tests/e2e`, and Playwright's default `testMatch` collects any file in that tree whose name
 * contains `.test.` or `.spec.`. A helper collected as a spec becomes an empty test file. This
 * follows the same naming convention already in this directory (`gameHarness.ts`, `debugView.ts`).
 */

/**
 * `loader.maxRetries` is 2 in Phaser 4, so a 404 is attempted THREE times before `loaderror`
 * fires. Sized for that: too tight and a correct refusal fails as a timeout, which reads as
 * a hang and sends you debugging the wrong thing.
 */
export const REFUSAL_TIMEOUT = 20_000;

/**
 * A catalog-injection body built FROM the shipped catalog, with only the field under test replaced.
 *
 * **Phase 4 repeated the mistake the paragraph above predicts, and this is the fix for the class
 * rather than the instance.** `sheets` became a required, non-empty catalog field; every fixture
 * below still carried only `images` and `levels`, so each one refused for *"missing its sheets
 * list"* instead of for the defect it was written to test. Five sharp gates became one blunt one,
 * exactly as forecast — and a hardcoded `VALID_SHEETS` would go stale again the moment Phase 6 adds
 * HUD sheets or Phase 7 adds audio cues.
 *
 * Reading the real catalog means a fixture only ever differs from a working boot by the one thing
 * it is testing, whatever fields the catalog grows later.
 */
export async function catalogWith(page: Page, override: Record<string, unknown>): Promise<string> {
  const response = await page.request.get('/assets/index.json');
  expect(response.ok(), 'the shipped catalog did not load over HTTP').toBe(true);
  return JSON.stringify({ ...(await response.json()), ...override });
}

/** The first catalog image — the entry `?breakAsset=corrupt` redirects, derived rather than named. */
export async function firstImage(page: Page): Promise<{ key: string; url: string }> {
  const response = await page.request.get('/assets/index.json');
  expect(response.ok(), 'the shipped catalog did not load over HTTP').toBe(true);
  const [first] = ((await response.json()) as { images: { key: string; url: string }[] }).images;
  expect(typeof first?.key, 'the catalog lists no images to break').toBe('string');
  return first;
}

export async function waitForTerminalState(page: Page, timeout: number): Promise<void> {
  // Waits on a CONDITION, never a fixed sleep. A sleep long enough to pass here would also be
  // long enough to hide the hang that F1 describes.
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout },
  );
}

export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => errors.push(String(err)));
  return errors;
}

/**
 * **The canvas is presented with the filtering its GEOMETRY calls for** — criterion 1.5's CSS half.
 *
 * Lives here rather than inline in `phase-01-boot.spec.ts` because that file hit the 400-line rule,
 * and because the rule it asserts is shared: `src/render/canvasScaling.ts` is the one place the
 * argument and its measurements live, `isIntegerScale` is imported from it, and the runtime
 * (`applyCanvasFilter`) and this assertion therefore cannot drift apart.
 *
 * Stricter than the `toContain(CRISP_IMAGE_RENDERING)` it replaced: that passed a canvas the
 * browser was nearest-neighbour-downscaling at a fractional ratio — dropping pixel columns whose
 * positions move as the world scrolls — including on Playwright's own viewport.
 */
export async function expectCanvasFiltering(page: Page): Promise<void> {
  const measured = await page.locator('#game canvas').evaluate((el) => {
    const canvas = el as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    return {
      rendering: getComputedStyle(canvas).imageRendering,
      buffer: [canvas.width, canvas.height] as [number, number],
      css: [rect.width, rect.height] as [number, number],
    };
  });

  const where =
    `${measured.buffer.join('x')} buffer in ${measured.css.map(Math.round).join('x')} css`;

  if (isIntegerScale(...measured.buffer, ...measured.css)) {
    // Chromium keeps `pixelated`, Firefox `-moz-crisp-edges`; the list is imported, never retyped.
    expect(
      [...CRISP_IMAGE_RENDERING],
      `canvas is at an INTEGER scale (${where}), where nearest-neighbour is exact and must be kept`,
    ).toContain(measured.rendering);
  } else {
    expect(
      measured.rendering,
      `canvas is at a FRACTIONAL scale (${where}). Nearest-neighbour cannot be exact here and ` +
        'fails by dropping pixel columns that MOVE as the world scrolls.',
    ).toBe(SMOOTH_IMAGE_RENDERING);
  }
}
