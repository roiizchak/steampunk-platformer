/**
 * **G1 — anchor contact geometry.** The gate criterion 4.27 needed and never had.
 *
 * ## The defect, and what it cost
 *
 * Phase 4's `brass-courier` anchor drew the forward boot **58 source pixels above the rear one**.
 * Every clip generated from that anchor inherited a floating foot, because Seedance is handed the
 * anchor as `image_url` and animates what it is given. It was caught by the user's eye, after the
 * spend — roughly **$7** of re-shot clips — and it is the single most expensive defect in the Phase
 * 4 ledger. It has had no gate until now, which is why 4.27 came into Phase 5 as the top debt item.
 *
 * An anchor is not a pose. It is the reference every later frame is measured against, so a defect
 * in it is not one bad frame — it is a bias applied to the whole sheet.
 *
 * ## What is measured
 *
 * The **vertical spread between the lowest opaque row of each ground-contact limb**. In a standing
 * anchor both boots rest on one floor, so that spread is near zero. One boot drawn higher than the
 * other is exactly the Phase 4 defect, and it is the only thing this gate claims to see.
 *
 * The method, and the reason for each step:
 *
 *  1. **Key the background out** with the same `keyOut` the pipeline uses — not a second copy of
 *     the tolerance ramp *(vault 5.3)*. A gate that keys differently from the packer measures a
 *     figure the packer never sees.
 *  2. **Find the figure's own bounding box**, and take a **ground band** across the bottom of it.
 *     The band is a fraction of the figure's height, so the gate is resolution-independent: the
 *     same anchor at 1024 px and at 2048 px must produce the same verdict.
 *  3. **Split the band into connected components.** Those are the contact limbs. Doing this in the
 *     BAND rather than the whole image is what separates two boots that share a torso — components
 *     over the full figure would return one blob and measure nothing.
 *  4. **Compare the lowest row of each.** The spread is the answer.
 *
 * ## INDETERMINATE is a real verdict *(vault 4.18)*
 *
 * One component means the contact limbs are merged at this resolution — a robe, a pedestal, boots
 * touching. That is not a pass and not a failure: the metric cannot see two feet, so it says so.
 * Converting it to a pass to keep a run green is the failure this gate exists to prevent.
 */

import { CHROMA, components, keyOut } from './chroma.mjs';
import { decodePng } from './png.mjs';
import { FAIL, INDETERMINATE, PASS } from './gates.mjs';

/**
 * How much of the figure's height counts as "touching the ground".
 *
 * 12 %. Wide enough to contain a whole boot on a 3-tile character, narrow enough that a bent knee
 * or a trailing cape hem does not enter it and get counted as a third foot.
 */
export const GROUND_BAND = 0.12;

/**
 * The most the soles may differ, as a fraction of the figure's height.
 *
 * **1.5 %, chosen on principle and NOT from any measurement of the existing anchor.** A threshold
 * fitted to the worst thing you have already shipped cannot fail — that is the trap the plan named
 * explicitly. The principle: both boots stand on one floor, so any visible daylight between the
 * soles is wrong, and 1.5 % of a figure's height is about the width of its own outline.
 *
 * For reference, the Phase 4 defect was 58 px on a figure roughly 1000 px tall — **5.8 %**, nearly
 * four times this limit.
 */
export const MAX_SOLE_SPREAD = 0.015;

/** Ignore band components smaller than this share of the band's area — specks, not limbs. */
const MIN_LIMB_SHARE = 0.02;

function verdict(status, value, reason) {
  return { status, value, reason };
}

/** Opaque bounding box of the keyed figure, or `null` if nothing survived the key. */
function figureBounds(image, minAlpha) {
  const { width, height, data } = image;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] >= minAlpha) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return maxY < 0 ? null : { minX, minY, maxX, maxY };
}

