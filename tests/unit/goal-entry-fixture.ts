/**
 * The shared fixture for the step-9d entry-sequence suites.
 *
 * `goal-entry.test.ts` crossed the 400-line rule when the cancel gained its two driven cases, and
 * the rule says split rather than exempt. The split is by SUBJECT, not by size: this file's
 * siblings are *"what the sequence does when it goes right"* and *"the three ways it refused to
 * end"*. Both need one world, and two copies of a fixture is how two tests quietly stop testing the
 * same geometry *(vault 5.3)*.
 */

import { createSnapshot } from '../../src/sim/input';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, Rect, World } from '../../src/sim/types';

export const SCALE = 6;
export const BODY_W = PLAYER_BOX.w * SCALE; // 132
export const BODY_H = PLAYER_BOX.h * SCALE; // 288

export const FLOOR_Y = 960;
export const FLOOR: Rect[] = [{ x: 0, y: FLOOR_Y, w: 8000, h: 120 }];
export const BOUNDS = { widthPx: 8000, heightPx: 1080 };
export const SPAWN = { x: 1000, y: FLOOR_Y };

/**
 * The shipped goal geometry, reproduced: 192 wide, exactly body-tall, flush on the floor, and well
 * clear of the standing spawn box — `describeGoalProblem` refuses a goal that overlaps it, and that
 * data rule is half of what makes the death guard sufficient.
 */
export const GOAL: Rect = { x: SPAWN.x + 600, y: FLOOR_Y - BODY_H, w: 192, h: BODY_H };
export const CENTRE = GOAL.x + GOAL.w / 2;

export const neutral = (): InputSnapshot => createSnapshot();

/**
 * 🔴 `bounds` and `solids` are passed EXPLICITLY. `createWorld` defaults to the 1920 x 1080
 * grey-box extent, and `clampToBounds` at step 9 would drag a player placed beyond it straight back
 * inside — so a fixture that omits them can never reach the gate however correct the feature is,
 * and would fail for a reason that has nothing to do with the feature. Codex plan review C3.
 */
export function makeWorld(extraSolids: Rect[] = []): World {
  return createWorld({
    seed: 1,
    scale: SCALE,
    solids: [...FLOOR, ...extraSolids],
    bounds: BOUNDS,
    spawn: SPAWN,
    goal: GOAL,
  });
}

/** A world with the player's feet placed exactly, standing on the floor. */
export function standingAt(x: number, y: number = FLOOR_Y): World {
  const world = makeWorld();
  world.player.x = x;
  world.player.y = y;
  world.player.grounded = true;
  return world;
}

/**
 * Drive rightward until the sequence arms, and report the tick it armed on.
 *
 * 🔴 `typeof === 'number'`, never `!== null`. This read `world.goalEntryTicks !== null` first, and
 * `undefined !== null` is TRUE — so against a `World` that had no such field yet it returned on the
 * first tick and two tests passed vacuously.
 */
export function runToGate(world: World): number {
  for (let i = 0; i < 600; i += 1) {
    const held = neutral();
    held.right = true;
    tick(world, held);
    if (typeof world.goalEntryTicks === 'number') return world.tickCount;
  }
  throw new Error('the sequence never armed');
}
