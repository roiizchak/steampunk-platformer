import { expect, test } from '@playwright/test';

import { drawnOverlay } from './completeHelpers';
import { readPlayer } from './gameHarness';
import { TOUCH_MIN_CSS_PX } from '../../src/render/touchLayout';
import {
  canvasRect,
  centreOf,
  contactDown,
  contactUp,
  drawnZone,
  drawnZones,
  installTouchDriver,
  liftEveryContact,
  measuredTargets,
  playToExitByTouch,
  TOUCH_RUN_TIMEOUT,
} from './touchHarness';

/**
 * **Criterion 12.1 — the whole game, start to finish, with no keyboard at all.**
 *
 * Page load -> welcome screen -> level menu -> a level played to its exit -> the completion panel ->
 * the next level. Every step is a real contact dispatched at a measured screen position.
 *
 * 🔴 **Nothing here calls `dismiss()`, `play()` or `advance()` directly.** The Codex plan review named
 * that in round 2: driving the routes through their own functions would pass with no hit area wired
 * at all, which is precisely the wiring this criterion exists to prove. Every transition below is
 * caused by a contact landing on a zone the game drew for itself.
 *
 * 🔴 And this is not a nicety bolted onto the play controls. Before this phase the three terminal
 * screens took `Enter`/`Space` (`TitleScene.ts:333-335`), `UP W DOWN S ENTER`
 * (`LevelSelectScene.ts:145-167`) and `ANY_KEY_DOWN` (`gameComplete.ts:119-135`) and nothing else, so
 * a phone build with in-play controls alone still could not be started.
 */

test.describe.configure({ timeout: TOUCH_RUN_TIMEOUT + 60_000 });

test.beforeEach(async ({ page }) => {
  await installTouchDriver(page);
});

test.afterEach(async ({ page }) => {
  await liftEveryContact(page).catch(() => {});
});

/** Press and lift at one point. Every transition in this file goes through here. */
async function tapAt(page: import('@playwright/test').Page, x: number, y: number, id = 1): Promise<void> {
  await contactDown(page, id, x, y);
  await contactUp(page, id);
}

