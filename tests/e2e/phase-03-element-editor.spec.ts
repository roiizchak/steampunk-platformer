/**
 * Phase 3 criterion 3.7 — the Element Editor shows and edits a collision strip, and the edit
 * persists.
 *
 * "Persists" is the word that decides the design. The chosen mechanism is a downloaded `.tmj`, so
 * the level file stays the single source of truth: the edit goes back into the artefact Tiled
 * opens, `tests/unit/tilemap-data.test.ts` validates, and BootScene gates on.
 *
 * ## What this file proves, and what it deliberately cannot
 *
 * Codex plan review P7: proving the download *contains* the edited coordinate is weaker than the
 * criterion. A file with the right number in it is still worthless if it is not a loadable level.
 * So the downloaded bytes are fed back through the **real `parseLevel`** and diffed against the
 * shipped level — exactly one strip moved, by exactly the nudge, and every other object identical.
 *
 * The assertions are BLACK BOX on purpose. Nothing here reads the scene's selection index or any
 * other private field; it presses keys and reads the file that comes out. A test coupled to
 * `selected` would keep passing if the editor stopped editing the strip it highlights.
 *
 * Criterion 3.7 is `play`-owned and this spec does not discharge it. Phase 2 established the rule:
 * a hands-on criterion is not done on automated evidence alone. This is the mechanical half; the
 * screenshots in `docs/evidence/` and the QA-LOG note are the other half.
 *
 * ## Reading the download without `@types/node`
 *
 * The project deliberately has no `@types/node` (Phase 1 needed it twice and solved it without),
 * so `download.path()` plus `readFileSync` is not available. Instead `URL.createObjectURL` is
 * hooked in the page to keep a reference to the Blob itself — revoking the URL afterwards does not
 * destroy the Blob — and the real anchor click still fires, so Playwright's `download` event
 * confirms the browser genuinely treated it as a download rather than the test inspecting a
 * string the page happened to build.
 */

import { expect, test, type Page } from '@playwright/test';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { BOOT_TIMEOUT, bootToGame } from './gameHarness';

const NUDGE_PRESSES = 7;

async function shippedLevel(page: Page): Promise<LevelData> {
  const response = await page.request.get('/assets/levels/level-01.tmj');
  expect(response.ok(), 'the shipped level did not load over HTTP').toBe(true);
  return parseLevel('level-01', await response.json());
}

async function enterEditor(page: Page): Promise<void> {
  await page.keyboard.press('o');
  await page.waitForFunction(() => window.__game?.sceneKey === 'ElementEditor', undefined, {
    timeout: BOOT_TIMEOUT,
  });
}

/** Keep every Blob handed to `createObjectURL`, so the saved bytes can be read back afterwards. */
async function captureDownloads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL);
    (window as unknown as { __savedBlob: Blob | null }).__savedBlob = null;
    URL.createObjectURL = (object: Blob | MediaSource): string => {
      if (object instanceof Blob) {
        (window as unknown as { __savedBlob: Blob | null }).__savedBlob = object;
      }
      return original(object);
    };
  });
}

