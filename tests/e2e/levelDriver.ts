/**
 * The auto-player that drives level-01 to its exit for criterion 8.6, split out of
 * `phase-08-complete.spec.ts` at the 400-line limit.
 *
 * ## Why the jumps are dispatched from inside the page
 *
 * The first version held ArrowRight from Playwright and pressed Space on a loop with `waitTicks`
 * between presses. Every press and every wait is a round trip, so 200 of them cost ~40 s of pure
 * latency before the level had a chance to finish, and the presses were not aimed at anything — the
 * run timed out at 60 s having fallen into the same gap repeatedly.
 *
 * This installs a `requestAnimationFrame` loop in the page that dispatches genuine `KeyboardEvent`s on
 * `window`, which is where Phaser's keyboard plugin listens. It is the same policy the unit-level
 * auto-player uses (`level-completable.test.ts`): hold Right, jump when blocked or when the ground
 * ahead runs out. **It is not a teleport** — every hazard, every enemy and the whole route are still in
 * the way, which is what makes "the level was finished" mean anything.
 *
 * ⚠️ A wait expressed in ticks cannot bound this window, so nothing here sleeps: the loop runs in the
 * page and Playwright waits on the terminal CONDITION.
 */

import type { Page } from '@playwright/test';

/**
 * Play level-01 to its exit, driving the game with REAL key events.
 *
 * ## Why the jumps are dispatched from inside the page
 *
 * The first version held ArrowRight from Playwright and pressed Space on a loop with `waitTicks`
 * between presses. Every press and every wait is a round trip, so 200 of them cost ~40 s of pure
 * latency before the level had a chance to finish, and the presses were not aimed at anything — the
 * run timed out at 60 s having fallen into the same gap repeatedly.
 *
 * This installs a `requestAnimationFrame` loop in the page that dispatches genuine `KeyboardEvent`s on
 * `window`, which is where Phaser's keyboard plugin listens. It is the same policy the unit-level
 * auto-player uses (`level-completable.test.ts`): hold Right, jump when blocked or when the ground
 * ahead runs out. **It is not a teleport** — every hazard, every enemy and the whole route are still in
 * the way, which is what makes "the level was finished" mean anything.
 *
 * ⚠️ A wait expressed in ticks cannot bound this window, so nothing here sleeps: the loop runs in the
 * page and Playwright waits on the terminal CONDITION.
 */
export const RUN_TIMEOUT = 90_000;

