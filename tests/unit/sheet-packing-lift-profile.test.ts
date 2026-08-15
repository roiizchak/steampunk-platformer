/**
 * The shipped strips vs the committed lift profile — criteria 4.19 and 4.20.
 *
 * Split out of `sheet-packing.test.ts` on 2026-08-15 to bring it under the 400-line rule
 * (criterion 4.16 / 5.12). The suite docstring explaining what `packStrip` used to get wrong
 * lives there and governs these assertions too.
 */

import { describe, expect, it } from 'vitest';
import { readPng } from '../../tools/gen/png.mjs';
import liftProfile from '../../public/assets/config/lift-profile.json';
import bounds from '../../public/assets/config/character-bounds.json';
// Pixel-measurement helpers extracted to a sibling module when this file crossed 400 lines — DATA
import { centroidYOf, gapBelowFeet } from './sheet-packing-fixtures';
// and SETUP only, every `expect` stays here. See sheet-packing-fixtures.ts.

/**
 * The SHIPPED art, against the committed lift-profile manifest — criteria 4.19 and 4.20.
 *
 * This is the gate that would have caught the defect. The manifest carries the SOURCE coordinates
 * each frame was measured at, recorded before packing and committed because `_generated/` is
 * gitignored; the strips are the packed output. Two independent things, compared:
 *
 * 1. the manifest's own arithmetic is re-derived here rather than trusted, and
 * 2. the PNG's real gap below the feet must equal it, EXACTLY.
 *
 * Under the old per-frame anchoring every measured gap is 0 while the manifest still records the
 * real lift, so the regression is caught by construction rather than by a threshold.
 */
