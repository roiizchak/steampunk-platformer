/**
 * Tiled `.tmj` -> the plain data the simulation and the camera need.
 *
 * ## The contract this file exists to keep
 *
 * It takes an **already-parsed** JSON object and performs no I/O of any kind. It imports nothing
 * from Phaser and never touches a clock, the DOM or `fetch`. That is not decoration: it is the
 * only reason `tests/unit/tilemap-data.test.ts` can run the **real** validator over the **shipped**
 * `.tmj` under `environment: 'node'` with no `@types/node` — which is vault 3.1's blocker, *"at
 * least one test must load the shipped `.tmj` the player will load"*. A parser that reached for
 * the network would force the unit suite onto a hand-authored fixture, and a fixture suite and a
 * registry suite answer different questions: only one of them can see a defect in shipped data.
 *
 * ## Collision is an OBJECT layer, not the tile grid
 *
 * The tile layer is **art**. Collision is a Tiled object layer of rectangles, each carrying a
 * boolean `solid` property. Two reasons, and the second is the load-bearing one:
 *
 *  - **Vault 3.3 — derive behaviour from data, never from a name.** Solidity is read from a
 *    property on the object. Nothing here reads a layer name, an object name, an object `type`,
 *    or a tile index. `tilemap-data.test.ts` proves that behaviourally rather than by grep:
 *    it renames every layer and object in a parsed copy and asserts the solids come out identical.
 *  - **A tile grid cannot express a sub-tile nudge.** Phase 3's ElementEditor exists because
 *    *"characters floated above platforms when art bottoms and collision bottoms disagreed"*, and
 *    fixing that means moving a collision strip by a few pixels and writing it back to the `.tmj`.
 *    Snapped to a 32 px grid there is no such edit. Rectangles round-trip; tiles do not.
 *
 * Letting the art and the collision disagree is therefore not a hole in the model. It is the
 * failure mode the editor was built to find, made representable.
 */

import { RENDER_SCALE } from './constants';
import { type EnemySlug, type EnemySpawn } from '../sim/enemies';
import { PLAYER_BOX } from '../sim/player';
import type { Rect } from '../sim/types';
import {
  allObjects,
  boolProperty,
  hasGroundBelow,
  isEnemyObject,
  isHazardObject,
  isRecord,
  isSolidObject,
  positiveInt,
  stringProperty,
  type TiledLayer,
  type TiledMap,
  type TiledObject,
} from './tiledObjects';
import {
  describeEnemyProblem,
  describeGearProblem,
  gearSpawns,
  isGearObject,
} from './tiledEntities';
import { describeGoalProblem, goalRect, isGoalObject } from './tiledGoal';

/**
 * Re-exported, not re-implemented. `ElementEditorScene` and the unit tests have imported these
 * from `tilemap` since Phase 3; the Phase 5 split moved the definitions, not the entry point.
 */
export { isHazardObject, isSolidObject } from './tiledObjects';
export { isGearObject } from './tiledEntities';

/**
 * Re-exported from the sim, which owns the roster and the constructors. See `EnemySpawn` there
 * for what each field means and why a rectangle declares all of them.
 */
export type { EnemySpawn };

/** A parsed, validated level. Every pixel figure is MEASURED from the file, never assumed. */
export interface LevelData {
  /** Catalog id, e.g. `level-01`. Supplied by the caller; the file does not name itself. */
  id: string;
  widthTiles: number;
  heightTiles: number;
  tileWidth: number;
  tileHeight: number;
  /** `widthTiles * tileWidth`. Vault 3.2: the world extent is a measurement, not a label. */
  widthPx: number;
  heightPx: number;
  /** Static collision geometry, world space, top-left origin, `+y` down — `World.solids`. */
  solids: Rect[];
  /** The player's feet at level start: `x` is the horizontal centre, `y` is the sole. */
  spawn: { x: number; y: number };
  /** Damaging geometry — `World.hazards`. Never solid: you do not stand on spikes. */
  hazards: Rect[];
  /** Where each enemy starts, read from the file rather than hardcoded in a scene. */
  enemies: EnemySpawn[];
  /** Gear pickups — centres, world space. Points in the file; `GEAR_BOX` gives them their size. */
  gears: { x: number; y: number }[];
  /**
   * The level EXIT — Phase 8. A volume the player's box enters, not a point.
   *
   * Non-optional, and that is the decision rather than an oversight: a level with no exit cannot be
   * completed, which is the single defect this phase exists to make impossible. `describeGoalProblem`
   * refuses a level without one, so every shipped `.tmj` has exactly one and `World.goal` is only
   * `null` for the synthetic fixtures that build a world directly through `createWorld`.
   */
  goal: Rect;
}

