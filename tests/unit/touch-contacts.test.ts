import { describe, expect, it } from 'vitest';

import { NO_TOUCH_HELD } from '../../src/scenes/inputMerge';
import { TouchContacts } from '../../src/scenes/touchContacts';

/**
 * Which finger is holding which control, and every way a finger can be lost.
 *
 * ## Why this is not five booleans
 *
 * 🔴 A single boolean per action is wrong the moment two fingers land on the same button: releasing
 * **either** clears it, and the button un-holds while a thumb is still visibly pressing it. Named by
 * the Codex plan review, round 1, finding 3. So an action is held while its *set of pointer ids* is
 * non-empty, and a pointer belongs to the action it **started** on for its whole life.
 *
 * ## The release path that is easy to get wrong
 *
 * 🔴 Phaser's own docs for `POINTER_UP`: *"dispatched by the Input Plugin belonging to a Scene if a
 * pointer is released **anywhere**"*, with the hierarchy `GAMEOBJECT_POINTER_UP` -> `GAMEOBJECT_UP`
 * -> `POINTER_UP` or `POINTER_UP_OUTSIDE`
 * (`node_modules/phaser/src/input/events/POINTER_UP_EVENT.js:8-28`).
 *
 * So the **object's** `pointerup` is not enough. Press RIGHT, slide the thumb onto empty canvas or
 * onto the jump button, lift — the right button never sees a `pointerup` and its pointer id would
 * stay in the set forever, with the player running right until the level ended. `release()` is
 * therefore driven from the SCENE-level events and clears the pointer wherever it happens to be.
 *
 * The first version of this plan claimed a "full loss-path list" that did not include scene
 * `POINTER_UP` at all. That claim was withdrawn; this file is what replaces it.
 */

const P1 = 1;
const P2 = 2;
const P3 = 3;

describe('TouchContacts', () => {
  it('holds an action while a finger is on it', () => {
    const c = new TouchContacts();
    expect(c.isHeld('left')).toBe(false);
    c.begin(P1, 'left');
    expect(c.isHeld('left')).toBe(true);
    c.release(P1);
    expect(c.isHeld('left')).toBe(false);
  });

  it('keeps a button held when one of TWO fingers on it lifts', () => {
    // 🔴 The defect this class exists for. With a boolean, the second release would have cleared a
    // button the first finger is still pressing.
    const c = new TouchContacts();
    c.begin(P1, 'jump');
    c.begin(P2, 'jump');
    c.release(P1);
    expect(c.isHeld('jump'), 'the second finger is still down').toBe(true);
    c.release(P2);
    expect(c.isHeld('jump')).toBe(false);
  });

  it('releases a finger wherever it is lifted, not only over the button it started on', () => {
    const c = new TouchContacts();
    c.begin(P1, 'right');
    // The scene-level POINTER_UP arrives with no idea which object is under it.
    expect(c.release(P1)).toBe('right');
    expect(c.isHeld('right')).toBe(false);
  });

  it('keeps a contact with the action it STARTED on when it slides onto another', () => {
    // Sliding a thumb from RIGHT onto JUMP must not fire a jump, and must not stop running right.
    // Both halves matter: the first would be a phantom input, the second a dropped one.
    const c = new TouchContacts();
    c.begin(P1, 'right');
    expect(c.begin(P1, 'jump'), 'a second begin for a live contact is not a new press').toBe(false);
    expect([c.isHeld('right'), c.isHeld('jump')]).toEqual([true, false]);
    c.release(P1);
    expect(c.isHeld('right')).toBe(false);
  });

  it('reports whether a begin is a genuinely new press, so the caller knows when to latch an edge', () => {
    // `begin` returning false is what stops a re-entered button arming a second jump. The edge is a
    // boolean and not a count (vault 2.6), but a spurious latch would still make a jump the player
    // did not ask for on the very next tick.
    const c = new TouchContacts();
    expect(c.begin(P1, 'jump')).toBe(true);
    expect(c.begin(P1, 'jump')).toBe(false);
    expect(c.begin(P2, 'jump'), 'a DIFFERENT finger on the same button is a new press').toBe(true);
  });

  it('ignores the release of a pointer it never saw', () => {
    const c = new TouchContacts();
    c.begin(P1, 'left');
    expect(c.release(P3)).toBeNull();
    expect(c.isHeld('left'), 'an unknown release disturbed a live contact').toBe(true);
  });

  it('drops every contact on cancelAll', () => {
    // The single call every loss path routes through: Game PAUSE / SLEEP / SHUTDOWN / DESTROY,
    // game BLUR and HIDDEN, GAME_OUT, and the controls going non-live.
    const c = new TouchContacts();
    c.begin(P1, 'left');
    c.begin(P2, 'jump');
    c.begin(P3, 'attack');
    expect(c.size).toBe(3);
    c.cancelAll();
    expect(c.size).toBe(0);
    for (const id of ['left', 'right', 'jump', 'attack', 'pause'] as const) {
      expect(c.isHeld(id), `${id} survived cancelAll`).toBe(false);
    }
  });

  it('survives a release after cancelAll without resurrecting anything', () => {
    // A real sequence: the game blurs (cancelAll), the finger lifts over the canvas afterwards and
    // the scene still dispatches POINTER_UP for it.
    const c = new TouchContacts();
    c.begin(P1, 'left');
    c.cancelAll();
    expect(c.release(P1)).toBeNull();
    expect(c.isHeld('left')).toBe(false);
  });

  it('projects only the three LEVEL actions into the held record', () => {
    // `attack` is an edge and `pause` is not a sim field at all, so neither belongs in the record
    // the merge consumes — and a record carrying them would imply held semantics they do not have.
    const c = new TouchContacts();
    c.begin(P1, 'attack');
    c.begin(P2, 'pause');
    expect(c.snapshot()).toEqual(NO_TOUCH_HELD);
    c.begin(P3, 'right');
    expect(c.snapshot()).toEqual({ ...NO_TOUCH_HELD, right: true });
  });

  it('hands back a fresh record rather than a live view', () => {
    // The snapshot is passed into `applyHeld` every frame. If it were the internal object, a caller
    // holding last frame's copy would see this frame's values, which is the class of bug that makes
    // a replay diverge from a live run.
    const c = new TouchContacts();
    c.begin(P1, 'left');
    const first = c.snapshot();
    c.release(P1);
    expect(first.left, 'the snapshot changed under its holder').toBe(true);
    expect(c.snapshot().left).toBe(false);
  });
});
