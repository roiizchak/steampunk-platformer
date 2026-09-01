/**
 * **What is actually on screen, measured — the other half of `touchHarness.ts`.**
 *
 * 🔴 Every number here comes from a LIVE object or from the canvas's own
 * `getBoundingClientRect`, never from `touchLayout()`. The Codex plan review named the trap in
 * round 1: a layout predicate used as its own oracle is green with nothing drawn at all, and green
 * with every control four hundred pixels off the canvas. Criteria 12.8 and 12.9 stand on this file
 * being independent of the production layout, so it imports nothing from `src/render/`.
 *
 * Split out of `touchHarness.ts` when that file crossed the 400-line ceiling. The seam is real,
 * not arbitrary: driving contacts and measuring geometry are two jobs, and only one of them has
 * to be careful about where its numbers come from.
 */

import { expect } from '@playwright/test';


type Page = import('@playwright/test').Page;

/** Where a drawn touch object actually is, in GAME pixels, read off the live display list. */
export interface DrawnZone {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  interactive: boolean;
  visible: boolean;
}

/** The canvas as the browser lays it out, in CSS pixels. */
export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
  /**
   * The BACKING STORE size — `canvas.width`/`canvas.height`, i.e. the live game size in game px.
   *
   * 🔴 **This is the denominator now, and `GAME_WIDTH` was wrong the moment the view could widen.**
   * Under `Phaser.Scale.FIT` the backing store never moved off 1920 x 1080, so the design constant
   * and the live game size were the same number and nothing noticed which one was meant. The fill
   * separates them: the backing store is up to `MAX_GAME_WIDTH` wide, and a game-px coordinate
   * divided by 1920 lands proportionally too far right — every synthesised tap in the touch suite
   * missing its control, on a page where the controls are drawn correctly.
   *
   * ⚠️ Read from the ELEMENT rather than from `scale.gameSize`. This helper also serves specs that
   * run against the production bundle, where `phase-10-production.spec.ts` asserts both
   * `window.__game` and `window.__phaserGame` are absent — there is no Phaser handle to ask. Named
   * by the Codex plan review, round 4.
   */
  backingWidth: number;
  backingHeight: number;
}
/** The canvas's laid-out rectangle. The denominator for every CSS-pixel claim in this phase. */
export async function canvasRect(page: Page): Promise<CanvasRect> {
  const rect = await page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    return {
      left: r.left,
      top: r.top,
      width: r.width,
      height: r.height,
      backingWidth: c.width,
      backingHeight: c.height,
    };
  });
  expect(rect, 'no canvas on the page').not.toBeNull();
  expect(typeof rect!.width).toBe('number');
  expect(rect!.width, 'the canvas has collapsed').toBeGreaterThan(0);
  expect(rect!.backingWidth, 'the canvas has no backing store to scale against').toBeGreaterThan(0);
  return rect!;
}

/**
 * Every named Zone on a scene's display list, in game pixels.
 *
 * 🔴 Read off the LIVE objects, never from `touchLayout()`. The Codex plan review named the trap in
 * round 1: a layout predicate used as its own oracle is green with nothing drawn at all, and green
 * with every control 400 px off the canvas. Criteria 12.8 and 12.9 measure what is on screen.
 */
export async function drawnZones(page: Page, sceneKey: string): Promise<DrawnZone[]> {
  const zones = await page.evaluate((key) => {
    type Obj = {
      type: string;
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      visible: boolean;
      input?: { enabled?: boolean } | null;
    };
    type Handle = { scene: { getScene(k: string): { children?: { list: Obj[] } } | null } };
    const scene = (window as unknown as { __phaserGame?: Handle }).__phaserGame?.scene.getScene(key);
    const list = scene?.children?.list ?? [];
    return list
      .filter((o) => o.type === 'Zone' && o.name !== '')
      .map((o) => ({
        name: o.name,
        x: o.x,
        y: o.y,
        w: o.width,
        h: o.height,
        interactive: Boolean(o.input && o.input.enabled !== false),
        visible: o.visible,
      }));
  }, sceneKey);
  expect(Array.isArray(zones)).toBe(true);
  return zones as DrawnZone[];
}

