import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { parallaxLayers } from '../render/parallaxRig';

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

export function createParallax(scene: Phaser.Scene): ParallaxImage[] {
  return parallaxLayers().map(({ key, factor, depth }) => {
    const image = scene.add
      .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(depth);
    return { image, factor };
  });
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
