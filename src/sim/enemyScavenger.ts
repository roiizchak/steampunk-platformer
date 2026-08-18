import type { Rect } from './types';
import type { Sighting } from './enemies';
import { ENEMY_DEAD_ZONE, blockedAt, groundUnder, withinRadius } from './enemyGeometry';
import { TILE_SIZE } from '../game/constants';
import { SCAVENGER_ATTACK_TICKS, attackInProgress, maybeStartSwing } from './scavengerAttack';

/* ------------------------------------------------------------------ *
 * rust-scavenger — patrols, detects, then chases until it is killed.
 * ------------------------------------------------------------------ */

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

/**
 * The ground a chasing scavenger is allowed to walk on, and how wide the body needing it is.
 *
 * Built by `scavengerFooting` (`enemyPlacement.ts`) so `SCAVENGER_BOX` stays the ONE definition of
 * the body's width *(vault 5.3)*. `stepScavenger` takes it **required**, for the same reason
 * `createWorld`'s `scale` is required *(vault 2.11)*: a caller that forgot it would get a scavenger
 * pinned inside its patrol bounds, which is exactly the "it gets stuck" bug this change removes —
 * silently, and looking like the old behaviour.
 */
export interface ScavengerFooting {
  solids: readonly Rect[];
  /** Half the body's WORLD width. The leading edge is this far ahead of `scavenger.x`. */
  halfWidthPx: number;
  /**
   * The body's WORLD height, measured up from the feet — what `blockedAt` tests a wall against.
   *
   * Here rather than at the call site for the same reason `halfWidthPx` is: `SCAVENGER_BOX` stays
   * the ONE definition of the body *(vault 5.3)*. A second `40 * scale` written where the veto is
   * called is how a body ends up one height for walls and another for everything else.
   */
  heightPx: number;
}

export interface Scavenger {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed: number;
  chaseSpeed: number;
  detectRadius: number;
  deadZone: number;
  facing: 1 | -1;
  attackRange: number;
  attackCooldown: number;
  /** ONE flag (vault 5.1). */
  chasing: boolean;
  /** ONE counter (vault 5.1) — ticks spent in the current chase episode. */
  chaseCounter: number;
  /**
   * Did `x` actually change on the last `stepScavenger`? **A readback, not a second state axis.**
   *
   * It exists because the animation was reading the INTENT and not the MOTION. A chasing scavenger
   * that cannot move — held inside `deadZone`, or vetoed by the ledge probe — still returned `chase`
   * from `scavengerAnim`, so the art ran a 17.5 px/frame gait over zero px of travel. That violates
   * the foot-plant invariant by the whole stride, and because aggro is permanent it never ends: the
   * old release radius used to end it by accident.
   *
   * **Derived by comparing `x` across the step, deliberately, rather than written at each site that
   * declines to move.** Writing it at the commit site and both veto paths would mean *enumerating*
   * every way the body can fail to move; comparing the outcome covers all of them — including the
   * degenerate `patrolMin === patrolMax` pin that nobody had listed, and any veto added later.
   * One write cannot drift from the movement code; three can.
   *
   * ⚠️ **Not a second counter, and it must never become one.** It carries no memory: it is
   * recomputed from scratch every live tick, so no combination of `chasing`/`chaseCounter`/`moving`
   * is unrepresentable and vault 5.1's "one flag plus one counter" still describes this state.
   * `enemy-ai.test.ts` asserts exactly one field whose name ends in `Counter` — naming this
   * `movingCounter` would fail that, correctly.
   *
   * `true` before the first tick: there is no measured travel yet, and a patroller's default is
   * motion.
   */
  moving: boolean;
  hp: number;
  maxHp: number;
  /** The start tick of the swing that last connected, or `-1`. See `playerAttack.ts`. */
  lastHitSwing: number;
  /**
   * Ticks since this scavenger's last swing STARTED, saturating at `attackCooldown`.
   *
   * ## Why there is a second counter, when vault 5.1 says one
   *
   * 5.1's rule is about a state machine whose parts can contradict: two counters on the SAME axis
   * admit "chasing and patrolling", or neither — an unrepresentable state that still type-checks.
   * `attackCounter` is a **different axis**. A scavenger can legitimately be chasing *and* mid-swing,
   * and that combination is drawable: `scavengerAnim` resolves it by precedence, attack over gait.
   * Nothing here can contradict `chasing`.
   *
   * `enemy-ai.test.ts`'s shape guard was a bare `counters.length === 1`. It is a **named allowlist**
   * now, which is strictly stronger: a third counter still fails, and the two that exist had to be
   * written down to pass. Bumping a count to 2 would have been the loosening this project bans;
   * naming them is the reviewed version of the same change.
   *
   * ## The saturating shape is the sentry's, deliberately
   *
   * Identical to `Sentry.cooldownCounter`: it counts UP and stops at `attackCooldown`, a swing
   * begins by resetting it to 0, and `windowOpen(attackCounter, n)` reads the phase out of it. One
   * idiom for both enemies, so a reader who has understood the turret has understood this.
   *
   * Starts saturated, so a scavenger that spawns already touching the player can swing on its first
   * tick rather than granting a free `attackCooldown` of safety.
   */
  attackCounter: number;
}

