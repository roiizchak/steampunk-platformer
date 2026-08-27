/**
 * The controls banner's geometry, inks and type — split out of `hud.ts` on 2026-08-26.
 *
 * ## Why the seam is here
 *
 * `hud.ts` owns the HUD PLATE: the portrait, the health bar, the gear counter, and `hudLayout`'s
 * scaling. The controls banner is a different element with a different job — it is the only place
 * the game tells anyone what the keys are. What they share is `HUD_MARGIN`, the plate's height,
 * `COUNTER_GAP`, and the counter's ink pair, all imported below.
 *
 * ⚠️ **It used to sit BELOW the plate and wrap at the full view width**, and this header said so
 * for two sessions after it stopped being a design and started being a defect. The owner played the
 * production build and found the reason: a full-width strip of 44 px bold text drawn across the
 * middle of the play area. It now sits in the empty band to the RIGHT of the gear counter, on the
 * HUD's own row — `helpBannerLayout()` below.
 *
 * The split was forced by the 400-line rule (`hud.ts` reached 457), and it is a real seam rather
 * than a convenience: every constant here is derived from, or measured against, the banner's own
 * legibility argument, and none of it is read by the plate.
 */

// The banner draws with the counter's own ink pair — `COUNTER_FILL` / `COUNTER_STROKE`, imported
// by `gameDev.ts` at the draw site rather than re-exported here, so there is one definition and one
// import path for them. `HELP_STROKE_PX` below is the only ink constant this file owns.
import { COUNTER_GAP, HUD_MARGIN, HUD_PLATE } from './hud';

/**
 * The controls banner's inks and outline — **the counter's pair, reused deliberately.**
 *
 * ## Why the banner needed this at all
 *
 * It shipped as bare `#8f8776` with **no stroke and no plate**, drawn straight across the busiest
 * band of the backdrop. A 852×480 production capture measured **8 CSS px of ink**, and the
 * `F / L attack` segment lands on the boiler gauges — the brightest cluster in `mid.png`. The
 * counter's own note two blocks up says it plainly: *"`COUNTER_STROKE` is load-bearing, not
 * decoration."* The banner never got the load-bearing part.
 *
 * ## Why the FILL moved too, and not only the stroke
 *
 * Measured against the same sweep `contrast-floor.test.ts` runs — the worst mid-luminance
 * background, where neither ink is favoured:
 *
 * | fill (with `#1a1410` stroke) | worst-case glyph contrast |
 * |---|---|
 * | `#8f8776`, as shipped | **2.27:1** — fails even the large-text bar |
 * | `#c8c0ae` | 3.18:1 |
 * | `COUNTER_FILL` `#f7e3b8` | **3.80:1** |
 *
 * Adding a stroke under the old muted fill would still have failed, because the fill is
 * mid-luminance itself and a stroke only helps where the fill does not. So the fix is the counter's
 * **pair**, not half of it.
 *
 * ## 🔴 The ceiling, stated rather than papered over
 *
 * The banner is **small** text — 8 px, nowhere near the 14 pt bold that justified the counter's
 * 3:1 bar — so WCAG AA would ask for **4.5:1**. **No fill can reach it.** Swept across every
 * possible background luminance, even pure white over this stroke tops out at **4.27:1**. That is a
 * property of two inks over an arbitrary background, not a tuning problem, and the only thing that
 * beats it is a scrim that makes the background KNOWN rather than arbitrary.
 *
 * **A backing plate is therefore the open option, not a rejected one** — the counter's note above
 * records a plate as pre-authorised-if-needed and unneeded in the event. Here it is needed for the
 * formal bar and deliberately deferred: 2.27 → 3.80 is the improvement available for four lines and
 * no occlusion, and the banner is a persistent, static, redundant hint rather than content the
 * player must read to act. **Owner's call whether the last 0.7 is worth a plate.**
 *
 * 4 px and not the counter's 6: the stroke has to read at the glyph's edge without closing the
 * counters of an 8 px monospace glyph, which is a third the counter's size.
 */
export const HELP_STROKE_PX = 4;

/**
 * The controls banner's type size, in DESIGN pixels *(session inventory 2.5, fixed 2026-08-23)*.
 *
 * 🔴 **It was `'18px'`, hard-coded in `gameDev.ts`, which is ~8 physical pixels at 852 × 480** — a
 * third under the ~11 px floor the counter above is sized against, and confirmed illegible in a
 * playtest screenshot rather than inferred.
 *
 * That matters more than it sounds: the banner **ships**, and it is the only place the game tells
 * anyone the controls at all — `helpLine()`'s own comment says the mute keys and `ESC levels` are in
 * the shipped half deliberately, because *"a mute control the player cannot discover is a mute
 * control they do not have."* An illegible banner is those controls not existing.
 *
 * 🔴 **44 AND BOLD, which is the gear counter's own size and weight — raised from 28 on
 * 2026-08-26 to reach a FORMAL WCAG figure rather than an argued one.**
 *
 * At 28 the banner drew at 28 × 0.44375 = **12.4 physical px** at 852×480, with ~8 px of actual
 * ink, and a production capture showed it unreadable across the boiler gauges. That is **small**
 * text, so WCAG AA asks **4.5:1** — and the closed form for two inks over an arbitrary background,
 * `sqrt((Lfill + 0.05) / (Lstroke + 0.05))`, tops out below that for any fill this palette contains.
 * Reaching 4.5 by colour alone forces a fill within a hair of pure white (`#fffdf8` clears at 4.545;
 * `#fffaf0` fails at 4.493) over a stroke of `#060606` or darker. White-on-black, and the text would
 * still be 8 px.
 *
 * **44 × 0.44375 = 19.5 physical px, bold** clears WCAG's 14 pt bold large-text threshold
 * (≈18.66 px), so the bar is **3:1** — and the shipped ink pair measures **3.80:1**. Formal
 * conformance, the locked palette untouched, and the banner is now legible rather than merely
 * high-contrast. The same arithmetic and the same threshold the counter already uses, quoted from
 * `COUNTER_FILL`'s block above rather than re-argued.
 *
 * ⚠️ **The cost is real and it is vertical, and the number below is no longer two.** This block used
 * to end *"~115 characters at 44 px monospace is far wider than the 1872 px wrap width, so the banner
 * is now two lines"*. The banner no longer wraps at 1872 px: it wraps inside the band right of the
 * gear counter, which is roughly two thirds of that. The owner's decision this session was **keep
 * every key printed and allow three lines**, so no row count is written down anywhere — the draw site
 * measures it with `getWrappedText()` and `helpBannerLayout()` centres whatever it found.
 */
