/**
 * **The plate's ink, and why every number here has a measurement behind it.**
 *
 * Split from `touch-draw-path.test.ts` at the 400-line ceiling. These cases are about APPEARANCE —
 * what a thumb can see through and what a reader can pick out — while the file they left is about
 * what the layer draws and wires. `touchMarks.ts` is the production seam that matches.
 */

import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import { TOUCH_IDS } from '../../src/render/touchLayout';
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
    expect(plate(), 'the pressed plate hides the level under the thumb').toBeLessThan(0.9);
    scene.releasePointer(1);
    expect(plate(), 'the plate stayed lit after the finger left').toBe(atRest);
  });

  it('draws the marks OPAQUE, which is what pays for the legibility the plate no longer does', () => {
    const { scene } = live();
    const marks = scene.faces.filter((f) => f.strokeWidth === 0);
    expect(marks.length, 'no marks were drawn at all').toBeGreaterThan(TOUCH_IDS.length);
    for (const mark of marks) expect(mark.alpha).toBe(1);
  });
});
