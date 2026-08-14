/**
 * criterion 5.4/5.7 continuation — `enemyLayer.ts`'s Sprite/Rectangle swap. Its own class doc (read
 * that file first) states the rule this test locks: a `Sprite` when `scene.anims.exists(animKey)`
 * is true, a `Rectangle` fallback otherwise, and the fallback is a DATED temporary, not permanent
 * scaffolding.
 *
 * ## Why this test cannot import a real `Phaser.Scene`
 *
 * `vite.config.ts` runs the unit suite in vitest's `node` environment (no `window`), and the real
 * `phaser` package throws `window is not defined` at import time — confirmed empirically before
 * writing this file. `enemyLayer.ts`'s own `import type Phaser from 'phaser'` is therefore
 * TYPE-ONLY: the class never touches a live Phaser value, only `this.scene.add.*` return values, so
 * this file drives it with a plain object shaped like the corner of `Phaser.Scene` it actually
 * calls, and casts it past the type at the call site the same way `enemyLayer.ts` itself does.
 *
 * ## What this file does NOT cover
 *
 * The frame-0 guard's REAL failure mode — a looping clip visibly frozen on screen — needs a live
 * `sprite.anims.currentFrame` sampled across real animation frames, which is Playwright's job, not
 * this file's. What IS covered here: the exact LOGIC of the guard (`play()` called once per actual
 * animation-key change, never once per `sync()` call), against a mock `Sprite` whose `anims.getName`
 * reads back its own last `play()` argument — the same shape the mutation below breaks.
 */
import { describe, expect, it } from 'vitest';

import type Phaser from 'phaser';

import fixtureCatalog from '../fixtures/enemy-catalog-full.json';
import { EnemyLayer } from '../../src/scenes/enemyLayer';
import { enemyAnimKeys } from '../../src/render/enemyView';
import { createWorld } from '../../src/sim/tick';

const SHIPPED_CATALOG = import.meta.glob('../../public/assets/index.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function shippedSheetKeys(): string[] {
  const [raw] = Object.values(SHIPPED_CATALOG);
  const parsed = JSON.parse(raw) as { sheets: { key: string }[] };
  return parsed.sheets.map((sheet) => sheet.key);
}

// ---- a minimal stand-in for the corner of Phaser.Scene / GameObjects that EnemyLayer touches ----

interface MockSprite {
  animKey: string;
  playCalls: string[];
  flipXCalls: boolean[];
  anims: { getName: () => string };
  // `playIfChanged` (R4/R10) reads `sprite.scene.anims.exists`, exactly as a real
  // `Phaser.GameObjects.Sprite` does — the mock carries it back for the same reason.
  scene: unknown;
  setOrigin: (x: number, y: number) => MockSprite;
  setDepth: (d: number) => MockSprite;
  setFlipX: (f: boolean) => MockSprite;
  setAlpha: (a: number) => MockSprite;
  setPosition: (x: number, y: number) => MockSprite;
  play: (key: string) => MockSprite;
}

function makeMockSprite(initialKey: string, scene: unknown): MockSprite {
  const sprite: MockSprite = {
    animKey: initialKey,
    playCalls: [],
    flipXCalls: [],
    scene,
    anims: { getName: () => sprite.animKey },
    setOrigin: () => sprite,
    setDepth: () => sprite,
    setFlipX: (f) => {
      sprite.flipXCalls.push(f);
      return sprite;
    },
    setAlpha: () => sprite,
    setPosition: () => sprite,
    play: (key) => {
      sprite.playCalls.push(key);
      sprite.animKey = key;
      return sprite;
    },
  };
  return sprite;
}

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

function makeMockScene(existsKeys: ReadonlySet<string>) {
  const rectangles: MockRect[] = [];
  const sprites: MockSprite[] = [];
  const scene = {
    anims: { exists: (key: string) => existsKeys.has(key) },
    add: {
      rectangle: (..._args: unknown[]) => {
        const r = makeMockRect();
        rectangles.push(r);
        return r;
      },
      sprite: (_x: number, _y: number, key: string) => {
        const s = makeMockSprite(key, scene);
        sprites.push(s);
        return s;
      },
      graphics: () => makeMockGraphics(),
    },
  };
  return { scene: scene as unknown as Phaser.Scene, rectangles, sprites };
}

function buildWorld() {
  return createWorld({
    seed: 1,
    scale: 1,
    enemies: [
      { slug: 'brass-sentry', x: 0, y: 0, patrolMin: 0, patrolMax: 0 },
      { slug: 'rust-scavenger', x: 100, y: 0, patrolMin: -50, patrolMax: 50 },
    ],
  });
}

