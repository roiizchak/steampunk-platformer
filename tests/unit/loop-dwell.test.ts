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
 * ## One-shots are held to it too, and the lever is NOT the window
 *
 * This file used to gate loops only, and carried a `KNOWN_UNEVEN_ONE_SHOTS` list recording that
 * `brass-courier-attack` (2.5) and `rust-scavenger-death` (4.5) juddered on purpose. The reason
 * given was sound as far as it went: a one-shot's `simTicks` is a SIM WINDOW — `ATTACK`'s total,
 * `HURT_TICKS`, `DEATH_TICKS` — which `animTimings` imports from `src/sim/combat.ts` rather than
 * retyping *(vault 5.3)*, so rounding one to suit the art would be a balance change wearing an
 * animation change's clothes.
 *
 * **All of that is still true, and none of it makes the judder necessary.** The list named the fix
 * itself — *"a frame count that divides the window"* — and then called it impossible, on a belief
 * that a one-shot's frame count is detected from the art. It is not. It is **declared**, in
 * `VIDEO_MOTIONS[action].frames` (`tools/gen/motion.mjs`, `motionCombat.mjs`), and
 * `build-clips.mjs:293` samples exactly that many source frames out of the clip. The window is the
 * sim's and stays untouched; the frame count is ours and always was.
 *
 * So the invariant is the same for both kinds, and only the lever differs:
 *
 * | | lever | held by |
 * |---|---|---|
 * | loop | the authored cadence, `60/fps` whole | `character-bounds*.json` |
 * | one-shot | the declared frame count, a divisor of the window | `VIDEO_MOTIONS[a].frames` |
 *
 * ⚠️ **A one-shot's frame count is therefore load-bearing, not a taste setting.** Changing it
 * without checking it still divides the window is what put five rows on this list; that is what
 * this file now catches. `tests/unit/one-shot-divisor.test.ts` gates the declared counts directly,
 * so the two are checked at the spec as well as at the shipped catalog.
 */

import { describe, expect, it } from 'vitest';

import { TICK_HZ } from '../../src/game/constants';
import catalog from '../../public/assets/index.json';
import { BLOCKED_ON_ART } from './blockedDwell';

/** Every catalog row, with the two numbers the invariant is about. */
const rows = catalog.sheets.map((s) => ({
  key: s.key,
  loop: s.loop,
  frames: s.frameCount,
  simTicks: s.simTicks,
}));

/** What a row's lever is called, so a failure message names the file to go and edit. */
const leverFor = (loop: boolean): string =>
  loop
    ? `author a cadence whose ${TICK_HZ}/fps is a whole number (30, 20, 15, 12, 10, 7.5 ...) in ` +
      `the slug's character-bounds file`
    : `declare a frame count that DIVIDES the window in VIDEO_MOTIONS[action].frames ` +
      `(tools/gen/motion.mjs or motionCombat.mjs), then re-run assets:clips and assets:build. ` +
      `The window belongs to src/sim/ and is never the thing to round`;

describe('every animation holds every frame for a whole number of refreshes', () => {
  it('the catalog contains both kinds, or half the assertion below is vacuous', () => {
    // Either filter is the kind that silently empties. `chase` is a loop and `death` is not, so
    // both halves are asserted to be non-empty rather than assumed.
    expect(rows.filter((r) => r.loop).length).toBeGreaterThanOrEqual(5);
    expect(rows.filter((r) => !r.loop).length).toBeGreaterThanOrEqual(4);
  });

  for (const row of rows.filter((r) => !(r.key in BLOCKED_ON_ART))) {
    it(`${row.key} — ${row.simTicks} ticks over ${row.frames} frames divides evenly`, () => {
      const ticksPerFrame = row.simTicks / row.frames;
      expect(
        Number.isInteger(ticksPerFrame),
        `${row.key} holds each frame for ${ticksPerFrame.toFixed(3)} refreshes, so the display ` +
          `serves a mix of long and short frames — that is the judder. To fix it, ${leverFor(row.loop)}.`,
      ).toBe(true);
      expect(ticksPerFrame).toBeGreaterThanOrEqual(1);
    });
  }
});

/**
 * The exception, asserted in BOTH directions so it cannot rot into a permanent excuse.
 *
 * Red if the row leaves the catalog, red if its dwell changes at all — including if the art gets
 * fixed and the row turns even, which is the case a one-way "we know this one is bad" assertion
 * silently swallows. Delete the entry when it goes green, do not relax it.
 */
describe('the row whose fix is blocked on art, not on arithmetic', () => {
  for (const [key, { ticksPerFrame, wants }] of Object.entries(BLOCKED_ON_ART)) {
    it(`${key} still holds ${ticksPerFrame} refreshes per frame and still wants ${wants} frames`, () => {
      const row = rows.find((r) => r.key === key);
      expect(row, `${key} must stay in the catalog for this to stay observable`).toBeDefined();
      expect(row!.simTicks / row!.frames).toBeCloseTo(ticksPerFrame, 6);
      expect(
        row!.simTicks % wants,
        `${wants} frames is recorded as the fix for ${key} but does not divide ${row!.simTicks}`,
      ).toBe(0);
    });
  }

  it('is exactly one row — every other one-shot was fixed, and the list must not grow quietly', () => {
    expect(Object.keys(BLOCKED_ON_ART)).toHaveLength(1);
    const uneven = rows.filter((r) => !Number.isInteger(r.simTicks / r.frames)).map((r) => r.key);
    expect(uneven).toEqual(Object.keys(BLOCKED_ON_ART));
  });
});
