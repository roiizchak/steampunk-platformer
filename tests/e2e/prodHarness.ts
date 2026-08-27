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

import { headersFrom } from '../../tools/gen/vercelHeaders.mjs';

/** The Phase 8 save key. Named here once; `src/game/save.ts` owns the schema. */
export const SAVE_KEY = 'steampunk.progress';

/** The level `resolveEntryLevel` hands back on a clean save — `order[0]`, always. */
/**
 * A drawn frame's PNG is at least this many bytes. Measured 2026-08-26 against the shipped build:
 * a live first frame is ~350 kB; the blank-canvas failures that motivated the floor were under 10.
 * Set an order of magnitude below the observed value, because the question is "is anything drawn",
 * not "how much".
 */
export const DRAWN_FRAME_MIN_BYTES = 100_000;

export const ENTRY_LEVEL = 'level-01';

/**
 * The catch-all header rule from `vercel.json`, as a plain map.
 *
 * 🔴 **Delegated, not re-implemented — and it WAS re-implemented until the Codex implementation
 * review.** This file did its own `vercel.headers.find(h => h.source === '/(.*)')`, with the path
 * literal spelled out a third time, inside the phase that had just consolidated exactly that lookup
 * into `vercelHeaders.mjs` for exactly this reason. The header above claimed the single-source
 * property while duplicating the plumbing under it.
 *
 * Criterion 10.6 asks whether the CSP that SHIPS is correct, and a second copy of the POLICY in a
 * test would pass against itself while production served something else. (The spec does restate the
 * security-critical directive VALUES on purpose — see its comment; that is a deliberate second
 * definition of the policy, which is a different thing from a second copy of the lookup.)
 */
