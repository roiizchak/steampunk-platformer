/**
 * Enemy sim state -> render descriptor. **Engine-free** (vault 2.12), mirroring `playerView.ts`.
 *
 * ## Guard G3 — the frame-0 bug, closed at the source
 *
 * Phaser's `play()` stops and restarts a looping animation on every call, so a scene that plays the
 * current key each frame never leaves frame 0 — a walk cycle that looks like a statue. The fix has
 * two halves and this module is the first: **one key per state, decided here**, so the scene has a
 * stable value to compare against and calls `sprite.play(key, true)` with `ignoreIfPlaying`. The
 * second half is the e2e sampling `anims.currentFrame.index` inside the page, once per animation
 * frame, across a whole patrol.
 *
 * ## Guard G2 — every key has a sim duration behind it
 *
 * An animation named here is an animation `animTiming.ts` must be able to derive an fps for, and
 * `deriveFps` needs `simTicks`. So the key set is exactly what the simulation can express today:
 *
 *   - `brass-sentry`: `idle`, `fire`, `death`
 *   - `rust-scavenger`: `walk`, `chase`, `death`
 *
 * **This is six clips where the plan's budget table priced ten** — it dropped the sentry's
 * `telegraph` and the scavenger's `idle`, `attack` and `hurt`. Not an oversight and not a silent
 * descope: each of those needs a sim window that does not exist, and inventing one to justify a
 * sheet is how vault 4.22's *"0.43 s of art over a 0.25 s move"* happens. The scavenger has no
 * attack state because its BODY is the hazard — contact damage, no swing — and no hurt state
 * because nothing yet damages it. Adding any of them is a mechanic change with a cost, and it goes
 * to the user at the pre-generation STOP rather than being decided here.
 */

import type { EnemySlug, Scavenger, Sentry } from '../sim/enemies';
import { SCAVENGER_BOX, SENTRY_BOX } from '../sim/enemies';
import { windowOpen } from '../sim/windows';

/**
 * How long the muzzle animation plays after a shot leaves, in ticks.
 *
 * 18 ticks, 0.3 s. It rides the EXISTING `cooldownCounter` rather than adding a second counter —
 * vault 5.1's "one counter plus one flag" — because the counter already resets to 0 at the exact
 * moment of firing. So this is both the animation's length and its `simTicks`, and a retune of one
 * is a retune of the other.
 */
export const SENTRY_FIRE_TICKS = 18;

export type SentryAnim = 'idle' | 'fire' | 'death';
export type ScavengerAnim = 'idle' | 'walk' | 'chase' | 'death';
export type EnemyAnim = SentryAnim | ScavengerAnim;

/** Which animation a sentry is playing. Death outranks everything — a corpse does not shoot. */
export function sentryAnim(sentry: Sentry): SentryAnim {
  if (sentry.hp <= 0) {
    return 'death';
  }
  return windowOpen(sentry.cooldownCounter, SENTRY_FIRE_TICKS) ? 'fire' : 'idle';
}

/**
 * Which animation a scavenger is playing.
 *
 * 🔴 **`idle` exists now, and it is selected from the MOTION, not the intent.** This used to read
 * `chasing ? 'chase' : 'walk'` and this comment used to say *"There is no `idle`: it patrols
 * continuously, so a standing pose would never be reached and a sheet for it would be money spent
 * on a state the sim cannot enter."* That was true when a chase could lapse. **Permanent aggro
 * created the state**: a chasing scavenger held inside `deadZone` or vetoed by the ledge probe
 * covers 0 px while `chase` moves the foot 17.5 px per frame, and nothing ends it.
 *
 * So the question this asks is `moving`, not `chasing` — see `Scavenger.moving`, which is a readback
 * of `x` across the step rather than a second state axis. `chasing` still chooses *which* gait once
 * the body is actually travelling.
 *
 * Death outranks everything, and is tested first: a corpse's `moving` is not read at all, which is
 * why `stepEnemies`' death reset does not need to clear it.
 */
