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
import type { PlayerState } from '../sim/types';

/** Every animation the player has. Identical to `PlayerState` on purpose — see `playerView.ts`. */
export type AnimName = PlayerState;

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

/** Frames actually present in each sheet, read from the sheet — never assumed. */
export type MeasuredFrames = Record<AnimName, number>;

/**
 * Build the full timing table. The single place the catalog's `fps`, `simTicks` and `derivedFrom`
 * come from, so a sheet cannot acquire a hand-typed frame rate on its way into `index.json`.
 */
export function animTimings(
  feel: DerivedFeel,
  frames: MeasuredFrames,
  strides: MeasuredStrides,
): AnimTiming[] {
  const rows: { name: AnimName; simTicks: number; loop: boolean; from: TimingProvenance }[] = [
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
