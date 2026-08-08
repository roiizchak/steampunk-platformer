import { PHASER_RESERVED_TEXTURE_KEYS } from './constants';

/**
 * The asset catalog (`public/assets/index.json`) and its validation.
 *
 * Split out of BootScene purely to keep that file under the 400-line limit; this is also the
 * natural seam, since validation is pure and engine-free while the scene is neither.
 */

/** One entry in `public/assets/index.json`. */
export interface CatalogEntry {
  key: string;
  url: string;
}

/**
 * One spritesheet in the catalog. Phase 4.
 *
 * `frameWidth`/`frameHeight` are the load-bearing fields and the reason `verifyExpectedTextures`
 * had to grow a frame-count check: a sheet loaded with the WRONG `frameWidth` still registers a
 * texture with correct overall dimensions and a plausible-looking image, and it passes every check
 * that existed before this phase. It simply carries the wrong number of frames, so the animation
 * plays fragments of two poses at once. That is the single most likely way this phase ships
 * something subtly wrong, and it is the one Codex's plan review named.
 *
 * `fps` and `simTicks` are RECORDED here, not authoritative. The authority is
 * `src/render/animTiming.ts`, which derives them from the live simulation
 * (`fps = renderFrames * TICK_HZ / simTicks`, vault 4.22). Both exist so
 * `tests/unit/asset-catalog.test.ts` can assert they agree — the doc-versus-code lock Phase 3
 * established, applied to data: a number that lives in two places can drift while both look right
 * in isolation, unless something compares them.
 */
export interface SheetEntry extends CatalogEntry {
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  loop: boolean;
  simTicks: number;
  /** How `simTicks` was arrived at. `authored` is a disclosure, not a pass — see animTiming.ts. */
  derivedFrom: 'sim' | 'measured' | 'authored';
}

export interface AssetCatalog {
  images: CatalogEntry[];
  /**
   * Tiled levels. **Required and non-empty**, deliberately.
   *
   * The Phase 3 plan had this optional so the six Phase 1 catalog-refusal fixtures would not have
   * to change. The Codex plan review (P3) rejected that: GameScene cannot run without a level, so
   * an optional list means a typo'd key ships a game with no levels and a boot that is perfectly
   * happy about it — Phase 1's "zero expectations satisfy themselves" failure, rebuilt at a new
   * field. The fixtures were updated instead, which is the change that keeps each of them failing
   * for the reason it was written to test.
   */
  levels: CatalogEntry[];
  /**
   * Character and enemy spritesheets. **Required and non-empty**, for the same reason `levels` is:
   * an optional list is how a typo'd key ships a game whose player has no art and whose boot is
   * perfectly happy about it.
   */
  sheets: SheetEntry[];
}

export const CATALOG_KEY = 'asset-catalog';

/**
 * Validate the catalog's SHAPE before anything is queued. Returns a description of the first
 * problem, or `null` if it is usable.
 *
 * Every rule here exists because the corresponding malformed catalog would otherwise produce a
 * clean boot with assets missing, or a hang:
 *   - not an object / no images / empty list -> zero expectations satisfy themselves trivially
 *   - a null or non-object entry             -> throws while queueing, which hangs boot
 *   - a duplicate key                        -> the loader skips the second, existence still passes
 *   - a Phaser-reserved key                  -> resolves to a real built-in texture with non-zero
 *                                               dimensions, so every check downstream passes
 */
export function describeCatalogProblem(catalog: AssetCatalog | undefined): string | null {
  if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.images)) {
    return 'assets/index.json missing or malformed';
  }
  if (!Array.isArray(catalog.levels)) {
    return 'assets/index.json missing its levels list';
  }
  if (!Array.isArray(catalog.sheets)) {
    return 'assets/index.json missing its sheets list';
  }

  if (catalog.images.length === 0) {
    return 'assets/index.json lists no images';
  }
  if (catalog.levels.length === 0) {
    return 'assets/index.json lists no levels';
  }
  if (catalog.sheets.length === 0) {
    return 'assets/index.json lists no sheets';
  }

  // One namespace, checked once. A level key that collides with a texture key is not a problem
  // Phaser has — the caches are separate — but it is a problem a human reading the catalog has,
  // and `describeLevelProblem` reports by key.
  const seen = new Set<string>();

  for (const [kind, entries] of [
    ['image', catalog.images],
    ['level', catalog.levels],
    ['sheet', catalog.sheets],
  ] as const) {
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') {
        return `contains a non-object ${kind} entry`;
      }
      if (typeof entry.key !== 'string' || entry.key === '') {
        return `contains a ${kind} entry with a missing or empty key`;
      }
      if (typeof entry.url !== 'string' || entry.url === '') {
        return `${kind} entry "${entry.key}" has a missing or empty url`;
      }
      // Only images: the reserved names are TEXTURE keys, and the tilemap cache is a separate
      // namespace where they mean nothing. Applying the rule to levels was stricter than needed
      // and, worse, reported "its file would never be fetched" — which is false for a level and
      // would send whoever hit it looking in the wrong place. Raised by the code-reviewer owner.
      if (kind === 'image' && PHASER_RESERVED_TEXTURE_KEYS.includes(entry.key)) {
        return `entry "${entry.key}" uses a key Phaser reserves; its file would never be fetched`;
      }
      if (seen.has(entry.key)) {
        return `duplicate key "${entry.key}"; the second entry would never be fetched`;
      }
      seen.add(entry.key);

      if (kind === 'sheet') {
        const sheet = entry as SheetEntry;
        // Every one of these is a number the loader hands straight to Phaser without checking.
        // A zero or fractional frame size does not throw; it produces a texture with a nonsense
        // frame count that every existing check passes.
        for (const field of ['frameWidth', 'frameHeight', 'frameCount', 'simTicks'] as const) {
          const value = sheet[field];
          if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
            return `sheet "${entry.key}" has ${field} ${JSON.stringify(value)}; ` +
              `it must be a positive integer`;
          }
        }
        if (typeof sheet.fps !== 'number' || !Number.isFinite(sheet.fps) || sheet.fps <= 0) {
          return `sheet "${entry.key}" has a non-positive or non-finite fps`;
        }
        if (typeof sheet.loop !== 'boolean') {
          return `sheet "${entry.key}" is missing its loop flag; a loop is a CLAIM (vault 4.23)`;
        }
        if (!['sim', 'measured', 'authored'].includes(sheet.derivedFrom)) {
          return `sheet "${entry.key}" has derivedFrom ${JSON.stringify(sheet.derivedFrom)}; ` +
            `provenance must be recorded so an authored rate cannot read as a derived one`;
        }
      }
    }
  }

  return null;
}
