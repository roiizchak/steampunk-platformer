import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import { NO_KEYBOARD_HELD, NO_TOUCH_HELD, applyHeld } from '../../src/scenes/inputMerge';

/**
 * The one place keyboard held-state and touch held-state become the sim's four LEVEL fields.
 *
 * ## Why this is its own module and not a few lines in `gameInput.ts`
 *
 * 🔴 `src/scenes/gameInput.ts:1` is `import Phaser from 'phaser'` — a **value** import — and
 * `npm run test:sim-isolated` uninstalls Phaser and runs the **entire** Vitest suite, not just the
 * sim's slice. A unit test that reached for `sampleHeldKeys` to prove this behaviour would take
 * criterion 12.15 red for a reason that has nothing to do with the sim boundary. Named by the Codex
 * plan review, round 1, finding 5.
 *
 * So the merge lives in an engine-free module with type-only imports — the `audioKeyMap.ts`
 * precedent — and `gameInput.ts` keeps only the Phaser `Key` binding, reading `key.isDown` into a
 * plain record before calling in here.
 *
 * ## The distinction this file exists to protect
 *
 * `src/sim/input.ts` divides the snapshot in two, and the halves are not alike:
 *
 * - **Levels** (`left`, `right`, `jumpHeld`, `walkHeld`) are *sampled*. "Is the key down" is true
 *   across a whole tick batch by definition, so overwriting them every frame is correct.
 * - **Edges** (`jumpPressed`, `attackPressed`) are *latched*, and cleared **only when a tick
 *   consumes them**. A frame that drains zero ticks must leave a press exactly where it found it.
 *
 * `applyHeld` therefore writes four fields and must never touch the other two. A touch button arms
 * its edge through `latchJumpPress` / `latchAttackPress` — the one door *(vault 2.6)* — not here.
 */

describe('applyHeld', () => {
  it('is driven by the keyboard when there is no touch source', () => {
    const input = createSnapshot();
    applyHeld(input, { ...NO_KEYBOARD_HELD, right: true, walkHeld: true }, null);
    expect([input.right, input.walkHeld, input.left]).toEqual([true, true, false]);
  });

  it('is driven by touch when no key is down', () => {
    const input = createSnapshot();
    applyHeld(input, NO_KEYBOARD_HELD, { ...NO_TOUCH_HELD, right: true });
    expect(input.right).toBe(true);
  });

  it('ORs the two sources rather than letting either win', () => {
    // 🔴 This is the defect the module exists for. `sampleHeldKeys` OVERWRITES all four fields from
    // `key.isDown` every frame (`gameInput.ts:359-362`), so a touch source that wrote the snapshot
    // directly would be erased on the very next frame — silently, and only while a key was also up.
    const input = createSnapshot();
    applyHeld(input, { ...NO_KEYBOARD_HELD, left: true }, { ...NO_TOUCH_HELD, right: true, jump: true });
    expect([input.left, input.right, input.jumpHeld]).toEqual([true, true, true]);
  });

  it('clears a level when both sources release it', () => {
    const input = createSnapshot();
    applyHeld(input, { ...NO_KEYBOARD_HELD, right: true }, { ...NO_TOUCH_HELD, right: true });
    expect(input.right).toBe(true);
    applyHeld(input, NO_KEYBOARD_HELD, NO_TOUCH_HELD);
    expect(input.right, 'a released level stayed latched — levels are sampled, not latched').toBe(false);
  });

  it('releases a level held by only one source when that source lets go', () => {
    const input = createSnapshot();
    applyHeld(input, { ...NO_KEYBOARD_HELD, right: true }, { ...NO_TOUCH_HELD, right: true });
    applyHeld(input, NO_KEYBOARD_HELD, { ...NO_TOUCH_HELD, right: true });
    expect(input.right, 'touch still holds it').toBe(true);
    applyHeld(input, { ...NO_KEYBOARD_HELD, right: true }, NO_TOUCH_HELD);
    expect(input.right, 'the keyboard still holds it').toBe(true);
  });

  it('never writes the two EDGE fields', () => {
    // 🔴 A frame that drains zero ticks must leave a press exactly where it found it (vault 2.4).
    // If this function cleared either edge, a press latched between two frames would be eaten and
    // the jump would silently not happen — the exact failure `input-latch.test.ts` DROP case covers
    // one layer down.
    const input = createSnapshot();
    input.jumpPressed = true;
    input.attackPressed = true;
    applyHeld(input, NO_KEYBOARD_HELD, NO_TOUCH_HELD);
    expect([input.jumpPressed, input.attackPressed]).toEqual([true, true]);
  });

  it('leaves walkHeld to the keyboard, because touch has no walk source', () => {
    // Stated rather than discovered later: there are five buttons and no walk modifier, so a touch
    // player always runs. A touch record that carried a walk field would imply a control that does
    // not exist.
    const input = createSnapshot();
    applyHeld(input, { ...NO_KEYBOARD_HELD, walkHeld: true }, { ...NO_TOUCH_HELD, left: true });
    expect([input.walkHeld, input.left]).toEqual([true, true]);
    applyHeld(input, NO_KEYBOARD_HELD, { ...NO_TOUCH_HELD, left: true });
    expect(input.walkHeld).toBe(false);
  });

  it('treats a missing touch record as nothing held, not as a reason to skip the keyboard', () => {
    const input = createSnapshot();
    applyHeld(input, { ...NO_KEYBOARD_HELD, left: true }, undefined);
    expect(input.left).toBe(true);
  });

  it('does not mutate either source record', () => {
    const keyboard = { ...NO_KEYBOARD_HELD, left: true };
    const touch = { ...NO_TOUCH_HELD, jump: true };
    applyHeld(createSnapshot(), keyboard, touch);
    expect(keyboard).toEqual({ ...NO_KEYBOARD_HELD, left: true });
    expect(touch).toEqual({ ...NO_TOUCH_HELD, jump: true });
  });
});

describe('the neutral records', () => {
  it('hold nothing', () => {
    expect(Object.values(NO_KEYBOARD_HELD).every((v) => v === false)).toBe(true);
    expect(Object.values(NO_TOUCH_HELD).every((v) => v === false)).toBe(true);
  });

  it('are frozen, so a caller cannot poison the shared neutral', () => {
    // These are module-level singletons. A caller writing `NO_TOUCH_HELD.jump = true` to "reset"
    // would arm every future frame for every consumer, and nothing else here would look wrong.
    expect(Object.isFrozen(NO_KEYBOARD_HELD)).toBe(true);
    expect(Object.isFrozen(NO_TOUCH_HELD)).toBe(true);
  });
});
