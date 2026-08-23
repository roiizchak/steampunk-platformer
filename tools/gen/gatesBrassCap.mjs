/**
 * The STYLE.md §5 gates — zone separation and the brass cap — split out of `gates.mjs` to keep
 * that file under the 400-line limit.
 *
 * `regionStats` measures global colour statistics (warm foreground / cool background) and is
 * BLIND to the brass-cap rule, which is a local edge cue no whole-region statistic can see
 * *(vault 9.3)*; `gateBrassCap` is that other, vertical-distribution measurement. See its own doc
 * comment for the axis split — vault 4.19.
 *
 * `gates.mjs` re-exports `regionStats`, `WARM` and `gateBrassCap` from here, because
 * `build-world.mjs` and `tests/unit/ground-tiles.test.ts` import them by name from `'./gates.mjs'`
 * and those import sites are not being changed by this split.
 */

import { FAIL, INDETERMINATE, PASS, verdict } from './gateVerdict.mjs';

/**
 * Mean saturation and value of a region, for the warm-foreground / cool-background rule.
 *
 * **The HUD region must be excluded from sampling.** It is dark and saturated and sits inside the
 * background band; including it contaminates the result. That was learned the hard way in
 * GENERATION-LOG round 2.
 *
 * This gate is BLIND to STYLE.md's material rule — "every standable platform carries a brass
 * leading edge" is a local edge cue that no whole-region statistic can see *(vault 9.3)*. It says
 * so rather than shipping a number that appears to cover it.
 */
export function regionStats(image, region) {
  const x0 = Math.max(0, region?.x ?? 0);
  const y0 = Math.max(0, region?.y ?? 0);
  const x1 = Math.min(image.width, x0 + (region?.w ?? image.width));
  const y1 = Math.min(image.height, y0 + (region?.h ?? image.height));
  let sat = 0;
  let val = 0;
  let n = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * image.width + x) * 4;
      const r = image.data[i] / 255;
      const g = image.data[i + 1] / 255;
      const b = image.data[i + 2] / 255;
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      sat += max === 0 ? 0 : (max - min) / max;
      val += max;
      n += 1;
    }
  }
  return n === 0 ? { saturation: 0, value: 0, pixels: 0 } : {
    saturation: sat / n, value: val / n, pixels: n,
  };
}

/**
 * What counts as "warm", and how much of it a capped tile needs.
 *
 * Warmth is not decoration in this game: STYLE.md §5 makes it the signal that a thing is
 * reachable. Brass on top of a tile says *stand here*; brass anywhere else says nothing, or worse,
 * lies. So the gate measures **where** the warm pixels are, not merely that some exist.
 */
export const WARM = Object.freeze({
  MIN_ALPHA: 32,
  MIN_RED: 110,
  RED_OVER_BLUE: 40,
  GREEN_OVER_BLUE: 15,
  /** The top quarter of a tile — where a leading edge lives. */
  CAP_BAND: 0.25,
  CAP_MIN_FRACTION: 0.02,
  CAP_TOP_SHARE: 0.8,
  /**
   * "Plain" is defined on the SAME axis as "capped", not on total warmth.
   *
   * The first version asked for <= 1 % warm, and a regenerated tileset showed why that is the
   * wrong question: every masonry tile in it carries some warm pixels (1.8 %, 6.4 %, 12.1 %,
   * 15.4 %) scattered through the brick, and STYLE.md §5 puts the foreground in warm colour on
   * purpose — the ground is *supposed* to be warm. What RULE ONE actually forbids is a buried tile
   * that reads as a platform TOP, and that is warmth **concentrated along the top edge**.
   *
   * So `plain` means "does not read as a leading edge": the warmth is not gathered on top, and the
   * tile is not predominantly warm. Raising a threshold to make a red test green is exactly what
   * this project forbids, so the record is explicit — the ceiling moved because the measure was
   * wrong, and the measure that decides the verdict is `topShare`, which did not move.
   */
  PLAIN_MAX_TOP_SHARE: 0.5,
  PLAIN_MAX_FRACTION: 0.1,
});

function isWarm(data, i) {
  if (data[i + 3] <= WARM.MIN_ALPHA) return false;
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  return r >= WARM.MIN_RED && r - b >= WARM.RED_OVER_BLUE && g - b >= WARM.GREEN_OVER_BLUE;
}