export function detects(scavenger: Scavenger, at: Sighting): boolean {
  return withinRadius(scavenger.x, scavenger.y, at, scavenger.detectRadius);
}

/**
 * End a chase episode — the ONE way out, stated once *(vault 5.3)*.
 *
 * There are exactly two exits from permanent aggro and they must clear the same fields, or a
 * scavenger released by one route carries state the other route clears:
 *
 *   - **the scavenger's own death** (`stepEnemies`) — a corpse must not read as hunting;
 *   - **the player's death** (`tick`, step 4c) — decided by the user 2026-08-14 (D4).
 *
 * ⚠️ It deliberately does NOT touch `moving`. That is a readback of `x` recomputed every live tick,
 * so it has no stale value to clear — and `scavengerAnim` tests `hp <= 0` before it reads `moving`
 * at all. Clearing it here would be a second definition of a derived value.
 *
 * `facing` is left alone too: a released scavenger resumes its patrol from where it is pointing,
 * which is what the patrol turn at the bounds is for.
 */
export function releaseAggro(scavenger: Scavenger): void {
  scavenger.chasing = false;
  scavenger.chaseCounter = 0;
  /**
   * 🔴 Phase 5 finding **R5**, closed in Phase 6.
   *
   * A swing in progress is part of what aggro produced, so releasing aggro has to end it too.
   * Without this line a scavenger caught mid-windup when the player died carried the live strike
   * window through the respawn — recorded in Phase 5 as harmless *because `level-01`'s respawn
   * point is far away*, which is a fact about one level's geometry rather than about this code.
   *
   * ## Why `SCAVENGER_ATTACK_TICKS` and not `attackCooldown`
   *
   * It was `attackCooldown` — "idle and ready", the value `createScavenger` starts at — and both
   * code-reviewer briefs caught that this **refunds the entire cooldown**. `attackCounter` counts
   * up, a swing begins by resetting it to 0, and a new swing is gated on
   * `attackCounter >= attackCooldown`. So saturating it means a scavenger that had just swung is
   * *instantly re-armed* by the player dying, where before it had up to a full cooldown of grace.
   * That is a balance change smuggled inside a bug fix, and it points the wrong way — `tick.ts`
   * says plainly that each death must not leave the level harder than the last.
   *
   * `SCAVENGER_ATTACK_TICKS` is the end of the swing window and nothing more: it ends the strike
   * (`windowOpen` is false at exactly the window length) while leaving the cooldown to keep running
   * from there. `Math.max` so a scavenger already past the window is never wound *backwards*.
   *
   * R5 asked that the live strike window end. This ends it, and changes nothing else.
   */
  scavenger.attackCounter = Math.max(scavenger.attackCounter, SCAVENGER_ATTACK_TICKS);
}

/**
 * Would the step land the body on nothing? The LEADING edge is what is probed — see the call site.
 *
 * A two-line wrapper so the chase branch and the patrol branch ask their two questions in the same
 * shape, and so neither call site restates the offset arithmetic *(vault 2.10)*.
 */
function canStand(
  nextX: number,
  dir: 1 | -1,
  scavenger: Scavenger,
  footing: ScavengerFooting,
): boolean {
  return groundUnder(nextX + dir * footing.halfWidthPx, scavenger.y, footing.solids);
}

/** Would the step drive the body into a wall it was clear of? See `blockedAt` for the whole rule. */
function blocked(
  previousX: number,
  nextX: number,
  scavenger: Scavenger,
  footing: ScavengerFooting,
): boolean {
  return blockedAt(
    previousX,
    nextX,
    scavenger.y,
    footing.halfWidthPx,
    footing.heightPx,
    footing.solids,
  );
}

/**
 * One tick of scavenger behaviour.
 *
 * `footing` is required — see `ScavengerFooting`. **Both** movement paths consult it now, but for
 * different questions. The GROUND probe stays chase-only: a patrol beat is authored over floor a
 * designer already placed, and probing there would let a level's floor geometry silently override
 * the beat the `.tmj` declares. The WALL probe runs on both, because a wall standing on that floor
 * is not something the authored beat was ever checked against — and the user found a patroller and
 * a chaser walking through one alike.
 */
