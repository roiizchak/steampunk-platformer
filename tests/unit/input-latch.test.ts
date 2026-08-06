/**
 * The input snapshot latch — vault 2.4 (blocker) and 2.5 (blocker).
 *
 * 2.4: "The input snapshot handed to a multi-tick batch must be a mutable working copy, and the
 * batch must consume from it. Reusing one snapshot REPLAYS a jump press twice; clearing the latch
 * on 'a tick ran' DROPS it entirely. Both are real."
 *
 * Both failures are reproduced here, because they are opposites and a fix for one is the classic
 * way to introduce the other:
 *
 *   - `replays` — the snapshot is not consumed, so every tick in the batch sees the same press.
 *   - `drops`   — the latch is cleared because time passed rather than because a tick took it.
 *
 * The second is the subtler one and it lives at the SCENE boundary, not in the sim: a render frame
 * that drains ZERO ticks (large monitor, small delta, or the accumulator just short of one tick)
 * must not eat the press. `advance(world, input, 0)` is that frame.
 *
 * All tests here are REPRODUCTIONS (red -> green) of the two failures vault 2.4 names *(vault C3)*.
 */

import { describe, expect, it } from 'vitest';
import { consumeJumpPress, createSnapshot, latchJumpPress } from '../../src/sim/input';
import { advance, createWorld } from '../../src/sim/tick';

/** A world whose player is standing on the floor, so a jump is always legal. */
function groundedWorld() {
  const world = createWorld({ seed: 1, scale: 1 });
  advance(world, createSnapshot(), 5); // settle onto the floor
  expect(world.player.grounded).toBe(true);
  return world;
}

describe('the snapshot is a mutable working copy the batch consumes from (vault 2.4)', () => {
  it('starts with every field false', () => {
    const input = createSnapshot();
    expect(input.jumpPressed).toBe(false);
    expect(input.jumpHeld).toBe(false);
    expect(input.left).toBe(false);
    expect(input.right).toBe(false);
  });

  it('consumeJumpPress returns the edge once, then false', () => {
    const input = createSnapshot();
    latchJumpPress(input);

    expect(consumeJumpPress(input)).toBe(true);
    expect(consumeJumpPress(input)).toBe(false);
    expect(consumeJumpPress(input)).toBe(false);
    expect(input.jumpPressed).toBe(false);
  });

  it('REPLAY: one press produces exactly one jump across a multi-tick batch', () => {
    const world = groundedWorld();
    const input = createSnapshot();
    latchJumpPress(input);

    // The SAME snapshot object, ticked repeatedly — precisely the situation vault 2.4 describes.
    let jumps = 0;
    for (let i = 0; i < 12; i += 1) {
      const events = advance(world, input, 1);
      expect(typeof events.jumped).toBe('boolean');
      if (events.jumped) {
        jumps += 1;
      }
    }

    // Exactly one. A floor of >= 1 would pass the replay bug it exists to catch (vault 2.8).
    expect(jumps).toBe(1);
  });

  it('REPLAY: a press consumed on tick 1 of a batch does not fire again later in that batch', () => {
    const world = groundedWorld();
    const input = createSnapshot();
    latchJumpPress(input);

    const batch = advance(world, input, 30);
    expect(batch.jumped).toBe(true);
    expect(input.jumpPressed).toBe(false);

    // Land again, then run another batch with no new press. Nothing should jump.
    const after = advance(world, input, 240);
    expect(world.player.grounded).toBe(true);
    expect(after.jumped).toBe(false);
  });

  it('DROP: a press latched during a frame that drained ZERO ticks survives to the next frame', () => {
    const world = groundedWorld();
    const input = createSnapshot();
    latchJumpPress(input);

    // The render frame whose accumulator did not reach one whole tick. Nothing consumed the
    // press, so nothing may clear it — "a tick ran" is not "your input was consumed".
    const empty = advance(world, input, 0);
    expect(empty.jumped).toBe(false);
    expect(input.jumpPressed).toBe(true);

    const next = advance(world, input, 1);
    expect(next.jumped).toBe(true);
  });

  it('DROP: a press latched between two batches is not lost', () => {
    const world = groundedWorld();
    const input = createSnapshot();

    expect(advance(world, input, 3).jumped).toBe(false);
    latchJumpPress(input);
    expect(advance(world, input, 1).jumped).toBe(true);
  });
});

describe('held state is sampled, edges are latched (vault 2.5)', () => {
  it('held direction applies on every tick of a batch without needing a latch', () => {
    const world = groundedWorld();
    const input = createSnapshot();
    input.right = true;

    const startX = world.player.x;
    advance(world, input, 20);

    expect(typeof world.player.x).toBe('number');
    expect(world.player.x).toBeGreaterThan(startX);
    // Persistent state is NOT consumed — it is still set after the batch.
    expect(input.right).toBe(true);
  });

  it('releasing a held direction stops further acceleration', () => {
    const world = groundedWorld();
    const input = createSnapshot();

    input.right = true;
    advance(world, input, 20);
    const movingSpeed = world.player.vx;
    expect(movingSpeed).toBeGreaterThan(0);

    input.right = false;
    advance(world, input, 60);
    expect(world.player.vx).toBeLessThan(movingSpeed);
  });
});
