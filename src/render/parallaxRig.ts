/**
 * Parallax layer decisions, engine-free *(vault 2.12)*: which textures, how fast each scrolls
 * relative to the camera, and the draw order behind everything else.
 *
 * Split out of `GameScene.ts` to keep that file under the 400-line rule — the same seam
 * `cameraRig.ts` and `playerView.ts` already use for the render-decision half of a scene concern,
 * with the Phaser-side application living beside it in `src/scenes/gameParallax.ts` because
 * `this.add`/`this.cameras` are per-scene injected systems a free function here has nothing to
 * call (vault: a free function needs an engine instance, and this module may not import one).
 */

/** One scrolling background layer: its texture key, its scroll factor, and its draw depth. */
export interface ParallaxLayerSpec {
  key: string;
  factor: number;
  depth: number;
}

/**
 * Three scrolling background layers, drawn behind everything.
 *
 * The factors (0.15 / 0.35 / 0.6) are how far each layer scrolls relative to the camera — lower is
 * "further away". The depths stack from -100 upward so all three stay behind gameplay (depth 0+)
 * and keep their own relative order.
 */
const LAYERS: { key: string; factor: number }[] = [
  { key: 'bg-far', factor: 0.15 },
  { key: 'bg-mid', factor: 0.35 },
  { key: 'bg-near', factor: 0.6 },
];

export function parallaxLayers(): ParallaxLayerSpec[] {
  return LAYERS.map(({ key, factor }, i) => ({ key, factor, depth: -100 + i }));
}
