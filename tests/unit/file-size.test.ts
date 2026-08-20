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
 * An ACTIVE citation is one QA-log line carrying all three of: the marker `SIZE-EXEMPTION:`, the
 * file's repo path, and `lines=NNN` stating its CURRENT count.
 *
 * 🔴 **A citation that names only the path expires silently, and this project has already paid for
 * that.** `docs/qa/phase-04-art.md` justified `GameScene.ts` at **459 lines** on grounds — `create()`,
 * `update()`, five `protected` methods, three DEV scene literals — that say nothing about audio.
 * Phase 7 then added an `audio` field, `catalog()`, a `createAudio` call and one line in `update()`,
 * carrying the file from 386 to 432, and **the gate stayed green the whole way**: the path was in a
 * log, so the check passed. A rule satisfied by an expired citation is not a rule.
 *
 * Binding the count to the citation makes growth break its own justification: you cannot grow a file
 * past its recorded size without editing the line that permits it, which is exactly the moment
 * someone should be asked whether the justification still holds.
 *
 * ## ⚠️ What this does NOT prove, corrected 2026-08-17 after a gate owner read it
 *
 * The first version of this docstring claimed the token defeated stale prose outright — that a file
 * regrowing to a previously-cited 459 could not be covered by the Phase 4 sentence. **That was
 * false, and a wrong comment is worse than none *(vault C9)*.** `lines=459` proves only that somebody
 * once wrote a deliberate marker at 459; it does not carry a date, so a file that returns to exactly
 * a previously-exempted size IS covered by the old line.
 *
 * What actually holds the line is three things together, and only the first is this token:
 *
 *  1. `lines=` must MATCH the current count, so ordinary growth breaks its own citation;
 *  2. **exactly one** active citation per path, so two logs cannot disagree and let the gate pass on
 *     whichever happens to match;
 *  3. the ratchet below, which is back at **0** as of 2026-08-20 — `src/sim/tick.ts` came off the
 *     list when Phase 9 moved steps 5-8 to `playerMotion.ts` — so nothing may be over the limit
 *     today and exempting a file is a deliberate, visible edit in two places.
 *
 * ⚠️ **The residual hole this describes is OPEN whenever the ratchet is above 0**, and it once said
 * "while the ratchet has been raised" as a hypothetical until the ratchet was actually raised and
 * nobody re-read the sentence. A file that grows back to a byte-identical previously-exempted size
 * passes (1) and (2); only the count in (3) stands between it and the gate, and the count does not
 * name a path. The ratchet is at 0 again today, so the hole is **shut** — this paragraph is back to
 * describing a hazard rather than the present tense, and it says which.
 * *(vault C9: a wrong comment is worse than none.)*
 *
 * ## The lesson this mechanism is built on, restored here 2026-08-17
 *
 * `GameScene.ts` used to carry this paragraph, and the split that brought it under 400 lines
 * deleted rather than relocated it. A gate owner caught that, and it belongs HERE, because it is
 * the argument for this whole mechanism:
 *
 *   > *"The line count that used to be quoted here — 'it is 515 lines' — was wrong in both
 *   > directions over time: the file was 386 on `main` before Phase 7 and is 427 now. **A
 *   > hardcoded line count in a comment is a fact with an expiry date and no test**, so it is
 *   > gone rather than corrected."*
 *
 * A count in a QA log is the same fact with the same expiry date — the difference, and the only
 * reason writing one down is worth anything, is that this test IS the test it lacked.
 *
 * `SIZE-EXEMPTION:` is required because `lines=` alone is prose a QA log legitimately writes. This
 * very session's log discusses `lines=459` and `lines=410` in narrative tables; the moment such a
 * sentence also names a real over-limit path it becomes a second "active citation" and false-REDS a
 * legitimate file. A marker no narrative would use removes that. Found by the criterion G7 gate owner.
 */
const CITATION_MARKER = 'SIZE-EXEMPTION:';

