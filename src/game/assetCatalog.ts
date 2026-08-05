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

  if (catalog.images.length === 0) {
    return 'assets/index.json lists no images';
  }

  const seen = new Set<string>();

  for (const entry of catalog.images) {
    if (!entry || typeof entry !== 'object') {
      return 'contains a non-object entry';
    }
    if (typeof entry.key !== 'string' || entry.key === '') {
      return 'contains an entry with a missing or empty key';
    }
    if (typeof entry.url !== 'string' || entry.url === '') {
      return `entry "${entry.key}" has a missing or empty url`;
    }
    if (PHASER_RESERVED_TEXTURE_KEYS.includes(entry.key)) {
      return `entry "${entry.key}" uses a key Phaser reserves; its file would never be fetched`;
    }
    if (seen.has(entry.key)) {
      return `duplicate key "${entry.key}"; the second entry would never be fetched`;
    }
    seen.add(entry.key);
  }

  return null;
}
