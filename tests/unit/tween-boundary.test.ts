/**
 * Criterion 9.3 — **tweens tracked individually; no kill-by-target** — as a GATE.
 *
 * ## Why this file exists
 *
 * 9.3 is a standing architectural rule and it was enforced by a reviewer reading a diff. Both blind
 * gate briefs reached the same conclusion independently: *"nothing enforces either property. There
 * is no static scan, no `sourceScan` rule, no unit assertion and no e2e check for `killTweensOf` or
 * for an unheld handle."* The last `killTweensOf` was removed by hand, and the next one would have
 * landed green — which is the "a gate that cannot go red is decoration" rule applied one step
 * earlier: here there was no gate at all.
 *
 * ## The two halves, and why the second one is the harder claim
 *
 * **No kill-by-target** is a one-line grep. Kill-by-target reaches every tween pointed at an object,
 * including ones another feature owns, and reports nothing about what it hit — Phase 6 paid for that
 * once and `hudFade.ts:147-151` records the removal.
 *
 * **Held individually** is the half that had two live violations: `goalLayer.animateGoalReached` and
 * `UIScene`'s gear flyer both called `scene.tweens.add(...)` and discarded the return value. Neither
 * was new in Phase 9, and the criterion is a property of the TREE and not of the diff. The goal pulse
 * had a real race behind it — ≈533 ms of yoyo against the goal container while `bindContinue` starts
 * the next level on any key.
 *
 * ## Why this is a static scan and not a behavioural test
 *
 * The rule is about source SHAPE — "the return value is bound to a name" is not observable at
 * runtime at all. `sourceScan.ts` already owns exactly this kind of engine over blanked source, and
 * `tools/gen/verify-dist.mjs` already scans the bundle for forbidden symbols. This uses the former's
 * `blank()` so a `killTweensOf` inside a COMMENT — `hudFade.ts` and `hudGearPop.ts` both have one,
 * deliberately, recording its removal — is not a false red.
 *
 * ## The C2 red-proof is committed, and it is driven against LITERALS
 *
 * The last two tests hand the scanner source text written inline. That makes the proof immune to the
 * real files changing underneath it: it cannot rot into "the rule fired on something", and it does
 * not need a fixture file that someone later tidies away.
 */

import { describe, expect, it } from 'vitest';
import { ALL_SOURCES, blankFor } from './sourceScan';

/**
 * Kill-by-target, in every form Phaser offers it.
 *
 * **Two alternatives, and the second one is the whole point of the `code+strings` view below.**
 * The first is the direct member call — and because `\b` matches after a `.`, it already covers
 * optional chaining (`tweens?.killTweensOf(`) with no extra alternative. The second is COMPUTED
 * access, `tweens['killTweensOf'](x)`, in either quote and with any interior whitespace.
 *
 * 🔴 The bracket half is invisible under the `'code'` view no matter how the pattern is written —
 * see `killBodies()`. The Codex plan review caught this as a would-be false green: the first draft
 * of this repair extended the regex and left the view alone, which would have produced a rule that
 * passes its own fixture and misses the violation in a real file. **The view was the defect, not
 * the pattern.**
 */
