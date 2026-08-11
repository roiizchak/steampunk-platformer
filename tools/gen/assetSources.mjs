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
        `run \`npm run assets:fetch\` to re-fetch it from the request ids in ` +
        `docs/generations/ (indexed by docs/GENERATION-LOG.md). This build does NOT substitute ` +
        `a placeholder (vault 4.16).`,
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
export function framesOf(keyed) {
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
