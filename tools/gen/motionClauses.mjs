/**
 * The containment clauses — the sentences appended to a motion brief to bound WHERE things go.
 *
 * Split out of `motionCombat.mjs` when `DEBRIS_MARGIN` took that file past the 400-line rule. The
 * seam is real rather than arithmetic: these four are the project's accumulated answer to *"the
 * model put something outside the frame"*, each earned by a measured failure and each carrying the
 * evidence for its own existence. The briefs that apply them are subjects; these are rules.
 *
 * **A leaf.** It imports nothing, which matters here: `motion.mjs` and `motionCombat.mjs` already
 * import each other, and `motion.mjs` spreads `COMBAT_MOTIONS` at its own module top level — so
 * touching `motionCombat.mjs` first makes that spread run while `COMBAT_MOTIONS` is in its temporal
 * dead zone, silently producing an incomplete `VIDEO_MOTIONS`. Adding a clause file with no imports
 * cannot widen that cycle.
 */

/**
 * Appended to every courier IDENTITY block. Malformed, missing and fused hands recur across the
 * combat batch, worst at peak extension — there is no gate for this, so the prompt is the only
 * lever, weak as it is.
 */
export const HAND_CLAUSE =
  ' Both hands are always fully visible and correctly formed, with five fingers, and are never ' +
  'merged into the tool or into the body.';

/**
 * Appended to every combat motion's `motion` clause. `HOLD_CAMERA` in `motion.mjs`
 * already says "is never cropped by any edge" and it did not stop clipping at full extension — so
 * this is phrased as a positive requirement about where the subject sits, not another prohibition.
 *
 * **Session 5 widened this from one-shots to the CYCLIC entries too.** It had never reached them:
 * it was appended by hand per record and every cyclic `motion` predated it, so `rust-scavenger`'s
 * `walk` and `chase` were the only combat clips shot with no margin clause at all — and `chase`
 * came back with one frame at 8 px of left margin. A longer stride throws a limb further than a
 * sway does, so widening the stride (see `walk` below) without widening this would have traded one
 * defect for the other.
 */
export const FRAME_MARGIN =
  ' At its point of furthest extension, the subject and anything it holds stays entirely inside ' +
  'the middle 70% of the frame width, with clear green margin visible at both the left and right ' +
  'edges of the frame.';

/**
 * ⚠️ **NOT APPLIED. Withdrawn as unattributable, NOT as disproven — and the difference matters.**
 *
 * The diagnosis was sound: three session-6 re-shoots failed G6 with the signature `left 188 /
 * right 0`, `left 160 / right 0`, `left 154 / right 0` — a subject parked off-centre rather than one
 * too large, since each clears comfortably if centred. `HOLD_CAMERA` (`motion.mjs`) constrains only
 * that the subject *stays* in one place and never says WHERE, so a model can hold it hard against an
 * edge and satisfy every word of it.
 *
 * **Four clips were shot to test it, $4.76, and the result is a coin flip:**
 *
 * ```
 *                        without           with          verdict
 * brass-courier/attack   L188 R0           L188 R0       unchanged
 * brass-courier/death    L160 R0           L172 R0       unchanged
 * brass-sentry/death     L226 R200 T0      L0 R0 T0      DESTROYED
 * rust-scavenger/death   R0                PASSES G6     fixed
 * ```
 *
 * One clear win, one clear loss, two no-change — from the same clause, on the same round, with the
 * two extremes landing on the two clips that carried the *identical* pair of clauses.
 *
 * ## Why this is recorded as unattributable rather than as a verdict
 *
 * **This endpoint has no `seed` input** — `seed` is output-only, confirmed against the live schema,
 * so it is not seed-deterministic and every generation carries irreducible run-to-run variance. Four
 * samples split 1/1/2 cannot separate a clause's effect from that variance. An earlier draft of this
 * comment called the clause "TESTED AND REJECTED" on the first three results; the fourth arrived and
 * contradicted it. **That draft was wrong, and it was wrong in the direction this project keeps
 * having to correct: a confident conclusion drawn before the last measurement landed.**
 *
 * It is left unapplied because a 1-in-4 chance of collapsing a near-passing clip is not worth an
 * unproven upside — a risk judgement, which is a different thing from evidence that it does not work.
 *
 * ## What IS attributable
 *
 * `DEBRIS_MARGIN` moved `brass-sentry/death` from `left 2 / right 0` to `left 226 / right 200` and
 * left it failing only on the steam plume. That is a large, single-variable effect in the intended
 * direction, and it is the one prompt result from this round worth relying on.
 *
 * And the courier's framing is still not solved by any prompt: three clauses were tried on it.
 * What demonstrably works there is **padding the anchor** — the padded `brass-courier/attack` passed
 * G6 cleanly, and its only defect was scale, which is a number in a config file rather than art.
 */
