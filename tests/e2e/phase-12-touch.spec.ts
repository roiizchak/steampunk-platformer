import { expect, test } from '@playwright/test';

import { TOUCH_IDS } from '../../src/render/touchLayout';
import { bootToGame, readPlayer, waitTicks } from './gameHarness';
import {
  canvasRect,
  centreOf,
  contactDown,
  contactMove,
  contactUp,
  drawnZone,
  drawnZones,
  toClient,
  bootToTouchPlay,
  installTouchDriver,
  liftEveryContact,
  liveContacts,
} from './touchHarness';

/**
 * **Phase 12 — a finger reaches the simulation, and lets go of it again.**
 *
 * Criteria 12.2, 12.3, 12.5, 12.6, 12.7 and 12.12. Every contact here is a real `TouchEvent`
 * dispatched at the canvas — see `touchHarness.ts` for why Playwright's own `Touchscreen` cannot
 * express criterion 12.3.
 *
 * ⚠️ Never `waitForTimeout`. Every wait is on `window.__game.ready` or on the tick counter moving.
 */

const UI = 'UI';

test.beforeEach(async ({ page }) => {
  await installTouchDriver(page);
});

test.afterEach(async ({ page }) => {
  // A finger left down poisons the next test in the file, and the failure would land somewhere else.
  await liftEveryContact(page).catch(() => {});
});

test.describe('the six controls exist and are hittable', () => {
  test('12.2a every control is drawn, interactive, and none is a duplicate', async ({ page }) => {
    await bootToTouchPlay(page);
    const zones = await drawnZones(page, UI);
    const names = zones.map((z) => z.name).sort();
    expect(names, 'the shipped controls are not the six the layout names').toEqual(
      [...TOUCH_IDS].sort(),
    );
    for (const z of zones) {
      expect(typeof z.w).toBe('number');
      expect(z.w, `${z.name} has no width`).toBeGreaterThan(0);
      expect(z.h, `${z.name} has no height`).toBeGreaterThan(0);
      expect(z.interactive, `${z.name} is drawn but cannot be touched`).toBe(true);
    }
  });
});

