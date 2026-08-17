/**
 * Criteria 8.3 and 8.4 in the real browser — unlocks, the save across a reload, and a corrupt file.
 *
 * ## Why this exists beside the unit suite
 *
 * `save-progress.test.ts` pins the ENCODING against a hand-written string, and `progress-unlock.test.ts`
 * pins the rule. Neither crosses the seam this does: **a real page load, a real `localStorage`, and the
 * boot path reading it.** The reload half of criterion 8.3 is a round trip through the browser, and a
 * `read`/`write` pair that agree on a wrong encoding pass every round-trip test ever written — which is
 * exactly why the encoding is pinned over there and the round trip is checked over here.
 *
 * ## No ninth `__game` field
 *
 * The debug surface is closed at eight by a Phase 1 Codex ruling. Everything below reads `levelId` and
 * `sceneKey` (both already on it) and `localStorage` directly — the `audioHelpers.ts` pattern.
 *
 * ## GPU
 *
 * `assertRealGpu` runs in every Phase 8 spec, including this one, which measures no pixels. That is
 * deliberate: the project is scoped by FILE, so one spec skipping the check would mean a file could
 * drift onto SwiftShader with nothing noticing. ⚠️ Never soften it into a skip — a skipped test reads
 * as a passing suite, a failed one reads as a broken environment, which is what it is.
 *
 * ⚠️ It must come **after** the boot. `webglRenderer` reads `__phaserGame.renderer.gl`, so calling it
 * first fails with `Cannot read properties of undefined (reading 'renderer')` — a message about the
 * harness, not about the GPU, in a check whose entire job is to be unambiguous.
 */

import { expect, test, type Page } from '@playwright/test';

import { BOOT_TIMEOUT, bootToGame } from './gameHarness';
import { assertRealGpu } from './realGpu';

const PROGRESS_KEY = 'steampunk.progress';

/** The save as the browser holds it, parsed. `null` when nothing has been written. */
async function storedProgress(page: Page): Promise<Record<string, unknown> | null> {
  return page.evaluate((key) => {
    const raw = window.localStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>);
  }, PROGRESS_KEY);
}

/** Write a save by hand, before the page that will read it exists. */
async function seedProgress(page: Page, json: string): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    [PROGRESS_KEY, json] as const,
  );
}

async function levelId(page: Page): Promise<string | null> {
  return page.evaluate(() => (window as unknown as { __game: { levelId: string | null } }).__game.levelId);
}

