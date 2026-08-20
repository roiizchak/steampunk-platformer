/**
 * **Steps 5, 6, 7 and 8 of the tick order** — the player's own motion, and the hit-stop gate on it.
 *
 * ⚠️ **This file holds four NUMBERED steps, which no previous extraction did.** `enemyTurn.ts` and
 * `worldDamage.ts` each hold one lettered sub-step; `advanceSplit.ts` holds `advance`, and
 * `tick.ts`'s closing note on that export is explicit that it was extracted precisely because it is
 * *"not part of the numbered order above"* — it is a LOOP over it. So none of the three is precedent
 * for this one, and saying otherwise would be the kind of comfortable citation that lets a contract
 * drift. (Cited by symbol, not by line: the first draft of this paragraph pointed at `tick.ts:425`
 * and the same commit moved that note to 391.)
 *
 * What is true is the thing that matters: **the block moved, the numbering did not.** Steps 5–8 keep
 * their numbers, their order, and every word of the reasoning that was written against them —
 * `tick.ts` still reads as fourteen numbered steps, with one-line markers pointing here. Renumbering
 * would be a balance change to a phase that has already spent money on art (vault 2.2); relocating
 * a block that carries its own numbers is not, and this paragraph exists so the next reader can tell
 * which of the two happened.
 *
 * ## The hit-stop gate is ONE early return, and it is the whole feature on the player's side
 *
 * Four steps freeze together or the freeze is a bug: skipping 5 and 6 but not 8 integrates a stale
 * velocity, and skipping 8 but not 7 lets a jump fire out of a frozen body. `frozen()` is asked
 * once, here, and nothing downstream re-derives it *(vault 5.3)*.
 *
 * **Step 8 is inside the gate.** It is the one that would otherwise make every freeze fixture
 * vacuous *and* correct-looking: a body struck from a standing start has `vx === 0`, so an ungated
 * `x += vx` leaves `x` unchanged and the freeze appears to work until the day someone lands a hit
 * at a run.
 *
 * **`previousX`/`previousY` are captured BEFORE the gate**, so steps 9, 9b and 9c still receive both
 * endpoints of "this tick's motion". While frozen the two are equal, which is exactly right: the
 * swept hazard test then sweeps a zero-length segment, and a frozen body cannot tunnel through
 * anything it was not already touching.
 */

import { stepHorizontal, stepVertical } from './player';
import { frozen } from './hitstop';
import type { InputSnapshot, TickEvents, World } from './types';
import { windowOpen } from './windows';

/** The two locks `tick.ts` cached before step 5, passed in rather than re-derived here *(5.3)*. */
export interface MotionLocks {
  /** This tick's movement direction, already resolved against hitstun and the gate's run-in. */
  dir: -1 | 0 | 1;
  hitstunLocked: boolean;
  entryLocked: boolean;
}

/** Where the body was before this tick moved it — step 9, 9b and 9c all need both endpoints. */
export interface PlayerMotion {
  previousX: number;
  previousY: number;
  /**
   * Did steps 5-8 actually run, or did hit-stop skip all four?
   *
   * Returned rather than re-derived, and **step 13 must use THIS and not `frozen(player,
   * tickCount)`** *(vault 5.3)*. The two disagree on exactly one tick and it is the important one:
   * a freeze armed at 9b of tick `T` makes `frozen()` true for the rest of `T`, but step 7 already
   * ran on `T`, so a window that skipped its advance there would be one tick more generous than
   * step 13's own rule allows. This answers the question step 13 actually asks.
   */
  ran: boolean;
}

/**
 * Run steps 5–8 for the player, or skip all four because the body is in hit-stop.
 *
 * `events.jumped` is written here rather than returned, because step 10 and step 13 both read it
 * from the same object and a second copy is a second thing to keep in step.
 */
