import Phaser from 'phaser';
import {
  CATALOG_KEY,
  describeCatalogProblem,
  type AssetCatalog,
  type CatalogEntry,
} from '../game/assetCatalog';
import { CRISP_IMAGE_RENDERING } from '../game/constants';
import { queueLevels } from './bootLevels';

/**
 * The asset half of BootScene's load-and-verify gate: queue every image and sheet in the
 * catalog, then verify each one actually arrived, carries the right frame count, and has
 * filtering pinned.
 *
 * **Split out of BootScene to keep it under the 400-line limit**, the same seam `bootLevels.ts`
 * already used for the level half — that file took the `.tmj` loading and verification, this one
 * takes images, sheets and the pixel-art filtering assertion. It lives in `src/scenes/` rather
 * than `src/game/` deliberately — it touches the loader, the TextureManager and `scene.game`, and
 * `src/scenes/` is the only place Phaser is allowed to live.
 */

/**
 * Queue every image and sheet in the catalog, then hand the levels to `queueLevels`.
 *
 * The cache is dropped first for the same reason the TextureManager is throughout this gate: a
 * key already present makes the loader silently skip the entry, after which an existence check
 * passes for a file that was never fetched. That is how a scene RESTART turned Phase 1's whole
 * gate into a no-op, and `phase-01-boot.spec.ts` has a test for it.
 *
 * `loadFailures` is the caller's array — pushed to directly rather than returned, because the
 * caller must still be able to catch anything this throws mid-queue and add its own entry to the
 * same array (see `BootScene.preload()`).
 */
export function queueCatalog(
  scene: Phaser.Scene,
  catalog: AssetCatalog | undefined,
  loadFailures: string[],
): void {
  const problem = describeCatalogProblem(catalog);
  if (problem || !catalog) {
    loadFailures.push(`${CATALOG_KEY} (${problem})`);
    return;
  }

  for (const [index, entry] of catalog.images.entries()) {
    // A key already in the TextureManager makes `addFile` silently skip the entry — no
    // warning, no error — after which an existence check passes for a file that was never
    // fetched. That is how a scene restart, or Phase 2+ re-entering Boot, would turn this
    // whole gate into a no-op. Dropping the key first forces an honest re-load every time.
    if (scene.textures.exists(entry.key)) {
      scene.textures.remove(entry.key);
    }

    scene.load.image(entry.key, applyBreakAsset(entry, index));
  }

  for (const sheet of catalog.sheets) {
    // Same removal rule as images, for the same reason — plus the TextureManager caches the
    // frame CARVING, so a stale entry would keep the old frame size even if the pixels reloaded.
    if (scene.textures.exists(sheet.key)) {
      scene.textures.remove(sheet.key);
    }
    scene.load.spritesheet(sheet.key, sheet.url, {
      frameWidth: sheet.frameWidth,
      frameHeight: sheet.frameHeight,
    });
  }

  // Loading and verification both live beside this function — see the header.
  queueLevels(scene, catalog.levels);
}

/**
 * DEV ONLY. `?breakAsset=corrupt` points the FIRST catalog entry at a committed non-image, so the
 * refusal path is a repeatable regression rather than a hand ritual someone has to remember to
 * perform (vault C2: a gate that cannot go red is decoration).
 *
 * Scoped to `index === 0` deliberately. Breaking every entry would retire the more interesting
 * case the moment a level adds a second asset — "one bad asset among many still blocks boot" —
 * and would make the refusal message untraceable to a specific entry.
 *
 * There is no `?breakAsset=404` knob: Vite's dev server answers a missing file with 200 +
 * SPA-fallback HTML, so pointing at a nonexistent path exercises the corrupt-200 path, not the
 * 404 path. The e2e suite forces a real 404 with Playwright route interception instead.
 */
function applyBreakAsset(entry: CatalogEntry, index: number): string {
  if (!import.meta.env.DEV || index !== 0) {
    return entry.url;
  }

  return new URLSearchParams(window.location.search).get('breakAsset') === 'corrupt'
    ? 'assets/corrupt-fixture.png'
    : entry.url;
}

