/**
 * **The wiring criterion 4.27 was missing.** Every path that reads an anchor runs this first.
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
 * ## 🔴 Where this was wired, and why that was the wrong end of the pipeline
 *
 * It went on the `assets:build` npm script. Both criterion 10.11 gate owners found the same three
 * holes in that, and each is a different way a gate can be present and useless (brief A finding 2,
 * brief B finding 3):
 *
 *   1. **`assets:build:all` bypassed it entirely.** `build-assets-all.mjs` spawns
 *      `build-assets.mjs` **directly**, not through npm — so the multi-slug path, which exists
 *      precisely because *"the command nobody runs is the only one that prints it"*, ran zero
 *      anchors. The new gate had been re-created in the exact shape that made 4.27 open.
 *   2. **`assets:build` PACKS SHEETS — the money is already spent by then.** 4.27's own text is
 *      *"measured before generating from it"*, and `docs/prd/phase-05-combat.md` is explicit that it
 *      must land *"before the combat/enemy sheets are generated, not after"*. A gate at pack time
 *      cannot prevent the ~$7 defect it exists to prevent.
 *   3. **`assets:clips` reads anchors too** and was unwired.
 *
 * So the audit lives in `auditOrThrow()` and the CALLERS invoke it: `build-assets.mjs` itself (which
 * covers `assets:build`, `assets:build:all` and a bare `node tools/gen/build-assets.mjs` alike), and
 * `submit-clips.mjs`, the script that renders the command a human pays for. Wiring a gate to a
 * SCRIPT NAME is wiring it to a habit; wiring it to the MODULE THAT READS THE INPUT is wiring it to
 * the pipeline.
 *
 * ## ABSENT is fatal once the pipeline exists, and only then
 *
 * `_generated/` is gitignored, so on a fresh clone every anchor is missing. That used to make the
 * audit print `0 PASS, 0 FAIL, 4 ABSENT` and **exit 0** — one person's out-of-band measurement
 * wearing a gate's clothes, i.e. the original 4.27 defect exactly (brief A finding 4, brief B
 * finding 5). The empty-declaration-list guard did not help: that list is a compile-time constant
 * and can never be empty in practice, so it guarded the case that never happens.
 *
 * The discriminator is `_generated/` itself. Absent → there is no pipeline on this machine, nothing
 * can be generated, and the audit reports and stands aside. Present → an anchor that is not on disk
 * is a real gap, and it is fatal.
 *
 * The other fatal case is an **empty declaration list**, kept for what it is: a vacuity guard on the
 * table rather than on the measurement.
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

/** Where generated art lands. Its existence is what turns ABSENT from context into a defect. */
export const GENERATED_ROOT = '_generated';

/**
 * Run the audit and THROW rather than report. This is the entry point every anchor-reading script
 * calls; the CLI below is a thin wrapper around it.
 *
 * `sources` and `generatedRoot` are injectable for ONE reason: the ABSENT rule below is otherwise
 * unreachable from a test, because on any machine with the pipeline every declared anchor is
 * present and on any machine without it none are. A rule nobody can watch fire is decoration
 * *(vault C1, C2)*, and this rule's whole job is to stop a vacuous exit 0.
 *
 * `requirePresent` makes ABSENT fatal REGARDLESS of `generatedRoot`. The spend point needs it: on a
 * clean clone `_generated/` does not exist yet — `submit-clips.mjs` CREATES it moments later — so the
 * `generatedRoot` heuristic said "no pipeline here, stand aside" on the one path where standing
 * aside means printing a paid generation command having measured **zero** submitted bytes. Found by
 * the Codex implementation review, and the comment at the call site had asserted the opposite:
 * *"`requirePresent` is implicit: if `_generated/` exists at all (and it must, for anchors to be
 * submitted)"*. It must not, and it did not.
 *
 * @param {{ label?: string, generatedRoot?: string, sources?: string[], requirePresent?: boolean }} [opts]
 * @returns {{ path: string, status: string, detail: string }[]}
 */
export function auditOrThrow(opts = {}) {
  const label = opts.label ?? 'anchor audit';
  const generatedRoot = opts.generatedRoot ?? GENERATED_ROOT;

  const sources = opts.sources ?? declaredAnchorSources();
  if (sources.length === 0) {
    throw new Error(
      label +
        ': PADDED_ANCHORS declares no anchor sources. This would pass having measured nothing — ' +
        'refusing rather than reporting a vacuous green.',
    );
  }

  const rows = auditAnchors(sources);
  for (const row of rows) console.log(row.status + '\t' + row.path + '\t' + row.detail);

  const failed = rows.filter((r) => r.status === FAIL);
  const absent = rows.filter((r) => r.status === 'ABSENT');
  const passed = rows.filter((r) => r.status === PASS);
  const indeterminate = rows.length - passed.length - failed.length - absent.length;
  console.log(
    label +
      ' (G1): ' +
      passed.length +
      ' PASS, ' +
      failed.length +
      ' FAIL, ' +
      absent.length +
      ' ABSENT, ' +
      indeterminate +
      ' INDETERMINATE of ' +
      rows.length +
      ' declared',
  );

  if (failed.length > 0) {
    throw new Error(
      label +
        ': ' +
        failed.length +
        ' anchor(s) FAILED G1 (contact geometry):\n' +
        failed.map((r) => '  - ' + r.path + ': ' + r.detail).join('\n') +
        '\n\nOne boot drawn above the other in the anchor is measured into every frame generated ' +
        'from it. Re-pad the anchor; do not proceed.',
    );
  }

  if (absent.length > 0 && (opts.requirePresent === true || existsSync(generatedRoot))) {
    throw new Error(
      label +
        ': ' +
        absent.length +
        ' declared anchor(s) are not on disk:\n' +
        absent.map((r) => '  - ' + r.path).join('\n') +
        '\n\nRunning on would gate nothing.',
    );
  }

  return rows;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    auditOrThrow();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
