import { describe, expect, it } from 'vitest';
import { createSnapshot } from '../../src/sim/input';
import { advance, createWorld } from '../../src/sim/tick';
import { animKeyFor } from '../../src/render/playerView';

/**
 * # Holding into a wall must not animate a run cycle
 *
 * Session inventory item **2.3**, and the root cause of **3.5** and half of **2.8** as well.
 *
 * `tick.ts` called `resolveState(player, dir !== 0 || player.vx !== 0, …)`. The `dir !== 0` term
 * means *"a direction key is held"*, so a player pinned against a wall — key down, `vx` pinned to
 * zero by `resolveCollisions`, body not moving a pixel — published `run`. The character cycled a
 * full run animation while covering **no ground at all**: foot-slide taken to its limit, and the
 * one thing this project has spent three sessions refusing.
 *
 * ## Why it was not fixed sooner, and why that reason expired
 *
 * `player.ts:166-170` names the cause and declines to fix it: *"It is deliberately not fixed in an
 * audio phase: that `dir !== 0` term exists for animation reasons predating Phase 7 and changing it
 * moves every locomotion assertion from Phase 2 onward."*
 *
 * That is a **scheduling** reason, not a design one — and this session is the schedule. Each moved
 * assertion is a reading to re-take, never a number edited until it matches.
 *
 * ## What it takes with it
 *
 * `player.ts:155-164` predicted both: *"Fix that and both readings agree without this function
 * knowing anything about it."*
 *
 * - **3.5**, the footstep cue losing phase after a wall pin. `advanceStride` zeroes its counter
 *   while `vx === 0`, but `playIfChanged` saw no state change — the state stayed `run` — so the
 *   sprite kept cycling and reversing away restarted the count against a mid-cycle animation.
 * - **2.8**'s foot-slide inside the goal dead zone, for the same reason: the body is stationary and
 *   the state said `run`.
 *
 * ## Why this test crosses the sim/render boundary on purpose
 *
 * Item 3.5 is recorded as *"no test can assert the phase relationship without crossing the
 * sim/render boundary: it is a listening judgement"*. That is true of the **phase**; it is not true
 * of the **premise**. What can be asserted mechanically is that the sim publishes a state whose
 * animation is not a locomotion cycle, and `animKeyFor` is the render-side decision function that
 * says which clip that state draws. Asserting sim state alone would pass if `animKeyFor` were later
 * remapped, which is the class of gap this file exists to close, so it asserts both ends.
 *
 * `src/render/` imports from `src/sim/` — the direction that is allowed and unenforced. Nothing
 * here runs the other way, and `sim-boundary.test.ts` still guards the direction that matters.
 */

/** Flat floor, and a wall the player runs into. `scale: 1`, so these are sim units. */
const FLOOR_AND_WALL: { x: number; y: number; w: number; h: number }[] = [
  { x: -2000, y: 960, w: 8000, h: 120 },
  { x: 400, y: 600, w: 200, h: 360 },
];

function pinnedAgainstTheWall(): ReturnType<typeof createWorld> {
  const world = createWorld({
    seed: 5,
    scale: 1,
    solids: FLOOR_AND_WALL,
    spawn: { x: 0, y: 960 },
  });
  const input = createSnapshot();
  advance(world, input, 5);

  // Hold right for long enough to cross the gap, hit the wall, and settle against it. 240 ticks is
  // four seconds — far past any acceleration ramp — so what is measured is the steady pinned state
  // and not a transient.
  input.right = true;
  advance(world, input, 240);
  return world;
}

describe('a player held against a wall (inventory 2.3)', () => {
  it('is actually pinned — the premise, asserted before anything is concluded from it', () => {
    const world = pinnedAgainstTheWall();
    const { player } = world;

    // Type before value, per the project's own rule: a NaN x would satisfy every comparison below
    // by being neither greater nor less, and the failure would read as a passing test.
    expect(typeof player.vx).toBe('number');
    expect(typeof player.x).toBe('number');
    expect(Number.isFinite(player.x)).toBe(true);

    expect(player.grounded, 'the player fell off the floor — this measures a wall, not a pit').toBe(
      true,
    );
    expect(player.vx, 'not pinned: the body is still moving, so there is no wall to test').toBe(0);
  });

  it('travels ZERO pixels over a full second while the key is still held', () => {
    const world = pinnedAgainstTheWall();
    const input = createSnapshot();
    input.right = true;

    const before = world.player.x;
    advance(world, input, 60);

    // The whole defect in one number. A run cycle drawn over this is a foot-slide of the entire
    // stride, every stride.
    expect(world.player.x - before).toBe(0);
  });

  it('does not publish a locomotion state, and does not draw a locomotion clip', () => {
    const world = pinnedAgainstTheWall();

    expect(world.player.state).toBe('idle');

    // The render end of the same claim. `animKeyFor` is what decides the clip, so a sim-only
    // assertion would still pass if this mapping were changed underneath it.
    const key = animKeyFor(world.player.state);
    expect(key).not.toContain('run');
    expect(key).not.toContain('walk');
  });

  it('leaves the stride counter at rest, which is what 3.5 needs (inventory 3.5)', () => {
    const world = pinnedAgainstTheWall();

    // `advanceStride` already zeroed this while `vx === 0`; what was missing is that the STATE
    // disagreed, so `playIfChanged` never restarted the sprite and the cue lost its phase against a
    // mid-cycle animation. With the state now `idle` the two readings agree.
    expect(world.player.strideCounter).toBe(0);
    expect(world.player.strideGait).toBeNull();
  });

  it('still runs when the key is held and the body IS moving — the fix is not "never run"', () => {
    // The counter-fixture. Deleting the `dir !== 0` term is only correct if running on open ground
    // is untouched; a fix that made the player never animate would pass every assertion above.
    const world = createWorld({
      seed: 5,
      scale: 1,
      solids: [{ x: -2000, y: 960, w: 8000, h: 120 }],
      spawn: { x: 0, y: 960 },
    });
    const input = createSnapshot();
    advance(world, input, 5);
    input.right = true;
    advance(world, input, 60);

    expect(world.player.vx).toBeGreaterThan(0);
    expect(world.player.state).toBe('run');
    expect(animKeyFor(world.player.state)).toContain('run');
  });
});