export const HELP_FONT_PX = 44;

/** Bold, for the same reason the counter is: 14 pt BOLD is the threshold 19.5 px clears. */
export const HELP_FONT_STYLE = 'bold';

/**
 * Where the banner is drawn, given a MEASURED counter right edge.
 *
 * ## Why it takes a measurement and not a formula
 *
 * The first draft computed the counter's right edge from `GEAR_ICON_PX`, `COUNTER_FONT_PX` and a
 * digit count. Codex plan review round 1, finding 2, killed it: two of those are private to
 * `hud.ts`, the digit count was hard-coded at 2 while `counterText()` derives it from
 * `MAX_LEVEL_GEARS`, and — the part that mattered — Phaser wraps on the browser's own
 * `measureText()`, so any advance-width estimate is fiction that happens to agree at one font size.
 * The caller reads `counter.width` off the live `Text` and passes it in.
 *
 * ⚠️ **The caller must read that width AFTER `setFontSize()`**, never before. Phaser's setter
 * synchronously calls `updateText()`, which synchronously rewrites `Text.width`, so a read taken
 * first during a resize returns the PREVIOUS scale's width — the banner would land correctly on
 * first build and drift on every resize after. Codex round 2, finding 9. `UIScene.applyLayout()`
 * already positions then sizes in that order; `helpBannerLayer.ts` lays out after it and gates the
 * ordering behaviourally.
 *
 * ## Why `lineCount` is a parameter
 *
 * Because four different strings go through here and none of them may be a special case: the
 * shipped legend, the DEV legend with its three extra keys, and the Playground and Element Editor
 * legends, which are different again. The owner's decision this session was **keep every key
 * printed and allow three lines**, so a row count can never be assumed — the caller measures it
 * with `getWrappedText().length` and passes what it found.
 *
 * `y` centres those lines on the plate's own vertical middle, so a short form reads as part of the
 * HUD assembly. It is then **clamped** to the top margin: a tall form grows DOWNWARD into the empty
 * band beside the plate rather than off the top of the screen, which is what an uncorrected centring
 * does at four rows.
 */
export interface HelpBannerLayout {
  x: number;
  y: number;
  wrapPx: number;
  fontPx: number;
  lineHeightPx: number;
}

/**
 * Phaser's own default line spacing for `Text` — 1.2 × the font size, one place.
 *
 * Not a tuning knob. It is here so `y`'s centring arithmetic and the caller's idea of how tall the
 * banner is cannot disagree; if the draw site ever sets `lineSpacing`, this is what has to move.
 */
export const HELP_LINE_HEIGHT_RATIO = 1.2;

export function helpBannerLayout(
  counterRightPx: number,
  gameWidthPx: number,
  scale: number,
  lineCount: number,
): HelpBannerLayout {
  const margin = HUD_MARGIN * scale;
  const x = counterRightPx + COUNTER_GAP * scale;
  const fontPx = HELP_FONT_PX * scale;
  const lineHeightPx = fontPx * HELP_LINE_HEIGHT_RATIO;

  const plateMiddle = margin + (HUD_PLATE.h * scale) / 2;
  const centred = plateMiddle - (lineCount * lineHeightPx) / 2;

  return {
    x,
    y: Math.max(margin, centred),
    // 🔴 The STROKE is subtracted, and it is not a rounding fudge.
    //
    // `wordWrap.width` bounds where Phaser breaks LINES; the 4 px outline is then drawn outside
    // that, and Phaser adds `strokeThickness` to the object's measured width. So a banner wrapped
    // to exactly the remaining band draws about one stroke past it. Measured, not predicted: the
    // e2e right-margin assertion failed by 1.56 px at 852 x 480 on the first run, which is what
    // this term is. A layout that asks for an outline has to leave room for the outline.
    //
    // Never negative either: a game narrow enough to leave no band would otherwise hand Phaser a
    // negative wrap width, which wraps every word onto its own row instead of failing.
    wrapPx: Math.max(0, gameWidthPx - x - margin - HELP_STROKE_PX * scale),
    fontPx,
    lineHeightPx,
  };
}
