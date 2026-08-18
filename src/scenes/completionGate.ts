/**
 * ONE decision: does the level-complete flow run this frame? Phase 8, Codex implementation review #3.
 *
 * Engine-free and pure, in its own file rather than inline in `GameScene.update()`, for the reason
 * `cameraRig.ts` and `playerView.ts` are: a rule written inside a scene method has no edge case a
 * unit test can reach *(vault 2.12)*. The edge case here is the whole point of the file, and
 * `completion-gate.test.ts` drives all eight input combinations in milliseconds.
 *
 * ## Why the EDGE is the primary trigger
 *
 * `levelCompleted` is emitted on exactly one tick *(vault 2.5)*, and `advanceSplit` ORs it across the
 * batch so a frame that drained five ticks still sees it. `world.completed` stays true forever, so
 * triggering on the flag alone would rebuild the overlay sixty times a second.
 *
 * ⚠️ The edge is **not** what stops a jump pressed on the completing tick from firing into the next
 * level, though `GameScene`'s comment claimed so until the Phase 8 code-reviewer's adversarial brief
 * read the order: `sampleHeldKeys` runs before `advanceSplit`, so on the completing frame it ran with
 * the input flag still true and cleared nothing. What actually prevents it is step 0 — `tick()`
 * early-returns while `world.completed`, so nothing consumes input again, and `create()` builds a
 * fresh `input$` for the next level. The claim was true; the named mechanism was wrong, which is
 * worse than no comment *(vault C9)*.
 *
 * ## 🔴 Why the flag is a SECOND trigger and not a replacement
 *
 * Codex's implementation review asked what happens if that single edge is never seen. The answer was
 * the worst state this feature can produce: `world.completed` is true, so step 0 freezes the sim
 * permanently — no movement, no death, no respawn — while nothing wrote the save, drew the overlay or
 * bound ENTER. The game is not slow or wrong, it is **over**, with no way out but a page reload, and
 * the player has not been credited with the level they just finished.
 *
 * A terminal world with no flow behind it is unrecoverable, so it is checked for directly rather than
 * assumed impossible. `handled` is what keeps that check from becoming the every-frame rebuild the
 * edge exists to avoid: the flow runs on the first frame that sees a completed world by either route,
 * and never again until `init()` clears the flag for the next level.
 *
 * It is deliberately a **one-shot** retry, not a loop. The caller sets `handled` before it runs the
 * flow, so a handler that throws half-way is not re-entered every frame at 240 Hz — a thrown error is
 * visible in the console, and an exception loop is not an improvement over the state it replaces.
 */

/**
 * @param levelCompletedEdge `AdvanceEvents.levelCompleted` — the OR of this frame's batch.
 * @param completed `world.completed` — true from the completing tick onward, forever.
 * @param handled has the flow already run for this level?
 */
export function shouldRunCompletion(
  levelCompletedEdge: boolean,
  completed: boolean,
  handled: boolean,
): boolean {
  if (handled) return false;
  return levelCompletedEdge || completed;
}
