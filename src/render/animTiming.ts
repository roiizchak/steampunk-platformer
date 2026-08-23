/**
 * Animation frame rates, DERIVED from the simulation — vault **4.22** (blocker).
 *
 * The vault's evidence: every light attack in a prior project had 0.43 s of art over a 0.25–0.27 s
 * move, so **the strike was never drawn**. The fix is not to tune the number, it is to stop
 * authoring it:
 *
 *   > `fps = renderFrames * TICK_HZ / simTicks`
 *
 * This file lives in `src/render/` for the same reason `playerView.ts` and `cameraRig.ts` do: it is
 * a rendering decision, it is engine-free, and pulling it out of the scene is what makes its edge
 * cases reachable from a unit test at all *(vault 2.12)*. It imports nothing from Phaser.
 *
 * > 🔴 This paragraph also claimed it imported **nothing from `src/sim/` except types**. That has
 * > been false since Phase 5: the import block below takes `ATTACK`, `DEATH_TICKS`, `HURT_TICKS` and
 * > `attackTotalTicks` as **values**, and it must — every fixed-window animation's `simTicks` comes
 * > from the simulation that owns the window, which is the whole point of vault 4.22. `DerivedFeel`
 * > is still passed in by the caller rather than measured here. Corrected 2026-08-14; the direction
 * > that actually matters (nothing in `src/sim/` imports THIS) is unchanged and is mechanically
 * > enforced by `tests/unit/sim-boundary.test.ts`.
 *
 * ## Where each `simTicks` comes from, and where the honesty is
 *
 * | anim   | simTicks                        | provenance |
 * |--------|---------------------------------|------------|
 * | `jump` | ticks published as `jump`       | `sim`      |
 * | `fall` | ticks published as `fall`       | `sim`      |
 * | `run`  | `round(frames * TICK_HZ / fps)`  | `authored` |
 * | `walk` | `round(frames * TICK_HZ / fps)`  | `authored` |
 * | `idle` | `IDLE_TICKS`                    | `authored` |
 *
 * **`jump` and `fall` are COUNTED, never subtracted.** `airtimeTicks` includes the landing tick,
 * which is already grounded, so `airtime - rise` misallocates one tick to the fall animation.
 * Measured on the shipped tuning: airtime 37, rise 18, fall 18 — the sum is 36, not 37. Codex plan
 * review finding 9 predicted this before the code existed; `derived.ts` counts published states so
 * the number cannot be wrong by one.
 *
 * ## 🔴 A LOOP HAS NO WINDOW — why `walk` and `run` stopped being stride-derived (session 9)
 *
 * **`idle` was already authored, and this file argued the case for it three paragraphs before
 * applying the opposite rule to its two neighbours:** *"There is no simulation window governing a
 * breathing loop. 4.22 exists to stop art outrunning a TIMED move; `idle` has no such window to
 * outrun."* **A walk cycle has no window either.** Nothing in the simulation says a stride must take
 * 46 ticks. That constraint was invented here, by deriving it from `stridePxPerCycle`.
 *
 * **What that cost.** The user reported the character "moves too fast, like a ghost". Measured on
 * the shipped sheets by tracking the planted foot: on `run` it travels **-22.4 px per frame** while
 * the body advances **+27.0**, so **17 % of every step is slip**; `walk` slips 13 %. The declared
 * stride was simply larger than the stride the art draws — and it is not fixable by measuring
 * harder, because four independent methods disagree by ~20 % (walk 156-250, run 214-285 against
 * declared 254 and 320). Vault **4.18**'s INDETERMINATE condition, on the number this file had made
 * load-bearing.
 *
 * **Where the rule came from, and what it actually said.** 4.22's evidence is entirely about
 * ATTACKS — *"every light attack had 0.43 s of art over a 0.25-0.27 s move, so the strike was never
 * drawn"* — plus aligning the contact frame to the active window. Both are properties of a move with
 * a duration. **The sibling project that lesson came from does not apply it to walking**: its own
 * timing module says *"Looping states (idle/walk) have no duration to match and keep their authored
 * fps"*, and its `walkF` is 8 frames at an authored 12 fps with the speed tuned live in a dev
 * playground. Extending 4.22 to loops was an over-application, and it hard-wired an unmeasurable
 * quantity into how the game looks.
 *
 * **4.22 is NOT weakened.** `fps = renderFrames * TICK_HZ / simTicks` still governs every animation,
 * including these two — `cadenceTicks` derives `simTicks` from the authored cadence and the fps is
 * then re-derived from the ROUNDED `simTicks`, so criterion 5.4d holds unchanged. Every animation
 * with a real window — `attack`, `hurt`, `death`, `jump`, `fall` — still takes its `simTicks` from
 * the simulation and still goes red in `asset-catalog.test.ts` when a window is retuned. What
 * changed is only where a LOOP's cadence comes from: a number a human set by watching the
 * character, instead of one measured off generated art to a precision the art does not carry.
 *
 * **Foot-slide is still the observable** — it is now tuned against directly, in the Gym, instead of
 * being predicted by an arithmetic chain whose input was unknowable.
 *
 * *(User decision, 2026-08-13, after comparing against the sibling project. Recorded in
 * `docs/qa/phase-05-combat.md` with its reasoning (C11).)*
 */

