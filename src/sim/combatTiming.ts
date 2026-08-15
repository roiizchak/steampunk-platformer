/**
 * Combat timing — the numbers Phase 5's art is generated against.
 *
 * ## Read this before changing a number in this file
 *
 * `fps = renderFrames * TICK_HZ / simTicks` *(vault 4.22)*. Every combat sheet's frame rate is
 * derived from a duration below, so **changing one of these is a balance change that invalidates a
 * generated sheet** — not a refactor. Criterion 5.4b requires these frozen and recorded in
 * `docs/qa/phase-05-combat.md` before any clip is shot, because the alternative is what the vault
 * records: *every light attack had 0.43 s of art over a 0.25 s move, so the strike was never drawn.*
 *
 * ## Where this runs
 *
 * **Step 4 of the tick order** (`tick.ts`), which Phase 2 reserved and left empty for exactly this.
 * Step 4 is before integration on purpose, so knockback written here reaches the *same* tick's
 * movement rather than landing a tick late — and vault 2.11 forbids papering over that in the
 * render layer.
 *
 * Step 4's own internals are ordered, because "all in step 4" does not say what happens when a
 * kill plane and an attack resolve on the same tick:
 *
 *   1. i-frame expiry      — first, so a hazard cannot re-trigger inside its own grace window
 *   2. attack windows      — who is swinging, and on which tick
 *   3. damage
 *   4. knockback           — after damage, so a lethal hit does not also shove a corpse
 *   5. death
 *
 * ⚠️ **World-geometry damage is NOT in this list, and used to be.** The kill plane, hazards,
 * projectiles and enemy contact resolve at step **9b**, after collision — see `tick.ts:21,40-46`,
 * which is the authority. A swept hazard test needs BOTH endpoints of this tick's motion, so it
 * cannot run before integration. This docstring listed it here as step-4 item 2 long after the code
 * moved, which is the "prose is not the authority" trap in the one file least allowed to carry it.
 * Found by the `voltagent-qa-sec:qa-expert` gate owner, session 7.
 *
 * ## The windows are not restated here
 *
 * `windowOpen` comes from `windows.ts`. Phase 2 shipped that rule three times and two copies had
 * drifted by one tick before Phase 5 found it *(vault 5.3, blocker)*. Combat does not get a fourth.
 */

import { windowOpen } from './windows';

/** A three-phase move. Every field is an integer count of 60 Hz ticks. */
export interface CombatTiming {
  /** Wind-up. Nothing registers. The player is committed from tick 0. */
  startup: number;
  /** The strike. The hitbox is live on exactly these ticks and no others. */
  active: number;
  /** Commitment tail. Nothing registers, and the player cannot act — this is the punish window. */
  recovery: number;
}

/**
 * The player's spanner swing: **20 ticks, 333 ms.**
 *
 * Chosen against Phase 2's existing feel rather than in the abstract. Airtime is 37 ticks, so a
 * whole swing is a little over half a jump — long enough to be a commitment you can be punished
 * for, short enough that it does not eat a platforming input. The 6-tick wind-up is the readable
 * part: at 96 px tiles and a 288 px character it is what tells an opponent the swing is coming.
 *
 * The 4-tick active window is deliberately the smallest of the three. A generous active window
 * hides bad alignment — if the art is a frame out and the window is 10 ticks wide, nobody notices,
 * and criterion 5.4c can pass on a sheet whose contact frame is simply wrong. A tight window makes
 * the art gate mean something.
 */
export const ATTACK: CombatTiming = { startup: 6, active: 4, recovery: 10 };

/**
 * Hitstun: **18 ticks, 300 ms** total. The label persists for the full 18, but only the first
 * `HURT_LOCK_TICKS` of that are "not being in control" — see `movementLocked` below. The remaining
 * 12 ticks are animation tail only: input is free, the pose is still `hurt`.
 */
export const HURT_TICKS = 18;

/**
 * Invulnerability after taking a hit: **45 ticks, 750 ms.**
 *
 * Deliberately longer than `HURT_TICKS`, and `combat.test.ts` pins that relationship. If i-frames
 * ended with hitstun, the player would become actionable and vulnerable on the same tick, so a
 * second contact could chain off the first with no counterplay — one mistake, unbounded punishment.
 * The 27-tick surplus is the window in which you can actually leave.
 */
export const IFRAME_TICKS = 45;

/** Death: **45 ticks, 750 ms** before the respawn, long enough for the death sheet to be seen. */
export const DEATH_TICKS = 45;

/**
 * Player health: **100**, so a damage number reads as a percentage without arithmetic.
 *
 * The sentry's 10 and the scavenger's 15 are then legible as "ten hits" and "about seven" — which
 * is the property that makes the enemy health bar's 2/100 case in criterion 5.7 a real number
 * rather than a contrived one.
 */
export const PLAYER_MAX_HP = 100;

/**
 * The animation clock runs one tick behind the sim.
 *
 * `play()` is called in the render pass that follows the tick which entered the state, so frame 0
 * is drawn one tick after the state began. Art alignment therefore budgets the wind-up at
 * `startup - PLAY_LAG_TICKS` ticks; spending the full `startup` puts the contact frame on the last
 * active tick instead of the first.
 *
 * Invisible to correct arithmetic — the sibling project found it only by tracing the sim's state
 * frame against `anims.currentFrame` live. It is a constant here so the art pipeline imports it
 * rather than rediscovering it.
 */
export const PLAY_LAG_TICKS = 1;

/** Total length of a move, in ticks. */
export function attackTotalTicks(timing: CombatTiming): number {
  return timing.startup + timing.active + timing.recovery;
}

/** Which phase of a move a counter is in. `done` means the move is over. */
export type AttackPhase = 'startup' | 'active' | 'recovery' | 'done';

/**
 * The phase for a given tick of the move.
 *
 * Boundaries are half-open — `[0, startup)` is wind-up, `[startup, startup + active)` is live — so
 * the phases tile the move exactly, with no tick belonging to two of them and none to neither.
 * `combat.test.ts` walks every tick of a whole swing rather than sampling, because a sampled check
 * passes while a boundary is off by one.
 */
export function attackPhase(counter: number, timing: CombatTiming): AttackPhase {
  if (!Number.isInteger(counter)) {
    throw new Error(`attackPhase: counter must be an integer tick count, got ${counter}`);
  }
  if (counter < 0 || counter >= attackTotalTicks(timing)) {
    return 'done';
  }
  if (windowOpen(counter, timing.startup)) {
    return 'startup';
  }
  if (windowOpen(counter - timing.startup, timing.active)) {
    return 'active';
  }
  return 'recovery';
}

/**
 * Is the hitbox live on this tick? **Criterion 5.5.**
 *
 * This is the one predicate the sim, the tests and the art gate all consult — the art's contact
 * frame is checked against *this*, never against a second copy of "which frames are the attack"
 * *(vault 5.3)*.
 */
export function hitWindowOpen(counter: number, timing: CombatTiming): boolean {
  return attackPhase(counter, timing) === 'active';
}
