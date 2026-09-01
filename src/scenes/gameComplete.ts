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
 * sees, on exactly the runs where they were moving fast. ENTER collides with no Phase 1–7 spec and with
 * no gameplay control.
 *
 * ⚠️ It is **not** unbound elsewhere: `LevelSelectScene` binds it too, which is the same trap one
 * paragraph up, one scene along. Holding ENTER through "ALL LEVELS COMPLETE" carries the OS auto-repeat
 * into a menu whose `Key` was created a millisecond ago with `isDown === false`, and the menu replays
 * the level the player just finished. That guard lives in `LevelSelectScene.bindKeys`, on the native
 * event's `repeat` flag.
 */

import Phaser from 'phaser';
import type { AssetCatalog } from '../game/assetCatalog';
import { recordCompletion, readProgress, safeLocalStorage, writeProgress } from '../game/save';
import { nextLevelId } from '../sim/progress';
import { shouldRunCompletion } from './completionGate';
import { animateGoalReached } from './goalLayer';
import type { AdvanceEvents } from '../sim/types';
import type { World } from '../sim/types';
import { LEVEL_SELECT_KEY, levelOrder } from './gameLevelPick';
import type { LevelCompleteInfo } from './hudFade';
import type { UIScene } from './UIScene';
import { attachTapRoutes } from './touchRoutes';
import { keepTapRoutesSized } from './tapRouteResize';
import { SCENE_DESTROY, SCENE_SHUTDOWN } from './engineLiterals';

/** The scene key the last level's continue goes to. Defined in `gameLevelPick.ts`, re-exported here
 * because this file's `bindContinue` is what routes to it. */
export { LEVEL_SELECT_KEY };

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

  // 🔴 `animateGoalReached` used to be called here and is not any more *(inventory 2.6)*. This
  // function runs on `levelCompleted`, twenty ticks after the player reached the door and one tick
  // after the courier finished fading out — so the exit's flourish played over an empty doorway.
  // `GameScene.update()` fires it on the `goalReached` arrival edge instead.
  ctx.ui?.levelComplete(
    panelText(save.levels[levelId]?.bestGears ?? 0, world, total, next, scene.game.device.input.touch),
  );
  bindContinue(scene, next);
}

/**
 * The panel's four lines.
 *
 * `best` is read back off the save rather than computed here, so the number the player sees is the
 * number that was persisted — including the monotonic `max` and the clamp to the level's gear count.
 * Composing it independently would be a second place that decides what "best" means.
 */
