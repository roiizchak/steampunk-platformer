import { expect, type Page } from '@playwright/test';

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
