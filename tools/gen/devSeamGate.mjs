// The dev-seam bundle gate — criterion 10.2, and the fix for a false green this repository has
// carried, documented and unclosed, since 2026-08-23.
//
// ONE RULE: **no `__DEVSEAM_` sentinel literal survives anywhere in the FINAL production chunk.**
//
// ## Why this exists
//
// `tools/gen/verify-dist.mjs` greps the shipped bundle for DEV-only scene keys, a list of DEV-only
// symbols, and user-facing prose. Its own header records — with a measurement, dated 2026-08-23 —
// the class of thing it cannot catch:
//
//   > drop the `import.meta.env.DEV` early-return in `src/debug/globals.ts`'s `updateDebugState`
//   > -> **`verify-dist ok`**. NOT covered, and it ships `Object.assign(state, patch)` into every
//   > tick of production play.
//
// No grep fixes that, because the only tell a guarded body leaves is a module-scope identifier and
// the minifier renames those. A sentinel inside the body has the causal property a grep lacks:
//
//   guard intact  -> body folds away -> the call folds with it -> the string is ABSENT
//   guard removed -> body survives   -> the call survives      -> the string is PRESENT
//
// String literals survive minification, so each seam carries its OWN red proof rather than one
// mutation standing in for a whole roster.
//
// ## 🔴 THE RULE THAT WAS DELETED, AND WHY — read this before adding a second rule back
//
// This gate shipped for about an hour with a **Rule 1**: "modules with no production reachability
// must contribute zero `renderedLength` bytes". It was **unsound, and it false-redded a correct
// build on its very first run** — `GymScene.ts` 6792 bytes, `gymKeys.ts` 1239, `devMotionProbe.ts`
// 105, on a bundle that contained none of their code.
//
// Measured 2026-08-26, by probing the plugin's own inputs and then searching the emitted file:
//
//   * `chunk.modules[id].renderedLength` (and `.code`) describe a **PRE-MINIFICATION** state.
//     Rolldown renders the module into the chunk, and oxc then dead-code-eliminates it. A
//     `generateBundle` hook — even at `enforce: 'post'` — sees the intermediate, not the output.
//   * Proof: `GymScene.ts` reported 6792 rendered bytes whose `code` began
//     `var BLUE = 5219281; var GREEN = 6274911;` — and `5219281`, `6274911`, `bindGymKeys`,
//     `PROBE_SPEED` and `gymKeys` are **all absent from the final chunk**. The only Gym-ish token
//     that survives is `toggleGym`, which `verify-dist.mjs:104-111` already documents as a
//     legitimate empty method stub.
//
// The Phase 10 plan review had warned in as many words that `renderedLength` "carries no meaning
// about whether those bytes are production or DEV behavior". The warning was read, the metric was
// used anyway for a subtly different purpose, and it failed exactly as predicted. **Do not
// reintroduce any rule based on `renderedLength`, `.code`, or `removedExports`** — every one of
// them describes the intermediate. The only trustworthy artifact in this hook is `chunk.code`.
//
// ## What covers what — the honest map
//
//   * **DEV-only SCENES** (`Playground`, `ElementEditor`, `Gym`) — covered by `verify-dist.mjs`'s
//     quoted-scene-key sweep, which is MEASURED to go red: dropping `config.ts`'s ternary produced
//     "3 scene keys, 1 symbol, 1 prose hit". Not covered here, because it is covered there.
//   * **DEV-only HELPER modules** with no scene-key tell (`gymKeys`, `devSpawn`, `devFeelTuner`,
//     `devMotionProbe`, `render/enemyTuning`) — a sentinel inside each entry point.
//   * **GUARDED BODIES in mixed modules** — a sentinel inside each body. This is the gap nothing
//     else covers and the reason the gate exists.
//
// ⚠️ A sentinel goes INSIDE a function or class body, **never at module scope**. A top-level
// `devSeam(...)` call is an import-time side effect, and it would PIN the module into the bundle —
// converting a gate against dead code into a cause of dead code.
//
// ## What this gate does NOT claim
//
// 🔴 This section used to read: *"Four guards in this repository are TERNARIES … with no statement
// position a sentinel can occupy."* **They were awkward, not uncoverable, and all four are covered
// now.** The criterion 10.2 gate owner (brief B, finding 11) pointed out that `devSeam` returns
// `void`, so `(devSeam('__DEVSEAM_…__'), value)` is a legal ternary arm — four lines and +4 on the
// floor. `GameScene.ts`'s dev-action object was the one that mattered: five dev closures with no
// tell any gate read, because `verify-dist.mjs` measures those identifiers surviving as empty
// method stubs either way.
//
// The honesty clause below is what let that stand for a while, and it is worth naming the misuse:
// it exists to stop a seam being *assumed* covered, not to excuse one that could be covered
// cheaply. "Uncovered, with its reason" is a last resort, not a first disposition.
//
// What the gate still does not claim: it sees the emitted `dist/` only. A DEV path that ships
// because its guard was never written has no sentinel to leak, and nothing here would know.
// `dev-guard-census.test.ts` is the half that counts guards in source; this is the half that
// proves they folded.
//
// 🔴 **A seam whose red proof does not actually redden is reported UNCOVERED, with its reason** —
// never assumed covered. That rule is the difference between this gate and the false greens, and
// the one false red, that preceded it.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The sentinel prefix. Any occurrence in the final production chunk is a leak. */
const SENTINEL = '__DEVSEAM_';

