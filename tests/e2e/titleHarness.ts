/**
 * Shared page-side helpers for the Phase 11 welcome-screen specs.
 *
  * Extracted when the welcome spec's own route tests pushed it past the hard 400-line ceiling that
 * `tests/unit/file-size.test.ts` enforces with no exemptions. Two spec files now import these, which
 * is also the shape §5 asks for: a criterion asserted against ONE definition rather than two that
 * agree on the happy path.
 */


import { BOOT_TIMEOUT } from './gameHarness';
import './debugView';

export type Page = import('@playwright/test').Page;

export type SceneHandle = { scene: { isActive(key: string): boolean; getScene(key: string): unknown } };

/** Phaser scene status constants: PAUSED sits one above RUNNING. */
export const RUNNING = 5;
export const PAUSED = 6;

/**
 * ⚠️ There is deliberately no Node-side `handle()` helper. A function declared in the spec module
 * does not exist inside `page.evaluate` — the body is serialised and run in the browser — so every
 * reach for `__phaserGame` is written inline, in the page, the way `audioHelpers.ts` does it.
 */
export const TITLE = 'Title';

/** Boot and stop at the welcome screen, without dismissing it. */
export async function bootToTitle(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout: BOOT_TIMEOUT },
  );
  await page.waitForFunction(
    () =>
      Boolean(
        (window as unknown as { __phaserGame?: SceneHandle }).__phaserGame?.scene.isActive('Title'),
      ),
    undefined,
    { timeout: BOOT_TIMEOUT },
  );
  await page.locator('canvas').click();
}

/** Is `key` an active scene? The cast lives INSIDE the evaluate, which is where it must run. */
export function sceneActive(page: Page, key: string): Promise<boolean> {
  return page.evaluate(
    (k) => (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.isActive(k as string),
    key,
  );
}

export function gameStatus(page: Page): Promise<number | undefined> {
  return page.evaluate(() => {
    const scene = (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.getScene(
      'Game',
    ) as { sys?: { settings?: { status?: number } } } | undefined;
    return scene?.sys?.settings?.status;
  });
}

/** Sample the tick across N animation frames INSIDE the page and return the aggregate. */
export function tickOverFrames(page: Page, frames: number): Promise<{ first: number; last: number; max: number }> {
  return page.evaluate(
    (n) =>
      new Promise<{ first: number; last: number; max: number }>((resolve) => {
        const first = window.__game?.tick ?? -1;
        let max = first;
        let seen = 0;
        const step = (): void => {
          const t = window.__game?.tick ?? -1;
          if (t > max) max = t;
          seen += 1;
          if (seen >= (n as number)) {
            resolve({ first, last: t, max });
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    frames,
  );
}
/**
 * Dispatch a keydown/keyup pair at the page, optionally as an OS auto-repeat.
 *
 * The same shape `phase-11-audio-keys.spec.ts` uses, and for the same reason its header gives: an
 * unreleased synthetic key leaves `Key.isDown` true and poisons every later press.
 */
export async function fireKey(page: Page, code: string, repeat = false): Promise<void> {
  await page.evaluate(
    ([c, rp]) => {
      const make = (type: string): KeyboardEvent =>
        new KeyboardEvent(type, {
          code: c as string,
          repeat: rp as boolean,
          bubbles: true,
          cancelable: true,
        });
      window.dispatchEvent(make('keydown'));
      window.dispatchEvent(make('keyup'));
    },
    [code, repeat] as const,
  );
}


/**
 * Restart `Game` and wait for the restart to have actually HAPPENED.
 *
 * 🔴 **The barrier is a SHUTDOWN observer, not a level of `tick` or `ready`.** `ScenePlugin.restart`
 * only queues a `stop` and a `start` (`ScenePlugin.js:234`), so a test that then waits for
 * `tick > 0` or `ready === true` waits for something the PRE-restart scene already satisfies and can
 * assert against the scene it meant to replace. Both 11.10 tests did exactly that, and neither could
 * be trusted to go red. Codex implementation review, finding 1.
 *
 * A one-shot SHUTDOWN listener is a positive signal that the restart began, and both queued ops
 * drain in the same `processQueue` pass — the loop re-reads `_queue.length` — so by the time the
 * flag is observable from Node the new `create()` has run too.
 */
export async function restartGame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scene = (window as unknown as { __phaserGame: SceneHandle }).__phaserGame.scene.getScene(
      'Game',
    ) as { events: { once(event: string, fn: () => void): void }; scene: { restart(): void } };
    (window as unknown as { __gameRestarted?: boolean }).__gameRestarted = false;
    scene.events.once('shutdown', () => {
      (window as unknown as { __gameRestarted?: boolean }).__gameRestarted = true;
    });
    scene.scene.restart();
  });
  await page.waitForFunction(
    () => (window as unknown as { __gameRestarted?: boolean }).__gameRestarted === true,
    undefined,
    { timeout: BOOT_TIMEOUT },
  );
}

/**
 * Every string the Title scene actually DRAWS, in display-list order.
 *
 * Reads the live display list rather than the source, because the claim is about what a player sees
 * on a screen - and the two shipped repairs to this screen were both wrong in a browser while every
 * source-text gate stayed green.
 */
export async function drawnTitleLines(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const game = (window as unknown as {
      __phaserGame: { scene: { getScene(k: string): { children: { list: unknown[] } } } };
    }).__phaserGame;
    const list = game.scene.getScene('Title').children.list as Array<{
      type?: string;
      text?: unknown;
      visible?: boolean;
    }>;
    return list
      .filter((o) => o.type === 'Text' && o.visible !== false && typeof o.text === 'string')
      .map((o) => o.text as string);
  });
}
