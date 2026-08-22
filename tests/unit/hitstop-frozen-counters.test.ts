/**
 * 🔴 The two counters that were still spending ticks inside a hit-stop freeze.
 *
 * Phase 9's gate round found both and recorded both as "not changed" (QA log entries 41 and 42);
 * the phase owner ruled them closed, and this file is the gate. A third file rather than a third
 * `describe` in `hitstop-interactions.test.ts` only because that one is at 362 of its 400 lines —
 * the subject is the same one its header names: **what happens to everything that was already
 * counting.**
 *
 * ## Why neither could be caught by any existing fixture
 *
 * `advanceStride` (step 12) was inert **by accident**, not by design. Every freeze this game can
 * currently produce is armed by a blow, a blow puts the player into a combat state, and
 * `advanceStride` zeroes the stride counter for any gait that is not `walk` or `run`. So every
 * hit-stop fixture in the suite exercised a code path whose bug was masked by its own fixture.
 *
 * So the freeze here is armed **directly**, by writing `hitstopUntil`, exactly as such a feature
 * would. That is the whole point of the fixture and not a shortcut around one: `freezePair` is the
 * only *current* caller, and the defect is about the next one.
 *
 * ### ⚠️ A second accident, found by driving this fixture, and it is NOT a fix
 *
 * A frozen body also goes **un-grounded**. `resolveCollisions` decides grounding from an actual
 * overlap (`player.y <= solid.y` -> `continue`), and a resting body sits at exactly `solid.y`: while
 * running, gravity pushes it one integration below the surface every tick and the resolve snaps it
 * back. Freeze steps 5-8 and there is no push, so nothing overlaps and step 11 resolves `fall`.
 *
 * That is invisible today for the same reason the stride was: every real freeze carries a combat
 * state, and `resolveState` does not overwrite those. It is left alone deliberately — changing it is
 * a sim behaviour change nobody has asked for — but it is why the assertions below are written about
 * the **counter** rather than about the footstep edge. Unfixed, `advanceStride` reaches the `fall`
 * gait and RESETS the stride to 0; fixed, the cadence is held and resumes where it left off. Both
 * arms report `footstep: false`, so that assertion is a guard rather than the load-bearing one, and
 * saying so is cheaper than the day someone trusts it.
 *
 * ## ⚠️ What the mutation loop found: the 9d half is DEFENCE IN DEPTH, and this file says which
 *
 * `hitstop-frozen-counters` reds when step 12's gate is removed — that one is a live fix. Removing
 * step 9d's `motionRan` guard alone changes **nothing**, because a frozen body can never be grounded
 * and 9d's advance is already behind a `grounded` test. So the 9d case below pins the INVARIANT —
 * *the run-in banks no ticks from a standing body* — rather than the new line, and both mutations
 * were driven rather than argued:
 *
 *  - **remove the `grounded` hold, keep `motionRan`** -> still green. The new guard carries it alone.
 *  - **remove both** -> red, `expected 4 to be 3` on frozen tick 1. Not decoration.
 *
 * Saying which of the two a gate is buying is the whole point of writing it down: the next reader
 * who deletes the `motionRan` line to "simplify" will find this file green, and this paragraph is
 * what tells them that is expected and what to delete alongside it to see the invariant break.
 *
 * ## Every assertion here is written to fail if the fix does nothing
 *
 * Each case asserts the counter MOVING before the freeze and MOVING again after it, in the same
 * test, so "the counter did not advance" cannot be satisfied by a counter that never advances.
 *
 * ## A third describe, added by the Phase 9 Codex implementation round (finding 3)
 *
 * The two above are counters that spent ticks they should not have. The third is the mirror: a
 * counter that correctly does NOT spend them, for a freeze the player caused **themselves**. The
 * gate at step 4b.1 asks only whether the body is frozen, never what froze it, so landing a blow
 * inside the 27-tick actionable-invulnerable surplus holds the attacker's own i-frames. That is the
 * ruling `stepCombat`'s header makes, applied consistently — and nothing covered it, because every
 * i-frame fixture in the suite drives an INCOMING claw.
 */

import { describe, expect, it } from 'vitest';

