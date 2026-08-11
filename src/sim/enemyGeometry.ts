import type { Sighting } from './enemies';

/* ------------------------------------------------------------------ *
 * Shared geometry.
 * ------------------------------------------------------------------ */

/**
 * Squared-distance comparison — no `Math.sqrt`.
 *
 * Not a micro-optimisation: `sqrt` returns a float, and comparing a float against an integer radius
 * makes "exactly on the boundary" depend on rounding. Comparing squares keeps the boundary exact,
 * which is precisely the case the flap test parks the player on.
 */
export function withinRadius(x: number, y: number, at: Sighting, radius: number): boolean {
  const dx = at.playerX - x;
  const dy = at.playerY - y;
  return dx * dx + dy * dy <= radius * radius;
}
