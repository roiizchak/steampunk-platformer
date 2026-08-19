/**
 * The level's EXIT, drawn in the world.
 *
 * 🔴 This file exists because Codex's plan review found the phase had none (F4). The plan gave the
 * player a trigger rectangle, a sim edge and a post-trigger overlay, and **nothing that told them where
 * the rectangle was**. Criterion 8.6 begins "align, animate, fade…", which presupposes something to
 * align to. An invisible exit is not a level-complete flow; it is a level with a secret.
 *
 * ## Grey-box first, and the art arrived afterwards — which is the rule working
 *
 * "Grey-box before art" is a Global Constraint: no fal spend on a feature whose mechanics are not
 * already playable. Phase 8 shipped this as `Graphics` primitives for exactly that reason. The
 * gate-art session then built the run-in and the fade against those primitives, played all five
 * levels by hand, and only then spent $0.30 on one image — so `drawGoal`'s image branch below,
 * written dead in Phase 8, is the branch that runs today and `goalIsGreybox` returns false.
 *
 * The grey-box half is NOT dead code and is not to be deleted: it is what a missing or failed
 * texture falls back to, and `goalIsGreybox` is how a test says which branch shipped rather than
 * inferring it.
 *
 * The branch is the same shape `gearLayer.ts` uses, and for the reason its header records: Phase 5 chose
 * Sprite-vs-Rectangle **once, at creation, from a transient state**, and twelve of twenty enemies were
 * permanently grey boxes while every gate stayed green — and cheaper to draw, so the frame budget
 * looked *better* for it. `goalIsGreybox` is exported so a test asserts which branch shipped instead of
 * inferring it.
 *
 * ## The drawn rect IS the trigger rect
 *
 * Nothing here computes geometry. It draws `LevelData.goal`, the same rectangle `describeGoalProblem`
 * validated and the same one step 9d tests the player's box against. That is deliberate and it is why
 * the exit carries no tile painting in the `.tmj`: a doorway painted into the tile layer plus a trigger
 * rect beside it are two lists that can drift, which is exactly how Phase 4 shipped a spike run drawn
 * and harmless.
 */

import Phaser from 'phaser';
import type { Rect } from '../sim/types';
import { ticksToMs } from '../sim';

/** The catalogued texture the generated exit arrives as — `public/assets/objects/gate.png`. */
export const GOAL_TEXTURE_KEY = 'goal-gate';

/**
 * Grey-box colours. Brass on iron, so the placeholder reads as the steampunk gate it stands in for
 * rather than as a debug rectangle — and so it is unmistakably *not* the brass-capped floor.
 */
const FRAME_COLOUR = 0xd9a441;
const VOID_COLOUR = 0x1b232e;

/** Is this scene about to draw a grey box rather than generated exit art? */
export function goalIsGreybox(scene: Phaser.Scene): boolean {
  return !scene.textures.exists(GOAL_TEXTURE_KEY);
}

/**
 * Draw the exit and return the object, so a spec can ask whether it will actually render.
 *
 * Depth 7: under the gears (8), the enemies (9) and the player (10), because the player walks THROUGH
 * this — a doorway drawn over the character would read as a wall in front of them. Over the tiles, so
 * it is not lost in a densely painted wall.
 *
 * ⚠️ Returned as one object rather than a set of strokes so the `setScale(0)` red proof has something
 * to target: criterion 8.6's "the exit is drawn" assertion uses `willRender(camera)`, and the Phase 6
 * lesson is that `visible && alpha` both stay truthy while the GPU draws nothing.
 */
