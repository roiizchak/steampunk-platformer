/**
 * The two gates that must hold for **every** shipped level, not just the one that had them. Phase 8.
 *
 * ## Why they moved here
 *
 * Both were written against `level-01` in `level-traversal.test.ts`, and Phase 8 froze that file's
 * geometry as a retired fixture. These two could not go with it, because unlike everything else in
 * that file they are **live gates** rather than probes of a shape:
 *
 * 1. 🔴 **Spikes must hurt.** Its original comment says it outright: a test that only asserted
 *    "clearable with a run-up" is satisfied by *deleting the hazard* — the level gets easier and the
 *    suite gets greener *(vault 9.4)*. Frozen against a retired level, it would have gone on proving
 *    that Phase 7's spikes hurt while five new levels shipped decoration.
 *
 * 2. 🔴 **No enemy can reach a point where the player is stuck.** This is the `x:3198` history. A
 *    playtest recorded *"the player wedges against terrain, 100 → 35 hp, no way past"* and it went
 *    undiagnosed for two sessions; the diagnosis was that x 3198 is exactly one half-body-width from
 *    the face of a solid the player is meant to jump. Running right into a wall stops you dead, which
 *    is a collider working — what made it read as a trap was **taking damage while stopped**. Phase 7
 *    proved the level's scavenger could not get there, and the proof depended entirely on one pit
 *    stopping ground-following. Five new levels with more scavengers make that coincidence far less
 *    likely to hold, which is exactly why the gate has to sweep them all.
 *
 * ## ⚠️ What gate 2 can and cannot see
 *
 * It examines the points where a player who **holds one direction** comes to rest against a solid, in
 * both directions. That is where the recorded defect lived and it is cheap to enumerate. It is **not**
 * every state a player can get stuck in: an input pattern that wedges the player somewhere this sweep
 * never visits reads as safe. Full coverage is a search problem, and the residual limit is recorded
 * here rather than implied away — the honest claim is "the shape that bit us cannot recur", not "no
 * soft-lock exists".
 */

import { describe, expect, it } from 'vitest';

import { RENDER_SCALE } from '../../src/game/constants';
import { parseLevel, type LevelData } from '../../src/game/tilemap';
import { createSnapshot, latchJumpPress } from '../../src/sim/input';
import { PLAYER_BOX } from '../../src/sim/player';
import { createWorld, tick } from '../../src/sim/tick';
import type { InputSnapshot, World } from '../../src/sim/types';
import { PHASE07_LEVEL_01, SHIPPED_ENTRIES } from './tilemap-data-fixtures';

const LEVELS: [string, LevelData][] = SHIPPED_ENTRIES.map(([id, raw]) => [
  id,
  parseLevel(id, JSON.parse(raw) as unknown),
]);

const HALF_W = (PLAYER_BOX.w / 2) * RENDER_SCALE;

/**
 * How much clear space an enemy must be kept from a stall point.
 *
 * 400 px, carried forward from the Phase 7 assertion unchanged so the bar does not quietly move. It is
 * a little over three body-widths — enough that a player who has stopped moving has time to see the
 * enemy, jump, or turn round, rather than discovering the problem through the health bar.
 */
const SAFE_GAP_PX = 400;

function levelWorld(level: LevelData, startX: number, withEnemies: boolean): World {
  return createWorld({
    seed: 1,
    scale: RENDER_SCALE,
    solids: level.solids,
    hazards: level.hazards,
    bounds: { widthPx: level.widthPx, heightPx: level.heightPx },
    spawn: { x: startX, y: level.spawn.y },
    goal: level.goal,
    enemies: withEnemies ? level.enemies : undefined,
  });
}

