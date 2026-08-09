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
 * cases reachable from a unit test at all *(vault 2.12)*. It imports nothing from Phaser and nothing
 * from `src/sim/` except types — it takes a `DerivedFeel` the caller measured.
 *
 * ## Where each `simTicks` comes from, and where the honesty is
 *
 * | anim   | simTicks                        | provenance |
 * |--------|---------------------------------|------------|
 * | `jump` | ticks published as `jump`       | `sim`      |
 * | `fall` | ticks published as `fall`       | `sim`      |
 * | `run`  | `round(stridePx / topSpeed)`    | `measured` |
 * | `walk` | `round(stridePx / walkTopSpeed)`| `measured` |
 * | `idle` | `IDLE_TICKS`                    | `authored` |
 *
 * **`jump` and `fall` are COUNTED, never subtracted.** `airtimeTicks` includes the landing tick,
 * which is already grounded, so `airtime - rise` misallocates one tick to the fall animation.
 * Measured on the shipped tuning: airtime 37, rise 18, fall 18 — the sum is 36, not 37. Codex plan
 * review finding 9 predicted this before the code existed; `derived.ts` counts published states so
 * the number cannot be wrong by one.
 *
 * **`run` and `walk` are measured, not authored.** `stridePx` is how far one foot travels per
 * cycle, read off the generated sheet in the Gym. Dividing it by the speed the sim actually reaches
 * is what makes **foot-slide** the observable defect if the derivation is wrong — and it means
 * retuning `runMax` re-derives the run frame rate automatically, which is the whole point of 4.22.
 *
 * **`idle` is authored, and that is a recorded exception rather than a satisfied case.** There is no
 * simulation window governing a breathing loop. 4.22 exists to stop art outrunning a *timed* move;
 * `idle` has no such window to outrun. The exception is recorded in `docs/qa/phase-04-art.md` with
 * its reason *(C11)*, and `derivedFrom` carries it into the catalog so it cannot quietly read as
 * derived.
 */

import { TICK_HZ } from '../game/constants';
import { ATTACK, DEATH_TICKS, HURT_TICKS, attackTotalTicks } from '../sim/combat';
import type { DerivedFeel } from '../sim/derived';
import type { EnemySlug } from '../sim/enemies';
import { SCAVENGER } from '../sim/enemies';
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
 * The idle breathing cycle, in ticks. 90 ticks = 1.5 s at 60 Hz.
 *
 * AUTHORED. The only number in this file that is not derived from something, and it is named as a
 * constant rather than inlined so that fact is greppable.
 */
export const IDLE_TICKS = 90;

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

/** Stride lengths measured off the generated sheets, in world pixels, keyed by animation. */
export interface MeasuredStrides {
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
  strides: MeasuredStrides,
): AnimTiming[] {
  const rows: { name: PlayerState; simTicks: number; loop: boolean; from: TimingProvenance }[] = [
    { name: 'idle', simTicks: IDLE_TICKS, loop: true, from: 'authored' },
    { name: 'walk', simTicks: strideTicks(strides.walk, feel.walkTopSpeed), loop: true, from: 'measured' },
    { name: 'run', simTicks: strideTicks(strides.run, feel.topSpeed), loop: true, from: 'measured' },
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

/** Stride lengths measured off an ENEMY sheet, world px per cycle. */
export interface EnemyStrides {
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
  strides: EnemyStrides,
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
          { name: 'walk', simTicks: strideTicks(strides.walk, SCAVENGER.patrolSpeed), loop: true, from: 'measured' },
          { name: 'chase', simTicks: strideTicks(strides.chase, SCAVENGER.chaseSpeed), loop: true, from: 'measured' },
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
