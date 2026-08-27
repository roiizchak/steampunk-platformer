// level-04 geometry, in TILES. See `shared.mjs` for the measured limits every layout sits inside.
//
// Step 4 of 5. The rise and the gap are already at the ceiling level-03 took them to — 384 px against a
// 413 px apex, 288 px of gap — so this step adds VOLUME around them: longer (144 tiles), three 3-tile
// gaps instead of two, 672 px of spikes, five enemies, a 6-row ground stack.
//
// 🔴 The dials that do not move are named on purpose. Vault 8.3 says cross-level absolute-stat
// comparisons are suspect, and `level-ramp.test.ts` allows a plateau in the directional set — because
// pushing a measured limit past its own measurement is not difficulty, it is an unplayable level with a
// rising number attached.

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

const GROUND_TOP_ROW = 20;

export const level04 = {
  id: 'level-04',

  // 144 x 26 @ 96 px = 13824 x 2496.
  widthTiles: 144,
  heightTiles: 26,

  groundTopRow: GROUND_TOP_ROW,

  gaps: [
    { fromCol: 34, toCol: 36 },
    { fromCol: 74, toCol: 76 },
    { fromCol: 106, toCol: 108 },
  ],

  walls: [
    { col: 26, topRow: 17, rows: 3, cols: 2 },
    // 🔴 6 wide, not 2. Cols 128-131 were a ground-level PIT between this wall and the platform at
    // 132, and cols 123-125 another between the platform at 114 and this wall. Both sat where a
    // descent lands, so spiking them was unavoidable damage. Filled by owner decision — see the
    // widened platform below for the other half.
    { col: 126, topRow: 17, rows: 3, cols: 6 },
  ],

  // Two ziggurats and two shelves. Steps stay 4 tiles: 20 -> 16 -> 12 -> 16 -> 20.
  platforms: [
    { fromCol: 42, toCol: 48, row: 16, rows: 4 },
    { fromCol: 49, toCol: 55, row: 12, rows: 8 },
    { fromCol: 56, toCol: 62, row: 16, rows: 4 },
    { fromCol: 80, toCol: 86, row: 16, rows: 4 },
    { fromCol: 87, toCol: 93, row: 12, rows: 8 },
    { fromCol: 94, toCol: 100, row: 16, rows: 4 },
    { fromCol: 114, toCol: 125, row: 16, rows: 4 },
    { fromCol: 132, toCol: 138, row: 16, rows: 4 },
  ],

  // 7 tiles of spikes = 672 px.
  spikes: [
    { fromCol: 22, toCol: 23, row: GROUND_TOP_ROW - 1 },
    { fromCol: 63, toCol: 67, row: GROUND_TOP_ROW - 1 },
    { fromCol: 102, toCol: 103, row: GROUND_TOP_ROW - 1 },
    { fromCol: 55, toCol: 55, row: 11 },
  ],

  /**
   * ⚠️ A patrol rectangle spans `fromCol` through `toCol` INCLUSIVE, so its right edge lands on
   * `toCol + 1`, and `describeLevelProblem` tests ground containment at BOTH ends **strictly**. A beat
   * ending one column short of a gap still has its right edge ON the gap, and a beat starting on a run's
   * first column is not "inside" it. Three of these were caught on the first generation and three more on
   * the second, so every beat below starts and ends two columns clear of a gap or a mass.
   */
  enemies: [
    { slug: 'rust-scavenger', fromCol: 38, toCol: 40, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 51, toCol: 53, standRow: 12, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 69, toCol: 72, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 89, toCol: 91, standRow: 12, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 110, toCol: 112, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
  ],

  gears: [
    { col: 8, row: 19 },
    { col: 14, row: 19 },
    { col: 20, row: 19 },
    { col: 35, row: 18 },
    { col: 45, row: 15 },
    { col: 49, row: 11 },
    { col: 75, row: 18 },
    { col: 93, row: 11 },
    { col: 107, row: 18 },
    { col: 135, row: 15 },
  ],

  spawnCol: 6,

  goal: { col: 140, row: GROUND_TOP_ROW, tilesWide: 2, tilesTall: 3 },
};