describe('the Rectangle fallback is a dated temporary, not permanent scaffolding', () => {
  /**
   * 🔴 **This assertion has now flipped, and that is the milestone it was written to detect.**
   *
   * It began as "zero enemy sheets today", became "some but not yet all" when `brass-sentry-idle`
   * shipped, and expired for real in session 10 when `brass-sentry/fire` and `brass-sentry/death`
   * were packed — the last two of the six. It ran red, on schedule, on the commit that completed
   * the set. That is a dated expiry doing exactly its job, not a regression.
   *
   * So it is rewritten to the state that is now true, and it still goes red in both directions: if
   * an enemy key is renamed or a sheet is dropped, the set stops being complete.
   *
   * **The Rectangle fallback is no longer reachable from shipped content.** It is NOT dead code —
   * `enemyLayer` must still cope with a scene where an anim key is unregistered (a partial load, a
   * new slug added before its art) — and the mock-scene tests below are what keep that path
   * exercised. What has ended is the fallback being reachable *in the shipped game*.
   */
  it('the shipped catalog now carries EVERY enemyAnimKeys() row — the fallback is no longer reachable in play', () => {
    const shipped = new Set(shippedSheetKeys());
    const all = enemyAnimKeys();
    const missing = all.filter((key) => !shipped.has(key));
    expect(
      missing,
      `these enemy animations have no shipped sheet: ${missing.join(', ')} — either the art was ` +
        'dropped or a key was renamed. Every enemy action must resolve to a real catalog row.',
    ).toEqual([]);
    // Guards the other direction: an empty `enemyAnimKeys()` would make the line above vacuous.
    expect(all.length, 'enemyAnimKeys() is empty — the assertion above proves nothing').toBe(6);
  });

  it('the fixture carries all six enemyAnimKeys() rows, or the expiry test below proves nothing', () => {
    const fixtureKeys = new Set(fixtureCatalog.sheets.map((sheet) => sheet.key));
    expect(fixtureKeys.size).toBe(6);
    expect(fixtureKeys).toEqual(new Set(enemyAnimKeys()));
  });

  it("draws Rectangles when no enemy anim key is registered — today's real state", () => {
    const { scene, rectangles, sprites } = makeMockScene(new Set());
    const layer = new EnemyLayer(scene, buildWorld());
    layer.create();

    expect(rectangles.length).toBe(2);
    expect(sprites.length).toBe(0);
  });

  it('EXPIRY: draws Sprites, not Rectangles, once every enemyAnimKeys() key is registered', () => {
    const fixtureKeys = new Set(fixtureCatalog.sheets.map((sheet) => sheet.key));
    const { scene, rectangles, sprites } = makeMockScene(fixtureKeys);
    const layer = new EnemyLayer(scene, buildWorld());
    layer.create();

    expect(sprites.length).toBe(2);
    expect(rectangles.length).toBe(0);
  });
});

describe('a chasing enemy is not a Rectangle forever (FIX 1)', () => {
  it('a scavenger asking for chase falls back to the catalogued walk key — real shipped shape has only walk', () => {
    const world = buildWorld();
    world.enemies.scavengers[0]!.chasing = true;
    // Mirrors the shipped catalog exactly: brass-sentry-idle and rust-scavenger-walk only.
    const { scene, rectangles, sprites } = makeMockScene(new Set(['brass-sentry-idle', 'rust-scavenger-walk']));
    const layer = new EnemyLayer(scene, world);
    layer.create();

    expect(rectangles.length, 'a chasing scavenger with a walk sheet must not fall back to a grey box').toBe(0);
    expect(sprites.length).toBe(2);
    // sentries are added before scavengers in create() (see class doc), so index 1 is the scavenger.
    expect(sprites[1]!.playCalls[0]).toBe('rust-scavenger-walk');
  });
});

describe('the Sprite path (criterion 5.4)', () => {
  it("applies the scavenger's flipX, which nothing drew before this swap", () => {
    const fixtureKeys = new Set(fixtureCatalog.sheets.map((sheet) => sheet.key));
    const world = buildWorld();
    world.enemies.scavengers[0]!.facing = -1;

    const { scene, sprites } = makeMockScene(fixtureKeys);
    new EnemyLayer(scene, world).create();

    expect(sprites[1]!.flipXCalls).toContain(true);
  });

  it('does not restart an unchanged animation every sync() — the frame-0 guard', () => {
    const fixtureKeys = new Set(fixtureCatalog.sheets.map((sheet) => sheet.key));
    const world = buildWorld();
    const { scene, sprites } = makeMockScene(fixtureKeys);
    const layer = new EnemyLayer(scene, world);
    layer.create();

    const scavengerSprite = sprites[1]!;
    expect(scavengerSprite.playCalls.length).toBe(1); // the initial play() in addBody

    layer.sync(1);
    layer.sync(1);
    layer.sync(1);
    // Same state across three syncs — a correct guard calls play() zero more times. The mutation
    // that deletes the getName() comparison makes this 4, not 1.
    expect(scavengerSprite.playCalls.length).toBe(1);

    // A real animation change: kill the scavenger, so scavengerAnim() switches to 'death'.
    world.enemies.scavengers[0]!.hp = 0;
    layer.sync(1);
    expect(scavengerSprite.playCalls.length).toBe(2);
    expect(scavengerSprite.playCalls[1]).toBe('rust-scavenger-death');
  });
});
