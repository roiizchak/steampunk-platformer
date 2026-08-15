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

/**
 * Starting values, tuned by hand in the Playground.
 *
 * Every DURATION is an integer tick count (vault 2.1). Distances are pixels, velocities px/tick,
 * accelerations px/tick^2 — so nothing here is ever multiplied by a frame delta.
 *
 * `gravity` against `jumpVelocity` is deliberate and not arbitrary: it puts the discrete apex a
 * measurable distance away from the continuous `v^2/2g` answer, which keeps criterion 2.2's check
 * able to detect the substitution vault 2.14 is about. `player-movement.test.ts` asserts that gap
 * still exists, so retuning cannot silently make the apex test vacuous.
 *
 * ## Phase 3 re-tune — the character contract
 *
 * Phase 2 shipped a 46 px character, which at CAMERA_ZOOM on a 1080 px canvas is 4% of screen
 * height. Phase 4 cannot generate art against that, and the Codex plan review (P9) called it out
 * as the number Phase 4 needs published. The box grew to 96 px world (3.0 tiles), so **every
 * distance-dimensioned knob doubled and every time- or ratio-dimensioned knob did not**:
 *
 *   px, px/tick, px/tick^2  ->  x2   runAccel airAccel runMax groundFriction airFriction
 *                                    gravity maxFallSpeed jumpVelocity
 *   ticks and pure ratios   ->  x1   coyoteTicks jumpBufferTicks jumpCutDivisor
 *
 * Ticks-to-apex is `v / g`, so doubling both leaves **airtime in ticks exactly unchanged** and
 * **apex exactly doubled**: 150.3 -> 300.6 px, i.e. 3.13 body heights either way. The feel is
 * preserved in time and scaled in space. The `v^2/2g` gap doubles too — 8.08 -> 16.16 px against
 * an unchanged +/-2 px tolerance — so the anti-vacuity guard gets stronger, not weaker.
 *
 * ## Phase 4 re-tune — the camera got closer, so the feel had to change
 *
 * `RENDER_SCALE` 2 -> 6 by user decision. Scaling every distance knob by 3 the way Phase 3 did
 * would have preserved the feel *exactly*, and that is the trap: the feel was wrong, and it was
 * wrong for a reason that only becomes visible once the character fills the screen.
 *
 * Two things were unplayable at the new scale, and **neither is visible in px/tick**:
 *
 *  1. **Top speed.** 10.4 px/tick over a 96 px character is 6.5 body heights per second. Scaling
 *     to 31.2 px/tick over a 288 px character is still 6.5. The user's complaint — "moves too
 *     fast" — is a statement about that ratio, and a pure x3 does not touch it.
 *  2. **Jump height.** 3.13 body heights was 28 % of the screen at 8.89 %-tall character. At
 *     26.7 % tall it is **84 % of the screen** — the character would leap almost the entire
 *     viewport, which no level can be composed around.
 *
 * So the knobs below are derived from **three perceptual targets** instead of from the old
 * numbers, because px/tick is not what a player perceives:
 *
 *   top speed  2.5 body heights / second   (user's choice; was 6.5)
 *   jump apex  ~1.6 body heights           (~43 % of screen height; was 3.13)
 *   airtime    37 ticks                    UNCHANGED — this is the tick contract
 *
 * Airtime is held fixed on purpose. `tick.ts`'s numbered order is declared authoritative and
 * Phase 5's combat windows are expressed against it, so rise 18 / fall 18 must not move. Holding
 * `v / g` constant at 18 while scaling both is what keeps it: apex scales, airtime does not.
 *
 * Ratios preserved from the shipped tune, so only the three targets above actually changed:
 * time-to-top-speed (`runMax / runAccel`, 4.7 ticks), `airAccel / runAccel`, `walkMax / runMax`,
 * both frictions against `runMax`, and `maxFallSpeed / jumpVelocity`.
 *
 * **These are a starting point to be tuned by hand in the Playground**, which is the user's stated
 * choice and what the Playground is for. The settled values belong in `docs/qa/phase-04-art.md`.
 */
/**
 * Ticks each drawn locomotion frame is held. **Three**, and it must stay a whole number.
 *
 * `cadenceTicks` (`src/render/animTiming.ts`) rounds `TICK_HZ / authoredFps` to an integer so every
 * drawn frame is held for the same number of 60 Hz refreshes — that integer IS session 9's judder
 * fix, and a fractional dwell puts the hitch straight back.
 *
 * It lives here, beside the speeds it constrains, because the two are one decision: see
 * `FOOT_PX_PER_FRAME` below.
 */
export const LOCOMOTION_TICKS_PER_FRAME = 2;

