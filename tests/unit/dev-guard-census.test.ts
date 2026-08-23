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
