import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { drawFrame, type FrameDrawContext } from '../../src/scenes/gameFrameDraw';
import { createWorld } from '../../src/sim/tick';
import type { Rect } from '../../src/sim/types';

/**
 * # The frame's draw ORDER, not merely its draw calls
 *
 * `gameFrameDraw.ts` is `GameScene.ts`'s **seventh** extraction. Splitting a file moves code out of
 * whatever coverage the original had and nothing notices — this project shipped exactly that defect
 * once, in the six modules T13 named, one of which could have drawn all three backgrounds over the
 * player with every gate green.
 *
 * So the extraction owes a gate, and CLAUDE.md prefers the **behavioural** shape: `gameFrameDraw.ts`
 * takes Phaser as a **type-only** import, so the whole path runs against fakes.
 *
 * ## Why order and not just presence
 *
 * Three of these calls are order-dependent and the dependency is invisible from any one of them:
 *
 * - `renderParallax` reads `camera.scrollX` and must run **after** the camera has followed the
 *   player, or the backgrounds lag the world by a frame — which reads as swimming, not as latency.
 * - `publish` must be **last**, so `window.__game` describes a frame that was actually drawn. Every
 *   e2e spec's `ready` wait rests on that.
 * - the HUD and effects passes read the camera the player's position drove.
 *
 * A test that only asserted "all seven were called" would pass on any permutation, including the
 * ones that produce those defects.
 *
 * **The mutations this file names:** move `renderParallax` above `renderPlayerSprite`; move
 * `publish` off the end.
 */

const FLOOR: Rect[] = [{ x: -2000, y: 2000, w: 20000, h: 400 }];

function fakeContext(): { ctx: FrameDrawContext; order: string[] } {
  const order: string[] = [];
  const world = createWorld({
    seed: 1,
    scale: 6,
    solids: FLOOR,
    bounds: { widthPx: 20000, heightPx: 4000 },
    spawn: { x: 600, y: 2000 },
  });

  // A sprite fake that records nothing but survives being written to — `renderPlayerSprite` sets
  // frame, flip and position on it.
  const playerSprite = {
    setTexture() {
      return playerSprite;
    },
    setFrame() {
      order.push('player');
      return playerSprite;
    },
    setFlipX() {
      return playerSprite;
    },
    setPosition() {
      return playerSprite;
    },
    setScale() {
      return playerSprite;
    },
    setTint() {
      return playerSprite;
    },
    clearTint() {
      return playerSprite;
    },
    setAlpha() {
      return playerSprite;
    },
    anims: {
      play() {},
      stop() {},
      pause() {},
      resume() {},
      setCurrentFrame() {},
      getName: () => '',
      isPlaying: false,
      currentAnim: null,
    },
    // `playIfChanged` reads `sprite.scene.anims.exists(key)` and returns early when the key is
    // absent — which is the honest fake here: this test is about the ORDER of the passes, not about
    // Phaser's animation manager, and an empty manager exercises the same early return the real
    // scene takes before its animations are registered.
    scene: { anims: { exists: () => false } },
    play() {
      return playerSprite;
    },
    texture: { key: 'brass-courier' },
    frame: { name: '0' },
  } as unknown as Phaser.GameObjects.Sprite;

  const camera = { scrollX: 0, scrollY: 0, zoom: 1, width: 1920, height: 1080 } as unknown as
    Phaser.Cameras.Scene2D.Camera;

  const ctx: FrameDrawContext = {
    world,
    camera,
    playerSprite,
    prevPlayer: null,
    accumulatorMs: 0,
    feelTuner: undefined,
    effects: {
      render() {
        order.push('effects');
      },
    } as unknown as FrameDrawContext['effects'],
    ui: {
      render() {
        order.push('ui');
      },
    } as unknown as FrameDrawContext['ui'],
    gears: {
      sync() {
        order.push('gears');
      },
    } as unknown as FrameDrawContext['gears'],
    enemies: {
      sync() {
        order.push('enemies');
      },
    } as unknown as FrameDrawContext['enemies'],
    parallax: [],
    motionProbe: {
      update() {
        order.push('probe');
      },
    } as unknown as FrameDrawContext['motionProbe'],
    deltaMs: 16,
    publish() {
      order.push('publish');
    },
  };
  return { ctx, order };
}

