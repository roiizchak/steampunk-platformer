import { describe, expect, it } from 'vitest';
import { advance, createWorld } from '../../src/sim/tick';
import { createSnapshot } from '../../src/sim/input';
import { GOAL_ENTRY_TICKS } from '../../src/sim/goal';
import type { Rect } from '../../src/sim/types';

/**
 * # `goalReached` fires on ARRIVAL, twenty ticks before `levelCompleted` (inventory 2.6)
 *
 * `goalLayer.ts` recorded the defect against itself: the exit's flourish *"fires on
 * `levelCompleted`, which since the gate-art session is **twenty ticks after** the player reached
 * the door and one tick after the courier finished fading out. So it is the *completed-it* flourish
 * now, not the *reached-it* one, and it plays over an empty doorway."*
 *
 * ## Why a new edge, rather than a comparison in the scene
 *
 * The scene could have watched `world.goalEntryTicks` go from `null` to a number. It must not: that
 * is **re-deriving an event edge from two samples of a level across frames**, and a frame that
 * drains several ticks steps straight over the arming tick. `advanceSplit` exists for exactly this
 * and OR-accumulates every edge across a batch, so an edge survives a long frame and a sampled
 * comparison does not.
 *
 * So step 9d emits it, from two samples taken **inside the tick that causes the transition** —
 * straddling one step, not one frame.
 *
 * ## What this asserts, and why it is a tick count rather than an existence check
 *
 * *"An existence assertion cannot verify a timing claim."* The whole defect was a flourish playing
 * at the wrong **moment**; a test that only checked `goalReached` ever became true would have passed
 * on the broken build too, because `levelCompleted` is also true eventually.
 */

const SCALE = 6;
const FLOOR: Rect[] = [{ x: -2000, y: 2000, w: 20000, h: 400 }];
const GOAL: Rect = { x: 1400, y: 2000 - 288, w: 200, h: 288 };
const BOUNDS = { widthPx: 20000, heightPx: 4000 };

/** Walk right into the exit, recording the tick each edge fired on. */
function walkIntoTheExit(): { reachedTick: number | null; completedTick: number | null } {
  const world = createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: 600, y: 2000 },
    goal: GOAL,
  });
  const input = createSnapshot();
  input.right = true;

  let reachedTick: number | null = null;
  let completedTick: number | null = null;
  for (let i = 0; i < 600; i += 1) {
    const events = advance(world, input, 1);
    if (events.goalReached && reachedTick === null) reachedTick = world.tickCount;
    if (events.levelCompleted && completedTick === null) completedTick = world.tickCount;
    if (completedTick !== null) break;
  }
  return { reachedTick, completedTick };
}

describe('the arrival edge (inventory 2.6)', () => {
  const { reachedTick, completedTick } = walkIntoTheExit();

  it('the premise: the player actually reaches the exit and finishes the level', () => {
    // Without this, "reached fires before completed" is trivially true of two nulls.
    expect(reachedTick, 'the player never reached the exit').not.toBeNull();
    expect(completedTick, 'the level never completed').not.toBeNull();
  });

  it('fires BEFORE levelCompleted, not on the same tick', () => {
    expect(reachedTick!).toBeLessThan(completedTick!);
  });

  it('fires exactly the run-in ahead of it — the twenty ticks the defect described', () => {
    // The number, not merely the order. `GOAL_ENTRY_TICKS` is the run-in's own length, so this
    // tracks a retune instead of pinning a literal that would go stale the way 4.2's table did.
    expect(completedTick! - reachedTick!).toBe(GOAL_ENTRY_TICKS);
  });

  it('fires ONCE — an arrival is not a state that keeps arriving', () => {
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 600, y: 2000 },
      goal: GOAL,
    });
    const input = createSnapshot();
    input.right = true;

    let count = 0;
    for (let i = 0; i < 600; i += 1) {
      const events = advance(world, input, 1);
      if (events.goalReached) count += 1;
      if (events.levelCompleted) break;
    }
    expect(count, 'the arrival edge repeated — it is a state, not an edge').toBe(1);
  });

  it('does not fire at all on a level whose exit is never touched', () => {
    // The counter-fixture. An edge stuck at `true` would satisfy every assertion above.
    const world = createWorld({
      seed: 1,
      scale: SCALE,
      solids: FLOOR,
      bounds: BOUNDS,
      spawn: { x: 600, y: 2000 },
      goal: { x: 12000, y: 2000 - 288, w: 200, h: 288 },
    });
    const input = createSnapshot();

    let fired = false;
    for (let i = 0; i < 120; i += 1) {
      if (advance(world, input, 1).goalReached) fired = true;
    }
    expect(fired, 'the arrival edge fired without an arrival').toBe(false);
  });
});
