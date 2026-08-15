/**
 * Motion prompts for `bytedance/seedance-2.0/image-to-video` — the character animation path.
 *
 * ## Why this file exists at all, when probe B already won
 *
 * Gate 4.2b compared Seedance video against a `nano-banana-pro/edit` sheet and recorded *"probe B
 * wins, and it is not close"*. That verdict was right about what it measured and **wrong about what
 * it concluded**, and the evidence is in the shipped sheets rather than in the probe:
 *
 * ```
 *              consecutive-frame silhouette IoU     interior colour change
 *   idle              0.86 - 0.98                        13 - 36
 *   walk              0.54 - 0.87                        27 - 44
 *   run               0.45 - 0.60                        33 - 44
 * ```
 *
 * An IoU of 0.98 means the two poses **are the same pose**. The idle carries no breath at all — yet
 * its interior still changes by 13-36 per channel, so what plays on screen is not motion, it is the
 * character being redrawn slightly differently every frame. Goggles, pauldron, bandolier and satchel
 * boil. The drawn figure also changes SIZE between cells (walk swings 114 -> 160 px wide and
 * 285 -> 306 tall), so the head bobs because the drawing is a different size, not because the
 * character moved.
 *
 * That is what per-frame image generation is: N independent draws. It cannot hold identity between
 * frames, and it cannot draw a difference smaller than its own noise floor — which a breathing idle
 * is. Video is temporally consistent *by construction*, which is the property being bought here.
 *
 * ## Why probe A failed, and why that was a prompt defect
 *
 * Probe A asked for *"exactly six full strides"* and returned a near-idle with a slow turn. That is
 * a **named count with no named mechanics**, and it is a known failure of this model rather than a
 * property of it: a sibling project measured the identical result on a backpedal (*"he slid backward
 * without moving his legs"*, 0.14 against 0.56-0.79 for the forward walk) and fixed it by describing
 * what each limb does — lift this foot clear, swing it, plant it, now the other one, over and over.
 * Every cyclic motion below names the mechanics AND the count. Neither alone is enough.
 *
 * ## The three rules encoded here
 *
 * 1. **`SPAN_CLIP` for one-shot motions.** Frames are sampled evenly across the clip, so a motion
 *    that finishes in the first second spends the rest of its frames on a held pose.
 * 2. **A named cycle COUNT for cyclic motions.** With one slow cycle across 4 s, evenly spaced
 *    samples all land at nearly the same phase and the clip reads as a still. Two cycles is the
 *    count that measured 0.35-0.44 where amplitude alone reached only 0.10.
 * 3. **"Subtle" is read as "do not move".** The idle says *continuously alive* and then says exactly
 *    what moves, because the adjective on its own produces a frozen photograph. This is the same
 *    finding STYLE.md §6 records for stills: this model obeys a named element and ignores a generic
 *    adjective.
 *
 * ## The two clauses this project needs that a fighting game did not
 *
 * - **The camera is locked.** Cells are packed at one scale from `character-bounds.json` *(vault
 *   A5)*; a dolly or zoom during the clip reintroduces exactly the size-pop being removed.
 * - **The chroma field is restated.** The anchor is on chroma green and `estimateKeyColour` measures
 *   the key off the image, so a field that drifts or speckles costs alpha at the edges.
 */

import { COMBAT_MOTIONS } from './motionCombat.mjs';
/**
 * ⚠️ Safe to import here, and the reason is specific. `motionClauses.mjs` is a **leaf** — it imports
 * nothing at all — so it cannot widen the `motion.mjs` ↔ `motionCombat.mjs` cycle this file's own
 * consumers are careful to enter from the right side. Verified, not assumed.
 */
import { FRAME_MARGIN, poseSpan } from './motionClauses.mjs';
import { AIRBORNE_MOTIONS } from './motionAirborne.mjs';

