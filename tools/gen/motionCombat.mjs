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
   * `SPAN_CLIP` is CORRECT here and used as-is: a strike genuinely does extend and return, which is
   * the one shape that clause describes. The contact frame has to land inside the active window,
   * which is what G5 measures off the finished sheet - so the brief names WHERE the arm is at the
   * halfway point rather than leaving the peak to fall wherever the model likes.
   */
  'brass-courier/attack': {
    cyclic: false,
    frames: 8,
    identity: 'IDENTITY: this is the same man throughout, in strict side profile facing RIGHT - same face, ' +
      'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron, same ' +
      'bandolier of capped copper vials, same worn satchel, same forearm brace, same palette. ' +
      'Nothing is added, removed or recoloured at any point. He has EXACTLY two arms and two legs ' +
      'in every single frame and grows no extra limb.',
    motion:
      'swings a heavy spanner in one overhead arc: he draws it back and up behind his shoulder, ' +
      'then drives it forward and down through a full committed strike, then lets the arm settle ' +
      'back toward his side. His boots stay planted on the same spot the whole time and he does ' +
      'NOT step, walk or travel - only the upper body and arms move through the swing. At the ' +
      'exact halfway point of the clip the spanner is at its furthest reach in front of him and ' +
      'his shoulders are square to the direction of the strike.',
  },

  /**
   * Taking a hit. `simTicks` 18, and the pose must be unmistakable at 96 px from `attack`.
   *
   * A recoil DOES return - the body snaps back and recovers - so `SPAN_CLIP` fits. What it must not
   * do is fall over: that is `death`, and two states that look alike at sprite size are two states
   * the player cannot tell apart.
   */
  'brass-courier/hurt': {
    cyclic: false,
    frames: 6,
    identity: 'IDENTITY: this is the same man throughout, in strict side profile facing RIGHT - same face, ' +
      'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron, same ' +
      'bandolier of capped copper vials, same worn satchel, same forearm brace, same palette. ' +
      'Nothing is added, removed or recoloured at any point. He has EXACTLY two arms and two legs ' +
      'in every single frame and grows no extra limb.',
    motion:
      'recoils backward from a blow: his head and shoulders snap back and away, his spine arches ' +
      'away from the impact, one arm flies up across his chest, and then he pulls himself back ' +
      'toward his stance. He stays ON HIS FEET the whole time and NEVER falls, NEVER kneels and ' +
      'NEVER lies down. His boots stay on the same spot; he does not step or travel.',
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
    identity: 'IDENTITY: this is the same man throughout, in strict side profile facing RIGHT - same face, ' +
      'same hair, same brass goggles pushed up on the forehead, same riveted brass pauldron, same ' +
      'bandolier of capped copper vials, same worn satchel, same forearm brace, same palette. ' +
      'Nothing is added, removed or recoloured at any point. He has EXACTLY two arms and two legs ' +
      'in every single frame and grows no extra limb.',
    span: poseSpan(
      'he is standing upright on both boots in his normal stance, unhurt.',
      'his knees have buckled and he is down on one knee, doubled forward, one hand on the ' +
        'ground taking his weight, head dropped.',
      'he is lying collapsed and completely still on his side on the ground, limbs slack, head ' +
        'down, not moving.',
    ),
    motion:
      'collapses and dies. He does not travel sideways; he goes down on the spot where he stands.',
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
    motion: 'fires a single shot from its barrel. Its three feet never leave the spot.',
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
      'it is intact and upright on all three legs.',
      'the drum housing is split open along its seam, sparks and steam are venting hard from the ' +
        'break, and one leg has buckled so it leans heavily.',
      'it is a collapsed heap of broken plates on the ground, all three legs folded under it, ' +
        'dark and still, with only a last wisp of smoke.',
    ),
    motion: 'is destroyed. It does not travel sideways; it comes apart where it stands.',
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
      'it is hunched and upright on both clawed feet, intact.',
      'its head has snapped back, its scavenged chest plates are flying loose off their wire ' +
        'lashings, and it is sagging hard onto one buckling leg.',
      'it is a collapsed pile of scrap on the ground, completely still, its bucket head fallen to ' +
        'one side and both amber lamps dark.',
    ),
    motion: 'comes apart and collapses. It does not travel sideways; it goes down on the spot.',
  },
});