import { TICK_HZ } from '../game/constants';
import { ATTACK, DEATH_TICKS, HURT_TICKS, attackTotalTicks } from '../sim/combat';
import type { DerivedFeel } from '../sim/derived';
import type { EnemySlug } from '../sim/enemies';
// `SCAVENGER` is no longer imported: the scavenger's loop cadences are authored, so its patrol and
// chase SPEEDS no longer decide its frame rate. Retuning them now changes how far it travels and
// nothing else — which is the separation of concerns this change was for.
import type { PlayerState } from '../sim/types';
import { SENTRY_FIRE_TICKS, type EnemyAnim } from './enemyView';

/**
 * Every animation any subject has.
 *
 * It was an alias of `PlayerState`, which left the enemy animations with no home in the timing
 * table at all *(Codex plan review C2)* — and an animation outside this table is an animation whose
 * fps has to come from somewhere else, which is vault 4.22's authored-fps failure with extra steps.
 * Widened rather than duplicated into a second parallel table, which would be vault 5.3's *"two
 * definitions of one concept"*.
 */
export type AnimName = PlayerState | EnemyAnim;

/** How a `simTicks` was arrived at. Carried into `index.json` so provenance survives the pipeline. */
export type TimingProvenance = 'sim' | 'measured' | 'authored';

/**
 * The idle breathing cycle, in ticks. 96 ticks = 1.6 s at 60 Hz.
 *
 * AUTHORED. The only number in this file that is not derived from something, and it is named as a
 * constant rather than inlined so that fact is greppable.
 *
 * 🔴 **96, not 90, and the reason is arithmetic rather than taste.** It is shared by BOTH idle
 * sheets, which have different frame counts — the courier's 12 and the sentry's 8 — so it must
 * divide by both or one of them judders. 90 divided evenly by neither (7.5 and 11.25 refreshes per
 * frame); 96 gives the courier 8 and the sentry 12, i.e. 7.5 fps and 5 fps, both dead even. See
 * `tests/unit/loop-dwell.test.ts`. The sibling project's idle is 8 frames over 1.6 s at 5 fps — the
 * same cycle length this lands on, arrived at independently.
 */
export const IDLE_TICKS = 96;

export interface AnimTiming {
  name: AnimName;
  /** Frames in the sheet. */
  renderFrames: number;
  /** The simulation duration the rate is derived against. Always an integer tick count. */
  simTicks: number;
  /** `renderFrames * TICK_HZ / simTicks`. Never authored. */
  fps: number;
  loop: boolean;
  derivedFrom: TimingProvenance;
}

