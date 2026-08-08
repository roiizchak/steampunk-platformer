import Phaser from 'phaser';
import { CATALOG_KEY, type AssetCatalog, type SheetEntry } from '../game/assetCatalog';
import { RENDER_SCALE } from '../game/constants';
import {
  boundsRect,
  emptyEdits,
  frameCells,
  liftAboveCellFloor,
  measureCellBounds,
  serialiseBounds,
  type Bounds,
  type BoundsEdits,
} from '../render/gymBounds';
import { PLAYER_BOX } from '../sim/player';

/**
 * DEV ONLY — the Character Gym. ASSET-PIPELINE §6.
 *
 * **A box is a claim about a sprite, and no test comparing code to code can check it** *(vault
 * 4.18)*. Every gate in this phase compares one number against another; this scene is the only
 * place where the drawn character and the boxes asserted about it appear together, at true size,
 * against a ground line — which is what criterion 4.14 needs, because a metric cannot see a third
 * leg.
 *
 * Registered under `import.meta.env.DEV` in `game/config.ts`, reached by a key bound under
 * `import.meta.env.DEV` in `GameScene.bindKeys`, with the guard repeated INSIDE the toggle body and
 * in `BootScene.refuseToRoute`'s stop list, and asserted absent from `dist/` by
 * `tools/gen/verify-dist.mjs`. All five, because Phase 2 shipped a dev scene to `dist/` with only
 * some of them and a "DEV ONLY" note in a document is not a build gate.
 *
 * ## What it edits, and what it deliberately does not
 *
 * The green collision box is **read-only here**. It is `PLAYER_BOX × RENDER_SCALE` — the sim owns
 * it, `tests/unit/tilemap-data.test.ts` pins it, and ASSET-PIPELINE §0a publishes it. Letting a
 * scene write a second copy into `character-bounds.json` would create exactly the two-sources-that-
 * drift problem vault A5 exists to prevent, and the drift would be silent because both numbers
 * would look right in isolation.
 *
 * So the Gym writes the two fields the config genuinely owns and nothing else: `footOffsetPx` per
 * animation — which `character-bounds.json`'s own `_footOffsetPx` note names as a Gym adjustment
 * and this as the field it saves into — and `activeFrames`, the per-frame attack toggles Phase 5
 * fills in. The save path itself is `serialiseBounds`, in `src/render/gymBounds.ts`, where it is
 * typechecked and unit-tested *(criterion 4.15, vault A4)*.
 *
 * ## Why the save is a download
 *
 * Phase 3 already settled this for the Element Editor: a dev scene that POSTs to a write endpoint
 * needs that endpoint to exist, to be dev-gated, and to be trusted with a path — three new things
 * to get wrong for a file a human should be looking at before it lands. The browser downloads it
 * and a human moves it, which also keeps the config's provenance notes under human review.
 */

const BLUE = 0x4fa3d1;
const GREEN = 0x5fbf5f;
const RED = 0xd14f4f;
const WHITE = 0xffffff;
const GROUND = 0xc8a86b;

/**
 * Magnifications the anatomy check cycles through. 1 is true size — the size the player sees.
 *
 * A zoom that does not fit is CLAMPED rather than offered: at 4x a 384 px cell is 1536 px tall
 * against a 1080 px view, so the first version of this scene cut the character's head off at the
 * exact magnification an anatomy check *(criterion 4.14)* is for. Caught by looking at it.
 */
const ZOOMS = [1, 2, 4] as const;

/** The contact line's y. Low enough that a 2x cell clears the top of the view. */
const GROUND_Y = 880;

/** Centre of the drawn figure. Right of the readout, so magnifying never puts art under text. */
const CENTRE_X = 1250;

export class GymScene extends Phaser.Scene {
  private sheets: SheetEntry[] = [];
  private index = 0;
  private frame = 0;
  private playing = true;
  private zoomStep = 0;
  private elapsedMs = 0;

  private sprite!: Phaser.GameObjects.Sprite;
  private overlay!: Phaser.GameObjects.Graphics;
  private readout!: Phaser.GameObjects.Text;
  private note!: Phaser.GameObjects.Text;

