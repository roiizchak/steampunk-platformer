/**
 * Packing a grid sheet's cells into one uniform-cell strip — split out of `sheets.mjs` to keep
 * that file under the 400-line limit. `sheets.mjs` re-exports `frameLifts` and `packStrip` from
 * here, because `build-assets.mjs` and the `sheet-packing*.test.ts` files import them by name
 * from `'./sheets.mjs'` and those import sites are not being changed by this split.
 *
 * See `sheets.mjs`'s header for the two alignment decisions (centroid horizontal, single-baseline
 * vertical) this file implements.
 */

import { figureMetrics } from './figureMetrics.mjs';
import { crop, downscale } from './resize.mjs';

/**
 * Pack keyed cells into one uniform-cell horizontal strip.
 *
 * Every frame is scaled by the SAME `scale`, then placed so its centroid sits on the cell's centre
 * line and its feet sit at their measured height above the SHEET's contact line — see the header's
 * vertical paragraph. Returns the strip plus the per-frame metrics, which is what the catalog, the
 * lift-profile manifest and the Gym all need.
 */
/**
 * How far above the sheet's contact line each frame is drawn, in game pixels.
 *
 * Two anchors, because two different things are true of grounded and airborne animations.
 *
 * **`feet`** — track the figure's lowest opaque row. Right whenever the ART is what puts the
 * character on the floor: the contact frame defines the line and a lifted boot or a flight phase
 * reads as exactly the lift the model drew.
 *
 * **`centroid`** — track the figure's vertical centre of mass instead. Right for `jump` and `fall`,
 * where the SIM owns altitude: `stepVertical` already moves the sprite every tick, so art that also
 * rises adds a second, uncorrelated motion. Measured on the shipped clips, feet-anchoring gave the
 * jump 51 px of its own climb and put a 48 px balloon in the middle of the fall; centroid-anchoring
 * holds both inside ~11 px and lets only the pose change. Chosen on sight from the A/B, which is the
 * only way this one could be chosen — ranges alone cannot separate pose deformation from drift.
 *
 * Both are then **normalised so the lowest-drawn frame sits exactly on the line**. Centroid lifts are
 * signed, and without this a frame could be placed below the cell floor — which the vertical guard
 * would (correctly) throw on. Normalising preserves every inter-frame relationship and only chooses
 * where the set as a whole rests.
 */
export function frameLifts(cells, metrics, scale, anchor = 'feet') {
  let raw;
  if (anchor === 'feet') {
    const deepest = Math.max(...metrics.map((m) => m.maxY));
    raw = metrics.map((m) => (deepest - m.maxY) * scale);
  } else if (anchor === 'centroid') {
    /**
     * Place so the DRAWN centre of mass lands on one row — which is NOT the same as differencing the
     * cell-absolute centroid, and the first version of this did exactly that and was wrong by up to
     * 110 px.
     *
     * The placement is `top = baselineY - sh - lift`, i.e. every frame is positioned by its own
     * scaled HEIGHT and then lifted. So the packed centroid is `top + (centroidY - minY) * scale`,
     * and the quantity that has to be cancelled is the centroid's offset *inside the figure* minus
     * that height. The cell-absolute centroid ignores both, so aligning on it left the figures
     * scattered exactly as far apart as their heights differed.
     *
     * Any constant falls out in the normalisation below, so there is no reference frame to choose.
     */
    raw = metrics.map((m) => {
      const sh = Math.max(1, Math.round(m.height * scale));
      return (m.centroidY - m.minY) * scale - sh;
    });
  } else {
    throw new Error(
      `frameLifts: unknown vertical anchor "${anchor}". Use "feet" for grounded animations or ` +
        `"centroid" for airborne ones, and say which in character-bounds.json.`,
    );
  }
  const rounded = raw.map((v) => Math.round(v));
  const floor = Math.min(...rounded);
  return rounded.map((v) => v - floor);
}

