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
    const held =
      (parent?.type === 'VariableDeclarator' && parent.init === n) ||
      (parent?.type === 'AssignmentExpression' && parent.right === n) ||
      (parent?.type === 'ReturnStatement' && parent.argument === n) ||
      (parent?.type === 'AwaitExpression');
    out.push({ method: String(method), held, aliased: !literal });
  });
  return out;
}

/** `tweenOpenings` for a source string. */
export function openingsIn(code: string): TweenOpening[] {
  return tweenOpenings(parseFile(code));
}
