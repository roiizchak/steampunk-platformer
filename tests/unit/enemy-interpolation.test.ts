/**
 * Enemies are drawn BETWEEN ticks, exactly as the player is.
 *
 * ## The defect, and why nothing was watching
 *
 * Session 9 fixed the player's "ghost": the sim advances in whole 60 Hz ticks, so on a faster
 * display most frames drain zero ticks and re-draw an identical world, then jump. `interpolate.ts`
 * blends the drawn position across the leftover accumulator, and `interpolate.test.ts` gates the
 * blending FUNCTION thoroughly.
 *
 * **What no test asked was who calls it.** Only `GameScene.renderPlayer` did. Every enemy kept being
 * drawn at raw tick positions — and the defect got *more* visible for having been fixed on the
 * character standing next to them. The user's report, 2026-08-14, names the comparison exactly:
 * *"the scavenger's animation is not smooth like my character."*
 *
 * That is the shape vault 5.3 warns about, one step out: a correct, well-tested decision function
 * with a consumer that was never checked for completeness. So these assertions are about the
 * WIRING — that `EnemyLayer` actually moves a body to a blended position — and not about the
 * arithmetic, which `interpolate.test.ts` already owns.
 *
 * It runs against a mock scene rather than Phaser, the same harness `enemy-layer-growth.test.ts`
 * uses, because the thing under test is which numbers reach `setPosition`.
 */

import { describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import { EnemyLayer } from '../../src/scenes/enemyLayer';
import { MAX_LEAP_PX } from '../../src/render/interpolate';
import { createWorld } from '../../src/sim/tick';

/** Records every position it is moved to, which is the whole point of the mock. */
interface TrackedRect {
  positions: { x: number; y: number }[];
  setOrigin: () => TrackedRect;
  setDepth: () => TrackedRect;
  setFillStyle: () => TrackedRect;
  setAlpha: () => TrackedRect;
  setPosition: (x: number, y: number) => TrackedRect;
}

function makeTrackedRect(): TrackedRect {
  const rect: TrackedRect = {
    positions: [],
    setOrigin: () => rect,
    setDepth: () => rect,
    setFillStyle: () => rect,
    setAlpha: () => rect,
    setPosition: (x: number, y: number) => {
      rect.positions.push({ x, y });
      return rect;
    },
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

function makeMockScene() {
  const rectangles: TrackedRect[] = [];
  const scene = {
    anims: { exists: () => false },
    add: {
      rectangle: (..._args: unknown[]) => {
        const r = makeTrackedRect();
        rectangles.push(r);
        return r;
      },
      sprite: () => {
        throw new Error('no anim keys registered, sprite() should not be called');
      },
      graphics: () => makeMockGraphics(),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, rectangles };
}

/** One scavenger at x = 100, scale 1 so a sim px is a drawn px and the numbers stay readable. */
function harness() {
  const world = createWorld({
    seed: 1,
    scale: 1,
    enemies: [{ slug: 'rust-scavenger', x: 100, y: 0, patrolMin: -5000, patrolMax: 5000 }],
  });
  const { scene, rectangles } = makeMockScene();
  const layer = new EnemyLayer(scene, world);
  layer.create();
  return { world, layer, rectangles };
}

/** The x the body was last moved to. */
function drawnX(rect: TrackedRect): number {
  return rect.positions[rect.positions.length - 1]!.x;
}

describe('EnemyLayer draws each enemy between the last two ticks', () => {
  it('at alpha 0.5 the body is drawn HALFWAY, not at either tick position', () => {
    const { world, layer, rectangles } = harness();
    const body = rectangles[0]!;

    layer.snapshot(); // enemy is at 100
    world.enemies.scavengers[0]!.x = 106; // one tick of chasing, 6 px
    layer.sync(0.5);

    expect(
      drawnX(body),
      'the enemy was at 100 last tick and is at 106 now, so a frame halfway between them draws ' +
        'at 103. Drawing at 106 is the tick-stepping the user reported; drawing at 100 is a full ' +
        'tick of lag.',
    ).toBe(103);
  });

  it('reaches BOTH endpoints exactly, so a full tick lands where the sim says', () => {
    const { world, layer, rectangles } = harness();
    const body = rectangles[0]!;

    layer.snapshot();
    world.enemies.scavengers[0]!.x = 106;

    layer.sync(0);
    expect(drawnX(body)).toBe(100);
    layer.sync(1);
    expect(drawnX(body)).toBe(106);
  });

  it('draws at the current position before any snapshot has been taken', () => {
    // The first frame has no previous tick. The honest answer is `cur`, never a guess — the same
    // contract `prevPlayer === null` carries.
    const { layer, rectangles } = harness();
    layer.sync(0.5);
    expect(drawnX(rectangles[0]!)).toBe(100);
  });

  it('snaps rather than sliding when an enemy is TELEPORTED', () => {
    const { world, layer, rectangles } = harness();
    const body = rectangles[0]!;

    layer.snapshot();
    world.enemies.scavengers[0]!.x = 100 + MAX_LEAP_PX + 1;
    layer.sync(0.5);

    // A respawn or a dev spawn moves a body instantly. Blending across one slides the sprite
    // through the level over a single tick, which is worse than the stepping being removed.
    expect(drawnX(body)).toBe(100 + MAX_LEAP_PX + 1);
  });

  /**
   * 🔴 The assertion that would have caught the original defect on its own.
   *
   * Every test above passes `alpha` explicitly, so all of them would still pass against a layer
   * that IGNORED it and drew at the sim position — as long as `alpha` happened to be 1. This one
   * cannot: it sweeps the whole open interval and demands the drawn position actually vary.
   */
  it('actually consumes alpha — the drawn position varies across a tick, it does not step', () => {
    const { world, layer, rectangles } = harness();
    const body = rectangles[0]!;

    layer.snapshot();
    world.enemies.scavengers[0]!.x = 106;

    const drawn = [0.1, 0.3, 0.5, 0.7, 0.9].map((alpha) => {
      layer.sync(alpha);
      return drawnX(body);
    });

    expect(new Set(drawn).size, `every frame drew at the same x: ${drawn.join(', ')}`).toBe(5);
    // Monotonic, and strictly inside the two tick positions.
    for (const [i, x] of drawn.entries()) {
      expect(x).toBeGreaterThan(100);
      expect(x).toBeLessThan(106);
      if (i > 0) expect(x).toBeGreaterThan(drawn[i - 1]!);
    }
  });
});
