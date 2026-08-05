/**
 * The simulation barrel.
 *
 * Vault 1.1 (blocker): `src/sim/` imports NOTHING from Phaser — no `Date.now`, no
 * `Math.random`, no DOM. The mechanical proof is QA criterion 1.3: the sim test suite must
 * run with Phaser uninstalled.
 *
 * This file is deliberately real rather than a placeholder. `tests/unit/sim-boundary.test.ts`
 * import-evaluates it, which walks the actual module graph and so catches a *transitive*
 * Phaser import that a text scan cannot see. With no importable entry point, criterion 1.3
 * would pass without proving anything.
 *
 * Phase 2 fills this in: tick.ts, player.ts, input.ts, rng.ts, types.ts.
 */

export { TICK_HZ, TILE_SIZE, GAME_WIDTH, GAME_HEIGHT } from '../game/constants';

/** Convert an integer tick count to whole milliseconds. Ticks are the unit; ms is for display. */
export function ticksToMs(ticks: number): number {
  return Math.round((ticks * 1000) / 60);
}
