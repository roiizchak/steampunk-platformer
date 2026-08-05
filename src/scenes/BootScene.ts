import Phaser from 'phaser';
import { updateDebugState } from '../debug/globals';

/** One entry in `public/assets/index.json`. */
interface CatalogEntry {
  key: string;
  url: string;
}

interface AssetCatalog {
  images: CatalogEntry[];
}

const CATALOG_KEY = 'asset-catalog';

/**
 * `CanvasInterpolation.setCrisp()` assigns each of these to `canvas.style['image-rendering']`
 * in order; the browser keeps the last one it recognises, so the winning value differs by
 * engine (Chromium lands on `pixelated`, Firefox on `-moz-crisp-edges`). Asserting one exact
 * string would be a false red on a correct setup in another browser, so membership is the
 * assertion. Read off phaser.esm.js, not assumed.
 */
const CRISP_IMAGE_RENDERING = [
  'optimizeSpeed',
  '-moz-crisp-edges',
  '-o-crisp-edges',
  '-webkit-optimize-contrast',
  'optimize-contrast',
  'crisp-edges',
  'pixelated',
];

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
    // One of three independent signals; each catches a case the others miss. Measured, not
    // assumed — see the table on findUnusableTextures(). This one fires on a genuine HTTP
    // 404 and stays silent on a corrupt 200.
    this.load.on(Phaser.Loader.Events.FILE_LOAD_ERROR, (file: Phaser.Loader.File) => {
      this.loadFailures.push(`${file.key} (load error: ${file.url})`);
    });

    // Load the catalog, then queue everything it names from the completion callback. Files
    // added mid-load are picked up by the running loader, so `complete` still waits for them.
    this.load.json(CATALOG_KEY, this.applyBreakCatalog('assets/index.json'));

    this.load.once(`filecomplete-json-${CATALOG_KEY}`, (_key: string, _type: string, data: unknown) => {
      const catalog = data as AssetCatalog | undefined;

      if (!catalog || !Array.isArray(catalog.images) || catalog.images.length === 0) {
        this.loadFailures.push(`${CATALOG_KEY} (assets/index.json is malformed or lists no images)`);
        return;
      }

      for (const entry of catalog.images) {
        this.load.image(entry.key, this.applyBreakAsset(entry));
      }
    });
  }

  create(): void {
    // create() runs even when files failed — the loader completes rather than aborting. That
    // is why every check lives here and not only in a loader callback: a callback that never
    // fires cannot report anything, which is how "the catalog 404'd, so nothing was queued,
    // so nothing failed" reads as a clean boot.
    const catalog = this.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
    const problems = [...this.loadFailures];

    // Verified HERE, not only in the filecomplete callback. Zero expected assets must never be
    // mistaken for zero failures — an empty expectation trivially satisfies itself.
    if (!catalog || !Array.isArray(catalog.images) || catalog.images.length === 0) {
      problems.push(`${CATALOG_KEY} (assets/index.json missing, malformed, or lists no images)`);
    }

    problems.push(...this.findUnusableTextures(catalog));

    const filteringProblem = this.assertFilteringPinned();
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
   * The broadest of the three refusal signals, and the only one that catches a corrupt 200.
   *
   * Vault 1.3 demands that a 404 AND a corrupt 200 both block boot. Which mechanism actually
   * fires was MEASURED against Phaser 4.2.1 in a browser, not reasoned about — the results
   * are not what the obvious design assumes:
   *
   *   failure mode                    | 'loaderror' | this check | catalog check in create()
   *   --------------------------------|-------------|------------|--------------------------
   *   genuine HTTP 404                 | fires       | catches    | -
   *   corrupt 200 (HTML sent as PNG)   | SILENT      | catches    | -
   *   catalog missing                  | SILENT      | -          | catches
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
   * check verifies the OUTCOME (is there a usable texture?) instead of trusting a signal.
   *
   * Existence alone is not enough: a corrupt 200 can leave a key registered with zero
   * dimensions, so the pixel size is what gets asserted.
   */
  private findUnusableTextures(catalog: AssetCatalog | undefined): string[] {
    if (!catalog || !Array.isArray(catalog.images)) {
      return [];
    }

    const problems: string[] = [];

    for (const entry of catalog.images) {
      if (!this.textures.exists(entry.key)) {
        problems.push(`${entry.key} (texture not registered)`);
        continue;
      }

      const source = this.textures.get(entry.key).source[0];
      if (!source || source.width === 0 || source.height === 0) {
        problems.push(`${entry.key} (texture registered but has zero dimensions — corrupt 200?)`);
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
   * LINEAR = 0 (and is also DEFAULT) while NEAREST = 1. But `TextureSource.scaleMode` is
   * hardcoded to `ScaleModes.DEFAULT` (= 0 = LINEAR) at construction and is NEVER derived
   * from `pixelArt`. Asserting `texture.source[0].scaleMode === NEAREST` therefore FAILS on a
   * correctly configured pixel-art game. Verified against node_modules/phaser/dist/phaser.esm.js.
   *
   * What actually selects the sampling mode is this line in the WebGL renderer:
   *     if (scaleMode === CONST.ScaleModes.LINEAR && this.config.antialias) { ...gl.LINEAR... }
   * The GL filters default to NEAREST and are only upgraded to LINEAR when antialias is on.
   * So `config.antialias === false` IS the pinned decision, and that is what we assert.
   *
   * Note there are two unrelated things named "scale mode" in Phaser: `Phaser.ScaleModes`
   * (texture filtering, asserted here) and `Phaser.Scale.ScaleModes` (canvas fitting, set in
   * config.ts). Conflating them is the trap this comment is for.
   */
  private assertFilteringPinned(): string | null {
    const config = this.game.config;

    if (config.antialias !== false) {
      return `filtering not pinned: config.antialias is ${String(config.antialias)}, expected false`;
    }

    if (config.roundPixels !== true) {
      return `filtering not pinned: config.roundPixels is ${String(config.roundPixels)}, expected true`;
    }

    // The CSS half. Phaser calls CanvasInterpolation.setCrisp() when antialias is false, but
    // the vault records a CSS property silently contradicting the engine-side decision on
    // every phone — so the rendered result is checked, not the intent.
    this.applyBreakFilter();

    const rendering = this.game.canvas.style.getPropertyValue('image-rendering');
    if (!CRISP_IMAGE_RENDERING.includes(rendering)) {
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
   * DEV ONLY. `?breakAsset=404` and `?breakAsset=corrupt` point one catalog entry at a
   * missing file / a committed non-image, so the refusal path is a repeatable regression
   * instead of a hand ritual someone has to remember to perform (vault C2: a gate that
   * cannot go red is decoration).
   */
  private applyBreakAsset(entry: CatalogEntry): string {
    if (!import.meta.env.DEV) {
      return entry.url;
    }

    const mode = new URLSearchParams(window.location.search).get('breakAsset');

    if (mode === '404') {
      return 'assets/this-file-does-not-exist.png';
    }
    if (mode === 'corrupt') {
      return 'assets/corrupt-fixture.png';
    }

    return entry.url;
  }

  /**
   * DEV ONLY. `?breakAsset=catalog` points the catalog itself at a missing file.
   *
   * Worth its own case because the catalog is JSON loaded over XHR, which DOES fail at the
   * load stage and so DOES fire `loaderror` — unlike the image path. It is the committed proof
   * that the `loaderror` listener is a live supplementary signal rather than dead code.
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
