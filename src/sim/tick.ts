/**
 * THE TICK STEP ORDER. This numbering is the contract, not an implementation detail (vault 2.2).
 *
 * A step order is invisible in a diff and is broken by refactors that read as tidying, so it is
 * written down here and the code below is a numbered list rather than a paragraph of arithmetic.
 * **Phase 5's combat timing is expressed against these numbers**, and Phase 5's animation frame
 * rates are derived as `renderFrames * TICK_HZ / simTicks` from windows that slot into them.
 * Renumbering later is not a refactor; it is a balance change to a phase that has already spent
 * money on art.
 *
 *   0.  A completed level is TERMINAL: return `noEvents()` and run no step at all  (Phase 8)
 *   1.  Sample the seeded RNG exactly once -> `world.tickRoll`     (2.3 — the only advance)
 *   2.  Consume input edges from the mutable working copy          (2.4 — cleared on consumption)
 *   3.  Arm the jump-buffer window if a press edge arrived
 *   4a. Enemies: AI decisions, projectile flight, sentries firing        (Phase 5)
 *   4b. Combat: i-frames, combat-state expiry, the attack edge, the live hitbox  (Phase 5)
 *   4c. Respawn: the death window has closed -> put the player back at `world.spawn`  (Phase 5)
 *   5.  Horizontal: accel / air-accel / friction, clamped to runMax
 *   6.  Vertical: gravity, fall clamp, early-release jump cut
 *   7.  Jump resolution: buffer open AND (grounded OR coyote open) -> impulse, close both
 *   8.  Integrate, semi-implicit Euler: v first, then position     (2.14)
 *   9.  Collide and resolve -> grounded, then clamp to the world's three solid edges
 *   9b. World-geometry damage: kill plane, hazards, projectiles, enemy contact  (Phase 5)
 *   9c. Pickups: gears the player's body crossed this tick                      (Phase 6)
 *   9d. The exit: arm / advance / cancel / complete the entry run-in   (Phase 8, widened)
 *   10. Window arming: left the ground this tick -> open coyote
 *   11. State transition, through the one door                     (2.6)
 *   12. Emit this tick's event edges                               (2.5)
 *   13. Advance every window counter — LAST, after every test of it
 *   14. tickCount++
 *
 * **Step 4 was reserved by number in Phase 2, before it had any content, and Phase 5 filled it
 * without moving anything.** Codex plan review F6: a hit window activated after integration cannot
 * affect the same tick's collision, and knockback written after step 8 lands a tick late. Since
 * vault 2.11 forbids scaling velocities, that offset cannot be papered over in the render layer.
 * Reserving the slot cost one comment; it saved renumbering a contract the art is now derived from.
 *
 * **Step 4's own internals are ordered too** (Phase 5 Codex plan review C6 — "all in step 4" does
 * not say what happens when a kill plane and an attack resolve on the same tick):
 * i-frame expiry, then combat-state expiry, then the attack edge, then the live hitbox. Damage from
 * world geometry — hazards, the kill plane, enemy contact — is applied by the CALLER around this,
 * because `combat.ts` deliberately imports no level data.
 *
 * **9b is lettered, not numbered, and that is deliberate.** The plan put world-geometry damage in
 * step 4. It cannot go there: a SWEPT hazard test needs both endpoints of this tick's motion, and
 * the second does not exist until step 8 has integrated. At step 4 contact could only be a point
 * sample — the exact tunnelling defect the swept test exists to prevent. A letter rather than a new
 * number because renumbering this list is a balance change to a phase that has spent money on art,
 * and because 9b genuinely is part of resolving where the body ended up. Full reasoning, and the
 * one-tick knockback delay it costs, in `worldDamage.ts`.
 *
 * **9c was INSERTED, not renumbered in** (Phase 6). It is a letter for the same reason 9b is: it
 * needs both endpoints of this tick's motion, and the list itself must not shift. It sits after 9b
 * so a tick that both hurts and rewards does both. See `pickups.ts`.
 *
 * **9d is the third letter** (Phase 8), after 9c so a tick that takes the last gear and steps through
 * the exit does both, in that order. A completed level is then **terminal** — `tick()` returns early
 * while `world.completed` is true, tested before step 1 so the seeded stream does not advance either.
 * `goal.ts` carries all of it: why the letter, why after 9c, why the freeze, and why the `World.spawn`
 * argument for the respawn is NOT the argument for this.
 *
 * **🔴 9d's MEANING WIDENED in the gate-entry session, and no step moved.** It was
 * `reachedGoal -> completed` — one overlap test. It is now `stepGoalEntry`: arm a run-in, advance
 * an integer counter, cancel it, or complete. Three existing steps NARROW as a consequence and
 * none is added — step 5 takes `dir` from `goalEntryDir` and a forced `walkHeld: false`, step 7's
 * jump gate gains `!entryLocked`, and the attack edge is consumed and discarded before 4b.
 * Nothing renumbered, inserted or lettered, so this header's balance-change hazard does not
 * apply; Codex's plan review was asked directly and agreed. **`goal.ts` carries all of it** — why
 * widening beat a new letter, the one-tick arming offset, and why the cancel is a blocker fix.
 *
 * **Step 0 is a NUMBER, and it is the one stated exception to the letter rule.** Codex's Phase 8
 * implementation review (finding #2) read the rule literally and was right to: the freeze is a branch
 * this file's own contract did not name, and an unnamed branch before step 1 is exactly what "the
 * numbering is the contract" exists to forbid. A letter was wrong for it. `9b`, `9c` and `9d` are
 * letters because each one INSERTS work between two existing steps and must not shift them; step 0
 * inserts nothing between anything — it runs BEFORE the list and, when it fires, replaces the whole
 * list. Nothing can be renumbered by a step that precedes number 1, so the reason letters exist does
 * not apply, and naming it `0` says what it does: no step ran. It is listed above with the others so
 * that reading the contract shows every branch a tick can take.
 *
 * **State moved from step 4 to step 11 after Codex implementation review I4.** Resolved before
 * integration, the state published each tick described the position of the PREVIOUS one: a jump's
 * first airborne tick still reported `idle`, and the landing tick still reported `fall`. Since
 * `playerView` picks its colour straight from `player.state`, that was visible on screen. Moved
 * after collision, the state and the position published in the same tick describe the same moment.
 * Phase 5 is unaffected: combat at step 4 gates on states combat itself owns (`attack`, `hurt`,
 * `death`), which persist across ticks, not on this tick's freshly derived movement state.
 * Renumbering was free HERE and only here — nothing depends on the contract yet, which is exactly
 * what the plan review asked to get right before Phase 5 does.
 *
 * **STEPS 5-8 MOVED to `playerMotion.ts` in Phase 9, and the numbering did not.** The block is
 * relocated whole, numbered comments and all, with one-line `5.` `6.` `7.` `8.` markers left at the
 * call site so reading this file still shows fourteen steps in order. **No prior extraction moved a
 * numbered step** — `enemyTurn.ts` and `worldDamage.ts` hold LETTERED sub-steps, and the note at the
 * foot of this file says plainly that `advance` was extracted because it is *"not part of the
 * numbered order above"*. This one is the first, so it is stated rather than justified by precedent.
 * It bought the 400-line rule and a home for the hit-stop gate, which must cover all four steps at
 * once or it is a bug. `playerMotion.ts`'s header carries the gate's reasoning.
 *
 * **THE WINDOW DEFINITIONS.** They are NOT one sentence. An earlier version of this header claimed
 * both windows behaved identically; the Codex implementation review (finding I1) showed that claim
 * was false, and the buffer tests could not have caught it because they asked "did a jump happen
 * afterwards" rather than "on which tick was it accepted". Both are now stated separately and
 * `coyote-time.test.ts` pins the exact accepting tick of each.
 *
 *   > **Coyote — `coyoteTicks = N`:** the jump is accepted on the `N` consecutive ticks starting
 *   > with the first tick after the player walks off a ledge. Offset `N - 1` accepts; offset `N`
 *   > does not. The ledge tick itself is not one of them, because step 7 had already run when
 *   > step 10 armed the window.
 *
 *   > **Buffer — `jumpBufferTicks = N`:** a press is remembered for `N` ticks starting with the
 *   > tick of the press itself, and fires the moment the player is next able to jump. **When the
 *   > player is airborne, "able to jump" is the tick AFTER touchdown, not the touchdown tick** —
 *   > step 7 tests `grounded`, which step 9 of the previous tick set. So a press up to `N - 1`
 *   > ticks before touchdown still jumps, one tick after landing.
 *
 * That one-tick delay is uniform, deliberate and 16 ms. It is the price of testing the jump before
 * integrating, which is what lets a jump take effect on the tick it is pressed. The alternative —
 * testing after collision — would delay every jump instead of only buffered ones.
 *
 * Windows are INCREMENTING counters tested `counter < knob`, not decrementing timers. Codex plan
 * review F5 found the original design: a timer armed at step 11 and decremented at step 2 burned a
 * tick inside its own arming tick, so a knob of `N` bought `N - 1` usable ticks — and because the
 * buffer was armed after the decrement and coyote before it, the two windows disagreed about their
 * own endpoints while reading the same knob. One mechanism, tested at both ends by
 * `tests/unit/coyote-time.test.ts`, is the fix.
 */

