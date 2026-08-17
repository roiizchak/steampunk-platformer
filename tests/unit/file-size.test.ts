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

/**
 * The token an ACTIVE citation must carry: `lines=432`, on the same log line as the path.
 *
 * 🔴 **A citation that names only the path expires silently, and this project has already paid for
 * that.** `docs/qa/phase-04-art.md` justified `GameScene.ts` at **459 lines** on grounds — `create()`,
 * `update()`, five `protected` methods, three DEV scene literals — that say nothing about audio.
 * Phase 7 then added an `audio` field, `catalog()`, a `createAudio` call and one line in `update()`,
 * carrying the file from 386 to 432, and **the gate stayed green the whole way**: the path was in a
 * log, so the check passed. A rule satisfied by an expired citation is not a rule.
 *
 * Binding the count to the citation makes growth break its own justification. You cannot grow a file
 * past its recorded size without editing the log line that permits it, which is precisely the moment
 * someone should be asked whether the justification still holds.
 *
 * ⚠️ **An exact token, not a bare number, and not a substring.** A naive "the log line mentions the
 * path and the current count somewhere" check false-greens on stale prose: the logs already record
 * `GameScene.ts` at 459 AND at 432, so a file that later grew *back* to 459 would be covered by the
 * Phase 4 sentence that has nothing to do with why it is large now. `lines=` is a marker a human
 * writes on purpose; a number in a sentence is not.
 */
const CITATION_TOKEN = (lines: number): string => `lines=${lines}`;

/** Every QA-log line that names this path AND carries any `lines=` marker. */
function citationsFor(path: string, logLines: string[]): string[] {
  return logLines.filter((line) => line.includes(path) && /\blines=\d+\b/.test(line));
}

describe('the 400-line rule', () => {
  const allLogs = Object.values(QA_LOGS).join('\n');
  const logLines = allLogs.split('\n');

  it('finds the sources and the QA logs at all — an empty sweep proves nothing', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(30);
    expect(Object.keys(QA_LOGS).length).toBeGreaterThan(0);
  });

  it('every file over the limit carries an ACTIVE citation — path and current line count', () => {
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
    //
    // 🔴 **2026-08-17: the path check alone was not enough either, and D7/D9 named why.** See
    // `CITATION_TOKEN` above. The citation must now state the count, and stale prose does not count.
    const problems = over.flatMap((f) => {
      const cites = citationsFor(f.path, logLines);
      if (cites.length === 0) {
        return [`${f.path} (${f.lines} lines) — no active citation (no docs/qa/ line with lines=N)`];
      }
      // Exactly one canonical entry per path. Two active citations means two logs disagree about
      // why the file is large, and the gate would pass on whichever happened to match.
      if (cites.length > 1) {
        return [
          `${f.path} (${f.lines} lines) — ${cites.length} active citations; there must be exactly one`,
        ];
      }
      if (!cites[0].includes(CITATION_TOKEN(f.lines))) {
        return [
          `${f.path} is ${f.lines} lines and its citation does not say ${CITATION_TOKEN(f.lines)}`,
        ];
      }
      return [];
    });

    expect(
      problems,
      'over 400 lines without a CURRENT justification. Split it, or record it in a docs/qa/ log ' +
        'on one line naming the path and its count as `lines=N` — and do not get under the limit ' +
        'by deleting the comments that explain the code.',
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
    // 🔴 **1 -> 0 on 2026-08-17.** `GameScene.ts` was 432 and came off the list at **378**, by
    // inlining the eight `private` one-line wrappers that only forwarded to `gameParallax.ts`,
    // `gameHud.ts`, `gamePlayerDraw.ts`, `gameLevelDraw.ts` and `gameInput.ts`, and relocating each
    // docstring to the call site or the module it describes. All eight were `private`, so no
    // subclass could override them; not one line of explanation was deleted.
    //
    // **Zero does not delete the escape hatch above** — the project rule still permits a file over
    // 400 with a written justification, and the citation check is what enforces the writing. It
    // means only that today nothing is over, so a file crossing the limit is red on BOTH tests, and
    // clearing it needs a deliberate ratchet raise here as well as an active citation there. That
    // is the same ratchet this comment has always described, one notch further down.
    //
    // Lower it again whenever a file comes off the list. **Raising it is not a way past this gate**;
    // the way past is to split the file or write the justification, in that order of preference.
    expect(over.length, `${over.length} files over ${LIMIT} lines`).toBeLessThanOrEqual(0);
  });
});