export function stepScavenger(scavenger: Scavenger, at: Sighting, footing: ScavengerFooting): void {
  // Read BEFORE anything below can move the body. `moving` is derived from the outcome rather than
  // written at each site that declines to move — see `Scavenger.moving` for why that is the whole
  // point and not a shortcut.
  const xBefore = scavenger.x;

  // ---- the swing, resolved BEFORE movement -------------------------------------------------
  //
  // Before, on purpose: a scavenger that commits to a swing this tick must not also travel this
  // tick, or the windup slides across the ground and the telegraph stops being a telegraph. The
  // ordering is the same argument step 4 makes about knockback reaching the same tick's movement.
  //
  // 🔴 Advance FIRST, then test. `advanceWindow` saturates at the cooldown, so the counter is a
  // phase for the whole swing and a "ready" flag once it tops out — one counter doing both jobs,
  // exactly as `Sentry.cooldownCounter` does. Advancing last would test this tick's phase against
  // last tick's counter and put the active window one tick out of step with the drawn frame.
  if (!scavenger.chasing) {
    if (detects(scavenger, at)) {
      scavenger.chasing = true;
      scavenger.chaseCounter = 0;
    }
  } else {
    // Permanent: nothing here can clear the flag. `stepEnemies` clears it on death, and that is the
    // only exit. The counter survives (vault 5.1's "one flag plus one counter") as the episode's
    // age, which is what makes a chase observable in a test without a second boolean.
    scavenger.chaseCounter += 1;
  }

  maybeStartSwing(scavenger, at);

  // 🔴 **A swing plants the feet — it does NOT blind the creature.**
  //
  // This guard wraps LOCOMOTION only, and deliberately sits after the detection block above. The
  // first version returned early instead, which also skipped `detects` and the `chaseCounter`
  // increment: a scavenger swinging at a player standing on top of it never acquired aggro at all,
  // because the attack short-circuited perception. `enemy-ai.test.ts`'s "never gives up" caught it
  // — the fixture puts the player at the scavenger's own x, which is inside `attackRange`.
  //
  // Skipping the block rather than returning also keeps **one write site for `moving`**, which is
  // the whole argument in that field's docstring: the readback below covers every way the body can
  // fail to move, including this one, without anyone enumerating them.
  if (attackInProgress(scavenger)) {
    // Planted. No branch here moves the body, so the readback at the end reports `moving: false`
    // and `scavengerAnim` draws the swing. Deliberately its OWN arm rather than a condition on the
    // two below: an `else` on the chase branch would let a swinging scavenger fall through to the
    // PATROL walk, which is how it would have shuffled sideways mid-attack.
  } else if (scavenger.chasing) {
    // Inside the dead zone the player is closer than the chaser could close in one tick anyway
    // (gate finding S1) — hold facing AND position, so an off-axis unreachable player (above, across
    // a gap) does not strobe the sprite by flipping `facing` every tick.
    if (Math.abs(at.playerX - scavenger.x) >= scavenger.deadZone) {
      const dir: 1 | -1 = at.playerX >= scavenger.x ? 1 : -1;
      // Facing is committed BEFORE the ledge test. A chaser stopped at the edge of its ledge must
      // still LOOK at the player it cannot reach — turning away would read as it having given up,
      // which is the exact impression this change exists to remove.
      scavenger.facing = dir;
      const nextX = scavenger.x + dir * scavenger.chaseSpeed;
      // 🔴 The LEADING EDGE of the body, not its centre. The body is `2 × halfWidthPx` wide (120 px
      // at `RENDER_SCALE` 6), so a centre probe walks half a scavenger out over the void before it
      // notices — found by the Codex plan review, finding 7. Enemies have no gravity, so what it
      // would do there is hang in the air rather than fall, which is worse than either.
      //
      // TWO vetoes, and they are different questions: `groundUnder` asks whether the step lands on
      // anything, `blockedAt` whether it lands INSIDE anything. The wall half is the user-reported
      // bug — a chaser used to cross a raised block's face because the only test here probed
      // downward. Facing is already committed above, so a held chaser keeps looking at the player.
      if (canStand(nextX, dir, scavenger, footing) && !blocked(scavenger.x, nextX, scavenger, footing)) {
        scavenger.x = nextX;
      }
    }
  } else {
    const nextX = scavenger.x + scavenger.facing * scavenger.patrolSpeed;
    if (blocked(scavenger.x, nextX, scavenger, footing)) {
      // 🔴 A wall is a bound the level did not declare, so it behaves like one: turn, do not
      // advance. The patrol path used to consult `solids` not at all, on the argument that a beat
      // is authored over ground the designer already checked — which is true of the FLOOR and says
      // nothing about what stands on it. Turning rather than stopping is what makes the recovery
      // test pass: a scavenger held against a wall forever is the same stuck creature by another
      // name.
      scavenger.facing = scavenger.facing === 1 ? -1 : 1;
    } else {
      scavenger.x = nextX;
      // Turn AT the bound, patrol-only: a chasing scavenger pinned at the bound must keep facing the
      // player, not the direction the patrol would have turned (gate finding S2).
      if (scavenger.x >= scavenger.patrolMax) {
        scavenger.facing = -1;
        scavenger.x = scavenger.patrolMax;
      } else if (scavenger.x <= scavenger.patrolMin) {
        scavenger.facing = 1;
        scavenger.x = scavenger.patrolMin;
      }
    }
  }

  // The readback. Every path above that fails to move the body — the dead zone, the ledge veto, a
  // patrol clamped at its bound, a degenerate `patrolMin === patrolMax`, and any veto added later —
  // lands here as `false` without this line having to know which one happened.
  scavenger.moving = scavenger.x !== xBefore;
}