import { FOOTSTEP_TICKS } from '../../src/sim/player';
import { HITSTOP_TICKS, frozen } from '../../src/sim/hitstop';
import { invulnerable, movementLocked } from '../../src/sim/combat';
import { createSnapshot, latchAttackPress } from '../../src/sim/input';
import { tick } from '../../src/sim/tick';
import type { InputSnapshot, World } from '../../src/sim/types';
import { IDLE, clawedWhileIdle, runningWorld } from './hitstop-fixtures';
import { GOAL_ENTRY_TICKS } from '../../src/sim/goal';
import { makeWorld, neutral, runToGate } from './goal-entry-fixture';

/**
 * Freeze the player with **no blow behind it** — the hypothetical the defect is about.
 *
 * Written here rather than through `freezePair` deliberately: `freezePair` is combat's entry point
 * and drags a combat state along with it, which is precisely the accident that kept step 12 quiet.
 * The deadline shape is `hitstop.ts`'s (`tickCount <= until`), so this is the same freeze the sim
 * produces, minus the state.
 *
 * ⚠️ The count is NOT asserted here and the callers do not assume one. `freezePair` arms at step 9b,
 * *inside* a tick that has already moved — so its `tickCount + N` buys exactly `N` frozen ticks.
 * Called from outside a tick, as here, the same arithmetic buys `N + 1`. The loops below therefore
 * run `while (frozen(...))` and assert the count they observed was non-zero, which is the honest
 * form of the question and cannot drift with the arming convention.
 */
function freezeLocomotion(world: World, n: number): void {
  world.player.hitstopUntil = world.tickCount + n;
  world.player.lastHitTick = world.tickCount;
}

const running = (): InputSnapshot => {
  const input = createSnapshot();
  input.right = true;
  return input;
};

describe('step 12 — the stride counter does not advance inside a freeze', () => {
  it('fires NO footstep from a motionless body, and resumes the cadence afterwards', () => {
    const world = runningWorld();
    const input = running();
    const player = world.player;

    // Run until a footstep is due on the VERY NEXT tick. Timing it this way is what makes the
    // frozen assertion sharp rather than probabilistic: unfixed, tick 1 of the freeze emits.
    let footstepsBefore = 0;
    let armed = false;
    for (let i = 0; i < 600 && !armed; i += 1) {
      if (tick(world, input).footstep) {
        footstepsBefore += 1;
      }
      // A footstep must already have FIRED — otherwise the loop stops on the first approach to the
      // threshold, before `advanceStride` has ever returned true, and the premise below is a lie.
      armed =
        footstepsBefore > 0 &&
        player.state === 'run' &&
        player.strideCounter === FOOTSTEP_TICKS.run - 1;
    }

    // Premises, all three, or every assertion below is satisfied by a fixture that never ran.
    expect(armed, 'the fixture never reached a run with a footstep one tick away').toBe(true);
    expect(footstepsBefore, 'no footstep ever fired — advanceStride is doing nothing').toBeGreaterThan(0);
    expect(player.grounded).toBe(true);
    expect(player.vx, 'a frozen body with vx 0 makes the whole freeze vacuous').not.toBe(0);

    const strideAtFreeze = player.strideCounter;
    const xAtFreeze = player.x;
    freezeLocomotion(world, HITSTOP_TICKS.lethal);

    let frozenTicks = 0;
    while (frozen(player, world.tickCount)) {
      frozenTicks += 1;
      const events = tick(world, input);
      expect(events.footstep, `a footstep fired from a motionless body on frozen tick ${frozenTicks}`).toBe(
        false,
      );
      expect(player.strideCounter, `the stride counter advanced on frozen tick ${frozenTicks}`).toBe(
        strideAtFreeze,
      );
    }
    expect(frozenTicks, 'nothing was frozen — the whole loop above ran zero times').toBeGreaterThan(0);

    // The body really did not move — the other half of "motionless", and the thing that makes a
    // footstep during it absurd rather than merely early.
    expect(player.x, 'the freeze did not hold the body still').toBe(xAtFreeze);

    // 🔴 A HOLD, not a reset — and this is the assertion the fix is actually about. The counter was
    // one tick short of a footstep when the freeze began, so the first tick after it must fire.
    // Unfixed, `advanceStride` ran against the `fall` gait the freeze produces (see the header),
    // zeroed the stride, and the cadence restarted from 0 after every freeze.
    expect(tick(world, input).footstep, 'the cadence never resumed after the freeze').toBe(true);
    expect(player.state, 'the fixture stopped running, so the resume above proves nothing').toBe('run');
  });
});