export function scavengerAnim(scavenger: Scavenger): ScavengerAnim {
  if (scavenger.hp <= 0) {
    return 'death';
  }
  if (!scavenger.moving) {
    return 'idle';
  }
  return scavenger.chasing ? 'chase' : 'walk';
}

const ANIMS_BY_SLUG: Record<EnemySlug, readonly EnemyAnim[]> = {
  'brass-sentry': ['idle', 'fire', 'death'],
  'rust-scavenger': ['walk', 'chase', 'death'],
};

/** `brass-sentry` + `fire` -> `brass-sentry-fire`. The catalog namespace is flat. */
export function enemyAnimKey(slug: EnemySlug, anim: EnemyAnim): string {
  return `${slug}-${anim}`;
}

/** Every key an enemy can ask for, so the scene registers exactly the set that gets played. */
export function enemyAnimKeys(): string[] {
  return Object.entries(ANIMS_BY_SLUG).flatMap(([slug, anims]) =>
    anims.map((anim) => enemyAnimKey(slug as EnemySlug, anim)),
  );
}

export interface EnemyRenderDesc {
  /** World position of the FEET, like the player's. */
  x: number;
  y: number;
  w: number;
  h: number;
  originX: number;
  originY: number;
  flipX: boolean;
  /** Grey-box fill, `0xRRGGBB`. Kept past the art for the same reason `playerView` keeps its. */
  colour: number;
  animKey: string;
  /**
   * The slug's always-shipped base action — `walk` for the scavenger, `idle` for the sentry —
   * FIX 1. `addBody` decides Sprite-vs-Rectangle from `desc.animKey` alone, and `animKey` is
   * transient (a scavenger mid-chase asks for `chase`). If `chase` is not yet catalogued, a body
   * created on that tick became a Rectangle forever — `addBody` runs once, so it never upgrades
   * when the enemy stops chasing. A body must be a Sprite whenever the slug has ANY catalogued
   * sheet; which action it happens to be performing at birth must not decide its representation
   * for the rest of its life. `playIfChanged` already no-ops on a missing key, so a Sprite created
   * on this fallback and later asked for `chase` simply keeps playing `walk` — the existing,
   * intended partial-catalog behaviour, unchanged.
   */
  fallbackAnimKey: string;
}

/**
 * Grey-box palette. Cool for the static threat, warm for the one that comes at you — so a playtest
 * can tell them apart before either has art, and before the health bar is even looked at.
 */
const SENTRY_COLOUR = 0x6f8fa6;
const SCAVENGER_COLOUR = 0xb5713f;

export function sentryRenderDesc(sentry: Sentry, scale: number): EnemyRenderDesc {
  return {
    x: sentry.x,
    y: sentry.y,
    w: SENTRY_BOX.w * scale,
    h: SENTRY_BOX.h * scale,
    originX: 0.5,
    originY: 1,
    // Read from `facing`, never re-derived from velocity — the same rule as the player and the
    // scavenger (`enemyView.ts:144`). A sentry that cannot see the player holds its last facing.
    flipX: sentry.facing === -1,
    colour: SENTRY_COLOUR,
    animKey: enemyAnimKey('brass-sentry', sentryAnim(sentry)),
    fallbackAnimKey: enemyAnimKey('brass-sentry', 'idle'),
  };
}

export function scavengerRenderDesc(scavenger: Scavenger, scale: number): EnemyRenderDesc {
  return {
    x: scavenger.x,
    y: scavenger.y,
    w: SCAVENGER_BOX.w * scale,
    h: SCAVENGER_BOX.h * scale,
    originX: 0.5,
    originY: 1,
    // Read from `facing`, never re-derived from velocity — the same rule as the player, and for the
    // same reason: a scavenger stopped at a patrol turn has no velocity to read a direction from.
    flipX: scavenger.facing === -1,
    colour: SCAVENGER_COLOUR,
    animKey: enemyAnimKey('rust-scavenger', scavengerAnim(scavenger)),
    fallbackAnimKey: enemyAnimKey('rust-scavenger', 'walk'),
  };
}
