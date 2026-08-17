/**
 * Per-tick event EDGES (vault 2.5). Emitted, never reconstructed from a state comparison.
 *
 * Split out of `types.ts` in Phase 8, which needed to add a `levelCompleted` edge to a file that had
 * **two lines** of headroom under the 400-line rule. Moving a whole concern into a sibling and
 * re-exporting is this project's sanctioned way down — the same move `world.ts` made out of `tick.ts`
 * — and it is preferred to the alternative the size rule fears most, which is deleting the
 * explanations below to hit the number. `types.ts` re-exports both names, so every existing
 * `import type { TickEvents } from './types'` still resolves and no call site changed.
 *
 * Vault 2.1 (blocker): every DURATION in this directory is an integer count of 60 Hz ticks. Nothing
 * here is a duration — these are all booleans — but the rule is why they are booleans per TICK rather
 * than timestamps.
 *
 * ⚠️ Adding a field here is not free. Three tests read this shape reflectively and will go red until
 * the new field is accounted for:
 *   - `tests/unit/audio-cues.test.ts` — every field must be classified in `AUDIO_CUES` or
 *     `SILENT_EDGES` (`audioCues.ts`). A new edge fails that test until somebody DECIDES which it is.
 *   - `tests/unit/tick-events.test.ts` — the non-vacuity list, whose own comment records that a field
 *     which never fires anywhere passes every other assertion in that file. A new edge needs both a
 *     list entry and a scenario that actually reaches it.
 *   - `noEvents()` in `tick.ts` returns an object literal typed as `TickEvents`, so omitting a field
 *     there is a compile error rather than a silent `undefined`. That is deliberate, and it is what
 *     makes `mergeEvents`/`advance` safe — they walk `Object.keys(noEvents())`.
 */

/** Per-tick event edges (vault 2.5). Emitted, never reconstructed from a state comparison. */
export interface TickEvents {
  jumped: boolean;
  landed: boolean;
  leftGround: boolean;
  /** A swing began on this tick. The render layer plays the sheet from this, not from a state diff. */
  attackStarted: boolean;
  /**
   * The attack hitbox is live on this tick — criterion 5.5.
   *
   * An EDGE-free per-tick fact, deliberately: the caller asks "is it live now", never "has it been
   * live since". Under `advance()` these OR across the batch, which is correct for "did the window
   * open at all during those ticks".
   */
  hitActive: boolean;
  /**
   * The player died, their death animation ran its full `DEATH_TICKS`, and they were put back at
   * the level spawn on THIS tick.
   *
   * An EDGE, emitted rather than reconstructed (vault 2.5). A consumer comparing `hp` across frames
   * cannot see it: a respawn restores full hp, so "hp went up" is also what a pickup would look
   * like, and "state left `death`" is unobservable from outside a single tick. The renderer needs
   * it to snap rather than interpolate — a respawn moves the player the width of the level, and
   * `interpolatedPosition` would otherwise slide them across it over one tick.
   */
  respawned: boolean;
  /**
   * The swing CONNECTED with at least one enemy this tick.
   *
   * Distinct from `hitActive`, which only says the hitbox was live. Emitted rather than
   * reconstructed by comparing enemy hp across frames *(vault 2.5)* — the render layer wants it for
   * a hit-stop or a flash, and diffing hp would also fire when a hazard hurt something.
   */
  hitLanded: boolean;
  /**
   * At least one gear was collected on this tick — criterion 6.1.
   *
   * An edge, for Phase 7's pickup cue. It deliberately carries neither WHICH gear nor HOW MANY:
   * this record is OR-accumulated field by field across a whole render frame's batch, so a
   * coordinate put here would be overwritten and a second gear in the same batch would vanish. The
   * render layer reads `GearSim.collectedTick` instead. See `pickups.ts`.
   */
  gearCollected: boolean;

  /* --- Phase 7 audio cues. Every one is an edge; none is reconstructable (vault 2.5). --- */

  /**
   * The player took damage and SURVIVED it, on this tick — Phase 7's hurt cue.
   *
   * `damagePlayer` already returned whether a hit landed (`combat.ts`), and `applyWorldDamage` threw
   * that boolean away. Without the edge the only marker is `combatCounter === 0 && state === 'hurt'`,
   * which survives exactly one tick and is therefore lost by any render frame draining more than one.
   *
   * Deliberately false on the killing blow — that is `playerDied`. One cue per event, or the hurt
   * sound plays over the death sound on the tick both would be true.
   */
  playerHurt: boolean;
  /**
   * The player died on this tick, by **either** route — Phase 7's death cue.
   *
   * 🔴 There are two, and only one goes through `damagePlayer`. The kill plane calls `killPlayer` and
   * **early-returns** (`worldDamage.ts`), so an edge built from `damagePlayer`'s return alone leaves
   * falling out of the world — the most common death in a platformer — silent, while every test using
   * ordinary lethal damage passes. Codex plan review F4 caught it before any code existed.
   *
   * Fires once. `killPlayer` is idempotent, and re-entering `death` every tick would also reset the
   * death animation to its first frame.
   */
  playerDied: boolean;
  /**
   * The player's swing took an enemy to zero hp on this tick — Phase 7's kill cue.
   *
   * The only cue with no state marker of any kind to fall back on: enemies carry no death tick, no
   * death counter and no `alive` flag, so death is otherwise inferred by comparing `hp` against the
   * previous tick — exactly what vault 2.5 forbids. `enemyTurn` notices `hp <= 0` a tick LATE.
   *
   * ⚠️ `hitLanded` is **necessarily** true whenever this is: `strike()` increments the hit count on
   * the killing blow like any other. Criterion 7.2's clipping stack must sum both.
   */
  enemyKilled: boolean;
  /**
   * A foot planted on this tick — Phase 7's footstep cue.
   *
   * Cadence comes from `FOOTSTEP_TICKS`, derived from the drawn animation loop, so the sound lands
   * with the frame the player is watching rather than with a distance the sim happens to have
   * covered. See `playerTuning.ts`.
   */
  footstep: boolean;
}

/**
 * Per-ADVANCE events: `TickEvents` OR-accumulated across every tick a render frame drained.
 *
 * A render frame can drain many sim ticks, so a whole 15-tick action can start and finish between
 * two frames. Comparing state across frames would miss it entirely (vault 2.5).
 */
export type AdvanceEvents = TickEvents;
