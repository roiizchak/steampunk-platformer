/**
 * What a PIT is, in one place, for the generator and the shipped-bytes gate alike.
 *
 * ## The hole this closes
 *
 * `src/sim/hazards.ts` gives the world a kill plane at `heightPx`, so a **bottomless** gap in the
 * walking surface is already lethal — you fall past the floor and die. A **valley** is not: a run of
 * ground walled in by raised masses on both sides has a bottom, so falling into one costs nothing at
 * all. The owner found this by playing levels 2, 3 and 4 and reported it as *"there is a place where
 * the character can fall through tiles"*.
 *
 * Five valleys ship. **Four of them had no spikes.** The fifth — level-03 cols 65-69 — did, hand
 * typed, which is what proves the intent was always "a pit bottom carries spikes": the other four
 * were not a decision, they were an omission. Spikes were a per-level hand-written list and nothing
 * in the suite compared that list against the geometry it was supposed to cover.
 *
 * ## Why this file exists rather than four more list entries
 *
 * `levelBuilder.mjs`'s own doctrine, at its line 41: *"every collision rect below is DERIVED from
 * the same layout constants that paint the tiles… do not add a rect that is not computed from the
 * painted geometry"*. Phase 4 shipped a spike run that was drawn and harmless because two lists had
 * drifted apart. Typing four more entries would fix today's four and leave the sixth valley — the
 * one nobody has authored yet — exactly as unprotected as these were.
 *
 * So the rule is computed, and the same function that computes it is imported by
 * `tests/unit/level-pits.test.ts` to check the SHIPPED BYTES *(vault 5.3: one definition, two
 * consumers, never a near-copy that agrees on the easy cases)*.
 *
 * ## The rule, and why every clause is here
 *
 * A pit is a maximal run of columns whose walkable surface is the level's `groundTopRow`, where:
 *
 * - **the run is at least 2 columns wide** — a one-column notch is a step, not a pit, and you leave
 *   it by walking;
 * - **the column on each side is SOLID at the 2 rows immediately above the pit floor** — which is
 *   the only thing that actually stops you walking out sideways.
 *
 * ## 🔴 Two clauses, not five, and the reason that correction was forced
 *
 * This rule used to be written as five clauses, and three of them were **dead code**. It asked for
 * the neighbour's *nearest surface* to be 2 tiles higher, and separately that the neighbour existed
 * (map edge), that it was not bottomless, and that it reached the ground row. Two independent
 * reviewers found the same thing on the same day: whenever the map-edge or bottomless test would
 * have fired, the ground-reaching test fired anyway — an out-of-bounds index reads `undefined` and
 * `!undefined` is true, and a column no rectangle covers never has its flag set. **No fixture could
 * ever have discriminated them**, and three of the twelve committed fixtures were therefore proving
 * nothing while carrying names that said they were.
 *
 * Worse, the surface-height test was wrong on a case nobody had thought of. `surfaceRow` took the
 * highest rectangle in a column while `reachesGround` ORed over *every* rectangle in it, so a slab
 * floating at row 10 above a **separate** ground rectangle at row 20 read as a ten-tile wall — when
 * in fact the ground beside the pit is at the pit's own level and the player simply walks out.
 *
 * Asking "is the column solid at the rows just above the floor" says what the wall clause was always
 * trying to say, in one question instead of four. The map edge is not solid; a bottomless gap is not
 * solid; a floating platform is not solid at those rows; and neither is a slab over separate ground.
 * The exclusions are all still there — as consequences of one live rule rather than four tests of
 * which three could not fail.
 *
 * The fixtures in `tests/fixtures/pit-levels/` keep their place: they are distinct SHAPES the rule
 * must reject, and the shipped maps contain none of them, so without them the gate could not tell a
 * correct detector from a far broader one (Codex plan review round 2, finding 6). What changed is
 * the claim made about them — they are examples of the wall clause, not proofs of five separate
 * ones, and `level-pits.test.ts` no longer says otherwise.
 */

/** A one-column dip is a step you walk out of, not a pit. */
export const MIN_PIT_COLS = 2;