/**
 * Appended to every ONE-SHOT motion (`jump`, `fall`), never to a cyclic one.
 *
 * Frames are sampled evenly across the whole clip. A jump that completes in the first second leaves
 * every later sample on a held pose — the sheet then carries three distinct poses in six cells and
 * reads as a stutter. Forbidding both "hold still" and "repeat" is what makes every sampled frame
 * carry new information.
 */
/**
 * 🔴 **Re-exported, not defined here, since 2026-08-15.** `poseSpan` moved to the leaf
 * `motionClauses.mjs` to BREAK the `motion.mjs` ↔ `motionCombat.mjs` import cycle: `motionCombat`
 * needed exactly this one function from here, and nothing else. The cycle's failure mode is a
 * SILENTLY truncated `VIDEO_MOTIONS` under Vite when the two are touched in the wrong order — a
 * defect that costs a paid generation, not a test. Kept re-exported so no consumer's import moves in
 * the same commit that moves the definition.
 */
export { poseSpan };

export const SPAN_CLIP =
  'Perform this single motion slowly and steadily so that it fills the ENTIRE clip from the very ' +
  'first moment to the very last: extending through the first half and returning through the ' +
  'second half. Never hold still, and never repeat the motion twice — at every instant the body is ' +
  'at a different position from every other instant.';

/**
 * Shared tail: identity, camera lock and the chroma field.
 *
 * The outfit is re-stated in full even though `image_url` supplies it. The start image dominates,
 * but it dominates the FIRST frame hardest — restating the outfit is what keeps the pauldron and
 * bandolier attached at second four, and it is one sentence.
 */
const HOLD = [
  'IDENTITY: this is the same man throughout, in strict side profile facing RIGHT — same face, ' +
    'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron on one ' +
    'shoulder, same bandolier of capped copper vials, same worn satchel, same forearm brace, same ' +
    'palette. Nothing is added, removed or recoloured at any point in the clip. He has EXACTLY two ' +
    'arms and two legs in every single frame and grows no extra limb.',
  // The camera clause is this project's own, and it is load-bearing rather than tidy: every cell is
  // packed at ONE scale taken from `character-bounds.json` (vault A5), so a dolly or a zoom during
  // the clip puts the size-pop straight back into the sheet — which is the defect being removed.
  'CAMERA: the camera is completely locked. It never pans, never zooms, never dollies and never ' +
    'rotates. The character stays at exactly the same size and stays in the same place in the ' +
    'frame for the whole clip, and is never cropped by any edge.',
  'BACKGROUND: perfectly flat uniform chroma green, RGB 0 255 0, edge to edge, for the whole clip. ' +
    'No texture, no speckle, no gradient, no shadow, no floor, no ground line, no platform, no ' +
    'scenery. He stands on nothing and touches nothing.',
].join(' ');

/**
 * The two clauses of `HOLD` that are true of ANY subject, so an enemy can reuse them.
 *
 * Split out in Phase 5. `HOLD` above opens with *"this is the same man… brass goggles… satchel"* —
 * feeding that to a turret would ask the model to grow a courier out of it, and a fallback that
 * quietly did so is exactly the class of bug `videoPrompt` already refuses for a missing motion.
 * So identity is now per subject and REQUIRED for every namespaced entry; only the camera lock and
 * the chroma field are shared, because neither says anything about who is in frame.
 */
const HOLD_CAMERA =
  'CAMERA: the camera is completely locked. It never pans, never zooms, never dollies and never ' +
  'rotates. The subject stays at exactly the same size and stays in the same place in the frame ' +
  'for the whole clip, and is never cropped by any edge.';

const HOLD_BACKGROUND =
  'BACKGROUND: perfectly flat uniform chroma green, RGB 0 255 0, edge to edge, for the whole clip. ' +
  'No texture, no speckle, no gradient, no shadow, no floor, no ground line, no platform, no ' +
  'scenery. It stands on nothing and touches nothing.';

