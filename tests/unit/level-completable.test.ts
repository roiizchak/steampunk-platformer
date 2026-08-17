/**
 * Every shipped level is finished, in the world the player actually gets. Criterion 8.1's other half.
 *
 * ## 🔴 Why this exists beside `level-reach.test.ts`
 *
 * The reachability graph proves the TERRAIN connects, deliberately with no hazards and no enemies — a
 * route blocked by a patrolling scavenger is a different question from a route that does not exist, and
 * conflating them makes a failure unreadable. But Codex's plan review (F1) named the gap that leaves:
 * *the traversal harness builds a world with no enemies, so 8.1 can bless terrain while an enemy makes
 * the required route fatal.* That was the phase's named top risk.
 *
 * So this builds the **exact shipped world** — goal, hazards, enemies, gears, `DEFAULT_TUNING` — mutates
 * nothing but legal input, and asserts `world.completed`.
 *
 * ## The player is a POLICY, not a script of coordinates
 *
 * A recorded input sequence would pin one route through one version of one level and go red on the next
 * layout edit with no defect behind it. Instead `autoPlay` holds Right and jumps when it is blocked or
 * when the ground ahead runs out — which is what a person does, and which is why the levels were built so
 * that it works. What it does NOT do is fight: it takes the hits, and the 100 hp plus respawn is what
 * carries it through. That is deliberate — the claim being made is "this level can be finished", not
 * "this level can be finished flawlessly".
 *
 * ⚠️ And it is still not a claim that a HUMAN finds the route. That is criterion 8.2's hands-on half and
 * no unit test replaces it *(vault C4)*.
 *
 * ## Vault 8.2 — the gate seeds, and why they matter HERE
 *
 * `tick()` samples the RNG at step 1 and advances enemies at 4a, **before** player movement, so with
 * enemies live a traversal is genuinely seed-dependent. This runs under every `GATE_SEED`, which is
 * disjoint from the `TUNE_SEEDS` a layout is iterated against. A route that only survives its tuning
 * seed got lucky.
 */

import { describe, expect, it } from 'vitest';

import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, World } from '../../src/sim/types';
import { GATE_SEEDS } from './level-reach.test';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const HALF_W = (PLAYER_BOX.w / 2) * RENDER_SCALE;

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

/**
 * How long the auto-player gets. Generous, and it is a BOUND rather than a measurement — the assertion
 * reads `world.completed`, never the tick count, so a faster or slower route is not a failure.
 *
 * The longest level is 15360 px at roughly 9 px per tick of running, so a clean run is about 1700 ticks.
 * 12000 leaves room for several deaths, each costing a respawn at the level's start.
 */
const MAX_TICKS = 12_000;

/** The exact shipped world. Nothing omitted, nothing substituted. */
function shippedWorld(level: LevelData, seed: number): World {
  return createWorld({
    seed,
    scale: RENDER_SCALE,
    solids: level.solids,
    hazards: level.hazards,
    enemies: level.enemies,
    gears: level.gears,
    goal: level.goal,
    bounds: { widthPx: level.widthPx, heightPx: level.heightPx },
    spawn: level.spawn,
  });
}

/**
 * Is there any solid ground under `x` at or below the feet?
 *
 * ⚠️ **`LOOK_DOWN_PX` is 600, and it is not a tolerance — it is the difference between a drop and a
 * pit.** The first draft allowed 240 px, which is less than one 4-tile step, so stepping off a ziggurat
 * onto the floor 288 px below read as *no ground ahead*. The auto-player jumped, and on level-02 that
 * carried it straight OVER the exit: the goal is 288 px tall standing on the floor, and a running jump
 * off a 1632 px ledge keeps the whole player box above it. It finished at x 10686 of 10752 having never
 * touched a goal it had passed through the air. A real pit has no ground at any depth, so a generous
 * look-down costs nothing and a stingy one invents pits that are not there.
 */
const LOOK_DOWN_PX = 600;

function groundAhead(level: LevelData, x: number, feetY: number): boolean {
  return level.solids.some(
    (s) => s.x <= x && s.x + s.w >= x && s.y >= feetY - 8 && s.y <= feetY + LOOK_DOWN_PX,
  );
}

/**
 * How far past the leading edge to look for the ground.
 *
 * 🔴 Small on purpose: the jump fires when the leading edge is essentially AT the hole. That is the
 * trigger `level-traversal.test.ts` measured its 288 px clearable gap with — *"the obstacle's own left
 * edge is the LATEST honest moment to jump, so a test that passes here passes for any earlier press
 * too"* — and copying it is what makes the measurement transferable. The first draft looked 120 px
 * ahead, which jumps 120 px early, which costs 120 px of the 288 px reach: the auto-player fell into
 * the third gap of level-04 nine times and never got past it.
 */
const LOOK_AHEAD_PX = 16;

interface Run {
  completed: boolean;
  ticks: number;
  furthestX: number;
  deaths: number;
}

