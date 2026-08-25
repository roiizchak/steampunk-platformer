/**
 * **Tween IDENTITY** — is a given call node one that opens a tween, and what is it opened *through*?
 *
 * Extracted from `tweenCallbacks.ts` on 2026-08-25, when closing D14 pushed that file to 390 of the
 * 400-line limit (CLAUDE.md §3) and the `SIM_MUTATORS` work was about to add more. The seam is a real
 * one and not a convenience: this answers *"is this a tween, and whose?"*, while `tweenCallbacks.ts`
 * answers *"what runs when it finishes, and does that touch sim state?"* — the same
 * identity/behaviour split `sourceScan.ts` and `gateVerdicts.ts` already sit on.
 *
 * ⚠️ Both name tests below are **NAME tests at the root**. A manager or factory reached by a route
 * with no `tweens`/`add` identifier anywhere — a constructor parameter, an import — is out of reach,
 * and that is recorded rather than claimed.
 */

import type { Node } from './astWalk';

/** Every way this codebase can open a tween. `chain` and `addCounter` are Phaser APIs too. */
const TWEEN_METHODS = new Set(['add', 'addCounter', 'addMultiple', 'chain', 'create']);

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
export function isTweenCall(n: Node, decls: Map<string, Node>): boolean {
  if (n.type !== 'CallExpression' && n.type !== 'OptionalCallExpression') return false;
  const callee = n.callee;
  if (callee?.type !== 'MemberExpression' && callee?.type !== 'OptionalMemberExpression') return false;
  const method = callee.computed ? callee.property?.value : callee.property?.name;
  if (typeof method !== 'string') return false;
  // 🔴 **D14, closed 2026-08-25.** `add.tween(config)` is a real Phaser 4.2.1 entry point — the
  // factory at `phaser.d.ts:26869` and the creator at `:28201` — and it opens a tween without the
  // identifier `tweens` appearing anywhere, so it bypassed this function entirely and with it 9.3d,
  // 9.2b and 9.2c. The recorded blocker was *"resolving what `add` is bound to, a different machine
  // from a pattern"*; it is the same machine. `tween` is unique to the factory and creator (the
  // manager has no `.tween()`), so the method name alone selects the entry point, and the object
  // test below is the same alias-resolving name test `namesTweenManager` already was.
  if (method === 'tween') return namesSceneFactory(callee.object, decls);
  if (!TWEEN_METHODS.has(method)) return false;
  return namesTweenManager(callee.object, decls);
}

/**
 * `this.add`, `scene.add`, or a local bound to one of those — the Phaser GameObject factory.
 *
 * ⚠️ **Deliberately STRICTER than `namesTweenManager`, and the asymmetry is the point.** That
 * function accepts a bare `tweens` identifier because `tweens` is a distinctive name that means one
 * thing in this codebase. **`add` is not** — it is an ordinary English verb, and a bare
 * `add.tween(...)` on some unrelated object would be a false red on legal code. So this requires the
 * factory to be reached through a MEMBER expression (`<something>.add`), which is what a Phaser
 * scene always does, and refuses a bare `add` identifier that resolves to nothing.
 *
 * An alias still resolves: `const add = this.add; add.tween({…})` is caught, because `decls` maps
 * `add` back to the member expression. Raised by the Codex plan review, which was right that
 * treating the name `add` as sufficient Phaser identity would red an unrelated object.
 */
function namesSceneFactory(obj: Node, decls: Map<string, Node>, depth = 0): boolean {
  if (!obj || depth > 4) return false;
  if (obj.type === 'MemberExpression' || obj.type === 'OptionalMemberExpression') {
    const prop = obj.computed ? obj.property?.value : obj.property?.name;
    return prop === 'add';
  }
  if (obj.type !== 'Identifier') return false;
  const init = decls.get(obj.name);
  return init === undefined ? false : namesSceneFactory(init, decls, depth + 1);
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

