/**
 * The level-complete fade and overlay. Criterion 8.6's `fade` and `overlay` steps.
 *
 * ## 🔴 Why this lives in `UIScene` and not in `GameScene`
 *
 * `UIScene` is a **parallel** scene with its own camera and its own display list, and Phaser draws
 * scenes in registration order — so every object in `UIScene` is painted *after* every object in
 * `GameScene`, whatever depth it carries. A full-screen fade rectangle added to `GameScene` therefore
 * renders **under the entire HUD**: the health bar, the gear icon and the counter blaze at full
 * brightness over a dimmed world, and the overlay text sits behind them.
 *
 * `setDepth` cannot fix that, because depth sorts within a display list and these are two lists. Nor
 * would any gate catch it — the fade exists, its alpha animates, the overlay's text is correct, and
 * `willRender` is true for all of it. It is visible only to a person looking at the screen, which is
 * why 8.6 is `play`-owned *(C4)*.
 *
 * ## Depth inside `UIScene`
 *
 * `OVERLAY_DEPTH` is above everything `UIScene.build()` creates, because the fade's whole job is to
 * dim the HUD along with the world. A HUD readable at full contrast over a completed level is the same
 * defect one layer down.
 *
 * ## The fade ANIMATES rather than appearing
 *
 * `alpha: 0 → FADE_ALPHA` over `FADE_MS`, which is criterion 8.6's `animate`/`fade` pair and not
 * decoration: a hard cut to a dark screen on the tick the player touches the exit reads as a crash.
 * The tween is on the objects rather than on a camera fade because `camera.fadeOut` on `UIScene`
 * would also fade the overlay text this is meant to reveal.
 */

// 🔴 A **TYPE-only** import, and that is what makes criterion 9.4's named subject gateable at all.
// This file names no Phaser value — every use is `Phaser.GameObjects.*` or `Phaser.Scene` in a type
// position — so with `import type` the module evaluates with the engine uninstalled and
// `tests/unit/hud-fade.test.ts` can drive `showLevelComplete` against a fake scene, the idiom
// `hud-gear-pop.test.ts` already established. It was a value import, and with a value import the
// fade's two force-settles were unreachable from any unit test: deleting BOTH left the suite green.
import type Phaser from 'phaser';
import { HUD_MARGIN } from '../render/hud';
import { ticksToMs } from '../sim';

/** Above every HUD object `UIScene.build()` creates, so the fade dims the HUD too. */
export const OVERLAY_DEPTH = 1000;

/** How dark the world goes. Not 1: the finished level stays visible behind the panel, dimmed. */
export const FADE_ALPHA = 0.72;

/** Long enough to read as a transition, short enough not to delay the continue press. */
export const FADE_TICKS = 25;

/**
 * The fade, in milliseconds, converted through `ticksToMs` — see `goalLayer.GOAL_PULSE_TICKS` for the
 * rule and for why a raw `420` here was the same defect Codex blocked in `UIScene.ts`. 25 ticks is
 * 416.67 ms.
 */
export const FADE_MS = ticksToMs(FADE_TICKS);

/** The panel starts part-way through the fade. 12 ticks, not `FADE_MS / 2` — 12.5 ticks is not a tick. */
const PANEL_DELAY_MS = ticksToMs(12);

/** The four lines the panel shows. Composed by `gameComplete.ts`, which knows the save and the run. */
export interface LevelCompleteInfo {
  /** `LEVEL COMPLETE`, or `ALL LEVELS COMPLETE` after the last one. */
  title: string;
  /** This run, e.g. `5 / 7 gears`. */
  gears: string;
  /** The record, e.g. `best 6 / 7`. */
  best: string;
  /** What to press, and where it goes. User-facing prose — `verify-dist.mjs` inspects it. */
  prompt: string;
}

/**
 * What the caller holds on to.
 *
 * Returned as a bag of the real game objects rather than as an opaque handle, because criterion 8.6
 * asserts the overlay is **drawn** — and the Phase 6 lesson is that `visible && alpha` both stay
 * truthy while `setScale(0)` leaves the GPU drawing nothing. A spec needs the objects themselves to
 * ask `willRender(camera)`.
 */
export interface LevelCompleteOverlay {
  fade: Phaser.GameObjects.Rectangle;
  lines: Phaser.GameObjects.Text[];
  destroy(): void;
}

/**
 * Show, clear, or leave the overlay alone, and return what `UIScene` should now hold.
 *
 * The whole state transition lives here rather than in `UIScene`, which is at 400 with no headroom,
 * and this is where the objects it operates on already are.
 *
 * Idempotent in both directions on purpose: a second show is a no-op rather than a second panel
 * stacked on the first, and clearing an absent overlay does nothing. `gameComplete.ts` shows on an
 * EDGE so it should only arrive once — but `attachHud` clears on every `create()`, because `UIScene`
 * is parallel and survives the `scene.start` that loads the next level. Without that clear, level-02
 * would begin under level-01's banner.
 */
export function setOverlay(
  scene: Phaser.Scene,
  current: LevelCompleteOverlay | undefined,
  info: LevelCompleteInfo | null,
): LevelCompleteOverlay | undefined {
  if (info === null) {
    current?.destroy();
    return undefined;
  }
  return current ?? showLevelComplete(scene, info);
}

