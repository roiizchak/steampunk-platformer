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
 *
 * **Changed 32 -> 96 in Phase 4 by user decision**, with `RENDER_SCALE` 2 -> 6 alongside it. The
 * ratio is untouched: the character is still 3 tiles tall, which is what STYLE.md locks.
 *
 * The reason is resolution, not size. The generated character source is **935 px tall**; cutting
 * it to 96 px discarded about 90 % of the linear detail, and no camera zoom can put that back —
 * zooming displays the 96 px that survived as 3x3 blocks. Re-cutting the same source at 288 px is
 * still a 3.2x DOWNSCALE, so every pixel on screen is one that was actually drawn. The reference
 * art the user is matching carries detail 96 px cannot hold.
 */
export const TILE_SIZE = 96;

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
 * **PUBLISHED by Phase 3 as part of the character contract**, and **raised 2 -> 6 in Phase 4 by
 * user decision** together with `TILE_SIZE`. PLAYER_BOX is 22 x 48 local, so the world collision
 * box is 132 x 288 px = 1.375 x 3.0 tiles — the same tile ratio as before, still inside STYLE.md's
 * locked "96-128px character on a 32px grid = 3-4 tiles tall" read as a ratio.
 *
 * The character now occupies **26.7 % of screen height**, against 8.89 % at RENDER_SCALE 2.
 * STYLE.md §9's original unmeasured prediction was "closer to 20 %"; Phase 3 measured 8.89 % and
 * superseded it, and this change lands nearer §9's first instinct than that measurement did.
 *
 * Integer, so pixel art stays crisp. The header of `src/sim/player.ts` states exactly which knobs
 * moved with it and which did not — raising it is an art decision AND a movement re-tune, because
 * the character's height in pixels is what every distance knob is scaled against.
 */
export const RENDER_SCALE = 6;

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

/**
 * The most enemies a level file may author — **the number criterion 5.11 was measured at**.
 *
 * ## Why the cap exists, and why 22
 *
 * Finding S5: nothing bounded concurrent enemies anywhere, so 5.11's *"worst-case enemy count"* was
 * a **chosen multiple, not a bound** — "ten times the shipped level" rather than "the most this
 * engine can be asked to draw". A frame budget measured against an unbounded quantity is not a
 * budget.
 *
 * 22 is the only number the evidence supports. 5.11 samples the shipped level's **2** enemies
 * against those 2 plus the 20-body dev fleet — 22 concurrent bodies, every one inside
 * `camera.worldView`. A level authored at this cap with nothing spawned at runtime is *exactly* the
 * configuration that spec measures. `level-01.tmj` authors 2, so the cap has 11x headroom and
 * blocks nothing that exists.
 *
 * 🔴 **Raising it means RE-MEASURING 5.11.** The number is not a preference; it is the point where a
 * measurement was taken. Editing it without re-running the frame budget turns a measured bound back
 * into the chosen multiple it replaced.
 *
 * ## What it does NOT cap, stated rather than glossed
 *
 * This caps **authored** enemies, not **runtime concurrency**. `GameScene.spawnDevFleet` goes
 * through `src/scenes/devSpawn.ts`, which pushes straight onto `world.enemies` of an
 * already-constructed world — it never passes through this loader, which is precisely why the cap
 * belongs here and not in `src/sim/`. With the fleet, 22 authored + 20 spawned = 42 live bodies,
 * unbounded. **Finding S5's `src/sim/` half stays open** and needs its own perf evidence.
 */
export const MAX_LEVEL_ENEMIES = 22;

/**
 * The most gears one level may declare.
 *
 * A refusal bound, not a measured one, and the distinction matters: unlike `MAX_LEVEL_ENEMIES` this
 * number has **not** been derived from a frame-budget measurement, because a gear is a static sprite
 * with a rectangle test and nothing that thinks. It exists so a malformed or duplicated object layer
 * fails loudly at boot instead of shipping a level with a thousand pickups in it.
 *
 * 64 is roomy for the level sizes this project builds — `level-01` is 90 × 22 tiles — and small
 * enough that hitting it means something went wrong rather than a designer being ambitious. If a
 * level legitimately needs more, raise it; there is no measurement to invalidate. Say so in the QA
 * log so the next reader knows it was a decision and not an oversight.
 */
export const MAX_LEVEL_GEARS = 64;
