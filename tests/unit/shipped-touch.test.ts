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
 * bolden passes changed the marks. Measured on the shipped six as they stand: **70.4 % to 82.9 %**
 * (closest `attack`/`pause`, furthest `left`/`attack`). The bound stays at 15 %, four and a half
 * times inside the closest honest pair.
 *
 * ## And the part no automated gate covers
 *
 * Contrast at true size IS measured here, because it is measurable. Whether a wrench READS as a
 * wrench at 48 CSS px is not: that is `ui-ux-tester`'s call under 12.14 and the owner's under
 * 12.24, stated plainly rather than approximated with a number that would mean nothing
 * *(vault 9.3)*.
 */

import { describe, expect, it } from 'vitest';

import catalog from '../../public/assets/index.json';
import { TOUCH_BOX_PX, TOUCH_IDS } from '../../src/render/touchLayout';
import { ART_ALPHA, ART_ALPHA_PRESSED, PLATE_ALPHA } from '../../src/scenes/touchMarks';
import { readPng } from '../../tools/gen/png.mjs';
import { TOUCH_PLATE_CELLS, TOUCH_PLATE_COLS } from '../../tools/gen/promptTouch.mjs';

/** Every control's texture key, in the form `touchControlsLayer.build` asks the texture manager for. */
const KEYS = TOUCH_IDS.map((id) => `touch-${id}`);

/**
 * Alpha at or above this counts as INK rather than plate.
 *
 * The baked plate sits at 165 (`0.55 / 0.85` of full) and the ink at 255, so 200 separates them
 * with 35 either side — wider than any anti-aliased step between them.
 */
const SOLID = 200;

