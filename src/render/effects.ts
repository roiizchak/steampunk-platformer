/**
 * Impact effects — the DECISION, engine-free *(vault 2.12)*.
 *
 * What fires, how many, where, how big, how long — every one of them a pure function of integer sim
 * state, so every one is unit-testable without a browser. This module owns no state, calls no
 * engine, and returns plain data that `src/scenes/` turns into Phaser objects. **No milliseconds
 * cross this file at all**: durations are ticks, distances are pixels, and the scene converts.
 *
 * The per-sprite half of the same feature — flinch, hit flash, landing squash, i-frame flicker —
 * lives in `spriteFeedback.ts` for the 400-line rule and is re-exported from the bottom of this file,
 * so the scene layer still has one import. The boundary is real, not cosmetic: this file decides what
 * PARTICLES are spent and what they cost; that one decides what happens to an existing sprite.
 *
 * ## The depth band is a MEASURED cost decision, not a preference
 *
 * Verified layer stack in the Game scene: goal 7, gears 8, enemy sprites 9, **player 10**
 * (`GameScene.ts:175`), **enemy shot graphics 11**, **enemy health-bar graphics 12**
 * (`enemyLayer.ts:90-91`).
 *
 * Particles batch on Phaser's `BatchHandlerQuad`; `Graphics` batches on `BatchHandlerTriFlat`, and a
 * transition between the two **forces a batch flush**. So every emitter sits **strictly between 10
 * and 11**: it joins the player's existing quad run and the frame gains **zero** extra flushes.
 * Placed at the intuitive "on top" depth of 13 it would cost one flush **every frame, forever**, in
 * order to sit above two 3 px health bars. That is invisible in a screenshot and visible only in a
 * frame budget, which is why `effects.test.ts` pins the band with a message that says so.
 *
 * All emitters use NORMAL blend for the same reason: a blend-mode change is also a flush.
 */

import { type ImpactClass } from '../sim/hitstop';

export type EffectKind = 'sparks' | 'steam' | 'dust';

/** Strictly inside (10, 11). Pinned by a unit test — that assertion is WHY the claim above holds. */
export const EFFECT_DEPTH: Readonly<Record<EffectKind, number>> = {
  sparks: 10.1,
  steam: 10.2,
  dust: 10.3,
};

/**
 * Plain-data emitter configuration. `src/scenes/` turns this into Phaser; nothing here knows Phaser.
 * Durations are TICKS. The scene converts.
 */
export interface EmitterSpec {
  lifespanTicks: number;
  speedMin: number; // px per tick
  speedMax: number;
  scaleStart: number;
  scaleEnd: number;
  alphaStart: number;
  alphaEnd: number;
  gravityY: number; // px per tick squared
  angleMin: number; // degrees
  angleMax: number;
  /**
   * The hard ceiling. Phaser's `atLimit()` DROPS an emit request rather than evicting the oldest,
   * so this makes the worst case a constant instead of something a sampler has to catch in the wild.
   */
  maxAliveParticles: number;
  depth: number;
  /** Pre-allocated at create() so a burst never allocates and never spikes GC. */
  reserve: number;
}

/**
 * Angles are Phaser's screen convention: 0° is right, 90° is DOWN, 270° is up.
 *
 * `angleMin`/`angleMax` here are the cone the emitter is *created* with. `steam` and `dust` use it
 * verbatim; `sparks` overrides it per burst, because a kill throws a visibly wider spray than a graze
 * — see `SPARK_CONE_DEG`, which is the authority for that override.
 *
 * The three caps sum to `EFFECT_PEAK_ALIVE`. `steam` is the largest because it is the only one that
 * lives long enough for two of them to overlap: at 45 ticks a death plume is still on screen when
 * the next enemy dies. `sparks` at 18 ticks and `dust` at 22 have retired before they can stack.
 */
