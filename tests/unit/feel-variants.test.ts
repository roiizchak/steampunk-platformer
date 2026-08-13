/**
 * The locomotion-feel variants used to settle foot-slide and speed by eye.
 *
 * The arithmetic these assertions pin is the reason the variants exist at all: slowing the
 * character does NOT change how far its feet slip per cycle, and shortening the declared stride
 * makes the animation play FASTER rather than choppier. Both are counter-intuitive and both were
 * stated wrongly in this session's first plan, so they are pinned here rather than in prose.
 */

import { describe, expect, it } from 'vitest';

import {
  FEEL_VARIANTS,
  tunedFps,
  tunedSimTicks,
  variantFromSearch,
} from '../../src/game/feelVariants';

// The shipped catalog rows these variants re-pace.
const WALK = { frames: 24, simTicks: 46 };
const RUN = { frames: 12, simTicks: 27 };

describe('the variant roster', () => {
  it('starts with the shipped control, which is what makes it an A/B', () => {
    expect(FEEL_VARIANTS[0]!.speedScale).toBe(1);
    expect(FEEL_VARIANTS[0]!.strideScale).toBe(1);
  });

  it('leaves the shipped pacing untouched under the control', () => {
    expect(tunedSimTicks(WALK.simTicks, FEEL_VARIANTS[0]!)).toBe(46);
    expect(tunedSimTicks(RUN.simTicks, FEEL_VARIANTS[0]!)).toBe(27);
    // 24 * 60 / 46 and 12 * 60 / 27, hand-computed independently of the production formula (C2).
    expect(tunedFps(WALK.frames, WALK.simTicks, FEEL_VARIANTS[0]!)).toBeCloseTo(31.3043, 3);
    expect(tunedFps(RUN.frames, RUN.simTicks, FEEL_VARIANTS[0]!)).toBeCloseTo(26.6667, 3);
  });

  it('falls back to the control for an absent or bogus id', () => {
    expect(variantFromSearch('').id).toBe('0');
    expect(variantFromSearch('?feel=nonsense').id).toBe('0');
    expect(variantFromSearch('?feel=2').id).toBe('2');
  });
});

describe('what each knob actually does — the two facts the first plan got wrong', () => {
  it('a SHORTER stride plays the cycle faster, so the animation gets SMOOTHER', () => {
    const v = FEEL_VARIANTS[1]!; // stride x0.85, speed x1
    // round(46 * 0.85) = 39, round(27 * 0.85) = 23.
    expect(tunedSimTicks(WALK.simTicks, v)).toBe(39);
    expect(tunedSimTicks(RUN.simTicks, v)).toBe(23);
    expect(tunedFps(WALK.frames, WALK.simTicks, v)).toBeGreaterThan(
      tunedFps(WALK.frames, WALK.simTicks, FEEL_VARIANTS[0]!),
    );
    expect(tunedFps(RUN.frames, RUN.simTicks, v)).toBeGreaterThan(
      tunedFps(RUN.frames, RUN.simTicks, FEEL_VARIANTS[0]!),
    );
  });

  it('slowing the character alone does NOT change the slide, only the pacing', () => {
    // The slide is `1 - (trueStride / declaredStride)` and neither term contains speed. Expressed
    // in what this module controls: ground travel per cycle is `simTicks * topSpeed`, and scaling
    // speed by p scales simTicks by 1/p, so the product — and therefore the slip — is unchanged.
    const slowOnly = { id: 'x', label: 'x', speedScale: 0.5, strideScale: 1 } as const;
    const ticks = tunedSimTicks(RUN.simTicks, slowOnly);
    expect(ticks).toBe(54); // round(27 / 0.5)
    const groundPerCycleBefore = RUN.simTicks * 12.0;
    const groundPerCycleAfter = ticks * (12.0 * slowOnly.speedScale);
    expect(groundPerCycleAfter).toBeCloseTo(groundPerCycleBefore, 5);
  });

  it('correcting the stride AND slowing down keeps run at or above cinema', () => {
    const v = FEEL_VARIANTS[2]!; // stride x0.85, speed x0.75
    // round(27 * 0.85 / 0.75) = round(30.6) = 31 -> 12 * 60 / 31.
    expect(tunedSimTicks(RUN.simTicks, v)).toBe(31);
    expect(tunedFps(RUN.frames, RUN.simTicks, v)).toBeCloseTo(23.226, 2);
    // The claim being pinned: slowing 25% here costs far less smoothness than the shipped stride
    // implied, because the stride correction pays most of it back.
    const slowOnStaleStride = { id: 'y', label: 'y', speedScale: 0.75, strideScale: 1 } as const;
    expect(tunedFps(RUN.frames, RUN.simTicks, v)).toBeGreaterThan(
      tunedFps(RUN.frames, RUN.simTicks, slowOnStaleStride),
    );
  });

  it('never returns a simTicks of zero, which would divide by zero in the fps rule', () => {
    expect(tunedSimTicks(1, { id: 'z', label: 'z', speedScale: 8, strideScale: 0.01 })).toBe(1);
  });
});
