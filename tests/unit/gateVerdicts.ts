/**
 * The parser behind *"a phase marked done is evidenced criterion-by-criterion in its QA log"* —
 * `docs-contract.test.ts`'s cross-document check. **No assertions live here**; they live in
 * `gate-verdicts.test.ts` (the rule's own red-proofs) and in `docs-contract.test.ts` (the real
 * documents). The seam is the one `sourceScan.ts` already establishes: this is *how a log is read*,
 * not *what is claimed about it*.
 *
 * Split out when `docs-contract.test.ts` crossed the 400-line rule.
 *
 * ## Why a DESIGNATED table, and not the whole section
 *
 * The check used to be `/^\| 9\.2 \|/m.test(section)` — satisfied by **any** such row anywhere in
 * the phase's slice of its log. A long log accumulates later tables that also key on criterion
 * numbers, and any one of them silently discharged the requirement. Phase 9's own close-round
 * verdict table was one, and the only thing preventing it was that its rows are **bolded**
 * (`| **9.1** |`) and so missed by the regex. That is a gate protected by Markdown emphasis:
 * remove the asterisks and the bypass is back, with nothing to say so.
 *
 * 🔴 **"Exactly one row in the slice" is NOT the repair, and the Codex plan review is why.** A
 * second table keyed on criterion numbers is a legitimate shape, not a defect:
 * `docs/qa/phase-04-art.md` carries a criterion-verdict table AND a later summary table, giving
 * 4.2b, 4.16 and 4.27 two unbolded rows each. Counting across the whole slice would call that an
 * error. Phase 4 escapes the check only because the PRD's `✅` filter excludes it — it reads
 * `⚠️ merged with known debt` — which is luck, not design, and `docs-contract.test.ts` keeps a
 * regression test over Phase 4's real log for exactly that reason.
 *
 * So the table is designated **explicitly**. The logs share no table header to key on — they run
 * from `| # | Criterion | Result |` through `| # | Verdict | Evidence |` to
 * `| # | verdict | the evidence that decides it |` — so a marker was added rather than a heuristic
 * guessed. "The first table with a criterion row" would work today and is exactly the kind of rule
 * that silently picks the wrong table later.
 */

/** The marker that designates a QA log's criterion-verdict table. Invisible when rendered. */
export const GATE_VERDICTS = '<!-- gate-verdicts -->';

/**
 * The designated table's text, or `null` if the log does not designate one.
 *
 * Takes the contiguous run of `|`-leading lines that follows the marker, so later tables in the
 * same section — summaries, close-round verdicts, triage — are outside it by construction.
 */
export function gateVerdictTable(section: string): string | null {
  // 🔴 **The marker must be UNIQUE, and this is the exact bug class the project already paid
  // for once.** `docs/qa/phase-09-polish.md` records `between()`'s start/end markers being fooled by
  // an earlier prose mention, and the fix there — splitting the marker text in surrounding prose —
  // was never generalised to this one. A first-occurrence `indexOf` with a documentation-style
  // mention above the real table silently validates a placeholder and never reads the failing rows
  // below it. Found by the 2026-08-25 adversarial gate brief; a second occurrence is now LOUD rather
  // than silently preferred.
  const first = section.indexOf(GATE_VERDICTS);
  if (first < 0) return null;
  if (section.indexOf(GATE_VERDICTS, first + GATE_VERDICTS.length) >= 0) {
    throw new Error(
      `the ${GATE_VERDICTS} marker appears more than once. The first occurrence wins silently, so a ` +
        'prose mention above the real table would designate the wrong rows. Split the marker text ' +
        'in the prose, as the `between()` markers already are.',
    );
  }
  const at = first;
  const after = section.slice(at + GATE_VERDICTS.length).split('\n');
  const rows: string[] = [];
  let started = false;
  for (const line of after) {
    if (line.trimStart().startsWith('|')) {
      started = true;
      rows.push(line);
    } else if (started) {
      break; // The first non-row line after the table has begun ends it.
    }
  }
  return rows.length === 0 ? null : rows.join('\n');
}

/**
 * The gaps in one phase log's designated table: a criterion with no row, or with more than one.
 *
 * A function rather than a loop inlined into the test, so the red-proofs drive **this**, the
 * production path, rather than a re-implementation of it. A red-proof of a copy proves the copy —
 * which is how the tween scan's committed C2 fixture passed while the real scan missed the
 * violation it named.
 */
/**
 * Escape a criterion id for use in a regex. 🔴 `.replace('.', …)` was NOT global, so only the
 * FIRST dot of a multi-dot id was escaped and `9.2.1` would have matched `9X2.1`. Latent today —
 * every id on this tree has one dot — and repaired rather than left as a trap (2026-08-25 brief).
 */
const escapeId = (id: string): string => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function criterionRowGaps(section: string, ids: readonly string[], label: string): string[] {
  // 🔴 **An empty `ids` makes every loop below vacuous, so it is a FAILURE, not a pass.** The
  // ids come from parsing the PRD's gate table; a parse that returns nothing is a broken parse, and
  // this function returning `[]` for it reads exactly like a clean phase. It was masked only by a
  // sibling test asserting `gateRows(phase).length > 0` — a coupling, not a guarantee, and it
  // disappears the moment someone narrows a run with `-t`. Found by the 2026-08-25 adversarial brief.
  if (ids.length === 0) {
    return [`${label}: no criterion ids were parsed out of the PRD gate table — nothing was checked`];
  }
  const table = gateVerdictTable(section);
  if (table === null) return [`${label} has no ${GATE_VERDICTS} marker — the designated table is unfindable`];
  const gaps: string[] = [];
  for (const id of ids) {
    const hits = table.match(new RegExp(`^\\|\\s*${escapeId(id)}\\s*\\|`, 'gm'))?.length ?? 0;
    // Exactly one, IN THE DESIGNATED TABLE. Zero is the missing row this check has always caught;
    // two is a duplicate verdict for one criterion, previously indistinguishable from one.
    if (hits !== 1) gaps.push(`${label} criterion ${id}: ${hits} rows in the gate-verdicts table, expected 1`);
  }
  return gaps;
}
