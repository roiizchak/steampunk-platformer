// level-02 geometry, in TILES. See `shared.mjs` for the measured limits every layout sits inside.
//
// Step 2 of 5 on the ramp. What rises from level-01: length (96 -> 112 tiles), hazard total (192 ->
// 288 px), enemy count (2 -> 3), ground depth (3 -> 4 rows). What deliberately does NOT rise yet: the
// maximum rise stays 3 tiles and the widest gap stays 2, because a ramp that moves every dial at once
// teaches nothing — the second level adds volume, not new demands.
//
// 🔴 Unlike level-01 this file has no e2e coordinate pins, and the freedom is real: no camera-clamp
// window, no drawn-tile cells, no exact wall-stop x. The gates it must satisfy are the general ones —
// every rise inside the apex, every hazard reachable on foot, no enemy at an inescapable stall, the
// reachability graph, and its place in the ramp.

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

export const level02 = {
  id: 'level-02',

  // 112 x 24 @ 96 px = 10752 x 2304.
  widthTiles: 112,
  heightTiles: 24,

  // 4 rows of stack. No camera pin here, so the floor can read heavier than level-01's.
  groundTopRow: GROUND_TOP_ROW,

  // Two 2-tile holes rather than one. The same demand, twice — which is what "more of the same" means
  // on this step of the ramp.
  gaps: [
    { fromCol: 38, toCol: 39 },
    { fromCol: 72, toCol: 73 },
  ],

  walls: [
    { col: 30, topRow: 17, rows: 3, cols: 2 },
    { col: 82, topRow: 17, rows: 3, cols: 2 },
  ],

  // Two ziggurats, 3-tile steps: 20 -> 17 -> 14 -> 17 -> 20.
  platforms: [
    { fromCol: 44, toCol: 50, row: 17, rows: 3 },
    { fromCol: 51, toCol: 57, row: 14, rows: 6 },
    { fromCol: 58, toCol: 64, row: 17, rows: 3 },
    { fromCol: 86, toCol: 92, row: 17, rows: 3 },
    { fromCol: 93, toCol: 99, row: 14, rows: 6 },
    { fromCol: 100, toCol: 106, row: 17, rows: 3 },
  ],

  // 3 tiles of spikes (288 px): one 2-tile strip on the ground and one single on a summit, so the climb
  // has a cost as well as a gear.
  spikes: [
    { fromCol: 24, toCol: 25, row: GROUND_TOP_ROW - 1 },
    { fromCol: 27, toCol: 28, row: GROUND_TOP_ROW - 1 },
    { fromCol: 65, toCol: 67, row: GROUND_TOP_ROW - 1 },
    { fromCol: 56, toCol: 56, row: 13 },
  ],

  /**
   * ⚠️ A patrol rectangle spans `fromCol` through `toCol` INCLUSIVE, so its right edge lands on
   * `toCol + 1`, and `describeLevelProblem` tests ground containment at BOTH ends **strictly**. A beat
   * ending one column short of a gap still has its right edge ON the gap, and a beat starting on a run's
   * first column is not "inside" it. Three of these were caught on the first generation and three more on
   * the second, so every beat below starts and ends two columns clear of a gap or a mass.
   */
  enemies: [
    { slug: 'rust-scavenger', fromCol: 33, toCol: 36, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 59, toCol: 63, standRow: 17, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 76, toCol: 78, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
  ],

  gears: [
    { col: 8, row: 19 },
    { col: 14, row: 19 },
    { col: 20, row: 19 },
    { col: 38, row: 18 },
    { col: 47, row: 16 },
    { col: 56, row: 12 },
    { col: 72, row: 18 },
    { col: 96, row: 12 },
  ],

  spawnCol: 6,

  // Past the second ziggurat, so the climb is the last thing asked for rather than a detour.
  goal: { col: 108, row: GROUND_TOP_ROW, tilesWide: 2, tilesTall: 3 },
};