/**
 * How many rows above the pit floor each side must be SOLID for the pit to be inescapable sideways.
 *
 * 2 rather than 1 because a single step down is a slope you walk back up, and rather than 3 because
 * the shallowest shipped pit is 3 and a threshold set AT the observed minimum cannot tell "just deep
 * enough" from "one tile too shallow" — it has no room to be wrong in the safe direction.
 */
export const MIN_WALL_TILES = 2;

/**
 * Per-column solidity, read from collision RECTANGLES — never from the tile grid *(vault 3.3)*.
 *
 * Both callers can produce these rects cheaply and neither has to agree with the other about
 * anything else: `levelBuilder.mjs` hands over the strips it is about to emit, and the unit test
 * hands over the solids it parsed out of the shipped `.tmj`.
 *
 * ⚠️ **Half-open overlap.** A rect ending exactly at `col * tileSize` does not cover that column.
 * An inclusive test makes every mass one column wider than it is drawn, which would swallow the pit
 * beside it and report no pit at all.
 */
/**
 * ⚠️ **Assumes TILE-ALIGNED collision rectangles**, and every shipped level is generated from
 * `{ fromCol, toCol }` runs, so every one of them is.
 *
 * A rectangle overlapping a column by a single pixel marks that whole column-row solid, and
 * `Math.floor`/`Math.ceil` widen a partial row to a whole one. Codex implementation review,
 * finding 3 is right that the Element Editor can author a one-pixel intrusion. Not tightened,
 * because the tightening has to pick a threshold and every threshold is arbitrary; the honest
 * statement is the precondition, and a level that violates it is a level whose geometry needs
 * looking at rather than a detector that needs a fudge factor.
 */
export function columnProfile(rects, widthTiles, tileSize, groundTopRow) {
  const surfaceRow = new Array(widthTiles).fill(null);
  const reachesGround = new Array(widthTiles).fill(false);
  /** Every row each column has solid material in — what the wall test actually asks about. */
  const solidRows = Array.from({ length: widthTiles }, () => new Set());

  for (let col = 0; col < widthTiles; col += 1) {
    const left = col * tileSize;
    const right = left + tileSize;
    for (const r of rects) {
      if (!(r.x < right && r.x + r.w > left)) continue;
      const topRow = Math.floor(r.y / tileSize);
      const bottomRow = Math.ceil((r.y + r.h) / tileSize); // exclusive
      if (surfaceRow[col] === null || topRow < surfaceRow[col]) surfaceRow[col] = topRow;
      if (topRow <= groundTopRow && bottomRow > groundTopRow) reachesGround[col] = true;
      for (let row = topRow; row < bottomRow; row += 1) solidRows[col].add(row);
    }
  }
  return { surfaceRow, reachesGround, solidRows };
}

/**
 * Is this column a WALL for a pit floored at `groundTopRow` — can the pit not be walked out of here?
 *
 * The whole wall clause in one question, and the reason the header says two clauses rather than
 * five. Off the map has no entry at all, which excludes the level's opening stretch and the goal
 * apron; a bottomless gap has no rows; a platform floating over one is solid at row 16 and not at
 * row 19; and a slab above SEPARATE ground is solid high up and not at row 19 either — the case the
 * previous surface-height formulation got wrong.
 */
function isWall(solidRows, col, groundTopRow) {
  const rows = solidRows[col];
  if (rows === undefined) return false;
  for (let i = 1; i <= MIN_WALL_TILES; i += 1) {
    if (!rows.has(groundTopRow - i)) return false;
  }
  return true;
}

/**
 * The pits, as `{ fromCol, toCol }` column runs, left to right.
 *
 * Returns the RUN rather than a boolean or a rect so a caller can decide what to put in it — spikes
 * today, and the same shape would carry a furnace or water later without changing this rule.
 */
