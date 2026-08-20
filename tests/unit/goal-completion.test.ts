/**
 * Step 9d — reaching the exit completes the level, exactly once, and then the sim stops.
 *
 * Phase 8. Criterion 8.1's runtime half: `level-goal.test.ts` gates the level DATA, `level-reach.test.ts`
 * gates whether the exit can be reached, and this file gates what happens when it is.
 *
 * ## Why the freeze gets its own tests
 *
 * The first draft of this feature latched `world.completed` and emitted the edge, and stopped there.
 * The Codex plan review pointed out that `GameScene.update()` drains ticks unconditionally, so the sim
 * would keep running through the fade, the overlay and the wait for a keypress — and everything below
 * was reachable behind a "LEVEL COMPLETE" banner: dying, respawning, and a gear total that kept moving
 * after the number was supposed to be final. `goal.ts` carries the full account.
 *
 * ## The null-goal no-op is gated from BOTH directions
 *
 * `World.goal` defaults to `null` so forty-odd pre-Phase-8 fixtures need no edit, and step 9d no-ops on
 * it. That is a real risk: "no-ops on null" is one typo away from "never fires". So this file asserts a
 * null-goal world never completes AND `level-goal.test.ts` asserts every shipped level parses to a
 * non-null goal. Either alone is a gate that cannot go red *(vault C2)*.
 */

import { describe, expect, it } from 'vitest';
import { createSnapshot } from '../../src/sim/input';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import { DEATH_TICKS } from '../../src/sim/combat';
import { GOAL_ENTRY_TICKS } from '../../src/sim/goal';
import type { InputSnapshot, Rect, World } from '../../src/sim/types';

const SCALE = 6;
const FLOOR: Rect[] = [{ x: 0, y: 960, w: 8000, h: 120 }];
const BOUNDS = { widthPx: 8000, heightPx: 1080 };
const SPAWN = { x: 1000, y: 960 };

/** The exit, standing on the floor well clear of the standing spawn box (x 934…1066). */
const GOAL: Rect = { x: SPAWN.x + 400, y: SPAWN.y - PLAYER_BOX.h * SCALE, w: 200, h: PLAYER_BOX.h * SCALE };

const world = (goal: Rect | null = GOAL, extra: Partial<Parameters<typeof createWorld>[0]> = {}): World =>
  createWorld({ seed: 1, scale: SCALE, solids: FLOOR, bounds: BOUNDS, spawn: SPAWN, goal, ...extra });

const running = (): InputSnapshot => ({ ...createSnapshot(), right: true });

/**
 * Drive the real `tick()` and report which ticks emitted the completion edge.
 *
 * `deaths` is tracked too, because "the player is dead" cannot be read off `player.hp` after the fact:
 * `respawnPlayer` restores full hp, so a run long enough to die is also long enough to look untouched.
 * The first draft asserted `hp <= 0` and got 100.
 */
function run(
  w: World,
  ticks: number,
  input: InputSnapshot = running(),
): { edges: number; at: number[]; deaths: number } {
  const at: number[] = [];
  let deaths = 0;
  for (let i = 0; i < ticks; i += 1) {
    const events = tick(w, input);
    if (events.levelCompleted) at.push(i);
    if (events.playerDied) deaths += 1;
  }
  return { edges: at.length, at, deaths };
}

describe('running into the exit completes the level', () => {
  it('sets `completed` and emits the edge on the tick the body enters the goal', () => {
    const w = world();
    expect(w.completed, 'a fresh world must not start completed, or this gate is vacuous').toBe(false);

    const { edges, at } = run(w, 200);

    expect(w.completed, 'the player ran 200 ticks into an exit 400 px away').toBe(true);
    expect(edges, 'levelCompleted must be an EDGE — one tick, not a condition that keeps firing').toBe(1);
    // Counted, not indexed: the exact tick depends on acceleration and on the box's half-width, and
    // hand-computing it would re-derive the sim rather than test it. What matters is that it is not
    // tick 0 (which would mean the goal overlapped the spawn) and not the last one.
    expect(at[0], 'the exit is 400 px away, so completion cannot happen on the first tick').toBeGreaterThan(0);
    expect(at[0], 'the exit is one run away, so it should not take most of the batch').toBeLessThan(120);
  });

  it('does not complete a world with no goal, however far the player runs', () => {
    // Direction 1 of the null-goal gate. Without this, `goal === null` returning early is
    // indistinguishable from `reachedGoal` never returning true at all.
    const w = world(null);
    const { edges } = run(w, 400);

    expect(edges, 'a world with no exit emitted levelCompleted').toBe(0);
    expect(w.completed, 'a world with no exit completed itself').toBe(false);
    expect(w.player.x, 'the fixture must actually move, or "never completed" proves nothing').toBeGreaterThan(
      SPAWN.x + 400,
    );
  });
});

