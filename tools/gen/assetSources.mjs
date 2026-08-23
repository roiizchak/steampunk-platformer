/**
 * Pure source-loading helpers for `build-assets.mjs` — split out so `build-assets.mjs` has headroom
 * under the 400-line cap. Everything here is engine-free and takes its config (generated dir, config
 * path, slug) as parameters rather than closing over `build-assets.mjs`'s module-level constants, so
 * this file has no dependency on which slug is being built.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { decodePng } from './png.mjs';
import {
  estimateKeyColour,
  keyOut,
  removeSpecks,
  trimHalo,
} from './chroma.mjs';
import { assertSingleRowLayout, detectFrames } from './sheets.mjs';
import { motionKeyFor } from './slugConfig.mjs';
import { clipStem } from './clipJobs.mjs';

export function findSource(generated, slug, action) {
  if (!existsSync(generated)) {
    throw new Error(
      `assets:build: ${generated} does not exist. Raw model output is gitignored by design — ` +
        // 🔴 This used to say "run `npm run assets:fetch`". **That script does not exist**, and has
        // not for as long as the message has (session inventory 4.5, corrected 2026-08-23). An error
        // that tells you to run a command that is not there is worse than one that says nothing: it
        // spends the reader's time proving the tool is missing before they can start recovering.
        `re-fetch it with \`genmedia\` from the request ids recorded in docs/generations/ ` +
        `(indexed by docs/GENERATION-LOG.md); completed job records are free to re-fetch (4.9). ` +
        `This build does NOT substitute a placeholder (vault 4.16).`,
    );
  }
  // Exact filename, not a prefix scan: the producer (`build-clips.mjs`) writes
  // `${clipStem(motionKey)}-clip.png`, and resolving anything looser is R1/R2 (work item A-T4) —
  // a namespaced action never matched its own prefix, and a bare action matched EVERY slug's sheet.
  const file = `${clipStem(motionKeyFor(slug, action))}-clip.png`;
  const path = join(generated, file);
  if (!existsSync(path)) {
    throw new Error(
      `assets:build: no source sheet for declared animation "${action}" — expected ${path}. ` +
        `A declared input that cannot be found fails the build; it is never substituted ` +
        `(vault 4.16).`,
    );
  }
  return path;
}

export function loadConfig(configPath) {
  if (!existsSync(configPath)) {
    // NOT "run with --derive-scale to produce one" — --derive-scale calls loadConfig() itself (see
    // main(), below), so the config must already exist (renderHeightPx set, scale null) before it
    // can print anything.
    throw new Error(
      `assets:build: ${configPath} not found. Author it by hand first (renderHeightPx set, scale ` +
        `null), THEN run --derive-scale to print a value to paste in (vault A5).`,
    );
  }
  return JSON.parse(readFileSync(configPath, 'utf8'));
}

/** Key a whole sheet and return it plus the measured key colour. */
export function keySheet(path) {
  const decoded = decodePng(readFileSync(path));
  const { key, agreement } = estimateKeyColour(decoded);
  // `trimHalo` runs BEFORE `removeSpecks` and before anything measures the figure. The halo it
  // removes is connected to the character, so component-area filtering cannot see it, and every
  // downstream measurement — the packer's feet alignment, the derived scale, the stride — would
  // otherwise be taken against a haze rather than against the boots.
  const keyed = removeSpecks(trimHalo(keyOut(decoded, { key })));
  return { decoded, keyed, key, agreement };
}

/**
 * Cut the detected frame rectangles out of the keyed sheet.
 *
 * Each cell is cropped to its own buffer and its original `y` is dropped, which is fine only while
 * every cell came from ONE row band — `packStrip` compares `maxY` across cells to find the sheet's
 * contact frame, and coordinates from two different rows are not comparable. `build-clips.mjs`
 * emits `N x 1` strips, so that holds; `assertSingleRowLayout` is what stops it holding silently.
 */
/**
 * Split a strip at a pitch the producer DECLARED, cropping each cell to its own content.
 *
 * `detectFrames` cannot tell a cell boundary from a detached limb — it splits on any run of empty
 * columns wider than `minGap`. `rust-scavenger/death` is where that bites: the scavenger comes
 * apart, a 64 px chunk flies left, and the 46 px of clear space behind it reads as a frame
 * boundary. The strip segmented into **12 bands for 10 sampled frames**, and the packer rejected
 * cell 5 as `36x9 against a median height of 229 - that is a fragment, not a frame`.
 *
 * That is the same fact that makes `keepLargestComponent` refuse `death` (vault 4.13): a dying
 * figure is legitimately more than one connected component. It had to be taught in two places.
 *
 * Reading the pitch the producer wrote is vault 4.11's own rule applied to a file that now states
 * its geometry, rather than the guess-it-back-from-pixels version of the same rule. Cropping to
 * content afterwards means a well-behaved clip - one band per cell - comes out byte-identical to
 * what `detectFrames` produced, which is what makes this safe to introduce under shipped art.
 */
