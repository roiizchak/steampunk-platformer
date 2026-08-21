/**
 * Step 9d's entry sequence — you do not finish a level by brushing the door.
 *
 * The gate-art + gate-entry session. `goal-completion.test.ts` gates what happens once the exit
 * fires and the freeze that follows; this file gates the twenty ticks BEFORE it fires, which did
 * not exist until now.
 *
 * ## The defect this file exists to prevent
 *
 * `reachedGoal` completed the level on plain AABB overlap. The player's right edge crossing
 * `goal.x` by one pixel ended the level — so the character was teleported away at the threshold
 * rather than seen walking through the door, and 132 px of the doorway were never entered at all.
 *
 * ## The geometry, because every number below depends on it
 *
 * `PLAYER_BOX` is 22 x 48 local, so at scale 6 the body is **132 x 288** world px. Every shipped
 * goal rect is **192 x 288** and sits flush on its floor. So:
 *
 *   - the box is EXACTLY as tall as the rect, and vertical containment is an exact equality on
 *     both edges — satisfiable only while the player stands on that floor;
 *   - horizontally there are 60 px of slack, 30 each side;
 *   - first overlap is at `x > goal.x - 66`, containment at `x >= goal.x + 66`: **132 px of
 *     travel**, about 15 ticks at `runMax` 9.
 *
 * `GOAL_ENTRY_TICKS` is 20 so the TICK COUNT binds completion rather than the geometry. That is
 * what makes "assert which tick" deterministic instead of a race between a counter and a distance.
 *
 * ## 🔴 Three things Codex's plan review caught before this file was written
 *
 *  - **C3** — `bounds` and `solids` are passed EXPLICITLY below. `createWorld` defaults to the
 *    1920 x 1080 grey-box extent, and `clampToBounds` at step 9 would drag a player placed beyond
 *    it straight back inside. A fixture that omits them can never reach the gate however correct
 *    the feature is, and would have failed for a reason that has nothing to do with the feature.
 *  - **C1** — the cancel tests below are the blocker. Without a cancel a player killed mid-run-in
 *    respawns with the counter still armed and the controls still locked, auto-running from the
 *    spawn and unable to jump, across a level built to need jumps. The level becomes unwinnable.
 *  - **C7** — the lock test asserts `player.state`, the SIM's own answer. `playerView` forces the
 *    `run` key for the whole sequence, so an animation-key assertion would be green against a
 *    completely broken attack lock.
 */

import { describe, expect, it } from 'vitest';
import { GOAL_ENTRY_TICKS, containedInGoal, overlapsGoal, stepGoalEntry } from '../../src/sim/goal';
import { tick } from '../../src/sim/tick';
import type { World } from '../../src/sim/types';
import {
  BODY_W,
  CENTRE,
  FLOOR_Y,
  GOAL,
  makeWorld,
  neutral,
  runToGate,
  standingAt,
} from './goal-entry-fixture';

