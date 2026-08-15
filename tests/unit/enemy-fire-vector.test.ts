/**
 * W6 — the sentry's shot-time firing vector, frozen at spawn.
 *
 * `fireProjectile` in `projectiles.ts` aims once, at spawn, and never again — that is what makes a
 * shot dodgeable. But nothing on `Sentry` recorded WHICH way it fired, so a later renderer picking
 * flat-vs-elevated art by "the player's current position" would swing the barrel during the 18-tick
 * fire window after the bolt had already left — telegraphing a trajectory the shot does not take.
 *
 * These tests drive the real `tick()`, the same way `tick-world-damage.test.ts` does, so the gap
 * under test is "does the FULL tick loop freeze the value", not "does a helper compute it once".
 */

import { describe, expect, it } from 'vitest';

import { SENTRY } from '../../src/sim/enemies';
import { createSnapshot } from '../../src/sim/input';
import { createWorld, tick } from '../../src/sim/tick';
import type { Rect, World } from '../../src/sim/types';

const SCALE = 6;
const FLOOR: Rect[] = [{ x: 0, y: 960, w: 4000, h: 120 }];
const BOUNDS = { widthPx: 4000, heightPx: 1080 };
const SENTRY_X = 1000;
const SENTRY_Y = 960;

/** A sentry at (1000, 960) and a player spawned wherever the test needs it, both on the one floor. */
function worldWith(spawnX: number, spawnY: number): World {
  return createWorld({
    seed: 1,
    scale: SCALE,
    solids: FLOOR,
    bounds: BOUNDS,
    spawn: { x: spawnX, y: spawnY },
    enemies: [{ slug: 'brass-sentry' as const, x: SENTRY_X, y: SENTRY_Y, patrolMin: SENTRY_X, patrolMax: SENTRY_X }],
  });
}

const IDLE = createSnapshot();

describe('a sentry that has never fired', () => {
  it('reports the absent value, not 0,0', () => {
    const world = worldWith(1300, 960);
    const sentry = world.enemies.sentries[0]!;
    expect(sentry.lastFireDx).toBeNull();
    expect(sentry.lastFireDy).toBeNull();
  });
});

describe('the stored vector on the tick a shot is fired', () => {
  it('is an up-and-to-the-right target: dx > 0, dy < 0, both integers', () => {
    // Player at (1300, 650): to the sentry's right and well above it.
    const world = worldWith(1300, 650);
    tick(world, { ...IDLE });
    const sentry = world.enemies.sentries[0]!;
    expect(sentry.lastFireDx).not.toBeNull();
    expect(sentry.lastFireDx).toBeGreaterThan(0);
    expect(sentry.lastFireDy).toBeLessThan(0);
    expect(Number.isInteger(sentry.lastFireDx)).toBe(true);
    expect(Number.isInteger(sentry.lastFireDy)).toBe(true);
  });

  it('is a down-and-to-the-left target: dx < 0, dy > 0, both integers', () => {
    // Player at (700, 1300): to the sentry's left and well below it.
    const world = worldWith(700, 1300);
    tick(world, { ...IDLE });
    const sentry = world.enemies.sentries[0]!;
    expect(sentry.lastFireDx).toBeLessThan(0);
    expect(sentry.lastFireDy).toBeGreaterThan(0);
    expect(Number.isInteger(sentry.lastFireDx)).toBe(true);
    expect(Number.isInteger(sentry.lastFireDy)).toBe(true);
  });
});

describe('the frozen-vector defect itself', () => {
  it('does not change while the player moves through the whole 18-tick fire window', () => {
    const world = worldWith(1300, 960);
    tick(world, { ...IDLE }); // fires this tick — cooldown starts ready
    const sentry = world.enemies.sentries[0]!;
    const dx = sentry.lastFireDx;
    const dy = sentry.lastFireDy;
    expect(dx).not.toBeNull();

    // 18 ticks — the fire animation's window (`SENTRY_FIRE_TICKS` in `enemyView.ts`) — with the
    // player moving on every single one. `SENTRY.cooldown` is 90, so nothing re-fires in this span.
    for (let i = 0; i < 18; i += 1) {
      world.player.x += 40;
      tick(world, { ...IDLE });
      expect(sentry.lastFireDx).toBe(dx);
      expect(sentry.lastFireDy).toBe(dy);
    }
  });

  it('updates on the next shot once the cooldown elapses', () => {
    const world = worldWith(1300, 960);
    tick(world, { ...IDLE }); // first shot, counter resets to 0
    const sentry = world.enemies.sentries[0]!;
    const firstDx = sentry.lastFireDx;

    // Move to the sentry's other side and hold there through the whole cooldown.
    world.player.x = 700;
    // `stepSentry` fires again on the tick its counter reaches `cooldown` (90) — see enemies.ts.
    for (let i = 0; i < SENTRY.cooldown; i += 1) {
      tick(world, { ...IDLE });
    }

    expect(sentry.lastFireDx).not.toBeNull();
    expect(sentry.lastFireDx).not.toBe(firstDx);
    expect(sentry.lastFireDx).toBeLessThan(0); // player is now to the sentry's left
  });
});

