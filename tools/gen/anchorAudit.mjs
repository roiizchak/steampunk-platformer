/**
 * **The wiring criterion 4.27 was missing.** `npm run assets:build` runs this first.
 *
 * ## What was actually open
 *
 * PRD.md's Phase 4 row read *"needs a pre-generation anchor gate"* until 2026-08-25, and that had
 * been false for a session: `anchorGate.mjs` (**G1 — anchor contact geometry**) was written in
 * Phase 5, it names 4.27 in its own header, and it caught a real defect on the first new art it
 * saw. What was missing was that **nothing re-ran it**. It was a standalone CLI that `sheetGates.mjs`
 * mentioned in a comment and no `assets:*` script invoked, so its verdicts were one person's
 * out-of-band measurement rather than a property of the pipeline.
 *
 * A gate nobody runs is a gate that cannot go red *(vault C2)*, and the defect it exists to catch —
 * one boot drawn above the other in the anchor every later frame is measured against — cost roughly
 * **$7** of re-shot clips and was found by eye, after the spend.
 *
 * So: `assets:build` runs this, this runs G1 over every anchor the project DECLARES, and a FAIL
 * stops the build before a byte of sheet is packed.
 *
 * ## Where the list of anchors comes from, and why not a directory listing
 *
 * `PADDED_ANCHORS` in `clipAnchors.mjs` — the same table that carries the fal URL and the sha256 for
 * each one, i.e. the project's record of *which bytes were submitted*. Globbing
 * `_generated/anchors-padded/*.png` instead would audit whatever happens to be on the disk, which
 * is the failure `clipAnchors.mjs`'s header describes twice: a decision inferred from a directory
 * listing, and a URL that lived only in a gitignored job file. **Audit what is declared.**
 *
 * ## ABSENT is a reported verdict, not a pass and not a failure
 *
 * `_generated/` is gitignored, so on a fresh clone every anchor is missing — and so is
 * `_generated/sheets/`, which `build-assets.mjs` refuses on two lines later. Making absence fatal
 * here would move that refusal to a worse message; making it silent would let a build claim the
 * anchors were gated when nothing was read. It prints `ABSENT` per anchor and says how many.
 *
 * The one thing that IS fatal besides a FAIL is an **empty declaration list** — that is the vacuity
 * case, where this script would exit 0 having measured nothing at all.
 *
 * ⚠️ G1's own blind spot carries through: it measures an opaque mask in a ground band and cannot
 * tell a sheared limb from a discharge. `INDETERMINATE` (limbs merged at this resolution) is a real
 * verdict *(vault 4.18)* and is neither converted to a pass nor treated as a failure here.
 *
 * CLI: `node tools/gen/anchorAudit.mjs`. Exits 1 on any FAIL.
 */

import { existsSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

import { gateContactGeometry } from './anchorGate.mjs';
import { PADDED_ANCHORS } from './clipAnchors.mjs';
import { FAIL, PASS } from './gates.mjs';

/** Every distinct local anchor path the project declares, sorted. Deduped: clips share anchors. */
export function declaredAnchorSources() {
  return [...new Set(Object.values(PADDED_ANCHORS).map((a) => a.source))].sort();
}

/**
 * Run G1 over `paths`, returning one row each. A missing file is `ABSENT` with no verdict — see the
 * header; it is deliberately not folded into either column.
 */
export function auditAnchors(paths) {
  return paths.map((path) => {
    if (!existsSync(path)) return { path, status: 'ABSENT', detail: 'not on disk' };
    const result = gateContactGeometry(readFileSync(path));
    return { path, status: result.status, detail: result.reason };
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const sources = declaredAnchorSources();
  if (sources.length === 0) {
    console.error(
      'anchor audit: PADDED_ANCHORS declares no anchor sources. This script would exit 0 having ' +
        'measured nothing — refusing rather than reporting a vacuous pass.',
    );
    process.exit(1);
  }
  const rows = auditAnchors(sources);
  for (const row of rows) console.log(`${row.status}\t${row.path}\t${row.detail}`);

  const failed = rows.filter((r) => r.status === FAIL);
  const absent = rows.filter((r) => r.status === 'ABSENT');
  const passed = rows.filter((r) => r.status === PASS);
  console.log(
    `anchor audit (G1): ${passed.length} PASS, ${failed.length} FAIL, ${absent.length} ABSENT, ` +
      `${rows.length - passed.length - failed.length - absent.length} INDETERMINATE ` +
      `of ${rows.length} declared`,
  );
  if (failed.length > 0) process.exit(1);
}
