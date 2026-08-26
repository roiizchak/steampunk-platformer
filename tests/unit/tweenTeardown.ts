/**
 * Which tween handles a file actually TEARS DOWN — the half criterion 9.3 was never asserting.
 *
 * ## Why this file exists
 *
 * The Codex implementation review of 2026-08-25 called the shipped 9.3c rule a BLOCKER, and it was
 * right on both counts:
 *
 * > *"The teardown rule filters with the literal `OPENS_A_TWEEN` regex and merely asks whether the
 * > file contains any `.stop()` or `.destroy()`. Thus `const tm = scene.tweens; const t = tm.add(…)`
 * > with no teardown is skipped, and a file with two tweens passes if any unrelated object is
 * > stopped."*
 *
 * Two distinct false greens in one assertion. The first is the alias hole `tweenOpenings.ts` closed
 * for the *handle* half and nothing closed here. The second is worse, because it is not a hole at
 * the edge of the rule but the rule's whole shape: `/\.stop\(\)|\.destroy\(\)/.test(code)` is
 * satisfied by `sprite.destroy()`, by `lines[0].destroy()`, by any `.destroy()` in the file. **A
 * per-FILE existence test cannot express a per-HANDLE obligation.** `hudFade.ts` opens two tweens
 * and stops both; under the shipped rule it would have passed having stopped neither, so long as it
 * destroyed a rectangle.
 *
 * ## What this module answers, and how far it can see
 *
 * `stoppedHandles(ast)` returns the set of NAMES this file stops or destroys — `t`, `this.pulse`,
 * `running` — walked out through the alias chain, so a handle copied to a local before being stopped
 * still counts:
 *
 * ```ts
 * const running = tween;   // hudGearPop.ts's real shape
 * tween = null;
 * running?.stop();         // stops `running` AND therefore `tween`
 * ```
 *
 * ⚠️ **The association is by NAME, not by binding.** Two different `const tween` in two different
 * closures of one file read as one handle here. That is deliberate and is the same trade the
 * `SIM_MUTATORS` manifest takes: over-crediting a teardown is a false GREEN in a rule whose failure
 * direction is a false RED on legal code, and the alternative is a scope-resolving analysis in a
 * gate that already carries a parser. `hudGearFlyers.ts` is exactly this shape — `const tween` in a
 * factory and `for (const tween of live) tween.stop()` in the teardown — and it is genuinely torn
 * down, so the credit is correct there. It is recorded, not built.
 *
 * ⚠️ **A RETURNED handle carries no obligation here.** `return scene.tweens.add(…)` hands the handle
 * to its caller, and the caller's file is scanned by the same rule. An opening with no name is
 * therefore exempt — see `unTornDown`.
 */

import { parseFile, walk, type Node } from './tweenCallbacks';
import { pathOf, tweenOpenings } from './tweenOpenings';

/** The names this file calls `.stop()` or `.destroy()` on, with aliases resolved. */
export function stoppedHandles(ast: Node): Set<string> {
  const stopped = new Set<string>();
  walk(ast, (n: Node) => {
    if (n.type !== 'CallExpression' && n.type !== 'OptionalCallExpression') return;
    const callee = n.callee;
    if (!callee || (callee.type !== 'MemberExpression' && callee.type !== 'OptionalMemberExpression')) return;
    if (callee.computed) return;
    const method = callee.property?.name;
    if (method !== 'stop' && method !== 'destroy') return;
    const name = pathOf(callee.object);
    if (name !== null) stopped.add(name);
  });

  // 🔴 The alias closure, and it runs to a FIXED POINT. `const a = tween; const b = a; b.stop()`
  // credits `tween` — the same shape `simMutators.ts` needed for `collectGears`, and the same reason:
  // one intermediate `const` is enough to hide the fact from a single-pass scan.
  const aliasOf = new Map<string, string>();
  walk(ast, (n: Node) => {
    const pairs: [Node | undefined, Node | undefined][] =
      n.type === 'VariableDeclarator'
        ? [[n.id, n.init]]
        : n.type === 'AssignmentExpression' && n.operator === '='
          ? [[n.left, n.right]]
          : [];
    for (const [target, source] of pairs) {
      const to = pathOf(target);
      const from = pathOf(source);
      if (to !== null && from !== null && to !== from) aliasOf.set(to, from);
    }
  });
  for (let changed = true; changed; ) {
    changed = false;
    for (const [alias, origin] of aliasOf) {
      if (stopped.has(alias) && !stopped.has(origin)) {
        stopped.add(origin);
        changed = true;
      }
    }
  }
  return stopped;
}

/**
 * The tween handles this file OPENS, holds under a name, and never tears down.
 *
 * Each entry is the handle's name. An empty array is the property criterion 9.3 asserts.
 */
export function unTornDown(code: string): string[] {
  const ast = parseFile(code);
  const stopped = stoppedHandles(ast);
  return tweenOpenings(ast)
    .filter((o) => o.handle !== null && !stopped.has(o.handle))
    .map((o) => o.handle!);
}
