import type Phaser from 'phaser';
import { CATALOG_KEY, type AssetCatalog } from '../game/assetCatalog';

/**
 * Register one Phaser animation per catalog sheet, with the frame rate DERIVED from the sim.
 *
 * Split out of `GameScene.ts` to keep that file under the 400-line rule.
 *
 * **The fps handed to Phaser comes from the CATALOG, and an earlier comment here claimed
 * otherwise.** It said the value came from `animTimings()` and that retuning `runMax` would
 * change the run animation on the next boot with no asset rebuild. Neither is true: this file
 * does not import `animTimings`, and the line below passes `sheet.fps` straight from
 * `index.json`. The Codex implementation review caught it (finding 1); the wrong claim had been
 * believed.
 *
 * What IS true, and is the property vault 4.22 actually needs: the catalog's numbers cannot
 * disagree with the simulation, because `tests/unit/asset-catalog.test.ts` derives
 * `fps = renderFrames x TICK_HZ / simTicks` from the live `DEFAULT_TUNING` and the shipped
 * strides and asserts equality per animation. Retune a knob without rebuilding and that suite
 * goes RED — the drift is caught, it is simply caught at test time rather than absorbed at boot.
 *
 * Deriving here would need the per-cycle strides, which live in `character-bounds.json` and are
 * NOT loaded at runtime — the catalog has no field for them. Adding one is a schema change that
 * touches `describeCatalogProblem`, every boot fixture and `verify-dist`, which is the cost
 * ASSET-MANIFEST section 4 documents. Deliberately not done inside a phase that is already
 * reported failing; recorded in `docs/qa/phase-04-art.md` instead.
 */
export function registerCatalogAnimations(
  scene: Phaser.Scene,
  /**
   * Optional per-sheet frame-rate override, used ONLY by the DEV-only locomotion-feel variants
   * (`src/game/feelVariants.ts`) so foot-slide and speed can be judged in an interleaved A/B rather
   * than across three rebuilds. Absent in production, where `sheet.fps` from the catalog is the one
   * source — the fps is still never authored, it is re-derived by the same `renderFrames * TICK_HZ
   * / simTicks` rule against a scaled `simTicks`.
   */
  fpsFor?: (sheet: AssetCatalog['sheets'][number]) => number,
): void {
  const catalog = scene.cache.json.get(CATALOG_KEY) as AssetCatalog | undefined;
  if (!catalog) {
    throw new Error('GameScene: the asset catalog is missing after boot approved it');
  }
  for (const sheet of catalog.sheets) {
    if (scene.anims.exists(sheet.key)) {
      scene.anims.remove(sheet.key);
    }
    scene.anims.create({
      key: sheet.key,
      frames: scene.anims.generateFrameNumbers(sheet.key, {
        start: 0,
        end: sheet.frameCount - 1,
      }),
      frameRate: fpsFor ? fpsFor(sheet) : sheet.fps,
      repeat: sheet.loop ? -1 : 0,
    });
  }
}
