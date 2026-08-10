/**
 * Phase 5's combat and enemy motion briefs — `slug/action`, one entry per generated clip.
 *
 * Split out of `motion.mjs` when the nine new briefs pushed that file past the 400-line rule. The
 * seam is a real one rather than a line count: `motion.mjs` holds the RULES this project paid
 * generations to learn — `SPAN_CLIP`, `poseSpan`, the camera lock, why a named count needs named
 * mechanics — and this file holds the briefs that apply them. Rules on one side, subjects on the
 * other.
 *
 * ## Every entry here is namespaced, and every one declares its own identity
 *
 * `idle` now means two different things, so a bare key cannot say which subject it is for.
 * `videoPrompt` throws if a namespaced entry has no `identity`, and that refusal is the point: the
 * legacy `HOLD` block opens with *"this is the same man… brass goggles… satchel"*, and a turret
 * handed that would be asked to grow a courier out of itself — and would try.
 *
 * ## `span` versus `SPAN_CLIP`
 *
 * A motion that extends and RETURNS (a swing, a recoil) takes `SPAN_CLIP`. A motion that ends
 * somewhere new (a death, a shot leaving a barrel) takes `poseSpan` with three timed poses,
 * because `SPAN_CLIP` would promise a return that never comes and Phase 4 paid a generation to
 * learn that this model resolves a self-contradicting prompt by maximising it.
 */

import { poseSpan } from './motion.mjs';

/**
 * Appended to every courier IDENTITY block. Malformed, missing and fused hands recur across the
 * combat batch, worst at peak extension — there is no gate for this, so the prompt is the only
 * lever, weak as it is.
 */
const HAND_CLAUSE =
  ' Both hands are always fully visible and correctly formed, with five fingers, and are never ' +
  'merged into the tool or into the body.';

/**
 * Appended to every one-shot combat motion's `motion` clause. `HOLD_CAMERA` in `motion.mjs`
 * already says "is never cropped by any edge" and it did not stop clipping at full extension — so
 * this is phrased as a positive requirement about where the subject sits, not another prohibition.
 */
const FRAME_MARGIN =
  ' At its point of furthest extension, the subject and anything it holds stays entirely inside ' +
  'the middle 70% of the frame width, with clear green margin visible at both the left and right ' +
  'edges of the frame.';

