import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import { TOUCH_IDS } from '../../src/render/touchLayout';
import type { TouchBinding, TouchGameSceneLike } from '../../src/scenes/touchControlsLayer';
import { TouchSession } from '../../src/scenes/touchSession';
import { attachUiTouch } from '../../src/scenes/uiTouch';
import { makeTouchScene, type TouchSceneHarness } from './touchSceneFake';

/**
 * **The three objects `UIScene` hangs on the touch build, and the wiring between them.**
 *
 * 🔴 This file exists because the mutation matrix found a hole. M2b deletes `session.deactivate()`
 * from `attachUiTouch`'s `destroy()` — the one line that stops the session writing to a layer that
 * is about to be destroyed — and the whole suite stayed **green**. `touch-session.test.ts` drives
 * `TouchSession` against a fake layer and never imports `attachUiTouch`; `touch-draw-path.test.ts`
 * drives the layer directly and never imports the session. Neither one can see the seam between
 * them, which is exactly where the defect lives.
 *
 * *(A row that reds nothing is a hole in the gate, not a mutation to drop.)*
 *
 * ## What a missed `deactivate()` actually costs
 *
 * `UIScene` survives the level-to-level `scene.start('Game')` and is reused after a level-select
 * round trip (`Systems.js:760-788`), so its `TouchSession` outlives every layer it ever drives. With
 * the session still pointing at a destroyed layer, the next `bind()` — the one that arrives with the
 * *new* `Game` scene — lands on the corpse, and the corpse subscribes `PAUSE`/`SLEEP`/`SHUTDOWN`/
 * `DESTROY` handlers to a scene that will never reach anything drawn. That is the observable below:
 * **after teardown, binding a fresh `Game` scene must register nothing on it.**
 */

/** A second `Game` scene, for the bind that arrives after teardown. Records its own subscriptions. */
function nextGameScene(): TouchGameSceneLike & { events$: string[] } {
  const events$: string[] = [];
  return {
    events$,
    events: {
      on(event: string) {
        events$.push(event);
      },
      off(event: string) {
        const i = events$.indexOf(event);
        if (i >= 0) events$.splice(i, 1);
      },
    },
  };
}

function bindingFor(scene: TouchSceneHarness, gameScene: TouchGameSceneLike): TouchBinding {
  return {
    input$: createSnapshot(),
    gameScene,
    isGameRunning: () => scene.gameStatusRunning,
    isPlayerInputEnabled: () => scene.playerInputEnabled,
    openLevelSelect: () => {
      scene.levelSelectOpened += 1;
    },
  };
}

/** What `UIScene.create()` does, on a touch device. */
function attached() {
  const scene = makeTouchScene();
  const session = new TouchSession();
  const overlay = attachUiTouch(scene.scene, true, session);
  return { scene, session, overlay };
}

describe('attachUiTouch wires the session to the layer it just built', () => {
  it('activates the session, so a binding held from before create() reaches the controls', () => {
    // The cold-boot order: attachHud binds first, UIScene.create() runs second.
    const scene = makeTouchScene();
    const session = new TouchSession();
    session.bind(bindingFor(scene, scene.gameScene));

    attachUiTouch(scene.scene, true, session);

    // The layer took the binding: it drew its zones AND watched the bound Game scene's loss paths.
    expect(scene.zones.map((z) => z.id).sort()).toEqual([...TOUCH_IDS].sort());
    expect(scene.gameSceneEvents.length).toBeGreaterThan(0);
  });

  it('refreshes the controls, so the live predicate is re-evaluated every frame', () => {
    const { scene, session, overlay } = attached();
    session.bind(bindingFor(scene, scene.gameScene));
    overlay.refresh();
    for (const z of scene.zones) expect(z.interactive).toBe(true);

    // The state the predicate exists to catch: Game is no longer RUNNING. Only a refresh that
    // actually reaches the layer can see it.
    scene.gameStatusRunning = false;
    overlay.refresh();
    for (const z of scene.zones) expect(z.interactive).toBe(false);
  });

  it('DEACTIVATES the session before the layer is destroyed, so a later bind cannot reach it', () => {
    const { scene, session, overlay } = attached();
    session.bind(bindingFor(scene, scene.gameScene));
    expect(scene.gameSceneEvents.length).toBeGreaterThan(0);

    overlay.destroy();

    // The level-select return: the SAME UIScene, the SAME session, a NEW Game scene.
    const next = nextGameScene();
    session.bind(bindingFor(scene, next));

    expect(
      next.events$,
      'a destroyed layer subscribed to the new Game scene — the session was never deactivated',
    ).toEqual([]);
  });

  it('destroys the layer, so nothing it drew survives the shutdown', () => {
    const { scene, overlay } = attached();
    overlay.destroy();
    for (const z of scene.zones) expect(z.destroyed).toBe(true);
    for (const f of scene.faces) expect(f.destroyed).toBe(true);
  });

  it('draws nothing at all on a device with no touch', () => {
    const scene = makeTouchScene();
    attachUiTouch(scene.scene, false, new TouchSession());
    expect(scene.zones).toEqual([]);
    expect(scene.faces).toEqual([]);
  });
});
