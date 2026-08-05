import Phaser from 'phaser';
import { updateDebugState } from '../debug/globals';
import { CRISP_IMAGE_RENDERING } from '../game/constants';
import {
  CATALOG_KEY,
  describeCatalogProblem,
  type AssetCatalog,
  type CatalogEntry,
} from '../game/assetCatalog';

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
          this.queueCatalog(data as AssetCatalog | undefined);
        } catch (error) {
          this.loadFailures.push(`${CATALOG_KEY} (threw while queueing: ${String(error)})`);
        }
      },
    );
  }

  private queueCatalog(catalog: AssetCatalog | undefined): void {
    const problem = describeCatalogProblem(catalog);
    if (problem || !catalog) {
      this.loadFailures.push(`${CATALOG_KEY} (${problem})`);
      return;
    }

    for (const [index, entry] of catalog.images.entries()) {
      // A key already in the TextureManager makes `addFile` silently skip the entry — no
      // warning, no error — after which an existence check passes for a file that was never
      // fetched. That is how a scene restart, or Phase 2+ re-entering Boot, would turn this
      // whole gate into a no-op. Dropping the key first forces an honest re-load every time.
      if (this.textures.exists(entry.key)) {
        this.textures.remove(entry.key);
      }

      this.load.image(entry.key, this.applyBreakAsset(entry, index));
    }
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

    problems.push(...this.verifyExpectedTextures(catalog));

    // Fault injection runs BEFORE the assertion, not inside it: an `assert*` function that
    // mutates the thing it inspects is a trap for the next editor.
    this.applyBreakFilter();

    const filteringProblem = this.assertFilteringPinned(catalog);
    if (filteringProblem) {
      problems.push(filteringProblem);
    }

    if (problems.length > 0) {
      this.refuseToRoute(problems);
      return;
    }

    this.add
      .text(this.scale.width / 2, this.scale.height / 2, 'Boot OK', {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: '#c8a86b',
      })
      .setOrigin(0.5);

    updateDebugState({ sceneKey: this.scene.key, ready: true, bootError: null });
  }

  /**
   * THE load-bearing refusal check. Every failure mode below is caught here; the other two
   * signals are defence in depth.
   *
   * Vault 1.3 demands that a 404 AND a corrupt 200 both block boot. Which mechanism actually
   * fires was MEASURED against Phaser 4.2.1 in a browser rather than reasoned about, and the
   * results are not what the obvious design assumes:
   *
   *   failure mode                   | 'loaderror' | this check | catalog shape check
   *   -------------------------------|-------------|------------|--------------------
   *   genuine HTTP 404                | fires       | catches    | -
   *   corrupt 200 (HTML sent as PNG)  | SILENT      | catches    | -
   *   catalog missing / malformed     | SILENT      | -          | catches
   *   duplicate or reserved key       | SILENT      | -          | catches
   *
   * Why `loaderror` goes silent on a corrupt 200: an image whose bytes will not decode fails
   * during the PROCESS stage, not the LOAD stage. `File.onProcessError()` does exactly three
   * things — writes `console.error('Failed to process file: ...')`, sets state to FILE_ERRORED,
   * and calls `fileProcessComplete()`. It emits NO event; there is no FILE_PROCESS_ERROR in
   * 4.2.1. `totalFailed` does not move either, because it is only incremented in `nextFile()`
   * on the load path.
   *
   * So Phaser drops an undecodable image silently. That is vault 1.3's own sentence — "a
   * silent fallback for a missing input is the bug" — sitting inside the loader. Hence this
   * check verifies the OUTCOME instead of trusting any completion signal.
   *
   * ⚠️ Existence in the TextureManager is NOT proof this boot loaded anything: the manager is
   * game-global and survives a scene restart, and `LoaderPlugin.addFile` silently skips a key
   * that already exists. `queueCatalog()` therefore drops each expected key before loading, so
   * a texture present here really was fetched during THIS boot.
   */
  private verifyExpectedTextures(catalog: AssetCatalog | undefined): string[] {
    if (describeCatalogProblem(catalog) || !catalog) {
      // The catalog is already being reported as the problem; per-entry checks against a
      // malformed list would only add noise.
      return [];
    }

    const problems: string[] = [];

    for (const entry of catalog.images) {
      if (!this.textures.exists(entry.key)) {
        problems.push(`${entry.key} (texture not registered)`);
        continue;
      }

      // Defensive, and deliberately not claimed as observed: in 4.2.1 a failed decode leaves
      // the key UNREGISTERED, so the branch above is what fires for a corrupt 200 and this one
      // has not been seen to trigger. Kept because "registered but unusable" is cheap to check
      // and is the shape a future loader change would most likely take.
      const texture = this.textures.get(entry.key);

      // Set the filtering decision on the texture rather than relying on it being derived.
      // It is NOT derived: TextureSource.scaleMode is hardcoded to DEFAULT (=LINEAR=0), and
      // the Canvas renderer draws with `ctx.imageSmoothingEnabled = !frame.source.scaleMode`
      // — so under a Canvas fallback, !0 === true and every pixel-art texture is SMOOTHED,
      // no matter what `pixelArt: true` set. WebGL happens to be safe because its branch is
      // `scaleMode === LINEAR && config.antialias`, but relying on that leaves the fallback
      // renderer silently wrong. Setting NEAREST fixes both, and makes the assertion below
      // meaningful instead of tautological.
      texture.setFilter(Phaser.Textures.FilterMode.NEAREST);

      const source = texture.source[0];
      if (!source || source.width === 0 || source.height === 0) {
        problems.push(`${entry.key} (texture registered but has zero dimensions)`);
      }
    }

    return problems;
  }

  /**
   * Vault 1.5: decide pixel-art vs smooth filtering ONCE and assert it.
   *
   * ⚠️ The obvious assertion is wrong, and this comment exists so nobody "fixes" it back.
   *
   * Phaser's filter constants are inverted from intuition: in `Phaser.ScaleModes`,
   * LINEAR = 0 (and is also DEFAULT) while NEAREST = 1. And `TextureSource.scaleMode` is
   * hardcoded to `ScaleModes.DEFAULT` (= 0 = LINEAR) at construction — it is NEVER derived
   * from `pixelArt`. Verified against node_modules/phaser/dist/phaser.esm.js.
   *
   * That means `pixelArt: true` alone does NOT give nearest-neighbour on every renderer:
   *   - WebGL is fine by accident. Its branch is
   *       `if (scaleMode === ScaleModes.LINEAR && this.config.antialias) { ...gl.LINEAR... }`
   *     so with antialias false the GL filters stay at their NEAREST default.
   *   - CANVAS IS NOT. It draws with `ctx.imageSmoothingEnabled = !frame.source.scaleMode`,
   *     and `!0 === true`, so every texture is smoothed. `Phaser.AUTO` can fall back to
   *     Canvas, so this is reachable in production.
   *
   * The fix is to stop relying on derivation: verifyExpectedTextures() calls
   * `setFilter(NEAREST)` on each loaded texture, which makes both renderers correct. Both
   * halves are then asserted — the per-texture scaleMode (renderer-independent) and
   * `config.antialias` (the config-level decision that must not drift back).
   *
   * Note there are two unrelated things named "scale mode" in Phaser: `Phaser.ScaleModes`
   * (texture filtering, asserted here) and `Phaser.Scale.ScaleModes` (canvas fitting, set in
   * config.ts). Conflating them is the trap this comment is for.
   */
  private assertFilteringPinned(catalog: AssetCatalog | undefined): string | null {
    const config = this.game.config;

    // Every loaded texture must actually carry NEAREST. This is the renderer-independent
    // check: it is what the Canvas path reads, and it would catch a future Phaser version
    // that stopped honouring `antialias` on the WebGL path.
    if (catalog && !describeCatalogProblem(catalog)) {
      for (const entry of catalog.images) {
        if (!this.textures.exists(entry.key)) {
          continue; // already reported as a missing texture
        }
        const scaleMode = this.textures.get(entry.key).source[0]?.scaleMode;
        if (scaleMode !== Phaser.Textures.FilterMode.NEAREST) {
          return `filtering not pinned: texture "${entry.key}" has scaleMode ${String(scaleMode)}, expected NEAREST (${Phaser.Textures.FilterMode.NEAREST})`;
        }
      }
    }

    if (config.antialias !== false) {
      return `filtering not pinned: config.antialias is ${String(config.antialias)}, expected false`;
    }

    if (config.roundPixels !== true) {
      return `filtering not pinned: config.roundPixels is ${String(config.roundPixels)}, expected true`;
    }

    // The CSS half. Phaser calls CanvasInterpolation.setCrisp() when antialias is false, but
    // the vault records a CSS property silently contradicting the engine-side decision on
    // every phone — so the rendered result is checked, not the intent.
    const rendering = this.game.canvas.style.getPropertyValue('image-rendering');
    if (!CRISP_IMAGE_RENDERING.includes(rendering as (typeof CRISP_IMAGE_RENDERING)[number])) {
      return `filtering not pinned: canvas image-rendering is "${rendering}", expected one of ${CRISP_IMAGE_RENDERING.join(', ')}`;
    }

    return null;
  }

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
    updateDebugState({ sceneKey: this.scene.key, ready: false, bootError: message });
    console.error(`[boot] refused to route: ${message}`);
  }

  /**
   * DEV ONLY. `?breakAsset=corrupt` points the FIRST catalog entry at a committed non-image,
   * so the refusal path is a repeatable regression rather than a hand ritual someone has to
   * remember to perform (vault C2: a gate that cannot go red is decoration).
   *
   * Scoped to `index === 0` deliberately. Breaking every entry would retire the more
   * interesting case the moment Phase 2 adds a second asset — "one bad asset among many still
   * blocks boot" — and would make the refusal message untraceable to a specific entry.
   *
   * There is no `?breakAsset=404` knob: Vite's dev server answers a missing file with 200 +
   * SPA-fallback HTML, so pointing at a nonexistent path exercises the corrupt-200 path, not
   * the 404 path. The e2e suite forces a real 404 with Playwright route interception instead.
   */
  private applyBreakAsset(entry: CatalogEntry, index: number): string {
    if (!import.meta.env.DEV || index !== 0) {
      return entry.url;
    }

    return new URLSearchParams(window.location.search).get('breakAsset') === 'corrupt'
      ? 'assets/corrupt-fixture.png'
      : entry.url;
  }

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

    if (new URLSearchParams(window.location.search).get('breakFilter') === '1') {
      this.game.canvas.style.setProperty('image-rendering', 'auto');
    }
  }
}
