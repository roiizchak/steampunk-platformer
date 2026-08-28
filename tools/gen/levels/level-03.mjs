// level-03 geometry, in TILES. See `shared.mjs` for the measured limits every layout sits inside.
//
// Step 3 of 5, and the step where the DEMANDS change rather than the volume. The widest gap goes to 3
// tiles (288 px) and the maximum rise to 4 (384 px) — both for the first time, and both close to the
// measured ceiling: 288 px of gap crosses only with a run-up, and 384 px of rise is 93 % of the 413 px
// apex. Levels 04 and 05 hold those two at the ceiling and add volume around them, because there is
// nowhere further to go without making the game unplayable.

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

export const level03 = {
  id: 'level-03',

  // 128 x 25 @ 96 px = 12288 x 2400.
  widthTiles: 128,
  heightTiles: 25,

  // 5 rows of stack.
  groundTopRow: GROUND_TOP_ROW,

  // 🔴 The first 3-tile gaps in the game. 288 px has no height to clear, which makes it a LONGER reach
  // than a 288 px hazard would be — `level-traversal.test.ts` crosses it with a run-up and not from
  // standing. Two of them, so the skill is asked for twice rather than once.
  /**
   * 🔴 The second gap moved from cols 88–90 to 94–96, and `level-completable.test.ts` is why.
   *
   * The ziggurat's last step ends at col 86, so a gap at 88 left exactly ONE tile of ground between the
   * descent and a 288 px hole — 96 px of run-up for a jump that needs a full one. The auto-player fell in
   * eleven times and never got past x 8670 of 12288. Nothing else in the suite could see it: the
   * reachability graph proves the terrain connects (it does — from a standing start on that tile the
   * jump is not provable, but the graph reaches the far side another way), the ramp table is unaffected,
   * and the stall gate is about walls rather than holes. It took a run of the whole level, end to end,
   * in the world the player gets.
   *
   * 94 leaves 7 tiles of clear ground after the descent, which is a real run-up.
   */
  gaps: [
    { fromCol: 36, toCol: 38 },
    { fromCol: 94, toCol: 96 },
  ],

  walls: [
    { col: 28, topRow: 17, rows: 3, cols: 2 },
    // 🔴 8 wide, not 3. Cols 107-111 used to be a ground-level PIT between this wall and the
    // platform at 112 — and unlike the valley at 65-69, which is jumped mass to mass from an
    // elevated walkway, this one sat where a descent lands. Owner decision was to fill it, the same
    // call made for level-02 cols 84-85 and level-04 cols 123-125 and 128-131. Filling it also
    // restores the difficulty ramp: the 480 px of derived pit spikes it would otherwise carry put
    // level-03 above both 04 and 05, and neither of those can absorb matching hazard — every one of
    // nine candidate placements was rejected by `level-hazard-free` or `level-completable`.
    { col: 104, topRow: 16, rows: 4, cols: 8 },
  ],

  // Two ziggurats and a shelf, 4-tile steps: 20 -> 16 -> 12 -> 16 -> 20. The horizontal hops stay at 1
  // tile; raising both dials on the same jump would make one transition the hardest thing in the game by
  // a wide margin, which is not a ramp but a wall.
  platforms: [
    { fromCol: 44, toCol: 50, row: 16, rows: 4 },
    { fromCol: 51, toCol: 57, row: 12, rows: 8 },
    { fromCol: 58, toCol: 64, row: 16, rows: 4 },
    { fromCol: 70, toCol: 76, row: 16, rows: 4 },
    { fromCol: 77, toCol: 83, row: 12, rows: 8 },
    { fromCol: 84, toCol: 86, row: 16, rows: 4 },
    { fromCol: 112, toCol: 118, row: 16, rows: 4 },
  ],

  /**
   * The HAND-authored spikes only. The pit at cols 65-69 used to be listed here too and is not any
   * more: `pitDetect.mjs` derives it from the geometry, and it is the only pit left in the game.
   *
   * 🔴 That is why the entry had to go rather than stay as a harmless duplicate. With both mechanisms
   * producing the same run, deleting the derivation entirely left every gate in the suite green — the
   * hand entry covered for it. A second mechanism that masks the first one failing is the exact shape
   * of false green this session exists to remove.
   */
  spikes: [
    // 🔴 Shifted one column AWAY from the wall on 2026-08-28. The owner reported *"I get stuck
    // by a hazard that I cannot see"*: the run ended 96 px short of the wall face and the player
    // is 132 px wide, so there was nowhere to stand. Land a beat late and you are pinned in the
    // spikes with a wall in front of you, taking damage you cannot see because you are standing
    // on it. The WIDTH is unchanged, so the hazard ramp totals are untouched.
    // Gated by `tests/unit/level-hazard-clearance.test.ts`.
    { fromCol: 23, toCol: 25, row: GROUND_TOP_ROW - 1 },
    { fromCol: 57, toCol: 57, row: 11 },
  ],

  /**
   * ⚠️ A patrol rectangle spans `fromCol` through `toCol` INCLUSIVE, so its right edge lands on
   * `toCol + 1`, and `describeLevelProblem` tests ground containment at BOTH ends **strictly**. A beat
   * ending one column short of a gap still has its right edge ON the gap, and a beat starting on a run's
   * first column is not "inside" it. Three of these were caught on the first generation and three more on
   * the second, so every beat below starts and ends two columns clear of a gap or a mass.
   */
  enemies: [
    { slug: 'rust-scavenger', fromCol: 40, toCol: 42, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
    { slug: 'brass-sentry', fromCol: 53, toCol: 55, standRow: 12, tilesTall: 2 },
    { slug: 'brass-sentry', fromCol: 79, toCol: 81, standRow: 12, tilesTall: 2 },
    { slug: 'rust-scavenger', fromCol: 98, toCol: 102, standRow: GROUND_TOP_ROW, tilesTall: 2.5 },
  ],

  gears: [
    { col: 8, row: 19 },
    { col: 14, row: 19 },
    { col: 20, row: 19 },
    { col: 37, row: 18 },
    { col: 47, row: 15 },
    { col: 51, row: 11 },
    { col: 83, row: 11 },
    { col: 95, row: 18 },
    { col: 115, row: 15 },
  ],

  spawnCol: 6,

  goal: { col: 124, row: GROUND_TOP_ROW, tilesWide: 2, tilesTall: 3 },
};