describe('shipped strips carry the source lift profile (4.19, 4.20)', () => {
  const SHEETS = 'public/assets/characters/brass-courier/sheets';
  const FRAME_WIDTH = bounds.frameWidth;
  const actions = Object.keys(liftProfile.animations) as (keyof typeof liftProfile.animations)[];
  const liftsOf = (a: string) =>
    liftProfile.animations[a as keyof typeof liftProfile.animations].frames.map((f) => f.liftPx);
  const maxLift = (a: string) => Math.max(...liftsOf(a));
  const minLift = (a: string) => Math.min(...liftsOf(a));


  it('covers every animation, so the gate cannot pass by measuring nothing', () => {
    // Insertion order, not sorted: `attack` joined in session 7 after the six that already
    // shipped, and `death` on 2026-08-14 after that — it could not pack at all until the cell was
    // widened 288 -> 336, and the player reported dying as a freeze because of it.
    expect(actions).toEqual(['idle', 'walk', 'run', 'jump', 'fall', 'hurt', 'attack', 'death']);
  });

  it.each(actions)('%s: liftPx is re-derivable from the recorded source coordinates', (action) => {
    /**
     * Re-derived here rather than trusted — and deliberately WITHOUT calling `frameLifts`, so the
     * packer's arithmetic is checked against an independent statement of the same rule rather than
     * against itself. The manifest records both landmarks for every frame, so either anchor can be
     * reconstructed from what is committed.
     */
    const anim = liftProfile.animations[action];
    expect(anim.frames.length).toBeGreaterThan(0);
    expect(['feet', 'centroid']).toContain(anim.anchor);

    /**
     * 🔴 `anim.scale`, NOT `liftProfile.scale`. Two actions carry a per-action override — `attack`
     * at 0.6 and `death` at 0.60504202, against the slug's 0.23723229 — and re-deriving those with
     * the slug figure is out by 2.55x. It went unnoticed while `attack` was the only override
     * because its lifts round to the same small integers either way; `death` landing on 2026-08-14
     * made it fail loudly.
     *
     * The profile records the scale each animation was PACKED at, per action, exactly so this is
     * re-derivable. Using it is not a loosening — it is the right number, and it makes this
     * assertion catch a per-action scale that disagrees with the strip it produced, which the slug
     * figure never could.
     */
    const scale = anim.scale;
    const deepest = Math.max(...anim.frames.map((f) => f.sourceMaxY));
    const rounded = anim.frames.map((f) =>
      Math.round(
        anim.anchor === 'feet'
          ? (deepest - f.sourceMaxY) * scale
          : // the centroid's offset INSIDE the figure, less the height the figure is placed by
            (f.sourceCentroidY - f.sourceMinY) * scale - f.drawnHeight,
      ),
    );
    const expected = rounded.map((v) => v - Math.min(...rounded));

    expect(anim.frames.map((f) => f.liftPx)).toEqual(expected);
    // Normalised, so the lowest-drawn frame rests on the contact line. If EVERY lift were zero the
    // pixel comparison below would hold vacuously against a per-frame-anchored strip.
    expect(Math.min(...anim.frames.map((f) => f.liftPx))).toBe(0);
  });

  it.each(actions)('%s: the drawn gap below the feet matches the manifest exactly', (action) => {
    const anim = liftProfile.animations[action];
    const strip = readPng(`${SHEETS}/${action}.png`);
    expect(strip.width).toBe(FRAME_WIDTH * anim.frames.length);
    const measured = anim.frames.map((f) => gapBelowFeet(strip, f.index, FRAME_WIDTH));
    expect(measured).toEqual(anim.frames.map((f) => f.liftPx));
  });

  it('each animation uses the anchor its config declares', () => {
    // The anchor is a decision, not an accident, so the manifest records it and this pins the two
    // together. `centroid` on a grounded animation would silently unmoor it from the floor.
    //
    // Scoped to `actions` (what actually SHIPPED, i.e. `liftProfile.animations`' own keys) rather
    // than every key `bounds.animations` declares. `death` was the reason for that scoping — it had
    // a config declaration from session 7 and no packed sheet — and as of 2026-08-14 it ships, so
    // the two sets now coincide. The scoping stays: it is the right rule whenever they next differ.
    const declared = Object.fromEntries(
      actions.map((a) => [a, bounds.animations[a as keyof typeof bounds.animations].verticalAnchor]),
    );
    const used = Object.fromEntries(actions.map((a) => [a, liftProfile.animations[a].anchor]));
    expect(used).toEqual(declared);
    expect(declared).toEqual({
      idle: 'feet',
      walk: 'feet',
      run: 'feet',
      jump: 'centroid',
      fall: 'centroid',
      // Session 6. A struck courier recoils but stays on its feet — the recoil peaks around 20% and
      // the boots never leave the floor, so `feet`, like the other grounded animations. `centroid`
      // here would unmoor it from the ground for the 18 ticks it is drawn.
      hurt: 'feet',
      // Session 7: the swing stays upright throughout (2.1% frame-to-frame height spread) — grounded,
      // like every other combat action so far.
      attack: 'feet',
      // Session 10, and the one place `feet` needs justifying rather than assuming. A death is the
      // one animation where the figure genuinely LEAVES its feet — the courier falls sideways, and
      // by the last frames the body is 312px wide against a standing 133. `feet` is still right:
      // the anchor pins the DEEPEST frame to the contact line, and a fallen body's deepest point is
      // still the ground it is lying on. `centroid` would float the corpse as the silhouette
      // flattened, which is the airborne rule applied to a body that has stopped moving.
      death: 'feet',
    });
  });

  it('grounded animations keep the lift the model drew (4.20)', () => {
    // These are feet-anchored, so the lift IS the flight phase and the lifting boot. A regression
    // to per-frame anchoring flattens every one of them to 0.
    expect(maxLift('run')).toBeGreaterThanOrEqual(10); // a real flight phase
    expect(maxLift('walk')).toBeGreaterThanOrEqual(3); // the trailing boot
    expect(maxLift('idle')).toBeLessThanOrEqual(2); // ...and a planted stance stays planted
  });

  /**
   * `idle` is EXPECTED to be flat, and that is a hole this test closes rather than ignores.
   *
   * Criterion 4.20 reads "the deepest frame reaches the final cell row, and at least one other
   * frame does not". On the shipped art every one of idle's twelve frames measures a lift of 0, so
   * the second half is literally false for it — correctly, because the courier breathes without
   * lifting a boot and the model drew exactly that.
   *
   * The consequence is the part worth testing: **a regression to per-frame anchoring is
   * indistinguishable from correct behaviour inside `idle`**, because both produce a flat sheet.
   * So 4.20's discriminating half is asserted per animation, on the four animations whose art does
   * leave the ground, and idle's flatness is asserted as a deliberate expectation instead of being
   * quietly exempt.
   *
   * Raised by the `voltagent-qa-sec:qa-expert` gate owner, brief 1, finding 5. Nothing previously
   * asserted a non-zero lift on `jump` or `fall` at all — they happened to be right.
   */
  it('every animation that leaves the ground has a frame that does not touch the floor (4.20)', () => {
    for (const action of ['walk', 'run', 'jump', 'fall'] as const) {
      expect(maxLift(action), `${action} packed flat — the per-sheet baseline is gone`).toBeGreaterThan(0);
    }
    // ...and the deepest frame of every animation, idle included, still reaches the final row.
    for (const action of ['idle', 'walk', 'run', 'jump', 'fall', 'hurt'] as const) {
      expect(minLift(action), `${action} never reaches its cell floor`).toBe(0);
    }
    // idle is flat BY DESIGN, stated so a future reader does not "fix" it into a bob.
    expect(maxLift('idle')).toBe(0);
  });

  it('airborne animations hold the body still — measured on the DRAWN pixels', () => {
    /**
     * The property centroid anchoring exists to produce, asserted where it is actually visible.
     *
     * A first version of this bounded `liftPx` instead and had to be thrown away: under the
     * `centroid` anchor `liftPx` is the CORRECTION applied, not the residual left behind, so
     * bounding it bounds how much unwanted translation the clip contained — a fact about the model's
     * obedience, not about the sheet. It duly went red when a better clip that happened to drift
     * more was packed correctly. Vault **4.19** again: name the axis your metric measures.
     *
     * What matters is the OUTPUT: the sim's `stepVertical` supplies altitude, so the drawn figure's
     * centre of mass must sit at the same height in every frame. Feet-anchoring the same sheets
     * scattered it by 40-70 px, which is the hitch mid-jump and mid-fall.
     */
    for (const action of ['jump', 'fall'] as const) {
      const anim = liftProfile.animations[action];
      expect(anim.anchor).toBe('centroid');
      const strip = readPng(`${SHEETS}/${action}.png`);
      const centres = anim.frames.map((f) => centroidYOf(strip, f.index, FRAME_WIDTH));
      const spread = Math.max(...centres) - Math.min(...centres);
      expect(spread).toBeLessThanOrEqual(2); // rounding only
    }
  });

  it('...and the grounded ones deliberately do NOT hold it still (C2: this can go red)', () => {
    // The anti-vacuity partner. If the assertion above passed for every sheet it would be measuring
    // nothing — a feet-anchored locomotion cycle must move its centre of mass, because that IS the
    // bob and the flight phase.
    const strip = readPng(`${SHEETS}/run.png`);
    const centres = liftProfile.animations.run.frames.map((f) =>
      centroidYOf(strip, f.index, FRAME_WIDTH),
    );
    expect(Math.max(...centres) - Math.min(...centres)).toBeGreaterThan(2);
  });
});
