/**
 * **The amplifiers the two red proofs drive**, and the counts that finally made them go red.
 *
 * Split out of `touchPerf.ts` when it crossed the 400-line ceiling — *prefer splitting* — along the
 * seam that was already there: `touchPerf.ts` holds the bounds and the paired-arm machinery the
 * CLEAN gate uses, and nothing in it is imported by a red proof except through this file.
 *
 * 🔴 **Both counts were raised because a run said so, never lowered because one did.** *If the
 * held-out set disagrees, raise the amplifier, never relax the assertion.*
 */

import { type Page } from '@playwright/test';

import { TOUCH_IDS } from '../../src/render/touchLayout';

/**
 * Extra copies of the controls' own faces, drawn in the touch arm only.
 *
 * 🔴 **The controls' own textures, not scrims.** Phase 8 paid for this: its first red proof used 240
 * full-viewport alpha rectangles, and the Codex implementation review was right that this proves the
 * timer can see extreme fill-rate work, not that a regression in *the thing the bound is about* can
 * cross it. Every extra fragment here is a fragment of a touch control, at the controls' own size
 * and alpha.
 *
 * ⚠️ **2000, and it took two corrections.** 40 copies per control — 240 faces, about one screen of
 * fill on this box — moved the paired GPU delta by **0.0563 ms** against a 0.5 ms bound, so the red
 * proof failed outright. 800 read **0.7060 ms** in isolation and then **0.5007 ms** inside the
 * held-out full sweep: a margin of 0.0007 ms, which is a coin flip rather than a proof. *If the
 * held-out set disagrees, raise the amplifier, never relax the assertion.* 2000 is 12 000 faces and
 * the measured cost scales close to linearly, so the sweep-loaded figure lands near 1.25 ms.
 *
 * 🔴 **What that ratio actually says, recorded rather than hidden:** six control faces cost roughly
 * `0.0563 / 240 * 6 ≈ 0.0014 ms` of rasteriser time, so the 0.5 ms tolerance is some 350x the
 * feature's whole fill-rate cost. The GPU bound therefore cannot detect a *proportional* regression
 * in the controls' drawing; it detects an ABSOLUTE one — a shader filter, a full-screen overdraw, a
 * plate re-rasterised every frame — which is the class of regression 12.11 is about.
 *
 * ⚠️ **A `refresh()` moved into `update()` is NOT one of them**, and this list used to say it was.
 * That shape is pure JavaScript layout work: it moves `workMedianMs` and leaves the rasteriser
 * untouched, so `MAX_TOUCH_CPU_DELTA_MS` is what catches it — which is precisely why M73 amplifies
 * that call and not fill rate. `performance-engineer` brief 2, finding 4.
 */
export const FACE_COPIES = 2000;

/**
 * Extra `TouchSession.refresh()` calls per frame on the touch arm — the MAIN-THREAD amplifier.
 *
 * 🔴 **Because `MAX_TOUCH_CPU_DELTA_MS` had never been watched failing.** The GPU red proof
 * amplifies fill rate and asserts only `gpuDelta`; nothing anywhere drove the main-thread delta
 * across its bound, so the criterion-bearing CPU claim rested on prose. *A gate that cannot go red
 * is decoration.* `performance-engineer` brief 1, finding 1.
 *
 * 🔴 **And it is the feature's OWN work, not a busy loop.** `touchPerf.ts` names the regression this
 * bound exists to catch — *"`refresh()` running per frame instead of per state change"* — and
 * `UIScene.touch` is a public `TouchSession` whose `refresh()` re-places and re-gates the six
 * controls (`touchSession.ts:94-95`). Calling it N times per frame IS that regression, N times over.
 * A `while (Date.now() - t < x)` spin would prove the timer can see wall-clock work, which is the
 * stand-in mistake Phase 8 paid for.
 *
 * ⚠️ **6000, because one `refresh()` is CHEAP — and that is the point, not a problem.** 300 per
 * frame moved the paired main-thread delta **0.0500 ms** against a 0.5 ms bound, so a call costs
 * about 0.17 us: `TouchSession.refresh()` reaches a layer that does nothing when nothing changed.
 * The regression this bound names is exactly that cheap path running every frame instead of on a
 * state change, so amplifying the cheap path N times is faithful to it; amplifying an expensive
 * path the feature never takes would not be.
 */
