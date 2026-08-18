// level-01 geometry, in TILES. `levelBuilder.mjs` multiplies by `TILE_SIZE`.
//
// ⚠️ **This level has less design freedom than any other in the game**, and the constraints are not
// visible from here. Roughly nineteen Phase 1–7 e2e assertions read exact coordinates out of the
// running game against `level-01` specifically, and they cannot be repointed at a fixture because their
// subject is the live browser reading the shipped file.
//
// `tests/unit/level-01-contract.test.ts` encodes all of them and runs in milliseconds. **Change
// anything here and run it before running the browser.** The four that are exact:
//
//  1. cols 24–27 at row 20 must be walkable tops, and row 21 must be buried under them —
//     `phase-04-assets-tiles.spec.ts` is the only spec in the repo that reads a DRAWN tile index.
//  2. col 34 must carry a solid standing on the ground, so the cell beneath it stays brick. Without
//     that discriminating cell the four above pass on a mutant that caps every tile unconditionally.
//  3. the first raised solid right of spawn must stop a right-held player at exactly `wall.x - 66`.
//  4. the spawn's ground run must be collision object 0 — the Element Editor selects strip 0 on entry.
//
// Phase 7's version of this level is frozen at `tests/fixtures/levels/level-01-phase07.tmj`, because
// four assertions probe shapes it happens to contain rather than describing what ships.

import { CLEAN_RUN_TILES, GROUND_TOP_ROW_01 as GROUND_TOP_ROW } from './shared.mjs';

/** The pinned wall — see note 3 above. Its column is read by `phase-04`'s discriminating cell too. */
const WALL_COL = 34;

export const level01 = {
  id: 'level-01',

  // 96 x 23 @ 96 px = 9216 x 2208. Grown from Phase 7's 90 x 22 (8640 x 2112): "bigger" was the
  // owner's decision, and the extra row goes into the ground stack rather than the sky.
  widthTiles: 96,
  heightTiles: 23,

  /**
   * A 3-row ground stack — 16 % of the level painted, against Phase 7's 9.9 %.
   *
   * 🔴 The depth is bounded on BOTH sides and the upper bound is the tight one. The camera's climb to
   * come off its bottom clamp is `540 - groundDepth * 96`; at 5 rows that is 60 px and at 6 it goes
   * negative, which means the camera starts unclamped and `phase-03-tilemap.spec.ts`'s vertical-follow
   * assertion has nothing to observe. 3 rows leaves 252 px of climb against a 413 px apex — margin in
   * both directions. See `shared.mjs`.
   */
  groundTopRow: GROUND_TOP_ROW,

  // One 2-tile hole, past the clean opening run. The first jump the level requires.
  gaps: [{ fromCol: 40, toCol: 41 }],

  // Two columns thick, so it reads as masonry rather than a line. `x` is unchanged at col 34, which is
  // what notes 2 and 3 above depend on.
  walls: [{ col: WALL_COL, topRow: 17, rows: 3, cols: 2 }],

  /**
   * 🔴 **Stepped masses that reach the ground — no overhangs.** The first draft floated the middle block
   * with three rows of clearance beneath it, which is exactly the player's 288 px height, and
   * `level-hazards.test.ts` reported a stall under it in ALL FIVE levels: the player fits in the tunnel
   * but their head is already against the ceiling, so they cannot jump at all, and the block they need to
   * climb is unclimbable from there — with an enemy 90 px away.
   *
   * A mass whose fill runs down to the walking surface has no such tunnel by construction, it paints
   * more cells, and `applySurfaceTiles` caps each step's top row and bricks the rest. That is the dense
   * look and the safe geometry in one decision. Rises are stated per level.
   */
  platforms: [
    { fromCol: 48, toCol: 54, row: 17, rows: 3 },
    { fromCol: 55, toCol: 61, row: 14, rows: 6 },
    { fromCol: 62, toCol: 68, row: 17, rows: 3 },
  ],

  /**
   * 192 px, two tiles, at cols 24–25.
   *
   * The width is measured, not chosen: 216 px clears standing, 240 needs a run-up, 252 is impassable —
   * a 12 px window that exists only at exactly top speed and would break on the next tuning pass. At
   * 192 the strip costs a deliberate jump and walking into it hurts, both asserted with the real sim.
   *
   * **This is the ONE place to change it.** The `hazard: true` rect is DERIVED from this array, which is
   * what makes "the drawn spikes hurt" true by construction. Phase 4 shipped the run drawn and harmless
   * from two lists that had drifted.
   */
  spikes: [{ fromCol: 24, toCol: 25, row: GROUND_TOP_ROW - 1 }],

  /**
   * A rectangle says all of it: its horizontal span IS the patrol beat, its bottom edge is where the
   * feet rest, `tilesTall` is the authored sprite height — sentry 2 tiles, scavenger 2.5, player 3.
   * Those three being distinct is a readability decision from ASSET-PIPELINE.md §0a, taken before a
   * prompt was written, so silhouette alone separates them at true sprite size.
   *
   * Both beats sit strictly inside a ground strip; `describeLevelProblem` checks BOTH ends, so a patrol
   * authored over the gap refuses to boot rather than walking on air.
   */
  enemies: [
    { slug: 'brass-sentry', fromCol: 57, toCol: 59, standRow: 14, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 78, toCol: 88, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
  ],

  /**
   * Gears, authored as POINTS at a cell centre, each one a reason to do something the level already
   * asks for. Three on the opening run to teach what a gear is — 🔴 the first two must be collectable by
   * holding ArrowRight ALONE, because `hudHelpers.ts` presses no other key and waits 20 s. One over the
   * gap, so the first real jump pays. One on each mass, so the climb pays at every height.
   *
   * A gear's row is one or two tiles above the surface it belongs to: the player's box is 288 px — three
   * tiles — measured up from the feet, so it sits inside the body of someone standing there.
   */
  gears: [
    { col: 8, row: 19 },
    { col: 14, row: 19 },
    { col: 22, row: 19 },
    { col: 40, row: 18 },
    { col: 51, row: 16 },
    { col: 61, row: 13 },
    { col: 65, row: 16 },
  ],

  // Col 6 leaves CLEAN_RUN_TILES of flat ground before anything happens, and puts the spawn at x 624 —
  // inside half a viewport, which is what makes the camera LEFT-clamp and `view.x === 0` observable.
  spawnCol: 6,

  /**
   * The exit. 2 x 3 tiles = 192 x 288 px against a 132 x 288 player, so the doorway is exactly one
   * character tall and about 1.45 wide — a gate a person walks through *(vault 8.4: anchor prop scale to
   * a human figure)*. `level-goal.test.ts` bounds it on both sides, so a 20-tile archway fails too.
   *
   * Col 90, past the scavenger's beat, so the last thing the level asks is getting by it. 8016 px from
   * the spawn — far over the one-viewport minimum, and off-screen from the start, so "completable" is a
   * claim about crossing the level rather than about touching something nearby.
   */
  goal: { col: 90, row: GROUND_TOP_ROW, tilesWide: 2, tilesTall: 3 },

  /** Used by `level-01-contract.test.ts`'s clean-run assertion; see `shared.mjs`. */
  cleanRunTiles: CLEAN_RUN_TILES,
};
