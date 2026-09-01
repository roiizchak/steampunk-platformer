/**
 * Apply the camera rig `cameraRig.ts` decided on — Phase 11.
 *
 * The same scene-side attach-helper shape as `attachHud` (`gameHud.ts`), `attachDevOverlays`
 * (`gameDev.ts`) and `attachEffects` (`gameEffects.ts`): the decisions live in an engine-free
 * module, this applies them, and the scene stays a list of calls.
 *
 * ## Why it moved out of `GameScene.create()`
 *
 * `GameScene.ts` sat at **399 lines** against `tests/unit/file-size.test.ts`'s **hard** 400-line
 * ceiling — hard because the second assertion allows zero over-limit files, so a `SIZE-EXEMPTION:`
 * citation does not rescue a new one. Phase 11 needed to add a title-screen attach call, and this
 * is the block that paid for it: five statements that already delegate every decision to
 * `cameraSetup()` and so had nothing scene-specific left in them.
 *
 * ## 🔴 `playerSprite` is a parameter, not read off the scene
 *
 * `GameScene.playerSprite` is `private`. A separate module cannot legally reach it through the
 * `scene` argument, so the sprite is passed explicitly — Codex plan review round 3, finding 1,
 * which caught the two-argument signature this file was first specified with.
 *
 * ⚠️ **Call this where the original block stood**, between the sprite's creation and
 * `attachEffects`. `attachEffects` expands the camera viewport afterwards (`gameEffects.ts`), so
 * moving this call after it would silently discard that expansion.
 */

import type Phaser from 'phaser';
import { cameraSetup } from '../render/cameraRig';
import type { LevelData } from '../game/tilemap';
import { GAME_HEIGHT, MAX_GAME_WIDTH } from '../game/constants';

/**
 * Set the main camera's bounds, zoom and follow behaviour for `level`.
 *
 * Phaser owns the clamping (criterion 3.4) — `cameraSetup` decides the numbers and this hands them
 * over without an opinion of its own.
 */
export function applyCameraRig(
  scene: Phaser.Scene,
  level: LevelData,
  playerSprite: Phaser.GameObjects.Sprite,
): void {
  const camera = scene.cameras.main;
  // 🔴 **`MAX_GAME_WIDTH`, not `GAME_WIDTH`.** Under `Phaser.Scale.EXPAND` the live view is wider
  // than the design size, and the refusal this guard exists for — a level no larger than the view
  // cannot scroll *(vault 3.2)* — has to be asked at the WIDEST view the game will draw. Validating
  // at 1920 while drawing at up to 2560 makes the guard a statement about a view production no
  // longer uses. Named by the Codex plan review, round 1: the safety margin was prose the guards
  // never saw.
  const cam = cameraSetup(level, MAX_GAME_WIDTH, GAME_HEIGHT);
  camera.setBounds(cam.bounds.x, cam.bounds.y, cam.bounds.w, cam.bounds.h);
  camera.setZoom(cam.zoom);
  camera.startFollow(playerSprite, false, cam.lerpX, cam.lerpY);
}
