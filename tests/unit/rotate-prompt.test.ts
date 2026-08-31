import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { TOUCH_BOX_PX, TOUCH_MIN_CSS_PX } from '../../src/render/touchLayout';
import { SCENE_UPDATE } from '../../src/scenes/engineLiterals';
import { attachRotatePrompt } from '../../src/scenes/rotateGuard';
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

  it('shows for a screen whose OWN targets are too small, with the play controls fitting', () => {
    // 🔴 The Codex round-3 finding, and it is not hypothetical. `RotatePrompt` asked only about the
    // play controls while `attachTapRoutes` asked about those AND the route's own targets, so a
    // screen whose own targets went under the floor had its route silently killed with nothing on
    // screen to explain it — and `touchMenuLayout`'s rows go under the floor the moment the catalog
    // holds a sixth level. One shared `rotatePromptWanted` call is the fix; this is the case that
    // can tell the two apart, because the play controls fit at full size and only the targets do
    // not.
    const h = scene(GAME_WIDTH);
    expect(fitsAt(GAME_WIDTH), 'the play controls must FIT here, or this proves nothing').toBe(true);
    const prompt = new RotatePrompt(h.scene, true, [{ id: 'tiny', x: 0, y: 0, w: 40, h: 40 }]);
    prompt.create();
    prompt.refresh();
    expect(prompt.showing, 'a 40 CSS px route was killed with no prompt to explain it').toBe(true);
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

  it('re-places the SAME prompt when the design size changes', () => {
    // ⚠️ **This test used to build a SECOND prompt at the new size**, which exercised `create()`
    // and then searched an array still holding the first prompt's full-size scrim — so it passed
    // whether or not `refresh()` re-placed anything, and `refresh()` did not. Both halves were the
    // Codex round-4 finding. The gate now refreshes the prompt it already made and asserts EXACT
    // geometry on those objects.
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    const before = [1, 2].map((i) => ({ x: h.faces[i].x, y: h.faces[i].y }));
    const w = GAME_WIDTH / 2;
    const ht = GAME_HEIGHT / 2;
    h.scene.scale.gameSize = { width: w, height: ht };
    prompt.refresh();

    const scrim = h.faces[0];
    expect([scrim.w, scrim.h], 'the scrim kept the size it was built at').toEqual([w, ht]);
    expect([scrim.x, scrim.y], 'the scrim left the origin').toEqual([0, 0]);
    // ⚠️ The DELTA, not the offsets. Pinning `-48` and `+56` would false-red a legal change to the
    // line spacing that kept the prompt centred, responsive and readable — a test enforcing more
    // than any criterion says, which is the widening this project forbids. Codex round 5. Halving
    // the view must move each line by half the change in the dimension it is centred on; whatever
    // constant separates them is not this gate's business.
    for (const [i, was] of before.entries()) {
      const face = h.faces[i + 1];
      expect(face.x - was.x, 'a line did not follow the new width').toBe((w - GAME_WIDTH) / 2);
      expect(face.y - was.y, 'a line did not follow the new height').toBe((ht - GAME_HEIGHT) / 2);
    }
  });

  it('keeps a finite font size when the canvas measures zero', () => {
    // 🔴 `cssScaleFor` returns 0 for a collapsed or unmeasured canvas, on purpose. `28 / 0` is
    // `Infinity`, and that is what reached Phaser's text renderer. Codex round 4.
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    const before = h.faces[1].fontSize;
    h.scene.scale.displaySize = { width: 0, height: 0 };
    prompt.refresh();
    expect(Number.isFinite(h.faces[1].fontSize), 'an Infinity font size reached the renderer').toBe(true);
    expect(h.faces[1].fontSize, 'the last finite size was not kept').toBe(before);
    expect(prompt.showing, 'a collapsed canvas must still show the prompt').toBe(true);
  });

  it('destroys every object it made', () => {
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    prompt.destroy();
    for (const f of h.faces) expect(f.destroyed, 'a prompt object outlived the prompt').toBe(true);
    expect(prompt.showing).toBe(false);
  });
});

/**
 * **Both of these were found by the owner on a phone, and neither could be seen from here.**
 *
 * Codex reviewed this prompt five times and the suite has 3039 cases. The first defect lives in a
 * font size that only exists below a CSS scale of 0.275, which no headless run reaches; the second
 * in the difference between a `resize` event and a viewport, which no fake emits wrongly. *(C4: a
 * hands-on pass finds what a gate cannot.)*
 */
