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
// THE DENSE LOOK, AND WHY IT IS STRUCTURAL MASS RATHER THAN DECORATION
// Phase 8's owner decision was "dense, fully painted, bigger", keeping the 96 px grid and the 16-tile
// industrial sheet. The way that is delivered here is `walls[].cols` and `platforms[].rows` — solids
// with real thickness rather than one-tile lines — so the painted cell count rises and every painted
// cell is still backed by a collision rectangle.
//
// 🔴 That is not a stylistic preference; it is the only version of "fully painted" that survives the
// two gid traps documented at FILL_GID below. Free background decoration painted with gid 1 becomes a
// brass cap floating in the sky, and a walkable top painted with any other gid loses its cap
// altogether. Structural mass has neither failure by construction: a thick platform draws one brass
// cap on its top row and brick beneath, which is exactly the look, and `applySurfaceTiles` does all of
// it from the collision rects. Both traps are swept in `ground-tiles.test.ts`, in both directions.
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

import { levelObjects } from './levelObjects.mjs';
import { mergeSpikeRuns, pitSpikeRuns } from './pitDetect.mjs';

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
    goal,
  } = layout;

  /**
   * Every level must declare an exit. `describeGoalProblem` refuses one that does not, so catching it
   * here turns a boot refusal into a generation error with the layout's own name in it.
   *
   * `goal` is `{ col, row, tilesWide, tilesTall }` — `row` is the surface the doorway STANDS on, the
   * same convention `enemies` uses for `standRow`, so the rect is emitted upward from it.
   */
  if (goal === undefined) {
    throw new Error(
      `levelBuilder ${id}: no goal. Every level needs an exit or describeGoalProblem refuses it — ` +
        `add \`goal: { col, row, tilesWide, tilesTall }\` to the layout.`,
    );
  }

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
  /**
   * A cell index, and it REFUSES an out-of-range one.
   *
   * ⚠️ Without the guard `row * W + col` is silently wrong rather than absent: a column past `W - 1`
   * wraps onto the next row and paints a tile at the far LEFT of the level, a whole row down. The
   * layout module that did it still produces a valid `.tmj`, so nothing downstream complains — the
   * level simply has a stray tile somewhere its author never looked. A layout is data typed by hand
   * and an off-by-one in it is the likeliest mistake there is.
   */
  const at = (col, row) => {
    if (col < 0 || col >= W || row < 0 || row >= H) {
      throw new Error(
        `levelBuilder ${id}: cell (${col}, ${row}) is outside the ${W} x ${H} grid. An out-of-range ` +
          'column wraps onto the next row, so this would have painted a tile somewhere else entirely.',
      );
    }
    return row * W + col;
  };

  // Collision strips, world px. Computed BEFORE painting because the pit rule reads them, and they
  // depend only on runs/walls/platforms — never on a painted cell. Moving them up emits no new byte.
  const px = (t) => t * TILE;
  const strips = [
    ...runs.map(({ fromCol, toCol }) => ({
      x: px(fromCol),
      y: px(groundTopRow),
      w: px(toCol - fromCol + 1),
      h: px(H - groundTopRow),
    })),
    ...walls.map(({ col, topRow, rows, cols = 1 }) => ({
      x: px(col),
      y: px(topRow),
      w: px(cols),
      h: px(rows),
    })),
    ...platforms.map(({ fromCol, toCol, row, rows = 1 }) => ({
      x: px(fromCol),
      y: px(row),
      w: px(toCol - fromCol + 1),
      h: px(rows),
    })),
  ];

  // 🔴 Pit spikes are DERIVED from `strips`, never typed — `pitDetect.mjs` has the rule, the defect
  // it closes, and why a merged interval union rather than a concatenation.
  const allSpikes = mergeSpikeRuns([...spikes, ...pitSpikeRuns(strips, W, TILE, groundTopRow)]);

  // Painting order matters: fill, then walls, then platforms, then authored art LAST so it wins.
  for (const { fromCol, toCol } of runs) {
    for (let col = fromCol; col <= toCol; col += 1) {
      for (let row = groundTopRow; row < H; row += 1) tiles[at(col, row)] = FILL_GID;
    }
  }
  for (const { col, topRow, rows, cols = 1 } of walls) {
    for (let row = topRow; row < topRow + rows; row += 1) {
      for (let c = col; c < col + cols; c += 1) tiles[at(c, row)] = FILL_GID;
    }
  }
  for (const { fromCol, toCol, row, rows = 1 } of platforms) {
    for (let col = fromCol; col <= toCol; col += 1) {
      for (let r = row; r < row + rows; r += 1) tiles[at(col, r)] = FILL_GID;
    }
  }
  for (const { fromCol, toCol, row } of allSpikes) {
    for (let col = fromCol; col <= toCol; col += 1) tiles[at(col, row)] = SPIKE_GID;
  }


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

  /**
   * Everything below is converted to WORLD PIXELS here and handed to `levelObjects.mjs` as plain rects.
   *
   * That is the seam: this file owns the tile-to-pixel conversion and the layout conventions
   * (`standRow` is the surface the feet rest on; `goal.row` likewise; a gear's row is a cell centre),
   * and `levelObjects.mjs` owns what a Tiled object looks like. Neither re-derives the other's numbers.
   */
  const { objects, nextObjectId } = levelObjects({
    strips,
    spawn: { x: px(spawnCol) + TILE / 2, y: px(groundTopRow) },
    hazards: allSpikes.map(({ fromCol, toCol, row }) => ({
      x: px(fromCol),
      y: px(row),
      w: px(toCol - fromCol + 1),
      h: TILE,
    })),
    enemies: enemies.map(({ slug, fromCol, toCol, standRow, tilesTall }) => ({
      slug,
      x: px(fromCol),
      // Tiled's `y` is the TOP, and `standRow` is the surface the feet rest on.
      y: px(standRow) - tilesTall * TILE,
      w: px(toCol - fromCol + 1),
      h: tilesTall * TILE,
    })),
    gears: gears.map(({ col, row }) => ({ x: px(col) + TILE / 2, y: px(row) + TILE / 2 })),
    goal: {
      x: px(goal.col),
      // Same convention as an enemy's `standRow`: the doorway STANDS on `goal.row`.
      y: px(goal.row) - px(goal.tilesTall),
      w: px(goal.tilesWide),
      h: px(goal.tilesTall),
    },
  });

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
    stats: { strips, runs, px, hazardCount: allSpikes.length },
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
      `  ${stats.hazardCount} hazard rects, ` +
      `${(layout.enemies ?? []).map((e) => e.slug).join(' + ') || 'no enemies'}\n` +
      `  ${(layout.gears ?? []).length} gears`,
  );
  return out;
}