describe('the gate edge is not the gate', () => {
  it('brushing the left edge OVERLAPS but is NOT contained', () => {
    // The right edge is x + 66. One px past goal.x is the thinnest overlap that exists.
    const world = standingAt(GOAL.x - BODY_W / 2 + 1);
    expect(overlapsGoal(world), 'the old rule completed here').toBe(true);
    expect(containedInGoal(world), 'the new rule must refuse it').toBe(false);
  });

  it('brushing the right edge is the same story, mirrored', () => {
    const world = standingAt(GOAL.x + GOAL.w + BODY_W / 2 - 1);
    expect(overlapsGoal(world)).toBe(true);
    expect(containedInGoal(world)).toBe(false);
  });

  it('standing at the gate centre IS contained', () => {
    expect(containedInGoal(standingAt(CENTRE))).toBe(true);
  });

  it('the containment window is exactly 60px wide, and both its edges are inclusive', () => {
    expect(containedInGoal(standingAt(GOAL.x + BODY_W / 2))).toBe(true);
    expect(containedInGoal(standingAt(GOAL.x + BODY_W / 2 - 1))).toBe(false);
    expect(containedInGoal(standingAt(GOAL.x + GOAL.w - BODY_W / 2))).toBe(true);
    expect(containedInGoal(standingAt(GOAL.x + GOAL.w - BODY_W / 2 + 1))).toBe(false);
  });

  it('one pixel airborne is NOT contained — the box is exactly as tall as the rect', () => {
    // Not a quirk to work around: it is why the run-in drives the player along the GROUND, and
    // why `level-goal-fits.test.ts` gates the rect height of every shipped level.
    expect(containedInGoal(standingAt(CENTRE, FLOOR_Y - 1))).toBe(false);
  });

  it('a dead player at the centre is neither, however contained the body is', () => {
    const world = standingAt(CENTRE);
    world.player.hp = 0;
    expect(overlapsGoal(world)).toBe(false);
    expect(containedInGoal(world)).toBe(false);
  });

  /**
   * 🔴 **`stepGoalEntry` USES containment, and nothing else in this suite could prove it.**
   *
   * Found by the qa-expert's adversarial brief and confirmed by mutation: replacing
   * `containedInGoal` with `overlapsGoal` inside `stepGoalEntry`'s completion test left **all 1933
   * tests green**. The whole point of this session — that you finish by being INSIDE the door, not
   * by touching it — had no gate that could see it violated.
   *
   * Every other test in this file drives the sim, and the auto-run carries the player to the gate's
   * centre well before the counter matures. By tick 20 overlap and containment are both true, so
   * the two predicates agree and the swap is invisible. The predicate tests above catch a broken
   * `containedInGoal` in isolation, but nothing proved `stepGoalEntry` was calling it.
   *
   * The fix is to call the step DIRECTLY, with the counter already mature and the body parked
   * somewhere the two predicates disagree — which is exactly the gate's edge.
   */
  it('stepGoalEntry completes on CONTAINMENT, not on overlap, once the counter has matured', () => {
    const world = standingAt(GOAL.x - BODY_W / 2 + 1);
    // Premise, stated so this cannot pass by the two predicates quietly agreeing.
    expect(overlapsGoal(world), 'premise: the body touches the rect').toBe(true);
    expect(containedInGoal(world), 'premise: and is NOT inside it').toBe(false);

    world.goalEntryTicks = GOAL_ENTRY_TICKS;
    // `motionRan: true` — steps 5-8 ran. The freeze hold is `hitstop-frozen-counters.test.ts`'s
    // subject; here it must be out of the way or the step returns before the branch under test.
    expect(
      stepGoalEntry(world, true),
      'a matured counter plus mere overlap must NOT complete the level',
    ).toBe(false);
  });

  it('stepGoalEntry DOES complete once the same matured counter is genuinely contained', () => {
    // The positive half, so the test above cannot be satisfied by a `stepGoalEntry` that never
    // returns true at all.
    const world = standingAt(CENTRE);
    expect(containedInGoal(world)).toBe(true);
    world.goalEntryTicks = GOAL_ENTRY_TICKS;
    expect(stepGoalEntry(world, true)).toBe(true);
  });
});

/**
 * Run rightward with the attack button mashed on EVERY tick, including the arming one.
 *
 * 🔴 The arming tick is the one tick the lock does not cover, and that is by construction, not by
 * oversight: `entryLocked` is read once after step 0, and 9d — where the arming happens — is the
 * last thing in the tick. So on tick N the courier is still an ordinary player and can swing.
 * Raised by the gate's adversarial QA brief as a possible hole. It is not one, and this pins why:
 * `movementLocked` covers `death` and `hurt` only, so an attack in flight never stalls the auto-run,
 * and the edge is consumed by `stepCombat` on that same tick exactly as it would be at any other
 * time — nothing is left latched to fire into the next level *(vault 2.4)*.
 */
function runToGateMashing(world: World): void {
  for (let i = 0; i < 600; i += 1) {
    const input = neutral();
    input.right = true;
    input.attackPressed = true;
    tick(world, input);
    if (typeof world.goalEntryTicks === 'number') return;
  }
  throw new Error('the sequence never armed');
}

