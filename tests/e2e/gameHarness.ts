import { expect } from '@playwright/test';
import './debugView';

/**
 * Shared e2e harness for every Phase 2+ spec.
 *
 * Extracted when `phase-02-movement.spec.ts` crossed 400 lines and split in two. Copying these
 * five helpers into the second spec instead would have created exactly the drift this project has
 * already paid for twice — `src/game/constants.ts` says it about the `image-rendering` list, and
 * `debugView.ts` says it about the `__game` type.
 *
 * Two rules are enforced here rather than left to each spec:
 *
 *  - **Never `waitForTimeout`.** Every wait is on `window.__game`, so a hang fails as a timeout
 *    instead of passing as a sleep that happened to be long enough.
 *  - **Assert the type before the value** *(vault C1)*. `player` is `unknown` on the debug surface
 *    on purpose; a prior project passed vacuously on `undefined === undefined` through a debug hook
 *    that returned nothing.
 */

export interface DebugPlayer {
  x: number;
  y: number;
  vx: number;
  vy: number;
  state: string;
}

export const BOOT_TIMEOUT = 20_000;

type Page = import('@playwright/test').Page;

/** Load the game, wait for a terminal boot state, assert it succeeded, and focus the canvas. */
export async function bootToGame(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout: BOOT_TIMEOUT },
  );

  const view = await page.evaluate(() => window.__game);
  expect(view?.bootError).toBeNull();
  expect(view?.ready).toBe(true);
  expect(view?.sceneKey).toBe('Game');

  // Focus the page before sending keys. Without it the keystrokes have no target and every
  // movement assertion in every spec would fail for a reason unrelated to movement.
  await page.locator('canvas').click();
}

export async function readPlayer(page: Page): Promise<DebugPlayer> {
  const player = await page.evaluate(() => window.__game?.player);
  // Type before value (vault C1): every field, every time.
  expect(typeof (player as DebugPlayer)?.x).toBe('number');
  expect(typeof (player as DebugPlayer)?.y).toBe('number');
  expect(typeof (player as DebugPlayer)?.vx).toBe('number');
  expect(typeof (player as DebugPlayer)?.vy).toBe('number');
  expect(typeof (player as DebugPlayer)?.state).toBe('string');
  return player as DebugPlayer;
}

export async function currentTick(page: Page): Promise<number> {
  const tick = await page.evaluate(() => window.__game?.tick);
  expect(typeof tick).toBe('number');
  return tick as number;
}

/**
 * Wait until the simulation has advanced AT LEAST `count` ticks. Never a sleep.
 *
 * "At least" is the important word, and it has already caused one false green: a test that waited
 * 30 ticks and then read the player's position once passed with a mutation applied, because under
 * six parallel workers the counter overshot an entire 65-tick jump arc between polls. Do not use
 * this to bound a window in which something must NOT happen — sample continuously instead.
 */
export async function waitTicks(page: Page, count: number): Promise<void> {
  const target = (await currentTick(page)) + count;
  await page.waitForFunction((t) => (window.__game?.tick ?? 0) >= t, target, {
    timeout: BOOT_TIMEOUT,
  });
}
