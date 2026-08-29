import { expect, test } from '@playwright/test';

import { TOUCH_MIN_CSS_PX, TOUCH_MIN_GAP_CSS_PX } from '../../src/render/touchLayout';
import {
  bootToTouchPlay,
  canvasRect,
  cssSeparation,
  drawnFaces,
  drawnZones,
  installTouchDriver,
  measuredTargets,
  rotatePromptVisible,
} from './touchHarness';

/**
 * **Criteria 12.8, 12.9 and 12.10 — measured, never computed.**
 *
 * 🔴 The Codex plan review's round-1 finding 7: a layout predicate used as its own oracle cannot
 * fail. `touchTargetsFit(touchLayout(1920, 1080), 0.347)` is true whether or not a single object was
 * drawn, and true with every control four hundred pixels off the canvas. So every number here comes
 * from `getBounds()`-equivalent live object geometry and the canvas's own `getBoundingClientRect`,
 * measured independently inside the page, with the two floors imported only as the FIGURES to
 * compare against.
 *
 * The floors themselves are cited, not invented: `ui-ux-pro-max`'s `ux-guidelines.csv`, Touch ->
 * *Touch Target Size* (*"Minimum 44x44px touch targets"*, severity High) and Touch -> *Touch
 * Spacing* (*"Minimum 8px gap between touch targets"*, severity Medium).
 */

interface Viewport {
  name: string;
  width: number;
  height: number;
  /** Portrait phones, where the controls cannot be made big enough. */
  expectPrompt?: boolean;
}

/** The whole in-scope matrix, plus the two the rotate prompt exists for. */
const VIEWPORTS: Viewport[] = [
  { name: 'iPhone SE landscape', width: 667, height: 375 },
  { name: 'iPhone 14 landscape', width: 844, height: 390 },
  { name: 'Pixel 7 landscape', width: 892, height: 412 },
  { name: 'declared minimum', width: 852, height: 480 },
  { name: 'iPad landscape', width: 1024, height: 768 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'desktop', width: 1920, height: 1080 },
  { name: 'iPhone 14 portrait', width: 390, height: 844, expectPrompt: true },
  { name: 'Pixel 7 portrait', width: 412, height: 892, expectPrompt: true },
];

test.beforeEach(async ({ page }) => {
  await installTouchDriver(page);
});

