/**
 * Hazards, the kill plane, and the world's three solid edges.
 *
 * ## The hole this closes
 *
 * Phase 4 shipped a level the player could **run off the left edge of and fall forever** — no wall,
 * no kill plane, no respawn, recoverable only by reloading. It was recorded rather than patched,
 * deliberately, because a kill plane is a *death* and death is Phase 5's state machine; bolting a
 * respawn onto a game with no health model would have had to be undone here.
 *
 * The paired item was the spike run at cols 24–27 of the level-01 of the time — the Phase 7 geometry
 * now frozen as `tests/fixtures/levels/level-01-phase07.tmj`, not the level Phase 8 ships:
 * non-solid and non-damaging, which was correct — you do not stand on spikes — and making it hurt is
 * this same work.
 *
 * ## Two different treatments, on purpose
 *
 * **Falling is a death you can see coming; walking off the side is not.** So the bottom is a kill
 * plane and the other three edges are invisible collision. Clamping all four was considered and
 * rejected: a pit you cannot fall into is not a platformer, and killing a player who steps one
 * pixel left at the level start reads as a bug rather than a hazard.
 *
 * ## Why contact is SWEPT and not sampled
 *
 * Codex plan review C6. At `maxFallSpeed` 51.6 px/tick, a spike strip 40 px tall is **crossed
 * entirely between two ticks** — above it on one, below it on the next, never sampled inside. A
 * point test reports no contact and is wrong. Phase 2 already recorded this failure class
 * (`docs/qa/phase-02-player.md:349`); this is the first code that has to care.
 *
 * The kill plane does not need sweeping — it is a half-plane, so "below it now" is complete. Only
 * finite rectangles can be tunnelled.
 */

import type { Rect } from './types';

/**
 * What one contact with damaging geometry costs.
 *
 * 20 of 100, so five contacts kill — enough that spikes are a real threat and few enough that a
 * single mistimed jump is not a run ender. One number for every hazard today; `hazardHit` returns
 * the RECTANGLE rather than a boolean precisely so a furnace can cost more than a spike later
 * without changing a call site.
 */
export const HAZARD_DAMAGE = 20;

/** The world's extent in pixels. `LevelData` already carries both; `World` is given them. */
export interface WorldBounds {
  widthPx: number;
  heightPx: number;
}

/**
 * Has the player fallen out of the world?
 *
 * Strictly below the floor, so standing exactly on `heightPx` is alive — the boundary belongs to
 * the world, and a level whose collision reaches its own bottom edge must not kill the player
 * standing on it.
 */
export function belowKillPlane(feetY: number, bounds: WorldBounds): boolean {
  return feetY > bounds.heightPx;
}

/** The mutable slice of the player this clamp touches. Narrow on purpose — it moves nothing else. */
export interface Clampable {
  x: number;
  y: number;
  vx: number;
}

/**
 * Keep the player inside the world's left, right and top edges.
 *
 * **This lives at step 9, with `resolveCollisions`, not at step 4.** The plan called it a step-4
 * concern while putting it here, and Codex C6 caught the contradiction. It is collision: it stops a
 * body, it does not damage one.
 *
 * The velocity is zeroed as well as the position. Leaving it live means a player holding left at
 * the wall keeps a negative `vx` that fights every other force and re-triggers the clamp every
 * tick — the position looks right and the physics underneath is wrong.
 *
 * 🔴 **Returns whether it fired**, because that is the only place a world-edge stop is
 * distinguishable from a level-geometry stop. `stallAnalysis.ts` declared a `boundsClamp` cause it
 * could never reach without this, so a player held against the world edge was reported as
 * `geometry` — the exact label that drove a whole session's fix. Found by the Codex implementation
 * review. Nothing else reads the return, and ignoring it is legal.
 */
export function clampToBounds(player: Clampable, bounds: WorldBounds, halfWidth: number): boolean {
  const min = halfWidth;
  const max = bounds.widthPx - halfWidth;

  if (player.x < min) {
    player.x = min;
    player.vx = 0;
    return true;
  }
  if (player.x > max) {
    player.x = max;
    player.vx = 0;
    return true;
  }
  // The bottom is deliberately absent — see `belowKillPlane`. The top is not clamped either: a
  // player cannot reach it in `level-01`, and a ceiling that stops a jump is a level-design
  // decision, not a world-edge one.
  return false;
}

/**
 * Did a moving point cross this rectangle between last tick and this one?
 *
 * Named generically because it has two callers: the hazard sweep below, and the projectile hit
 * test in `projectiles.ts`. It was `sweptHazardHit` until the sentry needed the same maths against
 * the player box — one definition, two consumers, rather than a near-copy that agrees on the easy
 * cases *(vault 5.3)*.
 *
 * A **segment-versus-rectangle** test, not a point test. The segment is last tick's feet to this
 * tick's; the rectangle is the hazard. Standing still is the degenerate case where the segment is a
 * point, and it still works.
 *
 * Implemented as a slab test on the segment's parameter `t`, clipped to `[0, 1]`: the interval of
 * `t` inside the x-slab intersected with the interval inside the y-slab. Non-empty means contact.
 * No square roots, no normalisation, and it is exact for the vertical and horizontal cases that
 * dominate here rather than being a near-miss of them.
 */
export function segmentHitsRect(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  box: Rect,
): boolean {
  return segmentHitTime(fromX, fromY, toX, toY, box) !== null;
}

/**
 * **When** along the segment the box is first touched — `0…1`, or `null` for no contact.
 *
 * The same slab clip as `segmentHitsRect`, which is now a thin wrapper over it: two copies of this
 * arithmetic would be two definitions that agree until they do not *(vault 5.3)*, and this one is
 * strictly more informative.
 *
 * Added 2026-08-23 for the bolt-versus-wall fix *(session inventory 1.2)*. A boolean cannot answer
 * the question that fix turns on — a bolt and a player can BOTH be on this tick's segment, and which
 * comes first decides whether the hit counts. Codex plan review X2 named it: filtering every
 * projectile that touched any wall would erase a hit that had already happened.
 *
 * `tMin` is clamped at 0 by the loop below, so a segment starting inside the box reports `0` —
 * "already touching" — rather than a negative time.
 */
export function segmentHitTime(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  box: Rect,
): number | null {
  let tMin = 0;
  let tMax = 1;

  const clip = (from: number, delta: number, lo: number, hi: number): boolean => {
    if (delta === 0) {
      // Parallel to this axis: contact is possible only if it already starts within the slab.
      return from >= lo && from <= hi;
    }
    const t1 = (lo - from) / delta;
    const t2 = (hi - from) / delta;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
    return tMin <= tMax;
  };

  if (!clip(fromX, toX - fromX, box.x, box.x + box.w)) {
    return null;
  }
  if (!clip(fromY, toY - fromY, box.y, box.y + box.h)) {
    return null;
  }
  return tMin <= tMax ? tMin : null;
}

/**
 * The first hazard the player's feet crossed this tick, or `null`.
 *
 * Returns the hazard rather than a boolean so the caller can attribute the damage — a spike and a
 * furnace will not do the same thing, and a boolean forecloses that without saving anything.
 */
export function hazardHit(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  hazards: readonly Rect[],
): Rect | null {
  for (const hazard of hazards) {
    if (segmentHitsRect(fromX, fromY, toX, toY, hazard)) {
      return hazard;
    }
  }
  return null;
}
