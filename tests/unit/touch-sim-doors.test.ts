/**
 * **The touch layer writes the sim through the doors that already exist.**
 *
 * Split out of `touch-draw-path.test.ts` at the 400-line ceiling. The seam is real: everything here
 * is about what a contact WRITES — a level, an edge latch, a route, a gait — and nothing about
 * where an object is drawn.
 *
 * The layer never touches `src/sim/` state directly: `left`/`right`/`walk` are levels the merge ORs
 * in, jump and attack go through `latchJumpPress` / `latchAttackPress`, and pause is not a sim
 * field at all.
 */

import { describe, expect, it } from 'vitest';

import { createSnapshot } from '../../src/sim/input';
import { INPUT_POINTER_UP, INPUT_POINTER_UP_OUTSIDE } from '../../src/scenes/engineLiterals';
import { live } from './touchLive';

describe('TouchControlsLayer feeds the sim through the existing doors', () => {
  it('latches the jump EDGE on a press, and holds the jump LEVEL while down', () => {
    const { scene, input$, layer } = live();
    scene.press('jump', 1);
    expect(input$.jumpPressed, 'the jump edge was not latched').toBe(true);
    expect(layer.held().jump, 'the jump level is not held while the finger is down').toBe(true);
    // Step 6's early-release jump cut reads the LEVEL; step 7 reads the EDGE. Both, or the jump has
    // no variable height and the buffered press never fires.
    scene.releasePointer(1);
    expect(layer.held().jump).toBe(false);
  });

  it('latches the attack edge and holds nothing', () => {
    const { scene, input$, layer } = live();
    scene.press('attack', 1);
    expect(input$.attackPressed).toBe(true);
    expect(layer.held()).toEqual({ left: false, right: false, jump: false, walk: false });
  });

  it('holds a movement level without ever touching an edge', () => {
    const { scene, input$, layer } = live();
    scene.press('right', 1);
    expect(layer.held().right).toBe(true);
    expect([input$.jumpPressed, input$.attackPressed], 'moving armed an edge').toEqual([false, false]);
  });

  it('opens the level menu from the pause control, and writes no sim field', () => {
    const { scene, input$ } = live();
    scene.press('pause', 1);
    expect(scene.levelSelectOpened).toBe(1);
    expect(input$).toEqual(createSnapshot());
  });

  it('answers TWO fingers on one one-shot control once, not twice', () => {
    // 🔴 `TouchContacts.begin()` returns true for every genuinely new POINTER — which is what
    // a movement plate wants, and what a toggle and a route do not. Two fingers landing on walk
    // toggled it on and straight back off; two on pause queued the level menu twice, which is the
    // same shape as 12.5d's two-fingers-two-levels defect one screen earlier. Codex round-7.
    const a = live();
    a.scene.press('walk', 1);
    a.scene.press('walk', 2);
    expect(a.layer.held().walk, 'the second finger un-chose the gait the first chose').toBe(true);

    const b = live();
    b.scene.press('pause', 1);
    b.scene.press('pause', 2);
    expect(b.scene.levelSelectOpened, 'two fingers opened the level menu twice').toBe(1);
  });

  it('still lets a SECOND finger swing while the first is down', () => {
    // And the fix may not go further than the toggles. Attack and jump are repeatable: a player
    // resting one thumb on attack while the other taps it is asking for two swings, and gating
    // those on the first holder too would swallow the second.
    const { scene, input$ } = live();
    scene.press('attack', 1);
    input$.attackPressed = false;
    scene.press('attack', 2);
    expect(input$.attackPressed, 'the second finger was refused a swing').toBe(true);
  });

  it('releases a contact that lifts anywhere on the canvas, not just over its own zone', () => {
    // 🔴 Mutation M6. Phaser dispatches the scene-level `pointerup` wherever a pointer is released;
    // the ZONE only hears about a release that happens over itself. Press right, slide onto empty
    // canvas, lift — without the scene subscription the player runs right forever.
    const { scene, layer } = live();
    expect(scene.sceneEvents).toContain(INPUT_POINTER_UP);
    expect(scene.sceneEvents).toContain(INPUT_POINTER_UP_OUTSIDE);
    scene.press('right', 1);
    scene.releasePointer(1);
    expect(layer.held().right).toBe(false);
  });

  it('ignores a press while player input is disabled', () => {
    const { scene, input$, layer } = live();
    scene.playerInputEnabled = false;
    layer.refresh();
    scene.press('jump', 1);
    expect([input$.jumpPressed, layer.held().jump]).toEqual([false, false]);
  });
});
