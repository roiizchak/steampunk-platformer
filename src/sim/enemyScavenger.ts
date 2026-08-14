import type { Rect } from './types';
import type { Sighting } from './enemies';
import { groundUnder, withinRadius } from './enemyGeometry';

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
 * `deadZone` 96 px is one grid tile (`GRID` in `src/game/constants.ts`) — a straddling player within
 * it is closer than the chaser could close in one tick anyway, so holding `facing` and `x` there
 * costs nothing chase-wise and stops the sprite strobing when the player is off-axis and unreachable
 * (gate finding S1).
 */
export const SCAVENGER = {
  patrolSpeed: 2.5,
  chaseSpeed: CHASE_FOOT_PX_PER_FRAME / CHASE_TICKS_PER_FRAME,
  detectRadius: 480,
  deadZone: 96,
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
}

export interface ScavengerOptions {
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
  patrolSpeed?: number;
  chaseSpeed?: number;
  detectRadius?: number;
  deadZone?: number;
  hp?: number;
}

export function createScavenger(options: ScavengerOptions): Scavenger {
  const hp = options.hp ?? 60;
  return {
    x: options.x,
    y: options.y,
    patrolMin: options.patrolMin,
    patrolMax: options.patrolMax,
    patrolSpeed: options.patrolSpeed ?? SCAVENGER.patrolSpeed,
    chaseSpeed: options.chaseSpeed ?? SCAVENGER.chaseSpeed,
    detectRadius: options.detectRadius ?? SCAVENGER.detectRadius,
    deadZone: options.deadZone ?? SCAVENGER.deadZone,
    facing: 1,
    chasing: false,
    chaseCounter: 0,
    moving: true,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
  };
}

/**
 * Should this scavenger START chasing?
 *
 * One threshold now, asked only while it is NOT chasing — a chase has no geometric exit any more,
 * so there is no second radius for this predicate to be asymmetric about. It stays an exported
 * predicate rather than an inline inequality because the sim and the tests must consult the same
 * definition *(vault 5.3)*, and because `detectRadius = 0` is the AI off-switch several combat
 * fixtures rely on.
 */
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
}

/**
 * One tick of scavenger behaviour.
 *
 * `footing` is required — see `ScavengerFooting`. It is consulted on the CHASE path only: a patrol
 * stays inside authored bounds that a level designer already placed over ground, and probing there
 * would let a level's floor geometry silently override the beat the `.tmj` declares.
 */
export function stepScavenger(scavenger: Scavenger, at: Sighting, footing: ScavengerFooting): void {
  // Read BEFORE anything below can move the body. `moving` is derived from the outcome rather than
  // written at each site that declines to move — see `Scavenger.moving` for why that is the whole
  // point and not a shortcut.
  const xBefore = scavenger.x;

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

  if (scavenger.chasing) {
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
      if (groundUnder(nextX + dir * footing.halfWidthPx, scavenger.y, footing.solids)) {
        scavenger.x = nextX;
      }
    }
  } else {
    scavenger.x += scavenger.facing * scavenger.patrolSpeed;
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

  // The readback. Every path above that fails to move the body — the dead zone, the ledge veto, a
  // patrol clamped at its bound, a degenerate `patrolMin === patrolMax`, and any veto added later —
  // lands here as `false` without this line having to know which one happened.
  scavenger.moving = scavenger.x !== xBefore;
}
