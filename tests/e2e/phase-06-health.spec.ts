/**
 * Phase 6 — **criterion 6.4**, the health bar, gated on what is DRAWN.
 *
 * Split from `phase-06-hud.spec.ts` when the trajectory and real-damage coverage added this session
 * took that file to 579 lines against the project's 400-line ceiling. The seam is the criterion
 * boundary the QA gate already uses, not an arbitrary cut: `phase-06-hud.spec.ts` keeps **6.1**,
 * the gear counter and its collect tween; this file is **6.4**, one bar and what it draws.
 *
 * ## This spec runs on `chromium-gpu`, headed, on a real GPU. That is not optional.
 *
 * 6.4 asserts the bar's **drawn pixels**, and default headless Chromium rasterises through
 * SwiftShader on the CPU — a different rasteriser from the one a player has, so a colour taken from
 * it is a measurement of the wrong thing. See `playwright.config.ts`.
 *
 * ## Two synthetic tests and one real one, deliberately
 *
 * The first two pause `Game` and call `ui.render()` with a forced hp, because **99 of 100 hp is
 * unreachable by playing** — the smallest damage in the game is a 20 hp hazard, and 99 is the value
 * vault 6.4 is actually about (a meter that drew 315 of 318 px and read as full).
 *
 * But a synthetic render proves the DRAWING and not the WIRING: both would still pass with
 * `renderHud()` deleted from `GameScene.update()`, while the player's real bar froze in production.
 * The third test therefore takes real hazard damage, never pauses anything, and never renders
 * anything itself *(qa-expert brief 2 #4)*.
 */

import { expect, test } from '@playwright/test';
import { bootToGame, waitTicks } from './gameHarness';
import { waitForHud } from './hudHelpers';

