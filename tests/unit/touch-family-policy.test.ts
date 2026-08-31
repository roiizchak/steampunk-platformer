/**
 * **The owner-approved family policy, pinned.**
 *
 * 🔴 The band bounds were recorded as *"provisional, owner-approved 2026-08-31"* in a docstring, and
 * a docstring stops nothing. Raising them toward the values the mutations produce would keep both
 * the current art and every mutation green while silently relaxing a policy the owner had approved
 * — the same shape as clearing a red `style-lock` hash by editing the hash. Codex round 19,
 * finding 5.
 *
 * ⚠️ **A red here is an APPROVAL CHECKPOINT, never something to clear by editing the pin.** These
 * numbers were approved by the owner on 2026-08-31 as **provisional**, on one condition: the
 * whole-plate redesign is the held-out set, and if it reds them honestly that is a finding to bring
 * to the owner rather than a licence to move them.
 *
 * The bounds themselves are `2.5x` the worst within-family deviation measured on the adopted six
 * (17.5 luminance, 16.0 warmth), and they were fixed at that multiple **before any mutation was run
 * against this statistic** — because the version this replaces had its bounds chosen after seeing
 * that the first pair failed to red, which is post-data threshold selection.
 */

import { describe, expect, it } from 'vitest';

import {
  MAX_BODY_LUMA_SPREAD,
  MAX_CELL_LUMA_DEVIATION,
  MAX_CELL_WARMTH_DEVIATION,
  MAX_FACE_ROUNDNESS,
  MAX_ROUNDNESS_SPREAD,
  MAX_WARMTH_SPREAD,
  MIN_CELL_PX,
  MIN_FACE_WARMTH,
  OUTER_R0,
  OUTER_RINGS,
  OUTER_SECTORS,
} from '../../tools/gen/touchFamily.mjs';

describe('the family policy the owner approved', () => {
  it('is exactly these numbers, and changing one is an approval checkpoint', () => {
    expect({
      MAX_FACE_ROUNDNESS,
      MIN_FACE_WARMTH,
      MAX_ROUNDNESS_SPREAD,
      MAX_BODY_LUMA_SPREAD,
      MAX_WARMTH_SPREAD,
      OUTER_R0,
      OUTER_RINGS,
      OUTER_SECTORS,
      MIN_CELL_PX,
      MAX_CELL_LUMA_DEVIATION,
      MAX_CELL_WARMTH_DEVIATION,
    }).toEqual({
      MAX_FACE_ROUNDNESS: 0.06,
      MIN_FACE_WARMTH: 40,
      MAX_ROUNDNESS_SPREAD: 0.02,
      MAX_BODY_LUMA_SPREAD: 20,
      MAX_WARMTH_SPREAD: 25,
      OUTER_R0: 0.5,
      OUTER_RINGS: 3,
      OUTER_SECTORS: 8,
      MIN_CELL_PX: 100,
      MAX_CELL_LUMA_DEVIATION: 44,
      MAX_CELL_WARMTH_DEVIATION: 40,
    });
  });

  it('states the multiple its cell bounds came from, so a future session can check the derivation', () => {
    // The measured worst within-family deviation on the adopted six, and the approved multiple.
    // Not a bound — a record of how the two bounds above were produced, kept where it can go red if
    // someone changes one without the other.
    const WORST_WITHIN_FAMILY = { luma: 17.5, warmth: 16.0 };
    const APPROVED_MULTIPLE = 2.5;
    expect(MAX_CELL_LUMA_DEVIATION).toBeCloseTo(WORST_WITHIN_FAMILY.luma * APPROVED_MULTIPLE, 0);
    expect(MAX_CELL_WARMTH_DEVIATION).toBeCloseTo(WORST_WITHIN_FAMILY.warmth * APPROVED_MULTIPLE, 0);
  });
});
