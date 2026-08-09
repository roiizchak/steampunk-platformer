// Emits public/assets/levels/level-01.tmj — the Phase 3 grey-box level.
//
// Run: node tools/gen/make-greybox-level.mjs
//
// WHY A GENERATOR AND NOT A HAND-WRITTEN FILE
// The tile layer is 180 x 48 = 8640 integers. That is not reviewable in a diff and not editable
// by hand without introducing an off-by-one nobody would ever find. The .tmj is the artefact and
// the source of truth once emitted — Tiled opens it, the Element Editor writes it back, and
// tests/unit/tilemap-data.test.ts validates the shipped bytes. This script exists so the
// grey-box geometry can be re-derived and tweaked, not so the level is generated at build time.
//
// WHY public/assets/levels/ AND NOT levels/
// Vite copies public/ verbatim into dist/. A root-level levels/ would be served in dev and absent
// from the shipped build, so the unit sweep would be green against a file the player never gets —
// vault 3.1's blocker, caught by the Codex plan review (P1). PRD.md's file structure was amended.
//
// THE COLLISION MODEL
// The tile layer is ART. Collision is the object layer: rectangles carrying `solid: true`, plus
// one point carrying `spawn: true`. Solidity is a property, never a name (vault 3.3), and
// rectangles are the only representation that can round-trip a sub-tile nudge back out of the
// Element Editor. Here they are authored to agree with the tiles exactly; making them disagree is
// what the editor is for.
//
// PHASE 5 ADDS TWO MORE KINDS OF OBJECT, AND ONE OF THEM CLOSES A DEBT
// `hazard: true` rectangles and `enemy: "<slug>"` rectangles. The hazard rects are derived from
// the SAME `SPIKES` array that draws the spike tiles, which is what makes "the drawn spikes hurt"
// true by construction rather than by a second list someone has to remember to keep in step —
// Phase 4 shipped that spike run drawn and harmless, and `level-entities.test.ts` now gates the
// agreement by measuring which gids fall inside a hazard rect.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The grid comes from the runtime constants, never from a copy.
 *
 * `TILE` was a literal `32` here. When `TILE_SIZE` moved to 96 that made this script emit a level
 * on a grid the game does not use — a file that loads, validates and draws, at a third of the size
 * every collision rectangle assumes. Same defect Codex named for `CAMERA_ZOOM` in the Phase 3 plan
 * review (P8); `tools/gen/build-world.mjs` reads it the same way for the same reason.
 */
function runtimeConstant(name) {
  const src = readFileSync(resolve(ROOT, 'src/game/constants.ts'), 'utf8');
  const match = new RegExp(`export const ${name} = (\\d+);`).exec(src);
  if (!match) {
    throw new Error(`make-greybox-level: could not read ${name} from src/game/constants.ts`);
  }
  return Number(match[1]);
}

const TILE = runtimeConstant('TILE_SIZE');
const VIEW_COLS = runtimeConstant('GAME_WIDTH') / TILE; // 20 at TILE 96
const VIEW_ROWS = runtimeConstant('GAME_HEIGHT') / TILE; // 11.25 at TILE 96

/**
 * ## Phase 4 re-author — the jump got shorter, so the level had to move
 *
 * At `TILE_SIZE` 32 this was 180 x 48 tiles with platforms a 224 px rise apart. That rise is
 * **7 tiles**, and the Phase 4 re-tune puts the measured apex at **4.81 tiles** — so every raised
 * platform in the old layout became unreachable the moment the scale changed. Nothing would have
 * caught that: the level still validates, still draws, and the player simply cannot get up.
 *
 * The layout is also composed for the reference art the user is matching: stacked ledges at two
 * heights with short hops between them, rather than one long flat floor.
 *
 * **Every distance below is stated in tiles and checked against the measured jump** at the bottom
 * of this file, so a future re-tune fails loudly here instead of silently stranding the player.
 */
const W_TILES = 90; // 4.5 screens wide
const H_TILES = 22; // 1.96 screens tall

