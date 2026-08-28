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
import { applyAudioAction, audioActionForCode } from './audioKeyMap';
import type { AudioManager } from '../game/audio';

export const TITLE_KEY = 'Title';

const TITLE_STYLE = { fontFamily: 'monospace', fontSize: '72px', color: '#f0d79a' } as const;
const SUB_STYLE = { fontFamily: 'monospace', fontSize: '26px', color: '#7fb2c8' } as const;
const CHOICE_STYLE = { fontFamily: 'monospace', fontSize: '34px', color: '#d9cdb0' } as const;
const HINT_STYLE = { fontFamily: 'monospace', fontSize: '22px', color: '#8f8776' } as const;

/**
 * A scrim, so the frozen level behind stays legible as a backdrop without competing with the text.
 * Alpha rather than a solid fill: the point of pausing rather than hiding `Game` is that the world
 * is visible behind the title.
 */
const SCRIM_COLOUR = 0x12100e;
const SCRIM_ALPHA = 0.82;

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
  onLevelSelect?: () => void;
  /** Resume the paused `Game`. Owned by `gameTitle.ts`, which is what paused it. */
  onPlay?: () => void;
}

export class TitleScene extends Phaser.Scene {
  private data$: TitleSceneData = {};
  private items: Phaser.GameObjects.Text[] = [];
  private scrim?: Phaser.GameObjects.Rectangle;

  constructor() {
    super(TITLE_KEY);
  }

  /**
   * Reset here rather than in the constructor — Phase 1's lesson. A scene start is queued and the
   * constructor runs once, so state initialised there survives a restart.
   */
  init(data?: TitleSceneData): void {
    this.data$ = data ?? {};
    this.items = [];
  }

  create(): void {
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
    make('M mute   ·   [ ] volume', HINT_STYLE);

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
        const manager = this.data$.audio?.();
        if (manager) {
          applyAudioAction(manager, action);
        }
        return;
      }
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
        this.dismiss(this.data$.onPlay);
        return;
      }
      if (event.code === 'KeyL') {
        this.dismiss(this.data$.onLevelSelect);
      }
    });
  }

  /**
   * Stop this scene, then hand over.
   *
   * Order matters: `onLevelSelect` calls `Game`'s `ScenePlugin.start()`, which stops `Game` — and
   * this scene must already be on its way out rather than left drawn over the menu that replaces it.
   */
  private dismiss(then?: () => void): void {
    this.scene.stop();
    then?.();
  }
}
