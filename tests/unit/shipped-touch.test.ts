/**
 * The six shipped touch faces, measured on the bytes — criterion 12.17.
 *
 * ## Why the bytes and not the builder
 *
 * `buildTouchAtlas.mjs` validates as it cuts, but a builder that is never run again cannot defend
 * what is in `public/`. *(vault 3.1 — run the real check over the shipped data.)* Everything here
 * reads the PNGs the game will actually load, through the catalog the game actually loads them by,
 * so a face deleted, replaced, renamed or resized reds this and nothing else has to notice.
 *
 * ## 🔴 Distinct MARKS, and the first statistic could not see one
 *
 * Two compressions of one picture are distinct bytes and the same button, so "six files exist" was
 * never the question — particularly here, where the plate the model drew repeated a whole row and a
 * cut that read the wrong rows would ship the same face twice.
 *
 * ⚠️ **The first version compared ALPHA MASKS and was decoration.** Every face is the same round
 * brass disc; the mark is *engraved into* it, not cut out of it, so the masks agreed on **99.6 %**
 * of their pixels and the bound had to sit above that to be green — a bound that high cannot fail
 * for any two faces the model could plausibly draw. The statistic, not the threshold, was wrong
 * *(a statistic that does not order its own mutation cannot be fixed by moving the bound)*.
 *
 * ## And the second version still counted the plate it was trying to see past
 *
 * ⚠️ Comparing whole faces makes the shared brass disc most of the frame, so the statistic is
 * diluted by exactly the part that is the same on purpose — and the mutation that ordered it,
 * `cp touch-left.png touch-jump.png`, is a whole FILE, which is not the failure the criterion
 * describes. The failure is *one mark cut from the wrong cell*, and it leaves the disc untouched.
 *
 * So the comparison is masked to the **central 50 %** — the 80 x 80 square the mark is engraved in —
 * and the mutation copies that square between two faces, leaving both discs alone. Measured across
 * all fifteen pairs at the time: **36.3 % to 60.5 %** (closest `right`/`jump`, two triangles),
 * against 19.9 %-40.0 % unmasked. The bound is **15 %**, less than half the closest honest pair,
 * and a copied glyph scores 0. Codex round-6.
 *
 * ⚠️ **The numbers moved twice more.** Splitting the alpha made `SOLID` separate ink from
 * plate rather than face from field, so this now compares the MARKS themselves; then the keyline and
 * bolden passes changed the marks again. Measured on the shipped six as they stand: **70.4 % to
 * 82.9 %** (closest `attack`/`pause`, furthest `left`/`attack`). The BOUND, however, is now zero —
 * see `MIN_DIFFERING_SHARE`: the criterion says *distinct* and names no share, and a 15 % floor was
 * this file requiring more than the rule it enforces.
 *
 * ## And the part no automated gate covers
 *
 * Contrast at true size IS measured here, because it is measurable. Whether a wrench READS as a
 * wrench at 48 CSS px is not: that is `ui-ux-tester`'s call under 12.14 and the owner's under
 * 12.24, stated plainly rather than approximated with a number that would mean nothing
 * *(vault 9.3)*.
 */

import { describe, expect, it } from 'vitest';

import { TOUCH_BOX_PX } from '../../src/render/touchLayout';
import { ART_ALPHA, PLATE_ALPHA } from '../../src/scenes/touchMarks';
import { bakePlateAlpha, keylineMarks } from '../../tools/gen/touchInk.mjs';
import { TOUCH_PLATE_CELLS, TOUCH_PLATE_COLS } from '../../tools/gen/promptTouch.mjs';
import { KEYS, SOLID, cutFace, entry, shippedFace } from './touchFaces';

/** Sum-over-RGB distance at which two pixels are a different colour rather than the same patina. */
const INK_DELTA = 60;

/**
 * How much of two faces' MARKS must differ in colour.
 *
 * ⚠️ **Zero, deliberately, and that is a weaker gate than I first wrote.** 12.17 says the marks are
 * *distinct*; it names no share. A 15 % floor is a judgement about how distinct, and enforcing it
 * would be a test quietly requiring more than the approved rule — the thing CLAUDE.md § 3 calls a
 * STOP-and-ask. Codex round-10.
 *
 * The measured figures are kept in the header above so the drift is visible, and adopting an
 * explicit floor is written up as an owner decision in `docs/qa/phase-12-touch.md` § 12.17b. What
 * this still catches is the failure the criterion names and the mutations build: a mark cut from
 * the wrong cell (M45) or a whole face copied (M40) scores exactly 0.
 */
const MIN_DIFFERING_SHARE = 0;