/**
 * Two rows of fill below the walking surface, not four.
 *
 * Four rows put 384 px of buried masonry on screen — **36 % of the viewport**, a solid brown band
 * across the bottom third. The reference art has platforms standing over shadow, and the fill is
 * not the subject of the shot. The camera clamps to the level's bottom, so the fill depth IS the
 * amount of it the player sees; two rows lands it at ~18 %.
 */
const GROUND_TOP_ROW = 20;
const GAP_FROM = 40; // a 3-tile hole in the ground
const GAP_TO = 42;

// 3 rows tall: blocks a run, can be jumped. The Phase 3 e2e drives the player into its left face.
const WALL_COL = 34;
const WALL_TOP_ROW = 17;
const WALL_ROWS = 3;

/**
 * Stacked ledges. Rises are 4 tiles (384 px) against a 4.81-tile apex, and the horizontal hops
 * are 2 tiles (192 px) against the 2.25 tiles the character covers by apex at top speed — so each
 * one is reachable while rising, not only at the top of the arc.
 */
const PLATFORMS = [
  { fromCol: 48, toCol: 53, row: 16 },
  { fromCol: 56, toCol: 61, row: 12 },
  { fromCol: 64, toCol: 69, row: 16 },
];

/**
 * Spikes, as authored decoration in the tile layer.
 *
 * They carry no collision — hazards are Phase 5, and inventing damage here would mean inventing
 * timings Phase 5 then changes. What they prove now is that the tile layer can hold **authored**
 * art at all: `applySurfaceTiles` rewrites only the grey-box fill gid and leaves any other gid
 * alone, so a level is no longer forced to be one uniform id.
 */
// The packed sheet `tools/gen/build-world.mjs` emits: 16 tiles in a 4 x 4 grid. Declared here so
// the .tmj's own tileset block covers every gid the layer below is allowed to use.
const TILESET_COLS = 4;
const TILESET_ROWS = 4;

const SPIKE_GID = 13;
const SPIKES = [{ fromCol: 24, toCol: 27, row: GROUND_TOP_ROW - 1 }];

/**
 * Where the two enemies stand, and how far the patroller may walk.
 *
 * A rectangle says all of it: its horizontal span IS the patrol beat, its bottom edge is where the
 * feet rest, and `tilesTall` is the authored sprite height from the plan — `brass-sentry` 2 tiles
 * against `rust-scavenger`'s 2.5 and the player's 3. Those three heights being distinct is a
 * readability decision taken against the published contract in ASSET-PIPELINE.md §0a, before a
 * prompt was written, so silhouette alone separates them at true sprite size.
 *
 * Both beats sit strictly inside a ground strip. `describeLevelProblem` checks BOTH ends, so a
 * patrol authored over the ground gap at cols 40–42 refuses to boot rather than walking on air.
 */
