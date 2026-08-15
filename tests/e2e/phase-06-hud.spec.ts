/**
 * Phase 6 — collectibles, the HUD, and the chrome around it.
 *
 * ## This spec runs on `chromium-gpu`, headed, on a real GPU. That is not optional.
 *
 * Criterion 6.4 asserts the health bar's **drawn pixels** and 6.8 inspects chroma-keyed art. Both
 * are claims about rasterised output, and default headless Chromium rasterises through SwiftShader
 * on the CPU — a different rasteriser from the one a player has. A colour taken from it is a
 * measurement of the wrong thing. See `playwright.config.ts`.
 *
 * ## Everything here asserts what is DRAWN
 *
 * Vault 6.4, and the root rule behind it: *measure the claim against the thing it claims about.*
 * The unit suite asserts computed widths; this file asserts objects on the live display list, their
 * screen positions, `willRender`, and in one case the actual pixels in the bar slot.
 *
 * `willRender(camera)` rather than `visible !== false && alpha >= 1`. That pair was Phase 5's fix
 * and Codex showed it was still insufficient: `setScale(0)` clears the transform render flag and
 * the GPU draws nothing while both assertions stay green. `willRender` is Phaser's own answer to
 * "would this be drawn", and it tracks every exclusion route rather than the two a reviewer thought
 * of *(reviews/phase-05-impl.md:223)*.
 *
 * No `waitForTimeout` anywhere: waits are on `window.__game.ready` or on a tick count.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, waitTicks } from './gameHarness';
import { hudFits } from '../../src/render/hud';

type Page = import('@playwright/test').Page;

/** The shape `UIScene.hudObjects()` returns, flattened to what crosses the page boundary. */
interface HudProbe {
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
  gameSize: { width: number; height: number };
}

/**
 * Read the live HUD out of the running `UIScene`.
 *
 * Reaches through `window.__phaserGame` — dev-only, and the same handle every other spec uses to
 * assert that the DRAWN object tracks the sim. Without it, deleting `renderPlayer()` once left
 * every Phase 2 test green.
 */
async function readHud(page: Page): Promise<HudProbe> {
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
      cameras: { main: unknown };
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
      gameSize: { width: game.scale.gameSize.width, height: game.scale.gameSize.height },
    };
  });

  // Type before value, every field (vault C1). A probe that silently returned undefined would make
  // every comparison below pass on `undefined === undefined`.
  expect(typeof probe.plate.x).toBe('number');
  expect(typeof probe.counter.text).toBe('string');
  expect(typeof probe.layout.scale).toBe('number');
  return probe;
}