export function detectPits({ surfaceRow, solidRows }, groundTopRow) {
  const pits = [];
  const width = surfaceRow.length;

  for (let col = 0; col < width; col += 1) {
    if (surfaceRow[col] !== groundTopRow) continue;

    let end = col;
    while (end + 1 < width && surfaceRow[end + 1] === groundTopRow) end += 1;

    const from = col;
    const to = end;
    col = end; // the loop's own increment moves past the run

    if (to - from + 1 < MIN_PIT_COLS) continue;

    // Both sides solid at the rows just above the floor, or it is not a pit — it is ground you walk
    // off and back onto. `isWall` above lists every shape this single test excludes.
    if (!isWall(solidRows, from - 1, groundTopRow)) continue;
    if (!isWall(solidRows, to + 1, groundTopRow)) continue;

    pits.push({ fromCol: from, toCol: to });
  }
  return pits;
}

/**
 * Same-row spike runs, overlapping or merely touching, collapsed into one.
 *
 * Nothing downstream rejects overlapping hazard rectangles, and duplicates are harmless **today**
 * only because `hazardHit()` returns the first rect it matches — so two rects covering one column
 * make which-one-was-hit depend on emission order, for no benefit whatever. Merging before both the
 * painting and the object emission means the question never arises.
 *
 * Touching runs merge as well as overlapping ones: `24-25` beside `26-27` is one contiguous strip of
 * spikes on screen, and emitting it as two rects is a distinction only the file format can see.
 */
export function mergeSpikeRuns(runs) {
  const byRow = new Map();
  runs.forEach((run, order) => {
    if (!byRow.has(run.row)) byRow.set(run.row, []);
    byRow.get(run.row).push({ ...run, order });
  });

  const merged = [];
  for (const group of byRow.values()) {
    const sorted = [...group].sort((a, b) => a.fromCol - b.fromCol);
    let current = null;
    for (const run of sorted) {
      if (current && run.fromCol <= current.toCol + 1) {
        current.toCol = Math.max(current.toCol, run.toCol);
        current.order = Math.min(current.order, run.order);
      } else {
        current = { fromCol: run.fromCol, toCol: run.toCol, row: run.row, order: run.order };
        merged.push(current);
      }
    }
  }

  // Back into the order they arrived in, keyed on the EARLIEST contributor of each merged run.
  // ⚠️ Not cosmetic. Emitting in row order instead rewrote level-05 — whose geometry this rule does
  // not touch at all — by moving its summit spike to the front of the hazard list. A regeneration
  // must diff as the change it actually made, or "levels 01 and 05 come out byte-identical" stops
  // being checkable.
  return merged
    .sort((a, b) => a.order - b.order)
    .map(({ fromCol, toCol, row }) => ({ fromCol, toCol, row }));
}

/** Do two rectangles share any positive area? Half-open, so merely touching edges do not count. */
function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * Is `cell` COMPLETELY covered by the union of `rects` — not merely touched by one of them?
 *
 * 🔴 It used to be `hazards.some(h => overlaps(cell, h))`, and Codex plan review round 3, finding 6
 * is why it is not any more: *"fully covered pit floor" meant only "touched somewhere"*. A hazard one
 * pixel tall lying across the top of the pit, or one that clipped the outer edge of each end column,
 * satisfied every assertion in the suite while leaving most of the floor harmless — which is the
 * Phase 4 defect of a spike run that is drawn and does not hurt, wearing a different shape.
 *
 * Only rectangles that span the cell's full HEIGHT can contribute, which is what rejects a
 * horizontal sliver; their x-intervals are then merged and must cover the cell's full WIDTH, which
 * is what rejects a vertical one. Coverage by several HORIZONTALLY adjacent rectangles counts,
 * because the union is what the player walks into — `mergeSpikeRuns` happens to emit one rectangle
 * per run today, and this must not silently depend on that.
 *
 * ⚠️ **It is a one-dimensional union, and that is a deliberate limit.** Two half-height rectangles
 * stacked to cover the cell between them are rejected, even though their union does cover it —
 * Codex implementation review, finding 3. The alternative is 2-D interval coverage for a shape no
 * producer emits: every hazard in this project is exactly one tile tall, painted from a
 * `{ fromCol, toCol, row }` run. Recorded rather than built *(YAGNI)*, and it fails in the SAFE
 * direction: a vertically partitioned floor would be reported as uncovered, which is a false red
 * somebody has to come and look at, not a pit that silently cannot hurt you.
 */
