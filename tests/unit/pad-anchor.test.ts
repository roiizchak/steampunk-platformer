/**
 * WORK ITEM A-T3 — `padAnchor.mjs`'s `padToFill`.
 *
 * The fixture is a 40x60 chroma-green rectangle with a 20x40 fully-opaque "subject" block placed
 * at (10,10). `figureHeight` is therefore known by construction (40px), which is what makes the
 * geometry checks below exact rather than approximate.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_FILL, padToFill } from '../../tools/gen/padAnchor.mjs';
import { borderKey, keyOut } from '../../tools/gen/chroma.mjs';
import { blank } from '../../tools/gen/png.mjs';
import { fill as paint } from '../../tools/gen/gates.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';

const GREEN: [number, number, number, number] = [0, 255, 0, 255];
const SUBJECT: [number, number, number, number] = [200, 50, 50, 255];

const SRC_W = 40;
const SRC_H = 60;
const SUBJECT_X = 10;
const SUBJECT_Y = 10;
const SUBJECT_W = 20;
const SUBJECT_H = 40;

function makeFixture(): RgbaImage {
  const image = blank(SRC_W, SRC_H, GREEN);
  return paint(image, SUBJECT_X, SUBJECT_Y, SUBJECT_W, SUBJECT_H, SUBJECT);
}

/** Fully-opaque (alpha === 255) bounding box after keying — the same test chroma primitives use. */
function keyedBounds(image: RgbaImage) {
  const keyed = keyOut(image, { key: borderKey(image) });
  const { width, height, data } = keyed;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (data[(y * width + x) * 4 + 3] === 255) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

describe('padToFill', () => {
  it('carries the subject pixels across byte-identical', () => {
    const original = makeFixture();
    const padded = padToFill(original, { fill: 0.5 });

    // Expected offset computed directly from the formula, NOT via any helper padAnchor.mjs uses.
    const expectedOffsetX = Math.floor((padded.width - SRC_W) / 2);
    const expectedOffsetY = Math.floor((padded.height - SRC_H) / 2);

    for (let y = 0; y < SRC_H; y += 1) {
      const from = y * SRC_W * 4;
      const to = ((expectedOffsetY + y) * padded.width + expectedOffsetX) * 4;
      const originalRow = original.data.subarray(from, from + SRC_W * 4);
      const paddedRow = padded.data.subarray(to, to + SRC_W * 4);
      expect(Array.from(paddedRow)).toEqual(Array.from(originalRow));
    }
  });

  it('sizes the canvas to the computed value and keeps it square', () => {
    const padded = padToFill(makeFixture(), { fill: 0.5 });
    // figureHeight (40) / fill (0.5) = 80, already even.
    expect(padded.width).toBe(80);
    expect(padded.height).toBe(80);
  });

  it('achieves the requested fill fraction within 1%', () => {
    const padded = padToFill(makeFixture(), { fill: 0.5 });
    const bounds = keyedBounds(padded);
    const achieved = bounds.height / padded.height;
    expect(Math.abs(achieved - 0.5)).toBeLessThan(0.01);
  });

  it('fills every pixel outside the blitted region with the borderKey colour', () => {
    const original = makeFixture();
    const key = borderKey(original);
    const padded = padToFill(original, { fill: 0.5 });
    const offsetX = Math.floor((padded.width - SRC_W) / 2);
    const offsetY = Math.floor((padded.height - SRC_H) / 2);

    for (let y = 0; y < padded.height; y += 1) {
      for (let x = 0; x < padded.width; x += 1) {
        const inBlit = x >= offsetX && x < offsetX + SRC_W && y >= offsetY && y < offsetY + SRC_H;
        if (inBlit) continue;
        const i = (y * padded.width + x) * 4;
        expect([padded.data[i], padded.data[i + 1], padded.data[i + 2], padded.data[i + 3]]).toEqual(
          [key[0], key[1], key[2], 255],
        );
      }
    }
  });

  it('throws when the requested fill would need a canvas smaller than the source', () => {
    // figureHeight 40 / 0.9 = 44.4 -> 44 (even), which is below the 60px source height.
    expect(() => padToFill(makeFixture(), { fill: 0.9 })).toThrow(/cannot hold/);
  });

  it('exports a default fill of 0.65', () => {
    expect(DEFAULT_FILL).toBe(0.65);
  });
});
