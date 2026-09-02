/**
 * The shake-safe camera viewport: grown by the shake margin, and kept the width of the LIVE view.
 *
 * Split out of `gameEffects.ts` at the 400-line ceiling when the resize handling landed. Two
 * separate concerns live here and they pull in opposite directions, which is the reason the file
 * is worth reading before changing either:
 *
 *   - the **margin** is design-anchored and must stay so. `screenShake.ts:110-112` records why:
 *     `shakeSafeMargin` takes the DESIGN size, and feeding the grown viewport back into it is a
 *     feedback loop that grows the camera every resize.
 *   - the **size** must track the live view, because `src/game/viewSize.ts` makes that view up to
 *     `MAX_GAME_WIDTH` wide.
 *
 * So the camera's position never moves and its size always does.
 */

import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { shakeSafeMargin } from '../render/screenShake';

export interface ShakeViewport {
  /** The camera's unshaken position. `applyShake` writes `base + offset` absolutely. */
  base: { x: number; y: number };
  destroy(): void;
}

export function attachShakeViewport(scene: Phaser.Scene): ShakeViewport {
  const margin = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);

  /**
   * 🔴 **The SIZE tracks the live view; the MARGIN does not.**
   *
   * `shakeSafeMargin` deliberately takes the DESIGN size — `screenShake.ts:110-112` warns that
   * feeding the grown viewport back in is a feedback loop — so the margin is a constant and the
   * camera's position never moves. Only the width changes, and it must, because
   * `src/game/viewSize.ts` makes the live view up to `MAX_GAME_WIDTH` wide: a camera pinned to
   * `GAME_WIDTH + 2 * margin.x` on a 2400 px canvas draws ~460 px of raw `backgroundColor` down the
   * right edge. The pillarbox would simply move from outside the canvas to inside it.
   */
  const sizeCamera = (): void => {
    const camera = scene.cameras?.main;
    if (!camera) return;
    const { width, height } = scene.scale.gameSize;
    const w = width + margin.x * 2;
    const h = height + margin.y * 2;
    // Guarded: `setSize` on an unchanged size still dirties the camera's matrix every resize event,
    // and RESIZE fires on far more than a real size change.
    if (camera.width === w && camera.height === h) return;
    camera.setSize(w, h);
  };

  sizeCamera();
  scene.cameras.main.setPosition(-margin.x, -margin.y);

  /**
   * ⚠️ **Phaser will NOT re-size this camera for us, and that is the whole reason this listener
   * exists.** `CameraManager.onResize` only touches cameras at `(0,0)` whose size equals the
   * PREVIOUS game size (`CameraManager.js:685`) — and this one is deliberately at a negative offset
   * and deliberately oversized, so it matches neither test. Left alone it keeps its first size
   * forever and the band reappears on the next fullscreen toggle or rotation. Named by the Codex
   * plan review, round 1.
   */
  scene.scale.on('resize', sizeCamera);

  const base = { x: scene.cameras.main.x, y: scene.cameras.main.y };

  let alive = true;
  const viewport: ShakeViewport = {
    base,
    destroy() {
      if (!alive) return;
      alive = false;
      // Global emitter, scene-scoped owner: the ScaleManager outlives every scene, so a listener
      // left behind keeps a dead closure alive and accumulates one per level restart.
      scene.scale.off('resize', sizeCamera);
    },
  };
  /**
   * ⚠️ **No lifecycle subscription here — `attachEffects` owns it.**
   *
   * This module registered its own SHUTDOWN/DESTROY handlers at first, and the result was four
   * listeners where the gate expects two: the effects attachment already tears down on both events
   * and already calls `viewport.destroy()`. One owner, one registration. The `alive` latch stays,
   * so a caller that does tear down twice is still safe.
   */
  return viewport;
}
