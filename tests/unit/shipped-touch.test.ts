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
 * Measured on the shipped six, the share of pixels differing in COLOUR by more than 60 (sum over
 * RGB) runs **19.9 % to 40.0 %** across all fifteen pairs — closest `left`/`jump`, two triangles,
 * furthest `right`/`walk`. The bound is **5 %**: four times inside the closest honest pair, and a
 * duplicated face scores 0.
 *
 * ## And the part no automated gate covers
 *
 * Whether a wrench READS as a wrench at 55.6 CSS px is `ui-ux-tester`'s call under 12.14 and the
 * owner's under 12.24. Stated plainly rather than approximated with a number that would mean
 * nothing *(vault 9.3)*.
 */

import { describe, expect, it } from 'vitest';

import catalog from '../../public/assets/index.json';
import { TOUCH_BOX_PX, TOUCH_IDS } from '../../src/render/touchLayout';
import { readPng } from '../../tools/gen/png.mjs';

/** Every control's texture key, in the form `touchControlsLayer.build` asks the texture manager for. */
const KEYS = TOUCH_IDS.map((id) => `touch-${id}`);

/** Alpha at or above this counts as ink. Well clear of the key's soft edge either way. */
const SOLID = 200;

/** Sum-over-RGB distance at which two pixels are a different colour rather than the same patina. */
const INK_DELTA = 60;

/**
 * How much of two faces must differ in colour. **5 %**, against a measured closest honest pair of
 * 19.9 % (`left` vs `jump`, two triangles) and a furthest of 40.0 %. A duplicated face scores 0.
 */
const MIN_DIFFERING_SHARE = 0.05;

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

  it('carries real transparency, so a face is a button and not a green square', () => {
    for (const key of KEYS) {
      const png = readPng(`public/${entry(key).url}`);
      expect(png.sourceHadAlphaChannel, `${key} has no alpha channel at all`).toBe(true);

      // ⚠️ An alpha CHANNEL is not transparency *(vault 4.12)* — a fully opaque RGBA file has one.
      // The chroma field has to be gone, and a round button in a square frame leaves the corners
      // transparent, so a face with no transparent pixel is a face that was never keyed.
      let clear = 0;
      for (let i = 3; i < png.data.length; i += 4) if (png.data[i] < SOLID) clear += 1;
      const share = clear / (png.width * png.height);
      expect(share, `${key} is ${(share * 100).toFixed(1)}% transparent`).toBeGreaterThan(0.05);
      // And it must not be MOSTLY gone either — that is a face the key ate.
      expect(share, `${key} keyed away ${(share * 100).toFixed(1)}% of itself`).toBeLessThan(0.6);
    }
  });

  it('ships six DIFFERENT marks, not one mark six times', () => {
    const faces = KEYS.map((key) => ({ key, px: readPng(`public/${entry(key).url}`).data }));
    for (let i = 0; i < faces.length; i += 1) {
      for (let j = i + 1; j < faces.length; j += 1) {
        const a = faces[i]!;
        const b = faces[j]!;
        expect(a.px.length, 'two faces are different sizes').toBe(b.px.length);
        let differing = 0;
        let counted = 0;
        for (let p = 0; p < a.px.length; p += 4) {
          // Skip pixels transparent in BOTH — the shared corners outside the disc say nothing about
          // which button this is, and counting them would dilute every pair by the same amount.
          if (a.px[p + 3]! < SOLID && b.px[p + 3]! < SOLID) continue;
          counted += 1;
          const d =
            Math.abs(a.px[p]! - b.px[p]!) +
            Math.abs(a.px[p + 1]! - b.px[p + 1]!) +
            Math.abs(a.px[p + 2]! - b.px[p + 2]!);
          if (d > INK_DELTA) differing += 1;
        }
        const share = differing / counted;
        expect(
          share,
          `${a.key} and ${b.key} differ on only ${(share * 100).toFixed(1)}% of their ink — the same button twice`,
        ).toBeGreaterThan(MIN_DIFFERING_SHARE);
      }
    }
  });

  it('binds every face to its own key, in the catalog the game loads from', () => {
    const urls = KEYS.map((key) => entry(key).url);
    expect(new Set(urls).size, 'two controls point at one file').toBe(KEYS.length);
    for (const key of KEYS) {
      expect(entry(key).url, `${key} does not ship under its own name`).toContain(key);
    }
  });
});
