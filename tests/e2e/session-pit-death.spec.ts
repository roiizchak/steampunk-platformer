/**
 * Falling into the pit hurts, and at low health it kills and respawns you with your gears.
 *
 * ## The defect
 *
 * The owner played the production build and reported *"in levels 2, 3 and 4 there is a place where
 * the character can fall through tiles"* and nothing happens. A **bottomless** gap already kills —
 * `belowKillPlane` fires the tick the feet pass `heightPx`. A **pit** does not: a run of ground
 * walled in on both sides has a bottom, so you land on it, take nothing, and climb out.
 *
 * Five shipped. Four sat exactly where a descent lands, which
 * `tests/unit/level-hazard-free.test.ts` records as unsurvivable at any width, and the owner chose
 * to fill those in. **One is left — level-03 cols 65-69** — and it has spikes.
 *
 * ## What this file asserts, and what it deliberately leaves to a unit test
 *
 * The *observable arc*: fall, take damage, die at low health, come back at the spawn, keep the
 * gears. Everything a player can see.
 *
 * It does **not** try to prove which tick or which rectangle. Codex plan review round 2, finding 8:
 * `window.__game` is closed at eight aggregate fields by a Phase 1 ruling and carries no
 * `TickEvents`, no previous position and no hazard identity; `GameScene` publishes one world state
 * after a whole batch of ticks and `advanceSplit()` ORs the events together. An hp drop seen from
 * a browser cannot name its cause. That claim lives in `tests/unit/pit-damage-tick.test.ts`, which
 * ticks the sim over the shipped level and asserts the counterfactual.
 *
 * ## Why the enemies are cleared
 *
 * Codex round 1, finding 7. `applyWorldDamage()` collapses every source into `{ hurt, died }`, and
 * level-03 carries four enemies. A bare "hp went down" would stay green with the spikes deleted,
 * the player killed by a scavenger instead. Clearing them is what makes the pit the only thing in
 * the level that can hurt.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, readPlayer, waitTicks } from './gameHarness';
import { PROGRESS_KEY, PROGRESS_VERSION } from '../../src/game/save';

/**
 * The level and the pit.
 *
 * ⚠️ Written down here, and pinned elsewhere: `tests/unit/level-pits.test.ts` asserts the shipped
 * pit set is **exactly** `{ level-03: ['65-69'] }` and fails naming the level and the columns if a
 * layout edit moves it. So this constant cannot drift silently — the unit gate reds first.
 */
const LEVEL = 'level-03';
const PIT_CENTRE_COL = 67;
const TILE = 96;

/**
 * Boot straight into the pit's level, with its enemies cleared.
 *
 * 🔴 **The save is seeded before the page loads, not the scene restarted afterwards.** The obvious
 * route — `scene.start('Game', { levelId })` from inside the running scene — silently does nothing:
 * `pickLevel` runs the request through `resolveEntryLevel`, which enforces the UNLOCK rule, and
 * level-03 is locked on a fresh profile. The restart succeeded, stayed on level-01, and threw no
 * error. Measured with a probe, not reasoned about.
 *
 * `addInitScript` runs before any page script, so the save is in place when `BootScene` reads it.
 */
async function enterLevel(page: import('@playwright/test').Page): Promise<void> {
  await page.addInitScript(
    ({ key, version, level }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          version,
          lastLevel: level,
          levels: {
            'level-01': { completed: true, bestGears: 1 },
            'level-02': { completed: true, bestGears: 1 },
          },
        }),
      );
    },
    { key: PROGRESS_KEY, version: PROGRESS_VERSION, level: LEVEL },
  );

  await bootToGame(page);
  await page.waitForFunction((id) => window.__game?.ready === true && window.__game?.levelId === id, LEVEL, {
    timeout: 20_000,
  });

  await page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      world: { enemies: unknown[]; projectiles: unknown[] };
    };
    // 🔴 Emptied in place rather than reassigned: the sim holds the same array the scene does, and
    // a fresh `[]` would leave the tick loop iterating the original.
    scene.world.enemies.length = 0;
    scene.world.projectiles.length = 0;
  });
}

