/**
 * **The gear counter centres on its digits' INK, not on its glyph box.**
 *
 * Renamed from `hud-counter-descent.test.ts` on 2026-09-02, because "the descent" stopped being the
 * quantity. Phaser lays a `Text` out on its style's TEST STRING (`|MÉqgy`) and puts the baseline at
 * `boxTop + ascent`. Digits are shorter than that ascent and have no descender, so their ink is not
 * centred in that box — and the gear icon beside them IS centred on its own bounds.
 *
 * ## 🔴 Two wrong answers shipped before this one, in opposite directions
 *
 * 1. `DIGIT_DESCENT_FRACTION = 0.105`, a guess at "half a typical descent", ADDED to a box-centred
 *    `y`. The browser picks the fallback monospace face and its descent is whatever that face has.
 *    The owner reported the count reading HIGH.
 * 2. The measurement with the wrong denominator: `descent / TextMetrics.fontSize / 2`.
 *    **`TextMetrics.fontSize` is `ascent + descent`** (`MeasureText.js:38`) — the box height, not
 *    the font size. The owner reported it again, now **4.4 px LOW**.
 *
 * The numbers below are not invented: they are what the shipped HUD measures in a real browser,
 * read off the running game at a 1000x450 viewport.
 *
 * ⚠️ Half of this claim cannot be reached from here. `UIScene` value-imports Phaser, so "it takes
 * both measurements, in the right order, and passes them" is gated by source text in
 * `sprite-draw-path.test.ts`, and the end-to-end ink position is gated in
 * `tests/e2e/phase-06-hud.spec.ts`. Neither file can make the others' claim.
 */

import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { HUD_SLOT } from '../../src/render/playerHud';
import {
  DIGIT_INK_CENTRE_FRACTION,
  hudFits,
  hudLayout,
  measuredInkCentreFraction,
} from '../../src/render/hud';

/**
 * What a real browser reports for the shipped 44 px counter, measured off the running game.
 *
 * `layoutAscent`/`layoutDescent` are `getTextMetrics()` — Phaser's read of `|MÉqgy`.
 * `digitInkAscent` is `measureText('0123456789').actualBoundingBoxAscent` on the same context.
 */
const MEASURED = { layoutAscent: 36, layoutDescent: 9, digitInkAscent: 28, fontPx: 44 } as const;

/** Where the ink centre lands, given a box top and the two measurements. */
function inkCentre(boxTop: number): number {
  // Baseline is `boxTop + layoutAscent`; the digits rise `digitInkAscent` above it and go no lower.
  const baseline = boxTop + MEASURED.layoutAscent;
  return baseline - MEASURED.digitInkAscent / 2;
}

describe('the counter is placed from its ink', () => {
  it('lands the digits EXACTLY on the icon centre, at the measured font', () => {
    // 🔴 The case the owner's two reports are about, in one assertion. The gear icon is centred on
    // the plate's vertical middle, so that middle is the target.
    const fraction = measuredInkCentreFraction(
      MEASURED.layoutAscent,
      MEASURED.digitInkAscent,
      MEASURED.fontPx,
    );
    const l = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT, fraction);
    const middle = l.plate.y + l.plate.h / 2;

    expect(l.counter.fontPx, 'these measurements were taken at 44 px').toBe(MEASURED.fontPx);
    expect(middle, 'the icon is centred here — see hudLayout').toBe(l.gearIcon.y + l.gearIcon.h / 2);
    expect(inkCentre(l.counter.y), 'the digits are not level with the gear icon').toBeCloseTo(
      middle,
      6,
    );
  });

  it('does NOT reproduce either shipped mistake', () => {
    const l = hudLayout(
      GAME_WIDTH,
      GAME_HEIGHT,
      HUD_SLOT,
      measuredInkCentreFraction(MEASURED.layoutAscent, MEASURED.digitInkAscent, MEASURED.fontPx),
    );
    const middle = l.plate.y + l.plate.h / 2;

    // Mistake 2, the one on the owner's screen: `descent / (ascent+descent) / 2` = 9/45/2 = 0.1,
    // added to a box-centred y. That put the box top at 70.4 and the ink 4.4 px low.
    const shipped = middle - MEASURED.fontPx / 2 + MEASURED.fontPx * 0.1;
    expect(shipped, 'the arithmetic that shipped').toBeCloseTo(70.4, 6);
    expect(inkCentre(shipped) - middle, 'the defect the owner reported').toBeCloseTo(4.4, 6);
    expect(l.counter.y, 'the counter is back where the reported defect put it').not.toBeCloseTo(
      shipped,
      3,
    );

    // Mistake 1, the guess: the same shape with 0.105. Also low, by a little more.
    const guessed = middle - MEASURED.fontPx / 2 + MEASURED.fontPx * 0.105;
    expect(inkCentre(guessed)).toBeGreaterThan(middle);
  });
});