/**
 * THE formula. Exported so the test asserts the same function the pipeline calls, rather than a
 * re-implementation that agrees with it *(vault C2 — an audit once reported ratio exactly 1.00 for
 * every state because it computed `art = sim` with the same formula the code used; the defence is
 * one definition, not two, plus fixtures that make it fail)*.
 */
export function deriveFps(renderFrames: number, simTicks: number): number {
  if (!Number.isInteger(renderFrames) || renderFrames < 1) {
    throw new Error(`deriveFps: renderFrames must be a positive integer, got ${renderFrames}`);
  }
  if (!Number.isInteger(simTicks) || simTicks < 1) {
    throw new Error(`deriveFps: simTicks must be a positive integer, got ${simTicks}`);
  }
  return (renderFrames * TICK_HZ) / simTicks;
}

/**
 * Ticks one locomotion cycle occupies, from the art's stride and the sim's speed.
 *
 * **Rounded to an integer here, and the fps is then derived from the ROUNDED value** — never from
 * the raw quotient. Every duration in this project is an integer count of 60 Hz ticks, so an fps
 * derived from `13.846…` describes a cycle length the simulation can never actually have. Codex
 * plan review finding 9 flagged the missing rounding rule.
 *
 * ⚠️ **This was deleted on 2026-08-23 as dead, and put straight back.** The Tier-4 sweep proposed
 * removing it alongside `MeasuredStrides` and `EnemyStrides`; the grep that "confirmed" it was dead
 * had been truncated by a `head -5` and hid the two files that import it —
 * `tests/unit/anim-timing.test.ts` and `tests/unit/catalog-timings.test.ts`, the second of which
 * checks `tools/gen/catalogTimings.mjs`'s mirror of it agrees. `MeasuredStrides`'s claim that this
 * is *"still exported and tested"* was **correct**, and the removal was caught by `tsc` and four
 * red tests within a minute. Recorded because the near-miss is the lesson: a deletion justified by a
 * grep is only as good as the grep, and `head` is not a filter.
 */
export function strideTicks(stridePx: number, speedPxPerTick: number): number {
  if (!(stridePx > 0) || !Number.isFinite(stridePx)) {
    throw new Error(`strideTicks: stridePx must be a finite number > 0, got ${stridePx}`);
  }
  if (!(speedPxPerTick > 0) || !Number.isFinite(speedPxPerTick)) {
    throw new Error(`strideTicks: speed must be a finite number > 0, got ${speedPxPerTick}`);
  }
  return Math.max(1, Math.round(stridePx / speedPxPerTick));
}

/**
 * Ticks a LOOPING cycle occupies, from an authored cadence.
 *
 * 🔴 **This replaces `strideTicks` for locomotion, and the reason is the whole of session 9's
 * ghosting report.** See the header's "A loop has no window" section.
 *
 * The fps is authored; `simTicks` is derived FROM it and then the fps is re-derived from the
 * rounded `simTicks`, so `fps = renderFrames * TICK_HZ / simTicks` stays exactly true and criterion
 * 5.4d is untouched. What changes is only where `simTicks` comes from — a cadence a human chose by
 * watching the character, instead of a stride nobody can measure.
 */
export function cadenceTicks(renderFrames: number, authoredFps: number): number {
  if (!Number.isInteger(renderFrames) || renderFrames < 1) {
    throw new Error(`cadenceTicks: renderFrames must be a positive integer, got ${renderFrames}`);
  }
  if (!(authoredFps > 0) || !Number.isFinite(authoredFps)) {
    throw new Error(`cadenceTicks: authored fps must be a finite number > 0, got ${authoredFps}`);
  }
  // 🔴 Round the TICKS PER FRAME, not the cycle. See the header's "whole refreshes" section: this is
  // what makes the returned `simTicks` an exact multiple of `renderFrames`, so every drawn frame is
  // held for the same number of 60 Hz refreshes. Rounding the cycle instead — which is what this did
  // until session 9 — let `run` land on 23 ticks for 12 frames, i.e. eleven frames of two refreshes
  // and one of one, and that hitch IS the reported ghosting. `tests/unit/loop-dwell.test.ts`.
  const ticksPerFrame = Math.max(1, Math.round(TICK_HZ / authoredFps));
  return renderFrames * ticksPerFrame;
}

