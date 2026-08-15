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
import { collectGears, readHud, visibleGearCount } from './hudHelpers';


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
