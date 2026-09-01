/**
 * **The level menu's tap route — two cases the play-control spec could not hold.**
 *
 * Split out of `phase-12-touch.spec.ts` at the 400-line ceiling, and the seam is real: both cases
 * here are about `LevelSelectScene`'s route and its scene lifetime, not about the six controls.
 * Both came out of the Codex implementation review, and both were watched red (M25, M30).
 *
 * ⚠️ The file name is deliberate: `playwright.config.ts` partitions on `phase-12-[a-z0-9-]+`,
 * behaviour being *everything minus perf*, so a new behaviour spec needs no config edit — which
 * `playwright-projects.test.ts` asserts against representative future filenames rather than trusting.
 */

import { expect, test } from '@playwright/test';

import { DEFAULT_TUNING } from '../../src/sim/playerTuning';
import { PROGRESS_KEY } from '../../src/game/save';
import { waitTicks } from './gameHarness';
import {
  bootToTouchPlay,
  canvasRect,
  centreOf,
  contactDown,
  faceAlpha,
  contactsDown,
  contactUp,
  drawnZone,
  drawnZones,
  installTouchDriver,
  liftEveryContact,
  tapControl,
} from './touchHarness';

test.beforeEach(async ({ page }) => {
  await installTouchDriver(page);
});

test.afterEach(async ({ page }) => {
  // A finger left down poisons the next test in the file, and the failure would land somewhere else.
  await liftEveryContact(page).catch(() => {});
});

