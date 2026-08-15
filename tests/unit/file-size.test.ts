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

    // 🔴 A basename fallback used to sit beside the path check:
    //     `&& !allLogs.includes(f.path.split('/').pop()!)`
    // It accepted a file whose BARE FILENAME appeared anywhere in any QA log, for any reason. That
    // is not a record of a justification, it is a coincidence — and it had already masked a real
    // one: `docs/qa/phase-05-combat.md:2495` records the 648-line `enemy-ai.test.ts` passing
    // "only because the basename appeared in a log for an unrelated reason".
    //
    // Dropped 2026-08-14 (D6b) at ZERO cost: all 7 over-limit files already carry a full-path
    // citation, verified file by file before the fallback was removed. See the reversal note in
    // `docs/qa/phase-05-combat.md` — the ratchet half of this was declined on 2026-08-13 as
    // finding T7 and has now been reopened and approved.
    const unrecorded = over
      .filter((f) => !allLogs.includes(f.path))
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
    // over-limit file is red even if a QA log happens to mention it for another reason.
    //
    // 🔴 **BACK TO 7 on 2026-08-15, and the round trip is the lesson.** It went 10 -> 7 (D6b),
    // then 7 -> 8 for `motionCombat.mjs`, then briefly 9 as the QA gate's fixes grew two more files.
    // The **Codex implementation review called that what it was**: whatever justification is
    // written beside it, moving the assertion from 7 to 9 to accommodate files this very session
    // created is a tolerance loosening, and this project's rule is that a gate is never fixed by
    // loosening it. It also noted the recorded red-proof was for the OLD ceiling of seven, so the
    // raised number had never been proved able to fail at all.
    //
    // It is 7 because the work was done instead:
    //   - `motionCombat.mjs` split per subject, after `poseSpan` moved to a leaf and killed the
    //     import cycle that had been the stated reason it could not be split.
    //   - `enemyScavenger.ts` 471 -> 313, the swing trigger to `scavengerAttack.ts` and construction
    //     plus validation to `scavengerFactory.ts`.
    //   - `tick-world-damage.test.ts` 479 -> 352, the claw window to `scavenger-claw.test.ts`.
    //   - `enemy-tuning.test.ts` 401 -> under, the constructor guards to
    //     `enemy-constructor-guards.test.ts`.
    //
    // **Not one line of explanation was deleted to get here** — every split moved whole concerns
    // with their docstrings intact, which is the distinction this file's own header draws between
    // splitting and gaming.
    //
    // 🔴 **7 -> 1 on 2026-08-15**, when the phase owner asked whether Phase 4 could be marked done
    // and criterion 4.16 ("no file > 400 lines") turned out to be the only one of its three FAILs
    // that work could close. Six files came off the list, every one by moving whole concerns with
    // their docstrings intact:
    //   - `enemy-ai.test.ts` 727 -> 203, the scavenger and the lifecycle to two siblings.
    //   - `GameScene.ts` 517 -> 459, the player draw path to `gamePlayerDraw.ts`.
    //   - `player.ts` 486 -> 274, the hand-tuned constants to the `playerTuning.ts` leaf.
    //   - `combat.ts` 468 -> 351, the frozen timings to the `combatTiming.ts` leaf.
    //   - `motion.mjs` 436 -> 277, the two airborne motions to the `motionAirborne.mjs` leaf.
    //   - `phase-04-assets.spec.ts` 407 -> 286 and `sheet-packing.test.ts` 402 -> 215.
    //
    // **`GameScene.ts` at 459 is the one that did not close, and it is deliberate.** What is left
    // is `create()`, `update()`, and five `protected` methods two subclasses inherit
    // (`PlaygroundScene`, `ElementEditorScene`) — so moving them changes a class API. The three
    // scene toggles cannot shrink at all: their `'Gym'` / `'Playground'` / `'ElementEditor'`
    // literals must stay inside `import.meta.env.DEV` or the key ships in `dist/` and
    // `verify-dist.mjs` fails the build. Justification in `docs/qa/phase-04-art.md`.
    //
    // Lower it again whenever a file comes off the list. **Raising it is not a way past this gate**;
    // the way past is to split the file or write the justification, in that order of preference.
    expect(over.length, `${over.length} files over ${LIMIT} lines`).toBeLessThanOrEqual(1);
  });
});
