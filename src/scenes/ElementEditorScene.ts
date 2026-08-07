import Phaser from 'phaser';
import type { Rect } from '../sim/types';
import { GameScene } from './GameScene';

/**
 * **DEV ONLY.** Edit a level's collision strips against the drawn tiles, and write the result back
 * out as a `.tmj`.
 *
 * ## Why this scene exists at all
 *
 * The reference project shipped characters that floated above platforms, because the ART bottom
 * and the COLLISION bottom disagreed by a few pixels. Neither one is wrong on its own and no test
 * catches it — the collision tests pass, the art loads, and the character hovers. It is a defect
 * you can only see, and only fix, by looking at the two together and nudging one.
 *
 * So this scene deliberately puts the three things that must agree on screen at once: the drawn
 * tile layer, the collision strip, and the player standing on it.
 *
 * ## Why it can write a file at all
 *
 * The `.tmj` stays the single source of truth. Selecting a strip and pressing `S` serialises the
 * ORIGINAL Tiled JSON with only the edited object coordinates changed and downloads it, so the
 * edit goes back into the file Tiled opens and the unit suite validates. That is the whole reason
 * collision is an object layer of rectangles rather than tiles: a tile grid cannot represent a
 * 7 px nudge, so it cannot round-trip one.
 *
 * ## Two build gates, not one
 *
 * Registered under `import.meta.env.DEV` in `game/config.ts` **and** reached by a key bound under
 * `import.meta.env.DEV` in `GameScene.bindKeys`. Both halves are required: Phase 2 shipped
 * PlaygroundScene into `dist/` with only one of them, and a "DEV ONLY" note in a document is not
 * a build gate. Phase 10 verifies the absence.
 */

const OVERLAY_COLOUR = 0x4fb0c6;
const SELECTED_COLOUR = 0xe0c98a;
const NUDGE_PX = 1;
const COARSE_PX = 8;

export class ElementEditorScene extends GameScene {
  private strips: Phaser.GameObjects.Rectangle[] = [];
  private selected = 0;
  /** The strips as authored, so the readout can show a delta and never a bare coordinate. */
  private authored: Rect[] = [];
  private readout!: Phaser.GameObjects.Text;
  private saveNote!: Phaser.GameObjects.Text;

  constructor() {
    super('ElementEditor');
  }

  init(): void {
    super.init();
    this.strips = [];
    this.selected = 0;
    this.authored = [];
  }

  create(): void {
    super.create();

    // `world.solids` IS the array parseLevel produced, so nudging a rect in place is immediately
    // what the resolver collides against. That live coupling is the point: you see the fix in the
    // same frame you make it, standing on it.
    this.authored = this.simWorld.solids.map((s) => ({ ...s }));

    for (const solid of this.simWorld.solids) {
      this.strips.push(
        this.add
          .rectangle(solid.x, solid.y, solid.w, solid.h, OVERLAY_COLOUR, 0.28)
          .setOrigin(0, 0)
          .setStrokeStyle(2, OVERLAY_COLOUR, 0.9)
          .setDepth(5),
      );
    }

    this.readout = this.add
      .text(24, 60, '', { fontFamily: 'monospace', fontSize: '18px', color: '#e0c98a' })
      .setScrollFactor(0)
      .setDepth(10);
    this.saveNote = this.add
      .text(24, 132, '', { fontFamily: 'monospace', fontSize: '16px', color: '#7fb2c8' })
      .setScrollFactor(0)
      .setDepth(10);

    // The arrows belong to strip nudging here, not to walking. Left bound, a single arrow press
    // would nudge the strip AND accelerate the player in the same frame, so the readout and the
    // thing on screen would disagree about what just happened.
    //
    // The simulation still runs, and that is deliberate: watching the player SETTLE onto a strip
    // under gravity is the only way to see that the collision top and the drawn tile top agree,
    // which is the entire reason this scene exists.
    this.heldLeft = [];
    this.heldRight = [];
    this.heldJump = [];

    this.bindEditorKeys();
    this.selectStrip(0);
  }

  protected helpText(): string {
    return (
      '[ ] select strip  ·  ARROWS nudge  ·  SHIFT+ARROWS resize  ·  ' +
      'CTRL+ARROWS coarse  ·  S save .tmj  ·  R revert  ·  O back to game'
    );
  }

  /** `O` toggles back rather than deeper, matching PlaygroundScene's precedent. */
  protected toggleElementEditor(): void {
    this.scene.start('Game');
  }

  private bindEditorKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    const { OPEN_BRACKET, CLOSED_BRACKET, S, R } = Phaser.Input.Keyboard.KeyCodes;
    const addKey = (code: number) => keyboard.addKey(code, true, false);

    addKey(OPEN_BRACKET).on('down', () => this.selectStrip(this.selected - 1));
    addKey(CLOSED_BRACKET).on('down', () => this.selectStrip(this.selected + 1));
    addKey(S).on('down', () => this.saveLevel());
    addKey(R).on('down', () => this.revertSelected());

