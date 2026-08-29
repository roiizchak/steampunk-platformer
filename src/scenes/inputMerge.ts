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

/**
 * The four keyboard levels, read off a set of key-like objects.
 *
 * 🔴 Extracted here because nothing could see it. The QA gate's adversarial 12.4 brief found a
 * mutation that survives every gate in the repo: change `walkHeld` to `false` in `sampleHeldKeys`
 * and `npm test`, `npm run test:e2e`, `npm run build` and `verify-dist` are all green — while
 * SHIFT, a shipped control the help banner advertises, stops working. `walkMax / runMax` is 0.400,
 * so it is a 60 % speed change, and it also makes the `walk` player state unreachable, which makes
 * `brass-courier/walk` dead art.
 *
 * Nothing in the repo executed `sampleHeldKeys`: the two test files that name `gameInput.ts` read
 * it as SOURCE TEXT, `input-merge.test.ts` deliberately does not import it, and no e2e spec
 * anywhere presses Shift. The read was the one part of the merge with no consumer gate.
 *
 * `KeyLike` is structural on purpose — a Phaser `Key` satisfies it, and so does `{ isDown: true }`,
 * which is what lets this be tested in a suite that runs with Phaser uninstalled.
 */
export interface KeyLike {
  isDown: boolean;
}

export interface HeldKeys {
  left: readonly KeyLike[];
  right: readonly KeyLike[];
  jump: readonly KeyLike[];
  walk: readonly KeyLike[];
}

export function readHeldKeys(held: HeldKeys): KeyboardHeld {
  const any = (keys: readonly KeyLike[]): boolean => keys.some((key) => key.isDown);
  return {
    left: any(held.left),
    right: any(held.right),
    jumpHeld: any(held.jump),
    walkHeld: any(held.walk),
  };
}