/**
 * 🔴 **`MeasuredStrides` and `EnemyStrides` were DELETED here on 2026-08-23** *(session inventory,
 * Tier 4)*. Both typed stride lengths measured off generated sheets, both said *"no longer used for
 * timing"*, and **neither was imported anywhere** — verified across `src/`, `tests/` and `tools/`
 * with no truncation, unlike the grep that briefly convinced this session `strideTicks` was dead
 * too. `strideTicks` stays; see its docstring.
 *
 * `character-bounds.json` still records the measurements and keeps its shape whether or not a
 * TypeScript interface describes it — `tests/unit/asset-catalog.test.ts` declares the field it needs
 * inline. A type nobody reads is an invitation to reach for a retired number, which is exactly how
 * Phase 7's plan went wrong (Codex plan review F8).
 *
 * Removing an export is not STOP-and-ask; deleting a *file* is (CLAUDE.md §3).
 */

/**
 * Authored locomotion cadences, in frames per second, read from `character-bounds.json`.
 *
 * Street-Fighter's `walkF` is 8 frames at an authored 12 fps — the same shape.
 */
export interface AuthoredCadence {
  run: number;
  walk: number;
}

/**
 * Frames actually present in each PLAYER sheet, read from the sheet — never assumed.
 *
 * Pinned to `PlayerState` rather than `AnimName` when `AnimName` widened: an enemy sheet is not a
 * player sheet, and a `Record` spanning both would demand enemy frame counts from every call site
 * that only has the player. Enemy counts arrive through `enemyAnimTimings`.
 */
export type MeasuredFrames = Record<PlayerState, number>;

/**
 * Build the full timing table. The single place the catalog's `fps`, `simTicks` and `derivedFrom`
 * come from, so a sheet cannot acquire a hand-typed frame rate on its way into `index.json`.
 */