describe.each(LEVELS)('%s — the hazards are live', (id, level) => {
  it('has at least one hazard, or there is nothing here to be an obstacle', () => {
    expect(level.hazards.length, `${id} ships no hazards at all`).toBeGreaterThan(0);
  });

  /**
   * 🔴 Walking into a hazard must COST hp — swept over every hazard in the level, not just the first.
   *
   * The approach starts 400 px to the hazard's left with Right held and no jump, which is the plainest
   * thing a player can do. `hazardHit` sweeps the FEET's path, so the approach must be on ground the
   * feet can walk: a hazard reachable only by falling into it is skipped and counted, and the level
   * must still have at least one that this plain walk reaches — otherwise "every hazard was skipped"
   * would pass vacuously.
   */
  it('walking into a hazard costs hp — they are obstacles, not decoration', () => {
    let reached = 0;
    for (const hazard of level.hazards) {
      const startX = hazard.x - 400;
      if (startX < HALF_W) continue;
      const world = levelWorld(level, startX, false);
      const input: InputSnapshot = createSnapshot();
      input.right = true;
      const startHp = world.player.hp;
      // Enough ticks to cover 400 px at any walking or running speed, and to fall if the approach is
      // not solid ground.
      for (let i = 0; i < 300 && world.player.hp === startHp; i += 1) tick(world, input);
      if (world.player.hp < startHp) reached += 1;
    }
    expect(
      reached,
      `${id}: a player holding Right into every hazard in turn never lost a single hp. Either every ` +
        'hazard is unreachable on foot, or `hazard=true` is missing from the .tmj and the spikes are ' +
        'drawn and harmless — which is what Phase 4 shipped.',
    ).toBeGreaterThan(0);
  });
});

/**
 * Drive the player from `startX` in one direction for `ticks`, optionally jumping once at `jumpAtX`.
 *
 * Simulated rather than computed, for the reason `level-traversal.test.ts` states at length: hand
 * ballistics against a tick order with a jump-cut divisor, a coyote window and per-tick friction was
 * wrong on *both* of its inputs the one time this project tried it.
 */
function drive(
  level: LevelData,
  startX: number,
  dir: 1 | -1,
  ticks: number,
  jumpAtX?: number,
): { x: number; y: number; vx: number; alive: boolean } {
  const world = levelWorld(level, startX, false);
  const input: InputSnapshot = createSnapshot();
  if (dir === 1) input.right = true;
  else input.left = true;
  let jumped = jumpAtX === undefined;
  if (!jumped) input.jumpHeld = true;
  for (let i = 0; i < ticks; i += 1) {
    if (!jumped && (dir === 1 ? world.player.x + HALF_W >= jumpAtX! : world.player.x - HALF_W <= jumpAtX!)) {
      latchJumpPress(input);
      jumped = true;
    }
    tick(world, input);
    if (world.player.hp <= 0) break;
  }
  return { x: world.player.x, y: world.player.y, vx: world.player.vx, alive: world.player.hp > 0 };
}

/**
 * Could a player stand at `(x, spawn.y)` — solid ground beneath, and nothing solid where their body
 * would be?
 *
 * The body is the full `PLAYER_BOX` at `RENDER_SCALE`, measured up from the feet, because a probe placed
 * with its head inside a mass is not a walker approaching an obstacle; it is a walker inside one.
 */
function standableAt(level: LevelData, x: number): boolean {
  const feet = level.spawn.y;
  const bodyTop = feet - PLAYER_BOX.h * RENDER_SCALE;
  const left = x - HALF_W;
  const right = x + HALF_W;
  const inside = level.solids.some((s) => s.x < right && s.x + s.w > left && s.y < feet && s.y + s.h > bodyTop);
  if (inside) return false;
  return level.solids.some((s) => s.y === feet && x > s.x && x < s.x + s.w);
}