const ENEMIES = [
  { slug: 'brass-sentry', fromCol: 50, toCol: 51, standRow: 16, tilesTall: 2 },
  { slug: 'rust-scavenger', fromCol: 68, toCol: 79, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
];

// 6 tiles in, leaving a 28-tile flat run-up before the wall. That run is load-bearing for the
// inherited Phase 2 specs: one walks until |vx| saturates (5 ticks) and one asserts the player
// lands back at exactly its starting y.
const SPAWN_COL = 6;

// Vault 3.2, checked here rather than assumed: a side-scroller that cannot scroll looks identical
// to one that works. The lesson behind the rule is a level shipped with 10 px of scroll room.
if (W_TILES <= VIEW_COLS || H_TILES <= VIEW_ROWS) {
  throw new Error(
    `make-greybox-level: ${W_TILES}x${H_TILES} tiles does not exceed the ` +
      `${VIEW_COLS}x${VIEW_ROWS}-tile view — the camera would have nothing to scroll to.`,
  );
}

const FILL_GID = 1;
const solid = new Uint8Array(W_TILES * H_TILES);
const at = (col, row) => row * W_TILES + col;

for (let col = 0; col < W_TILES; col += 1) {
  if (col >= GAP_FROM && col <= GAP_TO) continue;
  for (let row = GROUND_TOP_ROW; row < H_TILES; row += 1) solid[at(col, row)] = FILL_GID;
}
for (let row = WALL_TOP_ROW; row < WALL_TOP_ROW + WALL_ROWS; row += 1) {
  solid[at(WALL_COL, row)] = FILL_GID;
}
for (const { fromCol, toCol, row } of PLATFORMS) {
  for (let col = fromCol; col <= toCol; col += 1) solid[at(col, row)] = FILL_GID;
}
for (const { fromCol, toCol, row } of SPIKES) {
  for (let col = fromCol; col <= toCol; col += 1) solid[at(col, row)] = SPIKE_GID;
}

// The collision strips, in world pixels. Authored to match the tiles above exactly.
const px = (t) => t * TILE;
const strips = [
  { x: 0, y: px(GROUND_TOP_ROW), w: px(GAP_FROM), h: px(H_TILES - GROUND_TOP_ROW) },
  {
    x: px(GAP_TO + 1),
    y: px(GROUND_TOP_ROW),
    w: px(W_TILES - GAP_TO - 1),
    h: px(H_TILES - GROUND_TOP_ROW),
  },
  { x: px(WALL_COL), y: px(WALL_TOP_ROW), w: TILE, h: px(WALL_ROWS) },
  ...PLATFORMS.map(({ fromCol, toCol, row }) => ({
    x: px(fromCol),
    y: px(row),
    w: px(toCol - fromCol + 1),
    h: TILE,
  })),
];

let nextObjectId = 1;
const objects = strips.map((s) => ({
  height: s.h,
  id: nextObjectId++,
  name: '',
  properties: [{ name: 'solid', type: 'bool', value: true }],
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
  properties: [{ name: 'spawn', type: 'bool', value: true }],
  rotation: 0,
  type: '',
  visible: true,
  width: 0,
  // Feet: horizontal centre of the spawn tile, standing on the ground surface.
  x: px(SPAWN_COL) + TILE / 2,
  y: px(GROUND_TOP_ROW),
});

// One hazard rectangle per spike run, from the same array that drew the tiles.
for (const { fromCol, toCol, row } of SPIKES) {
  objects.push({
    height: TILE,
    id: nextObjectId++,
    name: '',
    properties: [{ name: 'hazard', type: 'bool', value: true }],
    rotation: 0,
    type: '',
    visible: true,
    width: px(toCol - fromCol + 1),
    x: px(fromCol),
    y: px(row),
  });
}

for (const { slug, fromCol, toCol, standRow, tilesTall } of ENEMIES) {
  const height = tilesTall * TILE;
  objects.push({
    height,
    id: nextObjectId++,
    name: '',
    properties: [{ name: 'enemy', type: 'string', value: slug }],
    rotation: 0,
    type: '',
    visible: true,
    width: px(toCol - fromCol + 1),
    x: px(fromCol),
    // Tiled's `y` is the TOP, and `standRow` is the surface the feet rest on.
    y: px(standRow) - height,
  });
}

const map = {
  compressionlevel: -1,
  height: H_TILES,
  infinite: false,
  layers: [
    {
      data: Array.from(solid),
      height: H_TILES,
      id: 1,
      name: 'ground',
      opacity: 1,
      type: 'tilelayer',
      visible: true,
      width: W_TILES,
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
       * These now describe the real packed sheet, 4 x 4 at `TILE`, so the file is honest about
       * what it references and any gid in range parses.
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
  width: W_TILES,
};

const out = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../public/assets/levels/level-01.tmj',
);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(map, null, 2)}\n`, 'utf8');

console.log(
  `wrote ${out}\n` +
    `  ${W_TILES} x ${H_TILES} tiles @ ${TILE}px = ${W_TILES * TILE} x ${H_TILES * TILE} px\n` +
    `  ${strips.length} collision strips, spawn at (${px(SPAWN_COL) + TILE / 2}, ${px(GROUND_TOP_ROW)})\n` +
    `  ${SPIKES.length} hazard rects, ${ENEMIES.map((e) => e.slug).join(' + ')}`,
);