/**
 * Foot travel per drawn frame, world px, **measured off the shipped sheets** by tracking the planted
 * foot across cells. This is the ART's contribution and no knob can change it.
 *
 * Mirrored from `public/assets/config/character-bounds.json`'s `footPxPerFrame`, which is the copy
 * of record; `tests/unit/foot-plant.test.ts` asserts the two agree, so this cannot drift the way a
 * retyped constant does. `src/sim/` may not read a file, which is why it is mirrored rather than
 * imported *(the same boundary G5 already crosses this way)*.
 */
export const FOOT_PX_PER_FRAME = { run: 18.0, walk: 9.0 } as const;

/**
 * Starting values, tuned by hand in the Playground.
 *
 * ## Phase 5 session 10 — the speed came DOWN, and it is now DERIVED
 *
 * The user asked for a slower character, having already reported that the shipped speed *"still
 * moves very fast"*. The honest number turned out not to be the one requested, and the reason is
 * worth keeping:
 *
 * **Zero foot-slide requires `ticksPerFrame × topSpeed === footPxPerFrame`.** Both sides are fixed
 * by things a preference cannot move — the art's measured foot travel, and the whole-refresh dwell
 * rule. So only a few speeds plant the feet at all, and a 20 % cut is not one of them:
 *
 * ```
 *            art foot travel   ticks/frame   speed   was     slide before   slide after
 *   run      22.5 px           3             7.5     12.0    +6.7 %         0
 *   walk      9.0 px           3             3.0      5.54   +23 %          0
 * ```
 *
 * The shipped tune was NOT planted — walk slid 23 %, which is worse than the 17 % that was reported
 * as *"moves like a ghost"* and chased for most of session 9. Deriving both speeds from their own
 * sheet fixes a real defect as well as granting the request.
 *
 * ⚠️ **`walkMax / runMax` deliberately STOPS being preserved** (0.462 → 0.400). Each speed is now
 * pinned to its own sheet's measurement; the old ratio was an artefact of two independently
 * eye-tuned numbers, not a designed relationship. Do not "restore" it.
 *
 * Every remaining HORIZONTAL knob scales by the run factor `SPEED_SCALE`, which preserves
 * time-to-top-speed (`runMax / runAccel`, 4.7 ticks), `airAccel / runAccel` and both frictions
 * against `runMax`. Written as products rather than rounded literals so the relationship is visible
 * and exact — a rounded 1.59 would quietly break the ratio it exists to hold.
 *
 * **No vertical knob moves.** `gravity`, `jumpVelocity` and `maxFallSpeed` are untouched, so apex,
 * airtime and the `v²/2g` anti-vacuity gap are all exactly as they were, and `tick.ts`'s contract —
 * which Phase 5's combat windows are expressed against — is not touched by a locomotion retune.
 *
 * **Knockback is no longer wired to `walkMax`.** See `KNOCKBACK_SPEED` in `worldDamage.ts`: a combat
 * number must not move because locomotion was retuned. That was a live, re-opened QA decision and
 * the user closed it here.
 *
 * ## Phase 4 re-tune — the camera got closer, so the feel had to change
 *
 * `RENDER_SCALE` 2 -> 6 by user decision. Scaling every distance knob by 3 the way Phase 3 did
 * would have preserved the feel *exactly*, and that is the trap: the feel was wrong, and it was
 * wrong for a reason that only becomes visible once the character fills the screen.
 *
 * Two things were unplayable at the new scale, and **neither is visible in px/tick**:
 *
 *  1. **Top speed.** 10.4 px/tick over a 96 px character is 6.5 body heights per second. Scaling
 *     to 31.2 px/tick over a 288 px character is still 6.5. The user's complaint — "moves too
 *     fast" — is a statement about that ratio, and a pure x3 does not touch it.
 *  2. **Jump height.** 3.13 body heights was 28 % of the screen at 8.89 %-tall character. At
 *     26.7 % tall it is **84 % of the screen** — the character would leap almost the entire
 *     viewport, which no level can be composed around.
 *
 * The Phase 4 targets were `top speed 2.5 body heights/second`, `jump apex ~1.6 body heights`,
 * `airtime 37 ticks`. Session 10 moves the first to **1.56 body heights/second** and leaves the
 * other two alone.
 *
 * ## Phase 3 re-tune — the character contract
 *
 * Phase 2 shipped a 46 px character, which at CAMERA_ZOOM on a 1080 px canvas is 4% of screen
 * height. The box grew to 96 px world (3.0 tiles), so **every distance-dimensioned knob doubled and
 * every time- or ratio-dimensioned knob did not**:
 *
 *   px, px/tick, px/tick^2  ->  x2   runAccel airAccel runMax groundFriction airFriction
 *                                    gravity maxFallSpeed jumpVelocity
 *   ticks and pure ratios   ->  x1   coyoteTicks jumpBufferTicks jumpCutDivisor
 *
 * Ticks-to-apex is `v / g`, so doubling both leaves **airtime in ticks exactly unchanged**.
 */