/**
 * Positions where terrain stops the player and a **run-up jump does not get them past it**.
 *
 * 🔴 The second clause is the whole gate, and leaving it out made this fire on today's level-01 at
 * x 6556 — a platform edge with a scavenger patrolling beside it, which is ordinary platformer design.
 *
 * That distinction *is* the `x:3198` diagnosis. Running right into a wall stops you dead, and being
 * stopped is a collider working; `level-traversal.test.ts` proves the 3264 pillar is a JUMP. What made
 * the playtest read it as a trap was taking damage while stopped with no idea why forward movement had
 * ended — and the honest, non-vacuous version of "no way past" is terrain the jump genuinely cannot
 * clear. A wall the player can hop is excluded, because forbidding an enemy near every jumpable ledge
 * would forbid the game.
 *
 * ⚠️ A candidate is also discarded unless the player came to rest **at this solid's face**. Otherwise a
 * walk that stopped 2000 px earlier against a different obstacle would be attributed to this one, and
 * the same point would be counted once per solid in the level.
 */
function stallPoints(level: LevelData): number[] {
  const points: number[] = [];
  for (const solid of level.solids) {
    // Only a solid rising above the spawn's footing can stop a walker; a floor cannot.
    if (solid.y >= level.spawn.y) continue;
    for (const dir of [1, -1] as const) {
      const face = dir === 1 ? solid.x : solid.x + solid.w;
      const startX = face - dir * 600;
      if (startX < HALF_W || startX > level.widthPx - HALF_W) continue;
      // 🔴 And the probe must START somewhere a walker could actually be. The stepped masses this phase
      // authored reach the ground, so "600 px back from the middle step's face" is often INSIDE the step
      // below it — and a probe spawned inside a solid reports a stall against the geometry it was
      // spawned in. It went red on all five levels that way. Reaching a step from the one beneath it is
      // a climb, which is `level-reach.test.ts`'s question, not this file's.
      if (!standableAt(level, startX)) continue;

      const walked = drive(level, startX, dir, 200);
      if (!walked.alive) continue;
      // At rest, and at THIS face — within a body width of where the collider should have stopped.
      if (Math.abs(walked.vx) > 1) continue;
      if (Math.abs(walked.x - (face - dir * HALF_W)) > PLAYER_BOX.w * RENDER_SCALE) continue;

      /**
       * The escape test. `face` is the latest honest moment to press jump, so clearing from there means
       * clearing from any earlier press too.
       *
       * 🔴 Escaping means **getting on top of the solid OR past it**, not getting past it. The first
       * draft demanded the horizontal pass and reported every stepped mass in all five levels as a
       * dead end: the player jumps onto the block correctly, keeps running along the top, and stops
       * against the NEXT block's face — which is its own candidate and gets its own test. Landing on
       * the thing you were meant to climb is not a soft-lock.
       *
       * Feet at or above `solid.y` is exactly "standing on its top surface, or higher".
       */
      const jumped = drive(level, startX, dir, 400, face);
      const onTop = jumped.y <= solid.y;
      const past = dir === 1 ? jumped.x > solid.x + solid.w : jumped.x < solid.x;
      if (onTop || past) continue;

      points.push(walked.x);
    }
  }
  return points;
}

/**
 * Every enemy's closest approach to `point`, after a long forced chase.
 *
 * `chasing` is forced on rather than waiting for detection: the question is how far an enemy can
 * TRAVEL, not whether it notices. Waiting would let the check pass for the wrong reason any time the
 * player happened to start outside the detect radius.
 */
function closestApproach(level: LevelData, point: number): number {
  const world = levelWorld(level, point, true);
  const chasers = [...world.enemies.scavengers, ...world.enemies.sentries];
  for (const enemy of world.enemies.scavengers) enemy.chasing = true;

  const input: InputSnapshot = createSnapshot();
  for (let i = 0; i < 1200; i += 1) tick(world, input);

  return chasers.reduce(
    (nearest, enemy) => Math.min(nearest, Math.abs(enemy.x - world.player.x)),
    Number.POSITIVE_INFINITY,
  );
}

