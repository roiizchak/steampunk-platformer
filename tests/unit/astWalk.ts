/**
 * **The Babel parse and the structural walk — the leaf of the AST-gate helper graph.**
 *
 * ## Why this file exists: a runtime import cycle, found 2026-08-25
 *
 * `tweenCallbacks.ts` owned `parseFile` and `walk` and imported `SIM_MUTATORS` from
 * `simMutators.ts`; `simMutators.ts` imported `parseFile` and `walk` straight back. **Both are value
 * imports, so that is a real ESM cycle, not a type-only one** — the kind where one module's
 * top-level `const` is `undefined` while the other's body runs, and which module wins depends on
 * which one the test runner happens to enter first.
 *
 * Nothing had broken yet: `SIM_MUTATORS` is read inside a function body rather than at module
 * evaluation, so the binding is live by the time anything reads it. That is luck about *where a
 * lookup happens to sit*, not a property of the design — and `gen-import-cycles.test.ts` does not
 * cover `tests/unit/`, so nothing would have said so.
 *
 * Named by the 9.2/9.3 checklist brief. The fix is the ordinary one: the shared leaf moves down.
 *
 * ```
 *   astWalk.ts  ←  simMutators.ts  ←  tweenCallbacks.ts  →  tweenIdentity.ts (type-only)
 *        ↖──────────────────────────────┘
 * ```
 *
 * `tweenCallbacks.ts` re-exports both names, so every existing consumer keeps its import path.
 */

import { parse } from '@babel/parser';

/* eslint-disable @typescript-eslint/no-explicit-any -- the Babel AST is walked structurally. */
export type Node = any;

/** Parse one TypeScript source file into a Babel AST. */
export function parseFile(code: string): Node {
  // ⚠️ **`errorRecovery` does NOT mean "a bad file yields a partial tree" here — it still THROWS**
  // on anything it cannot recover from, measured 2026-08-25. Any sibling docstring that justified a
  // vacuity check by "a file the parser chokes on yields a partial tree" had the mechanism wrong; the
  // vacuity check is still worth having, for the different reason that a file yielding zero callback
  // bodies is indistinguishable from a file with none.
  //
  // ⚠️ `plugins` has no `jsx`, so a `.tsx` under `src/` would throw on arrival. None exists — checked
  // — and this is recorded rather than pre-solved, because a `jsx` plugin changes how `<T>` parses in
  // ordinary `.ts` and that trade is not worth making for a file that does not exist.
  return parse(code, {
    sourceType: 'module',
    plugins: ['typescript'],
    errorRecovery: true,
  });
}

/** Every child node, depth-first. */
export function walk(node: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null): void {
  if (node === null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit, parent);
    return;
  }
  if (typeof node.type !== 'string') return;
  visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
    walk(node[key], visit, node);
  }
}

/**
 * **The array methods that mutate their receiver.**
 *
 * One definition, because there were two: `tweenCallbacks.ts` (rooted at a `World` handle, where
 * these are entity spawn and removal) and `simMutators.ts` (rooted at a function parameter, where
 * they are a parameter write). The two roots are genuinely different rules — the LIST is not, and a
 * list maintained in two places drifts in one. Named by the 9.2/9.3 checklist brief.
 */
export const ARRAY_MUTATOR_METHODS: ReadonlySet<string> = new Set([
  'push',
  'pop',
  'shift',
  'unshift',
  'splice',
  'sort',
  'reverse',
  'fill',
]);
