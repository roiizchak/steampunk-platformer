/**
 * **The plate's ink, and why every number here has a measurement behind it.**
 *
 * Split from `touch-draw-path.test.ts` at the 400-line ceiling. These cases are about APPEARANCE —
 * what a thumb can see through and what a reader can pick out — while the file they left is about
 * what the layer draws and wires. `touchMarks.ts` is the production seam that matches.
 */

import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { touchLayout, TOUCH_BOX_PX, TOUCH_IDS } from '../../src/render/touchLayout';
import { ART_ALPHA, PLATE_ALPHA } from '../../src/scenes/touchMarks';
import { TouchControlsLayer } from '../../src/scenes/touchControlsLayer';
import { makeTouchScene } from './touchSceneFake';

/** A layer that has been created and bound, on a touch device, with the game running. */
function live() {
  const scene = makeTouchScene();
  const layer = new TouchControlsLayer(scene.scene, true);
  scene.readHeld = () => layer.held();
  layer.create();
  layer.bind({
    input$: createSnapshot(),
    gameScene: scene.gameScene,
    isGameRunning: () => scene.gameStatusRunning,
    isPlayerInputEnabled: () => scene.playerInputEnabled,
    openLevelSelect: () => {
      scene.levelSelectOpened += 1;
    },
  });
  layer.refresh();
  return { scene, layer };
}

describe('the plate stays translucent, because the level is behind it', () => {
  /**
   * 🔴 A number with a measurement behind it, pinned so the measurement cannot be quietly undone.
   *
   * The contrast repair briefly raised `PLATE_ALPHA` from 0.55 to 0.86 to make the fill a fill. The
   * UI/UX gate then measured what that costs from the shipped level data — the player standing on
   * every solid surface in all five `.tmj` files, sampled every 96 px — and found **175 of 878
   * positions (19.9 %) have a hazard, an enemy or the goal drawn under a control plate.** A
   * `brass-sentry` that is actively shooting sits behind the pause plate for nine consecutive
   * positions on level-01; on level-04 the goal sits under the jump plate for nine more.
   *
   * At 0.55 that content is dim and readable. At 0.86 it is gone, and a player who dies to a spike
   * they could not see under their own thumb reads it as the game cheating. The contrast the repair
   * was for is carried by the keyline and the marks' two inks instead — both opaque, and both
   * covering a small fraction of the plate.
   *
   * Without this gate, raising the alpha back reddens nothing (mutation M21).
   */
  it('draws every plate see-through, so the world under a thumb is still readable', () => {
    const { scene } = live();
    const plates = scene.faces.filter((f) => f.strokeWidth > 0);
    expect(plates, 'no plate was found by its keyline — this gate is measuring nothing').toHaveLength(
      TOUCH_IDS.length,
    );
    for (const plate of plates) {
      expect(
        plate.alpha,
        `the ${plate.id} plate is ${plate.alpha} opaque — the level behind it is hidden, and 19.9 % ` +
          'of standing positions have a hazard, an enemy or the goal back there',
      ).toBeLessThan(0.7);
      expect(plate.alpha, 'a fully transparent plate is not a control').toBeGreaterThan(0.2);
    }
  });

  it('keeps the plate see-through WHILE PRESSED, which is when the player is moving through it', () => {
    // 🔴 The pressed state was fully opaque, and the Codex implementation review caught what that
    // undid: the whole reason the resting alpha is 0.55 is that 19.9 % of standing positions have a
    // hazard, an enemy or the goal behind a plate — and an opaque pressed state hides exactly that
    // content at exactly the moment the player is running through it.
    const { scene } = live();
    const plate = (): number => scene.faces.filter((f) => f.strokeWidth > 0 && f.id === 'right')[0].alpha;
    const atRest = plate();
    scene.press('right', 1);
    expect(plate(), 'the plate does not answer a thumb at all').toBeGreaterThan(atRest);
    // 🔴 The bound stands on a PINNED measurement, not on the live production value. The Codex
    // round-3 review caught the second version deriving its bound from `atRest` — an active oracle,
    // so `PLATE_ALPHA = 0.69` with a pressed 0.80 satisfied it while neither number had ever been
    // measured. `MEASURED_RESTING` is the value § 12.14's occlusion sweep actually cleared, written
    // down here so the resting alpha cannot move the pressed bound with it.
    //
    // ⚠️ **60 % is a stated margin, not a measurement, and saying so is the point.** The two
    // measured anchors are 0.55 (content dim but readable) and 0.86 (content gone). Nothing was
    // measured between them, so the rule is: keep at least 60 % of the residual transparency the
    // readable value had. That refuses 0.86 and 0.78 alike, and it is honest about which half of it
    // is evidence.
    const MEASURED_RESTING = 0.55;
    const RESIDUAL_SHARE = 0.6;
    expect(atRest, 'the resting alpha moved away from the measured value the bound stands on').toBe(
      MEASURED_RESTING,
    );
    const floor = RESIDUAL_SHARE * (1 - MEASURED_RESTING);
    expect(
      1 - plate(),
      `the pressed plate leaves ${(1 - plate()).toFixed(2)} of the level visible against ` +
        `${floor.toFixed(3)} required — 0.86 was measured to erase it`,
    ).toBeGreaterThanOrEqual(floor);
    scene.releasePointer(1);
    expect(plate(), 'the plate stayed lit after the finger left').toBe(atRest);
  });

  it('stays lit while a SECOND finger is still on the plate', () => {
    // 🔴 The Codex re-review: `onRelease` set the plate back to rest on any release, while
    // `touchContacts` went on correctly reporting the action held by the other finger. The player
    // saw an unpressed button that was still driving the sim — the contact-identity defect this
    // phase gated on the sim side, reappearing on the side they can see.
    const { scene } = live();
    const plate = (): number => scene.faces.filter((f) => f.strokeWidth > 0 && f.id === 'right')[0].alpha;
    const atRest = plate();
    scene.press('right', 1);
    scene.press('right', 2);
    const lit = plate();
    expect(lit, 'the plate never lit at all — this gate proves nothing').toBeGreaterThan(atRest);
    scene.releasePointer(1);
    expect(plate(), 'the plate went dark while a finger was still holding the control').toBe(lit);
    scene.releasePointer(2);
    expect(plate(), 'the plate stayed lit after the last finger left').toBe(atRest);
  });

  it('draws the marks OPAQUE, which is what pays for the legibility the plate no longer does', () => {
    const { scene } = live();
    const marks = scene.faces.filter((f) => f.strokeWidth === 0);
    expect(marks.length, 'no marks were drawn at all').toBeGreaterThan(TOUCH_IDS.length);
    for (const mark of marks) expect(mark.alpha).toBe(1);
  });
});

