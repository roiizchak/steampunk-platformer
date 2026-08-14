/**
 * The foot-plant invariant: `ticksPerFrame × topSpeed === footPxPerFrame`.
 *
 * ## Why this file exists
 *
 * The user reported the character *"moves too fast, like a ghost"*. Session 9 established that
 * *"like a ghost"* was **foot-slide**: locomotion cadence was derived from a measured
 * `stridePxPerCycle`, the declared strides were larger than the strides the art draws, and the body
 * covered more ground per cycle than the feet described. Cadence became authored instead, and the
 * slide was tuned down by eye.
 *
 * **By eye is not the same as gone.** When session 10 came to grant the "still too fast" half of the
 * request, the measurement showed the shipped tune was never planted:
 *
 * ```
 *          art foot travel   ticks/frame   speed    body px/frame   slide
 *   run    22.5 px           2             12.0     24.0            +6.7 %
 *   walk    9.0 px           2              5.54    11.08           +23 %
 * ```
 *
 * 23 % on walk is **worse than the 17 % that was reported as the defect** and chased for most of a
 * session. Nothing was watching, because nothing had ever compared the sim's speed to the art's
 * measured foot travel — the two halves lived in different files, one of them a DEV-only scene.
 *
 * So this is the gate that watches. It is deliberately an EXACT equality, not a tolerance: both
 * sides are fixed quantities, and the whole failure mode was a small discrepancy nobody could see.
 *
 * ## What it catches
 *
 *  - A speed knob edited without re-timing the sheets (the 2026-08-14 request, done wrong).
 *  - A sheet re-timed without re-tuning the speed (the mirror case).
 *  - A fractional ticks-per-frame, which puts session 9's judder back — `cadenceTicks` rounds
 *    `TICK_HZ / fps` to an integer precisely so every drawn frame is held for the same number of
 *    60 Hz refreshes.
 *  - `FOOT_PX_PER_FRAME` in `src/sim/player.ts` drifting from `character-bounds.json`, which is the
 *    copy of record. `src/sim/` may not read a file, so the constant is mirrored; this asserts the
 *    mirror still reflects.
 */

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TUNING,
  FOOT_PX_PER_FRAME,
  LOCOMOTION_TICKS_PER_FRAME,
} from '../../src/sim/player';
import {
  CHASE_FOOT_PX_PER_FRAME,
  CHASE_TICKS_PER_FRAME,
  SCAVENGER,
} from '../../src/sim/enemyScavenger';
import catalog from '../../public/assets/index.json';
import bounds from '../../public/assets/config/character-bounds.json';
import scavengerBounds from '../../public/assets/config/character-bounds-rust-scavenger.json';

/** The two locomotion loops, and the tuning knob that caps each one's speed. */
const LOOPS = [
  { action: 'run', key: 'brass-courier-run', topSpeed: DEFAULT_TUNING.runMax },
  { action: 'walk', key: 'brass-courier-walk', topSpeed: DEFAULT_TUNING.walkMax },
] as const;

const animations = bounds.animations as Record<string, { fps?: number; footPxPerFrame?: number }>;

