import { toWorld } from './player';
import type { LocalBox, Rect } from './types';
import type { EnemySlug } from './enemies';
import { createSentry } from './enemySentry';
import type { Sentry } from './enemySentry';
import { createScavenger } from './enemyScavenger';
import type { Scavenger } from './enemyScavenger';

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
