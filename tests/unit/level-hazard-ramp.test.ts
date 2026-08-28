/**
 * The hazard ramp's NUMBERS, split out of `level-ramp.test.ts` when that file crossed 400 lines.
 *
 * That file owns the ramp's *shape* — which metrics must be non-decreasing across the five levels,
 * and that no single step may carry more than 75 % of a metric's whole rise. This file owns the one
 * metric whose exact step is a design contract rather than a direction.
 */

import { describe, expect, it } from 'vitest';

import { TILE_SIZE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

/**
 * 🔴 The hazard ramp's actual NUMBERS, not just its direction.
 *
 * Codex implementation review, finding 6. `hazard total px` above is a *directional* metric: it
 * asks only that the five values never decrease, and its single-step cap allows any distribution
 * under 75 %. So the ramp the QA log states — **672 / 768 / 864 / 960 / 1056 px, one 96 px tile per
 * level** — was file evidence, not a contract, and 672/672/672/672/1056 would have passed.
 *
 * A one-tile step per level is the whole design of the ramp and it is cheap to say so. Written as
 * the DELTA rather than the five totals, so adding a tile to every level stays legal and adding one
 * to a single level does not.
 */
describe('the hazard ramp is one tile per level, not merely non-decreasing', () => {
  it('every consecutive pair differs by exactly one tile of hazard', () => {
    const totals = LEVELS.map(([, level]) => level.hazards.reduce((sum, h) => sum + h.w, 0));
    expect(totals.length, 'the ramp is measured over all five levels').toBe(5);

    for (let i = 1; i < totals.length; i += 1) {
      expect(
        totals[i]! - totals[i - 1]!,
        `hazard total goes ${totals[i - 1]} -> ${totals[i]} px between level ${i} and ${i + 1}; ` +
          `the ramp is one ${TILE_SIZE} px tile per level. Full series: ${totals.join(' / ')}`,
      ).toBe(TILE_SIZE);
    }
  });
});
