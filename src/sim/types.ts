/**
 * Simulation types.
 *
 * Vault 1.1 (blocker): nothing under `src/sim/` imports Phaser, reaches a clock, or reaches
 * `Math` dot random. Mechanically proven by `tests/unit/sim-boundary.test.ts` and QA criterion 2.7.
 *
 * Vault 2.1 (blocker): every DURATION here is an integer count of 60 Hz ticks. Every DISTANCE is
 * pixels. Velocities are px/tick, accelerations px/tick^2 — never px/second, so nothing in this
 * directory ever multiplies by a frame delta.
 *
 * The two imports below are `import type` and are erased at compile time, so the apparent cycle
 * with `hazards.ts` (which imports `Rect` from here) has no runtime edge and cannot affect module
 * initialisation order.
 */

import type { EnemySet } from './enemies';
import type { WorldBounds } from './hazards';
import type { GearSim } from './pickups';
import type { PlayerSim } from './playerSim';
import type { Projectile } from './projectiles';

/** Axis-aligned box. `x`/`y` are the TOP-LEFT corner in world space, where +y is DOWN. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A collision box in the fighter's LOCAL space (vault 2.10).
 *
 * One stated convention, used everywhere: **`+x` is forward, `+y` is up from the feet.** So a box
 * with `y: 0` sits on the ground and `y: 8` floats 8px above it. This is the opposite of world
 * space, on purpose — mirroring a box becomes a sign flip rather than a second code path, and
 * Phase 3's ElementEditor edits boxes in the space they were authored in.
 *
 * There is exactly ONE conversion out of this space: `toWorld()` in `player.ts`.
 */
export interface LocalBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Player states. Vault 2.6: every state has exactly one door — see `enterState()` in `player.ts`.
 * Phase 5 adds `attack`, `hurt` and `death` here and to that one function.
 *
 * `walk` was added in Phase 4. It is a REAL state with its own speed cap, not a render-layer
 * relabelling of slow `run` — holding the modifier changes how the game plays. It carries an
 * invariant the one door enforces: **`walk` is never published while `|vx|` exceeds `walkMax`**,
 * because a walk animation playing at run speed is foot-slide arriving through the state machine
 * instead of through the art. `tests/unit/walk-state.test.ts` asserts it on every tick.
 */
export type PlayerState = MovementState | CombatState;

/**
 * States derived from the body every tick, at step 11.
 *
 * These are *re-decided* each tick from grounded / moving / walkHeld. Nothing remembers them, which
 * is what makes them safe to recompute.
 */
export type MovementState = 'idle' | 'walk' | 'run' | 'jump' | 'fall';

/**
 * States combat OWNS, entered at step 4 and held for a fixed number of ticks.
 *
 * The distinction is load-bearing, not taxonomy. `resolveState` at step 11 derives a movement state
 * unconditionally, so without a category to test against it would overwrite an `attack` entered at
 * step 4 **on the same tick, every tick** — the swing would be set and erased before anything could
 * draw it, and "did an attack happen" would still pass. Found by the Phase 5 Codex plan review
 * (C7); pinned by `tests/unit/player-combat.test.ts`.
 */
export type CombatState = 'attack' | 'hurt' | 'death';

/** Seeded xorshift32 state (vault 2.3). A mutable single-field cell, never a global. */
export interface Rng {
  s: number;
}

/**
 * The input snapshot handed to a multi-tick batch (vault 2.4).
 *
 * `jumpPressed` is an EDGE and is the reason this object is a MUTABLE WORKING COPY: the batch
 * consumes from it, and it is cleared on CONSUMPTION — never on "a tick ran". Reusing one snapshot
 * across a batch replays the press; clearing it because a tick happened drops it. Both are real
 * failures the vault records.
 *
 * `left` / `right` / `jumpHeld` / `walkHeld` are PERSISTENT state, which vault 2.5 says is safe to
 * sample every tick. Only edges need the latch.
 */
export interface InputSnapshot {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  /**
   * The walk modifier. Persistent, so it gets NO latch and NO consume function — "is the key down"
   * is true across a whole batch by definition, and only edges can be destroyed by observing them
   * at the wrong rate.
   */
  walkHeld: boolean;
  /**
   * Attack. An EDGE, with the same latch/consume pair as `jumpPressed` and for the same reason —
   * holding the key must not swing repeatedly, and a frame that drained zero ticks must not eat the
   * press. Bound to `Z` and `J`; jump stays on SPACE so every Phase 2 spec keeps working.
   */
  attackPressed: boolean;
}

