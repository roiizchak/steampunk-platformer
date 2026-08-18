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

import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { GATE_SEEDS } from './level-reach.test';
import { MAX_TICKS, autoPlay, shippedWorld } from './levelAutoPlay';
import { SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

/**
 * 🔴 The policy, the world builder and the two measured look constants moved to `levelAutoPlay.ts`
 * when the hazard-free gate was written — one definition, two callers *(vault 5.3)*. Nothing about
 * this gate's behaviour changed: it still runs with enemies live and damage allowed, because its
 * claim is "this level can be finished", not "finished flawlessly".
 */

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