test.describe('Phase 3 — Element Editor (criterion 3.7)', () => {
  test('shows a collision strip overlay for every solid in the level', async ({ page }) => {
    await bootToGame(page);
    const level = await shippedLevel(page);
    await enterEditor(page);

    const shown = await page.evaluate(() => {
      const scene = (
        window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
      ).__phaserGame.scene.getScene('ElementEditor') as {
        children: { list: { type?: string; width?: number; height?: number }[] };
      };
      return scene.children.list.filter((o) => o.type === 'Rectangle').map((o) => ({
        w: o.width,
        h: o.height,
      }));
    });

    // One overlay per solid, plus the player rectangle and its facing marker. Matching each
    // solid's exact size is what makes this "the strips are shown" rather than "some rectangles
    // exist" — a hardcoded count would pass with every overlay drawn at the wrong size.
    for (const solid of level.solids) {
      expect(
        shown.some((r) => r.w === solid.w && r.h === solid.h),
        `no overlay drawn for the ${solid.w}x${solid.h} strip at (${solid.x}, ${solid.y})`,
      ).toBe(true);
    }
  });

  test('an edited strip is written back into a loadable .tmj', async ({ page }) => {
    await bootToGame(page);
    const before = await shippedLevel(page);
    await enterEditor(page);
    await captureDownloads(page);

    // Pick a strip that is not the first, so a save that always rewrites object #0 fails here.
    await page.keyboard.press('BracketRight');
    await page.keyboard.press('BracketRight');
    for (let i = 0; i < NUDGE_PRESSES; i += 1) {
      await page.keyboard.press('ArrowDown');
    }

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: BOOT_TIMEOUT }),
      page.keyboard.press('s'),
    ]);

    // The browser really performed a download, under the level's own name — so this round-trips
    // into public/assets/levels/ rather than producing an untitled blob.
    expect(download.suggestedFilename()).toBe('level-01.tmj');

    const saved = await page.evaluate(() => {
      const blob = (window as unknown as { __savedBlob: Blob | null }).__savedBlob;
      return blob ? blob.text() : null;
    });
    expect(saved, 'no blob was handed to createObjectURL').not.toBeNull();

    // P7: the file has to be a LEVEL, not merely a document containing the right number. Same
    // parser BootScene gates on and the unit suite runs over the shipped bytes.
    const after = parseLevel('level-01', JSON.parse(saved!));

    expect(after.widthTiles).toBe(before.widthTiles);
    expect(after.heightTiles).toBe(before.heightTiles);
    expect(after.tileWidth).toBe(before.tileWidth);
    expect(after.spawn).toEqual(before.spawn);
    expect(after.solids).toHaveLength(before.solids.length);

    const moved = after.solids
      .map((s, i) => ({ i, s, was: before.solids[i]! }))
      .filter(({ s, was }) => s.x !== was.x || s.y !== was.y || s.w !== was.w || s.h !== was.h);

    // Exactly one strip changed, by exactly the nudge, on exactly one axis.
    expect(moved).toHaveLength(1);
    const { s, was } = moved[0]!;
    expect(s.y - was.y).toBe(NUDGE_PRESSES);
    expect(s.x).toBe(was.x);
    expect(s.w).toBe(was.w);
    expect(s.h).toBe(was.h);
  });

  test('the nudge takes effect in the live simulation, not only in the saved file', async ({
    page,
  }) => {
    // The editor exists because art bottoms and collision bottoms disagree, and you can only see
    // that with the character standing on the strip. So the edit has to be live: a version that
    // only recorded pending changes for the save would pass the round-trip test above while
    // showing the designer nothing.
    await bootToGame(page);
    await enterEditor(page);

    await page.keyboard.press('BracketRight');
    await page.keyboard.press('BracketRight');

    const settled = await page.evaluate(() => window.__game?.player as { y?: number });
    expect(typeof settled?.y).toBe('number');

    for (let i = 0; i < NUDGE_PRESSES; i += 1) {
      await page.keyboard.press('ArrowDown');
    }

    const after = await page.evaluate(() => window.__game?.player as { y?: number });
    expect(after.y! - settled.y!).toBe(NUDGE_PRESSES);
  });

  /**
   * ADDED AFTER THE CODE-REVIEWER GATE OWNER (brief 2, adversarial) FOUND THE BUG THIS COVERS.
   *
   * Every editor test in this file pressed ArrowDown and nothing else, so three of the four
   * vertical paths were unexercised — and ArrowUp was broken: it nudged the strip AND fired a jump,
   * throwing the character 57 px off the strip being edited. `heldJump` contains UP, and the scene
   * had "disabled" player input by clearing the key arrays, which cannot detach an already-bound
   * `key.on('down')` listener.
   *
   * Nudging UP is the direction you use when collision sits below the art — the exact defect this
   * scene exists to fix. So the untested direction was the one that mattered.
   */
  test('ArrowUp nudges the strip and does NOT make the player jump', async ({ page }) => {
    await bootToGame(page);
    await enterEditor(page);
    await page.keyboard.press('BracketRight');

    const before = await page.evaluate(() => window.__game?.player as { y?: number; state?: string });
    expect(before.state).toBe('idle');

    // Sample every frame across the nudge: a jump would show as a 'jump'/'fall' state or a y that
    // departs and returns. Reading only before and after could miss the whole 37-tick arc.
    const arc = await page.evaluate(async () => {
      const states = new Set<string>();
      let minY = Number.POSITIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;
      let samples = 0;
      const done = (async () => {
        for (let frame = 0; frame < 90; frame += 1) {
          await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
          const p = window.__game?.player as { y?: number; state?: string } | null | undefined;
          if (typeof p?.y !== 'number' || typeof p?.state !== 'string') continue;
          samples += 1;
          states.add(p.state);
          minY = Math.min(minY, p.y);
          maxY = Math.max(maxY, p.y);
        }
      })();
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38, which: 38, bubbles: true }),
      );
      await done;
      return { states: [...states], minY, maxY, samples };
    });

    expect(arc.samples).toBeGreaterThan(40);
    // Never left the ground: no jump or fall state at any sampled frame.
    expect(arc.states).toEqual(['idle']);
    // The strip moved up by exactly one pixel, and the player came with it — no arc.
    expect(before.y! - arc.minY).toBe(1);
    expect(arc.maxY).toBe(arc.minY);
  });

  test('SPACE does not make the player jump inside the editor either', async ({ page }) => {
    // The same root cause reached Space and W, not only UP. One guard covers all of them, so this
    // is the test that proves the guard is the guard rather than a per-key patch.
    await bootToGame(page);
    await enterEditor(page);
    await page.keyboard.press('BracketRight');

    const before = await page.evaluate(() => (window.__game?.player as { y?: number }).y);
    await page.keyboard.down('Space');
    const states = await page.evaluate(async () => {
      const seen = new Set<string>();
      for (let frame = 0; frame < 60; frame += 1) {
        await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        const p = window.__game?.player as { state?: string } | null | undefined;
        if (typeof p?.state === 'string') seen.add(p.state);
      }
      return [...seen];
    });
    await page.keyboard.up('Space');

    expect(states).toEqual(['idle']);
    expect(await page.evaluate(() => (window.__game?.player as { y?: number }).y)).toBe(before);
  });

  test('R reverts the selected strip to its authored position', async ({ page }) => {
    await bootToGame(page);
    await enterEditor(page);

    await page.keyboard.press('BracketRight');
    const authored = await page.evaluate(() => (window.__game?.player as { y?: number }).y);

    for (let i = 0; i < NUDGE_PRESSES; i += 1) {
      await page.keyboard.press('ArrowDown');
    }
    const nudged = await page.evaluate(() => (window.__game?.player as { y?: number }).y);
    expect(nudged! - authored!).toBe(NUDGE_PRESSES);

    await page.keyboard.press('r');
    const reverted = await page.evaluate(() => (window.__game?.player as { y?: number }).y);
    expect(reverted).toBe(authored);
  });

  test('O returns to the production scene, and the editor is not on the boot route', async ({
    page,
  }) => {
    await bootToGame(page);
    expect(await page.evaluate(() => window.__game?.sceneKey)).toBe('Game');

    await enterEditor(page);
    await page.keyboard.press('o');
    await page.waitForFunction(() => window.__game?.sceneKey === 'Game', undefined, {
      timeout: BOOT_TIMEOUT,
    });

    // Still a working game afterwards, not a scene left half torn down.
    expect(await page.evaluate(() => window.__game?.ready)).toBe(true);
    expect(await page.evaluate(() => window.__game?.levelId)).toBe('level-01');
  });
});
