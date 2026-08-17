/**
 * What happens when the player reaches the exit. Criterion 8.6: align, animate, fade, overlay, continue.
 *
 * The five steps, and where each one lives:
 *
 * | step | where |
 * |---|---|
 * | **align** | `goalLayer.drawGoal` — the drawn exit IS `LevelData.goal`, the same rect step 9d triggers on |
 * | **animate** | `goalLayer.animateGoalReached` — the exit's pulse |
 * | **fade** | `hudFade.showLevelComplete`, in `UIScene` so the fade dims the HUD as well as the world |
 * | **overlay** | the same, and the panel text is composed here because this is what knows the save |
 * | **continue** | `bindContinue` below |
 *
 * ## 🔴 The sim has already stopped by the time anything here runs
 *
 * `tick()` returns `noEvents()` once `world.completed` is true, so nothing in this file is racing a
 * running simulation. That guard is what makes a level-complete flow safe to take its time over: the
 * account of what happened without it — the player walking out of the goal, off the floor, dying and
 * respawning behind the banner, with `gearsCollected` still moving — is in `src/sim/goal.ts`.
 *
 * ## Why ENTER, and not SPACE
 *
 * SPACE is jump. A player who touches the exit **mid-jump** is holding it, and a continue bound to
 * SPACE would be pressed the instant the panel appeared — a level-complete screen the player never
 * sees, on exactly the runs where they were moving fast. ENTER is bound nowhere else in this project
 * (checked against every `addKey` in `src/` and every `keyboard.press` in `tests/e2e/`), so it collides
 * with no spec and with no other control.
 */

import Phaser from 'phaser';
import type { AssetCatalog } from '../game/assetCatalog';
import { recordCompletion, readProgress, safeLocalStorage, writeProgress } from '../game/save';
import { nextLevelId } from '../sim/progress';
import type { World } from '../sim/types';
import { animateGoalReached } from './goalLayer';
import { levelOrder } from './gameLevelPick';
import type { LevelCompleteInfo } from './hudFade';
import type { UIScene } from './UIScene';

/** The scene key the last level's continue goes to. */
export const LEVEL_SELECT_KEY = 'LevelSelect';

export interface CompletionContext {
  scene: Phaser.Scene;
  /** Optional for the same reason `GameScene.ui` is: `scene.launch` is async and a frame can beat it. */
  ui: UIScene | undefined;
  goalObject: Phaser.GameObjects.GameObject;
  world: World;
  levelId: string;
  catalog: AssetCatalog;
}

/**
 * Run the whole flow once, on the `levelCompleted` edge.
 *
 * Called from `GameScene.update()` on the edge rather than on `world.completed`, and that is the
 * difference between "once" and "every frame from now on": the edge is emitted on exactly one tick
 * *(vault 2.5)*, and `advanceSplit` ORs it across a batch so a frame that drained five ticks still
 * sees it. `world.completed` stays true forever and would rebuild the overlay 60 times a second.
 */
export function onLevelCompleted(ctx: CompletionContext): void {
  const { scene, world, levelId, catalog } = ctx;
  const order = levelOrder(catalog);
  const next = nextLevelId(levelId, order);
  const total = world.gears.length;

  // Written before the overlay is built, so a player who closes the tab while reading it has still
  // earned the unlock. `readProgress` is re-read rather than reusing whatever `pickLevel` saw: the
  // player may have finished a level in another tab, and the write must not roll that back.
  const storage = safeLocalStorage();
  const save = recordCompletion(readProgress(storage), levelId, world.gearsCollected, total);
  writeProgress(storage, save);

  animateGoalReached(scene, ctx.goalObject);
  ctx.ui?.levelComplete(panelText(save.levels[levelId]?.bestGears ?? 0, world, total, next));
  bindContinue(scene, next);
}

/**
 * The panel's four lines.
 *
 * `best` is read back off the save rather than computed here, so the number the player sees is the
 * number that was persisted — including the monotonic `max` and the clamp to the level's gear count.
 * Composing it independently would be a second place that decides what "best" means.
 */
function panelText(best: number, world: World, total: number, next: string | null): LevelCompleteInfo {
  return {
    title: next === null ? 'ALL LEVELS COMPLETE' : 'LEVEL COMPLETE',
    gears: `${world.gearsCollected} / ${total} gears`,
    best: `best ${best} / ${total}`,
    prompt: next === null ? 'ENTER — level select' : `ENTER — ${next}`,
    // ⚠️ `prompt` names the SPECIFIC next level rather than saying "next level", because criterion
    // 8.6's mutation is "hardcode the next id and confirm the spec names the specific next
    // `levelId`". A generic string is satisfied by a flow that always advances to level-02.
  };
}

/**
 * Bind ENTER to advance, exactly once.
 *
 * `scene.input.keyboard.once` rather than a `Key` object with a `down` listener: the binding must not
 * survive into the next level, and `once` retires itself. A `Key` added here would still be attached
 * after `scene.start`, and the second level's completion would then fire two advances.
 *
 * `emitOnRepeat` does not enter into it — a keyboard event listener does not repeat the way a held
 * `Key` object does.
 */
function bindContinue(scene: Phaser.Scene, next: string | null): void {
  scene.input.keyboard?.once(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, function advance(
    event: KeyboardEvent,
  ) {
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') {
      // Not our key. Re-arm, because `once` has already removed the listener and the player is still
      // sitting on a screen whose only exit is this binding.
      bindContinue(scene, next);
      return;
    }
    if (next === null) {
      scene.scene.start(LEVEL_SELECT_KEY);
      return;
    }
    // `start`, not `restart`: the level id travels in the data payload and `GameScene.init(data)`
    // reads it. A `restart()` would re-enter with the payload the scene was last started with, which
    // is the level just finished.
    scene.scene.start('Game', { levelId: next });
  });
}
