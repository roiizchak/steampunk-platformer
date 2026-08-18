import { describe, expect, it } from 'vitest';

import { RENDER_SCALE, TILE_SIZE } from '../../src/game/constants';
import { blockedAt, createScavenger, scavengerFooting, stepScavenger } from '../../src/sim/enemies';
import { SCAVENGER_BOX } from '../../src/sim/enemyPlacement';
import { parseLevel } from '../../src/game/tilemap';
import type { Rect } from '../../src/sim/types';

/**
 * Enemies used to walk through walls, and the whole tick had nowhere to stop them.
 *
 * `stepScavenger` wrote `x` in two branches. The chase branch consulted `groundUnder` — a probe
 * DOWNWARD at `y + 1`, which vetoes stepping over a void and says nothing about a wall — and the
 * patrol branch consulted `solids` not at all. Step 9 of the tick contract then runs
 * `resolveCollisions` on the PLAYER only, so nothing downstream could correct an enemy that had
 * already committed the step. The user reported it off a screen recording: a chasing scavenger
 * crossing a raised block's vertical face.
 *
 * 🔴 **The veto is "newly entered", not "overlapping", and that distinction is the whole fix.**
 * A plain overlap test looks simpler and breaks two real things, both found by the Codex plan
 * review before a line was written:
 *
 *  - `enemy-ai-scavenger.test.ts` builds its footing as ONE solid spanning the whole plane, so
 *    every non-ledge fixture in that file has its body permanently inside a solid. An overlap test
 *    reads that as a wall and turns the file red for a reason it never meant to assert.
 *  - level-02's first scavenger has `patrolMin` at column 32 and the wall at columns 30-31 ends at
 *    exactly that x. With a 60 px half-width its body ALREADY overlaps that wall at its authored
 *    bound. An overlap test traps a shipped enemy on boot.
 *
 * So the rule is the player's own: `resolveCollisions` only pushes out of a solid the body was
 * CLEAR of before the step *(vault 5.3 — one rule, not two that agree on the happy path)*. You
 * cannot be blocked by something you are already inside.
 */

const SCALE = RENDER_SCALE;
const HALF = (SCAVENGER_BOX.w / 2) * SCALE;
const HEIGHT = SCAVENGER_BOX.h * SCALE;

/** Feet on y 0, so a wall is any solid whose top is above 0 and whose bottom is below the head. */
const GROUND: Rect = { x: -100000, y: 0, w: 200000, h: TILE_SIZE };
const wallAt = (x: number): Rect => ({ x, y: -HEIGHT, w: TILE_SIZE, h: HEIGHT + TILE_SIZE });

describe('blockedAt — the horizontal veto', () => {
  it('blocks a body that would newly enter a wall', () => {
    const wall = wallAt(1200);
    // Right edge reaches 1201 at x 1141: one px inside a wall it was clear of at 1135.
    expect(blockedAt(1135, 1141, 0, HALF, HEIGHT, [wall])).toBe(true);
  });

  it('does NOT block a body already inside the solid — the EVERYWHERE case', () => {
    const everywhere: Rect = { x: -1e6, y: -1e6, w: 2e6, h: 2e6 };
    expect(blockedAt(500, 506, 0, HALF, HEIGHT, [everywhere])).toBe(false);
  });

  it('does NOT block on the surface it is standing on', () => {
    expect(blockedAt(500, 506, 0, HALF, HEIGHT, [GROUND])).toBe(false);
  });

  it('does NOT block on an overhang entirely above the head', () => {
    const overhang: Rect = { x: 1200, y: -HEIGHT - 500, w: TILE_SIZE, h: 100 };
    expect(blockedAt(1135, 1141, 0, HALF, HEIGHT, [overhang])).toBe(false);
  });

  it('blocks symmetrically, walking left', () => {
    const wall = wallAt(1000);
    // Left edge reaches 1095 at x 1155, inside a wall spanning 1000..1096.
    expect(blockedAt(1161, 1155, 0, HALF, HEIGHT, [wall])).toBe(true);
  });
});

describe('a chasing scavenger and a wall — the reported bug', () => {
  const wall = wallAt(2000);
  const footing = scavengerFooting([GROUND, wall], SCALE);

  it('stops at the wall face instead of crossing it', () => {
    const s = createScavenger({ x: 1800, y: 0, patrolMin: 1800, patrolMax: 1800 });
    // The player stands just beyond the wall, INSIDE the 480 px detect radius, so nothing but the
    // wall can stop the chase.
    for (let i = 0; i < 400; i += 1) {
      stepScavenger(s, { playerX: 2200, playerY: 0 }, footing);
    }
    expect(s.chasing).toBe(true);
    expect(s.x + HALF).toBeLessThanOrEqual(wall.x);
  });

  it('reports moving:false while it is held, so the art does not run a gait over zero travel', () => {
    const s = createScavenger({ x: 1800, y: 0, patrolMin: 1800, patrolMax: 1800 });
    for (let i = 0; i < 400; i += 1) {
      stepScavenger(s, { playerX: 2200, playerY: 0 }, footing);
    }
    expect(s.moving).toBe(false);
  });

  it('RECOVERS — it walks away once the player is on the other side', () => {
    const s = createScavenger({ x: 1800, y: 0, patrolMin: 1800, patrolMax: 1800 });
    for (let i = 0; i < 400; i += 1) {
      stepScavenger(s, { playerX: 2200, playerY: 0 }, footing);
    }
    const held = s.x;
    // Aggro is permanent, so the chase continues — the player has simply gone the other way.
    for (let i = 0; i < 60; i += 1) {
      stepScavenger(s, { playerX: 0, playerY: 0 }, footing);
    }
    expect(s.x).toBeLessThan(held);
    expect(s.moving).toBe(true);
  });
});

