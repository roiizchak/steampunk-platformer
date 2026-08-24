/**
 * `coveredLanding` — the selector behind criterion 9.2's landing-shake gate — as a UNIT gate.
 *
 * ## The defect this was written for
 *
 * Phase 9's close round found an off-by-one between the selector's guarantee and the assertion that
 * consumes it. `coveredLanding` promised **more than two samples in `[L+span, L+TAIL]`**, while
 * `phase-09-polish.spec.ts` asserts *"the tail after the shake must have been sampled"* over
 * **`[L+span+1, L+TAIL]`** — one tick narrower, because `applyShake` reads `tick - 1`, so the frame
 * reporting `L+span` is still drawing the last LIVE tick and cannot be part of the settled tail.
 *
 * A landing with exactly three tail samples, one of them sitting on `L+span`, therefore satisfies
 * the selector and **fails the assertion it was selected for**. The selector hands the test a
 * landing the test then rejects — a red that names a sampling shortfall while the game is fine.
 *
 * The 2026-08-22 frame-gap probe measured 3-4 ticks per frame steady-state, where this cannot
 * happen; it becomes reachable as soon as gaps jitter to include 2 and 5+, which is what a loaded
 * box produces — and a loaded box is this suite's documented failure mode. So it is a latent flake
 * of exactly the kind 9.2 has already been repaired for twice.
 *
 * ## Why this gate is a unit test and not another e2e run
 *
 * `coveredLanding` is a pure function of a sample series. Reproducing the defect through Playwright
 * would mean waiting for a frame-gap distribution nobody controls — the reason the original flake
 * took two sessions to characterise. Fed a series directly, the discriminating case is three lines
 * and deterministic. *(The `src/render` decision-function precedent: pull the decision out, and its
 * edge cases become reachable from a unit test.)*
 *
 * ## What it asserts, and why that is the right assertion
 *
 * Not "the bound is 3". **That any landing the selector returns satisfies the predicate the spec
 * applies to it** — the two are restated from one definition, so they cannot drift apart again.
 * Asserting the constant instead would have passed happily before the fix.
 */

import { describe, expect, it } from 'vitest';
import { coveredLanding, TAIL_TICKS, type Sample } from '../e2e/polishSeries';

/** A sample carrying only the two fields `coveredLanding` reads; the rest are inert filler. */
const at = (tick: number, landedTick: number): Sample => ({
  tick, landedTick, hp: 3, x: 0, y: 0, vx: 0, vy: 0, grounded: true, ox: 0, oy: 0, frozenUntil: 0,
});

/** `SHAKE.land.durationTicks` at the time of writing. The gate is about the RELATION, not this number. */
const SPAN = 3;

/** The predicate `phase-09-polish.spec.ts` applies to whatever `coveredLanding` hands it. */
const specTailCount = (series: Sample[], L: number): number =>
  series.filter((s) => s.tick >= L + SPAN + 1 && s.tick <= L + TAIL_TICKS).length;

describe('coveredLanding never returns a landing that fails the assertion it was selected for', () => {
  it('the discriminating case: a tail of exactly three, one of them ON the last live tick', () => {
    // Landing at 100. Tail samples at 103 (= L+span, the last LIVE tick — `applyShake` reads
    // tick-1), 105 and 107. The old `inTail` counted all three and selected it; the spec counts
    // only 105 and 107 and requires more than two.
    const series: Sample[] = [
      at(90, 0), at(101, 100), at(102, 100),
      at(100 + SPAN, 100), at(105, 100), at(107, 100),
      // A second, genuinely usable landing far enough away not to crowd the first.
      at(150, 100), at(151, 150), at(152, 150),
      at(155, 150), at(156, 150), at(157, 150), at(158, 150),
    ];
    const L = coveredLanding(series, SPAN);
    expect(
      specTailCount(series, L),
      `coveredLanding selected landing ${L}, whose settled tail holds only ` +
        `${specTailCount(series, L)} sample(s). The spec asserts more than two over ` +
        `[L+span+1, L+TAIL] — so the selector's guarantee must use the same lower bound. ` +
        `A selector that hands the test a landing the test rejects produces a red that names a ` +
        `sampling shortfall while the game is fine.`,
    ).toBeGreaterThan(2);
  });

  it('and it still selects a landing when a usable one exists — not vacuously strict', () => {
    // The other direction (vault C2): a rule that only ever rejects is satisfied by one that
    // rejects everything, which would turn 9.2's gate into a permanent "no usable touchdown" throw.
    const series: Sample[] = [
      at(90, 0), at(101, 100), at(102, 100),
      at(104, 100), at(105, 100), at(106, 100), at(108, 100),
    ];
    const L = coveredLanding(series, SPAN);
    expect(L).toBe(100);
    expect(specTailCount(series, L)).toBeGreaterThan(2);
  });

  it('throws rather than returning an unusable landing when none qualifies', () => {
    // The throw is the enforcement — `coveredLanding`'s own header says so. What must never happen
    // is a RETURN of a landing that fails downstream; a throw is a legible red.
    const series: Sample[] = [at(90, 0), at(101, 100), at(102, 100), at(103, 100)];
    expect(() => coveredLanding(series, SPAN)).toThrow(/No usable touchdown/);
  });
});