describe('the sim speed and the art cadence are one decision, not two', () => {
  it('character-bounds.json records the measured foot travel for both loops', () => {
    // Without this the whole file is vacuous — every assertion below reads these numbers.
    for (const { action } of LOOPS) {
      expect(
        animations[action]?.footPxPerFrame,
        `${action} has no footPxPerFrame in character-bounds.json — it is the measurement every ` +
          'speed here is derived from, and it must live beside the art it describes.',
      ).toBeGreaterThan(0);
    }
  });

  it("src/sim/player.ts's mirrored FOOT_PX_PER_FRAME matches the config, which is the copy of record", () => {
    for (const { action } of LOOPS) {
      expect(
        FOOT_PX_PER_FRAME[action],
        `${action}: player.ts mirrors ${FOOT_PX_PER_FRAME[action]} but character-bounds.json says ` +
          `${animations[action]?.footPxPerFrame}. The config wins — src/sim/ cannot read a file, so ` +
          'the mirror is the compromise and this is what keeps it honest.',
      ).toBe(animations[action]?.footPxPerFrame);
    }
  });

  for (const { action, key, topSpeed } of LOOPS) {
    describe(key, () => {
      const row = catalog.sheets.find((sheet) => sheet.key === key);

      it('has a catalog row at all', () => {
        expect(row, `${key} is missing from public/assets/index.json`).toBeDefined();
      });

      it('holds every drawn frame for a WHOLE number of ticks', () => {
        const ticksPerFrame = row!.simTicks / row!.frameCount;
        expect(
          Number.isInteger(ticksPerFrame),
          `${key}: ${row!.simTicks} ticks over ${row!.frameCount} frames is ${ticksPerFrame} ` +
            'ticks per frame. A fractional dwell holds some frames longer than others, which IS ' +
            'the judder session 9 shipped a fix for.',
        ).toBe(true);
        expect(ticksPerFrame).toBe(LOCOMOTION_TICKS_PER_FRAME);
      });

      /**
       * 🔴 **The assertion this file exists for.** Exact, not approximate: the shipped tune was out
       * by 6.7 % on run and 23 % on walk, and a tolerance loose enough to admit those is loose
       * enough to admit the defect.
       */
      it('advances the body exactly as far per frame as the art moves the foot', () => {
        const ticksPerFrame = row!.simTicks / row!.frameCount;
        const bodyPxPerFrame = ticksPerFrame * topSpeed;
        expect(
          bodyPxPerFrame,
          `${key}: the body covers ${bodyPxPerFrame}px per drawn frame while the art moves the ` +
            `planted foot ${FOOT_PX_PER_FRAME[action]}px. The difference is foot-slide, and it is ` +
            'what "moves like a ghost" meant. Change the speed and the authored fps together, or ' +
            'not at all.',
        ).toBeCloseTo(FOOT_PX_PER_FRAME[action], 10);
      });

      it('derives its fps from the cadence rather than carrying an authored one', () => {
        // `fps = renderFrames * TICK_HZ / simTicks` (vault 4.22), asserted here against the shipped
        // row so a hand-typed frame rate cannot survive in the catalog.
        expect(row!.fps).toBeCloseTo((row!.frameCount * 60) / row!.simTicks, 10);
      });
    });
  }
});

/**
 * 🔴 **The scavenger's chase, added 2026-08-14 — and it is the same defect on a second body.**
 *
 * The player's locomotion was planted earlier the same session. The user then reported *"when
 * Scavenger is running fast, the animation is not smooth like the character"* — the one slug whose
 * cadence had never been checked against its own art. It shipped at 2 ticks/frame against a
 * `chaseSpeed` of 8, so the body advanced 16 px per drawn frame while the foot travelled 18.
 *
 * The block below is the player's assertions applied to the enemy, and it exists so the NEXT slug
 * is a rule rather than a second discovery.
 */
