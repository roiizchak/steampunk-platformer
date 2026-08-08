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
  private playerSprite!: Phaser.GameObjects.Sprite;
  private parallax: { image: Phaser.GameObjects.TileSprite; factor: number }[] = [];
  protected levelKey = '';
  protected groundLayer!: Phaser.Tilemaps.TilemapLayer;
  private heldLeft: Phaser.Input.Keyboard.Key[] = [];
  private heldRight: Phaser.Input.Keyboard.Key[] = [];
  private heldJump: Phaser.Input.Keyboard.Key[] = [];
  private heldWalk: Phaser.Input.Keyboard.Key[] = [];

  /**
   * Whether the keyboard drives the PLAYER. ElementEditorScene turns it off, because there the
   * arrows nudge a collision strip instead.
   *
   * This is a flag rather than the subclass clearing the key arrays, and the difference is a bug
   * the code-reviewer gate owner measured. Held state is POLLED, so clearing `heldLeft`/`heldRight`
   * really does stop walking. The jump EDGE is not polled — it arrives through `key.on('down')`
   * listeners bound below (vault 2.5) — and those listeners stay attached to the `Key` objects no
   * matter what happens to the array holding them. `heldJump` contains UP, which the editor binds
   * to "nudge the strip up", so pressing it launched the character 57 px off the strip it was
   * editing. Nudging UP is exactly what you do when collision sits below the art, which is the
   * defect that scene exists for.
   *
   * One guard, in the one place both input paths pass through, rather than a detach per key.
   */
  protected playerInputEnabled = true;

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

    this.createParallax();
    this.drawLevel(level);
    const desc = playerRenderDesc(this.world.player, this.world.scale);
    this.registerAnimations();
    this.playerSprite = this.add
      .sprite(desc.x, desc.y, desc.animKey)
      .setOrigin(desc.originX, desc.originY)
      .setDepth(10);
    this.playerSprite.play(desc.animKey);

    this.createHud();
    this.bindKeys();
    this.add
      .text(24, 168, this.helpText(), {
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
    // SHIFT is a PRODUCTION control, so it belongs in `base` and not behind the DEV branch below.
    const base = 'ARROWS / WASD move  ·  SPACE / UP / W jump  ·  SHIFT walk';
    // The dev-scene keys are bound only under `import.meta.env.DEV`, so advertising them in a
    // production build offers the player two keys that do nothing. Vite folds this to `base`.
    // Caught by the code-reviewer gate owner (brief 2), which also noticed that verify-dist's
    // scene-key sweep could not see it: the string says "playground" in lowercase, inside a
    // longer literal, and the sweep looked for quoted `Playground`.
    return import.meta.env.DEV ? `${base}  ·  P playground  ·  O element editor` : base;
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
    this.renderParallax();
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
    if (!this.playerInputEnabled) {
      // Not just "read nothing" — actively clear. Leaving the last sampled values in place would
      // keep the player walking in whatever direction was held when the editor opened.
      this.input$.left = false;
      this.input$.right = false;
      this.input$.jumpHeld = false;
      this.input$.walkHeld = false;
      return;
    }

    this.input$.left = this.heldLeft.some((key) => key.isDown);
    this.input$.right = this.heldRight.some((key) => key.isDown);
    this.input$.jumpHeld = this.heldJump.some((key) => key.isDown);
    this.input$.walkHeld = this.heldWalk.some((key) => key.isDown);
  }

  private bindKeys(): void {
    const keyboard = this.input.keyboard;
    if (!keyboard) {
      return;
    }

    const { LEFT, RIGHT, A, D, SPACE, UP, W, P, O, SHIFT } = Phaser.Input.Keyboard.KeyCodes;

    // `emitOnRepeat: false` is the load-bearing argument. The OS repeats a held key ~30 times a
    // second; with repeats enabled every one would latch a fresh jump edge, and holding the
    // button would auto-bunny-hop through the jump buffer. A press is one edge, however long the
    // finger stays down.
    const addKey = (code: number) => keyboard.addKey(code, true, false);

    this.heldLeft = [addKey(LEFT), addKey(A)];
    this.heldRight = [addKey(RIGHT), addKey(D)];
    this.heldJump = [addKey(SPACE), addKey(UP), addKey(W)];
    // The walk modifier. Persistent state, sampled every frame in `sampleHeldKeys` — no `down`
    // listener, because unlike jump it is not an edge and has nothing to latch.
    this.heldWalk = [addKey(SHIFT)];

    for (const key of this.heldJump) {
      key.on('down', () => {
        if (this.playerInputEnabled) {
          latchJumpPress(this.input$);
        }
      });
    }

    // Without capture the browser scrolls the page on arrows and space — which also corrupts a
    // Playwright key drive, so this is a test-correctness fix as much as a UX one.
    keyboard.addCapture('SPACE,LEFT,RIGHT,UP,DOWN,W,A,D');

    // DEV ONLY, on the same side of the build gate as the scene itself (vault 1.6). Without this
    // guard the key would still be bound in production and would call `scene.start('Playground')`
    // on a scene that is not registered there — a silent no-op at best. Codex review 2, finding I2.
    if (import.meta.env.DEV) {
      addKey(P).on('down', () => this.togglePlayground());
      addKey(O).on('down', () => this.toggleElementEditor());
    }
  }

  /**
   * The DEV guard is INSIDE the body, not only on the key binding, so Vite folds the whole thing
   * away and the scene key does not survive into `dist/`.
   *
   * Phase 2 gated the binding alone and recorded the leftover string as accepted residue: a dead
   * method naming a scene that is not registered in production. It is unreachable, but "unreachable
   * dead code referencing a dev scene" is exactly what a Phase 10 bundle audit has to argue about,
   * and the argument costs more than the guard.
   *
   * **Verified precisely:** no `ElementEditor` or `Playground` **scene key** survives — the string
   * literals are gone, along with both scene classes and every editor UI string. What does remain
   * is these two method NAMES, as empty bodies (`togglePlayground(){}`), which Rollup cannot drop
   * from a class that ships. A grep for the bare identifier therefore still returns 1 each, and an
   * earlier version of this comment claimed otherwise; the code-reviewer gate owner measured it and
   * was right. `tools/gen/verify-dist.mjs` asserts the correct thing — quoted scene keys — so the
   * build gate cannot cry wolf over a name.
   */
  protected togglePlayground(): void {
    if (import.meta.env.DEV) {
      this.scene.start('Playground');
    }
  }

  protected toggleElementEditor(): void {
    if (import.meta.env.DEV) {
      this.scene.start('ElementEditor');
    }
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

    /**
     * Resolved by POSITION, not by name.
     *
     * This used to hardcode `addTilesetImage('greybox', ...)` and `createLayer('ground', ...)`,
     * which both the code-reviewer gate owner and Codex flagged, and the consequence was worse
     * than the vault 3.3 style violation: `describeLevelProblem` never reads layer or tileset
     * names, so a level with a renamed layer PASSED the boot gate and then threw here — leaving
     * `ready` false with `bootError` null, which is the third state (a hang) that the whole
     * refuse-to-route design exists to make impossible.
     *
     * Taking the first tileset and the first tile layer is data-driven, so a rename cannot break
     * it, and it matches what `parseLevel` does — it reads every tile layer and never a name.
     */
    const tilesetName = (map.tilesets[0] as { name?: string } | undefined)?.name;
    if (!tilesetName) {
      throw new Error(`GameScene: level ${level.id} declares no tileset`);
    }
    const tileset = map.addTilesetImage(tilesetName, 'tiles-industrial', 32, 32, 0, 0, 1);
    if (!tileset) {
      // Returns null with only a console warning. Silently drawing nothing is precisely the
      // failure this scene must not have.
      throw new Error(`GameScene: tileset "${tilesetName}" could not be bound in level ${level.id}`);
    }

    const layerName = map.layers[0]?.name;
    if (layerName === undefined) {
      throw new Error(`GameScene: level ${level.id} has no tile layer`);
    }
    const layer = map.createLayer(layerName, tileset, 0, 0);
    if (!layer) {
      throw new Error(`GameScene: tile layer "${layerName}" could not be created in ${level.id}`);
    }
    // `createLayer` is typed `TilemapLayer | TilemapGPULayer` whatever the `gpu` argument is, so
    // the CPU choice is asserted at runtime rather than cast away. If a later edit passes
    // `gpu: true` this throws instead of silently drawing nothing on the Canvas fallback.
    if (!(layer instanceof Phaser.Tilemaps.TilemapLayer)) {
      throw new Error('GameScene: expected a CPU TilemapLayer; the GPU layer has no Canvas fallback');
    }
    this.applySurfaceTiles(layer);
    this.groundLayer = layer;
  }

  /** Bounds, zoom and smoothing from `cameraRig`; Phaser owns the clamping (criterion 3.4). */
  private followPlayer(level: LevelData): void {
    const setup = cameraSetup(level, GAME_WIDTH, GAME_HEIGHT);
    const camera = this.cameras.main;

    camera.setBounds(setup.bounds.x, setup.bounds.y, setup.bounds.w, setup.bounds.h);
    camera.setZoom(setup.zoom);
    camera.startFollow(this.playerSprite, false, setup.lerpX, setup.lerpY);
  }

  private renderPlayer(): void {
    const desc = playerRenderDesc(this.world.player, this.world.scale);
    this.playerSprite.setPosition(desc.x, desc.y);

    // A real flip at last. Phase 2 drew facing as a "nose" rectangle because Phaser 4's Flip
    // component is mixed into Sprite and Image but NOT into Shape, so the grey-box `Rectangle`
    // had no `setFlipX` — the typechecker caught that, not a test. The decision was exercised
    // anyway so it would not arrive untested in this phase, which is why this line is a
    // one-for-one replacement rather than new behaviour.
    this.playerSprite.setFlipX(desc.flipX);

    // Restart only on a CHANGE of animation. Calling play() every frame with the same key would
    // reset the clip to frame 0 on every render, so a looping walk cycle would freeze on its
    // first pose while `__game` cheerfully reported the right state.
    if (this.playerSprite.anims.getName() !== desc.animKey) {
      this.playerSprite.play(desc.animKey);
    }
  }

  /**
   * Register one Phaser animation per catalog sheet, with the frame rate DERIVED from the sim.
   *
   * The fps handed to Phaser comes from `animTimings()`, not from `index.json` — the catalog's
   * copy is a record, and `tests/unit/asset-catalog.test.ts` asserts the two agree. Deriving it
   * here means retuning `runMax` changes the run animation's speed on the next boot with no asset
   * rebuild, which is the whole point of vault 4.22.
   */
  private registerAnimations(): void {
    const catalog = this.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    if (!catalog) {
      throw new Error('GameScene: the asset catalog is missing after boot approved it');
    }
    for (const sheet of catalog.sheets) {
      if (this.anims.exists(sheet.key)) {
        this.anims.remove(sheet.key);
      }
      this.anims.create({
        key: sheet.key,
        frames: this.anims.generateFrameNumbers(sheet.key, {
          start: 0,
          end: sheet.frameCount - 1,
        }),
        frameRate: sheet.fps,
        repeat: sheet.loop ? -1 : 0,
      });
    }
  }

  /**
   * Three scrolling background layers, drawn behind everything.
   *
   * `TileSprite` rather than `Image` because it wraps its texture natively, and the layers were
   * built to wrap: `build-world.mjs` mirrors each one so both its middle join and its end wrap
   * repeat a source column exactly. `gateSeam` went from FAIL to PASS across that step, which is
   * what makes the wrap safe to rely on here.
   *
   * `setScrollFactor(0)` pins them to the camera and the scroll is applied by hand in
   * `renderParallax`, because Phaser's own scroll factor moves the OBJECT while a TileSprite needs
   * its texture offset moved instead — otherwise the layer slides off its own edges.
   */
  private createParallax(): void {
    const layers: { key: string; factor: number }[] = [
      { key: 'bg-far', factor: 0.15 },
      { key: 'bg-mid', factor: 0.35 },
      { key: 'bg-near', factor: 0.6 },
    ];
    this.parallax = layers.map(({ key, factor }, i) => {
      const image = this.add
        .tileSprite(0, 0, GAME_WIDTH, GAME_HEIGHT, key)
        .setOrigin(0, 0)
        .setScrollFactor(0)
        .setDepth(-100 + i);
      return { image, factor };
    });
  }

  /**
   * Give the tile layer a brass-capped TOP and plain masonry beneath it.
   *
   * The shipped level was authored grey-box: its tile layer fills every solid cell with the same
   * gid, because Phase 3 only needed geometry. Drawn with a brass-capped walkway tile that reads as
   * a striped block — the brass leading edge repeating on every row, which is precisely what
   * STYLE.md §5 RULE ONE is for. The rule is "a player identifies a platform by that brass edge
   * alone", and an edge on every row identifies nothing.
   *
   * So the index is chosen from the NEIGHBOURHOOD rather than from the level data: a cell with
   * nothing above it is a walking surface and gets the brass cap; anything buried gets brick. The
   * level file is untouched, which matters because `tests/unit/tilemap-data.test.ts` pins its
   * bytes and its geometry.
   */
  private applySurfaceTiles(layer: Phaser.Tilemaps.TilemapLayer): void {
    const SURFACE = 0; // riveted walkway plate with the brass leading edge
    const BRICK = 8;   // soot-stained brick, row 3 of the tileset
    layer.forEachTile((tile) => {
      if (tile.index < 0) {
        return;
      }
      const above = layer.getTileAt(tile.x, tile.y - 1);
      tile.index = above && above.index >= 0 ? BRICK : SURFACE;
    });
  }

  /**
   * The HUD: portrait medallion plus one continuous health bar, pinned to the camera.
   *
   * Drawn at the assembly's authored size with `setScrollFactor(0)` so it never scrolls, and at a
   * high depth so nothing in the world can cover it.
   */
  private createHud(): void {
    this.add
      .image(24, 24, 'hud-health')
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(1000);
  }

  private renderParallax(): void {
    // `setScrollFactor(0)` already pins these to the camera, so their position is in SCREEN space
    // and stays at the origin. Setting it to the camera's scroll — which is what the first version
    // did — double-applies the scroll and slides the layer down and right off the viewport, which
    // showed up as a black band above a strip of background. Only the TEXTURE offset moves.
    const scrollX = this.cameras.main.scrollX;
    for (const { image, factor } of this.parallax) {
      image.tilePositionX = scrollX * factor;
    }
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
