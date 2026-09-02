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
import { collectGears, readHud, visibleGearCount, waitForHud } from './hudHelpers';
import { MAX_LEVEL_GEARS } from '../../src/game/constants';


test.describe('criterion 6.1 — the gear counter', () => {
  test('collecting a gear increments the DRAWN counter, not just the score', async ({ page }) => {
    await bootToGame(page);

    const before = await readHud(page);
    // 🔴 RE-TAKEN 2026-08-23 (inventory 3.8). This read '000'. `counterText` now derives its pad width
  // from `MAX_LEVEL_GEARS` (64), so a third digit is unreachable and `007` no longer reads as a
  // placeholder. Derived here too, so the spec and the counter cannot drift apart.
  expect(before.counter.text).toBe('0'.repeat(String(MAX_LEVEL_GEARS).length));
    expect(await page.evaluate(() => window.__game?.score)).toBe(0);

    await collectGears(page, 1);
    await waitTicks(page, 2);

    const after = await readHud(page);
    const score = await page.evaluate(() => window.__game?.score);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThanOrEqual(1);
    // The DRAWN text, not the number behind it. A counter wired to nothing keeps saying 000 while
    // the score climbs, and that is the defect this asserts against.
    expect(after.counter.text).not.toBe('0'.repeat(String(MAX_LEVEL_GEARS).length));
    expect(Number(after.counter.text)).toBe(score);
  });

  test('the DIGITS are level with the gear icon, measured in the real font', async ({ page }) => {
    /**
     * 🔴 The owner reported this twice, from a phone, and both repairs shipped wrong — once
     * high, once **4.4 px low**. Nothing could catch it: the unit gates assert `hudLayout` honours
     * whatever fraction it is handed, and the source-text gate asserts `UIScene` hands it one.
     * Neither has a font. The quantity that was wrong is only knowable in a browser, so it is
     * asserted in a browser.
     *
     * The two mistakes are the two halves of the measurement:
     *   1. guessing the descent instead of measuring it;
     *   2. measuring, but dividing by `TextMetrics.fontSize` — which is `ascent + descent`, the box
     *      HEIGHT, not the font size — and measuring the style's test string rather than the digits.
     */
    await bootToGame(page);
    await waitForHud(page);

    const m = await page.evaluate(() => {
      interface Ui {
        hudObjects(): {
          gearIcon: { y: number };
          layout: { counter: { fontPx: number } };
          counter: {
            y: number;
            originY: number;
            text: string;
            getTextMetrics(): { ascent: number; descent: number };
          };
        };
      }
      const game = (window as unknown as { __phaserGame: Phaser.Game }).__phaserGame;
      const ui = game.scene.getScene('UI') as unknown as Ui;
      const { gearIcon, counter, layout } = ui.hudObjects();
      const ctx = (counter as unknown as { context: CanvasRenderingContext2D }).context;
      const box = ctx.measureText(counter.text);
      return {
        iconCentreY: gearIcon.y,
        fontPx: layout.counter.fontPx,
        boxTop: counter.y,
        originY: counter.originY,
        layoutAscent: counter.getTextMetrics().ascent,
        digitInkAscent: box.actualBoundingBoxAscent,
        digitInkDescent: box.actualBoundingBoxDescent,
      };
    });

    // Non-vacuity first: a browser that measured nothing would report zeroes and every difference
    // below would be trivially small.
    expect(m.layoutAscent, 'the font was never measured').toBeGreaterThan(10);
    expect(m.digitInkAscent, 'the digits were never measured').toBeGreaterThan(10);
    expect(m.originY, 'counter.y stopped meaning the top of the glyph box').toBe(0);

    // ⚠️ The two measurements must DIFFER, or this viewport cannot tell a correct placement
    // from the naive one and the case is decoration *(C2)*. A face whose figures reach the test
    // string's ascent would make every scheme agree.
    expect(
      m.layoutAscent - m.digitInkAscent,
      'the digits reach the layout ascent — this font cannot distinguish the two schemes',
    ).toBeGreaterThan(4);

    // Phaser puts the baseline at `boxTop + ascent`; the ink runs `digitInkAscent` above it and
    // `digitInkDescent` below (0 for figures on most faces).
    const baseline = m.boxTop + m.layoutAscent;
    const inkCentre = baseline - m.digitInkAscent / 2 + m.digitInkDescent / 2;
    expect(
      inkCentre - m.iconCentreY,
      `digits at ${inkCentre.toFixed(1)}, icon at ${m.iconCentreY.toFixed(1)}`,
    ).toBeLessThanOrEqual(1);
    expect(inkCentre - m.iconCentreY).toBeGreaterThanOrEqual(-1);

    // 🔴 And the defect the owner saw is genuinely out of range, not merely inside a loose bound.
    //
    // ⚠️ The thing that was wrong was **the nudge, not the centring**. On this face the ink centre
    // lands almost exactly half the font below the box top (`36 - 28/2 = 22`, against a 44 px font),
    // so plain box-centring is right here by arithmetic coincidence — do not assert that box-centring
    // misses, because it does not. Both retired schemes were corrections applied ON TOP of it, and
    // it is those that pushed the digits off: 0.105 by guess, then a measured 0.1 whose denominator
    // was `ascent + descent` rather than the font size.
    const shippedTop = m.iconCentreY - m.fontPx / 2 + m.fontPx * 0.1;
    const shippedInk = shippedTop + m.layoutAscent - m.digitInkAscent / 2 + m.digitInkDescent / 2;
    expect(
      shippedInk - m.iconCentreY,
      'the arithmetic the owner reported is inside this bound — the assertion above cannot go red',
    ).toBeGreaterThan(1);
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
    expect(after.counter.text.length).toBe(before.counter.text.length);
    expect(after.counter.w).toBe(before.counter.w);
    expect(after.counter.x).toBe(before.counter.x);

    // 🔴 The assertions above CANNOT detect a proportional font, and that was the whole point of
    // the test. Comparing '000' with '002' proves nothing: essentially every Latin face ships
    // LINING figures on a common advance, so Arial passes it too. The code-reviewer's adversarial
    // brief named the mutation — change `fontFamily` to 'Arial' and this stayed green.
    //
    // Digits are not the only thing a monospace face makes equal-width. Measuring a digit string
    // against a LETTER string of the same length is what actually separates the two: in any
    // proportional face 'iii' is dramatically narrower than '000'.
    const widths = await page.evaluate(() => {
      const ui = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('UI') as unknown as {
        hudObjects(): { counter: { text: string; width: number; setText(t: string): void } };
      };
      const counter = ui.hudObjects().counter;
      const original = counter.text;
      const measure = (t: string): number => {
        counter.setText(t);
        return counter.width;
      };
      const out = { digits: measure('000'), narrow: measure('iii'), wide: measure('WWW') };
      counter.setText(original);
      return out;
    });

    expect(typeof widths.digits).toBe('number');
    expect(widths.digits).toBeGreaterThan(0);
    // In a monospace face all three are the same advance. In any proportional face they are not.
    expect(widths.narrow).toBe(widths.digits);
    expect(widths.wide).toBe(widths.digits);
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
    // 🔴 `bootToGame` waits on `window.__game.ready`, which `GameScene.create()` sets — but the HUD
    // is a QUEUED parallel scene, so at that instant `UIScene.create()` has not run and
    // `hudObjects()` returns unbuilt fields. This test reaches `hudObjects()` directly rather than
    // through `readHud`, which guards itself, so the guard has to be here. It worked only because a
    // CDP round-trip happens to outlast one Phaser step — a latent flake, not a guarantee.
    await waitForHud(page);

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
        children: { list: { depth: number; x: number; y: number }[] };
        tweens: { getTweens(): unknown[] };
        hudObjects(): { gearIcon: { x: number; y: number } };
      };

      let peakTweens = 0;
      let peakObjects = 0;
      const baseline = ui.children.list.length;

      // The destination the tween is aimed at, in the HUD's own screen space.
      const icon = ui.hudObjects().gearIcon;
      const target = { x: icon.x, y: icon.y };

      /**
       * Positions of ONE flyer, sampled once per animation frame.
       *
       * The flyer is the object at depth 1003 — above the plate (1000), bar (1001), icon (1002) —
       * and it is the only thing `UIScene` ever adds after `build()`. Tracked by identity so a
       * second collection mid-flight cannot splice two different arcs into one series.
       */
      let tracked: { depth: number; x: number; y: number } | null = null;
      const path: { x: number; y: number }[] = [];

      const started = performance.now();
      await new Promise<void>((resolve) => {
        const step = (): void => {
          peakTweens = Math.max(peakTweens, ui.tweens.getTweens().length);
          peakObjects = Math.max(peakObjects, ui.children.list.length - baseline);

          if (tracked && ui.children.list.includes(tracked)) {
            path.push({ x: tracked.x, y: tracked.y });
          } else {
            if (tracked) tracked = null;
            const flyer = ui.children.list.find((o) => o.depth === 1003);
            if (flyer && path.length === 0) {
              tracked = flyer;
              path.push({ x: flyer.x, y: flyer.y });
            }
          }

          if (performance.now() - started > 2500) {
            resolve();
            return;
          }
          requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });

      return { peakTweens, peakObjects, baseline, path, target };
    });
    // 🔴 Release the key BEFORE measuring what settled, then wait out one full tween.
    //
    // The key used to be held for the entire sampling window and released after it, so a gear
    // collected in the last 260 ms left a live flyer at the instant `settled` was read — green on a
    // slow machine, red on a fast one. The code-reviewer's adversarial brief caught the race before
    // it flaked.
    await page.keyboard.up('ArrowRight');
    await page.waitForFunction(
      (base) => {
        const ui = (
          window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
        ).__phaserGame.scene.getScene('UI') as unknown as { children: { list: unknown[] } };
        return ui.children.list.length - (base as number) === 0;
      },
      flyers.baseline,
      { timeout: 5_000 },
    );

    // The premise: gears were actually collected during the sampling window. Without this the
    // assertions below could pass on a game that collected nothing and drew nothing.
    const score = await page.evaluate(() => window.__game?.score);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);

    expect(typeof flyers.peakTweens).toBe('number');
    expect(flyers.peakTweens).toBeGreaterThan(0);
    expect(flyers.peakObjects).toBeGreaterThan(0);
    // And it does not leak: one object per gear, destroyed on arrival. A HUD that keeps them is a
    // leak with a level-sized bound. The `waitForFunction` above IS the assertion — it times out
    // and fails the test if the flyers are never destroyed.

    /**
     * 🔴 **It has to actually FLY** — Codex implementation finding C3.
     *
     * Everything above proves a flyer object appeared and was later destroyed. Deleting the tween's
     * `x`/`y` targets would leave every one of those assertions green: an object that is created at
     * the gear and destroyed 250 ms later where it started still "exists and cleans up". The
     * criterion says collect **→ scoreboard**, so the journey is the thing.
     */
    const { path, target } = flyers;
    expect(Array.isArray(path), 'the trajectory sampler returned no array').toBe(true);

    /**
     * A minimum sample count, because "ends near the target" alone passes an instantaneous
     * TELEPORT — an object created at the destination satisfies a final-position check perfectly.
     * The tween runs 15 ticks (250 ms), so a 60 Hz rAF loop sees roughly 15 frames of it; 5 is a
     * floor loose enough for a loaded machine and still far more than a jump would produce.
     */
    expect(
      path.length,
      `only ${path.length} positions were sampled during the flight. A tween that covers its whole ` +
        `distance in one frame is a teleport, not a flight.`,
    ).toBeGreaterThanOrEqual(5);

    const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - target.x, p.y - target.y);
    const first = dist(path[0]);
    const last = dist(path[path.length - 1]);

    // It started somewhere else. Without this, a flyer spawned ON the counter passes everything.
    expect(
      first,
      'the flyer began at the counter — there was no distance to travel, so nothing was proven',
    ).toBeGreaterThan(50);

    // 🔴 It arrived. `Quad.easeIn` lands the flyer on the icon; a few px of tolerance covers the
    // frame the sampler happened to catch it on, not a systematic miss.
    expect(
      last,
      `the flyer ended ${last.toFixed(1)}px from the counter, having started ${first.toFixed(1)}px ` +
        `away. It moved, but not to the scoreboard — which is the half of the criterion that names ` +
        `a destination.`,
    ).toBeLessThan(first * 0.25);

    // 🔴 And it went there DIRECTLY. Monotonic approach rules out an arc that wanders off and is
    // then snapped back, which the endpoints alone cannot distinguish from a clean flight.
    for (let i = 1; i < path.length; i += 1) {
      expect(
        dist(path[i]),
        `the flyer moved AWAY from the counter between sample ${i - 1} and ${i} ` +
          `(${dist(path[i - 1]).toFixed(1)}px -> ${dist(path[i]).toFixed(1)}px)`,
      ).toBeLessThanOrEqual(dist(path[i - 1]) + 1);
    }

    // At least one sample genuinely in transit, so the series is a flight and not two endpoints.
    expect(
      path.some((p) => dist(p) < first * 0.9 && dist(p) > last * 1.1),
      'no sampled position was between the start and the counter — the flyer jumped rather than flew',
    ).toBe(true);
  });
});

