/**
 * Frozen prompt data — split out of `prompt.mjs` to keep that file under the 400-line limit.
 *
 * Pure data tables, moved verbatim with no rewording: `SHEET_PHASES` (vault 4.15 — hand-picked
 * frames tracked in the generator, not described in prose) and `ANCHOR_CONCEPTS` (the character
 * and enemy anchor briefs). Re-exported from `prompt.mjs` so its three importers need no change.
 */

/**
 * Frame phases per action. Tracked here, in the generator, rather than described in prose — vault
 * **4.15**: hand-picked frames living in a document mean the documented command rebuilds something
 * else.
 */
export const SHEET_PHASES = Object.freeze({
  /**
   * **Eight frames, not four, and the reason is arithmetic rather than taste.**
   *
   * The frame rate is derived, never authored: `fps = renderFrames x TICK_HZ / simTicks`, where
   * `simTicks = round(stride / speed)` *(vault 4.22)*. After the Phase 4 re-scale the walk cycle
   * covers 276 px at 5.54 px/tick — **50 ticks** — so four frames derive to **4.8 fps**. That is
   * the honest anti-foot-slide answer and it is visibly choppy; the only term left to move is the
   * frame count. Eight frames put walk at 9.6 fps and run at 12.3 fps, both in the ordinary band
   * for pixel-art locomotion, with the feet still landing exactly where the sim says.
   *
   * The phases are the standard eight-pose cycle — contact, down, passing, up, then the same four
   * mirrored — rather than four poses with in-betweens invented, because naming each pose is what
   * this model actually obeys.
   */
  run: [
    'contact — right foot striking the ground in front, left leg extended back, torso pitched ' +
      'forward, left arm forward and right arm back',
    'down — weight fully over the bent right leg, body at its LOWEST point of the cycle, left leg ' +
      'swinging through beneath',
    'passing — right leg driving back and straightening, left knee lifted high in front',
    'up — full extension off the right toe, BOTH FEET CLEAR OF THE GROUND, body at its HIGHEST, ' +
      'left leg reaching forward',
    'contact — left foot striking the ground in front, right leg extended back, arms swapped',
    'down — weight fully over the bent left leg, body at its LOWEST, right leg swinging through',
    'passing — left leg driving back and straightening, right knee lifted high in front',
    'up — full extension off the left toe, BOTH FEET CLEAR OF THE GROUND, body at its HIGHEST, ' +
      'right leg reaching forward',
  ],
  walk: [
    'contact — right heel just down in front, left toe just leaving behind, stride SHORT and the ' +
      'torso upright, arms swinging gently at the sides',
    'down — weight settling over the right leg, knee softly bent, body at its LOWEST point',
    'passing — legs together directly beneath the body, left knee lifted only slightly',
    'up — pushing off the right toe, body at its HIGHEST, left leg reaching gently forward',
    'contact — left heel just down in front, right toe just leaving behind, arms swapped',
    'down — weight settling over the left leg, knee softly bent, body at its LOWEST',
    'passing — legs together directly beneath the body, right knee lifted only slightly',
    'up — pushing off the left toe, body at its HIGHEST, right leg reaching gently forward',
  ],
  /**
   * Eight ASKED-FOR poses, replacing four asked-for poses that came back as eight.
   *
   * The first idle sheet was requested as a 4-frame 2 x 2 grid and returned **8 figures in 4 x 2**
   * — recorded at the time as a happy accident, since `detectFrames` reads the grid off the pixels
   * and `fps` derives from whatever count is really there. It is not an accident that helps: four
   * of the eight poses were the model's invention, so the loop steps unevenly regardless of the
   * frame rate. Naming all eight is what makes a smooth cycle a specification rather than a hope.
   *
   * The arc returns to neutral at frame 8 so the wrap into frame 1 is continuous — which is what
   * `gateLoopWrap` measures.
   */
  idle: [
    'neutral stance, both feet flat and level, arms relaxed at the sides, chest at rest',
    'the very beginning of an inhale — the chest starts to lift, shoulders barely moving',
    'inhaling — chest and shoulders clearly but gently risen, the head lifting a fraction',
    'the top of the breath — posture at its tallest, still clearly the same relaxed stance',
    'holding, the faintest settle — the shoulders ease a little while the chest stays full',
    'the beginning of the exhale — the chest starts to fall, shoulders dropping slightly',
    'exhaling — chest and shoulders most of the way back down, the head lowering a fraction',
    'almost neutral again — a hair below the starting pose, about to settle into frame 1',
  ],
  // Airborne. NOTE these two are exactly the states `keepLargestComponent` is forbidden for
  // (vault 4.13): a raised arm or a trailing coat can legitimately be a second component.
  jump: [
    'crouch — knees deeply bent, arms drawn back, body compressed and still touching the ground, ' +
      'about to launch',
    'launch — legs snapping straight, both feet just clear of the ground, arms thrown upward',
    'rising — body stretched tall and vertical, legs trailing slightly behind, arms up',
    'apex — the rise slowing, knees beginning to tuck, arms starting to come down',
  ],
  fall: [
    'falling — knees tucked up, arms out for balance, body compact',
    'falling faster — legs beginning to reach downward, torso upright, coat and straps trailing ' +
      'upward',
    'falling fast — legs extended down toward the ground, arms raised, bracing',
    'about to land — legs fully extended below, knees just starting to bend to absorb the impact, ' +
      'still clearly in the air',
  ],
});

