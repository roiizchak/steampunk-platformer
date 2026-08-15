/**
 * The player's TUNING — every hand-tuned constant the controller reads.
 *
 * Split out of `player.ts` on 2026-08-15 to bring it under the 400-line rule (criterion
 * 4.16 / 5.12). The rationale for each number stayed with the number; nothing was summarised.
 *
 * 🔴 **A leaf: it imports only types.** `player.ts` imports and re-exports everything here, so
 * `from './player'` keeps working for every existing call site. The dependency runs one way.
 *
 * Every duration is an integer count of 60 Hz ticks and every distance is pixels — never a float
 * of seconds, never a `deltaTime` multiply *(CLAUDE.md §3)*.
 */

import type { LocalBox, TuningKnobs } from './types';


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

