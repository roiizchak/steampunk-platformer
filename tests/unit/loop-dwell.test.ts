/**
 * A looping animation must hold every drawn frame for the SAME number of display refreshes.
 *
 * ## The defect this pins
 *
 * The user reported the running character reading as a "ghost / double" and — the part that finally
 * located it — that moving the cadence up or down by 1 fps made no difference at all. Both are the
 * same fact: a display can only hold a frame for a WHOLE refresh, so a cadence that does not divide
 * the refresh rate evenly is served as a mixture of long and short frames.
 *
 * Before the fix, `run` was 23 ticks over 12 drawn frames: **1.917 refreshes per frame**, which a
 * 60 Hz display can only serve as eleven frames held for two refreshes and one held for one. That
 * hitch recurs 2.6 times a second on `run` and, at 36 fps, twenty times a second on `walk`. It is
 * judder, and on a body crossing the screen at 720 px/s judder reads as smearing.
 *
 * ⚠️ **The evidence for that is the arithmetic, not a headless sample.** A once-per-rAF paint
 * sample was taken and appeared to confirm it — but the harness's median rAF interval measured
 * **54.6 ms**, i.e. 18 Hz, so it was recording SwiftShader and not the cadence *(HANDOFF §14: the
 * headless harness is not the frame rate)*. A dwell histogram is only meaningful on real hardware
 * at 60 Hz. This suite therefore asserts the RATIO, which is exact, frame-rate independent, and
 * checkable without a browser; the eye confirms the rest.
 *
 * It also explains the dead knob: at 12 frames the only clean cadence anywhere near 31.3 fps is 30,
 * so every neighbouring value the tuner could reach juddered too — just with a different pattern.
 *
 * ## Why this is expressed in TICKS and not in milliseconds
 *
 * `src/sim/` counts 60 Hz ticks and nothing else, and the display is 60 Hz, so "one tick" and "one
 * refresh" are the same quantity. The invariant is therefore sayable without a clock:
 *
 *     simTicks % renderFrames === 0
 *
 * i.e. each drawn frame occupies a whole number of ticks. No milliseconds, no display assumption
 * beyond the 60 Hz the whole project already rests on.
 *
 * ## Why only LOOPS
 *
 * A one-shot's `simTicks` is a SIM WINDOW — `ATTACK`'s total, `HURT_TICKS`, `DEATH_TICKS` — and
 * `animTimings` imports those from `src/sim/combat.ts` rather than retyping them *(vault 5.3)*.
 * Rounding one to suit the art would be a balance change wearing an animation change's clothes,
 * which is the exact confusion vault 4.22 exists to prevent. Two one-shots do currently judder and
 * are asserted as such at the bottom of this file, so the fact stays visible instead of implied.
 */

import { describe, expect, it } from 'vitest';

import { TICK_HZ } from '../../src/game/constants';
import catalog from '../../public/assets/index.json';

/** Every catalog row, with the two numbers the invariant is about. */
const rows = catalog.sheets.map((s) => ({
  key: s.key,
  loop: s.loop,
  frames: s.frameCount,
  simTicks: s.simTicks,
}));

describe('a looping animation holds every frame for a whole number of refreshes', () => {
  it('the catalog actually contains loops, or the assertion below is vacuous', () => {
    // The loop-only filter is the kind that silently empties. `chase` is a loop and `death` is not,
    // so both halves of the split are asserted to be non-empty rather than assumed.
    expect(rows.filter((r) => r.loop).length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => !r.loop).length).toBeGreaterThanOrEqual(4);
  });

  for (const row of rows.filter((r) => r.loop)) {
    it(`${row.key} — ${row.simTicks} ticks over ${row.frames} frames divides evenly`, () => {
      const ticksPerFrame = row.simTicks / row.frames;
      expect(
        Number.isInteger(ticksPerFrame),
        `${row.key} holds each frame for ${ticksPerFrame.toFixed(3)} refreshes, so the display ` +
          `serves a mix of long and short frames — that is the judder. Author a cadence whose ` +
          `${TICK_HZ}/fps is a whole number (30, 20, 15, 12, 10, 7.5 ...).`,
      ).toBe(true);
      expect(ticksPerFrame).toBeGreaterThanOrEqual(1);
    });
  }
});

/**
 * The one-shots that still judder, kept as named asserted facts rather than a silence.
 *
 * Both are SIM WINDOWS and are therefore not ours to round: `attack` is `attackTotalTicks(ATTACK)`
 * and `rust-scavenger-death` is `DEATH_TICKS`. The honest fix is a frame count that divides the
 * window — which is a re-pack of the art, not an edit here. If either of these ever turns even, the
 * art or the window changed: delete the row rather than leaving the assertion red.
 */
const KNOWN_UNEVEN_ONE_SHOTS: Record<string, number> = {
  'brass-courier-attack': 2.5,
  'rust-scavenger-death': 4.5,
};

describe('recorded, not silenced: one-shots whose window does not divide by their frame count', () => {
  for (const [key, expected] of Object.entries(KNOWN_UNEVEN_ONE_SHOTS)) {
    it(`${key} still holds ${expected} refreshes per frame — the window is the sim's, not the art's`, () => {
      const row = rows.find((r) => r.key === key);
      expect(row, `${key} must stay in the catalog for this to stay observable`).toBeDefined();
      expect(row!.loop).toBe(false);
      expect(row!.simTicks / row!.frames).toBeCloseTo(expected, 5);
    });
  }
});
