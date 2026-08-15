/**
 * **Guard G1 — anchor contact geometry.** Criterion 4.27, carried in from Phase 4 as debt.
 *
 * Phase 4's anchor drew the forward boot 58 source pixels above the rear one. Every clip generated
 * from it inherited a floating foot, because Seedance animates the image it is handed. It was found
 * by the user's eye after roughly **$7** of re-shot clips, and it had no gate at all — which is why
 * it came into Phase 5 as the top debt item and why this gate runs **before any anchor is bought**.
 *
 * ## The threshold was chosen before it was measured
 *
 * `MAX_SOLE_SPREAD` is 1.5 % of figure height, picked on the principle that both boots stand on one
 * floor. It is emphatically **not** fitted to what the shipped anchor happens to measure — *"a
 * threshold set to the worst observed value cannot fail"*. The proof that it was not fitted is the
 * last block of this file: run against the ORIGINAL anchor, which is committed, the gate fails at
 * **59 px**. The defect was recorded by hand as 58. The gate found it independently.
 */

import { describe, expect, it } from 'vitest';

import { MAX_SOLE_SPREAD, gateContactGeometry } from '../../tools/gen/anchorGate.mjs';
import type { ContactGeometry } from '../../tools/gen/anchorGate.d.mts';
import { readBytes } from '../../tools/gen/png.mjs';

/**
 * `value` is `null` only when the image keys out to nothing at all. None of these fixtures does, so
 * this asserts that once and narrows the type for every caller — rather than sprinkling `!` and
 * losing the check that the gate found a figure in the first place.
 */
function measure(path: string): ContactGeometry {
  const result = gateContactGeometry(readBytes(path));
  expect(result.value, `${path} keyed out to nothing`).not.toBeNull();
  return result.value as ContactGeometry;
}

/**
 * Synthetic figures: a torso with two legs whose soles sit at chosen rows. 861 px tall, so the
 * 1.5 % limit is 13 px. Committed rather than generated at test time — vault C2 wants a gate that
 * can be watched fail against bytes that do not move.
 */
const FIXTURES = 'tests/fixtures/anchors';

describe('G1 sees a foot drawn off the floor (criterion 4.27)', () => {
  it.each([
    ['level-soles', 'PASS', 0],
    ['floating-foot', 'FAIL', 58],
    ['merged-legs', 'INDETERMINATE', 0],
  ])('%s -> %s', (name, status, spread) => {
    const result = gateContactGeometry(readBytes(`${FIXTURES}/${name}.png`));
    expect(result.status).toBe(status);
    expect(measure(`${FIXTURES}/${name}.png`).spreadPx).toBe(spread);
  });

  /**
   * BOTH sides of the limit, the way `coyote-time.test.ts` pins both ends of its windows. A gate
   * tested only where it fires is a gate whose threshold could be any number at all.
   */
  it('12px passes and 14px fails against a 13px limit', () => {
    const inside = gateContactGeometry(readBytes(`${FIXTURES}/just-inside.png`));
    const outside = gateContactGeometry(readBytes(`${FIXTURES}/just-outside.png`));
    const insideValue = measure(`${FIXTURES}/just-inside.png`);
    const outsideValue = measure(`${FIXTURES}/just-outside.png`);

    expect(insideValue.limitPx).toBe(13);
    expect(insideValue.spreadPx).toBe(12);
    expect(inside.status).toBe('PASS');

    expect(outsideValue.spreadPx).toBe(14);
    expect(outside.status).toBe('FAIL');
  });

  /**
   * Vault 4.18. One component means the metric cannot SEE two feet, which is not the same as seeing
   * two level ones. Converting this to a pass to keep a run green is the failure the gate exists to
   * prevent, so it is asserted as its own verdict rather than lumped in with PASS.
   */
  it('reports INDETERMINATE rather than PASS when the limbs are merged', () => {
    const merged = gateContactGeometry(readBytes(`${FIXTURES}/merged-legs.png`));
    expect(merged.status).toBe('INDETERMINATE');
    expect(measure(`${FIXTURES}/merged-legs.png`).limbs).toBe(1);
    expect(merged.reason).toMatch(/merged/);
  });

  it('is resolution-independent — the limit scales with the figure', () => {
    // The synthetic figures are 861px and the shipped anchor is 2613px; the same 1.5% rule gives
    // 13px and 39px. A gate with a pixel constant would call one of them wrong.
    const small = measure(`${FIXTURES}/level-soles.png`);
    const large = measure('public/assets/characters/brass-courier/anchor.png');
    expect(small.limitPx).toBe(Math.round(small.figureHeight * MAX_SOLE_SPREAD));
    expect(large.limitPx).toBe(Math.round(large.figureHeight * MAX_SOLE_SPREAD));
    expect(large.limitPx).toBeGreaterThan(small.limitPx);
  });
});

/**
 * **The regression lock, against real shipped bytes.**
 *
 * This is the pair that makes G1 more than a self-test: the raw anchor as it came back from
 * `nano-banana-pro`, and the corrected one the game actually loads. Both are committed. The gate
 * must fail the first and pass the second, or it is not measuring the thing that cost the money.
 */
describe('G1 against the REAL Phase 4 defect', () => {
  it('fails the original anchor at the spread that was found by eye', () => {
    const original = gateContactGeometry(
      readBytes('public/assets/characters/brass-courier/anchor-original.png'),
    );
    expect(original.status).toBe('FAIL');
    const value = measure('public/assets/characters/brass-courier/anchor-original.png');
    // Recorded by hand as 58px; measured here as 59. Asserted as a range rather than a literal —
    // pinning 59 exactly would make an anti-aliasing change look like a regression, and the claim
    // that matters is "this is the defect", not "it is 59 and not 58".
    expect(value.spreadPx).toBeGreaterThanOrEqual(55);
    expect(value.spreadPx).toBeLessThanOrEqual(62);
  });

  it('passes the corrected anchor the game actually ships', () => {
    const shipped = gateContactGeometry(
      readBytes('public/assets/characters/brass-courier/anchor.png'),
    );
    expect(shipped.status).toBe('PASS');
    const value = measure('public/assets/characters/brass-courier/anchor.png');
    expect(value.spreadPx).toBe(0);
    expect(value.limbs).toBe(2);
  });
});