/** The three anchor concepts. They differ in BUILD and SILHOUETTE, not in style or rendering. */
export const ANCHOR_CONCEPTS = Object.freeze({
  /**
   * The approved silhouette, made explicitly male.
   *
   * Round 1's courier read as androgynous and the user asked for a man. Exactly ONE thing moves
   * *(vault 4.10)*: the subject's sex is now stated four ways — noun, pronoun, jaw, stubble — with
   * the clothing, the goggles, the satchel and the arm brace left word for word as they were, since
   * those are what read well at 96 px. Two moving variables would make the next comparison
   * unattributable.
   */
  courier:
    'a young MAN, male, of slight athletic build. He has a squared masculine jaw, a straight brow ' +
    'and light stubble. Brass goggles with multiple stacked lenses and a cracked leather strap ' +
    'pushed up on the forehead over short dark hair. ' +
    // Detail density, named element by element. STYLE.md §6's whole finding is that this model
    // obeys a specifically named element and ignores a generic instruction — "highly detailed"
    // is a generic instruction. Round 2 read as under-decorated, so the ornamentation is now
    // enumerated rather than asked for. This does NOT contradict the locked RENDERING block
    // (vault 4.3); it is the same demand, made specific.
    'ORNAMENTATION, all of it visible: a riveted brass pauldron on one shoulder; a layered ' +
    'high collar over a buttoned waistcoat; a bandolier of small capped copper vials across the ' +
    'chest; a pocket watch on a brass chain looped to a waistcoat button; a wide leather belt ' +
    'with a heavy engraved brass buckle and three tool loops holding a spanner and calipers; a ' +
    'worn satchel with a scuffed flap, two brass catches and stitched repair patches; knee patches ' +
    'and elbow patches with visible stitching; frayed cuffs; a mechanical brace on the left ' +
    'forearm built from riveted brass plates, a small round pressure gauge with a visible needle, ' +
    'and two thin copper pipes running to a knuckle guard. ' +
    'Every metal surface shows patina, wear and individual rivets. Practical scuffed boots with ' +
    'buckled straps. A distinct male face with a visible expression.',
  engineer:
    'a heavy-set older engineer, broad shouldered, brass goggles pushed up on the forehead over ' +
    'grey cropped hair, a long weighted work coat with visible folds and stitching, thick leather ' +
    'straps and buckles, a compact riveted copper boiler carried high on the back with two short ' +
    'exhaust pipes over the shoulders, ornate metal fittings, and a heavy mechanical gauntlet on ' +
    'the right forearm. Heavy hobnailed boots. A distinct face with a visible expression.',
  aerialist:
    'a lean wiry aerialist, tall and narrow, brass goggles pushed up on the forehead over hair ' +
    'tied back, a close-fitting layered jacket with visible folds and stitching, a climbing ' +
    'harness of leather straps and buckles across the chest and thighs, a long trailing scarf, ' +
    'ornate metal fittings, and a spring-loaded grappling launcher strapped to the right forearm. ' +
    'Light laced boots. A distinct face with a visible expression.',

  /* ---------------------------------------------------------------- *
   * Phase 5's enemies. Both are 2 tiles or shorter against the player's 3.
   * ---------------------------------------------------------------- */

  /**
   * `brass-sentry` — the static turret. **2 tiles, 192 px drawn.**
   *
   * **Three splayed legs, not a pedestal, and that is a gate decision rather than a style one.**
   * G1 measures the vertical spread between ground-contact limbs; a single column returns ONE
   * component and G1 must then answer INDETERMINATE, which would leave this anchor ungated for
   * exactly the defect that cost $7 in Phase 4. A tripod gives the gate something to measure, and
   * it also reads as a machine that was *placed* rather than one that grew there.
   *
   * Cool metal against the scavenger's warm rust, so the two separate by colour as well as by the
   * 192/240 px silhouette difference — colour is the redundant channel here, not the primary one.
   */
  brassSentry:
    'a squat mechanical SENTRY TURRET, not a person, no face, waist-high and wider than it is ' +
    'tall. It stands on THREE splayed riveted brass legs whose feet all rest flat on the same ' +
    'level ground, evenly spaced, none raised. ' +
    'Above the legs a riveted brass drum housing with a hinged inspection plate, two small round ' +
    'pressure gauges with visible needles, and a single glass lens set in a brass ring on the ' +
    'front like a closed eye. ' +
    'ORNAMENTATION, all of it visible: a short stubby barrel projecting forward from the drum ' +
    'with a flared muzzle and three cooling fins; a coiled copper pipe running from the drum to ' +
    'the barrel; exposed cog teeth at the barrel pivot; a small hinged brass hatch with two ' +
    'wing nuts; heavy hexagonal bolts around the drum seam; a stencilled number plate. ' +
    'Cold blue-grey steel and tarnished brass, verdigris in the crevices, individual rivets on ' +
    'every plate. Weathered but intact and clearly still working.',

  /**
   * `rust-scavenger` — the patroller that chases. **2.5 tiles, 240 px drawn.**
   *
   * Hunched on purpose: it has to read as SHORTER than the player at a glance, and a hunched
   * quadruped-ish stance makes 240 px against 288 px unmistakable where an upright figure of the
   * same height would not be. Warm rust against the sentry's cold steel.
   *
   * Two legs, both planted, for the same G1 reason as the sentry.
   *
   * **"Hands clear of the ground" is a G1 requirement, not a style preference.** The first shoot
   * asked for *"long thin arms hanging toward the ground"* and got a knuckle-dragger whose
   * fingertips entered the ground band — so G1 counted FIVE contact limbs and measured the spread
   * between a hand and a foot, 104 px, rather than between the two feet. The gate was right and the
   * question was wrong. G1 assumes ground-contact components are what the subject stands on; any
   * subject that puts something else down there must say otherwise here. It is also better art
   * direction: fingers dangling at the floor smear across a walk cycle.
   */
  rustScavenger:
    'a hunched scrap-metal SCAVENGER creature, bipedal but stooped low with a forward-leaning ' +
    'posture, thin arms BENT AT THE ELBOW with both hands held up at hip height and well clear ' +
    'of the ground, clearly SHORTER and squatter than a human. It stands on TWO clawed ' +
    'mechanical feet, both flat on the same level ground, weight evenly on both, neither raised. ' +
    'ONLY the two feet touch the ground. ' +
    'Its head is a riveted iron bucket with a narrow horizontal slit and two small glowing ' +
    'amber lamps behind it. ' +
    'ORNAMENTATION, all of it visible: mismatched scavenged plates lashed over the torso with ' +
    'wire and leather cord; a bent exhaust stack on the back leaking a wisp of steam; exposed ' +
    'piston rods at both elbows; a heavy counterweight on a chain at the hip; three salvaged ' +
    'gears wired to the chest as makeshift armour; frayed rope bindings at the shoulders; ' +
    'individual rivets and bolt heads on every plate. ' +
    'Warm rust orange and oxidised copper, deep pitting and flaking corrosion, streaked with ' +
    'grime. Scavenged and improvised, never manufactured.',
});
