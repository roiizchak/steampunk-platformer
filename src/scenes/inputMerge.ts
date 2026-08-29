/**
 * **The one place keyboard and touch become the sim's four LEVEL fields.**
 *
 * Engine-free, with type-only imports, and that is not a style preference.
 *
 * 🔴 `gameInput.ts:1` is `import Phaser from 'phaser'` — a **value** import — and
 * `npm run test:sim-isolated` uninstalls Phaser and runs the **entire** Vitest suite. A unit test
 * that imported `sampleHeldKeys` to prove the merge would take criterion 12.15 red for a reason
 * unrelated to the sim boundary it is guarding. The Codex plan review named this (round 1, finding
 * 5) before a line of it was written. `audioKeyMap.ts` is the existing precedent for the shape: an
 * engine-free module in `src/scenes/` so a plain Node test can drive it.
 *
 * ## Levels and edges are not alike, and only one of them belongs here
 *
 * `src/sim/input.ts` states the rule this file has to respect:
 *
 * - **Levels** — `left`, `right`, `jumpHeld`, `walkHeld` — are *sampled*. "Is it down" is true
 *   across a whole tick batch by definition, so overwriting them every frame is correct.
 * - **Edges** — `jumpPressed`, `attackPressed` — are *latched*, and cleared **only when a tick
 *   consumes them**. A frame that drains zero ticks must leave a press exactly where it found it.
 *
 * So `applyHeld` writes four fields and touches neither edge. A touch button arms its edge by
 * calling `latchJumpPress` / `latchAttackPress` directly — the one door *(vault 2.6)*.
 *
 * ## Why an OR and not an assignment
 *
 * `sampleHeldKeys` **overwrites** all four level fields from `key.isDown` every frame
 * (`gameInput.ts:359-362`). A touch source that wrote the snapshot directly would therefore be
 * erased on the next frame — silently, and only in the case where no key was also down, which is
 * every case that matters on a phone.
 */

import type { InputSnapshot } from '../sim/types';

/** What the keyboard is holding this frame, read out of Phaser `Key` objects by `gameInput.ts`. */
export interface KeyboardHeld {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  walkHeld: boolean;
}

/**
 * What the on-screen controls are holding this frame.
 *
 * Three fields, not four: **there is no walk button**, so a touch player always runs. Stated here
 * rather than left to be discovered from an absence — a `walkHeld` in this record would imply a
 * control that does not exist. Attack is absent for a different reason: it is an edge, and edges do
 * not travel through this file at all.
 */
export interface TouchHeld {
  left: boolean;
  right: boolean;
  jump: boolean;
}

/**
 * The neutral records, frozen.
 *
 * They are module-level singletons a caller may reach for every frame. Unfrozen, one caller writing
 * `NO_TOUCH_HELD.jump = true` to "reset" would arm every future frame for every consumer, and
 * nothing at the call site would look wrong.
 */
export const NO_KEYBOARD_HELD: Readonly<KeyboardHeld> = Object.freeze({
  left: false,
  right: false,
  jumpHeld: false,
  walkHeld: false,
});

export const NO_TOUCH_HELD: Readonly<TouchHeld> = Object.freeze({
  left: false,
  right: false,
  jump: false,
});

/**
 * Write this frame's held state into the snapshot, from both sources at once.
 *
 * Never writes `jumpPressed` or `attackPressed`.
 */
export function applyHeld(
  input: InputSnapshot,
  keyboard: Readonly<KeyboardHeld>,
  touch?: Readonly<TouchHeld> | null,
): void {
  const t = touch ?? NO_TOUCH_HELD;
  input.left = keyboard.left || t.left;
  input.right = keyboard.right || t.right;
  input.jumpHeld = keyboard.jumpHeld || t.jump;
  // No touch source, by design — see `TouchHeld`.
  input.walkHeld = keyboard.walkHeld;
}