/** Drop the player into the pit from just above the floor, with the health they should have. */
async function dropIntoPit(page: import('@playwright/test').Page, hp: number): Promise<void> {
  await page.evaluate(
    ({ x, hp: health }) => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        world: { player: { x: number; y: number; vx: number; vy: number; hp: number } };
      };
      const p = scene.world.player;
      p.x = x;
      // Two tiles above the pit floor, which is one tile below the walking surface it is cut into.
      p.y = p.y - 96 * 2;
      p.vx = 0;
      p.vy = 0;
      p.hp = health;
    },
    { x: PIT_CENTRE_COL * TILE + TILE / 2, hp },
  );
}

test.describe('the pit in level-03 is a hazard, not a hole to stand in', () => {
  test('falling in costs health', async ({ page }) => {
    await enterLevel(page);
    await dropIntoPit(page, 100);

    const before = await page.evaluate(() => window.__game?.health ?? 0);
    expect(before, 'the setup did not take — health is not 100').toBe(100);

    await page.waitForFunction(() => (window.__game?.health ?? 100) < 100, undefined, {
      timeout: 10_000,
    });
    const after = await page.evaluate(() => window.__game?.health ?? 0);

    // One hazard contact costs 20. Asserting the exact figure rather than "less than before" —
    // "it went down" is also satisfied by an enemy, and by a second hit landing during i-frames.
    expect(after, 'the pit cost something other than one hazard contact').toBe(80);
  });

  /**
   * 🔴 The new way to die, gated deliberately rather than discovered by a player.
   *
   * The plan originally claimed the pit rule introduced "no new death mode". Codex plan review
   * round 1, finding 10, showed that is false: hazards deal 20 and `damagePlayer()` enters death
   * whenever that reduces hp to zero, so a player who arrives at 20 hp dies on the first fall. That
   * is intended — the pit is meant to be a threat — and it is the path this case walks end to end.
   */
  test('at 20 health it kills, respawns at the spawn, and keeps the gears', async ({ page }) => {
    await enterLevel(page);

    const spawnX = (await readPlayer(page)).x;
    expect(spawnX, 'no player to read a spawn from').toBeGreaterThan(0);

    // Gears already banked before the fall. Set directly, the way `phase-06-health.spec.ts` forces
    // hp: what is under test is whether RESPAWN preserves them, not how they were earned.
    await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        world: { gearsCollected: number };
      };
      scene.world.gearsCollected = 3;
    });

    await dropIntoPit(page, 20);
    expect(await page.evaluate(() => window.__game?.score ?? -1)).toBe(3);

    // Death, then the full death animation, then the respawn — waited on by the observable
    // consequence rather than by a tick count that would encode `DEATH_TICKS` a second time.
    await page.waitForFunction(() => (window.__game?.health ?? 100) <= 0, undefined, {
      timeout: 10_000,
    });

    await page.waitForFunction(
      (x) =>
        (window.__game?.health ?? 0) > 0 &&
        Math.abs(((window.__game?.player as { x: number } | null)?.x ?? 0) - x) < 32,
      spawnX,
      { timeout: 15_000 },
    );

    const after = await page.evaluate(() => ({
      health: window.__game?.health ?? 0,
      score: window.__game?.score ?? -1,
      x: (window.__game?.player as { x: number } | null)?.x ?? 0,
      levelId: window.__game?.levelId ?? null,
    }));

    expect(after.health, 'respawned without health').toBeGreaterThan(0);
    expect(after.levelId, 'death sent the player to a different level').toBe(LEVEL);
    expect(Math.abs(after.x - spawnX), 'respawned somewhere other than the spawn').toBeLessThan(32);
    // 🔴 The claim that makes death survivable rather than a run-ender.
    expect(after.score, 'the gears collected before the fall were lost on respawn').toBe(3);

    await waitTicks(page, 5);
    expect(await page.evaluate(() => window.__game?.score ?? -1), 'the gear total kept moving after respawn').toBe(3);
  });
});
