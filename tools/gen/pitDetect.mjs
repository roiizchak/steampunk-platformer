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
 * - **the nearest surface on the left AND on the right is at least 2 tiles higher** — a single step
 *   down is not a pit either, and both sides must be walls or it is a slope you walk out of;
 * - **both neighbours exist** — a run touching the map edge has nothing on the outer side, which is
 *   what keeps the level's opening stretch and the goal apron out;
 * - **both neighbours reach the ground row** — a platform floating over a bottomless gap is not a
 *   wall you are trapped behind, and the gap beside it is the kill plane's business, not this
 *   file's.
 *
 * Every clause is a fixture in `tests/fixtures/pit-levels/`. That is not ceremony: the five shipped
 * valleys are ALSO found by a far broader detector that checks none of these clauses, so the
 * shipped maps cannot tell a correct implementation from a sloppy one. Codex's plan review round 2
 * caught exactly that — four fixtures about coverage would all have passed against a rule that had
 * quietly lost every narrowing clause.
 */

/** A one-column dip is a step you walk out of, not a pit. */
export const MIN_PIT_COLS = 2;

/**
 * How much higher than the pit floor both sides must stand.
 *
 * 2 tiles rather than 1 because a single step down is a slope, and rather than 3 because the
 * shallowest shipped pit is 3 and a threshold set AT the observed minimum cannot tell "just deep
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
export function columnProfile(rects, widthTiles, tileSize, groundTopRow) {
  const surfaceRow = new Array(widthTiles).fill(null);
  const reachesGround = new Array(widthTiles).fill(false);

  for (let col = 0; col < widthTiles; col += 1) {
    const left = col * tileSize;
    const right = left + tileSize;
    for (const r of rects) {
      if (!(r.x < right && r.x + r.w > left)) continue;
      const topRow = Math.floor(r.y / tileSize);
      const bottomRow = Math.ceil((r.y + r.h) / tileSize); // exclusive
      if (surfaceRow[col] === null || topRow < surfaceRow[col]) surfaceRow[col] = topRow;
      if (topRow <= groundTopRow && bottomRow > groundTopRow) reachesGround[col] = true;
    }
  }
  return { surfaceRow, reachesGround };
}

/**
 * The pits, as `{ fromCol, toCol }` column runs, left to right.
 *
 * Returns the RUN rather than a boolean or a rect so a caller can decide what to put in it — spikes
 * today, and the same shape would carry a furnace or water later without changing this rule.
 */
export function detectPits({ surfaceRow, reachesGround }, groundTopRow) {
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

    const l = from - 1;
    const r = to + 1;
    if (l < 0 || r >= width) continue; // a map edge is not a wall
    if (surfaceRow[l] === null || surfaceRow[r] === null) continue; // a bottomless gap is not a wall
    if (!reachesGround[l] || !reachesGround[r]) continue; // nor is a floating platform
    if (groundTopRow - surfaceRow[l] < MIN_WALL_TILES) continue;
    if (groundTopRow - surfaceRow[r] < MIN_WALL_TILES) continue;

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
      if (!hazards.some((h) => overlaps(cell, h))) {
        return (
          `the pit at cols ${fromCol}-${toCol} has no hazard above column ${col} — you fall in and ` +
          'nothing hurts you, which is the defect this rule exists to prevent'
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
