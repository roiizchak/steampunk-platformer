/**
 * A real parser for criterion 9.2 — *"no game logic sequenced off a tween completion"*.
 *
 * **No assertions live here.** They live in `tween-callback-boundary.test.ts`. The seam is the one
 * `sourceScan.ts` and `gateVerdicts.ts` already establish: this is *how a source file is read*, not
 * *what is claimed about it*.
 *
 * ## Why a parser, and why one could not be used before
 *
 * `callbackCode()` — the regex extractor this replaces — was honest about four holes it could not
 * reach: a member-expression callback (`onComplete: this.foo`), an imported one, a config built
 * elsewhere and passed as a variable, and a **shadowed name** (first textual declaration wins;
 * there was no lexical scoping). Its docstring said *"closing them means a real parser, and the
 * project's dependency set is frozen"*.
 *
 * 🔴 **That sentence was correct, and this session checked it rather than assuming either way.**
 * TypeScript 7.0.2 is the Go port: `require('typescript')` exports exactly `version` and
 * `versionMajorMinor`. There is no `createSourceFile`. `typescript/unstable/ast` is a **scanner**
 * with no parser entry point, and `typescript/unstable/sync` is a Program/Checker API that drives
 * the native `tsgo` binary — an out-of-process dependency for a suite that must also run with
 * Phaser uninstalled (criterion 1.3).
 *
 * So the parser is a **dependency the owner authorised on 2026-08-24**, recorded in
 * `docs/qa/session-phase-09-debts.md`: `@babel/parser`, pinned exact, pure JS, no native binary,
 * one transitive package (`@babel/types`). It is a **devDependency** — nothing it does reaches
 * `dist/`, and `verify-dist.mjs` is unaffected.
 *
 * ## What ownership means here, and why the rule is stated that way
 *
 * The criterion is not about a mutation VERB. `flyers.delete(flyer)` is idempotent view bookkeeping
 * the criterion has no quarrel with; `world.player.hp = 0` is game state. What separates them is
 * **who owns the object**, and this project already declares that boundary: `src/sim/` is the
 * simulation, and a `World` is its root. Scenes hold one as `this.world` or `scene.simWorld`.
 *
 * A tween is wall-clock and the sim is 60 Hz integer ticks. `BaseTween.destroy()` runs **neither**
 * callback, `stop()` is silent for an already-completed tween, and a scene teardown mid-tween drops
 * the rest — so anything downstream of "the tween finished" can simply never happen. View state
 * that is idempotent survives that. Sim state does not.
 */

import { parse } from '@babel/parser';

/* eslint-disable @typescript-eslint/no-explicit-any -- the Babel AST is walked structurally. */
type Node = any;

/** Every way this codebase can open a tween. `chain` and `addCounter` are Phaser APIs too. */
const TWEEN_METHODS = new Set(['add', 'addCounter', 'addMultiple', 'chain', 'create']);

/** The config keys whose values run when the tween reaches a boundary. */
// 🔴 `onUpdate` added 2026-08-25 after a gate-round finding. Its absence falsified this
// module's own sibling claim that an `addCounter` freeze is caught here: a counter tween writes
// through `onUpdate` and through nothing else, so the one shape the rule most exists for was the
// one key it did not look at.
const CALLBACK_KEYS = new Set(['onComplete', 'onStop', 'onStart', 'onYoyo', 'onRepeat', 'onUpdate']);

/**
 * The names a `World` is held under in `src/scenes/`.
 *
 * 🔴 Rooted at the HANDLE, never at `player`. `player`, `playerSprite` and friends are common view
 * names, and a bare `player` root would report a sprite write as a sim write — a false red on a
 * blocker rule, which is how gates get edited instead of obeyed.
 */
const SIM_HANDLES = new Set(['world', 'simWorld']);

/** Array mutators. Reached through a sim handle, these are entity spawn and removal. */
const MUTATORS = new Set(['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse', 'fill']);

