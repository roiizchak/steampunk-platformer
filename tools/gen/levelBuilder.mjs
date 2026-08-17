// The shared level builder: a declarative layout in TILES becomes a Tiled `.tmj` on disk.
//
// Split out of `make-greybox-level.mjs` in Phase 8, which was a single-target script at 399 of the
// 400 permitted lines and had to grow from one level to five. Everything here was in that file; the
// per-level geometry moved to `tools/gen/levels/level-0N.mjs` and the CLI to `make-levels.mjs`.
// The split was proved behaviour-preserving by regenerating level-01 and getting a byte-identical
// file — the layout module holds the same numbers the script held as module constants.
//
// WHY A GENERATOR AND NOT HAND-WRITTEN FILES
// A tile layer is width x height integers — level-01's is 1980, and the Phase 8 levels are larger
// and DENSER. That is not reviewable in a diff and not editable by hand without introducing an
// off-by-one nobody would ever find. The `.tmj` is the artefact and the source of truth once
// emitted — Tiled opens it, the Element Editor writes it back, and the unit suite validates the
// shipped bytes. This script exists so the geometry can be re-derived and tweaked, not so levels
// are generated at build time.
//
// WHY public/assets/levels/ AND NOT levels/
// Vite copies public/ verbatim into dist/. A root-level levels/ would be served in dev and absent
// from the shipped build, so the unit sweep would be green against a file the player never gets —
// vault 3.1's blocker, caught by the Codex plan review (P1). PRD.md's file structure was amended.
//
// THE COLLISION MODEL, AND THE ONE RULE THAT MATTERS MOST HERE
// The tile layer is ART. Collision is the object layer: rectangles carrying `solid: true`, plus
// points carrying `spawn: true` / `gear: true`, plus `hazard: true` and `enemy: "<slug>"` rects.
// Solidity is a property, never a name (vault 3.3), and rectangles are the only representation that
// can round-trip a sub-tile nudge back out of the Element Editor.
//
// 🔴 **Every collision rect below is DERIVED from the same layout constants that paint the tiles.**
// That is what makes "the drawn spikes hurt" and "the drawn floor is solid" true by construction
// rather than by a second list someone has to remember to keep in step. Phase 4 shipped a spike run
// drawn and harmless from two lists that had drifted, and `level-entities.test.ts` now gates the
// agreement by measuring which gids fall inside a hazard rect. Do not add a rect that is not
// computed from the painted geometry.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The grid comes from the runtime constants, never from a copy.
 *
 * `TILE` was a literal `32` in the original script. When `TILE_SIZE` moved to 96 that made it emit a
 * level on a grid the game does not use — a file that loads, validates and draws, at a third of the
 * size every collision rectangle assumes. Same defect Codex named for `CAMERA_ZOOM` in the Phase 3
 * plan review (P8); `tools/gen/build-world.mjs` reads it the same way for the same reason.
 */
function runtimeConstant(name) {
  const src = readFileSync(resolve(ROOT, 'src/game/constants.ts'), 'utf8');
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(src);
  if (!match) {
    throw new Error(`levelBuilder: could not read ${name} from src/game/constants.ts`);
  }
  return Number(match[1]);
}

export const TILE = runtimeConstant('TILE_SIZE');
export const VIEW_COLS = runtimeConstant('GAME_WIDTH') / TILE; // 20 at TILE 96
export const VIEW_ROWS = runtimeConstant('GAME_HEIGHT') / TILE; // 11.25 at TILE 96

// The packed sheet `tools/gen/build-world.mjs` emits: 16 tiles in a 4 x 4 grid. Declared here so
// every level's tileset block covers every gid its layer is allowed to use.
const TILESET_COLS = 4;
const TILESET_ROWS = 4;

