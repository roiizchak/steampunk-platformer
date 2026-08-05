/**
 * World and timing constants.
 *
 * This module has ZERO imports, deliberately. `src/sim/` is allowed to import it without
 * breaching vault 1.1 (the sim imports nothing from the engine), which is what QA criterion
 * 1.3 — run the sim suite with Phaser uninstalled — mechanically proves.
 */

/** Simulation rate. Every duration in `src/sim/` is an integer count of these ticks (vault 2.1). */
export const TICK_HZ = 60;

/** Tile grid cell size in pixels. Phase 3 publishes this; Phase 4 spends money against it. */
export const TILE_SIZE = 32;

/** Base render resolution. 60 x 33.75 tiles visible at camera zoom 1. */
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/**
 * Seed for Phaser's own Phaser.Math.RND. Fixed so e2e runs are reproducible; Phaser defaults
 * this to a random value. Unrelated to the sim's seeded xorshift32 (Phase 2), which is the
 * only RNG game logic is allowed to use.
 */
export const PHASER_RNG_SEED = '20260804';
