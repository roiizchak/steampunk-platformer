import Phaser from 'phaser';
import { updateDebugState } from '../debug/globals';
import { CATALOG_KEY, type AssetCatalog } from '../game/assetCatalog';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../game/constants';
import { drainTicks } from '../game/frameClock';
import { parseLevel, type LevelData } from '../game/tilemap';
import { cameraSetup } from '../render/cameraRig';
import { playerRenderDesc } from '../render/playerView';
import { registerCatalogAnimations } from './gameAnimations';
import { LOCOMOTION_KEYS, tunedFps, variantFromSearch } from '../game/feelVariants';
import { spawnDevEnemies } from './devSpawn';
import { EnemyLayer } from './enemyLayer';
import { bindPlayerKeys, sampleHeldKeys, type HeldKeys } from './gameInput';
import { createHud, renderHud } from './gameHud';
import { drawLevelLayer } from './gameLevelDraw';
import { createParallax, renderParallax, type ParallaxImage } from './gameParallax';
import { playIfChanged } from './playAnim';
import { createSnapshot } from '../sim/input';
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
 * DEV-only spawn constants for criteria 5.11 and 5.7 — the two things combat itself cannot produce
 * (see `docs/qa/` for why). Every value here is a fixed constant, never dragged or typed, which is
 * what keeps `N`/`M` a QA fixture instead of a cheat menu.
 *
 * `DEV_FLEET_COUNT` 20: the shipped level places 2 enemies total (1 sentry, 1 scavenger), so 20 is a
 * deliberate 10x stress multiple — comfortably a "worst case" no authored level approaches, while
 * staying small enough to reason about and cheap to eyeball in Playwright.
 */