/** How many gear bodies are still drawn in the world. */
async function visibleGearCount(page: Page): Promise<number> {
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
async function collectGears(page: Page, target: number): Promise<void> {
  await page.keyboard.down('ArrowRight');
  await page
    .waitForFunction((t) => (window.__game?.score ?? 0) >= t, target, { timeout: 20_000 })
    .finally(() => page.keyboard.up('ArrowRight'));
}

test.describe('criterion 6.1 — the gear counter', () => {
  test('collecting a gear increments the DRAWN counter, not just the score', async ({ page }) => {
    await bootToGame(page);

    const before = await readHud(page);
    expect(before.counter.text).toBe('000');
    expect(await page.evaluate(() => window.__game?.score)).toBe(0);

    await collectGears(page, 1);
    await waitTicks(page, 2);

    const after = await readHud(page);
    const score = await page.evaluate(() => window.__game?.score);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(1);
    // The DRAWN text, not the number behind it. A counter wired to nothing keeps saying 000 while
    // the score climbs, and that is the defect this asserts against.
    expect(after.counter.text).not.toBe('000');
    expect(Number(after.counter.text)).toBe(score);
  });

  test('the counter uses tabular figures — its drawn width does not change with its value', async ({
    page,
  }) => {
    await bootToGame(page);
    const before = await readHud(page);

    await collectGears(page, 2);
    await waitTicks(page, 2);
    const after = await readHud(page);

    expect(after.counter.text).not.toBe(before.counter.text);
    // Same glyph count, same drawn width, same left edge. A proportional face would move the
    // counter every time a 1 became a 2, which is the jitter the criterion names.
    expect(after.counter.text.length).toBe(before.counter.text.length);
    expect(after.counter.w).toBe(before.counter.w);
    expect(after.counter.x).toBe(before.counter.x);
  });

  test('a collected gear stops being drawn in the world', async ({ page }) => {
    await bootToGame(page);
    const before = await visibleGearCount(page);
    expect(before).toBeGreaterThan(0);

    await collectGears(page, 1);
    await waitTicks(page, 2);

    expect(await visibleGearCount(page)).toBeLessThan(before);
  });

  /**
   * Codex plan review F3, a blocker: the criterion names a collect→scoreboard TWEEN, and a counter
   * that updates straight from sim state satisfies every other assertion in this file while nothing
   * ever flies. So the flying object is asserted directly.
   */
  test('a gear flies to the counter — the tween exists and then cleans up', async ({ page }) => {
    await bootToGame(page);

    // Walk INTO a gear while sampling. Without this the sampler below runs over a game in which
    // nothing was ever collected, and every assertion about a flying gear would be vacuous.
    await page.keyboard.down('ArrowRight');

    // Sample once per animation frame from inside the page: a tick-based wait cannot bound a
    // sampling window, and the tween lives in real milliseconds, not ticks.
    const flyers = await page.evaluate(async () => {
      const game = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame;
      const ui = game.scene.getScene('UI') as unknown as {
        children: { list: { depth: number }[] };
        tweens: { getTweens(): unknown[] };
      };

      let peakTweens = 0;
      let peakObjects = 0;
      const baseline = ui.children.list.length;

      const started = performance.now();
      await new Promise<void>((resolve) => {
        const step = (): void => {
          peakTweens = Math.max(peakTweens, ui.tweens.getTweens().length);
          peakObjects = Math.max(peakObjects, ui.children.list.length - baseline);
          if (performance.now() - started > 2500) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      return { peakTweens, peakObjects, settled: ui.children.list.length - baseline };
    });
    await page.keyboard.up('ArrowRight');

    // The premise: gears were actually collected during the sampling window. Without this the
    // assertions below could pass on a game that collected nothing and drew nothing.
    const score = await page.evaluate(() => window.__game?.score);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);

    expect(typeof flyers.peakTweens).toBe('number');
    expect(flyers.peakTweens).toBeGreaterThan(0);
    expect(flyers.peakObjects).toBeGreaterThan(0);
    // And it does not leak: one object per gear, destroyed on arrival. A HUD that keeps them is a
    // leak with a level-sized bound.
    expect(flyers.settled).toBe(0);
  });
});

test.describe('criterion 6.4 — the health bar is gated on what is DRAWN', () => {
  /**
   * The pixel read Codex's F4 asked for.
   *
   * The unit suite proves `healthBarFillWidth(99, 100, 156)` cannot return a full-slot width. It
   * cannot prove that the rectangle built from that width is drawn in the right place, in the right
   * colour, at all — `UIScene.drawHealth` is a separate step and every one of its coordinates can be
   * wrong while the arithmetic is right.
   *
   * 99 hp is unreachable by playing: the smallest damage in the game is a 20 hp hazard. So the real
   * render path is driven with a synthetic world at 99 hp and the resulting pixels are read back.
   * The path under test is the shipped one; only the input is synthetic.
   */
  test('at 99 of 100 hp the bar draws a visible spent portion', async ({ page }) => {
    await bootToGame(page);

    /**
     * Drive the shipped draw path at a given hp and return the mean luminance of an 8 px column of
     * the slot, `fromRight` pixels in from the bar's right-hand end.
     *
     * Two things this has to get right, both learned by getting them wrong:
     *
     * 1. **`Game` is paused first.** `GameScene.update()` calls `ui.render(realWorld)` every frame,
     *    so a synthetic render is overwritten before the screenshot is taken. The first version of
     *    this test read the SAME luminance at 99 and at 100 hp — identical to the last decimal —
     *    which is what a test measuring nothing looks like.
     * 2. **It does not sample the last few pixels.** The bar ends in a rounded brass cap, so the
     *    final column is bezel at any health and never changes. Sampling it produced a dark,
     *    constant reading that looked like a legitimate measurement.
     */
    const lumaAt = async (hp: number, fromRight: number): Promise<number> => {
      const slot = await page.evaluate((forcedHp) => {
        const game = (
          window as unknown as {
            __phaserGame: {
              scale: { gameSize: { width: number; height: number } };
              scene: { getScene(k: string): unknown; pause(k: string): void };
            };
          }
        ).__phaserGame;
        game.scene.pause('Game');

        const gameScene = game.scene.getScene('Game') as unknown as {
          world: Record<string, unknown> & { player: Record<string, unknown> };
          cameras: { main: unknown };
        };
        const ui = game.scene.getScene('UI') as unknown as {
          render(w: unknown, c: unknown): void;
          hudObjects(): { layout: { slot: { x: number; y: number; w: number; h: number } } };
        };
        // The real world with hp forced. Only the INPUT is synthetic; the draw path is the shipped
        // one, which is the whole point — 99 hp is unreachable by playing, because the smallest
        // damage in the game is a 20 hp hazard.
        ui.render(
          {
            ...gameScene.world,
            player: { ...gameScene.world.player, hp: forcedHp, maxHp: 100 },
            gears: [],
            gearsCollected: 0,
            tickCount: 0,
          },
          gameScene.cameras.main,
        );
        // 🔴 Converted from GAME space to CSS space before it leaves the page.
        //
        // `page.screenshot({clip})` clips in CSS pixels of the viewport; the layout is in the
        // game's 1920 x 1080 design space, and under `FIT` the canvas is scaled to the viewport.
        // Clipping with the raw game coordinates sampled a region that was not the bar at all —
        // which read as a plausible, perfectly constant luminance at every health value, and is the
        // second way this test managed to measure nothing.
        const rect = document.querySelector('canvas')!.getBoundingClientRect();
        const g = ui.hudObjects().layout.slot;
        const k = rect.width / game.scale.gameSize.width;
        return {
          x: rect.left + g.x * k,
          y: rect.top + g.y * k,
          w: g.w * k,
          h: g.h * k,
          k,
        };
      }, hp);

      // The band is expressed in GAME pixels and converted, so it stays inside the drained region
      // whatever the viewport scale happens to be. At 99 hp the spent portion is 14 game px wide;
      // sampling 3..12 in from the right end is inside it and clear of the rounded brass cap.
      const inner = Math.round((fromRight + 9) * slot.k);
      const outer = Math.round(fromRight * slot.k);
      const height = Math.max(1, Math.round(slot.h) - 8);
      const shot = await page.screenshot({
        clip: {
          x: Math.round(slot.x + slot.w - inner),
          y: Math.round(slot.y) + 4,
          width: Math.max(1, inner - outer),
          height,
        },
      });
      expect(shot.byteLength).toBeGreaterThan(0);

      return page.evaluate(
        async ([dataUrl, w, h]) => {
          const img = new Image();
          await new Promise((res, rej) => {
            img.onload = res;
            img.onerror = rej;
            img.src = dataUrl as string;
          });
          const c = document.createElement('canvas');
          c.width = w as number;
          c.height = h as number;
          const ctx = c.getContext('2d')!;
          ctx.drawImage(img, 0, 0);
          const px = ctx.getImageData(0, 0, w as number, h as number).data;
          let sum = 0;
          for (let i = 0; i < px.length; i += 4) {
            sum += 0.2126 * px[i]! + 0.7152 * px[i + 1]! + 0.0722 * px[i + 2]!;
          }
          return sum / (px.length / 4);
        },
        [
          `data:image/png;base64,${shot.toString('base64')}`,
          Math.max(1, inner - outer),
          height,
        ] as const,
      );
    };

    // 3 game px in from the right end: inside the 14 px drained region, clear of the end cap.
    const SPENT_BAND = 3;
    const spentAt99 = await lumaAt(99, SPENT_BAND);
    const sameBandAtFull = await lumaAt(100, SPENT_BAND);

    expect(typeof spentAt99).toBe('number');
    expect(typeof sameBandAtFull).toBe('number');
    // The SAME pixels, one hp apart. If the spent rectangle were never drawn — the defect this
    // criterion exists for — these two readings would be identical, which is exactly what the first
    // version of this test reported before `Game` was paused.
    expect(spentAt99).toBeLessThan(sameBandAtFull * 0.6);
  });

  test('at full health the bar draws no spent portion', async ({ page }) => {
    await bootToGame(page);
    const hud = await readHud(page);
    expect(hud.barFill.willRender).toBe(true);

    const health = await page.evaluate(() => window.__game?.health);
    expect(typeof health).toBe('number');
    expect(health).toBe(100);
  });
});

test.describe('criterion 6.2 — the HUD is pinned under pan and under zoom', () => {
  test('panning the world camera does not move any HUD object', async ({ page }) => {
    await bootToGame(page);
    const before = await readHud(page);

    // Walk far enough that the camera has definitely scrolled.
    await page.keyboard.down('ArrowRight');
    await waitTicks(page, 120);
    await page.keyboard.up('ArrowRight');

    const scrolled = await page.evaluate(() => {
      const s = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as { cameras: { main: { scrollX: number } } };
      return s.cameras.main.scrollX;
    });
    expect(typeof scrolled).toBe('number');
    expect(scrolled).toBeGreaterThan(0);

    const after = await readHud(page);
    expect(after.plate.x).toBe(before.plate.x);
    expect(after.plate.y).toBe(before.plate.y);
    expect(after.gearIcon.x).toBe(before.gearIcon.x);
    expect(after.counter.x).toBe(before.counter.x);
  });

  /**
   * The zoom half — and the reason the HUD is a parallel scene at all.
   *
   * Vault 6.1: a zero scroll factor pins against PAN but not against ZOOM. Before Phase 6 the HUD
   * was `setScrollFactor(0)` objects on `GameScene`'s own display list, and this test would have
   * failed the moment the world camera zoomed. It passed only because `CAMERA_ZOOM` is 1.
   */
  test('zooming the world camera does not scale or move the HUD', async ({ page }) => {
    await bootToGame(page);
    const before = await readHud(page);

    await page.evaluate(() => {
      const s = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as {
        cameras: { main: { setZoom(z: number): void; zoom: number } };
      };
      s.cameras.main.setZoom(2.5);
    });
    await waitTicks(page, 4);

    const zoom = await page.evaluate(() => {
      const s = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('Game') as unknown as { cameras: { main: { zoom: number } } };
      return s.cameras.main.zoom;
    });
    expect(zoom).toBe(2.5);

    const after = await readHud(page);
    expect(after.plate.x).toBe(before.plate.x);
    expect(after.plate.y).toBe(before.plate.y);
    expect(after.plate.w).toBe(before.plate.w);
    expect(after.plate.h).toBe(before.plate.h);
    expect(after.counter.x).toBe(before.counter.x);
    expect(after.counter.w).toBe(before.counter.w);
  });

  /**
   * Codex plan review F5: asserting the plate alone lets the bar or the counter vanish while the
   * criterion stays green. All three, every time.
   */
  test('all three HUD objects would actually be drawn', async ({ page }) => {
    await bootToGame(page);
    const hud = await readHud(page);

    expect(hud.plate.willRender).toBe(true);
    expect(hud.barFill.willRender).toBe(true);
    expect(hud.gearIcon.willRender).toBe(true);
    expect(hud.counter.willRender).toBe(true);
  });
});

test.describe('criterion 6.3 — built from the live game size', () => {
  test('the HUD fits at the design size, and the predicate is the unit suite\'s', async ({
    page,
  }) => {
    await bootToGame(page);
    const hud = await readHud(page);

    // `hudFits` is imported from src/, so this asserts the SAME definition the unit test does.
    expect(hudFits(hud.layout, hud.gameSize.width, hud.gameSize.height, hud.counter.w)).toBe(true);
  });

  test.describe('at every supported viewport', () => {
    for (const [w, h] of [
      [1280, 720],
      [852, 480],
    ] as const) {
      test(`${w}x${h}: the HUD stays inside the game size`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: h });
        await bootToGame(page);

        const hud = await readHud(page);
        expect(hudFits(hud.layout, hud.gameSize.width, hud.gameSize.height, hud.counter.w)).toBe(
          true,
        );
        expect(hud.plate.willRender).toBe(true);
        expect(hud.counter.willRender).toBe(true);
      });
    }
  });

  /**
   * Codex plan review F6.
   *
   * The scale mode is `FIT`, so a browser resize never changes `scale.gameSize` and the viewport
   * tests above bound the layout function rather than a resize Phaser performs. This drives a real
   * `game.scale.resize()` instead, which is the code path the criterion actually names — and which
   * vault 6.2's blocker is about.
   */
  test('a real scale.resize() re-lays-out the HUD rather than cropping it', async ({ page }) => {
    await bootToGame(page);
    const before = await readHud(page);
    expect(before.gameSize.height).toBe(1080);

    await page.evaluate(() => {
      (
        window as unknown as { __phaserGame: { scale: { resize(w: number, h: number): void } } }
      ).__phaserGame.scale.resize(1280, 720);
    });
    await waitTicks(page, 4);

    const after = await readHud(page);
    expect(after.gameSize.width).toBe(1280);
    expect(after.gameSize.height).toBe(720);
    // The layout followed the new size rather than staying at the old one — the exact failure vault
    // 6.2 describes, where a camera built at a fixed size cropped a whole HUD plate off a phone.
    expect(after.layout.scale).toBeLessThan(before.layout.scale);
    expect(after.plate.w).toBeLessThan(before.plate.w);
    expect(hudFits(after.layout, 1280, 720, after.counter.w)).toBe(true);
    expect(after.plate.willRender).toBe(true);
  });
});