describe('drawFrame — the extraction has a draw path (CLAUDE.md §2)', () => {
  it('the premise: the fake actually records something', () => {
    // Without this, every ordering assertion below would be about an empty array.
    const { ctx, order } = fakeContext();
    drawFrame(ctx);
    expect(order.length, 'nothing was drawn, so nothing here is a test').toBeGreaterThan(3);
  });

  it('calls every subsystem exactly once', () => {
    const { ctx, order } = fakeContext();
    drawFrame(ctx);
    for (const key of ['effects', 'ui', 'gears', 'enemies', 'probe', 'publish']) {
      expect(order.filter((x) => x === key).length, `${key} was not drawn exactly once`).toBe(1);
    }
  });

  it('publishes LAST — the debug surface describes a drawn frame', () => {
    // `window.__game.ready` is what every e2e spec waits on instead of sleeping. Publishing before
    // the frame is drawn makes that wait mean something weaker than it claims.
    const { ctx, order } = fakeContext();
    drawFrame(ctx);
    expect(order[order.length - 1], `order was: ${order.join(' → ')}`).toBe('publish');
  });

  it('draws the HUD after the world, not before', () => {
    const { ctx, order } = fakeContext();
    drawFrame(ctx);
    expect(order.indexOf('effects')).toBeLessThan(order.indexOf('ui'));
    expect(order.indexOf('ui')).toBeLessThan(order.indexOf('publish'));
  });

  it('runs the DEV motion probe, and only after the world is drawn', () => {
    const { ctx, order } = fakeContext();
    drawFrame(ctx);
    expect(order.indexOf('probe')).toBeGreaterThan(order.indexOf('enemies'));
  });

  it('omitting the optional passes does not throw — production has no probe and may have no UI', () => {
    // The counter-fixture. `ui` and `motionProbe` are optional in the real scene: `UIScene` is
    // launched by `create()` and the probe is DEV-only, so a frame can legitimately have neither.
    const { ctx } = fakeContext();
    const bare: FrameDrawContext = { ...ctx, ui: undefined, motionProbe: undefined };
    expect(() => drawFrame(bare)).not.toThrow();
  });

  it('passes the SAME camera to the HUD that it drew the world with', () => {
    // The collect flyer turns a gear's world position into a screen position using this camera. Two
    // different cameras here would land every flyer in the wrong place, and nothing else would say
    // so *(vault 5.3)*.
    const { ctx } = fakeContext();
    const seen: unknown[] = [];
    const spy = { render: (_w: unknown, c: unknown) => seen.push(c) };
    drawFrame({
      ...ctx,
      effects: spy as unknown as FrameDrawContext['effects'],
      ui: spy as unknown as FrameDrawContext['ui'],
    });
    expect(seen.length).toBe(2);
    expect(seen[0]).toBe(seen[1]);
    expect(seen[0]).toBe(ctx.camera);
  });

  it('reads camera.scrollX for the parallax AFTER the world pass', () => {
    // The order defect this file exists for: a parallax that reads the camera before it has followed
    // lags the world by a frame. Asserted by mutating scrollX mid-frame from the enemies pass and
    // checking the parallax saw the NEW value.
    const { ctx } = fakeContext();
    const scrolls: number[] = [];
    const camera = { scrollX: 0, scrollY: 0, zoom: 1, width: 1920, height: 1080 };
    const parallax = [
      {
        factor: 0.5,
        image: {
          set tilePositionX(v: number) {
            scrolls.push(v);
          },
          get tilePositionX() {
            return 0;
          },
        },
      },
    ] as unknown as FrameDrawContext['parallax'];

    drawFrame({
      ...ctx,
      camera: camera as unknown as Phaser.Cameras.Scene2D.Camera,
      parallax,
      enemies: {
        sync() {
          camera.scrollX = 500;
        },
      } as unknown as FrameDrawContext['enemies'],
    });

    expect(scrolls.length, 'the parallax layer was never scrolled').toBe(1);
    expect(
      scrolls[0],
      'the parallax read a stale scrollX — it runs before the camera has followed',
    ).toBe(500 * 0.5);
  });
});

// `vi` is imported for parity with the project's other behavioural fakes; no spy is needed here
// because the fakes record their own calls, which keeps the order array the single source.
void vi;
