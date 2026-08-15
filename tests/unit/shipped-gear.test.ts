/**
 * The shipped gear sprite, measured — criteria 6.6b and 6.8's automatable half.
 *
 * ## Why this file exists at all
 *
 * `tools/gen/buildChrome.mjs` downscales the gear to a literal `72`, because `GEAR_BOX` is an
 * object literal in `src/sim/pickups.ts` and not the `export const NAME = <int>;` form the build
 * script's `runtimeConstant` parser can read. That is a second source for one number — the exact
 * defect that shipped a 128 px tilesheet for a 384 px grid in Phase 4.
 *
 * Rather than build a parser for it, the drift is caught where it actually matters: **on the bytes
 * that shipped**, against the constants the game actually uses. If either moves without the other,
 * this goes red. *(vault 3.1 — run the real check over the shipped data.)*
 *
 * ## And the part no automated gate covers
 *
 * Whether the gear READS as a gear at 72 px is `play`'s call under criterion 6.8, and it is not
 * asserted here. Stated plainly rather than approximated with a number that would mean nothing
 * *(vault 9.3)*.
 */

import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import { GEAR_BOX } from '../../src/sim';
import { RENDER_SCALE } from '../../src/game/constants';
import { CHROMA } from '../../tools/gen/chromaKey.mjs';
import catalog from '../../public/assets/index.json';

/** The shipped bytes, read the same way every other art gate in this suite reads them. */
const GEAR_PATH = 'public/assets/objects/gear.png';

describe('the shipped gear sprite', () => {
  it('the shipped bytes decode — nothing below runs against a missing file', () => {
    // `readPng` throws if the file is absent or is not a PNG, so reaching the assertion at all
    // already proves the bytes are there. Asserting the decode as well keeps this from being a
    // test that passes by not running.
    const png = readPng(GEAR_PATH);
    expect(png.width).toBeGreaterThan(0);
    expect(png.height).toBeGreaterThan(0);
  });

  it('is authored at exactly GEAR_BOX x RENDER_SCALE, so nothing scales it on screen', () => {
    const png = readPng(GEAR_PATH);
    const expected = GEAR_BOX.w * RENDER_SCALE;

    expect(typeof png.width).toBe('number');
    expect(png.width).toBe(expected);
    expect(png.height).toBe(GEAR_BOX.h * RENDER_SCALE);
  });

  it('carries a real alpha channel with genuinely transparent pixels', () => {
    // Read the CHANNEL, never `mode === 'RGBA'` (vault 4.12). A file can be RGBA with every alpha
    // byte at 255, which is a chroma key that silently did nothing — and it would draw a green
    // square over the level.
    const png = readPng(GEAR_PATH);
    let transparent = 0;
    let opaque = 0;
    for (let i = 3; i < png.data.length; i += 4) {
      if (png.data[i] === 0) transparent += 1;
      else if (png.data[i] === 255) opaque += 1;
    }
    const total = png.data.length / 4;

    // Both ends, not just one. "Some transparency" passes on a fully-keyed-away empty file too.
    expect(transparent).toBeGreaterThan(total * 0.1);
    expect(opaque).toBeGreaterThan(total * 0.25);
  });

  it('has no chroma green survivors — the key did its whole job', () => {
    // The gear's four spoke cut-outs are holes the chroma shows through, so a partial key leaves
    // green INSIDE the sprite, not just around it. That is invisible in a thumbnail and obvious at
    // 72 px on a dark level.
    const png = readPng(GEAR_PATH);
    let greenSurvivors = 0;
    for (let i = 0; i < png.data.length; i += 4) {
      const [r, g, b, a] = [png.data[i]!, png.data[i + 1]!, png.data[i + 2]!, png.data[i + 3]!];
      if (a < 32) continue;
      const distance = Math.abs(r - CHROMA.KEY[0]) + Math.abs(g - CHROMA.KEY[1]) + Math.abs(b - CHROMA.KEY[2]);
      if (distance < CHROMA.LOW) greenSurvivors += 1;
    }
    expect(greenSurvivors).toBe(0);
  });

  it('has a catalog entry, because an entry is what makes a file an asset', () => {
    // Criterion 6.6b. `catalog-completeness.test.ts` globs `characters/` only, so nothing else in
    // the suite would notice an orphaned object sprite.
    const entry = catalog.images.find((i) => i.key === 'gear');

    expect(entry).toBeDefined();
    expect(entry?.url).toBe('assets/objects/gear.png');
  });
});
