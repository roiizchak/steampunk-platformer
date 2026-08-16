/**
 * The player: tuning knobs, the state machine, and the ONE conversion out of local box space.
 *
 * Vault items this file exists to satisfy:
 *  - **2.6** every state has exactly one door — `enterState()` is it.
 *  - **2.10** collision boxes are authored local, `+x` forward, `+y` up from the feet, with a
 *    single `toWorld`.
 *  - **2.11** `scale` is a required argument, validated `> 0`, applied to geometry only.
 *  - **A6** every knob in `DEFAULT_TUNING` is swept by `tests/unit/knob-sweep.test.ts`.
 *
 * The physics steps here are called by `tick.ts` in its numbered order. They are exported
 * separately rather than inlined so the step order is readable as a list at the call site — the
 * order is the contract, and a contract buried inside 200 lines of arithmetic is not one.
 */

import { isCombatState, knockbackSettling } from './combat';
import type { LocalBox, PlayerSim, PlayerState, Rect, TuningKnobs } from './types';
import {
  DEFAULT_TUNING,
  FOOTSTEP_TICKS,
  PLAYER_BOX,
} from './playerTuning';

// Re-exported so `from './player'` keeps working for every existing call site; the constants
// themselves moved to `playerTuning.ts` on 2026-08-15 (criterion 4.16 / 5.12).
export {
  DEFAULT_TUNING,
  FOOTSTEP_TICKS,
  FOOT_PX_PER_FRAME,
  LOCOMOTION_TICKS_PER_FRAME,
  PLAYER_BOX,
} from './playerTuning';
export function createTuning(): TuningKnobs {
  return { ...DEFAULT_TUNING };
}

/**
 * THE single conversion from local box space to world space (vault 2.10).
 *
 * Local space is `+x` forward and `+y` **up from the feet**; world space is `+y` **down** from the
 * top-left. Both flips happen here and nowhere else, which is the whole point: a second conversion
 * elsewhere is how a hitbox ends up mirrored on one axis only, and how art bottoms and collision
 * bottoms disagree — the defect Phase 3's ElementEditor exists because of.
 *
 * `facing` mirrors by reflecting the box's forward edge, so a box offset 4px ahead of centre ends
 * up 4px behind it, not 4px ahead on the other side.
 */
export function toWorld(
  box: LocalBox,
  feetX: number,
  feetY: number,
  facing: 1 | -1,
  scale: number,
): Rect {
  const w = box.w * scale;
  const h = box.h * scale;
  const forward = facing === 1 ? box.x : -(box.x + box.w);
  return {
    x: feetX + forward * scale,
    y: feetY - (box.y + box.h) * scale,
    w,
    h,
  };
}

/**
 * The one door into every state (vault 2.6).
 *
 * Right now the bookkeeping is trivial, which is exactly when to establish the funnel — Phase 5
 * adds `attack`, `hurt` and `death`, each of which must clear a hit-window id and reset an i-frame
 * counter on entry. A comment asking callers to remember that is not enforcement; a single
 * function they cannot bypass is.
 */
export function enterState(player: PlayerSim, next: PlayerState): void {
  if (player.state === next) {
    return;
  }
  player.state = next;
}

/**
 * Step 11 of the tick order: pick the state from the facts already established this tick.
 *
 * Derived, never assigned piecemeal from six places — which is how a state machine acquires a
 * transition nobody can find.
 *
 * **The walk branch tests the BODY, not the button.** `walkHeld` alone is not enough: with
 * direction released, friction takes several ticks to bring `vx` under `walkMax`, and publishing
 * `walk` during those ticks would play the walk animation at run speed. That is foot-slide arriving
 * through the state machine rather than through the art, and it is invisible to a steady-state test
 * (Codex plan review finding 8, case 2). Testing `|vx| <= walkMax` here makes the invariant a
 * tautology enforced at the one door, which is the only place it cannot be forgotten.
 */
export function resolveState(
  player: PlayerSim,
  movingHorizontally: boolean,
  walkHeld: boolean,
  tuning: TuningKnobs,
): void {
  /**
   * **Combat wins.** Step 4 owns `attack`, `hurt` and `death`; they persist across ticks and are
   * released by their own timer, not re-derived from the body.
   *
   * Without this, an `attack` entered at step 4 is overwritten here on the SAME tick — every tick —
   * so the swing is set and erased before anything can draw it, and a "did an attack happen"
   * assertion still passes. Found by the Phase 5 Codex plan review (C7); the predicate is imported
   * from `combat.ts` rather than restated as three string comparisons *(vault 5.3)*.
   *
   * Verified load-bearing: deleting these three lines fails six tests in `player-combat.test.ts`.
   */
  if (isCombatState(player.state)) {
    return;
  }
  if (!player.grounded) {
    enterState(player, player.vy < 0 ? 'jump' : 'fall');
    return;
  }
  if (!movingHorizontally) {
    enterState(player, 'idle');
    return;
  }
  const walking = walkHeld && Math.abs(player.vx) <= tuning.walkMax;
  enterState(player, walking ? 'walk' : 'run');
}

