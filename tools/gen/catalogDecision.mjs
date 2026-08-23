/**
 * What happens to a catalog row when a sheet is rebuilt — the decision, extracted so it can be
 * tested and so it can go red.
 *
 * ## The hole this closes
 *
 * `build-assets.mjs` used to write a row inside `if (hasCatalogTiming(slug, action))` **with no
 * `else`**, and `upsertCatalogSheets` deliberately leaves keys it was not handed untouched. Put
 * those two together and a sheet rebuilt with **no timing rule keeps shipping its previous catalog
 * row** — a row describing frame counts and dimensions the PNG on disk no longer has. Silently.
 *
 * That is not hypothetical. It bit `brass-courier/idle` in play, and the Codex plan review (finding
 * 2) found the first proposed fix — logging a warning — insufficient for exactly this reason: the
 * stale row still ships, and a log line in a build that prints thirty of them is not a gate.
 *
 * A rebuilt sheet with no timing rule and an existing row now **fails the build**. That is the only
 * safe answer: the two other candidates are worse. Writing a row means inventing a timing, which is
 * the thing `timingFor` throws rather than do. Deleting the row silently removes an animation the
 * game is currently registering, which turns a data problem into a missing-texture problem at
 * runtime.
 *
 * ## And why the obvious dimension check was worthless
 *
 * The plan's first version compared the row's `frameWidth × frameCount` against the dimensions
 * `sheetsPack.mjs` had just constructed **from those same numbers** — tautological, and
 * `sheet-packing.test.ts` already asserts the packer's own arithmetic (Codex finding 4). A check
 * that reads its expectation from the thing it is checking cannot fail.
 *
 * `validateCatalogRows` takes a **`measure` function** instead, so the caller supplies dimensions
 * from an independent source — the production caller decodes the PNG bytes off disk, and a test
 * supplies a deliberately inconsistent object. That is what makes it a gate rather than a
 * restatement.
 */

/**
 * Decide what to do about `(slug, action)`'s catalog row, given that its sheet was just rebuilt.
 *
 * Pure: every input is passed in, nothing is read from disk or from a module-level table. `hasTiming`
 * and `hasExistingRow` are predicates so the caller keeps ownership of where those facts come from.
 *
 * Returns `'write'` or `'skip'`; throws on the stale-row case.
 */
export function decideCatalogRow({ slug, action, hasTiming, hasExistingRow }) {
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('decideCatalogRow: slug is required');
  }
  if (typeof action !== 'string' || action.length === 0) {
    throw new Error('decideCatalogRow: action is required');
  }

  if (hasTiming) {
    return 'write';
  }

  if (hasExistingRow) {
    throw new Error(
      `catalog: "${slug}/${action}" was rebuilt but has no timing rule, and public/assets/index.json ` +
        `already carries a "${slug}-${action}" row. That row describes the PREVIOUS sheet and would ` +
        'ship unchanged, because upsertCatalogSheets only touches keys it is handed. Add a rule to ' +
        'catalogTimings.mjs (FIXED_TIMINGS for a windowed animation, AUTHORED_LOOPS plus an ' +
        `animations.${action}.fps in the slug's bounds file for a loop), or delete the stale row ` +
        'deliberately. This is the defect that shipped brass-courier/idle.',
    );
  }

  // No rule and no row: nothing can go stale, and this is the ordinary case for an action that is
  // packed for inspection but not yet catalogued. Per-(slug, action), never per-slug — brass-courier
  // has timings for only some of its actions, and gating on the slug would throw PARTWAY through a
  // build, after earlier actions had already written their sheets.
  return 'skip';
}

/**
 * Refuse to write rows that disagree with the sheets they describe.
 *
 * `measure(row)` returns `{ width, height }` for the PNG the row points at, **from a source
 * independent of the row itself**, and may return `null`/`undefined` for a file it cannot read —
 * which is itself a failure, since a row pointing at a sheet that is not there is exactly what this
 * runs before a write to prevent.
 *
 * Throws on the first disagreement rather than collecting: a mismatch here means the packer and the
 * catalog have diverged, and every later row is suspect for the same reason.
 */
