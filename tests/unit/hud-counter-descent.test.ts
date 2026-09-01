/**
 * **The gear counter's descender nudge — split from `hud-layout.test.ts` at the 400-line ceiling.**
 *
 * Phaser `Text` lays out on the font's full ascent + descent box. Digits have no descenders, so
 * centring that box leaves the ink sitting high next to the gear icon, which is centred on its own
 * bounds. The correction is half the descent.
 *
 * 🔴 The value was a GUESS until 2026-09-01 — `DIGIT_DESCENT_FRACTION = 0.105`, from "a typical
 * font's descent is ~21 %". The owner reported the count still reading high on a real device, and
 * the reason was that the browser picks the fallback monospace face and its descent is whatever
 * that face has. `UIScene` measures it now and passes it in; this file gates the layout half.
 *
 * ⚠️ The other half — that `UIScene` actually measures and actually passes it, in that order —
 * cannot be reached from here. `UIScene` value-imports Phaser, so it is gated by source text in
 * `sprite-draw-path.test.ts`. Neither file can make the other's claim: dropping the argument in
 * `UIScene` leaves every case below green.
 */

import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { HUD_SLOT } from '../../src/render/playerHud';
import {
  DIGIT_DESCENT_FRACTION,
  hudFits,
  hudLayout,
  measuredDigitDescent,
} from '../../src/render/hud';

/**
 * # The counter's digits centre on their INK, not on their glyph box (inventory 3.8, clause 2)
 *
 * Item 3.8 named three UI defects. The padding half was fixed; **this one was silently left out and
 * never recorded** — found by the S.7 gate owner, which makes it a C11 gap as well as a visual one.
 *
 * Phaser `Text` lays out on the font's full ascent + descent box. Digits have no descenders, so
 * centring that box leaves the ink sitting **2–4 px high** next to the gear icon, which is centred
 * on its own bounds.
 *
 * ⚠️ Changing `counter.y` moved **no test at all** — 2283 passed before and after. That is the
 * finding this file exists to close: the value was ungated, so the defect could be introduced or
 * removed without anything noticing, in either direction.
 *
 * **The mutation this names:** drop the `+ fontPx * DIGIT_DESCENT_FRACTION` term.
 */
describe('the gear counter is nudged for the descender it does not have (3.8)', () => {
  const layout = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);

  /** Where a naive ascent+descent centring would put it — the defect's position. */
  function naiveY(l: ReturnType<typeof hudLayout>): number {
    return l.plate.y + l.plate.h / 2 - l.counter.fontPx / 2;
  }

  it('sits BELOW naive centring — the whole point', () => {
    expect(
      layout.counter.y,
      'the counter is centred on its glyph box again, so the digits read high',
    ).toBeGreaterThan(naiveY(layout));
  });

  it('the nudge is a plausible half-descent, not an arbitrary shove', () => {
    // Asserted as a range rather than an equality: an equality against the constant would be the
    // same expression twice and could never fail. A half-descent is ~10% of the em box; anything
    // outside 5–15% is a different decision that should be argued, not tuned in.
    const nudge = (layout.counter.y - naiveY(layout)) / layout.counter.fontPx;
    expect(nudge, `nudge is ${(nudge * 100).toFixed(1)}% of the font size`).toBeGreaterThan(0.05);
    expect(nudge).toBeLessThan(0.15);
  });

  it('uses the SUPPLIED fraction, so a measured value really reaches the layout', () => {
    // 🔴 The parameter half of the 2026-09-01 repair. `DIGIT_DESCENT_FRACTION` was a guess at the
    // fallback font's descent; `UIScene` now measures the real one and passes it in. If `hudLayout`
    // ignored the argument, the measurement would be computed, discarded, and the counter would sit
    // exactly where the guess put it — a repair that changes nothing while reading as done.
    const supplied = 0.2;
    const measured = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT, supplied);
    const nudge = (measured.counter.y - naiveY(measured)) / measured.counter.fontPx;
    expect(nudge, 'the supplied fraction was ignored').toBeCloseTo(supplied, 6);
    expect(
      measured.counter.y,
      'the supplied value produced the same y as the default — the parameter is inert',
    ).not.toBeCloseTo(layout.counter.y, 6);
  });

  it('falls back to the guess when nothing measured, and HALVES what it is given', () => {
    // `measuredDigitDescent` is the only place the /2 lives. Passing a full descent must yield half
    // of it — the mutation that drops the `/ 2` doubles every nudge while calling itself measured.
    expect(measuredDigitDescent({ descent: 0.42, fontSize: 2 })).toBeCloseTo(0.105, 6);
    expect(measuredDigitDescent({ descent: 10, fontSize: 0 })).toBe(DIGIT_DESCENT_FRACTION);
    expect(measuredDigitDescent({ descent: Number.NaN, fontSize: 44 })).toBe(
      DIGIT_DESCENT_FRACTION,
    );
  });

  it('scales with the font — it is a fraction, not a literal', () => {
    // The regression that a hardcoded 4 px would cause: correct at 1920x1080, wrong everywhere else.
    // This is half of what Tier 4 was about.
    const small = hudLayout(852, 480, HUD_SLOT);
    const big = hudLayout(GAME_WIDTH, GAME_HEIGHT, HUD_SLOT);
    const smallNudge = (small.counter.y - naiveY(small)) / small.counter.fontPx;
    const bigNudge = (big.counter.y - naiveY(big)) / big.counter.fontPx;
    expect(smallNudge).toBeCloseTo(bigNudge, 6);
  });

  it('still leaves the whole HUD on screen at the minimum window', () => {
    // The counter moving down cannot be allowed to push it off the bottom — `hudFits` measures the
    // counter's bottom as `y + fontPx`, so the nudge is inside that budget or it is not.
    expect(hudFits(hudLayout(852, 480, HUD_SLOT), 852, 480, 60)).toBe(true);
  });
});