/**
 * One motion brief per animation. `cyclic` decides the prompt tail and how the clip is sampled.
 *
 * **The asked-for cycle count is not the delivered one, and the sampler does not trust it.** Every
 * cyclic brief here names exactly two cycles, which is the count a sibling project measured as
 * reliable. Measured on the clips that came back, the model delivered **4.0 for walk, 6.1 for run
 * and 2.6 for idle** — the count is doing its real job, which is stopping the phase collapse of rule 2, but it is
 * not a number anything downstream may depend on.
 *
 * That matters because `simTicks = round(stride / speed)` is the duration of ONE cycle *(vault
 * 4.22)*, so a sheet holding two strides halves the derived fps and puts the foot-slide back. The
 * cycle length is therefore MEASURED off the finished clip by `sampler.mjs`, which takes the
 * shortest window that closes. Asking again would be a coin flip on a model STYLE.md §3 records as
 * not seed-deterministic; measuring is free and repeatable.
 */
export const VIDEO_MOTIONS = Object.freeze({
  /**
   * The idle, and the reason this whole file exists.
   *
   * Measured at IoU 0.86-0.98 on the shipped sheet: no breath, only boil. The three clauses that
   * turned a sibling project's three frozen idles into 0.35-0.44 first try are all here — the named
   * cycle count, the explicit list of what moves, and the head-height clause that stops "alive"
   * being answered with a squat. The last one matters: raising amplitude without it produced a full
   * dip at the knees every 0.4 s, which reads as doing squats rather than standing.
   */
  idle: {
    cyclic: true,
    frames: 12,
    motion:
      'stands still in a relaxed upright courier stance, weight easy, exactly as he is in the ' +
      'start image, and his head stays at very nearly the same height throughout. He NEVER ' +
      'squats, NEVER dips at the knees, NEVER crouches and NEVER walks — his boots stay planted ' +
      'on the same spot the entire time. Within that stance he is subtly but CONTINUOUSLY alive: ' +
      'he settles and rises again very slightly, exactly TWICE during the clip, one small evenly ' +
      'paced cycle about every two seconds, breathing so his chest and shoulders visibly rise and ' +
      'fall, his free hand drifting a little, the satchel swinging a little at his hip, and his ' +
      'weight easing gently from one foot to the other and back.',
  },
  /**
   * Walk and run both name the LIMB MECHANICS before the count.
   *
   * Probe A's *"exactly six full strides"* named a count and no mechanics, and produced a near-idle
   * with a slow turn — the same failure a sibling project measured on a backpedal and cured with
   * exactly this wording. The count then fixes the sampling; the mechanics fix whether any walking
   * happens at all.
   */
  walk: {
    cyclic: true,
    frames: 24,
    motion:
      'walks forward to the RIGHT with a complete and clearly visible walking cycle, repeated ' +
      'steadily for the whole clip: he lifts one boot right off the ground, swings that leg ' +
      'forward in front of him and plants the heel, rolls his weight over it, then does exactly ' +
      'the same with the other leg, over and over. The legs alternate continuously and are never ' +
      'both planted still at the same time. His arms swing in opposition to his legs. He ' +
      'completes exactly TWO full strides during the clip — one every two seconds — at an even ' +
      'unhurried pace. His torso stays upright and facing RIGHT.',
  },
  run: {
    cyclic: true,
    /**
     * 🔴 **15, not 12, and the reason is the SPEED — not the animation.**
     *
     * Foot travel per drawn frame is `stridePerCycle / frames`, and planted feet require
     * `ticksPerFrame × topSpeed === footPxPerFrame` with `ticksPerFrame` a whole number. Substitute
     * and the speed collapses to `stridePerCycle / (frames × ticksPerFrame)` — so with 12 frames the
     * ONLY planted run speeds are `270/24 = 11.25` and `270/36 = 7.5`, and nothing in between exists.
     *
     * 7.5 was too slow and 11.25 is within 6 % of the 12.0 the user had already rejected as *"moves
     * very fast"*. Changing the frame count is the one lever that reaches between them: **15 frames
     * at 2 ticks/frame gives `270/30 = 9.0`**, with zero slide. The user chose it over accepting a
     * 20 % slide at the same speed.
     *
     * ⚠️ **It costs pose distinctness, and that is the recorded trade.** The clip carries roughly 13
     * genuinely distinct poses per cycle, so 15 sampled frames necessarily repeats some — the same
     * mild defect already measured on the walk sheet (pairs 1-2, 4-5, 14-15, 18-19). `gateMotionFloor`
     * cannot catch it: it compares every frame to frame 0 and keeps the maximum, never adjacent
     * pairs. Buying real distinctness here needs a longer or higher-frame-rate clip, i.e. money.
     */
    frames: 15,
    motion:
      'runs hard to the RIGHT with a complete and clearly visible running cycle, repeated steadily ' +
      'for the whole clip: he drives one knee high in front of him, reaches that leg forward, ' +
      'strikes the ground with that foot while the other leg extends fully behind him, pushes off ' +
      'that back toe until BOTH FEET ARE CLEAR OF THE GROUND, then does exactly the same with the ' +
      'other leg, over and over. The legs alternate continuously and are never both planted still ' +
      'at the same time. His torso is pitched forward and his arms pump hard in opposition to his ' +
      'legs, elbows bent. He completes exactly TWO full strides during the clip — one every two ' +
      'seconds. He stays facing RIGHT.',
  },
  ...AIRBORNE_MOTIONS,

  ...COMBAT_MOTIONS,
});

