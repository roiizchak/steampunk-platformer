/**
 * Shared probes for the Phase 6 e2e specs.
 *
 * Split out when `phase-06-hud.spec.ts` reached 601 lines against the project's 400-line ceiling,
 * which permits exactly one offender and has that slot spent by `src/scenes/GameScene.ts`. The
 * criteria were split along the same seam the QA gate uses: `phase-06-hud.spec.ts` owns what the
 * HUD SAYS (6.1, 6.4), `phase-06-chrome.spec.ts` owns where it SITS (6.2, 6.3, 6.7).
 *
 * Everything here reads the live scene tree through `window.__phaserGame` — dev-only, and the same
 * handle every other spec uses to assert that the DRAWN object tracks the sim. Without it, deleting
 * `renderPlayer()` once left every Phase 2 test green.
 */

import { expect } from '@playwright/test';
import { GPU_DRAIN_FRAMES } from './gpuTimer';
import { waitTicks } from './gameHarness';

type Page = import('@playwright/test').Page;

/** The shape `UIScene.hudObjects()` returns, flattened to what crosses the page boundary. */
export interface HudProbe {
  plate: { x: number; y: number; w: number; h: number; willRender: boolean };
  barFill: { willRender: boolean };
  gearIcon: { x: number; y: number; willRender: boolean };
  counter: { x: number; y: number; text: string; w: number; h: number; willRender: boolean };
  layout: {
    scale: number;
    plate: { x: number; y: number; w: number; h: number };
    slot: { x: number; y: number; w: number; h: number };
    gearIcon: { x: number; y: number; w: number; h: number };
    counter: { x: number; y: number; fontPx: number };
  };
  /**
   * The UI scene's own camera, read rather than assumed.
   *
   * 🔴 Criterion 6.3's no-cropping guarantee held only because **nothing ever creates an explicit
   * camera** for `UIScene` — an emergent property, not an assertion. Vault 6.2 is precisely that a
   * second camera built at an explicit size never auto-resizes: hardcoded at 1280 it cropped a
   * whole HUD plate off a phone. Nothing in the suite would have caught a regression that added
   * one, which is why `width`/`height` are checked against the live game size *and* `x`, `y`,
   * `scrollX`, `scrollY`, `zoom` are checked against their defaults — a correctly sized camera that
   * is scrolled or zoomed crops the HUD just as effectively.
   */
  uiCamera: {
    x: number;
    y: number;
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    zoom: number;
  };
  gameSize: { width: number; height: number };
}

/**
 * Wait until the HUD scene has actually run `create()`.
 *
 * 🔴 `bootToGame` waits on `window.__game.ready`, which `GameScene.create()` sets — but the HUD is
 * a **parallel scene** launched from there, and `ScenePlugin` operations are QUEUED. So at the
 * instant `ready` flips true, `UIScene.create()` has not run and `hudObjects()` returns unbuilt
 * fields. Every Phase 6 spec's first `readHud` has worked only because the CDP round-trip happens
 * to outlast one Phaser step — a latent flake, not a guarantee. `ready` is the declared terminal
 * condition for the *game*; it stopped covering the whole product when the HUD moved out of it.
 */
export async function waitForHud(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const game = (
        window as unknown as {
          __phaserGame?: { scene: { isActive(k: string): boolean; getScene(k: string): unknown } };
        }
      ).__phaserGame;
      if (!game || !game.scene.isActive('UI')) return false;
      const ui = game.scene.getScene('UI') as unknown as {
        hudObjects?: () => { plate?: unknown } | undefined;
      };
      return typeof ui?.hudObjects === 'function' && ui.hudObjects()?.plate !== undefined;
    },
    undefined,
    { timeout: 20_000 },
  );
}

/**
 * Read the live HUD out of the running `UIScene`.
 *
 * Reaches through `window.__phaserGame` — dev-only, and the same handle every other spec uses to
 * assert that the DRAWN object tracks the sim. Without it, deleting `renderPlayer()` once left
 * every Phase 2 test green.
 */
