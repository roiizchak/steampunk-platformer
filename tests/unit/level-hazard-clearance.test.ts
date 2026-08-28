/**
 * There is always somewhere to STAND between a hazard run and the wall in front of it.
 *
 * ## The defect
 *
 * The owner played the shipped build and reported *"I still get stuck by a hazard that I cannot
 * see."* Reproduced with a probe that walks right from spawn in all five levels: in **every** one the
 * player stops dead against the first raised mass, and in levels 2, 3 and 5 the box it stops in is
 * **inside a spike run**. Health falls, the wall blocks forward motion, and the sprite is standing on
 * top of the thing hurting it — which is precisely why it cannot be seen.
 *
 * ```
 * BLOCKS level-02 end=col29.3 :: col 29.3 y 1920 hp 60
 * BLOCKS level-03 end=col27.3 :: col 27.3 y 1920 hp 80
 * BLOCKS level-05 end=col23.3 :: col 23.3 y 2016 hp 80
 * ```
 *
 * The whole cause is one comparison. Those runs ended **96 px** — one tile — before the wall face,
 * and the player is **132 px** wide. A tile of floor is not a standing spot for a body wider than a
 * tile.
 *
 * ## 🔴 Why every existing gate was blind to it
 *
 * | gate | why it could not see this |
 * |---|---|
 * | `level-hazard-free.test.ts` | proves each level is finishable **without touching a spike** — its auto-player jumps early and clears both the run and the wall, so it never lands in the gap |
 * | `level-completable.test.ts` | its auto-player tanks damage and finishes anyway |
 * | `level-pits.test.ts` | asks whether a pit floor is spiked, never whether a floor has room |
 * | `level-reach.test.ts` | ignores hazards outright |
 * | `level-traversal.test.ts` | reads a frozen retired level |
 *
 * Five gates over the same rectangles and not one of them asks the question a player asks by
 * standing still.
 *
 * ## The rule, and the case that is deliberately legal
 *
 * > A floor-level hazard run leaves either **no gap at all** to the wall facing it, or **at least one
 * > player width** of clear floor.
 *
 * Zero is not a loophole. Spikes flush against a wall, or filling a valley floor between two masses,
 * are places you were never meant to stand — four shipped runs are exactly that shape, including the
 * pit at level-03 cols 65-69 that this session deliberately kept spiked. What is forbidden is the
 * **almost**-gap: floor a player can land on and not fit in.
 *
 * ⚠️ **The bound is `PLAYER_BOX.w * RENDER_SCALE`, never a tile count.** A tile is 96 and the player
 * is 132, so a rule written in tiles would have called this defect legal. Imported from the sim
 * rather than written down here, so a change to either constant reaches this gate *(vault 5.3)*.
 */

import { describe, expect, it } from 'vitest';

import { RENDER_SCALE } from '../../src/game/constants';
import { PLAYER_BOX } from '../../src/sim/player';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { describeClearanceProblem } from '../../tools/gen/hazardClearance.mjs';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

const PLAYER_WIDTH_PX = PLAYER_BOX.w * RENDER_SCALE;

/** Measured, never assumed to be 20 — level-05's ground row is 21. Same derivation as the pit gate. */
const groundTopRow = (level: LevelData): number => level.spawn.y / level.tileHeight;

const problemFor = (level: LevelData): string | null =>
  describeClearanceProblem({
    solids: level.solids,
    hazards: level.hazards,
    tileSize: level.tileWidth,
    groundTopRow: groundTopRow(level),
    playerWidthPx: PLAYER_WIDTH_PX,
  });

describe('every hazard run leaves room to stand (the shipped bytes)', () => {
  it('the player is wider than a tile, which is the whole reason this gate exists', () => {
    // Non-vacuity, and the sentence the defect turned on. If this ever stops being true the rule
    // above collapses into "a tile is enough", which is what the level layouts already assumed.
    expect(PLAYER_WIDTH_PX).toBe(132);
    expect(PLAYER_WIDTH_PX).toBeGreaterThan(96);
  });

  it.each(LEVELS)('%s has nowhere the player can be pinned in spikes', (id, level) => {
    expect(problemFor(level), `${id} — ${problemFor(level) ?? ''}`).toBeNull();
  });

  it('and the levels actually HAVE floor hazards, so the sweep above is not vacuous', () => {
    for (const [id, level] of LEVELS) {
      const floorRuns = level.hazards.filter(
        (h) => Math.round(h.y / level.tileHeight) === groundTopRow(level) - 1,
      );
      expect(floorRuns.length, `${id} has no floor-level hazard run to check`).toBeGreaterThan(0);
    }
  });
});

