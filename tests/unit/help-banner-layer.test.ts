/**
 * 🔴 Does the controls banner actually reach a drawn object — and does it move when the HUD does?
 *
 * ## The two defects this gate exists for
 *
 * **1. Nothing asserted the banner existed.** It was drawn by `addHelpBanner(scene, text)`, which
 * returned `void` and discarded the `Text`. Codex plan review round 1, finding 3: deleting the draw
 * call outright left the whole suite green. That is the `spriteFeedback.ts` shape written down at
 * `enemy-feedback.test.ts:6` — *"a decision function with no consumer is the same defect as a burst
 * of zero particles"* — except here the consumer existed and the **object** was thrown away.
 *
 * **2. It did not survive a resize.** `UIScene` re-lays-out through `hudLayout()` on `resize` and
 * `phase-06-chrome.spec.ts` drives exactly that path, while the banner sat at raw design pixels with
 * a raw font size. Codex round 1, finding 4.
 *
 * ## Why this one is behavioural rather than a source scan
 *
 * `helpBannerLayer.ts` takes Phaser as a **type-only** import, so it can be driven end to end
 * against a fake scene — the stronger of the two draw-path idioms this project uses, and the reason
 * the layer is not a field on `UIScene`, which names Phaser as a value (Codex round 2, finding 3).
 * `npm run test:sim-isolated` runs this file with the engine uninstalled.
 *
 * ⚠️ The PURE decision function's own cases live in `help-banner-layout.test.ts` — this file drives
 * the layer that applies it. They were one file until it reached 509 lines against the 400-line
 * ceiling; the seam is `src/render/` decides, `src/scenes/` applies.
 *
 * ## Every assertion is written to fail if the module does nothing
 *
 * The recorder starts at `(0, 0)` with a wrap width of 1 — the values `create()` leaves behind — so
 * "the banner is beside the counter" cannot be satisfied by a layout that never ran. And the resize
 * case asserts the **new** position differs from the old one, not merely that it is plausible.
 */

import { describe, expect, it } from 'vitest';

import { build } from './helpBannerFake';
import { HUD_MARGIN } from '../../src/render/hud';
import { HELP_BANNER_DEPTH, HELP_FONT_PX, helpBannerLayout } from '../../src/render/helpBanner';

