/**
 * The fake scene `help-banner-layer.test.ts` drives `HelpBannerLayer` against.
 *
 * A file of its own since 2026-08-27, when the test reached 509 lines against the project's
 * 400-line ceiling. The harness is roughly half of it and none of it is an assertion — so it is the
 * seam that costs nothing to cut. `help-banner-layout.test.ts` took the pure-decision cases out at
 * the same time.
 *
 * ⚠️ Not a `.test.ts`, deliberately: vitest would collect it and report a file with no tests.
 *
 * Two harness facts are load-bearing and are documented where they are written below — every
 * handler is stored WITH its context, and the fake HUD subscribes to `resize` AFTER the layer does.
 * Both reproduce real Phaser behaviour that a naive fake gets wrong in a way that makes a broken
 * implementation look correct.
 */

import type Phaser from 'phaser';

import { HelpBannerLayer } from '../../src/scenes/helpBannerLayer';
import { AUDIO_CHANGED } from '../../src/scenes/audioKeyMap';
import { SCENE_SHUTDOWN, SCENE_UPDATE } from '../../src/scenes/engineLiterals';
import { hudLayout, type HudLayout } from '../../src/render/hud';

export const HUD_SLOT = { x: 150, y: 44, w: 232, h: 40 };

interface TextRecorder {
  x: number;
  y: number;
  width: number;
  fontPx: number | null;
  wrapPx: number | null;
  /** How many rows `getWrappedText()` will claim, so the two-pass layout can be exercised. */
  rows: number;
  destroyed: boolean;
  depth: number | null;
  visible: boolean;
  strokePx: number | null;
  style: Record<string, unknown>;
  content: string;
}

interface Harness {
  layer: HelpBannerLayer;
  banner: TextRecorder;
  counter: { x: number; y: number; width: number; fontPx: number; active: boolean };
  /** Flip to false to simulate `hudObjects()` before `UIScene.create()` has built anything. */
  counterPresent: boolean;
  emitUpdate: () => void;
  emitResize: () => void;
  emitShutdown: () => void;
  /** Fire `AUDIO_CHANGED`, the event that makes the layer re-read its content provider. */
  emitAudioChanged: () => void;
  setGameSize: (w: number, h: number) => void;
  /** The owning scene's camera. Mutable, so the offset case can move it. */
  camera: { x: number; y: number };
  /** Order in which the two `resize` listeners fired, for the ordering assertion. */
  resizeOrder: string[];
  updateListeners: number;
  resizeListeners: number;
  audioListeners: number;
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
export function build(
  /** A string for the cases that never change it; a provider for the ones that do. */
  content: string | (() => string) = 'ARROWS move  ·  SPACE jump',
): Harness {
  const provider = typeof content === 'function' ? content : (): string => content;
  let gameW = 1920;
  let gameH = 1080;

  const resizeOrder: string[] = [];
  // ⚠️ Every handler is stored WITH its context. Phaser's emitter binds the third argument of
  // `on`/`once` when it calls back; a fake that drops it calls the layer's private methods unbound,
  // and every one of them throws on `this`. That is a harness defect, not a product one — but it
  // presents as six red tests with a plausible-looking stack, so it is worth the two extra fields.
  const updateHandlers: { fn: () => void; ctx: unknown }[] = [];
  const audioHandlers: { fn: () => void; ctx: unknown }[] = [];
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
    depth: null,
    visible: true,
    strokePx: null,
    style: {},
    content: '',
  };

  const text = {
    setScrollFactor: () => text,
    // Modelled because the layer re-reads its content provider on `AUDIO_CHANGED`. Phaser's own
    // `setText` marks the object dirty and re-wraps on the next render; the fake only has to record
    // what was set, because the layer's own re-layout is what the assertions drive.
    setText: (c: string) => {
      banner.content = c;
      return text;
    },
    setDepth: (d: number) => {
      banner.depth = d;
      return text;
    },
    setVisible: (v: boolean) => {
      banner.visible = v;
      return text;
    },
    setStroke: (_colour: string, px: number) => {
      banner.strokePx = px;
      return text;
    },
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
  const counter = {
    x: layout.counter.x,
    y: layout.counter.y,
    width: 96,
    fontPx: layout.counter.fontPx,
    // Phaser's `GameObject.destroy()` sets `active = false` and leaves every other field readable,
    // which is exactly why the layer's guard has to test this rather than truthiness.
    active: true,
  };
  let counterPresent = true;
  /**
   * The owning scene's camera, which is NOT at the origin in the real game.
   *
   * `gameEffects.ts` grows `GameScene`'s camera by `shakeSafeMargin` and moves it to
   * `(-margin.x, -margin.y)` so a screen shake never uncovers the edge of the view. A
   * `setScrollFactor(0)` object on that camera therefore draws `camera.x` to the left of where it
   * was placed — while the counter it is measured against lives on `UIScene`'s camera at the
   * origin. Zero here by default so the other cases read plainly; one case below sets it.
   */
  const camera = { x: 0, y: 0 };

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
        if (event === AUDIO_CHANGED) audioHandlers.push({ fn, ctx });
      },
      once: (event: string, fn: () => void, ctx: unknown) => {
        if (event === SCENE_SHUTDOWN) shutdownHandlers.push({ fn, ctx });
      },
      off: (event: string, fn: () => void) => {
        if (event === SCENE_UPDATE) {
          const i = updateHandlers.findIndex((h) => h.fn === fn);
          if (i >= 0) updateHandlers.splice(i, 1);
        }
        if (event === AUDIO_CHANGED) {
          const i = audioHandlers.findIndex((h) => h.fn === fn);
          if (i >= 0) audioHandlers.splice(i, 1);
        }
      },
    },
    cameras: { main: camera },
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
    hudObjects: () =>
      ({
        counter: counterPresent ? (counter as unknown as Phaser.GameObjects.Text) : undefined,
        layout: counterPresent ? layout : undefined,
      }) as { counter: Phaser.GameObjects.Text; layout: HudLayout },
  };

  const layer = new HelpBannerLayer(scene, hud, provider);
  layer.create();
  // ⚠️ AFTER the layer, matching the real registration order. See this function's header.
  resizeHandlers.push({ fn: applyHudLayout, ctx: hud });

  return {
    layer,
    banner,
    counter,
    get counterPresent() {
      return counterPresent;
    },
    set counterPresent(v: boolean) {
      counterPresent = v;
    },
    camera,
    resizeOrder,
    emitUpdate: () => [...updateHandlers].forEach((h) => h.fn.call(h.ctx)),
    emitAudioChanged: () => [...audioHandlers].forEach((h) => h.fn.call(h.ctx)),
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
    get audioListeners() {
      return audioHandlers.length;
    },
  };
}
