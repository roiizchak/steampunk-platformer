/**
 * Step 9d — the player ENTERS the level's exit.
 *
 * Phase 8. Its own module for the same reason `worldDamage.ts` (9b) and `pickups.ts` (9c) are: the step
 * in `tick.ts` is three lines and a pointer, and the reasoning lives with the code that implements it.
 *
 * ## 🔴 What this step means CHANGED, and no number moved
 *
 * Phase 8 shipped it as *"the body overlapped the rect, so the level is over"* — a single
 * `reachedGoal` AABB test. Brushing the doorway's left edge by one pixel ended the level, so the
 * character was whisked away at the threshold and the 132 px of doorway behind it were never
 * entered at all. The gate-entry session replaced that with a scripted **run-in**:
 *
 * ```
 *   first overlap        -> ARM       the sim takes the controls; the player auto-runs to the centre
 *   each GROUNDED tick   -> ADVANCE   an integer counter; the render layer fades the body from it
 *   airborne             -> HOLD      the counter freezes, so nothing fades in mid-air
 *   left the rect, or hit -> CANCEL    back to null, controls returned, fully opaque again
 *   counter > 2x window  -> RELEASE   and LATCH, until the body leaves the rect
 *   counter >= GOAL_ENTRY_TICKS AND fully contained -> COMPLETE
 * ```
 *
 * The last three lines were not in the first version. Each was added because someone drove the sim
 * and watched it misbehave — a real knockback, a blocked doorway, and a jump on the arming tick. The
 * reasoning for each sits with its branch below.
 *
 * **Nothing was renumbered, inserted or lettered.** 9d already owned "the exit"; an exit you walk
 * into for twenty ticks is still the exit. Codex's plan review was asked directly whether widening
 * a step's meaning in place violates `tick.ts`'s contract in substance and ruled that it does not —
 * the guarantee is about numbering and ordering, and both are untouched. The obligation it named
 * was that the contract's own text describe the widened semantics accurately; `tick.ts`'s header
 * and this one both do.
 *
 * ## Why a LETTER and not step 10
 *
 * `tick.ts`'s header states it outright: renumbering that list is not a refactor, it is a balance
 * change to a phase that has already spent money on art, because Phase 5's animation frame rates are
 * derived as `renderFrames * TICK_HZ / simTicks` from windows that slot into those numbers. `9b` and
 * `9c` are both letters for that reason and this is the third.
 *
 * ## Why AFTER 9c
 *
 * A tick that collects the last gear and touches the exit should do both, and in that order — the
 * level-complete overlay reports a gear total, and a player who grabbed a gear on the way through the
 * door has collected it. Putting this before 9c would show them one fewer than they took.
 *
 * (That benefit is only real because of the freeze below. Without it the total on screen is whatever
 * `gearsCollected` happened to be when the scene read it, which is a different number.)
 *
 * ## Why it needs to be here at all, rather than in the scene
 *
 * ⚠️ The obvious argument is the wrong one. `World.spawn`'s docstring says the respawn had to live
 * inside `tick()` because the sim already owned death's START, so deciding its END outside would create
 * "a second place that decides when a death ends". **That argument does not transfer** — nothing in
 * `src/sim/` consumes `completed`, so there is no existing owner to split. Three real reasons:
 *
 *  1. **One definition of "the player is here."** The overlap uses the same `PLAYER_BOX`, the same
 *     `world.scale` and the same tick boundary as the collider and the pickups, so it cannot disagree
 *     with them. A scene-side overlap check is a second definition of the player's position — the class
 *     of defect `cameraRig.ts`'s shared predicates exist to prevent.
 *  2. **Criterion 8.1 needs "completable" proved for five levels as a UNIT test**, in milliseconds,
 *     with no Phaser. That is only possible if `tick()` is what decides completion.
 *  3. **The end of a level becomes frame-rate independent.** See the freeze.
 *
 * ## 🔴 THE FREEZE: a completed level is terminal, tested before step 1
 *
 * `tick()` returns `noEvents()` while `world.completed` is true. That guard is part of this feature, not
 * a tidying, and it is the correction Codex's plan review forced.
 *
 * `GameScene.update()` calls `advanceSplit` unconditionally, so without it the sim keeps running
 * through the level-complete fade, the overlay, and the wait for a keypress. All of this was reachable
 * behind a "LEVEL COMPLETE" banner:
 *
 *  - the player walks out of the goal, falls in a pit, hits the kill plane, and `deathWindowClosed`
 *    teleports them back to the spawn 45 ticks later;
 *  - `gearsCollected` keeps moving, so the total the overlay reports is whatever it happened to be when
 *    the scene read it — which destroys 9d's own stated reason for sitting after 9c;
 *  - the number of post-completion ticks varies with frame rate, because the number of ticks a frame
 *    drains does. That is the one property vault 2.1 exists to protect.
 *
 * **Before step 1 specifically**, so the RNG does not advance a frame-rate-dependent number of times
 * after the level ends — which would make a replay diverge from the run that recorded it, and is the
 * whole point of `tickRoll` being sampled exactly once per tick.
 *
 * It is also what makes `levelCompleted` fire exactly once **structurally**, rather than because
 * something remembered to latch a flag. There is no second tick in which it could fire again.
 *
 * ⚠️ **And `world.tickCount` stops with everything else**, which is worth saying out loud because it
 * is visible outside the sim: `window.__game.tick` stops advancing the moment a level is completed and
 * does not move again until the next level's world is built. Any e2e helper that waits on a number of
 * TICKS — `waitTicks` — therefore hangs on a completed level rather than timing out at a wrong value.
 * Wait on `completed`, or on the next level's `levelId`. This is a consequence of the freeze rather
 * than a separate decision, and it cost a spec an afternoon before it was written down.
 */

