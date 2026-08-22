/**
 * The HUD gear icon's collect pop — criterion 9.4's observable force-settle.
 *
 * ## Why this is a sibling file and not five lines in `UIScene`
 *
 * `UIScene.ts` is at 392 of the project's 400-line ceiling, and this phase still has two Codex
 * reviews and six agent gate briefs whose findings land in that file. So this follows the shape its
 * neighbour `hudFade.ts` already established: build it here, return a handle with a `destroy()`, and
 * let `UIScene` gain an import and a call.
 *
 * ## Why the gear icon and not the level-complete fade
 *
 * 9.4 is *"a tween's end value is written even when the tween is stopped early"*. `hudFade.ts` force-
 * settles too, and **that settle is not independently observable**: its only call path
 * (`UIScene.levelComplete(null)`) destroys the targets on the next two lines, so an assertion about
 * their final alpha would be an assertion about objects nobody can ever see again. The gear icon is
 * drawn every frame and **survives its own tween**, which is what makes the settle a fact about the
 * running game rather than decoration.
 *
 * ## `baseScale` is passed in, never assumed to be 1
 *
 * `addGearObject` sizes an `Image` with `setDisplaySize`, i.e. it writes `scaleX`. `UIScene.ts:344-
 * 353` records what a literal 1 already cost once: after a `scale.resize(1280, 720)` the icon's real
 * scale is 0.667, and a tween starting from 1 snapped it to 72 px before shrinking. The `Arc`
 * grey-box branch was unaffected, which is exactly how it would have shipped.
 *
 * ## The tint is guarded, for the same reason
 *
 * `addGearObject` returns an `Image` **or** an `Arc`, and `Phaser.GameObjects.Shape` does not mix in
 * the Tint component at all — an `Arc` has no `setTint`. This is Phase 2's `setFlipX`-on-a-Rectangle
 * lesson one object over: the typed path works and the grey-box path throws. The scale pop is the
 * part every branch gets; the tint is the part only a textured icon gets.
 */

import type Phaser from 'phaser';
import { ticksToMs } from '../sim';

/**
 * The pop's length, in 60 Hz ticks. 7 ticks (≈117 ms) out and the same back through `yoyo`.
 *
 * Short on purpose: this fires on every gear, and a pop long enough to still be running when the
 * next one lands is a pop that reads as a wobble. Declared as ticks and converted once, at the one
 * line that hands Phaser a millisecond.
 */
export const POP_TICKS = 7;

/** How far past `baseScale` the icon swells. A read at play speed, not a lurch. */
const POP_SCALE = 1.35;

/** A warm brass flash. Only reachable on the textured branch — see the header. */
const POP_TINT = 0xfff2c4;

/** What `UIScene` holds on to. */
export interface GearPop {
  /** Fire the pop. Safe to call while one is already running — it restarts from the base scale. */
  pop(): void;
  destroy(): void;
}

/** The icon, as far as this module is concerned: an `Image` (tintable) or an `Arc` (not). */
type GearIcon = Phaser.GameObjects.Image | Phaser.GameObjects.Arc;

export function attachGearPop(scene: Phaser.Scene, icon: GearIcon, baseScale: number): GearPop {
  /**
   * ONE tracked handle, never `killTweensOf`.
   *
   * Kill-by-target is what criterion 9.3 exists to remove: it reaches every tween pointed at this
   * object, including ones another feature owns, and it is silent about what it hit.
   */
  let tween: Phaser.Tweens.Tween | null = null;

  /**
   * The force-settle: back to `baseScale`, tint cleared.
   *
   * ⚠️ **What Phaser 4.2.1 actually does at each of the THREE exits, read out of the vendored
   * source.** An earlier version of this comment said Phaser writes the end value in *neither*
   * callback; that is wrong for one of the three, and it is the sentence the next tween author would
   * have relied on *(C9)*:
   *
   *  1. **Natural completion writes the end value.** `tweens/tween/TweenData.js` assigns
   *     `target[key] = this.current` *before* its `if (complete)` branch, and `current` is `end` at
   *     `v = 1`. So `onComplete`'s settle is redundant for the SCALE — and load-bearing for the
   *     **tint**, which Phaser never clears for anyone.
   *  2. **`stop()` does not.** The icon is left wherever the interpolation reached: a pop
   *     interrupted at its widest stays 35 % too big, permanently, and tinted. This is what
   *     `onStop` is for.
   *  3. **`destroy()` runs neither callback.** `tweens/tween/BaseTween.js`'s `destroy()` nulls
   *     `this.callbacks`, and `TweenManager.shutdown()` reaches it through `killAll()`. A scene
   *     shutdown is a stop path with NO force-settle.
   *
   * 🔴 That third exit is why `stopAndSettle` calls `settle()` **directly** instead of trusting
   * `stop()` to dispatch `onStop`. The callbacks stay registered as the belt for a stop that comes
   * from somewhere else; the direct call is the braces, and it is what makes "the icon ends at
   * `baseScale`" true on every path rather than on two of three.
   */
  const settle = (): void => {
    icon.setScale(baseScale);
    if ('clearTint' in icon) {
      icon.clearTint();
    }
  };

  /** Stop by HANDLE — never `killTweensOf` — then settle unconditionally. See `settle`'s exit 3. */
  const stopAndSettle = (): void => {
    const running = tween;
    tween = null;
    running?.stop();
    settle();
  };

  return {
    pop() {
      // Stop first, so the icon is back at `baseScale` before the new tween's `from` is read below.
      // Without it a pop landing during a pop would start from a swollen icon and compound.
      stopAndSettle();
      if ('setTint' in icon) {
        icon.setTint(POP_TINT);
      }
      tween = scene.tweens.add({
        targets: icon,
        // `from` is the passed-in base, never a literal 1. See the header.
        scale: { from: baseScale, to: baseScale * POP_SCALE },
        yoyo: true,
        duration: ticksToMs(POP_TICKS),
        ease: 'Quad.easeOut',
        onStop: settle,
        onComplete: settle,
      });
    },
    destroy() {
      // One path, not two. The branch this replaced settled only when nothing was running and
      // otherwise trusted `onStop` — which is silent for a tween that has already COMPLETED and
      // silent again for one Phaser destroyed under a scene shutdown. Settling unconditionally is
      // both shorter and true on every exit, and calling this twice is safe: `settle` is idempotent.
      stopAndSettle();
    },
  };
}
