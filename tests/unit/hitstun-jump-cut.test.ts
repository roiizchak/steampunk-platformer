/**
 * Codex implementation review (criterion 5.14) MAJOR finding: `tick.ts` step 6 (`stepVertical`) ran
 * unconditionally, before step 7's `hitstunLocked` gate even exists, so a player hit mid-rise could
 * still jump-cut their own ascent by releasing jump during the hard lock — trajectory control inside
 * a window `HURT_LOCK_TICKS`'s docstring and the QA log both call "not being in control".
 *
 * Fix: `tick.ts` now passes `hitstunLocked || input.jumpHeld` into `stepVertical`, so the cut branch
 * can never see `!jumpHeld` while locked. Gravity is untouched (it runs in the same call,
 * unconditionally) and `jumpCutPending` is never cleared by the forced-held branch, so the cut is
 * still available the instant the lock lifts — the second and third tests below are what stop this
 * fix becoming a permanent immunity instead of a gate.
 */

import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TUNING,
  HURT_LOCK_TICKS,
  PLAYER_MAX_HP,
  createSnapshot,
  createWorld,
  damagePlayer,
  latchJumpPress,
  movementLocked,
  tick,
} from '../../src/sim';
import type { InputSnapshot, World } from '../../src/sim';

/**
 * Grounded, jump, and hit while still rising. The obvious fixture — spawn next to an enemy — cannot
 * reach this state at all, because contact lands on tick 1 and the EXISTING hitstun lock correctly
 * blocks the jump. So this hits the player directly with `damagePlayer`, once airborne, and asserts
 * the precondition before any test trusts a number measured against it.
 */
function hitWhileRising(): { world: World; input: InputSnapshot } {
  const world = createWorld({ seed: 1, scale: 1 });
  const input = createSnapshot();
  for (let i = 0; i < 30; i += 1) {
    tick(world, input); // settle onto the floor, grounded and idle
  }

  input.jumpHeld = true;
  latchJumpPress(input);
  tick(world, input); // step 7 overwrites step 6's gravity — vy lands exactly at -jumpVelocity
  expect(world.player.grounded).toBe(false);
  expect(world.player.vy).toBeCloseTo(-DEFAULT_TUNING.jumpVelocity, 10);
  expect(world.player.jumpCutPending).toBe(true);

  damagePlayer(world.player, 10);
  expect(world.player.state).toBe('hurt');
  expect(world.player.hp).toBe(PLAYER_MAX_HP - 10);

  return { world, input };
}

describe('jump-cut is gated by hitstun (Codex implementation review 5.14, MAJOR)', () => {
  it('releasing jump on the first locked tick does NOT cut — vy advances by gravity alone', () => {
    const { world, input } = hitWhileRising();
    const vyBeforeLock = world.player.vy;

    input.jumpHeld = false;
    tick(world, input);

    expect(movementLocked(world.player)).toBe(true); // sanity: this tick really is inside the lock
    expect(world.player.vy).toBeCloseTo(vyBeforeLock + DEFAULT_TUNING.gravity, 10);
    expect(world.player.jumpCutPending).toBe(true); // not consumed — still live after the lock lifts
  });

  it('holding jump during the lock produces the SAME vy as releasing it — the two must now agree', () => {
    const { world, input } = hitWhileRising();
    const vyBeforeLock = world.player.vy;

    input.jumpHeld = true;
    tick(world, input);

    expect(movementLocked(world.player)).toBe(true);
    expect(world.player.vy).toBeCloseTo(vyBeforeLock + DEFAULT_TUNING.gravity, 10);
    expect(world.player.jumpCutPending).toBe(true);
  });

  it('after the lock lifts, releasing jump while still rising DOES cut', () => {
    const { world, input } = hitWhileRising();

    // Hold through the whole lock: HURT_LOCK_TICKS - 1 ticks walks combatCounter to
    // HURT_LOCK_TICKS - 1, one short of the boundary `knockback.test.ts` also uses.
    input.jumpHeld = true;
    for (let i = 0; i < HURT_LOCK_TICKS - 1; i += 1) {
      tick(world, input);
    }
    expect(movementLocked(world.player)).toBe(true); // still locked, one tick before the boundary
    const vyEnteringFreeTick = world.player.vy;
    expect(vyEnteringFreeTick).toBeLessThan(0); // still rising — the fixture warning in the brief

    input.jumpHeld = false;
    tick(world, input); // the first free tick

    expect(movementLocked(world.player)).toBe(false);
    const expected = vyEnteringFreeTick / DEFAULT_TUNING.jumpCutDivisor + DEFAULT_TUNING.gravity;
    expect(world.player.vy).toBeCloseTo(expected, 10);
    expect(world.player.jumpCutPending).toBe(false); // consumed, same as any ordinary cut
  });
});