import { consumeAttackPress, consumeJumpPress } from './input';
import { PLAYER_BOX, advanceStride, resolveCollisions, resolveState } from './player';
import { deathWindowClosed, movementLocked, respawnPlayer, stepCombat } from './combat';
import { releaseAggro } from './enemies';
import { noEvents } from './events';
import { stepEnemies } from './enemyTurn';
import { goalEntryDir, stepGoalEntry } from './goal';
import { clampToBounds } from './hazards';
import { collectGears } from './pickups';
import { applyPlayerAttack } from './playerAttack';
import { stepPlayerMotion } from './playerMotion';
import { applyWorldDamage } from './worldDamage';
import { nextFloat } from './rng';
import type { InputSnapshot, TickEvents, World } from './types';
import { advanceWindow } from './windows';

export { GREY_BOX_SOLIDS, createWorld } from './world';
export type { CreateWorldOptions } from './world';

// `noEvents` moved to `events.ts` in Phase 8, beside the interface it constructs. Re-exported so every
// existing `import { noEvents } from './tick'` still resolves — the same shape `createWorld` uses.
export { noEvents };

/**
 * Run exactly one simulation tick. Steps are numbered to match the contract above.
 *
 * Takes no delta and reads no clock. The caller decides how many ticks a frame is worth; this
 * function's behaviour cannot vary with frame rate, which is the entire reason vault 2.1 exists.
 */