export const COMBAT_MOTIONS = Object.freeze({
  /* ---------------------------------------------------------------- *
   * Phase 5. Namespaced `slug/action`, because `idle` now means two different
   * things and a bare key cannot say which subject it is for. Every namespaced
   * entry carries its OWN identity clause - see `HOLD_CAMERA`. There is
   * deliberately no fallback: a turret handed the courier's identity would be
   * asked to grow a man out of itself.
   * ---------------------------------------------------------------- */

  /**
   * The swing. `simTicks` 20 - 6 startup, 4 active, 10 recovery.
   *
   * **Round 1 used `SPAN_CLIP` and there was no strike in the clip at all.** He raised the spanner
   * overhead and held it there: "extending through the first half and returning through the second"
   * was read as *raise it, then lower it*, which is a perfectly good reading of that sentence and
   * not the motion. No sampling can recover a contact frame from a clip that never contains one.
   *
   * The signal across the whole batch was unambiguous — every clip that used `poseSpan` hit its
   * specified poses, and both that used `SPAN_CLIP` failed. `SPAN_CLIP` describes a SHAPE; three
   * timed poses describe a GEOMETRY, and this model obeys geometry. So the swing is now three poses
   * with the halfway one nailed to "arm extended horizontally FORWARD, spanner at its furthest
   * point from the body" — which is also exactly what G5 measures as the contact frame.
   */
  'brass-courier/attack': {
    cyclic: false,
    frames: 8,
    identity: ('IDENTITY: this is the same man throughout, in strict side profile facing RIGHT - same face, ' +
      'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron, same ' +
      'bandolier of capped copper vials, same worn satchel, same forearm brace, same palette. ' +
      'Nothing is added, removed or recoloured at any point. He has EXACTLY two arms and two legs ' +
      'in every single frame and grows no extra limb.') + HAND_CLAUSE,
    span: poseSpan(
      'he has just drawn the small silver spanner from the tool loop on his belt and holds it low ' +
        'and back at hip height in a closed right fist, thumb over the top, all five fingers ' +
        'visible and correctly formed, both boots planted, shoulders coiled away from the ' +
        'direction he will strike.',
      'his right arm is extended straight forward at chest height, elbow locked, the small ' +
        'spanner still gripped in that same closed fist with the thumb over the top and all five ' +
        'fingers visible, at its single furthest point from his body, shoulders square to the ' +
        'strike. This is the moment of impact.',
      'his arm has settled back toward his belt and the small spanner, still held in his closed ' +
        'fist, is returning to its tool loop.',
    ),
    motion:
      ('draws a small spanner from the tool loop on his belt and swings it through one committed ' +
      'horizontal strike at chest height, then returns it to the loop. His boots stay planted on ' +
      'the same spot the whole time and he does NOT step, walk or travel - only the upper body ' +
      'and arms move. The strike arcs forward at chest height and settles back to his hip; it ' +
      'never climbs toward his shoulder or head.') + FRAME_MARGIN,
  },

  /**
   * Taking a hit. `simTicks` 18, and the pose must be unmistakable at 96 px from `attack`.
   *
   * **Round 1 used `SPAN_CLIP` and came back as a turn-and-reach**, with the profile lost as he
   * rotated toward the camera — nothing in it read as being struck. Same fix as `attack`: three
   * timed poses instead of a shape. What it must still not do is fall over — that is `death`, and
   * two states that look alike at sprite size are two states the player cannot tell apart.
   */
  'brass-courier/hurt': {
    cyclic: false,
    frames: 6,
    identity: ('IDENTITY: this is the same man throughout, in strict side profile facing RIGHT - same face, ' +
      'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron, same ' +
      'bandolier of capped copper vials, same worn satchel, same forearm brace, same palette. ' +
      'Nothing is added, removed or recoloured at any point. He has EXACTLY two arms and two legs ' +
      'in every single frame and grows no extra limb.') + HAND_CLAUSE,
    span: poseSpan(
      'he is standing upright in his normal stance, unhurt, in strict side profile facing RIGHT.',
      'he has been struck: his head and shoulders are snapped sharply BACKWARD away from the ' +
        'direction he faces, his chin is up, his spine is arched back, his near arm has flown up ' +
        'across his chest and his far arm is flung out behind him. Both boots are still flat on ' +
        'the ground in the same spot.',
      'he has pulled himself back upright into his normal stance, still in strict side profile ' +
        'facing RIGHT, still on both feet.',
    ),
    motion:
      ('takes a heavy blow and recoils from it. He stays ON HIS FEET the whole time and NEVER ' +
      'falls, NEVER kneels and NEVER lies down. His boots stay on the same spot; he does not step ' +
      'or travel. He stays in STRICT SIDE PROFILE facing RIGHT and never turns toward the viewer.') +
      FRAME_MARGIN,
  },

  /**
   * Dying. `simTicks` 45, the longest one-shot, and the one motion that does NOT return.
   *
   * `poseSpan` rather than `SPAN_CLIP`, and that is the whole Phase 4 lesson: a clause promising a
   * return through the second half is FALSE here, and the model resolves a contradiction by
   * maximising it. Three timed poses instead.
   */
  'brass-courier/death': {
    cyclic: false,
    frames: 10,
    identity: ('IDENTITY: this is the same man throughout, in strict side profile facing RIGHT - same face, ' +
      'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron, same ' +
      'bandolier of capped copper vials, same worn satchel, same forearm brace, same palette. ' +
      'Nothing is added, removed or recoloured at any point. He has EXACTLY two arms and two legs ' +
      'in every single frame and grows no extra limb.') + HAND_CLAUSE,
    span: poseSpan(
      'he is already reacting to the fatal blow: his knees are buckling under him, his weight ' +
        'dropping fast, one boot sliding to try to catch his balance, head snapping forward.',
      'he is well into the collapse: both knees have given way, his torso has folded forward and ' +
        'down, one shoulder dropping toward the ground, his arms falling loose.',
      'he is lying collapsed and completely still on his side on the ground, limbs slack, head ' +
        'down, not moving.',
    ),
    motion:
      ('collapses and dies. He does not travel sideways; he goes down on the spot where he stands.') +
      FRAME_MARGIN,
  },

  /** The turret at rest. Cyclic, and the ONLY things that may move are the barrel and the gauges. */
  'brass-sentry/idle': {
    cyclic: true,
    frames: 8,
    identity: 'IDENTITY: this is the same MACHINE throughout - a squat brass and blue-grey steel sentry ' +
      'turret, no face, no person, seen from the side facing RIGHT. Same riveted drum housing, ' +
      'same glass lens, same two pressure gauges, same stencilled number plate, same finned ' +
      'barrel, same palette. It has EXACTLY THREE legs in every single frame and grows no extra ' +
      'leg, no arm and no head. It never becomes a person or a creature.',
    motion:
      'sits motionless on its three legs, exactly as it is in the start image, and its three feet ' +
      'stay planted on the same spot. It NEVER walks, NEVER hops and NEVER tips over. Within that ' +
      'stillness it is subtly but CONTINUOUSLY alive as a MACHINE: the barrel swings very slightly ' +
      'up and back down again, exactly TWICE during the clip, one slow even cycle about every two ' +
      'seconds; the needles on both pressure gauges drift a little; a thin wisp of steam escapes ' +
      'from a seam and rises. The drum housing itself does not move.',
  },

  /**
   * Firing. `simTicks` 18, riding the sentry's existing `cooldownCounter`.
   *
   * `poseSpan` rather than `SPAN_CLIP`: a shot leaves and does not come back. The recoil returns,
   * but the muzzle flash does not, and asking for a symmetric motion would have the model pull the
   * flash back into the barrel.
   */
  'brass-sentry/fire': {
    cyclic: false,
    frames: 6,
    identity: 'IDENTITY: this is the same MACHINE throughout - a squat brass and blue-grey steel sentry ' +
      'turret, no face, no person, seen from the side facing RIGHT. Same riveted drum housing, ' +
      'same glass lens, same two pressure gauges, same stencilled number plate, same finned ' +
      'barrel, same palette. It has EXACTLY THREE legs in every single frame and grows no extra ' +
      'leg, no arm and no head. It never becomes a person or a creature.',
    span: poseSpan(
      'the barrel is level and still, the muzzle dark and empty.',
      'a bright muzzle flash bursts from the mouth of the barrel and the whole drum housing has ' +
        'kicked backward on its legs from the recoil.',
      'the flash is gone, a thin plume of smoke drifts from the muzzle, and the barrel has ' +
        'settled back to level.',
    ),
    motion: 'fires a single shot from its barrel. Its three feet never leave the spot.' + FRAME_MARGIN,
  },

  /**
   * Identical to `brass-sentry/fire` in every respect except the barrel angle: the sim aims its
   * projectile in 2D and the renderer picks this sheet when the shot is steeply angled, so the
   * barrel is raised roughly 35 degrees above horizontal throughout - including at rest and at
   * recoil, never returning to level.
   */
  'brass-sentry/fire-elevated': {
    cyclic: false,
    frames: 6,
    identity: 'IDENTITY: this is the same MACHINE throughout - a squat brass and blue-grey steel sentry ' +
      'turret, no face, no person, seen from the side facing RIGHT. Same riveted drum housing, ' +
      'same glass lens, same two pressure gauges, same stencilled number plate, same finned ' +
      'barrel, same palette. It has EXACTLY THREE legs in every single frame and grows no extra ' +
      'leg, no arm and no head. It never becomes a person or a creature.',
    span: poseSpan(
      'the barrel is raised at a steep angle, about 35 degrees above horizontal, and still, the ' +
        'muzzle dark and empty.',
      'a bright muzzle flash bursts from the mouth of the raised barrel and the whole drum ' +
        'housing has kicked backward on its legs from the recoil, the barrel still held at that ' +
        'same steep upward angle.',
      'the flash is gone, a thin plume of smoke drifts from the muzzle, and the barrel has ' +
        'settled back to its steady raised angle of about 35 degrees above horizontal.',
    ),
    motion:
      'fires a single shot from its barrel, held raised at a steep upward angle throughout, at ' +
      'rest and in recoil alike. Its three feet never leave the spot.' + FRAME_MARGIN,
  },

  /** The turret destroyed. One-shot, and it must end as obvious wreckage. */
  'brass-sentry/death': {
    cyclic: false,
    frames: 8,
    identity: 'IDENTITY: this is the same MACHINE throughout - a squat brass and blue-grey steel sentry ' +
      'turret, no face, no person, seen from the side facing RIGHT. Same riveted drum housing, ' +
      'same glass lens, same two pressure gauges, same stencilled number plate, same finned ' +
      'barrel, same palette. It has EXACTLY THREE legs in every single frame and grows no extra ' +
      'leg, no arm and no head. It never becomes a person or a creature.',
    span: poseSpan(
      'it is already failing: sparks are spitting from a seam along the drum housing and one leg ' +
        'is beginning to buckle under it.',
      'it has come apart much further: the drum housing is torn wide open, sparks and steam are ' +
        'venting hard from the break, and it has toppled sideways with two legs collapsed under ' +
        'it and only one still bearing any weight.',
      'it is a collapsed heap of broken plates on the ground, all three legs folded under it, ' +
        'dark and still, with only a last wisp of smoke.',
    ),
    motion: ('is destroyed. It does not travel sideways; it comes apart where it stands.') + FRAME_MARGIN,
  },

  /** The patrol. Cyclic, limb mechanics named BEFORE the count - Phase 4's rule 2. */
  'rust-scavenger/walk': {
    cyclic: true,
    frames: 12,
    identity: 'IDENTITY: this is the same creature throughout, in strict side profile facing RIGHT - same ' +
      'riveted bucket head with a narrow slit and two amber lamps, same mismatched scavenged ' +
      'plates lashed on with wire, same counterweight on a chain at the hip, same bent exhaust ' +
      'stack, same rusted palette. It has EXACTLY two arms and two legs in every single frame and ' +
      'grows no extra limb. It stays hunched and forward-leaning and never stands fully upright.',
    motion:
      'walks forward to the RIGHT with a complete and clearly visible walking cycle, repeated ' +
      'steadily for the whole clip: it lifts one clawed foot right off the ground, swings that ' +
      'leg forward, plants the foot down, and pushes off with the trailing leg, then does the ' +
      'same with the other leg. Its knees bend visibly and its arms swing in opposition to its ' +
      'legs. It completes exactly TWO full strides during the clip, at an unhurried plodding ' +
      'pace. It stays hunched. It does NOT travel across the frame - it walks on the spot, ' +
      'staying in exactly the same place in the frame at exactly the same size.',
  },

  /**
   * The chase. Same creature, same cycle, visibly FASTER and lower.
   *
   * The difference from `walk` has to be readable at 96 px or the two sheets are one sheet with two
   * names - and `chase` derives its fps from `chaseSpeed` 8 against `patrolSpeed` 2.5, so the art
   * has to justify a cycle three times shorter.
   */
  'rust-scavenger/chase': {
    cyclic: true,
    frames: 12,
    identity: 'IDENTITY: this is the same creature throughout, in strict side profile facing RIGHT - same ' +
      'riveted bucket head with a narrow slit and two amber lamps, same mismatched scavenged ' +
      'plates lashed on with wire, same counterweight on a chain at the hip, same bent exhaust ' +
      'stack, same rusted palette. It has EXACTLY two arms and two legs in every single frame and ' +
      'grows no extra limb. It stays hunched and forward-leaning and never stands fully upright.',
    motion:
      'runs hard forward to the RIGHT in a fast aggressive scrambling charge, far quicker and much ' +
      'lower to the ground than a walk: it drives each clawed foot down and back with a long ' +
      'reaching stride, both feet leave the ground briefly between strides, its arms pump hard and ' +
      'its head is thrust forward ahead of its shoulders. It completes exactly TWO full strides ' +
      'during the clip. It does NOT travel across the frame - it runs on the spot, staying in ' +
      'exactly the same place in the frame at exactly the same size.',
  },

  /** The scavenger destroyed. One-shot; it must end unmistakably down. */
  'rust-scavenger/death': {
    cyclic: false,
    frames: 10,
    identity: 'IDENTITY: this is the same creature throughout, in strict side profile facing RIGHT - same ' +
      'riveted bucket head with a narrow slit and two amber lamps, same mismatched scavenged ' +
      'plates lashed on with wire, same counterweight on a chain at the hip, same bent exhaust ' +
      'stack, same rusted palette. It has EXACTLY two arms and two legs in every single frame and ' +
      'grows no extra limb. It stays hunched and forward-leaning and never stands fully upright.',
    span: poseSpan(
      'it is already reeling from the blow: its head is snapping back and its scavenged plates ' +
        'are starting to shake loose from their wire lashings.',
      'it is buckling hard: most of its plates have torn free and are scattering, one leg has ' +
        'fully given way, and its body is dropping toward the ground.',
      'it is a collapsed pile of scrap on the ground, completely still, its bucket head fallen to ' +
        'one side and both amber lamps dark.',
    ),
    motion: ('comes apart and collapses. It does not travel sideways; it goes down on the spot.') +
      FRAME_MARGIN,
  },
});