/** Progression that outlives the scene. Checked against the tree: the API is `writeProgress`. */
const PERSISTENCE = new Set(['writeProgress', 'recordCompletion']);

/** Flags a later TICK reads. A tween that never fires leaves one stuck at its old value. */
const CONTROL_FLAGS = new Set(['playerInputEnabled']);

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
function walk(node: Node, visit: (n: Node, parent: Node | null) => void, parent: Node | null = null): void {
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
 * Every `const x = <init>` and `function x()` in the file, by name.
 *
 * ⚠️ **This is file-wide, not lexically scoped, and that is a deliberate remaining narrowing.**
 * Two declarations of the same name in different scopes collapse; the LAST one wins here rather
 * than the first, which is the opposite of `callbackCode()`'s bias but no more correct. It is
 * recorded rather than closed because no shadowed callback name occurs on this tree — checked —
 * and a scope-chain resolver is materially more machine than the criterion has earned.
 */
function declarations(ast: Node): Map<string, Node> {
  const out = new Map<string, Node>();
  walk(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id?.type === 'Identifier' && n.init) out.set(n.id.name, n.init);
    // 🔴 **Destructuring, added 2026-08-25 after a gate-round finding.** The first version recorded
    // only `Identifier` ids, so `let p = scene.simWorld.player; p.hp = 0` was CAUGHT while the
    // identical `const { player } = scene.simWorld; player.hp = 0` was MISSED — and the session log
    // marked Codex PR-03, which names destructuring explicitly, as applied. Each binding is mapped to
    // a SYNTHETIC member expression (`<init>.<key>`), which `reachesSim` already knows how to walk, so
    // the alias resolves through exactly the same path a plain assignment does rather than a second
    // rule that can drift from it.
    else if (n.type === 'VariableDeclarator' && n.id?.type === 'ObjectPattern' && n.init) {
      for (const prop of n.id.properties ?? []) {
        const key = prop?.key?.type === 'Identifier' ? prop.key.name : prop?.key?.value;
        const bound = prop?.value?.type === 'Identifier' ? prop.value.name : undefined;
        if (typeof key === 'string' && bound !== undefined) {
          out.set(bound, {
            type: 'MemberExpression',
            object: n.init,
            property: { type: 'Identifier', name: key },
            computed: false,
          } as Node);
        }
      }
    }
    else if (n.type === 'FunctionDeclaration' && n.id?.type === 'Identifier') out.set(n.id.name, n);
    else if (n.type === 'ClassMethod' && n.key?.type === 'Identifier') out.set(n.key.name, n);
  });
  return out;
}

/**
 * Is this call one that opens a tween? `scene.tweens.add(…)`, `this.tweens.chain(…)`.
 *
 * 🔴 **Aliases of the MANAGER resolve too, added 2026-08-25 after a gate-round finding.** `const tm =
 * scene.tweens; tm.add({ onComplete })` was invisible to this, to 9.3b and to 9.3c at once — one
 * `const` and every tween rule in the project went quiet. `decls` is threaded in so the same
 * declaration map that already resolves `onStop: settle` answers this question as well.
 *
 * ⚠️ Still a NAME test at the root — `tweens`, or a local bound to something named `tweens`. A
 * manager reached by a route with no `tweens` identifier anywhere (a constructor parameter, an
 * import) is out of reach and is recorded rather than claimed.
 */
function isTweenCall(n: Node, decls: Map<string, Node>): boolean {
  if (n.type !== 'CallExpression' && n.type !== 'OptionalCallExpression') return false;
  const callee = n.callee;
  if (callee?.type !== 'MemberExpression' && callee?.type !== 'OptionalMemberExpression') return false;
  const method = callee.computed ? callee.property?.value : callee.property?.name;
  if (typeof method !== 'string' || !TWEEN_METHODS.has(method)) return false;
  return namesTweenManager(callee.object, decls);
}

