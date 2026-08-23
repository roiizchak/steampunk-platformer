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
/**
 * 🔴 Through `scavengerFooting`, not by restating `(w / 2) * scale` here.
 *
 * The first version derived these from `SCAVENGER_BOX` directly, which meant every position
 * assertion in this file was measured against the test's own copy of the formula the source had
 * deliberately centralised — so the file could not detect a footing/body desync, which is the exact
 * failure the source's own guard exists to prevent. Raised by the code-reviewer's adversarial brief.
 */
const BODY = scavengerFooting([], SCALE);
const HALF = BODY.halfWidthPx;
const HEIGHT = BODY.heightPx;

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

  /**
   * 🔴 **The three assertions below are what make `heightPx` MEAN anything.**
   *
   * The adversarial brief mutated `headY = feetY - heightPx` to `feetY - 1` — a body one pixel tall
   * — and the entire suite stayed green: 1878 passed, 0 failed. The only test that named the
   * vertical extent put its overhang at `y = -HEIGHT - 500`, so far clear that it passed for ANY
   * height between 1 and 640. Its fixture made the property it claimed to measure unreachable,
   * which is the C2 shape exactly.
   *
   * The behavioural bug that leaves open is the reported one in its vertical form: a ledge at the
   * creature's chest is a wall, and a body too short to reach it walks straight through.
   */
  it('BLOCKS on a ledge at chest height — the vertical extent is real', () => {
    // Body spans [-240, 0]. This solid sits inside it and nowhere near the feet or the head.
    const chest: Rect = { x: 1200, y: -200, w: TILE_SIZE, h: 100 };
    expect(blockedAt(1135, 1141, 0, HALF, HEIGHT, [chest])).toBe(true);
  });

  it('does NOT block on an overhang that clears the head by one pixel', () => {
    // Bottom at -241, one px above the head at -240. Tight on purpose: an overhang parked 500 px
    // clear cannot tell a correct height from a wrong one.
    const overhang: Rect = { x: 1200, y: -HEIGHT - 101, w: TILE_SIZE, h: 100 };
    expect(overhang.y + overhang.h, 'the fixture must sit just above the head').toBe(-HEIGHT - 1);
    expect(blockedAt(1135, 1141, 0, HALF, HEIGHT, [overhang])).toBe(false);
  });

  it('the footing reports the body the SIM uses, not a number this test chose', () => {
    // Without this, `HEIGHT` and `HALF` above could both be wrong together and every assertion in
    // the file would still agree with itself.
    expect(BODY.heightPx).toBe(SCAVENGER_BOX.h * SCALE);
    expect(BODY.halfWidthPx).toBe((SCAVENGER_BOX.w / 2) * SCALE);
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
    /**
     * 🔴 **The position assertion is what makes the `moving` one mean anything.**
     *
     * Without it this test was decoration, and the code-reviewer gate owner proved it: delete the
     * veto entirely and it still PASSES. The unvetoed chaser walks through the wall to x 2106, the
     * player is at 2200, and |2200 - 2106| = 94 is inside `ENEMY_DEAD_ZONE` (96) — so it stops, and
     * `moving` reads false for a completely different reason than the one being asserted. Same
     * class as mutation M20 surviving a loose `/solid/i` match *(vault C2)*.
     */
    expect(s.x + HALF, 'it is held by the WALL, not by the dead zone').toBeLessThanOrEqual(wall.x);
    expect(s.moving).toBe(false);
  });

  it('RECOVERS — it walks away once the player is on the other side', () => {
    const s = createScavenger({ x: 1800, y: 0, patrolMin: 1800, patrolMax: 1800 });
    for (let i = 0; i < 400; i += 1) {
      stepScavenger(s, { playerX: 2200, playerY: 0 }, footing);
    }
    const held = s.x;
    // The chase continues — the player has simply gone the other way.
    //
    // ⚠️ **1400, not 0** *(inventory 2b.1, 2026-08-23)*. From a body held at ~1940 a player at 0 is
    // now outside `releaseRadius` 720, so the chase would END and this would measure a patrol while
    // claiming to measure a recovery. The test is about walking away from the wall, so the player
    // has to be somewhere it is still hunting.
    for (let i = 0; i < 60; i += 1) {
      stepScavenger(s, { playerX: 1400, playerY: 0 }, footing);
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

  it('reports moving:false on the tick the wall vetoes it', () => {
    // The patrol path had no `moving` assertion at all until the code-reviewer gate owner asked for
    // one. The chase path's is above; without this, "the readback covers every veto added later"
    // was a claim about the chase branch only.
    const s = createScavenger({ x: 1000, y: 0, patrolMin: 900, patrolMax: 3000 });
    let vetoed = 0;
    for (let i = 0; i < 2000; i += 1) {
      const before = s.x;
      stepScavenger(s, { playerX: 999999, playerY: 999999 }, footing);
      if (s.x === before) {
        vetoed += 1;
        expect(s.moving, 'held by the wall but still reporting motion').toBe(false);
      }
    }
    expect(vetoed, 'the wall never actually vetoed a step, so nothing above was tested').toBeGreaterThan(0);
  });
});

/**
 * 🔴 A body that STARTS inside a wall must be able to walk out of it.
 *
 * This is the discriminating case for the newly-entered rule, and the shipped levels no longer
 * carry one. level-02's scavenger used to sit with its body straddling the wall at columns 30-31;
 * the A2 placement fix moved the beat, which is correct - and which left the shipped-span sweep
 * below VACUOUS against the regression it was written for. With no shipped body overlapping a
 * solid, an "overlapping" veto would leave every shipped span green. The code-reviewer gate owner
 * measured that and asked for a fixture. Driven through `stepScavenger`, because the question is
 * what the SIM does with such a body, not whether the parser refuses it.
 *
 * ⚠️ What the rule does NOT promise, pinned here so nobody reads more into it: a beat whose END is
 * inside a wall is still SHORTENED. Walking toward that end the body is clear on one tick and
 * inside on the next, which is a newly-entered step and is vetoed. Measured: with the wall at
 * 1000..1096 and `patrolMin` 1140, the turn happens at 1157.5. That is why the level DATA was fixed
 * in A2 rather than the rule being weakened to accommodate it.
 */
describe('a body that starts inside a wall walks out rather than freezing', () => {
  const wall = wallAt(1000);
  const footing = scavengerFooting([GROUND, wall], SCALE);

  it('covers its beat away from the wall instead of being pinned at spawn', () => {
    // Body [1080, 1200] against a wall spanning [1000, 1096]: overlapping by 16 px at rest.
    const s = createScavenger({ x: 1140, y: 0, patrolMin: 1140, patrolMax: 1800 });
    expect(1140 - HALF, 'the fixture must actually overlap, or it proves nothing').toBeLessThan(
      wall.x + TILE_SIZE,
    );

    const xs: number[] = [];
    let moved = 0;
    for (let i = 0; i < 3000; i += 1) {
      stepScavenger(s, { playerX: 999999, playerY: 999999 }, footing);
      xs.push(s.x);
      if (s.moving) moved += 1;
    }
    // An "overlapping" veto freezes it here forever, flipping facing every tick and never moving.
    expect(moved, 'pinned at spawn: it never moved once in 3000 ticks').toBeGreaterThan(0);
    expect(Math.max(...xs), 'it never reached the far end of its beat').toBe(1800);
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
   *
   * ⚠️ **It is VACUOUS against the overlap mutation, and deliberately kept anyway.** The A2 fix
   * moved level-02's beat off its wall, so no shipped body overlaps a solid any more and an
   * "overlapping" veto leaves every span here green. Measured by the code-reviewer gate owner:
   * `checked=11 short=0` under that mutation. The discriminating case moved to the fixture above,
   * *"a body that starts inside a wall walks out rather than freezing"*, which does go red. What
   * this sweep still catches is a beat SHORTENED by any future veto — which is exactly how the
   * level-02 defect was found in the first place.
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
