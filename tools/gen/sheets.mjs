/**
 * Grid sheet → keyed, aligned, packed sprite strip.
 *
 * The model returns a 2 × 2 grid of loosely-placed figures. The game needs a strip of uniform cells
 * where the character does not jitter between frames. Everything between those two facts lives here.
 *
 * ## The two alignment decisions, and why they are not the obvious ones
 *
 * **Horizontal: align on the CENTROID of opaque pixels, not the bounding-box centre.** A run cycle's
 * bounding box grows and shrinks as the legs extend, so centring the box makes the character slide
 * backwards and forwards on the spot — motion the animation did not ask for and that reads as a
 * limp. The centre of mass barely moves when a limb extends, because the limb is a small fraction of
 * the pixels. This is the same reasoning as vault **4.18**'s warning that the furthest opaque column
 * is the wrong metric: the widest thing in a frame is rarely the thing you mean.
 *
 * **Vertical: align on the lowest opaque row of the SHEET, once — not of each frame.** `playerView`
 * draws the sprite with origin `(0.5, 1)` at the player's feet position, and `PLAYER_BOX` is
 * authored `+y` up from the feet *(vault 2.10)*, so the art's contact line and the collision bottom
 * must be the same line. The frame that reaches deepest — the contact pose, the most-extended pose —
 * is the one that defines it. Every other frame then sits exactly its own measured, scaled lift
 * above that line.
 *
 * It was per-FRAME, and that is the bug this paragraph is the fix for. Pinning each frame's own
 * lowest pixel to the baseline is right for a planted idle and *inverted* for anything with a
 * flight phase: at the frames where both boots are clear of the ground the whole body is dragged
 * DOWN so the lowest boot reaches the line, so the legs pump while the torso sinks. Measured on the
 * shipped art, in game px, the head sank `run` 15, `jump` 67, `fall` 98 — a full tile of concertina
 * on the fall. `character-bounds.json`'s `_footOffsetPx` note predicted exactly this.
 *
 * The reason preserving it is safe, and not double motion on top of `stepVertical`: the clips are
 * camera-locked and their prompts explicitly forbid the figure translating in frame *(`motion.mjs`)*.
 * What the model drew is POSE, not travel.
 *
 * This rests on every cell having been cut from one shared row band, which is what `build-clips`
 * emits and what `assertSingleRowLayout` enforces — `maxY` values from two different rows would be
 * measured from different origins and the lift would be silent nonsense.
 *
 * ## Scale, and vault A5
 *
 * A5's trap is deriving one global constant from a single regenerable frame: regenerate that frame
 * and every other animation silently rescales. So the scale is **not** computed from whichever sheet
 * happens to be present. It is read from `public/assets/config/character-bounds.json`, which is
 * tracked, saved, and only rewritten deliberately through the Gym. Regenerating a sheet moves
 * nothing. `deriveScale()` exists to produce that number the first time and to re-derive it on
 * purpose; the build never calls it.
 *
 * **Nothing here is rescaled per frame.** Vault **4.14**: never rescale one state's frames to fix
 * framing — shift the figure with area preserved to the pixel. All four frames of a sheet, and all
 * five sheets, use the one saved scale.
 */

import { estimateKeyColour, keyOut, removeSpecks } from './chroma.mjs';
import { crop, downscale } from './resize.mjs';

/**
 * Find the frames in a sheet by looking at the pixels, instead of trusting the layout we asked for.
 *
 * **Measured, and this is why the function exists.** The `idle` prompt asked for *"a 4-frame idle
 * animation sprite sheet, arranged as a 2 by 2 grid"* and named four phases. The model returned
 * **eight figures in a 4 × 2 grid**. Splitting on the assumed 2 × 2 put two whole characters in
 * every cell, which showed up as a figure aspect of 0.888 against the anchor's 0.372 — the only
 * reason it was caught is that the number was measured rather than eyeballed.
 *
 * This is vault **4.11** applied to layout: read the geometry off the file, never off the label. The
 * frame COUNT is likewise whatever the sheet actually contains, which costs nothing because
 * `fps = renderFrames * TICK_HZ / simTicks` derives the rate from the count rather than assuming it.
 *
 * Method: project opacity onto each axis, split on runs of empty rows/columns wider than `minGap`.
 * Frames are returned in reading order, top to bottom then left to right.
 */