describe('measuredInkCentreFraction', () => {
  it('is the box top to ink centre distance, over the font size', () => {
    // 36 - 28/2 = 22, over 44. Stated as the arithmetic rather than as 0.5, because 0.5 is a
    // coincidence of this font and an equality against the constant could never fail.
    expect(measuredInkCentreFraction(36, 28, 44)).toBeCloseTo((36 - 28 / 2) / 44, 9);
    // A different face: a taller ascent and shorter figures push the ink centre further down.
    expect(measuredInkCentreFraction(40, 24, 44)).toBeCloseTo((40 - 12) / 44, 9);
    expect(measuredInkCentreFraction(40, 24, 44)).toBeGreaterThan(measuredInkCentreFraction(36, 28, 44));
  });

  it('HALVES the digit ascent and does not halve the layout ascent', () => {
    // The mutation this names: drop the `/ 2`, or halve the wrong term. Both change the answer.
    expect(measuredInkCentreFraction(36, 28, 44)).not.toBeCloseTo((36 - 28) / 44, 4);
    expect(measuredInkCentreFraction(36, 28, 44)).not.toBeCloseTo((36 / 2 - 28 / 2) / 44, 4);
  });

  it('falls back when nothing was measured, rather than dividing by a missing number', () => {
    const cases: ReadonlyArray<readonly [number, number, number]> = [
      [36, 28, 0],
      [36, 0, 44],
      [0, 28, 44],
      [Number.NaN, 28, 44],
      [36, Number.NaN, 44],
    ];
    for (const [layoutAscent, ink, fontPx] of cases) {
      expect(
        measuredInkCentreFraction(layoutAscent, ink, fontPx),
        `measuredInkCentreFraction(${layoutAscent}, ${ink}, ${fontPx}) should fall back`,
      ).toBe(DIGIT_INK_CENTRE_FRACTION);
    }
  });
});

describe('the layout consumes the fraction honestly', () => {
  it('uses the SUPPLIED value, so a measurement really reaches the layout', () => {
    // 🔴 If `hudLayout` ignored the argument, the measurement would be computed, discarded, and the
    // counter would sit exactly where the fallback put it — a repair that changes nothing while
    // reading as done.
    const supplied = 0.42;
    const l = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT, supplied);
    const middle = l.plate.y + l.plate.h / 2;
    expect((middle - l.counter.y) / l.counter.fontPx, 'the supplied fraction was ignored').toBeCloseTo(
      supplied,
      6,
    );
    expect(
      l.counter.y,
      'the supplied value produced the same y as the default — the parameter is inert',
    ).not.toBeCloseTo(hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT).counter.y, 6);
  });

  it('scales with the font — it is a fraction, not a literal', () => {
    // The regression a hardcoded pixel count would cause: correct at 1920x1080, wrong everywhere
    // else. `hudLayout` scales off HEIGHT, so a shorter view is the case that moves.
    const small = hudLayout(852, 480, HUD_SLOT);
    const big = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    const frac = (l: ReturnType<typeof hudLayout>): number =>
      (l.plate.y + l.plate.h / 2 - l.counter.y) / l.counter.fontPx;
    expect(small.counter.fontPx, 'the two views share a font size — this proves nothing').not.toBe(
      big.counter.fontPx,
    );
    expect(frac(small)).toBeCloseTo(frac(big), 6);
  });

  it('still leaves the whole HUD on screen at the minimum window', () => {
    // `hudFits` measures the counter's bottom as `y + fontPx`, so the placement is inside that
    // budget or it is not.
    expect(hudFits(hudLayout(852, 480, HUD_SLOT), 852, 480, 60)).toBe(true);
  });
});