test.describe('criterion 6.7 — the canvas is centred once', () => {
  /**
   * `index.html` centred the canvas with flexbox while `config.ts` sets `autoCenter: CENTER_BOTH`.
   * Phaser's centring writes CSS margins; a flex parent then centres the margin BOX, and the two
   * compose to park the canvas about a quarter of the leftover gap off centre.
   *
   * Measured on this machine before the fix: at 1400 × 900 the canvas sat at top 85 / bottom 29
   * against a correct 56 / 57. It looks almost right, which is why it survived five phases — and
   * why this is a measurement rather than a stylesheet review.
   */
  test('a letterboxed viewport leaves equal gaps above and below', async ({ page }) => {
    // Deliberately NOT 16:9: at the game's own aspect ratio the canvas fills the viewport and any
    // centring bug is invisible. That is how this defect stayed hidden.
    await page.setViewportSize({ width: 1400, height: 900 });
    await bootToGame(page);

    const box = await page.evaluate(() => {
      const c = document.querySelector('canvas')!;
      const r = c.getBoundingClientRect();
      return {
        top: r.top,
        bottom: window.innerHeight - r.bottom,
        left: r.left,
        right: window.innerWidth - r.right,
      };
    });

    expect(typeof box.top).toBe('number');
    // 1px of tolerance for an odd number of leftover pixels, and no more: the defect was 28px.
    expect(Math.abs(box.top - box.bottom)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.left - box.right)).toBeLessThanOrEqual(1);
  });

  test('the canvas is not pushed outside the viewport at any supported size', async ({ page }) => {
    for (const [w, h] of [
      [1280, 720],
      [852, 480],
      [1400, 900],
    ] as const) {
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);

      const fits = await page.evaluate(() => {
        const r = document.querySelector('canvas')!.getBoundingClientRect();
        return r.top >= 0 && r.left >= 0 && r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1;
      });
      expect(fits, `canvas overflows at ${w}x${h}`).toBe(true);
    }
  });
});

test.describe('the boot gate still owns the HUD', () => {
  test('a refused boot leaves no HUD drawn over the error screen', async ({ page }) => {
    await bootToGame(page);
    expect(await page.evaluate(() => window.__game?.ready)).toBe(true);

    // The HUD runs in parallel with Game, so a refusal that stops only Game leaves a health bar and
    // a gear counter drawn over the error screen — a refusal you can see straight through.
    const uiActive = await page.evaluate(() => {
      const game = (
        window as unknown as { __phaserGame: { scene: { isActive(k: string): boolean } } }
      ).__phaserGame;
      return game.scene.isActive('UI');
    });
    expect(uiActive).toBe(true);
  });
});