export function stepPlayerMotion(
  world: World,
  input: InputSnapshot,
  locks: MotionLocks,
  events: TickEvents,
): PlayerMotion {
  const { player, tuning } = world;

  // Captured OUTSIDE the freeze gate — see the header. Equal endpoints are the correct description
  // of a body that did not move, not a degenerate case to special-case downstream.
  const previousX = player.x;
  const previousY = player.y;

  // 🔴 THE HIT-STOP GATE. Armed at step 9b of an earlier tick, tested here, and covering steps 5, 6,
  // 7 and 8 together. Everything else in the tick keeps running for this body — the seeded roll at
  // step 1, collision at 9, the state door at 11 — because a freeze is a pause on MOTION, not on the
  // simulation. See `hitstop.ts` for why it is a deadline rather than a window counter.
  if (frozen(player, world.tickCount)) {
    return { previousX, previousY, ran: false };
  }

  // 5. Horizontal. `walkHeld` forced FALSE under the run-in: it is a RUN into the doorway by
  //    definition, and a held walk modifier would otherwise halve the speed and double the window.
  stepHorizontal(player, tuning, locks.dir, locks.entryLocked ? false : input.walkHeld);

  // 6. Vertical.
  //
  //    Codex implementation review 5.14 (MAJOR): this ran unconditionally, before step 7's
  //    `hitstunLocked` gate even exists, so releasing jump during the hard lock still cut the
  //    player's own ascent — trajectory control inside a window that is supposed to mean "not
  //    being in control". Treat jump as held while locked so the cut branch in `stepVertical`
  //    (player.ts) can never see `!jumpHeld`. Gravity still runs — it is the same unconditional
  //    call — and `jumpCutPending` is untouched, so the cut is still available the instant the
  //    lock lifts, still rising and still holding: `hitstun-jump-cut.test.ts` pins that too.
  stepVertical(player, tuning, locks.hitstunLocked || input.jumpHeld);

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
  //    player is next able to jump" (see `tick.ts`'s window definitions), and hitstun is just one
  //    more reason the player is not yet able. Option (a) — clearing `ticksSinceJumpPressed` here
  //    to silently eat the press — was rejected: it would turn a forgiveness mechanic into a
  //    punishment for pressing jump at the wrong moment, which contradicts that documented purpose.
  //    Pinned by `tests/unit/player-combat.test.ts` — "a buffered press made during hitstun fires
  //    when the lock lifts, not discarded".
  //
  //    ⚠️ A press made while FROZEN is treated the same way, and it takes TWO gates, not one. The
  //    buffer is armed at step 3, which the freeze deliberately does not gate — but arming a window
  //    the freeze then spends is worse than useless, and step 13 charged it for every frozen tick
  //    until Phase 9's fix round. A 9-tick `lethal` freeze saturated `jumpBufferTicks` 8 from inside
  //    itself, so the press was eaten and the jump never fired at all. Step 13 now skips its advance
  //    on any tick this function returned `ran: false` for, which is what makes the sentence above
  //    true rather than aspirational. Pinned by `hitstop-interactions.test.ts`, which asserts WHICH
  //    tick the jump fires on for a lethal freeze and keeps a light one as a passes-either-way
  //    control.
  const bufferOpen = windowOpen(player.ticksSinceJumpPressed, tuning.jumpBufferTicks);
  const coyoteOpen = windowOpen(player.ticksSinceGrounded, tuning.coyoteTicks);
  //    ⚠️ On the ARMING tick this lock is still false — `entryLocked` is cached before step 1 and 9d
  //    arms at the end of the tick — so a jump pressed exactly then does fire. Codex's implementation
  //    review raised it, and the fix is NOT here: a position test at step 7 reads the player's
  //    PRE-movement coordinates, so on the arming tick it reports "not in the doorway" and blocks
  //    nothing. Tried, measured, reverted. The sequence refuses to arm off the ground instead — see
  //    `stepGoalEntry` — which makes the hop harmless rather than forbidden.
  if (bufferOpen && !locks.hitstunLocked && !locks.entryLocked && (player.grounded || coyoteOpen)) {
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
  player.x += player.vx;
  player.y += player.vy;

  return { previousX, previousY, ran: true };
}