/** One named zone, asserted to exist — a missing control is a failure, never an empty result. */
export async function drawnZone(page: Page, sceneKey: string, name: string): Promise<DrawnZone> {
  const zones = await drawnZones(page, sceneKey);
  const zone = zones.find((z) => z.name === name);
  expect(zone, `no zone named "${name}" on scene ${sceneKey} — found [${zones.map((z) => z.name)}]`).toBeDefined();
  return zone!;
}

/**
 * Game pixels -> CSS pixels on the page, through the canvas's measured rectangle.
 *
 * The denominator is the canvas's own BACKING store, not the design constant — see `CanvasRect`.
 * At a fixed view the two agreed; at a filled one they do not, and the design constant sends every tap to
 * the wrong place on a widened view.
 */
export function toClient(rect: CanvasRect, gameX: number, gameY: number): { x: number; y: number } {
  return {
    x: rect.left + (gameX * rect.width) / rect.backingWidth,
    y: rect.top + (gameY * rect.height) / rect.backingHeight,
  };
}

/** The centre of a drawn zone, in CSS pixels — where a thumb would actually land. */
export function centreOf(rect: CanvasRect, zone: DrawnZone): { x: number; y: number } {
  return toClient(rect, zone.x + zone.w / 2, zone.y + zone.h / 2);
}

/**
 * The named objects the player can SEE, as opposed to the zones they can hit.
 *
 * ⚠️ A `Zone` renders nothing, so its `visible` flag stays true whatever the controls are doing —
 * the first version of the viewport spec asserted on it and failed for that reason alone. Visibility
 * is a property of the faces; hittability is a property of the zones. Two questions, two readings.
 */
export async function drawnFaces(
  page: Page,
  sceneKey: string,
): Promise<{ name: string; visible: boolean; drawn: boolean; alpha: number; w: number; h: number }[]> {
  return page.evaluate((key) => {
    type Cam = unknown;
    type Obj = {
      type: string; name: string; visible: boolean; alpha: number;
      displayWidth: number; displayHeight: number;
      willRender?: (c: Cam) => boolean;
    };
    type Scene = { children?: { list: Obj[] }; cameras?: { main?: Cam } };
    type Handle = { scene: { getScene(k: string): Scene | null } };
    const scene = (window as unknown as { __phaserGame?: Handle }).__phaserGame?.scene.getScene(key);
    const cam = scene?.cameras?.main;
    return (scene?.children?.list ?? [])
      .filter((o) => o.type !== 'Zone' && o.name !== '')
      .map((o) => ({
        name: o.name,
        visible: o.visible,
        // 🔴 `visible` is not "the player sees pixels". Phaser's own `willRender(camera)` folds in
        // alpha, scale, the render flags and the camera's filter — a face at alpha 0 or zero display
        // size stays `visible: true` and draws nothing. A perf gate that trusted `visible` could time
        // an arm that renders no controls at all, which is the criterion's own named failure mode
        // passing its own precondition. Codex round 14, finding 7.
        drawn: typeof o.willRender === 'function' && cam !== undefined ? o.willRender(cam) : o.visible,
        alpha: o.alpha,
        w: Math.round(o.displayWidth),
        h: Math.round(o.displayHeight),
      }));
  }, sceneKey);
}

