/**
 * **A created-and-bound touch layer, on a touch device, with the game running.**
 *
 * Shared by `touch-draw-path.test.ts` and `touch-sim-doors.test.ts`. It lives here because both
 * files need the identical starting state and a second copy would drift — the same reason every
 * positional expectation in those files calls `touchLayout` rather than restating its arithmetic.
 */

import { createSnapshot } from '../../src/sim/input';
import { TouchControlsLayer } from '../../src/scenes/touchControlsLayer';
import { makeTouchScene } from './touchSceneFake';

/** A layer that has been created and bound, on a touch device, with the game running. */
function live() {
  const scene = makeTouchScene();
  const input$ = createSnapshot();
  const layer = new TouchControlsLayer(scene.scene, true);
  scene.readHeld = () => layer.held();
  layer.create();
  layer.bind({
    input$,
    gameScene: scene.gameScene,
    isGameRunning: () => scene.gameStatusRunning,
    isPlayerInputEnabled: () => scene.playerInputEnabled,
    openLevelSelect: () => {
      scene.levelSelectOpened += 1;
    },
  });
  layer.refresh();
  return { scene, input$, layer };
}

export { live };