/**
 * Measure an anchor's ground contact.
 *
 * `buffer` is the raw PNG. Returns a gate verdict whose `value` carries the measurement in BOTH
 * pixels and as a fraction of figure height, because the pixel number is what you look at in the
 * image and the fraction is what the threshold is expressed in.
 */
export function gateContactGeometry(buffer, options = {}) {
  const minAlpha = options.minAlpha ?? 128;
  const maxSpread = options.maxSpread ?? MAX_SOLE_SPREAD;

  const raw = decodePng(buffer);
  // Keyed with the pipeline's own function. An anchor that already carries real alpha is passed
  // through unchanged by `keyOut`'s own handling; a chroma-green one is keyed here exactly as the
  // packer will key it.
  const image = keyOut(raw);
  const bounds = figureBounds(image, minAlpha);

  if (bounds === null) {
    return verdict(FAIL, null, 'no opaque figure after keying — the anchor is empty or all key');
  }

  const figureHeight = bounds.maxY - bounds.minY + 1;
  const bandTop = Math.max(bounds.minY, Math.round(bounds.maxY - figureHeight * GROUND_BAND));
  const bandHeight = bounds.maxY - bandTop + 1;
  const bandWidth = bounds.maxX - bounds.minX + 1;

  // A cropped copy of just the ground band. Components are found IN here, so two boots under one
  // torso are two components rather than one figure — see the header.
  const band = {
    width: bandWidth,
    height: bandHeight,
    data: new Uint8ClampedArray(bandWidth * bandHeight * 4),
  };
  for (let y = 0; y < bandHeight; y += 1) {
    for (let x = 0; x < bandWidth; x += 1) {
      const from = ((bandTop + y) * image.width + (bounds.minX + x)) * 4;
      const to = (y * bandWidth + x) * 4;
      band.data[to] = image.data[from];
      band.data[to + 1] = image.data[from + 1];
      band.data[to + 2] = image.data[from + 2];
      band.data[to + 3] = image.data[from + 3];
    }
  }

  const { labels, sizes } = components(band, minAlpha);
  const minLimbPx = Math.max(CHROMA.MIN_COMPONENT_PX, bandWidth * bandHeight * MIN_LIMB_SHARE);

  // Lowest row reached by each surviving component, in FIGURE coordinates.
  const lowest = new Map();
  for (let y = 0; y < bandHeight; y += 1) {
    for (let x = 0; x < bandWidth; x += 1) {
      const p = y * bandWidth + x;
      const label = labels[p];
      if (label < 0 || sizes[label] < minLimbPx) {
        continue;
      }
      const row = bandTop + y;
      if (!lowest.has(label) || row > lowest.get(label)) {
        lowest.set(label, row);
      }
    }
  }

  const soles = [...lowest.values()].sort((a, b) => a - b);
  const value = {
    figureHeight,
    limbs: soles.length,
    soles,
    spreadPx: soles.length > 1 ? soles[soles.length - 1] - soles[0] : 0,
    spreadFraction: soles.length > 1 ? (soles[soles.length - 1] - soles[0]) / figureHeight : 0,
    limitPx: Math.round(figureHeight * maxSpread),
  };

  if (soles.length === 0) {
    return verdict(FAIL, value, 'no contact limb large enough to measure in the ground band');
  }
  if (soles.length === 1) {
    // Vault 4.18. Not a pass: the metric cannot see two feet, so it must not claim they are level.
    return verdict(
      INDETERMINATE,
      value,
      'one contact component — the limbs are merged at this resolution, so sole spread is unmeasurable',
    );
  }
  if (value.spreadFraction > maxSpread) {
    return verdict(
      FAIL,
      value,
      `soles differ by ${value.spreadPx}px (${(value.spreadFraction * 100).toFixed(2)}% of ` +
        `${figureHeight}px figure), limit ${value.limitPx}px — one foot is drawn off the floor`,
    );
  }
  return verdict(
    PASS,
    value,
    `${soles.length} contact limbs, soles within ${value.spreadPx}px of ${value.limitPx}px allowed`,
  );
}
