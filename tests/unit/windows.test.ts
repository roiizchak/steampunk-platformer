/**
 * The ONE definition of a forgiveness window.
 *
 * Phase 2 shipped this rule three times over — `tick.ts`'s header, `types.ts`'s knob comments and
 * the inline `counter < knob` tests at steps 7 and 13 — and by Phase 5 two of them **disagreed by
 * one tick** about when the coyote window opens. The Phase 5 Codex plan review (C3) found it before
 * combat could add a fourth copy.
 *
 * Vault **5.3** (blocker): *two definitions of one concept is where the bug lives — import the
 * predicate, never restate it.* So combat's hit window, i-frames, the hurt timer and
 * `resolveState`'s early return all import from here rather than open-coding `<`.
 *
 * The arithmetic is trivial on purpose. The value is not the arithmetic — it is that there is
 * exactly one place to change it, and one place these tests point at.
 */

import { describe, expect, it } from 'vitest';

import { advanceWindow, windowOpen } from '../../src/sim/windows';

describe('windowOpen', () => {
  /**
   * A window of `N` accepts on counter `0 … N-1` — `N` accepting ticks, the opening tick inclusive.
   *
   * BOTH ends are asserted, not just the accepting side. `coyote-time.test.ts` already records why:
   * "accepted at N-1 alone passes an implementation that accepts forever; rejected at N alone
   * passes one that never accepts." The pair is the test; either half alone is decoration.
   */
  it('accepts every tick of its window and rejects the first tick past it', () => {
    const knob = 7;
    const accepted: number[] = [];
    const rejected: number[] = [];

    for (let counter = 0; counter <= knob * 2; counter += 1) {
      (windowOpen(counter, knob) ? accepted : rejected).push(counter);
    }

    expect(accepted).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(rejected[0]).toBe(knob);
    expect(rejected.length).toBeGreaterThan(0);
  });

  /** A window of 1 is the smallest real window: exactly the opening tick. */
  it('a window of 1 accepts only the opening tick', () => {
    expect(windowOpen(0, 1)).toBe(true);
    expect(windowOpen(1, 1)).toBe(false);
  });

  /**
   * A knob of 0 must accept NOTHING.
   *
   * This is the branch a `<=` typo makes unreachable, and it is the one a sweep never visits
   * because nobody tunes a window to zero — which is exactly why it is pinned here *(vault 5.5: a
   * measurement of exactly 0 or 100 % means asking whether the branch ran)*.
   */
  it('a window of 0 is closed on every tick', () => {
    expect(windowOpen(0, 0)).toBe(false);
    expect(windowOpen(1, 0)).toBe(false);
  });

  it('refuses a non-integer counter or knob rather than comparing floats', () => {
    expect(() => windowOpen(1.5, 7)).toThrow(/integer/i);
    expect(() => windowOpen(1, 7.5)).toThrow(/integer/i);
  });
});

describe('advanceWindow', () => {
  /**
   * A counter climbs to its knob and STOPS there.
   *
   * It must not run away: `ticksSinceGrounded` is compared against the knob every tick forever
   * once the window has closed, and an unbounded counter is an integer that grows for the life of
   * the session for no reason. Saturating at the knob keeps "closed" a single stable value.
   */
  it('increments while open and saturates at the knob', () => {
    expect(advanceWindow(0, 3)).toBe(1);
    expect(advanceWindow(1, 3)).toBe(2);
    expect(advanceWindow(2, 3)).toBe(3);
    expect(advanceWindow(3, 3)).toBe(3);
    expect(advanceWindow(99, 3)).toBe(3);
  });

  /** Saturated means closed — the two functions must agree at the boundary they share. */
  it('a saturated counter reads as closed', () => {
    const knob = 4;
    let counter = 0;
    for (let i = 0; i < knob * 3; i += 1) {
      counter = advanceWindow(counter, knob);
    }
    expect(counter).toBe(knob);
    expect(windowOpen(counter, knob)).toBe(false);
  });
});