/**
 * `GREYBOX_FILL_GID` in `src/render/groundTiles.ts`, and the ONLY gid `applySurfaceTiles` reinterprets.
 *
 * 🔴 Two consequences a dense level walks straight into, both recorded here because they are invisible
 * until something is painted:
 *
 *  1. A walkable surface painted with any OTHER gid never gets its brass leading edge. The cap rule is
 *     STYLE.md §5 RULE ONE and criterion 4.22, and `applySurfaceTiles` implements it by rewriting gid 1
 *     cells only. So walkable tops must be gid 1 and decoration goes elsewhere.
 *  2. Because `GREYBOX_FILL_GID === SURFACE_GID === 1`, a gid-1 cell with no solid above or below it
 *     becomes **a brass cap floating in the sky**. Never use gid 1 as free decoration.
 *
 * `ground-tiles.test.ts` sweeps every shipped level for (1): the top row of every solid rect, across
 * its full column span, must be gid 0 or gid 1.
 */
const FILL_GID = 1;

/** Spikes, as authored decoration in the tile layer, and the gid hazard rects are derived from. */
export const SPIKE_GID = 13;

/**
 * Solid COLUMN RUNS of ground, derived from the gaps rather than listed.
 *
 * A gap is a hole in the walking surface. The runs between them are the floor strips, and they are
 * computed once and used for BOTH the tile painting and the collision rects, so the two cannot
 * disagree. The original script hardcoded two strips around one gap; this generalises to any number
 * without changing the emitted bytes for a single-gap level.
 */
function groundRuns(widthTiles, gaps) {
  const holed = new Set();
  for (const { fromCol, toCol } of gaps) {
    for (let col = fromCol; col <= toCol; col += 1) holed.add(col);
  }
  const runs = [];
  let start = null;
  for (let col = 0; col <= widthTiles; col += 1) {
    const isGround = col < widthTiles && !holed.has(col);
    if (isGround && start === null) start = col;
    if (!isGround && start !== null) {
      runs.push({ fromCol: start, toCol: col - 1 });
      start = null;
    }
  }
  return runs;
}

/** Tiled object-property helper. One shape, so no call site hand-writes the boilerplate. */
function prop(name, value) {
  return [{ name, type: typeof value === 'string' ? 'string' : 'bool', value }];
}

/**
 * Turn a layout into the `.tmj` map object.
 *
 * The layout is stated entirely in TILES; every pixel in the output is `tiles x TILE`. That is
 * deliberate — the Phase 4 rescale changed `TILE_SIZE` from 32 to 96 and every layout expressed in
 * tiles survived it untouched, while every pixel literal would have needed hand-editing.
 */
