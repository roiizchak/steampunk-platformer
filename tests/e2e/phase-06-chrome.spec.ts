/**
 * Phase 6 — where the HUD SITS: pinning, resizing, and the canvas itself.
 *
 * The sibling of `phase-06-hud.spec.ts`, which owns what the HUD SAYS (criteria 6.1 and 6.4). They
 * were one file until it reached 601 lines against this project's 400-line ceiling; the seam is the
 * QA gate's own, not an arbitrary halving. Shared probes live in `hudHelpers.ts`.
 *
 * ## Runs on `chromium-gpu`, headed, on a real GPU
 *
 * Criterion 6.7 measures the canvas's position in the page and 6.3 drives a real resize. Both are
 * claims about layout as a browser actually performs it, and this project's rule is that a headless
 * software rasteriser is not the thing any of these criteria claim about. See `playwright.config.ts`.
 *
 * ## Everything here asserts what is DRAWN
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
import { readHud } from './hudHelpers';
import { hudFits } from '../../src/render/hud';


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

    // Image and Text render from a texture, so `willRender` is the right question for these three.
    expect(hud.plate.willRender).toBe(true);
    expect(hud.gearIcon.willRender).toBe(true);
    expect(hud.counter.willRender).toBe(true);

    /**
     * 🔴 **`barFill` is a `Graphics`, and `willRender` is the wrong question for one** — Codex
     * implementation finding C5. A Graphics reports `willRender` true whether or not a single
     * command was ever queued into it, so this assertion passed on an empty command buffer. Its
     * sibling in `phase-06-hud.spec.ts` was converted; this one was left behind.
     *
     * ⚠️ The buffer must be read in a **damaged** state, not at boot. `drawHealth` computes
     * `spentW === 0` at full health and deliberately queues nothing — so asserting `length > 0`
     * here on a freshly booted game would be a false RED, failing on correct behaviour. The
     * synthetic render below forces the one state where a non-empty buffer is the correct answer.
     */
    const commands = await page.evaluate(() => {
      const game = (
        window as unknown as {
          __phaserGame: {
            scene: { getScene(k: string): unknown; pause(k: string): void; resume(k: string): void };
          };
        }
      ).__phaserGame;
      // Paused, or `GameScene.update()` overwrites the synthetic render before it can be read.
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
          player: { ...gs.world.player, hp: 50, maxHp: 100 },
          gears: [],
          gearsCollected: 0,
          tickCount: 0,
        },
        gs.cameras.main,
      );
      const n = ui.hudObjects().barFill.commandBuffer.length;
      game.scene.resume('Game');
      return n;
    });

    expect(typeof commands, 'the command buffer stopped being readable').toBe('number');
    expect(
      commands,
      'the health bar queued NO Graphics commands at 50 of 100 hp. `willRender` would still be ' +
        'true here, which is exactly why it is not the assertion.',
    ).toBeGreaterThan(0);
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

    /**
     * The camera is checked at BOTH sizes, and the second check alone is not enough — found by the
     * red run. A camera pinned to a literal that happens to equal the resize TARGET (1280 x 720)
     * satisfies the after-check perfectly and is still vault 6.2's defect; it is simply wrong
     * before the resize instead of after. Asserting only the end state made the gate pass on the
     * mutation it exists to catch.
     */
    expect(
      { w: before.uiCamera.width, h: before.uiCamera.height },
      `the UI camera is ${before.uiCamera.width}x${before.uiCamera.height} at the design size ` +
        `${before.gameSize.width}x${before.gameSize.height} — it was built from a literal, not ` +
        `from the live game size`,
    ).toEqual({ w: before.gameSize.width, h: before.gameSize.height });

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

    /**
     * 🔴 **The UI camera itself, read rather than inferred** — Codex implementation finding C4, and
     * the qa-expert owner independently from the other side.
     *
     * Everything above asserts the *layout numbers* and `hudFits`. None of it looks at the camera
     * the HUD is actually drawn through. The no-cropping guarantee holds today only because
     * `UIScene` never creates an explicit camera and inherits one Phaser resizes for it — an
     * emergent property. Vault 6.2's blocker is exactly the opposite case: a second camera built at
     * an explicit size never auto-resizes, and at a hardcoded 1280 it cropped a whole HUD plate off
     * a phone. Nothing in this suite would have noticed a regression that introduced one.
     */
    expect(
      { w: after.uiCamera.width, h: after.uiCamera.height },
      `the UI camera is ${after.uiCamera.width}x${after.uiCamera.height} after a resize to ` +
        `${after.gameSize.width}x${after.gameSize.height}. A camera that does not track the game ` +
        `size crops the HUD — vault 6.2, where a camera pinned at 1280 lost a whole plate.`,
    ).toEqual({ w: after.gameSize.width, h: after.gameSize.height });

    // Size alone is not enough: a correctly sized camera that is offset, scrolled or zoomed crops
    // the HUD just as effectively, and `hudFits` works in layout space so it cannot see any of it.
    expect(
      {
        x: after.uiCamera.x,
        y: after.uiCamera.y,
        scrollX: after.uiCamera.scrollX,
        scrollY: after.uiCamera.scrollY,
        zoom: after.uiCamera.zoom,
      },
      'the UI camera is no longer at the origin, unscrolled and unzoomed — the HUD is drawn ' +
        'through it, so any of these silently shifts or scales the whole HUD',
    ).toEqual({ x: 0, y: 0, scrollX: 0, scrollY: 0, zoom: 1 });
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
  /**
   * Both boxing directions, because they are different code paths through `FIT`.
   *
   * 🔴 Until now only the **letterboxed** case was exercised (1400 × 900, taller than 16:9, so the
   * fit is width-limited and the slack lands top and bottom). A **pillarboxed** viewport — wider
   * than 16:9, height-limited, slack on the left and right — was never tested, and it is the other
   * half of the same centring composition. *(qa-expert brief 2 #6.)*
   *
   * ⚠️ `deviceScaleFactor` other than 1 is still unexercised and is recorded as deferred: `autoRound`
   * floors CSS sizes, so DPR 1.25/1.5 could round asymmetrically. It needs an ENGINE-NOTES pass on
   * Phaser's rounding before a bound means anything, and it is carried to Phase 9 rather than
   * guessed at here.
   */
  for (const [w, h, boxing] of [
    [1400, 900, 'letterboxed'],
    [2000, 900, 'pillarboxed'],
  ] as const) {
    test(`a ${boxing} viewport (${w}x${h}) leaves equal gaps on both sides`, async ({ page }) => {
      // Deliberately NOT 16:9: at the game's own aspect ratio the canvas fills the viewport and any
      // centring bug is invisible. That is how this defect stayed hidden for five phases.
      await page.setViewportSize({ width: w, height: h });
      await bootToGame(page);

      const box = await page.evaluate(() => {
        const c = document.querySelector('canvas')!;
        const r = c.getBoundingClientRect();
        return {
          top: r.top,
          bottom: window.innerHeight - r.bottom,
          left: r.left,
          right: window.innerWidth - r.right,
          width: r.width,
          height: r.height,
        };
      });

      expect(typeof box.top).toBe('number');
      // 1px of tolerance for an odd number of leftover pixels, and no more: the defect was 28px.
      expect(Math.abs(box.top - box.bottom), `${boxing}: vertical gaps unequal`).toBeLessThanOrEqual(1);
      expect(Math.abs(box.left - box.right), `${boxing}: horizontal gaps unequal`).toBeLessThanOrEqual(1);

      /**
       * 🔴 Equal gaps are satisfied by a canvas of the WRONG SIZE that happens to be centred — a
       * zero-width canvas has perfectly equal gaps. `FIT` must preserve the game's 16:9 aspect
       * whichever axis is the limiting one, so that is what pins the size.
       */
      expect(box.width, `${boxing}: canvas has no width`).toBeGreaterThan(0);
      expect(box.height, `${boxing}: canvas has no height`).toBeGreaterThan(0);
      expect(
        Math.abs(box.width / box.height - 16 / 9),
        `${boxing}: the canvas is ${box.width}x${box.height}, aspect ` +
          `${(box.width / box.height).toFixed(4)} against the game's 1.7778. FIT stretched or ` +
          `mis-fitted it, which equal gaps alone cannot see.`,
      ).toBeLessThan(0.01);
      // The slack is on the axis this boxing NAMES. Without it, both cases could pass while FIT
      // silently picked the wrong limiting axis.
      if (boxing === 'letterboxed') {
        expect(box.top, 'letterboxed: expected vertical slack').toBeGreaterThan(0);
      } else {
        expect(box.left, 'pillarboxed: expected horizontal slack').toBeGreaterThan(0);
      }
    });
  }

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