describe('a completed level is TERMINAL — the sim stops', () => {
  /**
   * 🔴 The red proof for the freeze guard. Delete `if (world.completed) return noEvents();` from
   * `tick()` and this test fails: the player walks out of the goal, off the end of the floor, dies on
   * the kill plane and respawns, all behind the level-complete overlay.
   */
  it('does not move the player, change hp, or collect anything after completion', () => {
    const w = world(GOAL, { gears: [{ x: SPAWN.x + 700, y: SPAWN.y - 48 }] });
    run(w, 200);
    expect(w.completed, 'premise: the level must actually complete first').toBe(true);

    const frozen = {
      x: w.player.x,
      y: w.player.y,
      hp: w.player.hp,
      tickCount: w.tickCount,
      gearsCollected: w.gearsCollected,
      tickRoll: w.tickRoll,
    };

    // 200 more ticks of held input — more than DEATH_TICKS, so a death behind the overlay would have
    // time to run its whole window and respawn.
    expect(200, 'the window must outlast a full death + respawn or this proves too little').toBeGreaterThan(
      DEATH_TICKS,
    );
    const after = run(w, 200);

    expect(after.edges, 'levelCompleted fired again after the level was already complete').toBe(0);
    expect(w.player.x, 'the player kept moving after the level completed').toBe(frozen.x);
    expect(w.player.y, 'the player kept falling after the level completed').toBe(frozen.y);
    expect(w.player.hp, 'the player took damage after the level completed').toBe(frozen.hp);
    expect(w.gearsCollected, 'a gear was collected after the level completed').toBe(frozen.gearsCollected);
    expect(w.tickCount, 'tickCount advanced after the level completed').toBe(frozen.tickCount);
    // The seeded stream must not advance either — a frame-rate-dependent number of samples after the
    // level ends would make a replay diverge from the run that recorded it (vault 2.3).
    expect(w.tickRoll, 'the RNG advanced after the level completed').toBe(frozen.tickRoll);
  });

  it('reports no events at all once complete, not merely no completion event', () => {
    const w = world();
    run(w, 200);
    expect(w.completed, 'premise').toBe(true);

    // `footstep` is the one that would otherwise keep firing every 24 ticks of held input.
    const events = tick(w, running());
    for (const [key, value] of Object.entries(events)) {
      expect(value, `"${key}" fired on a tick after the level was complete`).toBe(false);
    }
  });
});

describe('death wins ties', () => {
  /**
   * ⚠️ The two tests are entered by DIFFERENT geometry, and the fixture has to respect that.
   *
   * A hazard is swept against the player's reference POINT — `hazardHit` takes `(fromX, fromY, toX,
   * toY)`, the feet centre's path. The goal is tested against the player's BOX, so its right edge
   * enters `goal.x` a half-width (66 px) earlier than the feet do.
   *
   * The first draft put the hazard exactly on the goal rect, expecting 9b to kill before 9d completed.
   * It did not: the box entered the goal at x≈1334, 9d latched, and the freeze stopped the sim before
   * the feet ever reached x 1400. The premise assertion below is what caught it — hp was still 1, so
   * "the level did not complete" would have been green for entirely the wrong reason.
   *
   * So the hazard sits BEFORE the exit, which is also the honest version of the claim: what step 9d's
   * guard protects is a player who is dead when the exit is entered, and the way to be dead there is to
   * have died on the approach. A strict same-tick tie is not constructible from these two shapes.
   */
  it('does not complete the level when the player dies on the approach', () => {
    // 120 wide, not 140: the box enters the goal at `goal.x - 66`, so the hazard must finish before
    // 1334. The premise assertion below caught 140 at 1340, six pixels over.
    const HAZARD: Rect = { x: GOAL.x - 200, y: SPAWN.y - 96, w: 120, h: 200 };
    expect(
      HAZARD.x + HAZARD.w,
      'premise: the hazard must end before the box can enter the goal, or 9d latches first',
    ).toBeLessThan(GOAL.x - (PLAYER_BOX.w * SCALE) / 2);

    const w = world(GOAL, { hazards: [HAZARD] });
    w.player.hp = 1;

    /**
     * 60 ticks, deliberately shorter than a death window plus a second approach.
     *
     * At 200 the player died at roughly tick 45, respawned `DEATH_TICKS` later, ran the level again and
     * legitimately completed it — which is correct behaviour (a death costs you the attempt, not the
     * level) but is not what this test is about. 60 ticks covers the death and stops inside the window.
     */
    const { edges, deaths } = run(w, 60);

    expect(deaths, 'premise: the hazard must actually kill, or this gate is vacuous').toBe(1);
    expect(edges, 'the level completed even though the player died before the exit').toBe(0);
    expect(w.completed, 'a dead player completed the level').toBe(false);
  });

  /**
   * ⚠️ The guard alone is NOT what protects the respawn case, and this test records that rather than
   * implying otherwise.
   *
   * `respawnPlayer` runs at step 4c and restores `state: 'idle'` with full hp, so by the time 9d runs
   * on the respawn tick the `hp <= 0` test is already false. If the goal overlapped the spawn, dying
   * anywhere would complete the level. What actually prevents it is `describeGoalProblem` refusing such
   * a goal in level data — asserted by `goal-on-spawn.fixture` in `level-goal.test.ts`. The two rules
   * are load-bearing together; this asserts the runtime half behaves as described.
   */
  it('DOES complete with no input at all if a goal overlaps the spawn — which is why level data forbids it', () => {
    const overlapping: Rect = {
      x: SPAWN.x - 100,
      y: SPAWN.y - PLAYER_BOX.h * SCALE,
      w: 200,
      h: PLAYER_BOX.h * SCALE,
    };
    const w = world(overlapping);

    // 🔴 This used to complete on tick 0 and the assertion below said so. The gate-entry session
    // changed WHEN, not WHETHER: the body is contained from the first tick, so the run-in arms at
    // once and the level completes the moment the counter reaches `GOAL_ENTRY_TICKS`. The defect
    // the data rule prevents is unchanged and is still demonstrated rather than asserted away —
    // no input is ever supplied, and the level finishes anyway.
    //
    // Naming the exact tick is deliberately stronger than the old `toBe(0)`: it fails if the
    // completion drifts by one tick in either direction, which "it completed at some point" cannot.
    const { edges, at } = run(w, GOAL_ENTRY_TICKS + 10, createSnapshot());

    expect(edges, 'an overlapping goal must still complete unaided — the defect the data rule prevents').toBe(1);
    expect(at[0], 'it completes when the run-in counter matures, with no input at any point').toBe(
      GOAL_ENTRY_TICKS,
    );
  });
});
