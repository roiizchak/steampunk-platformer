/**
 * The clip sampler, on signals whose right answer is known by construction.
 *
 * The sampler decides which source frames of a Seedance clip become the sheet, and the thing it has
 * to get right is the CYCLE LENGTH: `simTicks` is the duration of one locomotion cycle *(vault
 * 4.22)*, so a sheet holding two strides halves the derived fps and reintroduces foot-slide. The
 * real clips measured 4.0 cycles (walk), 6.1 (run) and 2.6 (idle) against a prompt that asked for
 * exactly 2 in each, so the count cannot come from the prompt and has to be measured off the file
 * *(vault 4.11)*.
 *
 * Every fixture here is a synthetic difference function, built from a known period — no clip, no
 * ffmpeg, no `_generated/`, so this runs on a fresh clone and under `test:sim-isolated` *(vault
 * 4.21)*.
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_WRAP_OVER_EXCURSION,
  MIN_MEDIAN_STEP,
  WRAP_SLACK,
  chooseCycleWindow,
  scoreWindow,
  windowIndices,
} from '../../tools/gen/sampler.mjs';

/**
 * A clip that cycles with `period` source frames.
 *
 * Difference is the distance between two phases on a circle, so it is zero at a whole period and
 * maximal half a period apart — the defining property of a cyclic motion, and the only property the
 * sampler is allowed to rely on.
 */
const cyclic =
  (period: number, amplitude = 0.4) =>
  (i: number, j: number) => {
    const phase = (2 * Math.PI * (i - j)) / period;
    return (amplitude * (1 - Math.cos(phase))) / 2;
  };

describe('windowIndices', () => {
  it('samples evenly and lands on integer source frames — nothing is interpolated', () => {
    expect(windowIndices(0, 12, 4)).toEqual([0, 3, 6, 9]);
    expect(windowIndices(5, 16, 4)).toEqual([5, 9, 13, 17]);
  });

  it('spans the window rather than the closed interval, so the wrap is a real step', () => {
    // The last index is one step short of start+length. Sampling the CLOSED interval would make the
    // last frame identical to the first, which manufactures a perfect wrap out of a duplicate.
    const idx = windowIndices(0, 24, 12);
    expect(idx[idx.length - 1]).toBe(22);
    expect(idx).not.toContain(24);
  });
});

describe('scoreWindow refuses a frozen window instead of scoring it', () => {
  it('returns null when nothing moves — a wrap of zero over a step of zero is not a closed loop', () => {
    expect(scoreWindow(() => 0, [0, 1, 2, 3])).toBeNull();
  });

  it('returns null just below the floor and a score just above it', () => {
    const below = MIN_MEDIAN_STEP / 2;
    const above = MIN_MEDIAN_STEP * 2;
    expect(scoreWindow(() => below, [0, 1, 2, 3])).toBeNull();
    expect(scoreWindow(() => above, [0, 1, 2, 3])?.step).toBeCloseTo(above, 6);
  });
});

describe('chooseCycleWindow finds the period, not a multiple of it', () => {
  it.each([16, 24, 36, 48])('recovers a period of %i frames', (period) => {
    const chosen = chooseCycleWindow(cyclic(period), { sourceFrames: 97, frames: 12 });
    expect(chosen).not.toBeNull();
    // ±1 because the sampled indices are rounded to whole source frames.
    expect(Math.abs((chosen?.length ?? 0) - period)).toBeLessThanOrEqual(1);
  });

  it('takes ONE cycle when two would also close — this is the foot-slide guard', () => {
    // Both 16 and 32 close a period-16 signal. Returning 32 would put two strides in a one-stride
    // sheet, which is exactly the defect `simTicks` exists to prevent.
    const chosen = chooseCycleWindow(cyclic(16), { sourceFrames: 97, frames: 12 });
    expect(chosen?.length).toBeLessThan(24);
  });

  it('the chosen window closes: its wrap is within slack of its own median step', () => {
    const chosen = chooseCycleWindow(cyclic(24), { sourceFrames: 97, frames: 12 });
    expect(chosen?.ratio).toBeLessThanOrEqual(WRAP_SLACK);
  });

  it('a window one step short of the period does NOT close — the test above cannot pass vacuously', () => {
    const diff = cyclic(24);
    const short = scoreWindow(diff, windowIndices(0, 18, 12));
    expect(short?.ratio).toBeGreaterThan(WRAP_SLACK);
  });

  it('does NOT settle for the shortest window the search allows — the real defect this had', () => {
    // The first sampler scored on `wrap <= slack x medianStep` alone. It chose a 12-frame window,
    // the minimum length, for both walk and run, and reported 8.1 cycles in clips whose feet showed
    // 4 and 6: at that length the samples are adjacent source frames, the median step is noise, and
    // one of 85 candidate starts always passes by luck. `returned` is what makes a half-cycle
    // impossible to accept, so the floor is that the chosen length is a real fraction of the clip.
    const chosen = chooseCycleWindow(cyclic(36), { sourceFrames: 97, frames: 12 });
    expect(chosen?.length).toBeGreaterThan(12);
    expect(chosen?.returned).toBeLessThanOrEqual(MAX_WRAP_OVER_EXCURSION);
  });

  it('a half-cycle window scores `returned` near 1 — it never came back', () => {
    const diff = cyclic(36);
    const half = scoreWindow(diff, windowIndices(0, 18, 12));
    expect(half?.returned).toBeGreaterThan(0.9);
    // ...while a whole cycle turns around in the middle, so its excursion dwarfs its wrap.
    const whole = scoreWindow(diff, windowIndices(0, 36, 12));
    expect(whole?.returned).toBeLessThan(0.2);
  });

  it('returns null on a monotone clip rather than inventing a cycle (vault 4.18)', () => {
    // A jump or a fall never returns to its starting pose, so no window closes. The honest answer is
    // "no cycle here", not the shortest window that happened to score least badly.
    const monotone = (i: number, j: number) => Math.abs(i - j) * 0.01;
    expect(chooseCycleWindow(monotone, { sourceFrames: 97, frames: 6 })).toBeNull();
  });

  it('returns null on a frozen clip rather than closing on noise', () => {
    expect(chooseCycleWindow(() => 0, { sourceFrames: 97, frames: 12 })).toBeNull();
  });

  it('refuses a frame count too small to have a wrap distinct from a step', () => {
    expect(() => chooseCycleWindow(cyclic(16), { sourceFrames: 97, frames: 2 })).toThrow(/at least/);
  });
});
