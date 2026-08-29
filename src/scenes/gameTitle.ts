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
 * ## ⚠️ An interleaving that was recorded as undefended, and is now GONE
 *
 * Codex implementation review round 3, finding 2, recorded this *(C11)*: queue a `Game.restart()`
 * while the title is up, press ENTER before the next SceneManager pass, and the queue ends
 * `[stop Title, resume Game, pause Game]` — the resume landing before the pause this helper appends
 * during the new `create()`, leaving `Game` PAUSED with no title over it.
 *
 * **The resume in that sequence came from `onPlay`, and `onPlay` no longer exists.** The owner's
 * 2026-08-29 decision made the level menu the only way off this screen, and the menu STOPS `Game`
 * rather than resuming it, so there is no resume for a pause to race. The note is kept rather than
 * deleted because it is the reason this helper still owns the pause and the title does not: moving
 * the pair into the title's own lifecycle would trade a race nobody can reach for one everybody
 * would.
 *
 * ## 🔴 A restart while the title is still up must re-pause
 *
 * If the latch only suppressed later attachments, restarting `Game` while a `Title` was still active
 * would leave that title drawn over a newly **RUNNING** game — the pause invariant silently
 * regressed, and the player reading a title screen over a level that is quietly killing them. So an
 * already-active title re-pauses the new `Game` instead of being skipped.
 */

import type Phaser from 'phaser';
import type { TitleSceneData } from './TitleScene';

/**
 * The scene key, owned HERE rather than by `TitleScene`.
 *
 * 🔴 It used to live in `TitleScene.ts`, and that one value import was enough to drag Phaser into
 * anything that named the key — including a unit test of this file, which is otherwise Phaser-free
 * and drivable against a fake `ScenePlugin`. `TitleScene` re-exports it, so every existing import
 * path still resolves; the type import back the other way is erased and creates no runtime cycle.
 * (Criterion 11.14 review: `attachTitle` had three branches and no unit test at all.)
 */
export const TITLE_KEY = 'Title';
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
  //
  // 🔴 **Three states, not one — and the title is RESTORED, not merely counted.**
  //
  // This tested `isActive` alone, and `isActive` is false for a PAUSED or SLEEPING scene, so a title
  // in either state fell through to the latch and the new `Game` was never paused *(Codex
  // implementation review round 1, finding 2)*. A PAUSED title is then drawn over a RUNNING level; a
  // SLEEPING one is not drawn at all. The wording used to say "left drawn" for both, which is wrong
  // for the sleeping case and contradicted the paragraph below it *(round 3)*.
  //
  // Detecting them is not enough, though, and round 2 caught the half-fix: pausing `Game` under a
  // title that is itself paused or asleep **strands the player**. Read from the engine, not assumed:
  // `SceneManager.render` draws a scene while `status < SLEEPING` (`SceneManager.js:595`), and
  // `PAUSED` is 6 against `SLEEPING`'s 7 — so a **paused** title still draws but its
  // `KeyboardPlugin` is inert, giving an undismissable screen over a frozen game; a **sleeping** one
  // does not draw at all, giving a frozen game with nothing on it. Either way there is no way out.
  //
  // So the title is put back into a state that can answer a key before `Game` is paused behind it.
  //
  // ⚠️ Presence is read ONCE, into a local. `wake` and `resume` are queued like every other scene
  // op, so re-reading `isActive` after calling one still answers false — the branch would fall
  // through to the latch and return without pausing `Game` at all.
  const sleeping = manager.isSleeping(TITLE_KEY);
  const paused = manager.isPaused(TITLE_KEY);
  if (manager.isActive(TITLE_KEY) || paused || sleeping) {
    if (sleeping) {
      manager.wake(TITLE_KEY);
    } else if (paused) {
      manager.resume(TITLE_KEY);
    }
    manager.pause();
    return;
  }

  if (titleShown) {
    return;
  }
  titleShown = true;

  const data: TitleSceneData = { audio, onLevelSelect };
  manager.launch(TITLE_KEY, data);
  // `pause()` with no argument pauses the scene this plugin belongs to — `Game` itself.
  //
  // ⚠️ This used to add *"AFTER the launch, so the operation is queued against a running scene."*
  // **That is not a mechanism.** `pause` targets `Game`, which is running either way, and both ops
  // drain in the same `processQueue` pass regardless of order. The order is how it reads, not
  // something the engine requires — corrected by the Codex implementation review, which caught the
  // unit test below enforcing a rule that does not exist.
  manager.pause();
}
