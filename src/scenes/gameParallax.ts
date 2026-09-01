import type Phaser from 'phaser';
import { parallaxLayers } from '../render/parallaxRig';
import { SCENE_DESTROY, SCENE_SHUTDOWN } from './engineLiterals';

/**
 * The scene-side half of the parallax rig — the layer specs come from `src/render/parallaxRig.ts`
 * engine-free; this file is the hand that builds and moves the `TileSprite`s, the same split
 * `src/scenes/bootAssets.ts` uses for the asset-load gate.
 *
 * `TileSprite` rather than `Image` because it wraps its texture natively, and the layers were
 * built to wrap: `build-world.mjs` mirrors each one so both its middle join and its end wrap
 * repeat a source column exactly. `gateSeam` went from FAIL to PASS across that step, which is
 * what makes the wrap safe to rely on here.
 *
 * `setScrollFactor(0)` pins them to the camera and the scroll is applied by hand in
 * `renderParallax`, because Phaser's own scroll factor moves the OBJECT while a TileSprite needs
 * its texture offset moved instead — otherwise the layer slides off its own edges.
 */
export interface ParallaxImage {
  image: Phaser.GameObjects.TileSprite;
  factor: number;
}

/**
 * The layers plus the lifecycle they need, because they now own a ScaleManager subscription.
 *
 * `images` stays a plain array so `renderParallax` and `gameFrameDraw` are untouched — the render
 * path is the hot one and had no reason to change.
 */
export interface ParallaxAttachment {
  images: ParallaxImage[];
  /** Re-size every layer to the live view. Idempotent; safe to call on any resize event. */
  resize(): void;
  destroy(): void;
}

export function createParallax(scene: Phaser.Scene): ParallaxAttachment {
  /**
   * 🔴 **Sized from the LIVE view, not from `GAME_WIDTH`.**
   *
   * These were `tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)` at screen origin with
   * `setScrollFactor(0)`. Under `Phaser.Scale.EXPAND` the view is up to `MAX_GAME_WIDTH` wide, so a
   * 1920 px layer leaves the right ~417 px of SKY drawn in raw `backgroundColor` — a hard black
   * band wherever the level's own tiles do not cover, which is most of the frame.
   *
   * The textures do not change: they are 5092 px wide and `TileSprite` wraps natively, with
   * `build-world.mjs` mirroring each layer so the join and the end wrap repeat a source column
   * exactly. A wider box simply shows more of a loop that was always there.
   */
  const images = parallaxLayers().map(({ key, factor, depth }) => {
    const { width, height } = scene.scale.gameSize;
    const image = scene.add
      .tileSprite(0, 0, width, height, key)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    return { image, factor };
  });

  const resize = (): void => {
    const { width, height } = scene.scale.gameSize;
    for (const { image } of images) {
      if (image.width === width && image.height === height) continue;
      image.setSize(width, height);
    }
  };

  /**
   * ⚠️ **The subscription is on the ScaleManager, which outlives every scene — so it owns a
   * teardown, and that teardown runs on BOTH lifecycle events.**
   *
   * Without it, each level restart adds one more listener holding one more set of destroyed
   * `TileSprite`s: a leak that grows with play time and only shows up as the next resize writing to
   * dead objects. And SHUTDOWN alone is not enough — removing an ACTIVE scene reaches DESTROY
   * without passing through it, the lifecycle `rotateGuard.ts:33-37` documents. Both named by the
   * Codex plan review, rounds 1 and 2.
   */
  scene.scale.on('resize', resize);
  let alive = true;
  const attachment: ParallaxAttachment = {
    images,
    resize,
    destroy() {
      if (!alive) return;
      alive = false;
      scene.scale.off('resize', resize);
    },
  };
  scene.events.once(SCENE_SHUTDOWN, () => attachment.destroy());
  scene.events.once(SCENE_DESTROY, () => attachment.destroy());
  return attachment;
}

/**
 * `setScrollFactor(0)` already pins these to the camera, so their position is in SCREEN space
 * and stays at the origin. Setting it to the camera's scroll — which is what the first version
 * did — double-applies the scroll and slides the layer down and right off the viewport, which
 * showed up as a black band above a strip of background. Only the TEXTURE offset moves.
 */
export function renderParallax(parallax: ParallaxImage[], scrollX: number): void {
  for (const { image, factor } of parallax) {
    image.tilePositionX = scrollX * factor;
  }
}
