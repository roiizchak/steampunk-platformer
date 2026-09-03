import { describe, expect, it } from 'vitest';

import { lineCount, repoPath } from './fileLines';

/**
 * The 500-line rule for DOCUMENTATION — added 2026-09-03.
 *
 * ## Why this did not exist until now
 *
 * `tests/unit/file-size.test.ts` has held source to 400 lines since Phase 4. Prose was never held
 * to anything, and nothing in the suite could see it: `docs/qa/phase-09-polish.md` reached **2126**
 * lines, `session-bugfix-tiers.md` 1617, `phase-12-touch.md` 1603, and `HANDOFF.md` — the document
 * CLAUDE.md tells you to read FIRST when resuming — 1477. Ten files were over 500 on the day this
 * test was written.
 *
 * The cost is not correctness, it is that a document nobody can scan stops being read. This
 * project's documents are where its paid-for lessons live, and CLAUDE.md's own §6 already says a
 * long log "splits into flat siblings". That was a rule with nothing watching it, which this
 * project's own history says is the same as an intention.
 *
 * ## Why there is no `SIZE-EXEMPTION` escape hatch here
 *
 * The exemption citations that let a source file exceed 400 lines live in `docs/qa/*.md`. A
 * document exempting itself would be a file citing its own text — self-granted, and proving
 * nothing. So this is a hard ceiling with no citation path: split the file.
 *
 * The split convention is published in CLAUDE.md §6 and `docs/QA-LOG.md`, and it is not a matter of
 * taste. Children are **flat siblings in the same directory** (`phase-05-combat-01-timings.md`),
 * never a subdirectory, because `file-size.test.ts` globs `docs/qa/*.md` NON-recursively to find
 * the source exemptions — a subdirectory silently un-records everything inside it.
 *
 * ## Three things a splitter must not break, each of which is a different test going red
 *
 *  1. A **done** phase's QA log is sliced by `docs-contract.test.ts` between its phase heading and
 *     its vault-out heading; the single `<!-- gate-verdicts -->` table and one row per criterion
 *     must stay in that window. Everything else in the window may move.
 *  2. `docs/qa/phase-04-art.md` is that test's regression case for a slice carrying TWO legitimate
 *     criterion tables. The first attempt at the 2026-09-03 split moved one of them out and the
 *     test said so: *"4.2b should appear twice in the SECTION: expected 0 to be greater than 1"*.
 *  3. Index prose in a parent must not quote a slice marker verbatim. `between()` takes the FIRST
 *     `indexOf` of its start marker, so a sentence explaining the rule, placed above the heading it
 *     names, silently becomes the slice boundary.
 *
 * ## What this does NOT do
 *
 * The warning on the source rule applies here twice over: **deleting explanation to hit the number
 * makes the repository worse and this test cannot tell.** The pass that brought ten files under the
 * line moved whole sections verbatim and proved it — every non-blank line of every original file
 * was shown to still exist somewhere afterwards, by `comm -23` over the sorted before/after sets,
 * per file. That is the standard, not the line count.
 *
 * ## Its red proof is a mutation, not a fixture
 *
 * There is no `citationProblem`-style classifier to give committed fixtures — the rule is one
 * comparison. So the evidence that it can go red is the mutation recorded in `docs/QA-LOG.md`:
 * append lines to a real document, watch the named file appear in the failure, revert, watch the
 * count return *(C1, C12)*.
 */
const DOCS = import.meta.glob(['../../docs/**/*.md', '../../*.md'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const DOCS_LIMIT = 500;

describe('the 500-line rule for documentation', () => {
  it('finds the documents at all — a sweep that selected nothing passes vacuously', () => {
    // Detect greenness POSITIVELY, count included. An empty or half-empty glob makes the assertion
    // below trivially true and is indistinguishable from a clean pass unless the count is read.
    // There were 231 markdown files on the day this was written; 150 is a floor, not a pin.
    expect(Object.keys(DOCS).length).toBeGreaterThan(150);
  });

  it('every document is under the limit — split it, do not delete prose to fit', () => {
    const over = Object.entries(DOCS)
      .map(([key, text]) => ({ path: repoPath(key), lines: lineCount(text) }))
      .filter((f) => f.lines > DOCS_LIMIT)
      .sort((a, b) => b.lines - a.lines)
      .map((f) => `${f.path} (${f.lines} lines)`);

    expect(
      over,
      `over ${DOCS_LIMIT} lines. Split at a section boundary into FLAT siblings in the same ` +
        'directory (`<slug>-NN-<topic>.md`, never a subdirectory), leave an index table in the ' +
        'parent and a breadcrumb line in the child, and verify nothing was lost line by line. ' +
        'See CLAUDE.md §6, docs/QA-LOG.md, and this file\'s header for what a split must not break.',
    ).toEqual([]);
  });
});
