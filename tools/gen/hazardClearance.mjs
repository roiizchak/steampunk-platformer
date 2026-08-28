/**
 * Can the player STAND between a hazard run and the wall in front of it?
 *
 * ## The defect this exists for
 *
 * The owner played the shipped build and reported *"I get stuck by a hazard that I cannot see."*
 * Reproduced by walking right from spawn in all five levels: in **every** one the player stops dead
 * against the first raised mass, and in levels 2, 3 and 5 the box they stop in is **inside a spike
 * run**. Health ticks down, forward motion is blocked by the wall, and the sprite is standing on top
 * of the thing hurting it — which is exactly why it cannot be seen. It is 132 px wide and 288 tall.
 *
 * The geometry behind it is one number. A hazard run ended **96 px** — one tile — short of the wall
 * face, and the player is **132 px** wide. There was no standing spot. Land a beat late and you are
 * pinned in the spikes with a wall in front of you, taking damage until you jump out from a
 * standstill.
 *
 * ## The rule
 *
 * > A floor-level hazard run must leave either **no gap at all** to the wall facing it, or **at
 * > least one player width** of clear floor.
 *
 * The zero case is deliberately legal and is not a loophole: spikes flush to a wall, or filling a
 * valley floor between two masses, are places you were never meant to stand. Four shipped runs are
 * that shape. What is forbidden is the **almost**-gap — floor a player can land on and not fit in.
 *
 * ⚠️ **The bound is the player's WIDTH, not a tile.** It is passed in rather than assumed, because
 * `PLAYER_BOX` is authored local and scaled by `RENDER_SCALE`, and this file is not the place that
 * owns either. A tile is 96 and the player is 132: a rule written in tiles would have called the
 * defect legal.
 *
 * ## Why it is a separate module
 *
 * `pitDetect.mjs` owns whether a *pit* has spikes; this owns whether a *floor* has room. They ask
 * different questions of the same rectangles, and `pitDetect.mjs` is near the 400-line rule.
 * Imported by `tests/unit/level-hazard-clearance.test.ts` over the shipped bytes and by
 * `make-levels.mjs` at generation time — one definition, two consumers *(vault 5.3)*.
 */

/**
 * Every hazard rect that sits on the walking surface.
 *
 * `groundTopRow - 1` is where a floor spike run is painted: the tile directly above the ground. A
 * hazard higher than that is on a raised mass or a ledge and is a different question — you reach it
 * by jumping, so "could you stand beside it" is not the thing that traps you.
 */
function floorRuns(hazards, tileSize, groundTopRow) {
  return hazards.filter((h) => Math.round(h.y / tileSize) === groundTopRow - 1);
}

/**
 * The walls a run could pin the player against: solid masses whose TOP is above the walking surface.
 *
 * The ground itself is excluded by that test — it is what the player is standing on, not a face they
 * can be pushed into.
 */
function walls(solids, tileSize, groundTopRow) {
  return solids.filter((s) => Math.round(s.y / tileSize) < groundTopRow);
}

/**
 * Describe the first place the player can be pinned, or `null` if there is none.
 *
 * Returns a sentence, not a boolean, for the same reason `describePitProblem` does: a gate that says
 * only "something is wrong" sends the reader back to measure it themselves.
 */
export function describeClearanceProblem({
  solids,
  hazards,
  tileSize,
  groundTopRow,
  playerWidthPx,
}) {
  const runs = floorRuns(hazards, tileSize, groundTopRow);
  const faces = walls(solids, tileSize, groundTopRow);

  for (const run of runs) {
    const left = run.x;
    const right = run.x + run.w;

    // The nearest wall on each side. `Infinity` where there is none — an open floor cannot pin you.
    let gapRight = Infinity;
    let rightWall = null;
    let gapLeft = Infinity;
    let leftWall = null;
    for (const w of faces) {
      if (w.x >= right) {
        const g = w.x - right;
        if (g < gapRight) {
          gapRight = g;
          rightWall = w;
        }
      }
      if (w.x + w.w <= left) {
        const g = left - (w.x + w.w);
        if (g < gapLeft) {
          gapLeft = g;
          leftWall = w;
        }
      }
    }

    for (const [side, gap, wall] of [
      ['right', gapRight, rightWall],
      ['left', gapLeft, leftWall],
    ]) {
      // Zero is legal on purpose — see the header. Only the almost-gap traps.
      if (gap <= 0 || gap >= playerWidthPx || wall === null) continue;
      const runCols = `${Math.round(left / tileSize)}-${Math.round(right / tileSize) - 1}`;
      const wallCols = `${Math.round(wall.x / tileSize)}-${Math.round((wall.x + wall.w) / tileSize) - 1}`;
      return (
        `the hazard run at cols ${runCols} leaves only ${gap}px of clear floor before the wall at ` +
        `cols ${wallCols} on its ${side}, and the player is ${playerWidthPx}px wide. There is ` +
        'nowhere to stand: land there and you are pinned in the spikes with a wall in front of you, ' +
        'taking damage you cannot see because you are standing on it'
      );
    }
  }
  return null;
}
