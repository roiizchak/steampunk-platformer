/**
 * Splitting a clip strip at its DECLARED cell pitch, not by re-detecting bands.
 *
 * `build-clips.mjs` writes an `N x 1` strip whose pitch it knows exactly — every frame is padded by
 * `GUTTER / 2` px of chroma on each side, so a cell is `clipWidth + GUTTER` wide. `framesOf` threw
 * that away and re-derived the layout with `detectFrames`, which splits on any run of empty columns
 * wider than `minGap` (2 % of sheet height).
 *
 * **That cannot tell a cell boundary from a detached limb**, and `rust-scavenger/death` is where it
 * bites: the scavenger comes apart, a 64 px chunk flies left, and the 46 px of clear space behind it
 * reads as a frame boundary. The strip segmented into **12 bands for 10 sampled frames**, and the
 * packer rejected cell 5 as `36x9 against a median height of 229 — that is a fragment, not a frame`.
 *
 * This is the same underlying fact that makes `keepLargestComponent` refuse `death` (vault 4.13): a
 * dying figure is legitimately more than one connected component. One rule, two places it had to be
 * taught.
 *
 * The fix reads the geometry the producer actually wrote instead of guessing it back — which is
 * vault 4.11's own rule ("read the geometry off the file, never off the label") applied to a file
 * that now states its geometry. `detectFrames` stays the fallback for strips with no sidecar, so
 * nothing already packed changes.
 */

import { describe, expect, it } from 'vitest';

import { splitAtPitch } from '../../tools/gen/assetSources.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';

const CELL_W = 100;
const CELL_H = 60;
const CELLS = 4;

/** Paint an opaque block into `img`. */
function block(img: RgbaImage, x0: number, y0: number, w: number, h: number): void {
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const i = (y * img.width + x) * 4;
      img.data[i] = 200;
      img.data[i + 1] = 120;
      img.data[i + 2] = 60;
      img.data[i + 3] = 255;
    }
  }
}

/** A 4-cell strip. Cell 2 additionally carries a detached fragment separated by a wide clear gap. */
function stripWithDetachedFragment(): RgbaImage {
  const img: RgbaImage = {
    width: CELL_W * CELLS,
    height: CELL_H,
    data: new Uint8ClampedArray(CELL_W * CELLS * CELL_H * 4),
  };
  for (let c = 0; c < CELLS; c += 1) {
    // The body: 30px wide, well inside its cell.
    block(img, c * CELL_W + 55, 10, 30, 40);
  }
  // The debris: 8px wide at the FRONT of cell 2, with 22px of clear space behind it — wider than
  // detectFrames' minGap, narrower than the real gutter. This is the shape that broke death.
  block(img, 2 * CELL_W + 25, 30, 8, 8);
  return img;
}

describe('splitting a clip strip at its declared pitch', () => {
  it('returns one frame per cell even when a cell holds a detached fragment', () => {
    const frames = splitAtPitch(stripWithDetachedFragment(), CELL_W);
    // The defect: band detection returns 5 here — the fragment becomes its own "frame".
    expect(frames).toHaveLength(CELLS);
  });

  it('keeps the fragment WITH its own frame rather than dropping or orphaning it', () => {
    const frames = splitAtPitch(stripWithDetachedFragment(), CELL_W);
    const opaque = (f: RgbaImage): number => {
      let n = 0;
      for (let p = 3; p < f.data.length; p += 4) if (f.data[p]! >= 8) n += 1;
      return n;
    };
    // Cell 2 carries body + debris; every other cell carries only the body.
    expect(opaque(frames[2]!)).toBe(30 * 40 + 8 * 8);
    expect(opaque(frames[0]!)).toBe(30 * 40);
    // And the fragment must not have been silently discarded to make the count come out right.
    expect(opaque(frames[2]!)).toBeGreaterThan(opaque(frames[0]!));
  });

  it('crops each cell to its own content, so a frame is not padded back out to the pitch', () => {
    const frames = splitAtPitch(stripWithDetachedFragment(), CELL_W);
    // Cell 0 holds a 30x40 body and nothing else.
    expect(frames[0]!.width).toBe(30);
    expect(frames[0]!.height).toBe(40);
    // Cell 2 spans from the debris' left edge to the body's right edge: 25 -> 84 inclusive.
    expect(frames[2]!.width).toBe(60);
  });

  it('refuses a pitch the strip is not a whole multiple of', () => {
    // A silent floor here would drop the tail of the strip — the whole class of defect this
    // function exists to remove.
    // Matched on "whole multiple" alone, deliberately: an earlier draft accepted /pitch/i and
    // passed vacuously against `splitAtPitch is not a function` before the function existed.
    expect(() => splitAtPitch(stripWithDetachedFragment(), 99)).toThrow(/whole multiple/i);
  });

  it('throws rather than emitting an empty frame for a genuinely blank cell', () => {
    const img: RgbaImage = {
      width: CELL_W * 2,
      height: CELL_H,
      data: new Uint8ClampedArray(CELL_W * 2 * CELL_H * 4),
    };
    block(img, 55, 10, 30, 40); // cell 0 only; cell 1 is empty
    expect(() => splitAtPitch(img, CELL_W)).toThrow(/empty/i);
  });
});
