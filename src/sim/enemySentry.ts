import type { Sighting } from './enemies';
import { windowOpen } from './windows';
import { ENEMY_DEAD_ZONE, withinRadius } from './enemyGeometry';

/* ------------------------------------------------------------------ *
 * brass-sentry — static, radial detection, fixed cadence.
 * ------------------------------------------------------------------ */

/**
 * Sentry defaults.
 *
 * `radius` 640 px is two thirds of the 1920 px viewport width, so the sentry's threat covers a
 * readable share of the screen without being offscreen-unfair — you can see it before it can
 * reach you. `cooldown` 90 ticks (1.5 s) is long enough to walk through the radius between shots,
 * which is what makes the projectile's travel time a dodge rather than a tax.
 */
export const SENTRY = {
  radius: 640,
  cooldown: 90,
  damage: 10,
  projectileSpeed: 9,
  /**
   * The anti-flap hold, shared with the scavenger from ONE definition — see `ENEMY_DEAD_ZONE`.
   *
   * This is finding B5's fix. The docstring on `Sentry.facing` claimed the scavenger's rule for
   * months while the code had no dead zone at all.
   */
  deadZone: ENEMY_DEAD_ZONE,
} as const;

export interface Sentry {
  x: number;
  y: number;
  radius: number;
  cooldown: number;
  /** ONE counter (vault 5.1). Ticks since the last shot; `cooldown` means ready. */
  cooldownCounter: number;
  hp: number;
  maxHp: number;
  /**
   * The start tick of the swing that last connected, or `-1`. See `playerAttack.ts`: this is how
   * one press costs one hit even though the hitbox is live for several ticks, without giving
   * anything an id.
   */
  lastHitSwing: number;
  /**
   * Toward the player while the sentry can see them **and they are outside `deadZone`**; HELD
   * otherwise. Read by the render layer and never re-derived from velocity, because a stationary
   * turret has no velocity to read a direction from.
   *
   * ✅ **Now genuinely "the same rule and the same shape as `Scavenger.facing`"**, from one shared
   * `ENEMY_DEAD_ZONE` rather than two literals that agree. This docstring made that claim from the
   * start while the code re-derived `facing` every visible tick with no dead zone at all, so a
   * player oscillating around `sentry.x` — a jump apex over a turret — flipped it at 60 Hz.
   *
   * ⚠️ **No gate could see that**, and none can now: `setFlipX` does not restart an animation, so a
   * frame-index assertion is blind to it. It is prevented by construction and asserted as *"does not
   * change across 40 ticks"* in `enemy-ai.test.ts` — a single-tick assertion cannot see a strobe,
   * which is exactly how this survived from Phase 5's start to 2026-08-14 (finding B5, decision D5).
   */
  facing: 1 | -1;
  /** Per-instance override of `SENTRY.deadZone`, so a level can differ deliberately, not by drift. */
  deadZone: number;
  /** Shot-time aim, integer px, muzzle->chest at the tick fired. `null` before the first shot. */
  lastFireDx: number | null;
  lastFireDy: number | null;
}

export interface SentryOptions {
  x: number;
  y: number;
  radius?: number;
  cooldown?: number;
  hp?: number;
  deadZone?: number;
}

export function createSentry(options: SentryOptions): Sentry {
  const radius = options.radius ?? SENTRY.radius;
  const cooldown = options.cooldown ?? SENTRY.cooldown;
  const hp = options.hp ?? 40;
  return {
    x: options.x,
    y: options.y,
    radius,
    cooldown,
    deadZone: options.deadZone ?? SENTRY.deadZone,
    // Starts ready, so the first player who walks into range is shot at rather than granted a free
    // cooldown's grace — otherwise the radius reads as larger than it is.
    cooldownCounter: cooldown,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
    facing: 1,
    lastFireDx: null,
    lastFireDy: null,
  };
}

/** Is the player inside this sentry's radius? The one definition; the tests import it too. */
export function sentrySees(sentry: Sentry, at: Sighting): boolean {
  return withinRadius(sentry.x, sentry.y, at, sentry.radius);
}

export interface SentryStep {
  fired: boolean;
}

/**
 * One tick of sentry behaviour.
 *
 * The cadence is a saturating counter, so a sentry that has been idle for a minute fires on the
 * first tick the player enters the radius and then every `cooldown` ticks — not "whenever a roll
 * succeeds", and not "instantly, repeatedly".
 */
export function stepSentry(sentry: Sentry, at: Sighting): SentryStep {
  if (windowOpen(sentry.cooldownCounter, sentry.cooldown)) {
    sentry.cooldownCounter += 1;
  }
  if (!sentrySees(sentry, at)) {
    // Cannot see the player: HOLD facing, don't snap back. One of the two anti-flap holds this
    // turret has; the other is the dead zone immediately below (vault 5.1).
    return { fired: false };
  }
  // Inside the dead zone, HOLD — the same rule as the scavenger, from the same constant. A player
  // straddling `sentry.x` would otherwise flip this every tick, and `setFlipX` does not restart an
  // animation, so no gate would ever report it. Fires are NOT gated on this: a turret with the
  // player on top of it still shoots, it just does not spin.
  if (Math.abs(at.playerX - sentry.x) >= sentry.deadZone) {
    sentry.facing = at.playerX >= sentry.x ? 1 : -1;
  }
  if (windowOpen(sentry.cooldownCounter, sentry.cooldown)) {
    return { fired: false };
  }
  sentry.cooldownCounter = 0;
  return { fired: true };
}
