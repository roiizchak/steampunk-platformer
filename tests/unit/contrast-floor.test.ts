import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import { HELP_FONT_PX, HELP_FONT_STYLE, HELP_STROKE_PX } from '../../src/render/helpBanner';
import { COUNTER_FILL, COUNTER_STROKE, COUNTER_STROKE_PX } from '../../src/render/hud';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';

/**
 * # The gear counter's contrast floor — inventory 2b.4
 *
 * The item recorded **3.13:1 and 1.13:1**, both under WCAG AA, across four levels never
 * re-measured — **and flagged that the sampling method had never been written down**, so the
 * numbers might be optimistic. Two accessibility gate owners re-derived them independently and got
 * the same failing figures.
 *
 * **All of them measured the FILL against the background and ignored the stroke** — which
 * `UIScene.ts` already documented as *"load-bearing rather than decorative: a 6 px dark outline is
 * what holds the contrast when the player walks in front of something pale."* The blocker really
 * was the missing method, exactly as the item said; it just cut the other way.
 *
 * The method itself, the per-background table and the arithmetic live in `hud.ts` beside the
 * colours. This file is that method as an executable invariant.
 *
 * ## What it holds
 *
 * A reader separates the glyph from the background by whichever ink contrasts with it, so the ratio
 * that matters is `max(fill:bg, stroke:bg)`. Swept over **every possible** background luminance
 * rather than only the shipped ones, that bottoms out at **3.80:1** — above the 3:1 bar a 14 pt
 * bold face earns at the smallest supported window, with 27 % of headroom.
 *
 * ⚠️ **A red here is not fixed by lowering `MIN_RATIO`.** It means the counter became illegible over
 * some background, and the fix is the colours, the stroke, or a backing plate.
 *
 * **The mutations this file names:** set `COUNTER_STROKE` to the fill colour; drop the stroke to
 * 0 px; darken `COUNTER_FILL` toward mid-grey.
 */

/** WCAG relative luminance, sRGB. The same formula `dropCastShadow`'s neighbour uses. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function ratio(a: number, b: number): number {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  return (hi + 0.05) / (lo + 0.05);
}
function hexLuminance(hex: string): number {
  return luminance(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );
}

/** Everything that can be drawn behind the counter — the three parallax layers and both tilesets. */
const BACKGROUNDS = [
  'public/assets/backgrounds/far.png',
  'public/assets/backgrounds/mid.png',
  'public/assets/backgrounds/near.png',
  'public/assets/tiles/industrial.png',
  'public/assets/tiles/walkway.png',
];

/**
 * The bar. **3:1**, because at 852×480 the 44 design-px bold counter draws at 19.5 physical px,
 * over WCAG's 14 pt bold (≈18.7 px) large-text threshold. Not 4.5 — and the reason is stated so
 * nobody "fixes" a future red by quietly reclassifying the text instead of the colours.
 */
const MIN_RATIO = 3;

const lumFill = hexLuminance(COUNTER_FILL);
const lumStroke = hexLuminance(COUNTER_STROKE);

/** What a reader actually gets: the better of the two inks against this background. */
function glyphContrast(background: number): number {
  return Math.max(ratio(lumFill, background), ratio(lumStroke, background));
}

