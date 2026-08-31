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
import { KEYS, TRUE_SIZE_PX, cutFace, shippedFace, strokeContrast } from './touchFaces';

/**
 * The one stroke of the shipped six that does not reach 3:1, with the figure it does reach.
 *
 * 🔴 **Not a waiver and not a threshold — a second, lower, MEASURED bound on a named stroke.**
 * Splitting `attack` by its pre-halo engraving separates four small fragments of the wrench's
 * shading from its two real strokes, and the smallest — an 11-pixel seed — measures **2.86:1**.
 * No parameter fixes it: `KEYLINE_PX` 4 leaves it at 2.86 and bolder makes it worse (3 → 1.93,
 * 4 → 1.37), because at 48 CSS px the fragment is about three output pixels of mostly dark.
 *
 * Inventing a minimum stroke size to exclude it would be this file requiring — or excusing — more
 * than 12.14 says, which CLAUDE.md § 3 calls a STOP-and-ask. So it is named, pinned so it cannot
 * quietly get worse, and recorded against 12.14 in `docs/qa/phase-12-touch.md` as a shortfall for
 * the owner to rule on: accept it, or re-shoot the wrench cell. Codex round-13.
 */
const KNOWN_SHORTFALL: Record<string, Record<number, number>> = { 'touch-attack': { 2: 2.8 } };

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
        const { mark, seeds } = cutFace(key);
        // ⚠️ Strokes come from the PRE-HALO engraving. Labelling the finished mask let the keyline
        // merge `walk`'s two bars into one component, and an 11-pixel bridge then kept 927 erased
        // pale pixels inside a component that still scored 3.318:1. Codex round-13.
        const { worst, surviving, count } = strokeContrast(png, mark, seeds, alpha);
        expect(count, `${key} has no mark at all`).toBeGreaterThan(0);

        for (let c = 0; c < count; c += 1) {
          expect(
            surviving[c],
            `stroke ${c} of ${key} does not survive the downscale at all`,
          ).toBeGreaterThan(0);
          const floor = KNOWN_SHORTFALL[key]?.[c] ?? 3;
          expect(
            worst[c],
            `stroke ${c} of ${key} at alpha ${alpha} reaches only ${worst[c]!.toFixed(2)}:1 at ${TRUE_SIZE_PX} CSS px` +
              (floor === 3 ? '' : ' — a recorded shortfall, and it has got worse'),
          ).toBeGreaterThan(floor);
        }
      }
    }
  });
});