test.describe('Phase 8 — progression and the save file', () => {
  test('8.3 a fresh browser boots into level-01, and the save is written when one is finished', async ({
    page,
  }) => {
    await bootToGame(page);
    await assertRealGpu(page, '8.3');

    expect(await levelId(page), 'a browser with no save must start at the beginning').toBe('level-01');

    // A save IS written on the first boot — `pickLevel` records the resume point when a level starts —
    // but nothing is EARNED. `completedIds` reads `levels` and only `levels`, so an empty map is what
    // keeps "completed nothing" and "never played" the same thing for the unlock rule, which is the
    // only place the distinction would matter.
    const save = await storedProgress(page);
    expect(save, 'no save was written at all, so the resume point cannot survive a reload').not.toBeNull();
    expect(save).toMatchObject({ version: 1, lastLevel: 'level-01' });
    expect(save!.levels, 'a first boot marked a level completed').toEqual({});
  });

  /**
   * 🔴 The mutation criterion 8.3 names: `{lastLevel:'level-05', levels:{}}` is a perfectly well-formed
   * save that anyone can type into devtools in ten seconds. It must NOT boot into level-05.
   */
  test('8.3 a well-formed save pointing at a LOCKED level does not open it', async ({ page }) => {
    await seedProgress(page, '{"version":1,"lastLevel":"level-05","levels":{}}');
    await bootToGame(page);
    await assertRealGpu(page, '8.3-locked');

    expect(typeof (await levelId(page)), 'levelId is not a string — assert the type before the value').toBe(
      'string',
    );
    expect(await levelId(page), 'a locked level was opened from an unedited catalog').toBe('level-01');
  });

  /**
   * 🔴 The other direction, and the one that is a HANG rather than a giveaway: `lastLevel` naming a level
   * the catalog does not contain reaches `loadLevel`, throws inside `GameScene.create()`, and leaves
   * `ready:false` with `bootError:null` — indistinguishable from a slow load.
   */
  test('8.3 a save naming a level that does not exist still boots, rather than hanging', async ({ page }) => {
    await seedProgress(page, '{"version":1,"lastLevel":"level-09","levels":{}}');
    await page.goto('/');
    await page.waitForFunction(
      () => {
        const g = (window as unknown as { __game?: { ready: boolean; bootError: string | null } }).__game;
        return Boolean(g && (g.ready || g.bootError !== null));
      },
      undefined,
      { timeout: BOOT_TIMEOUT },
    );

    await assertRealGpu(page, '8.3-missing');
    const game = await page.evaluate(() => (window as unknown as { __game: unknown }).__game);
    expect(game).toMatchObject({ ready: true, bootError: null, sceneKey: 'Game', levelId: 'level-01' });
  });

  test('8.3 the resume point survives a reload', async ({ page }) => {
    // level-02 is unlocked because level-01 is completed, and it is the level last played.
    await seedProgress(
      page,
      '{"version":1,"lastLevel":"level-02","levels":{"level-01":{"completed":true,"bestGears":4}}}',
    );
    await bootToGame(page);
    await assertRealGpu(page, '8.3-reload');
    expect(await levelId(page)).toBe('level-02');

    // 🔴 A real reload, not a scene restart. The whole claim is that the bytes in storage carry the
    // state across a page load — the one thing a unit round trip cannot check.
    await page.reload();
    await page.waitForFunction(
      () => Boolean((window as unknown as { __game?: { ready: boolean } }).__game?.ready),
      undefined,
      { timeout: BOOT_TIMEOUT },
    );
    expect(await levelId(page), 'the resume point did not survive the reload').toBe('level-02');

    const save = await storedProgress(page);
    expect(save, 'the save was destroyed by a reload').not.toBeNull();
    expect(save).toMatchObject({ version: 1, lastLevel: 'level-02' });
  });

  /**
   * 🔴 Criterion 8.4. One corrupt entry, and the valid entries beside it must survive — while the
   * corrupt one fails **LOCKED**, not unlocked.
   */
  test('8.4 a corrupt entry costs its own unlock and nothing else', async ({ page }) => {
    await seedProgress(
      page,
      '{"version":1,"lastLevel":"level-03","levels":{' +
        '"level-01":{"completed":true,"bestGears":5},' +
        '"level-02":{"completed":true,"bestGears":2},' +
        '"level-03":"banana"}}',
    );
    await bootToGame(page);
    await assertRealGpu(page, '8.4');

    // level-03 is unlocked (level-02 completed) so `lastLevel` still resolves — the corruption costs
    // level-04, not level-03. Booting at all is the first half of "no data loss".
    expect(await levelId(page), 'a corrupt level-03 entry took the whole save with it').toBe('level-03');

    // And the file itself is untouched until the game writes: reading a corrupt save must not silently
    // rewrite it, or a single bad load would erase a record the player might still want back.
    const save = await storedProgress(page);
    expect(save?.levels, 'reading a corrupt save rewrote it').toMatchObject({
      'level-01': { completed: true, bestGears: 5 },
      'level-02': { completed: true, bestGears: 2 },
      'level-03': 'banana',
    });
  });

  // Playwright's `test` has no `.each` — a plain loop is the idiom here, and each iteration is still a
  // separate `test()` with its own page and its own name.
  for (const [label, raw] of [
    ['not JSON at all', 'banana'],
    ['an array', '[1,2,3]'],
    ['a future schema version', '{"version":99,"lastLevel":"level-05","levels":{}}'],
  ] as const) {
    test(`8.4 boots normally when the save is ${label}`, async ({ page }) => {
      await seedProgress(page, raw);
      await bootToGame(page);
      await assertRealGpu(page, '8.4-malformed');
      expect(await levelId(page)).toBe('level-01');
    });
  }
});
