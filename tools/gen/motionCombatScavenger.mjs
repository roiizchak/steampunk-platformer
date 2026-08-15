/**
 * The `rust-scavenger`'s five motion briefs, split from `motionCombat.mjs` on 2026-08-15.
 *
 * The seam is per SUBJECT, which is the only seam this table has: every record is a self-contained
 * prompt for one `slug/action`, sharing only the clause constants in the leaf `motionClauses.mjs`.
 * Splitting per subject means a future subject adds a file rather than growing one.
 *
 * ⚠️ **Two thirds of this file is literal prompt text sent to fal.** Shortening it changes the art
 * that gets generated, which is not a refactor — see `file-size.test.ts`'s header on the failure
 * mode of getting under a line limit by deleting what explains the code.
 *
 * This file imports ONLY from `motionClauses.mjs`, which imports nothing. No cycle.
 */

import {
  DEBRIS_MARGIN,
  FRAME_MARGIN,
  poseSpan,
} from './motionClauses.mjs';

export const SCAVENGER_MOTIONS = Object.freeze({
  /**
   * The patrol. Cyclic, limb mechanics named BEFORE the count - Phase 4's rule 2.
   *
   * **Round 2 came back clean through G6 and then failed extraction outright:** *"declared cyclic
   * but no window of it closes - no sampling of this clip yields a loop."* That is session 2's
   * eyeball verdict - *"a sway, not a gait, stride under 15% of body height"* - finally measured
   * rather than judged. **W9 never touched this prompt.** Its five corrections covered the
   * courier's prop and grip, the deaths' back-loading and `fire-elevated`; the stride was never
   * among them, so no amount of reframing was ever going to fix it.
   *
   * The cause is visible by diffing this record against `chase` below, which DOES produce a real
   * gait (measured at 40-50% of body height). `chase` names three visual facts - "a long reaching
   * stride", "both feet leave the ground briefly", "head thrust forward ahead of its shoulders".
   * This record named none: "swings that leg forward" and "plants the foot down" describe an
   * intention and contain no distance, and the model satisfied them with a sway. That is the same
   * failure as `SPAN_CLIP` in a different costume - **a SHAPE the model can satisfy literally,
   * where what was wanted was a GEOMETRY.**
   *
   * So every quantity here is now stated as a fraction of the creature's OWN body, which is the
   * only ruler the model and the gate share - `poseSpan` is not available to a cyclic entry
   * (`motion.mjs:376` gives cyclic records no span tail at all), so the geometry has to live in
   * the motion clause itself.
   */
  'rust-scavenger/walk': {
    cyclic: true,
    frames: 12,
    identity: 'IDENTITY: this is the same creature throughout, in strict side profile facing RIGHT - same ' +
      'riveted bucket head with a narrow slit and two amber lamps, same mismatched scavenged ' +
      'plates lashed on with wire, same counterweight on a chain at the hip, same bent exhaust ' +
      'stack, same rusted palette. It has EXACTLY two arms and two legs in every single frame and ' +
      'grows no extra limb. It stays hunched and forward-leaning and never stands fully upright.',
    motion:
      'walks forward to the RIGHT with a long, heavy, unmistakable plodding gait, repeated ' +
      'steadily for the whole clip. Each step is BIG: the leading clawed foot swings forward and ' +
      'lands a clear distance of about one third of the creature\'s own standing height ahead of ' +
      'the trailing foot, so the two feet are wide apart on the ground at the moment of each ' +
      'plant. At the top of its swing the lifted foot hangs about one tenth of the creature\'s ' +
      'standing height clear of the ground, with the knee bent sharply. There is always exactly ' +
      'one foot bearing weight and one foot travelling - the two feet are never both planted and ' +
      'still at the same moment. Its arms swing in opposition to its legs through the same wide ' +
      'arc. It completes exactly TWO full strides during the clip, at an unhurried plodding pace. ' +
      'It stays hunched. It does NOT travel across the frame - it walks on the spot, ' +
      'staying in exactly the same place in the frame at exactly the same size.' + FRAME_MARGIN,
  },

  /**
   * The idle — a scavenger that is stopped, and the reason it had to be bought.
   *
   * ## What it fixes
   *
   * A scavenger pinned by its dead zone, a ledge veto or a patrol clamp **ran its gait on the spot**
   * — a foot-plant violation the sim could see (`moving` is a readback of `x`) and the catalog could
   * not answer, for want of an `idle` sheet to select.
   *
   * ⚠️ The sim half landed first, at $0, and by itself changed NOTHING on screen: `playAnim.ts`
   * no-ops on an unregistered key, so the sprite kept playing `chase`. This sheet is what makes the
   * fix visible. Recorded because the opposite was believed when the spend was approved.
   *
   * **8 frames is forced.** Cyclic -> `loop: true` -> the binding gate is `loop-dwell.test.ts`
   * (`simTicks % frameCount === 0`), not `one-shot-divisor`, which filters looping rows out.
   * `FIXED_TIMINGS` pins `simTicks = IDLE_TICKS = 96`, so the count divides 96 -> **8 gives 12
   * ticks/frame, fps 5**, `brass-sentry-idle`'s spec exactly.
   *
   * 🔴 **Do not reach for `pingPong` if a re-shoot fails the loop wrap.** It packs `2n-2` cells; from
   * 8 that is **14**, and `96 / 14` is not an integer. Compatible counts: n in {4,5,7,9,13,17,25}.
   *
   * The clauses below are chosen against two measured precedents — a cyclic idle from this endpoint
   * had failed two different ways before. Full analysis and outcome in
   * [docs/generations/phase-05-scavenger-idle.md](../../docs/generations/phase-05-scavenger-idle.md).
   */
  'rust-scavenger/idle': {
    cyclic: true,
    frames: 8,
    identity: 'IDENTITY: this is the same creature throughout, in strict side profile facing RIGHT - same ' +
      'riveted bucket head with a narrow slit and two amber lamps, same mismatched scavenged ' +
      'plates lashed on with wire, same counterweight on a chain at the hip, same bent exhaust ' +
      'stack, same rusted palette. It has EXACTLY two arms and two legs in every single frame and ' +
      'grows no extra limb. It stays hunched and forward-leaning and never stands fully upright.',
    motion:
      'stands still and idles in place, breathing and ticking over like a machine at rest. Its ' +
      'clawed feet stay PLANTED on exactly the same spot on the ground for the entire clip - both ' +
      'feet keep contact, neither foot lifts, slides or steps, and the creature does NOT walk and ' +
      'does NOT travel across the frame. What moves is only this: the two amber lamps in its head ' +
      'slit flicker unevenly, a thin plume of steam puffs from the bent exhaust stack, the ' +
      'counterweight swings gently on its chain at the hip, and the whole body settles down and ' +
      'rises again as it breathes. Its head dips slightly and lifts again with that breath, and ' +
      'the top of its head moves up and down by no more than one twentieth of the creature\'s own ' +
      'standing height - it never bobs or rocks. It completes exactly TWO full settle-and-rise ' +
      'breaths during the clip, slowly and evenly. It stays hunched, in exactly the same place in ' +
      'the frame, at exactly the same size.' + FRAME_MARGIN,
  },

  /**
   * The swing — the animation the player reported missing.
   *
   * **9 frames is forced.** A one-shot must satisfy `simTicks % frameCount === 0`
   * (`one-shot-divisor.test.ts`), and `SCAVENGER_ATTACK` totals **36** ticks, so the count divides
   * 36 → 9 gives 4 ticks/frame, fps 15. The 36 is `startup 18 + active 6 + recovery 12`, all balance
   * numbers: changing either side without the other is how a one-shot starts dwelling unevenly.
   *
   * The prompt names the three phases separately because the whole point is a **telegraph** — one
   * smooth motion across nine frames has no readable commitment point, which fails the same way as
   * having no attack at all. Feet planted throughout, since `stepScavenger` holds `x` still for the
   * entire swing. Full record in
   * [docs/generations/phase-05-scavenger-attack.md](../../docs/generations/phase-05-scavenger-attack.md).
   */
  'rust-scavenger/attack': {
    frames: 9,
    identity: 'IDENTITY: this is the same creature throughout, in strict side profile facing RIGHT - same ' +
      'riveted bucket head with a narrow slit and two amber lamps, same mismatched scavenged ' +
      'plates lashed on with wire, same counterweight on a chain at the hip, same bent exhaust ' +
      'stack, same rusted palette. It has EXACTLY two arms and two legs in every single frame and ' +
      'grows no extra limb. It stays hunched and forward-leaning and never stands fully upright.',
    motion:
      'attacks with ONE single clawed swipe, in three clearly separate stages that a viewer can ' +
      'tell apart. FIRST it winds up: it leans back, raises its near clawed arm high and back ' +
      'behind its head, and holds that raised pose long enough to be unmistakable - this windup is ' +
      'the slowest part of the clip. THEN it strikes: the raised claw sweeps down and forward to ' +
      'the RIGHT in one fast arc, reaching its furthest extension in front of the body. FINALLY it ' +
      'recovers: the arm drops and it settles back to its hunched standing pose. It swings exactly ' +
      'ONCE - there is no second swipe. Its clawed feet stay PLANTED on exactly the same spot on ' +
      'the ground for the entire clip: neither foot lifts, slides or steps, it does NOT walk, and ' +
      'it does NOT travel across the frame. It stays hunched, in exactly the same place in the ' +
      'frame, at exactly the same size.' + FRAME_MARGIN,
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
      'exactly the same place in the frame at exactly the same size.' + FRAME_MARGIN,
  },

  /** The scavenger destroyed. One-shot; it must end unmistakably down. */
  'rust-scavenger/death': {
    cyclic: false,
    // 10 -> 9: same 45-tick window, same 4.5-refresh judder, same divisor. See the courier's.
    frames: 9,
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
    motion:
      'comes apart and collapses. It does not travel sideways; it goes down on the spot.' +
      FRAME_MARGIN +
      DEBRIS_MARGIN,
  },
});
