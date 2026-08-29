/**
 * **Tap routes for the screens that are not the play scene.**
 *
 * 🔴 Everything outside `GameScene` is keyboard-only, and a grep says so: `TitleScene.ts:333-335`
 * takes `Enter` / `NumpadEnter` / `Space`, `LevelSelectScene.ts:145-167` takes `UP W DOWN S ENTER`,
 * and `gameComplete.ts:119-135` takes `ANY_KEY_DOWN` filtered to `Enter`. So a phone player cannot
 * start the game, cannot choose a level and cannot continue past one — and shipping the five in-play
 * controls alone would produce a build that still cannot be played, with a criterion *"the owner
 * played it on a phone"* that could only be passed by reaching for a keyboard. The Codex plan
 * review's first BLOCKER, round 1.
 *
 * These three screens are therefore in scope as a consequence of the stated goal, not as an
 * expansion of it, and they all use the one mechanism here: a zone per target, a callback carrying
 * the target's id, and a teardown registered against the scene the zones were drawn on.
 *
 * ## Teardown is not optional, and SHUTDOWN alone is not enough
 *
 * The completion panel is up while `UIScene` — which **survives** the level-to-level
 * `scene.start('Game')` (`gameHud.ts:49-52`) — is still running. A zone that outlived its panel
 * would sit invisible over the next level, one stray tap from skipping it. Both SHUTDOWN and
 * DESTROY tear down, and `destroy()` is idempotent so an explicit call and a lifecycle event cannot
 * fight.
 *
 * ## One press per contact
 *
 * A route's action is usually `scene.start`. A second finger landing while the first is still down
 * must not run it twice, and a finger already down must not re-fire by sliding. So a pointer is
 * spent when it lands and returned when it lifts — and the release is read from the SCENE-level
 * events, because a Game Object hears only about a release over itself
 * (`POINTER_UP_EVENT.js:8-28`). Same rule, same reason, as `touchContacts.ts`.
 *
 * ## 🔴 A route is dead while the rotate prompt is up
 *
 * The QA gate's adversarial code review found this, and the accessibility review found it
 * independently. It was a real, shipped defect: the prompt draws at depth 3000
 * (`rotatePrompt.ts`), these zones were interactive from creation until `destroy()` with no gate
 * of any kind, and a `Rectangle` without `setInteractive` swallows no pointers. On a phone held
 * upright, a tap on "ROTATE YOUR DEVICE" started the level underneath it.
 *
 * `rotatePrompt.ts`'s header claimed that could not happen. The claim was true only of the five
 * play controls, which `touchControlsLayer.refresh()` gates on `touchTargetsFit`, and false of
 * every tap route — including the level-menu rows, which are **26.0 CSS px** at phone portrait,
 * 41 % under the floor this phase sets.
 *
 * So a route asks `touchTargetsFit` on the frame the press arrives, from the scene's own
 * `ScaleManager`. Every screen carrying a route also carries a prompt (`rotateGuard.ts`), so a
 * gated tap is never a silent one.
 *
 * 🔴 **Over ITS OWN targets, not over the play controls.** The first version asked
 * `touchTargetsFit(touchLayout(...))` — the five in-play buttons — from every screen, and the
 * accessibility gate's adversarial brief found both halves of what that costs. A **full-screen**
 * title or completion zone, which is 334 CSS px wide at 200 % browser zoom and seven times over
 * any floor, went dead because a button that is not on that screen would have been too small
 * (WCAG 1.4.4). And a **level row** was judged by a 160 px threshold while being 128 px, so
 * between scale 0.275 and 0.344 it was under-floor, live, and unannounced. Asking about the
 * targets in hand answers both: a route is dead exactly when the things it draws are too small.
 *
 * No Phaser import, for the reason `touchControlsLayer.ts`'s header gives.
 */

import { cssScaleFor, type HitBox, touchTargetsFit } from '../render/touchLayout';
import {
  GAMEOBJECT_POINTER_DOWN,
  INPUT_POINTER_UP,
  INPUT_POINTER_UP_OUTSIDE,
  SCENE_DESTROY,
  SCENE_SHUTDOWN,
} from './engineLiterals';
import type { EmitterLike, PointerLike, TouchZoneLike } from './touchControlsLayer';

