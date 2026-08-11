/**
 * `playAnim.ts`'s `playIfChanged` — R4 (missing-key guard, checked at play time) and R10 (one
 * implementation of the frame-0 guard, used by both `enemyLayer.ts` and `GameScene.ts`).
 *
 * Mock sprite/scene, no real Phaser — `playAnim.ts` only ever touches `anims.getName()`,
 * `scene.anims.exists()` and `play()`, so a plain object stands in exactly as `enemyLayer.ts`'s own
 * unit test already does for `EnemyLayer` itself.
 */

import { describe, expect, it } from 'vitest';

import { playIfChanged } from '../../src/scenes/playAnim';

// Raw source via Vite's `import.meta.glob`, matching the pattern already established in
// `docs-contract.test.ts` and `enemy-layer-catalog.test.ts` — this project's tests do not read the
// filesystem with node:fs.
const SOURCES = import.meta.glob(['../../src/scenes/enemyLayer.ts', '../../src/scenes/GameScene.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function sourceOf(fileName: string): string {
  const [, text] = Object.entries(SOURCES).find(([key]) => key.endsWith(fileName))!;
  return text;
}

function mockSprite(currentName: string, existingKeys: string[]) {
  const playCalls: string[] = [];
  const sprite = {
    anims: { getName: () => currentName },
    play: (key: string) => playCalls.push(key),
  } as unknown as import('phaser').GameObjects.Sprite;
  (sprite as unknown as { scene: unknown }).scene = {
    anims: { exists: (key: string) => existingKeys.includes(key) },
  };
  return { sprite, playCalls };
}

describe('playIfChanged', () => {
  it('plays exactly once on a real key change', () => {
    const { sprite, playCalls } = mockSprite('idle', ['idle', 'walk']);
    playIfChanged(sprite, 'walk');
    expect(playCalls).toEqual(['walk']);
  });

  it('plays zero times on a repeated key', () => {
    const { sprite, playCalls } = mockSprite('walk', ['idle', 'walk']);
    playIfChanged(sprite, 'walk');
    expect(playCalls).toEqual([]);
  });

  it('plays zero times on a missing key — R4, checked at play time', () => {
    const { sprite, playCalls } = mockSprite('walk', ['idle', 'walk']); // 'death' not built yet
    playIfChanged(sprite, 'death');
    expect(playCalls).toEqual([]);
  });
});

describe('both call sites route through the helper (R10)', () => {
  it('enemyLayer.ts imports playIfChanged and never calls sprite.play() directly in sync()', () => {
    const src = sourceOf('enemyLayer.ts');
    expect(src).toMatch(/import\s*\{\s*playIfChanged\s*\}\s*from\s*'\.\/playAnim'/);
    expect(src).toContain('playIfChanged(sprite, desc.animKey)');
  });

  it("GameScene.ts's renderPlayer imports playIfChanged and never calls playerSprite.play() directly", () => {
    const src = sourceOf('GameScene.ts');
    expect(src).toMatch(/import\s*\{\s*playIfChanged\s*\}\s*from\s*'\.\/playAnim'/);
    expect(src).toContain('playIfChanged(this.playerSprite, desc.animKey)');
    // The old inline getName()-guarded call must be gone from renderPlayer, not just added
    // alongside it.
    const renderPlayer = src.slice(src.indexOf('private renderPlayer('), src.indexOf('private renderPlayer(') + 800);
    expect(renderPlayer).not.toContain('this.playerSprite.play(desc.animKey)');
  });
});