/** `tweens`, `scene.tweens`, or a local whose initialiser is one of those. Depth-limited like `reachesSim`. */
function namesTweenManager(obj: Node, decls: Map<string, Node>, depth = 0): boolean {
  if (!obj || depth > 4) return false;
  const name = obj.type === 'Identifier' ? obj.name : (obj.property?.name ?? obj.property?.value);
  if (name === 'tweens') return true;
  if (obj.type !== 'Identifier') return false;
  const init = decls.get(obj.name);
  return init === undefined ? false : namesTweenManager(init, decls, depth + 1);
}

/**
 * The function nodes a tween's callbacks will run.
 *
 * 🔴 Every INLINE form falls out of the AST for free — arrow, block-bodied, expression-bodied,
 * `function`, `async`, shorthand method, quoted key, computed key. The regex extractor needed eight
 * separate observations to reach the same place, and the Codex review showed it short of all eight.
 *
 * The two INDIRECT forms are resolved through `declarations()`: a bare identifier (`onStop: settle`)
 * and a member expression (`onComplete: this.foo`) — the latter being one of the four holes the
 * regex extractor named and could not close.
 */
export function callbackNodes(ast: Node): Node[] {
  const decls = declarations(ast);
  const out: Node[] = [];
  const resolve = (value: Node, depth = 0): void => {
    if (!value || depth > 3) return;
    if (value.type === 'ArrowFunctionExpression' || value.type === 'FunctionExpression') out.push(value.body);
    else if (value.type === 'ObjectMethod' || value.type === 'ClassMethod' || value.type === 'FunctionDeclaration') {
      out.push(value.body);
    } else if (value.type === 'Identifier') resolve(decls.get(value.name), depth + 1);
    else if (value.type === 'MemberExpression' && value.property?.type === 'Identifier') {
      // `this.foo` / `helpers.foo` — resolve by member NAME, which is why class methods are in the map.
      resolve(decls.get(value.property.name), depth + 1);
    }
  };
  walk(ast, (n) => {
    if (!isTweenCall(n, decls)) return;
    walk(n.arguments, (a) => {
      if (a.type === 'ObjectProperty' || a.type === 'ObjectMethod') {
        const key = a.computed && a.key?.type !== 'StringLiteral' ? null : a.key?.name ?? a.key?.value;
        if (typeof key === 'string' && CALLBACK_KEYS.has(key)) resolve(a.type === 'ObjectMethod' ? a : a.value);
      }
    });
  });
  return out;
}

/** The base of a member chain: `a.b.c[d]` → the `a` node. */
function rootOf(node: Node): Node {
  let cur = node;
  while (cur?.type === 'MemberExpression' || cur?.type === 'OptionalMemberExpression') cur = cur.object;
  return cur;
}

/**
 * Does this expression reach into a `World`?
 *
 * Three ways, and the third is the one a regex cannot do: the base identifier is a **local alias**
 * for something that itself roots at a sim handle. `const p = scene.simWorld.player; p.hp = 0` is
 * the shape the Codex review named, and it is now the same finding as the direct write.
 */
function reachesSim(node: Node, decls: Map<string, Node>, depth = 0): boolean {
  if (!node || depth > 4) return false;
  // `a.simWorld.player` / `this.world.player` — a sim handle anywhere along the chain.
  let cur = node;
  while (cur?.type === 'MemberExpression' || cur?.type === 'OptionalMemberExpression') {
    const name = cur.computed ? cur.property?.value : cur.property?.name;
    if (typeof name === 'string' && SIM_HANDLES.has(name)) return true;
    cur = cur.object;
  }
  const root = rootOf(node);
  if (root?.type !== 'Identifier') return false;
  if (SIM_HANDLES.has(root.name)) return true;
  const init = decls.get(root.name);
  return init === undefined ? false : reachesSim(init, decls, depth + 1);
}

export interface Violation {
  readonly what: string;
  readonly code: string;
}

