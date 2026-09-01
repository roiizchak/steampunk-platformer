/**
 * **Tap routes for the screens that are not the play scene.**
 *
 * 🔴 Everything outside `GameScene` is keyboard-only, and a grep says so: `TitleScene.bindKeys`
 * takes `Enter` / `NumpadEnter` / `Space`, `LevelSelectScene.bindKeys` takes `UP W DOWN S ENTER`,
 * and `gameComplete.armContinueKey` takes `ANY_KEY_DOWN` filtered to `Enter`. So a phone player cannot
 * start the game, cannot choose a level and cannot continue past one — and shipping the six in-play
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
 * ## One press per contact — per CONTACT, which is not the same as per action
 *
 * A pointer is spent when it lands and returned when it lifts, so a finger already down cannot
 * re-fire by sliding. The release is read from the SCENE-level events, because a Game Object hears
 * only about a release over itself (`POINTER_UP_EVENT.js:8-28`). Same rule, same reason, as
 * `touchContacts.ts`.
 *
 * ⚠️ **This module does NOT stop two FINGERS running an action twice, and the header used to claim
 * it did.** The Codex implementation review found the claim false and the defect real: `spent` is
 * keyed by pointer id on purpose — a lifted finger has to be able to tap again, which is how a
 * player picks a second row after a locked one refused — so two fingers landing in one frame
 * produce two callbacks. **Arbitration belongs to the caller**, and every caller has it:
 * `TitleScene.dismiss` latches on `dismissed`, `gameComplete`'s `go` destroys the routes before
 * advancing, and `LevelSelectScene.play` latches on `started` (reset in `init()`, not as a field
 * initialiser — Phaser reuses the scene instance, and a field initialiser left the menu dead on the
 * second visit).
 *
 * ## 🔴 A route is dead while the rotate prompt is up
 *
 * The QA gate's adversarial code review found this, and the accessibility review found it
 * independently. It was a real, shipped defect: the prompt draws at depth 3000
 * (`rotatePrompt.ts`), these zones were interactive from creation until `destroy()` with no gate
 * of any kind, and a `Rectangle` without `setInteractive` swallows no pointers. On a phone held
 * upright, a tap on "ROTATE YOUR DEVICE" started the level underneath it.
 *
 * `rotatePrompt.ts`'s header claimed that could not happen. The claim was true only of the six
 * play controls, which `touchControlsLayer.refresh()` gates on `touchTargetsFit`, and false of
 * every tap route — including the level-menu rows, which are **26.0 CSS px** at phone portrait,
 * 41 % under the floor this phase sets.
 *
 * So a route asks `rotatePromptWanted` on the frame the press arrives, from the scene's own
 * `ScaleManager` — **the same function `RotatePrompt.refresh()` calls, with the same targets**. That
 * shared call is what makes "a gated tap is never a silent one" true. It was not, before: the
 * prompt asked only about the play controls while the route asked about both terms, so a screen
 * whose own targets went under the floor — which a sixth catalog level does to the menu rows — had
 * its route killed with nothing on screen to explain it. Found by the Codex review, round 3.
 *
 * 🔴 **Two terms, and it took three attempts to see why.** Gating on the play controls alone
 * killed a full-screen title zone at 200 % browser zoom (WCAG 1.4.4). Gating on the route's own
 * targets alone re-opened the tap-through, because the PROMPT is driven by the play controls:
 * on a portrait phone it is up while a 390 x 219 CSS px title zone clears every floor. The
 * question is not *are these targets big enough* — it is *may this route be touched right now*,
 * and the answer is no if a prompt covers it **or** if its own targets are too small to hit.
 *
 * No Phaser import, for the reason `touchControlsLayer.ts`'s header gives.
 */

import { type HitBox, rotatePromptWanted } from '../render/touchLayout';
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
  /**
   * Move the existing zones onto the geometry their target boxes now carry.
   *
   * 🔴 **The zones are a SNAPSHOT, and before the view could change nothing needed to move them.**
   * They are built once from `targets` in the loop below; only `promptIsUp` re-reads the live size.
   * The view could not change under FIT, so a snapshot was the whole truth. It can now: a rotation
   * or a fullscreen toggle re-lays-out the screen, the drawn content moves, and stale zones sit
   * where the buttons used to be — a menu that answers taps in the wrong places, which reads as the
   * game ignoring the player.
   *
   * ⚠️ **The caller keeps ONE target array and mutates its boxes in place.** That is deliberate and
   * it is what keeps `attachRotatePrompt` out of this change: `RotatePrompt.refresh()` re-reads
   * `targets` on every call, so a band mutated in place is a band the prompt already sees. Replacing
   * the array would leave the guard judging the old geometry while the routes judged the new.
   */
  updateTargets(): void;
  /** Idempotent. Called by the caller, and by the scene's own SHUTDOWN and DESTROY. */
  destroy(): void;
}

const NO_ROUTES: TapRoutes = { updateTargets(): void {}, destroy(): void {} };

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

  /**
   * May this route be touched right now?
   *
   * 🔴 **`rotatePromptWanted` is the ONE definition, and `RotatePrompt` calls the same one with the
   * same targets.** It used to be two predicates that agreed on one term and diverged on the other,
   * which is how a route could be dead with nothing on screen to explain it — the Codex round-3
   * finding. Sharing the function is what makes 12.10's *iff* true by construction rather than by
   * an argument about which callers exist today.
   */
  const promptIsUp = (): boolean =>
    rotatePromptWanted(
      scene.scale.gameSize.width,
      scene.scale.gameSize.height,
      scene.scale.displaySize.width,
      targets,
    );

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
    updateTargets(): void {
      if (!alive) return;
      // Positional, by construction: `zones` is built from `targets` in order and never re-ordered,
      // so index i is target i. Zones carry `setOrigin(0, 0)`, so `setPosition` takes the box's
      // top-left exactly as `add.zone` did.
      for (const [i, zone] of zones.entries()) {
        const target = targets[i];
        if (target === undefined) continue;
        zone.setPosition(target.x, target.y);
        zone.setSize(target.w, target.h);
      }
    },

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
