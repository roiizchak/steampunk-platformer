import { expect, test } from '@playwright/test';

import { readPlayer, waitTicks } from './gameHarness';
import {
  canvasRect,
  centreOf,
  contactDown,
  contactMove,
  contactUp,
  contactsDown,
  drawnZone,
  bootToTouchPlay,
  installTouchDriver,
  liftEveryContact,
  liveContacts,
} from './touchHarness';

/**
 * **Criterion 12.13 — the browser does not get the gesture first.**
 *
 * Three device checks the criterion names, and a fourth the QA log adds: a drag that starts on a
 * control and leaves the canvas edge, a drag off a control's edge and back, a two-finger pinch over
 * the play area, and a double-tap on a control. None of them may scroll the page, zoom it, or drop
 * the contact.
 *
 * 🔴 **The criterion's owner is `play`, and this file does not close it.** A device is the only
 * thing that can say how a gesture FEELS and whether the OS claimed it before the browser did. What
 * this file does is pin the half a machine can hold, so the device pass is confirming behaviour
 * rather than discovering it — which is the sequence the two rotate-gate defects were reported
 * twice for lacking.
 *
 * ## Why zoom is asserted on the VIEWPORT and never on a gesture event
 *
 * Chromium does not synthesise `gesturestart`/`gesturechange` from synthetic `TouchEvent`s, so a
 * spec that waited for one would pass against a page that zooms freely. The observable that moves
 * when a page actually zooms is `visualViewport.scale`, with `window.innerWidth` and the document's
 * scroll offset beside it. Those are read directly.
 *
 * ## What this file cannot see
 *
 * The CSS that does the preventing is asserted in `tests/unit/gesture-prevention.test.ts` (source)
 * and `tools/gen/verify-dist.mjs` (shipped bytes). A headless Chromium keeps this file green even
 * with those rules gone, because a page with no scrollable overflow does not pan and a synthetic
 * pinch does not zoom it — so the three gates are complementary, not redundant, and none of them
 * subsumes the device.
 */

const UI = 'UI';

type Page = import('@playwright/test').Page;

/** What a page looks like when nothing has zoomed or scrolled it. */
async function viewportState(page: Page): Promise<{
  scale: number;
  innerWidth: number;
  scrollTop: number;
  scrollLeft: number;
}> {
  return page.evaluate(() => ({
    scale: window.visualViewport?.scale ?? 1,
    innerWidth: window.innerWidth,
    scrollTop: document.scrollingElement?.scrollTop ?? 0,
    scrollLeft: document.scrollingElement?.scrollLeft ?? 0,
  }));
}

/**
 * Where Phaser thinks a given contact is, in GAME pixels.
 *
 * An independent reading of the drag: the driver's own bookkeeping cannot answer whether the engine
 * saw the move, and neither can the player's velocity.
 */
async function pointerGamePos(page: Page, id: number): Promise<{ x: number; y: number }> {
  return page.evaluate((wanted) => {
    // `game.input` IS the InputManager in Phaser 4 — there is no `.manager` under it.
    const mgr = (
      window as unknown as {
        __phaserGame: { input: { pointers: { identifier: number; x: number; y: number }[] } };
      }
    ).__phaserGame.input;
    const p = mgr.pointers.find((q) => q.identifier === wanted);
    if (!p) throw new Error(`no live pointer with identifier ${wanted}`);
    return { x: p.x, y: p.y };
  }, id);
}

test.beforeEach(async ({ page }) => {
  await installTouchDriver(page);
  // Every touch event the page sees, and whether its page default was prevented by the time every
  // other listener had run. Installed before the game's scripts, and passive:false so the flag it
  // reads is the real one — a passive listener is told the default can never be prevented.
  await page.addInitScript(() => {
    const seen: { type: string; prevented: boolean }[] = [];
    (window as unknown as { __gestures: typeof seen }).__gestures = seen;
    for (const type of ['touchstart', 'touchmove', 'touchend']) {
      window.addEventListener(
        type,
        (e) => seen.push({ type, prevented: (e as TouchEvent).defaultPrevented }),
        { passive: false },
      );
    }
  });
});

test.afterEach(async ({ page }) => {
  await liftEveryContact(page).catch(() => {});
});

