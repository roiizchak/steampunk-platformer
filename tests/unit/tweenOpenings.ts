/**
 * The tween-OPENER inventory: which calls start a tween, and whether their handle is held.
 *
 * Split out of `tweenCallbacks.ts` on 2026-08-25 (the 400-line rule, CLAUDE.md §3). The seam is a
 * real one — that file answers *"what will this tween's callbacks run?"* for criteria 9.2/9.2b/9.2c,
 * and this one answers *"was the handle kept?"* for criterion 9.3. They share the parser and the
 * alias resolution and nothing else.
 */

import { declarations, isTweenCall, parseFile, walk, type Node } from './tweenCallbacks';

/** One tween-opening call, as the AST sees it. */
export interface TweenOpening {
  /** `add`, `addCounter`, `chain`, … — the method that opened it. */
  method: string;
  /** Was the result bound to a name, returned, or assigned? `false` is fire-and-forget. */
  held: boolean;
  /** Was it opened through an ALIAS of the manager rather than a literal `tweens.` chain? */
  aliased: boolean;
  /**
   * The name the handle was bound to — `t`, `this.pulse` — or `null` when it was `return`ed, bound
   * to something unnameable, or not held at all.
   *
   * Held-ness alone cannot express a teardown obligation: `tweenTeardown.ts` needs to know *which*
   * handle, because a file that stops one of its two tweens is not a file that stops both.
   */
  handle: string | null;
}

/**
 * A member chain as dotted text: `this.hud.pulse` -> `"this.hud.pulse"`, `t` -> `"t"`.
 *
 * `null` for anything a name cannot be given to — a computed access (`live[i]`), a call result
 * (`getTween().stop()`), a literal. Those are unnameable by construction, and a rule keyed on names
 * has to say so rather than invent one.
 */
export function pathOf(n: Node | null | undefined): string | null {
  if (!n) return null;
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'ThisExpression') return 'this';
  if (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression') {
    if (n.computed) return null;
    const base = pathOf(n.object);
    const prop = n.property?.name;
    return base && typeof prop === 'string' ? `${base}.${prop}` : null;
  }
  // `await t.stop()`, `(t as Tween).stop()`, `t!.stop()` — transparent to the name underneath.
  if (n.type === 'AwaitExpression') return pathOf(n.argument);
  if (n.type === 'TSNonNullExpression' || n.type === 'TSAsExpression' || n.type === 'ParenthesizedExpression') {
    return pathOf(n.expression);
  }
  return null;
}

/**
 * Every tween-opening call in a file, with whether its handle is held — **alias-aware**.
 *
 * 🔴 **This exists because the alias repair was only HALF applied, and the Codex implementation
 * review caught the other half being claimed.** `isTweenCall` was taught to resolve
 * `const tm = scene.tweens` on 2026-08-25, which closed the CALLBACK rules (9.2b, 9.2c). Criterion
 * 9.3's two rules were untouched and still are pattern-driven: `TWEENS_ADD` requires the literal
 * word `tweens`, and the 9.3c scan filters files by `code.includes('tweens.add')`. So
 * `const tm = scene.tweens; tm.add({…})` with no teardown passed **both** handle gates while the gate
 * log recorded the alias hole as closed. One `const` still silenced a non-negotiable.
 *
 * ⚠️ **It is added BESIDE the regex rules, not instead of them** — the same shape 9.2c already takes.
 * The patterns have committed fixtures and have never been wrong on this tree, and replacing a proven
 * rule with a new one is how a gate that worked becomes a gate nobody has watched fail.
 *
 * "Held" is answered from the PARENT node — a declarator's init, an assignment's right-hand side, or
 * a `return` argument — rather than from the characters preceding the call, which is what the regex
 * has to do and why argument position took it two attempts to classify.
 */
export function tweenOpenings(ast: Node): TweenOpening[] {
  const decls = declarations(ast);
  const out: TweenOpening[] = [];
  // Parents, captured in a first pass, so `held` can walk OUT through transparent wrappers rather
  // than asking only about the immediate parent.
  const parentOf = new Map<Node, Node | null>();
  walk(ast, (n, parent) => parentOf.set(n, parent));
  walk(ast, (n, parent) => {
    if (!isTweenCall(n, decls)) return;
    const callee = n.callee;
    const method = callee.computed ? callee.property?.value : callee.property?.name;
    const obj = callee.object;
    // A literal `tweens` anywhere in the callee chain means it was NOT reached through an alias.
    let cur = obj;
    let literal = false;
    while (cur) {
      const name = cur.type === 'Identifier' ? cur.name : (cur.property?.name ?? cur.property?.value);
      if (name === 'tweens') { literal = true; break; }
      cur = cur.object;
    }
    // 🔴 `await` and the TS wrappers are TRANSPARENT, not holds. `await tm.add(...)` on its own
    // discards the handle exactly as a bare call does; the first version returned `held: true` for it
    // and so excused the very shape the rule exists to catch. Named by the Codex implementation
    // review. What matters is the nearest ENCLOSING node that keeps the value, so wrappers are
    // walked through before the question is asked.
    const TRANSPARENT = new Set(['AwaitExpression', 'TSNonNullExpression', 'TSAsExpression', 'ParenthesizedExpression']);
    let value = n;
    let owner = parent;
    while (owner && TRANSPARENT.has(owner.type)) {
      value = owner;
      owner = parentOf.get(owner) ?? null;
    }
    const declared = owner?.type === 'VariableDeclarator' && owner.init === value;
    const assigned = owner?.type === 'AssignmentExpression' && owner.right === value;
    const held = declared || assigned || (owner?.type === 'ReturnStatement' && owner.argument === value);
    // A RETURNED handle is held but unnamed here on purpose — its teardown is the caller's file's
    // obligation, and `tweenTeardown.ts` exempts a `null` handle for that reason.
    const handle = declared ? pathOf(owner.id) : assigned ? pathOf(owner.left) : null;
    out.push({ method: String(method), held, aliased: !literal, handle });
  });
  return out;
}

/** `tweenOpenings` for a source string. */
export function openingsIn(code: string): TweenOpening[] {
  return tweenOpenings(parseFile(code));
}