export const EMITTER_SPECS: Readonly<Record<EffectKind, EmitterSpec>> = {
  sparks: {
    lifespanTicks: 18,
    speedMin: 3,
    speedMax: 9,
    scaleStart: 0.9,
    scaleEnd: 0,
    alphaStart: 1,
    alphaEnd: 0,
    gravityY: 0.35,
    angleMin: -25,
    angleMax: 25,
    maxAliveParticles: 32,
    depth: EFFECT_DEPTH.sparks,
    reserve: 32,
  },
  steam: {
    lifespanTicks: 45,
    speedMin: 1,
    speedMax: 3,
    scaleStart: 0.4,
    scaleEnd: 1.6,
    alphaStart: 0.75,
    alphaEnd: 0,
    // Negative: steam RISES. The only emitter in the game with an upward gravity, and the reason
    // this field is a spec value rather than a shared constant.
    gravityY: -0.12,
    angleMin: 250,
    angleMax: 290,
    maxAliveParticles: 48,
    depth: EFFECT_DEPTH.steam,
    reserve: 48,
  },
  dust: {
    lifespanTicks: 22,
    speedMin: 1.5,
    speedMax: 4,
    scaleStart: 0.6,
    scaleEnd: 1.1,
    alphaStart: 0.55,
    alphaEnd: 0,
    gravityY: 0.1,
    // A wide arc THROUGH up (200°…340°), so the puff spreads sideways off the feet rather than
    // fountaining. A split cone would need two emitters, and two emitters is a second batch run.
    angleMin: 200,
    angleMax: 340,
    maxAliveParticles: 16,
    depth: EFFECT_DEPTH.dust,
    reserve: 16,
  },
};

/** Sum of every `maxAliveParticles`. Pinned as a literal — this is what makes the budget a contract. */
export const EFFECT_PEAK_ALIVE = 96;

/** One `explode()` worth of particles. Everything in it is derived from integer sim state. */
export interface Burst {
  kind: EffectKind;
  x: number;
  y: number;
  count: number;
  angleDeg: number;
}

/**
 * The spark cone per impact class — the emitter's `angleMin`/`angleMax` override at explode time.
 *
 * A kill throws a wider spray than a graze, and the width is the read: at play speed the player
 * cannot count particles but can absolutely see a 90° spray versus a 50° one. Kept as its own table
 * rather than a `Burst` field, because the cone is a property of the *impact*, not of either of the
 * two bursts an impact produces.
 */
export const SPARK_CONE_DEG: Readonly<Record<ImpactClass, number>> = {
  light: 50,
  lethal: 90,
  playerHurt: 50,
};

/** Total spark particles per impact. Every one of these is inside the emitter's 32-particle cap. */
const SPARK_COUNT: Readonly<Record<ImpactClass, number>> = {
  light: 10,
  lethal: 18,
  playerHurt: 12,
};

/** The core's share of the total; the tail gets the rest. */
const SPARK_CORE_SHARE = 0.6;

/** How far above the swing line the tail burst is kicked. Degrees, mirrored by facing. */
const SPARK_TAIL_LIFT_DEG = 30;

/** Below this fall speed there is no dust at all. A puff on every 1 px step-down is visual noise. */
export const DUST_MIN_FALL_PX = 9;

/** Particles per px/tick of fall above the threshold, and the ceiling the ramp saturates at. */
const DUST_PER_PX = 1.6;
const DUST_MAX_COUNT = 14;

/** Steam counts. The vent is strictly smaller than the plume, and the pair fits inside the 48 cap. */
const DEATH_STEAM_COUNT = 14;
const HURT_VENT_COUNT = 6;

/** Straight up, in Phaser's screen convention. */
const UP_DEG = 270;

/** How far the vent leans away from the direction the body is facing. */
const HURT_VENT_LEAN_DEG = 20;

