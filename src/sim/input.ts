/**
 * The input snapshot — vault 2.4 (blocker) and 2.5 (blocker).
 *
 * The snapshot is a MUTABLE WORKING COPY shared between the scene and the tick batch. The scene
 * writes into it; the batch consumes from it. There is deliberately no per-tick copy: a fresh copy
 * per tick would hand every tick in the batch the same press, which is the replay failure.
 *
 * The rule that matters, and the one that is easy to get backwards:
 *
 *   > **An edge is cleared when a tick CONSUMES it — never because a tick ran, and never because a
 *   > render frame ended.** A frame that drains zero ticks must leave the press exactly where it
 *   > found it.
 *
 * Persistent state (`left`, `right`, `jumpHeld`, `walkHeld`) is not latched at all. Vault 2.5
 * permits sampling it, because "is the key down" is true across a whole batch by definition. Only
 * edges — "the key went down" — can be destroyed by observing them at the wrong rate.
 *
 * Why the scene latches from the keyboard EVENT rather than polling:
 * `Phaser.Input.Keyboard.JustDown()` is a consuming read that resets when checked, and polling
 * `isDown` misses a press-and-release that happens entirely between two render frames. Both lose
 * the edge before it ever reaches this file.
 */

import type { InputSnapshot } from './types';

/** A snapshot with nothing pressed. The scene creates ONE and reuses it for the session. */
export function createSnapshot(): InputSnapshot {
  return {
    left: false,
    right: false,
    jumpHeld: false,
    jumpPressed: false,
    walkHeld: false,
    attackPressed: false,
  };
}

/**
 * Record that jump went down this frame. The one door for arming this edge (vault 2.6).
 *
 * Idempotent within a frame on purpose: a key repeat, or two listeners firing, must not queue two
 * jumps. The edge is a boolean, not a count.
 */
export function latchJumpPress(input: InputSnapshot): void {
  input.jumpPressed = true;
}

/**
 * Take the jump edge if there is one. The ONLY way it is cleared.
 *
 * Called by step 2 of `tick()` — so it is consumed by a tick, which is the whole distinction vault
 * 2.4 draws. If this were called from the scene's frame loop instead, a frame that drained zero
 * ticks would eat the press and the jump would silently not happen.
 */
export function consumeJumpPress(input: InputSnapshot): boolean {
  const pressed = input.jumpPressed;
  input.jumpPressed = false;
  return pressed;
}

/**
 * Record that attack went down this frame. The one door for arming this edge (vault 2.6).
 *
 * Same idempotence as `latchJumpPress`: holding `Z`, or `Z` and `J` both bound and both firing,
 * arms one swing, not two. The edge is a boolean, not a count.
 */
export function latchAttackPress(input: InputSnapshot): void {
  input.attackPressed = true;
}

/**
 * Take the attack edge if there is one. The ONLY way it is cleared.
 *
 * Consumed by step 4 of `tick()`, not by the scene's frame loop — a frame that drained zero ticks
 * must not eat the press, which is the distinction vault 2.4 draws and the reason this mirrors the
 * jump pair exactly rather than inventing a second mechanism.
 */
export function consumeAttackPress(input: InputSnapshot): boolean {
  const pressed = input.attackPressed;
  input.attackPressed = false;
  return pressed;
}