import { containedInGoal, overlapsGoal } from './goalGeometry';
import type { World } from './types';

export { containedInGoal, overlapsGoal } from './goalGeometry';

/**
 * How long the run-in takes, in ticks. **20 = one third of a second at 60 Hz.**
 *
 * Not a taste setting — it is chosen against the geometry so that the TICK COUNT, not the
 * distance, is what binds completion:
 *
 * ```
 *   body 132 wide, goal 192 wide          -> 60 px of horizontal slack, 30 each side
 *   first overlap   x > goal.x - 66
 *   full containment x >= goal.x + 66     -> 132 px of travel, ~15 ticks at runMax 9
 *   the gate centre  goal.x + 96          -> 162 px,           ~18 ticks
 * ```
 *
 * At 20 the counter is still short of its target when the body is already contained, so
 * `stepGoalEntry`'s completion test is decided by the counter on an ordinary approach. That is
 * what makes "assert which tick it completes on" a deterministic assertion rather than a race
 * between a counter and a distance — and it is why the tests in `goal-entry.test.ts` can name a
 * tick at all.
 *
 * It is also the fade's denominator: `playerView.goalEntryAlpha` divides by this, so alpha
 * reaches 0 on exactly the earliest tick completion can fire.
 */
export const GOAL_ENTRY_TICKS = 20;

/**
 * The auto-run's direction for THIS tick, or `0` when no run-in is running.
 *
 * Read by `tick.ts` where `dir` is decided — the same un-numbered block `hitstunLocked` uses, and
 * for the reason stated there. It is not a numbered step and adds none.
 *
 * **The dead zone is one tick's travel.** Without it a body moving `runMax` px/tick oscillates
 * around the centre forever, never settling, because `sign()` flips every time it crosses.
 *
 * ponytail: for the last few ticks of a fast entry the player then stands still while
 * `playerView` still says `run` — foot-slide, the thing this project hates. Accepted here and
 * recorded rather than hidden: alpha is <= 0.25 by that point and the character is inside a dark
 * opening. The upgrade path, if a playtest ever says it reads, is a deceleration ramp over the
 * last few ticks rather than a hard dead zone.
 */
export function goalEntryDir(world: World): -1 | 0 | 1 {
  const goal = world.goal;
  if (world.goalEntryTicks === null || goal === null) {
    return 0;
  }
  const dx = goal.x + goal.w / 2 - world.player.x;
  if (Math.abs(dx) <= world.tuning.runMax) {
    return 0;
  }
  return dx > 0 ? 1 : -1;
}

