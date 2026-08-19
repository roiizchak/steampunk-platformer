import { toWorld } from './player';
import type { LocalBox, Rect } from './types';
import type { EnemySlug } from './enemies';
import { createSentry } from './enemySentry';
import type { Sentry } from './enemySentry';
import { createScavenger } from './scavengerFactory';
import type { Scavenger, ScavengerFooting } from './enemyScavenger';

/* ------------------------------------------------------------------ *
 * Placement — turning level data into live entities.
 * ------------------------------------------------------------------ */

/**
 * Where one enemy starts, and how far it may walk.
 *
 * Authored as a Tiled **rectangle** and read by `src/game/tilemap.ts`, which re-exports this type:
 * `x` is the rectangle's horizontal centre, `y` its bottom edge (the feet), and its left and right
 * edges are the patrol beat. A patroller's range is therefore something the designer draws on the
 * platform rather than a pair of numbers typed into a scene, and a static enemy ignores the span.
 *
 * It lives HERE, beside `ENEMY_SLUGS` and the constructors, rather than in the parser — the module
 * that builds an enemy owns the shape that describes one, so a field a level can express is a
 * field the sim can consume.
 */
export interface EnemySpawn {
  slug: EnemySlug;
  x: number;
  y: number;
  patrolMin: number;
  patrolMax: number;
}

/**
 * Every live enemy in a world, kept in one array per type rather than a discriminated union.
 *
 * Two arrays because the two step functions have different signatures and different return values;
 * a union would need narrowing at every call site to say something the array already knows. The
 * render layer builds its own flat list when it needs one.
 */
export interface EnemySet {
  sentries: Sentry[];
  scavengers: Scavenger[];
}

/**
 * Build the live entities for a level's placements.
 *
 * The `never` in the default branch is the point of the function: adding a slug to `ENEMY_SLUGS`
 * without a constructor here is a **typecheck error**, not a level that boots one enemy short.
 */
export function spawnEnemies(spawns: readonly EnemySpawn[]): EnemySet {
  const set: EnemySet = { sentries: [], scavengers: [] };
  for (const spawn of spawns) {
    switch (spawn.slug) {
      case 'brass-sentry':
        set.sentries.push(createSentry({ x: spawn.x, y: spawn.y }));
        break;
      case 'rust-scavenger':
        set.scavengers.push(
          createScavenger({
            x: spawn.x,
            y: spawn.y,
            patrolMin: spawn.patrolMin,
            patrolMax: spawn.patrolMax,
          }),
        );
        break;
      default: {
        const unreachable: never = spawn.slug;
        throw new Error(`spawnEnemies: no constructor for slug ${String(unreachable)}`);
      }
    }
  }
  return set;
}

/* ------------------------------------------------------------------ *
 * Bodies.
 * ------------------------------------------------------------------ */

/**
 * Enemy collision boxes, authored local like `PLAYER_BOX`: `+x` forward, `+y` up from the feet.
 *
 * The heights are the plan's readability decision expressed in the ONE unit the sim uses. At the
 * published `RENDER_SCALE` of 6 they draw as **192 px (2 tiles)** and **240 px (2.5 tiles)** against
 * the player's 288 px (3 tiles) — three distinct silhouette heights, so the two enemies separate
 * from the player and from each other at true sprite size before any colour does.
 *
 * They are NOT read from the `.tmj`: an enemy rectangle there declares the patrol beat, which is a
 * level-design number, while the body is a character-design one. Conflating them would make a
 * longer patrol produce a wider enemy.
 */
export const SENTRY_BOX: LocalBox = { x: -8, y: 0, w: 16, h: 32 };
export const SCAVENGER_BOX: LocalBox = { x: -10, y: 0, w: 20, h: 40 };

