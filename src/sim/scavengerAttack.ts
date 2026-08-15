/**
 * The rust-scavenger's swing — its windows, and the two predicates everything else reads it through.
 *
 * ## Why this is its own file
 *
 * Split from `enemyScavenger.ts` on 2026-08-14, when adding the attack took that file to 439 lines,
 * past the 400-line rule. The seam is a real one rather than a line count: `enemyScavenger.ts` is
 * **the creature** — where it is, what it can see, whether it may step — and this is **the swing**,
 * a timing contract with no knowledge of terrain, patrol bounds or detection.
 *
 * ## One definition, three consumers
 *
 * `attackIsLive` decides what HURTS (`worldDamage.ts`, step 9b) and `attackInProgress` decides what
 * is DRAWN (`enemyView.ts`) and whether the body may travel (`stepScavenger`). Restating either as a
 * counter comparison at any of those sites would be two definitions that agree today *(vault 5.3)* —
 * and disagreeing about which tick a claw is live on is precisely the class of bug that is invisible
 * until someone reports being hit by an animation that had not started.
 */

import { windowOpen } from './windows';
import type { CombatTiming } from './combat';
import type { Scavenger } from './enemyScavenger';

/**
 * The scavenger's swing, in the SAME struct the player's attack uses (`CombatTiming`) — one shape,
 * two consumers, so a reader who has understood one has understood both *(vault 5.3)*.
 *
 * ## Why the startup is more than twice the player's
 *
 * The player's `ATTACK` is `{ startup: 6, active: 4, recovery: 10 }`. The player already knows what
 * they pressed; an enemy's windup exists to be **read by someone who did not choose it**. 14 ticks
 * is ~233 ms of raised claw before anything can hurt you, which is what turns "I got hit" into "I
 * should have moved".
 *
 * ## This is a BALANCE CHANGE, and it is meant to be
 *
 * Contact damage was the spec: `worldDamage.ts` hurt the player on any overlap with a live
 * scavenger, gated only by the shared i-frame window. The player asked for a swing (2026-08-14), so
 * damage now requires the ACTIVE window *and* overlap. Two consequences, both intended:
 *
 *  - **The scavenger deals less damage.** A player who backs off during the 14-tick startup takes
 *    nothing at all. That is the point of a telegraph.
 *  - **Walking into a stationary scavenger is no longer instantly harmful** — it has to swing first.
 *
 * ⚠️ `36` is also the animation's tick budget, so it must stay a multiple of the sheet's frame
 * count: `one-shot-divisor.test.ts` requires `simTicks % frameCount === 0` for a non-looping row.
 * At 9 frames that is 4 ticks/frame, fps 15. Changing this number without changing the sheet is how
 * a one-shot starts dwelling unevenly.
 */
export const SCAVENGER_ATTACK: CombatTiming = { startup: 14, active: 6, recovery: 16 };

/** The whole swing, windup through recovery. Mirrors `attackTotalTicks(ATTACK)` for the player. */
export const SCAVENGER_ATTACK_TICKS =
  SCAVENGER_ATTACK.startup + SCAVENGER_ATTACK.active + SCAVENGER_ATTACK.recovery;

/**
 * Is this scavenger's claw live THIS tick — the only window in which it can hurt anything.
 *
 * Exported because `worldDamage.ts` (step 9b) and `enemyView.ts` (the renderer) must agree on it
 * exactly, and two copies of `counter >= startup && counter < startup + active` would be two
 * definitions that happen to match today *(vault 5.3)*.
 */
export function attackIsLive(scavenger: Scavenger): boolean {
  if (scavenger.hp <= 0) return false;
  return (
    scavenger.attackCounter >= SCAVENGER_ATTACK.startup &&
    scavenger.attackCounter < SCAVENGER_ATTACK.startup + SCAVENGER_ATTACK.active
  );
}

/** Is the scavenger mid-swing at all — windup, strike or recovery? Drives the animation. */
export function attackInProgress(scavenger: Scavenger): boolean {
  return scavenger.hp > 0 && windowOpen(scavenger.attackCounter, SCAVENGER_ATTACK_TICKS);
}
