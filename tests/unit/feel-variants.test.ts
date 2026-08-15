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
// The AUTHORED-cadence rows now shipped in index.json (session 9): walk 24 frames / 40 ticks / 36
// fps, run 12 / 23 / 31.30. They were 46 and 27 when cadence was still stride-derived.
const WALK = { frames: 24, simTicks: 40 };
const RUN = { frames: 12, simTicks: 23 };

describe('the variant roster', () => {
  it('starts with the shipped control, which is what makes it an A/B', () => {
    expect(FEEL_VARIANTS[0]!.speedScale).toBe(1);
    expect(FEEL_VARIANTS[0]!.strideScale).toBe(1);
  });

  it('leaves the shipped pacing untouched under the control', () => {
    expect(tunedSimTicks(WALK.simTicks, FEEL_VARIANTS[0]!)).toBe(40);
    expect(tunedSimTicks(RUN.simTicks, FEEL_VARIANTS[0]!)).toBe(23);
    // 24 * 60 / 40 and 12 * 60 / 23, hand-computed independently of the production formula (C2).
    expect(tunedFps(WALK.frames, WALK.simTicks, FEEL_VARIANTS[0]!)).toBeCloseTo(36, 3);
    expect(tunedFps(RUN.frames, RUN.simTicks, FEEL_VARIANTS[0]!)).toBeCloseTo(31.3043, 3);
  });

  it('falls back to the control for an absent or bogus id', () => {
    expect(variantFromSearch('').id).toBe('0');
    expect(variantFromSearch('?feel=nonsense').id).toBe('0');
    expect(variantFromSearch('?feel=2').id).toBe('2');
  });
});

describe('speed is the only knob, and cadence follows it so the feet stay planted', () => {
  it('scales fps by exactly the speed factor, leaving body travel per frame unchanged', () => {
    // THE invariant. Foot travel per frame is a property of the ART and cannot change; for zero
    // slide the body must advance the same amount, and it does at every speed because fps scales
    // with speed. Asserted as the product `ticksPerFrame * topSpeed`, which is that distance.
    const TOP = 12.0;
    const bodyPerFrame = (v: (typeof FEEL_VARIANTS)[number]) =>
      (tunedSimTicks(RUN.simTicks, v) / RUN.frames) * (TOP * v.speedScale);
    const control = bodyPerFrame(FEEL_VARIANTS[0]!);
    // Within rounding: simTicks is an integer tick count, so it cannot scale perfectly.
    expect(bodyPerFrame(FEEL_VARIANTS[1]!)).toBeCloseTo(control, 0);
    expect(bodyPerFrame(FEEL_VARIANTS[2]!)).toBeCloseTo(control, 0);
  });

  it('a slower variant really is slower AND plays its cycle more slowly', () => {
    const v = FEEL_VARIANTS[2]!;
    expect(v.speedScale).toBeLessThan(1);
    expect(tunedSimTicks(RUN.simTicks, v)).toBeGreaterThan(RUN.simTicks);
    expect(tunedFps(RUN.frames, RUN.simTicks, v)).toBeLessThan(
      tunedFps(RUN.frames, RUN.simTicks, FEEL_VARIANTS[0]!),
    );
  });

  it('never scales the cadence independently of speed — that would re-create the slide', () => {
    // Guards the decision, not just the numbers: if someone reintroduces a strideScale != 1 here,
    // the feet start slipping again and this is the test that says so.
    for (const v of FEEL_VARIANTS) expect(v.strideScale).toBe(1);
  });

  it('never returns a simTicks of zero, which would divide by zero in the fps rule', () => {
    expect(tunedSimTicks(1, { id: 'z', label: 'z', speedScale: 8, strideScale: 0.01 })).toBe(1);
  });
});