/**
 * Where the sentry's shot is born — the cannon's muzzle, authored in the same local space.
 *
 * **A zero-size box on purpose.** It is a POINT, not a body, and `toWorld` handles that correctly:
 * with `w: 0` the forward reflection collapses to `facing === 1 ? x : -x`, which is exactly the
 * mirror a barrel needs. Going through `toWorld` rather than multiplying here is vault 2.10 — the
 * spawn was already the third place in this file's neighbourhood doing its own `* scale`.
 *
 * **Measured, not designed.** Off the shipped `brass-sentry/idle` sheet: the centroid of the
 * outermost 14 columns of the barrel, per frame, against the sprite's `(0.5, 1)` origin, averaged
 * over all 8 frames — `+106.8 px` forward and `135.8 px` above the feet, with a frame-to-frame
 * spread of 3.5 and 9.3 px (the turret breathes). At `RENDER_SCALE` 6 that is `17.8` and `22.6`
 * local units. `addBody` never calls `setDisplaySize`, so the sprite draws at its native 288x384
 * cell and one cell pixel is one world pixel — which is what makes a sheet measurement a legitimate
 * source for a sim constant rather than a coincidence.
 *
 * The value it replaces was `(sentry.x, sentry.y - SENTRY_BOX.h / 2 * scale)`: the body's centre,
 * 106.8 px behind the barrel and 39.6 px below it. The user reported it as "the sentry fires from
 * its belly" off a screen recording, and no test asking "did a projectile spawn" could have seen it.
 *
 * ⚠️ **This is art-derived, so re-measure it if `brass-sentry/idle` is ever re-shot.** This note
 * used to say `brass-sentry/fire` was "not in the catalog yet"; it landed in session 7 and the
 * sentence outlived it. **The muzzle is still measured against the IDLE pose**, and re-measuring it
 * against the firing one is open work — recorded here rather than silently assumed equal.
 */
export const SENTRY_MUZZLE: LocalBox = { x: 17.8, y: 22.6, w: 0, h: 0 };

/**
 * The ground data one tick of scavenger chasing needs, with the body's half-width resolved once.
 *
 * It lives HERE, beside `SCAVENGER_BOX`, so the width has exactly one definition *(vault 5.3)*.
 * `enemyScavenger.ts` cannot import the box itself without closing a runtime cycle — this file
 * already imports `createScavenger` from it — and restating `20 / 2 * scale` at the call site is how
 * a body ends up two different widths depending on which question is being asked of it.
 */
export function scavengerFooting(solids: readonly Rect[], scale: number): ScavengerFooting {
  /**
   * 🔴 Derived through `toWorld`, not by multiplying the box's fields here.
   *
   * The first version wrote `(SCAVENGER_BOX.w / 2) * scale` and `SCAVENGER_BOX.h * scale` directly.
   * That is correct ONLY because `SCAVENGER_BOX` happens to be `{ x: -10, y: 0, w: 20, h: 40 }` —
   * symmetric about the feet and sitting on them. `toWorld` computes `y = feetY - (box.y + box.h) *
   * scale` and reflects `x` by facing, so giving the box a non-zero `y` or an asymmetric `x` would
   * have silently desynced the veto's idea of the body from `overlapsScavenger`'s. Two
   * representations of one body is the exact thing this file's vault 5.3 note argues against, and
   * the code-reviewer gate owner caught it doing precisely that.
   *
   * A zero-origin probe: the returned rect's offsets ARE the body's, whatever the box becomes.
   */
  const body = toWorld(SCAVENGER_BOX, 0, 0, 1, scale);
  // `blockedAt` spans `[feetY - heightPx, feetY]`, which is the body ONLY while its bottom sits on
  // the feet. Enforced rather than assumed, the same way `createScavenger` throws on a cooldown
  // shorter than its own swing: a silent desync from `overlapsScavenger` is not something a test
  // would notice until an enemy walked through a wall again.
  if (body.y + body.h !== 0) {
    throw new Error(
      `scavengerFooting: SCAVENGER_BOX must sit on the feet, got y ${SCAVENGER_BOX.y} h ${SCAVENGER_BOX.h}`,
    );
  }
  // 🔴 The x half, which the docstring above promised and the first version did not check.
  // `blockedAt` probes `x ± halfWidthPx` — symmetric about the centre and blind to `facing` — while
  // `overlapsScavenger` goes through `toWorld`, which offsets by `box.x` and reflects by facing.
  // An asymmetric box makes those two bodies differ with no throw and no red test.
  if (body.x !== -body.w / 2) {
    throw new Error(
      `scavengerFooting: SCAVENGER_BOX must be symmetric about the feet, got x ${SCAVENGER_BOX.x} w ${SCAVENGER_BOX.w}`,
    );
  }
  return { solids, halfWidthPx: body.w / 2, heightPx: body.h };
}

/**
 * Does the player's world box touch this scavenger's?
 *
 * Goes through `toWorld` — THE single local→world conversion (vault 2.10) — rather than doing the
 * multiply here. A second conversion is how a hitbox ends up mirrored on one axis only.
 */
export function overlapsScavenger(scavenger: Scavenger, playerBox: Rect, scale: number): boolean {
  const body = toWorld(SCAVENGER_BOX, scavenger.x, scavenger.y, scavenger.facing, scale);
  return (
    playerBox.x < body.x + body.w &&
    playerBox.x + playerBox.w > body.x &&
    playerBox.y < body.y + body.h &&
    playerBox.y + playerBox.h > body.y
  );
}
