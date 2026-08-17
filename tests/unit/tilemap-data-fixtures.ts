/**
 * Fixtures for tilemap-data.test.ts, extracted when that file crossed 400 lines.
 *
 * DATA AND SETUP ONLY — no `expect` lives here. See tilemap-data.test.ts's own header for why
 * these globs read `public/assets/levels/` rather than a fixture copy (vault 3.1).
 */

import { CAMERA_ZOOM, GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE, TILE_SIZE } from '../../src/game/constants';
import { parseLevel } from '../../src/game/tilemap';
import { PLAYER_BOX } from '../../src/sim/player';

export const SHIPPED = import.meta.glob('../../public/assets/levels/*.tmj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const BAD_LEVELS = import.meta.glob('../fixtures/bad-levels/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const CATALOG = import.meta.glob('../../public/assets/index.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const PIPELINE_DOC = import.meta.glob('../../docs/ASSET-PIPELINE.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/** `../../public/assets/levels/level-01.tmj` -> `level-01`. */
export function idOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1).replace(/\.tmj$/, '');
}

export const SHIPPED_ENTRIES = Object.keys(SHIPPED).map((path) => [idOf(path), SHIPPED[path]!] as const);

/**
 * The one rejection reason the vault 3.3 tests are about.
 *
 * Pinned this precisely because mutation M20 survived a `/solid/i` assertion: a parser that
 * invented solidity from object names produced a DIFFERENT rejection ("solid #6 has a non-positive
 * size", from the zero-size spawn point it had just decided was solid) which also contains the
 * word. An assertion that accepts the right answer for the wrong reason is not a gate.
 */
export const NO_SOLID_PROPERTY = /no object carries the `solid` property/;

/** The shipped level, parsed once, so published-number checks can be derived rather than typed. */
export const LEVEL_01 = parseLevel(
  'level-01',
  JSON.parse(SHIPPED['../../public/assets/levels/level-01.tmj']!) as unknown,
);

/**
 * A synthetic map with dimensions distinct from the shipped level (vault 3.1's "second map"
 * argument, in tilemap-data.test.ts's own words): a single-file sweep cannot tell "derived" from
 * "constant", so the hardcode test needs a map `parseLevel` was never tuned against.
 */
/**
 * ⚠️ **Grown in Phase 8 from 7 x 5 @ 16 px to 13 x 9 @ 48 px** — 112 x 80 px to 624 x 432 px.
 *
 * It had to grow, and the reason is worth keeping: the old map was **112 px wide and the player is
 * 132 px wide**. Phase 8's goal rule refuses an exit that overlaps the body of a player standing at the
 * spawn, and in a map narrower than the player *every* position overlaps it — so no valid goal could be
 * placed and the fixture could not carry the field `LevelData` now requires.
 *
 * The dimensions are still deliberately unlike the shipped level's (13 x 9 @ 48 against 90 x 22 @ 96),
 * which is all this fixture's job requires. What it must NOT be is a copy of the shipped numbers, and
 * it is not.
 */
export const TINY_MAP = {
  width: 13,
  height: 9,
  tilewidth: 48,
  tileheight: 48,
  layers: [
    // 13 x 9 = 117 cells. One painted cell is enough — `describeLevelProblem` only refuses an
    // ALL-zero tile layer, and the extent is measured from the header, never from the data.
    { type: 'tilelayer', name: 'g', data: [...new Array(116).fill(0), 1] },
    {
      type: 'objectgroup',
      name: 'c',
      objects: [
        // The floor: full width, top at row 8 (y 384), one row deep.
        {
          x: 0,
          y: 384,
          width: 624,
          height: 48,
          properties: [{ name: 'solid', type: 'bool', value: true }],
        },
        // Feet at (96, 384) — standing on the floor, two tiles in.
        {
          x: 96,
          y: 384,
          width: 0,
          height: 0,
          point: true,
          properties: [{ name: 'spawn', type: 'bool', value: true }],
        },
        // The exit: a 96 x 144 doorway standing on the floor at x 480, well clear of the standing
        // player's box (which spans x 30..162), and not swallowed by the floor because its top is
        // above the floor's surface.
        {
          x: 480,
          y: 240,
          width: 96,
          height: 144,
          properties: [{ name: 'goal', type: 'bool', value: true }],
        },
      ],
    },
  ],
};

/**
 * Criterion 3.6/3.6b's published-number table — one `[what, needle]` pair per row. The needle is
 * built from the SAME runtime constants the doc is checked against, never a hand-typed number, so
 * a re-tune moves this table with it instead of drifting from the file that actually loads.
 */
export function docExpectations(): [string, string][] {
  return [
    ['grid cell size', `Grid cell size ${TILE_SIZE} × ${TILE_SIZE} px`],
    ['camera zoom', `Camera zoom ${CAMERA_ZOOM}`],
    ['viewport', `Viewport / world view ${GAME_WIDTH} × ${GAME_HEIGHT} px`],
    ['world extent', `World extent (level-01) ${LEVEL_01.widthPx} × ${LEVEL_01.heightPx} px`],
    [
      'character collision box',
      `Character collision box ${PLAYER_BOX.w * RENDER_SCALE} × ${PLAYER_BOX.h * RENDER_SCALE} px`,
    ],
    ['character render height', `Character render height ${PLAYER_BOX.h * RENDER_SCALE} px`],
    ['render scale', `Render scale RENDER_SCALE ${RENDER_SCALE}`],
  ];
}