export async function playToExit(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __phaserGame: { scene: { getScene(k: string): unknown } };
      __drive?: number;
    };
    /**
     * 🔴 `keyCode` has to be forced on. Phaser's keyboard plugin dispatches on `event.keyCode`, which is
     * deprecated and therefore NOT settable through `KeyboardEventInit` — a synthetic event carries 0,
     * every key resolves to nothing, and the game simply never moves. The first version of this driver
     * looked correct and timed out at 90 s with the player standing on the spawn.
     */
    const CODES: Record<string, number> = { ArrowRight: 39, Space: 32 };
    const key = (type: 'keydown' | 'keyup', code: string) => {
      const event = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code, bubbles: true });
      Object.defineProperty(event, 'keyCode', { get: () => CODES[code] });
      window.dispatchEvent(event);
    };

    key('keydown', 'ArrowRight');

    /**
     * 🔴 Every threshold here is in MILLISECONDS or in PIXELS, never in frames.
     *
     * The first version counted frames, and it passed when this spec ran alone and failed every time
     * the whole GPU project ran ahead of it — deterministically, at 90 s, with the player stuck. The
     * sim is a fixed 60 Hz; the driver observes once per ANIMATION FRAME. Idle on this box that is
     * ~240 fps, so the player moves ~2 px between looks. Behind the Phase 5/6/7 perf specs the frame
     * rate drops and the player moves **tens of pixels** between looks — so a jump triggered by
     * "no ground 16 px ahead of the leading edge" fires when the edge is already over the hole, and
     * the driver falls into the same gap until the clock runs out.
     *
     * A frame-counted budget is not a duration and a fixed look-ahead is not a safe margin when the
     * sampling rate is the thing that varies. The look-ahead below therefore includes **how far the
     * player actually moved since the last look**, which is the distance it may move before the next
     * one, and the two counters are real time.
     */
    /** Hold Space past the apex. See the note below on why holding long is free and cutting is not. */
    const HOLD_MS = 400;
    /** The static margin, matching `level-completable.test.ts`'s `LOOK_AHEAD_PX`. */
    const LOOK_BASE = 16;
    /** No forward progress for this long means a wall. ~60 ms is the unit auto-player's 4 ticks. */
    const STUCK_MS = 60;

    let lastX = -1;
    let lastT = 0;
    let stuckMs = 0;
    /**
     * 🔴 Space must be HELD, not tapped. `sampleHeldKeys` reads `jumpHeld` from `key.isDown` every
     * frame, and releasing in the same frame as the press is the jump CUT — the player got a hop a
     * fraction of the full arc. The second attempt held it for 20 frames, which is still a cut, and
     * the player stood at x 3198 jumping into the face of the 3-tile wall 38 times without clearing
     * it. Holding longer than the arc costs nothing; holding too little is invisible except as a
     * level that cannot be finished.
     *
     * ⚠️ The release is a DEADLINE, and the ground check no longer waits for it. Suppressing the
     * check until the hold expired meant that at a low frame rate the player landed and then ran
     * blind for the remainder of the hold — the same defect as the look-ahead, wearing a hat.
     * `vy === 0` is the honest condition: evaluate whenever the feet are down.
     */
    let holdUntil = 0;

    const step = (t: number) => {
      const scene = w.__phaserGame.scene.getScene('Game') as {
        simWorld?: { player: { x: number; y: number; vy: number }; solids: { x: number; y: number; w: number; h: number }[]; completed: boolean };
      };
      const world = scene?.simWorld;
      if (!world || world.completed) return;
      if (holdUntil !== 0 && t >= holdUntil) {
        key('keyup', 'Space');
        holdUntil = 0;
      }
      const { player } = world;
      if (player.vy === 0) {
        const travelled = lastX < 0 ? 0 : player.x - lastX;
        // The leading edge, plus the static margin, plus one more observation's worth of travel.
        const lead = player.x + 66 + LOOK_BASE + Math.max(0, travelled);
        stuckMs = Math.abs(player.x - lastX) < 0.5 ? stuckMs + (lastT === 0 ? 0 : t - lastT) : 0;
        const ground = world.solids.some(
          (s) => s.x <= lead && s.x + s.w >= lead && s.y >= player.y - 8 && s.y <= player.y + 600,
        );
        if (holdUntil === 0 && (stuckMs >= STUCK_MS || !ground)) {
          key('keydown', 'Space');
          holdUntil = t + HOLD_MS;
          stuckMs = 0;
        }
      }
      lastX = player.x;
      lastT = t;
      w.__drive = requestAnimationFrame(step);
    };
    w.__drive = requestAnimationFrame(step);
  });

  try {
    await page.waitForFunction(
      () => {
        const scene = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('Game') as { simWorld?: { completed: boolean } };
        return Boolean(scene?.simWorld?.completed);
      },
      undefined,
      { timeout: RUN_TIMEOUT, polling: 100 },
    );
  } finally {
    await page.evaluate(() => {
      const w = window as unknown as { __drive?: number };
      if (w.__drive !== undefined) cancelAnimationFrame(w.__drive);
      const up = new KeyboardEvent('keyup', { code: 'ArrowRight', key: 'ArrowRight', bubbles: true });
      Object.defineProperty(up, 'keyCode', { get: () => 39 });
      window.dispatchEvent(up);
    });
  }
}
