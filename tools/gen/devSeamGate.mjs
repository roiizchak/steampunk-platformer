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
// Four guards in this repository are TERNARIES (`config.ts`'s scene roster, `gameDev.ts`'s help
// suffix, and two in `GameScene.ts`) with no statement position a sentinel can occupy. They are
// covered by other means or not at all, and `docs/qa/phase-10-ship.md` says which.
//
// 🔴 **A seam whose red proof does not actually redden is reported UNCOVERED, with its reason** —
// never assumed covered. That rule is the difference between this gate and the false greens, and
// the one false red, that preceded it.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** The sentinel prefix. Any occurrence in the final production chunk is a leak. */
const SENTINEL = '__DEVSEAM_';

/**
 * How many sentinels exist in `src/`, excluding `devSeam.ts` itself.
 *
 * 🔴 This is what stops the gate going VACUOUSLY green. "No sentinel in the output" is satisfied
 * perfectly by a repository containing no sentinels at all — the same shape as a Playwright run
 * that selects nothing, prints `expected: 0`, and exits 0. Reading the count is the difference
 * between "nothing leaked" and "nothing was looked for", so the gate fails when it reaches zero.
 */
export function countSentinelsInSource(root = 'src') {
  let count = 0;
  const walk = (dir) => {
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.ts') && entry.name !== 'devSeam.ts') {
        count += (readFileSync(path, 'utf8').match(/__DEVSEAM_[A-Za-z0-9_]+__/g) ?? []).length;
      }
    }
  };
  walk(root);
  return count;
}

/**
 * The floor the sentinel census must not fall below. Set from the measured count on 2026-08-26.
 *
 * It is a FLOOR, not an equality: adding a guarded body and its sentinel is ordinary work and must
 * not fail the build. Losing sentinels is not — it silently shrinks what the gate looks at, which
 * is how a gate stops being able to fail without anyone editing the gate.
 */
const MIN_SENTINELS = 23;

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
        // `chunk.code` is the ONLY field here that describes the emitted artifact. See the header.
        const code = output.type === 'chunk' ? (output.code ?? '') : '';
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

      const seams = countSentinelsInSource();
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