test('12.1 the whole journey, driven only by touch', async ({ page }) => {
  // 🔴 Fail the test if a single key event reaches the page. The criterion says "zero keyboard
  // events", and a harness that merely happens not to send one is not the same claim.
  const keyEvents: string[] = [];
  await page.exposeFunction('__recordKey', (type: string) => {
    keyEvents.push(type);
  });
  await page.addInitScript(() => {
    for (const type of ['keydown', 'keyup', 'keypress']) {
      window.addEventListener(
        type,
        (e) => (window as unknown as { __recordKey(t: string): void }).__recordKey(`${type}:${(e as KeyboardEvent).code}`),
        true,
      );
    }
  });

  // ---------------------------------------------------------------- the welcome screen
  await page.goto('/');
  await page.waitForFunction(
    () => Boolean(window.__game && (window.__game.ready || window.__game.bootError !== null)),
    undefined,
    { timeout: 20_000 },
  );
  expect(await page.evaluate(() => window.__game?.bootError)).toBeNull();
  await page.waitForFunction(
    () =>
      Boolean(
        (
          window as unknown as { __phaserGame?: { scene: { isActive(k: string): boolean } } }
        ).__phaserGame?.scene.isActive('Title'),
      ),
    undefined,
    { timeout: 20_000 },
  );

  const rect = await canvasRect(page);
  // Anywhere on the title: it has one action, so the whole view is the target.
  await tapAt(page, rect.left + rect.width / 2, rect.top + rect.height / 2);

  // ---------------------------------------------------------------- the level menu
  await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, {
    timeout: 20_000,
  });

  const menuRects = await canvasRect(page);
  const rows = await drawnZones(page, 'LevelSelect');
  expect(rows.length, 'the level menu has no touch targets').toBeGreaterThan(0);
  expect(
    rows.map((r) => r.name).sort(),
    'the rows are not the ones `touchMenuLayout` names',
  ).toEqual(rows.map((_, i) => `row-${i}`).sort());

  // Row 0 is level-01, the only unlocked one on a fresh save.
  const firstRow = rows.find((r) => r.name === 'row-0');
  expect(firstRow, 'no first row to tap').toBeDefined();
  const rowCentre = centreOf(menuRects, firstRow!);
  await tapAt(page, rowCentre.x, rowCentre.y, 2);

  // ---------------------------------------------------------------- play
  await page.waitForFunction(
    () => window.__game?.sceneKey === 'Game' && (window.__game?.tick ?? 0) > 0,
    undefined,
    { timeout: 20_000 },
  );
  await page.waitForFunction(
    () =>
      (
        (
          window as unknown as {
            __phaserGame?: { scene: { getScene(k: string): { children?: { list: unknown[] } } | null } };
          }
        ).__phaserGame?.scene.getScene('UI')?.children?.list ?? []
      ).length > 0,
    undefined,
    { timeout: 20_000 },
  );

  const playRect = await canvasRect(page);
  const rightZone = await drawnZone(page, 'UI', 'right');
  expect(rightZone.interactive, 'the controls are not live on the level a tap started').toBe(true);

  // One deliberate press before handing over to the auto-player, so "the controls work in a level
  // reached BY TOUCH" is asserted rather than assumed from the run finishing.
  const startX = (await readPlayer(page)).x;
  const rightAt = centreOf(playRect, rightZone);
  await contactDown(page, 3, rightAt.x, rightAt.y);
  await page.waitForFunction((x) => ((window.__game?.player as { x: number } | null)?.x ?? 0) > (x as number) + 8, startX, {
    timeout: 10_000,
  });
  await contactUp(page, 3);

  await playToExitByTouch(page);

  // ---------------------------------------------------------------- the completion panel
  await page.waitForFunction(
    () => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('UI') as { overlay?: unknown } | null;
      return Boolean(scene);
    },
    undefined,
    { timeout: 20_000 },
  );
  const overlay = await drawnOverlay(page);
  expect(overlay.lines.length, 'the completion panel did not appear').toBeGreaterThan(3);
  expect(
    overlay.lines[3]!.text,
    'the completion prompt does not offer a tap, so a phone player is stuck here',
  ).toContain('TAP');

  // 12.8 / 12.9 ride along here: the completion zone is the third target those criteria name and
  // the only one that cannot be reached without playing a level, so it is measured at the one
  // moment it exists. Coverage rather than containment — the zone is deliberately oversized by
  // 64 px (`gameComplete.ts:164-168`) for the shake-displaced camera, so `inside the canvas` would
  // fail a correct implementation.
  const completeRect = await canvasRect(page);
  const completeTargets = await measuredTargets(page, 'Game');
  expect(
    completeTargets.map((t) => t.name),
    'the completion panel has no live tap route, so a phone player is stuck on it',
  ).toEqual(['continue']);
  const cont = completeTargets[0]!;
  expect(cont.w, `the continue zone is ${cont.w.toFixed(1)} CSS px wide`).toBeGreaterThanOrEqual(TOUCH_MIN_CSS_PX);
  expect(cont.h, `the continue zone is ${cont.h.toFixed(1)} CSS px tall`).toBeGreaterThanOrEqual(TOUCH_MIN_CSS_PX);
  expect(cont.x, 'a live strip of canvas is left of the continue zone').toBeLessThanOrEqual(completeRect.left + 0.5);
  expect(cont.y, 'a live strip of canvas is above the continue zone').toBeLessThanOrEqual(completeRect.top + 0.5);
  expect(cont.x + cont.w, 'a live strip of canvas is right of the continue zone').toBeGreaterThanOrEqual(
    completeRect.left + completeRect.width - 0.5,
  );
  expect(cont.y + cont.h, 'a live strip of canvas is below the continue zone').toBeGreaterThanOrEqual(
    completeRect.top + completeRect.height - 0.5,
  );
  // Tapped at its MEASURED centre, not at a fraction of the canvas — 12.1 forbids a coordinate that
  // could hit nothing and still advance.
  await tapAt(page, cont.x + cont.w / 2, cont.y + cont.h / 2, 4);

  // ---------------------------------------------------------------- the next level
  await page.waitForFunction(
    () => window.__game?.sceneKey === 'Game' && window.__game?.levelId === 'level-02',
    undefined,
    { timeout: 30_000 },
  );

  // 12.6 rides along here: a level transition must rebind the session rather than stack a second
  // copy of everything or leave the controls pointing at the finished level's snapshot.
  const nextZones = await drawnZones(page, 'UI');
  expect(nextZones.length, 'the level transition duplicated or dropped the controls').toBe(5);
  for (const z of nextZones) {
    expect(z.interactive, `${z.name} is dead on the second level`).toBe(true);
  }
  const secondRect = await canvasRect(page);
  const secondRight = centreOf(secondRect, await drawnZone(page, 'UI', 'right'));
  const secondStart = (await readPlayer(page)).x;
  await contactDown(page, 5, secondRight.x, secondRight.y);
  await page.waitForFunction((x) => ((window.__game?.player as { x: number } | null)?.x ?? 0) > (x as number) + 8, secondStart, {
    timeout: 10_000,
  });
  await contactUp(page, 5);

  // ---------------------------------------------------------------- and not one key
  expect(keyEvents, `the journey used the keyboard: ${keyEvents.join(', ')}`).toEqual([]);
});
