/**
 * Render interpolation — the arithmetic half. The integration half is proved in the e2e spec,
 * because a helper test cannot show that `GameScene` actually calls it (Codex plan review,
 * finding 2: "every proposed automated verification can pass with interpolation absent").
 *
 * ## Why this exists
 *
 * The sim advances in whole 60 Hz ticks. On a 240 Hz display `drainTicks` returns `ticks: 0` on
 * three refreshes out of four, so without interpolation the drawn character is held perfectly still
 * for ~16.7 ms and then jumps `runMax` (12 world px). The user reported that as a ghost / double
 * image, and a DEV probe (`?probe=1`) settled it on the affected monitor: two copies of one FROZEN
 * pose crossing the screen at identical average speed, one stepped and one smooth — the stepped
 * lane reproduced the defect and the smooth lane did not.
 *
 * That probe matters because the diagnosis was NOT established by argument. Six earlier hypotheses
 * were falsified, and Codex refused the seventh on the correct grounds that a native 60 Hz panel
 * also holds each position for 16.7 ms. The probe is what turned it from a story that fits into a
 * result.
 */

import { describe, expect, it } from 'vitest';

import { MS_PER_TICK } from '../../src/game/constants';
import { MAX_LEAP_PX, renderAlpha, interpolatedPosition } from '../../src/render/interpolate';

describe('renderAlpha — where between two ticks this frame is being drawn', () => {
  it('is 0 exactly on a tick boundary and 0.5 halfway between', () => {
    expect(renderAlpha(0)).toBe(0);
    expect(renderAlpha(MS_PER_TICK / 2)).toBeCloseTo(0.5, 9);
  });

  it('clamps to [0, 1) rather than extrapolating past the current tick', () => {
    // A remainder at or above one tick means `drainTicks` should have drained it. Extrapolating
    // would put the drawing somewhere the sim has never resolved a collision for (vault 2.11).
    expect(renderAlpha(MS_PER_TICK)).toBe(1);
    expect(renderAlpha(MS_PER_TICK * 4)).toBe(1);
    expect(renderAlpha(-5)).toBe(0);
  });

  it('treats a non-finite remainder as 0, never as NaN', () => {
    // Phaser hands out NaN/huge deltas on the first frame after a tab restore. NaN here would put
    // the sprite at NaN and it would vanish — the same class of failure `drainTicks` already
    // guards at frameClock.ts:44.
    expect(renderAlpha(Number.NaN)).toBe(0);
    expect(renderAlpha(Number.POSITIVE_INFINITY)).toBe(1);
  });
});

describe('interpolatedPosition — the drawn point between the last two ticks', () => {
  const prev = { x: 100, y: 50 };
  const cur = { x: 112, y: 50 };

  it('returns exactly prev at alpha 0 and exactly cur at alpha 1', () => {
    // Exactness matters: a lerp that is off by a rounding error at the endpoints makes the sprite
    // jitter by a fraction of a pixel every tick, which is a smaller version of the defect this
    // whole change exists to remove.
    expect(interpolatedPosition(prev, cur, 0)).toEqual(prev);
    expect(interpolatedPosition(prev, cur, 1)).toEqual(cur);
  });

  it('blends linearly in between — hand-computed, not via the production formula (C2)', () => {
    // 100 + (112 - 100) * 0.25 = 103. At 240 Hz these quarter steps are the whole point: the
    // character advances 3 px per refresh instead of 12 px every fourth.
    expect(interpolatedPosition(prev, cur, 0.25).x).toBeCloseTo(103, 9);
    expect(interpolatedPosition(prev, cur, 0.75).x).toBeCloseTo(109, 9);
  });

  it('falls back to cur when there is no previous sample', () => {
    // The first frame after `create()`, and any frame where a snapshot was never taken. Drawing
    // from a null prev must not be a special case at the call site.
    expect(interpolatedPosition(null, cur, 0.5)).toEqual(cur);
  });

  it('SNAPS to cur across a leap no tick could have produced', () => {
    // Respawn, level restart and the dev fleet spawn all move a subject instantly. Interpolating
    // across that would slide the sprite through the level over one tick. `runMax` is 12 px/tick,
    // so anything past MAX_LEAP_PX is not motion, it is a teleport.
    const far = { x: cur.x + MAX_LEAP_PX + 1, y: cur.y };
    expect(interpolatedPosition(prev, far, 0.5)).toEqual(far);
    // Vertical too — a respawn moves y, and a fall does not exceed the cap in one tick.
    expect(interpolatedPosition(prev, { x: prev.x, y: prev.y + MAX_LEAP_PX + 1 }, 0.5)).toEqual({
      x: prev.x,
      y: prev.y + MAX_LEAP_PX + 1,
    });
  });

  it('does NOT snap for ordinary travel, or the fix would never apply', () => {
    // The non-vacuity guard on the test above. `runMax` 12 px must interpolate; a cap that ate
    // normal running would leave the defect in place while every assertion here stayed green.
    expect(interpolatedPosition({ x: 0, y: 0 }, { x: 12, y: 0 }, 0.5).x).toBeCloseTo(6, 9);
    expect(MAX_LEAP_PX).toBeGreaterThan(12);
  });
});