/**
 * Verify each sheet carries the FRAME COUNT the catalog claims — criterion 4.19's precondition.
 *
 * This check exists because none of the others can see the failure it is for. A spritesheet
 * loaded with the wrong `frameWidth` produces a texture with correct overall dimensions, non-zero
 * source size, and a perfectly valid-looking image; `verifyExpectedTextures` passes it. What it
 * carries is the wrong number of frames, so every animation built on it plays fragments of two
 * poses at once. Codex's plan review named this as the most likely way the phase ships something
 * subtly wrong.
 *
 * Phaser appends a `__BASE` frame to every texture, which is why the count is compared after
 * excluding it rather than against `getFrameNames().length` directly.
 */
export function verifySheets(scene: Phaser.Scene, catalog: AssetCatalog | undefined): string[] {
  // The same guard `verifyExpectedTextures` carries, and it was MISSING here — the defect that
  // broke criterion 1.5. `create()` collects problems and only then calls `refuseToRoute`, so a
  // check that THROWS while collecting means the refusal never happens: `ready` stays false with
  // `bootError` null, which is the hang state the whole refuse-to-route design exists to prevent
  // (vault 1.4). Seven 1.5 specs went from asserting a refusal to timing out, because a fixture
  // catalog with no `sheets` array reached `for (const sheet of catalog.sheets)` and threw
  // `catalog.sheets is not iterable`.
  //
  // Guarding on `describeCatalogProblem` rather than on `Array.isArray` alone is deliberate: a
  // catalog already being reported as malformed should not also emit a per-sheet complaint about
  // every entry it does not have.
  if (describeCatalogProblem(catalog) || !catalog) {
    return [];
  }

  const problems: string[] = [];
  for (const sheet of catalog.sheets) {
    const texture = scene.textures.get(sheet.key);
    if (!texture || texture.key === '__MISSING') {
      problems.push(`sheet "${sheet.key}" did not load`);
      continue;
    }
    const actual = texture.getFrameNames(false).length;
    if (actual !== sheet.frameCount) {
      problems.push(
        `sheet "${sheet.key}" carries ${actual} frames but the catalog claims ` +
          `${sheet.frameCount} — the frame size is wrong, not the file`,
      );
    }
    texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
  return problems;
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
export function verifyExpectedTextures(
  scene: Phaser.Scene,
  catalog: AssetCatalog | undefined,
): string[] {
  if (describeCatalogProblem(catalog) || !catalog) {
    // The catalog is already being reported as the problem; per-entry checks against a
    // malformed list would only add noise.
    return [];
  }

  const problems: string[] = [];

  for (const entry of catalog.images) {
    if (!scene.textures.exists(entry.key)) {
      problems.push(`${entry.key} (texture not registered)`);
      continue;
    }

    // Defensive, and deliberately not claimed as observed: in 4.2.1 a failed decode leaves
    // the key UNREGISTERED, so the branch above is what fires for a corrupt 200 and this one
    // has not been seen to trigger. Kept because "registered but unusable" is cheap to check
    // and is the shape a future loader change would most likely take.
    const texture = scene.textures.get(entry.key);

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
 * The fix is to stop relying on derivation: `verifyExpectedTextures()` calls
 * `setFilter(NEAREST)` on each loaded texture, which makes both renderers correct. Both
 * halves are then asserted — the per-texture scaleMode (renderer-independent) and
 * `config.antialias` (the config-level decision that must not drift back).
 *
 * Note there are two unrelated things named "scale mode" in Phaser: `Phaser.ScaleModes`
 * (texture filtering, asserted here) and `Phaser.Scale.ScaleModes` (canvas fitting, set in
 * config.ts). Conflating them is the trap this comment is for.
 */
export function assertFilteringPinned(
  scene: Phaser.Scene,
  catalog: AssetCatalog | undefined,
): string | null {
  const config = scene.game.config;

  // Every loaded texture must actually carry NEAREST. This is the renderer-independent
  // check: it is what the Canvas path reads, and it would catch a future Phaser version
  // that stopped honouring `antialias` on the WebGL path.
  if (catalog && !describeCatalogProblem(catalog)) {
    for (const entry of catalog.images) {
      if (!scene.textures.exists(entry.key)) {
        continue; // already reported as a missing texture
      }
      const scaleMode = scene.textures.get(entry.key).source[0]?.scaleMode;
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
  const rendering = scene.game.canvas.style.getPropertyValue('image-rendering');
  if (!CRISP_IMAGE_RENDERING.includes(rendering as (typeof CRISP_IMAGE_RENDERING)[number])) {
    return `filtering not pinned: canvas image-rendering is "${rendering}", expected one of ${CRISP_IMAGE_RENDERING.join(', ')}`;
  }

  return null;
}