describe('the two defects a real phone found', () => {
  /** Monospace advance as a share of the em. Conservative: real monospace faces run 0.55-0.6. */
  const ADVANCE = 0.6;
  const SUBLINE_TEXT = 'the controls need a landscape screen';

  it('WRAPS its copy, because the subline is wider than the design surface without it', () => {
    // 🔴 The subline was cut off at both ends on the owner's phone, and the arithmetic says it
    // always was. 36 characters at `18 / 0.203 = 89` game px and 0.6 em advance is 1922 px on a
    // 1920 px surface — over on the WIDEST phone in scope, worse on every narrower one.
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    expect(prompt.showing, 'the fixture is not the failing viewport').toBe(true);

    const subline = h.faces.filter((f) => f.fontSize > 0 && f.fontSize < 100)[0]!;
    const unwrapped = SUBLINE_TEXT.length * subline.fontSize * ADVANCE;
    expect(
      unwrapped,
      'the fixture no longer overflows, so this case proves nothing — re-derive it',
    ).toBeGreaterThan(GAME_WIDTH);

    for (const line of h.faces.filter((f) => f.fontSize > 0)) {
      expect(line.wrapWidth, 'a line of copy can still run off both edges').toBeGreaterThan(0);
      expect(line.wrapWidth, 'the wrap width is wider than the surface it wraps inside').
        toBeLessThanOrEqual(GAME_WIDTH);
    }
  });

  it('SUBSCRIBES to the per-frame event, so a late-reported rotation is still seen', () => {
    // 🔴 The defect itself. `TitleScene` and `LevelSelectScene` attach the prompt through
    // `attachRotatePrompt`, which subscribed `refresh` to `scale.on('resize')` and to nothing else.
    // A mobile browser fires `resize` on orientationchange while it still reports the OLD viewport,
    // so the one evaluation the prompt got ran against portrait and nothing asked again — the
    // overlay stayed up after the phone was turned. `UIScene` was fine because it polls.
    //
    // ⚠️ **This drives `attachRotatePrompt`, not `RotatePrompt.refresh()`**, because the subscription
    // is the thing that was missing. The case below drives the prompt and would have stayed GREEN
    // through the entire defect. That file could not be unit-tested at all until its `phaser` value
    // import came out — see `RotateGuardScene`.
    const h = scene(PORTRAIT_CSS_WIDTH);
    const own: string[] = [];
    const scaleEvents: string[] = [];
    const handlers = new Map<string, () => void>();
    const guardScene = {
      ...h.scene,
      events: {
        on: (e: string, fn: () => void) => {
          own.push(e);
          handlers.set(e, fn);
        },
        once: (e: string, fn: () => void) => {
          own.push(e);
          handlers.set(e, fn);
        },
        off: (e: string) => {
          handlers.delete(e);
        },
      },
      scale: {
        ...h.scene.scale,
        on: (e: string) => scaleEvents.push(e),
        off: () => undefined,
      },
    } as unknown as Parameters<typeof attachRotatePrompt>[0];

    attachRotatePrompt(guardScene, true);
    expect(scaleEvents, 'the resize subscription is gone').toContain('resize');
    expect(
      own,
      'nothing re-evaluates the prompt per frame, so a late-reported rotation strands it',
    ).toContain(SCENE_UPDATE);

    // The prompt is up, the device turns, and the browser reports it only on the next frame.
    const scrim = h.faces[0]!;
    expect(scrim.visible, 'the prompt should be up in portrait').toBe(true);
    guardScene.scale.displaySize = { width: GAME_WIDTH, height: GAME_HEIGHT };
    handlers.get(SCENE_UPDATE)!();
    expect(scrim.visible, 'the prompt survived a rotation into landscape').toBe(false);
  });

  it('clears itself on a ROTATION the browser reported late, with no resize event', () => {
    // 🔴 `TitleScene` and `LevelSelectScene` subscribed `refresh` to `scale.on('resize')` and to
    // nothing else. A mobile browser fires `resize` on orientationchange while it still reports the
    // OLD viewport, so the one evaluation the prompt got ran against portrait and nothing asked
    // again — the overlay stayed up after the phone was turned. The owner found it, 2026-08-31.
    //
    // This is that sequence exactly: the viewport becomes landscape and `refresh()` is called by
    // the per-frame subscription rather than by a resize. `attachRotatePrompt` is what wires that,
    // and deleting its UPDATE subscription reds this.
    const h = scene(PORTRAIT_CSS_WIDTH);
    const prompt = live(h);
    expect(prompt.showing, 'the prompt should be up in portrait').toBe(true);

    h.scene.scale.displaySize = { width: GAME_WIDTH, height: GAME_HEIGHT };
    prompt.refresh();
    expect(prompt.showing, 'the prompt survived a rotation into landscape').toBe(false);
  });
});
