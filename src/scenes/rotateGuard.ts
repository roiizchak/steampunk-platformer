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
 * 🔴 **A `resize` subscription alone does not survive a rotation, and the owner found it on a real
 * phone.** `UIScene` polls `refresh()` from its own `update()`, so the play screen clears the
 * prompt the moment the device turns. `TitleScene` and `LevelSelectScene` had this listener and
 * nothing else — and a mobile browser fires `resize` on orientationchange **while it still reports
 * the old viewport**, so the one evaluation the prompt got ran against portrait dimensions and
 * nothing ever asked again. The player turns the phone and the overlay stays up forever.
 *
 * So the prompt is polled on every scene that carries one, through the scene's `UPDATE` **event**.
 * Not by wrapping `scene.update`: Phaser caches `sys.sceneUpdate` at boot, so a method swapped in
 * afterwards is never called — an inert hook of exactly that shape cost this phase a GREEN mutation
 * in M73. The event is emitted from the scene's own step, so it stops when the scene pauses or
 * sleeps, which is what a hidden prompt should do.
 *
 * ⚠️ `scene.scale` is the **GLOBAL** `ScaleManager`; stopping a scene does not remove a listener on
 * it, and a later resize would run against destroyed objects. SHUTDOWN **and** DESTROY, each
 * cancelling the other — `SceneManager.remove()` reaches `sys.destroy()` without emitting SHUTDOWN,
 * so a scene removed while active would leak the subscription. The same pair `TitleScene` documents
 * at its own layout listener, for the same reason.
 */

import type { HitBox } from '../render/touchLayout';
import { SCENE_DESTROY, SCENE_SHUTDOWN, SCENE_UPDATE } from './engineLiterals';
import { RotatePrompt } from './rotatePrompt';
import type { TouchSceneLike } from './touchTypes';

/**
 * The slice of a scene this needs — and it names no Phaser type, deliberately.
 *
 * 🔴 This file imported `phaser` as a VALUE, for four event-name strings that `engineLiterals.ts`
 * already holds. `npm run test:sim-isolated` runs the unit suite with the engine uninstalled, so a
 * value import anywhere in the graph makes a module unreachable from a unit test — which is why
 * `attachRotatePrompt` had no behavioural gate, and why the missing `UPDATE` subscription that
 * stranded the prompt through a rotation could not be seen from here.
 */
export interface RotateGuardScene extends TouchSceneLike {
  events: {
    on(event: string, fn: () => void): unknown;
    once(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
  };
  scale: TouchSceneLike['scale'] & {
    on(event: string, fn: () => void): unknown;
    off(event: string, fn: () => void): unknown;
  };
}

/**
 * Attach a rotate prompt to a scene for that scene's lifetime. Safe on a device with no touch.
 *
 * `targets` is the tap route this screen carries, so the prompt and the route share one predicate.
 *
 * ⚠️ **The invariant is narrower than "every routed screen", and the header used to overstate it.**
 * `TitleScene` and `LevelSelectScene` pass the identical arrays they hand `attachTapRoutes`. The
 * completion route does NOT: its zone lives on the `Game` scene (`gameComplete.ts:161-168`) while
 * the prompt over it belongs to `UIScene`, which passes an empty list (`uiTouch.ts`). That zone is
 * the whole view plus 64 px, so its own targets can never be the term that fails — the play-controls
 * term is the only one that can fire there, and it does. Codex round 4 caught the overstatement.
 */
export function attachRotatePrompt(
  scene: RotateGuardScene,
  isTouchDevice: boolean,
  targets: readonly HitBox[] = [],
): void {
  const prompt = new RotatePrompt(scene, isTouchDevice, targets);
  prompt.create();
  prompt.refresh();

  const refresh = (): void => prompt.refresh();
  const teardown = (): void => {
    scene.events.off(SCENE_SHUTDOWN, teardown);
    scene.events.off(SCENE_DESTROY, teardown);
    scene.events.off(SCENE_UPDATE, refresh);
    scene.scale.off('resize', refresh);
    prompt.destroy();
  };

  // Both, and neither is redundant. `resize` answers a viewport change in the same frame it lands;
  // UPDATE answers the one the browser reported late, which is every rotation on a phone.
  scene.scale.on('resize', refresh);
  scene.events.on(SCENE_UPDATE, refresh);
  scene.events.once(SCENE_SHUTDOWN, teardown);
  scene.events.once(SCENE_DESTROY, teardown);
}
