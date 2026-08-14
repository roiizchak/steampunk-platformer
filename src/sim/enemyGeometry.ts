import { TILE_SIZE } from '../game/constants';
import type { Rect } from './types';
import type { Sighting } from './enemies';

/* ------------------------------------------------------------------ *
 * Shared geometry.
 * ------------------------------------------------------------------ */

/**
 * How close the player may get, horizontally, before an enemy stops re-deciding which way it faces.
 *
 * **ONE definition, two consumers** *(vault 5.3)* — `SCAVENGER.deadZone` and `SENTRY.deadZone` both
 * read it, and each still accepts a per-instance override so a level or a tuner can differ
 * deliberately rather than by drift.
 *
 * One tile wide. A player straddling an enemy inside one tile is closer than a chaser could close in
 * a tick anyway, so holding costs nothing; what it buys is that a player oscillating across the
 * enemy's own `x` — a jump apex over a turret, the ordinary case — cannot strobe `flipX` at the tick
 * rate. `setFlipX` does not restart an animation, so **no frame-index gate can see that happening**;
 * it has to be prevented rather than detected.
 *
 * ⚠️ It was 96 written as a literal in `SCAVENGER`, whose comment cited *"`GRID` in
 * `src/game/constants.ts`"* — **there is no `GRID`**; the constant is `TILE_SIZE`. So the one number
 * the two enemies were supposed to share was a literal in one of them, justified by a citation to a
 * symbol that does not exist. Derived here instead, which is why the sentry's copy cannot drift from
 * the scavenger's the way its docstring already had.
 */
export const ENEMY_DEAD_ZONE = TILE_SIZE;

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