export function drawGoal(scene: Phaser.Scene, goal: Rect): Phaser.GameObjects.GameObject {
  if (!goalIsGreybox(scene)) {
    // Centred on the rect, sized to it — the same "already the right size" contract `addGearObject`
    // states, so no caller reaches for setOrigin afterwards.
    return scene.add
      .image(goal.x + goal.w / 2, goal.y + goal.h / 2, GOAL_TEXTURE_KEY)
      .setDisplaySize(goal.w, goal.h)
      .setDepth(7);
  }

  /**
   * The grey-box gate: a dark opening inside a brass frame.
   *
   * One object rather than three loose shapes, because it has to behave as a single game object for
   * the depth sort, for the alpha pulse and for the "is it drawn" assertion.
   *
   * 🔴 **A `Container` positioned at the goal, not a `Graphics` drawing world coordinates.**
   *
   * The draft was a `Graphics` left at the origin with absolute `fillRect` calls. It looked right and
   * it was UNMEASURABLE: `Graphics` has no `getBounds` in Phaser 4, and its `x`/`y` read `(0, 0)`
   * however far from the goal rect it actually painted. So criterion 8.6's `align` test — the one
   * named for this — could assert that an exit existed and would render, and nothing more; offsetting
   * those `fillRect` calls would have separated the exit from its own trigger volume with every
   * assertion still green. Codex's implementation review named it, and the fix belongs here rather
   * than in the test: an object whose position cannot be read is one a gate cannot check.
   *
   * The container carries the transform and the children are drawn at LOCAL coordinates, so `goal` is
   * still the only source of position — now expressed as the object's own `x`/`y` and recoverable from
   * `getBounds()`.
   */
  const frame = Math.max(6, Math.round(goal.w * 0.12));
  const rect = (x: number, y: number, w: number, h: number, colour: number) =>
    scene.add.rectangle(x, y, w, h, colour).setOrigin(0, 0);
  return scene.add
    .container(goal.x, goal.y, [
      rect(0, 0, goal.w, goal.h, FRAME_COLOUR),
      rect(frame, frame, goal.w - frame * 2, goal.h - frame, VOID_COLOUR),
    ])
    .setSize(goal.w, goal.h)
    .setDepth(7);
}

/**
 * How long the exit's flourish runs. Shorter than `hudFade`'s fade, so it reads first.
 *
 * ⚠️ It fires on `levelCompleted`, which since the gate-art session is **twenty ticks after** the
 * player reached the door and one tick after the courier finished fading out. So it is the
 * *completed-it* flourish now, not the *reached-it* one, and it plays over an empty doorway.
 */
export const GOAL_PULSE_TICKS = 16;

/**
 * The pulse, in milliseconds, converted through `ticksToMs` at the one place Phaser needs a duration.
 *
 * 🔴 This was `const GOAL_PULSE_MS = 260`, and Codex called the identical literal a **blocker** in
 * `UIScene.ts` one phase earlier: *every duration is an integer count of 60 Hz ticks*. 260 ms is 15.6
 * ticks — a duration the simulation cannot express. Phase 8 wrote the same number back into a new
 * file, which is what "fixed the instance, not the class" looks like. Found by the Phase 8
 * code-reviewer's adversarial brief. 16 ticks is 266.67 ms and is a number the sim can hold.
 */
export const GOAL_PULSE_MS = ticksToMs(GOAL_PULSE_TICKS);

/** Out and back: the yoyo halves the pulse, and 8 is a whole tick where `16 / 2` in ms is not. */
const GOAL_PULSE_HALF_MS = ticksToMs(GOAL_PULSE_TICKS / 2);

/**
 * The exit's `animate` step — criterion 8.6.
 *
 * A two-hop alpha pulse rather than a scale or a rotation, and the reason survives the move to a
 * `Container`: scaling would grow the drawn gate away from `goal`, and that rect is also the trigger
 * volume. Alpha is the only channel that cannot desynchronise the drawing from the collision.
 *
 * (It used to be the only channel available at all — the grey box was a `Graphics` drawing world
 * coordinates, which scaling would have torn away from its own rectangle. The container makes scaling
 * merely wrong rather than incoherent; alpha is still the right answer.)
 *
 * `yoyo` returns it to full opacity, so a spec sampling after the tween sees the exit still drawn
 * rather than a half-faded object it has to reason about.
 */
export function animateGoalReached(
  scene: Phaser.Scene,
  goalObject: Phaser.GameObjects.GameObject,
): void {
  scene.tweens.add({
    targets: goalObject,
    alpha: 0.25,
    duration: GOAL_PULSE_HALF_MS,
    yoyo: true,
    repeat: 1,
  });
}