const TITLE_STYLE = { fontFamily: 'monospace', fontSize: '72px', color: '#f0d79a' } as const;
const BODY_STYLE = { fontFamily: 'monospace', fontSize: '32px', color: '#c9bfa4' } as const;
const PROMPT_STYLE = { fontFamily: 'monospace', fontSize: '26px', color: '#8f8776' } as const;

/**
 * Build the fade and the panel, centred on the UI camera, and start the fade tween.
 *
 * Positioned from `scene.scale` rather than from a constant, so the panel stays centred under
 * `Phaser.Scale.FIT` at any window size — the same reason `UIScene.applyLayout` re-runs on resize.
 * Unlike the HUD this is transient, so it does not subscribe to `resize`: a window dragged during the
 * half-second the tween runs is not worth a listener that has to be unsubscribed on destroy.
 */
export function showLevelComplete(scene: Phaser.Scene, info: LevelCompleteInfo): LevelCompleteOverlay {
  const { width, height } = scene.scale;
  const cx = width / 2;

  const fade = scene.add
    .rectangle(0, 0, width, height, 0x0b0d12)
    .setOrigin(0, 0)
    .setScrollFactor(0)
    .setDepth(OVERLAY_DEPTH)
    .setAlpha(0);

  // Stacked from the centre outward, spacing derived from the HUD's own margin so the two blocks
  // share one rhythm rather than each carrying its own typed gap.
  const gap = HUD_MARGIN * 2;
  const rows: [string, typeof TITLE_STYLE | typeof BODY_STYLE | typeof PROMPT_STYLE, number][] = [
    [info.title, TITLE_STYLE, -gap * 2],
    [info.gears, BODY_STYLE, 0],
    [info.best, BODY_STYLE, gap],
    [info.prompt, PROMPT_STYLE, gap * 3],
  ];

  const lines = rows.map(([text, style, dy]) =>
    scene.add
      .text(cx, height / 2 + dy, text, style)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(OVERLAY_DEPTH + 1)
      .setAlpha(0),
  );

  /**
   * 🔴 Criterion 9.3 — each tween is HELD, and stopped by its handle rather than by its target.
   *
   * This read `scene.tweens.killTweensOf(targets)`, which is kill-by-target: it reaches every tween
   * pointed at these objects, including ones another feature owns, and it reports nothing about
   * what it hit. Two handles cost two locals and stop exactly the two tweens this function started.
   *
   * 🔴 Criterion 9.4 — the end value is FORCE-SETTLED on `onStop`, and again on `onComplete`.
   *
   * ⚠️ **What Phaser 4.2.1 actually does, read out of the vendored source rather than assumed.** An
   * earlier version of this comment said Phaser writes the end value in *neither* callback. That is
   * wrong in one of the three exits, and a docstring the next tween author will rely on has to be
   * right *(C9)*:
   *
   *  1. **Natural completion DOES write it.** `tweens/tween/TweenData.js` runs
   *     `target[key] = this.current;` *before* its `if (complete)` branch, and at `v = 1` `current`
   *     IS `end`. The `onComplete` settle is still kept, because it is the same function and because
   *     `hudGearPop`'s version of it also clears a tint, which Phaser never does.
   *  2. **`stop()` does NOT.** It leaves the targets wherever the interpolation had reached, so a
   *     fade interrupted a third of the way through stays a third dark forever. This is the exit the
   *     settle exists for, and it is the one `destroy()` below takes.
   *  3. **`destroy()` runs NEITHER.** `tweens/tween/BaseTween.js`'s `destroy()` sets
   *     `this.callbacks = null`, and it is reached from `TweenManager.shutdown()` → `killAll()`. A
   *     scene shutdown is therefore a stop path with no force-settle at all. Nothing here depends on
   *     one: the objects are destroyed on that path anyway, and `hudGearPop.destroy()` settles
   *     directly rather than through a callback for exactly this reason.
   */
  const settleFade = (): void => {
    fade.setAlpha(FADE_ALPHA);
  };
  const settleLines = (): void => {
    for (const line of lines) line.setAlpha(1);
  };
  const fadeTween = scene.tweens.add({
    targets: fade,
    alpha: FADE_ALPHA,
    duration: FADE_MS,
    ease: 'Quad.easeOut',
    onStop: settleFade,
    onComplete: settleFade,
  });
  // The text arrives slightly behind the dimming, so the panel reads as landing on a darkened screen
  // rather than the two crossing each other.
  const linesTween = scene.tweens.add({
    targets: lines,
    alpha: 1,
    duration: FADE_MS,
    delay: PANEL_DELAY_MS,
    ease: 'Quad.easeOut',
    onStop: settleLines,
    onComplete: settleLines,
  });

  return {
    fade,
    lines,
    destroy() {
      // The tweens go first. A tween still running against a destroyed target throws inside Phaser's
      // update loop, and a throw there stops every subsequent scene — which is how the Phase 6
      // restart path left a frozen HUD over an error screen. The ordering is not stylistic, and it
      // did not change when the kill-by-target call became these two stops: what changed is WHICH
      // tweens are stopped, not when.
      fadeTween.stop();
      linesTween.stop();
      for (const line of lines) line.destroy();
      fade.destroy();
    },
  };
}
