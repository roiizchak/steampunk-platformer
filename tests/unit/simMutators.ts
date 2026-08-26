/**
 * **Which `src/sim/` exports mutate a sim object handed to them** — the reviewed manifest, its
 * documented exclusions, and the derivation that keeps the manifest honest.
 *
 * ## What this is for
 *
 * Criterion 9.2b forbids a tween callback from writing sim-owned state. One shape that takes is
 * `onComplete: () => damagePlayer(world.player, 1)` — the callback writes nothing itself, it hands a
 * sim object to something that does. `tweenCallbacks.ts` needs a set of those functions.
 *
 * ## Why a manifest and not a derived set, decided 2026-08-25
 *
 * The set could be computed at test time and used directly. It is not, and the reason is the failure
 * direction. The rule is enforced against a **name** at the call site, so:
 *
 * - A **missing** name is a gap — the gate under-reports, and `manifestGaps()` below turns
 *   that into a red with the name in the message.
 * - An **over-inferred** name is a false RED on legal production code, and the project's own history
 *   says a false red on a blocker rule is how gates get edited instead of obeyed.
 *
 * A heuristic that is occasionally wrong is therefore safe in one direction and dangerous in the
 * other. The manifest is what a human agreed to; the derivation is the tripwire that says when the
 * manifest has fallen behind. Every exclusion carries a written reason, so the exclusions are
 * reviewable rather than absent.
 *
 * A full interprocedural, alias-aware closure was considered and rejected for this reason as much as
 * for its size: more inference means more false reds in the one direction that hurts.
 *
 * ## The derivation's rule, and the case that shaped it
 *
 * An exported `function` is a mutator when it **writes to one of its own parameters** — assignment,
 * update, or an array mutator on a param root — **or** hands one of its own parameters to something
 * already known to be a mutator.
 *
 * 🔴 **That last clause says "one of its OWN parameters" for a measured reason.** `derivedFeel()`
 * (`src/sim/derived.ts:95`) calls `advance(jump.world, …)`, but `jump` is a scratch world it builds
 * itself — it is pure from the caller's view. A closure that only asked *"does it call a mutator?"*
 * reported it, which would have put a pure function into a rule that reds on the name. Requiring the
 * argument to be the caller's own parameter drops it, and drops nothing that is really a mutator.
 */

import { ARRAY_MUTATOR_METHODS, parseFile, walk, type Node } from './astWalk';

/**
 * The reviewed set. **33 names**, read off `src/sim/` on 2026-08-25 and agreed against the
 * derivation below.
 *
 * ⚠️ It was **six** until this date, against 86 exported functions — **26 direct param-writers and 32
 * in the transitive closure.** `tick(world, input)`, the single most obviously param-mutating function
 * in the simulation, was **absent**. So the previous narrowing was not *"a new export is invisible
 * until someone adds it"*; the rule was already **81 % incomplete**.
 *
 * ⚠️ **Growing this set is only safe because `simImports()` resolves identity first.** Matched against
 * a bare callee name alone, 32 common verbs (`tick`, `advance`, `enterState`, `resolveState`) would
 * make any local helper sharing a name illegal — enforcement by collision, and far broader than the
 * authorised rule. That ordering was the owner's ruling of 2026-08-25 and it is load-bearing, not
 * stylistic.
 */
export const SIM_MUTATORS = new Set([
  // Added 2026-08-25 by the Codex implementation review: it writes `gear.collected` through a
  // `for (const gear of world.gears)` alias, which the derivation could not see until aliases were
  // resolved. The gate named it the moment they were.
  'collectGears',
  'advance',
  'advanceSplit',
  'advanceStride',
  'applyPlayerAttack',
  'applyWorldDamage',
  'clampToBounds',
  'consumeAttackPress',
  'consumeJumpPress',
  'damagePlayer',
  'enterCombatState',
  'enterState',
  'freezeOne',
  'freezePair',
  'killPlayer',
  'latchAttackPress',
  'latchJumpPress',
  'maybeStartSwing',
  'nextFloat',
  'nextU32',
  'releaseAggro',
  'resolveCollisions',
  'resolveState',
  'respawnPlayer',
  'stepCombat',
  'stepEnemies',
  'stepGoalEntry',
  'stepHorizontal',
  'stepPlayerMotion',
  'stepScavenger',
  'stepSentry',
  'stepVertical',
  'tick',
]);

/**
 * Derived mutators the manifest deliberately omits, each with the reason.
 *
 * Empty today. It exists so that a future disagreement between the derivation and human judgement is
 * **recorded** rather than resolved by quietly editing the manifest — which is the move this project
 * calls "clearing a red hash by editing the hash".
 */
export const EXCLUDED: Record<string, string> = {};

const rootOf = (n: Node): Node => {
  let cur = n;
  // TS wrapper nodes unwrapped for the same reason as `tweenCallbacks.ts`s `rootOf`: `w!.x = 1`
  // otherwise roots at a node with no `.name` and the parameter write goes unseen.
  for (;;) {
    if (cur?.type === 'MemberExpression' || cur?.type === 'OptionalMemberExpression') cur = cur.object;
    else if (cur?.type === 'TSNonNullExpression' || cur?.type === 'TSAsExpression') cur = cur.expression;
    else if (cur?.type === 'TSSatisfiesExpression' || cur?.type === 'ParenthesizedExpression') cur = cur.expression;
    else return cur;
  }
};

interface Fn {
  params: Set<string>;
  writesOwnParam: boolean;
  /** Callees that received one of this function's own parameters. */
  passesOwnParamTo: Set<string>;
}