test.describe('12.13 the browser does not claim the gesture', () => {
  test('12.13a a drag on a control has its page default PREVENTED', async ({ page }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));

    await contactDown(page, 1, right.x, right.y);
    for (let i = 1; i <= 6; i += 1) await contactMove(page, 1, right.x + i * 4, right.y + i * 3);
    await contactUp(page, 1);

    const moves = await page.evaluate(() =>
      (
        window as unknown as { __gestures: { type: string; prevented: boolean }[] }
      ).__gestures.filter((g) => g.type === 'touchmove'),
    );
    // 🔴 Assert the TYPE and the COUNT before the value. An empty list satisfies a `filter().length`
    // check vacuously, and a driver that failed to install produces exactly that.
    expect(Array.isArray(moves), 'the gesture recorder never installed').toBe(true);
    expect(moves.length, 'no touchmove reached the page at all').toBe(6);
    expect(
      moves.filter((m) => !m.prevented).length,
      'a touchmove kept its page default — the browser is free to pan or zoom mid-drag',
    ).toBe(0);
  });

  test('12.13b a drag that leaves the canvas edge KEEPS the contact', async ({ page }) => {
    // 🔴 The check the criterion names first, and the one with a real defect behind it.
    // `InputManager.onTouchMove` runs `document.elementFromPoint` per finger per move and fires
    // GAME_OUT when the topmost element is not the canvas, so a thumb rolling a few millimetres
    // past the edge of a pillarboxed canvas dropped EVERY contact — including the jump the other
    // hand was holding. See `touchControlsLayer.ts` and the QA log's § 12.13.
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const right = centreOf(rect, await drawnZone(page, UI, 'right'));
    const jump = centreOf(rect, await drawnZone(page, UI, 'jump'));

    // Two thumbs, one frame: RIGHT held, JUMP held.
    await contactsDown(page, [
      { id: 1, x: right.x, y: right.y },
      { id: 2, x: jump.x, y: jump.y },
    ]);
    await waitTicks(page, 10);
    expect((await readPlayer(page)).vx, 'the held RIGHT never reached the sim').toBeGreaterThan(0);

    // Contact 1 walks off the physical edge of the canvas and stays there.
    for (const x of [rect.left + 24, rect.left + 8, rect.left - 12, rect.left - 40]) {
      await contactMove(page, 1, x, right.y);
    }
    // ⚠️ **30 ticks, not 10, and the number is the whole test.** At 10 the player is still
    // coasting on the velocity it had when the finger left the canvas, so a dropped contact and a
    // held one are indistinguishable — this test PASSED at 10 against a build that dropped both
    // fingers, which is the false green criterion 12.5b already pays 30 ticks to avoid.
    await waitTicks(page, 30);

    const dragged = await readPlayer(page);
    expect(
      dragged.vx,
      'dragging one finger past the canvas edge dropped the other hand held control',
    ).toBeGreaterThan(0);
    expect(await liveContacts(page), 'the driver lost a contact it never lifted').toBe(2);

    await contactUp(page, 1);
    await contactUp(page, 2);
    await waitTicks(page, 30);
    expect(
      Math.abs((await readPlayer(page)).vx),
      'lifting both fingers left the player running',
    ).toBeLessThan(0.5);
  });

  test('12.13c a drag off a control edge and back keeps walking throughout', async ({ page }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const zone = await drawnZone(page, UI, 'right');
    const right = centreOf(rect, zone);

    await contactDown(page, 1, right.x, right.y);
    await waitTicks(page, 10);
    expect((await readPlayer(page)).vx).toBeGreaterThan(0);

    // Off the button onto bare canvas, then back onto it, without lifting.
    await contactMove(page, 1, right.x + zone.w, right.y);
    await waitTicks(page, 6);
    const off = await readPlayer(page);
    // 🔴 **Where the finger IS, not only what the player is doing.** Deleting both `contactMove`
    // calls leaves RIGHT held and both velocity assertions passing, so the case proved nothing
    // about a drag — Codex round 21, finding 5. Phaser's own pointer position is the independent
    // reading: it has to be outside the zone for this to be the gesture the criterion names.
    const away = await pointerGamePos(page, 1);
    expect(
      away.x,
      'the contact never left the button — this case is not about a drag without that',
    ).toBeGreaterThan(zone.x + zone.w);

    await contactMove(page, 1, right.x, right.y);
    await waitTicks(page, 6);
    const back = await readPlayer(page);
    const home = await pointerGamePos(page, 1);
    expect(home.x, 'the contact never came back onto the button').toBeLessThan(zone.x + zone.w);

    expect(off.vx, 'sliding off the button stopped the player mid-drag').toBeGreaterThan(0);
    expect(back.vx, 'sliding back onto the button stopped the player').toBeGreaterThan(0);
    await contactUp(page, 1);
  });

  test('12.13d a two-finger pinch over the play area neither zooms nor scrolls', async ({ page }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const before = await viewportState(page);
    const tickBefore = await page.evaluate(() => window.__game?.tick ?? 0);

    await contactsDown(page, [
      { id: 1, x: cx - 60, y: cy },
      { id: 2, x: cx + 60, y: cy },
    ]);
    // Apart, then together — a pinch out and a pinch in, over the level rather than over a control.
    for (const spread of [90, 130, 180, 130, 40, 12]) {
      await page.evaluate(
        ([x, y, s]) => {
          const t = (
            window as unknown as { __touch: { move(i: number, x: number, y: number): void } }
          ).__touch;
          t.move(1, x - s, y);
          t.move(2, x + s, y);
        },
        [cx, cy, spread] as [number, number, number],
      );
    }
    await contactUp(page, 1);
    await contactUp(page, 2);
    await waitTicks(page, 10);

    const after = await viewportState(page);
    expect(typeof after.scale, 'visualViewport.scale is not a number').toBe('number');
    expect(after.scale, 'the pinch zoomed the page').toBeCloseTo(before.scale, 5);
    expect(after.innerWidth, 'the pinch changed the layout viewport').toBe(before.innerWidth);
    expect([after.scrollTop, after.scrollLeft], 'the pinch scrolled the page').toEqual([
      before.scrollTop,
      before.scrollLeft,
    ]);
    expect(
      await page.evaluate(() => window.__game?.tick ?? 0),
      'the game stopped ticking during the pinch',
    ).toBeGreaterThan(tickBefore);
  });

  /**
   * 🔴 **This case does NOT assert two jumps, and the reason is worth stating rather than working
   * around.** `jumpPressed` is an idempotent edge within a frame (`src/sim/input.ts`), and there is
   * no double jump, so a second tap 100 ms after the first cannot produce a second observable jump
   * — the player is still in the air. Codex round 21, finding 4, caught the earlier version
   * claiming it. The QA log's device step said "two jumps" too, and is corrected to match.
   *
   * What a double tap CAN be asked here: that the browser did not eat the pair as a zoom gesture,
   * that the layout viewport did not move, that the sim received the gesture at all, that nothing
   * routed away, and that no contact was left down.
   */
  test('12.13e a double-tap on a control does not zoom or navigate', async ({ page }) => {
    await bootToTouchPlay(page);
    const rect = await canvasRect(page);
    const jump = centreOf(rect, await drawnZone(page, UI, 'jump'));
    const before = await viewportState(page);
    // Standing, before anything is tapped. y decreases upward.
    const groundY = (await readPlayer(page)).y;

    // Both taps in ONE round trip, so the gap between them is the page's own timing rather than two
    // CDP latencies — a 200 ms round trip is outside every double-tap window there is, and a test
    // built from two awaited taps would be about nothing.
    const taps = await page.evaluate(
      ([x, y]) => {
        const w = window as unknown as {
          __touch: { down(i: number, x: number, y: number): void; up(i: number): void };
        };
        const fired: string[] = [];
        const tap = (): void => {
          w.__touch.down(1, x, y);
          w.__touch.up(1);
        };
        tap();
        fired.push('first');
        // ⚠️ A real gap, INSIDE the page. Two taps in the same JS task are not a double tap to the
        // browser at all; two Playwright round trips are ~200 ms apart, outside every double-tap
        // window there is. 120 ms is inside the window and across several frames.
        return new Promise<string[]>((resolve) => {
          setTimeout(() => {
            tap();
            fired.push('second');
            resolve(fired);
          }, 120);
        });
      },
      [jump.x, jump.y] as [number, number],
    );
    await waitTicks(page, 20);

    // 🔴 `taps` proves only that the driver's own JS ran. What proves the GAME saw the gesture
    // is the player leaving the ground — a browser that swallowed the pair as a zoom gesture would
    // leave `taps` exactly as it is and the player exactly where it was.
    expect(taps, 'the double tap never reached the page').toEqual(['first', 'second']);
    expect(
      (await readPlayer(page)).y,
      'neither tap reached the sim — the browser took the pair as a zoom gesture',
    ).toBeLessThan(groundY);
    const after = await viewportState(page);
    expect(after.scale, 'the double tap zoomed the page').toBeCloseTo(before.scale, 5);
    expect(after.innerWidth, 'the double tap changed the layout viewport').toBe(before.innerWidth);
    // Both taps landed on the same live control, neither was swallowed as a zoom gesture, and
    // nothing routed away: the driver is empty and the game is still the running scene.
    expect(await liveContacts(page), 'a tap left a contact down').toBe(0);
    expect(
      await page.evaluate(() => window.__game?.sceneKey ?? ''),
      'the double tap navigated away from the game',
    ).toBe('Game');
  });
});
