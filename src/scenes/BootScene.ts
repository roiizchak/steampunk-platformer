import Phaser from 'phaser';
import { devSeam } from '../debug/devSeam';
import { updateDebugState } from '../debug/globals';
import { CATALOG_KEY, describeCatalogProblem, type AssetCatalog } from '../game/assetCatalog';
import { destroyAudio } from '../game/audio';
import {
  queueCatalog,
  verifyAudio,
  verifyExpectedTextures,
  verifySheets,
  assertFilteringPinned,
} from './bootAssets';
import { verifyLevels } from './bootLevels';
import { LEVEL_SELECT_KEY } from './gameLevelPick';

/**
 * Boot: load every expected asset, verify it actually arrived, pin the filtering decision,
 * and REFUSE TO ROUTE if any of that fails.
 *
 * Vault 1.3 — a silent fallback for a missing input is the bug. This scene never falls
 * through to the game with a missing or corrupt texture; it stops and says why.
 */
export class BootScene extends Phaser.Scene {
  private loadFailures: string[] = [];

  constructor() {
    super({ key: 'Boot' });
  }

  /**
   * Vault 1.7: reset state in `init`, NOT the constructor. The constructor runs once; `init`
   * runs on every start and restart, and scene starts are queued rather than immediate.
   */
  init(): void {
    this.loadFailures = [];

    /**
     * 🔴 **Stop the play scenes BEFORE re-loading, not only when refusing.**
     *
     * `refuseToRoute` already stops `Game` and `UI`, and that is correct — but it runs at the END of
     * a boot attempt, and on a **restart** the play scenes keep rendering all the way through the
     * reload that precedes it. `preload` drops the cached catalog and textures on purpose (see
     * below), so a still-rendering `GameScene` reaches a freed texture and throws
     * `TypeError: Cannot read properties of null (reading 'glTexture')`. Once the render loop
     * throws, nothing further runs — including `refuseToRoute`'s stops — and the HUD is left frozen
     * over the error screen. A refusal you can see straight through, arrived at from a direction the
     * Phase 6 fix could not reach.
     *
     * Found by writing the restart-based refusal test Codex's second implementation review asked
     * for; the old test used a fresh page, where these scenes were never running.
     *
     * A no-op on a fresh boot — `scene.stop` on a scene that was never started does nothing — so
     * this costs the normal path nothing and makes the restart path safe by construction.
     */
    this.scene.stop('Game');
    this.scene.stop('UI');
    // Phase 8: the level menu SHIPS, so it is stopped on the same unconditional side as Game and UI.
    // A restart with the menu open would otherwise leave it drawn over the reload.
    this.scene.stop(LEVEL_SELECT_KEY);
    // Phase 7, and it belongs HERE for the same reason those two stops do. `this.sound` is one
    // manager for the whole game and is not cleaned up on scene shutdown, so a looping bed survives
    // a restart and a second one starts on top of it — criterion 7.5. A `GameScene` SHUTDOWN handler
    // is the shape Phase 6 tried twice and discarded, because the operation is queued and drains
    // after the next `create()`. `init()` runs before any load on every boot, restart and refusal,
    // and `destroyAudio` is idempotent, so there is no ordering to get wrong and this is a no-op on
    // a fresh boot.
    destroyAudio(this);
    updateDebugState({
      sceneKey: this.scene.key,
      tick: 0,
      player: null,
      score: 0,
      health: 0,
      levelId: null,
      ready: false,
      bootError: null,
    });
  }

