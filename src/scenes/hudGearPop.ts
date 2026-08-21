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
   * The force-settle. Phaser writes the end value in **neither** `onStop` nor `onComplete`, so a pop
   * interrupted at its widest leaves the icon permanently 35 % too big — and, on the textured
   * branch, permanently tinted. Both callbacks get this, because the two exits are different code
   * paths in Phaser and only one of them is the one a bug takes.
   */
  const settle = (): void => {
    icon.setScale(baseScale);
    if ('clearTint' in icon) {
      icon.clearTint();
    }
  };

  /** Stop by HANDLE. Phaser's `stop()` dispatches `onStop`, which is what performs the settle. */
  const stopRunning = (): Phaser.Tweens.Tween | null => {
    const running = tween;
    tween = null;
    running?.stop();
    return running;
  };

  return {
    pop() {
      // Stop first, so `onStop` has already put the icon back at `baseScale` before the new tween's
      // `from` is read below. Without it a pop landing during a pop would start from a swollen icon
      // and compound.
      stopRunning();
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
      // A running tween settles through its own `onStop`; with nothing running there is no callback
      // to do it, so the settle is performed directly. Either way the icon ends at `baseScale` with
      // no tint, and calling this twice is safe — the second call takes the second branch.
      if (stopRunning() === null) {
        settle();
      }
    },
  };
}
