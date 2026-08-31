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
import { KEYS, LIVE_SIZES_PX, cutFace, shippedFace, strokeContrast } from './touchFaces';

/**
 * ✅ **There is no shortfall table any more, and that is the re-shoot's result.**
 *
 * `KNOWN_SHORTFALL` stood here from round 13 until 2026-08-31, naming `touch-attack` stroke 2 at a
 * measured **2.86:1** and pinning it at 2.8 so it could not quietly get worse. It was never a
 * waiver: the wrench's own interior SHADING was fragmenting into four sub-3:1 pieces, no parameter
 * reached them (`KEYLINE_PX` 4 left it at 2.86; `BOLD_PX` 3 and 4 made it 1.93 and 1.37), and
 * inventing a minimum stroke size to exclude them would have been this file excusing more than
 * 12.14 says.
 *
 * The owner chose the re-shoot. The cell was re-generated through `nano-banana-pro/edit` from the
 * plate's own attack cell, with a prompt that asks for one solid filled silhouette instead of a
 * glyph "deeply cut and filled with dark shadow" — see `promptTouch.mjs`'s `FLAT_GLYPH`. The face
 * now splits into **three** strokes and every one reaches the same 3.32:1 / 3.85:1 as the other
 * five.
 *
 * 🔴 **The table was deleted BEFORE the candidate was adopted, not after.** Its 2.8 floor would
 * have let a 2.81 candidate pass the very gate that exists to decide whether the re-shoot worked.
 * Named by the Codex plan review, round 2.
 */

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
    // 🔴 SWEPT over every size in the live band, not pinned to one. `downscale` is a box filter
    // whose destination cells are `Math.floor`-partitioned, so it is NOT monotonic in output size:
    // pinned at 44 this gate was green while `touch-attack` stroke 2 measured **2.740:1 at 47**.
    // `ui-ux-tester` round 2, brief 2, finding 5 — and the sweep found it on its first run.
    for (const size of LIVE_SIZES_PX)
    for (const alpha of [ART_ALPHA, ART_ALPHA_PRESSED]) {
      for (const key of KEYS) {
        const png = shippedFace(key);
        // ⚠️ From the CUT face, not from the shipped alpha. "Opaque inside the central square" is
        // the mutated file describing itself: erase the engraving to plate alpha and those pixels
        // simply leave the mask, so the handful left standing carried a 3.09:1 pass. Round-11.
        const { mark, seeds } = cutFace(key);
        // ⚠️ Strokes come from the PRE-HALO engraving. Labelling the finished mask let the keyline
        // merge `walk`'s two bars into one component, and an 11-pixel bridge then kept 927 erased
        // pale pixels inside a component that still scored 3.318:1. Codex round-13.
        const { worst, surviving, count } = strokeContrast(png, mark, seeds, alpha, size);
        expect(count, `${key} has no mark at all`).toBeGreaterThan(0);

        for (let c = 0; c < count; c += 1) {
          expect(
            surviving[c],
            `stroke ${c} of ${key} does not survive the downscale at all at ${size} CSS px`,
          ).toBeGreaterThan(0);
          expect(
            worst[c],
            `stroke ${c} of ${key} at alpha ${alpha} reaches only ${worst[c]!.toFixed(2)}:1 at ${size} CSS px`,
          ).toBeGreaterThan(3);
        }
      }
    }
  }, 60_000);
});