/**
 * Step 9d — arm the run-in, advance it, cancel it, or complete the level. Returns `true` on the
 * one tick the level completes.
 *
 * ## Why 9d's MEANING widened, and why nothing was renumbered
 *
 * `tick.ts`'s header is the authority and it says renumbering is a balance change, not a refactor,
 * because Phase 5's animation frame rates are derived from windows that slot into those numbers.
 * Nothing here renumbers, inserts or letters anything. 9d already owned "the exit"; an exit you
 * walk into for twenty ticks is still the exit. The auto-run is not a step either — it overrides
 * the `dir` that step 5 already consumes.
 *
 * Codex's plan review was asked this directly and ruled it **not** a substantive violation: the
 * header's guarantee is about numbering and ordering, both untouched. The whole obligation is that
 * the header text describe the widened semantics accurately, which it now does.
 *
 * ## The one-tick offset, stated so nobody later calls it a bug
 *
 * Arming happens HERE, at 9d of tick N — step 5 has already run. So the first tick the player is
 * actually driven by the sequence is N+1, and the counter reads 0 through a tick in which the
 * player still moved under their own input. That is the same shape as the jump buffer's "able to
 * jump is the tick AFTER touchdown", and deliberate for the same reason: the test happens where
 * the information exists.
 *
 * ## Why completion is an AND, and not either half alone
 *
 *  - **`containedInGoal` alone** completes instantly for a player who drops straight down into the
 *    doorway — they are contained on the arming tick. That is a blink-out at the threshold, which
 *    is the exact defect this whole sequence exists to remove.
 *  - **the counter alone** completes a player who was stopped short of the door and never got in.
 *  - **both** give the fade its full window AND keep completion honest about where the body is.
 *
 * ## 🔴 THE CANCEL — the blocker Codex's plan review found
 *
 * One branch, covering two failures that look nothing alike:
 *
 *  1. **Death.** `respawnPlayer` runs at step 4c and puts the player back at `world.spawn`. It
 *     cannot know about a counter the WORLD owns, and nothing else was watching. Without this line
 *     the respawned player keeps the lock — auto-running from the spawn, unable to jump, across a
 *     level built to need jumps. **The exit becomes unreachable and the level unwinnable.** Level
 *     01 ships a scavenger patrol ending 96 px from its door and level 05 a sentry 384 px from
 *     its own, so this is the ordinary way a run ends badly, not a corner case.
 *  2. **Shoved out of the doorway mid-fade.** The player would keep fading while NOT inside —
 *     invisible outside the door, which is the one thing this feature exists to prevent.
 *
 * ## 🔴 And the second half of that was a lie until the gate's adversarial review measured it
 *
 * The cancel was written as `!overlapsGoal` alone, and the reasoning above claimed that covered a
 * knockback. **It does not, and the shortfall is not marginal.** Clearing the rect from the gate's
 * mouth takes `goal.w / 2 + BODY_W / 2` = **162 px** of travel. A real hit gives
 * `KNOCKBACK_SPEED` = 17.5 px/tick against a `goalEntryDir` that is already pulling the other way,
 * and the run drove the whole thing rather than computing it: the player moved **25.9 px**. The
 * counter never nulled, ran on to **25**, and the courier was drawn at **alpha 0 for five ticks
 * while its box straddled the gate's left edge** — exactly the state the paragraph above promises
 * cannot happen. Six earlier briefs and a Codex plan review all read that paragraph and none of
 * them checked the arithmetic under it.
 *
 * So the trigger is the HIT, not the geometry. `hurt` is the event the second bullet is actually
 * about, it fires reliably, and it fires on the tick the shove lands rather than 162 px later.
 * Being hit at the threshold now costs the entry, which is also the better game: the courier
 * snaps back to full opacity, takes the hit like anywhere else, and walks in again.
 *
 * `overlapsGoal` still carries the death half — it already refuses a dead player — and still
 * catches a body moved clear of the rect by anything else. Cancelling restores `null`, so
 * `playerView` returns them to full opacity on the very next frame and the sequence arms again
 * from zero. Gated from both directions in `goal-entry.test.ts`: it cancels, AND a cancelled run
 * still finishes the level on a second approach.
 */
/**
 * Is the body in no condition to be entering a doorway right now?
 *
 * ONE definition, read by both the arm branch and the cancel branch, because two statements of the
 * same condition is where they drift *(vault 5.3)* — and here they drifted immediately. The cancel
 * learned about `hurt` first and the arm did not, so a courier hit at the threshold cancelled at 9d,
 * re-armed at 9d of the very next tick, cancelled again, and **flickered null / 0 / null / 0 for the
 * whole hurt window**. Alpha happened to be 1 at a counter of 0, so nothing looked wrong on screen —
 * it was found by watching the counter in the running game, not by looking at the render. What it
 * cost was real though: `entryLocked` was true on every other tick, so the auto-run fought the
 * knockback on alternating ticks and hitstun was half-applied.
 *
 * `hurt` is checked BY NAME rather than through `movementLocked`, which opens and closes on
 * `HURT_LOCK_TICKS` — a shorter window than the state itself, so it would re-arm halfway through the
 * hurt animation while the courier is still being knocked around.
 *
 * `overlapsGoal` carries the death half already, and the geometry half: no goal, not touching it,
 * or dead.
 */
function entryBlocked(world: World): boolean {
  return !overlapsGoal(world) || world.player.state === 'hurt' || world.goalEntryBlocked;
}

