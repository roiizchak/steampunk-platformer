import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import {
  NO_KEYBOARD_HELD,
  NO_TOUCH_HELD,
  applyHeld,
  type HeldKeys,
  readHeldKeys,
} from '../../src/scenes/inputMerge';

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
    // `key.isDown` every frame (`applyHeld`'s own assignments), so a touch source that wrote the snapshot
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

/**
 * 🔴 The half of the merge nothing could see.
 *
 * The QA gate's adversarial 12.4 brief found that `walkHeld: false` survives `npm test`,
 * `npm run test:e2e`, `npm run build` and `verify-dist` — SHIFT is a shipped control the help
 * banner advertises, `walkMax / runMax` is 0.400, and the mutation also makes the `walk` player
 * state unreachable and `brass-courier/walk` dead art. Nothing in the repo executed the read: the
 * two files naming `gameInput.ts` read it as source text, and no e2e spec presses Shift.
 *
 * Parametrised over all four fields rather than written out for one, because the defect was
 * exactly a per-field hole: `right` was covered and `left`, `jumpHeld` and `walkHeld` were not.
 */
describe('readHeldKeys', () => {
  const down = { isDown: true };
  const up = { isDown: false };
  const none: HeldKeys = { left: [], right: [], jump: [], walk: [] };

  const CASES = [
    ['left', 'left'],
    ['right', 'right'],
    ['jump', 'jumpHeld'],
    ['walk', 'walkHeld'],
  ] as const;

  for (const [source, field] of CASES) {
    it(`reads ${field} from the ${source} keys, and lets it go again`, () => {
      expect(readHeldKeys({ ...none, [source]: [up] })[field]).toBe(false);
      expect(readHeldKeys({ ...none, [source]: [down] })[field]).toBe(true);
      // Held is not latched: the same read on the next frame, with the key up, must clear.
      expect(readHeldKeys({ ...none, [source]: [up, up] })[field]).toBe(false);
    });

    it(`treats the ${source} bindings as ANY-of, so a second key for one action works`, () => {
      expect(readHeldKeys({ ...none, [source]: [up, down] })[field]).toBe(true);
    });
  }

  it('reads each field from its OWN key list — no two fields share a source', () => {
    // The mutation this catches is a copy-paste between two of the four reads, which a per-field
    // test in isolation cannot see: each one would still pass against its own list.
    for (const [source, field] of CASES) {
      const read = readHeldKeys({ ...none, [source]: [down] });
      expect(Object.entries(read).filter(([, v]) => v).map(([k]) => k)).toEqual([field]);
    }
  });

  it('is all-false when nothing is bound at all', () => {
    expect(readHeldKeys(none)).toEqual({
      left: false,
      right: false,
      jumpHeld: false,
      walkHeld: false,
    });
  });
});

describe('the walk latch reaches the sim', () => {
  it('ORs the touch latch with SHIFT, so neither source silently wins', () => {
    // ✅ Owner request. `walkHeld` had no touch source at all — stated in the plan rather than
    // discovered, but still a gap: `walkMax / runMax` is 0.400, a 60 % speed change, and without a
    // touch source the `walk` player state is unreachable on a phone, which makes
    // `brass-courier/walk` dead art on every touch device.
    for (const [key, touch, want] of [
      [false, false, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ] as const) {
      const input = createSnapshot();
      applyHeld(input, { ...NO_KEYBOARD_HELD, walkHeld: key }, { ...NO_TOUCH_HELD, walk: touch });
      expect(input.walkHeld, `SHIFT ${key} + plate ${touch}`).toBe(want);
    }
  });

  it('leaves walkHeld false when there is no touch source at all', () => {
    const input = createSnapshot();
    applyHeld(input, NO_KEYBOARD_HELD, null);
    expect(input.walkHeld).toBe(false);
  });
});

