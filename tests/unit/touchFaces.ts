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
import { keylineMarks } from '../../tools/gen/touchInk.mjs';
import { downscale } from '../../tools/gen/resize.mjs';

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
 * It is `TOUCH_MIN_CSS_PX` now, so the size the gate measures is the size below which a control
 * stops existing. **The two constants are the same one**: raise the production floor and the gate
 * follows, which is the direction that cannot go wrong.
 *
 * ⚠️ **The old shipped art did NOT pass here.** At 44, `touch-pause`'s cogwheel measured
 * **2.905:1** on strokes 1 and 4 — the only strokes in the set that missed — which is what bought
 * its re-shoot. The heavy pause bars read 3.088:1 and 3.318:1, and the tightest stroke anywhere in
 * the set is now 3.088:1.
 */
export const TRUE_SIZE_PX = TOUCH_MIN_CSS_PX;

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
export function cutFace(
  key: string,
  root = TOUCH_CUT_DIR,
): {
  cut: ReturnType<typeof readPng>;
  mark: Uint8Array;
  seeds: Uint8Array;
} {
  const cut = readPng(`${root}/${key}.png`);
  const { mark, seeds } = keylineMarks(cut);
  return { cut, mark, seeds };
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

/**
 * Every mark pixel, labelled by the SEED stroke it belongs to.
 *
 * 🔴 **The halo invents topology, so the halo cannot define the strokes.** Labelling the
 * finished mask made `walk`'s two bars one component — their keylines touch — and an 11-pixel
 * bridge was then enough to keep 927 erased pale pixels inside a component that still scored
 * 3.318:1. Codex round-13. The components come from `keylineMarks`'s pre-dilation `seeds`, which is
 * the engraving the plate actually drew, and every mark pixel is assigned to the nearest seed by a
 * breadth-first sweep across the mark itself.
 *
 * Returns -1 for anything that is not a mark pixel, and asserts nothing is left unreached.
 */
export function strokeLabels(
  mark: Uint8Array,
  seeds: Uint8Array,
  width: number,
): { labels: Int32Array; count: number } {
  const { labels: seedLabels, count } = markComponents(seeds, width);
  const labels = new Int32Array(mark.length).fill(-1);
  let frontier: number[] = [];
  for (let p = 0; p < mark.length; p += 1) {
    if (seedLabels[p]! < 0) continue;
    labels[p] = seedLabels[p]!;
    frontier.push(p);
  }
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const q of frontier) {
      const x = q % width;
      const y = (q - x) / width;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width) continue;
          const r = ny * width + nx;
          if (r >= mark.length || !mark[r] || labels[r]! >= 0) continue;
          labels[r] = labels[q]!;
          next.push(r);
        }
      }
    }
    frontier = next;
  }
  let orphans = 0;
  for (let p = 0; p < mark.length; p += 1) {
    if (mark[p] && labels[p]! < 0) orphans += 1;
  }
  expect(orphans, 'mark pixels that no engraving stroke reaches').toBe(0);
  return { labels, count };
}

/**
 * Every stroke's WORST contrast over a swept background, at true on-screen size.
 *
 * Lifted out of `shipped-touch-contrast.test.ts` so the shipped faces and a STAGED candidate are
 * measured by one definition rather than two that agree on the happy path. Codex plan review,
 * round 3: parameterising the loaders alone left the algorithm inside a Vitest case body, where a
 * candidate validator could not reach it.
 *
 * Everything the algorithm was carrying stays:
 *
 * - **The mark comes from the CUT face, the strokes from its PRE-HALO seeds.** A mask discovered
 *   from the shipped file is the mutated bytes describing themselves (round 11), and labelling the
 *   finished mask lets the halo merge the strokes it was meant to separate (round 13).
 * - **`max(ink : background)` over a SWEPT background**, which is `contrast-floor.test.ts`'s
 *   method: no single colour wins against every background.
 * - **Composite at full size, then downscale the composite**, through this repository's own
 *   `downscale`. A second box filter rolled by hand partitions the source differently (round 10).
 * - **A stroke must SURVIVE the downscale**, counted separately, because a stroke reduced to
 *   nothing has no worst pixel to fail on (round 10).
 *
 * @param png the face as it ships
 * @param mark the mark mask from the cut face
 * @param seeds the pre-dilation seeds from the cut face
 * @param alpha the alpha the scene draws the face at
 */
export function strokeContrast(
  png: { width: number; height: number; data: Uint8ClampedArray },
  mark: Uint8Array,
  seeds: Uint8Array,
  alpha: number,
): { worst: number[]; surviving: number[]; count: number } {
  const { labels, count } = strokeLabels(mark, seeds, png.width);

  // Where each stroke is, at the SAME resolution and through the SAME partitioning as the
  // composite below. The alpha channel carries the coverage: 255 where this stroke, 0 elsewhere.
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
        // An output pixel counts as this stroke only if the stroke is most of what fell into it.
        // Anything less is a blend of mark and plate, not what a reader is looking at.
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
  return { worst, surviving, count };
}