describe('a patrolling scavenger and a wall', () => {
  const wall = wallAt(1500);
  const footing = scavengerFooting([GROUND, wall], SCALE);

  it('turns at the wall rather than crossing it, and keeps patrolling', () => {
    // A beat wide enough to reach the wall, with the player far outside detection.
    const s = createScavenger({ x: 1000, y: 0, patrolMin: 900, patrolMax: 3000 });
    const xs: number[] = [];
    for (let i = 0; i < 2000; i += 1) {
      stepScavenger(s, { playerX: 999999, playerY: 999999 }, footing);
      xs.push(s.x);
    }
    expect(s.chasing).toBe(false);
    expect(Math.max(...xs) + HALF).toBeLessThanOrEqual(wall.x);
    // It did not simply stop dead at the wall: it turned and walked the beat back.
    expect(Math.min(...xs)).toBeLessThan(1000);
  });
});

/* ------------------------------------------------------------------ *
 * The shipped levels — the sweep, and the regression the fix could cause.
 * ------------------------------------------------------------------ */

const SHIPPED = import.meta.glob('../../public/assets/levels/*.tmj', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const LEVELS = Object.entries(SHIPPED)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([path, raw]) => {
    const id = path.split('/').pop()!;
    return [id, parseLevel(id, JSON.parse(raw))] as const;
  });

const insideAnySolid = (x: number, feetY: number, solids: readonly Rect[]): Rect | null =>
  solids.find(
    (s) =>
      x + HALF > s.x &&
      x - HALF < s.x + s.w &&
      feetY > s.y &&
      feetY - HEIGHT < s.y + s.h,
  ) ?? null;

describe('the shipped levels — no scavenger ever ends inside a solid', () => {
  it('sweeps every scavenger in every level, chasing a player it can never reach', () => {
    expect(LEVELS.length).toBe(5);
    let swept = 0;
    for (const [id, level] of LEVELS) {
      const footing = scavengerFooting(level.solids, SCALE);
      for (const spawn of level.enemies.filter((e) => e.slug === 'rust-scavenger')) {
        // Drag it the full width of the level in both directions. Aggro is permanent, so one
        // acquisition is enough and the player can then be teleported to lead it anywhere.
        const s = createScavenger({
          x: spawn.x,
          y: spawn.y,
          patrolMin: spawn.patrolMin,
          patrolMax: spawn.patrolMax,
        });
        for (const target of [spawn.x + 200, level.widthPx + 5000, -5000, level.widthPx + 5000]) {
          for (let i = 0; i < 1200; i += 1) {
            stepScavenger(s, { playerX: target, playerY: spawn.y }, footing);
            const hit = insideAnySolid(s.x, s.y, level.solids);
            expect(
              hit,
              `${id}: scavenger from x ${spawn.x} reached x ${s.x}, inside the solid at ` +
                `(${hit?.x}, ${hit?.y}) ${hit?.w}x${hit?.h}`,
            ).toBeNull();
          }
        }
        swept += 1;
      }
    }
    // \U0001f534 Without this the loop above passes on a level file that carries no scavengers.
    expect(swept, 'no scavengers were swept — the assertion above proved nothing').toBeGreaterThan(4);
  });
});

describe('the veto does not shorten an authored patrol beat', () => {
  /**
   * \U0001f534 The regression the Codex plan review caught before it was written.
   *
   * level-02's first scavenger has `patrolMin` at column 32 and the wall at columns 30-31 ends at
   * exactly that x, so with a 60 px half-width its body ALREADY straddles that wall at its authored
   * bound. An "overlapping" veto traps it on boot; the "newly entered" rule lets it walk its beat.
   *
   * This asserts the beat is walked END TO END, which is the property a designer authored — not
   * merely that the enemy moved at all.
   */
  it('every shipped patroller still reaches both ends of its beat', () => {
    let checked = 0;
    for (const [id, level] of LEVELS) {
      const footing = scavengerFooting(level.solids, SCALE);
      for (const spawn of level.enemies.filter((e) => e.slug === 'rust-scavenger')) {
        if (spawn.patrolMin === spawn.patrolMax) continue;
        const s = createScavenger({
          x: spawn.x,
          y: spawn.y,
          patrolMin: spawn.patrolMin,
          patrolMax: spawn.patrolMax,
        });
        const xs: number[] = [];
        for (let i = 0; i < 4000; i += 1) {
          // Player parked far outside the 480 px detect radius, so this is patrol and only patrol.
          stepScavenger(s, { playerX: 1e9, playerY: 1e9 }, footing);
          xs.push(s.x);
        }
        expect(Math.min(...xs), `${id}: patroller never reached patrolMin ${spawn.patrolMin}`).toBe(
          spawn.patrolMin,
        );
        expect(Math.max(...xs), `${id}: patroller never reached patrolMax ${spawn.patrolMax}`).toBe(
          spawn.patrolMax,
        );
        checked += 1;
      }
    }
    expect(checked, 'no patrol beats were checked').toBeGreaterThan(4);
  });
});