    // The movement arrows are already bound by GameScene for the player. Editing takes them over
    // while a modifier is held OR while the player is parked on the strip, so both jobs keep the
    // keys a level designer expects: bare arrows nudge, and the player is repositioned instead of
    // walked. Holding SHIFT resizes; holding CTRL multiplies the step.
    keyboard.on('keydown', (event: KeyboardEvent) => this.onEditorKey(event));
  }

  private onEditorKey(event: KeyboardEvent): void {
    const axis =
      event.code === 'ArrowLeft'
        ? { dx: -1, dy: 0 }
        : event.code === 'ArrowRight'
          ? { dx: 1, dy: 0 }
          : event.code === 'ArrowUp'
            ? { dx: 0, dy: -1 }
            : event.code === 'ArrowDown'
              ? { dx: 0, dy: 1 }
              : null;
    if (!axis) {
      return;
    }

    const step = event.ctrlKey ? COARSE_PX : NUDGE_PX;
    const strip = this.simWorld.solids[this.selected];
    if (!strip) {
      return;
    }

    if (event.shiftKey) {
      // Resize from the far edge, and never below one pixel: a zero-size strip is invisible both
      // to the resolver and to the eye, and `describeLevelProblem` rejects it at the next boot.
      strip.w = Math.max(1, strip.w + axis.dx * step);
      strip.h = Math.max(1, strip.h + axis.dy * step);
    } else {
      strip.x += axis.dx * step;
      strip.y += axis.dy * step;
    }

    this.syncStrip(this.selected);
    this.parkPlayerOnSelected();
    this.refreshReadout();
  }

  private selectStrip(index: number): void {
    const count = this.simWorld.solids.length;
    if (count === 0) {
      return;
    }

    this.selected = ((index % count) + count) % count;

    for (const [i, rect] of this.strips.entries()) {
      const chosen = i === this.selected;
      rect.setFillStyle(chosen ? SELECTED_COLOUR : OVERLAY_COLOUR, chosen ? 0.4 : 0.28);
      rect.setStrokeStyle(chosen ? 3 : 2, chosen ? SELECTED_COLOUR : OVERLAY_COLOUR, 0.9);
    }

    this.parkPlayerOnSelected();
    this.refreshReadout();
  }

  /**
   * Stand the player on the selected strip.
   *
   * This is the whole workflow: the camera already follows the player, so moving the player is
   * what brings the strip on screen, and a character standing on the strip is the only way to see
   * that the collision top and the tile top agree.
   */
  private parkPlayerOnSelected(): void {
    const strip = this.simWorld.solids[this.selected];
    if (!strip) {
      return;
    }

    const player = this.simWorld.player;
    player.x = strip.x + strip.w / 2;
    player.y = strip.y;
    player.vx = 0;
    player.vy = 0;
  }

  private syncStrip(index: number): void {
    const strip = this.simWorld.solids[index];
    const rect = this.strips[index];
    if (!strip || !rect) {
      return;
    }
    rect.setPosition(strip.x, strip.y);
    rect.setSize(strip.w, strip.h);
  }

  private revertSelected(): void {
    const authored = this.authored[this.selected];
    const strip = this.simWorld.solids[this.selected];
    if (!authored || !strip) {
      return;
    }
    Object.assign(strip, authored);
    this.syncStrip(this.selected);
    this.parkPlayerOnSelected();
    this.refreshReadout();
  }

  private refreshReadout(): void {
    const strip = this.simWorld.solids[this.selected];
    const authored = this.authored[this.selected];
    if (!strip || !authored) {
      return;
    }

    const delta = (now: number, was: number) => (now === was ? '·' : now > was ? `+${now - was}` : `${now - was}`);
    const edited = this.simWorld.solids.filter((s, i) => {
      const a = this.authored[i]!;
      return s.x !== a.x || s.y !== a.y || s.w !== a.w || s.h !== a.h;
    }).length;

    this.readout.setText(
      [
        `strip ${this.selected + 1}/${this.simWorld.solids.length}`,
        `  x ${strip.x}  y ${strip.y}  w ${strip.w}  h ${strip.h}`,
        `  delta  x ${delta(strip.x, authored.x)}  y ${delta(strip.y, authored.y)}` +
          `  w ${delta(strip.w, authored.w)}  h ${delta(strip.h, authored.h)}` +
          `   (${edited} strip${edited === 1 ? '' : 's'} edited)`,
      ].join('\n'),
    );
  }

  /**
   * Serialise the level back to Tiled JSON with the edits applied, and download it.
   *
   * Only the solid objects' coordinates are rewritten; every other byte round-trips through
   * `JSON.stringify(raw, null, 2)`, so the file stays something Tiled opens and the unit suite
   * validates. The i-th solid object corresponds to `world.solids[i]` because both walk the object
   * layers in the same order — the only coupling here, and the reason `parseLevel` and this method
   * must keep using the same traversal.
   */
  private saveLevel(): void {
    const cached = this.cache.tilemap.get(this.levelKey) as { data?: unknown } | undefined;
    if (!cached?.data) {
      this.saveNote.setText('save failed: the level is not in the tilemap cache');
      return;
    }

    // Deep copy, so a failed save cannot leave the live cache half-edited.
    const out = JSON.parse(JSON.stringify(cached.data)) as {
      layers: { type?: string; objects?: Record<string, unknown>[] }[];
    };

    let index = 0;
    for (const layer of out.layers) {
      if (layer.type !== 'objectgroup' || !Array.isArray(layer.objects)) {
        continue;
      }
      for (const object of layer.objects) {
        const properties = object.properties;
        const isSolid =
          Array.isArray(properties) &&
          properties.some(
            (p: unknown) =>
              typeof p === 'object' &&
              p !== null &&
              (p as { name?: unknown }).name === 'solid' &&
              (p as { value?: unknown }).value === true,
          );
        if (!isSolid) {
          continue;
        }

        const strip = this.simWorld.solids[index];
        index += 1;
        if (!strip) {
          continue;
        }
        object.x = strip.x;
        object.y = strip.y;
        object.width = strip.w;
        object.height = strip.h;
      }
    }

    this.download(`${this.levelKey}.tmj`, `${JSON.stringify(out, null, 2)}\n`);
    this.saveNote.setText(`saved ${this.levelKey}.tmj — move it into public/assets/levels/`);
  }

  private download(filename: string, contents: string): void {
    const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
}
