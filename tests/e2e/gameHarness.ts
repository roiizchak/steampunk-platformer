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

/**
 * Load the game, wait for a terminal boot state, assert it succeeded, and focus the canvas.
 *
 * `search` appends a dev-only query string — `?breakAsset=corrupt`, `?perfMutation=cue-stall`.
 * Committed mutations are driven through it rather than by hand-editing source *(vault C2)*.
 */
export async function bootToGame(page: Page, search = ''): Promise<void> {
  await page.goto('/' + search);
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

  // Phase 11: the welcome screen is a PARALLEL scene over a paused `Game`, so `sceneKey` is still
  // `'Game'` and every assertion above holds unchanged — but the sim is frozen until it is
  // dismissed. One place, so the ~31 specs that boot through here keep driving a running game.
  await dismissTitle(page);
}

/**
 * Dismiss the Phase 11 welcome screen and wait until the simulation is genuinely running again.
 *
 * ## 🔴 "Title is gone" is NOT a sufficient barrier
 *
 * `GameScene` is PAUSED while the title is up, so its published `tick` stops advancing. On the first
 * resumed frame `update()` can receive a **sub-tick delta** — this box runs ~240 Hz, so ~4.17 ms
 * against a 16.67 ms tick — and `drainTicks` floors that to **zero** ticks
 * (`src/game/frameClock.ts`). So the scene can be inactive while `tick` is still exactly what it was.
 * `phase-01-boot.spec.ts` reads a snapshot immediately after this and asserts `tick > 0`, which is
 * how that shows up: a confusing ordinary failure, while `globalSetup` passes because `ready` is
 * true. Codex plan review round 4.
 *
 * So this captures the tick first and waits for it to MOVE. That is the only observation that proves
 * the game is running rather than merely uncovered.
 *
 * A no-op when no title is up — the latch in `gameTitle.ts` shows it once per page load, so a
 * mid-spec `Game` restart does not reopen it and this returns immediately.
 */
export async function dismissTitle(page: Page): Promise<void> {
  // `__phaserGame` is reached by a local cast, never a second `declare global` — two declarations of
  // one property is a TS2717 build failure the moment they differ. See `debugView.ts`'s header.
  type SceneHandle = { scene: { isActive(key: string): boolean } };
  const titleActive = (): Promise<boolean> =>
    page.evaluate(() =>
      Boolean((window as unknown as { __phaserGame?: SceneHandle }).__phaserGame?.scene.isActive('Title')),
    );

  if (!(await titleActive())) {
    return;
  }

  const before = await page.evaluate(() => window.__game?.tick ?? 0);
  await page.locator('canvas').click();
  await page.keyboard.press('Enter');

  await page.waitForFunction(
    (t) =>
      !(window as unknown as { __phaserGame?: SceneHandle }).__phaserGame?.scene.isActive('Title') &&
      (window.__game?.tick ?? 0) > (t as number),
    before,
    { timeout: BOOT_TIMEOUT },
  );
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
