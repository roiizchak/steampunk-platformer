/**
 * Step 9d — the player reached the level's exit.
 *
 * Phase 8. Its own module for the same reason `worldDamage.ts` (9b) and `pickups.ts` (9c) are: the step
 * in `tick.ts` is three lines and a pointer, and the reasoning lives with the code that implements it.
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

import { PLAYER_BOX } from './player';
import type { World } from './types';

/**
 * Has the player entered the exit on this tick?
 *
 * Returns `false` and touches nothing when there is no goal, when the level is already complete, or
 * when the player is dead — see `tick.ts` step 9d for what each of those guards is for.
 */
export function reachedGoal(world: World): boolean {
  const { goal, player, scale } = world;
  if (goal === null) {
    return false;
  }

  /**
   * 🔴 Death wins ties.
   *
   * You do not finish a level by dying on the doorstep. `hp <= 0` rather than `state === 'death'`
   * alone, because the kill plane calls `killPlayer` and early-returns without necessarily having
   * entered the death state yet — the same two-routes-to-death asymmetry `playerDied`'s docstring
   * records.
   *
   * ⚠️ This guard is NOT sufficient on its own, and believing it was is the defect Codex's plan review
   * caught. `respawnPlayer` runs at step 4c and restores `state: 'idle'` with full hp, so on the
   * respawn tick this test is already false. If the goal overlapped the spawn, dying anywhere would
   * complete the level. What actually prevents that is `describeGoalProblem` refusing a goal that
   * overlaps the standing spawn box — a data rule, not a runtime one, and the two are load-bearing
   * together rather than either alone.
   */
  if (player.hp <= 0 || player.state === 'death') {
    return false;
  }

  // The player's box in world space, from the feet. Same construction as the collider's and the
  // pickups' — `toWorld` in `player.ts` is the only other place that converts a LocalBox, and this
  // deliberately mirrors it rather than inventing a second half-width.
  const halfW = (PLAYER_BOX.w * scale) / 2;
  const bodyH = PLAYER_BOX.h * scale;
  const left = player.x - halfW;
  const right = player.x + halfW;
  const top = player.y - bodyH;
  const bottom = player.y;

  return (
    left < goal.x + goal.w && right > goal.x && top < goal.y + goal.h && bottom > goal.y
  );
}