/**
 * Advance the stride counter and report whether a foot planted on this tick — Phase 7's cue.
 *
 * Called AFTER `resolveState`, because the cadence depends on which locomotion state the tick
 * actually resolved to. Lives here, beside that decision, rather than in `tick.ts`: the two are one
 * concept and splitting them is how the cadence and the drawn feet drift apart.
 *
 * The counter is zeroed whenever the feet are not planted and moving — airborne, idle, hurt, dead —
 * so a jump cannot carry half a stride into the landing, and a footstep never fires on the tick a
 * player touches down. That moment already has its own cue: `landed`.
 *
 * ## 🔴 Two things `state` alone could not tell this function, both measured
 *
 * **A state of `run` does not mean the player is moving.** `resolveState` takes
 * `movingHorizontally = dir !== 0 || vx !== 0`, so holding a direction into a wall keeps the state
 * at `run` after the collision has zeroed `vx`. The first version of this guard tested only
 * grounded-and-locomoting, and so played a footstep every fifteen ticks, indefinitely, for a player
 * standing still against a wall — 13 of them in 200 ticks when the gate owner measured it. `vx` is
 * therefore tested directly. It is exactly zero after a collision resolves, so this needs no
 * epsilon; `resolveState` keeps its own `dir !== 0` term, which exists for animation reasons that
 * have nothing to do with cadence.
 *
 * **`walk` and `run` are different cadences sharing one counter.** 24 ticks against 15, and the
 * counter used to carry across a change of gait — so releasing the walk modifier at a count of 20
 * fired instantly, because 20 already exceeds `run`'s threshold. On that same tick `playIfChanged`
 * restarts the sprite at frame 0, so the cue landed at the *start* of a stride rather than on a
 * plant: precisely the phase relationship a tick-locked cadence is supposed to buy. Every tap of
 * the walk key did this. The gait is now remembered and a change restarts the count.
 *
 * ## ⚠️ What the `vx` reset costs, and why it is still the right trade
 *
 * Codex implementation review C1. The cadence is **locked, not phase-locked**. While the player is
 * pinned against a wall the state stays `run`, so `playIfChanged` sees no key change and the run
 * animation keeps cycling — but this counter is now zeroed. Reversing away in the same gait
 * therefore restarts the count against an animation that is mid-cycle, and the cue no longer lands
 * on the drawn plant frame.
 *
 * Kept anyway: silence at a standstill is a smaller defect than a footstep every 250 ms at a
 * standstill, which is what the alternative shipped.
 *
 * 🔴 **The root cause is not here.** The character *animates a run cycle while motionless*, because
 * `resolveState` takes `movingHorizontally = dir !== 0 || vx !== 0`. Fix that and both readings
 * agree without this function knowing anything about it. It is deliberately not fixed in an audio
 * phase: that `dir !== 0` term exists for animation reasons predating Phase 7 and changing it moves
 * every locomotion assertion from Phase 2 onward.
 */
export function advanceStride(player: PlayerSim): boolean {
  const gait = player.state === 'walk' || player.state === 'run' ? player.state : null;
  if (!player.grounded || gait === null || player.vx === 0) {
    player.strideCounter = 0;
    player.strideGait = null;
    return false;
  }
  if (player.strideGait !== gait) {
    player.strideGait = gait;
    player.strideCounter = 0;
  }
  player.strideCounter += 1;
  if (player.strideCounter < FOOTSTEP_TICKS[gait]) {
    return false;
  }
  player.strideCounter = 0;
  return true;
}

/**
 * Step 5: horizontal acceleration, friction, and the active speed cap.
 *
 * The cap is `walkMax` while the modifier is held and `runMax` otherwise — so unlike every other
 * knob in this file, **the cap can change under a moving player**. A plain clamp to the new cap is
 * an instantaneous velocity change from `runMax` to `walkMax` in a single tick, which reads as a
 * stutter and cannot be smoothed in the render layer later because vault 2.11 forbids scaling
 * velocities there. So an over-cap speed BLEEDS toward the cap at `friction` instead
 * (Codex plan review finding 8, case 1). Accelerating still clamps, as it always did — that path
 * cannot exceed the cap in the first place.
 */
