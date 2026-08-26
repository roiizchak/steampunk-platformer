/**
 * Driving and reading the PRODUCTION bundle — everything `dist/` still answers once the dev seams
 * are gone. Phase 10, criteria 10.2, 10.6 and 10.12.
 *
 * ## Why none of the existing e2e helpers work here
 *
 * Every reader in `tests/e2e/` reaches the game through `window.__game` or `window.__phaserGame`,
 * and **both are dev-only by design** — `src/debug/globals.ts` installs them behind
 * `import.meta.env.DEV`, and criterion 10.2 exists to prove they are absent from `dist/`. So
 * `levelDriver.ts`, `completeHelpers.ts`, `drawnVsSim.ts` and the rest cannot drive this build; a
 * spec that used them would either fail on `undefined` or, worse, quietly prove the surface is
 * still there. The production spec therefore has its own harness, and it may use only what a
 * PLAYER can reach: the keyboard, the pixels, the response headers and `localStorage`.
 *
 * ## The three production observation sources, and what each is worth
 *
 *  1. **`localStorage['steampunk.progress']`** — a real Phase 8 feature, not a test seam. It is the
 *     only one that can witness the *sim*, and the completion transition is the spec's evidence.
 *     ⚠️ It is written on level **ENTRY** as well as on completion (`phase-08-progress.spec.ts`
 *     asserts a first boot stores `lastLevel: 'level-01'` with `levels: {}`), so *"the key exists"*
 *     and *"the value changed"* are both false greens. Only `levels[id].completed` going
 *     **false -> true** means anything, and `assertNotYetCompleted` pins the baseline first.
 *  2. **`page.screenshot()`** — the only pixel readback that works here. `drawImage(canvas)` off the
 *     WebGL canvas returns an all-black buffer without `preserveDrawingBuffer` (measured
 *     2026-08-26: `nonZero: 0` over the full 1920x1080). `page.screenshot()` goes through the
 *     compositor and returns the real frame.
 *  3. **The response headers**, read from the served page. Criterion 10.6.
 *
 * ## The readiness gate
 *
 * `window.__game.ready` — the positive terminal condition every other spec waits on — does not
 * exist in `dist/`. The production stand-in is the save key appearing, because `GameScene` writes
 * `lastLevel` on entry, i.e. after boot has actually reached a level.
 *
 * That only works from a CLEAN slate: with a save already present the key is there before the
 * bundle has parsed a byte, and the gate would pass on a page that never booted. The clear is done
 * in an **init script**, so it happens in page context before the app's first line runs and one
 * navigation is enough.
 *
 * ⚠️ Unlike `window.__game.bootError` there is **no negative terminal condition** here — a refused
 * boot presents as this gate timing out rather than as a named error. That is a real loss and it is
 * stated rather than papered over; the dev-build specs keep the refusal coverage (`phase-01-boot`),
 * and the production spec's job is the shipped artifact, not the refusal paths.
 */

import { expect, type Page } from '@playwright/test';

import vercel from '../../vercel.json' with { type: 'json' };

/** The Phase 8 save key. Named here once; `src/game/save.ts` owns the schema. */
export const SAVE_KEY = 'steampunk.progress';

/** The level `resolveEntryLevel` hands back on a clean save — `order[0]`, always. */
export const ENTRY_LEVEL = 'level-01';

/**
 * The catch-all header rule from `vercel.json`, as a plain map.
 *
 * 🔴 Imported, never re-typed. Criterion 10.6 asks whether the CSP that SHIPS is correct, and a
 * second copy of the policy in a test would pass against itself while production served something
 * else. `vite.config.ts` and `tools/dev/prod-server.mjs` read the same file for the same reason.
 */
export function expectedHeaders(): Record<string, string> {
  const rule = vercel.headers.find((h) => h.source === '/(.*)');
  if (rule === undefined) throw new Error('vercel.json has no catch-all headers rule');
  return Object.fromEntries(rule.headers.map((h) => [h.key, h.value]));
}

export interface SaveState {
  version: number;
  lastLevel: string | null;
  levels: Record<string, { completed?: boolean; bestGears?: number } | undefined>;
}

/** The save as the page holds it, or `null` if the key is absent. */
export async function readSave(page: Page): Promise<SaveState | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), SAVE_KEY);
  return raw === null ? null : (JSON.parse(raw) as SaveState);
}