export function expectedHeaders(): Record<string, string> {
  return headersFrom(vercel);
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

  /**
   * 🔴 **The save key alone is `create()`'s FIRST statement, and that is not a running game.**
   *
   * `steampunk.progress` is written by `pickLevel` inside `this.loadLevel()` — `GameScene.create()`
   * line 1. The sprite, the HUD, the audio, the camera and `bindKeys` are all lines 4 through 50.
   * So a build that threw anywhere after the first line satisfied the gate, and
   * `test('ships no debug surface')` then passed on a **dead page**: `typeof window.__game ===
   * 'undefined'` is trivially true of a page where nothing is running. Found by the criterion 10.2
   * gate owner (brief B, finding 12), and it made 10.2's runtime half vacuous under exactly the
   * mutation this suite exists to catch.
   *
   * A drawn frame is the discriminator. `page.screenshot()` goes through the compositor, so it sees
   * WebGL output without `preserveDrawingBuffer` — a `drawImage(webglCanvas)` readback would not.
   * The floor is bytes of PNG: the game's first frame is a detailed lit scene and clears it by an
   * order of magnitude, while a blank or single-colour canvas compresses to a few kB.
   *
   * ⚠️ This also fixes the ordering claim beside the dev-key presses in the spec. Their comment said
   * the presses are safe because *"the bindings are installed during input setup"* — false;
   * `bindKeys` runs 34 lines AFTER the write. They are safe because `create()` is synchronous and
   * the poll above cannot interleave with it, and now because this waits for a painted frame too.
   */
  const frame = await page.screenshot();
  if (frame.length < DRAWN_FRAME_MIN_BYTES) {
    throw new Error(
      `gotoProduction: the save key appeared but the canvas is blank (${frame.length} B < ` +
        `${DRAWN_FRAME_MIN_BYTES} B). That is create() having written the save on its first line ` +
        'and then died — a page every "no debug surface" assertion passes vacuously.',
    );
  }
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
/**
 * ⚠️ **CLAUDE.md §5 says "Never `waitForTimeout`", and this function uses it twice.** The rule is
 * about waiting for STATE — a readiness poll dressed as a sleep, which is a flake generator and a
 * false green when the state arrives late. These two are input DURATIONS: how long a key is held.
 * A variable-height jump is defined by how long the button is down, and there is no page state that
 * means "the jump has been held long enough" — the sim's own answer arrives as the jump's height.
 * Recorded here rather than left implicit, because the criterion 10.2 gate owner flagged it from
 * both briefs (A finding 13, B finding 16) and the deviation was argued nowhere.
 *
 * The readiness wait this function depends on is `gotoProduction`'s, which polls page state and
 * never sleeps. Measured completion: 18.5–22.9 s against a 60 s budget.
 */
export async function playToExit(
  page: Page,
  levelId = ENTRY_LEVEL,
  budgetMs = 60_000,
): Promise<number | null> {
  const started = Date.now();
  let hops = 0;
  await page.keyboard.down('ArrowRight');
  try {
    while (Date.now() - started < budgetMs) {
      // 500 ms of held jump is the full variable-height arc; 60 ms of gap is enough for the sim to
      // see the key released, which a re-press needs (`tick.ts` step 7 buffers a fresh press only).
      await page.keyboard.down('Space');
      await page.waitForTimeout(500);
      await page.keyboard.up('Space');
      await page.waitForTimeout(60);
      hops += 1;

      const save = await readSave(page);
      if (save?.levels?.[levelId]?.completed === true) return Date.now() - started;

      /**
       * **The unstick move, and it is a real one rather than a harness cheat.**
       *
       * Holding RIGHT into a wall taller than a full-hold jump is a permanent stall: the courier
       * hops in place forever and the budget expires with nothing learned. A player backs up and
       * takes a run at it, so the driver does too — every ~14 hops, release RIGHT, hold LEFT briefly,
       * and resume. It costs about a second and it is the only reason a level with a run-up is
       * reachable by a position-blind driver at all.
       *
       * ⚠️ It is still position-blind: it cannot know it is stuck, only that it has been hopping for
       * a while. A level needing genuine navigation — a route choice, a backtrack of more than a
       * moment, an enemy that must be killed — is beyond it, and the campaign test reports WHICH
       * level it stopped on rather than pretending otherwise.
       */
      if (hops % 14 === 0) {
        await page.keyboard.up('ArrowRight');
        await page.keyboard.down('ArrowLeft');
        await page.waitForTimeout(420);
        await page.keyboard.up('ArrowLeft');
        await page.keyboard.down('ArrowRight');
      }
    }
  } finally {
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowLeft');
  }
  return null;
}

/** Every level the game ships, in play order. */
export const ALL_LEVELS = ['level-01', 'level-02', 'level-03', 'level-04', 'level-05'] as const;

/** What one level's attempt produced. `ms === null` means the budget ran out. */
export interface LevelRun {
  levelId: string;
  ms: number | null;
}

/**
 * **The FULL playthrough criterion 10.12 actually names** — every level, in order, on the
 * production build, with no teleporting and no scene-key shortcut.
 *
 * 🔴 The spec proved only `level-01` until the Codex implementation review pointed out that
 * `README.md` advertises five and the criterion says *"full playthrough"*. One level is a
 * playthrough of one level; calling it the criterion was overclaiming, and the fix is to play them
 * rather than to reword the criterion.
 *
 * ## How it advances, and why that is production behaviour and not a harness trick
 *
 * `gameComplete.ts` binds ENTER on the completion overlay to `nextLevelId(levelId, order)`. That is
 * the shipped flow a player uses — there is no level-select shortcut here and no save-file surgery.
 * It also means the run is a chain: a failure at level 3 leaves 4 and 5 unattempted rather than
 * unproven, which is why this returns a row per level instead of a single boolean.
 *
 * ⚠️ **The driver is position-blind by design** (see `playToExit`). It cannot know a level is
 * unwinnable by hold-right-and-hop; it can only report which level it stopped on. A `null` here is
 * therefore *"this level was not completed by THIS driver within the budget"* — a real result, not
 * necessarily a defect in the level, and the spec says so where it asserts on the outcome.
 */
export async function playCampaign(
  page: Page,
  levels: readonly string[] = ALL_LEVELS,
  budgetMsPerLevel = 60_000,
): Promise<LevelRun[]> {
  const runs: LevelRun[] = [];
  for (const levelId of levels) {
    const ms = await playToExit(page, levelId, budgetMsPerLevel);
    runs.push({ levelId, ms });
    if (ms === null) break;
    // The shipped advance. ENTER is bound `once` on the overlay, so one press is one level.
    await page.keyboard.press('Enter');
    // Wait for the save's `lastLevel` to move rather than sleeping on the transition.
    const next = levels[levels.indexOf(levelId) + 1];
    if (next === undefined) break;
    await page
      .waitForFunction(
        ([key, want]: [string, string]) => {
          try {
            const raw = window.localStorage.getItem(key);
            return raw !== null && (JSON.parse(raw) as { lastLevel?: string }).lastLevel === want;
          } catch {
            return false;
          }
        },
        [SAVE_KEY, next] as [string, string],
        { timeout: 30_000 },
      )
      .catch(() => undefined);
  }
  return runs;
}
