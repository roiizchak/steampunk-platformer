/**
 * Coyote time and jump buffering — QA criteria 2.3 and 2.4.
 *
 * Both windows live here because after **Codex plan review F5** they are the same mechanism. The
 * original design used decrementing timers armed at different points in the tick order, which gave
 * the two windows different endpoint semantics from the same knob and cost coyote one usable tick.
 * They are now incrementing counters tested `counter < knob`, and this file is what holds them to
 * the identical definition:
 *
 *   > **`N` means the jump is accepted on the tick the window opens and on the `N - 1` ticks after
 *   > it — `N` accepting ticks, the opening tick inclusive.**
 *
 * Three vault items shape every test below:
 *
 *  - **2.7** — a temporal invariant needs a fixture that SPANS it. Ten tests once covered "fires at
 *    most once per window" and deleting every latch left all ten green, because a one-tick fixture
 *    cannot distinguish "at most once" from "every time". Every sweep here runs to `2N + 2`.
 *  - **2.8** — expectations are derived from the LIVE knob and bracketed with a floor AND a
 *    ceiling. `accepted at N-1` alone passes an implementation that accepts forever; `rejected at N`
 *    alone passes one that never accepts.
 *  - **2.3 / criterion 2.5** — the boundary assertions are what the mutation gate deletes. If
 *    removing the `counter < knob` guard leaves this file green, the file is decoration.
 *
 * Every test here is a REPRODUCTION (red -> green) *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { advance, createWorld } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';

/**
 * Walk right off the ledge and stop on the tick the player leaves the ground.
 * Returns the world positioned exactly at window-open, offset 0.
 */
function walkOffLedge(): World {
  const world = createWorld({ seed: 1, scale: 1 });
  const input = createSnapshot();
  advance(world, input, 10);
  expect(world.player.grounded).toBe(true);

  input.right = true;
  for (let i = 0; i < 600; i += 1) {
    const events = advance(world, input, 1);
    if (events.leftGround) {
      expect(world.player.grounded).toBe(false);
      // Walked off, not jumped: nothing pressed jump, so vy must not be an impulse.
      expect(world.player.vy).toBeGreaterThanOrEqual(0);
      return world;
    }
  }
  throw new Error('fixture broken: the player never walked off the ledge');
}

/** Did a jump fire when pressed `offset` ticks after leaving the ground? */
function jumpsAfterLeavingGroundBy(offset: number): boolean {
  const world = walkOffLedge();
  const input = createSnapshot();

  // Offset 0 means "press on the very tick the window opened", so no ticks elapse first.
  if (offset > 0) {
    const drift = advance(world, input, offset);
    // The fixture is only meaningful while the player is still airborne and has not landed on
    // something below. If it lands, the trial is measuring the wrong thing entirely.
    expect(drift.landed).toBe(false);
    expect(world.player.grounded).toBe(false);
  }

  latchJumpPress(input);
  return advance(world, input, 1).jumped;
}