/**
 * Build the full prompt for one animation. `template` is `styleTemplate()`'s parsed STYLE.md, whose
 * RENDERING and DO NOT INCLUDE blocks are hash-locked — quoted, never paraphrased *(vault 4.3)*.
 */
export function videoPrompt(template, action, blocks) {
  const spec = VIDEO_MOTIONS[action];
  if (!spec) {
    throw new Error(
      `motion: no video motion declared for "${action}". A declared animation with no brief fails ` +
        `rather than falling back to another action's motion (vault 4.16).`,
    );
  }
  /**
   * Identity is per subject and has **no fallback**, for the same reason a missing motion throws.
   * `HOLD` opens with *"this is the same man… brass goggles… satchel"*; a turret handed that would
   * be asked to grow a courier out of itself, and it would try. The legacy bare keys (`idle`,
   * `walk`, `run`, `jump`, `fall`) are the courier's and keep `HOLD`; every namespaced `slug/action`
   * must declare its own.
   */
  const namespaced = action.includes('/');
  if (namespaced && !spec.identity) {
    throw new Error(
      `motion: "${action}" is namespaced but declares no identity clause. An enemy inheriting the ` +
        `courier's identity is a worse failure than a missing prompt (vault 4.16).`,
    );
  }
  const hold = namespaced
    ? [spec.identity, HOLD_CAMERA, HOLD_BACKGROUND].join(' ')
    : HOLD;

  /**
   * The one-shot tail. `span` wins when the motion does NOT return (`death`, `fire`); otherwise a
   * non-cyclic motion gets `SPAN_CLIP`, which is only correct for a motion that extends and comes
   * back. Cyclic motions get neither — their count is in the brief.
   */
  const tail = spec.span ?? (spec.cyclic ? '' : SPAN_CLIP);

  return [
    `A single continuous shot of THIS EXACT SUBJECT, which ${spec.motion}`,
    ...(tail ? ['', tail] : []),
    '',
    hold,
    '',
    blocks.rendering,
    '',
    `${blocks.forbid}, background scenery, ground shadow, drop shadow, floor, ground line, ` +
      'platform, interface, health bar, portrait medallion, multiple characters, cropped limbs, ' +
      'camera movement, zoom, text, watermark.',
  ].join('\n');
}