/**
 * `null` when the level is loadable, otherwise a one-line reason.
 *
 * Mirrors `describeCatalogProblem` in `assetCatalog.ts` — same `string | null` contract, so
 * BootScene's refuse-to-route gate treats a malformed level exactly like a corrupt PNG rather
 * than needing a second kind of failure path.
 *
 * Every reason names the offending value. A gate that says only "invalid" sends you back to the
 * file to find out what it meant.
 */
export function describeLevelProblem(raw: unknown): string | null {
  if (!isRecord(raw)) {
    return 'not an object';
  }

  const map = raw as TiledMap;

  if (!positiveInt(map.width) || !positiveInt(map.height)) {
    return `width and height must be positive tile counts, got ${String(map.width)} x ${String(map.height)}`;
  }
  if (!positiveInt(map.tilewidth) || !positiveInt(map.tileheight)) {
    return `tilewidth and tileheight must be positive, got ${String(map.tilewidth)} x ${String(map.tileheight)}`;
  }
  if (map.tilewidth !== map.tileheight) {
    return `tilewidth ${String(map.tilewidth)} and tileheight ${String(map.tileheight)} must be equal`;
  }
  if (!Array.isArray(map.layers)) {
    return 'layers must be an array';
  }

  const layers = map.layers as TiledLayer[];

  /**
   * Refuse the Tiled constructs this parser does not implement, rather than silently mis-reading
   * them. Raised by the code-reviewer gate owner (brief 2), and the failure mode is nasty:
   *
   *  - drag a layer in Tiled and it writes `offsetx`/`offsety`. Every collision rect is then N px
   *    from where Tiled draws it — and EVERY oracle in this phase is this same parser, so the unit
   *    sweep, the e2e specs and the editor's own overlays all shift WITH the bug and agree.
   *  - wrap the object layer in a `group` and the solids vanish, because nothing recurses.
   *
   * Both are exactly the art-versus-collision disagreement this phase is about, arriving through
   * the file instead of through the editor. Supporting them is a Phase 8 job if a level ever needs
   * them; refusing them is the honest thing to do until then.
   */
  for (const [index, layer] of layers.entries()) {
    if (layer.type === 'group') {
      return `layer #${index} is a group — nested layers are not supported, so its contents would be silently ignored`;
    }
    const offsetX = (layer as { offsetx?: unknown }).offsetx;
    const offsetY = (layer as { offsety?: unknown }).offsety;
    if ((typeof offsetX === 'number' && offsetX !== 0) || (typeof offsetY === 'number' && offsetY !== 0)) {
      return `layer #${index} has a non-zero offset (${String(offsetX)}, ${String(offsetY)}), which this parser does not apply`;
    }
  }

  const tileLayers = layers.filter((layer) => layer.type === 'tilelayer');
  if (tileLayers.length === 0) {
    // Collision without art is a level the player cannot see. It renders as an empty screen the
    // character mysteriously stands in, which reads as a broken camera rather than a broken level.
    return 'no tile layer — the level has collision but nothing to draw';
  }

  // A tile layer whose data does not match the map header draws a level that is silently truncated
  // or wrapped — the art shifts relative to the collision objects, which is exactly the class of
  // defect the Element Editor exists to chase and the last thing you want arriving from the file
  // itself. Raised by the qa-expert gate owner (brief 1) as untested; it costs four lines.
  const expectedCells = map.width * map.height;
  for (const [index, layer] of tileLayers.entries()) {
    if (!Array.isArray(layer.data)) {
      return `tile layer #${index} has no data array`;
    }
    if (layer.data.length !== expectedCells) {
      return `tile layer #${index} has ${layer.data.length} cells, expected ${expectedCells}`;
    }
  }

  // A tile layer of the right SIZE full of zeros draws nothing at all, which is the failure the
  // "no tile layer" rule above describes and does not actually catch — raised by the qa-expert
  // gate owner (brief 2). Gid 0 is Tiled's empty cell, so "every layer is empty" is a level with
  // collision and no art: the player stands in a void, which reads as a broken camera.
  if (!tileLayers.some((layer) => (layer.data as unknown[]).some((gid) => gid !== 0))) {
    return 'every tile layer is empty — the level has collision but draws nothing';
  }

  const objects = allObjects(layers);
  const solids = objects.filter((object) => boolProperty(object, 'solid'));
  if (solids.length === 0) {
    return 'no object carries the `solid` property — the level has no collision at all';
  }

  for (const [index, solid] of solids.entries()) {
    if (typeof solid.x !== 'number' || typeof solid.y !== 'number') {
      return `solid #${index} has a non-numeric position`;
    }
    if (typeof solid.width !== 'number' || typeof solid.height !== 'number') {
      return `solid #${index} has a non-numeric size`;
    }
    if (!(solid.width > 0) || !(solid.height > 0)) {
      // A zero-width strip is invisible to the resolver and to the eye. It is the shape a
      // half-finished edit leaves behind, and it must not reach the game silently.
      return `solid #${index} has a non-positive size, ${solid.width} x ${solid.height}`;
    }
  }

  // Hazards get the same shape checks as solids and for the same reason: a zero-size hazard is
  // invisible to the swept contact test and to the eye, so it reads as "the spikes do nothing"
  // rather than as a malformed level. Deliberately NOT checked for ground beneath — a hazard
  // hanging in mid-air is a legitimate thing to author (a steam jet, a saw on a chain).
  const hazards = objects.filter(isHazardObject);
  for (const [index, hazard] of hazards.entries()) {
    if (typeof hazard.x !== 'number' || typeof hazard.y !== 'number') {
      return `hazard #${index} has a non-numeric position`;
    }
    if (typeof hazard.width !== 'number' || typeof hazard.height !== 'number') {
      return `hazard #${index} has a non-numeric size`;
    }
    if (!(hazard.width > 0) || !(hazard.height > 0)) {
      return `hazard #${index} has a non-positive size, ${hazard.width} x ${hazard.height}`;
    }
  }

  const spawns = objects.filter((object) => boolProperty(object, 'spawn'));
  if (spawns.length === 0) {
    return 'no object carries the `spawn` property';
  }
  if (spawns.length > 1) {
    return `${spawns.length} objects carry the \`spawn\` property, expected exactly one`;
  }

  const spawn = spawns[0]!;
  if (typeof spawn.x !== 'number' || typeof spawn.y !== 'number') {
    return 'spawn has a non-numeric position';
  }

  // Tiled reports a RECTANGLE object's x/y as its top-left, and a POINT's as the point itself.
  // `parseLevel` reads spawn.x as the player's horizontal centre and spawn.y as the sole, which is
  // only true for a point. A spawn authored as a rectangle would be silently offset by half its
  // width and all of its height, and pass every other check — vault 3.2's "invisible until level
  // design" shape. Raised by the code-reviewer gate owner; the generator already emits a point.
  if ((spawn.width ?? 0) !== 0 || (spawn.height ?? 0) !== 0) {
    return `spawn must be a point object, but has size ${String(spawn.width)} x ${String(spawn.height)}`;
  }

  const widthPx = map.width * map.tilewidth;
  const heightPx = map.height * map.tileheight;
  if (spawn.x < 0 || spawn.x > widthPx || spawn.y < 0 || spawn.y > heightPx) {
    return `spawn (${spawn.x}, ${spawn.y}) is outside the map, which is ${widthPx} x ${heightPx} px`;
  }

  // The spawn must have solid ground UNDER it — not exactly at its feet.
  //
  // The check first lived only in the unit test, which the qa-expert gate owner (brief 2) rightly
  // called a production/test divergence: the boot gate was weaker than the criterion named after
  // it. Moving it here was correct. Writing it as `solid.y === spawn.y` was not, and the
  // code-reviewer gate owner (brief 2) found what that cost:
  //
  //   the Element Editor's ENTIRE PURPOSE is nudging a collision strip a pixel or two. Nudge the
  //   strip the player spawns on — the first one — press save, drop the file in as the editor's
  //   own save note instructs, and the next boot REFUSES TO ROUTE. Exact equality made the
  //   editor's primary workflow emit a level the boot gate rejects.
  //
  // What the rule is actually protecting against is a spawn over a pit, or under the floor. A
  // player that spawns a few pixels up and falls onto the ground is completely fine — the sim's
  // own grey-box spawn is on the surface only so that FIXTURES need not count drop ticks, which is
  // a test concern, not a level-data one.
  // The rule, stated as the thing it actually protects: **the player must not fall out of the
  // world.** A solid counts if it spans the spawn horizontally and its BOTTOM is at or below the
  // spawn — i.e. the solid is not entirely above the player.
  //
  // Getting here took two wrong versions, and the second was caught by the regression test written
  // for the first:
  //   `solid.y === spawn.y`  broke nudging the spawn strip AT ALL.
  //   `solid.y >= spawn.y`   broke nudging it UP, which is the direction you use when collision
  //                          sits below the art — the motivating defect, again.
  // Both were really asking "is the spawn resting exactly on a surface", which is a fixture
  // concern borrowed from the sim's grey-box spawn, not a property a level file has to have. A
  // player that spawns a few pixels above the ground falls onto it; one that spawns a few pixels
  // inside it is pushed out on the first tick. Neither is a broken level. A pit is.
  if (!hasGroundBelow(solids, spawn.x as number, spawn.y as number)) {
    return `spawn (${spawn.x}, ${spawn.y}) has no solid beneath it — the player falls out of the world`;
  }

  // The entity rules live in `tiledEntities.ts` — see that file's header for why they moved. Both
  // return the same one-line-reason-or-null this function does, so they compose without unwrapping.
  const enemyProblem = describeEnemyProblem(objects.filter(isEnemyObject), solids);
  if (enemyProblem !== null) {
    return enemyProblem;
  }

  // The map's own extent, measured from the file rather than assumed (vault 3.2). Both casts are
  // discharged by the positive-integer checks above.
  const gearProblem = describeGearProblem(
    objects.filter(isGearObject),
    {
      widthPx: (map.width as number) * (map.tilewidth as number),
      heightPx: (map.height as number) * (map.tileheight as number),
    },
    solids,
  );
  if (gearProblem !== null) {
    return gearProblem;
  }

  // 🔴 THE GOAL BLOCK IS LAST, AND ITS POSITION IS LOAD-BEARING. Moving it earlier collapses the 23
  // bad-level fixtures' distinct rejection reasons to one and turns that gate red with a message that
  // reads like a test bug. Full reasoning in `tiledGoal.ts`'s header — read it before reordering.
  const goalProblem = describeGoalProblem(
    objects.filter(isGoalObject),
    { x: spawn.x as number, y: spawn.y as number },
    {
      widthPx: (map.width as number) * (map.tilewidth as number),
      heightPx: (map.height as number) * (map.tileheight as number),
    },
    solids,
    // The player's standing box in WORLD pixels. `PLAYER_BOX` is local units (vault 2.11), so the
    // scale is applied here rather than being a second literal inside the validator.
    { w: PLAYER_BOX.w * RENDER_SCALE, h: PLAYER_BOX.h * RENDER_SCALE },
  );
  if (goalProblem !== null) {
    return goalProblem;
  }

  return null;
}