export async function readHud(page: Page): Promise<HudProbe> {
  // The HUD is launched as a queued parallel scene, so `__game.ready` does not imply it exists yet.
  await waitForHud(page);
  const probe = await page.evaluate(() => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scale: { gameSize: { width: number; height: number } };
          scene: { getScene(key: string): unknown };
        };
      }
    ).__phaserGame;

    const ui = game.scene.getScene('UI') as unknown as {
      hudObjects(): {
        plate: { x: number; y: number; displayWidth: number; displayHeight: number; willRender(c: unknown): boolean };
        barFill: { willRender(c: unknown): boolean };
        gearIcon: { x: number; y: number; willRender(c: unknown): boolean };
        counter: { x: number; y: number; text: string; width: number; height: number; willRender(c: unknown): boolean };
        layout: HudProbe['layout'];
      };
      cameras: {
        main: {
          x: number;
          y: number;
          width: number;
          height: number;
          scrollX: number;
          scrollY: number;
          zoom: number;
        };
      };
    };

    const o = ui.hudObjects();
    const cam = ui.cameras.main;
    return {
      plate: {
        x: o.plate.x,
        y: o.plate.y,
        w: o.plate.displayWidth,
        h: o.plate.displayHeight,
        willRender: o.plate.willRender(cam),
      },
      barFill: { willRender: o.barFill.willRender(cam) },
      gearIcon: { x: o.gearIcon.x, y: o.gearIcon.y, willRender: o.gearIcon.willRender(cam) },
      counter: {
        x: o.counter.x,
        y: o.counter.y,
        text: o.counter.text,
        w: o.counter.width,
        h: o.counter.height,
        willRender: o.counter.willRender(cam),
      },
      layout: o.layout,
      uiCamera: {
        x: cam.x,
        y: cam.y,
        width: cam.width,
        height: cam.height,
        scrollX: cam.scrollX,
        scrollY: cam.scrollY,
        zoom: cam.zoom,
      },
      gameSize: { width: game.scale.gameSize.width, height: game.scale.gameSize.height },
    };
  });

  // Type before value, every field (vault C1). A probe that silently returned undefined would make
  // every comparison below pass on `undefined === undefined`.
  expect(typeof probe.plate.x).toBe('number');
  expect(typeof probe.counter.text).toBe('string');
  expect(typeof probe.layout.scale).toBe('number');
  expect(typeof probe.uiCamera.width).toBe('number');
  expect(typeof probe.uiCamera.zoom).toBe('number');
  return probe;
}

/** How many gear bodies are still drawn in the world. */
export async function visibleGearCount(page: Page): Promise<number> {
  const count = await page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as unknown as {
      gears: { objects(): { visible: boolean; willRender(c: unknown): boolean }[] };
      cameras: { main: unknown };
    };
    const cam = scene.cameras.main;
    return scene.gears.objects().filter((o) => o.visible && o.willRender(cam)).length;
  });
  expect(typeof count).toBe('number');
  return count;
}

/** Walk right until the sim reports at least `target` gears collected, or the budget runs out. */
export async function collectGears(page: Page, target: number): Promise<void> {
  await page.keyboard.down('ArrowRight');
  await page
    .waitForFunction((t) => (window.__game?.score ?? 0) >= t, target, { timeout: 20_000 })
    .finally(() => page.keyboard.up('ArrowRight'));
}

export interface HudDrawProbe {
  uiActive: boolean;
  plateWillRender: boolean;
  counterWillRender: boolean;
  barCommands: number;
  /**
   * 🔴 The alpha half of the guard, and it is not belt-and-braces.
   *
   * `GameObject.willRender(camera)` tests `visible`, the render-flag bits and the camera filter —
   * and **nothing about alpha** (`node_modules/phaser/src/gameobjects/GameObject.js:707`). And
   * `Graphics.fillStyle(colour, alpha)` pushes its operands onto the command buffer unconditionally,
   * so `fillStyle(0x241c18, 0)` followed by `fillRect(...)` leaves `commandBuffer.length > 0` while
   * painting a **fully transparent** rectangle.
   *
   * So a HUD with `setAlpha(0)` on the plate and counter and a zero fill alpha on the bar satisfies
   * every other probe here, draws nothing a player can see, and is *cheaper* — which would sail
   * under the budget as a pass. That is vault 9.4 one layer below where `perfSampler.counts()`'s
   * `opaque` field reaches. Found by the performance gate owner's adversarial brief.
   */
  plateAlpha: number;
  counterAlpha: number;
  barFillAlpha: number;
  /**
   * 🔴 `willRender` for the bar and the icon too — the other half of the same hole.
   *
   * Alpha and the command buffer between them still miss `setVisible(false)` and `setScale(0)`:
   * both clear a render-flag bit while leaving `alpha` at 1 and the command buffer full, because
   * `fillStyle`/`fillRect` are plain array pushes that know nothing about visibility. The bar was
   * the ONE object here checked only by its command buffer, and it is the object every mutation in
   * this phase targets. The gear icon had no drawn-state check at all.
   *
   * Three complementary questions, and it takes all three: `willRender` (is it submitted at all),
   * alpha (would it paint anything), command buffer (was anything queued to paint).
   */
  barWillRender: boolean;
  gearIconWillRender: boolean;
  gearIconAlpha: number;
  /**
   * The widest rectangle the bar actually FILLED this frame.
   *
   * `barCommands > 0` is satisfied by a buffer holding only a `fillStyle` — deleting the `fillRect`
   * leaves a non-empty buffer, a healthy alpha and a renderable Graphics while painting nothing at
   * all. Codex's second implementation review found it. This is the operand that cannot lie.
   */
  barWidestRect: number;
}

