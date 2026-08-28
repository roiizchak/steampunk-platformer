import { describe, expect, it } from 'vitest';

import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { sweepLevel } from './stallSweep';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

/**
 * # The offline dynamic sweep, as a gate
 *
 * See `stallSweep.ts` for why this is not `autoPlay()` and why the navigation jumps are kept.
 *
 * This file's job is to make the sweep's findings **non-vacuous**: a sweep that silently walked into
 * a wall on tick 30 and reported "no stalls" is worse than no sweep, because it reads as evidence.
 */

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

const SEEDS = [1, 7, 20260828];

describe('the sweep actually runs the level, so a null result means something', () => {
  it.each(LEVELS)('%s: the walker covers real ground before any verdict', (_id, level) => {
    const result = sweepLevel(level, SEEDS[0]!);
    // Spawn is at x=624 on the first floor. Anything under a few tiles of travel means the driver
    // stalled on its own navigation and its findings are about the driver, not the level.
    expect(result.furthestX).toBeGreaterThan(1500);
    expect(result.ticks).toBeGreaterThan(60);
  });
});

describe('every stall the sweep finds, with the interventions that define it', () => {
  it.each(LEVELS)('%s reports its incidents', (id, level) => {
    const lines: string[] = [];
    for (const seed of SEEDS) {
      const result = sweepLevel(level, seed);
      for (const hit of result.incidents) {
        lines.push(
          `${id} seed=${seed} tick=${hit.tick} feet=(${hit.x.toFixed(1)}, ${hit.y.toFixed(1)}) ` +
            `dir=${hit.dir} cause=${hit.cause}${hit.damageSource ? `:${hit.damageSource}` : ''} ` +
            `ticks=${hit.ticks} continue=${hit.continueFreed} reverse=${hit.reverseFreed} ` +
            `jump=${hit.jumpFreed}`,
        );
      }
    }
    // Reported, not asserted away. The sweep's purpose is to produce evidence for a human, and a
    // green assertion here would hide exactly the rows this session needs to read.
    // eslint-disable-next-line no-console
    console.log(lines.length ? lines.join('\n') : `${id}: no stall reached the threshold`);
    expect(true).toBe(true);
  });
});