export function buildLevel(layout) {
  const {
    id,
    widthTiles: W,
    heightTiles: H,
    groundTopRow,
    gaps = [],
    walls = [],
    platforms = [],
    spikes = [],
    enemies = [],
    gears = [],
    spawnCol,
  } = layout;

  /**
   * Vault 3.2, checked here rather than assumed: a side-scroller that cannot scroll looks identical
   * to one that works. The lesson behind the rule is a level shipped with 10 px of scroll room.
   *
   * `cameraSetup` throws on the same condition at boot, and `tilemap-data.test.ts` demands a FULL
   * viewport of horizontal travel on top of it — so a level that clears this check can still fail
   * the suite. This is the cheap early one; it fires while you are editing the layout.
   */
  if (W <= VIEW_COLS || H <= VIEW_ROWS) {
    throw new Error(
      `levelBuilder ${id}: ${W}x${H} tiles does not exceed the ` +
        `${VIEW_COLS}x${VIEW_ROWS}-tile view — the camera would have nothing to scroll to.`,
    );
  }

  const runs = groundRuns(W, gaps);
  const tiles = new Uint8Array(W * H);
  const at = (col, row) => row * W + col;

  // Painting order matters: fill, then walls, then platforms, then authored art LAST so it wins.
  for (const { fromCol, toCol } of runs) {
    for (let col = fromCol; col <= toCol; col += 1) {
      for (let row = groundTopRow; row < H; row += 1) tiles[at(col, row)] = FILL_GID;
    }
  }
  for (const { col, topRow, rows } of walls) {
    for (let row = topRow; row < topRow + rows; row += 1) tiles[at(col, row)] = FILL_GID;
  }
  for (const { fromCol, toCol, row } of platforms) {
    for (let col = fromCol; col <= toCol; col += 1) tiles[at(col, row)] = FILL_GID;
  }
  for (const { fromCol, toCol, row } of spikes) {
    for (let col = fromCol; col <= toCol; col += 1) tiles[at(col, row)] = SPIKE_GID;
  }

  // The collision strips, in world pixels, derived from the geometry painted above.
  const px = (t) => t * TILE;
  const strips = [
    ...runs.map(({ fromCol, toCol }) => ({
      x: px(fromCol),
      y: px(groundTopRow),
      w: px(toCol - fromCol + 1),
      h: px(H - groundTopRow),
    })),
    ...walls.map(({ col, topRow, rows }) => ({
      x: px(col),
      y: px(topRow),
      w: TILE,
      h: px(rows),
    })),
    ...platforms.map(({ fromCol, toCol, row }) => ({
      x: px(fromCol),
      y: px(row),
      w: px(toCol - fromCol + 1),
      h: TILE,
    })),
  ];

  /**
   * 🔴 The spawn's ground strip must be collision object index 0.
   *
   * `tests/e2e/phase-03-element-editor.spec.ts` asserts `spawnStrip === 0`: the editor selects strip 0
   * on entry, and its whole primary workflow is nudging that strip and saving. If the spawn sits on a
   * later strip, the hands-on path produces a file whose spawn is over a pit, the boot gate refuses to
   * route, and the player gets a black screen. Emitting the ground runs first satisfies it whenever the
   * spawn is on the FIRST run — asserted rather than assumed, because a layout that puts a gap left of
   * the spawn would silently break it.
   */
  const spawnRunIndex = runs.findIndex((r) => spawnCol >= r.fromCol && spawnCol <= r.toCol);
  if (spawnRunIndex !== 0) {
    throw new Error(
      `levelBuilder ${id}: the spawn at col ${spawnCol} must stand on the FIRST ground run, or ` +
        `collision object 0 is not the spawn strip and phase-03-element-editor.spec.ts goes red ` +
        `(spawn is on run ${spawnRunIndex} of ${runs.length}).`,
    );
  }

  let nextObjectId = 1;
  const objects = strips.map((s) => ({
    height: s.h,
    id: nextObjectId++,
    name: '',
    properties: prop('solid', true),
    rotation: 0,
    type: '',
    visible: true,
    width: s.w,
    x: s.x,
    y: s.y,
  }));

  objects.push({
    height: 0,
    id: nextObjectId++,
    name: '',
    point: true,
    properties: prop('spawn', true),
    rotation: 0,
    type: '',
    visible: true,
    width: 0,
    // Feet: horizontal centre of the spawn tile, standing on the ground surface.
    x: px(spawnCol) + TILE / 2,
    y: px(groundTopRow),
  });

  // One hazard rectangle per spike run, from the same array that drew the tiles.
  for (const { fromCol, toCol, row } of spikes) {
    objects.push({
      height: TILE,
      id: nextObjectId++,
      name: '',
      properties: prop('hazard', true),
      rotation: 0,
      type: '',
      visible: true,
      width: px(toCol - fromCol + 1),
      x: px(fromCol),
      y: px(row),
    });
  }

  for (const { slug, fromCol, toCol, standRow, tilesTall } of enemies) {
    const height = tilesTall * TILE;
    objects.push({
      height,
      id: nextObjectId++,
      name: '',
      properties: prop('enemy', slug),
      rotation: 0,
      type: '',
      visible: true,
      width: px(toCol - fromCol + 1),
      x: px(fromCol),
      // Tiled's `y` is the TOP, and `standRow` is the surface the feet rest on.
      y: px(standRow) - height,
    });
  }

  // Gears, as POINTS. Tiled marks a point with `point: true` and zero width/height, and
  // `describeGearProblem` refuses a rectangle: a gear's size is `GEAR_BOX` in the sim, one number for
  // the whole game, so a per-object width would be a second definition a level file could disagree
  // with. Centred in its cell, which is what makes the authored row read as "one tile above".
  for (const { col, row } of gears) {
    objects.push({
      height: 0,
      id: nextObjectId++,
      name: '',
      point: true,
      properties: prop('gear', true),
      rotation: 0,
      type: '',
      visible: true,
      width: 0,
      x: px(col) + TILE / 2,
      y: px(row) + TILE / 2,
    });
  }

  return {
    map: {
      compressionlevel: -1,
      height: H,
      infinite: false,
      layers: [
        {
          data: Array.from(tiles),
          height: H,
          id: 1,
          name: 'ground',
          opacity: 1,
          type: 'tilelayer',
          visible: true,
          width: W,
          x: 0,
          y: 0,
        },
        {
          draworder: 'topdown',
          id: 2,
          name: 'collision',
          objects,
          opacity: 1,
          type: 'objectgroup',
          visible: true,
          x: 0,
          y: 0,
        },
      ],
      nextlayerid: 3,
      nextobjectid: nextObjectId,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.11.2',
      tileheight: TILE,
      tilesets: [
        {
          /**
           * **The tileset must declare every gid the layer uses.** It said `tilecount: 1`, which was
           * survivable only while every cell was gid 1. The moment the layer carried an authored gid
           * (the spike run, gid 13) Phaser's own `AssignTileProperties` threw at PARSE time —
           * `mapData.tiles[13]` is undefined — and the throw landed inside `create()`, which leaves
           * `ready:false` with `bootError:null`. That is the hang state the whole refuse-to-route
           * design exists to prevent, reached from a level the boot gate had approved.
           *
           * These describe the real packed sheet, 4 x 4 at `TILE`, so the file is honest about what it
           * references and any gid in range parses. `gameLevelDraw.ts` throws unless the bound tileset
           * reports `firstgid` 1 and 16 tiles, so these are not free to drift.
           */
          columns: TILESET_COLS,
          firstgid: 1,
          // Relative to this file, for Tiled's benefit. Phaser binds the texture by catalog KEY in
          // GameScene.addTilesetImage, so this path is never fetched at runtime.
          image: '../tiles/industrial.png',
          imageheight: TILESET_ROWS * TILE,
          imagewidth: TILESET_COLS * TILE,
          margin: 0,
          name: 'greybox',
          spacing: 0,
          tilecount: TILESET_COLS * TILESET_ROWS,
          tileheight: TILE,
          tilewidth: TILE,
        },
      ],
      tilewidth: TILE,
      type: 'map',
      version: '1.10',
      width: W,
    },
    stats: { strips, runs, px },
  };
}

/** Write one layout to `public/assets/levels/<id>.tmj` and report what went in it. */
export function writeLevel(layout) {
  const { map, stats } = buildLevel(layout);
  const out = resolve(ROOT, `public/assets/levels/${layout.id}.tmj`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`, 'utf8');

  const { px } = stats;
  const painted = map.layers[0].data.filter(Boolean).length;
  const cells = layout.widthTiles * layout.heightTiles;
  console.log(
    `wrote ${layout.id}.tmj\n` +
      `  ${layout.widthTiles} x ${layout.heightTiles} tiles @ ${TILE}px = ` +
      `${layout.widthTiles * TILE} x ${layout.heightTiles * TILE} px\n` +
      `  ${painted}/${cells} cells painted (${((painted / cells) * 100).toFixed(1)}%)\n` +
      `  ${stats.strips.length} collision strips, spawn at ` +
      `(${px(layout.spawnCol) + TILE / 2}, ${px(layout.groundTopRow)})\n` +
      `  ${(layout.spikes ?? []).length} hazard rects, ` +
      `${(layout.enemies ?? []).map((e) => e.slug).join(' + ') || 'no enemies'}\n` +
      `  ${(layout.gears ?? []).length} gears`,
  );
  return out;
}
