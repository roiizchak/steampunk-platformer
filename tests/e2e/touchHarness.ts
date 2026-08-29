import { expect } from '@playwright/test';

type Page = import('@playwright/test').Page;

// Re-exported so a spec has one import for "drive the game by touch". The split is a
// file-size seam, not an API boundary — `touchMeasure.ts` carries why the measuring half has
// to stay independent of the production layout.
export * from './touchMeasure';

import { canvasRect, centreOf, drawnZone } from './touchMeasure';

/**
 * **Raw multi-contact touch, because Playwright's own API cannot express the criterion.**
 *
 * 🔴 `Touchscreen` exposes exactly one method — `tap`
 * (`node_modules/playwright-core/types/types.d.ts:22735`). A tap is press-and-release at one point,
 * so criterion 12.3 — *a thumb holding RIGHT while the other hand fires JUMP, both inside one tick
 * batch* — is not expressible with it. Two sequential taps would pass against a build that can only
 * ever track one finger, which is the exact defect the criterion exists to catch.
 *
 * So contacts are dispatched as real `TouchEvent`s at the canvas, with a live `touches` list
 * maintained across calls. That is what the browser sends and what Phaser's `InputManager` listens
 * for, so nothing here is a stand-in for the production path — the events are the production path.
 *
 * ## Why the driver is installed with `addInitScript`
 *
 * It must exist before the page's own scripts run and survive every navigation a spec makes. It
 * touches nothing the game can see: no globals the game reads, no listeners, no styles.
 */

/**
 * Install the contact driver. Call once per spec, BEFORE the first `goto`.
 *
 * The driver keeps its own `active` map so `touches` and `targetTouches` are correct on every
 * event — a `touchend` whose `touches` list still contains the lifted finger is a different event
 * from the one a browser sends, and Phaser reads both lists.
 */
export async function installTouchDriver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const active = new Map<number, { x: number; y: number }>();
    const last = new Map<number, { x: number; y: number }>();

    const canvas = (): HTMLCanvasElement => {
      const c = document.querySelector('canvas');
      if (!c) throw new Error('no canvas to dispatch touches at');
      return c as HTMLCanvasElement;
    };

    const makeTouch = (id: number, p: { x: number; y: number }): Touch =>
      new Touch({
        identifier: id,
        target: canvas(),
        clientX: p.x,
        clientY: p.y,
        pageX: p.x,
        pageY: p.y,
        screenX: p.x,
        screenY: p.y,
        radiusX: 12,
        radiusY: 12,
        rotationAngle: 0,
        force: 1,
      });

    const fire = (type: string, changedIds: number[]): void => {
      const touches = [...active.entries()].map(([id, p]) => makeTouch(id, p));
      const changed = changedIds.map((id) => {
        const p = active.get(id) ?? last.get(id);
        if (!p) throw new Error(`touch ${id} has never been placed`);
        return makeTouch(id, p);
      });
      canvas().dispatchEvent(
        new TouchEvent(type, {
          touches,
          targetTouches: touches,
          changedTouches: changed,
          bubbles: true,
          cancelable: true,
          view: window,
        }),
      );
    };

    (window as unknown as { __touch: unknown }).__touch = {
      down(id: number, x: number, y: number): void {
        active.set(id, { x, y });
        last.set(id, { x, y });
        fire('touchstart', [id]);
      },
      move(id: number, x: number, y: number): void {
        active.set(id, { x, y });
        last.set(id, { x, y });
        fire('touchmove', [id]);
      },
      up(id: number): void {
        active.delete(id);
        fire('touchend', [id]);
      },
      /** Lift every finger. A spec that leaves one down poisons the next assertion in the file. */
      reset(): void {
        for (const id of [...active.keys()]) {
          active.delete(id);
          fire('touchend', [id]);
        }
      },
      count(): number {
        return active.size;
      },
    };
  });
}

// 🔴 Each `page.evaluate` reaches for `window.__touch` INLINE. Playwright serialises only the
// function it is given, so a shared Node-side accessor would be `undefined` in the page — a
// failure that looks like the driver was never installed.
type Driver = {
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  up(id: number): void;
  reset(): void;
  count(): number;
};

