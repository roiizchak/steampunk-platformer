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

