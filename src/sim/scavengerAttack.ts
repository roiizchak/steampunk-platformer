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

import { advanceWindow, windowOpen } from './windows';
import { hitWindowOpen } from './combat';
import type { CombatTiming } from './combat';
import type { Scavenger } from './enemyScavenger';
import type { Sighting } from './enemies';
import { withinRadius } from './enemyGeometry';

/**
 * The scavenger's swing, in the SAME struct the player's attack uses (`CombatTiming`) — one shape,
 * two consumers, so a reader who has understood one has understood both *(vault 5.3)*.
 *
 * ## Why the startup is more than twice the player's
 *
 * The player's `ATTACK` is `{ startup: 6, active: 4, recovery: 10 }`. The player already knows what
 * they pressed; an enemy's windup exists to be **read by someone who did not choose it**. 18 ticks
 * is ~300 ms of raised claw before anything can hurt you, which is what turns "I got hit" into "I
 * should have moved".
 *
 * ## This is a BALANCE CHANGE, and it is meant to be
 *
 * Contact damage was the spec: `worldDamage.ts` hurt the player on any overlap with a live
 * scavenger, gated only by the shared i-frame window. The player asked for a swing (2026-08-14), so
 * damage now requires the ACTIVE window *and* overlap. Two consequences, both intended:
 *
 *  - **The scavenger deals less damage.** A player who backs off during the 18-tick startup takes
 *    nothing at all. That is the point of a telegraph.
 *  - **Walking into a stationary scavenger is no longer instantly harmful** — it has to swing first.
 *
 * ⚠️ `36` is also the animation's tick budget, so it must stay a multiple of the sheet's frame
 * count: `one-shot-divisor.test.ts` requires `simTicks % frameCount === 0` for a non-looping row.
 * At 9 frames that is 4 ticks/frame, fps 15. Changing this number without changing the sheet is how
 * a one-shot starts dwelling unevenly.
 */
/**
 * 🔴 **`startup` 14 → 18, `recovery` 16 → 12 on 2026-08-15. The ART moved these, not a preference.**
 *
 * G5 — the gate that checks the drawn contact frame lands inside the damaging window — was run
 * against the shipped `rust-scavenger/attack` sheet for the first time and **failed**:
 *
 * ```
 * FAIL  rust-scavenger/attack  G5  frame 5 (tick 21) misses the active window [14, 20)
 *                                  — contact is drawn after the strike
 * ```
 *
 * The sheet is 9 frames over 36 ticks, 4 ticks each, and its furthest claw extension is **frame 5**
 * (ticks 20–23). The old window closed at 20. So the player took damage on ticks 14–19 and the claw
 * reached them on tick 21 — **hit first, drawn second.** Small, and exactly the mismatch this gate
 * exists to catch; it went unnoticed for a session only because `ATTACK_WINDOWS` had no row for this
 * slug, so G5 reported `N/A` and folded it into a passing exit code.
 *
 * The window is now **centred on the drawn strike**: `[18, 24)` against a contact tick of 21, three
 * ticks of margin either side instead of one tick outside. Total stays **36**, which is not optional
 * — the sheet's 9 frames must divide it (`one-shot-divisor`), and 36 is what `catalogTimings.mjs`
 * mirrors into the catalog's `simTicks`.
 *
 * What this changes for the player: the telegraph gets **longer** (18 ticks of windup against the
 * player's own 6, up from 14) and the recovery shorter. Backing off during the windup still costs
 * the scavenger the swing.
 */
export const SCAVENGER_ATTACK: CombatTiming = { startup: 18, active: 6, recovery: 12 };

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
  /**
   * 🔴 **`hitWindowOpen`, not a hand-written boundary.** This function used to read
   * `counter >= startup && counter < startup + active` inline — while the comment directly above
   * warned that *"two copies of `counter >= startup && counter < startup + active` would be two
   * definitions that happen to match today (vault 5.3)"*. It then wrote that expression, making
   * itself the second copy it names. `hitWindowOpen` (`combat.ts`) already exists and documents
   * itself as *"the one predicate the sim, the tests and the art gate all consult"* — the art gate
   * G5 checks the contact frame against IT, so a hand-rolled boundary here is precisely how the
   * drawn strike and the damaging tick drift apart while every test stays green.
   *
   * Found by the criterion 5.5 adversarial brief. Citing a rule in a docstring is not the same as
   * obeying it, and this file did the first while breaking the second in the next six lines.
   */
  return hitWindowOpen(scavenger.attackCounter, SCAVENGER_ATTACK);
}

