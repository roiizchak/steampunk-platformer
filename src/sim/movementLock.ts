/**
 * The three movement LOCKS — how long a hit takes the body away from the player, and the one tick of
 * friction a knockback impulse is exempt from.
 *
 * Split out of [`combat.ts`](./combat.ts) on 2026-08-20, when Phase 9's fix round carried that file
 * to 401 lines. The 400-line rule's stated order of preference is *"split the file or write the
 * justification, in that order"*, and this is the seam `combat.ts` itself already uses once:
 * `combatTiming.ts` holds the frozen numbers, this holds the locks derived from them, and
 * `combat.ts` holds the state machine. Everything here is re-exported from `combat.ts`, so every
 * existing `from './combat'` still resolves and no call site changes — the dependency runs one way
 * only: `combat.ts` imports this, never the reverse.
 *
 * It is a leaf on purpose. It imports `combatTiming.ts` and `windows.ts` and nothing else, which is
 * what keeps `player.ts` -> `combat.ts` -> here acyclic while `player.ts` consumes
 * `knockbackSettling` at step 5.
 *
 * **Not one line of explanation was moved out of the way to hit the number.** Every docstring below
 * arrived here whole, which is the distinction `file-size.test.ts`'s header draws between splitting
 * a file and gaming its gate.
 */

import type { PlayerSim } from './types';
import { windowOpen } from './windows';
import { ATTACK } from './combatTiming';

/**
 * How long hitstun locks movement: the knob is **6**, the same wind-up `ATTACK.startup` already
 * spends being read as "the swing is coming". Reused deliberately rather than authoring an eighth
 * number — one measured constant, two consumers.
 *
 * ⚠️ **The knob is 6; the observed lock is FIVE ticks.** `hurt` is armed at step 9b and read at
 * step 5 of the next tick, so its `counter === 0` is never seen. `movementLocked`'s docstring
 * derives this in full — read it before changing either number.
 *
 * The rest of `HURT_TICKS` is animation only: the `hurt` label and pose persist for all 18 ticks,
 * but the player is free to move again after the lock, and the attack edge stays blocked for the
 * whole 18 by `canAct`. **Three different windows, three different lengths — do not conflate them.**
 */
export const HURT_LOCK_TICKS = ATTACK.startup;

/**
 * Is movement locked this tick? Grounded or airborne alike. Mirrors `canAct`'s shape — one
 * predicate, imported at the call site, never restated *(vault 5.3)*.
 *
 * ## The lock is FIVE ticks, not six, and that is not a bug — state it rather than round it
 *
 * `HURT_LOCK_TICKS` is 6 and `windowOpen` accepts `0 … 5`, so a naive reading says six locked
 * ticks. It is five, and the reason is the same one the tick contract's header exists to state:
 * **where in the tick a window is ARMED decides how much of it a later step can see.**
 *
 * - `attack` is armed at **step 4b**, by `enterCombatState` inside `stepCombat`, and
 *   `hitWindowOpen` reads the counter later in that same call — so `counter === 0` **is** observed
 *   and `ATTACK.startup` spans **six** ticks.
 * - `hurt` is armed at **step 9b**, by `damagePlayer`, which is *after* step 4b has already run
 *   this tick. The `counter === 0` instant is therefore never read by `movementLocked`, which is
 *   called from step 5 of the *following* tick with the counter already advanced to 1. The lock
 *   spans counters `1 … 5`: **five ticks, 83 ms.**
 *
 * The two are not symmetric because damage and attack entry sit on opposite sides of step 4b —
 * exactly the shape of the buffered-jump asymmetry `tick.ts` documents. What the shared constant
 * buys is still the useful property: **the movement lock ends on precisely the tick an attack's
 * active frames would have begun.** One measured constant, two consumers, one stated asymmetry.
 *
 * ## 🔴 `death` locks too, and it did not until 2026-08-14
 *
 * This tested `hurt` alone, so **a corpse could still be walked around** — `canAct` blocks a dead
 * player from ATTACKING, and nothing blocked them from moving. It went unnoticed because death was
 * terminal: the state never ended, so nobody looked at what could be done inside it, and the
 * respawn tests were the first thing to hold a direction key while dead.
 *
 * There is no window on this half. Death is locked for as long as it lasts, which is what
 * `deathWindowClosed` and the respawn now bound. Friction still applies (step 5 sees `dir === 0`
 * rather than being skipped), so a body killed mid-run slides to a stop instead of stopping dead —
 * which is the behaviour a corpse should have and the one a hard velocity clear would lose.
 */
export function movementLocked(player: PlayerSim): boolean {
  if (player.state === 'death') {
    return true;
  }
  return player.state === 'hurt' && windowOpen(player.combatCounter, HURT_LOCK_TICKS);
}

/**
 * Is this the ONE tick a knockback impulse needs friction skipped, so it can actually move the
 * player? FIX 2.
 *
 * Knockback writes `player.vx` at step 9b of the hit tick. On the *next* tick, `movementLocked`
 * zeroes `dir`, so `stepHorizontal`'s `dir === 0` branch decelerates `vx` by `groundFriction`
 * (3.69) BEFORE step 8 integrates it — a 5.54 px/tick impulse moved the player under 2 px and was
 * gone.
 *
 * ## The `combatCounter === 1` clause is GONE (Phase 9) — as REDUNDANT, not as broken
 *
 * ⚠️ **The Phase 9 plan said hit-stop broke it. It does not, and the reason is the OTHER Phase 9
 * decision.** The clause identified "the first tick step 5 runs after the hit" by arithmetic: 9b sets
 * the counter to 0, 4b of the next tick advances it to 1, step 5 reads it. A freeze skipping 5-8
 * would break that — except 4b's counters freeze on the SAME `frozen(player, tickCount)`, in the
 * same tick, off a deadline only 9b writes, so the two can never disagree: the counter is still 0 on
 * every skipped tick and hits exactly 1 on the first tick step 5 runs again. **Verified, not
 * argued** — restoring the clause leaves the whole unit suite green. It goes because its
 * justification is gone and `knockbackPending` alone always sufficed: set only where
 * `applyKnockback` writes `vx`, cleared by `stepHorizontal` (`player.ts`) the one time it is
 * consumed — bounded by its own consumption rather than by a counter that now stops and starts.
 * Recorded rather than dressed up *(C11)*: **no test tells the two versions apart**, so nothing
 * pretends to gate the clause *(C2)*. What IS gated is what it was ever for —
 * `hitstop-interactions.test.ts` asserts the impulse arrives undecayed on the release tick, which
 * fails outright if the freeze stops covering step 5.
 *
 */
export function knockbackSettling(player: PlayerSim): boolean {
  return player.state === 'hurt' && player.knockbackPending;
}
