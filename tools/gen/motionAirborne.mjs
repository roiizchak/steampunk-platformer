/**
 * The two AIRBORNE motions — `jump` and `fall` — and the clause they share.
 *
 * Split out of `motion.mjs` on 2026-08-15 to bring it under the 400-line rule (criterion
 * 4.16 / 5.12). `motion.mjs` spreads `AIRBORNE_MOTIONS` into `VIDEO_MOTIONS` exactly as it
 * already spreads `COMBAT_MOTIONS`.
 *
 * 🔴 **This file is a LEAF and must stay one: it imports nothing from `motion.mjs`.** That is why
 * `UPRIGHT_IN_AIR` moved here with its two consumers rather than being imported back. The failure
 * mode of a cycle in this module graph is not a crash — it is a SILENTLY truncated `VIDEO_MOTIONS`,
 * which is the hazard `motionCombat.mjs` records paying for.
 */

import { FRAME_MARGIN } from './motionClauses.mjs';
/**
 * Appended to the two AIRBORNE motions in place of `SPAN_CLIP`, which contradicts them.
 *
 * Names the axis that must hold rather than forbidding the failure. "Do not somersault" is negation,
 * which this model weakens rather than obeys *(STYLE.md §6)*; "head stays above his boots, spine
 * vertical" is geometry it can only satisfy one way. The second half removes the ground from the
 * frame entirely, because a figure implied to be *above* something grows a shadow for it — the first
 * jump and fall clips both drew one under boots that were nowhere near a floor.
 *
 * ## A monotonicity clause was tried here, and it cost a generation. Do not re-add it.
 *
 * Both one-shot clips come back NON-MONOTONIC: measured as source figure height across the six
 * sampled frames, `jump` went 1190, 982, 908, 1077, 1074, 982 — compress, open, compress again —
 * and `fall` went 1210, 1090, 834, **796**, 966, 1204, upright into a 66 %-of-standing cannonball
 * and back. So `SPAN_CLIP`'s *"at every instant the body is at a different position from every other
 * instant"* was borrowed, minus its *"extending then returning"* half, together with a sentence
 * naming ONE DIRECTION ONLY and forbidding a return to any pose already passed.
 *
 * **Regenerated with it, the jump SOMERSAULTED — frame 4 fully inverted, boots above his head — and
 * the fall pitched to horizontal.** The same paragraph already said, in the very next sentence, that
 * he *"does not rotate, does not tip over, does not go horizontal, does not turn upside down and
 * does not somersault"*. The model resolved "keep changing, never come back" the only way that is
 * geometrically monotonic — by rotating — and it did so straight through five explicit negations.
 *
 * That is this model's documented behaviour arriving from a new direction *(STYLE.md §6)*: a NAMED
 * element beats a negation, so adding a positive instruction that conflicts with a prohibition does
 * not balance it, it overrides it. It is also the rule `motion.mjs` already carried — *never
 * contradict your own prompt, the model resolves it by maximising* — and the clause was written
 * without noticing it contradicted the paragraph it was being added to.
 *
 * A sentence naming the opening frame (*"the motion has ALREADY BEGUN in the very first frame"*)
 * went in at the same time and did not work either: the regenerated `jump` still opens on a standing
 * pose, and `motionOnset` moved from frame 5 to frame 15 — later, not earlier.
 *
 * Both are reverted. The non-monotonic middle is a real defect and is still open; the fix is NOT a
 * stronger instruction in this paragraph.
 */
const UPRIGHT_IN_AIR = `

CONSTRAINTS. Every line is absolute.
He is airborne for the entire clip. He never stands, never lands, never touches anything.
He stays UPRIGHT: head above his boots, spine straight up and down.
Strict side profile, facing RIGHT, for every frame.
No rotation. No tipping. No leaning past upright.
He never goes horizontal. He never turns upside down. He never somersaults. He never tumbles.
He HANGS IN ONE PLACE. His body does not travel up, down, left or right in the frame at any moment.
Only his arms and legs move. His head and torso stay at the same height in the frame throughout.
There is no ground, no floor, no surface and no horizon anywhere in the frame, not even far below him.
Nothing casts a shadow. The flat chroma green continues past every edge of the frame.
His whole body is in frame at every moment, from the top of his hair to the soles of his boots.
There is plain green above his head and plain green below his boots in every frame.
No part of him is ever cut off by the top, bottom, left or right edge.
Locked camera. No zoom. No pan. No dolly. No camera movement of any kind.`;