describe('coyote time (criterion 2.3, vault 2.7)', () => {
  it('accepts a jump on every tick of its window and rejects every tick after it', () => {
    const { coyoteTicks } = createWorld({ seed: 1, scale: 1 }).tuning;
    expect(typeof coyoteTicks).toBe('number');
    expect(coyoteTicks).toBeGreaterThan(1);

    // Spans 2x the window plus margin (vault 2.7) — a fixture that stopped at the boundary could
    // not tell a correct window from one that never closes.
    const accepted: number[] = [];
    const rejected: number[] = [];
    for (let offset = 0; offset <= coyoteTicks * 2 + 2; offset += 1) {
      (jumpsAfterLeavingGroundBy(offset) ? accepted : rejected).push(offset);
    }

    // The floor: every tick inside the window accepts.
    expect(accepted).toEqual(Array.from({ length: coyoteTicks }, (_, i) => i));
    // The ceiling: every tick outside it rejects, and there are some (vault 2.8).
    expect(rejected.length).toBeGreaterThan(0);
    expect(Math.min(...rejected)).toBe(coyoteTicks);
  });

  it('accepts at the last tick of the window and rejects at the first tick past it', () => {
    const { coyoteTicks } = createWorld({ seed: 1, scale: 1 }).tuning;

    // The two assertions the inclusive definition in tick.ts is written to make unambiguous.
    expect(jumpsAfterLeavingGroundBy(coyoteTicks - 1)).toBe(true);
    expect(jumpsAfterLeavingGroundBy(coyoteTicks)).toBe(false);
  });

  it('fires AT MOST ONCE per window — a second press inside it does not jump again', () => {
    const world = walkOffLedge();
    const input = createSnapshot();

    latchJumpPress(input);
    expect(advance(world, input, 1).jumped).toBe(true);

    // Still inside what WAS the window. Jumping consumed it; it must not reopen.
    let extra = 0;
    for (let i = 0; i < world.tuning.coyoteTicks * 2; i += 1) {
      latchJumpPress(input);
      if (advance(world, input, 1).jumped) {
        extra += 1;
      }
    }
    expect(extra).toBe(0);
  });

  it('a grounded player jumps regardless of the coyote counter', () => {
    const world = createWorld({ seed: 1, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 120);
    expect(world.player.grounded).toBe(true);

    latchJumpPress(input);
    expect(advance(world, input, 1).jumped).toBe(true);
  });
});

describe('jump buffering (criterion 2.4, vault 2.7)', () => {
  /**
   * Ticks from the start of a fall until the player is grounded again, measured on a probe world
   * so the trial itself never depends on a hand-counted constant.
   */
  function ticksToLand(): number {
    const world = createWorld({ seed: 2, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);
    // Hold jump for the FULL-height arc. Released, the jump-cut divisor shortens the hop to about
    // 14 ticks of airtime, which is too little to place a press `2 x jumpBufferTicks` before
    // landing — the fixture would stop spanning the window it is measuring (vault 2.7).
    input.jumpHeld = true;
    latchJumpPress(input);
    advance(world, input, 1);
    expect(world.player.grounded).toBe(false);

    for (let i = 1; i < 1000; i += 1) {
      if (advance(world, input, 1).landed) {
        return i;
      }
    }
    throw new Error('fixture broken: the player never landed');
  }

  /** Jump, press again `before` ticks before touching down, and report whether it re-jumped. */
  function jumpsWhenPressedBeforeLanding(before: number): boolean {
    const land = ticksToLand();
    expect(land).toBeGreaterThan(before + 2);

    const world = createWorld({ seed: 2, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);
    input.jumpHeld = true;
    latchJumpPress(input);
    advance(world, input, 1);

    advance(world, input, land - before - 1);
    expect(world.player.grounded).toBe(false);

    latchJumpPress(input);
    // Run past the landing far enough that a buffered jump has every chance to fire.
    let jumped = false;
    for (let i = 0; i < before + 3; i += 1) {
      if (advance(world, input, 1).jumped) {
        jumped = true;
      }
    }
    return jumped;
  }

  it('a press just before landing still jumps; a press too early does not', () => {
    const { jumpBufferTicks } = createWorld({ seed: 2, scale: 1 }).tuning;
    expect(typeof jumpBufferTicks).toBe('number');
    expect(jumpBufferTicks).toBeGreaterThan(1);

    // Floor: inside the window it buffers.
    expect(jumpsWhenPressedBeforeLanding(jumpBufferTicks - 1)).toBe(true);
    // Ceiling: outside it, the press is stale and is discarded (vault 2.8).
    expect(jumpsWhenPressedBeforeLanding(jumpBufferTicks + 2)).toBe(false);
  });

  it('the buffer window has the same inclusive semantics as coyote time', () => {
    const world = createWorld({ seed: 2, scale: 1 });
    const { jumpBufferTicks } = world.tuning;

    const results: boolean[] = [];
    // Spans 2x the window (vault 2.7).
    for (let before = 0; before <= jumpBufferTicks * 2; before += 1) {
      results.push(jumpsWhenPressedBeforeLanding(before));
    }

    const firstRejected = results.indexOf(false);
    expect(firstRejected).toBe(jumpBufferTicks);
    expect(results.slice(0, jumpBufferTicks).every(Boolean)).toBe(true);
    expect(results.slice(jumpBufferTicks).some(Boolean)).toBe(false);
  });

  it('fires on the tick AFTER touchdown, not on the touchdown tick itself', () => {
    // Codex implementation review I1. Every other buffer test here asks "did a jump happen after
    // landing", which cannot distinguish acceptance on the landing tick from acceptance on the
    // one after it — so the header could claim the wrong semantics and stay green. This test
    // records WHICH tick accepted, so the claim is pinned to the code.
    const world = createWorld({ seed: 2, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);
    input.jumpHeld = true;
    latchJumpPress(input);
    advance(world, input, 1);
    input.jumpHeld = false;
    expect(world.player.grounded).toBe(false);

    // Press again early enough to be inside the window when the player lands.
    let landedAt = -1;
    let jumpedAt = -1;
    let pressed = false;

    for (let t = 1; t < 400; t += 1) {
      // Press exactly `jumpBufferTicks - 1` ticks before the landing is due. The landing tick is
      // not known in advance, so press once the player is close to the ground instead.
      if (!pressed && world.player.vy > 0 && world.player.y > 700) {
        latchJumpPress(input);
        pressed = true;
      }
      const events = advance(world, input, 1);
      if (events.landed && landedAt === -1) {
        landedAt = t;
      }
      if (events.jumped && jumpedAt === -1) {
        jumpedAt = t;
      }
      if (landedAt !== -1 && jumpedAt !== -1) {
        break;
      }
    }

    expect(pressed).toBe(true);
    expect(landedAt).toBeGreaterThan(0);
    expect(jumpedAt).toBeGreaterThan(0);
    // The documented semantics, asserted exactly: one tick after touchdown, never on it.
    expect(jumpedAt).toBe(landedAt + 1);
  });

  it('a buffered press is consumed by the jump, not re-used on the next landing', () => {
    const world = createWorld({ seed: 2, scale: 1 });
    const input = createSnapshot();
    advance(world, input, 10);

    latchJumpPress(input);
    expect(advance(world, input, 1).jumped).toBe(true);

    // Fall, land, and keep going well past a second landing without pressing again.
    let jumps = 0;
    for (let i = 0; i < 400; i += 1) {
      if (advance(world, input, 1).jumped) {
        jumps += 1;
      }
    }
    expect(jumps).toBe(0);
  });
});