export function stepGoalEntry(world: World): boolean {
  if (world.goal === null) {
    return false;
  }

  // The latch's only exit. Cleared BEFORE anything else reads it, so a body that left the rect and
  // came back is a fresh attempt on the tick it returns rather than one tick later. `overlapsGoal`
  // is false for a dead player too, so a respawn clears it as well — which is what makes the level
  // still winnable after the ceiling has fired.
  if (!overlapsGoal(world)) {
    world.goalEntryBlocked = false;
  }

  if (world.goalEntryTicks === null) {
    if (entryBlocked(world)) {
      return false;
    }
    // Armed, not advanced: this tick is the one the body arrived on, and the auto-run cannot
    // reach it — step 5 has already run. The counter starts moving next tick.
    world.goalEntryTicks = 0;
    return false;
  }

  if (entryBlocked(world)) {
    world.goalEntryTicks = null;
    return false;
  }

  /**
   * 🔴 **The counter only advances on the GROUND, and that is what makes an airborne entry honest.**
   *
   * Codex's implementation review found that the input lock cannot cover the tick the sequence arms
   * on: `entryLocked` is cached before step 1 and this runs at 9d, so step 7 has already accepted a
   * jump before anything knows. Two fixes were tried and measured before this one:
   *
   *  - **A position test at step 7.** Useless: the body has not been integrated yet, so on the
   *    arming tick it reads as outside the rect and blocks nothing. Reverted.
   *  - **Refusing to arm off the ground.** It worked, and it broke the shipped levels.
   *    `level-completable.test.ts`'s auto-player jumps when the ground ahead runs out, and on every
   *    level the floor ends just past the exit — so it hops at the threshold, and with arming
   *    refused it sailed over the doorway and finished the level unfinishable. Four seeds went red.
   *    That gate exists for exactly this, and the plan for this session said in as many words that a
   *    completability failure is a real defect and not a test to update. Reverted.
   *
   * Freezing the COUNTER instead keeps the steering and fixes the harm. The sequence still arms
   * mid-hop, so `goalEntryDir` still pulls the body toward the centre through the air and lands it
   * inside — which is how an airborne arrival ever completed. But the fade measures *walking in*,
   * and you do not walk through air: alpha stays at 1 until the feet are down, so the courier can
   * never be drawn faded — let alone invisible — while airborne and outside the door.
   *
   * It also cannot stall: `overlapsGoal` still gates the cancel above, and a body cannot stay
   * airborne indefinitely over a rect that sits flush on its floor.
   */
  if (!world.player.grounded) {
    return false;
  }

  world.goalEntryTicks += 1;

  /**
   * 🔴 THE CEILING. The sim refuses to stay locked forever, whatever the level data says.
   *
   * Completion is an AND, so a player who overlaps the rect but can NEVER be contained satisfies
   * neither half and nothing above releases them. The gate's checklist review drove it: one solid
   * placed inside the doorway, `right` held for 4000 ticks, and the sim reported
   * `counter=3938, completed=false, alive, grounded` — invisible, unable to jump, unable to steer,
   * the attack edge eaten every tick. **Waiting to be killed is the only exit**, and both level 01
   * and level 05 put an enemy near their door, so even that is luck.
   *
   * No shipped level can reach it — all five goal rects were probed and none contains a solid — so
   * this is a guard against level data, not a fix for a live defect. It lives HERE rather than in
   * another `level-goal-fits` assertion on purpose: a data gate protects the levels someone
   * remembered to check, and this protects every level there will ever be. `tiledGoal.ts`'s rules
   * are out of scope for this session and are deliberately not taught anything new.
   *
   * Twice the window, because one window is exactly what a clean entry needs and a shove that
   * costs a few ticks is ordinary. Cancelling restores full opacity and hands the controls back;
   * the player walks in again and it arms from zero.
   */
  if (world.goalEntryTicks > GOAL_ENTRY_TICKS * 2) {
    // 🔴 LATCH, not reset. Writing `null` alone released the body for exactly one tick: the arm
    // branch saw an overlapping player on the next one and started again from zero. Driven against a
    // blocked doorway that gave 3 free ticks in 120 — locked and invisible for ~41, in control for
    // 1, forever. `goalEntryBlocked` holds until the body leaves the rect, which is cleared at the
    // top of this function and is the only event that makes a fresh attempt mean anything.
    world.goalEntryTicks = null;
    world.goalEntryBlocked = true;
    return false;
  }

  return world.goalEntryTicks >= GOAL_ENTRY_TICKS && containedInGoal(world);
}