const HOLD_CENTRED_REJECTED =
  ' The subject is CENTRED in the frame: at rest its body sits on the vertical centre line of the ' +
  'frame, with the same amount of clear green margin to its left as to its right. It is never ' +
  'pushed toward one side of the frame.';
void HOLD_CENTRED_REJECTED;

/**
 * Appended to the two `brass-sentry/fire*` records, and to nothing else.
 *
 * ## 🔴 Reversed 2026-08-23, on the owner's ruling — inventory 3.10
 *
 * This clause used to read *"The muzzle flash and the smoke are SMALL and CONTAINED: the flash
 * reaches no further from the muzzle than the length of the barrel itself … Neither the flash nor
 * the smoke ever reaches any edge of the frame."* It was written under an earlier ruling —
 * **"constrain the effect rather than teach the gate"** — after G6 failed `fire` on a frame where
 * the turret was complete and only the discharge crossed the edge.
 *
 * **It worked, and it cost the feature.** Item 3.10: the shipped `fire` clip has a *"nearly absent"*
 * discharge, because *"the margin constraint was met by the model largely not firing."* The model
 * obeyed the cheapest way available to it.
 *
 * ⚠️ **And the ruling's premise expired without the clause catching up.** A later session added an
 * `ACCEPTED_EDGE_BLEED` entry for `brass-sentry/fire` in `edgeExceptions.mjs`, permitting the
 * discharge to cross the right edge — *confirmed by eye at full resolution*. That **is** teaching the
 * gate. So the tree carried both decisions at once: this clause forbidding the flash from reaching
 * any edge, and the gate accepting it doing exactly that. The suppression was buying nothing.
 *
 * The owner reopened the ruling on 2026-08-23 and chose to relax the clause.
 *
 * ## What replaced it, and why it is not simply the negation removed
 *
 * STYLE.md §6: **a NAMED element beats a negation**, and this model responds to *geometry* rather
 * than to permission. Deleting the containment would leave the flash unspecified, which is how it
 * came back small the first time. So the flash is now given a size — measured against the barrel,
 * the one part whose length the identity clause already commits to, exactly as the old clause was.
 *
 * **The machine itself is still bound.** `FRAME_MARGIN` is unchanged and still holds *"the subject
 * and anything it holds"* inside the middle 70 % — a turret does not *hold* its own muzzle flash,
 * which is precisely why the flash needed its own ruler in both directions.
 *
 * ⚠️ `-r5` already refuted the other lever: a 4024² anchor at `--fill 0.35`, single-variable against
 * `-r4`'s 3130², **did not move the discharge**. This clause was the only variable left, so `-r6`
 * changed it and nothing else.
 *
 * ## ✅ The result, measured — and it satisfies BOTH rulings
 *
 * | | turret alone | widest frame | discharge visible in |
 * |---|---|---|---|
 * | `-r4` (old clause) | 206 px | 305 px | **1 of 6 frames** |
 * | `-r6` (this clause) | 193 px | 294 px | **5 of 6 frames** |
 *
 * The flash is now present across nearly the whole clip instead of a single frame — which matters
 * because `fire` plays over an 18-tick window, so a one-frame flash is a flicker and a five-frame one
 * is a shot.
 *
 * 🔴 **And it passes G6 outright.** The `ACCEPTED_EDGE_BLEED` entry for `brass-sentry/fire` has been
 * **deleted**, because nothing bleeds any more: asking for a bigger flash *by geometry* produced one
 * that still fits the frame, where asking for a small one produced a machine that barely fired.
 *
 * So the contradiction is resolved in the direction the ORIGINAL ruling wanted. The effect is
 * constrained — no gate threshold moved, no exception carried — and it is visible. The earlier
 * clause achieved the first by sacrificing the second; this one gets both, and the gate is back to
 * being untaught.
 */
