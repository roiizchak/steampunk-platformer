/**
 * Launch the welcome screen over `GameScene`, and pause the game underneath it — Phase 11.
 *
 * The same scene-side attach-helper shape as `attachHud` (`gameHud.ts`) and `attachEffects`
 * (`gameEffects.ts`): one call from `GameScene.create()`, all the lifecycle here. It lives outside
 * `GameScene.ts` because that file sits three lines under `tests/unit/file-size.test.ts`'s **hard**
 * 400-line ceiling, which allows zero over-limit files and which no `SIZE-EXEMPTION:` citation
 * rescues.
 *
 * ## 🔴 Once per PAGE LOAD, by a latch — not by inspecting the level id
 *
 * The first design tested `requestedLevelId === null` for "the player just arrived". That is simply
 * wrong: `GameScene.init` does `data?.levelId ?? null`, so the id is `null` whenever data is absent
 * **or** null — and specs restart `Game` directly with no data at all
 * (`tests/e2e/phase-07-audio-adopt.spec.ts`, the lifecycle suite). Every one of those restarts would
 * have reopened the title.
 *
 * So the rule is a module-scope latch, which is exactly "once per page load": it survives every
 * scene restart, and a real reload gets a fresh module. Nothing else is consulted.
 *
 * ## 🔴 A restart while the title is still up must re-pause
 *
 * If the latch only suppressed later attachments, restarting `Game` while a `Title` was still active
 * would leave that title drawn over a newly **RUNNING** game — the pause invariant silently
 * regressed, and the player reading a title screen over a level that is quietly killing them. So an
 * already-active title re-pauses the new `Game` instead of being skipped.
 */

import type Phaser from 'phaser';
import { TITLE_KEY } from './TitleScene';
import type { TitleSceneData } from './TitleScene';
import type { AudioManager } from '../game/audio';

/**
 * Page-lifetime, deliberately. Not scene state, not save state — a reload is the only thing that
 * should show the welcome screen again.
 */
let titleShown = false;

/** Test seam: reset the page-lifetime latch. Not used by the game. */
export function resetTitleLatch(): void {
  titleShown = false;
}

/**
 * Show the welcome screen over `scene`, pausing it, unless this page has already shown one.
 *
 * @param scene the `GameScene` that is creating. Paused for as long as the title is up.
 * @param audio resolved per press by the title's own audio keys — `Game`'s listener is inert while
 *   it is paused, and the welcome screen is the first place a player tries the volume.
 * @param onLevelSelect `Game`-owned, because `scene.start()` stops its CALLER; a `start` issued from
 *   the title would stop the title and leave `Game` running under the menu.
 */
export function attachTitle(
  scene: Phaser.Scene,
  audio: () => AudioManager | undefined,
  onLevelSelect: () => void,
): void {
  const manager = scene.scene;

  // A title left over from a previous `Game` that restarted underneath it. Re-pause and leave the
  // existing screen alone — relaunching would stack a second copy of every text object.
  if (manager.isActive(TITLE_KEY)) {
    manager.pause();
    return;
  }

  if (titleShown) {
    return;
  }
  titleShown = true;

  const data: TitleSceneData = {
    audio,
    onLevelSelect,
    // Resume the scene this helper paused. Held here rather than in the title so the pause and the
    // resume are written in one place and cannot drift apart.
    onPlay: () => manager.resume(),
  };
  manager.launch(TITLE_KEY, data);
  // AFTER the launch, so the operation is queued against a running scene. `pause()` with no argument
  // pauses the scene this plugin belongs to — `Game` itself.
  manager.pause();
}
