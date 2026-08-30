/**
 * Criterion 12.14, the half that is measurable: does the engraving reach WCAG 1.4.11's 3:1 over
 * every background, at the size the smallest in-scope phone actually draws it?
 *
 * Split out of `shipped-touch.test.ts` at the 400-line rule. Whether a wrench READS as a wrench at
 * 48 CSS px is not measurable and is not claimed here: that is `ui-ux-tester`'s call under 12.14
 * and the owner's under 12.24 *(vault 9.3)*.
 */

import { describe, expect, it } from 'vitest';

import { ART_ALPHA, ART_ALPHA_PRESSED } from '../../src/scenes/touchMarks';
import { downscale } from '../../tools/gen/resize.mjs';
import { KEYS, TRUE_SIZE_PX, cutFace, luminance, ratio, shippedFace } from './touchFaces';

describe('the shipped touch faces', () => {
  it('reaches the 3:1 contrast floor over EVERY background, at rest and pressed', () => {
    // 🔴 **Measured on the MARK, and the first version was not.** Scanning the whole face and
    // keeping the best pixel let a decorative brass highlight OUTSIDE the engraving carry the pass:
    // `walk` scored 3.67:1 that way while its own bars — 725 near-black pixels and not one pale one
    // — bottomed out at **1.12:1**, invisible on a dark background. A statistic that cannot order
    // its own mutation is the failure this project has a rule about. Codex round-8.
    //
    // The repair is `keylineMarks()`: every dark engraving gets a 1 px pale keyline, so a reader
    // takes whichever ink contrasts. Measured through this repository's own `downscale`, all six now read **3.32:1**
    // at rest and **3.85:1** pressed, on
    // the mark mask itself. Before the alpha split they were 2.43-2.47:1 (M46); before the keyline,
    // `walk`'s mark was 1.12:1 (M51).
    //
    // ⚠️ `max(ink : background)` over a SWEPT background, which is `contrast-floor.test.ts`'s
    // method and the reason it applies here: no single colour wins against every background.
    for (const alpha of [ART_ALPHA, ART_ALPHA_PRESSED]) {
      for (const key of KEYS) {
        const png = shippedFace(key);
        // ⚠️ From the CUT face, not from the shipped alpha. "Opaque inside the central square" is
        // the mutated file describing itself: erase the engraving to plate alpha and those pixels
        // simply leave the mask, so the handful left standing carried a 3.09:1 pass. Round-11.
        const { mark } = cutFace(key);
        const isMark = (x: number, y: number): boolean => mark[y * png.width + x] === 1;

        // Where the engraving is, at the SAME resolution and through the SAME partitioning as the
        // composite below — `downscale` is this repository's own box filter, and rolling a second
        // one by hand made the two disagree on which source columns fall in the first cell.
        // Codex round-10. The alpha channel carries the coverage: 255 where mark, 0 elsewhere.
        const coverage = new Uint8ClampedArray(png.width * png.height * 4);
        for (let y = 0; y < png.height; y += 1) {
          for (let x = 0; x < png.width; x += 1) {
            coverage[(y * png.width + x) * 4 + 3] = isMark(x, y) ? 255 : 0;
          }
        }
        const marks = downscale(
          { width: png.width, height: png.height, data: coverage },
          TRUE_SIZE_PX,
          TRUE_SIZE_PX,
        );

        let worst = Infinity;
        let markPixels = 0;
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

          let best = 0;
          markPixels = 0;
          for (let k = 0; k < TRUE_SIZE_PX * TRUE_SIZE_PX; k += 1) {
            // An output pixel counts as MARK only if the engraving is most of what fell into it.
            // Anything less is a blend of mark and plate, and is not what a reader is looking at.
            if (marks.data[k * 4 + 3]! < 128) continue;
            markPixels += 1;
            const r = ratio(
              luminance(shown.data[k * 4]!, shown.data[k * 4 + 1]!, shown.data[k * 4 + 2]!),
              back,
            );
            if (r > best) best = r;
          }
          if (best < worst) worst = best;
        }
        expect(markPixels, `${key}'s mark does not survive the downscale at all`).toBeGreaterThan(0);
        expect(
          worst,
          `${key}'s MARK at alpha ${alpha} reaches only ${worst.toFixed(2)}:1 at ${TRUE_SIZE_PX} CSS px`,
        ).toBeGreaterThan(3);
      }
    }
  });
});