export function splitAtPitch(keyed, cellWidth) {
  if (!Number.isInteger(cellWidth) || cellWidth <= 0) {
    throw new Error(`splitAtPitch: the cell pitch must be a positive integer, got ${cellWidth}`);
  }
  if (keyed.width % cellWidth !== 0) {
    throw new Error(
      `splitAtPitch: strip width ${keyed.width} is not a whole multiple of the declared cell ` +
        `pitch ${cellWidth}. Flooring here would silently drop the tail of the strip.`,
    );
  }
  const count = keyed.width / cellWidth;
  // `>= 8` matches `detectFrames`' own opacity threshold, so the two paths agree on what counts as
  // drawn — a second definition of "opaque" is exactly vault 5.3's bug.
  const opaque = (x, y) => keyed.data[(y * keyed.width + x) * 4 + 3] >= 8;

  /**
   * ONE row band for the whole strip, exactly as `detectFrames` produces.
   *
   * Cropping each cell to its own vertical bounds instead looks tighter and is wrong: `packStrip`
   * reads inter-frame vertical information out of these buffers, and a per-cell crop re-zeroes
   * every frame's lift. That is the inverted-bob defect `character-bounds.json`'s `_baseline` note
   * already records — "a gap below any OTHER frame is the lift the model drew and must be
   * preserved" — measured at up to a full tile of concertina on the fall.
   *
   * Caught by comparing a repacked `rust-scavenger/walk` against the shipped bytes: the per-cell
   * version differed, and it had no business differing.
   */
  let bandTop = Infinity;
  let bandBottom = -1;
  for (let y = 0; y < keyed.height; y += 1) {
    for (let x = 0; x < keyed.width; x += 1) {
      if (opaque(x, y)) {
        if (y < bandTop) bandTop = y;
        if (y > bandBottom) bandBottom = y;
        break;
      }
    }
  }
  if (bandBottom < 0) {
    throw new Error('splitAtPitch: the strip is empty after keying — nothing to split');
  }

  const frames = [];
  for (let c = 0; c < count; c += 1) {
    let minX = Infinity;
    let maxX = -1;
    for (let y = bandTop; y <= bandBottom; y += 1) {
      for (let x = c * cellWidth; x < (c + 1) * cellWidth; x += 1) {
        if (opaque(x, y)) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }
    const minY = bandTop;
    const maxY = bandBottom;
    if (maxX < 0) {
      throw new Error(
        `splitAtPitch: cell ${c} of ${count} is EMPTY. That is a blank frame in the animation, ` +
          `not a layout problem — the strip has the declared number of cells and one holds nothing.`,
      );
    }
    const w = maxX - minX + 1;
    const h = maxY - minY + 1;
    const data = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y += 1) {
      const from = ((minY + y) * keyed.width + minX) * 4;
      data.set(keyed.data.subarray(from, from + w * 4), y * w * 4);
    }
    frames.push({ width: w, height: h, data });
  }
  return frames;
}

/**
 * The declared cell pitch for a clip strip, or `null` when the strip predates the sidecar.
 *
 * `null` keeps the `detectFrames` path, so every sheet packed before this existed keeps packing
 * exactly as it did. New extractions get the exact geometry.
 */
export function cellPitchFor(sourcePath) {
  const sidecar = sourcePath.replace(/\.png$/, '.json');
  if (!existsSync(sidecar)) {
    return null;
  }
  const { cellWidth } = JSON.parse(readFileSync(sidecar, 'utf8'));
  return typeof cellWidth === 'number' ? cellWidth : null;
}

export function framesOf(keyed, cellWidth = null) {
  if (cellWidth !== null) {
    return splitAtPitch(keyed, cellWidth);
  }
  const rects = detectFrames(keyed);
  assertSingleRowLayout(rects);
  return rects.map((r) => {
    const data = new Uint8ClampedArray(r.w * r.h * 4);
    for (let y = 0; y < r.h; y += 1) {
      const from = ((r.y + y) * keyed.width + r.x) * 4;
      data.set(keyed.data.subarray(from, from + r.w * 4), y * r.w * 4);
    }
    return { width: r.w, height: r.h, data };
  });
}

/** Pull frame `i` back out of a packed strip, for gating. */
export function sliceFrame(strip, index, frameWidth, frameHeight) {
  const data = new Uint8ClampedArray(frameWidth * frameHeight * 4);
  for (let y = 0; y < frameHeight; y += 1) {
    const from = (y * strip.width + index * frameWidth) * 4;
    data.set(strip.data.subarray(from, from + frameWidth * 4), y * frameWidth * 4);
  }
  return { width: frameWidth, height: frameHeight, data };
}