/**
 * A sentinel counts only where it is a **live `devSeam(...)` argument**, and comments are removed
 * before matching.
 *
 * 🔴 This was a bare `/__DEVSEAM_[A-Za-z0-9_]+__/` over raw file text until 2026-08-26 — plain text,
 * anywhere, including inside a comment. Found by the criterion 10.2 gate owner (brief A finding 8,
 * brief B finding 17), and the failure it allows is exact: comment out a `devSeam(...)` line and the
 * census still counts it, the floor still passes, the leak scan finds nothing either way — and the
 * guard beneath it is now invisible to the gate. That is the census *satisfying* the vacuity it was
 * written to close, which is the shape this whole gate exists to refuse.
 */
const CALL_SHAPE = /devSeam\(\s*'(__DEVSEAM_[A-Za-z0-9_]+__)'\s*\)/g;

/**
 * Line and block comments out; string and template contents left alone.
 *
 * Deliberately a lexer and not a parser: `@babel/parser` is approved **test-only** (CLAUDE.md §3)
 * and reaching for it at build time would be a change to an approved decision, i.e. a STOP-and-ask.
 * The only thing this has to get right is not mistaking a `//` inside a string literal for the start
 * of a comment, and it tracks quotes for exactly that.
 *
 * @param {string} src
 * @returns {string}
 */
