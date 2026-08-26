/**
 * Dev-seam sentinels — the causal half of criterion 10.2's bundle gate.
 *
 * ## Why this file exists
 *
 * `tools/gen/verify-dist.mjs` greps the shipped bundle for four DEV-only scene keys, a list of
 * DEV-only symbols and some user-facing prose. That catches a lot. Its own header records, in
 * detail and with a measurement dated 2026-08-23, the class of thing it **cannot** catch:
 *
 *   > drop the DEV early-return in `src/debug/globals.ts`'s `updateDebugState`
 *   > -> **`verify-dist ok`**. NOT covered, and it ships `Object.assign(state, patch)` into every
 *   > tick of production play.
 *
 * The reason no grep fixes it: the only tell a guarded body leaves is a **module-scope
 * identifier**, and the minifier renames those. That miss has been documented-as-uncaught since
 * 2026-08-23 and nothing closed it.
 *
 * ## Why a SENTINEL, and not a cleverer grep
 *
 * Two weaker oracles were designed and rejected during the Phase 10 plan review, both because a
 * gate that cannot fail correctly is worse than no gate *(vault C2)*:
 *
 *   1. **A pinned per-module rendered-byte ceiling.** `renderedLength` is just attributed length
 *      after unused declarations are dropped — it carries no information about whether the bytes
 *      are DEV or production. A legitimate edit false-reds it, a module that shrank elsewhere
 *      hides a leak under its old ceiling, and re-pinning after a legitimate edit silently
 *      blesses one.
 *   2. **A "natural" forbidden token per body**, e.g. asserting `globals.ts` contains no
 *      `Object.assign`. Not causally linked to its guard: the token can vanish *even with the
 *      guard removed* because a second guard downstream makes the value unused and the bundler
 *      drops it. The concrete case in this repo — removing `GameScene.ts`'s `feelTuner` ternary
 *      exposes the value while `gamePlayerDraw.ts`'s own guard still refuses to consume it.
 *
 * A sentinel has neither problem, because it is **inside the guarded body**:
 *
 *   - guard intact  -> the body folds away -> the call folds with it -> the string is absent
 *   - guard removed -> the body survives   -> the call survives      -> the string is present
 *
 * String literals survive minification. That is the causal link, and it is what lets each seam
 * carry **its own** red proof rather than one mutation standing in for a whole roster.
 *
 * ## Why `seen.add` and not a bare string
 *
 * ⚠️ **A bare `'__DEVSEAM_x__';` expression statement would be dropped as dead code even in a
 * LIVE body**, which is the exact failure mode this file exists to avoid — the gate would go
 * green on a leak. An empty function would be inlined away for the same reason. Writing to a
 * module-scope `Set` is a side effect no minifier may elide.
 *
 * It also earns its keep in DEV: `devSeamsSeen()` enumerates the seams that actually executed,
 * which is a live answer to *"which dev affordances is this build carrying?"* — a question that
 * previously had only a `grep`'s answer.
 *
 * ## The gate
 *
 * `tools/gen/devSeamGate.mjs`, a Vite `generateBundle` plugin, asserts **no `__DEVSEAM_` literal
 * survives anywhere in the production output**. It reports per-seam coverage, and a seam whose
 * red proof does not actually redden is reported **UNCOVERED with its reason** — never assumed
 * covered. See `docs/qa/phase-10-ship.md` criterion 10.2 for which seams landed in which column.
 */

const seen = new Set<string>();

/**
 * Marks the enclosing DEV-only body as having executed.
 *
 * Call it as the FIRST statement of a guarded body — directly after the guard for a positive DEV
 * block, and after the early return for the negated whole-function shape, since that function's
 * remainder IS the guarded body.
 *
 * ⚠️ **Never at module scope.** A top-level call is an import-time side effect and would PIN the
 * module into the bundle, turning a gate against dead code into a cause of it.
 *
 * 🔴 This file deliberately paraphrases the guard idiom rather than writing it out.
 * `tests/unit/dev-guard-census.test.ts` censuses guards by matching the literal text on a line and
 * cannot tell code from a comment, so spelling it here would enrol this file in a security census
 * on the strength of prose. Paraphrasing keeps the census measuring code.
 *
 * @param id a `__DEVSEAM_<module>_<body>__` literal, unique across the repo. It must be written
 *   inline as a string literal, never assembled from variables — a computed value is not a
 *   literal the bundler can leave in the output, so it would defeat the gate.
 */
export function devSeam(id: string): void {
  seen.add(id);
}

/** Every seam that has executed in this session. DEV diagnostics; nothing in `src/` reads it. */
export function devSeamsSeen(): readonly string[] {
  return [...seen].sort();
}