export function animTimings(
  feel: DerivedFeel,
  frames: MeasuredFrames,
  cadence: AuthoredCadence,
): AnimTiming[] {
  const rows: { name: PlayerState; simTicks: number; loop: boolean; from: TimingProvenance }[] = [
    { name: 'idle', simTicks: IDLE_TICKS, loop: true, from: 'authored' },
    // Authored cadence, not `strideTicks`. Both loops, same reasoning as `idle` directly above:
    // there is no simulation window for a walk cycle to outrun.
    { name: 'walk', simTicks: cadenceTicks(frames.walk, cadence.walk), loop: true, from: 'authored' },
    { name: 'run', simTicks: cadenceTicks(frames.run, cadence.run), loop: true, from: 'authored' },
    { name: 'jump', simTicks: feel.riseTicks, loop: false, from: 'sim' },
    { name: 'fall', simTicks: feel.fallTicks, loop: false, from: 'sim' },
    /**
     * Phase 5's combat rows. **`simTicks` is IMPORTED from `src/sim/combat.ts`, never retyped**
     * *(vault 5.3)* — so retuning the swing changes the sheet's fps with nobody editing a number
     * here, and `asset-catalog.test.ts` then goes red until the sheets are rebuilt.
     *
     * This is the whole of vault 4.22 in three lines: the art's frame rate is a function of the
     * move's length, so a move that gets shorter cannot leave its animation playing past the end of
     * it. The alternative — an authored fps — is how *"every light attack had 0.43 s of art over a
     * 0.25 s move, so the strike was never drawn."*
     */
    { name: 'attack', simTicks: attackTotalTicks(ATTACK), loop: false, from: 'sim' },
    { name: 'hurt', simTicks: HURT_TICKS, loop: false, from: 'sim' },
    { name: 'death', simTicks: DEATH_TICKS, loop: false, from: 'sim' },
  ];

  return rows.map(({ name, simTicks, loop, from }) => {
    const renderFrames = frames[name];
    return {
      name,
      renderFrames,
      simTicks,
      fps: deriveFps(renderFrames, simTicks),
      loop,
      derivedFrom: from,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Enemy timings — guard G2 extended to the subjects Phase 5 adds.
 * ------------------------------------------------------------------ */

/** Authored loop cadences for an enemy's locomotion, frames per second. */
export interface EnemyCadence {
  walk: number;
  chase: number;
}

/** Frames present in each of one enemy's sheets, read from the sheet. */
export type EnemyFrames = Partial<Record<EnemyAnim, number>>;

/**
 * The timing table for one enemy, with the same rule as the player's: **every `simTicks` is
 * imported from the simulation or measured off the art, never authored here.**
 *
 * This exists now, before a single enemy sheet has been generated, on purpose. The Phase 4 defect
 * was not that a number was wrong — it was that a number was *typed* at the moment the sheets
 * landed, with nothing forcing it to come from the move it describes. Writing the derivation first
 * means the pipeline in step 6a has nowhere to put a hand-picked fps.
 *
 * The two locomotion rows divide the measured stride by the speed the enemy actually reaches, so
 * retuning `patrolSpeed` or `chaseSpeed` re-derives the frame rate and foot-slide stays the
 * observable defect *(vault 4.22)*. `chase` divides by `chaseSpeed` rather than reusing `walk`'s
 * number — reusing it is exactly how a chase animation ends up flip-booking at patrol pace.
 */
export function enemyAnimTimings(
  slug: EnemySlug,
  frames: EnemyFrames,
  cadence: EnemyCadence,
): AnimTiming[] {
  const rows: { name: EnemyAnim; simTicks: number; loop: boolean; from: TimingProvenance }[] =
    slug === 'brass-sentry'
      ? [
          { name: 'idle', simTicks: IDLE_TICKS, loop: true, from: 'authored' },
          // Rides the sentry's existing `cooldownCounter`, so the muzzle animation's length and the
          // window the sim plays it over are the same number by construction.
          { name: 'fire', simTicks: SENTRY_FIRE_TICKS, loop: false, from: 'sim' },
          { name: 'death', simTicks: DEATH_TICKS, loop: false, from: 'sim' },
        ]
      : [
          // Authored cadence, same rule as the player's loops — see the header. `chase` keeps its
          // own number rather than reusing `walk`'s, which is what stops a chase animation
          // flip-booking at patrol pace; that reasoning survives the change of input unaltered.
          //
          // This is also what UNBLOCKS `chase`. It could never be catalogued before: its stride was
          // unmeasured, so `catalogTimings` threw rather than guess — correctly, given a guessed
          // stride is exactly what shipped as the player's ghosting. A loop needs no stride now.
          { name: 'walk', simTicks: cadenceTicks(frames.walk ?? 1, cadence.walk), loop: true, from: 'authored' },
          { name: 'chase', simTicks: cadenceTicks(frames.chase ?? 1, cadence.chase), loop: true, from: 'authored' },
          { name: 'death', simTicks: DEATH_TICKS, loop: false, from: 'sim' },
        ];

  return rows.map(({ name, simTicks, loop, from }) => {
    const renderFrames = frames[name];
    if (renderFrames === undefined) {
      // Named rather than defaulted. A missing sheet that silently became `deriveFps(undefined)` is
      // the hole `asset-catalog.test.ts` closed for the player; enemies get the same treatment.
      throw new Error(`enemyAnimTimings: ${slug} has no measured frame count for \`${name}\``);
    }
    return { name, renderFrames, simTicks, fps: deriveFps(renderFrames, simTicks), loop, derivedFrom: from };
  });
}