/**
 * Navigate to the production build and wait until it has actually reached a level.
 *
 * @param query appended verbatim, INCLUDING the leading `?`. Dev query flags must arrive this way:
 *   `?tune=1` and `?probe=1` are read during overlay attachment, so setting them after the page has
 *   been created tests a code path that has already run and would pass however live the seam was.
 */
export async function gotoProduction(page: Page, query = ''): Promise<void> {
  // Before ANY page script: clear the save so the readiness gate means "this boot reached a level",
  // and start collecting CSP violations. A listener attached after `goto` misses violations raised
  // by the initial document, which is exactly what a bad policy produces.
  await page.addInitScript((key: string) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* a storage-less context is not this gate's business */
    }
    const seen: string[] = [];
    (window as unknown as { __csp: string[] }).__csp = seen;
    document.addEventListener('securitypolicyviolation', (e) => {
      seen.push(`${e.violatedDirective} <- ${e.blockedURI || '(inline)'}`);
    });
  }, SAVE_KEY);
  await page.goto(`/${query}`, { waitUntil: 'commit' });
  await page.waitForFunction((k) => window.localStorage.getItem(k) !== null, SAVE_KEY, {
    timeout: 60_000,
  });
}

/**
 * Every CSP violation the page has raised since navigation, or `null` if no collector is installed.
 *
 * 🔴 This returned `?? []` until 2026-08-26 — **zero violations and no listener were the same
 * answer**, and the second is the one that happens when a navigation replaces the init script, a
 * `goto` bypasses `gotoProduction`, or the listener throws before it registers. An empty array from
 * a page that was never watching is a green nobody earned. Found by the criterion 10.6 gate owner
 * (finding F4). Callers assert `not.toBeNull()` first.
 */
export async function cspViolations(page: Page): Promise<string[] | null> {
  return page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? null);
}

/** The baseline criterion 10.12 needs BEFORE any key is pressed. */
export async function assertNotYetCompleted(page: Page, levelId = ENTRY_LEVEL): Promise<void> {
  const save = await readSave(page);
  expect(save, 'the production build wrote no save on level entry').not.toBeNull();
  expect(
    save?.levels?.[levelId]?.completed,
    `${levelId} was ALREADY completed before this spec pressed a key. The false -> true ` +
      `transition is the whole evidence; without the false baseline it is a tautology.`,
  ).not.toBe(true);
}

/**
 * Play level 01 to its exit with real keys, and return how long it took — or `null` on timeout.
 *
 * ## Why hold-right-and-keep-hopping, rather than a scripted route
 *
 * A route timed off the wall clock is a guess about frame pacing, and this project's own rule says
 * the headless harness is not the frame rate. A route timed off POSITION is impossible here —
 * `dist/` exposes none.
 *
 * So the driver is position-blind on purpose: hold RIGHT, and jump again as soon as the last jump
 * is spent. It is **self-synchronising** — the courier hops the 288 px block at x=3264, the pit at
 * x=3840, and the platform staircase at 4608/5280/5952 whenever it happens to arrive at them,
 * because a full-hold jump clears 439 px of height and about 600 px of ground and every landing is
 * immediately followed by another. Measured 3/3 completions against `dist/` and 3/3 against the dev
 * build at the same commit, 18.5-21.3 s each.
 *
 * 🔴 It is also the first time this game's level 01 has been finished by playing it. Every prior
 * completion test teleported the player through `levelDriver.ts`'s `simWorld` handle *(vault C4)*.
 */
export async function playToExit(
  page: Page,
  levelId = ENTRY_LEVEL,
  budgetMs = 60_000,
): Promise<number | null> {
  const started = Date.now();
  await page.keyboard.down('ArrowRight');
  try {
    while (Date.now() - started < budgetMs) {
      // 500 ms of held jump is the full variable-height arc; 60 ms of gap is enough for the sim to
      // see the key released, which a re-press needs (`tick.ts` step 7 buffers a fresh press only).
      await page.keyboard.down('Space');
      await page.waitForTimeout(500);
      await page.keyboard.up('Space');
      await page.waitForTimeout(60);
      const save = await readSave(page);
      if (save?.levels?.[levelId]?.completed === true) return Date.now() - started;
    }
  } finally {
    await page.keyboard.up('ArrowRight');
  }
  return null;
}