export function tick(world: World, input: InputSnapshot): TickEvents {
  // 0. 🔴 A COMPLETED LEVEL IS TERMINAL, and this sits BEFORE step 1 so the seeded stream does not
  //    advance either. Not an optimisation — without it the player can die behind the level-complete
  //    overlay and the gear total 9d exists to get right keeps moving. Full reasoning in `goal.ts`.
  if (world.completed) {
    return noEvents();
  }

  const events = noEvents();
  const { player, tuning } = world;

  // Is the gate's run-in driving the body? A cached read like `hitstunLocked`, not a step. Taken
  // here because 4b needs it and nothing before 9d writes `goalEntryTicks`.
  const entryLocked = world.goalEntryTicks !== null;

  // 1. Sample the seeded stream exactly once (vault 2.3). Consumers read `tickRoll`; they never
  //    pull from the stream, so the number of decisions a tick makes cannot change the sequence.
  world.tickRoll = nextFloat(world.rng);

  // 2. Consume input edges. Cleared HERE, by a tick taking it — never because a tick ran (2.4).
  const jumpPressed = consumeJumpPress(input);

  // 3. Arm the jump-buffer window.
  if (jumpPressed) {
    player.ticksSinceJumpPressed = 0;
  }

  // 4. Enemies, then combat — Phase 5 filled the slot Phase 2 reserved, without moving anything.
  //    Placed BEFORE integration on purpose so knockback reaches this tick's movement.
  //
  //    4a. Every enemy's turn and the shots in flight — `enemyTurn.ts`.
  //    4b. `stepCombat` owns combat's internal order: i-frames, state expiry, the attack edge, the
  //        live hitbox. World-geometry damage is NOT here — it is step 9b, because a swept test
  //        needs a position that does not exist yet. See `worldDamage.ts`.
  stepEnemies(world);

  //    🔴 The gate's run-in locks the swing, and the edge is still CONSUMED off the REAL snapshot.
  //    A spread clone would clear the CLONE and leave the real edge latched forever — the swing
  //    lands the instant the lock lifts, or on tick 1 of the next level. Vault 2.4 exactly, and a
  //    blocker in Codex's plan review before it was written.
  if (entryLocked) {
    consumeAttackPress(input);
  }

  const combat = stepCombat(player, input, world.tickCount);
  events.attackStarted = combat.attackStarted;
  events.hitActive = combat.hitActive;

  //    4c. The respawn. `death` is the one combat state `stepCombat` will not release, because
  //        releasing it into `idle` would let a corpse walk — so the decision is taken here, where
  //        the spawn point lives (`world.spawn`).
  //
  //        🔴 There was NO respawn anywhere in this project until 2026-08-14, and `death` did not
  //        even advance its own counter, so the state was terminal in both senses. `hazards.ts`
  //        recorded the missing respawn as deliberate Phase-4 debt — "bolting a respawn onto a game
  //        with no health model would have had to be undone here" — and Phase 5 built the health
  //        model without coming back for it. The player reported the result as *"I cannot die. It
  //        gets stuck before I actually see the kill"*, which is exactly what a terminal state with
  //        a `movementLocked` body looks like from the outside.
  //
  //        BEFORE step 5, not after: the respawned player is alive for the whole of this tick's
  //        movement, so the first frame after a death is an ordinary frame at the spawn point
  //        rather than a corpse's pose in a new position.
  //
  //        🔴 **The respawn also releases every chase.** Aggro is permanent by design — *"it should
  //        keep coming until I kill it"* — but nothing cleared it on death, so after dying every
  //        scavenger walked toward the NEW spawn and never patrolled again. Repeated deaths converge
  //        every scavenger in a level onto the spawn point, and each death leaves the level harder
  //        than the last: punishing rather than difficult. Decided by the user 2026-08-14 (D4), and
  //        it does not weaken what was asked for — within ONE life the scavenger still never gives
  //        up. The player's own death is the only new exit, and it is one they already paid for.
  //
  //        Invisible in play today because `level-01` places a single scavenger, which is exactly
  //        why it is gated in `respawn.test.ts` rather than left to a playtest that cannot see it.
  //
  //        This adds NO new numbered step. It sits inside the existing 4c block, so the 14-step
  //        contract above is untouched — renumbering it would be a balance change, not a refactor.
  if (deathWindowClosed(player)) {
    respawnPlayer(player, world.spawn, tuning);
    for (const scavenger of world.enemies.scavengers) {
      releaseAggro(scavenger);
    }
    events.respawned = true;
  }

  // `dir` and the jump gate below are both read here, AFTER step 4b, so `movementLocked` reads
  // this tick's post-advance `combatCounter` (W3) rather than last tick's. Neither is itself a
  // numbered step — only step 5 (which consumes `dir`) and step 7 (which consumes the gate) are —
  // so caching the read does not reorder or renumber the contract above.
  const hitstunLocked = movementLocked(player);
  // ⚠️ `entryLocked` is tested BEFORE `hitstunLocked`, so the run-in overrides hitstun's horizontal
  // lock rather than yielding to it. Deliberate — a courier who stopped dead halfway through its own
  // entry would strand the fade — and narrow: `stepGoalEntry` cancels the whole sequence on `hurt`
  // at 9d of the same tick the hit lands, so the override covers that one tick and nothing after it.
  // Called out because it is a Phase 5 combat rule bent by a Phase 8 feature, and both gate reviews
  // flagged that no header said so.
  const dir: -1 | 0 | 1 = entryLocked
    ? goalEntryDir(world)
    : hitstunLocked
      ? 0
      : input.left === input.right
        ? 0
        : input.right
          ? 1
          : -1;

  // 5. Horizontal — accel / air-accel / friction, clamped to runMax.
  // 6. Vertical — gravity, fall clamp, early-release jump cut.
  // 7. Jump resolution — buffer open AND (grounded OR coyote open) -> impulse, close both.
  // 8. Integrate, semi-implicit Euler: v first, then position (vault 2.14).
  //
  //    All four live in `playerMotion.ts`, moved there whole in Phase 9 — see this file's header:
  //    the BLOCK moved, the NUMBERING did not. That module also owns the hit-stop gate, which is one
  //    early return covering all four steps, and it captures `previousX`/`previousY` outside that
  //    gate so 9, 9b and 9c below still get both endpoints of this tick's motion.
  const { previousX, previousY, ran: motionRan } = stepPlayerMotion(
    world,
    input,
    { dir, hitstunLocked, entryLocked },
    events,
  );

  // 9. Collide and resolve — including the world's three solid edges, which are collision and not
  //    death. `clampToBounds` runs after the solids so a level's own geometry wins where the two
  //    overlap, and it zeroes vx as well as x (see `hazards.ts`).
  const wasGrounded = player.grounded;
  player.grounded = resolveCollisions(player, world.solids, world.scale, previousX, previousY);
  clampToBounds(player, world.bounds, (PLAYER_BOX.w / 2) * world.scale);

  // 9b. World-geometry damage — hazards, the kill plane, enemy contact and projectiles.
  //     Evaluated HERE and not at step 4, because a swept hazard test needs both endpoints of this
  //     tick's motion. `worldDamage.ts` carries the full reasoning and the price that buys.
  //     The player's own swing resolves FIRST, so a killing blow lands before the thing it killed
  //     can trade a hit back — see `playerAttack.ts`, which also records why that is ungated.
  const swing = applyPlayerAttack(world);
  events.hitLanded = swing.hits > 0;
  events.enemyKilled = swing.kills > 0;

  const damage = applyWorldDamage(world, previousX, previousY);
  events.playerHurt = damage.hurt;
  events.playerDied = damage.died;

  // 9c. Pickups — gears the player's body crossed this tick. Beside 9b because it needs the same two
  //     endpoints of this tick's motion, and AFTER it so a tick that both hurts and rewards does
  //     both: damage swallowing a pickup is a silent loss the player reads as the pickup not
  //     working. See `pickups.ts` for why the count and the edge are kept from one number.
  const gearsTaken = collectGears(world, previousX, previousY);
  world.gearsCollected += gearsTaken;
  events.gearCollected = gearsTaken > 0;

  // 9d. The exit — Phase 8, widened by the gate-entry session: arm / advance / cancel / complete,
  //     not one overlap test. A letter for the same reason 9b and 9c are, and AFTER 9c so a tick
  //     that takes the last gear and steps through the door does both, in that order. `goal.ts`
  //     carries all the reasoning — why completion belongs in the sim, why the `World.spawn`
  //     argument for the respawn is NOT the argument for this, and why the cancel is load-bearing.
  //     🔴 `motionRan` (Phase 9): a counter must not spend ticks inside a freeze — hold in `goal.ts`.
  if (stepGoalEntry(world, motionRan)) {
    world.completed = true;
    events.levelCompleted = true;
  }

  // 10. Window arming. Opening coyote requires having WALKED off — a jump closed the window at
  //     step 8 and must not reopen it here, or every jump would buy a second one in mid-air.
  let coyoteArmedThisTick = false;
  if (player.grounded) {
    player.ticksSinceGrounded = 0;
    coyoteArmedThisTick = true;
    if (!wasGrounded) {
      events.landed = true;
    }
  } else if (wasGrounded && !events.jumped) {
    player.ticksSinceGrounded = 0;
    coyoteArmedThisTick = true;
    events.leftGround = true;
  }

  // 11. State transition, through the one door (vault 2.6). AFTER collision, so the state and the
  //     position published in the same tick describe the same moment — see the header note on
  //     Codex review 2 finding I4.

  resolveState(player, dir !== 0 || player.vx !== 0, input.walkHeld, tuning);

  // 12. Emit edges (vault 2.5) — returned, never reconstructed by comparing state across frames.
  //
  //     The footstep is the only edge decided HERE rather than at the step that caused it, and it is
  //     not an exception to that rule: its cause IS the state step 11 just resolved. The cadence
  //     depends on whether this tick ended up `walk` or `run`, so it cannot be known any earlier.
  //     `advanceStride` lives beside `resolveState` in `player.ts` for the same reason.
  //     🔴 A FROZEN tick does not spend stride either (Phase 9): ungated this RESET the cadence on
  //     every frozen tick. `playerMotion.ts` has why, and why `motionRan` and not `frozen()`.
  events.footstep = motionRan ? advanceStride(player) : false;

  // 13. Advance every window counter, LAST, after every test of one.
  //
  //     ONE RULE, applied to both windows:
  //
  //       > A window does not spend a tick on which step 8 could not yet see the fact that tick
  //       > established.
  //
  //     Step 8 runs before step 10 resolves collisions, so it necessarily tests LAST tick's
  //     grounded flag. Two ticks are therefore not real chances to jump, and charging the window
  //     for them makes a knob of `N` behave like `N - 1`:
  //
  //       - the tick the player walks off a ledge — coyote is armed at step 11, after step 8 ran;
  //       - the tick the player touches down — the buffer was tested at step 8 while `grounded`
  //         was still false, so the buffered jump actually fires on the following tick.
  //
  //     Codex plan review F5 predicted the first and this implementation had it; `coyote-time.
  //     test.ts` then caught the second, which is the same defect mirrored. Both endpoints of
  //     both windows are asserted there against the live knob.
  //
  //     The `advanceWindow` call is the shared saturating increment from `windows.ts`; the guard in
  //     front of it — WHETHER this tick is spent at all — is the step-order rule above and stays
  //     here, with the numbered order that owns it.
  //     🔴 **A FROZEN tick is not spent either** (Phase 9): step 7 did not run at all. Ungated, a
  //     9-tick `lethal` freeze saturated both knobs from inside itself and ate the press. `motionRan`
  //     and NOT `frozen()` — `PlayerMotion.ran` says why they differ on the arming tick.
  if (!coyoteArmedThisTick && motionRan) {
    player.ticksSinceGrounded = advanceWindow(player.ticksSinceGrounded, tuning.coyoteTicks);
  }
  if (!events.landed && motionRan) {
    player.ticksSinceJumpPressed = advanceWindow(
      player.ticksSinceJumpPressed,
      tuning.jumpBufferTicks,
    );
  }

  // 14.
  world.tickCount += 1;

  return events;
}

/**
 * `advance` lives in `advanceSplit.ts` and is re-exported here.
 *
 * It is not part of the numbered order above — it is a LOOP over it — and this file was at exactly
 * 400 of its 400 lines, which is no headroom for the next person to add a step. The same split
 * `world.ts` took, for the same reason and with the same re-export so no caller changes.
 */
export { advance } from './advanceSplit';

export { PLAYER_BOX };
