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
 * `readFile`/`writeFile` are injectable so `tests/unit/lift-profile-write.test.ts` can exercise the
 * merge and its guard on an in-memory store — no real `_generated/`, no temp directories, and (since
 * the test lives under `tests/`, which is `tsconfig`-strict with no `@types/node`) no `node:fs`
 * import in the test file itself. Same pattern as `clipSource.mjs`'s `dirExists`/`listFiles`.
 */

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
 * ## The guard — narrowed, not strengthened, on 2026-08-12 (user decision D2)
 *
 * This used to throw on ANY two scales in one profile (vault A5 read literally: "every animation is
 * packed against ONE scale"). That broke the moment a padded and an unpadded generation of the same
 * character needed to coexist: `brass-courier/attack`'s padded round passed G6 cleanly but packed at
 * 114px against `hurt`'s 288px, because padding changes the subject's size in the output and `scale`
 * was a single per-SLUG number. **Padding is a property of a GENERATION, and so is the scale it
 * implies** — `build-assets.mjs` now resolves `scale` per `(slug, action)`, action override first,
 * slug default otherwise, and tags each with `scaleSource`.
 *
 * **This is a narrowing of the rule, and it is written down as one rather than sold as "stricter".**
 * A multi-scale profile that used to throw unconditionally is now accepted, PROVIDED every entry
 * that disagrees with the rest declares `scaleSource: 'action'` — an exemption a human wrote down in
 * `character-bounds.json`, one line at a time, with the number's provenance in a comment (vault A5's
 * "pasted by hand" requirement is unchanged). The one-scale rule (clause 2 below) still binds every
 * `scaleSource: 'slug'` entry, which is the majority case and everything this project has shipped so
 * far — nothing that used to be rejected by the old rule is silently accepted by the new one.
 *
 * Two things get STRICTER at the same time, closing gaps the old check never had (clauses 1 and 3):
 * every merged entry must declare a real scale and a known source (an action that reaches the packer
 * with no declared number throws, where it previously would have been silently compared against
 * `existing.scale`), and a cross-slug merge — writing one slug's animations into another slug's
 * profile — now throws instead of being silently accepted. Neither existed before this change.
 *
 * **The honest limitation: nothing here detects a MISSING override.** Deleting an action's `scale`
 * override just falls back to the slug default and produces a perfectly valid `scaleSource: 'slug'`
 * entry — indistinguishable, to this guard, from an action that was never given one. The declaration
 * in `character-bounds.json` is the only record; there is no mechanical check that an override that
 * SHOULD exist still does.
 */
export function upsertLiftProfile(
  path,
  { comment, slug, scale, animations },
  { readFile = readFileSync, writeFile = writeFileSync } = {},
) {
  let existing = { animations: {} };
  try {
    existing = JSON.parse(readFile(path, 'utf8'));
  } catch {
    // No profile yet — the first build for this slug writes one. Absence is legitimate.
  }

  // Clause 3 — a cross-slug merge, unchecked before this change and impossible to trigger today.
  // Writing one slug's animations into another slug's profile file would otherwise be silently
  // accepted, mixing scales and source coordinates that share nothing.
  if (existing.slug !== undefined && existing.slug !== slug) {
    throw new Error(
      `upsertLiftProfile: ${path} is "${existing.slug}"'s profile but this build is writing ` +
        `"${slug}" into it. A cross-slug merge would mix source coordinates and scales that share ` +
        `nothing — pass the correct LIFT_PROFILE path for "${slug}" (slugConfig.mjs).`,
    );
  }

  const mergedAnimations = { ...(existing.animations ?? {}), ...animations };

  // Clause 1 — every merged entry (not just this run's) has a real scale and a known source. An
  // action that reached the packer with no declared number throws here rather than being compared
  // against a root value that may not even describe it.
  for (const [action, anim] of Object.entries(mergedAnimations)) {
    if (!(anim.scale > 0) || !Number.isFinite(anim.scale)) {
      throw new Error(
        `upsertLiftProfile: ${path}'s "${action}" entry has no valid scale (got ${anim.scale}). ` +
          `Every merged animation must declare a finite scale > 0.`,
      );
    }
    if (anim.scaleSource !== 'action' && anim.scaleSource !== 'slug') {
      throw new Error(
        `upsertLiftProfile: ${path}'s "${action}" entry has scaleSource "${anim.scaleSource}" — ` +
          `must be "action" or "slug" so the one-scale rule below knows which entries it binds.`,
      );
    }
  }

  // Clause 2 — vault A5, NARROWED (see header): only entries sourced from the slug default must
  // agree with each other. An action-sourced override is exempt by construction — that exemption
  // IS the decision this change makes, not a gap in the check.
  const slugSourced = Object.entries(mergedAnimations).filter(([, a]) => a.scaleSource === 'slug');
  const slugScales = new Set(slugSourced.map(([, a]) => a.scale));
  if (slugScales.size > 1) {
    const detail = slugSourced.map(([action, a]) => `${action}=${a.scale}`).join(', ');
    throw new Error(
      `upsertLiftProfile: ${path}'s slug-sourced entries disagree on scale (${detail}). Every ` +
        `animation using the SLUG default must be packed against the same number (vault A5) — ` +
        `re-pack every slug-default action for "${slug}" in one run, or give the drifted one its ` +
        `own declared "scale" override if it is meant to differ.`,
    );
  }

  const merged = {
    _comment: comment,
    slug,
    scale,
    animations: mergedAnimations,
  };
  writeFile(path, `${JSON.stringify(merged, null, 2)}\n`);
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
