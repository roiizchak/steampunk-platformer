import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { TOUCH_BOX_PX, TOUCH_MIN_CSS_PX } from '../../src/render/touchLayout';
import { RotatePrompt } from '../../src/scenes/rotatePrompt';
import { makeTouchScene, type TouchSceneHarness } from './touchSceneFake';

/**
 * **The one viewport the controls cannot be made to fit.**
 *
 * `Phaser.Scale.FIT` holds the backing store at 1920x1080 at every viewport and DPR — only the CSS
 * size changes (`docs/ENGINE-NOTES.md:305-331`, measured). So a control's real size is
 * `gamePx * canvasCssWidth / 1920`, and on a phone held upright that is:
 *
 * | viewport | canvas CSS | scale | a 160 px button is |
 * |---|---|---|---|
 * | iPhone 14 portrait 390x844 | 390x219 | 0.203 | **32.5 CSS px** |
 * | Pixel 7 portrait 412x892 | 412x232 | 0.215 | 34.3 CSS px |
 *
 * against the 44 px floor from `ui-ux-pro-max`'s `ux-guidelines.csv` (Touch/Touch Target Size,
 * severity High). There is no button size that fixes it: the canvas is only 219 px tall, so a
 * thumb-sized control eats a third of the visible game.
 *
 * ## Why the prompt is not just a picture
 *
 * 🔴 `!touchTargetsFit` is part of the DISABLE predicate too, not only the draw predicate — that is
 * `touchControlsLayer`'s job and `touch-draw-path.test.ts` proves it. If it were only a draw
 * decision, the five hit areas would stay live *underneath* this overlay on a running,
 * input-enabled game, and a tap meant for "turn your phone" would move, jump or attack instead.
 * The two files share one predicate rather than agreeing on two.
 */

const PORTRAIT_CSS_WIDTH = 390;

function fitsAt(cssWidth: number): boolean {
  return (TOUCH_BOX_PX * cssWidth) / GAME_WIDTH >= TOUCH_MIN_CSS_PX;
}

function scene(cssWidth = GAME_WIDTH): TouchSceneHarness {
  const h = makeTouchScene();
  h.scene.scale.displaySize = { width: cssWidth, height: (cssWidth * GAME_HEIGHT) / GAME_WIDTH };
  return h;
}

function live(h: TouchSceneHarness, isTouchDevice = true): RotatePrompt {
  const prompt = new RotatePrompt(h.scene, isTouchDevice);
  prompt.create();
  prompt.refresh();
  return prompt;
}

describe('RotatePrompt', () => {
  it('agrees with the measurement it is built on', () => {
    // Guards the fixtures themselves: if either figure moved, the cases below would silently stop
    // testing the two sides of the boundary.
    expect(fitsAt(PORTRAIT_CSS_WIDTH), 'phone portrait should NOT fit').toBe(false);
    expect(fitsAt(GAME_WIDTH), 'a full-size view should fit').toBe(true);
  });

  it('draws nothing at all on a device with no touch', () => {
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h, false);
    expect(h.faces, 'a desktop was shown a rotate prompt').toEqual([]);
    expect(prompt.showing).toBe(false);
  });

  it('stays hidden on a touch device whose controls fit', () => {
    const h = scene(GAME_WIDTH);
    const prompt = live(h);
    expect(prompt.showing).toBe(false);
    expect(h.faces.length, 'the prompt was never built, so it can never be shown').toBeGreaterThan(0);
    for (const f of h.faces) expect(f.visible, 'the prompt is up on a viewport that fits').toBe(false);
  });

  it('shows when a control would fall under the 44 CSS px floor', () => {
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    expect(prompt.showing).toBe(true);
    for (const f of h.faces) expect(f.visible, 'part of the prompt is invisible').toBe(true);
  });

  it('covers the whole view, so nothing behind it can be aimed at', () => {
    const h = scene(PORTRAIT_CSS_WIDTH);
    live(h);
    const scrim = h.faces.find((f) => f.w >= GAME_WIDTH && f.h >= GAME_HEIGHT);
    expect(scrim, 'no face covers the view — the game shows through the prompt').toBeDefined();
  });

  it('follows the view rather than the size it was built at', () => {
    // A phone rotated to landscape must clear the prompt without a reload, and back again.
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    expect(prompt.showing).toBe(true);

    h.scene.scale.displaySize = { width: 667, height: 375 };
    prompt.refresh();
    expect(prompt.showing, 'landscape still shows the prompt').toBe(false);

    h.scene.scale.displaySize = { width: PORTRAIT_CSS_WIDTH, height: 844 };
    prompt.refresh();
    expect(prompt.showing, 'back to portrait and the prompt did not return').toBe(true);
  });

  it('re-places itself when the design size changes, not only when the CSS size does', () => {
    const h = scene(PORTRAIT_CSS_WIDTH);
    live(h);
    h.scene.scale.gameSize = { width: GAME_WIDTH / 2, height: GAME_HEIGHT / 2 };
    const prompt = new RotatePrompt(h.scene, true);
    prompt.create();
    prompt.refresh();
    const scrim = h.faces.filter((f) => f.w >= GAME_WIDTH / 2 && f.h >= GAME_HEIGHT / 2);
    expect(scrim.length, 'the scrim is sized from a literal, not from the live view').toBeGreaterThan(0);
  });

  it('destroys every object it made', () => {
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    prompt.destroy();
    for (const f of h.faces) expect(f.destroyed, 'a prompt object outlived the prompt').toBe(true);
    expect(prompt.showing).toBe(false);
  });
});
