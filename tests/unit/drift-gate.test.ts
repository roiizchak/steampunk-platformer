/**
 * **G4 — vertical drift / per-frame baseline.** Criterion carried in as debt from `docs/HANDOFF.md`,
 * which said "run G4" before it existed. See `tools/gen/driftGate.mjs`'s header for the defect this
 * replaces (Phase 4's 58px anchor, guard G1's animated cousin).
 *
 * Fixtures are built in code with `blank`/`fill`, the same synthetic-fixture pattern
 * `tools/gen/gates.mjs`'s own `selfTest()` uses (vault 4.21) — a solid chroma-green background and
 * an opaque grey block whose bottom row IS the baseline being asserted, so every expected number in
 * this file is chosen, not measured off a real image.
 */

import { describe, expect, it } from 'vitest';

import { DEFAULT_MAX_DRIFT_PX, gateVerticalDrift } from '../../tools/gen/driftGate.mjs';
import { fill } from '../../tools/gen/gates.mjs';
import { blank } from '../../tools/gen/png.mjs';
import type { RgbaImage } from '../../tools/gen/png.d.mts';

const WIDTH = 40;
const HEIGHT = 100;
const TOP = 20;

/** One synthetic frame: chroma-green field, grey subject block whose lowest row is `baseline`. */
function frame(baseline: number): RgbaImage {
  const image = blank(WIDTH, HEIGHT, [0, 255, 0, 255]);
  fill(image, 0, TOP, WIDTH, baseline - TOP + 1, [90, 90, 90, 255]);
  return image;
}

describe('G4 sees a floor line drift across an animation', () => {
  it('a 1px baseline wobble PASSes', () => {
    const frames = [70, 70, 71, 70, 70, 71].map(frame);
    const result = gateVerticalDrift(frames);
    expect(result.perFrameBaseline).toEqual([70, 70, 71, 70, 70, 71]);
    expect(result.drift).toBe(1);
    expect(result.verdict).toBe('PASS');
  });

  it('a 40px climb across the animation FAILs and names the offending frame', () => {
    const frames = [50, 58, 66, 74, 82, 90].map(frame);
    const result = gateVerticalDrift(frames);
    expect(result.drift).toBe(40);
    expect(result.verdict).toBe('FAIL');
    expect(result.offendingFrame).toBe(5);
    expect(result.reason).toMatch(/frame 5/);
  });

  it('a grounded strip that is perfectly flat PASSes with drift 0, and reports its verticalAnchor', () => {
    const frames = [60, 60, 60, 60, 60, 60].map(frame);
    const result = gateVerticalDrift(frames);
    expect(result.drift).toBe(0);
    expect(result.verdict).toBe('PASS');
    // The number, not merely that one came back — the deepest (only) baseline in this fixture.
    expect(result.verticalAnchor).toBe(60);
  });

  /**
   * A 60px lift compressed at frame 3 (jump's tucked apex) — legitimate for an airborne action, and
   * exactly the shape `MAX_DRIFT_PX` alone must not tolerate.
   */
  it('an airborne action with a large legitimate lift PASSes via the explicit allowance', () => {
    const frames = [80, 50, 20, 50, 80, 80].map(frame);
    const result = gateVerticalDrift(frames, { allowancePx: 60 });
    expect(result.drift).toBe(60);
    expect(result.verdict).toBe('PASS');
  });

  it('the SAME airborne strip FAILs without the allowance — proving the allowance is what passed it', () => {
    const frames = [80, 50, 20, 50, 80, 80].map(frame);
    const result = gateVerticalDrift(frames);
    expect(result.drift).toBe(60);
    expect(result.verdict).toBe('FAIL');
    expect(result.offendingFrame).toBe(2);
  });

  /**
   * First and last frame agree; only the interior spikes. A gate that measured only the endpoints
   * (the realistic bug — see the mutation check) would score this animation drift 0 and PASS it,
   * while the character visibly hops up and back down on screen. This is also what makes the
   * mutation described in the drift-gate work item catchable at all.
   */
  it('a mid-animation spike FAILs even though the first and last frame match', () => {
    const frames = [60, 60, 95, 60, 60, 60].map(frame);
    const result = gateVerticalDrift(frames);
    expect(result.drift).toBe(35);
    expect(result.verdict).toBe('FAIL');
    expect(result.offendingFrame).toBe(2);
  });

  it('a frame that keys out to nothing is excluded, not scored as height 0', () => {
    const empty = blank(WIDTH, HEIGHT, [0, 255, 0, 255]); // no subject at all
    const frames = [frame(60), empty, frame(61)];
    const result = gateVerticalDrift(frames);
    expect(result.perFrameBaseline).toEqual([60, null, 61]);
    expect(result.drift).toBe(1);
    expect(result.verdict).toBe('PASS');
  });

  it('reports INDETERMINATE, never a guess, when every frame keys out to nothing', () => {
    const empty = blank(WIDTH, HEIGHT, [0, 255, 0, 255]);
    const result = gateVerticalDrift([empty, empty]);
    expect(result.verdict).toBe('INDETERMINATE');
    expect(result.drift).toBeNull();
    expect(result.verticalAnchor).toBeNull();
  });

  it('the default budget is a small constant, not zero', () => {
    expect(DEFAULT_MAX_DRIFT_PX).toBeGreaterThan(0);
    expect(DEFAULT_MAX_DRIFT_PX).toBeLessThan(40);
  });
});
