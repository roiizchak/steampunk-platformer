/**
 * The welcome screen — Phase 11. Ships, so it is registered in **both** arms of `config.ts`.
 *
 * ## Why this is an overlay and not somewhere boot routes to
 *
 * A title screen in front of the game is the obvious shape and it is the wrong one here.
 * `ready: true` is published in exactly one place — `GameScene.create()` — and it is the positive
 * terminal condition every e2e spec waits on instead of sleeping. 32 spec files then assert
 * `sceneKey === 'Game'`, 31 of them through one line in `gameHarness.bootToGame`. Routing boot
 * somewhere else would mean publishing `ready` from a second scene, which is a load-bearing
 * three-state invariant *(vault 1.4)* changed for a menu.
 *
 * So this scene is **parallel to `Game`**, launched by it, exactly as `UIScene` is. Boot still
 * routes to `Game`, `ready` and `sceneKey` keep their meanings, and the specs keep passing for the
 * reasons they always did.
 *
 * ## 🔴 It publishes NOTHING to `window.__game`
 *
 * The opposite of `LevelSelectScene`, which publishes because it *replaces* `Game`. This does not
 * replace anything — `GameScene` is still loaded, still owns the world, and is simply paused
 * underneath. `sceneKey` names the scene that owns the world, so it correctly stays `'Game'`, the
 * same silence `UIScene` keeps. **No ninth field**; the surface is closed at eight by a Phase 1
 * Codex ruling.
 *
 * ## 🔴 `Game` is PAUSED while this is up, and that is the whole safety mechanism
 *
 * `playerInputEnabled = false` was the first design and it is not enough: it only clears
 * `sampleHeldKeys`, while `advanceSplit`, completion, enemies, cues, effects and rendering all keep
 * running. The player could fall, take damage, die or finish a level while reading the title.
 *
 * Pausing fixes that and one more thing for free. `KeyboardPlugin.isActive()` is
 * `enabled && scene.sys.canInput()`, and `Systems.canInput()` returns
 * `status > PENDING && status <= RUNNING` — **PAUSED is 6, above RUNNING's 5**, so a paused scene's
 * keyboard plugin stops processing entirely. That is what stops ESC (deliberately ungated on
 * `playerInputEnabled`, see `gameInput.ts`) and the DEV scene-switch keys from leaking past this
 * screen, and what stops SPACE latching a jump on the very press that dismisses it.
 *
 * A paused scene still RENDERS, which is exactly what a title card over a frozen first level wants.
 * `UIScene` deliberately survives PAUSED too — it retires only at SLEEPING — so the HUD stays put.
 *
 * ## Keys, and why level select is not on ENTER
 *
 * `Enter` / `Space` begin play; **`L`** opens the level menu. `L` rather than a second ENTER binding
 * because `scene.start` is **queued**: `LevelSelectScene.create()` would run with ENTER still
 * physically held, its brand-new `Key` has `isDown === false`, and the OS auto-repeat ~500 ms later
 * reads as a fresh press — the menu would open and immediately launch a level. That is the exact
 * trap `LevelSelectScene.bindKeys()`'s own comment documents. `L` is an attack key during play,
 * which is harmless only because `Game` is paused while this is up.
 *
 * Every binding carries the native `event.repeat` guard for the same family of reasons.
 */

import Phaser from 'phaser';
import { TITLE_KEY } from './gameTitle';
import { applyAudioAction, audioActionForCode } from './audioKeyMap';
import type { AudioActionResult } from './audioKeyMap';
import { readAudioSettings, safeLocalStorage } from '../game/audioSettings';
import type { AudioManager } from '../game/audio';
import {
  CHOICE_FILL,
  HINT_FILL,
  SCRIM_ALPHA,
  SCRIM_COLOUR,
  SUB_FILL,
  TITLE_FILL,
} from '../render/titleInk';

export { TITLE_KEY } from './gameTitle';

/**
 * 🔴 **The four fills and the scrim are imported, not written here.** They are the numbers
 * `tests/unit/title-contrast.test.ts` sweeps, and this file cannot be reached by a unit test because
 * it value-imports `phaser` on line 1. Two of them moved during the QA gate: the hint measured
 * **3.13:1** against the brightest background the scrim admits, under the 4.5:1 small-text bar. The
 * derivation is in `titleInk.ts`; do not inline a colour back into this file.
 */
