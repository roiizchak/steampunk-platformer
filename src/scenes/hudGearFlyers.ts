/**
 * The collected gear's flight to the HUD counter — one tween per gear, each one HELD.
 *
 * ## Why this is a sibling file and not a method on `UIScene`
 *
 * Criterion 9.3 is *"tweens tracked individually; no kill-by-target"*, and the flyer was the one
 * tween in this scene that held no handle at all: `this.tweens.add({...})` with the return value
 * discarded. Tracking it costs a `Set`, a `delete` in `onComplete` and a stop loop on shutdown —
 * and `UIScene.ts` had **no** headroom under the 400-line rule for any of them. So this follows the
 * shape `hudFade.ts` and `hudGearPop.ts` already established for exactly this pressure: build here,
 * return a handle with a `destroy()`, and let `UIScene` gain an import and a field.
 *
 * ⚠️ **The move is a relocation, not a rewrite.** Every comment below travelled with the code it
 * annotates, including the `flyerScale` paragraph, which records a defect that has already shipped
 * once. The only new behaviour is the tracking.
 *
 * ## The tweens are stopped by HANDLE, never `killTweensOf`
 *
 * Kill-by-target reaches every tween pointed at an object, including ones another feature owns, and
 * reports nothing about what it hit. `hudFade.ts:147-151` records the removal of the last one.
 * Each flyer removes its own entry in `onComplete`, so on the overwhelming majority of frames this
 * set is empty and `destroy()` is a walk over nothing.
 *
 * A type-only Phaser import, so `tests/unit/hud-gear-flyers.test.ts` can drive the whole thing
 * against a fake scene — the `hud-gear-pop.test.ts` idiom.
 */

import type Phaser from 'phaser';
import { gearsCollectedFrom, type HudLayout } from '../render/hud';
import { ticksToMs } from '../sim';
import type { World } from '../sim/types';
import { addGearObject } from './gearLayer';

/** Where a flyer is headed: the HUD gear icon's slot, from `hudLayout`. */
type FlyTarget = HudLayout['gearIcon'];

/**
 * How long a collected gear takes to fly to the counter, as an INTEGER COUNT OF TICKS.
 *
 * 🔴 This was `const TWEEN_MS = 260`, and Codex's implementation review called it a blocker against
 * the project's own rule: *every duration is an integer count of 60 Hz ticks*. 260 ms is 15.6 ticks
 * — a float of seconds wearing a millisecond's clothes, in the one layer where the rule is easiest
 * to forget because Phaser's tween API genuinely takes milliseconds.
 *
 * 15 ticks is 250 ms exactly. The conversion goes through `ticksToMs`, the same function the rest of
 * the project uses, so the number that reaches Phaser is derived rather than authored.
 */
export const TWEEN_TICKS = 15;

/** Above every HUD object, so a flyer passes over the plate rather than under it. */
const FLYER_DEPTH = 1003;

/** What the flyer shrinks to as it lands, as a fraction of its own starting scale. */
const FLYER_END_SCALE = 0.6;

/** And how far it fades. Not to 0 — it should still read as arriving, not as evaporating. */
const FLYER_END_ALPHA = 0.25;

export interface GearFlyers {
  /**
   * Spawn one flyer per gear collected since `sinceTick`.
   *
   * @returns how many were spawned. Returned rather than `void` so a unit test can tell "no gears
   *   were fresh" from "gears were fresh and nothing was drawn" — the two outcomes a fire-and-forget
   *   `void` collapses into one, and the second is the failure this whole file is a gate for.
   */
  spawn(
    world: World,
    sinceTick: number,
    target: FlyTarget,
    worldCamera: Phaser.Cameras.Scene2D.Camera,
  ): number;
  /** Stop every flyer still in flight, by handle. Idempotent. */
  destroy(): void;
}

export function attachGearFlyers(scene: Phaser.Scene): GearFlyers {
  /** Every tween still in flight. See the header on why a Set and not a field. */
  const live = new Set<Phaser.Tweens.Tween>();

  return {
    spawn(world, sinceTick, target, worldCamera) {
      // `sinceTick` is advanced by the caller on EVERY frame — including the ones that skip this
      // call. It has to be: if it only moved when a gear was collected, the window would grow
      // without bound and a gear collected long ago would be re-tweened the next time any gear was.
      const fresh = gearsCollectedFrom(world.gears, sinceTick);

      for (const gear of fresh) {
        // World space to the HUD scene's screen space. `getBounds()` is not used: the world camera's
        // scroll and zoom ARE the transform, and asking the camera is what keeps this correct when
        // the zoom is not 1.
        const screenX = (gear.x - worldCamera.scrollX) * worldCamera.zoom;
        const screenY = (gear.y - worldCamera.scrollY) * worldCamera.zoom;

        const flyer = addGearObject(scene, screenX, screenY, target.w).setDepth(FLYER_DEPTH);

        // 🔴 `from` is the flyer's OWN scale, never a literal 1.
        //
        // `addGearObject` sizes an `Image` with `setDisplaySize`, i.e. it sets `scaleX`. Tweening
        // `scale` from a literal 1 overwrote that on the first step — correct only by coincidence at
        // the design size, where `target.w` happens to equal the texture's own 72 px. After a
        // `scale.resize(1280, 720)` the icon is 48 px, the flyer's real scale is 0.667, and every
        // flyer would have snapped to 72 px before shrinking. The `Arc` branch was unaffected, which
        // is exactly how this would have shipped: the grey-box path looked right.
        const flyerScale = flyer.scale;

        const tween: Phaser.Tweens.Tween = scene.tweens.add({
          targets: flyer,
          x: target.x + target.w / 2,
          y: target.y + target.h / 2,
          scale: { from: flyerScale, to: flyerScale * FLYER_END_SCALE },
          alpha: { from: 1, to: FLYER_END_ALPHA },
          duration: ticksToMs(TWEEN_TICKS),
          ease: 'Quad.easeIn',
          // Destroyed rather than hidden: an invisible object still costs a display-list walk every
          // frame, and a HUD that leaks one object per gear is a leak with a level-sized bound.
          onComplete: () => {
            live.delete(tween);
            flyer.destroy();
          },
        });
        live.add(tween);
      }
      return fresh.length;
    },

    destroy() {
      // Stopped BEFORE anything destroys their targets — a tween still running against a destroyed
      // object throws inside Phaser's update loop, and a throw there stops every scene after it.
      //
      // ⚠️ The flyers themselves are NOT destroyed here, and that is deliberate rather than an
      // omission: neither `stop()` nor Phaser's own `BaseTween.destroy()` dispatches `onComplete`,
      // so the only path that ever destroys a flyer is natural completion. The single caller is the
      // scene's own SHUTDOWN, which tears the display list down immediately afterwards — so there is
      // nothing left to leak. A `destroy()` reachable from anywhere else would need its own sweep.
      for (const tween of live) {
        tween.stop();
      }
      live.clear();
    },
  };
}
