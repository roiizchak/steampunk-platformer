import type { Sighting } from './enemies';
import { windowOpen } from './windows';
import { withinRadius } from './enemyGeometry';

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
    // Starts ready, so the first player who walks into range is shot at rather than granted a free
    // cooldown's grace — otherwise the radius reads as larger than it is.
    cooldownCounter: cooldown,
    hp,
    maxHp: hp,
    lastHitSwing: -1,
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
    return { fired: false };
  }
  if (windowOpen(sentry.cooldownCounter, sentry.cooldown)) {
    return { fired: false };
  }
  sentry.cooldownCounter = 0;
  return { fired: true };
}