describe('the gear counter stays legible over the shipped world (2b.4)', () => {
  it('the counter is large text at the smallest supported window — this sets the bar', () => {
    // 44 design px, bold, scaled by 852/1920. Asserted rather than asserted-in-a-comment, because
    // the bar below depends on it: if the font ever shrinks, 3:1 stops being the right threshold.
    const physicalPx = 44 * (852 / GAME_WIDTH);
    expect(physicalPx, `the counter draws at ${physicalPx.toFixed(1)}px — under 14pt bold`).toBeGreaterThanOrEqual(
      18.66,
    );
    expect(GAME_HEIGHT).toBe(1080);
  });

  it('the two inks are distinguishable from EACH OTHER', () => {
    // The glyph has to read as a glyph even where the background helps neither ink. 14.45:1.
    expect(ratio(lumFill, lumStroke)).toBeGreaterThan(7);
  });

  it('the stroke is thick enough to be the ink a reader sees', () => {
    // A 1 px stroke on a 44 px glyph is an anti-aliasing artefact, not a contrast mechanism. The
    // measurement above assumes the stroke is genuinely visible at the glyph's edge.
    expect(COUNTER_STROKE_PX).toBeGreaterThanOrEqual(4);
  });

  for (const path of BACKGROUNDS) {
    it(`${path.split('/').pop()}: legible over its brightest AND darkest pixel`, () => {
      const png = readPng(path);
      expect(png.width, `${path} decoded empty`).toBeGreaterThan(0);

      let min = 1;
      let max = 0;
      let opaque = 0;
      for (let p = 0; p < png.width * png.height; p += 1) {
        const i = p * 4;
        if (png.data[i + 3]! < 250) continue;
        opaque += 1;
        const L = luminance(png.data[i]!, png.data[i + 1]!, png.data[i + 2]!);
        if (L < min) min = L;
        if (L > max) max = L;
      }
      // Non-vacuity: a fully transparent sheet would make both extremes meaningless.
      expect(opaque, `${path} has no opaque pixels`).toBeGreaterThan(1000);

      expect(
        glyphContrast(max),
        `${path}: over its brightest pixel the glyph reaches ${glyphContrast(max).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_RATIO);
      expect(
        glyphContrast(min),
        `${path}: over its darkest pixel the glyph reaches ${glyphContrast(min).toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MIN_RATIO);
    });
  }

  it('holds over EVERY possible background, not only the shipped ones', () => {
    // The invariant the per-file checks above cannot give: a new level, a re-generated background or
    // a recoloured tileset can introduce a luminance none of the five shipped files contains. The
    // worst case is a mid-luminance background where neither ink is favoured — swept, not solved.
    let worst = Infinity;
    let worstAt = 0;
    for (let i = 0; i <= 1000; i += 1) {
      const L = i / 1000;
      const c = glyphContrast(L);
      if (c < worst) {
        worst = c;
        worstAt = L;
      }
    }
    expect(
      worst,
      `the worst background luminance is ${worstAt.toFixed(3)}, where the glyph reaches ` +
        `${worst.toFixed(2)}:1. Do NOT lower MIN_RATIO — change the colours, the stroke, or add a ` +
        `backing plate.`,
    ).toBeGreaterThanOrEqual(MIN_RATIO);
  });

  it('the CONTROLS BANNER is LARGE text, which is what makes 3:1 the formal bar for it too', () => {
    // 🔴 The banner is the element this method was never pointed at. It shipped as bare
    // `#8f8776` with no stroke and no plate, over the busiest band of the backdrop, measured at
    // **8 CSS px of ink** in a 852x480 production capture — worst-case contrast **2.27:1**, under
    // even the large-text bar, on text a third the counter's size.
    //
    // Both halves were fixed, and the SIZE half is what makes the number formal rather than argued.
    const physicalPx = HELP_FONT_PX * (852 / GAME_WIDTH);
    expect(
      physicalPx,
      `the banner draws at ${physicalPx.toFixed(1)}px — under WCAG's 14pt bold large-text ` +
        'threshold, so MIN_RATIO = 3 does not apply to it and the bar is 4.5:1',
    ).toBeGreaterThanOrEqual(18.66);
    expect(HELP_FONT_STYLE, 'the 18.66px threshold is the BOLD one — unbold, the bar is 24px').toBe('bold');
    expect(HELP_STROKE_PX, 'a thin stroke is an anti-aliasing artefact, not a contrast mechanism')
      .toBeGreaterThanOrEqual(4);
    // It reuses the counter's ink pair, so the sweep above already covers its worst case — this
    // pins that it is still the SAME pair, which is the only reason that coverage transfers.
    expect([COUNTER_FILL, COUNTER_STROKE]).toEqual(['#f7e3b8', '#1a1410']);
  });

  it('🔴 and the SMALL-text bar would have forced white-on-black — the road not taken', () => {
    // Why the size moved instead of the colours, kept as an executable record rather than a claim.
    //
    // For two inks over an ARBITRARY background the worst case has a closed form: the crossover
    // where neither ink is favoured sits at `sqrt((Lfill + 0.05) / (Lstroke + 0.05))`. Clearing
    // 4.5:1 therefore needs those terms 20.25x apart — which pins the fill within a hair of pure
    // white and the stroke at #060606 or darker. That is a STYLE.md change, and it would have left
    // the banner 8 px tall: high-contrast and still unreadable.
    const worstOver = (fill: string, stroke: string): number =>
      Math.sqrt((hexLuminance(fill) + 0.05) / (hexLuminance(stroke) + 0.05));
    // The closed form agrees with the numeric sweep the counter's test above runs. If these ever
    // disagree, one of the two models is wrong and no number in this file can be trusted.
    expect(worstOver(COUNTER_FILL, COUNTER_STROKE)).toBeCloseTo(glyphContrast(0.169), 1);

    expect(worstOver(COUNTER_FILL, COUNTER_STROKE), 'the shipped pair').toBeGreaterThanOrEqual(MIN_RATIO);
    expect(worstOver(COUNTER_FILL, COUNTER_STROKE), 'and it does NOT clear the small-text bar').toBeLessThan(4.5);
    // The frontier itself, so nobody re-derives it: these are the pairs that WOULD have worked.
    expect(worstOver('#ffffff', '#000000')).toBeGreaterThanOrEqual(4.5);
    expect(worstOver('#fffdf8', '#000000'), 'the warmest fill that clears 4.5').toBeGreaterThanOrEqual(4.5);
    expect(worstOver('#fffaf0', '#000000'), 'one step warmer and it fails').toBeLessThan(4.5);
    expect(worstOver('#ffffff', '#070707'), 'one step lighter on the stroke and it fails').toBeLessThan(4.5);
  });

  it('and the floor is a real floor — the sweep found a genuine minimum', () => {
    // The counter-fixture for the sweep: if `glyphContrast` were constant, the loop above would
    // "pass" while measuring nothing. A real pair of inks has a crossover, and it is well below
    // both endpoints.
    expect(glyphContrast(0)).toBeGreaterThan(10);
    expect(glyphContrast(1)).toBeGreaterThan(10);
    expect(glyphContrast(0.169)).toBeLessThan(5);
  });
});
