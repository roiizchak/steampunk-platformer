import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { TOUCH_BOX_PX, TOUCH_MIN_CSS_PX } from '../../src/render/touchLayout';
import { fitCanvasCssWidth, rotateOverlayWanted } from '../../src/render/rotateOverlay';
import { RotatePrompt, type RotateHost } from '../../src/scenes/rotatePrompt';

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
 * ## 🔴 Every case below was rewritten after the owner found the defects by hand — twice
 *
 * The prompt was a Phaser scrim and two `Text` objects, and this file's cases all passed while the
 * thing was broken on a real phone in two independent ways. Both were properties of the DRAWING, and
 * this file could only see the decision. It now drives the decision from a fake VIEWPORT, which is
 * the input that was wrong, and `phase-12-touch.spec.ts` measures the overlay on a real page.
 */

const PHONE_PORTRAIT = { width: 390, height: 844 };
const PHONE_LANDSCAPE = { width: 844, height: 390 };

function fitsAt(cssWidth: number): boolean {
  return (TOUCH_BOX_PX * cssWidth) / GAME_WIDTH >= TOUCH_MIN_CSS_PX;
}

/** A page whose viewport the test moves, and whose class the test reads. */
function fakeHost(width: number, height: number): RotateHost & { shown: boolean; toggles: number } {
  return {
    innerWidth: width,
    innerHeight: height,
    shown: false,
    toggles: 0,
    isShown() {
      return this.shown;
    },
    setShown(shown: boolean) {
      this.shown = shown;
      this.toggles += 1;
    },
  };
}

describe('the viewport arithmetic the decision rests on', () => {
  it('agrees with the measurement it is built on', () => {
    // Guards the fixtures themselves: if either figure moved, the cases below would silently stop
    // testing the two sides of the boundary.
    expect(fitsAt(PHONE_PORTRAIT.width), 'phone portrait should NOT fit').toBe(false);
    expect(fitsAt(GAME_WIDTH), 'a full-size view should fit').toBe(true);
  });

  it('derives the canvas width FIT will produce, from the raw viewport', () => {
    // Portrait is width-bound; landscape is height-bound, and that is the whole reason turning the
    // phone helps at all — 390 px of height buys a 693 px canvas where 390 px of width buys 390.
    expect(fitCanvasCssWidth(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height)).toBe(390);
    expect(fitCanvasCssWidth(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height)).toBe(693);
    expect(fitCanvasCssWidth(0, 100), 'a collapsed viewport is not a decision').toBe(0);
    expect(fitCanvasCssWidth(100, 0)).toBe(0);
  });

  it('wants the overlay in portrait, and not in landscape', () => {
    expect(rotateOverlayWanted(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height, true)).toBe(true);
    expect(rotateOverlayWanted(PHONE_LANDSCAPE.width, PHONE_LANDSCAPE.height, true)).toBe(false);
    expect(rotateOverlayWanted(GAME_WIDTH, GAME_HEIGHT, true)).toBe(false);
  });

  it('never wants it on a device with no touch', () => {
    // A desktop window narrow enough to trip the threshold has a keyboard, and telling a keyboard
    // player to rotate their monitor is worse than saying nothing.
    expect(rotateOverlayWanted(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height, false)).toBe(false);
  });
});

describe('RotatePrompt', () => {
  it('shows nothing where there is no page at all', () => {
    const prompt = new RotatePrompt(true, [], null);
    prompt.refresh();
    expect(prompt.showing).toBe(false);
  });

  it('shows in portrait and CLEARS when the device is turned', () => {
    // 🔴 The defect, stated as the sequence that produced it. The old decision read
    // `ScaleManager.displaySize`, which the engine caches and which is stale exactly when the device
    // has just been turned — so the overlay stayed up. Reading the viewport cannot be stale.
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    prompt.refresh();
    expect(prompt.showing, 'the prompt should be up in portrait').toBe(true);
    expect(host.shown).toBe(true);

    host.innerWidth = PHONE_LANDSCAPE.width;
    host.innerHeight = PHONE_LANDSCAPE.height;
    prompt.refresh();
    expect(prompt.showing, 'the prompt survived a rotation into landscape').toBe(false);
    expect(host.shown).toBe(false);
  });

  it('touches the page only when the answer CHANGES', () => {
    // It is called on every frame and on three DOM events. A `classList.toggle` per frame is work
    // the 12.11 budget never sees and never needs to pay.
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    for (let i = 0; i < 10; i += 1) prompt.refresh();
    expect(host.toggles, 'the page was written to on a frame nothing changed').toBe(1);
  });

  it('RE-ASSERTS the class another instance cleared, because the page is the authority', () => {
    // 🔴 The defect the e2e reproduction found, and the reason `isShown()` exists. There is one
    // overlay and one class, and more than one prompt alive: `TitleScene` attaches its own,
    // `UIScene` builds another. Caching "am I showing?" privately meant the title screen's teardown
    // cleared the class while the UI's prompt still believed it was up — so the overlay vanished on
    // a portrait phone the moment play started, and nothing put it back.
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const ui = new RotatePrompt(true, [], host);
    ui.refresh();
    expect(host.shown).toBe(true);

    // Another scene's prompt shuts down and clears the page.
    host.setShown(false);
    ui.refresh();
    expect(host.shown, 'the overlay stayed gone on a viewport that still needs it').toBe(true);
  });

  it('leaves the page clean when the scene ends with the overlay up', () => {
    const host = fakeHost(PHONE_PORTRAIT.width, PHONE_PORTRAIT.height);
    const prompt = new RotatePrompt(true, [], host);
    prompt.refresh();
    prompt.destroy();
    expect(host.shown, 'a shut-down scene stranded the overlay over the next one').toBe(false);
  });
});