describe('the shipped touch faces', () => {
  it('ships one per control, at the size the layout draws them into', () => {
    // 🔴 `TOUCH_BOX_PX`, not a literal. The faces and the boxes are the same number in two files,
    // which is the shape of the defect that shipped a 128 px tilesheet for a 384 px grid in Phase 4.
    for (const key of KEYS) {
      const png = shippedFace(key);
      expect([png.width, png.height], `${key} is ${png.width} x ${png.height}`).toEqual([
        TOUCH_BOX_PX,
        TOUCH_BOX_PX,
      ]);
    }
  });

  it('ships THREE alpha bands: a keyed field, a translucent plate and opaque ink', () => {
    // 🔴 The whole of the round-7 contrast repair is in this shape, and nothing else can see
    // it. `buildTouchAtlas.mjs` fades only the BRASS, so a shipped face has to be three things at
    // once: corners keyed to nothing, a disc that the level shows through, and a mark that does not
    // fade with it. A face baked flat satisfies none of them and looks identical in a screenshot.
    //
    // ⚠️ An alpha CHANNEL is not transparency *(vault 4.12)* — a fully opaque RGBA file has
    // one. Measured on the shipped six: clear 19.8-21.5 %, plate 59.8-68.4 %, ink 10.4-20.5 %
    // — the ink band is the MARK and nothing else now, since `bakePlateAlpha` stopped exempting
    // the disc's own dark bezel from the fade. Codex round-11.
    for (const key of KEYS) {
      const png = shippedFace(key);
      expect(png.sourceHadAlphaChannel, `${key} has no alpha channel at all`).toBe(true);

      let clear = 0;
      let ink = 0;
      let plate = 0;
      for (let i = 3; i < png.data.length; i += 4) {
        const a = png.data[i]!;
        if (a === 0) clear += 1;
        else if (a >= SOLID) ink += 1;
        else plate += 1;
      }
      // ⚠️ **Presence, not coverage.** The first version demanded 10-35 % clear, 5-30 % ink
      // and over 50 % plate — percentages no criterion approves, which would false-red a legal
      // face with a 4.9 % mark or a plate filling more of its canvas. A test may not enforce more
      // than the rule says *(Codex round-8)*. What 12.14 and 12.17 actually need is that all three
      // bands EXIST: the key worked, the plate is translucent, the mark is not. How readable that
      // mark is, is the contrast gate's question, and how distinct it is, is the marks gate's.
      expect(clear, `${key} has no fully transparent pixel — it was never keyed`).toBeGreaterThan(0);
      expect(ink, `${key} has no opaque pixel — the mark faded with the plate`).toBeGreaterThan(0);
      expect(plate, `${key} has no translucent pixel — nothing shows through it`).toBeGreaterThan(0);
      // ⚠️ Presence, and no share. `plate / (plate + ink) > 0.5` was a second invented
      // threshold: the 19.9 %-occlusion measurement establishes an ALPHA, not a pixel-share rule,
      // and legal art could false-red on it. Codex round-9. What the disc actually has to do is
      // measured where it is measurable — the byte-times-constant product below.
    }
  });

  it('is byte for byte what the two ink passes make of the committed cut face', () => {
    // 🔴 **The gate the other three needed and did not have.** A shipped-bytes test can only ever
    // check properties it can name, and each property check had to decide for itself which pixels
    // were mark and which were plate — from the mutated file. Codex round-11 built two byte
    // mutations that survived every one of them. This one cannot be evaded by construction: the
    // committed cut face plus the two pure passes IS the file, or the file is wrong.
    //
    // ⚠️ It does not make the property gates redundant. This says the bytes match the PIPELINE;
    // they say the pipeline is right. Change `PLATE_ALPHA_BAKED` and re-cut and this stays green
    // while the alpha and contrast gates go red.
    for (const key of KEYS) {
      const { cut, mark } = cutFace(key);
      const expected = bakePlateAlpha(keylineMarks(cut).image, mark);
      const png = shippedFace(key);
      expect([png.width, png.height], `${key} is not the size of its cut face`).toEqual([
        expected.width,
        expected.height,
      ]);
      let differing = 0;
      for (let i = 0; i < expected.data.length; i += 1) {
        if (png.data[i] !== expected.data[i]!) differing += 1;
      }
      expect(differing, `${key} is not what the pipeline produces — ${differing} bytes differ`).toBe(
        0,
      );
    }
  });

  it('draws the mark at ART_ALPHA and everything else at PLATE_ALPHA, per pixel', () => {
    // 🔴 The number the 19.9 %-occlusion argument is about, checked on every pixel it applies to,
    // against the two alphas `touchMarks.ts` DRAWS with rather than the constant the tool bakes
    // with — which is what makes it a tie between the bytes and the scene and not a restatement.
    //
    // ⚠️ **Three earlier versions were each satisfiable by an average or a gap.** The modal
    // translucent alpha let 9 717 opaque brass pixels through (M58). Replacing it with a per-pixel
    // rule kept a one-sided bound, so setting all 11 956 moderate-luminance pixels of `pause` to
    // alpha 1 — a plate that has effectively vanished — violated nothing. And classifying by
    // luminance left every extreme pixel OUTSIDE the mark square checked as neither ink nor plate,
    // 2 657-2 976 of them a face, so an arbitrary opaque region out there was invisible to it.
    // Codex round-10 and round-11. The classification is the pipeline's own mask now, the bound is
    // two-sided, and `bakePlateAlpha` fades the disc's bezel with the rest of the plate.
    const baked = PLATE_ALPHA / ART_ALPHA;
    for (const key of KEYS) {
      const { cut, mark } = cutFace(key);
      const png = shippedFace(key);
      let ink = 0;
      let plate = 0;
      for (let p = 0; p < mark.length; p += 1) {
        const was = cut.data[p * 4 + 3]!;
        if (was === 0) continue;
        const a = png.data[p * 4 + 3]!;
        if (mark[p]) {
          ink += 1;
          expect(a, `${key} has mark ink at alpha ${a} — a faded engraving`).toBe(255);
        } else {
          plate += 1;
          expect(
            a,
            `${key} has plate at alpha ${a}, not ${Math.round(was * baked)} — it would hide the ` +
              'level, or has stopped being there at all',
          ).toBe(Math.round(was * baked));
        }
      }
      expect(ink, `${key} has no mark at all`).toBeGreaterThan(0);
      expect(plate, `${key} has no plate at all`).toBeGreaterThan(0);
    }
  });

  it('ships six DIFFERENT MARKS, not one mark six times', () => {
    // ⚠️ The mask comes from the CUT face, like every other mask here. "Opaque inside the
    // central square" happens to select exactly these pixels today — the alpha invariant above
    // leaves nothing else opaque — but that is a consequence of another gate, not a definition,
    // and this comparison should not depend on the file it is comparing. Codex round-11.
    const faces = KEYS.map((key) => {
      const png = shippedFace(key);
      return { key, px: png.data, mark: cutFace(key).mark };
    });
    for (let i = 0; i < faces.length; i += 1) {
      for (let j = i + 1; j < faces.length; j += 1) {
        const a = faces[i]!;
        const b = faces[j]!;
        expect(a.px.length, 'two faces are different sizes').toBe(b.px.length);
        let differing = 0;
        let counted = 0;
        for (let q = 0; q < a.mark.length; q += 1) {
          // Skip pixels that are mark in NEITHER — they say nothing about which button this is.
          if (!a.mark[q] && !b.mark[q]) continue;
          const p = q * 4;
          counted += 1;
          const d =
            Math.abs(a.px[p]! - b.px[p]!) +
            Math.abs(a.px[p + 1]! - b.px[p + 1]!) +
            Math.abs(a.px[p + 2]! - b.px[p + 2]!);
          if (d > INK_DELTA) differing += 1;
        }
        expect(counted, `${a.key} and ${b.key} have no mark pixels at all`).toBeGreaterThan(0);
        const share = differing / counted;
        expect(
          share,
          `${a.key} and ${b.key} differ on only ${(share * 100).toFixed(1)}% of their MARK — one glyph on two plates`,
        ).toBeGreaterThan(MIN_DIFFERING_SHARE);
      }
    }
  });

  it('cuts one cell per control, from a grid position and not from a detection order', () => {
    // 🔴 Nothing referenced `TOUCH_PLATE_CELLS` at all — the descriptors that decide which
    // cell becomes which button were unpinned, and the builder's own count guard compared them
    // against themselves. Codex round-7. This is the other end: the cells the prompt asks for have
    // to be exactly the controls the layout draws, named the same way.
    expect(TOUCH_PLATE_CELLS.map((cell) => cell.key).sort()).toEqual([...KEYS].sort());
    // 🔴 **And WHICH cell, pinned as a literal.** Keys-exist plus positions-unique says
    // nothing about the binding: swap the `left` and `right` columns and re-run `assets:touch` and
    // every gate here follows the change — the cut fixtures are rewritten in the same run as the
    // shipped PNGs, so the reproduction gate is exact, contrast and distinctness are unmoved, and
    // the left button ships a right-pointing arrow. Codex round-12, M64. This table is the other
    // end of that contract and is the only thing in the repository that cannot move with it.
    expect(
      TOUCH_PLATE_CELLS.map((cell) => `${cell.key} ${cell.row},${cell.col}`),
      'a control reads a different cell of the plate than the one it was generated into',
    ).toEqual([
      'touch-left 0,0',
      'touch-right 0,1',
      'touch-jump 0,2',
      'touch-attack 1,0',
      'touch-pause 1,1',
      'touch-walk 1,2',
    ]);
    // And no two controls may read the same cell, which is how one mark ships twice.
    const positions = TOUCH_PLATE_CELLS.map((cell) => cell.row * TOUCH_PLATE_COLS + cell.col);
    expect(new Set(positions).size, 'two controls read the same cell of the plate').toBe(
      TOUCH_PLATE_CELLS.length,
    );
  });

  it('binds every face to its own key, in the catalog the game loads from', () => {
    const urls = KEYS.map((key) => entry(key).url);
    expect(new Set(urls).size, 'two controls point at one file').toBe(KEYS.length);
    for (const key of KEYS) {
      expect(entry(key).url, `${key} does not ship under its own name`).toContain(key);
    }
  });
});
