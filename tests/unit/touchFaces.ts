/**
 * What the shipped touch faces are, and what they were CUT from.
 *
 * The seam is the one this file names: everything here reads a face, and nothing here asserts
 * anything about one.
 *
 * ⚠️ **It used to be shared with `shipped-touch-contrast.test.ts`, and that file is gone** — the
 * 2026-08-31 redesign deleted the ink pass and every gate derived from it. Four exports went with it
 * on 2026-09-02: `TRUE_SIZE_PX`, `LIVE_SIZES_PX`, `luminance` and `ratio`, each with **zero
 * consumers** since. They are not kept as a memento of the 44–48 band they measured — a constant
 * with no consumer reads as evidence that still exists, and the honest record of what was lost is
 * 12.14's row plus M74's retirement in the mutation matrix. `luminance` and `ratio` survive
 * elsewhere; `contrast-floor.test.ts` and `src/render/titleInk.ts` each carry their own.
 */

import { expect } from 'vitest';

import catalog from '../../public/assets/index.json';
import { TOUCH_IDS } from '../../src/render/touchLayout';
import { TOUCH_CUT_DIR } from '../../tools/gen/buildTouchAtlas.mjs';
import { readPng } from '../../tools/gen/png.mjs';

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

interface CatalogImage {
  key: string;
  url: string;
}

export function entry(key: string): CatalogImage {
  const found = (catalog.images as CatalogImage[]).find((image) => image.key === key);
  expect(found, `no catalog entry for ${key} — the file could ship and never be loaded`).toBeDefined();
  return found!;
}

/**
 * The face as it ships, read through the catalog the game loads it by.
 *
 * `root` exists so a STAGED candidate can be measured by these same helpers before it is adopted —
 * a candidate validated by a second copy of the algorithm is validated against a different claim.
 * It defaults to what production ships, so every existing caller is unchanged.
 */
export function shippedFace(key: string, root = 'public'): ReturnType<typeof readPng> {
  return readPng(`${root}/${entry(key).url}`);
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
export function cutFace(key: string, root = TOUCH_CUT_DIR): { cut: ReturnType<typeof readPng> } {
  return { cut: readPng(`${root}/${key}.png`) };
}