/** Live movement knobs. Every field is swept by `tests/unit/knob-sweep.test.ts` (vault A6). */
export interface TuningKnobs {
  /** Horizontal acceleration while grounded, px/tick^2. */
  runAccel: number;
  /** Horizontal acceleration while airborne, px/tick^2. */
  airAccel: number;
  /** Horizontal speed cap, px/tick. */
  runMax: number;
  /**
   * Horizontal speed cap while the walk modifier is held, px/tick. Distance-dimensioned, so it
   * scales with `RENDER_SCALE` exactly like `runMax` did in the Phase 3 re-tune.
   *
   * There is deliberately no `walkAccel`: `runAccel` governs both, and only the cap differs. A
   * second knob would need its own sweep scenario and buys nothing observable.
   */
  walkMax: number;
  /** Deceleration applied with no horizontal input, grounded, px/tick^2. */
  groundFriction: number;
  /** Deceleration applied with no horizontal input, airborne, px/tick^2. */
  airFriction: number;
  /** Downward acceleration, px/tick^2. */
  gravity: number;
  /** Terminal downward speed, px/tick. */
  maxFallSpeed: number;
  /** Upward impulse on jump, px/tick. Stored positive; applied as negative vy (world +y is down). */
  jumpVelocity: number;
  /**
   * Releasing jump early divides the remaining upward speed by this. Integer, not a float
   * fraction — a variable-height jump is a division, and an integer knob keeps the sweep honest.
   */
  jumpCutDivisor: number;
  /**
   * Coyote window, in TICKS. **`tick.ts`'s header is the authority; this is a pointer to it, not a
   * second definition** *(vault 2.2, 5.3)*.
   *
   * `N` means the jump is accepted on the `N` consecutive ticks starting with the **first tick
   * AFTER** the player walks off a ledge. The ledge tick itself is not one of them, because step 7
   * had already run when step 10 armed the window.
   *
   * > This comment said "accepted on the tick the player leaves the ground" until Phase 5, which
   * > contradicted `tick.ts` by exactly one tick and was found by the Phase 5 Codex plan review
   * > (C3) before combat could add a third window to the disagreement. `coyote-time.test.ts` and
   * > `tick.ts` were right; this was the outlier. Vault 5.3 in its literal form — two definitions
   * > of one concept, drifting.
   */
  coyoteTicks: number;
  /**
   * Jump-buffer window, in TICKS.
   *
   * **NOT the same definition as `coyoteTicks` — the two windows are deliberately asymmetric**, and
   * this comment claimed they matched until Phase 5. A press is remembered for `N` ticks starting
   * with **the tick of the press itself** (inclusive), where coyote's window starts the tick *after*
   * the ledge. And when the player is airborne, "able to jump" is the tick AFTER touchdown, not the
   * touchdown tick, because step 7 tests `grounded` as step 9 of the previous tick set it.
   *
   * Both endpoints are pinned by `tests/unit/coyote-time.test.ts`. Read `tick.ts`'s header before
   * changing either.
   */
  jumpBufferTicks: number;
}

/**
 * The player body lives in `playerSim.ts` and is re-exported here.
 *
 * Moved out in the Phase 9 Codex implementation round, which had to add `landedTick` and
 * `landedFallSpeed` — the landing stamp that stopped the renderer inferring a touchdown by comparing
 * `grounded` across frames — to a file already at exactly 400 lines. Same shape, same reason and
 * same re-export as `events.ts` below: every existing `import type { PlayerSim } from './types'`
 * still resolves.
 */
export type { PlayerSim } from './playerSim';

/**
 * The event edges live in `events.ts` and are re-exported here.
 *
 * Moved out in Phase 8, which had to add a `levelCompleted` edge to a file with two lines of headroom
 * under the 400-line rule. Re-exported rather than relocated outright so that every existing
 * `import type { TickEvents } from './types'` still resolves — the same shape `tick.ts` uses to
 * re-export `createWorld` from `world.ts`. Read `events.ts` before adding a field: three tests read
 * that interface reflectively and go red until a new edge is classified and reached.
 */
export type { AdvanceEvents, TickEvents } from './events';

