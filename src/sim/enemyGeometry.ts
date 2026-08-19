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
  /**
   * 🔴 **A radius of ZERO means NEVER, not "only at exactly this point"** — corrected 2026-08-15
   * (Codex 5.14, major 5).
   *
   * Without this line `0 <= 0` is true, so a radius of zero still fired at a perfectly coincident
   * player. That is not a corner case here: `detectRadius: 0` is documented as *"the AI off-switch
   * several combat fixtures rely on"*, and `attackRange: 0` is the documented swing off-switch —
   * **both leaked**, and a scavenger with its perception disabled still swung and still dealt
   * damage, because `worldDamage.ts` gates on the claw rather than on aggro. Found when a new
   * regression test asserted the off-switch worked and it did not.
   *
   * Negative and `NaN` fall out here too, which is the other half of the same finding: the
   * comparison below SQUARES the radius, so `-500` behaved as a 500 px radius and `NaN` compared
   * false in a way no caller intended. One guard, three footguns.
   */
  if (!(radius > 0)) return false;
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

/**
 * Would a step from `previousX` to `nextX` drive this body INTO a solid it was clear of?
 *
 * The horizontal counterpart to `groundUnder`, and the reason enemies stopped walking through
 * walls. `groundUnder` probes DOWNWARD — it vetoes a step over a void and is blind to anything
 * standing in the way. Nothing else in the tick could catch it either: step 9's `resolveCollisions`
 * is the player's, and enemies move at step 4a with no resolve pass after them.
 *
 * 🔴 **"Newly entered", not "overlapping" — and that is not a refinement, it is the fix.** A plain
 * overlap test is what you write first and it breaks two real things:
 *
 *  - the unit fixtures express "ground at every height" as ONE solid spanning the whole plane, so
 *    every body in them is permanently inside a solid. Overlap reads that as a wall.
 *  - level-02's first scavenger SAT with its 60 px half-width straddling the wall its patrol beat
 *    started against, and an overlap test would have trapped it on boot. ⚠️ **Past tense on
 *    purpose: the A2 placement fix in this same branch moved that beat one column, so the body now
 *    clears the wall by 36 px and no shipped enemy overlaps a solid any more.** The reason the rule
 *    is written this way is still the reason; the live example is gone, and the discriminating case
 *    is now a committed fixture in `enemy-wall-collision.test.ts` rather than a shipped level.
 *
 * So this borrows the player's own rule. `resolveCollisions` only pushes out of a solid the body
 * was clear of at `previousX` (its `wasLeft` / `wasRight` pair); one rule for both, rather than two
 * that agree on the happy path *(vault 5.3)*. **You cannot be blocked by something you are already
 * inside** — which is also the only sane answer for an enemy authored half a pixel into geometry.
 *
 * Vertical overlap is STRICT on both edges, which is what lets a body walk along the surface it
 * stands on: its feet sit exactly on that solid's top edge, so `feetY > solid.y` is false and the
 * floor can never read as a wall. The same strictness lets it pass under an overhang that clears
 * its head. `overlapsScavenger` uses strict comparisons for the same reason.
 */
/**
 * How far a body's feet may sit off a surface before that surface counts as an obstruction.
 *
 * 🔴 **Zero tolerance made every shipped enemy one pixel from refusing to boot.** Measured by the
 * adversarial brief: all 20 enemies in the five levels have EXACTLY zero separation from the floor
 * they stand on, and nudging a floor strip up by 1 px made `describePlacementProblem` reject the
 * level. `tilemap.ts`'s spawn rule was rewritten TWICE for this same reason — its comment says the
 * Element Editor's *"ENTIRE PURPOSE is nudging a collision strip a pixel or two"* — and the placement
 * rule reintroduced the brittleness in the next block along.
 *
 * It is not only a gate problem: with the feet 1 px low the SIM breaks too, a patroller freezing at
 * the seam between two abutting floor strips. So the tolerance belongs in both, from one constant,
 * or they drift apart again *(vault 5.3)*.
 *
 * Two pixels: a third of one 6 px patrol step and 1/48th of a 96 px tile, so it forgives an
 * authoring nudge without forgiving a ledge anybody could see.
 */
export const FOOT_TOLERANCE_PX = 2;

export function blockedAt(
  previousX: number,
  nextX: number,
  feetY: number,
  halfWidthPx: number,
  heightPx: number,
  solids: readonly Rect[],
): boolean {
  const headY = feetY - heightPx;
  for (const solid of solids) {
    const right = solid.x + solid.w;
    const bottom = solid.y + solid.h;
    // The foot line carries a tolerance; the head line does not. A surface a hair above the
    // feet is the floor being stood on, not a wall — see `FOOT_TOLERANCE_PX`.
    if (!(feetY - FOOT_TOLERANCE_PX > solid.y && headY < bottom)) continue;
    if (!(nextX + halfWidthPx > solid.x && nextX - halfWidthPx < right)) continue;
    const wasClear = previousX + halfWidthPx <= solid.x || previousX - halfWidthPx >= right;
    if (wasClear) return true;
  }
  return false;
}
