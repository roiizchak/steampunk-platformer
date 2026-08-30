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
 * ## Keys — one way in
 *
 * `Enter`, `NumpadEnter` and `Space` all open the LEVEL MENU. Nothing on this screen starts a level
 * directly, by the owner's 2026-08-29 decision.
 *
 * ⚠️ **This paragraph used to argue that level select could not be on ENTER**, because `scene.start`
 * is queued: `LevelSelectScene.create()` runs with ENTER still physically held, its brand-new `Key`
 * has `isDown === false`, and the OS auto-repeat ~500 ms later reads as a fresh press — so the menu
 * would open and immediately launch a level. **The trap is real and the conclusion was wrong.**
 * `LevelSelectScene.bindKeys()` closes it on its own side, with a native-`repeat` guard its comment
 * documents, which is why ENTER can be the single door. `L` was the second door that argument bought
 * and it is no longer bound here at all.
 *
 * Every binding carries the native `event.repeat` guard for the same family of reasons.
 */

import Phaser from 'phaser';
import { TITLE_KEY } from './gameTitle';
import { applyAudioAction, audioActionForCode } from './audioKeyMap';
import type { AudioActionResult } from './audioKeyMap';
import { readAudioSettings, safeLocalStorage } from '../game/audioSettings';
import { TITLE_BACKDROP_KEY } from '../render/titleInk';
import { RULE_ALPHA, RULE_PX, TITLE_ROWS, panelSize } from '../render/titleInk';
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
import { attachRotatePrompt } from './rotateGuard';
import { attachTapRoutes } from './touchRoutes';

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
   * ENTER key stops the scene and goes nowhere — see `TitleSceneData.onLevelSelect`.
   */
  private data$: TitleSceneData | null = null;
  /**
   * Dismissal is once.
   *
   * Phaser drains its whole key queue in a single `KeyboardPlugin.update()` pass, so two dismissal
   * keys arriving in the same frame both reach `dismiss`.
   *
   * ⚠️ **This is defence, and it no longer has a gate — read the reason before deleting it.**
   * It was written against `[stop Title, stop Game, start LevelSelect, stop Title, resume Game]`,
   * where the last op is not a no-op: `Systems.shutdown()` sets the same `settings.active = false`
   * that `pause` sets, so `Systems.resume()` cannot tell a stopped scene from a paused one and
   * would step a torn-down `Game` under the menu. **That sequence needed `onPlay`**, which the
   * owner's 2026-08-29 decision removed. Measured the same day: with the flag deleted, a two-key
   * batch is `scene.stop()` on an already-stopping `Title` and `scene.start('LevelSelect')` twice,
   * which restarts the menu to the same state — nothing observable changes, and no e2e assertion
   * moves. Kept because a second route back to a resume is cheap to add and expensive to notice;
   * the honesty is in saying so rather than shipping a test that cannot fail.
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
  /**
   * The generated title plate, drawn once and never moved.
   *
   * ⚠️ **This was three drifting parallax layers until 2026-08-29**, with a tick-drained drift and
   * a gate pinning it to `frameClock`. The owner chose the generated backdrop, and a single plate
   * cannot drift: it does not tile, so scrolling it would expose its own edge. The stillness is the
   * trade, taken deliberately — a title card is not a level, and motion was never what was asked
   * for. The drift, its constant and its gate were removed rather than left guarding nothing.
   */
  private backdropImage?: Phaser.GameObjects.Image;
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
    this.rules = [];
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
     *    through any gap the plate leaves. "No platforms, no player, no HUD" is the owner's
     *    requirement, and only an opaque floor guarantees it.
     * 2. The generated title plate — one image, drawn at the live canvas size.
     * 3. Nothing else. No tiles, no sprites: this is a composed screen, not a frozen level.
     */
    // 🔴 BELOW the plate at depth -100. The first version left this at the default depth 0 and
    // painted an opaque rectangle straight over the art — the screen rendered as a flat dark field
    // and looked exactly like the version it replaced.
    this.backdrop = this.add
      .rectangle(0, 0, 10, 10, SCRIM_COLOUR, 1)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-200);
    this.backdropImage = this.add
      .image(0, 0, TITLE_BACKDROP_KEY)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(-100);
    // The panel goes ON TOP of the plate and UNDER the text — the only thing that dims anything.
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
    // The copy change is required, not cosmetic. This screen advertised a key only, so a phone
    // player was told to press ENTER and given no way in even once the tap worked.
    make('ENTER or TAP   choose a level', CHOICE_STYLE);
    // The audio keys are advertised here because this screen answers them — see `bindKeys`.
    this.hint = make(audioHint(this.audioState.muted, this.audioState.volume), HINT_STYLE);

    // One zone over the whole view: this screen has a single action, so anywhere is the target.
    // No field and no explicit teardown — `attachTapRoutes` registers against this scene's own
    // SHUTDOWN and DESTROY, which is the same lifetime the objects above have.
    const titleTargets = [
      { id: 'title', x: 0, y: 0, w: this.scale.gameSize.width, h: this.scale.gameSize.height },
    ];
    attachTapRoutes(this, this.game.device.input.touch, titleTargets, () =>
      this.dismiss(this.data$?.onLevelSelect),
    );
    // A screen with a route needs a prompt: `touchRoutes.ts` makes the route dead while the prompt
    // would be up, and a gated tap with nothing on screen to explain it is worse than the defect.
    attachRotatePrompt(this, this.game.device.input.touch, titleTargets);

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
      this.backdropImage = undefined;
      this.hint = undefined;
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, teardown);
    this.events.once(Phaser.Scenes.Events.DESTROY, teardown);

    this.bindKeys();
  }

  /** Centre everything against the LIVE size, never a literal (vault 6.2). */
  private applyLayout(): void {
    const { width, height } = this.scale.gameSize;
    this.backdrop?.setSize(width, height);
    // `setDisplaySize`, not `setSize`: the plate is 1920x1080 and the canvas is too at the design
    // size, but `Scale.FIT` is not the only path here — a resize spec drives the layout directly.
    this.backdropImage?.setDisplaySize(width, height);
    // The panel is sized FROM the text it has to cover, so no ink can ever land outside it — which is
    // what keeps `title-contrast.test.ts`'s bound true rather than approximately true.
    const { w, h } = panelSize(width, height);
    this.panel?.setPosition(width / 2, height / 2).setSize(w, h);
    this.rules.forEach((rule, i) => {
      rule.setPosition(width / 2, height / 2 + (i === 0 ? -h / 2 : h / 2)).setSize(w, RULE_PX);
    });
    // Fractions of the height, so the arrangement survives any viewport the scale manager hands us.
    // FOUR rows, and they live in `titleInk.ts` — both because a unit test can then prove they land
    // inside the panel the contrast premise depends on, and because the two re-spreads they have
    // been through are worth reading before touching them. See `TITLE_ROWS`.
    const rows = TITLE_ROWS;
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
   * The `dismissed` latch below is defence with no live gate — see the field's own note.
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
