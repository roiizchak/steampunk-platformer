import { describe, expect, it } from 'vitest';

import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';
import { createSnapshot } from '../../src/sim/input';
import { TOUCH_BOX_PX, TOUCH_IDS, touchLayout } from '../../src/render/touchLayout';
import {
  GAMEOBJECT_POINTER_DOWN,
  GAME_BLUR,
  GAME_HIDDEN,
  INPUT_GAME_OUT,
  SCENE_DESTROY,
  SCENE_PAUSE,
  SCENE_SHUTDOWN,
  SCENE_SLEEP,
} from '../../src/scenes/engineLiterals';
import { TouchControlsLayer } from '../../src/scenes/touchControlsLayer';
import { live } from './touchLive';
import { makeTouchScene } from './touchSceneFake';

/**
 * **The draw-path gate for `src/render/touchLayout.ts`.**
 *
 * 🔴 A decision function with no consumer is the same defect as a burst of zero particles: it
 * satisfies every assertion about itself and draws nothing. Phase 9 shipped `spriteFeedback.ts` with
 * 221 source lines, a 306-line test file and **zero production consumers**, and blanking all four
 * bodies left the game byte-identical with the suite green.
 *
 * `tests/unit/touch-layout.test.ts` gates the arithmetic. This file gates that a scene APPLIES it —
 * behaviourally, against a fake scene, which `enemy-feedback.test.ts` established as the stronger of
 * the two shapes because a source-text scan is satisfied by a comment.
 *
 * Every positional expectation below is derived by **calling `touchLayout`**, never by restating its
 * arithmetic. A second copy of the numbers would agree with a broken module *(vault 5.3)*.
 */

const layoutAt = (w = GAME_WIDTH, h = GAME_HEIGHT) => touchLayout(w, h);


describe('TouchControlsLayer draws what touchLayout decides', () => {
  it('creates one interactive hit zone per action and no others', () => {
    const { scene } = live();
    expect(scene.zones.map((z) => z.id).sort()).toEqual([...TOUCH_IDS].sort());
    for (const z of scene.zones) {
      expect(z.interactive, `${z.id} was never made interactive — it is decoration`).toBe(true);
    }
  });

  it('places every zone exactly where touchLayout says, at the scene size', () => {
    const { scene } = live();
    for (const want of layoutAt()) {
      const got = scene.zones.find((z) => z.id === want.id)!;
      // Zones are origin (0, 0) so x/y ARE the top-left corner — asserted below rather than assumed.
      expect([got.id, got.x, got.y, got.w, got.h]).toEqual([want.id, want.x, want.y, want.w, want.h]);
      expect(got.originX, `${got.id} is not top-left anchored, so its bounds are not its layout`).toBe(0);
      expect(got.originY).toBe(0);
    }
  });

  it('is not vacuously satisfied by everything sitting at the origin', () => {
    // 🔴 The non-vacuity check the whole file rests on. Blank `touchLayout`'s bodies to return zeroes
    // and the assertion above still passes against its own blanked output — this is the one that
    // does not. Mutation M10.
    const { scene } = live();
    const distinct = new Set(scene.zones.map((z) => `${z.x},${z.y}`));
    expect(distinct.size, 'every control drew in the same place').toBe(TOUCH_IDS.length);
    for (const z of scene.zones) {
      expect(z.w, `${z.id} has no width`).toBe(TOUCH_BOX_PX);
      expect(z.x + z.w, `${z.id} is off the left of the view`).toBeGreaterThan(0);
    }
  });

  it('draws a visible face for every zone, so the player can see what they are pressing', () => {
    // A hit area with nothing drawn over it is invisible and untappable-by-eye. Counted separately
    // from the zones because they are different objects with different jobs.
    const { scene } = live();
    // A control may draw MORE than one face — the grey-box plate carries a glyph on top of it — so
    // the assertion is on the SET of ids, plus one-per-id below. An extra face is fine; a control
    // with no face, or a face labelled something that is not a control, is not.
    expect([...new Set(scene.faces.map((f) => f.id))].sort()).toEqual([...TOUCH_IDS].sort());
    for (const id of TOUCH_IDS) {
      expect(scene.faces.filter((f) => f.id === id).length, `${id} has no face`).toBeGreaterThan(0);
    }
    for (const f of scene.faces) expect(f.visible, `${f.id}'s face is not visible`).toBe(true);
  });

  it('re-lays-out when the scene size changes rather than holding the design size', () => {
    const { scene, layer } = live();
    scene.scene.scale.gameSize = { width: GAME_WIDTH / 2, height: GAME_HEIGHT / 2 };
    scene.scene.scale.displaySize = { width: GAME_WIDTH / 2, height: GAME_HEIGHT / 2 };
    layer.refresh();
    for (const want of layoutAt(GAME_WIDTH / 2, GAME_HEIGHT / 2)) {
      const got = scene.zones.find((z) => z.id === want.id)!;
      expect([got.id, got.x, got.y]).toEqual([want.id, want.x, want.y]);
    }
  });
});

