/**
 * The level-complete trigger, all eight combinations. Phase 8, Codex implementation review #3.
 *
 * `shouldRunCompletion` is three lines, and every one of them is load-bearing in a different
 * direction — so this file drives the whole truth table rather than the two rows the happy path
 * uses. The rule under test, stated independently of the implementation:
 *
 *   the flow runs on the first frame that sees a completed level, by EITHER route, and never again.
 *
 * Each of the three named failures below is a state the game cannot recover from without a page
 * reload, which is why a predicate this small gets a file of its own.
 */

import { describe, expect, it } from 'vitest';

import { shouldRunCompletion } from '../../src/scenes/completionGate';

describe('shouldRunCompletion — the truth table', () => {
  it.each([
    // edge,  completed, handled, run,   why
    [false, false, false, false, 'nothing has happened'],
    [true, true, false, true, 'the ordinary case: the edge arrives on the completing frame'],
    [false, true, false, true, '🔴 the LOST EDGE: a terminal world with no flow behind it'],
    [true, false, false, true, 'an edge without the flag — trust the edge, it is the one tick'],
    [false, false, true, false, 'handled, and nothing is happening'],
    [true, true, true, false, 'handled — the edge must not run the flow twice'],
    [false, true, true, false, '🔴 handled — the flag stays true forever and must not rebuild'],
    [true, false, true, false, 'handled wins over every trigger'],
  ])('edge=%s completed=%s handled=%s -> %s (%s)', (edge, completed, handled, run) => {
    expect(shouldRunCompletion(edge, completed, handled)).toBe(run);
  });
});

describe('the three failures this predicate exists to prevent', () => {
  /**
   * 🔴 The finding. `world.completed` freezes the sim at step 0 — no movement, no death, no
   * respawn — so a completed world whose flow never ran is not a glitch, it is the end of the game:
   * no save written, no overlay, no ENTER binding, and a page reload is the only exit.
   *
   * The mutation this row catches: `return levelCompletedEdge` alone, which is what the code did
   * before the review.
   */
  it('runs the flow on a terminal world even though the edge was never seen', () => {
    expect(shouldRunCompletion(false, true, false)).toBe(true);
  });

  /**
   * The opposite failure, and the reason the edge was the only trigger to begin with:
   * `world.completed` never goes back to false, so a predicate without `handled` rebuilds the
   * overlay, rewrites the save and rebinds ENTER on every frame for as long as the panel is up.
   *
   * The mutation this row catches: deleting the `handled` guard.
   */
  it('runs the flow at most once, however long the flag stays true', () => {
    expect(shouldRunCompletion(false, true, false)).toBe(true);
    expect(shouldRunCompletion(false, true, true)).toBe(false);
    expect(shouldRunCompletion(true, true, true)).toBe(false);
  });

  /**
   * Not vacuous by construction: a predicate that returned `false` for everything would satisfy
   * "at most once", and a predicate that returned `true` for everything would satisfy "the lost
   * edge is caught". Both directions are asserted, so neither constant passes.
   */
  it('is neither constant', () => {
    const rows = [
      shouldRunCompletion(true, true, false),
      shouldRunCompletion(false, true, false),
      shouldRunCompletion(false, false, false),
      shouldRunCompletion(true, true, true),
    ];
    expect(rows.some((r) => r)).toBe(true);
    expect(rows.some((r) => !r)).toBe(true);
  });
});
