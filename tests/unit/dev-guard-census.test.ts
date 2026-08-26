import { describe, expect, it } from 'vitest';

/**
 * # The DEV-guard census
 *
 * ## Why this exists: `verify-dist` cannot go red for a module-scope body
 *
 * Session inventory item **5.1**, and it was recorded as *"the gate meant to stop DEV code shipping
 * cannot fire either way for module-scope code"*. That statement is **half right**, and the half it
 * gets wrong is the half everyone believed. Both halves were measured on 2026-08-23 rather than
 * argued, because *(C1)* a gate is not trusted until it has been watched:
 *
 * | mutation | rebuilt `verify-dist` said |
 * |---|---|
 * | drop the `import.meta.env.DEV` ternary in `game/config.ts`, so the three dev scenes register in production | **FAILED** — 3 scene keys, 1 symbol, 1 prose hit |
 * | drop the `import.meta.env.DEV` early-return in `debug/globals.ts`'s `updateDebugState` | **`verify-dist ok`** |
 *
 * So the scene roster is covered — the scene KEYS are quoted string literals and esbuild keeps
 * those. What is **not** covered is a guarded body whose only tell is a module-scope identifier:
 * esbuild renames those, so no bare-symbol grep over a minified bundle can ever see one. The second
 * row above ships `Object.assign(state, patch)` into `dist/` on every tick of production play, and
 * the build prints `ok`.
 *
 * `globals.ts:67` already predicted exactly this — *"pass while the seam's internals were still in
 * the bundle"* — and guarded **both** the installer and `updateDebugState` for that reason. Nothing
 * re-checked that the second guard was still there.
 *
 * ## Why a census, and not a bundler plugin
 *
 * The named fix was a `generateBundle` hook asserting zero rendered bytes for the dev-only modules.
 * That is the right shape for a module that must vanish **entirely** — and it is also redundant,
 * because the table above shows the scene-key check already reds for every one of those. It does
 * nothing at all for `globals.ts`, which legitimately ships (`getDebugState` and the module itself
 * are reachable from production) while its guarded bodies must not.
 *
 * A census catches the case that is actually open, in the layer where the guard is legible. It is a
 * source-text gate, which this project accepts only when a behavioural one cannot reach *— and a
 * behavioural one genuinely cannot: `import.meta.env.DEV` is `true` under vitest, so at runtime the
 * guarded body always executes and there is nothing to observe.
 *
 * ## Reading a failure
 *
 * A red here is **never** cleared by editing the number. It means one of:
 *
 * - a guard was **removed** → that body now ships. Put it back, or state in `docs/qa/` why the body
 *   is safe in production and then move the number.
 * - a guard was **added** → a new DEV-only seam exists. That is a *(vault 1.6)* decision — which
 *   side of the build gate does this seam live on? — and it wants a sentence in the QA log, not a
 *   silent bump.
 *
 * Both are approval checkpoints, in the same spirit as `style-lock.test.ts`'s hash.
 */

const CENSUS: ReadonlyArray<readonly [string, number]> = [
  ['src/debug/globals.ts', 3],
  ['src/game/audio.ts', 1],
  ['src/game/config.ts', 2],
  ['src/game/feelVariants.ts', 1],
  ['src/main.ts', 2],
  ['src/scenes/BootScene.ts', 3],
  ['src/scenes/ElementEditorScene.ts', 2],
  ['src/scenes/GameScene.ts', 2],
  ['src/scenes/GymScene.ts', 2],
  ['src/scenes/bootAssets.ts', 1],
  ['src/scenes/gameDev.ts', 7],
  ['src/scenes/gameInput.ts', 2],
  ['src/scenes/gameLevelPick.ts', 1],
  ['src/scenes/gamePlayerDraw.ts', 4],
  ['src/sim/hitstop.ts', 1],
  ['src/sim/types.ts', 1],
];

/**
 * Every `.ts` under `src/`, eagerly as raw text.
 *
 * ⚠️ `import.meta.glob` with `eager: true` is resolved at transform time, and vitest caches the
 * result — a landed source change can report the PREVIOUS text if only the source moved. Touch this
 * file too when re-running after an edit under `src/`. Recorded because it has already cost this
 * project a false green on a `.tmj` fixture.
 */