describe('the controls banner reaches a drawn object', () => {
  it('creates one, with the legend it was given', () => {
    const h = build('ARROWS move  ·  F attack');
    expect(h.layer.object(), 'create() left no Text behind at all').not.toBeNull();
    expect(h.banner.content).toBe('ARROWS move  ·  F attack');
    expect(h.banner.style.fontSize).toBe(`${HELP_FONT_PX}px`);
  });

  it('is still at its unlaid-out origin until an update runs — the counter does not exist yet', () => {
    const h = build();
    // `attachHud()` returns before `UIScene.create()`. Positioning at construction would be
    // positioning against nothing; this asserts the layer does not try.
    expect([h.banner.x, h.banner.y]).toEqual([0, 0]);
  });

  it('is INVISIBLE until it has been placed, so no frame shows it at the origin', () => {
    // 🔴 Codex plan review round 3, finding 4. The banner used to be created visible, at (0, 0),
    // wrapped to one pixel — a column of single characters in the top-left of the level on any frame
    // that rendered before the first update. This assertion is the difference between confirming
    // that state and preventing it.
    const h = build();
    expect(h.banner.visible, 'the unlaid-out banner is drawable').toBe(false);
    h.emitUpdate();
    expect(h.banner.visible, 'the banner was never revealed after being placed').toBe(true);
  });

  /**
   * 🔴 The two cameras are different cameras, and the layout has to reconcile them.
   *
   * `gameEffects.ts` moves `GameScene`'s camera to `(-shakeSafeMargin.x, -shakeSafeMargin.y)` —
   * about (-10, -8) — so a `setScrollFactor(0)` object at `x` draws 10 px to the LEFT of `x`, while
   * the counter it clears lives on `UIScene`'s camera at the origin. At 852 x 480 the whole
   * `COUNTER_GAP` is 10.7 px, so the banner all but touched the counter. Found by the code-review
   * gate owner, brief 1, finding 1, and invisible to the e2e clearance assertions because they
   * compare bounds in one camera's space against rectangles in the other's.
   */
  it('compensates for an offset camera, so it lands where the layout put it on screen', () => {
    const centred = build();
    centred.emitUpdate();

    const offset = build();
    offset.camera.x = -10;
    offset.camera.y = -8;
    offset.emitUpdate();

    expect(
      offset.banner.x - centred.banner.x,
      'the banner did not compensate for the camera offset, so it draws 10 px left of its layout',
    ).toBeCloseTo(10, 6);
    expect(offset.banner.y - centred.banner.y).toBeCloseTo(8, 6);
  });

  it('draws above everything GameScene owns', () => {
    // Enemy health bars are the deepest thing in that scene at 12. Without a depth the banner sat at
    // 0 and the world scrolled OVER it — UI/UX gate owner, brief 2, finding 5.
    const h = build();
    expect(h.banner.depth, 'the banner has no depth, so sprites draw through it').toBe(
      HELP_BANNER_DEPTH,
    );
    expect(HELP_BANNER_DEPTH).toBeGreaterThan(12);
  });

  /**
   * 🔴 A stopped `UIScene` hands back DESTROYED objects, and they are truthy.
   *
   * Its SHUTDOWN handler resets only `built`; `this.counter` keeps pointing at a destroyed `Text`
   * whose `.x` and `.width` still read as numbers. The guard was `if (!counter || !layout)`, which
   * passes — so the banner was positioned against a corpse at a stale scale and `dirty` was cleared
   * **permanently**, never retrying when the HUD came back. Reachable through `scene.stop('UI')`
   * and through every dev-scene transition. Code-review gate owner, brief 2, finding 3; the guard
   * had no red proof at all before this case, which was that owner's brief 1, finding 2.
   */
  it('will not lay out against an absent or destroyed counter, and retries when it returns', () => {
    const absent = build();
    absent.counterPresent = false;
    absent.emitUpdate();
    expect([absent.banner.x, absent.banner.y], 'laid out against no counter').toEqual([0, 0]);
    absent.counterPresent = true;
    absent.emitUpdate();
    expect(absent.banner.x, 'never retried once the counter existed').toBeGreaterThan(0);

    const dead = build();
    dead.emitUpdate();
    const placed = dead.banner.x;

    dead.counter.active = false; // UIScene stopped; the Text is destroyed but still referenced
    dead.emitResize();
    // ⚠️ AFTER the resize, because the fake's HUD handler rewrites the counter's width on one — set
    // before, this would be overwritten and the test would compare a number against itself.
    dead.counter.width = 9999; // would move the banner a long way, if it were read
    dead.emitUpdate();
    expect(dead.banner.x, 'laid out against a DESTROYED counter').toBe(placed);

    dead.counter.active = true;
    dead.emitUpdate();
    expect(dead.banner.x, 'never retried once the HUD came back').not.toBe(placed);
  });

  it('lands beside the counter on the first update, at the layout the pure function returned', () => {
    const h = build();
    h.emitUpdate();

    const expected = helpBannerLayout(h.counter.x + h.counter.width, 1920, 1, h.banner.rows);
    expect(h.banner.x, 'the banner did not clear the counter by COUNTER_GAP').toBe(expected.x);
    expect(h.banner.y).toBe(expected.y);
    expect(h.banner.wrapPx).toBe(expected.wrapPx);
    expect(h.banner.fontPx).toBe(expected.fontPx);
    // Non-vacuity: the layout has to have MOVED it off the origin, not merely agreed with it.
    expect(h.banner.x).toBeGreaterThan(0);
  });

  it('centres on the rows the text actually wrapped to, never on a declared count', () => {
    const two = build();
    two.banner.rows = 2;
    two.emitUpdate();

    const three = build();
    three.banner.rows = 3;
    three.emitUpdate();

    expect(three.banner.y, 'a taller banner was placed at the same y as a shorter one').not.toBe(
      two.banner.y,
    );
    // And the taller one grows DOWNWARD from the clamp rather than off the top of the screen.
    expect(three.banner.y).toBeGreaterThanOrEqual(HUD_MARGIN);
  });

  it('does not re-lay-out on an update once it is clean', () => {
    const h = build();
    h.emitUpdate();
    const settled = h.banner.x;
    h.counter.width = 9999; // would move it a long way, if it were read
    h.emitUpdate();
    expect(h.banner.x, 'the layer is doing work every frame').toBe(settled);
  });
});

