import { describe, expect, it } from 'vitest';
import { ALL_SOURCES, blankFor } from './sourceScan';
import { callbackNodes, parseFile } from './tweenCallbacks';

/**
 * # D14 — `this.add.tween(config)`, the entry point six rules could not see
 *
 * `add.tween(config)` is a **real Phaser 4.2.1 API**: a factory method at `phaser.d.ts:26869` and a
 * creator at `:28201`, the latter documented as *"without adding it to the Tween Manager"*. It opens
 * a tween with the identifier `tweens` appearing **nowhere in the expression**.
 *
 * Every tween rule in this project keyed on that identifier. So a tween opened through the GameObject
 * factory bypassed, simultaneously:
 *
 * | rule | where it keyed on `tweens` |
 * |---|---|
 * | 9.3b — handle held individually | `TWEENS_ADD` in `tween-boundary.test.ts` |
 * | 9.3c — a file that opens a tween must stop one | its `code.includes('tweens.add')` filter |
 * | 9.3d — parser arm | `TWEEN_METHODS` in `tweenCallbacks.ts`, which lacked `tween` |
 * | 9.2 / 9.2b / 9.2c — callback rules | `TWEEN_CALLS` in `tween-callback-boundary.test.ts` |
 *
 * ⚠️ **The gate log's list of bypassed rules was one short.**
 * `docs/qa/session-phase-09-debts-03-gate.md:64` names 9.3b, 9.2, 9.2b and 9.2c and **omits 9.3d**,
 * which is genuinely bypassed: `isTweenCall` rejected on the method name before it ever reached the
 * object test. `docs/SESSION-PROMPT-next.md` had it right. Corrected in this session's QA log.
 *
 * ## Why the recorded blocker was smaller than it looked
 *
 * D14 was carried as *"closing it means resolving what `add` is bound to, a different machine from a
 * pattern."* It is the same machine. The method name **`tween` is unique to the factory and creator**
 * — `TweenManager` has no `.tween()` — so the method alone selects the entry point, and
 * `namesTweenManager` was already an alias-resolving name test. Closing it was ~15 lines.
 *
 * ## The asymmetry that makes this safe, and who caught it
 *
 * `namesTweenManager` matches a **bare** `tweens` identifier, because `tweens` means one thing here.
 * `namesSceneFactory` deliberately does **not** match a bare `add`: `add` is an ordinary English word,
 * and an unrelated object with a `tween` method would be a false red on legal code. It requires a
 * member access — `this.add`, `scene.add` — while still resolving an alias bound to one.
 *
 * 🔴 **That constraint came from the Codex plan review**, which was right that treating the name `add`
 * as sufficient Phaser identity would over-reach. The acceptance fixture below is the executable form
 * of its "add a legal non-Phaser `add.tween()` fixture" instruction: **closing a bypass must not
 * widen the rule onto code the rule was never about.**
 */

const NL = '\n';

/** Parse a fixture and return the callback function bodies the 9.2 family would inspect. */
function callbacksIn(code: string): number {
  return callbackNodes(parseFile(code)).length;
}

describe('D14 — tweens opened through the GameObject factory', () => {
  it('the parser arm SEES `this.add.tween({ onComplete })` — 9.3d, 9.2b, 9.2c', () => {
    const src = [
      'class S {',
      '  build() {',
      '    this.add.tween({ targets: o, alpha: 0, onComplete: () => { world.player.x = 1; } });',
      '  }',
      '}',
    ].join(NL);
    expect(
      callbacksIn(src),
      'this.add.tween’s callbacks were invisible to the parser — D14 is open again',
    ).toBe(1);
  });

  it('an ALIAS of the factory is resolved: `const add = this.add; add.tween({…})`', () => {
    const src = [
      'class S {',
      '  build() {',
      '    const add = this.add;',
      '    add.tween({ targets: o, onStop: () => { world.player.vy = 0; } });',
      '  }',
      '}',
    ].join(NL);
    expect(callbacksIn(src), 'the alias hid the factory').toBe(1);
  });

  it('ACCEPTS a bare `add.tween()` on an unrelated object — the rule must not widen', () => {
    // 🔴 The Codex plan review's finding, as a fixture. `add` is an ordinary word; an object that
    // happens to expose `tween` is not Phaser's factory, and reddening it would strengthen a rule
    // onto code it was never about. `namesSceneFactory` requires a member access for exactly this.
    const src = [
      'function f(add) {',
      '  add.tween({ onComplete: () => { world.player.x = 1; } });',
      '}',
    ].join(NL);
    expect(
      callbacksIn(src),
      'a bare `add.tween()` on an unrelated parameter was treated as a Phaser tween — the rule ' +
        'widened past what it is about',
    ).toBe(0);
  });

  it('the shipped tree does not open a tween through the factory — and now the rules would SEE it', () => {
    // The absence used to be the whole gate, because nothing could read the call. It is kept as a
    // tree-level check, but it is no longer load-bearing: the three tests above are.
    const users = Object.entries(ALL_SOURCES)
      .filter(([, src]) => /\.\s*add\s*\.\s*tween\s*\(/.test(blankFor('code+strings', src)))
      .map(([f]) => f);
    expect(
      users,
      'a tween is opened through the GameObject factory. That is now VISIBLE to 9.3b/9.3c/9.3d and ' +
        'the 9.2 family, so this is informational rather than a bypass — but prefer `this.tweens.add`.',
    ).toEqual([]);
  });
});
