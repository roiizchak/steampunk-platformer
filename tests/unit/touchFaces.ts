/**
 * What the shipped touch faces are, and what they were CUT from — shared by the two files that
 * measure them: `shipped-touch.test.ts` and `shipped-touch-contrast.test.ts`.
 *
 * The split is the 400-line rule, and the seam is the one this file names: everything here reads a
 * face, and nothing here asserts anything about one.
 */

import { expect } from 'vitest';

import catalog from '../../public/assets/index.json';
import { TOUCH_BOX_PX, TOUCH_IDS } from '../../src/render/touchLayout';
import { TOUCH_CUT_DIR } from '../../tools/gen/buildTouchAtlas.mjs';
import { readPng } from '../../tools/gen/png.mjs';
import { keylineMarks } from '../../tools/gen/touchInk.mjs';

/** Every control's texture key, in the form `touchControlsLayer.build` asks the texture manager for. */
export const KEYS = TOUCH_IDS.map((id) => `touch-${id}`);

/**
 * Alpha at or above this counts as INK rather than plate.
 *
 * The baked plate sits at 165 (`0.55 / 0.85` of full) and the ink at 255, so 200 separates them
 * with 35 either side — wider than any anti-aliased step between them.
 */
export const SOLID = 200;

/**
 * The share of the face the mark occupies.
 *
 * The disc is the same on every button by design; counting it dilutes every pair by the same
 * amount and hides the one failure that matters — a mark cut from the wrong cell onto the right
 * plate. Half the side is the square `buildTouchAtlas.mjs`'s centre-crop puts the engraving in.
 */
export const MARK_FRACTION = 0.5;

/**
 * The width, in CSS pixels, that a 160 game px face occupies at the smallest viewport in scope.
 *
 * `160 * 325 / 1080` — iPhone SE landscape as a real browser gives it, with the URL bar Safari
 * never collapses because `index.html`'s `#game { height: 100% }` means the page cannot scroll.
 * `touchLayout.ts` documents that reduced viewport and `touchTargetsFit` is measured against it.
 */
export const TRUE_SIZE_PX = Math.round((TOUCH_BOX_PX * 325) / 1080);

/** WCAG relative luminance, sRGB. The same formula `contrast-floor.test.ts` uses. */
export function luminance(r: number, g: number, b: number): number {
  const ch = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

interface CatalogImage {
  key: string;
  url: string;
}

export function entry(key: string): CatalogImage {
  const found = (catalog.images as CatalogImage[]).find((image) => image.key === key);
  expect(found, `no catalog entry for ${key} — the file could ship and never be loaded`).toBeDefined();
  return found!;
}

/** The face as it ships, read through the catalog the game loads it by. */
export function shippedFace(key: string): ReturnType<typeof readPng> {
  return readPng(`public/${entry(key).url}`);
}

/**
 * The face as the plate gave it, before either ink pass — and the mask of where the mark ended up.
 *
 * 🔴 **The only independent statement of what the shipped bytes were supposed to be.** Every gate
 * over these faces used to discover the mark from the file under test: by luminance for the alpha
 * invariant, by opacity for the contrast one. So a mutation that erased `walk`'s engraving and left
 * two 4 x 4 ink cells standing moved the mask with it, kept 3.09:1, and stayed green — the oracle
 * was the defendant. Codex round-11. `tests/fixtures/touch-cut/` commits the six cut faces (~30 KB
 * each; the 2048 px plate they come from is 3.8 MB and gitignored), and `buildTouchAtlas.mjs`
 * writes them on the same run that writes `public/assets/ui/`.
 */
export function cutFace(key: string): { cut: ReturnType<typeof readPng>; mark: Uint8Array } {
  const cut = readPng(`${TOUCH_CUT_DIR}/${key}.png`);
  return { cut, mark: keylineMarks(cut).mark };
}

/**
 * The mark mask, split into its connected strokes (8-connected).
 *
 * 🔴 **A per-face contrast figure hides half a glyph.** One `best` pixel for the whole
 * engraving let `walk`'s lower bar lose its pale halo — 938 keyline pixels, invisible on a dark
 * background — while the surviving upper bar still reported 3.318:1. Codex round-12. Each stroke
 * answers for itself, and there is no size threshold: the six shipped faces have 1 to 4 components
 * of 914-4 136 source pixels each, surviving as 80-400 output cells at 48 px.
 */
export function markComponents(
  mark: Uint8Array,
  width: number,
): { labels: Int32Array; count: number } {
  const labels = new Int32Array(mark.length).fill(-1);
  let count = 0;
  for (let p = 0; p < mark.length; p += 1) {
    if (!mark[p] || labels[p]! >= 0) continue;
    const id = count;
    count += 1;
    labels[p] = id;
    const stack = [p];
    while (stack.length > 0) {
      const q = stack.pop()!;
      const x = q % width;
      const y = (q - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny * width + nx >= mark.length) continue;
          const r = ny * width + nx;
          if (mark[r] && labels[r]! < 0) {
            labels[r] = id;
            stack.push(r);
          }
        }
      }
    }
  }
  return { labels, count };
}