describe('rust-scavenger-chase — the same invariant, on the enemy', () => {
  const row = catalog.sheets.find((sheet) => sheet.key === 'rust-scavenger-chase');
  const chase = (
    scavengerBounds.animations as Record<string, { fps?: number; footPxPerFrame?: number }>
  ).chase;

  it('records its measured foot travel in the slug bounds file, which is the copy of record', () => {
    expect(chase?.footPxPerFrame).toBeGreaterThan(0);
  });

  it("src/sim/'s mirrored constant matches that measurement", () => {
    expect(
      CHASE_FOOT_PX_PER_FRAME,
      'enemyScavenger.ts mirrors the measurement because src/sim/ cannot read a file. This is ' +
        'what keeps the mirror reflecting.',
    ).toBe(chase?.footPxPerFrame);
  });

  it('holds every drawn frame for a WHOLE number of ticks', () => {
    const ticksPerFrame = row!.simTicks / row!.frameCount;
    expect(Number.isInteger(ticksPerFrame)).toBe(true);
    expect(ticksPerFrame).toBe(CHASE_TICKS_PER_FRAME);
  });

  it('advances the body exactly as far per frame as the art moves the foot', () => {
    const ticksPerFrame = row!.simTicks / row!.frameCount;
    expect(
      ticksPerFrame * SCAVENGER.chaseSpeed,
      `rust-scavenger-chase: the body covers ${ticksPerFrame * SCAVENGER.chaseSpeed}px per drawn ` +
        `frame while the art moves the planted foot ${CHASE_FOOT_PX_PER_FRAME}px. That difference ` +
        'is the foot-slide the user reported as "not smooth like the character".',
    ).toBeCloseTo(CHASE_FOOT_PX_PER_FRAME, 10);
  });

  it('derives its fps from the cadence rather than carrying an authored one', () => {
    expect(row!.fps).toBeCloseTo((row!.frameCount * 60) / row!.simTicks, 10);
  });

  /**
   * The speed is not a free number and this is the assertion that says so out loud. Under the plant
   * invariant `chaseSpeed = 18 / ticksPerFrame`, so the ONLY values that exist are 18, 9, 6 and
   * 4.5 — which is why the session's decided "three quarters of run" (6.75) was unreachable and 6.0
   * was taken instead. Anyone re-tuning by taste rather than by dwell fails here.
   */
  it('is a quotient of the measurement, never an independently chosen number', () => {
    expect(SCAVENGER.chaseSpeed).toBe(CHASE_FOOT_PX_PER_FRAME / CHASE_TICKS_PER_FRAME);
  });
});

describe('the retune preserved what it claimed to preserve', () => {
  it('holds time-to-top-speed at the shipped 4.7 ticks', () => {
    // `runMax / runAccel`. Phase 4's docstring names this as a preserved ratio; scaling both by the
    // same factor is what keeps it, and a rounded literal would quietly break it.
    expect(DEFAULT_TUNING.runMax / DEFAULT_TUNING.runAccel).toBeCloseTo(12.0 / 2.55, 6);
  });

  it('holds airAccel and both frictions against runMax', () => {
    expect(DEFAULT_TUNING.airAccel / DEFAULT_TUNING.runAccel).toBeCloseTo(1.51 / 2.55, 6);
    expect(DEFAULT_TUNING.groundFriction / DEFAULT_TUNING.runMax).toBeCloseTo(3.69 / 12.0, 6);
    expect(DEFAULT_TUNING.airFriction / DEFAULT_TUNING.runMax).toBeCloseTo(0.51 / 12.0, 6);
  });

  /**
   * `walkMax / runMax` is deliberately NOT on the preserved list — each speed is now pinned to its
   * own sheet's measurement. Asserted explicitly so nobody "restores" the old 0.462 believing it was
   * a designed relationship rather than an artefact of two eye-tuned numbers.
   */
  it('deliberately does NOT preserve walkMax / runMax', () => {
    expect(DEFAULT_TUNING.walkMax / DEFAULT_TUNING.runMax).toBeCloseTo(0.5, 6);
    expect(DEFAULT_TUNING.walkMax / DEFAULT_TUNING.runMax).not.toBeCloseTo(5.54 / 12.0, 3);
  });

  it('leaves every VERTICAL knob untouched, so the tick contract is not a locomotion casualty', () => {
    expect(DEFAULT_TUNING.gravity).toBe(2.7);
    expect(DEFAULT_TUNING.jumpVelocity).toBe(48.6);
    expect(DEFAULT_TUNING.maxFallSpeed).toBe(51.6);
    expect(DEFAULT_TUNING.jumpCutDivisor).toBe(3);
    expect(DEFAULT_TUNING.coyoteTicks).toBe(7);
    expect(DEFAULT_TUNING.jumpBufferTicks).toBe(8);
  });
});