/**
 * Landing dust: the fall speed the sim resolved → a puff, or nothing.
 *
 * `maxFall` is the sim's terminal velocity (`playerTuning.maxFallSpeed`, 51.6 px/tick). Passing it in
 * rather than importing it keeps this function honest for enemies, which fall at their own cap — and
 * it means the ramp is expressed against the fastest fall the sim can actually produce rather than
 * against an unbounded number.
 *
 * At or above the threshold the count ramps from **1** upward — see the comment on the clamp below
 * for why the floor is 1 and not 0. Below it there is no burst at all, only `null`.
 */
export function landingDust(
  impactVy: number,
  x: number,
  y: number,
  maxFall: number,
): Burst | null {
  const fall = Math.min(Math.abs(impactVy), maxFall);
  if (fall < DUST_MIN_FALL_PX) {
    return null;
  }
  // The floor is 1, not 0. `DUST_MIN_FALL_PX` is the fall at which dust STARTS, so the burst it
  // returns has to draw something: at exactly the threshold the ramp evaluates to 0, and a burst of
  // count 0 is indistinguishable from no burst at all — while still satisfying every assertion that
  // asks whether a burst came back. That is a decoration fixture, which this project forbids, and it
  // is what this line read before the integrator caught it on merge.
  const count = Math.min(
    DUST_MAX_COUNT,
    Math.max(1, Math.round((fall - DUST_MIN_FALL_PX) * DUST_PER_PX)),
  );
  return { kind: 'dust', x, y, count, angleDeg: UP_DEG };
}

/**
 * A landed melee blow: **two** bursts, a hot short-lived core and a warmer tail kicked upward.
 *
 * Two rather than one is craft, not indecision — a spanner on brass is a bright core with a warmer
 * arc trailing off it. Splitting it into two `explode()` calls at two angles avoids relying on
 * over-lifespan colour interpolation, which is not confirmed for this Phaser version and would be a
 * silent no-op if it turned out to be unsupported.
 *
 * Both are centred on **`-facing`** — back along the swing, toward the attacker. Sparks fly off the
 * struck surface toward where the force came from; throwing them forward reads as an explosion
 * rather than as a strike.
 */
export function impactSparks(x: number, y: number, facing: 1 | -1, impact: ImpactClass): Burst[] {
  const total = SPARK_COUNT[impact];
  const core = Math.ceil(total * SPARK_CORE_SHARE);
  const back = facing === 1 ? 180 : 0;
  return [
    { kind: 'sparks', x, y, count: core, angleDeg: back },
    {
      kind: 'sparks',
      x,
      y,
      count: total - core,
      angleDeg: back + SPARK_TAIL_LIFT_DEG * facing,
    },
  ];
}

/** An enemy dying: a tall slow plume out of a ruptured boiler. 45 ticks, rising. */
export function deathSteam(x: number, y: number): Burst {
  return { kind: 'steam', x, y, count: DEATH_STEAM_COUNT, angleDeg: UP_DEG };
}

/**
 * The PLAYER taking damage: a short steam vent, not a death plume. Same `steam` emitter, so it
 * costs no extra emitter and no extra depth slot — a smaller `count` out of the same 48-particle
 * budget. Distinct from `deathSteam` because the two must be told apart at play speed: a vent the
 * player survives and a plume that ends an enemy are the same picture otherwise. The lean away from
 * `facing` is the second tell, and it is free.
 */
export function hurtVent(x: number, y: number, facing: 1 | -1): Burst {
  return {
    kind: 'steam',
    x,
    y,
    count: HURT_VENT_COUNT,
    angleDeg: UP_DEG - HURT_VENT_LEAN_DEG * facing,
  };
}

/**
 * The per-sprite half — flinch, hit flash, landing squash, i-frame flicker.
 *
 * Re-exported rather than left as a separate import for the scene, so `src/render/effects.ts` stays
 * the single module the effects task publishes. The split itself is the 400-line rule, not a change
 * of contract.
 */
export * from './spriteFeedback';
