/**
 * Upsert `build-assets.mjs`'s packed-sheet rows into `public/assets/index.json`, in place.
 *
 * Split out of `build-assets.mjs` to keep that file under the 400-line ceiling
 * (`tests/unit/file-size.test.ts`) rather than growing it further — and because "merge one JSON
 * file's array by key" is its own small, testable concern.
 *
 * **Merges, never rewrites wholesale.** The five existing `brass-courier` rows and every non-sheet
 * field (`_comment`, `_sheets`, `images`, `levels`) must survive byte-compatible when a different
 * slug's build runs — a wholesale rewrite would either need to re-derive those rows (data this
 * script does not have) or silently drop them.
 */

import { readFileSync, writeFileSync } from 'node:fs';

/**
 * Read `path`, replace/append each of `rows` into `catalog.sheets` by `key`, write it back.
 *
 * Upsert by key rather than always appending: rebuilding a slug that already has catalog rows
 * (e.g. after a source clip regenerates) must update those rows in place, not duplicate them.
 * Existing rows for keys NOT in `rows` — every other slug's — are left untouched and in their
 * original array position, which is what keeps the courier's five rows byte-identical.
 */
export function upsertCatalogSheets(path, rows) {
  const catalog = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(catalog.sheets)) {
    throw new Error(`upsertCatalogSheets: ${path} has no "sheets" array to merge into`);
  }
  const byKey = new Map(catalog.sheets.map((row, index) => [row.key, index]));
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (existing !== undefined) {
      catalog.sheets[existing] = row;
    } else {
      catalog.sheets.push(row);
      byKey.set(row.key, catalog.sheets.length - 1);
    }
  }
  writeFileSync(path, `${JSON.stringify(catalog, null, 2)}\n`);
}
