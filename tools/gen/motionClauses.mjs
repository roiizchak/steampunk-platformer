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
/**
 * Where in the frame the subject SITS. Diagnosed from the session-6 re-shoots.
 *
 * `HOLD_CAMERA` (`motion.mjs`) says the subject *"stays in the same place in the frame for the whole
 * clip, and is never cropped by any edge"*. That constrains **stability**, and it never says WHERE —
 * so a model can park the subject hard against one side, hold it perfectly still there, and satisfy
 * every word of it while pressing into that edge.
 *
 * Three of the four session-6 re-shoots failed G6 with exactly that signature:
 *
 * ```
 * rust-scavenger/death  f1/10   left 154   right 0
 * brass-courier/attack  f2/8    left 188   right 0
 * brass-courier/death   f2/10   left 160   right 0
 * ```
 *
 * **That is not a subject too large for the frame.** Centred, each of those has ~90 px a side. The
 * whole deficit is on one edge because the figure is off-centre, which is why more margin in
 * `FRAME_MARGIN` — a clause about how far a limb may extend — did not help: the extension was never
 * the problem.
 *
 * Stated as a positive requirement about the resting body rather than another prohibition, for the
 * reason `FRAME_MARGIN` records: `HOLD_CAMERA`'s *"never cropped by any edge"* was already a
 * prohibition and it did not hold.
 */
export const HOLD_CENTRED =
  ' The subject is CENTRED in the frame: at rest its body sits on the vertical centre line of the ' +
  'frame, with the same amount of clear green margin to its left as to its right. It is never ' +
  'pushed toward one side of the frame.';

export const FRAME_MARGIN =
  ' At its point of furthest extension, the subject and anything it holds stays entirely inside ' +
  'the middle 70% of the frame width, with clear green margin visible at both the left and right ' +
  'edges of the frame.';

/**
 * Appended to the two `brass-sentry/fire*` records, and to nothing else.
 *
 * **G6 fails `fire` on a frame where the turret is COMPLETE.** What reaches the edge is the muzzle
 * flash and the smoke plume, not a sheared limb — confirmed by looking at the six-frame strip at
 * full resolution. G6 measures an opaque subject mask and reads one byte per pixel
 * (`edgeGate.mjs:91`, alpha only), so it cannot tell discharge from a crop. That is the same class
 * of blind spot already recorded for G1, which *"cannot tell a boot from a hand"*.
 *
 * **The user's decision was to constrain the effect rather than teach the gate** — so no threshold
 * in `edgeGate.mjs` moved and `DEFAULT_MIN_ALPHA` stays 255. `FRAME_MARGIN` alone does not cover
 * this: it binds "the subject and anything it holds", and a turret does not *hold* its own muzzle
 * flash. The flash needed its own ruler, and it is measured against the barrel — the one part of
 * the machine whose length the model has already committed to in the identity clause.
 */
export const DISCHARGE_MARGIN =
  ' The muzzle flash and the smoke are SMALL and CONTAINED: the flash reaches no further from the ' +
  'muzzle than the length of the barrel itself, and the smoke stays a thin wisp close to the ' +
  'muzzle. Neither the flash nor the smoke ever reaches any edge of the frame, and clear green ' +
  'margin stays visible on all four edges throughout.';

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

