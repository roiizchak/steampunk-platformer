// The dev-seam gate's PARSER half — the residual hole named in `devSeamGate.mjs`'s header, closed
// 2026-08-27 by owner decision.
//
// ## The hole this closes
//
// `SENTINEL_MANIFEST` binds each token to a FILE. That stops a token being re-homed into a different
// file — the mutation the Codex implementation review built, which shipped a DEV body with both
// gates printing OK. It does not stop the same move WITHIN one file: take
// `__DEVSEAM_globals_updateDebugState__` out of `updateDebugState`, delete that function's guard,
// and paste the token into `installDebugGlobals` — which is guarded — and the manifest is satisfied
// exactly. Same file, same token, same count. The header said so in as many words and called it
// "narrowed, not closed", because closing it needs a parser and `@babel/parser` was approved
// **test-only**.
//
// The owner authorised the widening on 2026-08-27. It is a devDependency already pinned at 8.0.4
// exactly, it runs only in `vite build`, and **nothing about it reaches `dist/`** — the gate is a
// `generateBundle` hook, not a transform.
//
// ## Two rules, and the second is the one that closes the hole
//
//   1. **DOMINANCE** — a sentinel must be unreachable unless `import.meta.env.DEV`. Recognised
//      shapes only; anything unrecognised is reported unguarded rather than assumed fine.
//   2. **SITE** — a sentinel must sit in the function the manifest names. Moving it between two
//      guarded bodies in one file changes its site, and that is the mutation nothing could see.
//
// ⚠️ **Rule 1 alone would NOT have closed the hole**, and it is worth being explicit about that
// because it is the intuitive fix. Both the origin and the destination of the same-file move are
// guarded, so dominance holds at both ends. The *site* is the discriminator.
//
// ## The five files with no local guard, and why they are not a loophole
//
// `render/enemyTuning.ts`, `devFeelTuner.ts`, `devMotionProbe.ts`, `devSpawn.ts` (two seams) and
// `gymKeys.ts` carry their sentinel at the top of an exported function with **no
// `import.meta.env.DEV` beside it**. They are DEV-only MODULES: the guard is at every call site,
// which is what lets Rolldown drop the whole module. A blanket dominance rule false-reds all five —
// the exact failure mode of the `renderedLength` rule this gate deleted on 2026-08-26 — so they are
// declared, by file, in `DEV_ONLY_MODULES`.
//
// That declaration is not a hole: a DEV-only module's callers each carry their own sentinel, those
// sentinels ARE dominated, and if a caller's guard disappears the caller's own seam leaks. The
// module list buys nothing an attacker could use and costs one deliberate edit to extend.

import { parse } from '@babel/parser';

/**
 * Files whose every export is DEV-only and whose guard therefore lives at the call site.
 *
 * 🔴 Adding a file here EXEMPTS it from the dominance rule. Do it only for a module that ships no
 * production code at all — `verify-dist.mjs` is what proves the module actually left the bundle.
 */
export const DEV_ONLY_MODULES = new Set([
  'src/render/enemyTuning.ts',
  'src/scenes/devFeelTuner.ts',
  'src/scenes/devMotionProbe.ts',
  'src/scenes/devSpawn.ts',
  'src/scenes/gymKeys.ts',
]);

/**
 * `import.meta.env.DEV`, and nothing else.
 *
 * Every walker below takes `any`: this file navigates a Babel AST by shape, and the alternative is
 * `@babel/types`, which is a transitive package the project has chosen not to depend on directly.
 * The shapes are checked at every step, so an unexpected node falls through to "not a guard" rather
 * than throwing — which is the safe direction for a gate.
 *
 * @param {any} node
 * @returns {boolean}
 */
function isDevFlag(node) {
  return (
    node?.type === 'MemberExpression' &&
    !node.computed &&
    node.property?.name === 'DEV' &&
    node.object?.type === 'MemberExpression' &&
    node.object.property?.name === 'env' &&
    node.object.object?.type === 'MetaProperty' &&
    node.object.object.meta?.name === 'import' &&
    node.object.object.property?.name === 'meta'
  );
}

/**
 * Does reaching the consequent of this test imply DEV?
 *
 * `DEV`, `DEV && x`, `x && DEV`. Deliberately NOT `DEV || x` — that reaches the consequent with DEV
 * false — and deliberately not a bare truthy expression that merely mentions DEV somewhere.
 *
 * @param {any} node
 * @returns {boolean}
 */
function impliesDev(node) {
  if (isDevFlag(node)) return true;
  if (node?.type === 'LogicalExpression' && node.operator === '&&') {
    return impliesDev(node.left) || impliesDev(node.right);
  }
  return false;
}

/**
 * Does FALLING PAST this test imply DEV? The early-return shape.
 *
 * `!DEV`, `!DEV || x`, `x || !DEV`. If the test is true the body exits, so every statement after it
 * runs only when DEV. `bootAssets.ts`'s `!import.meta.env.DEV || index !== 0` is the second form.
 *
 * @param {any} node
 * @returns {boolean}
 */
