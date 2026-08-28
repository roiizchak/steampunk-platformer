/**
 * The frame's draw fan-out: one call per drawn subsystem, in the order they must stack.
 *
 * ## Why this is its own file
 *
 * `GameScene.ts` has now hit the 400-line ceiling **four times in one session** and has been split
 * six times before this. Each time the fix was a line trim, and the QA log recorded the real answer
 * as owed: *"another extraction — that is a piece of work, not a line trim."* This is it, the
 * seventh.
 *
 * It is a good seam rather than an arbitrary one: everything below is **application**, not decision.
 * Every value it draws with has already been decided — by `playerView.ts`, `cameraRig.ts`,
 * `parallaxRig.ts`, `audioCues.ts` — which is the boundary CLAUDE.md §2 draws between `src/render/`
 * and `src/scenes/`. Nothing here chooses anything; it hands decided state to Phaser objects.
 *
 * ## ⚠️ The ORDER is load-bearing and is not alphabetical
 *
 * `renderPlayerSprite` runs before the effects and HUD passes because those read the camera the
 * player's position has just driven. `renderParallax` takes `cameras.main.scrollX` **after** the
 * camera has followed, or the backgrounds lag the world by a frame — which reads as the parallax
 * "swimming" rather than as a one-frame delay. `publishWorldState` is last so `window.__game`
 * describes a frame that has actually been drawn, which is what every e2e spec's `ready` wait
 * assumes.
 *
 * Splitting a file moves code out of whatever coverage the original had and nothing notices — this
 * project shipped that defect once already, in the six modules T13 named. So `gameFrameDraw` is
 * gated behaviourally against a fake scene by `tests/unit/frame-draw-order.test.ts`, which asserts
 * the call order rather than merely that the calls happen.
 */

import type Phaser from 'phaser';
import { renderAlpha, type Point } from '../render/interpolate';
import { renderPlayerSprite } from './gamePlayerDraw';
import { renderParallax, type ParallaxImage } from './gameParallax';
import type { EffectAttachment } from './gameEffects';
import type { EnemyLayer } from './enemyLayer';
import type { GearLayer } from './gearLayer';
import type { UIScene } from './UIScene';
import type { PinProbe } from './devPinProbe';
import type { MotionProbe } from './devMotionProbe';
import type { World } from '../sim/types';

export interface FrameDrawContext {
  world: World;
  camera: Phaser.Cameras.Scene2D.Camera;
  playerSprite: Phaser.GameObjects.Sprite;
  prevPlayer: Point | null;
  accumulatorMs: number;
  /** DEV-only sprite tweak. `undefined` in a production build, by the caller's guard. */
  feelTuner?: (sprite: Phaser.GameObjects.Sprite) => void;
  effects: EffectAttachment;
  ui?: UIScene;
  gears: GearLayer;
  enemies: EnemyLayer;
  parallax: ParallaxImage[];
  /** DEV ONLY, and driven by the RAW millisecond delta rather than by whole ticks. */
  motionProbe?: MotionProbe;
  /** DEV ONLY. Needs the raw delta AND this frame's tick accounting — see `devPinProbe.ts`. */
  pinProbe?: PinProbe;
  /** Whole ticks this frame simulated, and how many `drainTicks` threw away over the cap. */
  ticks?: number;
  dropped?: number;
  deltaMs: number;
  publish: (world: World) => void;
}

/** Draw one frame. Every value here was decided elsewhere; this applies them. */
export function drawFrame(ctx: FrameDrawContext): void {
  renderPlayerSprite(ctx.playerSprite, ctx.world, ctx.prevPlayer, ctx.accumulatorMs, ctx.feelTuner);
  // The HUD lives in `UIScene`, so this hands it the world and the camera. The camera goes across
  // because the collect tween has to turn a gear's WORLD position into a screen position, and the
  // camera's scroll and zoom are that transform — doing the conversion in the scene would put HUD
  // arithmetic in the one file this project cannot let grow.
  ctx.effects.render(ctx.world, ctx.camera);
  ctx.ui?.render(ctx.world, ctx.camera);
  ctx.gears.sync();
  ctx.enemies.sync(renderAlpha(ctx.accumulatorMs));
  // After the camera has followed, not before — see the header.
  renderParallax(ctx.parallax, ctx.camera.scrollX);
  ctx.motionProbe?.update(ctx.deltaMs);
  // Fed the tick accounting as well as the delta: wall time a dropped-tick frame never simulated
  // must not count toward a stall. `devPinProbe.ts` explains why that is not a refinement.
  ctx.pinProbe?.update(ctx.deltaMs, ctx.ticks ?? 0, ctx.dropped ?? 0);
  // Last, so the debug surface describes a frame that was actually drawn.
  ctx.publish(ctx.world);
}
