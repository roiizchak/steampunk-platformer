import Phaser from 'phaser';
import { updateDebugState } from '../debug/globals';
import { CATALOG_KEY, type AssetCatalog } from '../game/assetCatalog';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../game/constants';
import { drainTicks } from '../game/frameClock';
import { parseLevel, type LevelData } from '../game/tilemap';
import { cameraSetup } from '../render/cameraRig';
import { playerRenderDesc } from '../render/playerView';
import { createSnapshot, latchJumpPress } from '../sim/input';
import { advance, createWorld } from '../sim/tick';
import type { InputSnapshot, World } from '../sim/types';

/**
 * The production play scene: it owns the clock, the keyboard, and the drawing. It owns no game
 * logic at all — every rule lives in `src/sim/`, and every render decision in
 * `src/render/playerView.ts` (vault 2.12).
 *
 * What this file is actually responsible for is the seam between real time and simulated time,
 * which is where vault 2.1 is won or lost. Phaser hands `update()` a millisecond delta; the sim
 * refuses to see one. The accumulator below is the only place the conversion happens.
 */

/** Seed for the sim's RNG. Fixed so an e2e run and a hands-on run are the same run (vault 2.3). */
const SIM_SEED = 20260806;

/**
 * Re-exported so the e2e specs can derive the drawn player's size instead of hardcoding it.
 * The value itself lives in `src/game/constants.ts` — one source, so a doc, a scene and a test
 * cannot each hold their own copy (Codex P8).
 */
export { RENDER_SCALE };

export class GameScene extends Phaser.Scene {
  private world!: World;
  private input$!: InputSnapshot;
  private accumulatorMs = 0;
  private playerRect!: Phaser.GameObjects.Rectangle;
  private facingRect!: Phaser.GameObjects.Rectangle;
  protected levelKey = '';
  protected groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private heldLeft: Phaser.Input.Keyboard.Key[] = [];
  private heldRight: Phaser.Input.Keyboard.Key[] = [];
  private heldJump: Phaser.Input.Keyboard.Key[] = [];

  constructor(key = 'Game') {
    super(key);
  }

  /**
   * Reset in `init()`, never the constructor (Phase 1's lesson). Scene starts are queued, so a
   * constructor runs once while `init` runs on every start AND restart — state initialised in the
   * constructor survives a restart and makes the second run differ from the first.
   */
  init(): void {
    this.accumulatorMs = 0;
    this.heldLeft = [];
    this.heldRight = [];
    this.heldJump = [];
  }

  create(): void {
    const level = this.loadLevel();
    this.world = createWorld({
      seed: SIM_SEED,
      scale: RENDER_SCALE,
      // Phase 3: the SOURCE of the collision geometry, and only the source. The resolver in
      // `src/sim/player.ts` is untouched, which is the whole point of `World.solids` having been
      // plain data since Phase 2.
      solids: level.solids,
      spawn: level.spawn,
    });
    this.input$ = createSnapshot();

    this.drawLevel(level);
    const desc = playerRenderDesc(this.world.player, this.world.scale);
    this.playerRect = this.add
      .rectangle(desc.x, desc.y, desc.w, desc.h, desc.colour)
      .setOrigin(desc.originX, desc.originY);
    this.facingRect = this.add.rectangle(desc.x, desc.y, 1, 1, 0x1a1714).setOrigin(0, 1);

    this.bindKeys();
    this.add
      .text(24, 24, this.helpText(), {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#8f8776',
      })
      .setScrollFactor(0);

    this.followPlayer(level);

    // The positive terminal condition, set here rather than in Boot: Boot now routes onward, so
    // "the gate passed" and "the game is running" are different facts. If this scene fails to
    // create, `ready` stays false with `bootError` null — the third state, a hang, which the QA
    // gate can see precisely because it is distinct from both of the others (vault 1.4).
    //
    // `levelId` fills the slot Phase 1 cut on the nine-field debug surface and left null. No new
    // field, so the surface is still closed at nine (a tenth needs a STOP-and-ask).
    updateDebugState({
      sceneKey: this.scene.key,
      ready: true,
      bootError: null,
      levelId: level.id,
    });
    this.publishDebugState();
  }

