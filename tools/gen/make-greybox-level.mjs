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

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TILE = 32;
const W_TILES = 180;
const H_TILES = 48;

// Sized against vault 3.2: at zoom 1 the view is 1920 x 1080, so this leaves 3840 x 456 px of
// camera travel. The lesson behind that rule is a shipped side-scroller with 10px of scroll room.
const GROUND_TOP_ROW = 40; // world y = 1280
const GAP_FROM = 120; // tile columns 120..127 have no ground: an 8-tile, 256px gap
const GAP_TO = 127;

// tile column, top row, height in rows. 3 rows tall so it blocks a run but can be jumped for the
// demo. Criterion 3.2 drives the player into its left face at world x = 1920.
const WALL_COL = 60;
const WALL_TOP_ROW = 37;
const WALL_ROWS = 3;

// Raised platforms past the gap. Reachable: the published apex is 300.6px, so a 224px rise from
// the ground and a 160px rise between platforms are both comfortably inside it.
const PLATFORMS = [
  { fromCol: 134, toCol: 141, row: 33 },
  { fromCol: 147, toCol: 154, row: 28 },
  { fromCol: 160, toCol: 167, row: 33 },
];

// 10 tiles in, which leaves ~49 tiles of flat ground before the wall. That run-up is load-bearing
// for the inherited Phase 2 specs: phase-02-playground walks the player until |vx| saturates and
// phase-02-movement asserts it lands back at exactly its starting y.
const SPAWN_COL = 10;

const solid = new Uint8Array(W_TILES * H_TILES);
const at = (col, row) => row * W_TILES + col;

for (let col = 0; col < W_TILES; col += 1) {
  if (col >= GAP_FROM && col <= GAP_TO) continue;
  for (let row = GROUND_TOP_ROW; row < H_TILES; row += 1) solid[at(col, row)] = 1;
}
for (let row = WALL_TOP_ROW; row < WALL_TOP_ROW + WALL_ROWS; row += 1) {
  solid[at(WALL_COL, row)] = 1;
}
for (const { fromCol, toCol, row } of PLATFORMS) {
  for (let col = fromCol; col <= toCol; col += 1) solid[at(col, row)] = 1;
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
      columns: 1,
      firstgid: 1,
      // Relative to this file, for Tiled's benefit. Phaser binds the texture by catalog KEY in
      // GameScene.addTilesetImage, so this path is never fetched at runtime.
      image: '../placeholder-tile.png',
      imageheight: TILE,
      imagewidth: TILE,
      margin: 0,
      name: 'greybox',
      spacing: 0,
      tilecount: 1,
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
    `  ${strips.length} collision strips, spawn at (${px(SPAWN_COL) + TILE / 2}, ${px(GROUND_TOP_ROW)})`,
);