/**
 * 🔴 The committed red proofs *(vault C2: a gate that cannot go red is decoration)*.
 *
 * The shipped maps contain no violation any more — that is the point of the fix — so without these
 * the sweep above would pass just as happily against a function that returned `null` unconditionally.
 * Each case is a shape the rule must judge, and the two legal ones matter as much as the illegal
 * one: a gate that rejected flush spikes would red the pit this session deliberately kept.
 */
describe('the rule itself, against shapes the shipped levels no longer contain', () => {
  const TILE = 96;
  const GROUND = 20;
  const ground = { x: 0, y: GROUND * TILE, w: 40 * TILE, h: 4 * TILE };
  const wallAt = (col: number, cols = 2) => ({
    x: col * TILE,
    y: (GROUND - 3) * TILE,
    w: cols * TILE,
    h: 3 * TILE,
  });
  const runAt = (fromCol: number, toCol: number) => ({
    x: fromCol * TILE,
    y: (GROUND - 1) * TILE,
    w: (toCol - fromCol + 1) * TILE,
    h: TILE,
  });
  const judge = (solids: unknown[], hazards: unknown[]): string | null =>
    describeClearanceProblem({
      solids,
      hazards,
      tileSize: TILE,
      groundTopRow: GROUND,
      playerWidthPx: PLAYER_WIDTH_PX,
    } as Parameters<typeof describeClearanceProblem>[0]);

  it('REJECTS one tile of floor between a run and the wall — the shipped defect, exactly', () => {
    const problem = judge([ground, wallAt(28)], [runAt(24, 26)]);
    expect(problem).not.toBeNull();
    expect(problem).toContain('96px of clear floor');
    expect(problem).toContain('cols 24-26');
    expect(problem).toContain('right');
  });

  it('REJECTS it on the LEFT too — the level-04 and level-05 shape', () => {
    const problem = judge([ground, wallAt(20, 7)], [runAt(28, 29)]);
    expect(problem).not.toBeNull();
    expect(problem).toContain('left');
  });

  it('ACCEPTS two tiles, which is what the fix moved every run to', () => {
    expect(judge([ground, wallAt(28)], [runAt(23, 25)])).toBeNull();
  });

  it('ACCEPTS spikes FLUSH against the wall — zero is not an almost-gap', () => {
    expect(judge([ground, wallAt(28)], [runAt(24, 27)])).toBeNull();
  });

  it('ACCEPTS a pit floor spiked wall to wall — the level-03 65-69 shape it must not red', () => {
    expect(judge([ground, wallAt(20, 4), wallAt(28, 4)], [runAt(24, 27)])).toBeNull();
  });

  it('ACCEPTS an open floor with no wall to be pinned against', () => {
    expect(judge([ground], [runAt(24, 26)])).toBeNull();
  });

  it('IGNORES a hazard on a raised ledge — you reach that by jumping, not by standing', () => {
    const ledge = { x: 24 * TILE, y: (GROUND - 5) * TILE, w: 4 * TILE, h: TILE };
    const onLedge = { x: 24 * TILE, y: (GROUND - 6) * TILE, w: 3 * TILE, h: TILE };
    expect(judge([ground, ledge, wallAt(28)], [onLedge])).toBeNull();
  });

  it('and the bound MOVES with the player — a wider player fails what a narrower one passed', () => {
    // The rule is a body width, not a magic number. Proven by changing the body.
    const level = { solids: [ground, wallAt(28)], hazards: [runAt(23, 25)], tileSize: TILE, groundTopRow: GROUND };
    expect(describeClearanceProblem({ ...level, playerWidthPx: 132 })).toBeNull();
    expect(describeClearanceProblem({ ...level, playerWidthPx: 200 })).not.toBeNull();
  });
});