/**
 * Under the play controls (2000) and over ordinary screen text.
 *
 * These screens have no play controls on them, so the two can never contend; the number is chosen so
 * that if they ever did, a tap route could not steal a jump.
 */
export const TAP_ROUTE_DEPTH = 1500;

/** The scene a tap route draws on. Its own emitter is how the route learns it is going away. */
export interface TapSceneLike {
  add: { zone(x: number, y: number, width: number, height: number): TouchZoneLike };
  input: EmitterLike;
  events: EmitterLike;
  /** Read on every press, never cached: the answer changes when the device turns. */
  scale: { gameSize: { width: number; height: number }; displaySize: { width: number } };
}

export interface TapRoutes {
  /** Idempotent. Called by the caller, and by the scene's own SHUTDOWN and DESTROY. */
  destroy(): void;
}

const NO_ROUTES: TapRoutes = { destroy(): void {} };

/**
 * Make one tappable zone per target.
 *
 * @param isTouchDevice `game.device.input.touch`. False draws **nothing at all** — not a hidden
 * zone, not a disabled one. An invisible interactive object still swallows pointers, and criterion
 * 12.7 is that a desktop pointer can hit nothing that did not exist before this phase.
 * @param onTap receives the target's `id`, so a level row can name its level rather than the caller
 * having to reverse the coordinates back into one.
 */
export function attachTapRoutes(
  scene: TapSceneLike,
  isTouchDevice: boolean,
  targets: readonly HitBox[],
  onTap: (id: string) => void,
): TapRoutes {
  if (!isTouchDevice || targets.length === 0) return NO_ROUTES;

  /** True on exactly the frames `RotatePrompt` covers the screen. Same call, same arguments. */
  const promptIsUp = (): boolean => {
    const { width } = scene.scale.gameSize;
    if (!(width > 0)) return false;
    return !touchTargetsFit(targets, cssScaleFor(scene.scale.displaySize.width, width));
  };

  const zones: TouchZoneLike[] = [];
  /** Pointers that have already spent their press on a route. */
  const spent = new Set<number>();
  let alive = true;

  const release = (pointer: PointerLike): void => {
    spent.delete(pointer.id);
  };

  for (const target of targets) {
    const zone = scene.add
      .zone(target.x, target.y, target.w, target.h)
      .setName(target.id)
      .setOrigin(0, 0)
      .setDepth(TAP_ROUTE_DEPTH)
      // 🔴 Screen space, not world space. `TitleScene` and `LevelSelectScene` have static
      // cameras so it changes nothing there, but `GameScene`'s camera follows the player — and
      // the completion zone spent one e2e run sitting at the level origin while the panel it
      // belonged to was on screen four thousand pixels away.
      .setScrollFactor(0)
      .setInteractive();
    zone.on(GAMEOBJECT_POINTER_DOWN, (pointer: PointerLike) => {
      if (!alive || spent.has(pointer.id)) return;
      // 🔴 The rotate-prompt gate. Asked here rather than cached at creation, because the answer
      // changes the moment the device turns — and asked from the scene's own ScaleManager so it is
      // literally the same reading the prompt takes.
      if (promptIsUp()) return;
      spent.add(pointer.id);
      onTap(target.id);
    });
    zones.push(zone);
  }

  const routes: TapRoutes = {
    destroy(): void {
      if (!alive) return;
      alive = false;
      scene.input.off(INPUT_POINTER_UP, release);
      scene.input.off(INPUT_POINTER_UP_OUTSIDE, release);
      scene.events.off(SCENE_SHUTDOWN, routes.destroy);
      scene.events.off(SCENE_DESTROY, routes.destroy);
      for (const zone of zones) zone.destroy();
      zones.length = 0;
      spent.clear();
    },
  };

  scene.input.on(INPUT_POINTER_UP, release);
  scene.input.on(INPUT_POINTER_UP_OUTSIDE, release);
  scene.events.on(SCENE_SHUTDOWN, routes.destroy);
  scene.events.on(SCENE_DESTROY, routes.destroy);
  return routes;
}
