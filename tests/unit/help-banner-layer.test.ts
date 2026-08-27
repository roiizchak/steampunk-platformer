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
 * ## Every assertion is written to fail if the module does nothing
 *
 * The recorder starts at `(0, 0)` with a wrap width of 1 — the values `create()` leaves behind — so
 * "the banner is beside the counter" cannot be satisfied by a layout that never ran. And the resize
 * case asserts the **new** position differs from the old one, not merely that it is plausible.
 */

import { describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import { HelpBannerLayer } from '../../src/scenes/helpBannerLayer';
import { SCENE_SHUTDOWN, SCENE_UPDATE } from '../../src/scenes/engineLiterals';
import { COUNTER_GAP, HUD_MARGIN, hudLayout, type HudLayout } from '../../src/render/hud';
import { HELP_FONT_PX, helpBannerLayout } from '../../src/render/helpBanner';

const HUD_SLOT = { x: 150, y: 44, w: 232, h: 40 };

interface TextRecorder {
  x: number;
  y: number;
  width: number;
  fontPx: number | null;
  wrapPx: number | null;
  /** How many rows `getWrappedText()` will claim, so the two-pass layout can be exercised. */
  rows: number;
  destroyed: boolean;
  style: Record<string, unknown>;
  content: string;
}

interface Harness {
  layer: HelpBannerLayer;
  banner: TextRecorder;
  counter: { x: number; y: number; width: number; fontPx: number };
  emitUpdate: () => void;
  emitResize: () => void;
  emitShutdown: () => void;
  setGameSize: (w: number, h: number) => void;
  /** Order in which the two `resize` listeners fired, for the ordering assertion. */
  resizeOrder: string[];
  updateListeners: number;
  resizeListeners: number;
}

/**
 * A fake scene, a fake parallel HUD, and the ONE ordering fact this whole design turns on.
 *
 * `UIScene` registers its `resize` listener inside its own `create()`, which runs after
 * `GameScene.create()` has already built this layer — so the layer's listener is registered first
 * and the emitter calls it first. The harness reproduces that order deliberately: the layer is
 * built, and only then does the fake HUD subscribe. A harness that subscribed the HUD first would
 * make a broken read-during-resize implementation look correct.
 */
function build(content = 'ARROWS move  ·  SPACE jump'): Harness {
  let gameW = 1920;
  let gameH = 1080;

  const resizeOrder: string[] = [];
  // ⚠️ Every handler is stored WITH its context. Phaser's emitter binds the third argument of
  // `on`/`once` when it calls back; a fake that drops it calls the layer's private methods unbound,
  // and every one of them throws on `this`. That is a harness defect, not a product one — but it
  // presents as six red tests with a plausible-looking stack, so it is worth the two extra fields.
  const updateHandlers: { fn: () => void; ctx: unknown }[] = [];
  const resizeHandlers: { fn: () => void; ctx: unknown }[] = [];
  const shutdownHandlers: { fn: () => void; ctx: unknown }[] = [];

  const banner: TextRecorder = {
    x: 0,
    y: 0,
    width: 0,
    fontPx: null,
    wrapPx: null,
    rows: 2,
    destroyed: false,
    style: {},
    content: '',
  };

  const text = {
    setScrollFactor: () => text,
    setPosition: (x: number, y: number) => {
      resizeOrder.push('banner');
      banner.x = x;
      banner.y = y;
      return text;
    },
    setFontSize: (px: number) => {
      banner.fontPx = px;
      return text;
    },
    setWordWrapWidth: (px: number) => {
      banner.wrapPx = px;
      return text;
    },
    getWrappedText: () => {
      // 🔴 The one thing a real `Text` will not do for a fake: refuse to answer before it has been
      // told how wide to wrap. Without this the two-pass layout could read rows first and still
      // look right here, which is precisely the ordering hazard the design removes.
      if (banner.wrapPx === null || banner.fontPx === null) {
        throw new Error('getWrappedText() was called before the wrap width and font size were set');
      }
      return new Array(banner.rows).fill('row');
    },
    destroy: () => {
      banner.destroyed = true;
    },
  };

  // The counter, and a HudLayout that moves with the game size exactly as `UIScene`'s does.
  let layout: HudLayout = hudLayout(gameW, gameH, HUD_SLOT);
  const counter = { x: layout.counter.x, y: layout.counter.y, width: 96, fontPx: layout.counter.fontPx };

  const applyHudLayout = (): void => {
    resizeOrder.push('hud');
    layout = hudLayout(gameW, gameH, HUD_SLOT);
    counter.x = layout.counter.x;
    counter.y = layout.counter.y;
    // Phaser rewrites `Text.width` synchronously inside `setFontSize`. The fake does the same, so a
    // read taken before this point is a read of the previous scale's width.
    counter.fontPx = layout.counter.fontPx;
    counter.width = 96 * layout.scale;
  };

  const scene = {
    add: {
      text: (_x: number, _y: number, c: string, style: Record<string, unknown>) => {
        banner.content = c;
        banner.style = style;
        banner.wrapPx = (style.wordWrap as { width: number }).width;
        return text;
      },
    },
    events: {
      on: (event: string, fn: () => void, ctx: unknown) => {
        if (event === SCENE_UPDATE) updateHandlers.push({ fn, ctx });
      },
      once: (event: string, fn: () => void, ctx: unknown) => {
        if (event === SCENE_SHUTDOWN) shutdownHandlers.push({ fn, ctx });
      },
      off: (event: string, fn: () => void) => {
        if (event === SCENE_UPDATE) {
          const i = updateHandlers.findIndex((h) => h.fn === fn);
          if (i >= 0) updateHandlers.splice(i, 1);
        }
      },
    },
    scale: {
      get gameSize() {
        return { width: gameW, height: gameH };
      },
      on: (_event: string, fn: () => void, ctx: unknown) => {
        resizeHandlers.push({ fn, ctx });
      },
      off: (_event: string, fn: () => void) => {
        const i = resizeHandlers.findIndex((h) => h.fn === fn);
        if (i >= 0) resizeHandlers.splice(i, 1);
      },
    },
  } as unknown as Phaser.Scene;

  const hud = {
    hudObjects: () => ({ counter: counter as unknown as Phaser.GameObjects.Text, layout }),
  };

  const layer = new HelpBannerLayer(scene, hud, content);
  layer.create();
  // ⚠️ AFTER the layer, matching the real registration order. See this function's header.
  resizeHandlers.push({ fn: applyHudLayout, ctx: hud });

  return {
    layer,
    banner,
    counter,
    resizeOrder,
    emitUpdate: () => [...updateHandlers].forEach((h) => h.fn.call(h.ctx)),
    emitResize: () => [...resizeHandlers].forEach((h) => h.fn.call(h.ctx)),
    emitShutdown: () => [...shutdownHandlers].forEach((h) => h.fn.call(h.ctx)),
    setGameSize: (w: number, h: number) => {
      gameW = w;
      gameH = h;
    },
    get updateListeners() {
      return updateHandlers.length;
    },
    get resizeListeners() {
      return resizeHandlers.length;
    },
  };
}

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

describe('helpBannerLayout — the pure decision', () => {
  it('clears the counter by exactly COUNTER_GAP, scaled', () => {
    expect(helpBannerLayout(600, 1920, 1, 2).x).toBe(600 + COUNTER_GAP);
    expect(helpBannerLayout(600, 852, 0.5, 2).x).toBe(600 + COUNTER_GAP * 0.5);
  });

  it('leaves a usable band at the smallest supported size', () => {
    const scale = 480 / 1080;
    const layout = hudLayout(852, 480, HUD_SLOT);
    const counterRight = layout.counter.x + 96 * scale;
    const banner = helpBannerLayout(counterRight, 852, scale, 3);
    expect(banner.wrapPx, 'no room left for the banner at 852 x 480').toBeGreaterThan(0);
    expect(banner.x + banner.wrapPx).toBeLessThanOrEqual(852);
  });

  it('never returns a negative wrap width, however narrow the game', () => {
    // A band that has run out is a band of zero, not a negative one — Phaser reads a negative wrap
    // as "wrap every word", which draws a column of single words rather than failing.
    expect(helpBannerLayout(900, 800, 1, 2).wrapPx).toBe(0);
  });

  it('is homogeneous in scale, so nothing is a raw design pixel by accident', () => {
    const one = helpBannerLayout(600, 1920, 1, 3);
    const half = helpBannerLayout(300, 960, 0.5, 3);
    expect(half.x).toBeCloseTo(one.x / 2, 6);
    expect(half.wrapPx).toBeCloseTo(one.wrapPx / 2, 6);
    expect(half.fontPx).toBeCloseTo(one.fontPx / 2, 6);
    expect(half.lineHeightPx).toBeCloseTo(one.lineHeightPx / 2, 6);
  });

  it('clamps a tall form to the top margin instead of running off the screen', () => {
    // Eight rows is far taller than the plate; an uncorrected centring puts it above y = 0.
    expect(helpBannerLayout(600, 1920, 1, 8).y).toBe(HUD_MARGIN);
    // And a short one is genuinely centred, so the clamp is not simply always winning.
    expect(helpBannerLayout(600, 1920, 1, 1).y).toBeGreaterThan(HUD_MARGIN);
  });
});
