/**
 * The level menu — Phase 8. Ships, so it is registered in **both** arms of `config.ts`.
 *
 * ## Why the game does not boot into this
 *
 * The owner's decision this phase: **Boot routes to `Game`**, and this screen is reached by a key.
 * Every Phase 1–7 e2e spec asserts `sceneKey === 'Game'` after `ready`, and a menu in front of the
 * game would have turned ~40 passing specs red for a reason that has nothing to do with what they
 * test. Boot-to-Game also means a returning player lands in their level rather than in a list.
 *
 * ## Lock state comes from the save and the catalog, never from a level's name
 *
 * `isUnlocked` decides, against the catalog's order *(vault 3.3)*. This scene has no opinion; it draws
 * what it is told. That is why a corrupt save entry shows here as a **locked** level — `readProgress`
 * drops the entry, so `completedIds` never sees it, so the next level is not unlocked. The failure
 * direction is chosen in `save.ts` and simply arrives here.
 *
 * ## The gear totals are parsed, not stored
 *
 * `best 6 / 9` needs the level's gear count, and the only honest source is the level file. Boot has
 * already loaded and validated every catalogued `.tmj` into the tilemap cache — that is what
 * `bootLevels.ts` does — so parsing them here is a cache read, not I/O, and the number cannot drift
 * from the level that shipped the way a hand-maintained total would.
 */

import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../game/constants';
import { bestGears, completedIds, readProgress, safeLocalStorage } from '../game/save';
import { parseLevel } from '../game/tilemap';
import { isUnlocked } from '../sim/progress';
import { updateDebugState } from '../debug/globals';
import { LEVEL_SELECT_KEY, assetCatalog, levelOrder } from './gameLevelPick';

const TITLE_STYLE = { fontFamily: 'monospace', fontSize: '56px', color: '#f0d79a' } as const;
const HINT_STYLE = { fontFamily: 'monospace', fontSize: '22px', color: '#8f8776' } as const;
const ROW_STYLE = { fontFamily: 'monospace', fontSize: '34px' } as const;

const ROW_HEIGHT = 68;
const UNLOCKED_COLOUR = '#d9cdb0';
const LOCKED_COLOUR = '#5d5748';
const SELECTED_COLOUR = '#ffd873';

interface Row {
  id: string;
  unlocked: boolean;
  label: string;
  text: Phaser.GameObjects.Text;
}

export class LevelSelectScene extends Phaser.Scene {
  private rows: Row[] = [];
  private cursor = 0;

  constructor() {
    super(LEVEL_SELECT_KEY);
  }

  /**
   * Reset here, not in the constructor — Phase 1's lesson. A scene start is queued and the constructor
   * runs once, so state initialised there survives a restart and makes the second visit differ from
   * the first: a cursor left on row 4 would open a locked level after the save was cleared.
   */
  init(): void {
    this.rows = [];
    this.cursor = 0;
  }

  create(): void {
    const catalog = assetCatalog(this);
    const order = levelOrder(catalog);
    const save = readProgress(safeLocalStorage());
    const done = completedIds(save);

    this.add
      .text(GAME_WIDTH / 2, 160, 'SELECT LEVEL', TITLE_STYLE)
      .setOrigin(0.5)
      .setScrollFactor(0);

    const top = GAME_HEIGHT / 2 - (order.length * ROW_HEIGHT) / 2;
    this.rows = order.map((id, index) => {
      const unlocked = isUnlocked(id, done, order);
      const label = this.rowLabel(id, unlocked, save, index);
      const text = this.add
        .text(GAME_WIDTH / 2, top + index * ROW_HEIGHT, label, ROW_STYLE)
        .setOrigin(0.5)
        .setScrollFactor(0);
      return { id, unlocked, label, text };
    });

    // Open on the furthest playable level rather than on row 0. A player with four levels done wants
    // the fifth, and the arrow keys are there for anyone who wants an earlier one.
    const lastPlayable = this.rows.map((row) => row.unlocked).lastIndexOf(true);
    this.cursor = lastPlayable < 0 ? 0 : lastPlayable;

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 140, 'UP / DOWN choose   ·   ENTER play', HINT_STYLE)
      .setOrigin(0.5)
      .setScrollFactor(0);

    this.bindKeys();
    this.paint();