const DEV_FLEET_COUNT = 20;
const DEV_FLEET_HP = 60;
const DEV_FLEET_OFFSET_X = 200;
/** 2 of 60: below the 3-swing floor (60 hp / 20 dmg per swing) combat can ever land on. */
const DEV_LOW_HP = 2;
const DEV_LOW_HP_OFFSET_X = 200;

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
  private enemies!: EnemyLayer;
  private hudFill!: Phaser.GameObjects.Graphics;
  private parallax: ParallaxImage[] = [];
  protected levelKey = '';
  protected groundLayer!: Phaser.Tilemaps.TilemapLayer;
  /** Bound and sampled in `src/scenes/gameInput.ts`; see `bindKeys`/`sampleHeldKeys` below. */
  private held: HeldKeys = { left: [], right: [], jump: [], walk: [], attack: [] };

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
    this.held = { left: [], right: [], jump: [], walk: [], attack: [] };
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
      // Phase 5, and all four from the SAME parsed level — the world's edges, the spikes that now
      // hurt, and both enemies. Nothing here is a scene constant; move an enemy in Tiled and it
      // moves in the game.
      bounds: { widthPx: level.widthPx, heightPx: level.heightPx },
      hazards: level.hazards,
      enemies: level.enemies,
    });
    this.applyFeelVariant();
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

    this.enemies = new EnemyLayer(this, this.world);
    this.enemies.create();

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
    const base = 'ARROWS / WASD move  ·  SPACE / UP / W jump  ·  SHIFT walk  ·  F / L attack';
    // The dev-scene keys are bound only under `import.meta.env.DEV`, so advertising them in a
    // production build offers the player two keys that do nothing. Vite folds this to `base`.
    // Caught by the code-reviewer gate owner (brief 2), which also noticed that verify-dist's
    // scene-key sweep could not see it: the string says "playground" in lowercase, inside a
    // longer literal, and the sweep looked for quoted `Playground`.
    return import.meta.env.DEV
      ? `${base}  ·  P playground  ·  O element editor  ·  G gym`
      : base;
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
    this.renderHud();
    this.enemies.sync();
    this.renderParallax();
    this.publishDebugState();
  }

  /**
   * Keyboard binding and per-frame sampling both live in `src/scenes/gameInput.ts` (split out to
   * keep this file under the 400-line rule). This scene still owns `playerInputEnabled` and the
   * DEV scene-switch/fixture-spawn callbacks — see that file's header for why the split is safe.
   */
  private sampleHeldKeys(): void {
    sampleHeldKeys(this.input$, this.held, this.playerInputEnabled);
  }

  private bindKeys(): void {
    const dev = import.meta.env.DEV
      ? {
          togglePlayground: () => this.togglePlayground(),
          toggleElementEditor: () => this.toggleElementEditor(),
          toggleGym: () => this.toggleGym(),
          spawnDevFleet: () => this.spawnDevFleet(),
          spawnDevLowHpEnemy: () => this.spawnDevLowHpEnemy(),
        }
      : undefined;
    this.held = bindPlayerKeys(this, this.input$, () => this.playerInputEnabled, dev);
  }

  /** DEV ONLY (5.11 fixture). Guard repeated inside the body — see `togglePlayground`'s docstring. */
  protected spawnDevFleet(): void {
    if (import.meta.env.DEV) {
      spawnDevEnemies(this.world, {
        count: DEV_FLEET_COUNT,
        hp: DEV_FLEET_HP,
        x: this.world.player.x + DEV_FLEET_OFFSET_X,
        y: this.world.player.y,
      });
    }
  }

  /** DEV ONLY (5.7 fixture). Guard repeated inside the body — see `togglePlayground`'s docstring. */
  protected spawnDevLowHpEnemy(): void {
    if (import.meta.env.DEV) {
      spawnDevEnemies(this.world, {
        count: 1,
        hp: DEV_LOW_HP,
        x: this.world.player.x + DEV_LOW_HP_OFFSET_X,
        y: this.world.player.y,
      });
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

  /** Same five-place DEV discipline as the two above. See `GymScene`'s docstring for why all five. */
  protected toggleGym(): void {
    if (import.meta.env.DEV) {
      this.scene.start('Gym');
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
   * Draw the level's tile layer. The tileset/layer resolution and the brass-cap surface rule live
   * in `src/scenes/gameLevelDraw.ts` — split out to keep this file under the 400-line rule; the
   * logic is pure scene-Phaser plumbing with no subclass override.
   */
  private drawLevel(level: LevelData): void {
    this.groundLayer = drawLevelLayer(this, level, this.levelKey);
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

    // Routed through `playAnim.ts` — see its header for the frame-0 and missing-key guards this
    // used to reimplement inline (R10).
    playIfChanged(this.playerSprite, desc.animKey);
  }

  /** Registration logic lives in `src/scenes/gameAnimations.ts` — see its header. */
  private registerAnimations(): void {
    if (import.meta.env.DEV) {
      // DEV ONLY — the locomotion-feel A/B (`?feel=1`). Guarded at the point of use so the whole
      // branch, and the import it reaches, are tree-shaken out of `dist/`; `verify-dist` proves it.
      // Only locomotion is re-paced: `simTicks` for a one-shot like `attack` is a COMBAT WINDOW
      // written against `tick.ts`'s numbered order, and scaling it would be a balance change
      // wearing an animation change's clothes.
      const variant = variantFromSearch(globalThis.location?.search ?? '');
      if (variant.strideScale !== 1 || variant.speedScale !== 1) {
        registerCatalogAnimations(this, (sheet) =>
          LOCOMOTION_KEYS.has(sheet.key)
            ? tunedFps(sheet.frameCount, sheet.simTicks, variant)
            : sheet.fps,
        );
        return;
      }
    }
    registerCatalogAnimations(this);
  }

  /**
   * DEV ONLY — apply the locomotion-feel variant's speed scale to this world's tuning.
   *
   * `world.tuning` is a per-world copy (`createTuning()`), so this cannot leak into another world
   * or into `DEFAULT_TUNING`. Speed and stride are deliberately separate knobs: scaling speed alone
   * does NOT change foot-slide, because ground travel per cycle is `simTicks * topSpeed` and
   * `simTicks` is itself derived from the speed.
   *
   * ⚠️ `KNOCKBACK_SPEED` is bound to `DEFAULT_TUNING.walkMax` at module load, so it does NOT scale
   * with this. That is fine for judging locomotion and would NOT be fine for shipping a retune —
   * recorded rather than papered over.
   */
  private applyFeelVariant(): void {
    if (!import.meta.env.DEV) {
      return;
    }
    const variant = variantFromSearch(globalThis.location?.search ?? '');
    if (variant.speedScale === 1) {
      return;
    }
    this.world.tuning.runMax *= variant.speedScale;
    this.world.tuning.walkMax *= variant.speedScale;
  }

  /** Layer specs live engine-free in `src/render/parallaxRig.ts`; this applies them. */
  private createParallax(): void {
    this.parallax = createParallax(this);
  }

  /** The HUD's fill geometry is `src/render/playerHud.ts`; this owns the Phaser objects. */
  private createHud(): void {
    this.hudFill = createHud(this);
  }

  private renderHud(): void {
    renderHud(this.hudFill, this.world.player.hp, this.world.player.maxHp);
  }

  private renderParallax(): void {
    renderParallax(this.parallax, this.cameras.main.scrollX);
  }

  /** The read-only debug view every e2e spec is written against. Dev build only. */
  private publishDebugState(): void {
    const { player } = this.world;
    updateDebugState({
      tick: this.world.tickCount,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, state: player.state },
      // `health` has been on the nine-field surface since Phase 1 and permanently 0 until now.
      // Filling it is not widening the surface — the field already existed and was a lie.
      health: player.hp,
    });
  }

  protected get simWorld(): World {
    return this.world;
  }
}
