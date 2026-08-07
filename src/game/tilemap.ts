import type { Rect } from '../sim/types';

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
}

interface TiledProperty {
  name?: unknown;
  value?: unknown;
}

interface TiledObject {
  x?: unknown;
  y?: unknown;
  width?: unknown;
  height?: unknown;
  properties?: unknown;
}

interface TiledLayer {
  type?: unknown;
  objects?: unknown;
  data?: unknown;
}

interface TiledMap {
  width?: unknown;
  height?: unknown;
  tilewidth?: unknown;
  tileheight?: unknown;
  layers?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A type guard, not a boolean helper — so the checks below narrow `unknown` for the caller. */
function positiveInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

/**
 * Read a boolean custom property by name.
 *
 * Tiled stores custom properties as `[{ name, type, value }]`, so this is a lookup in DATA. It
 * deliberately does not fall back to the object's `name` or `type` field when the property is
 * absent — a fallback would make vault 3.3's rename test pass while the parser still keyed off a
 * name in the case that actually matters, the one where the data is missing.
 */
function boolProperty(object: TiledObject, name: string): boolean {
  if (!Array.isArray(object.properties)) {
    return false;
  }
  for (const entry of object.properties as TiledProperty[]) {
    if (isRecord(entry) && entry.name === name) {
      return entry.value === true;
    }
  }
  return false;
}

/** Every object on every object layer, flattened. Layer names are never consulted (vault 3.3). */
function allObjects(layers: TiledLayer[]): TiledObject[] {
  const objects: TiledObject[] = [];
  for (const layer of layers) {
    if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
      objects.push(...(layer.objects as TiledObject[]));
    }
  }
  return objects;
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

  // The spawn must stand ON something.
  //
  // This check previously lived ONLY in tests/unit/tilemap-data.test.ts, which the qa-expert gate
  // owner (brief 2) correctly called a production/test divergence: criterion 3.3's unit gate was
  // asserting a stricter property than BootScene actually enforced, so a hand-authored or
  // editor-saved level whose spawn floated over a gap would be waved through at runtime. Moving it
  // here makes the boot gate and the unit gate the same rule, which is the whole point of there
  // being one parser.
  const standing = solids.some(
    (solid) =>
      solid.y === spawn.y &&
      (spawn.x as number) > (solid.x as number) &&
      (spawn.x as number) < (solid.x as number) + (solid.width as number),
  );
  if (!standing) {
    return `spawn (${spawn.x}, ${spawn.y}) is not on top of any solid — the player starts falling`;
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
  const solids: Rect[] = objects
    .filter((object) => boolProperty(object, 'solid'))
    .map((object) => ({
      x: object.x as number,
      y: object.y as number,
      w: object.width as number,
      h: object.height as number,
    }));

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
  };
}
