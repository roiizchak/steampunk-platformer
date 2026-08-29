/**
 * **The seam between `attachHud` and the controls layer.** Engine-free; no Phaser, not even a type.
 *
 * ## Why a binding cannot simply be handed to the layer
 *
 * 🔴 `attachHud` runs BEFORE `UIScene.create()`, and `gameHud.ts:60-63` already says so in as many
 * words: *"`ui` has only been LAUNCHED — `UIScene.create()` has not run."* The layer does not exist
 * at the moment the binding is known. Handing it over directly dereferences `undefined`, and
 * optional-chaining that away is worse: it silently skips the only binding there is and ships a
 * first level whose controls do nothing. Named by the Codex plan review, round 2, as a BLOCKER.
 *
 * 🔴 The obvious repair — *"the first launch is pending, a relaunch is immediate"* — is also wrong.
 * `ScenePlugin.launch` is `queueOp('start', …)` (`ScenePlugin.js:481-484`): **always** queued, never
 * a synchronous `create()`. And scene shutdown deliberately preserves the instance and its fields
 * for reuse (`Systems.js:760-788`), so after a level-select round trip `UIScene` is the *same
 * object*, still holding the layer its previous life built. Round 3, also a BLOCKER.
 *
 * So there is **one** path and no branch on which launch this is: a binding is always stored, and
 * applied when — or if — a layer is active. Cold boot, level-to-level `scene.start('Game')` and the
 * level-select return all take it, and none of them depends on where an operation lands in Phaser's
 * queue. There is no ordering to get wrong because there is no ordering — the same shape
 * `UIScene.update()`'s retirement check already uses, and for the same reason.
 *
 * ## `deactivate()` clears the binding as well as the layer
 *
 * A binding names one specific `Game` scene and one specific `InputSnapshot`. Carrying it into the
 * next activation would point live controls at a scene that has been shut down. The safe failure
 * mode is a layer bound to `null` — hidden, non-interactive, writing nothing — and that is what a
 * missed re-bind produces.
 */

import { NO_TOUCH_HELD, type TouchHeld } from './inputMerge';
import type { TouchBinding } from './touchControlsLayer';

/** The part of `TouchControlsLayer` this session drives. `destroy` stays the scene's job. */
export interface TouchLayerLike {
  bind(binding: TouchBinding | null): void;
  refresh(): void;
  held(): TouchHeld;
}

export class TouchSession {
  private layer: TouchLayerLike | null = null;
  private pending: TouchBinding | null = null;

  /** Point the controls at a `Game` scene. Safe at any time, including before `create()`. */
  bind(binding: TouchBinding | null): void {
    this.pending = binding;
    this.layer?.bind(binding);
  }

  /** `UIScene.create()` has built a layer. Always binds — `null` included — so nothing is stale. */
  activate(layer: TouchLayerLike): void {
    this.layer = layer;
    layer.bind(this.pending);
  }

  /** `UIScene`'s SHUTDOWN. The layer is about to be destroyed; stop writing to it. */
  deactivate(): void {
    this.layer = null;
    this.pending = null;
  }

  refresh(): void {
    this.layer?.refresh();
  }

  /**
   * This frame's touch levels, for `sampleHeldKeys`.
   *
   * The all-false record when there is no layer — desktop, or the frames before `create()` — never
   * `undefined`: the merge ORs this into the snapshot and must not have to ask whether it exists.
   */
  held(): TouchHeld {
    return this.layer?.held() ?? NO_TOUCH_HELD;
  }
}
