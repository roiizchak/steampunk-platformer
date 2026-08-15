/**
 * Work item A-T2 — the margin function, and the two guards that keep the clip discovery honest:
 * the slug mapping and the exact-count assertion. No network, no ffmpeg, no video — every fixture
 * here is a committed PNG, synthetic or a small real crop already used by `edge-gate.test.ts`.
 */

import { describe, expect, it } from 'vitest';

import { readPng } from '../../tools/gen/png.mjs';
import {
  assertClipCount,
  measureFraming,
  sampleIndices,
  slugForClip,
} from '../../tools/gen/framingReport.mjs';

const FRAMING_FIXTURES = 'tests/fixtures/framing';
const EDGE_FIXTURES = 'tests/fixtures/edges';

describe('measureFraming — the margin function', () => {
  it('a full-bleed frame (subject touches all four edges) has all margins 0', () => {
    const image = readPng(`${FRAMING_FIXTURES}/full-bleed.png`);
    expect(measureFraming(image).margins).toEqual({ left: 0, right: 0, top: 0, bottom: 0 });
  });

  it('a centred subject with a known inset has exactly that inset on all four sides', () => {
    const image = readPng(`${FRAMING_FIXTURES}/centred-inset.png`);
    expect(measureFraming(image).margins).toEqual({ left: 10, right: 10, top: 10, bottom: 10 });
  });

  it('an off-centre subject has correct asymmetric margins', () => {
    const image = readPng(`${FRAMING_FIXTURES}/off-centre.png`);
    expect(measureFraming(image).margins).toEqual({ left: 5, right: 25, top: 15, bottom: 35 });
  });

  it('the real cropped fixture reads left 0 and right 0', () => {
    const image = readPng(`${EDGE_FIXTURES}/brass-sentry-fire-frame.png`);
    const { margins } = measureFraming(image);
    expect(margins.left).toBe(0);
    expect(margins.right).toBe(0);
  });

  it('throws rather than returning nothing when the whole frame keys away', () => {
    const empty = { width: 8, height: 8, data: new Uint8ClampedArray(8 * 8 * 4) };
    expect(() => measureFraming(empty)).toThrow(/nothing to measure/);
  });
});

describe('slugForClip — bare vs namespaced clip names', () => {
  it('maps every bare legacy name to brass-courier', () => {
    for (const name of ['idle', 'walk', 'run', 'jump', 'fall', 'jump-r2']) {
      expect(slugForClip(name)).toBe('brass-courier');
    }
  });

  it('maps a namespaced clip to its prefix slug', () => {
    expect(slugForClip('brass-sentry-fire')).toBe('brass-sentry');
    expect(slugForClip('brass-sentry-idle')).toBe('brass-sentry');
    expect(slugForClip('rust-scavenger-chase')).toBe('rust-scavenger');
    expect(slugForClip('brass-courier-attack-r2')).toBe('brass-courier');
  });

  it('throws on an unknown clip name rather than guessing', () => {
    expect(() => slugForClip('mystery-walk')).toThrow(/cannot map clip/);
  });
});

describe('assertClipCount — the discovery guard', () => {
  it('passes silently at exactly the expected count', () => {
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ path: `clip-${i}.mp4` }));
    expect(() => assertClipCount(seventeen, 17)).not.toThrow();
  });

  it('fires on a short list — the false-green this item must not produce', () => {
    const nine = Array.from({ length: 9 }, (_, i) => ({ path: `clip-${i}.mp4` }));
    expect(() => assertClipCount(nine, 17)).toThrow(/discovered 9.*expected exactly 17/s);
  });

  it('also fires on a list longer than expected', () => {
    const eighteen = Array.from({ length: 18 }, (_, i) => ({ path: `clip-${i}.mp4` }));
    expect(() => assertClipCount(eighteen, 17)).toThrow(/discovered 18/);
  });
});

describe('sampleIndices — evenly-spaced frame selection', () => {
  it('produces exactly n indices, starting at 0', () => {
    const indices = sampleIndices(97, 6);
    expect(indices).toEqual([0, 16, 32, 48, 64, 80]);
  });

  it('throws when there are fewer source frames than requested samples', () => {
    expect(() => sampleIndices(3, 6)).toThrow(/need at least 6/);
  });
});