  preload(): void {
    // Defence in depth, NOT a uniquely necessary signal — measured. Against a real static host
    // this fires for a genuine HTTP 404. Against Vite's dev server it essentially never fires,
    // because Vite answers a missing file with 200 + SPA-fallback HTML rather than a 404, so
    // the failure lands at the decode stage instead. Every case it catches is also caught by
    // verifyExpectedTextures(); it is kept for the message, which names the URL.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.loadFailures.push(`${file.key} (load error: ${file.url})`);
    });

    // The catalog is cached game-globally too, and `File.hasCacheConflict()` is just
    // `this.cache.exists(this.key)` — so on a restart the JSON would be skipped, the
    // filecomplete callback below would never fire, and NOTHING would be re-fetched or
    // re-verified while create() happily validated the stale cache against stale textures.
    // Same class of bug as the texture cache, one level up. Drop it first.
    if (this.cache.json.exists(CATALOG_KEY)) {
      this.cache.json.remove(CATALOG_KEY);
    }

    // Load the catalog, then queue everything it names from the completion callback. Files
    // added mid-load are picked up by the running loader, so `complete` still waits for them.
    this.load.json(CATALOG_KEY, this.applyBreakCatalog('assets/index.json'));

    this.load.once(
      `filecomplete-json-${CATALOG_KEY}`,
      (_key: string, _type: string, data: unknown) => {
        // Anything thrown in here propagates through EventEmitter.emit into the loader's
        // processing path, so `complete` never fires, `create()` never runs, and the game
        // hangs at ready=false/bootError=null — the indistinguishable third state this whole
        // design exists to avoid. A malformed entry must become a REFUSAL, never a hang.
        try {
          queueCatalog(this, data as AssetCatalog | undefined, this.loadFailures);
        } catch (error) {
          this.loadFailures.push(`${CATALOG_KEY} (threw while queueing: ${String(error)})`);
        }
      },
    );
  }

  create(): void {
    // create() runs even when files failed — the loader completes rather than aborting. That
    // is why every check lives here and not only in a loader callback: a callback that never
    // fires cannot report anything, which is how "the catalog 404'd, so nothing was queued,
    // so nothing failed" reads as a clean boot.
    const catalog = this.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    const problems = [...this.loadFailures];

    // Re-validated HERE, not only in the filecomplete callback, because a callback that never
    // fires cannot report anything — which is how "the catalog 404'd, so nothing was queued,
    // so nothing failed" reads as a clean boot. Deduplicated against what queueCatalog already
    // reported so one bad catalog does not produce two near-identical clauses.
    const catalogProblem = describeCatalogProblem(catalog);
    if (catalogProblem && !problems.some((p) => p.includes(catalogProblem))) {
      problems.push(`${CATALOG_KEY} (${catalogProblem})`);
    }

    problems.push(...verifyExpectedTextures(this, catalog));
    problems.push(...verifySheets(this, catalog));
    problems.push(...verifyLevels(this, catalog));
    // Phase 7. A failed audio decode is silent in Phaser — see `verifyAudio` — so without this a
    // soundless build boots green.
    problems.push(...verifyAudio(this, catalog));

    // Fault injection runs BEFORE the assertion, not inside it: an `assert*` function that
    // mutates the thing it inspects is a trap for the next editor.
    this.applyBreakFilter();

    const filteringProblem = assertFilteringPinned(this, catalog);
    if (filteringProblem) {
      problems.push(filteringProblem);
    }

    if (problems.length > 0) {
      this.refuseToRoute(problems);
      return;
    }

    // Route onward. Phase 1 deliberately terminated here and set `ready` itself, because there
    // was nowhere to go; Phase 2 built the destination, so "the gate passed" and "the game is
    // running" became different facts and `ready` moved to GameScene.create().
    //
    // The consequence is deliberate: if GameScene fails to construct, `ready` stays false with
    // `bootError` null — the third state, a hang, which is distinguishable from both a clean boot
    // and a refusal. Setting `ready` here would have reported a broken game as a good one.
    /**
     * ⚠️ `{ levelId: null }`, never a bare `start('Game')`.
     *
     * Phaser's `Systems.start(data)` only overwrites `settings.data` when `data` is TRUTHY, and
     * `SceneManager.bootScene` feeds `settings.data` straight into `init`. So a payload-less start
     * re-delivers whatever payload the scene was last started with — and since Phase 8 that is a
     * concrete `{ levelId }` from the level menu or from the completion panel. `GameScene.init` cannot
     * tell "no payload" from "the payload from three starts ago", so the stale id would win over the
     * save and defeat the tier ordering `resolveEntryLevel` exists to enforce. Verified against the
     * installed Phaser 4.2.1 source by the Phase 8 code-reviewer's adversarial brief.
     *
     * `null` is not "no payload" — it is the explicit request to resolve from the save, which is what
     * `init`'s `data?.levelId ?? null` already means.
     */
    this.scene.start('Game', { levelId: null });
  }

  /**
   * `verifyExpectedTextures`, `verifySheets` and `assertFilteringPinned` — the load-bearing
   * refusal checks, including the vault 1.3 and 1.5 rationale for each — live in `bootAssets.ts`,
   * split out to keep this file under the 400-line limit. See that file's header.
   */

  private refuseToRoute(problems: string[]): void {
    const message = problems.join('; ');

    this.add
      .text(this.scale.width / 2, this.scale.height / 2, `BOOT REFUSED\n\n${problems.join('\n')}`, {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#ff6b5a',
        align: 'center',
        wordWrap: { width: this.scale.width - 160 },
      })
      .setOrigin(0.5);

    // Deliberately no scene.start(). Refusing to route IS the feature.
    //
    // Stopping the play scenes matters from Phase 2 onward and only on a RESTART: re-entering
    // Boot while Game is already running would leave a refused boot with a game still ticking
    // behind the error screen, still publishing `player` and `tick`. "Refused to route" has to
    // mean the game is not running, or the refusal is cosmetic. `scene.stop` on a scene that was
    // never started is a no-op, so the fresh-boot path is unchanged.
    this.scene.stop('Game');
    // Phase 6: the HUD runs in parallel with Game, so stopping only Game leaves a health bar and a
    // gear counter drawn over the error screen — a refusal you can see straight through.
    this.scene.stop('UI');
    // Phase 8, and it is NOT in the DEV block below: the level menu ships. A refusal reached from the
    // menu — press ESC, then restart Boot — would otherwise draw five level rows over "BOOT REFUSED",
    // which is the same cosmetic refusal the HUD stop above exists to prevent.
    this.scene.stop(LEVEL_SELECT_KEY);
    // The dev scenes, guarded so their keys do not survive into `dist/`. In production neither is
    // registered, so stopping them is already a no-op — the guard costs nothing and keeps the
    // production bundle free of any mention of a scene that cannot exist there. Phase 3 added
    // ElementEditor here for the same reason Playground is here: a refused boot that leaves a play
    // scene ticking behind the error screen is a cosmetic refusal, not a refusal.
    if (import.meta.env.DEV) {
      devSeam('__DEVSEAM_BootScene_stopDevScenes__');
      this.scene.stop('Playground');
      this.scene.stop('ElementEditor');
      this.scene.stop('Gym');
    }
    updateDebugState({ sceneKey: this.scene.key, ready: false, bootError: message });
    console.error(`[boot] refused to route: ${message}`);
  }

  // `applyBreakAsset` (DEV ONLY, `?breakAsset=corrupt`) moved to `bootAssets.ts` beside
  // `queueCatalog`, its only caller.

  /**
   * DEV ONLY. `?breakAsset=catalog` points the catalog itself at a missing file.
   *
   * Note this does NOT exercise the `loaderror` listener, despite the catalog being JSON over
   * XHR: Vite answers the missing file with 200 + HTML, so the XHR succeeds and `JSON.parse`
   * fails at the process stage — silently, exactly like an image. The refusal comes from the
   * catalog shape check. Measured; an earlier comment here claimed the opposite.
   */
  private applyBreakCatalog(url: string): string {
    if (!import.meta.env.DEV) {
      return url;
    }
  devSeam('__DEVSEAM_BootScene_breakAssetCatalog__');

    return new URLSearchParams(window.location.search).get('breakAsset') === 'catalog'
      ? 'assets/this-catalog-does-not-exist.json'
      : url;
  }

  /**
   * DEV ONLY. `?breakFilter=1` overwrites the canvas `image-rendering` that Phaser set —
   * which is not a synthetic failure but a faithful reproduction of the vault's recorded bug,
   * where a CSS property silently contradicted the engine-side decision. It proves the
   * assertion above actually runs, rather than being reviewed and never executed.
   */
  private applyBreakFilter(): void {
    if (!import.meta.env.DEV) {
      return;
    }
  devSeam('__DEVSEAM_BootScene_breakFilter__');

    if (new URLSearchParams(window.location.search).get('breakFilter') === '1') {
      this.game.canvas.style.setProperty('image-rendering', 'auto');
    }
  }
}
