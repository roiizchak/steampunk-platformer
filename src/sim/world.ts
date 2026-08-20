/**
 * World construction — split out of `tick.ts` (which holds the numbered tick-step order, the
 * thing that file must stay under 400 lines to keep readable) because this is world
 * CONSTRUCTION, not the tick order itself. Re-exported from `tick.ts` so every existing
 * importer — several tests and `GameScene` import `createWorld` straight from `'./tick'` — is
 * unaffected. See `tick.ts`'s header before changing anything about tick ORDER; this file only
 * builds the initial `World` the tick order then advances.
 */

import { createTuning } from './player';
import { PLAYER_MAX_HP, IFRAME_TICKS } from './combat';
import { type EnemySpawn, spawnEnemies } from './enemies';
import { type WorldBounds } from './hazards';
import { type GearSpawn, spawnGears } from './pickups';
import { createRng } from './rng';
import type { Rect, World } from './types';

/**
 * Grey-box collision geometry: a floor and two raised platforms with a gap between them.
 *
 * The gap is not decoration. Coyote time can only be observed by walking OFF something, so a world
 * with no ledge makes criterion 2.3 testable only through an artificial "force ungrounded" hook —
 * and a hook that fakes the precondition cannot prove the real one works.
 *
 * Phase 3 replaces the SOURCE of these rects with Tiled collision data. The resolver does not
 * change, which is the point of keeping them plain data.
 */
export const GREY_BOX_SOLIDS: Rect[] = [
  { x: 0, y: 960, w: 1920, h: 120 },
  { x: 420, y: 780, w: 280, h: 32 },
  { x: 980, y: 640, w: 240, h: 32 },
];

/**
 * Where the player starts: on the left platform's surface, with its right edge to walk off.
 *
 * `SPAWN_Y` is the platform's top, not a height above it. Spawning in mid-air would mean every
 * fixture had to know how many ticks the drop takes before it could assert anything about a
 * grounded player — a constant that changes whenever gravity is retuned, silently turning
 * fixtures vacuous. Placed on the surface, the player is grounded after exactly one tick.
 */
const SPAWN_X = 470;
const SPAWN_Y = 780;

/**
 * The grey-box world's extent.
 *
 * Measured from `GREY_BOX_SOLIDS` rather than typed: the floor spans 0..1920 and its underside is
 * at 1080, so those ARE the edges. Typing them separately is how a level and its bounds drift.
 */
const GREY_BOX_BOUNDS: WorldBounds = { widthPx: 1920, heightPx: 1080 };

export interface CreateWorldOptions {
  seed: number;
  /** Art and collision scale (vault 2.11). Required — a forgetful call site is a typecheck error. */
  scale: number;
  solids?: Rect[];
  /** Defaults to the grey-box extent, so Phase 2's fixtures keep the world they were written in. */
  bounds?: WorldBounds;
  hazards?: Rect[];
  /** Level placements. `spawnEnemies` turns each into the live entity its slug names. */
  enemies?: readonly EnemySpawn[];
  /**
   * Gear placements from the level's object layer. Optional for the same reason `spawn` is: every
   * pre-Phase-6 fixture is entitled to a world with nothing to collect.
   */
  gears?: readonly GearSpawn[];
  /**
   * The player's feet at level start. Defaults to the grey-box spawn above.
   *
   * Optional on purpose: Phase 3 feeds this from the shipped `.tmj`'s spawn object, while every
   * Phase 2 unit fixture keeps the grey-box default it was written against. A required field here
   * would have meant editing forty call sites to say "unchanged".
   */
  spawn?: { x: number; y: number };
  /**
   * The level's exit — Phase 8. Defaults to `null`, and step 9d no-ops on that.
   *
   * Optional for the same reason `spawn` and `gears` are, and the reason is worth restating because
   * the null default is load-bearing rather than lazy: this project has forty-odd fixtures that call
   * `createWorld({ seed, scale })` and are entitled to a world with nothing to finish. A required
   * field would have meant editing every one to say "no exit here".
   *
   * ⚠️ The cost is that "9d no-ops on null" can silently become "9d never fires", so
   * `goal-completion.test.ts` gates it from BOTH directions: a null-goal world never completes however
   * far the player walks, AND every shipped level parses to a non-null goal.
   */
  goal?: Rect | null;
}

export function createWorld({
  seed,
  scale,
  solids,
  spawn,
  bounds,
  hazards,
  enemies,
  gears,
  goal,
}: CreateWorldOptions): World {
  if (!(scale > 0) || !Number.isFinite(scale)) {
    throw new Error(`createWorld: scale must be a finite number greater than 0, got ${scale}`);
  }

  const tuning = createTuning();
  return {
    tickCount: 0,
    rng: createRng(seed),
    tickRoll: 0,
    // The same defaults the player below is built from, kept so a respawn returns to the place the
    // level actually started the player — never to a second, drifting copy of that decision.
    spawn: { x: spawn?.x ?? SPAWN_X, y: spawn?.y ?? SPAWN_Y },
    solids: solids ?? GREY_BOX_SOLIDS,
    bounds: bounds ?? GREY_BOX_BOUNDS,
    hazards: hazards ?? [],
    enemies: spawnEnemies(enemies ?? []),
    projectiles: [],
    gears: spawnGears(gears ?? []),
    gearsCollected: 0,
    goal: goal ?? null,
    completed: false,
    goalEntryTicks: null,
    goalEntryBlocked: false,
    tuning,
    scale,
    player: {
      x: spawn?.x ?? SPAWN_X,
      y: spawn?.y ?? SPAWN_Y,
      vx: 0,
      vy: 0,
      facing: 1,
      grounded: false,
      state: 'fall',
      // Both windows start CLOSED. Seeding them at 0 would mean "the window just opened", and the
      // player would get a free coyote jump out of thin air on the first tick of the game.
      ticksSinceGrounded: tuning.coyoteTicks,
      ticksSinceJumpPressed: tuning.jumpBufferTicks,
      jumpCutPending: false,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      combatCounter: 0,
      // CLOSED, for the same reason as the two windows above: seeding at 0 would spawn the player
      // invulnerable for three quarters of a second.
      iFrameCounter: IFRAME_TICKS,
      // FIX 2: no impulse has landed yet.
      knockbackPending: false,
      strideCounter: 0,
      strideGait: null,
    },
  };
}
