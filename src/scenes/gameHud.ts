import type Phaser from 'phaser';
import { UIScene } from './UIScene';
import { GearLayer } from './gearLayer';
import type { World } from '../sim/types';

/**
 * The seam between `GameScene` and everything that draws the player's status.
 *
 * ## What this file used to be
 *
 * Until Phase 6 it owned the HUD outright: it added `hud-health` at `setScrollFactor(0)` on
 * `GameScene`'s own display list and painted the spent portion of the bar over it. That worked and
 * it was wrong for one reason — **a zero scroll factor pins an object against camera pan but not
 * against camera zoom** *(vault 6.1)*. The HUD was correct only because `CAMERA_ZOOM` happens to be
 * 1; the first zoom would have scaled it with the world.
 *
 * The HUD moved to a parallel `UIScene`, which has its own camera and its own display list. This
 * file kept its name and its job description — *the Phaser plumbing around the HUD* — and is now
 * the two lines of plumbing that remain. It is not deleted because `GameScene` is this project's
 * only file over the 400-line ceiling, and every line kept out of it is load-bearing.
 */

/** What `GameScene` holds on to after attaching the HUD. */
export interface HudAttachment {
  ui: UIScene;
  gears: GearLayer;
}

/**
 * Launch the parallel HUD scene and build the world's gear bodies.
 *
 * `launch`, never `start`: `start` would stop the calling scene, which is the entire difference
 * between a HUD that runs alongside the game and a HUD that replaces it. The `isActive` guard is
 * for the restart path — an e2e spec re-entering `BootScene` runs `create()` again, and launching a
 * scene that is already running stacks a second copy of every HUD object.
 */
export function attachHud(scene: Phaser.Scene, world: World): HudAttachment {
  const gears = new GearLayer(scene, world);
  gears.create();

  if (!scene.scene.isActive('UI')) {
    scene.scene.launch('UI');
  }
  const ui = scene.scene.get('UI') as UIScene;
  // 🔴 Phase 8. `UIScene` is PARALLEL, so it survives the `scene.start('Game', {levelId: next})` that
  // loads the next level — and with it, level-01's "LEVEL COMPLETE" panel. Clearing it here rather
  // than in `gameComplete` is the honest place: this is the one call that runs on every entry into a
  // level, including the restart path an e2e spec drives through Boot. On the first launch of the
  // frame this is a no-op, because `create()` has not run yet and there is nothing to clear.
  ui.levelComplete?.(null);
  return { ui, gears };
}