/** Every exported `function` in the given `src/sim/` sources, with what it does to its parameters. */
function exportedFunctions(sources: Record<string, string>): Map<string, Fn> {
  const out = new Map<string, Fn>();
  for (const [file, code] of Object.entries(sources)) {
    if (!/\/src\/sim\/[^/]+\.ts$/.test(file)) continue;
    walk(parseFile(code), (n: Node) => {
      if (n.type !== 'ExportNamedDeclaration') return;
      const d = n.declaration;
      if (!d || d.type !== 'FunctionDeclaration' || !d.id) return;
      const params = new Set<string>(
        (d.params ?? [])
          .map((p: Node) => (p.type === 'Identifier' ? p.name : (p.left?.name ?? p.argument?.name)))
          .filter((x: unknown): x is string => typeof x === 'string'),
      );
      const fn: Fn = { params, writesOwnParam: false, passesOwnParamTo: new Set() };

      // 🔴 **Aliases of a parameter count as the parameter, and their absence hid a REAL mutator.**
      // `collectGears(world, …)` (`src/sim/pickups.ts:115`) writes `gear.collected` inside
      // `for (const gear of world.gears)`. The root of that write is `gear`, a local — so a rule
      // that only recognises writes rooted at a parameter identifier missed it entirely, and
      // `collectGears` was absent from the manifest while being one of the plainest mutators in the
      // simulation. Named by the Codex implementation review, verified against the source.
      //
      // Two alias forms: `for (const x of p…)` and `const x = p…`. Iterated to a fixed point, so an
      // alias of an alias is reached — `const gs = world.gears; for (const g of gs)` is ordinary
      // code, and stopping at one hop would leave the same class of hole one level down.
      //
      // ⚠️ It is deliberately NOT a general dataflow analysis. It follows *member paths rooted at a
      // parameter* and nothing else — not a function return, not an array index into a foreign
      // value, not a conditional. Over-inference here is a false red on production code, which is
      // the failure direction the header argues against; a missed alias is a gap `manifestGaps()`
      // reports by name.
      const roots = new Set(params);
      for (let changed = true; changed; ) {
        changed = false;
        walk(d.body, (m: Node) => {
          let name: string | undefined;
          let from: Node | undefined;
          if (m.type === 'ForOfStatement') {
            const decl = m.left?.type === 'VariableDeclaration' ? m.left.declarations?.[0] : undefined;
            if (decl?.id?.type === 'Identifier') name = decl.id.name;
            from = m.right;
          } else if (m.type === 'VariableDeclarator' && m.id?.type === 'Identifier') {
            name = m.id.name;
            from = m.init;
          }
          if (name === undefined || from === undefined || roots.has(name)) return;
          const src = rootOf(from);
          if (src?.type === 'Identifier' && roots.has(src.name)) {
            roots.add(name);
            changed = true;
          }
        });
      }

      walk(d.body, (m: Node) => {
        if (m.type === 'AssignmentExpression' || m.type === 'UpdateExpression') {
          const target = m.type === 'AssignmentExpression' ? m.left : m.argument;
          const root = rootOf(target);
          // `p.x = 1` writes through the param; a bare `p = 1` only rebinds the local slot.
          if (root?.type === 'Identifier' && roots.has(root.name) && target !== root) fn.writesOwnParam = true;
        }
        if (m.type !== 'CallExpression' && m.type !== 'OptionalCallExpression') return;
        const callee = m.callee;
        if (callee?.type === 'Identifier') {
          for (const arg of m.arguments ?? []) {
            const root = rootOf(arg);
            if (root?.type === 'Identifier' && roots.has(root.name)) {
              fn.passesOwnParamTo.add(callee.name);
              break;
            }
          }
        } else if (callee?.type === 'MemberExpression') {
          const method = callee.property?.name;
          const root = rootOf(callee.object);
          if (typeof method === 'string' && ARRAY_MUTATOR_METHODS.has(method) && root?.type === 'Identifier' && roots.has(root.name)) {
            fn.writesOwnParam = true;
          }
        }
      });
      out.set(d.id.name, fn);
    });
  }
  return out;
}

export interface Derivation {
  /** Every exported function found, mutator or not — the vacuity denominator. */
  readonly exportedCount: number;
  /** Exports that write to one of their own parameters directly. */
  readonly direct: string[];
  /** Direct writers plus everything that hands an own-parameter to one, to a fixed point. */
  readonly closure: string[];
}

/** Re-derive the mutator set from source. See the header for the rule and why it is shaped that way. */
export function deriveSimMutators(sources: Record<string, string>): Derivation {
  const fns = exportedFunctions(sources);
  const closure = new Set<string>([...fns].filter(([, f]) => f.writesOwnParam).map(([n]) => n));
  const direct = [...closure].sort();
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, f] of fns) {
      if (closure.has(name)) continue;
      if ([...f.passesOwnParamTo].some((c) => closure.has(c))) {
        closure.add(name);
        changed = true;
      }
    }
  }
  return { exportedCount: fns.size, direct, closure: [...closure].sort() };
}

/** Names the derivation found that the manifest neither lists nor excludes. */
export function manifestGaps(d: Derivation): string[] {
  // 🔴 `Object.hasOwn`, not `EXCLUDED[n] === undefined`. `EXCLUDED` is a plain object literal, so
  // an export named `toString`, `valueOf` or `constructor` resolves on Object.prototype and reads as
  // ALREADY EXCLUDED — a gap silently swallowed by the prototype chain. No such export exists in
  // `src/sim/` today; the lookup is corrected rather than the absence relied on.
  return d.closure.filter((n) => !SIM_MUTATORS.has(n) && !Object.hasOwn(EXCLUDED, n));
}