/** Reads whether the HUD is genuinely drawing, not merely present. */
export async function hudDrawState(page: Page): Promise<HudDrawProbe> {
  return page.evaluate(() => {
    const game = (
      window as unknown as {
        __phaserGame: {
          scene: { getScene(k: string): unknown; isActive(k: string): boolean };
        };
      }
    ).__phaserGame;
    const uiActive = game.scene.isActive('UI');
    if (!uiActive) {
      return {
        uiActive: false,
        plateWillRender: false,
        counterWillRender: false,
        barCommands: 0,
        plateAlpha: 0,
        counterAlpha: 0,
        barFillAlpha: 0,
        barWillRender: false,
        gearIconWillRender: false,
        gearIconAlpha: 0,
        barWidestRect: 0,
      };
    }
    const ui = game.scene.getScene('UI') as unknown as {
      cameras: { main: unknown };
      hudObjects(): {
        plate: { willRender(c: unknown): boolean; alpha: number };
        counter: { willRender(c: unknown): boolean; alpha: number };
        gearIcon: { willRender(c: unknown): boolean; alpha: number };
        barFill: { commandBuffer: number[]; willRender(c: unknown): boolean; alpha: number };
      };
    };
    const cam = ui.cameras.main;
    const o = ui.hudObjects();

    // The LOWEST fill alpha actually queued on the bar this frame. Walked by opcode — FILL_STYLE is
    // [7, colour, alpha], three elements — because a colour operand could itself equal 7.
    const buf = o.barFill.commandBuffer;
    let lowestFillAlpha = 1;
    let sawFillStyle = false;
    // 🔴 A non-empty buffer is not a painted rectangle. Deleting `fillRect` while leaving
    // `fillStyle` leaves length > 0 and a healthy alpha, and paints NOTHING — Codex's second
    // implementation review. So the widest actually-filled rectangle is what gets reported.
    let widestRect = 0;
    for (let i = 0; i < buf.length; ) {
      if (buf[i] === 7) {
        sawFillStyle = true;
        lowestFillAlpha = Math.min(lowestFillAlpha, buf[i + 2] ?? 0);
        i += 3;
      } else if (buf[i] === 3) {
        widestRect = Math.max(widestRect, buf[i + 3] ?? 0);
        i += 5;
      } else i += 1;
    }

    return {
      uiActive: true,
      plateWillRender: o.plate.willRender(cam),
      counterWillRender: o.counter.willRender(cam),
      barCommands: buf.length,
      plateAlpha: o.plate.alpha,
      counterAlpha: o.counter.alpha,
      // The object's own alpha AND the alpha it painted with; either at zero means nothing is seen.
      barFillAlpha: sawFillStyle ? Math.min(o.barFill.alpha, lowestFillAlpha) : 0,
      barWidestRect: widestRect,
      barWillRender: o.barFill.willRender(cam),
      gearIconWillRender: o.gearIcon.willRender(cam),
      gearIconAlpha: o.gearIcon.alpha,
    };
  });
}

/**
 * Stops or starts the parallel HUD scene, and WAITS — scene ops are queued, not immediate.
 *
 * Moved here from `phase-06-perf.spec.ts` on 2026-08-17, when that file crossed the 400-line rule
 * after criterion 6.9's GPU statistic was re-measured. It belongs with the other shared HUD probes:
 * it is the only place that knows the UI scene's key and the queueing rule below.
 */
export async function setHud(page: Page, on: boolean): Promise<void> {
  await page.evaluate((wanted) => {
    // `__phaserGame.scene` is the game-level SceneManager, NOT a Scene's ScenePlugin, so there is
    // no `launch` here. `run` is the SceneManager's smart start: it boots a stopped scene and wakes
    // a sleeping one, which is what "put the HUD back" has to mean after a `stop`.
    const game = (
      window as unknown as {
        __phaserGame: { scene: { stop(k: string): void; run(k: string): void; isActive(k: string): boolean } };
      }
    ).__phaserGame;
    if (wanted && !game.scene.isActive('UI')) game.scene.run('UI');
    if (!wanted && game.scene.isActive('UI')) game.scene.stop('UI');
  }, on);

  // 🔴 The wait is not politeness. `ScenePlugin` QUEUES every operation and the SceneManager drains
  // the queue at the top of the next step, so sampling immediately would straddle the toggle and
  // average the two arms together — which biases the ratio toward 1.0, the direction that PASSES.
  await page.waitForFunction(
    (wanted) =>
      (
        window as unknown as { __phaserGame: { scene: { isActive(k: string): boolean } } }
      ).__phaserGame.scene.isActive('UI') === wanted,
    on,
    { timeout: 10_000 },
  );
  // `launch` re-runs create() -> build(), which allocates the plate, Graphics and Text. That is a
  // one-off cost and it must not land inside a measured window.
  await waitTicks(page, GPU_DRAIN_FRAMES);
}

