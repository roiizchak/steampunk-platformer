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

export interface PlayerSim {
  /** World position of the player's FEET: `x` is the horizontal centre, `y` is the sole. */
  x: number;
  y: number;
  /** px/tick. Never scaled — vault 2.11: scaling a velocity is a balance change in disguise. */
  vx: number;
  vy: number;
  /** `+1` right, `-1` left. Feeds the `toWorld` sign flip and the render flip; never derived twice. */
  facing: 1 | -1;
  grounded: boolean;
  state: PlayerState;
  /**
   * Ticks since the player was last on the ground. `0` on the tick they left it.
   * An INCREMENTING counter, not a decrementing timer — see the window rule in `tick.ts`.
   */
  ticksSinceGrounded: number;
  /** Ticks since the jump edge was consumed. Same mechanism, so both windows behave identically. */
  ticksSinceJumpPressed: number;
  /** True while a jump is rising and has not yet been cut short by releasing the button. */
  jumpCutPending: boolean;

  /* --- Phase 5 combat. Every counter increments; none is a decrementing timer. --- */

  hp: number;
  maxHp: number;
  /**
   * Ticks spent in the CURRENT combat state. Meaningless unless `state` is a `CombatState`.
   *
   * **One counter for all three combat states, not three.** They are mutually exclusive — you
   * cannot be attacking and dead — so a counter each would admit "attacking on tick 4 and hurt on
   * tick 9 simultaneously", a state nothing can draw *(vault 5.1: two counters admit the
   * unrepresentable state)*. `enterState` resets it, which is why that funnel exists.
   */
  combatCounter: number;
  /**
   * Ticks since damage was last taken. Invulnerable while this window is open.
   *
   * Separate from `combatCounter` on purpose, and this is NOT the case vault 5.1 warns about:
   * i-frames are **orthogonal** to the combat state, not a second counter for the same concept.
   * They outlast hitstun by design, so the player is idle, walking or jumping — a movement state —
   * while still invulnerable. One counter could not represent that.
   */
  iFrameCounter: number;
  /**
   * FIX 2 (QA gate, session 8): did an actual knockback IMPULSE land this hit, not merely "is the
   * player `hurt`"? `knockbackSettling` (`combat.ts`) used to key on `state === 'hurt' &&
   * combatCounter === 1` alone, so a hazard hit — which deliberately writes no `vx` shove — got the
   * friction exemption anyway and bought one free tick of preserved momentum for nothing. Set true
   * where `applyKnockback` actually writes `vx` (`worldDamage.ts`), read and cleared exactly once
   * by `stepHorizontal`'s `knockbackSettling` branch (`player.ts`) so the exemption stays ONE tick.
   */
  knockbackPending: boolean;

  /* --- Phase 7 audio. --- */

  /**
   * Ticks spent in the CURRENT locomotion state since the last footfall — Phase 7's `footstep` cue.
   *
   * Zeroed whenever the feet are not planted and moving, so a jump does not carry a half-stride into
   * the landing. Compared against `FOOTSTEP_TICKS[state]`, which is derived from the drawn animation
   * loop rather than from a speed — see `playerTuning.ts` for why a distance accumulator was
   * rejected.
   */
  strideCounter: number;
}

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
  /** Live knobs, so the Playground edits them in place and tests derive expectations from them. */
  tuning: TuningKnobs;
  /**
   * Art and collision-geometry scale (vault 2.11). Required at construction and validated `> 0`.
   * Applies to GEOMETRY ONLY — velocities and accelerations are never multiplied by it.
   */
  scale: number;
}
