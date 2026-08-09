/**
 * Sentry projectiles — the reason the turret's radius is readable.
 *
 * ## Why a travelling object and not instant damage
 *
 * A hitscan turret is indistinguishable from a damage-over-time zone: the player learns "standing
 * there costs hp" and never learns where the shot came from or that it could have been dodged. A
 * projectile with travel time makes the radius legible before it is punishing, and makes the
 * `cooldown` knob mean something the player can see — which is what criterion 5.1 asks to be
 * *observable*, not merely tunable.
 *
 * ## Deliberately not a physics body
 *
 * It flies in a straight horizontal line at a constant speed. No gravity, no collision against
 * solids. A shot that stops at a wall would be a better game and a worse first version: it needs
 * the solid list, an ordering decision against the player's own motion, and a second swept test.
 * Recorded as a knowing simplification rather than an oversight — the sentry is placed on a ledge
 * with clear line of sight, so the case does not arise in `level-01`.
 *
 * Distances are pixels and speeds are px/tick, like everything else in `src/sim/` (vault 2.1).
 */

import type { Rect } from './types';

export interface Projectile {
  x: number;
  y: number;
  /**
   * Where it was at the end of last tick, so the hit test can sweep instead of sampling.
   *
   * Carried ON the projectile rather than handed to `projectileHit` as a parallel "previous" array,
   * which was the first version: the moment one projectile is culled the two arrays are off by one
   * and every remaining shot is swept along its neighbour's path.
   */
  prevX: number;
  /** px/tick. Sign IS the direction; there is no separate facing field to disagree with it. */
  vx: number;
  damage: number;
}

/**
 * Fire one shot from a sentry toward the player.
 *
 * Aimed once, at spawn, and never again — a projectile that re-aims every tick is a homing missile,
 * which cannot be dodged and so cannot teach the radius.
 */
export function fireProjectile(
  fromX: number,
  fromY: number,
  towardX: number,
  speed: number,
  damage: number,
): Projectile {
  return { x: fromX, y: fromY, prevX: fromX, vx: towardX < fromX ? -speed : speed, damage };
}

/**
 * Advance every projectile and drop the ones that have left the world.
 *
 * Returns a NEW array rather than splicing in place: removing from an array being iterated is the
 * classic way to skip an element, and the lists here are a handful of items per tick.
 */
export function stepProjectiles(
  projectiles: readonly Projectile[],
  widthPx: number,
): Projectile[] {
  const alive: Projectile[] = [];
  for (const projectile of projectiles) {
    const moved = { ...projectile, prevX: projectile.x, x: projectile.x + projectile.vx };
    if (moved.x >= 0 && moved.x <= widthPx) {
      alive.push(moved);
    }
  }
  return alive;
}

/**
 * The first projectile whose path this tick crossed the box, or `null`.
 *
 * Swept on x for the same reason hazards are: at `projectileSpeed` 9 px/tick against a 132 px-wide
 * player the point test is *currently* safe, but that is an accident of two knobs, and both are
 * tunable from the Gym. A gate that holds only for today's numbers is not a gate.
 */
export function projectileHit(projectiles: readonly Projectile[], box: Rect): Projectile | null {
  for (const projectile of projectiles) {
    if (projectile.y < box.y || projectile.y > box.y + box.h) {
      continue;
    }
    const lo = Math.min(projectile.prevX, projectile.x);
    const hi = Math.max(projectile.prevX, projectile.x);
    if (hi >= box.x && lo <= box.x + box.w) {
      return projectile;
    }
  }
  return null;
}