test.describe('a contact produces the same sim intent as the key', () => {
  test('12.2 jump fires, and it fires on a NAMED tick', async ({ page }) => {
    // 🔴 An existence assertion cannot verify a timing claim, and the FIRST version of this test
    // could not verify one either. It read the tick, dispatched the press, and read the tick again
    // — three separate round trips into a page rendering at ~240 Hz — so it measured Playwright
    // latency, not the jump. It reported 5 ticks against a bound of 2 while the jump itself was
    // correct, which is a false RED and would have been "fixed" by moving the bound.
    //
    // So the press and the sampling both happen INSIDE the page, once per animation frame, and
    // only the aggregate crosses the boundary. Same rule as every other timing gate here.
    await bootToTouchPlay(page);
    const before = await readPlayer(page);
    expect(before.vy, 'the player is not standing still to begin with').toBe(0);

    const rect = await canvasRect(page);
    const jump = await drawnZone(page, UI, 'jump');
    const p = centreOf(rect, jump);

    const timing = await page.evaluate(
      ([x, y]) =>
        new Promise<{ pressedAt: number; firedAt: number; vy: number }>((resolve) => {
          const view = () => window.__game;
          const pressedAt = view()?.tick ?? -1;
          (
            window as unknown as { __touch: { down(id: number, x: number, y: number): void } }
          ).__touch.down(1, x, y);
          const deadline = performance.now() + 4000;
          const step = (): void => {
            const player = view()?.player as { vy: number } | null | undefined;
            if (player && player.vy < 0) {
              resolve({ pressedAt, firedAt: view()?.tick ?? -1, vy: player.vy });
              return;
            }
            if (performance.now() > deadline) {
              resolve({ pressedAt, firedAt: -1, vy: player?.vy ?? 0 });
              return;
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }),
      [p.x, p.y] as [number, number],
    );

    expect(typeof timing.firedAt, 'the probe returned nothing').toBe('number');
    expect(timing.firedAt, 'the contact never launched a jump').toBeGreaterThan(-1);
    expect(timing.vy, 'the jump has no upward velocity').toBeLessThan(0);
    // Step 2 of the tick contract consumes the jump edge, so the press must show up within a tick
    // or two of landing — never "eventually".
    expect(
      timing.firedAt - timing.pressedAt,
      'the jump did not fire on the first tick after the press',
    ).toBeLessThanOrEqual(2);
    await contactUp(page, 1);
  });
  test('12.2b a movement contact drives the player, and lifting it stops them', async ({ page }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = await drawnZone(page, UI, 'right');
    const p = centreOf(rect, right);
    const start = (await readPlayer(page)).x;

    await contactDown(page, 1, p.x, p.y);
    await waitTicks(page, 20);
    const moving = await readPlayer(page);
    expect(moving.x, 'the player did not move right').toBeGreaterThan(start);
    expect(moving.vx, 'the player has no rightward velocity').toBeGreaterThan(0);

    await contactUp(page, 1);
    await waitTicks(page, 30);
    const stopped = await readPlayer(page);
    expect(Math.abs(stopped.vx), 'the player kept running after the finger lifted').toBeLessThan(0.5);
  });
});

test.describe('multi-touch', () => {
  test('12.3 RIGHT is held on one contact while JUMP fires on another', async ({ page }) => {
    // The criterion the single-tap API cannot express. Two sequential taps would pass against a
    // build that can only ever track one finger.
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));
    const jump = centreOf(rect, await drawnZone(page, UI, 'jump'));

    await contactDown(page, 1, right.x, right.y);
    await waitTicks(page, 12);
    const running = await readPlayer(page);
    expect(running.vx, 'the first contact is not moving the player').toBeGreaterThan(0);

    // Second finger down while the first is still on the screen.
    await contactDown(page, 2, jump.x, jump.y);
    expect(await liveContacts(page), 'the harness lost a contact').toBe(2);
    await waitTicks(page, 3);

    const airborne = await readPlayer(page);
    expect(airborne.vy, 'the jump did not fire while a finger was already down').toBeLessThan(0);
    expect(
      airborne.vx,
      'the jump contact stole the movement the other finger was still holding',
    ).toBeGreaterThan(0);

    await contactUp(page, 2);
    await contactUp(page, 1);
  });

  test('12.5a lifting ONE of two fingers on a button leaves it held', async ({ page }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));

    await contactDown(page, 1, right.x - 6, right.y);
    await contactDown(page, 2, right.x + 6, right.y);
    await waitTicks(page, 10);
    await contactUp(page, 1);
    await waitTicks(page, 10);

    const still = await readPlayer(page);
    expect(still.vx, 'releasing one of two fingers un-held the button').toBeGreaterThan(0);
    await contactUp(page, 2);
  });

  test('12.5b a contact that slides off and lifts elsewhere still clears', async ({ page }) => {
    // 🔴 The defect the scene-level `pointerup` exists for. A per-object listener never hears about
    // this release, and the player would run right until the level ended.
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));

    await contactDown(page, 1, right.x, right.y);
    await waitTicks(page, 10);
    expect((await readPlayer(page)).vx).toBeGreaterThan(0);

    // Slide into the middle of the canvas — over nothing — and lift there.
    await contactMove(page, 1, rect.left + rect.width / 2, rect.top + rect.height / 2);
    await contactUp(page, 1);
    await waitTicks(page, 30);

    const stopped = await readPlayer(page);
    expect(
      Math.abs(stopped.vx),
      'the contact was never released, so the player is still running',
    ).toBeLessThan(0.5);
  });

  test('12.5c a contact that slides ONTO another control neither arms it nor disarms the first', async ({
    page,
  }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));
    const jump = centreOf(rect, await drawnZone(page, UI, 'jump'));

    await contactDown(page, 1, right.x, right.y);
    await waitTicks(page, 10);
    const grounded = await readPlayer(page);
    expect(grounded.vx).toBeGreaterThan(0);

    await contactMove(page, 1, jump.x, jump.y);
    await waitTicks(page, 4);
    const after = await readPlayer(page);
    expect(after.vy, 'sliding onto JUMP fired a jump the player never pressed').toBeGreaterThanOrEqual(
      grounded.vy,
    );
    expect(after.vx, 'sliding off RIGHT dropped the movement it was still holding').toBeGreaterThan(0);
    await contactUp(page, 1);
  });
});