function fullyCovered(cell, rects) {
  const spans = rects
    .filter((r) => r.y <= cell.y && r.y + r.h >= cell.y + cell.h)
    .map((r) => [r.x, r.x + r.w])
    .sort((a, b) => a[0] - b[0]);

  let reached = cell.x;
  for (const [from, to] of spans) {
    if (from > reached) break; // a gap the union does not close
    if (to > reached) reached = to;
    if (reached >= cell.x + cell.w) return true;
  }
  return reached >= cell.x + cell.w;
}

/**
 * `null` when the level's pits are all properly spiked, otherwise a one-line reason.
 *
 * Mirrors `describeLevelProblem`'s `string | null` contract deliberately: every reason names the
 * offending columns, because a gate that says only "a pit is unspiked" sends you back to the file
 * to find out which one.
 *
 * `blockers` are the things that must not be standing IN a hazard — gear bodies, enemy swept beats,
 * the goal volume — passed in as labelled rectangles so this file stays pure geometry and never
 * learns what a gear is. `describePlacementProblem` already covers enemy beats; gears and the goal
 * are covered by nothing at all, which is the hole this closes: `tiledEntities.ts` checks gears
 * against solids only and `tiledGoal.ts` checks the goal against solids, spawn and ground only, so
 * a gear authored inside a derived spike run would be swallowed in silence.
 */
export function describePitProblem({
  solids,
  hazards,
  widthTiles,
  tileSize,
  groundTopRow,
  blockers = [],
}) {
  const pits = detectPits(columnProfile(solids, widthTiles, tileSize, groundTopRow), groundTopRow);

  for (const { fromCol, toCol } of pits) {
    const floorTop = groundTopRow * tileSize;
    for (let col = fromCol; col <= toCol; col += 1) {
      const cell = { x: col * tileSize, y: floorTop - tileSize, w: tileSize, h: tileSize };
      if (!fullyCovered(cell, hazards)) {
        return (
          `the pit at cols ${fromCol}-${toCol} is not fully covered above column ${col} — you fall ` +
          'in and nothing hurts you, which is the defect this rule exists to prevent'
        );
      }
    }
  }

  for (let i = 0; i < hazards.length; i += 1) {
    for (let j = i + 1; j < hazards.length; j += 1) {
      if (overlaps(hazards[i], hazards[j])) {
        return (
          `hazard #${i} and hazard #${j} overlap — \`hazardHit()\` returns the FIRST match, so which ` +
          'one damaged the player would depend on emission order'
        );
      }
    }
  }

  for (const blocker of blockers) {
    for (const hazard of hazards) {
      if (overlaps(blocker, hazard)) {
        return (
          `${blocker.label} sits inside the hazard at (${hazard.x}, ${hazard.y}) — nothing else in ` +
          'the suite checks this, and standing in spikes reads as a bug'
        );
      }
    }
  }

  return null;
}

/**
 * The spike runs a level's pits require, ready to be merged into its authored `spikes` list.
 *
 * Derived from the very rectangles the level emits as collision, so *"the drawn spikes hurt"* and
 * *"the pit you fall into is spiked"* are true by construction rather than by a second list somebody
 * has to remember to keep in step — `levelBuilder.mjs`'s own doctrine, at its line 41. Phase 4
 * shipped a spike run that was drawn and harmless because two lists had drifted apart.
 *
 * The spikes sit on `groundTopRow - 1`: the row a standing player's feet pass through, which is
 * where every hand-authored ground spike in the five shipped levels already sits.
 */
export function pitSpikeRuns(solids, widthTiles, tileSize, groundTopRow) {
  return detectPits(columnProfile(solids, widthTiles, tileSize, groundTopRow), groundTopRow).map(
    ({ fromCol, toCol }) => ({ fromCol, toCol, row: groundTopRow - 1 }),
  );
}