describe('the run-in sequence', () => {
  it('an attack on the ARMING tick changes neither the window nor where it ends', () => {
    const world = makeWorld();
    runToGateMashing(world);
    expect(world.goalEntryTicks).toBe(0);

    for (let i = 0; i < GOAL_ENTRY_TICKS; i += 1) tick(world, neutral());
    expect(world.goalEntryTicks, 'the same window, not a longer one').toBe(GOAL_ENTRY_TICKS);
    expect(world.completed, 'and it still completes on that tick').toBe(true);
    expect(containedInGoal(world), 'a stalled auto-run would finish short of containment').toBe(true);
  });

  it('arms on the tick of first overlap, and arming is not completing', () => {
    const world = makeWorld();
    const armedAt = runToGate(world);
    expect(world.goalEntryTicks).toBe(0);
    expect(world.completed).toBe(false);
    expect(armedAt).toBeGreaterThan(0);
    expect(overlapsGoal(world), 'armed because the body reached the rect').toBe(true);
  });

  it('completes on the tick the counter reaches GOAL_ENTRY_TICKS, and not one tick earlier', () => {
    const world = makeWorld();
    runToGate(world);
    // Input is locked, so what is held from here must not matter. Hold LEFT — away from the
    // gate — plus jump. A sequence that is not really locked walks back out and never completes.
    const away = { ...neutral(), left: true, jumpPressed: true, jumpHeld: true };
    for (let i = 1; i < GOAL_ENTRY_TICKS; i += 1) {
      tick(world, { ...away });
      expect(world.goalEntryTicks, `counter at tick ${i}`).toBe(i);
      expect(world.completed, `must not complete at counter ${i}`).toBe(false);
    }
    tick(world, { ...away });
    expect(world.goalEntryTicks).toBe(GOAL_ENTRY_TICKS);
    expect(world.completed, 'completes exactly here').toBe(true);
  });

  it('is genuinely contained by the time it completes — not merely counted to', () => {
    const world = makeWorld();
    runToGate(world);
    for (let i = 0; i < GOAL_ENTRY_TICKS; i += 1) tick(world, neutral());
    expect(world.completed).toBe(true);
    expect(containedInGoal(world)).toBe(true);
  });

  it('drives the player toward the gate centre, against the input', () => {
    const world = makeWorld();
    runToGate(world);
    const before = Math.abs(CENTRE - world.player.x);
    const away = { ...neutral(), left: true };
    for (let i = 0; i < 8; i += 1) tick(world, { ...away });
    expect(Math.abs(CENTRE - world.player.x), 'closed the distance').toBeLessThan(before);
  });

  it('runs, never walks — the walk modifier is ignored for the whole sequence', () => {
    const world = makeWorld();
    runToGate(world);
    const walking = { ...neutral(), walkHeld: true, left: true };
    for (let i = 0; i < 6; i += 1) tick(world, { ...walking });
    expect(world.player.state).toBe('run');
  });

  it('the locked player does not jump and does not swing', () => {
    const world = makeWorld();
    runToGate(world);
    for (let i = 0; i < 6; i += 1) {
      // The SIM state, not the render key: `playerView` forces `run` regardless and would hide a
      // broken attack lock completely. Codex plan review C7.
      tick(world, { ...neutral(), jumpPressed: true, jumpHeld: true, attackPressed: true });
      expect(world.player.state, `tick ${i}`).not.toBe('attack');
    }
    expect(world.player.grounded, 'a jump would have left the ground').toBe(true);
  });

  it('consumes the attack edge while locked, so it cannot fire later (vault 2.4)', () => {
    // Codex plan review C2, a blocker. Suppressing the edge with a spread CLONE would clear the
    // clone and leave this snapshot latched forever — the swing then lands the instant the lock
    // lifts, or on the first tick of the next level.
    const world = makeWorld();
    runToGate(world);
    const input = { ...neutral(), attackPressed: true };
    tick(world, input);
    expect(input.attackPressed, 'the edge must be eaten, not left latched').toBe(false);
  });
});
