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
 * It flies in a straight line at a constant speed, AIMED IN 2D at the player at the moment it is
 * fired. **No gravity.**
 *
 * ✅ **It DOES stop at solids, since 2026-08-23** *(session inventory 1.2)*. This paragraph read
 * *"no collision against solids… it needs the solid list, an ordering decision against the player's
 * own motion, and a second swept test"* and was deferred every session from Phase 5 on.
 *
 * All three of those turned out to be smaller than they read:
 *
 *  - **the solid list** — one optional argument to `stepProjectiles`, defaulting to none, so every
 *    existing caller and fixture is untouched;
 *  - **the ordering decision** — *not* about the tick contract, which already runs projectile flight
 *    at step 4a. It is **time of impact along one segment**: a player in front of the wall keeps
 *    their hit, a player behind it does not get one. Resolved by **clipping** the segment at the
 *    wall and marking the bolt spent, rather than culling it — culling at 4a would silently cancel a
 *    hit the player had already earned, and step 9b still has to read the shortened segment;
 *  - **the second swept test** — `segmentHitTime` in `hazards.ts`, which `segmentHitsRect` now wraps
 *    so there is one copy of the slab arithmetic, not two *(vault 5.3)*.
 *
 * The nearest solid wins, by time rather than by list order. Gated by
 * `tests/unit/projectile-solids.test.ts`, including a wiring test through the real `tick()` —
 * without which dropping `world.solids` from the live call left all 2239 tests green.
 *
 * **The 2D aim is not polish — a horizontal-only shot made the turret decorative.** The sentry in
 * `level-01` stands on a ledge 384 px above the ground, so a shot travelling flat passes over a
 * grounded player's head forever. The first version fired on x alone and would have shipped a
 * turret that cannot hit anything, which no unit test asking "did a projectile spawn" would catch.
 *
 * Distances are pixels and speeds are px/tick, like everything else in `src/sim/` (vault 2.1).
 */

import { segmentHitTime, segmentHitsRect } from './hazards';
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
  prevY: number;
  /** px/tick. The vector IS the direction; there is no facing field that could disagree with it. */
  vx: number;
  vy: number;
  damage: number;
  /**
   * Struck a solid on the tick just resolved, and must not fly again *(inventory 1.2)*.
   *
   * It is kept for the REMAINDER of that tick rather than deleted, because step 9b's swept damage
   * test still has to read the shortened segment: a player standing between the sentry and the wall
   * earned that hit before the bolt reached the wall, and culling here would silently cancel it.
   * Dropped at the top of the next `stepProjectiles`.
   */
  spent?: boolean;
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
  towardY: number,
  speed: number,
  damage: number,
): Projectile {
  const dx = towardX - fromX;
  const dy = towardY - fromY;
  const distance = Math.hypot(dx, dy);
  // A sentry standing exactly on the player has no direction to fire in. Firing right is arbitrary
  // but defined; NaN velocities would poison every later comparison silently.
  const ux = distance === 0 ? 1 : dx / distance;
  const uy = distance === 0 ? 0 : dy / distance;

  return {
    x: fromX,
    y: fromY,
    prevX: fromX,
    prevY: fromY,
    vx: ux * speed,
    vy: uy * speed,
    damage,
  };
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
  heightPx: number,
  /**
   * The world's solids. Optional and defaulting to none so every existing caller and fixture keeps
   * working — a bolt with no walls to hit behaves exactly as it did before.
   */
  solids: readonly Rect[] = [],
): Projectile[] {
  const alive: Projectile[] = [];
  for (const projectile of projectiles) {
    // A bolt that struck a wall last tick has already been read by step 9b. Its flight is over.
    if (projectile.spent === true) {
      continue;
    }
    const moved: Projectile = {
      ...projectile,
      prevX: projectile.x,
      prevY: projectile.y,
      x: projectile.x + projectile.vx,
      y: projectile.y + projectile.vy,
    };

    /**
     * 🔴 **Stop at the wall — CLIP the segment, do not delete the bolt** *(inventory 1.2)*.
     *
     * The NEAREST solid, by time of impact along this tick's segment, not the first one the level
     * happens to declare. `segmentHitTime` exists for exactly this: a boolean cannot order two
     * contacts on one segment, and the ordering is the whole feature — a player in front of the wall
     * keeps their hit, a player behind it does not get one.
     */
    let earliest: number | null = null;
    for (const solid of solids) {
      const t = segmentHitTime(moved.prevX, moved.prevY, moved.x, moved.y, solid);
      if (t !== null && (earliest === null || t < earliest)) {
        earliest = t;
      }
    }
    if (earliest !== null) {
      moved.x = moved.prevX + (moved.x - moved.prevX) * earliest;
      moved.y = moved.prevY + (moved.y - moved.prevY) * earliest;
      moved.spent = true;
      // Kept this tick on purpose — 9b still has to see the shortened segment. It is dropped by the
      // guard at the top of the loop on the next call.
      alive.push(moved);
      continue;
    }

    // Culled on BOTH axes. Culling on x alone leaks every shot fired downward off a ledge, and a
    // leak is invisible until the frame budget measurement in 5.11 asks why it moved.
    if (moved.x >= 0 && moved.x <= widthPx && moved.y >= 0 && moved.y <= heightPx) {
      alive.push(moved);
    }
  }
  return alive;
}

/**
 * The first projectile whose path this tick crossed the box, or `null`.
 *
 * Swept through `segmentHitsRect` — the SAME function the hazard sweep uses. At
 * `projectileSpeed` 9 px/tick against a 132 px-wide player a point test is *currently* safe, but
 * that is an accident of two knobs and both are tunable from the Gym. A gate that holds only for
 * today's numbers is not a gate, and reusing the tested function costs nothing.
 */
export function projectileHit(projectiles: readonly Projectile[], box: Rect): Projectile | null {
  for (const projectile of projectiles) {
    if (segmentHitsRect(projectile.prevX, projectile.prevY, projectile.x, projectile.y, box)) {
      return projectile;
    }
  }
  return null;
}