/**
 * The shot is born at the CANNON, not inside the machine.
 *
 * Reported by the user from a screen recording: the sentry "fires from its belly". It did — the
 * spawn was `(sentry.x, sentry.y - SENTRY_BOX.h / 2 * scale)`, i.e. the body's horizontal centre at
 * its vertical middle, with no muzzle offset anywhere. The two defects were linked: there was no
 * `facing` on a sentry until session 8, so there was no direction to offset ALONG.
 *
 * **The expected offsets here are hardcoded on purpose** *(C2)*. They are an independent
 * measurement of the shipped `brass-sentry/idle` sheet — the centroid of the outermost 14 columns
 * of the barrel, averaged over all 8 frames, in cell pixels against the sprite's `(0.5, 1)` origin:
 * `+106.8 x`, `-135.8 y`, spread 3.5 and 9.3 px. Deriving them from `SENTRY_MUZZLE` instead would
 * assert the production constant against itself and could never go red.
 *
 * `addBody` (`enemyLayer.ts`) never calls `setDisplaySize`, so the sprite draws at its native
 * 288x384 cell and one cell pixel IS one world pixel — which is what makes a sheet measurement a
 * legitimate source for a sim constant.
 */
describe('where the shot is actually born (the belly-shot defect)', () => {
  const MUZZLE_DX = 106.8; // world px forward of the feet, at scale 6
  const MUZZLE_DY = -135.6; // world px above the feet (`+y` is down in world space)
  const TOLERANCE = 6; // one local unit — the frame-to-frame spread is smaller than this

  it('spawns at the muzzle, not the body centre, when firing right', () => {
    const world = worldWith(1300, 960); // player to the right, so `facing` is 1
    tick(world, { ...IDLE });
    const shot = world.projectiles[0]!;
    expect(shot.x).toBeCloseTo(SENTRY_X + MUZZLE_DX, -0.5);
    expect(Math.abs(shot.x - (SENTRY_X + MUZZLE_DX))).toBeLessThan(TOLERANCE);
  });

  it('spawns at muzzle HEIGHT, not the vertical middle of the body', () => {
    const world = worldWith(1300, 960);
    tick(world, { ...IDLE });
    const shot = world.projectiles[0]!;
    expect(Math.abs(shot.y - (SENTRY_Y + MUZZLE_DY))).toBeLessThan(TOLERANCE);
    // The defect this pins: mid-body is `SENTRY_Y - 96`, a full 39px below the barrel. An x-only
    // test would let the shot keep coming out of the belly and still pass.
    expect(shot.y).not.toBeCloseTo(SENTRY_Y - 96, 0);
  });

  it('mirrors the muzzle onto the other side when firing left', () => {
    const world = worldWith(700, 960); // player to the left, so `facing` is -1
    tick(world, { ...IDLE });
    const sentry = world.enemies.sentries[0]!;
    expect(sentry.facing).toBe(-1);
    const shot = world.projectiles[0]!;
    expect(Math.abs(shot.x - (SENTRY_X - MUZZLE_DX))).toBeLessThan(TOLERANCE);
    // Not merely "left of centre" — a barrel that failed to mirror would sit BEHIND the turret.
    expect(shot.x).toBeLessThan(SENTRY_X);
  });

  it('freezes lastFireDx and lastFireDy from the MUZZLE, not from the body centre', () => {
    const world = worldWith(1300, 650);
    // Sampled BEFORE the tick, deliberately. Enemies take their turn at step 4a, which runs before
    // the player integrates at step 8 — so the sighting the sentry aims with is the player's
    // position as of the END OF LAST TICK, and reading `world.player.y` afterwards is off by one
    // tick of gravity (2px here). Asserting against the post-tick value would not have been a
    // weaker test, it would have been a WRONG one.
    const playerXAtFire = world.player.x;
    const chestYAtFire = world.player.y - (48 / 2) * SCALE; // PLAYER_BOX.h is 48, hand-substituted

    tick(world, { ...IDLE });
    const sentry = world.enemies.sentries[0]!;
    const shot = world.projectiles[0]!;
    // The stored vector must describe the shot that actually left. Its own docstring says
    // "muzzle->chest"; measuring dx from `sentry.x` while spawning at the muzzle desynchronises
    // the two silently, and every other assertion in this file is sign-only with 300px of margin.
    expect(sentry.lastFireDx).toBe(Math.round(playerXAtFire - shot.x));
    expect(sentry.lastFireDy).toBe(Math.round(chestYAtFire - shot.y));
    // Non-vacuity: the old code measured dx from `sentry.x`, so pin that these now DIFFER by the
    // muzzle offset rather than happening to agree.
    expect(sentry.lastFireDx).not.toBe(Math.round(playerXAtFire - SENTRY_X));
  });
});