/**
 * Sim-state writes inside a tween callback body.
 *
 * Four shapes, each a way a wall-clock callback can leave the game in a state the tick loop reads:
 * a write through a sim handle, an entity added to or removed from a sim collection, a persisted
 * progression write, and a control flag a later tick consumes.
 */
export function simWrites(body: Node, decls: Map<string, Node>, depth = 0): Violation[] {
  const out: Violation[] = [];
  const say = (what: string, n: Node): void => {
    out.push({ what, code: n.type });
  };
  walk(body, (n) => {
    if (n.type === 'AssignmentExpression' || n.type === 'UpdateExpression') {
      const target = n.type === 'AssignmentExpression' ? n.left : n.argument;
      const prop = target?.type === 'MemberExpression' ? (target.computed ? target.property?.value : target.property?.name) : target?.name;
      if (typeof prop === 'string' && CONTROL_FLAGS.has(prop)) say('a next-tick control flag', n);
      else if (reachesSim(target, decls)) say('a sim-state write', n);
    } else if (n.type === 'CallExpression' || n.type === 'OptionalCallExpression') {
      const callee = n.callee;
      if (callee?.type === 'Identifier' && PERSISTENCE.has(callee.name)) say('a persisted progression write', n);
      else if (callee?.type === 'MemberExpression' || callee?.type === 'OptionalMemberExpression') {
        const method = callee.computed ? callee.property?.value : callee.property?.name;
        if (typeof method === 'string' && PERSISTENCE.has(method)) say('a persisted progression write', n);
        else if (typeof method === 'string' && MUTATORS.has(method) && reachesSim(callee.object, decls)) {
          say('a sim entity spawn or removal', n);
        }
      }
      // 🔴 **A sim object HANDED to a function, added 2026-08-25 after a gate-round finding.**
      // `src/sim/` is mutating functions that take sim objects as arguments — `damagePlayer(player, 1)`,
      // `killPlayer`, `stepEnemies`, `advance` — and every one of them was invisible, because the rule
      // looked only at assignment targets and mutator receivers. Passing sim state out of a wall-clock
      // callback IS the ownership violation whatever the callee then does with it, so the argument is
      // the evidence and the callee's body does not have to be resolved.
      for (const arg of n.arguments ?? []) {
        if (reachesSim(arg, decls)) {
          say('a sim object passed out of a tween callback', n);
          break;
        }
      }
      // 🔴 **And ONE hop through a local helper.** `onComplete: finish` was caught while
      // `onComplete: () => finish()` — the same helper, the same write, six characters apart — was
      // not, because the walk never followed a call. Depth-limited to 2 hops: deeper than that and
      // the resolution is guessing, and the narrowing is stated rather than silently unbounded.
      const callee2 = n.callee;
      if (depth < 2 && callee2?.type === 'Identifier') {
        const decl = decls.get(callee2.name);
        if (decl !== undefined) {
          for (const v of simWrites(decl, decls, depth + 1)) out.push(v);
        }
      }
    }
  });
  return out;
}

/** Everything a file's tween callbacks do that the criterion forbids. */
export function simWriteViolations(code: string): Violation[] {
  const ast = parseFile(code);
  const decls = declarations(ast);
  return callbackNodes(ast).flatMap((body) => simWrites(body, decls));
}

/**
 * The SOURCE TEXT of every tween callback body — the AST answer to `callbackCode()`'s question.
 *
 * Exists so the **sequencing** half of 9.2 can be checked against the parser as well as against the
 * regex extractor, without deleting a rule that has committed fixtures and has never been wrong.
 * Two extractors agreeing is not the goal; the goal is that a disagreement is **visible**, which is
 * what `9.2c` asserts. Where they differ, this one reaches further: `onComplete: this.foo`, an
 * imported callback, and a config built elsewhere are three of `callbackCode()`'s four named holes.
 */
export function callbackText(code: string): string {
  const ast = parseFile(code);
  return callbackNodes(ast)
    .map((body) => (typeof body?.start === 'number' ? code.slice(body.start, body.end) : ''))
    .join('\n');
}
