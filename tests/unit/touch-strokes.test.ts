/**
 * The two helpers the contrast gate's whole claim rests on, driven directly.
 *
 * 🔴 **A gate's decision function needs its own gate.** `markComponents` and `strokeLabels` had
 * neither a test nor a second consumer: collapsing every label to zero restores exactly the
 * per-face statistic round 12 replaced, under which all six shipped faces still pass — so the
 * mutation that guts the split was green, and M65/M67 only ever proved the helper works on damaged
 * art, never that the helper is what caught it. Codex round-13, M68.
 *
 * The fixture is the shape the real failure had: two separate engravings whose keylines touch, so
 * the finished mask is ONE component and the seeds are two.
 */

import { describe, expect, it } from 'vitest';

import { markComponents, strokeLabels } from './touchFaces';

const W = 16;

/** Two 3 x 3 blocks with a one-pixel gap between them — separate seeds. */
function twoSeeds(): Uint8Array {
  const seeds = new Uint8Array(W * W);
  for (let y = 6; y < 9; y += 1) {
    for (let x = 2; x < 5; x += 1) seeds[y * W + x] = 1;
    for (let x = 6; x < 9; x += 1) seeds[y * W + x] = 1;
  }
  return seeds;
}

/** The same two blocks after a dilation that closes the gap: one connected mark. */
function bridgedMark(): Uint8Array {
  const mark = new Uint8Array(W * W);
  for (let y = 5; y < 10; y += 1) {
    for (let x = 1; x < 10; x += 1) mark[y * W + x] = 1;
  }
  return mark;
}

describe('markComponents', () => {
  it('separates two blocks that do not touch, and joins the ones that do', () => {
    expect(markComponents(twoSeeds(), W).count).toBe(2);
    expect(markComponents(bridgedMark(), W).count).toBe(1);
  });

  it('gives every pixel of one block the same label, and the two blocks different ones', () => {
    const { labels } = markComponents(twoSeeds(), W);
    const left = labels[6 * W + 2]!;
    const right = labels[6 * W + 6]!;
    expect(left, 'a marked pixel was left unlabelled').toBeGreaterThanOrEqual(0);
    expect(left, 'two blocks a pixel apart were labelled as one stroke').not.toBe(right);
    expect(labels[8 * W + 4], 'one block came out as two labels').toBe(left);
    expect(labels[8 * W + 8], 'one block came out as two labels').toBe(right);
    expect(labels[0], 'an unmarked pixel was labelled').toBe(-1);
  });
});

describe('strokeLabels', () => {
  it('keeps two strokes apart even when the halo has merged them into one component', () => {
    const mark = bridgedMark();
    const { labels, count } = strokeLabels(mark, twoSeeds(), W);
    expect(markComponents(mark, W).count, 'the fixture is not the failing shape').toBe(1);
    expect(count, 'the halo merged two engravings into one stroke').toBe(2);
    expect(labels[7 * W + 2], 'a stroke lost its own seed').not.toBe(labels[7 * W + 8]);
  });

  it('gives every halo pixel to the nearer of the two engravings', () => {
    const { labels } = strokeLabels(bridgedMark(), twoSeeds(), W);
    const left = labels[7 * W + 3]!;
    const right = labels[7 * W + 7]!;
    // The halo one pixel out from each block belongs to that block, not to the other.
    expect(labels[7 * W + 1], 'a pixel beside the left block went to the right one').toBe(left);
    expect(labels[7 * W + 9], 'a pixel beside the right block went to the left one').toBe(right);
    expect(labels[0], 'an unmarked pixel was assigned to a stroke').toBe(-1);
  });
});