/**
 * The EFFECTIVE alpha of a named face — what the player's eye is actually given.
 *
 * ⚠️ **This is Phaser's OBJECT alpha, not the composited alpha of any one pixel.** The two
 * differ for a generated face, whose plate is also faded in the bytes — what the screen shows is
 * the product. What this reads is the one number the layer sets, which is exactly what a lit/unlit
 * question needs: `visible` alone cannot tell a lit plate from a dark one, because both paths carry
 * their state in that number (`ART_ALPHA` -> `ART_ALPHA_PRESSED` for art, `PLATE_ALPHA` ->
 * `PLATE_ALPHA_PRESSED` for the drawn box). Comparisons here are therefore relative — lit against
 * that face's own rest — and never against a constant.
 *
 * `null` when no such face is drawn, which is a different answer from `0` and must not be collapsed
 * into one.
 */
export async function faceAlpha(page: Page, sceneKey: string, name: string): Promise<number | null> {
  return page.evaluate(
    ([key, wanted]) => {
      type Obj = { type: string; name: string; visible: boolean; alpha: number };
      type Handle = { scene: { getScene(k: string): { children?: { list: Obj[] } } | null } };
      const scene = (window as unknown as { __phaserGame?: Handle }).__phaserGame?.scene.getScene(key);
      const face = (scene?.children?.list ?? []).find((o) => o.type !== 'Zone' && o.name === wanted);
      return face ? (face.visible ? face.alpha : 0) : null;
    },
    [sceneKey, name] as const,
  );
}

/**
 * Is the rotate overlay on screen?
 *
 * 🔴 **This used to read Phaser `Text` objects, and that is why it could not see either defect the
 * owner found by hand.** The overlay is DOM now, and so is this: `display` off the real element,
 * through the real cascade. A flag exported by production would be the same circularity the layout
 * predicate has — satisfied with nothing rendered.
 */
export async function rotatePromptVisible(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const el = document.getElementById('rotate');
    if (el === null) return false;
    return getComputedStyle(el).display !== 'none';
  });
}

/**
 * Where every line of the overlay's copy actually sits, in CSS pixels, measured off the page.
 *
 * 🔴 **The defect no gate in this repository could see.** The copy was two Phaser `Text` objects
 * sized in CSS pixels and positioned in GAME pixels; at phone portrait that ran the subline off both
 * edges and then, after a word-wrap repair, straight through the headline. Both were reported from a
 * real device because nothing here measured a rendered text box. This does.
 */
export async function rotateCopyBoxes(
  page: Page,
): Promise<{ text: string; x: number; y: number; w: number; h: number }[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll('#rotate > *')].map((el) => {
      const r = el.getBoundingClientRect();
      return { text: el.textContent ?? '', x: r.x, y: r.y, w: r.width, h: r.height };
    }),
  );
}

/** Every measured touch target on a scene, in CSS pixels — the units the accessibility floor is in. */
export interface MeasuredTarget {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Convert the live zones to CSS pixels through the live canvas rect.
 *
 * 🔴 Both halves measured, neither computed. Criteria 12.8 and 12.9 are the ones the Codex plan
 * review flagged as circular in round 1: derived from `touchLayout()` they would be green with
 * nothing drawn and green with every control off the canvas.
 */
export async function measuredTargets(page: Page, sceneKey: string): Promise<MeasuredTarget[]> {
  const rect = await canvasRect(page);
  const zones = await drawnZones(page, sceneKey);
  return zones
    .filter((z) => z.interactive)
    .map((z) => {
      const topLeft = toClient(rect, z.x, z.y);
      const bottomRight = toClient(rect, z.x + z.w, z.y + z.h);
      return {
        name: z.name,
        x: topLeft.x,
        y: topLeft.y,
        w: bottomRight.x - topLeft.x,
        h: bottomRight.y - topLeft.y,
      };
    });
}

/** The clear gap between two measured targets, in CSS pixels. 0 if they touch or overlap. */
export function cssSeparation(a: MeasuredTarget, b: MeasuredTarget): number {
  const dx = Math.max(0, a.x - (b.x + b.w), b.x - (a.x + a.w));
  const dy = Math.max(0, a.y - (b.y + b.h), b.y - (a.y + a.h));
  return Math.max(dx, dy);
}