/**
 * Parse a validated level. Throws if `describeLevelProblem` has anything to say, so a caller that
 * skips the check still cannot proceed on bad data.
 */
export function parseLevel(id: string, raw: unknown): LevelData {
  const problem = describeLevelProblem(raw);
  if (problem !== null) {
    throw new Error(`level ${id}: ${problem}`);
  }

  // Every cast here is discharged by `describeLevelProblem` above, which returned null.
  const map = raw as {
    width: number;
    height: number;
    tilewidth: number;
    tileheight: number;
    layers: TiledLayer[];
  };
  const { width: widthTiles, height: heightTiles, tilewidth: tileWidth, tileheight: tileHeight } = map;

  const objects = allObjects(map.layers);
  const toRect = (object: TiledObject): Rect => ({
    x: object.x as number,
    y: object.y as number,
    w: object.width as number,
    h: object.height as number,
  });
  const solids: Rect[] = objects.filter(isSolidObject).map(toRect);
  const hazards: Rect[] = objects.filter(isHazardObject).map(toRect);

  // Every field is derived from the one rectangle — see `EnemySpawn`. Tiled reports `y` as the
  // TOP, so the feet are `y + height`.
  const enemies: EnemySpawn[] = objects.filter(isEnemyObject).map((object) => {
    const rect = toRect(object);
    return {
      slug: stringProperty(object, 'enemy') as EnemySlug,
      x: rect.x + rect.w / 2,
      y: rect.y + rect.h,
      patrolMin: rect.x,
      patrolMax: rect.x + rect.w,
    };
  });

  const spawnObject = objects.find((object) => boolProperty(object, 'spawn'))!;

  return {
    id,
    widthTiles,
    heightTiles,
    tileWidth,
    tileHeight,
    widthPx: widthTiles * tileWidth,
    heightPx: heightTiles * tileHeight,
    solids,
    spawn: { x: spawnObject.x as number, y: spawnObject.y as number },
    hazards,
    enemies,
    gears: gearSpawns(objects.filter(isGearObject)),
    goal: goalRect(objects.filter(isGoalObject)),
  };
}
