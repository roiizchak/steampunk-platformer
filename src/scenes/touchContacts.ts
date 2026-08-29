/**
 * **Which finger is on which control.** Engine-free; no Phaser, not even as a type.
 *
 * ## Why not five booleans
 *
 * 🔴 A boolean per action breaks the moment two fingers land on the same button: releasing **either**
 * clears it, and the control un-holds while a thumb is still visibly pressing it. An action is
 * therefore held while its **set of pointer ids** is non-empty. Named by the Codex plan review,
 * round 1, finding 3, before any of this existed.
 *
 * ## A contact belongs to the action it STARTED on
 *
 * Sliding a thumb from RIGHT onto JUMP must not fire a jump and must not stop the player running
 * right. Both halves matter — one would be a phantom input, the other a dropped one — and both fall
 * out of `begin()` refusing to re-home a pointer it already owns.
 *
 * ## The release path, which is the one that is easy to get wrong
 *
 * 🔴 Phaser's own docs for `POINTER_UP`: *"dispatched by the Input Plugin belonging to a Scene if a
 * pointer is released **anywhere**"*, with the hierarchy `GAMEOBJECT_POINTER_UP` -> `GAMEOBJECT_UP`
 * -> `POINTER_UP` or `POINTER_UP_OUTSIDE`
 * (`node_modules/phaser/src/input/events/POINTER_UP_EVENT.js:8-28`).
 *
 * So a Game Object's own `pointerup` is **not** a sufficient release. Press RIGHT, slide onto empty
 * canvas, lift: the button never hears about it and the pointer id would sit in the set forever,
 * with the player running right until the level ended. `release()` takes only a pointer id and
 * clears it wherever it is, and the layer drives it from the SCENE-level events.
 *
 * ⚠️ There is a second ordering trap that lives in the layer rather than here, recorded so the two
 * are read together: **cancel contacts BEFORE `disableInteractive()`**. Disabling removes the object
 * from Phaser's `_over` lists (`InputPlugin.js:861, 873`), which suppresses the later object-level
 * release and leaves the action stuck held.
 */

import { NO_TOUCH_HELD, type TouchHeld } from './inputMerge';
import type { TouchId } from '../render/touchLayout';

export class TouchContacts {
  /** pointer id -> the action it landed on. The single source of truth for ownership. */
  private readonly owner = new Map<number, TouchId>();

  /** action -> the pointer ids currently holding it. Held iff non-empty. */
  private readonly holders = new Map<TouchId, Set<number>>();

  /**
   * Claim a pointer for an action.
   *
   * @returns `true` only when this is a genuinely new press. The layer latches a jump or attack
   * **edge** on `true` and on nothing else — a re-entered button must not arm a second swing.
   */
  begin(pointerId: number, id: TouchId): boolean {
    if (this.owner.has(pointerId)) return false;
    this.owner.set(pointerId, id);
    let set = this.holders.get(id);
    if (!set) {
      set = new Set<number>();
      this.holders.set(id, set);
    }
    set.add(pointerId);
    return true;
  }

  /**
   * Let a pointer go, wherever it happens to be.
   *
   * @returns the action it was holding, or `null` if it was not holding one — an unknown release is
   * a no-op, not an error. Releases genuinely do arrive for pointers already dropped by
   * `cancelAll()`: the game blurs, and the finger lifts over the canvas afterwards.
   */
  release(pointerId: number): TouchId | null {
    const id = this.owner.get(pointerId);
    if (id === undefined) return null;
    this.owner.delete(pointerId);
    this.holders.get(id)?.delete(pointerId);
    return id;
  }

  /**
   * Drop every contact.
   *
   * The one call every loss path routes through: the bound `Game` scene's PAUSE / SLEEP / SHUTDOWN /
   * DESTROY, the game's BLUR and HIDDEN (the blur path pauses the loop without clearing pointers —
   * `Game.js:645`), `GAME_OUT`, and the controls going non-live for any reason.
   */
  cancelAll(): void {
    this.owner.clear();
    this.holders.clear();
  }

  isHeld(id: TouchId): boolean {
    const set = this.holders.get(id);
    return set !== undefined && set.size > 0;
  }

  /** How many contacts are live. Exists so a test can assert `cancelAll` emptied everything. */
  get size(): number {
    return this.owner.size;
  }

  /**
   * This frame's held record, for `applyHeld`.
   *
   * Only the three LEVEL actions appear. `attack` is an edge and `pause` is not a sim field at all,
   * so a record carrying either would imply held semantics they do not have.
   *
   * A **fresh object** every call, never a live view: the merge runs once a frame against it, and a
   * caller holding last frame's copy seeing this frame's values is the class of bug that makes a
   * replay diverge from a live run.
   */
  snapshot(): TouchHeld {
    return {
      ...NO_TOUCH_HELD,
      left: this.isHeld('left'),
      right: this.isHeld('right'),
      jump: this.isHeld('jump'),
    };
  }
}