/**
 * One exemption record: `SIZE-EXEMPTION: src/scenes/Foo.ts lines=432`, backticks optional.
 *
 * 🔴 **PARSED, not substring-matched, and the Codex implementation review is why.** The first
 * version tested `line.includes(path) && line.includes('lines=' + count)`, and both halves were
 * wrong in the same way:
 *
 *  - `'lines=4100'.includes('lines=410')` is **true**, so a citation for a 4100-line file exempted
 *    a 410-line one;
 *  - `'src/scenes/Example.tsx'.includes('src/scenes/Example.ts')` is **true**, so a `.tsx` citation
 *    exempted the `.ts` file beside it.
 *
 * Both verified in a REPL before the fix. A gate written to stop one substring coincidence
 * (the old bare-basename check) had reintroduced two more.
 */
const CITATION_RE = /SIZE-EXEMPTION:\s*`?([^\s`]+)`?\s+lines=(\d+)\b/;

interface Citation {
  path: string;
  lines: number;
}

/** Every exemption record in the logs that names EXACTLY this path. */
function citationsFor(path: string, logLines: string[]): Citation[] {
  return logLines
    .map((line) => CITATION_RE.exec(line))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => ({ path: m[1], lines: Number(m[2]) }))
    .filter((c) => c.path === path);
}

/**
 * Why an over-limit file is not acceptable, or `null` if it is.
 *
 * Extracted from the sweep on 2026-08-17 so it can be driven by committed fixtures. Before that it
 * was inline in the `it`, and therefore **executed only when some file was over the limit** — which
 * the same session's ratchet set to zero. `docs/TESTING-RULES.md` *(C2)*: a gate that cannot go red
 * is decoration, and "assertions about assertions" are not a substitute for a failing fixture. The
 * classification had no coverage at all; a refactor of it could not have gone red. Found by the
 * criterion G7 adversarial gate owner.
 */
export function citationProblem(
  file: { path: string; lines: number },
  logLines: string[],
): string | null {
  const cites = citationsFor(file.path, logLines);
  if (cites.length === 0) {
    return `${file.path} (${file.lines} lines) — no active citation (no docs/qa/ line reading ` +
      `${CITATION_MARKER} ${file.path} lines=${file.lines})`;
  }
  // Exactly one canonical entry per path. Two active citations means two logs disagree about why
  // the file is large, and the gate would pass on whichever happened to match.
  if (cites.length > 1) {
    return `${file.path} (${file.lines} lines) — ${cites.length} active citations; there must be exactly one`;
  }
  // Numeric equality, never a substring: `lines=4100` must not satisfy a 410-line file.
  if (cites[0].lines !== file.lines) {
    return `${file.path} is ${file.lines} lines and its citation says lines=${cites[0].lines}`;
  }
  return null;
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
    const problems = over.map((f) => citationProblem(f, logLines)).filter((m) => m !== null);

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
    // 🔴 **0 -> 1 on 2026-08-19**, for `src/sim/tick.ts` at **422**, in the gate-entry session.
    // The split was attempted first, per the order of preference below, and both remaining
    // candidates would have contradicted a decision written into that file — step 13's comment says
    // its guard "stays here, with the numbered order that owns it", and step 4c's says the respawn
    // decision is taken where the spawn point lives. `advance` was already extracted to
    // `advanceSplit.ts` in Phase 8 for exactly this pressure, and that was the one clean seam.
    //
    // What crossed the line is 24 lines of the widened step 9d: the contract paragraph, the
    // `entryLocked` read, the attack-edge consumption, and one line each on steps 5, 7 and 9d.
    // Roughly 11 more were MOVED to `goal.ts` on the way — reasoning that `goal.ts`'s own header
    // already claims — which is why the citation reads 422 and not 445. Nothing was deleted.
    // Justification: `docs/qa/phase-08-gate-entry.md`.
    //
    // 🔴 **1 -> 0 on 2026-08-20**, when `src/sim/tick.ts` came off the list. Phase 9
    // needed a home for a hit-stop gate that has to cover steps 5, 6, 7 and 8 together, and moving
    // that block whole into `src/sim/playerMotion.ts` — numbered comments intact, one-line markers
    // left at the call site so the file still reads as fourteen steps in order — is the split the
    // gate-entry session looked for and did not find. **It is the first extraction in this project
    // to move a NUMBERED step**; the two it examined (step 13's window advance, step 4c's respawn)
    // were both refused because each contradicts a decision written into that file, and neither
    // objection applies to a block that takes its numbering with it. The citation in
    // `docs/qa/phase-08-gate-entry.md` is deleted, which is the other half of this edit.
    //
    // Lower it again whenever a file comes off the list. **Raising it is not a way past this gate**;
    // the way past is to split the file or write the justification, in that order of preference.
    expect(over.length, `${over.length} files over ${LIMIT} lines`).toBeLessThanOrEqual(0);
  });
});


/**
 * Committed fixtures for the citation rule — the coverage the sweep above cannot provide.
 *
 * The sweep only runs `citationProblem` when some file is over 400 lines, and the ratchet is at 0,
 * so on a healthy tree it classifies nothing. These are real inputs and real expected outputs, not
 * assertions about assertions: change the rule and they go red immediately *(C2)*.
 *
 * The four cases are the four ways this gate has been, or could be, fooled — three of them
 * demonstrated live during the 2026-08-17 session with a temporary 410-line fixture file.
 */
describe('the citation rule itself', () => {
  const FILE = { path: 'src/scenes/Example.ts', lines: 410 };
  const cite = (body: string): string[] => ['irrelevant prose', body, 'more prose'];

  it('rejects a file with no citation at all', () => {
    expect(citationProblem(FILE, cite('nothing to do with it'))).toContain('no active citation');
  });

  it('rejects a citation that names the path but states no count', () => {
    expect(
      citationProblem(FILE, cite('SIZE-EXEMPTION: `src/scenes/Example.ts` is large because reasons')),
    ).toContain('no active citation');
  });

  it('rejects a STALE count — the defect that let Phase 4 cover Phase 7', () => {
    const problem = citationProblem(FILE, cite('SIZE-EXEMPTION: src/scenes/Example.ts lines=459 — an old reason'));
    expect(problem).toContain('citation says lines=459');
  });

  it('rejects two active citations, so two logs cannot disagree', () => {
    expect(
      citationProblem(FILE, [
        'SIZE-EXEMPTION: src/scenes/Example.ts lines=410 — phase A',
        'SIZE-EXEMPTION: src/scenes/Example.ts lines=410 — phase B',
      ]),
    ).toContain('2 active citations');
  });

  it('ACCEPTS a current, marked, single citation — without this the four above prove only that it is always red', () => {
    expect(
      citationProblem(FILE, cite('SIZE-EXEMPTION: src/scenes/Example.ts lines=410 — the current reason')),
    ).toBeNull();
  });

  it('rejects a count that merely STARTS with the right digits — lines=4100 is not lines=410', () => {
    expect(
      citationProblem(FILE, cite('SIZE-EXEMPTION: src/scenes/Example.ts lines=4100 — a different file era')),
    ).toContain('citation says lines=4100');
  });

  it('does not accept a citation for a DIFFERENT file whose path extends this one', () => {
    // `'src/scenes/Example.tsx'.includes('src/scenes/Example.ts')` is true. It must not count.
    expect(
      citationProblem(FILE, cite('SIZE-EXEMPTION: src/scenes/Example.tsx lines=410 — the tsx one')),
    ).toContain('no active citation');
  });

  it('ignores narrative prose that mentions a count but carries no marker', () => {
    // This log line is the shape `docs/qa/` writes constantly — "it went 459 -> 410". Without the
    // marker requirement it would register as an active citation for whichever size it names.
    expect(
      citationProblem(FILE, cite('`src/scenes/Example.ts` went from lines=459 to lines=410 in the split')),
    ).toContain('no active citation');
  });
});
