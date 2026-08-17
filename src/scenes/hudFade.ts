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

import Phaser from 'phaser';
import { HUD_MARGIN } from '../render/hud';

/** Above every HUD object `UIScene.build()` creates, so the fade dims the HUD too. */
export const OVERLAY_DEPTH = 1000;

/** How dark the world goes. Not 1: the finished level stays visible behind the panel, dimmed. */
export const FADE_ALPHA = 0.72;

/** Long enough to read as a transition, short enough not to delay the continue press. */
export const FADE_MS = 420;

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

  const targets: Phaser.GameObjects.GameObject[] = [fade, ...lines];
  scene.tweens.add({ targets: fade, alpha: FADE_ALPHA, duration: FADE_MS, ease: 'Quad.easeOut' });
  // The text arrives slightly behind the dimming, so the panel reads as landing on a darkened screen
  // rather than the two crossing each other.
  scene.tweens.add({
    targets: lines,
    alpha: 1,
    duration: FADE_MS,
    delay: FADE_MS / 2,
    ease: 'Quad.easeOut',
  });

  return {
    fade,
    lines,
    destroy() {
      // The tweens go first. A tween still running against a destroyed target throws inside Phaser's
      // update loop, and a throw there stops every subsequent scene — which is how the Phase 6
      // restart path left a frozen HUD over an error screen.
      scene.tweens.killTweensOf(targets);
      for (const line of lines) line.destroy();
      fade.destroy();
    },
  };
}
