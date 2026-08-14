import { describe, expect, it } from 'vitest';

/**
 * The 400-line rule, mechanised — criterion X.16 in every phase.
 *
 * ## Why this did not exist until now
 *
 * Phase 3 recorded leaving it unmechanised as a deliberate choice: the rule permits a *written
 * justification in the phase's QA log*, and a line-count test cannot read prose. That reasoning is
 * sound and the outcome was not. With nothing watching, **ten** files crossed 400 lines across two
 * phases, and nobody noticed until a gate owner ran `wc -l` by hand during the Phase 4 gate.
 *
 * So the test does what a test can: it counts lines, and it accepts a file only if the QA logs
 * NAME it. That is not the same as reading the justification — a log could name a file and say
 * nothing useful — but it converts "somebody should have noticed" into "the suite is red until
 * somebody writes it down", which is the whole difference between a rule and an intention.
 *
 * ## What it deliberately does NOT do
 *
 * It does not measure complexity, and a line count never will. The adversarial gate-owner brief
 * listed the ways it is gameable and they are all real: splitting a file into a `-helpers` module
 * only one file imports, deleting the docstrings that carry this project's institutional knowledge,
 * or writing 200-character lines. **Deleting explanation to hit the number is the failure mode this
 * project should fear most**, because those comments are where the paid-for lessons live. If you
 * are under the limit because you deleted a docstring, you have made the codebase worse and this
 * test cannot tell.
 */

const SOURCES = import.meta.glob(['../../src/**/*.ts', '../../tools/**/*.mjs', '../../tests/**/*.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const QA_LOGS = import.meta.glob('../../docs/qa/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const LIMIT = 400;

/**
 * A glob key -> the repo-relative path a QA log would cite.
 *
 * 🔴 **This used to be `globKey.replace(/^\.\.\/\.\.\//, '')`, and that was wrong for two of the
 * three globs.** Vite normalises a key against the importing file's own directory, which is
 * `tests/unit/`. `../../src/...` survives as `src/...` — but everything under `tests/` comes back as
 * `../e2e/phase-05-perf.spec.ts` or `./enemy-ai.test.ts`, neither of which starts with `../../`, so
 * `repoPath` returned a string no log could ever contain. **The path half of the acceptance check
 * was dead for every test file**, leaving only the basename fallback, which is why a 648-line file
 * was "recorded" by an unrelated citation. Found by the criterion 5.12 gate owner.
 *
 * Resolved properly against the base directory instead of string-stripped, so a fourth glob cannot
 * quietly fall into the same hole.
 */
const BASE_DIR = 'tests/unit';

function repoPath(globKey: string): string {
  const parts = BASE_DIR.split('/');
  for (const segment of globKey.split('/')) {
    if (segment === '.' || segment === '') continue;
    if (segment === '..') parts.pop();
    else parts.push(segment);
  }
  return parts.join('/');
}

function lineCount(text: string): number {
  // Trailing newline does not make a final empty line, matching `wc -l`'s count of terminators.
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length;
}

describe('the 400-line rule', () => {
  const allLogs = Object.values(QA_LOGS).join('\n');

  it('finds the sources and the QA logs at all — an empty sweep proves nothing', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(30);
    expect(Object.keys(QA_LOGS).length).toBeGreaterThan(0);
  });

  it('every file over the limit is named in a QA log', () => {
    const over = Object.entries(SOURCES)
      .map(([key, text]) => ({ path: repoPath(key), lines: lineCount(text) }))
      .filter((f) => f.lines > LIMIT)
      .sort((a, b) => b.lines - a.lines);

    const unrecorded = over
      .filter((f) => !allLogs.includes(f.path) && !allLogs.includes(f.path.split('/').pop()!))
      .map((f) => `${f.path} (${f.lines} lines)`);

    expect(
      unrecorded,
      'over 400 lines and not named in any docs/qa/ log. Split it, or record it there with a ' +
        'reason — and do not get under the limit by deleting the comments that explain the code.',
    ).toEqual([]);
  });

  it('reports the current worst offenders, so the number cannot drift quietly', () => {
    const over = Object.entries(SOURCES)
      .map(([key, text]) => ({ path: repoPath(key), lines: lineCount(text) }))
      .filter((f) => f.lines > LIMIT);

    // A ceiling, not an assertion that everything is fine. It exists so that ADDING a new
    // over-limit file is red even if a QA log happens to mention its name for another reason.
    expect(over.length, `${over.length} files over ${LIMIT} lines`).toBeLessThanOrEqual(10);
  });
});