export const AIRBORNE_MOTIONS = Object.freeze({
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
    airborne: true,
    frames: 6,
    motion:
      'is airborne, caught in the middle of a leap.\n' +
      '\n' +
      'POSE. Three fixed points, and he passes smoothly and evenly between them:\n' +
      'AT THE FIRST MOMENT — both knees are drawn up under his chest, boots tucked close beneath ' +
      'him, arms held low and close to his body. He is compressed and small.\n' +
      'AT THE HALFWAY POINT — exactly halfway between the two shapes: the leading knee has dropped ' +
      'to about hip height, the trailing leg reaches down and back below him, both arms are out ' +
      'from his sides at about shoulder height.\n' +
      'AT THE LAST MOMENT — he is stretched out at full extension: the leading leg reaching down ' +
      'and forward, the trailing leg reaching down and back, both arms swung up and outward. He is ' +
      'open and tall.\n' +
      'He is at a different point along that path in every frame, and he never doubles back toward ' +
      'a shape he has already passed through.' +
      `${UPRIGHT_IN_AIR}`,
  },
  fall: {
    cyclic: false,
    airborne: true,
    /**
     * 🔴 6 → 8 corrected a DESYNC: this said 6 while the extracted strip held 8 cells and the
     * catalog shipped 8, because `assets:build` packs the strip and never reads this file.
     *
     * ✅ **8 → 9 on 2026-08-15, and this is the number that closes the judder.** 8 does not divide
     * the 18-tick fall, so the sheet dwelt unevenly — some cells held two ticks and some three, and
     * that is what reads as a stutter. 9 gives a flat **2 ticks per frame**. It was blocked on the
     * art because re-extracting the OLD clip at any count still failed G6; `fall-r2.mp4` is the
     * re-shoot that unblocks it, so the count and the clip move together in one commit.
     *
     * ⚠️ **Order is forced and not a style choice.** `build-clips.mjs` reads `frames` to decide the
     * sample count, so it must be 9 before `assets:clips` runs — but bumping it while
     * `BLOCKED_ON_ART` still lists the key turns `one-shot-divisor.test.ts` red on the spot. Shoot →
     * adopt → 9 → `assets:clips` → `assets:build` → empty `BLOCKED_ON_ART`, all one commit.
     */
    frames: 9,
    motion:
      'is airborne, caught in the middle of a fall.\n' +
      '\n' +
      'POSE. Three fixed points, and he passes smoothly and evenly between them:\n' +
      'AT THE FIRST MOMENT — he is stretched out and open: both legs trailing behind and below him, ' +
      'both arms out wide from his sides.\n' +
      'AT THE HALFWAY POINT — exactly halfway between the two shapes: the knees have come forward ' +
      'to about hip height, the boots are swinging beneath him, the arms are drawn halfway in ' +
      'towards his sides.\n' +
      'AT THE LAST MOMENT — he is gathered and set to land: both knees bent in front of him, both ' +
      'boots directly below his hips, both arms drawn down and in close to his sides.\n' +
      'He is at a different point along that path in every frame, and he never doubles back toward ' +
      'a shape he has already passed through.' +
      /**
       * 🔴 Added 2026-08-15 for the re-shoot, and **it is NOT redundant with `UPRIGHT_IN_AIR`.**
       *
       * That tail already says *"No part of him is ever cut off by the top, bottom, left or right
       * edge"* — and `fall` was cut on the left and the right anyway. The difference is the one
       * STYLE.md §6 keeps charging this project for: that sentence is a **negation**, which this
       * model weakens rather than obeys, and it names no width the model can measure itself
       * against. `FRAME_MARGIN` is the positive ruler — *the middle 70% of the frame width* — and it
       * is the clause both courier clips that PASS G6 carry.
       *
       * It sits BEFORE the tail deliberately. `UPRIGHT_IN_AIR` must stay whole and stay last: two
       * generations were paid to learn that inserting into that paragraph makes him somersault.
       *
       * ⚠️ **One record, not the shared clause.** Putting this inside `UPRIGHT_IN_AIR` would change
       * `jump`'s prompt too, for a shoot nobody approved and no budget covers.
       */
      `${FRAME_MARGIN}` +
      `${UPRIGHT_IN_AIR}`,
  },
});
