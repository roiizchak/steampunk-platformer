/**
 * `EnemyLayer` builds one body per enemy in `create()` and never again. `sync()`'s per-enemy loop
 * hits `if (body === undefined) { continue; }` for anything appended afterwards, so a dev-spawned
 * enemy gets neither a body nor a health bar — silently. This is the growth path that criterion
 * 5.11 (worst-case enemy count, counted visible sprites) depends on: a dev spawn added after
 * `create()` must still get drawn.
 */
import { describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import { EnemyLayer } from '../../src/scenes/enemyLayer';
import { createScavenger } from '../../src/sim/enemies';
import { createWorld } from '../../src/sim/tick';

interface MockRect {
  setOrigin: (x: number, y: number) => MockRect;
  setDepth: (d: number) => MockRect;
  setFillStyle: (c: number) => MockRect;
  setAlpha: (a: number) => MockRect;
  setPosition: (x: number, y: number) => MockRect;
}

function makeMockRect(): MockRect {
  const rect: MockRect = {
    setOrigin: () => rect,
    setDepth: () => rect,
    setFillStyle: () => rect,
    setAlpha: () => rect,
    setPosition: () => rect,
  };
  return rect;
}

function makeMockGraphics() {
  const g = {
    setDepth: () => g,
    clear: () => g,
    fillStyle: () => g,
    fillRect: () => g,
    fillCircle: () => g,
  };
  return g;
}

// No enemy sheet is registered, so every body is a Rectangle — the fallback path is what makes
// `rectangles.length` a direct proxy for "how many bodies exist" here.
function makeMockScene() {
  const rectangles: MockRect[] = [];
  const scene = {
    anims: { exists: () => false },
    add: {
      rectangle: (..._args: unknown[]) => {
        const r = makeMockRect();
        rectangles.push(r);
        return r;
      },
      sprite: () => {
        throw new Error('makeMockScene: no anim keys registered, sprite() should not be called');
      },
      graphics: () => makeMockGraphics(),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, rectangles };
}

function buildWorld() {
  return createWorld({
    seed: 1,
    scale: 1,
    enemies: [{ slug: 'rust-scavenger', x: 100, y: 0, patrolMin: -50, patrolMax: 50 }],
  });
}

describe('EnemyLayer.sync() grows bodies for enemies appended after create()', () => {
  it('draws a body for a scavenger appended to world.enemies.scavengers post-create', () => {
    const world = buildWorld();
    const { scene, rectangles } = makeMockScene();
    const layer = new EnemyLayer(scene, world);
    layer.create();

    expect(rectangles.length).toBe(1);

    world.enemies.scavengers.push(
      createScavenger({ x: 300, y: 0, patrolMin: 250, patrolMax: 350 }),
    );

    layer.sync();

    // A body must now exist for the appended enemy — proven by a second Rectangle having been
    // built, not merely by sync() not throwing.
    expect(rectangles.length, 'the appended enemy got neither a body nor a bar').toBe(2);
  });
});