export const REFRESH_COPIES = 6000;

/**
 * Draw `count` extra copies of every control face on the touch arm's UI scene.
 *
 * Returns the number of objects actually added, which the caller asserts — an amplifier that added
 * nothing reads as a bound failing to fire when nothing was ever drawn.
 */
export async function addFaceCopies(page: Page, count: number): Promise<number> {
  return page.evaluate(
    ([n, ids]) => {
      type Obj = {
        type: string; name: string; x: number; y: number; alpha: number;
        displayWidth: number; displayHeight: number; texture?: { key: string };
      };
      type Scene = {
        children: { list: Obj[] };
        add: {
          image(x: number, y: number, key: string): {
            setDisplaySize(w: number, h: number): { setAlpha(a: number): { setDepth(d: number): unknown } };
          };
        };
      };
      const h = (window as unknown as { __phaserGame: { scene: { getScene(k: string): Scene | null } } })
        .__phaserGame;
      const ui = h.scene.getScene('UI');
      if (!ui) return -1;
      let added = 0;
      for (const id of ids as readonly string[]) {
        const face = ui.children.list.find((o) => o.name === id && o.type !== 'Zone');
        if (!face?.texture) continue;
        for (let i = 0; i < (n as number); i += 1) {
          // 🔴 `setDisplaySize` to the REAL face's drawn size, which production sets explicitly
          // (`touchControlsLayer.ts:263-267`) and this amplifier used to leave at the texture's
          // native size. Harmless today only because every shipped face is exactly 160 x 160; a
          // future regeneration at another resolution would silently change what the red proof
          // measures, with nothing catching the drift. `performance-engineer` brief 2, finding 3.
          ui.add
            .image(face.x, face.y, face.texture.key)
            .setDisplaySize(face.displayWidth, face.displayHeight)
            .setAlpha(face.alpha)
            .setDepth(-1);
          added += 1;
        }
      }
      return added;
    },
    [count, TOUCH_IDS] as const,
  );
}

/**
 * Make the touch arm run the controls' own `refresh()` `count` extra times per frame.
 *
 * 🔴 **Subscribed to the scene's UPDATE event, and the first version reassigned `scene.update`.**
 * That is inert: Phaser caches the scene's update function into `sys.sceneUpdate` when the scene
 * boots, so a later assignment to the instance property is never read and the amplifier added
 * nothing while reporting that it had hooked successfully. The boolean below was true and the run
 * measured a clean game.
 *
 * What caught it is the CALL COUNTER, asserted to grow inside every window — *a gate that reports
 * it did something is not a gate that did it*. Kept for the same reason `addFaceCopies` asserts an
 * exact count.
 *
 * The work lands inside the frame Phaser is already timing: `Systems.step` emits UPDATE and then
 * calls `sceneUpdate`, both inside the one rAF callback the sampler measures.
 */
export async function addRefreshCost(page: Page, count: number): Promise<boolean> {
  return page.evaluate((n) => {
    type Session = { refresh(): void };
    type Scene = { touch?: Session; events: { on(k: string, fn: () => void): unknown } };
    const ui = (window as unknown as { __phaserGame: { scene: { getScene(k: string): Scene | null } } })
      .__phaserGame.scene.getScene('UI');
    if (!ui?.touch) return false;
    const w = window as unknown as { __refreshCalls?: number };
    w.__refreshCalls = 0;
    const session = ui.touch;
    ui.events.on('update', () => {
      for (let i = 0; i < n; i += 1) session.refresh();
      w.__refreshCalls = (w.__refreshCalls ?? 0) + n;
    });
    return true;
  }, count);
}

/** How many extra `refresh()` calls the hook has made. Asserted to GROW across the window. */
export async function refreshCalls(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __refreshCalls?: number }).__refreshCalls ?? -1);
}