/**
 * Hold Right; jump when blocked or when the ground ahead runs out.
 *
 * The two triggers are the whole policy:
 *
 * - **blocked** — right is held, the player is grounded, and x did not move. That is a wall, and the
 *   answer to a wall is a jump. `level-hazards.test.ts` proves every wall in every level is one a
 *   run-up clears, so this cannot loop forever against a dead end.
 * - **no ground ahead** — a pit or a hazard strip is one look-ahead away. Looking ahead by a body width
 *   plus a margin is what turns "run right" into "run right and jump the holes".
 *
 * `jumpHeld` stays true for the full-height jump; releasing early is the jump CUT and this policy never
 * wants a short hop.
 */
function autoPlay(level: LevelData, seed: number): Run {
  const world = shippedWorld(level, seed);
  const input: InputSnapshot = createSnapshot();
  input.right = true;
  input.jumpHeld = true;

  let furthestX = world.player.x;
  let deaths = 0;
  let lastX = world.player.x;
  let stuckFor = 0;

  for (let i = 0; i < MAX_TICKS; i += 1) {
    const grounded = world.player.vy === 0;
    if (grounded) {
      const lead = world.player.x + HALF_W;
      const blocked = Math.abs(world.player.x - lastX) < 0.5;
      stuckFor = blocked ? stuckFor + 1 : 0;
      // A few ticks of no progress rather than one: acceleration from a standstill is genuinely slow for
      // the first tick or two, and jumping on that would bunny-hop the whole level.
      if (stuckFor >= 4 || !groundAhead(level, lead + LOOK_AHEAD_PX, world.player.y)) {
        latchJumpPress(input);
        stuckFor = 0;
      }
    }
    lastX = world.player.x;

    const events = tick(world, input);
    if (events.playerDied) deaths += 1;
    if (world.player.x > furthestX) furthestX = world.player.x;
    if (world.completed) return { completed: true, ticks: i + 1, furthestX, deaths };
  }
  return { completed: false, ticks: MAX_TICKS, furthestX, deaths };
}

describe.each(LEVELS)('%s can be finished in the world the player gets', (id, level) => {
  /**
   * 🔴 The gate. Enemies, hazards and gears all live, under every gate seed.
   */
  it.each(GATE_SEEDS)('reaches the exit (seed %i)', (seed) => {
    const run = autoPlay(level, seed);
    expect(
      run.completed,
      `${id} was not finished in ${MAX_TICKS} ticks under seed ${seed}. Furthest x ${Math.round(
        run.furthestX,
      )} of ${level.widthPx}, ${run.deaths} death(s). The reachability graph says the terrain connects, ` +
        'so if that is green and this is red the route is blocked by an ENEMY or a HAZARD rather than ' +
        'by geometry — which is exactly the case a terrain-only proof cannot see.',
    ).toBe(true);
  });

  /**
   * 🔴 The non-vacuity, and it is the one Codex finding F1 is about.
   *
   * If the enemies were silently absent from the world above, the gate would still be green and would
   * still be measuring nothing about them. This asserts they are there and that the run genuinely
   * happened — the player travelled most of the level rather than completing it from the spawn.
   */
  it('...and the world it was run in really had the enemies in it', () => {
    const world = shippedWorld(level, GATE_SEEDS[0]);
    const count = world.enemies.scavengers.length + world.enemies.sentries.length;
    expect(count, `${id}: the traversal world has no enemies, so F1's gap is still open`).toBe(
      level.enemies.length,
    );
    expect(count).toBeGreaterThan(0);
    expect(world.hazards.length, `${id}: the traversal world has no hazards`).toBe(level.hazards.length);
    expect(world.gears.length).toBe(level.gears.length);

    const run = autoPlay(level, GATE_SEEDS[0]);
    expect(
      run.furthestX,
      `${id}: the run finished without crossing the level, which means the exit is far too close`,
    ).toBeGreaterThan(level.widthPx * 0.75);
  });
});

/**
 * 🔴 The proof that the traversal is not satisfied by any world at all *(vault C2)*.
 *
 * Every assertion above is green when the level is finishable. Nothing there fails if `autoPlay` were
 * broken into always reporting success, or if `world.completed` were latched at creation. This walls the
 * exit off behind terrain the policy cannot pass and requires the run to FAIL.
 */
describe('the traversal can report a level unfinishable', () => {
  it('does not complete a level whose exit is behind an unjumpable wall', () => {
    const level = LEVELS[0]![1];
    const wallX = (level.goal.x + level.spawn.x) / 2;
    const walled: LevelData = {
      ...level,
      // 10 tiles tall, more than twice the measured apex, spanning the full height above the floor.
      solids: [...level.solids, { x: wallX, y: level.spawn.y - 960, w: 192, h: 960 }],
    };
    const run = autoPlay(walled, GATE_SEEDS[0]);
    expect(
      run.completed,
      'a wall twice the apex did not stop the auto-player, so the traversal proves nothing',
    ).toBe(false);
    expect(run.furthestX, 'it should still have reached the wall').toBeLessThan(wallX);
  });
});