const TITLE_STYLE = { fontFamily: 'monospace', fontSize: '72px', color: TITLE_FILL } as const;
const SUB_STYLE = { fontFamily: 'monospace', fontSize: '26px', color: SUB_FILL } as const;
const CHOICE_STYLE = { fontFamily: 'monospace', fontSize: '34px', color: CHOICE_FILL } as const;
const HINT_STYLE = { fontFamily: 'monospace', fontSize: '22px', color: HINT_FILL } as const;

export interface TitleSceneData {
  /**
   * Resolved per press, never captured — a manager that is not built yet is a press that does
   * nothing, which is the right failure for a key hit during a scene transition.
   */
  audio?: () => AudioManager | undefined;
  /**
   * 🔴 Owned by `GameScene`, called by this scene. Phaser's `scene.start()` stops its **caller**, so
   * a `this.scene.start('LevelSelect')` here would stop *Title* and leave `Game` running underneath
   * while `LevelSelect` published `player: null` over a live world. The existing safe path starts
   * the menu from `Game` (`gameLevelPick.openLevelSelect`), and this keeps using it.
   */
  onLevelSelect: () => void;
  /**
   * Resume the paused `Game`. Owned by `gameTitle.ts`, which is what paused it.
   *
   * 🔴 **Required, not optional.** `audio` may be absent and degrade to a dead key, which is the
   * right failure. This one cannot: a `Title` launched without it answers ENTER by stopping itself
   * and never resuming, leaving a frozen `Game` with nothing drawn over it and no way out. The type
   * is the guard — `attachTitle` is the only launcher today, and this stops the second one from
   * being written wrong.
   */
  onPlay: () => void;
}

/**
 * The audio hint, rendered from the CURRENT state rather than as a fixed string.
 *
 * 🔴 **A screen that advertises a control owes the player the control's value.** Nothing else in the
 * game shows the volume — not the HUD, not the level menu — and at the shipped default of
 * `volume: 1` the first press of `]` clamps and does nothing at all. A player who tries the key
 * this screen just taught them gets silence, with no way to tell "already at maximum" from "still
 * broken" — which is exactly the reading the owner reported before the dispatch bug was found.
 *
 * Showing the number costs one line and makes both answers visible. Found by the criterion 11.12
 * adversarial brief, which asked who the screen fails rather than whether it is laid out correctly.
 */
function audioHint(muted: boolean, volume: number): string {
  const level = muted ? 'muted' : `${Math.round(volume * 100)}%`;
  return `M mute   ·   [ ] volume   ${level}`;
}

export class TitleScene extends Phaser.Scene {
  /**
   * `null` means "launched with no data at all", which `attachTitle` never does and a second
   * launcher might. `create()` refuses to draw in that state rather than putting up a screen whose
   * ENTER key stops the scene and resumes nothing — see `TitleSceneData.onPlay`.
   */
  private data$: TitleSceneData | null = null;
  /**
   * 🔴 **Dismissal is once, and the flag is why.** Phaser drains its whole key queue in a single
   * `KeyboardPlugin.update()` pass, so `L` and `ENTER` arriving in the same frame both reach
   * `dismiss`. The queue that produces is `[stop Title, stop Game, start LevelSelect, stop Title,
   * resume Game]` — and that last op is **not** a no-op: `Systems.shutdown()` sets
   * `settings.active = false`, which is the same thing `pause` sets, so `Systems.resume()` cannot
   * tell a paused scene from a stopped one. It would flip the torn-down `Game` back to `RUNNING`
   * and `SceneManager.update` would step it against a dead display list while `LevelSelect` owns
   * the screen. Found by the criterion 11.14 review, reading the engine rather than the diff.
   */
  private dismissed = false;
  private items: Phaser.GameObjects.Text[] = [];
  private scrim?: Phaser.GameObjects.Rectangle;
  private hint?: Phaser.GameObjects.Text;
  /**
   * Seeded from the PERSISTED settings, which is the same store `createAudio()` copies at boot —
   * so the first frame shows the truth without `AudioManager` growing a getter it has no other use
   * for. Kept in step afterwards from what `applyAudioAction` returns.
   */
  private audioState = { muted: false, volume: 1 };

  constructor() {
    super(TITLE_KEY);
  }

  /**
   * Reset here rather than in the constructor — Phase 1's lesson. A scene start is queued and the
   * constructor runs once, so state initialised there survives a restart.
   */
  init(data?: TitleSceneData): void {
    this.data$ = data && typeof data.onPlay === 'function' ? data : null;
    this.items = [];
    this.dismissed = false;
    this.audioState = readAudioSettings(safeLocalStorage());
  }

