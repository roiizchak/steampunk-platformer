import Phaser from 'phaser';
import { updateDebugState } from '../debug/globals';
import { CATALOG_KEY, type AssetCatalog } from '../game/assetCatalog';
import { GAME_HEIGHT, GAME_WIDTH, RENDER_SCALE } from '../game/constants';
import { drainTicks } from '../game/frameClock';
import { parseLevel, type LevelData } from '../game/tilemap';
import { cameraSetup } from '../render/cameraRig';
import { playerRenderDesc } from '../render/playerView';
import { renderAlpha, type Point } from '../render/interpolate';
import type { MotionProbe } from './devMotionProbe';
import {
  addHelpBanner,
  attachDevOverlays,
  helpLine,
  spawnFleetFixture,
  spawnLowHpFixture,
  startDevScene,
} from './gameDev';
import { EnemyLayer } from './enemyLayer';
import { bindPlayerKeys, sampleHeldKeys, type HeldKeys } from './gameInput';
import { attachHud } from './gameHud';
import { createAudio, type AudioManager } from '../game/audio';
import { audioCues } from '../sim/audioCues';
import type { GearLayer } from './gearLayer';
import type { UIScene } from './UIScene';
import { drawLevelLayer } from './gameLevelDraw';
import { createParallax, renderParallax, type ParallaxImage } from './gameParallax';
import { applyFeelVariant, registerAnimations, renderPlayerSprite } from './gamePlayerDraw';
import { createSnapshot } from '../sim/input';
import { createWorld } from '../sim/tick';
import { advanceSplit } from '../sim/advanceSplit';
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
  /**
   * The player's position immediately BEFORE the most recent tick, or `null` before any tick has
   * run. Read by `renderPlayerSprite` (`gamePlayerDraw.ts`) and, deliberately, by criterion 4.23's
   * e2e sampler — see `src/render/interpolate.ts` and `tests/e2e/drawnVsSim.ts`. **4.23 asserts the
   * drawn position EXACTLY against this field**, so renaming it makes that spec fail loudly rather
   * than quietly stop checking. (This said "read only by `renderPlayer`" until 2026-08-17; that
   * method was inlined and the sampler had been added.)
   *
   * A plain copy rather than a reference: `world.player` is mutated in place by the sim, so holding
   * a reference would make `prev` and `cur` the same object and the blend a no-op.
   */
  private prevPlayer: Point | null = null;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private enemies!: EnemyLayer;
  private gears!: GearLayer;
  /** The parallel HUD scene. Optional at the type level: `launch` is async, so a frame can beat it. */
  private ui?: UIScene;
  /** Phase 7's sound manager. Optional for the same reason `ui` is: a frame can beat `create()`. */
  private audio?: AudioManager;
  private parallax: ParallaxImage[] = [];
  protected levelKey = '';
  protected groundLayer!: Phaser.Tilemaps.TilemapLayer;
  /** Bound and sampled in `src/scenes/gameInput.ts`; see `bindKeys`/`sampleHeldKeys` below. */
  private held: HeldKeys = { left: [], right: [], jump: [], walk: [], attack: [] };
  /** DEV ONLY — see `devFeelTuner.ts`. Undefined in production, where the branch is compiled out. */
  private feelTuner?: (sprite: Phaser.GameObjects.Sprite) => void;
  /** DEV ONLY — see `devMotionProbe.ts`. The ghost-report falsifier, `?probe=1`. */
  private motionProbe?: MotionProbe;

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
    // Cleared with the accumulator: a stale `prev` from the previous level would blend the first
    // drawn frame between two different levels. `interpolatedPosition` also snaps on a leap, but
    // the honest reset is here rather than relying on that guard to catch a restart.
    this.prevPlayer = null;
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
      // Phase 6, from the same parsed level for the same reason: move a gear in Tiled and it moves
      // in the game. There is no scene-side list of pickups to drift out of step with the file.
      gears: level.gears,
    });
    applyFeelVariant(this.world);
    this.input$ = createSnapshot();

    // Layer specs live engine-free in `src/render/parallaxRig.ts`; `gameParallax.ts` applies them.
    this.parallax = createParallax(this);
    // The tileset/layer resolution and the brass-cap surface rule live in `gameLevelDraw.ts`.
    this.groundLayer = drawLevelLayer(this, level, this.levelKey);
    const desc = playerRenderDesc(this.world.player, this.world.scale);
    registerAnimations(this);
    this.playerSprite = this.add
      .sprite(desc.x, desc.y, desc.animKey)
      .setOrigin(desc.originX, desc.originY)
      .setDepth(10);
    this.playerSprite.play(desc.animKey);

    this.enemies = new EnemyLayer(this, this.world);
    this.enemies.create();

    // Phase 6: the HUD is a PARALLEL scene, not objects on this display list — see `UIScene` for
    // why that removes vault 6.1's reciprocal-ignore-list hazard instead of managing it.
    ({ ui: this.ui, gears: this.gears } = attachHud(this, this.world));

    // Phase 7. A plain module, not a scene, and torn down in `BootScene.init()` rather than from a
    // SHUTDOWN handler here — `src/game/audio.ts` carries the reasoning, which is Phase 6's HUD
    // lesson applied to a manager that is game-global rather than scene-owned.
    this.audio = createAudio(this, this.catalog());

    this.bindKeys();
    addHelpBanner(this, this.helpText());

    // DEV ONLY, both off unless their query flag is present. The guard lives inside
    // `attachDevOverlays` so this call folds away entirely in production — see `gameDev.ts`.
    ({ feelTuner: this.feelTuner, motionProbe: this.motionProbe } = attachDevOverlays(
      this,
      this.world,
    ));

    // Bounds, zoom and smoothing from `cameraRig`; Phaser owns the clamping (criterion 3.4).
    const camera = this.cameras.main;
    const cam = cameraSetup(level, GAME_WIDTH, GAME_HEIGHT);
    camera.setBounds(cam.bounds.x, cam.bounds.y, cam.bounds.w, cam.bounds.h);
    camera.setZoom(cam.zoom);
    camera.startFollow(this.playerSprite, false, cam.lerpX, cam.lerpY);

    // The positive terminal condition, set here rather than in Boot: Boot now routes onward, so
    // "the gate passed" and "the game is running" are different facts. If this scene fails to
    // create, `ready` stays false with `bootError` null — the third state, a hang, which the QA
    // gate can see precisely because it is distinct from both of the others (vault 1.4).
    //
    // `levelId` fills the slot Phase 1 cut on the eight-field debug surface and left null. No new
    // field, so the surface is still closed at eight (a ninth needs a STOP-and-ask). The count read
    // "nine" here and in three documents until 2026-08-14; `src/debug/globals.ts` is the authority.
    updateDebugState({
      sceneKey: this.scene.key,
      ready: true,
      bootError: null,
      levelId: level.id,
    });
    this.publishDebugState();
  }

  /**
   * The controls banner's text. The string itself lives in `gameDev.ts`; this stays a `protected`
   * method because `ElementEditorScene` overrides it to describe its own controls.
   */
  protected helpText(): string {
    return helpLine();
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

    // Binding and per-frame sampling both live in `src/scenes/gameInput.ts` — see its header. This
    // scene still owns `playerInputEnabled` and the DEV scene-switch/fixture-spawn callbacks.
    sampleHeldKeys(this.input$, this.held, this.playerInputEnabled);
    // Called even when `ticks === 0`, and that case is load-bearing: it must NOT consume the
    // input snapshot. A frame too short to produce a whole tick that ate a jump press is vault
    // 2.4's "a tick ran is not your input was consumed", inverted.
    //
    // 🔴 The batch is SPLIT, and both why-it-is-split and the defect that lived here before it moved
    // are in `src/sim/advanceSplit.ts`'s header. Stated in ONE place on purpose: it was explained
    // here, in a scene method no test could reach, and the explanation outlived its own accuracy for
    // a whole phase (vault C9 — a wrong comment is worse than none).
    const events = advanceSplit(this.world, this.input$, ticks, () => {
      this.prevPlayer = { x: this.world.player.x, y: this.world.player.y };
      // The enemies' half of the same snapshot, taken at the same instant and for the same reason.
      // It was missing until 2026-08-14, which left every enemy drawn at raw tick positions while
      // the player was blended — three still frames then a jump, at 240 Hz. The user reported it as
      // the scavenger "not smooth like my character", and the comparison in those words is literally
      // what the code was doing.
      this.enemies.snapshot();
    });
    // A respawn moves the player the width of the level in one tick. `interpolatedPosition`
    // already snaps past `MAX_LEAP_PX`, but only past it — a player who dies within 48px of the
    // spawn would be blended across the gap instead. Dropping the snapshot says "there is no
    // previous position to come from", which is the truth about a respawn and needs no threshold.
    if (events.respawned) {
      this.prevPlayer = null;
    }

    // Cues come from the batch's OR-accumulated edges, which is what makes them survive a frame
    // that drained five ticks — the whole reason `TickEvents` exists rather than a state diff
    // *(vault 2.5)*. `audioCues` is pure and lives in `src/sim/`, so what plays here and what the
    // unit suite asserts are one definition, not two that agree on the happy path.
    this.audio?.playCues(audioCues(events));

    renderPlayerSprite(
      this.playerSprite,
      this.world,
      this.prevPlayer,
      this.accumulatorMs,
      import.meta.env.DEV ? this.feelTuner : undefined,
    );
    // The HUD lives in `UIScene`, so this hands it the world and this scene's camera. The camera
    // goes across because the collect tween has to turn a gear's WORLD position into a screen
    // position, and the camera's scroll and zoom are that transform — doing the conversion here
    // would put HUD arithmetic in the one file this project cannot let grow.
    this.ui?.render(this.world, this.cameras.main);
    this.gears.sync();
    this.enemies.sync(renderAlpha(this.accumulatorMs));
    renderParallax(this.parallax, this.cameras.main.scrollX);
    // DEV ONLY. Driven by the RAW millisecond delta, not by `ticks` — the whole point is that one
    // lane advances between ticks and the other does not.
    this.motionProbe?.update(delta);
    this.publishDebugState();
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
    this.held = bindPlayerKeys(
      this,
      this.input$,
      () => this.playerInputEnabled,
      dev,
      // A getter, not the manager: `bindKeys` runs during `create()` and a captured reference
      // would go stale the moment Boot tore the manager down and `create()` built a new one.
      //
      // 🔴 Passed UNCONDITIONALLY. It read `this.audio ? () => this.audio! : undefined`, which
      // decided whether the mute and volume keys exist at all from the field's value at bind time —
      // correct today only because `createAudio` happens to run two lines above `bindKeys`. Any
      // reorder, or a subclass that binds before creating audio, would ship a build with no mute key
      // and no error. `gameInput.ts` does the nullish check per press instead, where it is cheap and
      // where a null manager is a no-op rather than a missing feature.
      () => this.audio,
    );
  }

  /**
   * The two DEV fixtures and the three DEV scene toggles.
   *
   * Every body is one delegating line, and every guard lives in `gameDev.ts` INSIDE the function it
   * guards — not out here on the call. That is what keeps the scene-key literals out of `dist/`,
   * and `tools/gen/verify-dist.mjs` is what proves it. These stay `protected` methods rather than
   * direct calls because `ElementEditorScene` overrides `toggleElementEditor`.
   */
  protected spawnDevFleet(): void {
    spawnFleetFixture(this.world);
  }

  protected spawnDevLowHpEnemy(): void {
    spawnLowHpFixture(this.world);
  }

  protected togglePlayground(): void {
    startDevScene(this, 'Playground');
  }

  protected toggleElementEditor(): void {
    startDevScene(this, 'ElementEditor');
  }

  protected toggleGym(): void {
    startDevScene(this, 'Gym');
  }

  /**
   * The validated catalog. Boot refuses to route without one, so reaching here means it exists —
   * this throws rather than returning `undefined` because a silent `?.` is how a missing catalog
   * becomes a game with no audio and no complaint.
   */
  protected catalog(): AssetCatalog {
    const catalog = this.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    if (!catalog) {
      throw new Error('GameScene: no asset catalog in cache; Boot should have refused to route');
    }
    return catalog;
  }

  protected loadLevel(): LevelData {
    const entry = this.catalog().levels[0];
    if (!entry) {
      throw new Error('GameScene: the catalog lists no levels; Boot should have refused to route');
    }

    const cached = this.cache.tilemap.get(entry.key) as { data?: unknown } | undefined;
    this.levelKey = entry.key;
    return parseLevel(entry.key, cached?.data);
  }

  /** The read-only debug view every e2e spec is written against. Dev build only. */
  private publishDebugState(): void {
    const { player } = this.world;
    updateDebugState({
      tick: this.world.tickCount,
      player: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, state: player.state },
      // `health` has been on the eight-field surface since Phase 1 and permanently 0 until now.
      // Filling it is not widening the surface — the field already existed and was a lie.
      health: player.hp,
      // `score` was the same lie, and outlived `health` by a phase: declared in Phase 1, reset to 0
      // by BootScene, and never written by anything. Phase 6 gives it the only meaning this game
      // has for it. Still eight fields; still no STOP-and-ask.
      score: this.world.gearsCollected,
    });
  }

  protected get simWorld(): World {
    return this.world;
  }
}