describe('the generated faces, once the plate is cut', () => {
  /** The same layer, with the six brass faces present in the texture manager. */
  function withArt(view?: { width: number; height: number }) {
    const scene = makeTouchScene({ art: true });
    // The view is set BEFORE create() when one is given, so the first draw is the one measured.
    if (view) {
      scene.scene.scale.gameSize.width = view.width;
      scene.scene.scale.gameSize.height = view.height;
    }
    const layer = new TouchControlsLayer(scene.scene, true);
    scene.readHeld = () => layer.held();
    layer.create();
    layer.bind({
      input$: createSnapshot(),
      gameScene: scene.gameScene,
      isGameRunning: () => scene.gameStatusRunning,
      isPlayerInputEnabled: () => scene.playerInputEnabled,
      openLevelSelect: () => {
        scene.levelSelectOpened += 1;
      },
    });
    layer.refresh();
    return { scene, layer };
  }

  it('draws ONE image per control, from that control’s own key', () => {
    const { scene } = withArt();
    const art = scene.faces.filter((f) => f.textureKey !== '');
    expect(art.map((f) => f.textureKey).sort(), 'a control took the wrong face, or none').toEqual(
      TOUCH_IDS.map((id) => `touch-${id}`).sort(),
    );
    // 🔴 And the mapping is per CONTROL, not just per key: a build that loaded all six and hung
    // them on the wrong plates satisfies the assertion above and puts a gear on the jump button.
    for (const face of art) expect(face.textureKey).toBe(`touch-${face.id}`);
    // Nothing drawn beside them — the art path replaces the grey box, it does not sit under it.
    expect(scene.faces.length, 'the drawn plate is still there under the art').toBe(TOUCH_IDS.length);
  });

  it('gives the art the SAME translucency the drawn plate was measured at', () => {
    // 🔴 The 19.9 % occlusion measurement is about a thumb-sized opaque disc over the level. That
    // is a property of the BOX, not of what is drawn in it, so adopting art may not quietly undo it.
    // ⚠️ `< 0.7` was a BOUND, and a bound admits a drift the measurement never sanctioned:
    // 0.69 satisfies it while no one has ever looked through a 0.69 plate at a spike. Codex
    // round-6 pinned the exact value; round-7 then found that ONE flat alpha cannot be both
    // see-through and readable — faded flat at 0.55, the best ink reached 2.43-2.47:1 against
    // WCAG's 3:1.
    //
    // 🔴 So the number moved but the guarantee did not. `buildTouchAtlas.mjs` fades only the
    // brass, by `PLATE_ALPHA / ART_ALPHA`, and the face is drawn at `ART_ALPHA` — which multiplies
    // back to exactly 0.55 on the plate while leaving the ink at 0.85. This asserts the arithmetic
    // and the drawn half; `shipped-touch.test.ts` asserts the other half on the real bytes, where
    // the baked value actually is. A fake scene has no pixels and cannot be asked.
    const { scene, layer } = withArt();
    const face = (id: string) => scene.faces.filter((f) => f.id === id)[0];
    expect(ART_ALPHA * (PLATE_ALPHA / ART_ALPHA), 'the two halves stopped multiplying to 0.55').toBeCloseTo(
      PLATE_ALPHA,
      6,
    );
    for (const id of TOUCH_IDS) {
      expect(
        face(id).alpha,
        `the ${id} face rests at ${face(id).alpha}, not at ART_ALPHA`,
      ).toBe(ART_ALPHA);
    }
    // And the pressed state still answers a thumb, through the same one code path.
    const rest = face('right').alpha;
    scene.press('right', 1);
    expect(face('right').alpha, 'the art does not answer a thumb at all').toBeGreaterThan(rest);
    scene.releasePointer(1);
    expect(face('right').alpha).toBe(rest);
    layer.destroy();
  });

  it('sizes each face to the box touchLayout chose, not to the source PNG', () => {
    // The layout scales off the VIEW; a face left at its 160 px source size would be right only at
    // 1920 x 1080 and wrong on every phone the moment the design size ever moves.
    const { scene } = withArt();
    const boxes = touchLayout(GAME_WIDTH, GAME_HEIGHT);
    for (const box of boxes) {
      const face = scene.faces.filter((f) => f.id === box.id)[0];
      expect([face.w, face.h], `the ${box.id} face is not the size of its box`).toEqual([box.w, box.h]);
    }
  });

  it('sizes each face on the FIRST draw, at a view that is not the design size', () => {
    // 🔴 The case above cannot fail at 1920 x 1080: the box is 160 there, which is exactly
    // the source PNG's size, so `setDisplaySize` deleting reddens nothing — measured, M39 went
    // GREEN. A phone is never at the design size, and this is the only case that says so.
    const { scene } = withArt({ width: GAME_WIDTH / 2, height: GAME_HEIGHT / 2 });
    const boxes = touchLayout(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    for (const box of boxes) {
      const face = scene.faces.filter((f) => f.id === box.id)[0]!;
      expect(
        [face.w, face.h],
        `the ${box.id} face drew at its source size, not at the box the layout chose`,
      ).toEqual([box.w, box.h]);
    }
  });

  it('RE-sizes each face when the view changes, not only when it is first drawn', () => {
    // 🔴 At the design size the box IS 160 — the source size — so the case above passes
    // whether `refresh()` re-sizes anything or not, and M39 reddened it only because the fake
    // reported 0 x 0. Codex round-6. Half the view halves every box, and a face that keeps its
    // source size is then twice the target it sits in: it swallows its neighbour's gap.
    const { scene, layer } = withArt();
    scene.scene.scale.gameSize.width = GAME_WIDTH / 2;
    scene.scene.scale.gameSize.height = GAME_HEIGHT / 2;
    layer.refresh();

    const boxes = touchLayout(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    expect(boxes[0]!.w, 'the halved view did not halve the box, so this proves nothing').toBe(
      TOUCH_BOX_PX / 2,
    );
    for (const box of boxes) {
      const face = scene.faces.filter((f) => f.id === box.id)[0]!;
      expect([face.w, face.h], `the ${box.id} face kept its old size across a resize`).toEqual([
        box.w,
        box.h,
      ]);
    }
    layer.destroy();
  });
});