export function validateCatalogRows(rows, measure) {
  if (typeof measure !== 'function') {
    throw new Error('validateCatalogRows: measure must be a function');
  }

  for (const row of rows) {
    const actual = measure(row);
    if (!actual || !Number.isFinite(actual.width) || !Number.isFinite(actual.height)) {
      throw new Error(
        `catalog: could not measure the sheet "${row.key}" points at (${row.url}). A row whose ` +
          'PNG cannot be read must never reach index.json — the game fetches that url.',
      );
    }

    const expectedWidth = row.frameWidth * row.frameCount;
    if (actual.width !== expectedWidth) {
      throw new Error(
        `catalog: "${row.key}" declares ${row.frameCount} frames of ${row.frameWidth}px ` +
          `(${expectedWidth}px total) but ${row.url} is ${actual.width}px wide. Phaser slices the ` +
          'sheet by these numbers, so a row that disagrees with its own PNG draws sliced garbage.',
      );
    }
    if (actual.height !== row.frameHeight) {
      throw new Error(
        `catalog: "${row.key}" declares ${row.frameHeight}px frames but ${row.url} is ` +
          `${actual.height}px tall.`,
      );
    }
  }

  return rows;
}

/**
 * The per-action rows the build emits — the sheet report and the lift profile entry.
 *
 * Extracted from `build-assets.mjs` for the reason vault 5.12 gives and criterion 5.12 gates: that
 * file was **406 lines against a 400-line rule** before this session added the catalog decision to
 * it, and `file-size.test.ts` was green only because it tolerates ten named offenders. Adding to a
 * file already over the limit is how a ceiling stops meaning anything.
 *
 * These are pure shape functions with no I/O and no gate logic of their own. They are here rather
 * than in a third module because they are consumed by exactly one caller alongside the catalog
 * decision, and a module per object literal is the relocation-not-simplification trap finding T9
 * already recorded against the Phase 5 splits.
 */

/** One row of `_generated/sheet-report-<slug>.json`. */
export function sheetReportRow({
  slug,
  action,
  frameWidth,
  frameHeight,
  frameCount,
  loop,
  key,
  agreement,
  tallest,
  widest,
  verdicts,
  summary,
}) {
  return {
    action,
    key: `${slug}-${action}`,
    url: `assets/characters/${slug}/sheets/${action}.png`,
    frameWidth,
    frameHeight,
    frameCount,
    loop,
    measuredKey: key,
    borderAgreement: Number(agreement.toFixed(4)),
    tallest,
    widest,
    gates: Object.fromEntries(
      Object.entries(verdicts).map(([name, verdict]) => [name, `${verdict.status}: ${verdict.reason}`]),
    ),
    summary,
  };
}

/**
 * One animation's entry in `lift-profile-<slug>.json`.
 *
 * Every per-frame number is carried, not just the lift: the profile is committed precisely so a bad
 * regeneration is reviewable in a diff, and a summary cannot show which frame moved.
 */
export function liftProfileEntry({ anchor, scale, scaleSource, deepestSourceY, frames }) {
  return {
    anchor,
    scale,
    scaleSource,
    deepestSourceY,
    frames: frames.map((f) => ({
      index: f.index,
      sourceMinY: f.sourceMinY,
      sourceMaxY: f.sourceMaxY,
      /**
       * ⚠️ **Written at FULL precision on purpose** — inventory 5.15, `phase-04-impl.md:11`,
       * recorded there as *"the centroid oracle rounds to three decimals before an exact
       * assertion, so a future centroid near a half-pixel boundary could produce a false red"*,
       * and accepted as a real latent defect in the safe direction.
       *
       * This read `Number(f.sourceCentroidY.toFixed(3))`. The packer computes `liftPx` from the
       * FULL-precision centroid; `sheet-packing-lift-profile.test.ts` re-derives it from whatever
       * this writes and compares the two `Math.round`s for exact equality. Any precision dropped
       * here is therefore injected straight into a rounding comparison the packer never made, and
       * a value landing within it of a `.5` boundary reds a correct sheet.
       *
       * Measured 2026-08-23 on the shipped art: the closest centroid frame (`jump` 4) sits
       * **0.0208** from a boundary against a **0.0003** injected error — 69x headroom, so it was
       * latent rather than live. Writing the real number removes the envelope instead of betting
       * on it, and `sheet-packing-lift-profile.test.ts` now gates the margin directly.
       *
       * Three decimals bought readable JSON. A readable diff is not worth a gate that can red on
       * correct art.
       */
      sourceCentroidY: f.sourceCentroidY,
      drawnHeight: f.drawnHeight,
      liftPx: f.liftPx,
    })),
  };
}