  create(): void {
    // No resume path means no screen. An inert Title is harmless — nothing paused `Game` either,
    // because `attachTitle` is what pauses it and `attachTitle` always passes `onPlay`.
    if (!this.data$) {
      return;
    }
    this.scrim = this.add.rectangle(0, 0, 10, 10, SCRIM_COLOUR, SCRIM_ALPHA).setOrigin(0).setScrollFactor(0);

    const make = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text => {
      const object = this.add.text(0, 0, text, style).setOrigin(0.5).setScrollFactor(0);
      this.items.push(object);
      return object;
    };

    make('STEAMPUNK PLATFORMER', TITLE_STYLE);
    make('a short climb through the works', SUB_STYLE);
    make('ENTER   begin', CHOICE_STYLE);
    make('L   choose a level', CHOICE_STYLE);
    // The audio keys are advertised here because this screen answers them — see `bindKeys`.
    this.hint = make(audioHint(this.audioState.muted, this.audioState.volume), HINT_STYLE);

    this.applyLayout();
    // Re-layout rather than re-create, so a spec holding a reference across a resize is still
    // looking at the thing on screen. No literal sizes anywhere (vault 6.2).
    this.scale.on('resize', this.applyLayout, this);
    /**
     * 🔴 `this.scale` is the GLOBAL ScaleManager, so stopping this scene does not remove the
     * listener — a later resize would run `applyLayout` against destroyed `Text` objects.
     * `UIScene` unsubscribes on shutdown for exactly this reason.
     */
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off('resize', this.applyLayout, this);
      this.items = [];
      this.scrim = undefined;
      this.hint = undefined;
    });

    this.bindKeys();
  }

  /** Centre everything against the LIVE size, never a literal (vault 6.2). */
  private applyLayout(): void {
    const { width, height } = this.scale.gameSize;
    this.scrim?.setSize(width, height);
    // Fractions of the height, so the arrangement survives any viewport the scale manager hands us.
    const rows = [0.3, 0.4, 0.56, 0.64, 0.82];
    this.items.forEach((item, index) => {
      item.setPosition(width / 2, height * (rows[index] ?? 0.5));
    });
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    keyboard.on('keydown', (event: KeyboardEvent) => {
      // The OS repeats a held key ~30 times a second, and this scene is entered with a key possibly
      // still down from whatever started the game. Nothing here may fire twice.
      if (event.repeat) {
        return;
      }
      /**
       * 🔴 The audio keys answer HERE too, and deliberately WITHOUT `gameInput.ts`'s
       * `isPlayerInputEnabled()` guard.
       *
       * `Game` is paused while this screen is up, so its own listener is inert — and this is the
       * first screen the player sees. Leaving them dead here would mean shipping a welcome screen
       * whose advertised mute and volume keys do nothing, in the phase that exists to repair them.
       * The same shared map and applier as `gameInput.ts`, so the two can never drift.
       */
      const action = audioActionForCode(event.code);
      if (action) {
        const manager = this.data$?.audio?.();
        if (manager) {
          this.showAudio(applyAudioAction(manager, action));
        }
        return;
      }
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
        this.dismiss(this.data$?.onPlay);
        return;
      }
      if (event.code === 'KeyL') {
        this.dismiss(this.data$?.onLevelSelect);
      }
    });
  }

  /**
   * Redraw the hint from what the action actually became.
   *
   * The value comes from the manager's own return, not from a second read of storage — a press that
   * clamps returns the unchanged number, and the player seeing `100%` stay `100%` is the answer to
   * "did that key work?". Silence was not.
   */
  private showAudio(result: AudioActionResult): void {
    if (result.kind === 'mute') {
      this.audioState = { ...this.audioState, muted: result.muted };
    } else {
      this.audioState = { ...this.audioState, volume: result.volume };
    }
    this.hint?.setText(audioHint(this.audioState.muted, this.audioState.volume));
  }

  /**
   * Stop this scene, then hand over.
   *
   * Order matters: `onLevelSelect` calls `Game`'s `ScenePlugin.start()`, which stops `Game` — and
   * this scene must already be on its way out rather than left drawn over the menu that replaces it.
   */
  private dismiss(then?: () => void): void {
    if (this.dismissed) {
      return;
    }
    this.dismissed = true;
    this.scene.stop();
    then?.();
  }
}
