import { expect, test } from '@playwright/test';
import { bootToGame } from './gameHarness';
import { liveTrackCount, liveTrackKeys, waitForQuiet } from './audioHelpers';

/**
 * # The ADOPT path — `createAudio` over a predecessor's live beds
 *
 * Owed by the S.2 gate owner, and the gap it named is exact.
 *
 * `GameScene.create()` calls `createAudio` on **every level transition**, which runs
 * `retireCurrent()` and then `startBeds()` with the previous manager's beds **still live**. That is
 * the whole subject of inventory item 1b.2, and Codex finding Y3 is a regression inside it.
 *
 * ⚠️ **Nothing in the repository drove that branch.** `phase-07-audio.spec.ts`'s 7.5 test restarts
 * **Boot**, which goes through `destroyAudio` and empties `liveBeds` first — a different branch of
 * the same file. `grep -rn "sound.remove" tests/` returned zero matches, and deleting
 * `sound.remove(bed)` from the retirement loop left the whole unit suite at `PASS (2260) FAIL (0)`.
 *
 * ## 🔴 The first version of THIS file was decoration too, and that is worth recording
 *
 * It restarted `Game` five times and asserted the track count stayed at two. It passed — **and it
 * still passed with `sound.remove(bed)` deleted.** Verified by running the mutation, not assumed.
 *
 * The reason is in the code: beds are created `{ loop: true }`, so `bed.isPlaying` never becomes
 * false on its own, so the retirement loop's body **never executes** during an ordinary transition.
 * A test that restarts the scene with everything playing cannot reach the branch it means to guard,
 * however many times it restarts.
 *
 * So the second test below **stops a bed first**. The branch exists for a stopped bed; the fixture
 * has to produce one. Reachable in the real game because Phaser's `pauseOnBlur` defaults to true —
 * a tab that loses focus pauses its sounds, and `isPlaying` goes false.
 *
 * ## The two defects fail in OPPOSITE directions
 *
 * | | the defect | what it looks like |
 * |---|---|---|
 * | 1b.2 | beds restart at every level boundary | the music cuts and starts over |
 * | Y3 / 7.5 | stopped beds are never removed | `sound.sounds` grows every transition |
 *
 * A `createAudio` that destroys its predecessor satisfies Y3 and breaks 1b.2. One that adopts
 * without removing satisfies 1b.2 and breaks Y3. Only doing both passes both tests here.
 */

type PageT = import('@playwright/test').Page;

/** Restart the GAME scene — the level-transition shape, not a boot. */
async function restartGame(page: PageT): Promise<void> {
  await page.evaluate(() => {
    (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): { scene: { restart(): void } } } } }
    ).__phaserGame.scene.getScene('Game').scene.restart();
  });
  await page.waitForFunction(() => window.__game?.ready === true, undefined, { timeout: 20_000 });
}

/** Every bed's playback position, so "did the music restart" is a reading and not a guess. */
async function bedSeeks(page: PageT): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const game = (window as unknown as { __phaserGame: { sound: { sounds: unknown[] } } }).__phaserGame;
    const out: Record<string, number> = {};
    for (const raw of game.sound.sounds) {
      const s = raw as { key: string; seek?: number; isPlaying?: boolean };
      if (s.key.startsWith('bed-') && s.isPlaying === true) out[s.key] = s.seek ?? 0;
    }
    return out;
  });
}

test.describe('Phase 7 — the level-transition adopt path (1b.2 + Y3)', () => {
  test('1b.2 — five GameScene restarts adopt the beds instead of restarting them', async ({
    page,
  }) => {
    await bootToGame(page);
    await waitForQuiet(page);

    // The premise. Without it, "still two" would pass on a game with no beds at all.
    expect(await liveTrackCount(page), 'the beds never started, so nothing below is a test').toBe(2);
    const before = await bedSeeks(page);
    expect(Object.keys(before).sort()).toEqual(['bed-ambience', 'bed-music']);

    for (let transition = 0; transition < 5; transition += 1) {
      await restartGame(page);
      await waitForQuiet(page);
    }

    await expect
      .poll(async () => (await liveTrackKeys(page)).sort().join(','), {
        timeout: 10_000,
        message: 'tracks after five GameScene restarts (the adopt path)',
      })
      .toBe('bed-ambience,bed-music');

    // The reading that makes this 1b.2 rather than a second copy of 7.5: a manager that destroyed
    // and re-created its beds would satisfy the count above perfectly and still cut the music at
    // every level boundary, which is the defect 1b.2 IS.
    const after = await bedSeeks(page);
    for (const key of Object.keys(before)) {
      expect(after[key], `${key} stopped playing across the transitions`).toBeDefined();
      expect(
        after[key]!,
        `${key} is at ${String(after[key])}s, behind its position before the transitions ` +
          `(${String(before[key])}s) — the beds are being re-created rather than adopted.`,
      ).toBeGreaterThan(before[key]!);
    }
  });

  test('Y3 — a STOPPED bed is removed, not left beside its replacement', async ({ page }) => {
    await bootToGame(page);
    await waitForQuiet(page);
    expect(await liveTrackCount(page)).toBe(2);

    // Force the precondition the branch exists for. Beds are `loop: true`, so this state never
    // arrives on its own inside a test — but it does in the real game, because `pauseOnBlur`
    // defaults to true and a backgrounded tab pauses its sounds.
    await page.evaluate(() => {
      const game = (window as unknown as { __phaserGame: { sound: { sounds: unknown[] } } }).__phaserGame;
      for (const raw of game.sound.sounds) {
        const s = raw as { key: string; stop(): void };
        if (s.key === 'bed-music') s.stop();
      }
    });

    // The premise for THIS test: the bed really is stopped, and still in the manager's list —
    // which is vault 7.5's whole point, "a stopped track is still in `sound.sounds`".
    const stoppedCount = await page.evaluate(() => {
      const game = (window as unknown as { __phaserGame: { sound: { sounds: unknown[] } } }).__phaserGame;
      return game.sound.sounds.filter((raw) => {
        const s = raw as { key: string; isPlaying?: boolean };
        return s.key === 'bed-music' && s.isPlaying !== true;
      }).length;
    });
    expect(stoppedCount, 'the bed did not stop, so the retirement branch is still unreachable').toBe(
      1,
    );

    await restartGame(page);
    await waitForQuiet(page);

    // Exactly two. A `startBeds` that counts playing beds but never removes stopped ones pushes a
    // replacement beside the corpse and leaves THREE — criterion 7.5's accumulation, arriving
    // through the fix that was meant to avoid it.
    await expect
      .poll(async () => (await liveTrackKeys(page)).sort().join(','), {
        timeout: 10_000,
        message: 'tracks after a transition with one bed stopped',
      })
      .toBe('bed-ambience,bed-music');

    // And the stopped one was replaced, not merely deleted — silence is not the fix either.
    const seeks = await bedSeeks(page);
    expect(seeks['bed-music'], 'bed-music never came back after being stopped').toBeDefined();
  });
});