export function packStrip(cells, { scale, frameWidth, frameHeight, baselineY, anchor = 'feet' }) {
  if (!(scale > 0)) throw new Error(`packStrip: scale must be > 0, got ${scale}`);
  const strip = {
    width: frameWidth * cells.length,
    height: frameHeight,
    data: new Uint8ClampedArray(frameWidth * cells.length * frameHeight * 4),
  };
  const frames = [];

  // Measure every frame BEFORE placing any of them: the baseline is a property of the sheet, and
  // the deepest frame is the only one that can define it.
  const metrics = cells.map((cell, index) => {
    const m = figureMetrics(cell);
    if (!m) {
      throw new Error(
        `packStrip: frame ${index} has no opaque pixels after keying. A blank frame must fail the ` +
          `build, not be packed as an empty cell (vault 4.16).`,
      );
    }
    return m;
  });
  const deepest = Math.max(...metrics.map((m) => m.maxY));

  /**
   * Computed once for the whole sheet, before anything is placed — see `frameLifts`. Zero on the
   * lowest-drawn frame by construction, and an integer, so the value the strip is built from and
   * the value the manifest records are the same number. Criterion 4.19 asserts exact equality
   * deliberately: a tolerance would hide the rounding error most likely to appear here.
   */
  const lifts = frameLifts(cells, metrics, scale, anchor);

  // Placement is computed for EVERY frame first, and the clipping checks below sweep the whole
  // array before anything throws — see the checks' own header for why. Nothing is drawn yet.
  const placements = cells.map((cell, index) => {
    const m = metrics[index];
    const liftPx = lifts[index];

    // Trim first, then scale ONCE. Scaling the whole cell would waste most of the work and would
    // quantise the figure's position to the cell grid rather than to its own pixels.
    const figure = crop(cell, m.minX, m.minY, m.width, m.height);
    const sw = Math.max(1, Math.round(m.width * scale));
    const sh = Math.max(1, Math.round(m.height * scale));
    const scaled = sw < m.width || sh < m.height ? downscale(figure, sw, sh) : figure;

    // Centroid, expressed inside the trimmed figure, then scaled.
    const centroidInFigure = (m.centroidX - m.minX) * scale;
    const left = Math.round(index * frameWidth + frameWidth / 2 - centroidInFigure);
    const top = Math.round(baselineY - sh - liftPx);

    return { index, m, liftPx, scaled, sw, sh, left, top, centroidInFigure };
  });

  /**
   * CLIPPING CHECK — and note what it is checking.
   *
   * The obvious guard, `drawnWidth > frameWidth`, is the WRONG measurement and it passed while
   * the art was visibly broken: a run frame drawn 78 px wide inside a 96 px cell still lost its
   * trailing boot, because centroid alignment puts the centre of MASS on the cell's centre line
   * and a fully extended leg reaches much further from the centre of mass than half the figure's
   * width. What has to fit is the distance from the centroid to each edge, doubled — not the
   * width. Vault **4.19**: enumerate the axes your metric measures, then ask which axis the
   * failure lives on. This one lived on an axis the width check did not have.
   *
   * It throws rather than silently cropping, because a cropped sprite still looks like a sprite.
   *
   * **Every frame is swept before throwing, and this is a fix, not a style choice.** Throwing on
   * the FIRST clipped frame reports that frame's own requirement and never evaluates the rest —
   * that is how a sheet's true widest frame went unmeasured while an earlier, narrower one's
   * figure got recorded as "the" requirement. The verdict is unchanged (any clipped frame still
   * fails the build); what changes is that the message names every clipped frame and the true
   * maximum.
   */
  const horizontalClips = placements
    .map((p) => {
      const cellLeft = p.index * frameWidth;
      const overflowLeft = cellLeft - p.left;
      const overflowRight = p.left + p.sw - (cellLeft + frameWidth);
      if (overflowLeft <= 0 && overflowRight <= 0) return null;
      const needed = Math.max(
        Math.ceil(2 * p.centroidInFigure),
        Math.ceil(2 * (p.sw - p.centroidInFigure)),
      );
      return { index: p.index, needed };
    })
    .filter((c) => c !== null);
  if (horizontalClips.length > 0) {
    const worst = horizontalClips.reduce((a, b) => (b.needed > a.needed ? b : a));
    const list = horizontalClips.map((c) => `frame ${c.index} needs ${c.needed}px`).join(', ');
    throw new Error(
      `packStrip: ${horizontalClips.length} frame(s) clipped by the ${frameWidth}px cell — ${list}. ` +
        `MAX REQUIRED: ${worst.needed}px (frame ${worst.index}). Widen frameWidth in ` +
        `character-bounds.json — do NOT rescale this animation to fit (vault 4.14).`,
    );
  }

  /**
   * VERTICAL CLIPPING CHECK — the counterpart to the horizontal one above, and it shared the same
   * first-frame defect: the copy loop below skips any row outside the cell, so an over-tall or
   * highly-lifted frame was silently decapitated instead of failing the build, and throwing on the
   * first offender hid every later, taller one the same way the horizontal check did.
   */
  const verticalClips = placements
    .map((p) => {
      const overflowTop = -p.top;
      const overflowBottom = p.top + p.sh - frameHeight;
      if (overflowTop <= 0 && overflowBottom <= 0) return null;
      return { index: p.index, needed: p.sh + p.liftPx };
    })
    .filter((c) => c !== null);
  if (verticalClips.length > 0) {
    const worst = verticalClips.reduce((a, b) => (b.needed > a.needed ? b : a));
    const list = verticalClips.map((c) => `frame ${c.index} needs ${c.needed}px`).join(', ');
    throw new Error(
      `packStrip: ${verticalClips.length} frame(s) clipped by the ${frameHeight}px cell vertically ` +
        `— ${list}. MAX REQUIRED: ${worst.needed}px (frame ${worst.index}). Raise frameHeight in ` +
        `character-bounds.json — do NOT rescale this animation to fit (vault 4.14).`,
    );
  }

  placements.forEach(({ index, m, liftPx, scaled, sw, sh, left, top }) => {
    for (let y = 0; y < sh; y += 1) {
      const ty = top + y;
      if (ty < 0 || ty >= frameHeight) continue;
      for (let x = 0; x < sw; x += 1) {
        const tx = left + x;
        if (tx < index * frameWidth || tx >= (index + 1) * frameWidth) continue;
        const s = (y * sw + x) * 4;
        if (scaled.data[s + 3] === 0) continue;
        const t = (ty * strip.width + tx) * 4;
        strip.data[t] = scaled.data[s];
        strip.data[t + 1] = scaled.data[s + 1];
        strip.data[t + 2] = scaled.data[s + 2];
        strip.data[t + 3] = scaled.data[s + 3];
      }
    }

    frames.push({
      index,
      sourceWidth: m.width,
      sourceHeight: m.height,
      drawnWidth: sw,
      drawnHeight: sh,
      pixels: m.pixels,
      liftPx,
      // The SOURCE coordinates the lift was measured from — both of them, whichever anchor was
      // used — carried out so the lift-profile manifest records its own inputs and a test can
      // re-derive `liftPx` instead of trusting it.
      sourceMinY: m.minY,
      sourceMaxY: m.maxY,
      sourceCentroidY: m.centroidY,
    });
  });

  return { strip, frames, deepestSourceY: deepest };
}
