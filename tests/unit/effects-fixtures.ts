/**
 * The fake scene `effects-behaviour.test.ts` drives `attachEffects` against.
 *
 * A shared fixture rather than a second copy, in `hitstop-fixtures.ts`'s shape and for the same
 * reason: the two describe blocks that grew out of the Codex implementation round carried this file
 * past the 400-line rule, and duplicating an 85-line fake scene is how two harnesses drift apart.
 *
 * It records rather than asserts — every claim stays in the test that makes it.
 */

import type Phaser from 'phaser';

import { type EffectKind } from '../../src/render/effects';
import { attachEffects } from '../../src/scenes/gameEffects';
import { createWorld } from '../../src/sim/tick';
import { shakeSafeMargin } from '../../src/render/screenShake';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';

export interface Explosion {
  kind: EffectKind;
  count: number;
  x: number;
  y: number;
}

/**
 * Where the camera sits when it is NOT shaking.
 *
 * 🔴 **Re-taken 2026-08-23 for inventory 2b.7.** This used to be an arbitrary `{ x: 40, y: 25 }` —
 * a value the fixture chose to prove `attachEffects` restored *whatever it found*. That is no
 * longer what the code does: `attachEffects` now **sets** the viewport, growing it by the shake
 * margin and moving its origin to `-margin`, so a shake cannot uncover the page background.
 *
 * So the unshaken origin is a **derived** value, and the fixture derives it the same way the
 * production code does rather than restating a literal *(vault 5.3)*. `{ -10, -8 }` at the design
 * size — `lethal.ax` 0.005 × 1920 → 10, `playerHurt.ay` 0.007 × 1080 → 8 — and it moves on its own
 * if anyone tunes the shake table, which a literal would not.
 */
const MARGIN = shakeSafeMargin(GAME_WIDTH, GAME_HEIGHT);
export const BASE = { x: -MARGIN.x, y: -MARGIN.y };

/** What the camera's viewport is BEFORE `attachEffects` grows it — deliberately not the base. */
const PRE_ATTACH = { x: 40, y: 25 };

/**
 * Attach the effects to a recording fake scene.
 *
 * `spawn` defaults to the grey-box spawn, which sits ON the platform — pass a point in mid-air when
 * the test needs a real fall to land from.
 */
export function build(spawn?: { x: number; y: number }) {
  const explosions: Explosion[] = [];
  const destroyed: EffectKind[] = [];
  const scales: [number, number][] = [];
  const listeners: { name: string; fn: () => void }[] = [];

  const built: Record<string, { depth: number | null; blend: number | null }> = {};

  const emitter = (kind: EffectKind) => {
    const seen = { depth: null as number | null, blend: null as number | null };
    built[kind] = seen;
    const e = {
      setDepth: (d: number) => {
        seen.depth = d;
        return e;
      },
      setBlendMode: (m: number) => {
        seen.blend = m;
        return e;
      },
      reserve: () => e,
      setEmitterAngle: () => e,
      explode: (count: number, x: number, y: number) => {
        explosions.push({ kind, count, x, y });
      },
      destroy: () => destroyed.push(kind),
    };
    return e;
  };

  const camera = {
    x: PRE_ATTACH.x,
    y: PRE_ATTACH.y,
    width: 1920,
    height: 1080,
    setPosition(x: number, y: number) {
      camera.x = x;
      camera.y = y;
      return camera;
    },
    // Real Phaser resizes the viewport RECTANGLE here — `attachEffects` grows it by the shake
    // margin so a shake cannot uncover the page background *(inventory 2b.7)*. The fake tracks it
    // because a fake more generous than the real API is worse than no fake at all, and this
    // project already owns one of those.
    setSize(width: number, height: number) {
      camera.width = width;
      camera.height = height;
      return camera;
    },
  };

  // Keyed off the texture key `ensureParticleTexture` returns, which encodes the kind — the only
  // route from `scene.add.particles(...)` back to which emitter is being built.
  const scene = {
    add: { particles: (_x: number, _y: number, key: string) => emitter(key.split('-').pop() as EffectKind) },
    textures: { exists: () => true },
    cameras: { main: camera },
    events: { once: (name: string, fn: () => void) => listeners.push({ name, fn }) },
  };

  const playerSprite = { setScale: (sx: number, sy: number) => scales.push([sx, sy]) };
  const world = createWorld({
    seed: 1,
    scale: 1,
    spawn,
    enemies: [{ slug: 'brass-sentry', x: 400, y: 0, patrolMin: 400, patrolMax: 400 }],
  });
  const effects = attachEffects(
    scene as unknown as Phaser.Scene,
    world,
    playerSprite as unknown as Phaser.GameObjects.Sprite,
  );
  return {
    effects,
    world,
    camera,
    explosions,
    destroyed,
    scales,
    built,
    listeners,
    sentry: world.enemies.sentries[0]!,
    render: () => effects.render(world, camera as unknown as Phaser.Cameras.Scene2D.Camera),
  };
}
