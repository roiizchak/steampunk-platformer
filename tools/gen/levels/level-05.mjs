// level-05 geometry, in TILES. See `shared.mjs` for the measured limits every layout sits inside.
//
// The last level. 160 tiles, four 3-tile gaps, 1056 px of spikes, six enemies, a 7-row ground stack — the
// longest and densest in the game. The rise and the gap are still at the ceiling level-03 established,
// for the reason `level-04.mjs` records: a measured limit pushed past its measurement is not difficulty.
//
// What actually makes this the hardest level is that the demands OVERLAP. Level-03 asks for a 3-tile gap
// and a 4-tile climb in different places; here a scavenger patrols the floor beneath each ziggurat, so
// the climb is done with something below it and the descent is not free.
//
// `groundTopRow` is 21 rather than 20 — the walking surface sits a tile lower, so the summits reach row
// 13 with two 4-tile steps above the floor and the sky above them is taller.

// ⚠️ **Every raised mass is a SYMMETRIC stepped ziggurat**, and both halves of that are load-bearing.
//
// *Stepped down to the walking surface*: a floated block leaves a tunnel exactly the player's 288 px
// height, where their head is already against the ceiling and they cannot jump at all —
// `level-hazards.test.ts` reported a stall under one in all five levels of the first draft.
//
// *Symmetric*: a tower climbed in 4-tile steps from the left but sheer on the right is an 8-tile wall to
// anyone who walks into it from that side. Levels 04 and 05 initially PASSED the stall gate with exactly
// that shape, only because the probe 600 px back happened to land inside the next mass and was skipped —
// a coincidence, not a proof. Every tower now descends the way it rises.

const GROUND_TOP_ROW = 21;

export const level05 = {
  id: 'level-05',

  // 160 x 28 @ 96 px = 15360 x 2688.
  widthTiles: 160,
  heightTiles: 28,

  groundTopRow: GROUND_TOP_ROW,

  gaps: [
    { fromCol: 32, toCol: 34 },
    { fromCol: 68, toCol: 70 },
    { fromCol: 104, toCol: 106 },
    { fromCol: 138, toCol: 140 },
  ],

  walls: [{ col: 24, topRow: 18, rows: 3, cols: 2 }],

  // Three ziggurats and a shelf. Steps stay 4 tiles: 21 -> 17 -> 13 -> 17 -> 21.
  platforms: [
    { fromCol: 40, toCol: 46, row: 17, rows: 4 },
    { fromCol: 47, toCol: 53, row: 13, rows: 8 },
    { fromCol: 54, toCol: 60, row: 17, rows: 4 },
    { fromCol: 76, toCol: 82, row: 17, rows: 4 },
    { fromCol: 83, toCol: 89, row: 13, rows: 8 },
    { fromCol: 90, toCol: 96, row: 17, rows: 4 },
    { fromCol: 112, toCol: 118, row: 17, rows: 4 },
    { fromCol: 119, toCol: 125, row: 13, rows: 8 },
    { fromCol: 126, toCol: 132, row: 17, rows: 4 },
    { fromCol: 146, toCol: 154, row: 17, rows: 4 },
  ],

  // 11 tiles of spikes = 1056 px. (Was written as 9 / 864 and had been wrong since this list
  // last grew — Codex implementation review, finding 6. `level-ramp.test.ts` now pins the totals.)
  spikes: [
    { fromCol: 20, toCol: 22, row: GROUND_TOP_ROW - 1 },
    { fromCol: 97, toCol: 98, row: GROUND_TOP_ROW - 1 },
    { fromCol: 100, toCol: 101, row: GROUND_TOP_ROW - 1 },
    { fromCol: 134, toCol: 136, row: GROUND_TOP_ROW - 1 },
    { fromCol: 53, toCol: 53, row: 12 },
  ],

  /**
   * ⚠️ A patrol rectangle spans `fromCol` through `toCol` INCLUSIVE, so its right edge lands on
   * `toCol + 1`, and `describeLevelProblem` tests ground containment at BOTH ends **strictly**. A beat
   * ending one column short of a gap still has its right edge ON the gap, and a beat starting on a run's
   * first column is not "inside" it. Three of these were caught on the first generation and three more on
   * the second, so every beat below starts and ends two columns clear of a gap or a mass.
   */
  enemies: [
    { slug: 'rust-scavenger', fromCol: 36, toCol: 38, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 49, toCol: 51, standRow: 13, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 72, toCol: 74, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 85, toCol: 87, standRow: 13, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 108, toCol: 110, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 149, toCol: 151, standRow: 17, tilesTall: 2 },
  ],

  gears: [
    { col: 8, row: 20 },
    { col: 13, row: 20 },
    { col: 18, row: 20 },
    { col: 33, row: 19 },
    { col: 43, row: 16 },
    { col: 47, row: 12 },
    { col: 69, row: 19 },
    { col: 89, row: 12 },
    { col: 105, row: 19 },
    { col: 122, row: 12 },
    { col: 153, row: 16 },
  ],

  spawnCol: 6,

  goal: { col: 156, row: GROUND_TOP_ROW, tilesWide: 2, tilesTall: 3 },
};