  /** Measured once per sheet and cached: a canvas readback per frame would be a per-frame stall. */
  private measured = new Map<string, (Bounds | null)[]>();
  private rawConfig: unknown = null;
  private edits: BoundsEdits = emptyEdits();

  constructor() {
    super('Gym');
  }

  init(): void {
    // Reset in init, not the constructor: none of this may survive a scene restart, and an e2e
    // spec restarting Boot is the case that finds out.
    this.index = 0;
    this.frame = 0;
    this.playing = true;
    this.zoomStep = 0;
    this.elapsedMs = 0;
    this.measured = new Map();
    this.edits = emptyEdits();
  }

  create(): void {
    const catalog = this.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    if (!catalog) {
      throw new Error('GymScene: the asset catalog is missing after boot approved it');
    }
    this.sheets = catalog.sheets;

    this.cameras.main.setBackgroundColor('#1b1a17');

    this.sprite = this.add.sprite(0, 0, this.sheets[0].key, 0).setOrigin(0.5, 1);
    this.overlay = this.add.graphics();
    this.readout = this.add.text(24, 24, '', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#c8a86b',
    });
    this.note = this.add.text(24, 300, '', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#7fb2c8',
    });

    this.bindKeys();
    void this.loadConfig();
    this.refresh();
  }

  /**
   * The config is fetched rather than imported so the Gym reads the SHIPPED bytes — the same file
   * the build reads — and so a save round-trips every provenance note in it untouched.
   */
  private async loadConfig(): Promise<void> {
    try {
      const response = await fetch('assets/config/character-bounds.json');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      this.rawConfig = await response.json();
    } catch (error) {
      // Not fatal: measuring and looking are the Gym's main jobs and neither needs the config.
      // Saving is refused explicitly rather than writing a guess (vault 4.16).
      this.rawConfig = null;
      this.note.setText(`character-bounds.json unreadable (${String(error)}) — S will refuse to save`);
    }
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }
    const { G, SPACE, OPEN_BRACKET, CLOSED_BRACKET, COMMA, PERIOD, Z, X, A, S, R, M } =
      Phaser.Input.Keyboard.KeyCodes;

    keyboard.addKey(G, true, false).on('down', () => this.scene.start('Game'));
    keyboard.addKey(SPACE, true, false).on('down', () => this.togglePlaying());
    keyboard.addKey(OPEN_BRACKET, true, false).on('down', () => this.stepSheet(-1));
    keyboard.addKey(CLOSED_BRACKET, true, false).on('down', () => this.stepSheet(1));
    keyboard.addKey(COMMA, true, true).on('down', () => this.stepFrame(-1));
    keyboard.addKey(PERIOD, true, true).on('down', () => this.stepFrame(1));
    keyboard.addKey(Z, true, true).on('down', () => this.nudge(-1));
    keyboard.addKey(X, true, true).on('down', () => this.nudge(1));
    keyboard.addKey(A, true, false).on('down', () => this.toggleActiveFrame());
    keyboard.addKey(S, true, false).on('down', () => this.save());
    keyboard.addKey(R, true, false).on('down', () => this.revert());
    keyboard.addKey(M, true, false).on('down', () => this.cycleZoom());
    keyboard.addCapture('SPACE,G,Z,X,A,S,R,M,COMMA,PERIOD,OPEN_BRACKET,CLOSED_BRACKET');
  }

  private get sheet(): SheetEntry {
    return this.sheets[this.index];
  }

  /** The animation name as `character-bounds.json` declares it — `brass-courier-run` -> `run`. */
  private get action(): string {
    const parts = this.sheet.key.split('-');
    return parts[parts.length - 1];
  }

  /**
   * Advance the animation by hand rather than with `sprite.play()`.
   *
   * The Gym's whole job is to hold ONE frame still and measure it, and a Phaser animation playing
   * underneath would move the frame between the measurement and the overlay drawn from it. Stepping
   * the frame here means the number on screen and the box on screen are the same frame, always.
   */
  update(_time: number, deltaMs: number): void {
    if (!this.playing) {
      return;
    }
    this.elapsedMs += deltaMs;
    const msPerFrame = 1000 / this.sheet.fps;
    if (this.elapsedMs < msPerFrame) {
      return;
    }
    this.elapsedMs -= msPerFrame;
    const next = this.frame + 1;
    // A non-looping sheet holds its last frame, exactly as it does in play.
    this.frame = next < this.sheet.frameCount ? next : this.sheet.loop ? 0 : this.sheet.frameCount - 1;
    this.refresh();
  }

  private togglePlaying(): void {
    this.playing = !this.playing;
    this.refresh();
  }

  private stepSheet(delta: number): void {
    this.index = (this.index + delta + this.sheets.length) % this.sheets.length;
    this.frame = 0;
    this.elapsedMs = 0;
    this.refresh();
  }

  private stepFrame(delta: number): void {
    // Stepping is an inspection, so it pauses — otherwise the frame you stepped to is gone before
    // you have looked at it.
    this.playing = false;
    const count = this.sheet.frameCount;
    this.frame = (this.frame + delta + count) % count;
    this.refresh();
  }

  private cycleZoom(): void {
    this.zoomStep = (this.zoomStep + 1) % ZOOMS.length;
    this.refresh();
  }

  private nudge(delta: number): void {
    const current = this.edits.footOffsetPx[this.action] ?? 0;
    this.edits.footOffsetPx[this.action] = current + delta;
    this.refresh();
  }

  private toggleActiveFrame(): void {
    const current = this.edits.activeFrames[this.action] ?? [];
    this.edits.activeFrames[this.action] = current.includes(this.frame)
      ? current.filter((f) => f !== this.frame)
      : [...current, this.frame];
    this.refresh();
  }

  private revert(): void {
    this.edits = emptyEdits();
    this.note.setText('edits reverted');
    this.refresh();
  }

  private save(): void {
    if (this.rawConfig === null) {
      this.note.setText('save refused: character-bounds.json was not readable (vault 4.16)');
      return;
    }
    try {
      const text = serialiseBounds(this.rawConfig, this.edits);
      const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'character-bounds.json';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      // The reformat is disclosed rather than hidden: the shipped file is hand-grouped with blank
      // lines and one-line animation entries, and `JSON.stringify` reproduces neither. No value
      // moves — `tests/unit/gym-bounds.test.ts` pins that — but the diff will be larger than the
      // edit, and someone reviewing it should know that before they read it as damage.
      this.note.setText(
        'saved character-bounds.json — move it into public/assets/config/ ' +
          '(values unchanged; blank-line grouping is not preserved)',
      );
    } catch (error) {
      this.note.setText(`save refused: ${String(error)}`);
    }
  }

  /**
   * Read the sheet's pixels back once and measure every frame.
   *
   * The readback is of the TEXTURE Phaser loaded, not of the file on disk — so what is measured is
   * what is drawn, including anything the loader did to it. That is the point: the packer's own
   * gate already checks the file.
   */
  private boundsFor(sheet: SheetEntry): (Bounds | null)[] {
    const cached = this.measured.get(sheet.key);
    if (cached) {
      return cached;
    }

    const source = this.textures.get(sheet.key).getSourceImage() as
      | HTMLImageElement
      | HTMLCanvasElement;
    const canvas = document.createElement('canvas');
    canvas.width = source.width;
    canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) {
      throw new Error('GymScene: no 2d context — the visual footprint cannot be measured');
    }
    context.drawImage(source, 0, 0);
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);

    const result = frameCells(
      canvas.width,
      sheet.frameWidth,
      sheet.frameHeight,
      sheet.frameCount,
    ).map((cell) => measureCellBounds(data, canvas.width, cell));
    this.measured.set(sheet.key, result);
    return result;
  }

  private refresh(): void {
    const sheet = this.sheet;
    // Clamp to the largest zoom whose whole cell still fits above the ground line. A magnification
    // that crops the figure is worse than no magnification: it looks like a measurement.
    const asked = ZOOMS[this.zoomStep];
    const fits = ZOOMS.filter((z) => sheet.frameHeight * z <= GROUND_Y);
    const zoom = asked <= (fits[fits.length - 1] ?? 1) ? asked : (fits[fits.length - 1] ?? 1);
    const bounds = this.boundsFor(sheet)[this.frame];
    const offset = this.edits.footOffsetPx[this.action] ?? 0;
    const active = this.edits.activeFrames[this.action] ?? [];

    // The cell's LAST ROW is the contact line, so putting it on the ground line is what makes the
    // drawn feet and the drawn floor comparable by eye — the thing two rounds of green numbers got
    // wrong. `footOffsetPx` is applied here exactly as the renderer would apply it.
    const groundY = GROUND_Y;
    const cellLeft = CENTRE_X - (sheet.frameWidth * zoom) / 2;
    const cellTop = groundY - sheet.frameHeight * zoom - offset * zoom;

    this.sprite.setTexture(sheet.key, this.frame);
    this.sprite.setScale(zoom);
    this.sprite.setPosition(CENTRE_X, groundY - offset * zoom);

    this.overlay.clear();

    // The ground line, drawn across the whole view: a box is only convincing against a floor.
    this.overlay.lineStyle(2, GROUND, 1).beginPath();
    this.overlay.moveTo(0, groundY);
    this.overlay.lineTo(1920, groundY);
    this.overlay.strokePath();

    // WHITE — source frame bounds (the cell itself).
    this.overlay.lineStyle(1, WHITE, 0.55);
    this.overlay.strokeRect(cellLeft, cellTop, sheet.frameWidth * zoom, sheet.frameHeight * zoom);

    // The footprint in screen space, computed ONCE. Blue draws it, red re-draws it on an active
    // frame, and the readout reports it — three consumers that must not be able to disagree.
    const rect = bounds ? boundsRect(bounds) : null;
    const screenRect: [number, number, number, number] | null = rect
      ? [cellLeft + rect.x * zoom, cellTop + rect.y * zoom, rect.w * zoom, rect.h * zoom]
      : null;

    // BLUE — visual footprint, measured. Absent when the metric returns INDETERMINATE.
    if (screenRect) {
      this.overlay.lineStyle(2, BLUE, 1);
      this.overlay.strokeRect(...screenRect);
    }

    // GREEN — collision, straight off the sim's own box. Read-only: see the class docstring.
    const boxW = PLAYER_BOX.w * RENDER_SCALE * zoom;
    const boxH = PLAYER_BOX.h * RENDER_SCALE * zoom;
    this.overlay.lineStyle(2, GREEN, 1);
    this.overlay.strokeRect(CENTRE_X - boxW / 2, groundY - boxH, boxW, boxH);

    // RED — attack hitbox. Phase 5 owns the geometry; what ships now is the per-frame toggle, drawn
    // as the marked frame's own footprint so a toggle is visibly a toggle rather than a number.
    if (screenRect && active.includes(this.frame)) {
      this.overlay.lineStyle(3, RED, 1);
      this.overlay.strokeRect(...screenRect);
    }

    this.readout.setText([
      `SHEET      ${sheet.key}   [ ]`,
      `FRAME      ${this.frame + 1} / ${sheet.frameCount}   , .   ${this.playing ? 'playing' : 'PAUSED'}  SPACE`,
      `TIMING     ${sheet.fps.toFixed(2)} fps · ${sheet.simTicks} simTicks · ${sheet.derivedFrom}`,
      `CELL       ${sheet.frameWidth} x ${sheet.frameHeight}   zoom ${zoom}x  M`,
      '',
      bounds && rect
        ? `FOOTPRINT  ${rect.w} x ${rect.h} px   lift above cell floor ${liftAboveCellFloor(bounds, sheet.frameHeight)} px`
        : 'FOOTPRINT  INDETERMINATE — no opaque pixel in this cell (vault 4.18)',
      `COLLISION  ${PLAYER_BOX.w * RENDER_SCALE} x ${PLAYER_BOX.h * RENDER_SCALE} px — read-only, PLAYER_BOX x RENDER_SCALE`,
      `OFFSET     ${offset} px   Z X`,
      `ACTIVE     ${active.length ? active.map((f) => f + 1).join(' ') : '(none)'}   A toggles this frame`,
      '',
      'white cell · blue footprint · green collision · red active frame',
      'S save · R revert · G back to game',
    ]);
  }
}
