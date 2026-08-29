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
import { createParallax, renderParallax } from './gameParallax';
import type { ParallaxImage } from './gameParallax';
import { RULE_ALPHA, RULE_PX, TITLE_DRIFT_PX_PER_TICK, panelSize } from '../render/titleInk';
import type { AudioManager } from '../game/audio';
import {
  audioHint,
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
/** The heading ink as a Phaser numeric colour, for the two shapes that are not text. */
const TITLE_FILL_HEX = Number.parseInt(TITLE_FILL.slice(1), 16);
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
  /**
   * 🔴 **The only way out, and therefore required.** `audio` may be absent and degrade to a dead
   * key, which is the right failure; this one cannot — a `Title` launched without it answers ENTER
   * by stopping itself and going nowhere, leaving a frozen `Game` with nothing drawn over it.
   *
   * ⚠️ There used to be an `onPlay` beside this, resuming the paused `Game` for a title that could
   * start a level directly. **The owner's 2026-08-29 decision left it with no caller**, and an
   * exported callback nobody invokes is the defect this project names for decision functions. It is
   * gone rather than kept "in case": the menu is the way in, and the menu STOPS `Game` rather than
   * resuming it.
   */
  onLevelSelect: () => void;
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
  /**
   * The panel behind the TEXT — no longer a full-canvas scrim.
   *
   * 🔴 The first version dimmed the whole screen to 82 %, which is what made the backdrop unreadable
   * and is the thing the owner objected to. The contrast bound has not moved: it was always
   * "ink over `SCRIM_ALPHA` of `SCRIM_COLOUR` over an arbitrary bright pixel", and that is exactly
   * what the panel still is. Shrinking WHERE it applies changes nothing the sweep in
   * `title-contrast.test.ts` measures — but it does mean the ink is only ever drawn on top of it,
   * which `applyLayout` guarantees by sizing the panel from the text it contains.
   */
  private panel?: Phaser.GameObjects.Rectangle;
  /** The two brass hairlines at the band edges. Decoration, but decoration that has to be laid out. */
  private rules: Phaser.GameObjects.Rectangle[] = [];
  /** An opaque floor, so the PAUSED level underneath is never visible through a transparent layer. */
  private backdrop?: Phaser.GameObjects.Rectangle;
  private parallax: ParallaxImage[] = [];
  /** Ticks since the screen opened, for the backdrop drift. Integer counts, never a delta multiply. */
  private drift = 0;
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
    // The one callback that is the way out. Without it this screen has no exit, so it refuses to
    // draw rather than trapping the player behind a paused game.
    this.data$ = typeof data?.onLevelSelect === 'function' && data ? data : null;
    this.items = [];
    this.parallax = [];
    this.rules = [];
    this.drift = 0;
    this.dismissed = false;
    this.audioState = readAudioSettings(safeLocalStorage());
  }

  create(): void {
    // No way out means no screen. An inert Title is harmless — nothing paused `Game` either,
    // because `attachTitle` is what pauses it and `attachTitle` always passes the callback.
    if (!this.data$) {
      return;
    }
    /**
     * The backdrop, in three parts and in this order.
     *
     * 1. An OPAQUE rectangle, because `Game` is paused underneath rather than stopped and would show
     *    through any gap the parallax art leaves. "No platforms, no player, no HUD" is the owner's
     *    requirement, and only an opaque floor guarantees it.
     * 2. The same three parallax layers the game draws, from `gameParallax.ts` — the identical
     *    builder, so a texture key that stopped existing breaks the title and the level together
     *    rather than silently drawing nothing here.
     * 3. Nothing else. No tiles, no sprites: this is a composed screen, not a frozen level.
     */
    // 🔴 BELOW the parallax, which `createParallax` puts at depth -100..-98. The first version left
    // this at the default depth 0 and painted an opaque rectangle straight over all three layers —
    // the screen rendered as a flat dark field and looked exactly like the version it replaced.
    this.backdrop = this.add
      .rectangle(0, 0, 10, 10, SCRIM_COLOUR, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-200);
    this.parallax = createParallax(this);
    // The panel goes ON TOP of the parallax and UNDER the text — the only thing that dims anything.
    this.panel = this.add.rectangle(0, 0, 10, 10, SCRIM_COLOUR, SCRIM_ALPHA).setOrigin(0.5).setScrollFactor(0);
    this.rules = [0, 1].map(() =>
      this.add.rectangle(0, 0, 10, RULE_PX, TITLE_FILL_HEX, RULE_ALPHA).setOrigin(0.5).setScrollFactor(0),
    );

    const make = (text: string, style: Phaser.Types.GameObjects.Text.TextStyle): Phaser.GameObjects.Text => {
      const object = this.add.text(0, 0, text, style).setOrigin(0.5).setScrollFactor(0);
      this.items.push(object);
      return object;
    };

    make('STEAMPUNK PLATFORMER', TITLE_STYLE);
    make('a short climb through the works', SUB_STYLE);
    // 🔴 ONE way in, and it is the level menu — owner's decision, 2026-08-29. `ENTER` used to start
    // a level directly with `L` as a second route to the menu; two doors to the same place is a
    // choice the player has no basis to make on the first screen they see.
    make('ENTER   choose a level', CHOICE_STYLE);
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
    // 🔴 DESTROY as well, and each cancels the other — the same pair `gameInput.ts` documents.
    // `SceneManager.remove()` reaches `sys.destroy()` without emitting SHUTDOWN, so removing an
    // active Title would leak this GLOBAL ScaleManager subscription and every `Text` it retains.
    // Round 1 fixed this on the game listener and missed it here; round 2 found the half. Codex
    // implementation review.
    const teardown = (): void => {
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, teardown);
      this.events.off(Phaser.Scenes.Events.DESTROY, teardown);
      this.scale.off('resize', this.applyLayout, this);
      this.items = [];
      this.panel = undefined;
      this.rules = [];
      this.backdrop = undefined;
      this.parallax = [];
      this.hint = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);

    this.bindKeys();
  }

  /**
   * Drift the backdrop.
   *
   * Phaser hands `update` a wall-clock delta and this screen deliberately ignores it: the drift is an
   * integer count of frames times an integer pixel step, so the same number of frames always moves it
   * the same distance. That is the project's rule for durations and distances, applied to the one
   * piece of motion a paused screen owns.
   *
   * `renderParallax` is the same function `gameFrameDraw.ts` calls, taking a scroll in world pixels
   * — so each layer's own factor still decides how fast it moves relative to the others.
   */
  override update(): void {
    if (this.parallax.length === 0) {
      return;
    }
    this.drift += TITLE_DRIFT_PX_PER_TICK;
    renderParallax(this.parallax, this.drift);
  }

  /** Centre everything against the LIVE size, never a literal (vault 6.2). */
  private applyLayout(): void {
    const { width, height } = this.scale.gameSize;
    this.backdrop?.setSize(width, height);
    for (const { image } of this.parallax) {
      image.setSize(width, height);
    }
    // The panel is sized FROM the text it has to cover, so no ink can ever land outside it — which is
    // what keeps `title-contrast.test.ts`'s bound true rather than approximately true.
    const { w, h } = panelSize(width, height);
    this.panel?.setPosition(width / 2, height / 2).setSize(w, h);
    this.rules.forEach((rule, i) => {
      rule.setPosition(width / 2, height / 2 + (i === 0 ? -h / 2 : h / 2)).setSize(w, RULE_PX);
    });
    // Fractions of the height, so the arrangement survives any viewport the scale manager hands us.
    // FOUR rows now, not five — the second choice line went when ENTER became the only way in.
    // Re-spread rather than left as [0.3, 0.4, 0.56, 0.64] with a hole at 0.82, which would have
    // bunched everything into the top two thirds of the panel.
    const rows = [0.34, 0.45, 0.61, 0.72];
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
      //
      // 🔴 `isComposing` too, and it is NOT redundant with `gameInput.ts`'s. This scene registers
      // no `Key` objects at all, so `keys[229]` is undefined and Phaser's `ANY_KEY_DOWN` accepts a
      // composition keydown here that the game listener rejects — the welcome screen was the one
      // place a CJK user composing text could still walk the volume. Codex implementation review,
      // finding 3: the guard was copied to one of the two listeners.
      if (event.repeat || event.isComposing) {
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
      // Every begin key goes to the LEVEL MENU. There is no second route and no resume.
      if (event.code === 'Enter' || event.code === 'NumpadEnter' || event.code === 'Space') {
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
   * Stop this scene, then hand over — **once**.
   *
   * ⚠️ This used to say *"order matters: this scene must already be on its way out rather than left
   * drawn over the menu that replaces it."* **That claim is not falsifiable and is therefore not
   * kept.** Both operations are queued, and `SceneManager.processQueue` re-reads `_queue.length`
   * every iteration, so the stop and the start drain in the SAME pass either way: swapping these two
   * lines produces no rendered frame with the title over the menu and leaves the whole suite green.
   * A comment naming a mechanism no gate can test is the kind this project treats as worse than
   * none. Criterion 11.14 review.
   *
   * What *is* load-bearing is the `dismissed` latch — see the field's own note.
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
