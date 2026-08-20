/**
 * Where the body is, relative to the exit — the two geometry predicates step 9d is built on.
 *
 * Split out of [`goal.ts`](./goal.ts) when that file crossed the 400-line rule, on the same
 * precedent `combat.ts` set with `combatTiming.ts`: the step's MACHINE and the step's GEOMETRY are
 * different subjects, and the machine is the one that keeps growing. Both are re-exported from
 * `goal.ts`, so every existing `from './goal'` keeps working and the dependency runs one way only —
 * `goal.ts` imports this, never the reverse.
 *
 * 🔴 The rule these two encode, and the whole point of the session that wrote them: **the gate's
 * edge is not the gate.** `overlapsGoal` ARMS the run-in and `containedInGoal` COMPLETES it, and
 * they are deliberately different questions.
 */

import { PLAYER_BOX } from './player';
import type { World } from './types';

/**
 * The player's box in world space, from the feet.
 *
 * ONE construction, shared by both predicates below. Same shape as the collider's and the
 * pickups' — `toWorld` in `player.ts` is the only other place that converts a LocalBox, and this
 * deliberately mirrors it rather than inventing a second half-width.
 */
export function playerBox(world: World): { left: number; right: number; top: number; bottom: number } {
  const { player, scale } = world;
  const halfW = (PLAYER_BOX.w * scale) / 2;
  return {
    left: player.x - halfW,
    right: player.x + halfW,
    top: player.y - PLAYER_BOX.h * scale,
    bottom: player.y,
  };
}

/**
 * Is the goal testable at all this tick?
 *
 * 🔴 Death wins ties.
 *
 * You do not finish a level by dying on the doorstep. `hp <= 0` rather than `state === 'death'`
 * alone, because the kill plane calls `killPlayer` and early-returns without necessarily having
 * entered the death state yet — the same two-routes-to-death asymmetry `playerDied`'s docstring
 * records.
 *
 * ⚠️ This guard is NOT sufficient on its own, and believing it was is the defect Codex's Phase 8
 * plan review caught. `respawnPlayer` runs at step 4c and restores `state: 'idle'` with full hp, so
 * on the respawn tick this test is already false. If the goal overlapped the spawn, dying anywhere
 * would complete the level. What actually prevents that is `describeGoalProblem` refusing a goal
 * that overlaps the standing spawn box — a data rule, not a runtime one, and the two are
 * load-bearing together rather than either alone.
 */
export function goalTestable(world: World): boolean {
  return world.goal !== null && world.player.hp > 0 && world.player.state !== 'death';
}

/**
 * Has the player's box TOUCHED the exit? This **arms** the run-in; it no longer completes anything.
 *
 * This is the rule that used to be called `reachedGoal` and used to end the level on its own. A
 * player whose right edge crossed `goal.x` by one pixel finished the level — so the character was
 * whisked away at the threshold and the 132 px of doorway behind it were never entered at all.
 * Demoted to a trigger, which is the whole point of the gate-entry session.
 *
 * It is also the CANCEL condition (see `stepGoalEntry`), which is why it keeps the death guard: a
 * player who dies mid-run-in stops overlapping by this definition, and that is what disarms them.
 */
export function overlapsGoal(world: World): boolean {
  const goal = world.goal;
  if (goal === null || !goalTestable(world)) {
    return false;
  }
  const b = playerBox(world);
  return b.left < goal.x + goal.w && b.right > goal.x && b.top < goal.y + goal.h && b.bottom > goal.y;
}

/**
 * Is the player's box FULLY INSIDE the exit? This is what completes the level.
 *
 * 🔴 **Inclusive on every edge, and that is not a rounding convenience — it is the only workable
 * rule here.** `PLAYER_BOX.h * scale` is 288, every shipped goal rect is exactly 288 tall, and each
 * one sits flush on its floor. So the vertical test is an exact equality at BOTH edges,
 * satisfiable only while the player stands on that floor. A strict `<` makes all five levels
 * uncompletable, and one pixel of air does the same thing temporarily.
 *
 * That razor edge is deliberate rather than tolerated. It is why the run-in drives the player
 * along the GROUND instead of teleporting them, and Codex's plan review confirmed independently
 * that ordinary grounded play reaches the equality reliably: `resolveCollisions` snaps `player.y`
 * to `solid.y`, and this game has no slopes and no moving platforms to drift it.
 *
 * ⚠️ Nothing validates the rect height at load time — `tiledGoal.ts` deliberately does not learn
 * this rule, because it is a consequence of the player's size rather than a property of level
 * data. `tests/unit/level-goal-fits.test.ts` is the gate that goes red the day someone authors a
 * 240 px exit, and it is the only one.
 */
export function containedInGoal(world: World): boolean {
  const goal = world.goal;
  if (goal === null || !goalTestable(world)) {
    return false;
  }
  const b = playerBox(world);
  return b.left >= goal.x && b.right <= goal.x + goal.w && b.top >= goal.y && b.bottom <= goal.y + goal.h;
}