/**
 * Does this tile carry a brass leading edge along its TOP, or is it plain masonry?
 *
 * `BLIND_SPOTS` used to list the brass rule as something *"no region statistic sees"*, and that was
 * true of a region statistic — `regionStats` returns one saturation number for a whole area, which
 * a tile with a brass bar across its middle and a tile with a brass cap on its top edge produce
 * equally. The axis that separates them is **vertical distribution**, which is vault 4.19's whole
 * point: enumerate what your metrics measure, then ask which axis the failure lives on.
 *
 * That distinction is not hypothetical. Phase 4 shipped a ground stack drawn with a mid-bar tile
 * instead of a capped one, and every gate that existed stayed green.
 *
 * `expect` is `'capped'` (a walking surface) or `'plain'` (buried masonry). A tile with no opaque
 * pixels is INDETERMINATE, never a guess *(vault 4.18)*.
 */
export function gateBrassCap(image, expect, region) {
  const x0 = Math.max(0, region?.x ?? 0);
  const y0 = Math.max(0, region?.y ?? 0);
  const x1 = Math.min(image.width, x0 + (region?.w ?? image.width));
  const y1 = Math.min(image.height, y0 + (region?.h ?? image.height));
  const bandEnd = y0 + (y1 - y0) * WARM.CAP_BAND;

  let opaque = 0;
  let warm = 0;
  let warmTop = 0;
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const i = (y * image.width + x) * 4;
      if (image.data[i + 3] <= WARM.MIN_ALPHA) continue;
      opaque += 1;
      if (!isWarm(image.data, i)) continue;
      warm += 1;
      if (y < bandEnd) warmTop += 1;
    }
  }

  const cells = Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
  if (opaque === 0) {
    return verdict(INDETERMINATE, null, 'no opaque pixels in the region — nothing to judge');
  }

  const warmFraction = warm / opaque;
  const topShare = warm === 0 ? 0 : warmTop / warm;
  const value = { opaque, opaqueFraction: opaque / cells, warm, warmFraction, topShare };

  if (expect === 'plain') {
    if (topShare >= WARM.PLAIN_MAX_TOP_SHARE) {
      return verdict(
        FAIL,
        value,
        `expected buried masonry but ${(topShare * 100).toFixed(0)}% of its warm pixels sit in ` +
          `the top ${WARM.CAP_BAND * 100}% — that reads as a leading edge, and an edge on every ` +
          `row identifies nothing (STYLE.md §5 RULE ONE)`,
      );
    }
    if (warmFraction > WARM.PLAIN_MAX_FRACTION) {
      return verdict(
        FAIL,
        value,
        `expected buried masonry but ${(warmFraction * 100).toFixed(1)}% of it is warm — warmth ` +
          `is the reachability signal, and a tile this warm competes with the platforms`,
      );
    }
    return verdict(
      PASS,
      value,
      `plain: ${(warmFraction * 100).toFixed(1)}% warm, only ` +
        `${(topShare * 100).toFixed(0)}% of it on top`,
    );
  }
  if (expect !== 'capped') {
    throw new Error(`gateBrassCap: expect must be 'capped' or 'plain', got ${String(expect)}`);
  }
  if (warmFraction < WARM.CAP_MIN_FRACTION) {
    return verdict(
      FAIL,
      value,
      `expected a brass leading edge but only ${(warmFraction * 100).toFixed(2)}% of the tile is ` +
        `warm — STYLE.md §5 RULE ONE says a player identifies a platform by that edge alone`,
    );
  }
  if (topShare < WARM.CAP_TOP_SHARE) {
    return verdict(
      FAIL,
      value,
      `the tile is ${(warmFraction * 100).toFixed(1)}% warm but only ` +
        `${(topShare * 100).toFixed(0)}% of that sits in its top ${WARM.CAP_BAND * 100}% — brass ` +
        `across the middle is a stripe, not a leading edge, and stacked it reads as a barcode`,
    );
  }
  return verdict(
    PASS,
    value,
    `capped: ${(warmFraction * 100).toFixed(1)}% warm, ${(topShare * 100).toFixed(0)}% of it on top`,
  );
}
