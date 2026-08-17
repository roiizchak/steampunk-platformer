// level-01 geometry. Stated entirely in TILES; `levelBuilder.mjs` multiplies by `TILE_SIZE`.
//
// These are the numbers the single-target `make-greybox-level.mjs` held as module constants, moved
// here unchanged when Phase 8 split that script. Regenerating produced a byte-identical `.tmj`, which
// is what proved the split behaviour-preserving.
//
// ⚠️ Phase 8 REDESIGNS this level — the owner's words were that it "was just something I made, I did
// not actually plan it". What is here is throwaway grey-box: 197 of 1980 cells painted, no exit, and
// no way to finish. It is kept intact for one commit so the builder can be proved against it, and
// because level-01's exact geometry is still coordinate-pinned by Phase 3, 4 and 6 gates that have to
// be migrated first (see docs/qa/phase-08-levels.md).

import { GROUND_TOP_ROW_01 as GROUND_TOP_ROW } from './shared.mjs';

/**
 * ## Phase 4 re-author — the jump got shorter, so the level had to move
 *
 * At `TILE_SIZE` 32 this was 180 x 48 tiles with platforms a 224 px rise apart. That rise is
 * **7 tiles**, and the Phase 4 re-tune puts the measured apex at **4.68 tiles** — so every raised
 * platform in the old layout became unreachable the moment the scale changed. Nothing would have
 * caught that: the level still validates, still draws, and the player simply cannot get up.
 *
 * The layout is also composed for the reference art the user is matching: stacked ledges at two
 * heights with short hops between them, rather than one long flat floor.
 *
 * ⚠️ The original file claimed every distance here was "checked against the measured jump at the
 * bottom of this file". **There was no such check** — the only self-check was the view-size one, and
 * the jump-reach gate lives in `tilemap-data.test.ts`. Phase 8 makes that claim true for real, in
 * `tests/unit/level-reach.test.ts`, by proving each transition with the actual sim.
 */
export const level01 = {
  id: 'level-01',

  widthTiles: 90, // 4.5 screens wide
  heightTiles: 22, // 1.96 screens tall

  /**
   * Two rows of fill below the walking surface, not four.
   *
   * Four rows put 384 px of buried masonry on screen — **36 % of the viewport**, a solid brown band
   * across the bottom third. The reference art has platforms standing over shadow, and the fill is
   * not the subject of the shot. The camera clamps to the level's bottom, so the fill depth IS the
   * amount of it the player sees; two rows lands it at ~18 %.
   */
  groundTopRow: GROUND_TOP_ROW,

  // A 3-tile hole in the ground. The first jump the level actually requires.
  gaps: [{ fromCol: 40, toCol: 42 }],

  // 3 rows tall: blocks a run, can be jumped. The Phase 3 e2e drives the player into its left face
  // and asserts they settle at exactly `wall.x - 66`, so this wall is load-bearing for that spec.
  walls: [{ col: 34, topRow: 17, rows: 3 }],

  /**
   * Stacked ledges. Rises are 4 tiles (384 px) against a 4.68-tile apex, and the horizontal hops
   * are 2 tiles (192 px) against the 2.25 tiles the character covers by apex at top speed — so each
   * one is reachable while rising, not only at the top of the arc.
   */
  platforms: [
    { fromCol: 48, toCol: 53, row: 16 },
    { fromCol: 56, toCol: 61, row: 12 },
    { fromCol: 64, toCol: 69, row: 16 },
  ],

  /**
   * 🔴 **Narrowed from four columns to two on 2026-08-14: 384 px was impassable at any speed.**
   *
   * `tests/unit/level-traversal.test.ts` measures this with the real sim over the shipped `.tmj`, and
   * the sweep is unambiguous — at 384 px the run-up takes 20 hp and stops at x 2554, and no take-off
   * point or approach speed clears it. It had been that way since Phase 4's 3x rescale, and nothing
   * caught it because the only reach gate in the suite was **vertical** (`tilemap-data.test.ts` asks
   * whether platforms are within the apex, which cannot see a gap too wide to cross).
   *
   * **This is the ONE place to change it.** The `hazard: true` rectangle is DERIVED from this array by
   * the builder, which is what makes "the drawn spikes hurt" true by construction — Phase 4 shipped
   * the run drawn and harmless from two lists that drifted. Editing the `.tmj` by hand puts that drift
   * straight back: the first attempt at this narrowing did exactly that, and `level-entities.test.ts`'s
   * gid-agreement test caught it immediately (gid 13 drawn both inside and outside the hazard, i.e.
   * two columns of spikes you could walk through).
   *
   * 240 px was measured as the width where a run-up is REQUIRED but possible. It was not taken: the
   * window is 12 px wide (252 already fails), which exists only at exactly top speed and would break
   * silently on the next tuning pass. At 192 the strip costs a deliberate jump input and walking into
   * it still hurts. Both facts are asserted in `level-traversal.test.ts`.
   */
  spikes: [{ fromCol: 24, toCol: 25, row: GROUND_TOP_ROW - 1 }],

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
  enemies: [
    { slug: 'brass-sentry', fromCol: 50, toCol: 51, standRow: 16, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 68, toCol: 79, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
  ],

  /**
   * Gear pickups — Phase 6. Authored as POINTS at the centre of a named cell.
   *
   * Placed against the layout above rather than scattered, so each one is a reason to do something
   * the level already asks for: three along the opening run to teach what a gear is, one **over the
   * ground gap** so the first real jump is rewarded, and one on each of the three stacked ledges so
   * the climb has a payoff at every height.
   *
   * The row for each is one tile ABOVE the surface it belongs to. The player's box is 48 local units
   * — 288 px, three tiles — measured up from the feet, so a gear one tile above a surface sits inside
   * the body of a player standing on it.
   *
   * `tests/unit/level-entities.test.ts` re-derives these from the shipped `.tmj`: in bounds, not
   * buried in a solid, not duplicated. **It does NOT test reachability**, which nothing does — a gear
   * somewhere unjumpable would ship. Said out loud because this comment cited `tilemap-data.test.ts`
   * until the code-reviewer gate owner found that file has no gear assertions *(vault C9)*.
   * Phase 8's `level-reach.test.ts` closes it: every gear must sit over a reachable segment.
   */
  gears: [
    { col: 8, row: 19 }, // opening run, flat ground
    { col: 14, row: 19 },
    { col: 22, row: 19 },
    { col: 41, row: 18 }, // over the 3-tile ground gap — the reward for the jump
    { col: 50, row: 15 }, // first ledge (row 16)
    { col: 58, row: 11 }, // top ledge (row 12)
    { col: 66, row: 15 }, // third ledge (row 16)
  ],

  // 6 tiles in, leaving a 28-tile flat run-up before the wall. That run is load-bearing for the
  // inherited Phase 2 specs: one walks until |vx| saturates (5 ticks) and one asserts the player
  // lands back at exactly its starting y.
  spawnCol: 6,
};