describe('step 9d — the goal run-in does not bank ticks inside a freeze', () => {
  it('holds goalEntryTicks while frozen, and advances on either side of it', () => {
    const world = makeWorld();
    runToGate(world);
    const player = world.player;

    // Three unfrozen ticks first: the counter must be demonstrably alive before it is held.
    const held = neutral();
    held.right = true;
    for (let i = 0; i < 3; i += 1) {
      tick(world, held);
    }
    const banked = world.goalEntryTicks;
    expect(banked, 'the sequence cancelled before the freeze — wrong fixture, not a pass').toBeGreaterThan(0);
    expect(banked!, 'the counter matured early; the freeze below would be inside a completion').toBeLessThan(
      GOAL_ENTRY_TICKS - HITSTOP_TICKS.lethal - 1,
    );
    expect(player.grounded).toBe(true);

    const xAtFreeze = player.x;
    freezeLocomotion(world, HITSTOP_TICKS.lethal);
    let frozenTicks = 0;
    while (frozen(player, world.tickCount)) {
      frozenTicks += 1;
      tick(world, held);
      expect(
        world.goalEntryTicks,
        `the run-in banked a tick from a standing body on frozen tick ${frozenTicks}`,
      ).toBe(banked);
    }
    expect(frozenTicks, 'nothing was frozen — the whole loop above ran zero times').toBeGreaterThan(0);

    // Standing still is the premise, not an assumption: a body that walked in during the freeze
    // would have earned those ticks.
    expect(player.x, 'the freeze did not hold the body still').toBe(xAtFreeze);

    // And a HOLD again — the entry resumes rather than being cancelled by the freeze.
    tick(world, held);
    expect(world.goalEntryTicks, 'the run-in never resumed after the freeze').toBe(banked! + 1);
  });
});

describe('the freeze a player causes THEMSELVES', () => {
  it('an OUTGOING hit pauses the attacker’s own i-frames — stated behaviour, not an accident', () => {
    // 🔴 Codex implementation review, finding 3, verified by running it rather than taken on file
    // evidence, and KEPT rather than fixed — `stepCombat`'s header carries the ruling and why the
    // 27-tick actionable-invulnerable surplus is unchanged by it. What was missing is coverage: the
    // sibling above drives an incoming claw only, so the gate had never been asked about the freeze
    // a player causes themselves.
    const { world, scavenger } = clawedWhileIdle();
    const player = world.player;
    const input = createSnapshot();

    // Out of the hurt lock, still invulnerable: the surplus, reached the way the game reaches it.
    while (movementLocked(player)) {
      tick(world, { ...IDLE });
    }
    expect(invulnerable(player), 'the surplus is empty — there is nothing to pause').toBe(true);

    // Walk in and keep swinging — the claw's knockback pushed the player out of reach and the
    // creature patrols, so one press at a fixed distance is a fixture that misses on any retune. The
    // claw cannot confuse the result: a blow refused by i-frames does not freeze (`worldDamage.ts`
    // gates that `freezePair` on `hit`), so every freeze from here is the player's own.
    const hpBefore = scavenger.hp;
    for (let i = 0; i < 200 && scavenger.hp === hpBefore; i += 1) {
      input.right = scavenger.x > player.x;
      input.left = scavenger.x < player.x;
      latchAttackPress(input);
      tick(world, input);
    }
    expect(scavenger.hp, 'the outgoing swing never connected').toBeLessThan(hpBefore);
    expect(invulnerable(player), 'the i-frames lapsed before the hit — vacuous').toBe(true);
    expect(frozen(player, world.tickCount), 'the attacker was not frozen by its own blow').toBe(true);

    const held = player.iFrameCounter;
    let frozenTicks = 0;
    while (frozen(player, world.tickCount)) {
      tick(world, { ...IDLE });
      frozenTicks += 1;
      expect(player.iFrameCounter, `i-frames advanced on frozen tick ${frozenTicks}`).toBe(held);
    }
    // Non-vacuity both ways: the freeze was real, and the counter is not simply stuck.
    expect(frozenTicks, 'no frozen tick was observed').toBeGreaterThan(0);
    tick(world, { ...IDLE });
    expect(player.iFrameCounter, 'the counter never resumed — this is not a pause').toBe(held + 1);
  });
});
