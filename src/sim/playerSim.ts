/**
 * The player body, as plain data.
 *
 * Moved out of `types.ts` whole in the Phase 9 Codex implementation round, which had to add the
 * landing stamp below to a file sitting at exactly 400 lines. Re-exported from `types.ts` rather
 * than relocated outright, so every existing `import type { PlayerSim } from './types'` still
 * resolves — the same shape `events.ts` took in Phase 8 and `tick.ts` uses for `createWorld`.
 *
 * Nothing was summarised on the way: every field kept the paragraph that explains it.
 *
 * The one import is `import type`, erased at compile time, so the apparent cycle with `types.ts`
 * (which re-exports this interface) has no runtime edge — the same argument that file's own header
 * makes about `hazards.ts`.
 */

import type { PlayerState } from './types';

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

  /* --- Phase 9 hit-stop. Neither of these is a counter; see `hitstop.ts` for why. --- */

  /**
   * The LAST tick on which this body is frozen by hit-stop, or `-1` for never.
   *
   * An absolute DEADLINE, not a window counter, so nothing in step 13 advances it and no arming-tick
   * question exists. `hitstop.ts`'s header carries the full argument — read it before converting
   * this to the `windows.ts` idiom, which would cost every freeze a tick.
   */
  hitstopUntil: number;
  /** The tick of the hit that froze this body. `hitstopUntil - lastHitTick` IS the impact class. */
  lastHitTick: number;
  /**
   * The tick this swing STARTED, or `-1`. The swing's identity, stored rather than derived.
   *
   * `playerAttack.ts` used to compute it as `tickCount - combatCounter`, which is unique per swing
   * only while both numbers advance together. Phase 9 froze `combatCounter` at step 4b while
   * `tickCount` kept rising, so the derived value changed on **every frozen tick** and the same
   * enemy would have been struck once per tick of its own hit-stop — a damage multiplier wearing a
   * freeze's clothes. Written wherever `combatCounter` is reset to 0 for an attack; `lastHitSwing`
   * on each enemy still compares against it, with its `-1` sentinel unchanged.
   */
  swingStartTick: number;
  /**
   * The swing that last froze THIS body, or `-1`. The hit-stop chain's cap *(inventory 1b.1)*.
   *
   * A frozen swing keeps its hitbox live — `applyPlayerAttack` is ungated by hit-stop and
   * `combatCounter` does not advance while frozen — so a second enemy walking into reach during the
   * pause is struck and, before this field existed, extended the deadline through `freezePair`'s
   * `Math.max`. Measured: twelve bodies turned a 4-tick freeze into **15**.
   *
   * Ruled 2026-08-23: one swing freezes the player once, and later hits in that swing do not extend
   * it — **including a heavier one**, so the worst case cannot depend on the order a crowd arrives
   * in. The victim still freezes for its own class; only the player's pause is bounded, because the
   * player's pause is what reads as *"the game stopped"*.
   *
   * Per SWING, not per lifetime: a new `swingStartTick` may freeze again. It rides on the player
   * rather than on `Freezable` because a swing is a thing only the player has.
   */
  hitstopSwing: number;

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
  /** Which gait `strideCounter` counts for. Two cadences share one counter — see `advanceStride`. */
  strideGait: 'walk' | 'run' | null;

  /* --- The landing stamp. Neither of these is a counter; both are written once, at step 10. --- */

  /**
   * The tick of the most recent touchdown, or `-1` for never. The `lastHitTick` sentinel exactly.
   *
   * 🔴 **This exists because a render frame can drain several sim ticks.** `gameEffects.ts` used to
   * infer the landing by comparing `grounded` between `render()` calls, and `tick.ts`'s own step 13
   * guarantees the pairing that defeats it: a buffered press fires the tick AFTER touchdown, and the
   * jump clears `grounded` again at step 7. Land on the first tick of a frame and jump on the second
   * and the renderer saw `false -> false` — the dust, the landing squash and the landing shake
   * vanished outright, with every gate green. Confirmed by running it: `effects-behaviour.test.ts`
   * drives the identical fall at one tick per frame and at two, and the two-tick arm emitted zero.
   * Multi-tick frames get MORE common on slower hardware, which is the release target.
   *
   * `TickEvents.landed` is the same edge and is OR-accumulated across a batch — but it is a boolean,
   * and the render layer needs the tick (for `landSquash` and for `shakeStartTick`) and the impact
   * speed. This is `GearSim.collectedTick`'s answer to exactly that shortfall, in the same shape:
   * the sim stamps the tick, the renderer keeps a `(cursor, tickCount]` window over it.
   */
  landedTick: number;
  /**
   * The `vy` carried INTO that touchdown, px/tick, or `0` for never — what `landingDust` sizes the
   * puff from.
   *
   * Stamped at step 10 from a value captured before step 9, because `resolveCollisions` zeroes `vy`
   * in the same tick it sets `grounded`: after the landing there is nothing left to read. The
   * renderer used to sample it across frames for that reason, one frame late and lost entirely when
   * the touchdown fell inside a multi-tick frame.
   */
  landedFallSpeed: number;
}
