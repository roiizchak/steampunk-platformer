/**
 * **Everything the touch build hangs on `UIScene`,** in one place instead of scattered through it.
 *
 * ## Why the controls live on `UIScene` and not on `GameScene`
 *
 * `GameScene`'s camera is displaced to `(-10, -8)` for shake headroom (`gameEffects.ts:156-158`),
 * so a screen-anchored object on its display list needs a per-frame `- cam.x/y` correction — the
 * discipline `helpBannerLayer.ts:174, 255` implements, and whose absence once cost a run of a
 * 1.33 px false red. `UIScene`'s camera never moves.
 *
 * 🔴 **The cost, planned for rather than discovered.** `UIScene` deliberately survives `Game` being
 * PAUSED (`UIScene.update()`) — that is how the HUD stays up under the welcome screen. So without
 * the `isGameRunning` term in the controls' live predicate they would sit interactive under the
 * title card, driving a paused sim.
 *
 * ## Why this file exists at all
 *
 * `UIScene` crossed the 400-line ceiling when the rotate prompt landed. The ceiling says *prefer
 * splitting*, and this is the seam that was already there: three objects with one lifetime, whose
 * reasons all belong together and none of which is about drawing a HUD.
 */

import { RotatePrompt } from './rotatePrompt';
import { TouchControlsLayer, type TouchSceneLike } from './touchControlsLayer';
import type { TouchSession } from './touchSession';

/** What `UIScene` holds on to: two calls, both safe to make on a device with no touch. */
export interface UiTouchOverlay {
  /** Re-place and re-gate against the live view. Polled every frame from `UIScene.update()`. */
  refresh(): void;
  /** `UIScene`'s SHUTDOWN. Removes the listeners Phaser will not remove for us. */
  destroy(): void;
}

/**
 * Build the controls and the rotate prompt, and point the session at them.
 *
 * `isTouchDevice` is `game.device.input.touch`, which Phaser sets from `ontouchstart` or
 * `navigator.maxTouchPoints` (`src/device/Input.js:39-41`). A desktop gets **no objects at all** —
 * not hidden ones, not disabled ones: an invisible interactive object still swallows pointers.
 */
export function attachUiTouch(
  scene: TouchSceneLike,
  isTouchDevice: boolean,
  session: TouchSession,
): UiTouchOverlay {
  const layer = new TouchControlsLayer(scene, isTouchDevice);
  layer.create();
  // Always, even with nothing pending — `touchSession.ts` for why there is one path and no branch
  // on which launch this is.
  session.activate(layer);

  // No scene argument any more, and no `create()`: the overlay is DOM and the decision comes from
  // the live viewport rather than from `scene.scale.displaySize`, which is stale after a rotation.
  const prompt = new RotatePrompt(isTouchDevice);

  return {
    refresh(): void {
      session.refresh();
      // Beside the controls, on the same frame, from the same predicate — the prompt and the thing
      // it covers can never disagree about which side of the 44 px threshold this frame is on.
      prompt.refresh();
    },
    destroy(): void {
      // 🔴 M2b / M14, and the order matters. Phaser preserves the scene INSTANCE across a shutdown
      // (`Systems.js:760-788`) and cleans only `InputPlugin`'s own listeners
      // (`InputPlugin.js:3098-3142`) — the layer's `game.events` BLUR/HIDDEN subscriptions are ours.
      // Deactivate FIRST, so nothing writes to a layer that is mid-destruction.
      session.deactivate();
      layer.destroy();
      prompt.destroy();
    },
  };
}
