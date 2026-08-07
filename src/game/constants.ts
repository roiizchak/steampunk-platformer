/**
 * World and timing constants.
 *
 * This module has ZERO imports, deliberately. `src/sim/` is allowed to import it without
 * breaching vault 1.1 (the sim imports nothing from the engine), which is what QA criterion
 * 1.3 — run the sim suite with Phaser uninstalled — mechanically proves.
 */

/** Simulation rate. Every duration in `src/sim/` is an integer count of these ticks (vault 2.1). */
export const TICK_HZ = 60;

/**
 * Milliseconds of wall-clock per simulation tick.
 *
 * Lives OUTSIDE `src/sim/` on purpose. Converting real elapsed time into a whole number of ticks
 * is the scene's job; the sim itself never sees a millisecond, which is what makes its behaviour
 * independent of frame rate (vault 2.1).
 */
export const MS_PER_TICK = 1000 / TICK_HZ;

/**
 * The most ticks one render frame may drain.
 *
 * Without a cap, a long stall (a breakpoint, a background tab, a slow first paint) hands the next
 * frame a delta worth hundreds of ticks, which takes longer to simulate than a frame, which grows
 * the next delta further — the spiral of death. Capping means the game runs in slow motion for a
 * moment instead of hanging, and slow motion is recoverable.
 */
export const MAX_TICKS_PER_FRAME = 5;

/**
 * Tile grid cell size in pixels. **PUBLISHED by Phase 3** — Phase 4 spends money against it.
 * `tests/unit/tilemap-data.test.ts` pins this against both the shipped `.tmj` and the number
 * written in ASSET-PIPELINE.md, so the doc and the code cannot drift apart (Codex P8).
 */
export const TILE_SIZE = 32;

/** Base render resolution. 60 x 33.75 tiles visible at CAMERA_ZOOM. */
export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/**
 * **PUBLISHED by Phase 3.** The single runtime source — `src/render/cameraRig.ts` imports it
 * rather than declaring its own, because three sources for one number (two modules and a doc)
 * is three chances to drift while a doc review stays green (Codex P8).
 *
 * At zoom 1 the world view is exactly GAME_WIDTH x GAME_HEIGHT = 60 x 33.75 tiles.
 */
export const CAMERA_ZOOM = 1;

/**
 * Art and collision-geometry scale (vault 2.11) — **geometry only, never velocities**.
 *
 * **PUBLISHED by Phase 3 as part of the character contract**, which Phase 4 generates against:
 * PLAYER_BOX is 22 x 48 local, so the world collision box is 44 x 96 px = 1.375 x 3.0 tiles,
 * which is 8.9% of screen height at CAMERA_ZOOM. That satisfies STYLE.md's locked "96-128px
 * character on a 32px grid = 3-4 tiles tall"; STYLE.md §9's unmeasured "~20%" prediction is
 * superseded by this measurement, which is what §9 says Phase 3 is for.
 *
 * Integer, so pixel art stays crisp. Raising it is a Phase 4 art decision AND a movement
 * re-tune: the character's height in pixels is what every distance knob is scaled against.
 */
export const RENDER_SCALE = 2;

/**
 * Seed for Phaser's own Phaser.Math.RND. Fixed so e2e runs are reproducible; Phaser defaults
 * this to a random value. Unrelated to the sim's seeded xorshift32 (Phase 2), which is the
 * only RNG game logic is allowed to use.
 */
export const PHASER_RNG_SEED = '20260804';

/**
 * The values Phaser's `CanvasInterpolation.setCrisp()` assigns to `image-rendering`, in the
 * order it assigns them. The browser keeps the last one it recognises, so the winning value is
 * engine-dependent (Chromium: `pixelated`; Firefox: `-moz-crisp-edges`).
 *
 * Shared by the runtime assertion and the e2e spec ON PURPOSE. Two hand-maintained copies drift,
 * and the drift shows up as a browser-specific false red rather than as a real failure.
 */
export const CRISP_IMAGE_RENDERING = [
  'optimizeSpeed',
  '-moz-crisp-edges',
  '-o-crisp-edges',
  '-webkit-optimize-contrast',
  'optimize-contrast',
  'crisp-edges',
  'pixelated',
] as const;

/**
 * Texture keys Phaser's TextureManager registers at boot. They are real textures with non-zero
 * dimensions (`__DEFAULT`, `__MISSING` and `__WHITE` are 32x32; `__NORMAL` is 1x1), so a catalog
 * entry using one of these names would pass an existence-and-dimensions check while its file was
 * never fetched at all — the loader silently skips any key that already exists.
 */
export const PHASER_RESERVED_TEXTURE_KEYS = ['__DEFAULT', '__MISSING', '__WHITE', '__NORMAL'];