export function stepHorizontal(
  player: PlayerSim,
  tuning: TuningKnobs,
  dir: -1 | 0 | 1,
  walkHeld: boolean,
): void {
  const accel = player.grounded ? tuning.runAccel : tuning.airAccel;
  const friction = player.grounded ? tuning.groundFriction : tuning.airFriction;
  const cap = walkHeld ? tuning.walkMax : tuning.runMax;

  if (dir === 0) {
    // FIX 2: the tick immediately after a hit lands, `movementLocked` has already forced `dir` to
    // 0 — skip ONLY the friction decel, so the knockback impulse `damagePlayer` just wrote to
    // `vx` survives to reach step 8's integration instead of being eaten before it ever moves the
    // player. See `knockbackSettling`'s docstring for why this is exactly one tick.
    if (knockbackSettling(player)) {
      // Consumed HERE, the one place it is read for real (vault 2.6-style single door). Clearing on
      // use — not on a timer, not where it was set — is what keeps the exemption to exactly the one
      // tick `knockbackSettling`'s docstring promises: left set, the very next `combatCounter === 1`
      // read (impossible while still in the same `hurt` state, since that counter only equals 1
      // once) would otherwise be the only thing standing between one tick and a permanent one.
      player.knockbackPending = false;
      return;
    }
    // Decelerate toward zero and STOP there. Without the clamp the player creeps forever at a
    // speed too small to see but large enough to slide off a ledge while apparently standing.
    if (player.vx > 0) {
      player.vx = Math.max(0, player.vx - friction);
    } else if (player.vx < 0) {
      player.vx = Math.min(0, player.vx + friction);
    }
    return;
  }

  player.facing = dir === 1 ? 1 : -1;

  const speed = Math.abs(player.vx);
  if (speed > cap && Math.sign(player.vx) === dir) {
    // Already faster than the cap allows and still pushing that way: the cap shrank under us.
    player.vx = dir * Math.max(cap, speed - friction);
    return;
  }

  player.vx = Math.max(-cap, Math.min(cap, player.vx + accel * dir));
}

/** Step 6: gravity, the fall-speed clamp, and the early-release jump cut. */
export function stepVertical(player: PlayerSim, tuning: TuningKnobs, jumpHeld: boolean): void {
  if (player.jumpCutPending && !jumpHeld && player.vy < 0) {
    player.vy = player.vy / tuning.jumpCutDivisor;
    player.jumpCutPending = false;
  }
  if (player.vy >= 0) {
    // Past the apex there is nothing left to cut.
    player.jumpCutPending = false;
  }

  player.vy = Math.min(player.vy + tuning.gravity, tuning.maxFallSpeed);
}

/**
 * Step 9: resolve the player's box against static geometry, one axis at a time.
 *
 * Axis-separated resolution rather than a single overlap push. A combined push has to guess which
 * axis caused the overlap, and it guesses wrong exactly at the corner of a platform — which reads
 * as the player snagging on a ledge they should have cleared. Horizontal first, then vertical, so
 * a player pressed into a wall while falling still lands rather than sticking.
 *
 * Returns whether the player is standing on something.
 */
export function resolveCollisions(
  player: PlayerSim,
  solids: Rect[],
  scale: number,
  previousX: number,
  previousY: number,
): boolean {
  /**
   * Through `toWorld`, THE single local→world conversion (vault 2.10).
   *
   * This used to compute `halfW = (PLAYER_BOX.w * scale) / 2` inline — a second conversion, which
   * is exactly what vault 2.10 forbids and what the doc comment on `toWorld` warns produces "art
   * bottoms and collision bottoms that disagree". It also silently assumed the box is centred on
   * the feet, ignoring `PLAYER_BOX.x` entirely. That was true only by coincidence, and Phase 3's
   * character contract is what put a hand on those exact numbers, so the code-reviewer gate owner
   * flagged it. Identical output today; correct if the box ever becomes asymmetric.
   *
   * `facing` is pinned to `1`: the COLLISION box does not mirror. Only a hitbox should, and that
   * is what Phase 5 added at step 4 of the tick contract — see `playerAttack.ts`.
   */
  const box = toWorld(PLAYER_BOX, player.x, player.y, 1, scale);
  const leftOffset = player.x - box.x;
  const rightOffset = box.x + box.w - player.x;
  const height = box.h;

  for (const solid of solids) {
    const left = player.x - leftOffset;
    const right = player.x + rightOffset;
    const top = player.y - height;
    if (right <= solid.x || left >= solid.x + solid.w) {
      continue;
    }
    if (player.y <= solid.y || top >= solid.y + solid.h) {
      continue;
    }
    const wasLeft = previousX + rightOffset <= solid.x;
    const wasRight = previousX - leftOffset >= solid.x + solid.w;
    if (wasLeft) {
      player.x = solid.x - rightOffset;
      player.vx = 0;
    } else if (wasRight) {
      player.x = solid.x + solid.w + leftOffset;
      player.vx = 0;
    }
  }

  let grounded = false;
  for (const solid of solids) {
    const left = player.x - leftOffset;
    const right = player.x + rightOffset;
    const top = player.y - height;
    if (right <= solid.x || left >= solid.x + solid.w) {
      continue;
    }
    if (player.y <= solid.y || top >= solid.y + solid.h) {
      continue;
    }
    // Land only when arriving from ABOVE. Without the previous-position check, walking into the
    // side of a platform teleports the player onto its roof.
    if (player.vy >= 0 && previousY <= solid.y) {
      player.y = solid.y;
      player.vy = 0;
      grounded = true;
    } else if (player.vy < 0 && previousY - height >= solid.y + solid.h) {
      player.y = solid.y + solid.h + height;
      player.vy = 0;
    }
  }
  return grounded;
}