function stripComments(src) {
  let out = '';
  let i = 0;
  /** @type {string | undefined} */
  let quote = undefined;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (quote !== undefined) {
      out += c;
      if (c === '\\') {
        out += next ?? '';
        i += 2;
        continue;
      }
      if (c === quote) quote = undefined;
      i += 1;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      quote = c;
      out += c;
      i += 1;
      continue;
    }
    if (c === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i += 1;
      i += 2;
      continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/**
 * `readdirSync` without `withFileTypes`, because `tools/gen/node-shims.d.mts` declares exactly the
 * members this repository uses, and a `Dirent` type would be a second unmaintained copy of a package
 * the project has chosen not to depend on. A directory is whatever `readdirSync` can list.
 *
 * @param {string} path
 * @returns {boolean}
 */
function isDirectory(path) {
  try {
    readdirSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Every sentinel token in `src/`, in file order, excluding `devSeam.ts` itself.
 *
 * 🔴 This is what stops the gate going VACUOUSLY green. "No sentinel in the output" is satisfied
 * perfectly by a repository containing no sentinels at all — the same shape as a Playwright run
 * that selects nothing, prints `expected: 0`, and exits 0. Reading the count is the difference
 * between "nothing leaked" and "nothing was looked for", so the gate fails when it reaches zero.
 */
export function sentinelTokensInSource(root = 'src') {
  /** @type {string[]} */
  const tokens = [];
  /** @param {string} dir */
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (isDirectory(path)) walk(path);
      else if (name.endsWith('.ts') && name !== 'devSeam.ts') {
        const code = stripComments(readFileSync(path, 'utf8'));
        for (const m of code.matchAll(CALL_SHAPE)) tokens.push(m[1]);
      }
    }
  };
  walk(root);
  return tokens;
}

/**
 * How many sentinel-marked DEV bodies exist under `root`.
 *
 * @param {string} [root]
 * @returns {number}
 */
export function countSentinelsInSource(root = 'src') {
  return sentinelTokensInSource(root).length;
}

/**
 * The floor the sentinel census must not fall below. Set from the measured count on 2026-08-26.
 *
 * It is a FLOOR, not an equality: adding a guarded body and its sentinel is ordinary work and must
 * not fail the build. Losing sentinels is not — it silently shrinks what the gate looks at, which
 * is how a gate stops being able to fail without anyone editing the gate.
 *
 * 23 → 27 on 2026-08-26. The four ternary guards this file used to report UNCOVERED — `config.ts`'s
 * scene roster, `gameDev.ts`'s help-line suffix, and `GameScene.ts`'s feel-tuner pass and dev-action
 * object — now carry sentinels on a comma expression. The criterion 10.2 gate owner (brief B,
 * finding 11) pointed out that `devSeam` returns `void`, so `(devSeam('…'), value)` is legal in
 * every one of them: they were awkward, not uncoverable, and the honesty clause was being used to
 * excuse four seams it could have covered. `GameScene.ts:312`'s was the one that mattered — five dev
 * closures with no tell any gate read, because `verify-dist.mjs` measures those identifiers
 * surviving as empty stubs either way.
 */
const MIN_SENTINELS = 27;

/**
 * @returns {import('vite').Plugin}
 */
export function devSeamGate() {
  return {
    name: 'steampunk:dev-seam-gate',
    // `post` so this runs after the minifier. `chunk.code` is the emitted text either way, but the
    // ordering is stated because the deleted rule failed precisely on an ordering assumption.
    enforce: 'post',
    apply: 'build',
    generateBundle(_options, bundle) {
      const problems = [];
      const leaked = new Set();

      for (const [fileName, output] of Object.entries(bundle)) {
        // `chunk.code` is the ONLY field here that describes an emitted CHUNK. See the header.
        //
        // 🔴 Assets used to be skipped outright, which left `dist/index.html` — an emitted asset, not
        // a chunk — unscanned by the one gate that exists to find a leaked seam in `dist/`. Found by
        // the criterion 10.6 gate owner (finding S10). `source` is the asset's emitted bytes; a
        // `Uint8Array` is decoded rather than stringified, because `String(bytes)` yields
        // comma-separated integers and would silently never match.
        const code =
          output.type === 'chunk'
            ? (output.code ?? '')
            : typeof output.source === 'string'
              ? output.source
              : new TextDecoder().decode(output.source);
        let from = 0;
        for (;;) {
          const at = code.indexOf(SENTINEL, from);
          if (at < 0) break;
          const token = /^__DEVSEAM_[A-Za-z0-9_]*/.exec(code.slice(at))?.[0] ?? SENTINEL;
          leaked.add(`${token} in ${fileName}`);
          from = at + SENTINEL.length;
        }
      }

      for (const s of leaked) {
        problems.push(`DEV-only body survived into the production bundle: ${s}`);
      }

      const tokens = sentinelTokensInSource();
      const seams = tokens.length;
      const duplicates = [...new Set(tokens.filter((t, i) => tokens.indexOf(t) !== i))];
      if (duplicates.length > 0) {
        // `devSeam.ts` requires each token to be unique across the repository and nothing enforced
        // it. A shared token makes two seams indistinguishable in the leak report AND lets one seam
        // hold the census up while the other is deleted — the floor is a count, not a set.
        problems.push(
          `sentinel token(s) used more than once: ${duplicates.join(', ')}. Each guarded body needs ` +
            'its own token, or a leak cannot be traced to the guard that stopped folding.',
        );
      }
      if (seams < MIN_SENTINELS) {
        problems.push(
          `only ${seams} dev-seam sentinel(s) found in src/, expected at least ${MIN_SENTINELS}. ` +
            'A shrinking census means the gate is looking at less than it was built to look at — ' +
            'which is a gate quietly losing the ability to fail, not a pass.',
        );
      }

      if (problems.length > 0) {
        throw new Error(
          'dev-seam gate FAILED — criterion 10.2:\n' +
            problems.map((p) => `  - ${p}`).join('\n') +
            '\n\nDo not silence this by deleting a sentinel; find the guard that stopped folding.',
        );
      }

      this.info?.(`dev-seam gate ok: ${seams} sentinel-marked DEV body/bodies folded out of dist/`);
    },
  };
}
