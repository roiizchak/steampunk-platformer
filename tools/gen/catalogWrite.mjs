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
/**
 * The same merge, for `lift-profile-<slug>.json`'s `animations` map.
 *
 * **This existed as a wholesale rewrite and destroyed data the first time a per-action build ran.**
 * `build-assets.mjs` accumulates `liftProfile` for the actions in THIS run and wrote the file as
 * `{ _comment, slug, scale, animations }` — so `assets:build brass-courier hurt` replaced an
 * `animations` map holding `idle, walk, run, jump, fall` with one holding only `hurt`, silently.
 * The lift profile is TRACKED and is the independent oracle for criterion 4.19, so that is real data
 * loss, and it was found by `tests/unit/sheet-packing.test.ts` failing on a missing `run` key rather
 * than by anything watching the write.
 *
 * Per-action builds are not a misuse — they are what the extraction pipeline requires, because
 * `assets:clips` stops at the first failing action and a complete picture needs one run per action.
 * So the writer has to merge, exactly as `upsertCatalogSheets` above already does for the catalog.
 *
 * `scale` and `slug` are per-SLUG and identical across runs of the same slug; a mismatch means the
 * config changed mid-sequence and the existing entries were packed against a different number, which
 * is a throw rather than a merge (vault A5 — every animation is packed against one scale).
 */
export function upsertLiftProfile(path, { comment, slug, scale, animations }) {
  let existing = { animations: {} };
  try {
    existing = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    // No profile yet — the first build for this slug writes one. Absence is legitimate.
  }
  if (existing.scale !== undefined && existing.scale !== scale) {
    throw new Error(
      `upsertLiftProfile: ${path} was written at scale ${existing.scale} but this build is packing ` +
        `at ${scale}. Every animation must be packed against ONE scale (vault A5) — re-pack every ` +
        `action for "${slug}" in a single run rather than merging two scales into one profile.`,
    );
  }
  const merged = {
    _comment: comment,
    slug,
    scale,
    animations: { ...(existing.animations ?? {}), ...animations },
  };
  writeFileSync(path, `${JSON.stringify(merged, null, 2)}\n`);
}

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