describe('TouchControlsLayer goes quiet when it must', () => {
  it('draws nothing at all on a device with no touch support', () => {
    // Criterion 12.7. A desktop mouse must never see a control, and an invisible-but-interactive
    // object still swallows clicks (`UIScene.ts:36-38`).
    const scene = makeTouchScene();
    const layer = new TouchControlsLayer(scene.scene, false);
    layer.create();
    layer.refresh();
    expect(scene.zones).toHaveLength(0);
    expect(scene.faces).toHaveLength(0);
    expect(layer.live).toBe(false);
  });

  it('CANCELS every contact BEFORE it disables the zones', () => {
    // 🔴 Mutation M7, and the ordering is the whole point. `disableInteractive()` removes the object
    // from Phaser's `_over` lists (`InputPlugin.js:861, 873`), so disabling first suppresses the
    // later object-level release and leaves the action stuck held forever. The fake records what the
    // layer believed was held at the moment it disabled — the only way to see the order from outside.
    const { scene, layer } = live();
    scene.press('right', 1);
    expect(layer.held().right).toBe(true);
    scene.playerInputEnabled = false;
    layer.refresh();
    expect(scene.heldAtDisable, 'a contact survived into disableInteractive').toEqual({
      left: false,
      right: false,
      jump: false,
      // ⚠️ `walk` is a LATCH, not a contact — it is false here because it was never engaged, not
      // because cancelling cleared it. The case below is the one that asserts a loss path leaves it
      // alone.
      walk: false,
    });
    expect(layer.held().right).toBe(false);
  });

  it('keeps the walk LATCH through a loss path that clears every contact', () => {
    // ✅ Owner request, and the reason it is a latch rather than a held button: SHIFT is free on a
    // keyboard and there is no spare thumb on a phone. A latch that a lost focus, a pause or a level
    // transition silently cancelled would put the player back into a run they did not ask for — and
    // the plate would go dark, which is the only place the game says which gait it is in.
    const { scene, layer } = live();
    scene.press('walk', 1);
    scene.releasePointer(1);
    expect(layer.held().walk, 'the toggle did not engage').toBe(true);
    expect(layer.walkLatched).toBe(true);

    scene.press('right', 2);
    scene.playerInputEnabled = false;
    layer.refresh();
    expect(layer.held().right, 'a contact survived the loss path').toBe(false);
    expect(layer.held().walk, 'a loss path un-chose the gait the player picked').toBe(true);

    // And tapping it again turns it off, which is what makes it a toggle rather than a one-way trip.
    scene.playerInputEnabled = true;
    layer.refresh();
    scene.press('walk', 3);
    expect(layer.held().walk, 'the toggle would not turn off').toBe(false);
  });

  it('leaves the walk plate LIT while the latch is engaged, and only that plate', () => {
    const { scene, layer } = live();
    const alphaOf = (id: string): number =>
      scene.faces.filter((f) => f.strokeWidth > 0 && f.id === id)[0].alpha;
    const rest = alphaOf('walk');
    scene.press('walk', 1);
    scene.releasePointer(1);
    expect(alphaOf('walk'), 'the walk plate went dark the moment the finger left').toBeGreaterThan(rest);
    expect(alphaOf('jump'), 'an unrelated plate lit up').toBe(rest);

    // A loss path lifts every FINGER; it does not un-choose a gait, so the plate must stay lit.
    layer.destroy();
    expect(layer.held().walk, 'destroy cancelled the latch').toBe(true);
  });

  it('hides and disables when the game pauses under the welcome screen', () => {
    // 🔴 `UIScene` deliberately outlives PAUSED — that is how the HUD stays up under the Phase 11
    // title card (`UIScene.ts:160-186`) — so without this the controls are live over a frozen game.
    const { scene, layer } = live();
    scene.gameStatusRunning = false;
    layer.refresh();
    expect(layer.live).toBe(false);
    for (const z of scene.zones) expect(z.interactive, `${z.id} is still interactive`).toBe(false);
    for (const f of scene.faces) expect(f.visible, `${f.id} is still drawn`).toBe(false);
  });

  it('hides and disables when the targets are too small to hit', () => {
    // 🔴 Mutation M8. The rotate prompt covers the screen at phone portrait, and if the controls
    // stayed live underneath it a tap meant for "turn your phone" would move the player instead.
    const { scene, layer } = live();
    scene.scene.scale.displaySize = { width: 390, height: 219 }; // iPhone 14 portrait, scale 0.203
    layer.refresh();
    expect(layer.live).toBe(false);
    for (const z of scene.zones) expect(z.interactive).toBe(false);
  });

  it('comes back when the condition clears', () => {
    const { scene, layer } = live();
    scene.gameStatusRunning = false;
    layer.refresh();
    scene.gameStatusRunning = true;
    layer.refresh();
    expect(layer.live).toBe(true);
    for (const z of scene.zones) expect(z.interactive).toBe(true);
  });
});