function negatedDev(node) {
  if (node?.type === 'UnaryExpression' && node.operator === '!') return impliesDev(node.argument);
  if (node?.type === 'LogicalExpression' && node.operator === '||') {
    return negatedDev(node.left) || negatedDev(node.right);
  }
  return false;
}

/**
 * Every path out of this statement leaves the enclosing function.
 *
 * @param {any} node
 * @returns {boolean}
 */
function alwaysExits(node) {
  if (!node) return false;
  if (node.type === 'ReturnStatement' || node.type === 'ThrowStatement') return true;
  if (node.type === 'BlockStatement') return node.body.some(alwaysExits);
  if (node.type === 'IfStatement') return alwaysExits(node.consequent) && alwaysExits(node.alternate);
  return false;
}

/**
 * The name to record for a function-ish node, or undefined if it has none of its own.
 *
 * @param {any} node
 * @returns {string | undefined}
 */
function ownName(node) {
  if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') {
    return node.id?.name;
  }
  if (node.type === 'ClassMethod' || node.type === 'ObjectMethod') {
    return node.key?.name ?? (node.key?.type === 'StringLiteral' ? node.key.value : undefined);
  }
  return undefined;
}

const FUNCTION_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
  'ClassMethod',
  'ObjectMethod',
  'ClassPrivateMethod',
]);

/**
 * Every `devSeam('__DEVSEAM_…__')` call in one source file, with the function it sits in and
 * whether reaching it implies `import.meta.env.DEV`.
 *
 * @param {string} source
 * @param {string} filePath repo-relative, forward slashes
 * @returns {{ token: string; site: string; guarded: boolean; line: number }[]}
 */
export function sentinelSites(source, filePath) {
  const ast = parse(source, {
    sourceType: 'module',
    plugins: ['typescript', 'decorators-legacy'],
    errorRecovery: false,
  });

  /** @type {{ token: string; site: string; guarded: boolean; line: number }[]} */
  const found = [];
  const devModule = DEV_ONLY_MODULES.has(filePath);

  /**
   * @param {any} node
   * @param {{ guarded: boolean; site: string }} ctx
   */
  const walk = (node, ctx) => {
    if (node === null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, ctx);
      return;
    }
    if (typeof node.type !== 'string') return;

    // A sentinel call.
    if (
      node.type === 'CallExpression' &&
      node.callee?.type === 'Identifier' &&
      node.callee.name === 'devSeam' &&
      node.arguments?.[0]?.type === 'StringLiteral' &&
      node.arguments[0].value.startsWith('__DEVSEAM_')
    ) {
      found.push({
        token: node.arguments[0].value,
        site: ctx.site,
        guarded: ctx.guarded || devModule,
        line: node.loc?.start.line ?? 0,
      });
      return;
    }

    // Entering a function renames the site. It does NOT clear `guarded`: a function DECLARED inside
    // a guarded block is itself dev-only, and a callback passed to a guarded call is reached only
    // through it. What clears the flag is nothing — guarding is monotonic on the way down.
    if (FUNCTION_TYPES.has(node.type)) {
      const named = ownName(node);
      const inner = named === undefined ? ctx : { ...ctx, site: named };
      for (const key of Object.keys(node)) {
        if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
        walk(node[key], inner);
      }
      return;
    }

    // `const foo = () => { … }` — the declarator's name is the site for its initialiser.
    if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
      walk(node.init, { ...ctx, site: node.id.name });
      return;
    }

    // `import.meta.env.DEV ? guarded : not`
    if (node.type === 'ConditionalExpression') {
      walk(node.test, ctx);
      walk(node.consequent, impliesDev(node.test) ? { ...ctx, guarded: true } : ctx);
      walk(node.alternate, ctx);
      return;
    }

    // `import.meta.env.DEV && guarded`
    if (node.type === 'LogicalExpression' && node.operator === '&&') {
      walk(node.left, ctx);
      walk(node.right, impliesDev(node.left) ? { ...ctx, guarded: true } : ctx);
      return;
    }

    if (node.type === 'IfStatement') {
      walk(node.test, ctx);
      walk(node.consequent, impliesDev(node.test) ? { ...ctx, guarded: true } : ctx);
      walk(node.alternate, ctx);
      return;
    }

    // A block is where the early-return shape becomes visible: once an `if (!DEV) return` has been
    // passed, every later statement in THIS block is guarded.
    if (node.type === 'BlockStatement' || node.type === 'Program') {
      let ctxHere = ctx;
      for (const stmt of node.body) {
        walk(stmt, ctxHere);
        if (stmt.type === 'IfStatement' && negatedDev(stmt.test) && alwaysExits(stmt.consequent)) {
          ctxHere = { ...ctxHere, guarded: true };
        }
      }
      return;
    }

    for (const key of Object.keys(node)) {
      if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments') continue;
      walk(node[key], ctx);
    }
  };

  walk(ast.program, { guarded: false, site: '<module>' });
  return found;
}