export const DISCHARGE_MARGIN =
  ' The shot is POWERFUL and clearly visible: a bright hot muzzle flash bursts forward from the ' +
  'mouth of the barrel, reaching forward about TWICE the length of the barrel itself, with a ' +
  'billow of smoke behind it. The flash and smoke may run off the right edge of the frame. The ' +
  'MACHINE ITSELF never touches any edge: clear green margin stays visible above, below and to the ' +
  'left of the turret at all times.';

/**
 * Appended to the two death records whose wreckage genuinely leaves the frame, and to nothing else.
 *
 * **These are real subject crops, not the discharge blind spot.** Measured on the session-6 round:
 * `brass-sentry/death` fails G6 at frame 1 of 8 with margins `left 2, right 0, top 16`, and
 * `rust-scavenger/death` at frame 7 of 10 with `right 0` — and the scavenger's contact strip shows
 * it has become an **explosion** rather than a collapse, with parts flying off the top edge. No gate
 * change should pass those; the art has to stop throwing pieces that far.
 *
 * **`FRAME_MARGIN` does not cover it.** That clause binds *"the subject and anything it holds"* at
 * its point of furthest extension — and a machine coming apart is not *holding* the plate that just
 * flew off it. Debris needed its own ruler, and it is measured against **the body's own height**:
 * the one dimension the model has already committed to, exactly as `DISCHARGE_MARGIN` is measured
 * against the barrel.
 *
 * ## The last sentence is the load-bearing one
 *
 * `DISCHARGE_MARGIN` was satisfied by the model very largely **not firing** — `fire-r4` came back
 * with a thin wisp of smoke and no flash at all. That is the `SPAN_CLIP` failure: a constraint
 * describing a SHAPE, met by not performing the action, and this project has now paid for it twice.
 * So this clause states explicitly that it governs the SCATTER and not the destruction, because a
 * death animation that satisfies its containment by declining to come apart is worth nothing.
 */
export const DEBRIS_MARGIN =
  ' Every piece that breaks off STAYS CLOSE to the wreck: no fragment travels further from the ' +
  'body than the body\'s own height, nothing is flung clear, and no piece ever reaches any edge of ' +
  'the frame. Clear green margin stays visible on all four edges throughout. This governs only how ' +
  'far the pieces SCATTER — the machine still comes apart completely and violently, and it must ' +
  'still end as a broken heap rather than an intact shape.';

/**
 * One-shot pose scaffolding, used instead of `SPAN_CLIP` wherever the motion does NOT return.
 *
 * `SPAN_CLIP` says *"extending through the first half and returning through the second"*, which is
 * true of a jab and false of a death — and Phase 4 paid a generation to learn that the model
 * resolves a self-contradicting prompt by maximising it (it somersaulted the fall). A one-shot that
 * ends somewhere new therefore names **three fixed poses with their times**, which is geometry the
 * model can satisfy exactly one way, rather than a monotonicity clause — the plan is explicit that
 * a monotonicity clause made the Phase 4 jump somersault through five negations.
 */
export function poseSpan(first, halfway, last) {
  return (
    'Perform this as ONE single continuous motion that fills the ENTIRE clip and never repeats. ' +
    `At the very FIRST moment of the clip: ${first} ` +
    `HALFWAY through the clip: ${halfway} ` +
    `At the very LAST moment of the clip: ${last} ` +
    'Move smoothly and steadily between those three poses and never hold still, so that at every ' +
    'instant the body is at a different position from every other instant.'
  );
}