export function detectFrames(keyed, options = {}) {
  const { width, height, data } = keyed;

  /**
   * **`minGap` is a fraction of the sheet, not a constant, and that is a bug fix.**
   *
   * It was a flat 8 px, which is a sane gap-between-figures on a 2K grid sheet where the drawn
   * character is a few hundred pixels tall. The video path packs 720x1280 source frames, in which
   * the courier stands 1209 px tall — and at that size the green gap between his swinging arm and
   * his torso is comfortably wider than 8 px. So the arm segmented as its OWN column band, became
   * its own "frame", and then packed to nothing once `removeSpecks` had it.
   *
   * The result got through every gate: `walk` shipped 15 cells for 12 sampled frames with **three
   * of them completely EMPTY**, and `fall` 7 for 6 with one empty. `gateMotionFloor` and
   * `gateLoopWrap` both passed, because a blank frame is a large, perfectly consistent difference.
   *
   * The invariant the constant was reaching for is scale-free: a gap that separates two FIGURES is
   * always much wider than a gap inside one. 2 % of the sheet height expresses that at any source
   * resolution — 27 px here, and still 8 px on anything up to 400 px tall.
   */
  const minGap = options.minGap ?? Math.max(8, Math.round(height * 0.02));
  const minExtent = options.minExtent ?? 16;

  const opaqueAt = (x, y) => data[(y * width + x) * 4 + 3] >= 8;

  const bands = (length, across, isOccupied) => {
    const occupied = new Array(length).fill(false);
    for (let i = 0; i < length; i += 1) {
      for (let j = 0; j < across; j += 1) {
        if (isOccupied(i, j)) {
          occupied[i] = true;
          break;
        }
      }
    }
    const out = [];
    let start = -1;
    let gap = 0;
    for (let i = 0; i < length; i += 1) {
      if (occupied[i]) {
        if (start < 0) start = i;
        gap = 0;
      } else if (start >= 0) {
        gap += 1;
        if (gap >= minGap) {
          if (i - gap - start + 1 >= minExtent) out.push([start, i - gap]);
          start = -1;
          gap = 0;
        }
      }
    }
    if (start >= 0 && length - start >= minExtent) out.push([start, length - 1]);
    return out;
  };

  const rows = bands(height, width, (y, x) => opaqueAt(x, y));
  if (rows.length === 0) {
    throw new Error('detectFrames: the sheet is empty after keying — nothing to split');
  }

  const frames = [];
  for (const [y0, y1] of rows) {
    const cols = bands(width, y1 - y0 + 1, (x, dy) => opaqueAt(x, y0 + dy));
    for (const [x0, x1] of cols) {
      frames.push({ x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
  }
  if (frames.length === 0) {
    throw new Error('detectFrames: found rows but no columns — the sheet does not segment');
  }
  return frames;
}

/**
 * Refuse anything but one row of frames, because the sheet baseline cannot survive two.
 *
 * `packStrip` compares `maxY` across cells to find which frame reaches deepest. That comparison is
 * only meaningful if every cell was cut from the SAME row band — true for the `N x 1` strips
 * `build-clips.mjs` emits, and not true in general: `detectFrames` returns a band per row, and the
 * caller crops each rectangle to its own buffer and drops the original `y`. Two frames from
 * different rows would then be compared through different origins, and the resulting lift would be
 * wrong without anything looking wrong. Codex plan review finding 6.
 */
export function assertSingleRowLayout(rects) {
  if (rects.length === 0) throw new Error('assertSingleRowLayout: no frames');
  const tops = new Set(rects.map((r) => r.y));
  if (tops.size !== 1) {
    throw new Error(
      `assertSingleRowLayout: frames span ${tops.size} row bands (tops ${[...tops].join(', ')}), ` +
        `but the sheet baseline needs a single row so every frame's maxY shares one origin. A ` +
        `multi-row sheet must be re-emitted as N x 1 by build-clips.mjs, not packed as-is.`,
    );
  }
}

/** Split a grid image into `cols * rows` cells, reading left to right, top to bottom. */
export function splitGrid(image, cols, rows) {
  if (image.width % cols !== 0 || image.height % rows !== 0) {
    throw new Error(
      `splitGrid: ${image.width}x${image.height} does not divide into ${cols}x${rows} cells`,
    );
  }
  const w = image.width / cols;
  const h = image.height / rows;
  const cells = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      cells.push(crop(image, c * w, r * h, w, h));
    }
  }
  return cells;
}

/**
 * Opaque bounding box, centroid and pixel count.
 *
 * `alphaFloor` is 8 rather than 1 on purpose: the keying ramp leaves a band of very low alpha at
 * the silhouette edge, and counting those as "the figure" makes the bounds a few pixels larger than
 * anything a player can see.
 */
export function figureMetrics(image, alphaFloor = 8) {
  const { width, height, data } = image;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  let sumX = 0;
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] >= alphaFloor) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        sumX += x;
        count += 1;
      }
    }
  }
  if (count === 0) {
    return null;
  }
  return {
    minX, minY, maxX, maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
    centroidX: sumX / count,
    pixels: count,
  };
}

