import type { Rect } from './types';
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

/**
 * Is there solid ground directly beneath the world point `(x, y)`, where `y` is a FOOT line?
 *
 * The probe point is one pixel BELOW the feet, which is the whole trick: an enemy's `y` sits exactly
 * on a solid's top edge, so testing `y` itself is a boundary comparison that a level authored half a
 * pixel out would fail. `y + 1` is unambiguously inside the surface or unambiguously over the void.
 *
 * **Enemies still have no gravity and no collision** — that is deliberately out of scope. This is a
 * one-way *veto* on a step that would leave a body unsupported, not a physics integration. An enemy
 * whose ground disappears from under it (a moving platform, were there one) stays where it is; it
 * does not fall, because nothing here can make it fall.
 */
export function groundUnder(x: number, y: number, solids: readonly Rect[]): boolean {
  const probeY = y + 1;
  for (const solid of solids) {
    if (
      x >= solid.x &&
      x <= solid.x + solid.w &&
      probeY >= solid.y &&
      probeY <= solid.y + solid.h
    ) {
      return true;
    }
  }
  return false;
}
