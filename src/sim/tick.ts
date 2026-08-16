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

import { consumeJumpPress } from './input';
import { PLAYER_BOX, resolveCollisions, resolveState, stepHorizontal, stepVertical } from './player';
import { deathWindowClosed, movementLocked, respawnPlayer, stepCombat } from './combat';
import { releaseAggro } from './enemies';
import { stepEnemies } from './enemyTurn';
import { clampToBounds } from './hazards';
import { collectGears } from './pickups';
import { applyPlayerAttack } from './playerAttack';
import { applyWorldDamage } from './worldDamage';
import { nextFloat } from './rng';
import type { AdvanceEvents, InputSnapshot, TickEvents, World } from './types';
import { advanceWindow, windowOpen } from './windows';

export { GREY_BOX_SOLIDS, createWorld } from './world';
export type { CreateWorldOptions } from './world';

export function noEvents(): TickEvents {
  return {
    jumped: false,
    landed: false,
    leftGround: false,
    attackStarted: false,
    hitActive: false,
    hitLanded: false,
    respawned: false,
    gearCollected: false,
  };
}

/**
 * Run exactly one simulation tick. Steps are numbered to match the contract above.
 *
 * Takes no delta and reads no clock. The caller decides how many ticks a frame is worth; this
 * function's behaviour cannot vary with frame rate, which is the entire reason vault 2.1 exists.
 */
export function tick(world: World, input: InputSnapshot): TickEvents {
  const events = noEvents();
  const { player, tuning } = world;

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

  const combat = stepCombat(player, input);
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
  const dir: -1 | 0 | 1 = hitstunLocked
    ? 0
    : input.left === input.right
      ? 0
      : input.right
        ? 1
        : -1;

  // 5. Horizontal.
  stepHorizontal(player, tuning, dir, input.walkHeld);

  // 6. Vertical.
  //
  //    Codex implementation review 5.14 (MAJOR): this ran unconditionally, before step 7's
  //    `hitstunLocked` gate even exists, so releasing jump during the hard lock still cut the
  //    player's own ascent — trajectory control inside a window that is supposed to mean "not
  //    being in control". Treat jump as held while locked so the cut branch in `stepVertical`
  //    (player.ts) can never see `!jumpHeld`. Gravity still runs — it is the same unconditional
  //    call — and `jumpCutPending` is untouched, so the cut is still available the instant the
  //    lock lifts, still rising and still holding: `hitstun-jump-cut.test.ts` pins that too.
  stepVertical(player, tuning, hitstunLocked || input.jumpHeld);

  // 7. Jump resolution. Both windows are tested BEFORE step 13 advances them, which is what makes
  //    the definition above true rather than one tick optimistic.
  //
  //    FIX 1 (QA gate, session 8): hitstun locked `dir` at step 5 but never gated a jump's
  //    EXECUTION here, so a jump pressed on the first locked tick fired anyway. `hitstunLocked` is
  //    ANDed into this condition only — the latch and buffer arming at steps 2-3 are untouched.
  //
  //    DECISION (b), not (a): a press made during the lock is consumed into the buffer exactly as
  //    always and stays alive there; it is not discarded. It fires the instant the lock lifts (or
  //    expires on its own by the ordinary `jumpBufferTicks` window, same as any other press made
  //    while "not yet able to jump"). This is consistent with how `grounded`/`coyoteOpen` already
  //    work — the buffer's own documented purpose is to remember a press and "fire the moment the
  //    player is next able to jump" (see the header's window definitions above), and hitstun is
  //    just one more reason the player is not yet able. Option (a) — clearing
  //    `ticksSinceJumpPressed` here to silently eat the press — was rejected: it would turn a
  //    forgiveness mechanic into a punishment for pressing jump at the wrong moment, which
  //    contradicts that documented purpose. Pinned by
  //    `tests/unit/player-combat.test.ts` — "a buffered press made during hitstun fires when the
  //    lock lifts, not discarded".
  const bufferOpen = windowOpen(player.ticksSinceJumpPressed, tuning.jumpBufferTicks);
  const coyoteOpen = windowOpen(player.ticksSinceGrounded, tuning.coyoteTicks);
  if (bufferOpen && !hitstunLocked && (player.grounded || coyoteOpen)) {
    player.vy = -tuning.jumpVelocity;
    player.jumpCutPending = true;
    player.grounded = false;
    // Close BOTH windows. Closing only the buffer would leave the coyote window open for a second
    // free jump; closing only coyote would let the buffered press fire again on landing.
    player.ticksSinceJumpPressed = tuning.jumpBufferTicks;
    player.ticksSinceGrounded = tuning.coyoteTicks;
    events.jumped = true;
  }

  // 8. Integrate — semi-implicit Euler, velocity already updated above, then position (vault 2.14).
  const previousX = player.x;
  const previousY = player.y;
  player.x += player.vx;
  player.y += player.vy;

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
  events.hitLanded = applyPlayerAttack(world) > 0;
  applyWorldDamage(world, previousX, previousY);

  // 9c. Pickups — gears the player's body crossed this tick. Beside 9b because it needs the same two
  //     endpoints of this tick's motion, and AFTER it so a tick that both hurts and rewards does
  //     both: damage swallowing a pickup is a silent loss the player reads as the pickup not
  //     working. See `pickups.ts` for why the count and the edge are kept from one number.
  const gearsTaken = collectGears(world, previousX, previousY);
  world.gearsCollected += gearsTaken;
  events.gearCollected = gearsTaken > 0;

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
  if (!coyoteArmedThisTick) {
    player.ticksSinceGrounded = advanceWindow(player.ticksSinceGrounded, tuning.coyoteTicks);
  }
  if (!events.landed) {
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
 * Run `ticks` simulation ticks against ONE snapshot, returning the OR-accumulated edges (vault 2.5).
 *
 * The accumulation is why this returns anything at all. A render frame can drain many ticks, so a
 * whole action can start and finish between two frames; a renderer that compared state across
 * frames would never see it. `ticks === 0` is a legal, meaningful call — a frame whose accumulator
 * did not reach a whole tick — and it must not consume the input snapshot.
 */
export function advance(world: World, input: InputSnapshot, ticks: number): AdvanceEvents {
  const total = noEvents();
  for (let i = 0; i < ticks; i += 1) {
    const events = tick(world, input);
    // 🔴 Every field, walked from the record itself — NOT three named assignments.
    //
    // It was three, and `TickEvents` had grown to seven. `attackStarted`, `hitActive`, `hitLanded`
    // and `respawned` were silently dropped on the way out of `advance()`, so `GameScene.update()`
    // — which is the only production caller — read `events.respawned` as **always false** and the
    // guard written to drop the interpolation snapshot on a respawn could never fire. Found by the
    // criterion 5.12 gate owner; the test named for the guard calls `tick()` directly, so it could
    // not see it.
    //
    // Adding a field to `TickEvents` and forgetting a line here is a mistake that compiles, passes
    // every unit test, and shows up as a rendering artifact. Iterating removes the chance to make
    // it: a new edge is accumulated the moment `noEvents()` declares it. `tick-events.test.ts`
    // asserts every declared field survives a batch, so this cannot regress to a named list.
    for (const key of Object.keys(total) as (keyof TickEvents)[]) {
      total[key] = total[key] || events[key];
    }
  }
  return total;
}

export { PLAYER_BOX };