    /**
     * 🔴 Publish, or the debug surface reports a running game while a menu is on screen.
     *
     * `state` in `src/debug/globals.ts` is module-level and only ever patched, so without this the
     * eight fields keep whatever `GameScene` last wrote: `sceneKey: 'Game'`, `ready: true`, a
     * `levelId` for a level that is not loaded, and a frozen player at frozen coordinates. Every one
     * of them is a lie for as long as the menu is up — and `gameHarness.bootToGame` asserts
     * `sceneKey === 'Game'`, so that assertion, which about forty specs stand on, would be satisfied
     * by this screen. This is the first SHIPPED scene the player can reach that does not extend
     * `GameScene`, so it is the first one that had to say so itself. Found by the Phase 8
     * code-reviewer's adversarial brief; the Phase 8 spec had quietly worked around it with
     * `scene.isActive('LevelSelect')` instead.
     *
     * `player` and `levelId` go to `null` because there is no level here — the honest value, and the
     * same one `BootScene` publishes before it routes. `ready` stays true: it is the boot's terminal
     * condition, and the boot really did finish.
     */
    updateDebugState({ sceneKey: this.scene.key, player: null, levelId: null });
  }

  /**
   * `level-03  ·  best 6 / 9`, or `level-04  ·  locked`.
   *
   * The gear total is parsed off the shipped `.tmj` in the cache — see this file's header. A level that
   * somehow failed to parse shows as unlocked-with-no-score rather than crashing the menu: Boot has
   * already refused to route on an unparseable level, so reaching this catch means something stranger
   * has happened than a bad level, and a menu that throws leaves no way out of it.
   */
  private rowLabel(id: string, unlocked: boolean, save: ReturnType<typeof readProgress>, index: number): string {
    if (!unlocked) {
      return `${index + 1}. ${id}   ·   locked`;
    }
    let total = 0;
    try {
      const cached = this.cache.tilemap.get(id) as { data?: unknown } | undefined;
      total = parseLevel(id, cached?.data).gears.length;
    } catch {
      return `${index + 1}. ${id}`;
    }
    return `${index + 1}. ${id}   ·   best ${bestGears(save, id, total)} / ${total}`;
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    const { UP, DOWN, W, S, ENTER } = Phaser.Input.Keyboard.KeyCodes;
    // `emitOnRepeat: false`, matching `gameInput.ts`: the OS repeats a held key ~30 times a second and
    // a repeating cursor would shoot past every row.
    const addKey = (code: number) => keyboard.addKey(code, true, false);
    addKey(UP).on('down', () => this.move(-1));
    addKey(W).on('down', () => this.move(-1));
    addKey(DOWN).on('down', () => this.move(1));
    addKey(S).on('down', () => this.move(1));
    // 🔴 `event.repeat` is the guard, and it is load-bearing. The last level's completion panel is
    // dismissed with ENTER and `scene.start` is QUEUED, so this scene's `create()` runs while that
    // ENTER is still physically held. The `Key` built one line above is brand new with
    // `isDown === false`, so the OS auto-repeat ~500 ms later looks to Phaser like a fresh press —
    // `emitOnRepeat: false` cannot help, because Phaser has no memory of a press it never saw. The
    // menu would open on the just-finished level and immediately replay it. The NATIVE event knows:
    // every keydown after the first for a held key carries `repeat: true`.
    addKey(ENTER).on('down', (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
      if (event.repeat) return;
      this.play();
    });
    keyboard.addCapture('UP,DOWN,W,S,ENTER');
  }

  private move(delta: number): void {
    if (this.rows.length === 0) return;
    this.cursor = (this.cursor + delta + this.rows.length) % this.rows.length;
    this.paint();
  }

  private paint(): void {
    this.rows.forEach((row, index) => {
      const selected = index === this.cursor;
      row.text.setColor(selected ? SELECTED_COLOUR : row.unlocked ? UNLOCKED_COLOUR : LOCKED_COLOUR);
      row.text.setText(selected ? `> ${row.label}` : row.label);
    });
  }

  /**
   * Start the selected level — or refuse.
   *
   * 🔴 The refusal is not cosmetic. `resolveEntryLevel` would reject a locked id anyway and silently
   * drop the player into level-01, which reads as the menu ignoring the keypress. Refusing here keeps
   * the two rules agreeing *and* keeps the reason visible: the row is drawn `locked`, and pressing
   * ENTER on it does nothing.
   */
  private play(): void {
    const row = this.rows[this.cursor];
    if (!row || !row.unlocked) return;
    this.scene.start('Game', { levelId: row.id });
  }
}