test.describe('criterion 6.4 — the health bar is gated on what is DRAWN', () => {
  /**
   * The pixel read Codex's F4 asked for.
   *
   * The unit suite proves `healthBarFillWidth(99, 100, 239)` cannot return a full-slot width. It
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
    // 🔴 `bootToGame` waits on `window.__game.ready`, which `GameScene.create()` sets — but the HUD
    // is a QUEUED parallel scene, so at that instant `UIScene.create()` has not run and
    // `hudObjects()` returns unbuilt fields. This test reaches `hudObjects()` directly rather than
    // through `readHud`, which guards itself, so the guard has to be here. It worked only because a
    // CDP round-trip happens to outlast one Phaser step — a latent flake, not a guarantee.
    await waitForHud(page);

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
      // whatever the viewport scale happens to be. At 99 hp the spent portion is 22 game px wide (239 slot - 217 fill);
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

  /**
   * 🔴 This test asserted only `barFill.willRender === true` and `health === 100`, and could not
   * fail for the reason its name states: a `Graphics` reports `willRender` true whether or not any
   * rectangle was ever queued into it. The code-reviewer gate owner found it, in the spec whose own
   * header forbids exactly this — asserting a value where the drawn thing is the criterion.
   *
   * The replacement reads Phaser's own **command buffer** — the list of drawing operations queued
   * on the `Graphics` — which is the closest thing to "what did you actually draw" that is
   * observable without sampling pixels, and which is empty by construction at full health because
   * `drawHealth` skips the `fillRect` when `spentW <= 0`.
   */
  test('at full health the bar queues NO spent rectangle, and below it queues one', async ({
    page,
  }) => {
    await bootToGame(page);
    // 🔴 `bootToGame` waits on `window.__game.ready`, which `GameScene.create()` sets — but the HUD
    // is a QUEUED parallel scene, so at that instant `UIScene.create()` has not run and
    // `hudObjects()` returns unbuilt fields. This test reaches `hudObjects()` directly rather than
    // through `readHud`, which guards itself, so the guard has to be here. It worked only because a
    // CDP round-trip happens to outlast one Phaser step — a latent flake, not a guarantee.
    await waitForHud(page);

    const commandsAt = async (hp: number): Promise<number> =>
      page.evaluate((forcedHp) => {
        const game = (
          window as unknown as {
            __phaserGame: { scene: { getScene(k: string): unknown; pause(k: string): void } };
          }
        ).__phaserGame;
        game.scene.pause('Game');
        const gs = game.scene.getScene('Game') as unknown as {
          world: Record<string, unknown> & { player: Record<string, unknown> };
          cameras: { main: unknown };
        };
        const ui = game.scene.getScene('UI') as unknown as {
          render(w: unknown, c: unknown): void;
          hudObjects(): { barFill: { commandBuffer: unknown[] } };
        };
        ui.render(
          {
            ...gs.world,
            player: { ...gs.world.player, hp: forcedHp, maxHp: 100 },
            gears: [],
            gearsCollected: 0,
            tickCount: 0,
          },
          gs.cameras.main,
        );
        return ui.hudObjects().barFill.commandBuffer.length;
      }, hp);

    const atFull = await commandsAt(100);
    const atHalf = await commandsAt(50);

    expect(typeof atFull).toBe('number');
    expect(typeof atHalf).toBe('number');
    // Nothing queued at full health — the art's own gold bar IS the full state.
    expect(atFull).toBe(0);
    // And something queued below it. If `drawHealth` stopped drawing entirely, this goes red.
    expect(atHalf).toBeGreaterThan(0);
  });

  /**
   * 🔴 **The one test in this file that goes through the real per-frame call site.**
   *
   * Both tests above pause `Game` and call `ui.render()` themselves with a synthetic world. That is
   * deliberate and stays — 99 hp is unreachable by playing, because the smallest damage in the game
   * is a 20 hp hazard — but it means **both of them would still pass if `renderHud()` were deleted
   * from `GameScene.update()`**. The player's real bar would freeze at full in production and
   * criterion 6.4 would report green. That is the same shape as the Phase 5 defect this file's
   * header describes, one call site over. *(qa-expert brief 2 #4.)*
   *
   * So this one takes real damage by playing, never pauses anything, never renders anything itself,
   * and asserts the DRAWN width tracks hp across **two** damage events. One non-empty buffer proves
   * a command was queued once; a width that follows the health value proves the wiring is live.
   */
  test('the bar the GAME LOOP draws tracks real damage, twice', async ({ page }) => {
    test.setTimeout(90_000);
    await bootToGame(page);
    // 🔴 `bootToGame` waits on `window.__game.ready`, which `GameScene.create()` sets — but the HUD
    // is a QUEUED parallel scene, so at that instant `UIScene.create()` has not run and
    // `hudObjects()` returns unbuilt fields. This test reaches `hudObjects()` directly rather than
    // through `readHud`, which guards itself, so the guard has to be here. It worked only because a
    // CDP round-trip happens to outlast one Phaser step — a latent flake, not a guarantee.
    await waitForHud(page);

    /**
     * The drawn spent rectangle's width, straight off the live `Graphics` command buffer.
     *
     * Walks the buffer the way `phase-05-combat.spec.ts` does rather than trusting its length:
     * `FILL_STYLE = 7` (skip 3 operands), `FILL_RECT = 3` (x, y, w, h). The `w` operand IS the
     * drained portion, so it grows as health falls.
     */
    interface DrawnRect {
      w: number;
      x: number;
      y: number;
      slot: { x: number; y: number; w: number; h: number };
    }

    const drawnSpentRect = (): Promise<DrawnRect> =>
      page.evaluate(() => {
        const game = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame;
        const ui = game.scene.getScene('UI') as unknown as {
          hudObjects(): {
            barFill: { commandBuffer: number[] };
            layout: { slot: { x: number; y: number; w: number; h: number } };
          };
        };
        const o = ui.hudObjects();
        const buf = o.barFill.commandBuffer;
        let best = { w: 0, x: 0, y: 0 };
        // FILL_STYLE pushes [op, color, alpha] — THREE elements. Advancing by 4 here desynced the
        // walk onto a coordinate, missed every FILL_RECT, and reported 0 as if the bar were never
        // drawn. Same structural walk as phase-05-combat.spec.ts, which had it right.
        for (let i = 0; i < buf.length; ) {
          const op = buf[i];
          if (op === 7) i += 3;
          else if (op === 3) {
            const w = buf[i + 3] ?? 0;
            if (w > best.w) best = { w, x: buf[i + 1] ?? 0, y: buf[i + 2] ?? 0 };
            i += 5;
          } else i += 1;
        }
        return { ...best, slot: o.layout.slot };
      });

    /**
     * 🔴 The rectangle has to be in the RIGHT PLACE, not merely the right size.
     *
     * The width assertions below would all pass on a bar drawn at (0, 0), or anywhere else off the
     * plate entirely — the walk reads only the `w` operand. This project has shipped a
     * drawn-in-the-wrong-place defect before, so position is asserted rather than assumed.
     * *(qa-expert brief 2.)*
     */
    const expectInsideSlot = (r: DrawnRect, when: string): void => {
      expect(r.x, `${when}: the drained rect starts left of the bar slot`).toBeGreaterThanOrEqual(
        r.slot.x - 1,
      );
      expect(r.y, `${when}: the drained rect is above the bar slot`).toBeGreaterThanOrEqual(r.slot.y - 1);
      expect(
        r.x + r.w,
        `${when}: the drained rect (x ${r.x}, w ${r.w}) runs past the right end of the bar slot ` +
          `(x ${r.slot.x}, w ${r.slot.w}) — it is the right size in the wrong place`,
      ).toBeLessThanOrEqual(r.slot.x + r.slot.w + 1);
      expect(r.y, `${when}: the drained rect is below the bar slot`).toBeLessThanOrEqual(
        r.slot.y + r.slot.h + 1,
      );
    };

    const drawnSpentWidth = async (): Promise<number> => (await drawnSpentRect()).w;

    const health = (): Promise<number> =>
      page.evaluate(() => (window as unknown as { __game: { health: number } }).__game.health);

    expect(await health(), 'the player did not start at full health').toBe(100);
    // Nothing drained yet, so the game loop's own render queues no rectangle.
    expect(await drawnSpentWidth()).toBe(0);

    // ---- damage 1: walk into the hazard, by playing -------------------------------------------
    const hpBefore = await health();
    await page.keyboard.down('ArrowRight');
    try {
      await page.waitForFunction(
        (hp) => (window as unknown as { __game: { health: number } }).__game.health < hp,
        hpBefore,
        { timeout: 30_000 },
      );
    } finally {
      await page.keyboard.up('ArrowRight');
    }
    await waitTicks(page, 20);

    const hp1 = await health();
    const rect1 = await drawnSpentRect();
    const width1 = rect1.w;
    expectInsideSlot(rect1, "after the first hit");
    expect(hp1, 'the hazard did no damage').toBeLessThan(hpBefore);
    expect(
      width1,
      `health fell to ${hp1} but the bar the GAME LOOP draws still queues a ${width1}px drained ` +
        `region. renderHud() is not reaching UIScene from GameScene.update() — the synthetic tests ` +
        `above would not notice, because they call ui.render() themselves.`,
    ).toBeGreaterThan(0);

    // ---- damage 2: it has to keep tracking ----------------------------------------------------
    // A single non-empty buffer is satisfied by a HUD that rendered once and then froze. Only a
    // second, larger drained region proves the bar is still following health every frame.
    //
    // 🔴 Retreat first, and this is not padding. Hazard knockback leaves the player just short of
    // the strip, and the post-hit invulnerability window outlasts the time it takes to walk the
    // 192px across it — so simply holding right again crosses the whole hazard unscathed and the
    // second hit never lands. Backing off and re-approaching spends the window on the way in.
    await page.keyboard.down('ArrowLeft');
    await waitTicks(page, 45);
    await page.keyboard.up('ArrowLeft');

    await page.keyboard.down('ArrowRight');
    try {
      await page.waitForFunction(
        (hp) => (window as unknown as { __game: { health: number } }).__game.health < hp,
        hp1,
        { timeout: 30_000 },
      );
    } finally {
      await page.keyboard.up('ArrowRight');
    }
    await waitTicks(page, 20);

    const hp2 = await health();
    const rect2 = await drawnSpentRect();
    const width2 = rect2.w;
    expectInsideSlot(rect2, "after the second hit");
    expect(hp2, 'the second hazard hit did no damage').toBeLessThan(hp1);
    expect(
      width2,
      `health fell again (${hp1} -> ${hp2}) but the drawn drained region did not grow ` +
        `(${width1}px -> ${width2}px). The bar rendered once and froze.`,
    ).toBeGreaterThan(width1);
  });
});