const SOURCES = import.meta.glob('../../src/**/*.ts', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

/** `../../src/foo/bar.ts` → `src/foo/bar.ts`, so the census reads like a path and not like a glob. */
function repoPath(globKey: string): string {
  return globKey.replace(/^\.\.\/\.\.\//, '');
}

/**
 * Guard LINES, not occurrences.
 *
 * A line is the unit a reviewer deletes and the unit a diff shows, so it is the unit that goes
 * stale. Two guards on one line would count once — which is a real, tiny hole, and it is closed by
 * the fact that no line in `src/` carries two.
 */
function guardLines(source: string): number {
  return source.split('\n').filter((line) => line.includes('import.meta.env.DEV')).length;
}

/**
 * The BODY behind the guards, in statement-ish lines.
 *
 * ⚠️ **Counting guard lines alone reds on a deleted guard and on nothing else** — the S.3 gate
 * owner's finding, and the deleted guard is the one mutation this file had run. An **inverted**
 * guard (`!import.meta.env.DEV`), an **emptied** guarded block, or a statement **hoisted out** of
 * the block above it all leave the line count untouched, and all three ship dev code to `dist/` or
 * silently drop a dev affordance.
 *
 * This walks the braces after each guard and counts the non-blank, non-comment lines strictly
 * inside. It is a heuristic, not a parser — `@types/node` is not a dependency and neither is a TS
 * AST, so a brace scan is what is available. It catches the emptied block, which is the mutation
 * that matters; the negation check below catches the inversion.
 */
/**
 * The negated (early-return) guards, per file, 2026-08-23.
 *
 * `if (!import.meta.env.DEV) return;` is the correct idiom for a whole-function guard and is not a
 * defect. What matters is that a guard does not silently move between this column and the positive
 * one — see the split test below.
 */
const NEGATED_CENSUS: ReadonlyArray<readonly [string, number]> = [
  ['src/debug/globals.ts', 2],
  ['src/game/audio.ts', 1],
  ['src/scenes/BootScene.ts', 2],
  ['src/scenes/bootAssets.ts', 1],
  ['src/scenes/gameDev.ts', 1],
  ['src/scenes/gameLevelPick.ts', 1],
  ['src/scenes/gamePlayerDraw.ts', 1],
];

/**
 * The measured total of guarded dev-only body lines.
 *
 * Per-file as measured 2026-08-23: `gameDev.ts` 15 · `gamePlayerDraw.ts` 10 · `BootScene.ts` 5 ·
 * `gameInput.ts` 5 · `globals.ts` 2 · `audio.ts` 1 · `main.ts` 1 · `bootAssets.ts` 1 ·
 * `gameLevelPick.ts` 1 = **41**. Note `config.ts`, `feelVariants.ts`, `hitstop.ts` and `types.ts`
 * contribute **zero**: their guards are ternaries and type positions, not blocks, which the brace
 * scan does not and should not count.
 *
 * 🔴 **RE-TAKEN 41 -> 49 on 2026-08-26, and the delta is fully accounted for.** Phase 10 added a
 * `devSeam('__DEVSEAM_*__')` sentinel as the first statement of every guarded body, for criterion
 * 10.2's bundle gate. Exactly **8** of the 17 landed inside a POSITIVE `if (DEV) {` block, which is
 * the only shape this brace scan counts: `main.ts` +1 · `BootScene.ts` +1 · `gameDev.ts` +3 ·
 * `gameInput.ts` +1 · `gamePlayerDraw.ts` +2. The other 9 sit after a negated guard's early-return
 * block — inside the function, outside the braces this scan walks — so they do not move the number.
 *
 * 41 + 8 = 49. **This is a re-take with a derived cause, not a bound moved to clear a red.** If you
 * cannot account for a delta line-by-line the way this note does, do not update the number: an
 * unexplained change here is the emptied-block or hoisted-statement mutation the check exists for.
 */
const GUARDED_BODY_LINES = 49;

function guardedBodyLines(source: string): number {
  const lines = source.split('\n');
  let total = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!line.includes('import.meta.env.DEV') || !line.includes('{')) continue;
    let depth = 0;
    for (let j = i; j < lines.length; j += 1) {
      const body = lines[j]!;
      for (const ch of body) {
        if (ch === '{') depth += 1;
        else if (ch === '}') depth -= 1;
      }
      if (j > i) {
        const trimmed = body.trim();
        const isComment =
          trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*');
        if (trimmed.length > 0 && trimmed !== '}' && !isComment) total += 1;
      }
      if (depth <= 0) break;
    }
  }
  return total;
}