describe('TouchControlsLayer lifecycle', () => {
  it('subscribes to EVERY loss path, and to exactly those', () => {
    // 🔴 This used to assert `toContain(SCENE_PAUSE)` and nothing else about the four-event array.
    // The QA gate's 12.5 brief found what that missed: deleting SCENE_SLEEP, SCENE_SHUTDOWN or
    // SCENE_DESTROY from the registration loop left the whole suite green, because the teardown
    // gate asserts the array reaches length 0 and the fake's `off` is a no-op for a name that was
    // never registered — three registrations and four removals still end at zero. An exact set is
    // the only assertion that can see a missing one.
    const { scene } = live();
    expect([...scene.gameSceneEvents].sort(), 'the Game scene lifecycle is not fully watched').toEqual(
      [SCENE_DESTROY, SCENE_PAUSE, SCENE_SHUTDOWN, SCENE_SLEEP].sort(),
    );
    // On the GAME's emitter, which Phaser will not tear down for us.
    expect(scene.gameEvents).toEqual(expect.arrayContaining([GAME_BLUR, GAME_HIDDEN]));
    expect(scene.sceneEvents).toContain(INPUT_GAME_OUT);
    expect(scene.zones[0].events).toContain(GAMEOBJECT_POINTER_DOWN);
  });

  /**
   * 🔴 Every loss path FIRED, not merely found in an array of strings.
   *
   * The 12.5 brief's second finding: of the nine subscriptions, only two were ever invoked by a
   * test. For the other seven the assertion was *"this string appears in the array"*, so wiring
   * the right event name to the wrong handler — the ordinary copy-paste error in a block of five
   * near-identical `on()` calls — passed every gate. `fireGameSceneEvent` already existed in the
   * harness and was called by nothing.
   */
  const LOSS_PATHS = [
    ['the bound Game scene pausing', SCENE_PAUSE, 'gameScene'],
    ['the bound Game scene sleeping', SCENE_SLEEP, 'gameScene'],
    ['the bound Game scene shutting down', SCENE_SHUTDOWN, 'gameScene'],
    ['the bound Game scene being destroyed', SCENE_DESTROY, 'gameScene'],
    ['the tab being hidden', GAME_HIDDEN, 'game'],
    ['the pointer leaving the canvas', INPUT_GAME_OUT, 'sceneInput'],
  ] as const;

  for (const [what, event, emitter] of LOSS_PATHS) {
    it(`drops a held contact on ${what}`, () => {
      const { scene, layer } = live();
      scene.press('right', 1);
      expect(layer.held().right, 'the contact never armed — this case proves nothing').toBe(true);

      if (emitter === 'gameScene') scene.fireGameSceneEvent(event);
      else if (emitter === 'game') scene.fireGameEvent(event);
      else scene.fireSceneInputEvent(event);

      expect(layer.held().right, `${event} did not clear the contact`).toBe(false);
    });
  }

  it('clears a contact released OUTSIDE the canvas, not only one released over it', () => {
    // POINTER_UP and POINTER_UP_OUTSIDE are two different branches of Phaser's release dispatch
    // (`POINTER_UP_EVENT.js:8-28`). Only the first had ever been driven by a test.
    const { scene, layer } = live();
    scene.press('right', 1);
    scene.releasePointerOutside(1);
    expect(layer.held().right).toBe(false);
  });

  it('drops contacts when the game loses focus with a thumb down', () => {
    // The blur path pauses the loop WITHOUT clearing pointers (`Game.js:645`), so a tab-away mid-press
    // would otherwise leave the player running until they came back.
    const { scene, layer } = live();
    scene.press('right', 1);
    scene.fireGameEvent(GAME_BLUR);
    expect(layer.held().right).toBe(false);
  });

  it('rebinds idempotently, without stacking a second set of controls or listeners', () => {
    // 🔴 Mutation M3/M2b. `attachHud` reuses an already-active UIScene (`gameHud.ts:49-52`) on every
    // level transition, so a rebind that appended would double every control and every listener.
    const { scene, layer } = live();
    const zonesBefore = scene.zones.length;
    const sceneEventsBefore = scene.sceneEvents.length;
    const second = createSnapshot();
    layer.bind({
      input$: second,
      gameScene: scene.gameScene,
      isGameRunning: () => true,
      isPlayerInputEnabled: () => true,
      openLevelSelect: () => {},
    });
    layer.refresh();
    expect(scene.zones).toHaveLength(zonesBefore);
    expect(scene.sceneEvents).toHaveLength(sceneEventsBefore);
    scene.press('jump', 1);
    expect(second.jumpPressed, 'the rebind did not take — the OLD snapshot is still wired').toBe(true);
  });

  it('drops live contacts on rebind, so a finger cannot survive a level change', () => {
    const { scene, layer } = live();
    scene.press('right', 1);
    layer.bind({
      input$: createSnapshot(),
      gameScene: scene.gameScene,
      isGameRunning: () => true,
      isPlayerInputEnabled: () => true,
      openLevelSelect: () => {},
    });
    expect(layer.held().right).toBe(false);
  });

  it('removes its GAME-emitter listeners on destroy', () => {
    // 🔴 Mutation M14. Scene shutdown removes `InputPlugin`'s own listeners
    // (`InputPlugin.js:3098-3142`) and NOTHING else, so a `game.events` subscription outlives the
    // layer and keeps firing into a destroyed object across a level-select round trip.
    const { scene, layer } = live();
    expect(scene.gameEvents.length).toBeGreaterThan(0);
    layer.destroy();
    expect(scene.gameEvents, 'a listener was left on the game emitter').toHaveLength(0);
    expect(scene.gameSceneEvents, 'a listener was left on the Game scene').toHaveLength(0);
  });

  it('stops writing the snapshot once it is unbound', () => {
    const { scene, input$, layer } = live();
    layer.bind(null);
    scene.press('jump', 1);
    expect(input$.jumpPressed).toBe(false);
  });
});
