/**
 * Forgiveness windows — ONE definition, imported everywhere.
 *
 * A window is an **incrementing counter tested `counter < knob`**, never a decrementing timer.
 * Phase 2 settled that (Codex plan review F5): a timer armed at step 11 and decremented at step 2
 * burned a tick inside its own arming tick, so a knob of `N` bought `N - 1` usable ticks — and
 * because the buffer was armed after the decrement and coyote before it, **the two windows
 * disagreed about their own endpoints while reading the same knob.**
 *
 * ## Why this is a module and not two inline comparisons
 *
 * By Phase 5 the rule existed in three places — `tick.ts`'s header, `types.ts`'s knob comments, and
 * the inline `<` at steps 7 and 13 — and **two of them had drifted apart by exactly one tick**
 * about when the coyote window opens. Nothing caught it, because a comment cannot be executed and
 * the two inline comparisons agreed with each other. The Phase 5 Codex plan review (C3) found it in
 * the file this phase's combat timing is expressed against, one step before combat would have added
 * a fourth copy.
 *
 * Vault **5.3**, blocker: *two definitions of one concept is where the bug lives — import the
 * predicate, never restate it. A restated predicate drifts, and it drifts in the direction that
 * makes your numbers look good.*
 *
 * So: combat's hit window, i-frames, the hurt and death timers, and `resolveState`'s early return
 * all import from here. The arithmetic is deliberately trivial. The point is not the arithmetic —
 * it is that there is exactly one place to change it.
 *
 * ## What this module does NOT own
 *
 * **Arming and closing.** *When* a window opens is a step-order question and belongs to
 * `tick.ts`'s numbered order, which is the authority on it *(vault 2.2)*. This module only answers
 * "given a counter and a knob, is it open, and what is the counter next tick".
 *
 * The two Phase 2 windows are **asymmetric on purpose** and this module cannot express that,
 * because the asymmetry is entirely in the arming:
 *
 *   - **Coyote** opens on the first tick *after* the ledge — step 7 had already run when step 10
 *     armed it, so the ledge tick is not one of the `N`.
 *   - **Buffer** opens on the tick of the press *itself*, and fires the tick *after* touchdown,
 *     because step 7 tests `grounded` as step 9 of the previous tick set it.
 *
 * Read `tick.ts`'s header before changing anything that arms a window.
 */

/** Every duration in this project is an integer count of 60 Hz ticks. Floats are a category error. */
function assertTicks(label: string, value: number): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${label} must be an integer tick count, got ${value}`);
  }
}

/**
 * Is a window open, given how many ticks it has been counting and the knob it was armed from?
 *
 * `N` accepts on counters `0 … N-1` — **`N` accepting ticks, the opening tick inclusive.** A knob of
 * `0` accepts nothing, which is the branch a `<=` typo makes unreachable and the reason
 * `windows.test.ts` pins it explicitly *(vault 5.5)*.
 */
export function windowOpen(counter: number, knob: number): boolean {
  assertTicks('windowOpen: counter', counter);
  assertTicks('windowOpen: knob', knob);
  return counter < knob;
}

/**
 * The counter one tick later, saturating at the knob.
 *
 * Saturating rather than running away matters: a closed window is compared against its knob every
 * tick for the rest of the session, so "closed" needs to be one stable value rather than an integer
 * that climbs forever. `tick.ts` step 13 additionally decides *whether* to advance at all — a
 * window does not spend a tick on which the fact it is forgiving was not yet visible — and that
 * decision stays there, with the step order that owns it.
 */
export function advanceWindow(counter: number, knob: number): number {
  assertTicks('advanceWindow: counter', counter);
  assertTicks('advanceWindow: knob', knob);
  return counter < knob ? counter + 1 : knob;
}