function panelText(
  best: number,
  world: World,
  total: number,
  next: string | null,
  touch: boolean,
): LevelCompleteInfo {
  return {
    title: next === null ? 'ALL LEVELS COMPLETE' : 'LEVEL COMPLETE',
    gears: `${world.gearsCollected} / ${total} gears`,
    best: `best ${best} / ${total}`,
    // ✅ The device's own route, not both — owner decision, 2026-08-30. A phone has no ENTER key.
    // ⚠️ The SPECIFIC next level id stays in the string either way: criterion 8.6's mutation
    // depends on it, and `phase-08-complete.spec.ts` asserts the exact text.
    prompt: `${touch ? 'TAP' : 'ENTER'} — ${next ?? 'level select'}`,
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
function advanceTo(scene: Phaser.Scene, next: string | null): void {
  if (next === null) {
    scene.scene.start(LEVEL_SELECT_KEY);
    return;
  }
  // `start`, not `restart`: the level id travels in the data payload and `GameScene.init(data)`
  // reads it. A `restart()` would re-enter with the payload the scene was last started with,
  // which is the level just finished.
  scene.scene.start('Game', { levelId: next });
}

/**
 * Arm ENTER, re-arming itself on any other key.
 *
 * Split out of `bindContinue` when the tap route landed: the re-arm used to recurse into
 * `bindContinue`, which would now build a SECOND zone on every irrelevant keypress.
 */
function armContinueKey(scene: Phaser.Scene, onAdvance: () => void): void {
  scene.input.keyboard?.once(Phaser.Input.Keyboard.Events.ANY_KEY_DOWN, function advance(
    event: KeyboardEvent,
  ) {
    if (event.code !== 'Enter' && event.code !== 'NumpadEnter') {
      // Not our key. Re-arm, because `once` has already removed the listener and the player is
      // still sitting on a screen whose only exit is this binding.
      armContinueKey(scene, onAdvance);
      return;
    }
    onAdvance();
  });
}

function bindContinue(scene: Phaser.Scene, next: string | null): void {
  /**
   * 🔴 **One idempotent teardown, and it is new.** `go` used to destroy `taps` and nothing else,
   * which was complete while the route was all this function owned. It now also owns a ScaleManager
   * subscription — global, and outliving every scene — so leaving on any other path would leak it
   * and the panel's closure with it. Named by the Codex plan review, round 4: the owner I first
   * reached for ("the teardown that removes the panel") does not exist here, because the panel
   * belongs to `UIScene`.
   */
  const teardown = (): void => {
    sized.destroy();
    taps.destroy();
  };
  const go = (): void => {
    teardown();
    advanceTo(scene, next);
  };
  // ⚠️ The zone is on the GAME scene, not on the `UIScene` that DRAWS the panel: `UIScene`
  // survives the level-to-level `scene.start('Game')` (`gameHud.ts:49-52`), so a zone parented
  // to it would outlive the panel it belongs to and sit invisible over the next level, one stray
  // tap from skipping it. `Game`'s own SHUTDOWN fires on that same start, and `go` destroys the
  // route before advancing in any case.
  const { width, height } = scene.scale.gameSize;
  // Deliberately larger than the view. `GameScene`'s camera is displaced to `(-10, -8)` for shake
  // headroom (`effectsCamera.ts`), and a shake in progress moves it further, so a zone sized exactly
  // to the view can leave a live strip of screen along two edges.
  const box = [{ id: 'continue', x: -64, y: -64, w: width + 128, h: height + 128 }];
  const taps = attachTapRoutes(
    scene,
    scene.game.device.input.touch,
    box,
    go,
  );
  // The zone is view-sized, so a view resize leaves it short down one side — a strip of the
  // completion panel where a tap does nothing. Mutated in place, never replaced; `tapRouteResize.ts`
  // says why.
  const sized = keepTapRoutesSized(scene, taps, (size) => {
    Object.assign(box[0]!, { w: size.width + 128, h: size.height + 128 });
  });
  scene.events.once(SCENE_SHUTDOWN, teardown);
  scene.events.once(SCENE_DESTROY, teardown);
  armContinueKey(scene, go);
}

/**
 * Both edge-driven halves of reaching the exit, in one call: the ARRIVAL flourish and the
 * COMPLETION flow. Returns the latches so the scene keeps owning its own state.
 *
 * ## Why the two are separate edges *(session inventory 2.6, 2026-08-23)*
 *
 * `animateGoalReached` used to be called from `onLevelCompleted`, which runs on `levelCompleted` —
 * **twenty ticks after** the player reached the door, and one tick after the courier finished fading
 * out. The exit's flourish therefore played over an **empty doorway**: the *completed-it* animation
 * where the *reached-it* one belongs. `tick.ts` step 9d now emits `goalReached` on the tick the
 * run-in arms, and those twenty ticks are the run-in itself — so the pulse plays under a courier who
 * is still there to see it.
 *
 * ## Why both are latched
 *
 * `advanceSplit` OR-accumulates edges across a frame's ticks, so a long frame can present the same
 * edge once for several ticks' worth of work. Firing twice would stack two tweens on one target —
 * criterion 9.3's kill-by-target hazard from the other side — and would re-enter the completion flow.
 *
 * ## Why it lives here and not in `GameScene.update()`
 *
 * It did live there. `GameScene.ts` sat at **exactly 400 lines with no headroom**, so adding the
 * arrival branch put it over — which is 4.16 and T16's recorded pressure arriving again rather than
 * anything new. This file's own header already claims the flow; moving the dispatch to it is where
 * the code was supposed to be.
 */
export interface GoalFlowContext extends CompletionContext {
  events: AdvanceEvents;
  pulseFired: boolean;
  handled: boolean;
  /** Run once, when the completion flow fires. The scene's own input flag lives in the scene. */
  onCompleted: () => void;
}

export function runGoalFlow(ctx: GoalFlowContext): { pulseFired: boolean; handled: boolean } {
  let { pulseFired, handled } = ctx;

  if (ctx.events.goalReached && !pulseFired) {
    pulseFired = true;
    animateGoalReached(ctx.scene, ctx.goalObject);
  }

  if (shouldRunCompletion(ctx.events.levelCompleted, ctx.world.completed, handled)) {
    // Set BEFORE the flow runs, so a handler that throws is not re-entered every frame.
    handled = true;
    ctx.onCompleted();
    onLevelCompleted(ctx);
  }

  return { pulseFired, handled };
}
