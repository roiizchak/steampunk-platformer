/**
 * **The game fills the screen: the VIEW takes the viewport's aspect, clamped.**
 *
 * The owner reported black bars left and right in fullscreen on a phone. A landscape phone is
 * ~19.5:9 (2.17) against a 16:9 game, so `Phaser.Scale.FIT` scaled by height and left **17.9 %**
 * of the width black — 151 CSS px on an iPhone 14, 160 on a Pixel 7.
 *
 * The fix is not a different scale mode. It is a different GAME SIZE: give the view the viewport's
 * own aspect at a fixed height, and `FIT` then has nothing left to letterbox. Height stays pinned
 * at `GAME_HEIGHT`, so every `gameH / GAME_HEIGHT` ratio in `src/render/` stays exactly 1 — the
 * HUD, the touch layout and the parallax keep their measured sizes. Only the width breathes,
 * between the `GAME_WIDTH` floor and the `MAX_GAME_WIDTH` ceiling.
 *
 * ## 🔴 Why not `Phaser.Scale.EXPAND`, which exists to do exactly this
 *
 * Because its clamp is unusable here, and this was measured rather than reasoned. EXPAND derives
 * the game size itself and offers `min`/`max` as the only lever — but `ScaleManager` feeds those
 * bounds to `displaySize`, which is **also the CSS style size** (`ScaleManager.js:1131-1140`
 * calls `displaySize.setSize(clampedWindowWidth, clampedWindowHeight)`, and `Size.setSize`
 * re-clamps into the same min/max). The two are in different coordinate spaces — game units and
 * CSS pixels — so a `min` of 1920x1080 forces the canvas to be at least 1920 CSS px wide on a
 * 900 px viewport, and a `max` of 2560x1080 caps the canvas at 1080 CSS px tall on a 1440p
 * monitor. Both were observed: `EXPAND` with this clamp drew a **1920 CSS px** canvas into a
 * 1040 px viewport. There is no assignment of `min`/`max` that bounds the game size without
 * bounding the CSS size the same way, so EXPAND cannot express "clamp the view, still fill the
 * screen". `FIT` over a computed size can, and it keeps the whole `FIT` path — centring, DPR,
 * `autoRound` — that five phases of specs already measure.
 *
 * ## The aspect ceiling is real and is chosen, not discovered
 *
 * Any viewport wider than `MAX_GAME_WIDTH / GAME_HEIGHT` clamps and pillarboxes again. That is
 * past every phone (20:9 = 2.22, 21:9 = 2.33), and it is tested rather than asserted — otherwise
 * the ceiling is a number nothing ever reaches.
 */

import { GAME_HEIGHT, GAME_WIDTH, MAX_GAME_WIDTH } from './constants';

/** Phaser's `Scale.Events.RESIZE`. Named here so this module imports no Phaser value. */
const RESIZE = 'resize';

/**
 * The view width for a viewport, in game units. Pure — this is the whole decision.
 *
 * A zero or absent parent (an unattached canvas, a hidden tab) falls back to the design width
 * rather than dividing by it.
 */
export function liveViewWidth(parentWidth: number, parentHeight: number): number {
  if (!(parentWidth > 0) || !(parentHeight > 0)) return GAME_WIDTH;
  const wanted = Math.round((GAME_HEIGHT * parentWidth) / parentHeight);
  return Math.min(Math.max(wanted, GAME_WIDTH), MAX_GAME_WIDTH);
}

/** The slice of `Phaser.Scale.ScaleManager` this needs, so the gate can drive it without a game. */
export interface ViewScaleLike {
  parentSize: { width: number; height: number };
  gameSize: { width: number; height: number };
  setGameSize(width: number, height: number): unknown;
  on(event: string, fn: () => void): unknown;
  off(event: string, fn: () => void): unknown;
}

/**
 * Keep the view matched to the viewport for the life of the game. Returns a detach.
 *
 * ⚠️ **The equality guard is what stops this recursing.** `setGameSize` calls `refresh()`, which
 * emits `resize` at its end (`ScaleManager.js:993`) — straight back into this handler. The second
 * pass computes the same width, finds the view already there, and returns without calling again.
 * Remove the guard and the first resize is an infinite loop, not a slow one.
 */
export function installViewFill(scale: ViewScaleLike): () => void {
  const apply = (): void => {
    const width = liveViewWidth(scale.parentSize.width, scale.parentSize.height);
    if (scale.gameSize.width === width && scale.gameSize.height === GAME_HEIGHT) return;
    scale.setGameSize(width, GAME_HEIGHT);
  };
  scale.on(RESIZE, apply);
  apply();
  return () => scale.off(RESIZE, apply);
}