describe('the DEV-guard census (inventory 5.1)', () => {
  const actual = new Map<string, number>();
  for (const [globKey, source] of Object.entries(SOURCES)) {
    const count = guardLines(source);
    if (count > 0) {
      actual.set(repoPath(globKey), count);
    }
  }

  it('reads at least one guard, so an empty glob cannot pass as a clean census', () => {
    // The zero-selection failure mode, one layer down: a glob that resolved to nothing would make
    // every per-file assertion below vacuous and the suite would still be green.
    expect(actual.size).toBeGreaterThan(0);
    expect(SOURCES).not.toEqual({});
  });

  it('names exactly the files the census names — no more, no fewer', () => {
    expect([...actual.keys()].sort()).toEqual(CENSUS.map(([path]) => path).slice().sort());
  });

  for (const [path, expected] of CENSUS) {
    it(`${path} still carries its ${expected} DEV guard(s)`, () => {
      expect(
        actual.get(path),
        `${path} has ${String(actual.get(path))} \`import.meta.env.DEV\` guard line(s), not ` +
          `${expected}. A REMOVED guard means that body now ships to dist/ — and \`verify-dist\` ` +
          `cannot tell you, because esbuild renames module-scope names and its greps are for bare ` +
          `symbols. An ADDED guard is a new DEV-only seam and a (vault 1.6) decision. Either way: ` +
          `do not edit this number to make the test pass.`,
      ).toBe(expected);
    });
  }
});

/**
 * The two mutations the line census could not see (S.3 gate owner).
 *
 * `verify-dist` catches a dev-only **scene key** in the bundle. It provably cannot see a guarded
 * **module body** — esbuild removes those names entirely, which is what A2 measured. So this census
 * is the only thing standing between a broken guard and a shipped dev affordance, and it needs to
 * red on more than a deletion.
 */
describe('the census sees more than a deleted guard', () => {
  const all = Object.entries(SOURCES);

  it('the POSITIVE / NEGATED split is unchanged — flipping one is the inversion mutation', () => {
    // 🔴 The first version of this test banned `!import.meta.env.DEV` outright and **red-flagged
    // correct code**: `if (!import.meta.env.DEV) return;` is the early-return idiom, and
    // `globals.ts` uses it deliberately for both the installer and `updateDebugState`. The check was
    // wrong, not the source. Recorded because a gate that reds on the right answer gets "fixed" by
    // deleting it, and then the real hole is open again.
    //
    // What actually distinguishes an inversion is the SPLIT: turning `if (DEV) { body }` into
    // `if (!DEV) { body }` moves one guard from the positive column to the negative one, and turning
    // an early return the other way moves it back. Neither changes the line total the census above
    // pins, which is why that census could not see it.
    const negated = new Map<string, number>();
    for (const [globKey, source] of all) {
      const n = (source.match(/!import\.meta\.env\.DEV/g) ?? []).length;
      if (n > 0) negated.set(repoPath(globKey), n);
    }
    expect(
      [...negated.entries()].sort(),
      'the positive/negated guard split moved. A guard was inverted, which flips WHICH BUILD gets ' +
        'the body — invisible to the line census and, for a module-scope body, to verify-dist too.',
    ).toEqual([...NEGATED_CENSUS].sort());
  });

  it('the guarded BODIES are the measured size — an emptied block keeps its guard line', () => {
    // Pinned in total rather than per file: the per-file table above already localises a change,
    // and a total is what notices a statement quietly hoisted OUT of a block into the open.
    //
    // ⚠️ This number moves whenever dev-only code is legitimately added or removed. That is the
    // point — it is an approval checkpoint, not a constraint. Re-take it deliberately; do not
    // adjust it to make a red go away.
    const total = all.reduce((sum, [, source]) => sum + guardedBodyLines(source), 0);
    expect(
      total,
      `guarded dev-only body lines total ${total}, not ${GUARDED_BODY_LINES}. If you added or ` +
        `removed dev-only code this is expected — re-take the number. If you did NOT, a guarded ` +
        `block was emptied or a statement was hoisted out of one.`,
    ).toBe(GUARDED_BODY_LINES);
  });

  it('and the bodies are not all empty, which would satisfy the total trivially', () => {
    expect(GUARDED_BODY_LINES).toBeGreaterThan(10);
  });
});