/** Is the scavenger mid-swing at all — windup, strike or recovery? Drives the animation. */
export function attackInProgress(scavenger: Scavenger): boolean {
  return scavenger.hp > 0 && windowOpen(scavenger.attackCounter, SCAVENGER_ATTACK_TICKS);
}


/**
 * Advance the swing counter and, if this scavenger may start a NEW swing, start it.
 *
 * Lives here rather than inside `stepScavenger` for the reason this file exists: `enemyScavenger.ts`
 * is **the creature** and this is **the swing**. It also took that file back under the 400-line rule
 * without deleting any of the explanation the QA gate paid for — the split is the seam, not a trim.
 *
 * ⚠️ **Call order matters and is the caller's contract:** this must run AFTER the detection block,
 * because it requires `chasing` and a scavenger that acquires a reachable player should swing on the
 * SAME tick it sees them. Running it first leaves `chasing` false on the acquisition tick and the
 * creature stands and stares for a tick. Proved by mutation — swapping the two blocks fails
 * `scavenger-claw.test.ts`'s "DOES swing on the tick it acquires a reachable player".
 */
export function maybeStartSwing(scavenger: Scavenger, at: Sighting): void {
  if (scavenger.hp > 0) {
    scavenger.attackCounter = advanceWindow(scavenger.attackCounter, scavenger.attackCooldown);
    /**
     * 🔴 **`withinRadius`, not `Math.abs(dx)`** — and the difference is not pedantry.
     *
     * This was `Math.abs(at.playerX - scavenger.x) <= scavenger.attackRange`: a ONE-DIMENSIONAL
     * test with no `y` term, while every other perception in this file goes through the exported
     * 2-D `detects` → `withinRadius`. Two definitions of "can I reach the player", which is the
     * exact vault 5.3 item this phase's own checklist names — and it was a live defect, not a
     * theoretical one. Measured by the criterion 5.3 gate owner: **player 900 px straight up,
     * `dx = 0`, so `inRange` was true — 3 swings in 200 ticks, 108 of 200 ticks drawn as `attack`,
     * and the patrol travelled 50 px instead of 500** because a swing plants the feet. Reachable in
     * the shipped level: a solid at `x 6144–6720, y 1536` sits directly over the scavenger band at
     * `x 6528–7680`. Stand on that ledge and the creature below swings at the ceiling forever.
     *
     * 🔴 **Gated on `chasing`, and moved AFTER the detection block above.** It used to run first and
     * unconditionally, which quietly broke the documented AI off-switch: `detects`'s own docstring
     * calls `detectRadius: 0` *"the AI off-switch several combat fixtures rely on"*, and a scavenger
     * with detection off still swung and still dealt damage (`worldDamage.ts` gates on the claw, not
     * on aggro). Requiring `chasing` costs nothing in play — `detectRadius` 480 is more than three
     * times `attackRange` 144, so anything close enough to hit has already been seen — and it makes
     * the off-switch mean what it says.
     */
    const inRange =
      scavenger.chasing && withinRadius(scavenger.x, scavenger.y, at, scavenger.attackRange);
    // Saturated means fully recovered. A swing cannot interrupt itself, so this cannot re-arm
    // mid-window and hold the claw live forever.
    if (inRange && scavenger.attackCounter >= scavenger.attackCooldown) {
      scavenger.attackCounter = 0;
      /**
       * Commit to facing the player at the moment of the swing. Without this a scavenger that
       * walked past can strike backwards, which reads as a bug however correct the geometry is.
       *
       * 🔴 **Dead-zone guarded, like the chase site below.** This was the scavenger's SECOND
       * `facing` write and the only one without the guard — so an off-axis player straddling the
       * centre flipped the sprite here even though the chase arm refused to. Measured at the knob
       * floor `deadZone: 0`: **144 facing flips in 300 ticks**, about 29 mirror-flips a second.
       * `ENEMY_DEAD_ZONE`'s docstring is explicit that this class of defect *"has to be prevented
       * rather than detected"*, because `setFlipX` does not restart an animation and no frame-index
       * gate can see it happening. One guarded site and one unguarded site is exactly how a
       * prevented defect comes back.
       */
      if (Math.abs(at.playerX - scavenger.x) >= scavenger.deadZone) {
        scavenger.facing = at.playerX >= scavenger.x ? 1 : -1;
      }
    }
  }
}
