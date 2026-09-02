/**
 * Keep a screen's tap targets on the live view, and let go of the ScaleManager when it ends.
 *
 * 🔴 **The filled view (2026-09-01, `src/game/viewSize.ts`) is what made this necessary.** `attachTapRoutes` builds
 * its zones once from the target array; under `FIT` the view could never change, so a snapshot was
 * the whole truth. It can now — a rotation or a fullscreen toggle re-lays-out the screen — and a
 * stale zone sits where a button used to be, answering taps in the wrong place with nothing on
 * screen to explain it. All three screens with their own routes had the same latent defect:
 * `TitleScene`, `LevelSelectScene` and the completion panel. Named by the Codex plan review,
 * round 1.
 *
 * ## Two rules, and both are load-bearing
 *
 * **1. `update` MUTATES the boxes; it must never replace the array.** `attachTapRoutes` captured
 * that reference, and so did `attachRotatePrompt` — which returns `void` and cannot be handed a new
 * one. `RotatePrompt.refresh()` re-reads its targets on every call, so one in-place write keeps the
 * routes and the rotate guard judging the same geometry. Replacing the array leaves the guard on
 * the old band, which is precisely the "route dead with nothing explaining it" defect
 * `touchLayout.ts:270-275` already records.
 *
 * **2. The subscription is on the GLOBAL ScaleManager**, so it needs a teardown, and that teardown
 * runs on SHUTDOWN *and* DESTROY: `SceneManager.remove()` reaches `sys.destroy()` without emitting
 * SHUTDOWN, so removing an active scene would leak the listener and everything its closure holds.
 * The same pair `TitleScene` and `gameInput.ts` already document.
 */

import { SCENE_DESTROY, SCENE_SHUTDOWN } from './engineLiterals';
import type { TapRoutes } from './touchRoutes';

interface ResizeScene {
  scale: {
    gameSize: { width: number; height: number };
    on(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
  };
  events: { once(event: string, fn: () => void): unknown };
}

export interface TapRouteResize {
  /** Idempotent. Registered against the scene's own SHUTDOWN and DESTROY as well. */
  destroy(): void;
}

export function keepTapRoutesSized(
  scene: ResizeScene,
  routes: TapRoutes,
  /** Rewrite the target boxes IN PLACE for this size. Must not replace the array. */
  update: (size: { width: number; height: number }) => void,
): TapRouteResize {
  const onResize = (): void => {
    update(scene.scale.gameSize);
    routes.updateTargets();
  };
  scene.scale.on('resize', onResize);

  let alive = true;
  const attachment: TapRouteResize = {
    destroy(): void {
      if (!alive) return;
      alive = false;
      scene.scale.off('resize', onResize);
    },
  };
  scene.events.once(SCENE_SHUTDOWN, () => attachment.destroy());
  scene.events.once(SCENE_DESTROY, () => attachment.destroy());
  return attachment;
}