export async function contactDown(page: Page, id: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([i, cx, cy]) => (window as unknown as { __touch: Driver }).__touch.down(i, cx, cy),
    [id, x, y] as [number, number, number],
  );
}

/**
 * Several fingers down in ONE round trip, so they reach Phaser in the SAME frame.
 *
 * 🔴 Two awaited `contactDown` calls are not two simultaneous fingers. Each is its own CDP round
 * trip, so the first is fully processed — scene start and all — before the second is dispatched,
 * and a gate built from them cannot see a same-frame race at all: the M25 mutation stayed green
 * through one. Firing both inside a single `page.evaluate` puts both `touchstart`s in one JS task,
 * which is where Phaser's input queue drains them together.
 */
export async function contactsDown(
  page: Page,
  contacts: readonly { id: number; x: number; y: number }[],
): Promise<void> {
  await page.evaluate((list) => {
    for (const c of list) (window as unknown as { __touch: Driver }).__touch.down(c.id, c.x, c.y);
  }, contacts as { id: number; x: number; y: number }[]);
}

export async function contactMove(page: Page, id: number, x: number, y: number): Promise<void> {
  await page.evaluate(
    ([i, cx, cy]) => (window as unknown as { __touch: Driver }).__touch.move(i, cx, cy),
    [id, x, y] as [number, number, number],
  );
}

export async function contactUp(page: Page, id: number): Promise<void> {
  await page.evaluate((i) => (window as unknown as { __touch: Driver }).__touch.up(i), id);
}

/** Lift every finger. A spec that leaves one down poisons the next assertion in the file. */
export async function liftEveryContact(page: Page): Promise<void> {
  await page.evaluate(() => (window as unknown as { __touch: Driver }).__touch.reset());
}

/** How many contacts the driver believes are down — a guard against a leaked finger. */
export async function liveContacts(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __touch: Driver }).__touch.count());
}

/** Press a named control by its LIVE position and lift again. */
export async function tapControl(page: Page, sceneKey: string, name: string, id = 1): Promise<void> {
  const rect = await canvasRect(page);
  const zone = await drawnZone(page, sceneKey, name);
  const p = centreOf(rect, zone);
  await contactDown(page, id, p.x, p.y);
  await contactUp(page, id);
}

/**
 * Boot straight into a RUNNING game on a touch device, without touching anything.
 *
 * 🔴 `bootToGame` cannot be used from a touch spec, and finding out why was the first thing this
 * phase's e2e run taught: it clicks the canvas to give the page keyboard focus, and on a
 * touch-enabled context that click lands on `TitleScene`'s new full-view tap zone. The welcome
 * screen dismisses to the LEVEL MENU — correct product behaviour, and the wrong place to start a
 * spec about the play controls. Every scene came back SHUTDOWN with `LevelSelect` running.
 *
 * So this takes the same dev-surface route `dismissTitle` documents — stop `Title`, resume `Game` —
 * and never dispatches a pointer. Keyboard still reaches the game: Phaser listens on `window`, and
 * events from `page.keyboard` bubble there from `body` without the canvas needing focus.
 *
 * The player-facing route (tap the title, tap a level) is what `phase-12-journey.spec.ts` drives,
 * end to end, which is where it belongs.
 */
export async function bootToTouchPlay(page: Page): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout: 20_000 },
  );

  const view = await page.evaluate(() => window.__game);
  expect(view?.bootError).toBeNull();
  expect(view?.ready).toBe(true);
  expect(view?.sceneKey).toBe('Game');

  const before = await page.evaluate(() => window.__game?.tick ?? 0);
  await page.evaluate(() => {
    const handle = (
      window as unknown as { __phaserGame?: { scene: { stop(k: string): void; resume(k: string): void } } }
    ).__phaserGame;
    handle?.scene.stop('Title');
    handle?.scene.resume('Game');
  });
  // The tick MOVING is the only observation that proves the sim is running rather than uncovered —
  // `drainTicks` floors a sub-tick delta to zero, so "the title is gone" is not a barrier.
  await page.waitForFunction((t) => (window.__game?.tick ?? 0) > (t as number), before, {
    timeout: 20_000,
  });
}