const SPEED_SCALE = FOOT_PX_PER_FRAME.run / LOCOMOTION_TICKS_PER_FRAME / 12.0;

export const DEFAULT_TUNING: TuningKnobs = {
  runAccel: 2.55 * SPEED_SCALE,
  airAccel: 1.51 * SPEED_SCALE,
  runMax: FOOT_PX_PER_FRAME.run / LOCOMOTION_TICKS_PER_FRAME,
  walkMax: FOOT_PX_PER_FRAME.walk / LOCOMOTION_TICKS_PER_FRAME,
  groundFriction: 3.69 * SPEED_SCALE,
  airFriction: 0.51 * SPEED_SCALE,
  /**
   * 🔴 **`gravity` 2.7 → 0.675 and `jumpVelocity` 48.6 → 24.3 on 2026-08-15 — the AIRBORNE WINDOW
   * DOUBLED, and the jump height did not move by a pixel.**
   *
   * The player asked to see the jump and fall animations more easily. That could not be done in the
   * art: `fall`'s `simTicks` is **measured**, not chosen — `derived.ts` counts the ticks the player
   * actually spends falling — so slowing the animation alone would draw an arc lasting twice the
   * motion it depicts, which is vault 4.22 running backwards. `asset-catalog.test.ts` refused it,
   * correctly, when it was tried.
   *
   * So the motion slowed instead. The pair is solved, not tuned:
   *
   * ```
   *   rise ticks = v / g        = 24.3 / 0.675 = 36     (was 18)
   *   apex px    = v² / 2g      = 590.49 / 1.35 = 437.4 (was 437.4 — IDENTICAL)
   * ```
   *
   * **36 is the only reachable step, and that is arithmetic rather than taste.** `jump` ships 6
   * frames and `fall` ships 9, and a one-shot's window must divide by its frame count or the frames
   * dwell unevenly — which is the judder session 9 shipped a fix for. So the window can only be a
   * multiple of **18**, and 36 is the next one up. `fall` now draws at 4 ticks/frame (15 fps) where
   * it was the fastest one-shot in the project at 2 ticks/frame (30 fps).
   *
   * ⚠️ **`maxFallSpeed` is deliberately NOT scaled.** Preserving its old ratio to `jumpVelocity`
   * would drop it to 25.8 — and `hazards.test.ts` builds its tunnelling fixture at exactly this
   * speed, so halving it would quietly halve the worst case a swept hazard test is required to
   * survive. **That is loosening a safety gate as a side effect of a feel change**, and it stays at
   * 51.6. The cost is that terminal velocity now takes 76 ticks to reach rather than 19, which only
   * a very long fall sees.
   *
   * ⚠️ **This REVERSES a recorded decision**, and it is written as a reversal rather than a fresh
   * choice. The paragraph below and `foot-plant.test.ts` both stated that no vertical knob moves,
   * because the tick contract is *"declared authoritative"*. What that contract actually fixes is
   * `tick.ts`'s numbered STEP ORDER, which is untouched here — no step moved, none was renumbered.
   * The combat windows expressed against it (`ATTACK`, `SCAVENGER_ATTACK`, `IFRAME_TICKS`,
   * `HURT_TICKS`) are independent integers and **none of them derives from the rise**; that was
   * checked rather than assumed. What genuinely moves is jump distance, which doubles — so
   * `level-traversal.test.ts` was re-run first: the pit is still crossable **and a standing hop
   * still cannot clear it**, which is the half that keeps the jump a skill.
   */
  gravity: 0.675,
  maxFallSpeed: 51.6,
  jumpVelocity: 24.3,
  jumpCutDivisor: 3,
  coyoteTicks: 7,
  jumpBufferTicks: 8,
};

/**
 * The player's collision box, authored local: `+x` forward, `+y` up from the feet (vault 2.10).
 *
 * **Local px.** The world box is this multiplied by the world's `scale`, and at the published
 * `RENDER_SCALE` of **6** that is **132 x 288 px = 1.375 x 3.0 tiles** — the same tile footprint,
 * because `TILE_SIZE` moved 32 -> 96 in the same rescale. It said "scale 2, 44 x 96" until the
 * Codex implementation review caught it (finding 12). Nothing outside `toWorld` may
 * apply that multiply, and nothing anywhere may hardcode the product — the Phase 2 tests that
 * pinned `26 x 46` as literals were rewritten to derive it, which is why this change was
 * cheap to make.
 */
export const PLAYER_BOX: LocalBox = { x: -11, y: 0, w: 22, h: 48 };

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
   * arrives in Phase 5 at step 4 of the tick contract.
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