/** WCAG relative luminance, sRGB. The same formula `contrast-floor.test.ts` uses. */
function luminance(r: number, g: number, b: number): number {
  const ch = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Sum-over-RGB distance at which two pixels are a different colour rather than the same patina. */
const INK_DELTA = 60;

/**
 * How much of two faces' MARKS must differ in colour. **15 %**, against a measured closest honest
 * pair of 36.3 % (`right` vs `jump`, two triangles) and a furthest of 60.5 %. A copied glyph
 * scores 0.
 */
const MIN_DIFFERING_SHARE = 0.15;

/**
 * The share of the face the mark occupies, and the only part this compares.
 *
 * The disc is the same on every button by design; counting it dilutes every pair by the same
 * amount and hides the one failure that matters — a mark cut from the wrong cell onto the right
 * plate. Half the side is the square `buildTouchAtlas.mjs`'s centre-crop puts the engraving in.
 */
const MARK_FRACTION = 0.5;

/**
 * The width, in CSS pixels, that a 160 game px face occupies at the smallest viewport in scope.
 *
 * `160 * 325 / 1080` — iPhone SE landscape as a real browser gives it, with the URL bar Safari
 * never collapses because `index.html`'s `#game { height: 100% }` means the page cannot scroll.
 * `touchLayout.ts` documents that reduced viewport and `touchTargetsFit` is measured against it.
 */
const TRUE_SIZE_PX = Math.round((TOUCH_BOX_PX * 325) / 1080);

interface CatalogImage {
  key: string;
  url: string;
}

function entry(key: string): CatalogImage {
  const found = (catalog.images as CatalogImage[]).find((image) => image.key === key);
  expect(found, `no catalog entry for ${key} — the file could ship and never be loaded`).toBeDefined();
  return found!;
}

describe('the shipped touch faces', () => {
  it('ships one per control, at the size the layout draws them into', () => {
    // 🔴 `TOUCH_BOX_PX`, not a literal. The faces and the boxes are the same number in two files,
    // which is the shape of the defect that shipped a 128 px tilesheet for a 384 px grid in Phase 4.
    for (const key of KEYS) {
      const png = readPng(`public/${entry(key).url}`);
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
    // one. Measured on the shipped six: clear 19.8-21.5 %, plate 65.9-67.7 %, ink 11.2-14.4 %.
    for (const key of KEYS) {
      const png = readPng(`public/${entry(key).url}`);
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

  it('bakes the plate so that DRAWN at ART_ALPHA it lands on exactly PLATE_ALPHA', () => {
    // 🔴 The number the 19.9 %-occlusion argument is about, checked where it now lives.
    // Splitting the alpha moved the plate's translucency out of `setAlpha` and into the BYTES, and
    // the contract is that the two multiply back to the measured 0.55. `touchMarks.ts` holds the
    // other half; neither file can drift without this failing.
    for (const key of KEYS) {
      const png = readPng(`public/${entry(key).url}`);
      const counts = new Map<number, number>();
      for (let i = 3; i < png.data.length; i += 4) {
        const a = png.data[i]!;
        if (a > 0 && a < SOLID) counts.set(a, (counts.get(a) ?? 0) + 1);
      }
      const modal = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]!;
      const effective = (modal[0] / 255) * ART_ALPHA;
      expect(
        effective,
        `${key}'s plate draws at ${effective.toFixed(3)}, not the measured ${PLATE_ALPHA}`,
      ).toBeCloseTo(PLATE_ALPHA, 2);
    }
  });

  it('reaches the 3:1 contrast floor over EVERY background, at rest and pressed', () => {
    // 🔴 **Measured on the MARK, and the first version was not.** Scanning the whole face and
    // keeping the best pixel let a decorative brass highlight OUTSIDE the engraving carry the pass:
    // `walk` scored 3.67:1 that way while its own bars — 725 near-black pixels and not one pale one
    // — bottomed out at **1.12:1**, invisible on a dark background. A statistic that cannot order
    // its own mutation is the failure this project has a rule about. Codex round-8.
    //
    // The repair is `keylineMarks()`: every dark engraving gets a 1 px pale keyline, so a reader
    // takes whichever ink contrasts. All six now measure **3.64:1** at rest and 4.12:1 pressed, on
    // the mark mask itself. Before the alpha split they were 2.43-2.47:1 (M46); before the keyline,
    // `walk`'s mark was 1.12:1 (M51).
    //
    // ⚠️ `max(ink : background)` over a SWEPT background, which is `contrast-floor.test.ts`'s
    // method and the reason it applies here: no single colour wins against every background.
    for (const alpha of [ART_ALPHA, ART_ALPHA_PRESSED]) {
      for (const key of KEYS) {
        const png = readPng(`public/${entry(key).url}`);
        const inset = Math.round((png.width * (1 - MARK_FRACTION)) / 2);
        const isMark = (x: number, y: number): boolean =>
          x >= inset &&
          x < png.width - inset &&
          y >= inset &&
          y < png.height - inset &&
          png.data[(y * png.width + x) * 4 + 3]! >= SOLID;

        let worst = Infinity;
        let markPixels = 0;
        for (let bg = 0; bg <= 255; bg += 5) {
          const back = luminance(bg, bg, bg);
          // Composite over this background, then BOX-FILTER to the size a phone actually shows.
          const sum = new Float64Array(TRUE_SIZE_PX * TRUE_SIZE_PX * 3);
          const count = new Float64Array(TRUE_SIZE_PX * TRUE_SIZE_PX);
          const markShare = new Float64Array(TRUE_SIZE_PX * TRUE_SIZE_PX);
          for (let y = 0; y < png.height; y += 1) {
            for (let x = 0; x < png.width; x += 1) {
              const i = (y * png.width + x) * 4;
              const a = (png.data[i + 3]! / 255) * alpha;
              const oy = Math.min(TRUE_SIZE_PX - 1, Math.floor((y * TRUE_SIZE_PX) / png.height));
              const ox = Math.min(TRUE_SIZE_PX - 1, Math.floor((x * TRUE_SIZE_PX) / png.width));
              const k = oy * TRUE_SIZE_PX + ox;
              sum[k * 3] += png.data[i]! * a + bg * (1 - a);
              sum[k * 3 + 1] += png.data[i + 1]! * a + bg * (1 - a);
              sum[k * 3 + 2] += png.data[i + 2]! * a + bg * (1 - a);
              count[k] += 1;
              if (isMark(x, y)) markShare[k] += 1;
            }
          }
          let best = 0;
          markPixels = 0;
          for (let k = 0; k < count.length; k += 1) {
            if (count[k] === 0) continue;
            // An output pixel counts as MARK only if the engraving is most of what fell into it.
            // Anything less is a blend of mark and plate, and is not what a reader is looking at.
            if (markShare[k]! < count[k]! * 0.5) continue;
            markPixels += 1;
            const r = ratio(
              luminance(
                sum[k * 3]! / count[k]!,
                sum[k * 3 + 1]! / count[k]!,
                sum[k * 3 + 2]! / count[k]!,
              ),
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

  it('ships six DIFFERENT MARKS, not one mark six times', () => {
    const faces = KEYS.map((key) => {
      const png = readPng(`public/${entry(key).url}`);
      return { key, px: png.data, w: png.width, h: png.height };
    });
    // The mark square, in pixels, from the shipped size rather than from a literal.
    const inset = Math.round((faces[0]!.w * (1 - MARK_FRACTION)) / 2);
    const right = faces[0]!.w - inset;
    const bottom = faces[0]!.h - inset;
    for (let i = 0; i < faces.length; i += 1) {
      for (let j = i + 1; j < faces.length; j += 1) {
        const a = faces[i]!;
        const b = faces[j]!;
        expect(a.px.length, 'two faces are different sizes').toBe(b.px.length);
        let differing = 0;
        let counted = 0;
        for (let y = inset; y < bottom; y += 1) {
          for (let x = inset; x < right; x += 1) {
            const p = (y * a.w + x) * 4;
            // Skip pixels transparent in BOTH — they say nothing about which button this is.
            if (a.px[p + 3]! < SOLID && b.px[p + 3]! < SOLID) continue;
            counted += 1;
            const d =
              Math.abs(a.px[p]! - b.px[p]!) +
              Math.abs(a.px[p + 1]! - b.px[p + 1]!) +
              Math.abs(a.px[p + 2]! - b.px[p + 2]!);
            if (d > INK_DELTA) differing += 1;
          }
        }
        expect(counted, `${a.key} and ${b.key} have no opaque mark pixels at all`).toBeGreaterThan(0);
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