/** How long a touch-driven run of level-01 may take. Matches `levelDriver.RUN_TIMEOUT`. */
export const TOUCH_RUN_TIMEOUT = 90_000;

/**
 * Play level-01 to its exit **with fingers only** — criterion 12.1's middle section.
 *
 * The same policy as `levelDriver.playToExit` (hold right; jump when stuck or when the ground ahead
 * runs out) with the same three hard-won thresholds, but every input is a contact on a drawn control
 * rather than a synthetic `KeyboardEvent`. It is not a teleport: every hazard and the whole route are
 * still in the way, which is what makes "the level was finished by touch" mean anything.
 *
 * ⚠️ The loop runs INSIDE the page. Two hundred round trips would cost more latency than the level
 * takes to play, and a wait expressed in ticks cannot bound this window — Playwright waits on the
 * terminal condition instead.
 *
 * 🔴 JUMP is HELD, not tapped, for the reason `levelDriver` records: `jumpHeld` is a LEVEL read every
 * frame, and releasing in the same frame as the press is the jump cut. A tapped jump clears nothing.
 */
export async function playToExitByTouch(page: Page): Promise<void> {
  const rect = await canvasRect(page);
  const right = centreOf(rect, await drawnZone(page, 'UI', 'right'));
  const jump = centreOf(rect, await drawnZone(page, 'UI', 'jump'));

  await page.evaluate(
    ([rx, ry, jx, jy]) => {
      const w = window as unknown as {
        __phaserGame: { scene: { getScene(k: string): unknown } };
        __touch: { down(id: number, x: number, y: number): void; up(id: number): void };
        __touchDrive?: number;
      };
      const HOLD_MS = 400;
      const LOOK_BASE = 16;
      const STUCK_MS = 60;
      const RIGHT_ID = 1;
      const JUMP_ID = 2;

      w.__touch.down(RIGHT_ID, rx, ry);

      let lastX = -1;
      let lastT = 0;
      let stuckMs = 0;
      let holdUntil = 0;

      const step = (t: number): void => {
        const scene = w.__phaserGame.scene.getScene('Game') as {
          simWorld?: {
            player: { x: number; y: number; vy: number };
            solids: { x: number; y: number; w: number; h: number }[];
            completed: boolean;
          };
        };
        const world = scene?.simWorld;
        if (!world || world.completed) return;
        if (holdUntil !== 0 && t >= holdUntil) {
          w.__touch.up(JUMP_ID);
          holdUntil = 0;
        }
        const { player } = world;
        if (player.vy === 0) {
          const travelled = lastX < 0 ? 0 : player.x - lastX;
          const lead = player.x + 66 + LOOK_BASE + Math.max(0, travelled);
          stuckMs = Math.abs(player.x - lastX) < 0.5 ? stuckMs + (lastT === 0 ? 0 : t - lastT) : 0;
          const ground = world.solids.some(
            (s) => s.x <= lead && s.x + s.w >= lead && s.y >= player.y - 8 && s.y <= player.y + 600,
          );
          if (holdUntil === 0 && (stuckMs >= STUCK_MS || !ground)) {
            w.__touch.down(JUMP_ID, jx, jy);
            holdUntil = t + HOLD_MS;
            stuckMs = 0;
          }
        }
        lastX = player.x;
        lastT = t;
        w.__touchDrive = requestAnimationFrame(step);
      };
      w.__touchDrive = requestAnimationFrame(step);
    },
    [right.x, right.y, jump.x, jump.y] as [number, number, number, number],
  );

  try {
    await page.waitForFunction(
      () => {
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as { simWorld?: { completed: boolean } };
        return Boolean(scene?.simWorld?.completed);
      },
      undefined,
      { timeout: TOUCH_RUN_TIMEOUT, polling: 100 },
    );
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as {
        __touchDrive?: number;
        __touch: { reset(): void };
      };
      if (w.__touchDrive !== undefined) cancelAnimationFrame(w.__touchDrive);
      w.__touch.reset();
    });
  }
}