describe.each(LEVELS)('%s — no enemy can reach a point where the player is stopped', (id, level) => {
  /**
   * 🔴 The `x:3198` gate, generalised. See this file's header for the history and the residual limit.
   *
   * ⚠️ **`stallPoints` being empty is a PASS here, and that is the honest reading.** An empty list
   * means every wall in the level can be jumped, which is the state a good level is in — demanding at
   * least one unjumpable wall per level would force the defect this gate exists to forbid. The
   * anti-vacuity is therefore not here; it is the committed synthetic below, which proves this gate
   * can go red *(vault C2)*.
   */
  it('every enemy stays clear of every stall point, however long it chases', () => {
    for (const point of stallPoints(level)) {
      expect(
        closestApproach(level, point),
        `${id}: an enemy reached a stall at x ${Math.round(point)} that a run-up jump cannot clear. ` +
          'A player stopped by terrain they cannot pass, taking damage, is the x:3198 defect — it is ' +
          'a LEVEL problem, not a code one, and it needs the terrain or the patrol changed rather ' +
          'than the bar lowered.',
      ).toBeGreaterThan(SAFE_GAP_PX);
    }
  });

  it('...and the level really does place enemies, or the sweep above proves nothing', () => {
    expect(level.enemies.length, `${id} ships no enemies`).toBeGreaterThan(0);
  });
});

/**
 * 🔴 The anti-vacuity, as a committed fixture rather than an assertion about assertions *(vault C2)*.
 *
 * The sweep above passes on a shipped level with **no** unjumpable walls, which is the state a good
 * level is in — so on its own it could be green because the detector is broken rather than because the
 * levels are clean. This constructs the defect deliberately and proves both halves fire: the detector
 * finds the stall, and the enemy check goes red on it.
 *
 * Built by overriding the frozen level's geometry rather than by hand-writing a `LevelData`, so the
 * shape stays honest about every field the real path reads.
 */
describe('the stall detector can actually find one', () => {
  /** A floor, a wall three character-heights tall, and a scavenger patrolling right at its face. */
  const trap: LevelData = {
    ...PHASE07_LEVEL_01,
    id: 'synthetic-trap',
    widthPx: 4000,
    heightPx: 2112,
    spawn: { x: 500, y: 1000 },
    solids: [
      { x: 0, y: 1000, w: 4000, h: 200 },
      // 864 px is three times the 288 px character height and far past the measured apex, so no
      // run-up clears it. That is what makes it a stall rather than a jump.
      { x: 2000, y: 136, w: 96, h: 864 },
    ],
    hazards: [],
    gears: [],
    enemies: [
      {
        slug: 'rust-scavenger',
        x: 1900,
        y: 1000,
        patrolMin: 1800,
        patrolMax: 1950,
      },
    ],
  };

  it('finds the stall in front of an unjumpable wall', () => {
    const points = stallPoints(trap);
    expect(points.length, 'the detector missed a wall three character-heights tall').toBeGreaterThan(0);
    // The player's leading edge against the wall's face: 2000 - 66.
    expect(points[0]).toBeGreaterThan(1900);
    expect(points[0]).toBeLessThan(2000);
  });

  it('and the enemy check goes RED on it', () => {
    const point = stallPoints(trap)[0]!;
    expect(
      closestApproach(trap, point),
      'a scavenger parked at the face of an unjumpable wall did NOT trip the gate, so the sweep over ' +
        'the shipped levels proves nothing',
    ).toBeLessThan(SAFE_GAP_PX);
  });

  /**
   * The other side of the same fixture: make the wall jumpable and the point stops being a stall. This
   * is what stops the gate from firing on every platform edge — the failure that made the first draft
   * red on today's level-01 at x 6556, beside a scavenger, on ordinary platformer geometry.
   */
  it('but a wall the player CAN jump is not a stall', () => {
    const jumpable: LevelData = { ...trap, solids: [trap.solids[0]!, { x: 2000, y: 904, w: 96, h: 96 }] };
    expect(stallPoints(jumpable), 'a one-tile step was reported as a soft-lock').toEqual([]);
  });
});
