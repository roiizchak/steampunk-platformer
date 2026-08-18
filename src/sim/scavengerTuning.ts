import { ENEMY_DEAD_ZONE } from './enemyGeometry';
import { TILE_SIZE } from '../game/constants';

/**
 * Ticks each drawn frame of `chase` is held for, and the art's measured foot travel across one.
 *
 * ## 🔴 These two numbers ARE the chase speed. Nothing else may set it.
 *
 * Planted feet require `ticksPerFrame × speed === footPxPerFrame` with a WHOLE `ticksPerFrame`
 * (`cadenceTicks` in `src/render/animTiming.ts` — a fractional dwell holds some frames longer than
 * others, which is the judder session 9 shipped a fix for). So the chase speed is not a free knob:
 * it is `18 / n`, and the only values that exist are **18, 9, 6 and 4.5**.
 *
 * `footPxPerFrame` is MEASURED off the shipped `chase.png`, not chosen — the derivation, the two
 * agreeing contact bands and the excluded foot-switch frames are recorded in
 * `character-bounds-rust-scavenger.json`'s `_footPxPerFrame`, which is the copy of record. This is
 * the mirror, because `src/sim/` may not read a file; `tests/unit/foot-plant.test.ts` keeps the two
 * honest.
 */
export const CHASE_TICKS_PER_FRAME = 3;
export const CHASE_FOOT_PX_PER_FRAME = 18;

/**
 * The rust-scavenger's tuning table — every number the creature's behaviour is expressed in.
 *
 * Split out of `enemyScavenger.ts` on 2026-08-18, when the adversarial gate-owner brief's fixes
 * pushed that file past the 400-line rule. A real seam rather than an arbitrary one: this is the
 * BALANCE surface, read by `createScavenger` as defaults and by the Gym as knobs, while what stays
 * behind is the behaviour those numbers drive. Each field's docstring is its own justification and
 * moved with it unchanged.
 */
/**
 * Scavenger defaults.
 *
 * ## 🔴 `chaseSpeed` 8 → 6, and it is a measurement now rather than a taste
 *
 * 8 px/tick was picked to sit between Phase 2's `walkMax` and `runMax`. It was never checked against
 * the art: at the shipped 2 ticks/frame the body advanced 16 px per drawn frame while the foot
 * travelled 18, so every step slipped, and the user reported it as *"when Scavenger is running fast,
 * the animation is not smooth like the character"* — the same defect the player's own locomotion had
 * until earlier the same session, on the one slug whose cadence nobody had measured.
 *
 * **6.0 = `CHASE_FOOT_PX_PER_FRAME / CHASE_TICKS_PER_FRAME`, and the slide goes to zero.** The
 * session decided *"three quarters of the run speed"*, which is 6.75 at `runMax` 9.0 — that value
 * does not exist under the plant invariant above, and 6.0 is the nearest reachable one below it.
 * Two thirds of the player's run, so the player can still gain ground by running. That matters more
 * now than it did, because a chase no longer ends (below).
 *
 * ## 🔴 `releaseRadius` is GONE. Aggro is permanent.
 *
 * `chaseSpeed` used to be documented as *"deliberately escapable"* and the 720 px `releaseRadius`
 * was the escape. **The user reversed that decision on 2026-08-14: *"it should keep coming until I
 * kill it"*.** Only death clears `chasing` now (`stepEnemies`), so there is exactly one exit and it
 * is the one the player has to earn. Recorded in `docs/qa/phase-05-combat.md` as a reversal, not
 * applied as a silent knob edit.
 *
 * The anti-flap machinery both went with it and neither is missed, because **a state with no exit
 * cannot flap.** Hysteresis existed so a player straddling the boundary could not toggle
 * patrol↔chase every tick; `CHASE_COMMIT_TICKS` was the floor under the same problem. With one
 * one-way transition the whole failure mode is unreachable by construction rather than by tuning,
 * which is the stronger version of the same guarantee. `enemy-ai.test.ts` still parks the player
 * exactly on the radius and still asserts no flap — the test outlives the mechanism.
 *
 * `deadZone` is one tile — a straddling player within it is closer than the chaser could close in one
 * tick anyway, so holding `facing` and `x` there costs nothing chase-wise and stops the sprite
 * strobing when the player is off-axis and unreachable (gate finding S1).
 *
 * ⚠️ It was the literal `96`, justified by a citation to a constant named GRID in
 * `src/game/constants.ts` — **which does not exist and never did**; the constant is `TILE_SIZE`. So
 * the one number two enemies were meant to share was a literal in one of them, defended by a symbol
 * that was not there. It is `ENEMY_DEAD_ZONE` now, derived and shared with the sentry, which had the
 * same rule in its docstring and none at all in its code (finding B5).
 *
 * An audit of all 20 `SYMBOL` in `path` citations across `src/`, `tools/gen/` and `tests/` found this
 * was the ONLY broken one — a slip, not a pattern. Recorded so nobody re-runs it.
 */
export const SCAVENGER = {
  patrolSpeed: 2.5,
  chaseSpeed: CHASE_FOOT_PX_PER_FRAME / CHASE_TICKS_PER_FRAME,
  detectRadius: 480,
  deadZone: ENEMY_DEAD_ZONE,
  damage: 15,
  /**
   * ⚠️ **`contactCooldown: 45` used to sit here and has been deleted.** It was read by nothing —
   * one grep hit across `src/`, `tests/` and `tools/`, its own declaration — while the scavenger's
   * real contact cadence is the shared i-frame window, `IFRAME_TICKS` in `src/sim/combat.ts`,
   * applied by `worldDamage.ts`. Two statements of one quantity, agreeing at 45 by coincidence,
   * sitting in the block a tuner reaches for first *(vault 5.3)*. Found by the criterion 5.3 gate
   * owner. Deleting it is the fix: a knob nobody reads is worse than no knob, because it invites
   * someone to turn it.
   */

  /**
   * How close the player must be before the scavenger commits to a swing.
   *
   * Wider than the body on purpose: the windup has to START before contact, or the telegraph is
   * invisible and the swing is indistinguishable from the walk-into-you damage it replaces. One and
   * a half tiles gives roughly a quarter-second of visible windup at chase speed.
   */
  attackRange: Math.round(TILE_SIZE * 1.5),

  /**
   * Ticks between the START of one swing and the earliest start of the next.
   *
   * Must exceed `SCAVENGER_ATTACK_TICKS`, and `createScavenger` throws if it does not — the same
   * rule, for the same reason, as `createSentry`'s cooldown guard (D7): a cooldown inside the
   * animation's own length means the window never closes and the sprite shows `attack` on every
   * tick. `72 - 36 = 36` ticks of visible recovery between swings.
   */
  attackCooldown: 72,
} as const;
