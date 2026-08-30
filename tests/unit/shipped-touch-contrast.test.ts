/**
 * Criterion 12.14, the half that is measurable: does the engraving reach WCAG 1.4.11's 3:1 over
 * every background, at the size the smallest in-scope phone actually draws it?
 *
 * Split out of `shipped-touch.test.ts` at the 400-line rule. Whether a wrench READS as a wrench at
 * 48 CSS px is not measurable and is not claimed here: that is `ui-ux-tester`'s call under 12.14
 * and the owner's under 12.24 *(vault 9.3)*.
 *
 * ⚠️ **And the figure is a BOX-FILTER PROXY, not a photograph of a phone.** Production hands the
 * downscale to the browser (`image-rendering: auto` at a fractional canvas scale); this measures
 * `resize.mjs`'s deterministic box filter at the same output size. Nothing here proves the two
 * agree. Codex round-11 — the QA log's 12.14 row says the same in the same words.
 */

import { describe, expect, it } from 'vitest';

import { ART_ALPHA, ART_ALPHA_PRESSED } from '../../src/scenes/touchMarks';
import { downscale } from '../../tools/gen/resize.mjs';
import {
  KEYS,
  TRUE_SIZE_PX,
  cutFace,
  luminance,
  markComponents,
  ratio,
  shippedFace,
} from './touchFaces';

describe('the shipped touch faces', () => {
  it('reaches the 3:1 contrast floor over EVERY background, on EVERY stroke', () => {
    // 🔴 **Measured on the MARK, and the first version was not.** Scanning the whole face and
    // keeping the best pixel let a decorative brass highlight OUTSIDE the engraving carry the pass:
    // `walk` scored 3.67:1 that way while its own bars — 725 near-black pixels and not one pale one
    // — bottomed out at **1.12:1**, invisible on a dark background. A statistic that cannot order
    // its own mutation is the failure this project has a rule about. Codex round-8.
    //
    // The repair is `keylineMarks()`: every dark engraving is thickened and then haloed in the pale
    // half of `hud.ts`'s ink pair, so a reader takes whichever ink contrasts with what is behind it.
    // `KEYLINE_PX` is **3** — at 1 px `walk` measures 1.93:1 and at 2 px 2.92:1, because a hairline
    // averages away in the downscale (round 9).
    //
    // ⚠️ **Per CONNECTED COMPONENT, and the whole-mark version had the same shape of hole one
    // level down.** One `best` for the whole engraving lets half a glyph go dark: skipping the pale
    // halo below the face midpoint removes 938 keyline pixels from `walk` — its lower bar becomes
    // invisible on a dark background — and the single best pixel, up in the surviving half, still
    // reported 3.318:1. Codex round-12. Every stroke answers for itself now, and every stroke must
    // survive the downscale at all.
    //
    // ⚠️ `max(ink : background)` over a SWEPT background, which is `contrast-floor.test.ts`'s
    // method and the reason it applies here: no single colour wins against every background.
    // Measured through this repository's own `downscale`: every component of all six reads
    // **3.32:1** at rest and **3.85:1** pressed. Before the alpha split they were 2.43-2.47:1
    // (M46); before the keyline, `walk`'s mark was 1.12:1 (M51).
    for (const alpha of [ART_ALPHA, ART_ALPHA_PRESSED]) {
      for (const key of KEYS) {
        const png = shippedFace(key);
        // ⚠️ From the CUT face, not from the shipped alpha. "Opaque inside the central square" is
        // the mutated file describing itself: erase the engraving to plate alpha and those pixels
        // simply leave the mask, so the handful left standing carried a 3.09:1 pass. Round-11.
        const { mark } = cutFace(key);
        const { labels, count } = markComponents(mark, png.width);
        expect(count, `${key} has no mark at all`).toBeGreaterThan(0);

        // Where each stroke is, at the SAME resolution and through the SAME partitioning as the
        // composite below — `downscale` is this repository's own box filter, and rolling a second
        // one by hand made the two disagree on which source columns fall in the first cell.
        // Codex round-10. The alpha channel carries the coverage: 255 where this stroke, 0 else.
        const strokes = [];
        for (let c = 0; c < count; c += 1) {
          const coverage = new Uint8ClampedArray(png.width * png.height * 4);
          for (let p = 0; p < labels.length; p += 1) {
            coverage[p * 4 + 3] = labels[p] === c ? 255 : 0;
          }
          strokes.push(
            downscale({ width: png.width, height: png.height, data: coverage }, TRUE_SIZE_PX, TRUE_SIZE_PX),
          );
        }

        const worst = new Array<number>(count).fill(Infinity);
        const surviving = new Array<number>(count).fill(0);
        for (let bg = 0; bg <= 255; bg += 5) {
          const back = luminance(bg, bg, bg);
          // Composite over this background at full size, then downscale the composite.
          const over = new Uint8ClampedArray(png.width * png.height * 4);
          for (let i = 0; i < png.data.length; i += 4) {
            const a = (png.data[i + 3]! / 255) * alpha;
            over[i] = png.data[i]! * a + bg * (1 - a);
            over[i + 1] = png.data[i + 1]! * a + bg * (1 - a);
            over[i + 2] = png.data[i + 2]! * a + bg * (1 - a);
            over[i + 3] = 255;
          }
          const shown = downscale(
            { width: png.width, height: png.height, data: over },
            TRUE_SIZE_PX,
            TRUE_SIZE_PX,
          );

          for (let c = 0; c < count; c += 1) {
            let best = 0;
            let cells = 0;
            for (let k = 0; k < TRUE_SIZE_PX * TRUE_SIZE_PX; k += 1) {
              // An output pixel counts as this stroke only if the stroke is most of what fell into
              // it. Anything less is a blend of mark and plate, not what a reader is looking at.
              if (strokes[c]!.data[k * 4 + 3]! < 128) continue;
              cells += 1;
              const r = ratio(
                luminance(shown.data[k * 4]!, shown.data[k * 4 + 1]!, shown.data[k * 4 + 2]!),
                back,
              );
              if (r > best) best = r;
            }
            surviving[c] = cells;
            if (best < worst[c]!) worst[c] = best;
          }
        }

        for (let c = 0; c < count; c += 1) {
          expect(
            surviving[c],
            `stroke ${c} of ${key} does not survive the downscale at all`,
          ).toBeGreaterThan(0);
          expect(
            worst[c],
            `stroke ${c} of ${key} at alpha ${alpha} reaches only ${worst[c]!.toFixed(2)}:1 at ${TRUE_SIZE_PX} CSS px`,
          ).toBeGreaterThan(3);
        }
      }
    }
  });
});
