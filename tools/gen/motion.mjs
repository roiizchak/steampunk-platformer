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

/**
 * Appended to every ONE-SHOT motion (`jump`, `fall`), never to a cyclic one.
 *
 * Frames are sampled evenly across the whole clip. A jump that completes in the first second leaves
 * every later sample on a held pose — the sheet then carries three distinct poses in six cells and
 * reads as a stutter. Forbidding both "hold still" and "repeat" is what makes every sampled frame
 * carry new information.
 */
export const SPAN_CLIP =
  'Perform this single motion slowly and steadily so that it fills the ENTIRE clip from the very ' +
  'first moment to the very last: extending through the first half and returning through the ' +
  'second half. Never hold still, and never repeat the motion twice — at every instant the body is ' +
  'at a different position from every other instant.';

/**
 * Appended to the two AIRBORNE motions in place of `SPAN_CLIP`, which contradicts them.
 *
 * Names the axis that must hold rather than forbidding the failure. "Do not somersault" is negation,
 * which this model weakens rather than obeys *(STYLE.md §6)*; "head stays above his boots, spine
 * vertical" is geometry it can only satisfy one way. The second half removes the ground from the
 * frame entirely, because a figure implied to be *above* something grows a shadow for it — the first
 * jump and fall clips both drew one under boots that were nowhere near a floor.
 */
const UPRIGHT_IN_AIR =
  'Throughout the clip he stays UPRIGHT and vertical, head above his boots and his spine straight ' +
  'up and down, seen in strict side profile facing RIGHT. His body does not rotate, does not tip ' +
  'over, does not go horizontal, does not turn upside down and does not somersault at any point. ' +
  'He is high in the air with nothing at all beneath him: there is no ground, no floor and no ' +
  'surface anywhere in the frame, not even far below him, and nothing casts a shadow — the flat ' +
  'chroma green simply continues past the bottom edge. ' +
  'FRAMING: his whole body is inside the frame in every single moment of the clip, from the top of ' +
  'his hair to the soles of his boots, with a clear band of plain green above his head and another ' +
  'below his boots. No part of him is ever cut off by the top, bottom, left or right edge.';

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
    frames: 12,
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
    frames: 12,
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
  /**
   * `jump` and `fall` are one-shot, sampled across the whole clip — and **`SPAN_CLIP` is wrong for
   * both**, which cost a generation to learn.
   *
   * `SPAN_CLIP` says *extending through the first half and returning through the second*. That is
   * true of a jab and false of a fall: there is no "return" in falling, so the model resolved the
   * contradiction by rotating him. The first `fall` clip somersaulted — by frame 6 he was fully
   * inverted, head down and boots up — and `jump` lost strict side profile from frame 4 on. This is
   * the sibling project's plainest rule: *never contradict your own prompt, the model resolves it by
   * maximising*. A sustained airborne state needs a progression, not an out-and-back.
   *
   * So both now name the AXIS THAT MUST NOT MOVE. Forbidding "somersault" alone would be negation,
   * which STYLE.md §6 records as the thing that does not work on this model; naming the geometry that
   * must hold — head above boots, spine vertical, feet below hips — is the form that does.
   *
   * The ground shadow is killed the same way. The first pair drew a dark ellipse under the boots
   * despite "no shadow, no floor" in the shared block, because a figure in mid-air implies a surface
   * to be above. The fix is to remove the surface from the geometry rather than to forbid its
   * shadow: nothing below him, all the way past the bottom edge.
   *
   * These are also the two states `keepLargestComponent` is forbidden on *(vault 4.13)* — an
   * airborne figure is legitimately more than one component once a chroma-key AA gap splits a
   * trailing boot off — so a stray shadow blob cannot be cleaned up after the fact either.
   *
   * **And neither may TRAVEL, which cost a second generation to learn.** The corrected pair asked
   * him to rise (or descend) a little further in every moment of the clip, and he did — straight out
   * of the top of the frame. Four of the jump's six sampled frames came back with no head on them,
   * and no choice of sampling window can put a head back.
   *
   * The mistake is more basic than framing. **The sim already supplies the travel.** `playerView`
   * draws the sprite at the player's position, which `stepVertical` moves every tick, so a sprite
   * that also translates inside its own cell is asking for the motion twice. What these two
   * animations need from the model is a POSE PROGRESSION at a fixed position — the airborne shape
   * unfolding and gathering — and the only reason the first two attempts asked for anything else is
   * that "jump" and "fall" name displacements in ordinary speech.
   */
  jump: {
    cyclic: false,
    frames: 6,
    motion:
      'is airborne, caught in the middle of a leap, and HANGS IN EXACTLY THE SAME PLACE in the ' +
      'frame for the whole clip. His body does not travel up, down, left or right within the frame ' +
      'at any point — he neither rises nor sinks in shot. ONLY HIS POSE CHANGES, unfolding steadily ' +
      'from the first moment to the last: he begins compressed, both knees drawn up under his ' +
      'chest and his arms held low and close, and opens out through the clip — the leading knee ' +
      'dropping, the trailing leg reaching down and back, the arms swinging outward and upward — ' +
      'until he is stretched out at full extension at the end. ' +
      `${UPRIGHT_IN_AIR}`,
  },
  fall: {
    cyclic: false,
    frames: 6,
    motion:
      'is airborne, caught in the middle of a fall, and HANGS IN EXACTLY THE SAME PLACE in the ' +
      'frame for the whole clip. His body does not travel up, down, left or right within the frame ' +
      'at any point — he neither sinks nor rises in shot. ONLY HIS POSE CHANGES, gathering steadily ' +
      'from the first moment to the last: he begins stretched out, his legs trailing behind and ' +
      'below him and his arms out wide, and gathers through the clip — the knees coming forward ' +
      'and down beneath his hips, the boots swinging under him, the arms drawing down and in to ' +
      'his sides — until he is set to land with both boots directly below him at the end. ' +
      `${UPRIGHT_IN_AIR}`,
  },
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
  return [
    `A single continuous shot of THIS EXACT CHARACTER, who ${spec.motion}`,
    '',
    HOLD,
    '',
    blocks.rendering,
    '',
    `${blocks.forbid}, background scenery, ground shadow, drop shadow, floor, ground line, ` +
      'platform, interface, health bar, portrait medallion, multiple characters, cropped limbs, ' +
      'camera movement, zoom, text, watermark.',
  ].join('\n');
}