  protected helpText(): string {
    return 'ARROWS / WASD move  ·  SPACE / UP / W jump  ·  P playground';
  }

  /**
   * Advance simulated time to catch up with real time.
   *
   * `delta` is the ONLY millisecond value in the whole movement path, and it never crosses into
   * `src/sim/`. Whole ticks are drained; the remainder stays in the accumulator, so a 144 Hz
   * monitor and a 30 Hz one run the identical simulation at different sampling rates rather than
   * two different games (vault 2.1).
   */
  update(_time: number, delta: number): void {
    // The arithmetic lives in `src/game/frameClock.ts`, not here. Adversarial review brief 2 found
    // the backlog-drop branch had no test and could not have one inside a scene method — vault
    // 2.12: if a scene rule has an edge case, that's the move, not a browser test.
    const drain = drainTicks(this.accumulatorMs, delta);
    this.accumulatorMs = drain.remainderMs;
    const ticks = drain.ticks;

    this.sampleHeldKeys();
    // Called even when `ticks === 0`, and that case is load-bearing: it must NOT consume the
    // input snapshot. A frame too short to produce a whole tick that ate a jump press is vault
    // 2.4's "a tick ran is not your input was consumed", inverted.
    advance(this.world, this.input$, ticks);

    this.renderPlayer();
    this.publishDebugState();
  }

  /**
   * Held state is polled; the jump EDGE is not (vault 2.5).
   *
   * `Phaser.Input.Keyboard.JustDown()` would look like the obvious tool and is a trap here: it is
   * a consuming read that resets when checked, so two readers in one frame lose the edge. Polling
   * `isDown` is worse — a press and release inside one frame is invisible to it entirely. The
   * edge therefore arrives by event, in `bindKeys()`.
   */
  private sampleHeldKeys(): void {
    this.input$.left = this.heldLeft.some((key) => key.isDown);
    this.input$.right = this.heldRight.some((key) => key.isDown);
    this.input$.jumpHeld = this.heldJump.some((key) => key.isDown);
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    const { LEFT, RIGHT, A, D, SPACE, UP, W, P } = Phaser.Input.Keyboard.KeyCodes;

    // `emitOnRepeat: false` is the load-bearing argument. The OS repeats a held key ~30 times a
    // second; with repeats enabled every one would latch a fresh jump edge, and holding the
    // button would auto-bunny-hop through the jump buffer. A press is one edge, however long the
    // finger stays down.
    const addKey = (code: number) => keyboard.addKey(code, true, false);

    this.heldLeft = [addKey(LEFT), addKey(A)];
    this.heldRight = [addKey(RIGHT), addKey(D)];
    this.heldJump = [addKey(SPACE), addKey(UP), addKey(W)];

    for (const key of this.heldJump) {
      key.on('down', () => latchJumpPress(this.input$));
    }

    // Without capture the browser scrolls the page on arrows and space — which also corrupts a
    // Playwright key drive, so this is a test-correctness fix as much as a UX one.
    keyboard.addCapture('SPACE,LEFT,RIGHT,UP,DOWN,W,A,D');

    // DEV ONLY, on the same side of the build gate as the scene itself (vault 1.6). Without this
    // guard the key would still be bound in production and would call `scene.start('Playground')`
    // on a scene that is not registered there — a silent no-op at best. Codex review 2, finding I2.
    if (import.meta.env.DEV) {
      addKey(P).on('down', () => this.togglePlayground());
    }
  }

  protected togglePlayground(): void {
    this.scene.start('Playground');
  }

  /**
   * The shipped level, straight out of the tilemap cache BootScene filled and validated.
   *
   * Boot refuses to route on a level this would throw for, so reaching here means the data is
   * good. Parsing again rather than passing an object across the scene boundary keeps `parseLevel`
   * the single definition of what a level IS — the same function the unit suite runs over the
   * shipped bytes *(vault 3.1)*.
   */
  protected loadLevel(): LevelData {
    const catalog = this.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    const entry = catalog?.levels?.[0];
    if (!entry) {
      throw new Error('GameScene: the catalog lists no levels; Boot should have refused to route');
    }

    const cached = this.cache.tilemap.get(entry.key) as { data?: unknown } | undefined;
    this.levelKey = entry.key;
    return parseLevel(entry.key, cached?.data);
  }

