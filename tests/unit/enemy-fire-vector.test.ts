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
