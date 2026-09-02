/**
 * **Where a digit string's INK sits inside the glyph box Phaser lays out for it.**
 *
 * Split out of `hud.ts` on 2026-09-02, when that file crossed the 400-line ceiling. It is one
 * concern with three pieces — the fallback, the arithmetic, and the browser measurement — and they
 * are only correct together, so they live in one file rather than three lines in three.
 *
 * Engine-free, and deliberately so twice over: `hud.ts` re-exports the first two and must stay
 * loadable under `npm run test:sim-isolated`, and `digitInkAscent` takes its `Text` **structurally**
 * rather than importing Phaser for the type. Nothing here imports anything.
 */

/**
 * How far the digits' ink centre sits below the glyph box's top, as a fraction of the font size.
 *
 * **0.5 is the fallback, not a coincidence, and not the shipped value.** `UIScene` measures the
 * real number through `measuredInkCentreFraction`; this is what answers when nothing has a browser
 * to ask, and `hudLayout` is engine-free and is called from unit tests and from `hudFits` with no
 * browser in reach.
 *
 * Half is a good fallback because `layoutAscent - digitInkAscent / 2` lands near half the em for
 * ordinary faces: a typical ascent is ~0.82 em and a figure height ~0.70 em, giving ~0.47. On the
 * face the browser actually picks for the shipped HUD it measures **exactly 0.5**
 * (`ascent 36 - 28/2 = 22`, over a 44 px font).
 *
 * ⚠️ **A fraction, not a literal.** The correction has to move with `COUNTER_FONT_PX`; a hardcoded
 * pixel count would be silently wrong the next time the font changes, which is the shape of half of
 * one earlier session's Tier 4.
 *
 * ## 🔴 What this replaced, and why it is a different quantity
 *
 * It was `DIGIT_DESCENT_FRACTION = 0.105` — "half a typical descent", ADDED to a box-centred `y`.
 * That went through two wrong versions and the second shipped:
 *
 *  1. The guess: 0.105 assumed a ~21 % descent, but the browser picks the fallback monospace face
 *     and its descent is whatever that face has. The owner reported the count sitting high.
 *  2. The measurement, with the wrong denominator: `descent / TextMetrics.fontSize / 2`.
 *     **`TextMetrics.fontSize` is `ascent + descent`** (`MeasureText.js:38`), the box HEIGHT — not
 *     the font size. On the shipped HUD that is `9 / 45 / 2 = 0.1`, which put the box top at 70.4
 *     where it needed 66, and the digits' ink centre at **92.4 against the icon's 88 — 4.4 px LOW**.
 *     The owner reported it again, in the opposite direction.
 *
 * The repair is not a third correction factor. It stops nudging a box-centred position and places
 * the box from the INK directly, off two measurements of two different strings — see
 * `measuredInkCentreFraction`.
 */
export const DIGIT_INK_CENTRE_FRACTION = 0.5;


/**
 * Where the DIGITS' ink centre sits below the glyph box's top, as a fraction of the font size.
 *
 * Takes the numbers structurally rather than importing Phaser, so this module stays engine-free and
 * `npm run test:sim-isolated` can still load it.
 *
 * ## 🔴 The two measurements are of DIFFERENT STRINGS, and conflating them is what was wrong
 *
 * - `layoutAscent` is `TextMetrics.ascent` — Phaser's measurement of the style's **test string**,
 *   `|MÉqgy` by default. That is what Phaser lays the glyph box out on and where it puts the
 *   baseline: the baseline is `boxTop + layoutAscent`.
 * - `digitInkAscent` is how far the **digits** rise above that baseline, which is smaller: an
 *   accented capital and a `|` both reach higher than a figure.
 *
 * So the digits' ink runs from `boxTop + layoutAscent - digitInkAscent` down to the baseline, and
 * its centre is `layoutAscent - digitInkAscent / 2` below the box top. That expression is the whole
 * function.
 *
 * ⚠️ **The previous version divided by `TextMetrics.fontSize`, which is NOT the font size.**
 * `MeasureText.js:38` sets it to `ascent + descent` — the box HEIGHT. Measured on the shipped HUD:
 * a 44 px font reports `{ascent: 36, descent: 9, fontSize: 45}`, so `descent / fontSize / 2` gave
 * 0.1 and pushed the box top to 70.4 when it needed to be 66. The digits' ink centre landed at
 * **92.4 against the icon's 88 — 4.4 px low**, which is what the owner reported from the device,
 * in the opposite direction from the defect the original guess was written to fix.
 *
 * Falls back when there is nothing to divide by, or when either measurement is missing.
 */
export function measuredInkCentreFraction(
  layoutAscent: number,
  digitInkAscent: number,
  fontPx: number,
): number {
  if (!(fontPx > 0)) return DIGIT_INK_CENTRE_FRACTION;
  if (!Number.isFinite(layoutAscent) || !Number.isFinite(digitInkAscent)) {
    return DIGIT_INK_CENTRE_FRACTION;
  }
  if (!(layoutAscent > 0) || !(digitInkAscent > 0)) return DIGIT_INK_CENTRE_FRACTION;
  return (layoutAscent - digitInkAscent / 2) / fontPx;
}

/**
 * How far the DIGITS rise above the baseline, in pixels, at the `Text`'s current font.
 *
 * Phaser's own `TextMetrics` cannot answer this: it measures `style.testString`, and an accented
 * capital reaches higher than a figure. The `Text`'s 2D context already has the resolved font
 * applied by `setFontSize`, so `measureText` on the digit set is a direct read of the ink that will
 * actually be drawn.
 *
 * Returns 0 — which `measuredInkCentreFraction` treats as "nothing measured" and falls back on —
 * where the context or the metric is unavailable. `actualBoundingBoxAscent` is absent on some older
 * engines, and a headless harness may have no 2D context at all.
 */
export function digitInkAscent(text: { context?: CanvasRenderingContext2D }): number {
  const ctx = text.context;
  if (!ctx || typeof ctx.measureText !== 'function') return 0;
  const m = ctx.measureText('0123456789') as TextMetrics | undefined;
  const ascent = m?.actualBoundingBoxAscent;
  return typeof ascent === 'number' && Number.isFinite(ascent) ? ascent : 0;
}