  /**
   * Draw the level's tile layer.
   *
   * **CPU `TilemapLayer`, not `TilemapGPULayer`.** The game runs `Phaser.AUTO` with a live Canvas
   * fallback, and the GPU layer is WebGL-only: `TilemapGPULayerRender.js` installs a no-op Canvas
   * renderer, so on a Canvas fallback the entire level would draw nothing while every collision
   * test stayed green. Same reasoning ENGINE-NOTES.md already records for tint.
   *
   * The tile layer is ART. Collision came from the object layer, and the two are authored to
   * agree — proving they still agree is what the drawn-tile assertions in the Phase 3 e2e spec
   * are for, and making them disagree is what the Element Editor is for.
   */
  private drawLevel(level: LevelData): void {
    const map = this.make.tilemap({ key: this.levelKey });
    const tileset = map.addTilesetImage('greybox', 'placeholder-tile');
    if (!tileset) {
      // Returns null with only a console warning when the tileset NAME in the .tmj does not match.
      // Silently drawing nothing is precisely the failure this scene must not have.
      throw new Error(`GameScene: tileset "greybox" not found in level ${level.id}`);
    }

    const layer = map.createLayer('ground', tileset, 0, 0);
    if (!layer) {
      throw new Error(`GameScene: tile layer "ground" not found in level ${level.id}`);
    }
    // `createLayer` is typed `TilemapLayer | TilemapGPULayer` whatever the `gpu` argument is, so
    // the CPU choice is asserted at runtime rather than cast away. If a later edit passes
    // `gpu: true` this throws instead of silently drawing nothing on the Canvas fallback.
    if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error('GameScene: expected a CPU TilemapLayer; the GPU layer has no Canvas fallback');
    }
    this.groundLayer = layer;
  }

  /** Bounds, zoom and smoothing from `cameraRig`; Phaser owns the clamping (criterion 3.4). */
  private followPlayer(level: LevelData): void {
    const setup = cameraSetup(level, GAME_WIDTH, GAME_HEIGHT);
    const camera = this.cameras.main;

    camera.setBounds(setup.bounds.x, setup.bounds.y, setup.bounds.w, setup.bounds.h);
    camera.setZoom(setup.zoom);
    camera.startFollow(this.playerRect, false, setup.lerpX, setup.lerpY);
  }

  private renderPlayer(): void {
    const desc = playerRenderDesc(this.world.player, this.world.scale);
    this.playerRect.setPosition(desc.x, desc.y);
    this.playerRect.setSize(desc.w, desc.h);
    this.playerRect.setFillStyle(desc.colour);

    // `desc.flipX` cannot go to `setFlipX` here: Phaser 4's Flip component is mixed into Sprite
    // and Image but NOT into Shape, so `Rectangle` has no such method — the typechecker caught
    // this, not a test. A Sprite would need a texture, and this phase deliberately has no art.
    //
    // So facing is drawn as a nose on the leading edge. That keeps the flip DECISION exercised
    // and visible during the hands-on feel check instead of parked until Phase 4, where a
    // mirrored hitbox first shows up as art that does not match its collision.
    const nose = desc.w * 0.3;
    this.facingRect.setPosition(desc.x + (desc.flipX ? -desc.w / 2 : desc.w / 2 - nose), desc.y);
    this.facingRect.setSize(nose, desc.h * 0.2);
    this.facingRect.setFillStyle(0x1a1714);
  }

  /** The read-only debug view every e2e spec is written against. Dev build only. */
  private publishDebugState(): void {
    const { player } = this.world;
    updateDebugState({
      tick: this.world.tickCount,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, state: player.state },
    });
  }

  protected get simWorld(): World {
    return this.world;
  }
}