test.describe('the level menu answers a finger, once, every visit', () => {
  test('12.5d two fingers on two level rows start ONE level', async ({ page }) => {
    // 🔴 The Codex re-review found this one. `attachTapRoutes` spends a press per POINTER, on
    // purpose — a lifted finger has to be able to tap again after a locked row refused — so two
    // fingers landing on two unlocked rows in the same frame called `play()` twice and queued two
    // `scene.start('Game')` ops (`ScenePlugin.js:481-484` queues every start). ENTER cannot produce
    // this; a phone can, and the level the player gets is whichever finger landed second.
    // ⚠️ **A fresh save cannot show this defect and a gate built on one is decoration.** Only
    // level-01 is unlocked out of the box, so `play()` refuses the second row before the latch is
    // ever consulted — the mutation stayed green until this seed was added. Two UNLOCKED rows are
    // the precondition, and they are asserted below rather than assumed.
    await page.addInitScript(
      ([key, value]) => window.localStorage.setItem(key, value),
      [
        PROGRESS_KEY,
        JSON.stringify({
          version: 1,
          lastLevel: 'level-01',
          levels: { 'level-01': { completed: true, bestGears: 1 } },
        }),
      ] as const,
    );
    await bootToTouchPlay(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, {
      timeout: 10_000,
    });

    const unlocked = await page.evaluate(
      () =>
        (
          (window as unknown as { __phaserGame: { scene: { getScene(k: string): { rows: { unlocked: boolean }[] } } } })
            .__phaserGame.scene.getScene('LevelSelect').rows ?? []
        ).filter((r) => r.unlocked).length,
    );
    expect(unlocked, 'fewer than two rows are unlocked, so two fingers cannot start two levels').toBeGreaterThanOrEqual(
      2,
    );

    const rect = await canvasRect(page);
    const rows = (await drawnZones(page, 'LevelSelect')).filter((z) => z.name.startsWith('row-'));
    expect(rows.length, 'the level menu drew no rows, so this test proves nothing').toBeGreaterThan(1);

    // Count the starts at the source. `scene.start` is what `play()` calls, and wrapping it is the
    // only way to tell "one start" from "two starts that happened to land on the same level".
    await page.evaluate(() => {
      type Plug = { start(key: string, data?: unknown): unknown };
      const menu = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): { scene: Plug } } } }
      ).__phaserGame.scene.getScene('LevelSelect');
      const starts: string[] = [];
      (window as unknown as { __starts: string[] }).__starts = starts;
      const real = menu.scene.start.bind(menu.scene);
      menu.scene.start = (key: string, data?: unknown): unknown => {
        starts.push(String((data as { levelId?: string } | undefined)?.levelId ?? key));
        return real(key, data);
      };
    });
    const first = centreOf(rect, rows[0]);
    const second = centreOf(rect, rows[1]);

    // 🔴 ONE round trip, so both `touchstart`s land in the same JS task and Phaser's input queue
    // drains them in one frame. Two awaited `contactDown` calls are not two simultaneous fingers:
    // the first is fully processed — scene start included — before the second is dispatched, and
    // the mutation that deletes the latch stayed GREEN through a gate built that way.
    await contactsDown(page, [
      { id: 21, x: first.x, y: first.y },
      { id: 22, x: second.x, y: second.y },
    ]);
    await contactUp(page, 21);
    await contactUp(page, 22);

    await page.waitForFunction(() => window.__game?.sceneKey === 'Game', undefined, { timeout: 20_000 });
    // Settle: a second queued start would drain on a later frame, not this one.
    await waitTicks(page, 60);
    expect(
      await page.evaluate(() => window.__game?.sceneKey),
      'the second queued start pulled the game back out of the level',
    ).toBe('Game');
    // ⚠️ **COUNT the starts; do not name the winner.** 12.5 says nothing about which of two
    // simultaneous contacts should win, and the first version of this assertion demanded
    // `level-01` — which would have false-redded an implementation that started exactly once and
    // deterministically chose the second contact. Codex round-3: a test may not enforce a rule the
    // criterion does not state. The claim is *one start*, and either unlocked row satisfies it.
    expect(
      await page.evaluate(() => (window as unknown as { __starts: string[] }).__starts),
      'two fingers queued two scene starts',
    ).toHaveLength(1);
    expect(
      [(await page.evaluate(() => window.__game?.levelId)) ?? ''],
      'the level reached is not one of the two rows that were tapped',
    ).toEqual([expect.stringMatching(/^level-0[12]$/)]);
  });

  test('12.6c the walk latch survives a level-select round trip', async ({ page }) => {
    // 🔴 The Codex round-6 BLOCKER, and the SAME lifetime mistake as 12.6b in the other
    // direction. The latch lived on `TouchControlsLayer.walking`; `UIScene`'s SHUTDOWN destroys that
    // layer and the next one comes up with `walking = false`. So a player who chose to walk, opened
    // the menu and came back silently resumed RUNNING with a dark plate.
    // ⚠️ The unit test that was meant to cover this called `held()` on the already-destroyed
    // object, which proves the field and not the persistence. This drives the real destruction path.
    await bootToTouchPlay(page);

    const held = async (): Promise<number> => {
      // Hold RIGHT long enough to reach the cap for whichever gait is in force. `runMax` is 4.7
      // ticks from a standstill (`playerTuning.ts:71`); 45 is well clear for either.
      const rect = await canvasRect(page);
      const right = centreOf(rect, await drawnZone(page, 'UI', 'right'));
      await contactDown(page, 41, right.x, right.y);
      await waitTicks(page, 45);
      const vx = await page.evaluate(() => {
        const player = window.__game?.player as { vx: number } | null | undefined;
        return Math.abs(player?.vx ?? 0);
      });
      await contactUp(page, 41);
      await waitTicks(page, 30);
      return vx;
    };

    const running = await held();
    expect(running, 'the game never reached run speed, so the walk case proves nothing').toBeGreaterThan(
      DEFAULT_TUNING.walkMax * 1.5,
    );

    // 🔴 Both sides, and against the plate's OWN resting value. An upper bound alone is
    // satisfied by a dead RIGHT control (0 px/tick reads as "walking"), and `> 0` is satisfied by a
    // plate that never lights at all, since a resting art face is already 0.55 opaque. Codex
    // round-7: a bound that the broken case also passes is not a bound.
    const walkAtRest = await faceAlpha(page, 'UI', 'walk');
    expect(walkAtRest, 'there is no walk plate to read').toBeGreaterThan(0);

    await tapControl(page, 'UI', 'walk', 42);
    const litBefore = await faceAlpha(page, 'UI', 'walk');
    expect(litBefore, 'the walk plate did not light when it was tapped').toBeGreaterThan(walkAtRest!);
    const walking = await held();
    const atWalkSpeed = (vx: number): boolean =>
      vx > DEFAULT_TUNING.walkMax * 0.9 && vx < DEFAULT_TUNING.walkMax * 1.1;
    expect(atWalkSpeed(walking), `tapping walk left the player at ${walking}, not walkMax`).toBe(true);

    // The round trip that used to reset it: ESC to the menu, tap the first row back into a level.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, { timeout: 10_000 });
    const rect = await canvasRect(page);
    const rows = (await drawnZones(page, 'LevelSelect')).filter((z) => z.name.startsWith('row-'));
    expect(rows.length, 'the level menu drew no rows').toBeGreaterThan(0);
    const at = centreOf(rect, rows[0]);
    await contactDown(page, 43, at.x, at.y);
    await contactUp(page, 43);
    await page.waitForFunction(() => window.__game?.sceneKey === 'Game', undefined, { timeout: 20_000 });
    await waitTicks(page, 30);

    const afterMenu = await held();
    expect(
      atWalkSpeed(afterMenu),
      `the player came back from the level menu at ${afterMenu}, having chosen to walk`,
    ).toBe(true);
    expect(
      await faceAlpha(page, 'UI', 'walk'),
      'the gait survived but the plate came back dark, so the player cannot see which gait they are in',
    ).toBe(litBefore);
  });

  test('12.6b the level menu still works on a SECOND visit', async ({ page }) => {
    // 🔴 The regression the two-finger latch caused, and the Codex round-3 BLOCKER. `started` was
    // a FIELD INITIALISER, and Phaser preserves the scene instance across a shutdown
    // (`Systems.js:760-788`) — so after one level was chosen the latch stayed set and the menu was
    // dead on every later visit, to touch AND to ENTER, until reload. A repair for a rare two-finger
    // race that broke the ordinary one-finger case.
    await bootToTouchPlay(page);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, { timeout: 10_000 });

    const tapFirstRow = async (id: number): Promise<void> => {
      const rect = await canvasRect(page);
      const rows = (await drawnZones(page, 'LevelSelect')).filter((z) => z.name.startsWith('row-'));
      expect(rows.length, 'the level menu drew no rows').toBeGreaterThan(0);
      const at = centreOf(rect, rows[0]);
      await contactDown(page, id, at.x, at.y);
      await contactUp(page, id);
      await page.waitForFunction(() => window.__game?.sceneKey === 'Game', undefined, { timeout: 20_000 });
    };

    await tapFirstRow(31);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, { timeout: 10_000 });
    // The whole point: the SECOND visit has to answer a tap exactly as the first did.
    await tapFirstRow(32);
  });
});
