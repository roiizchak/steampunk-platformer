/**
 * **The rotate prompt, its resize subscription and its teardown — in one call.**
 *
 * 🔴 This exists because the prompt was drawn on `UIScene` and `LevelSelectScene` and **not** on
 * `TitleScene`, while all three carry tap routes. The QA gate's adversarial code review found the
 * consequence: a phone held upright shows "ROTATE YOUR DEVICE" at depth 3000 over a level row that
 * is interactive from the moment it is created, so a tap meant for the prompt starts a level
 * underneath it. `rotatePrompt.ts`'s own header claimed that could not happen; the claim held only
 * for the play controls, which are gated by `touchTargetsFit` in
 * `touchControlsLayer.refresh()`, and not for a single tap route.
 *
 * The repair has two halves and this file is the second one. `touchRoutes.ts` now asks the same
 * `touchTargetsFit` question the prompt asks, on the same frame, from the scene's own
 * `ScaleManager` — so a route cannot be live on a frame the prompt is up. That closes the tap. What
 * remains is that a screen with a route and **no prompt** would be gated silently, which is a worse
 * bug than the one being fixed: the player taps, nothing happens, and nothing says why. So every
 * screen carrying a route carries a prompt, and attaching one has to be cheap enough that no scene
 * declines it on line count.
 *
 * ⚠️ `scene.scale` is the **GLOBAL** `ScaleManager`; stopping a scene does not remove a listener on
 * it, and a later resize would run against destroyed objects. SHUTDOWN **and** DESTROY, each
 * cancelling the other — `SceneManager.remove()` reaches `sys.destroy()` without emitting SHUTDOWN,
 * so a scene removed while active would leak the subscription. The same pair `TitleScene` documents
 * at its own layout listener, for the same reason.
 */

import Phaser from 'phaser';

import type { HitBox } from '../render/touchLayout';
import { RotatePrompt } from './rotatePrompt';

/**
 * Attach a rotate prompt to a scene for that scene's lifetime. Safe on a device with no touch.
 *
 * `targets` is the tap route this screen carries, so the prompt and the route share one predicate.
 * Omit it only for a screen with no route of its own.
 */
export function attachRotatePrompt(
  scene: Phaser.Scene,
  isTouchDevice: boolean,
  targets: readonly HitBox[] = [],
): void {
  const prompt = new RotatePrompt(scene, isTouchDevice, targets);
  prompt.create();
  prompt.refresh();

  const refresh = (): void => prompt.refresh();
  const teardown = (): void => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, teardown);
    scene.events.off(Phaser.Scenes.Events.DESTROY, teardown);
    scene.scale.off('resize', refresh);
    prompt.destroy();
  };

  scene.scale.on('resize', refresh);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
  scene.events.once(Phaser.Scenes.Events.DESTROY, teardown);
}