/** Key a cell against its OWN measured background colour and drop specks. */
export function keyCell(cell) {
  const { key } = estimateKeyColour(cell);
  return removeSpecks(keyOut(cell, { key }));
}

/**
 * Source pixels per one game pixel, derived from a neutral standing figure.
 *
 * Called deliberately, never by the build — see the header note on vault A5. `standingHeightPx` is
 * the figure height of an upright neutral pose; `renderHeightPx` is the game's published character
 * render height (96, from ASSET-PIPELINE §0a).
 */
export function deriveScale(standingHeightPx, renderHeightPx) {
  if (!(standingHeightPx > 0) || !(renderHeightPx > 0)) {
    throw new Error(`deriveScale: bad inputs ${standingHeightPx}, ${renderHeightPx}`);
  }
  return renderHeightPx / standingHeightPx;
}

/**
 * Pack keyed cells into one uniform-cell horizontal strip.
 *
 * Every frame is scaled by the SAME `scale`, then placed so its centroid sits on the cell's centre
 * line and its feet sit at their measured height above the SHEET's contact line — see the header's
 * vertical paragraph. Returns the strip plus the per-frame metrics, which is what the catalog, the
 * lift-profile manifest and the Gym all need.
 */
export function packStrip(cells, { scale, frameWidth, frameHeight, baselineY }) {
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

  cells.forEach((cell, index) => {
    const m = metrics[index];

    /**
     * How far above the sheet's contact line this frame's feet were DRAWN, in game pixels.
     *
     * Zero on the deepest frame by construction. Rounded once, here, so the value the strip is
     * built from and the value the manifest records are the same integer — criterion 4.19 asserts
     * exact equality, deliberately, because a tolerance would hide the rounding error most likely
     * to appear at this line.
     */
    const liftPx = Math.round((deepest - m.maxY) * scale);

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
     */
    const cellLeft = index * frameWidth;
    const overflowLeft = cellLeft - left;
    const overflowRight = left + sw - (cellLeft + frameWidth);
    if (overflowLeft > 0 || overflowRight > 0) {
      const needed = Math.max(
        Math.ceil(2 * centroidInFigure),
        Math.ceil(2 * (sw - centroidInFigure)),
      );
      throw new Error(
        `packStrip: frame ${index} is clipped by the ${frameWidth}px cell ` +
          `(${Math.max(0, overflowLeft)}px off the left, ${Math.max(0, overflowRight)}px off the ` +
          `right). It is ${sw}px wide but its centroid sits ${Math.round(centroidInFigure)}px from ` +
          `its left edge, so a cell of at least ${needed}px is required. Widen frameWidth in ` +
          `character-bounds.json — do NOT rescale this animation to fit (vault 4.14).`,
      );
    }

    /**
     * VERTICAL CLIPPING CHECK — the counterpart to the horizontal one above, and it was missing.
     *
     * The copy loop below skips any row outside the cell, so an over-tall or highly-lifted frame
     * was silently decapitated instead of failing the build. A cropped sprite still looks like a
     * sprite, which is exactly how the last two defects on this animation reached the screen. It
     * matters more now than it did: a frame's placement is no longer bounded by its own height,
     * because `liftPx` pushes it upward as well.
     */
    const overflowTop = -top;
    const overflowBottom = top + sh - frameHeight;
    if (overflowTop > 0 || overflowBottom > 0) {
      throw new Error(
        `packStrip: frame ${index} is clipped by the ${frameHeight}px cell vertically ` +
          `(${Math.max(0, overflowTop)}px off the top, ${Math.max(0, overflowBottom)}px off the ` +
          `bottom). It is ${sh}px tall and sits ${liftPx}px above the sheet's contact line, so a ` +
          `cell of at least ${sh + liftPx}px is required. Raise frameHeight in ` +
          `character-bounds.json — do NOT rescale this animation to fit (vault 4.14).`,
      );
    }

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
      // The SOURCE coordinate the lift was measured from, carried out so the lift-profile manifest
      // records its own inputs and a test can re-derive `liftPx` instead of trusting it.
      sourceMaxY: m.maxY,
    });
  });

  return { strip, frames, deepestSourceY: deepest };
}
