/**
 * What the level-complete flow LOOKS like, read out of the running page. Phase 8, criterion 8.6.
 *
 * Split out of `phase-08-complete.spec.ts` when that file reached the 400-line limit. Everything here
 * is a reader — it asks the live scenes what they drew and returns plain data; the assertions and the
 * driving stay in the spec.
 *
 * ## Why these read private scene fields instead of `window.__game`
 *
 * The debug surface is closed at eight fields by a Phase 1 Codex ruling, and the exit's position, the
 * fade's alpha and the panel's four lines are none of them. `window.__phaserGame` is the established
 * alternative — the same route `drawnVsSim.ts` and `perfSampler.ts` already take — and it is what lets
 * a spec assert against the DRAWN object rather than against the sim state that ought to have produced
 * it. Deleting `renderPlayer()` once left every Phase 2 test green; that is the failure this avoids.
 *
 * ## `willRender(camera)`, never `visible && alpha`
 *
 * A Phase 6 lesson: `setScale(0)` leaves both of those truthy while the GPU draws nothing at all.
 * `willRender` is the question Phaser itself asks before submitting the object.
 */

import type { Page } from '@playwright/test';

/** The sim player's x, straight off the closed debug surface. No ninth field needed. */
export async function playerX(page: Page): Promise<number> {
  return page.evaluate(
    () => (window as unknown as { __game: { player: { x: number } | null } }).__game.player?.x ?? Number.NaN,
  );
}

export interface DrawnGoal {
  x: number;
  y: number;
  alpha: number;
  depth: number;
  willRender: boolean;
  /** World-space bounds of what is actually DRAWN — see the note on `drawnGoal`. */
  bounds: { x: number; y: number; w: number; h: number };
}

/**
 * The exit, read off the live scene through `__phaserGame` — the `drawnVsSim.ts` pattern.
 *
 * 🔴 `bounds`, not `x`/`y`, is what an ALIGNMENT assertion can use. The greybox exit is a `Graphics`
 * object left at the origin that draws in WORLD coordinates, so its transform reads `(0, 0)` however
 * far from the goal rect the drawing actually is — and the align test compared neither. Codex's
 * implementation review named it: offsetting those `fillRect` calls would separate the exit from its
 * trigger while every assertion in that test stayed green. `getBounds()` is the drawn extent, which
 * is the thing the claim is about.
 */
export async function drawnGoal(page: Page): Promise<DrawnGoal | null> {
  return page.evaluate(() => {
    const scene = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('Game') as {
      goalObject?: {
        x: number;
        y: number;
        alpha: number;
        depth: number;
        willRender(camera: unknown): boolean;
        getBounds(): { x: number; y: number; width: number; height: number };
      };
      cameras: { main: unknown };
    };
    const g = scene.goalObject;
    if (!g) return null;
    const b = g.getBounds();
    return {
      x: g.x,
      y: g.y,
      alpha: g.alpha,
      depth: g.depth,
      willRender: g.willRender(scene.cameras.main),
      bounds: { x: b.x, y: b.y, w: b.width, h: b.height },
    };
  });
}

export interface DrawnOverlay {
  present: boolean;
  fadeAlpha: number;
  fadeRenders: boolean;
  lines: { text: string; alpha: number; renders: boolean }[];
}

/** The level-complete panel, read off the parallel `UIScene`. */
export async function drawnOverlay(page: Page): Promise<DrawnOverlay> {
  return page.evaluate(() => {
    const ui = (
      window as unknown as { __phaserGame: { scene: { getScene(k: string): unknown } } }
    ).__phaserGame.scene.getScene('UI') as {
      overlay?: {
        fade: { alpha: number; willRender(c: unknown): boolean };
        lines: { text: string; alpha: number; willRender(c: unknown): boolean }[];
      };
      cameras: { main: unknown };
    };
    if (!ui?.overlay) return { present: false, fadeAlpha: 0, fadeRenders: false, lines: [] };
    const cam = ui.cameras.main;
    return {
      present: true,
      fadeAlpha: ui.overlay.fade.alpha,
      fadeRenders: ui.overlay.fade.willRender(cam),
      lines: ui.overlay.lines.map((l) => ({ text: l.text, alpha: l.alpha, renders: l.willRender(cam) })),
    };
  });
}
