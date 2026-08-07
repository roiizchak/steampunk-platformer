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

  if (catalog.images.length === 0) {
    return 'assets/index.json lists no images';
  }
  if (catalog.levels.length === 0) {
    return 'assets/index.json lists no levels';
  }

  // One namespace, checked once. A level key that collides with a texture key is not a problem
  // Phaser has — the caches are separate — but it is a problem a human reading the catalog has,
  // and `describeLevelProblem` reports by key.
  const seen = new Set<string>();

  for (const [kind, entries] of [
    ['image', catalog.images],
    ['level', catalog.levels],
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
    }
  }

  return null;
}