describe('and it follows the HUD across a resize', () => {
  it('re-lays-out after a resize, at the new scale', () => {
    const h = build();
    h.emitUpdate();
    const before = { x: h.banner.x, fontPx: h.banner.fontPx };

    h.setGameSize(852, 480);
    h.emitResize();
    h.emitUpdate();

    expect(h.banner.x, 'the banner stayed put through a resize').not.toBe(before.x);
    expect(h.banner.fontPx, 'the font did not rescale').not.toBe(before.fontPx);

    const scale = 480 / 1080;
    const expected = helpBannerLayout(h.counter.x + h.counter.width, 852, scale, h.banner.rows);
    expect(h.banner.x).toBeCloseTo(expected.x, 6);
    expect(h.banner.fontPx).toBeCloseTo(expected.fontPx, 6);
  });

  /**
   * 🔴 The ordering assertion, and the reason the layout is deferred rather than pinned.
   *
   * Codex round 2, finding 9, asked for a fixed order — position, `setFontSize()`, read
   * `Text.width` — because Phaser's setter synchronously rewrites the width. But this layer's
   * `resize` listener is registered BEFORE `UIScene`'s, so it cannot read a fresh counter during a
   * resize at any ordering of its own. Deferring to the update is what makes the read correct, and
   * this test fails against an implementation that lays out inside the resize handler.
   */
  it('does NOT lay out inside the resize handler, where the counter is still the old size', () => {
    const h = build();
    h.emitUpdate();
    h.resizeOrder.length = 0;

    h.setGameSize(852, 480);
    h.emitResize();

    expect(
      h.resizeOrder,
      'the banner positioned itself during the resize, before the HUD had re-laid-out',
    ).toEqual(['hud']);

    h.emitUpdate();
    expect(h.resizeOrder).toEqual(['hud', 'banner']);
  });
});

describe('and it tears itself down', () => {
  it('drops both listeners and the Text on shutdown', () => {
    const h = build();
    h.emitUpdate();
    const before = { update: h.updateListeners, resize: h.resizeListeners };

    h.emitShutdown();

    expect(h.updateListeners, 'the update listener outlived the scene').toBe(before.update - 1);
    expect(h.resizeListeners, 'the resize listener outlived the scene').toBe(before.resize - 1);
    expect(h.banner.destroyed).toBe(true);
    expect(h.layer.object()).toBeNull();
  });
});

/**
 * **The empty line: a touch device gets no banner, and must not pay for one every frame.**
 *
 * `gameDev.helpLine` returns `''` on a touch device from 2026-09-01, so `content()` is empty for
 * the whole session there. Two separate claims, and the second is the one that is easy to get
 * wrong:
 *
 *  1. nothing is drawn — the object is hidden, and `placed` is nulled so no gate can read a stale
 *     coordinate for an invisible thing;
 *  2. **the work stops.** `dirty` is cleared only at the very end of `layout()`, so an early return
 *     that merely hid the banner would re-enter on every frame forever — `hudObjects()`, two
 *     `helpBannerLayout()` passes and a `getWrappedText()`, on the device with the least budget for
 *     it. Named by the Codex plan review, round 1.
 */
describe('an empty legend draws nothing and stops working', () => {
  it('hides the banner and clears its placement', () => {
    const h = build('');
    h.emitUpdate();
    expect(h.banner.visible, 'an empty banner was left visible').toBe(false);
    // `placed` is private, so this reads its consequence instead: `onUpdate`'s camera-follow branch
    // returns early while `placed` is null, so nothing ever positions the hidden object.
    expect(
      h.resizeOrder.filter((who) => who === 'banner'),
      'an invisible banner was still being positioned',
    ).toEqual([]);
  });

  it('lays out ONCE, not on every frame — the dirty flag really is cleared', () => {
    const h = build('');
    h.emitUpdate();
    const after = h.banner.setTextCalls;
    expect(after, 'the layer never ran at all — this case would prove nothing').toBeGreaterThan(0);
    h.emitUpdate();
    h.emitUpdate();
    h.emitUpdate();
    expect(
      h.banner.setTextCalls,
      'the empty path re-laid-out on every frame: `dirty` was never cleared',
    ).toBe(after);
  });

  it('still draws a NON-empty legend, so the early return is not swallowing both', () => {
    // Non-vacuity: a `return` at the top of `layout()` satisfies both cases above.
    const h = build('ARROWS move');
    h.emitUpdate();
    expect(h.banner.visible).toBe(true);
    expect(
      h.resizeOrder.filter((who) => who === 'banner').length,
      'a real legend was never positioned — the early return swallowed it too',
    ).toBeGreaterThan(0);
  });

  it('comes back when the legend does — an empty session is not a permanent one', () => {
    // The provider form: a scene whose audio manager arrives late returns '' on the first layout
    // and a real line afterwards. Clearing `dirty` must not strand it hidden.
    let line = '';
    const h = build(() => line);
    h.emitUpdate();
    expect(h.banner.visible).toBe(false);
    line = 'ARROWS move';
    h.emitAudioChanged();
    h.emitUpdate();
    expect(h.banner.visible, 'the banner never returned after its legend did').toBe(true);
  });
});