test.describe('the controls stop being touchable when they must not be touched', () => {
  test('12.12 nothing under the pause menu drives the sim', async ({ page }) => {
    // ⚠️ NOT "the tick is frozen". `Game` keeps running under a menu by design and every tick
    // increments `world.tickCount`, so a criterion demanding a frozen tick is unsatisfiable by a
    // correct implementation. The claim is that tapping each control's coordinates has no EFFECT.
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const zones = await drawnZones(page, UI);
    const spots = zones.map((z) => ({ name: z.name, at: centreOf(rect, z) }));

    // ESC opens the level menu; `Game` stops, so the controls must go non-interactive.
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, {
      timeout: 10_000,
    });

    const after = await drawnZones(page, UI);
    for (const z of after) {
      expect(z.interactive, `${z.name} is still touchable over the level menu`).toBe(false);
    }

    // And a tap at each control's old coordinates changes nothing — EXCEPT where the level menu's
    // own live route is underneath it, which is the menu working rather than a retired control.
    //
    // \U0001f534 **This block asserted `sceneKey === 'LevelSelect'` after tapping all six, and it was
    // INTERMITTENTLY RED on `main` \u2014 measured 2026-09-02, three failures in three full-project
    // runs of the baseline tree.** The cause is geometry, not flake: `walk` sits at game
    // (1520, 208) and `LevelSelect`'s `row-0` spans x 364.8\u20131555.2, y 91\u2013251, so that one
    // coordinate is **inside a live level button**. Tapping it starts level 1, correctly. Whether
    // the run saw it depended on whether the row had become interactive by the time the tap
    // landed, which is what made a deterministic overlap look like a flake.
    //
    // The criterion is *\"controls hidden and `disableInteractive()`d\"*, and the assertion above
    // already proves that per control. What this loop must add is that the tap produced no
    // **control** effect \u2014 so a route change is a defect only at a coordinate no live route
    // covers. Asserting `sceneKey` globally conflated \"the control is dead\" with \"nothing else
    // lives here\", and the second is not this criterion's claim.
    const rows = await drawnZones(page, 'LevelSelect');
    const covered = (spot: { at: { x: number; y: number } }): boolean =>
      rows.some((r) => {
        const tl = toClient(rect, r.x, r.y);
        const br = toClient(rect, r.x + r.w, r.y + r.h);
        return (
          r.interactive &&
          spot.at.x >= tl.x &&
          spot.at.x <= br.x &&
          spot.at.y >= tl.y &&
          spot.at.y <= br.y
        );
      });

    // \u26a0\ufe0f At least one coordinate must NOT be covered, or the loop below asserts nothing at
    // all \u2014 a partition that excludes everything is the vacuous pass this file has paid for twice.
    const bare = spots.filter((spot) => !covered(spot));
    expect(
      bare.map((s) => s.name),
      'every retired control now sits under a live level-menu row \u2014 this case can no longer fail',
    ).not.toEqual([]);

    for (const [i, spot] of spots.entries()) {
      await contactDown(page, 10 + i, spot.at.x, spot.at.y);
      await contactUp(page, 10 + i);
      if (covered(spot)) continue;
      expect(
        await page.evaluate(() => window.__game?.sceneKey),
        `a tap at the retired ${spot.name} control \u2014 which no live level-menu row covers \u2014 moved the game somewhere`,
      ).toBe('LevelSelect');
    }
  });

});

test.describe('the walk latch', () => {
  test('12.4b the walk plate actually slows the player, and stays latched', async ({ page }) => {
    // ✅ Owner request, and the gate that makes it real rather than drawn. `walkHeld` had NO touch
    // source: a phone player always ran, `walkMax / runMax` is 0.400, and the `walk` player state
    // — and so `brass-courier/walk` — was unreachable on every touch device.
    //
    // 🔴 Measured as DISTANCE PER TICK from the sim, not as a state name: a build that set the
    // flag and changed no speed would pass a state assertion and fail a player.
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));
    const walk = centreOf(rect, await drawnZone(page, UI, 'walk'));

    const travel = async (id: number): Promise<number> => {
      const from = (await readPlayer(page)).x;
      await contactDown(page, id, right.x, right.y);
      await waitTicks(page, 40);
      const to = (await readPlayer(page)).x;
      await contactUp(page, id);
      await waitTicks(page, 20);
      return to - from;
    };

    const running = await travel(41);
    expect(running, 'the player did not move at all, so this measures nothing').toBeGreaterThan(8);

    await contactDown(page, 42, walk.x, walk.y);
    await contactUp(page, 42);
    // The finger is GONE and the latch has to survive it — that is the difference between a toggle
    // and a button nobody has a spare thumb for.
    const walking = await travel(43);
    expect(walking, 'the player stopped instead of walking').toBeGreaterThan(0);
    expect(
      walking,
      `walking covered ${walking.toFixed(1)} px in 40 ticks against ${running.toFixed(1)} running — ` +
        'the plate set a flag the sim does not read',
    ).toBeLessThan(running * 0.8);

    // And off again.
    await contactDown(page, 44, walk.x, walk.y);
    await contactUp(page, 44);
    const again = await travel(45);
    expect(again, 'the toggle would not turn off').toBeGreaterThan(running * 0.8);
  });
});

test.describe('desktop is untouched', () => {
  test('12.7 a browser with no touch draws no control at all', async ({ browser }) => {
    // 🔴 Not "hidden" and not "disabled" — ABSENT. An invisible interactive object still swallows
    // pointers, so a hidden control is a desktop regression that no screenshot would show.
    const context = await browser.newContext({ hasTouch: false });
    const page = await context.newPage();
    try {
      await bootToGame(page);
      expect(
        await drawnZones(page, UI),
        'a desktop build carries touch hit areas',
      ).toEqual([]);

      // And the keyboard still works, which is the other half of the criterion.
      const start = (await readPlayer(page)).x;
      await page.keyboard.down('ArrowRight');
      await waitTicks(page, 20);
      await page.keyboard.up('ArrowRight');
      expect((await readPlayer(page)).x, 'the keyboard stopped moving the player').toBeGreaterThan(
        start,
      );
    } finally {
      await context.close();
    }
  });
});