export interface World {
  /** Integer tick count since the sim started. The only clock this project has. */
  tickCount: number;
  rng: Rng;
  /**
   * The seeded stream's sample for THIS tick (vault 2.3). Written at step 1 of `tick()` and
   * nowhere else, so the stream advances exactly once per tick regardless of what reads it.
   */
  tickRoll: number;
  player: PlayerSim;
  /**
   * Where the player's feet start, and where they return on a respawn.
   *
   * Added 2026-08-14 with the respawn. It was previously a `createWorld` ARGUMENT that initialised
   * the player and was then forgotten — so nothing in the sim knew where to put a player back, and
   * death was a terminal freeze. Keeping it on the world rather than in the scene is what lets the
   * respawn stay inside `tick()`: a scene-driven one would be a second place that decides when a
   * death ends, and the tick contract would no longer describe the whole simulation.
   */
  spawn: { x: number; y: number };
  /** Static collision geometry. Phase 3 replaces the SOURCE of these; the resolver is unchanged. */
  solids: Rect[];
  /**
   * The world's extent, in pixels. The bottom is a KILL PLANE; left, right and top are collision.
   *
   * Two treatments on purpose: falling is a death you can see coming, walking off the side is not.
   * Clamping all four was considered and rejected — a pit you cannot fall into is not a platformer.
   * See `hazards.ts`.
   */
  bounds: WorldBounds;
  /** Damaging geometry. Contact is SWEPT, so a hazard thinner than one tick of travel still bites. */
  hazards: Rect[];
  /** Every live enemy, one array per type. */
  enemies: EnemySet;
  /** Shots in flight. Replaced each tick rather than spliced — see `projectiles.ts`. */
  projectiles: Projectile[];
  /**
   * Every gear in the level, collected or not.
   *
   * Collected gears STAY in the array with `collected: true` rather than being spliced out: the
   * render layer indexes bodies by position in this list, exactly as `EnemyLayer` does, and a
   * shrinking array would silently re-point every body after the hole.
   */
  gears: GearSim[];
  /**
   * How many gears have been collected. `window.__game.score` publishes this.
   *
   * Kept as a counter rather than derived from `gears.filter(...)` on demand: it is read every
   * frame by the HUD, and a derived value is a second definition of the same fact the moment
   * anything else needs to write it.
   */
  gearsCollected: number;
  /**
   * The level's EXIT, or `null` for a world built without one — Phase 8.
   *
   * Nullable because `createWorld` has forty-odd fixture call sites that pass only `seed` and `scale`,
   * and a required field would have meant editing every one to say "unchanged" — the reason `spawn`'s
   * docstring gives for the same choice. Step 9d no-ops on `null`, and `goal-completion.test.ts` gates
   * that no-op from both directions: a `null` world never completes however far the player walks, AND
   * every shipped level parses to a non-null goal. Without the second half, "no-ops on null" quietly
   * becomes "never fires".
   */
  goal: Rect | null;
  /**
   * Has the player finished this level? Latched — set once at step 9d and never cleared.
   *
   * 🔴 It is also **terminal**: `tick()` returns early while this is true, before step 1. See the
   * freeze note at the top of `tick()` for why the alternative was not survivable.
   */
  completed: boolean;
  /**
   * Ticks since the player's box first overlapped `goal`, or `null` when no run-in is running.
   *
   * The scripted entry sequence's progress, owned by the sim as an integer tick count — the
   * gate-entry session. `null` rather than `-1` so "not started" is unrepresentable as a duration
   * and cannot be arithmetic'd into one by accident.
   *
   * **The sim only COUNTS.** Nothing under `src/sim/` knows this makes the player transparent —
   * `src/render/playerView.ts` maps this integer to an alpha and to the forced `run` key, which is
   * what keeps the fade a render decision and keeps a millisecond tween off a tick-counted body.
   *
   * Two behaviours worth stating because neither is derivable from the type:
   *
   *  - **It is NOT monotonic.** `stepGoalEntry` sets it back to `null` the moment the player stops
   *    overlapping the goal — death, or a knockback that clears the rect. Without that cancel a
   *    killed player respawns still locked and still auto-running, and the level is unwinnable.
   *  - **It freezes with everything else.** Step 0 returns before step 1 once `completed` latches,
   *    so the final value is held forever and the drawn alpha holds at 0. "No pop-back" is
   *    structural rather than remembered.
   */
  goalEntryTicks: number | null;

  /**
   * Has the entry ceiling fired, with the body still inside the rect it fired over?
   *
   * 🔴 **The ceiling alone did not terminate anything, and the test that claimed it did was
   * measuring the wrong quantity.** `stepGoalEntry` cancelled at `GOAL_ENTRY_TICKS * 2` by writing
   * `null` — and then the very next tick the arm branch saw an overlapping player and armed again
   * from zero. Driven against a blocked doorway: over 120 ticks the player was free for **three**.
   * Roughly 41 ticks locked and invisible, one tick of control, repeat, forever.
   *
   * The regression test asserted only the longest single armed span, which stayed under the ceiling
   * exactly as designed, so it passed. Codex's implementation review called it the clearest case in
   * the diff of a test passing while the behaviour it names stays broken, and it was right.
   *
   * So the release needs a LATCH, not a reset. Set when the ceiling fires; cleared the moment the
   * body stops overlapping the goal, which is the only event that can make a fresh entry meaningful.
   * A boolean rather than another counter: there is no duration here, only "this attempt is spent".
   */
  goalEntryBlocked: boolean;
  /** Live knobs, so the Playground edits them in place and tests derive expectations from them. */
  tuning: TuningKnobs;
  /**
   * Art and collision-geometry scale (vault 2.11). Required at construction and validated `> 0`.
   * Applies to GEOMETRY ONLY — velocities and accelerations are never multiplied by it.
   */
  scale: number;
  /**
   * Multiplier on every hit-stop freeze — **1 in every shipped build**. `freezePair` (`hitstop.ts`)
   * carries why it exists, what `0` does, and why it is not a `TuningKnobs` entry; `?hitstop=N` is
   * read only by `hitstopScaleFromSearch` (`src/scenes/gameLevelPick.ts`), under
   * `import.meta.env.DEV`, because `src/sim/` reaches no DOM.
   */
  hitstopScale: number;
}
