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
export const TINY_MAP = {
  width: 7,
  height: 5,
  tilewidth: 16,
  tileheight: 16,
  layers: [
    { type: 'tilelayer', name: 'g', data: [...new Array(34).fill(0), 1] },
    {
      type: 'objectgroup',
      name: 'c',
      objects: [
        {
          x: 0,
          y: 64,
          width: 112,
          height: 16,
          properties: [{ name: 'solid', type: 'bool', value: true }],
        },
        {
          x: 56,
          y: 64,
          width: 0,
          height: 0,
          point: true,
          properties: [{ name: 'spawn', type: 'bool', value: true }],
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