for (const vp of VIEWPORTS) {
  test(`12.8/12.9/12.10 ${vp.name} ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await bootToTouchPlay(page);

    const rect = await canvasRect(page);
    const zones = await drawnZones(page, 'UI');
    expect(zones.length, 'the controls were never built on a touch device').toBe(5);

    if (vp.expectPrompt) {
      // 12.10 — the prompt appears IFF a live target would fall under the floor, and the controls
      // underneath it go non-interactive. A prompt that only hides them would leave a tap meant for
      // "turn your phone" moving the player.
      expect(await rotatePromptVisible(page, 'UI'), 'no rotate prompt on a phone held upright').toBe(
        true,
      );
      for (const z of zones) {
        expect(z.interactive, `${z.name} is still live under the rotate prompt`).toBe(false);
      }
      // ⚠️ Visibility is read off the FACES. A Zone renders nothing, so its own visible flag stays
      // true whatever the controls are doing — asserting on it measured the wrong object.
      const faces = await drawnFaces(page, 'UI');
      expect(faces.length, 'the controls have no faces to hide').toBeGreaterThan(0);
      for (const f of faces) {
        expect(f.visible, `${f.name} is still drawn under the rotate prompt`).toBe(false);
      }
      return;
    }

    expect(
      await rotatePromptVisible(page, 'UI'),
      'a rotate prompt on a viewport whose controls fit',
    ).toBe(false);

    const targets = await measuredTargets(page, 'UI');
    expect(targets.length, 'no live target survived to be measured').toBe(5);

    for (const t of targets) {
      // Type before value, every field, every time.
      expect(typeof t.w).toBe('number');
      expect(typeof t.h).toBe('number');

      // 12.9 — the size floor, in the units it is written in.
      expect(t.w, `${t.name} is ${t.w.toFixed(1)} CSS px wide`).toBeGreaterThanOrEqual(
        TOUCH_MIN_CSS_PX,
      );
      expect(t.h, `${t.name} is ${t.h.toFixed(1)} CSS px tall`).toBeGreaterThanOrEqual(
        TOUCH_MIN_CSS_PX,
      );

      // 12.8 — fully inside the canvas the browser actually laid out. A half-pixel of slack for the
      // ScaleManager's `autoRound`, and no more.
      expect(t.x, `${t.name} runs off the left of the canvas`).toBeGreaterThanOrEqual(rect.left - 0.5);
      expect(t.y, `${t.name} runs off the top of the canvas`).toBeGreaterThanOrEqual(rect.top - 0.5);
      expect(t.x + t.w, `${t.name} runs off the right of the canvas`).toBeLessThanOrEqual(
        rect.left + rect.width + 0.5,
      );
      expect(t.y + t.h, `${t.name} runs off the bottom of the canvas`).toBeLessThanOrEqual(
        rect.top + rect.height + 0.5,
      );
    }

    // 12.8 — pairwise non-overlapping, and 12.9 — pairwise far enough apart.
    for (let i = 0; i < targets.length; i += 1) {
      for (let j = i + 1; j < targets.length; j += 1) {
        const gap = cssSeparation(targets[i], targets[j]);
        expect(
          gap,
          `${targets[i].name} and ${targets[j].name} are ${gap.toFixed(1)} CSS px apart`,
        ).toBeGreaterThanOrEqual(TOUCH_MIN_GAP_CSS_PX);
      }
    }
  });
}

test('12.10 rotating out of portrait clears the prompt without a reload', async ({ page }) => {
  // A phone in a pocket is portrait; the player turns it and expects to play. The prompt is polled
  // from the same predicate the controls are gated on, so both must move together.
  await page.setViewportSize({ width: 390, height: 844 });
  await bootToTouchPlay(page);
  expect(await rotatePromptVisible(page, 'UI')).toBe(true);

  await page.setViewportSize({ width: 844, height: 390 });
  await page.waitForFunction(
    () => {
      type Obj = { type: string; text?: string; visible: boolean };
      type Handle = { scene: { getScene(k: string): { children?: { list: Obj[] } } | null } };
      const scene = (window as unknown as { __phaserGame?: Handle }).__phaserGame?.scene.getScene('UI');
      return !(scene?.children?.list ?? []).some(
        (o) => o.type === 'Text' && typeof o.text === 'string' && o.text.includes('ROTATE') && o.visible,
      );
    },
    undefined,
    { timeout: 10_000 },
  );

  for (const z of await drawnZones(page, 'UI')) {
    expect(z.interactive, `${z.name} did not come back when the phone was turned`).toBe(true);
  }
});

test('12.8/12.9 the level menu rows clear the same floors', async ({ page }) => {
  // 🔴 The menu is measured too, and it is the screen that needed a new layout to pass: its keyboard
  // `ROW_HEIGHT` of 68 game px is 23.6 CSS px at the worst in-scope scale.
  await page.setViewportSize({ width: 667, height: 375 });
  await bootToTouchPlay(page);
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__game?.sceneKey === 'LevelSelect', undefined, {
    timeout: 10_000,
  });

  const rect = await canvasRect(page);
  const rows = await measuredTargets(page, 'LevelSelect');
  expect(rows.length, 'the level menu has no measurable touch targets').toBeGreaterThan(0);

  for (const r of rows) {
    expect(r.h, `${r.name} is ${r.h.toFixed(1)} CSS px tall`).toBeGreaterThanOrEqual(TOUCH_MIN_CSS_PX);
    expect(r.w, `${r.name} is ${r.w.toFixed(1)} CSS px wide`).toBeGreaterThanOrEqual(TOUCH_MIN_CSS_PX);
    expect(r.y, `${r.name} runs off the top`).toBeGreaterThanOrEqual(rect.top - 0.5);
    expect(r.y + r.h, `${r.name} runs off the bottom`).toBeLessThanOrEqual(rect.top + rect.height + 0.5);
  }
  for (let i = 0; i < rows.length; i += 1) {
    for (let j = i + 1; j < rows.length; j += 1) {
      expect(
        cssSeparation(rows[i], rows[j]),
        `${rows[i].name} and ${rows[j].name} are too close to tell apart`,
      ).toBeGreaterThanOrEqual(TOUCH_MIN_GAP_CSS_PX);
    }
  }
});