const KILL_BY_TARGET = /\b(?:killTweensOf|killAll)\s*\(|\[\s*(['"])(?:killTweensOf|killAll)\1\s*\]/;

/**
 * A `tweens.add(...)` whose result is NOT bound to a name.
 *
 * Matched by what comes immediately BEFORE the call: an assignment (`= `) or a `return`. Anything
 * else — a bare statement, or an ARGUMENT POSITION — is fire-and-forget. Deliberately narrow in
 * the direction that errs toward a false RED: this rule blocks a blocker, and a false red costs a
 * minute while a missed violation is what the vault says shipped.
 *
 * 🔴 **Argument position used to count as HELD, and that was a documented way round the rule.**
 * `noop(scene.tweens.add({…}))` satisfied it because the preceding character is `(`, though nobody
 * retains the handle. The counter-argument — `live.add(scene.tweens.add({…}))` really does retain
 * it — is true and does not save the classification: a static scan cannot tell a collector from a
 * discarder, and the criterion is about whether the handle is REACHABLE later. Every live site
 * binds to a name (checked: all five are `= ` assignments), so requiring that costs nothing and
 * closes the dodge. A site that genuinely wants to pass a tween onward can name it first.
 */
const TWEENS_ADD = /(\S[^\n]{0,40})?\btweens\s*\.\s*add\s*\(/g;

/**
 * The view for rules whose evidence is a bare identifier: comments AND string literals blanked, so
 * a message containing `tweens.add` cannot false-red.
 */
function bodies(): [file: string, code: string][] {
  return Object.entries(ALL_SOURCES).map(([file, src]) => [file, blankFor('code', src)]);
}

/**
 * The view for the kill rule: comments blanked, **strings KEPT**.
 *
 * 🔴 Under `'code'` the string contents are blanked too (`sourceScan.ts`'s own docstring says so),
 * so `tweens['killTweensOf'](x)` reaches a rule as `tweens['            '](x)` and **no regex can
 * see it**. That is the bypass the Codex review named, and the view is where it is closed —
 * `sourceScan.ts` already nominates `'code+strings'` for exactly this, citing `Date['now']`.
 *
 * The cost of keeping strings is a literal `"killTweensOf"` in a message, which would report. That
 * cost is not paid on this tree: all six mentions of `killTweensOf`/`killAll` in `src/` sit in doc
 * COMMENTS (`hudFade.ts`, `hudGearFlyers.ts`, `hudGearPop.ts`), and comments are blanked in both
 * views — which is why the "does not fire on a comment recording its removal" test below still
 * passes unchanged. If one ever lands in a string, that is a finding to look at, **not** a reason
 * to revert the view: a false red is cheap and a missed violation is what the vault says shipped.
 */
function killBodies(): [file: string, code: string][] {
  return Object.entries(ALL_SOURCES).map(([file, src]) => [file, blankFor('code+strings', src)]);
}

/**
 * Put a fixture through the SAME blanking the real files take.
 *
 * 🔴 Not decoration. The C2 fixtures used to be handed straight to `KILL_BY_TARGET.test(...)`, and
 * a fixture tested against the bare pattern **passes while the production scan misses the
 * violation** — which is precisely how the bracket bypass survived a committed red-proof. A
 * red-proof that skips the pipeline proves the pattern, not the gate.
 */
const killView = (src: string): string => blankFor('code+strings', src);

describe('9.3a — no kill-by-target anywhere in src/', () => {
  it('the scan is not vacuous: it reads real files and they mention tweens', () => {
    const scanned = bodies();
    expect(scanned.length).toBeGreaterThan(40);
    const withTweens = scanned.filter(([, code]) => code.includes('tweens.add'));
    expect(
      withTweens.map(([f]) => f).sort(),
      'no file in src/ calls tweens.add — the rules below are asserting about nothing',
    ).not.toEqual([]);
  });

  it('finds no killTweensOf or killAll call in any source file', () => {
    // `killBodies()`, not `bodies()` — the computed-access form is unreachable from the other view.
    const hits = killBodies()
      .filter(([, code]) => KILL_BY_TARGET.test(code))
      .map(([file]) => file);
    expect(
      hits,
      `kill-by-target reaches every tween pointed at an object, including ones another feature ` +
        `owns, and it is silent about what it hit. Hold the handle and stop it (criterion 9.3).`,
    ).toEqual([]);
  });

  it('REJECTS a planted call — this rule can go red (vault C2)', () => {
    // 🔴 Every fixture goes through `killView`, the production path. See its docstring.
    expect(KILL_BY_TARGET.test(killView('this.tweens.killTweensOf(this.gearIcon);'))).toBe(true);
    expect(KILL_BY_TARGET.test(killView('scene.tweens.killAll();'))).toBe(true);
    // Optional chaining on the member — already covered by `\b` matching after the dot.
    expect(KILL_BY_TARGET.test(killView('scene.tweens?.killTweensOf(o);'))).toBe(true);
  });

  it('REJECTS COMPUTED access — the bypass the plan review named (vault C2)', () => {
    // The whole reason `killBodies()` exists. Under the `'code'` view every one of these arrives
    // with its quoted key blanked to spaces, and the rule reports a clean file.
    expect(KILL_BY_TARGET.test(killView("scene.tweens['killTweensOf'](o);"))).toBe(true);
    expect(KILL_BY_TARGET.test(killView('scene.tweens["killTweensOf"](o);'))).toBe(true);
    expect(KILL_BY_TARGET.test(killView("scene.tweens[ 'killAll' ]();"))).toBe(true);
    expect(KILL_BY_TARGET.test(killView("scene.tweens?.['killTweensOf'](o);"))).toBe(true);
  });

  it('proves the OLD view could not have caught computed access — the bypass, demonstrated', () => {
    // 🔴 This is the finding as a committed assertion rather than a paragraph. If someone later
    // "simplifies" `killBodies()` back to the `'code'` view, the scan silently stops seeing bracket
    // access and this test is the thing that says so.
    const src = "scene.tweens['killTweensOf'](o);";
    expect(KILL_BY_TARGET.test(blankFor('code', src)), 'the code view still blanks the key').toBe(false);
    expect(KILL_BY_TARGET.test(blankFor('code+strings', src))).toBe(true);
  });

  it('does NOT fire on a comment recording its removal — those exist and are deliberate', () => {
    // `hudFade.ts` and `hudGearPop.ts` both name `killTweensOf` in prose. A gate that is red on
    // arrival gets weakened rather than obeyed, so the blanking is load-bearing. Comments are
    // blanked in BOTH views, which is why moving to `code+strings` did not disturb this.
    const prose = killView('// This read scene.tweens.killTweensOf(targets), which is\nconst a = 1;');
    expect(KILL_BY_TARGET.test(prose)).toBe(false);
  });
});

describe('9.3b — every tweens.add result is bound to a name', () => {
  const unbound = (code: string): number => {
    let count = 0;
    for (const match of code.matchAll(TWEENS_ADD)) {
      const before = (match[1] ?? '').trimEnd();
      // `= x.tweens.add(` and `return this.tweens.add(` are held. 🔴 `f(scene.tweens.add(` is NOT,
      // any more — see TWEENS_ADD's docstring for why argument position was demoted.
      if (!/=$|\breturn$/.test(before.replace(/(this|scene|\w+)\s*\.?\s*$/, '').trimEnd())) {
        count += 1;
      }
    }
    return count;
  };

  it('REJECTS a fire-and-forget call and ACCEPTS a held one — both directions (vault C2)', () => {
    // 🔴 Both directions, in one test, against literals. A rule that only ever demonstrates its
    // rejection can be satisfied by a pattern that rejects everything, which would make the real
    // scan below red on arrival and get it deleted.
    expect(unbound('  scene.tweens.add({ targets: o, alpha: 0 });')).toBe(1);
    expect(unbound('  this.tweens.add({ targets: o });')).toBe(1);
    expect(unbound('  const t = scene.tweens.add({ targets: o });')).toBe(0);
    expect(unbound('  tween = scene.tweens.add({ targets: o });')).toBe(0);
    expect(unbound('  return scene.tweens.add({ targets: o });')).toBe(0);
    expect(unbound('  const t: Phaser.Tweens.Tween = this.tweens.add({ targets: o });')).toBe(0);
  });

  it('REJECTS an ARGUMENT-POSITION call — the second bypass the plan review named (vault C2)', () => {
    // 🔴 These used to return 0. `noop(...)` retains nothing, and no static scan can tell it from
    // a collector — so the rule asks for a NAME, which every live site already gives it.
    expect(unbound('  noop(scene.tweens.add({ targets: o, alpha: 0 }));')).toBe(1);
    expect(unbound('  live.add(scene.tweens.add({ targets: o }));')).toBe(1);
    expect(unbound('  register(a, scene.tweens.add({ targets: o }));')).toBe(1);
    // And the sanctioned way to do the same thing still passes: name it, then pass the name.
    expect(unbound('  const t = scene.tweens.add({ targets: o });\n  live.add(t);')).toBe(0);
  });

  it('no source file starts a tween it does not hold', () => {
    const offenders = bodies()
      .map(([file, code]) => [file, unbound(code)] as const)
      .filter(([, n]) => n > 0);
    expect(
      offenders,
      `criterion 9.3: a tween whose handle is discarded cannot be stopped before its target is ` +
        `destroyed, and kill-by-target is the only remaining way to reach it — which is the thing ` +
        `9.3 forbids. Bind the result and stop it on SHUTDOWN.`,
    ).toEqual([]);
  });
});

describe('9.3c — every tween owner is torn down where its targets die', () => {
  const src = (name: string): string => {
    const key = Object.keys(ALL_SOURCES).find((k) => k.endsWith(`/${name}`));
    expect(key, `${name} is not in ALL_SOURCES`).toBeDefined();
    return ALL_SOURCES[key!];
  };

  it('every file that adds a tween also stops one', () => {
    // A handle held and never stopped is bookkeeping, not a teardown. This is the claim that turns
    // "bound to a name" into the property the criterion is actually about.
    for (const [file, code] of bodies()) {
      if (!code.includes('tweens.add')) continue;
      expect(
        /\.stop\(\)|\.destroy\(\)/.test(code),
        `${file} starts a tween and never stops one — see hudFade.ts's destroy() for the shape`,
      ).toBe(true);
    }
  });

  it('the goal pulse is stopped on scene shutdown', () => {
    // Its target is the goal container, and `gameComplete.bindContinue` starts the next level on
    // ANY key — so a prompt ENTER leaves ≈533 ms of yoyo running against an object `scene.start`
    // destroys. It was fire-and-forget with no handle at all.
    const code = src('goalLayer.ts');
    expect(code).toContain('const pulse = scene.tweens.add(');
    expect(code).toMatch(/SHUTDOWN,\s*\(\)\s*=>\s*pulse\.stop\(\)/);
  });

  it('the gear flyers are stopped by handle, not killed by target', () => {
    const code = src('hudGearFlyers.ts');
    expect(code).toContain('live.add(tween)');
    expect(code).toMatch(/for \(const tween of live\)/);
    expect(code).toContain('tween.stop()');
  });
});
