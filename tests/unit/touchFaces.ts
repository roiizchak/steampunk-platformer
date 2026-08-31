/**
 * What the shipped touch faces are, and what they were CUT from — shared by the two files that
 * measure them: `shipped-touch.test.ts` and `shipped-touch-contrast.test.ts`.
 *
 * The split is the 400-line rule, and the seam is the one this file names: everything here reads a
 * face, and nothing here asserts anything about one.
 */

import { expect } from 'vitest';

import catalog from '../../public/assets/index.json';
import { TOUCH_IDS, TOUCH_MIN_CSS_PX } from '../../src/render/touchLayout';
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

/**
 * The width, in CSS pixels, of the SMALLEST face that is still live — the worst reachable case.
 *
 * 🔴 **This was `160 * 325 / 1080` = 48, and 48 is not the worst case.** That figure is iPhone SE
 * landscape as a real browser gives it, with the URL bar Safari never collapses; it is one measured
 * device, not a floor. `touchTargetsFit` shows and enables a control whenever its box is at least
 * `TOUCH_MIN_CSS_PX`, and the hit box **is** the face box (`touchLayout.ts:156`), so any browser
 * whose chrome is taller than Safari's — Firefox for Android, Samsung Internet, Edge, none of them
 * surveyed — puts a live control anywhere in **[44, 48)**, a band this gate never measured.
 * `ui-ux-tester` brief 2, finding 2.
 *
 * It is `TOUCH_MIN_CSS_PX` now, so the smallest size the gate measures is the size below which a
 * control stops existing. **The two constants are the same one**: raise the production floor and the
 * gate follows, which is the direction that cannot go wrong.
 *
 * ⚠️ **The old shipped art did NOT pass here.** At 44, `touch-pause`'s cogwheel measured
 * **2.905:1** on strokes 1 and 4 — the only strokes in the set that missed — which is what bought
 * its re-shoot. The heavy pause bars read 3.088:1 and 3.318:1.
 */
export const TRUE_SIZE_PX = TOUCH_MIN_CSS_PX;

/**
 * Every reachable live size, and the gate takes the WORST across all of them.
 *
 * 🔴 **44 passing does not prove 45 passes, and the filter is why.** `downscale` is a box filter
 * whose destination cells are `Math.floor`-partitioned (`resize.mjs:44-49`), so at
 * `160 / 44 = 3.636` some output cells average three source pixels and others four. That alias
 * pattern is deterministic but **not monotonic in output size**: a thin keyline can land better at
 * 44 than at 46. Pinning one value proved one point of a band, and the band `[44, 48]` is entirely
 * reachable — 48 is iPhone SE Safari, 44 is where `touchTargetsFit` gives up, and every browser with
 * chrome between theirs lands in between. `ui-ux-tester` round 2, brief 2, finding 5.
 *
 * The upper end is inclusive: 48 is a real measured device, not a bound.
 */
export const LIVE_SIZES_PX = Object.freeze([44, 45, 46, 47, 48]);

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
