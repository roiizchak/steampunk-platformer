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
import { openingsIn } from './tweenOpenings';

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
 *
 * 🔴 **All FIVE tween-opening methods, not just `add` — a gate-round finding, 2026-08-25.**
 * The first version matched `add` alone while `tweenCallbacks.ts`'s `TWEEN_METHODS` (the sibling
 * rule added in the same branch) already enumerated `add`, `addCounter`, `addMultiple`, `chain` and
 * `create`. `scene.tweens.addCounter({})` therefore yielded zero sites and this rule ran clean over
 * it. The two lists now agree because they are the same question asked twice.
 *
 * 🔴 **`this.add.tween(config)` — D14 — is CLOSED as of 2026-08-25, and this rule now reaches it.**
 * It is a real Phaser 4.2.1 entry point (`phaser.d.ts:26869` on the factory, `:28201` on the creator)
 * that opens a tween with the identifier `tweens` appearing nowhere, so it bypassed 9.3b, 9.3c, 9.3d,
 * 9.2, 9.2b and 9.2c at once — **six rules, one of which (9.3d) the gate log's own list omitted.**
 * The recorded blocker was *"resolving what `add` is bound to, a different machine from a pattern"*.
 * It is the same machine: `tween` is unique to the factory and creator, so the method name selects
 * the entry point on its own. See `tween-add-factory.test.ts` for the gate and its red proofs.
 */
// 🔴 **The `.add.tween(` alternative closes D14 (2026-08-25).** It requires a MEMBER access before
// `add` — `this.add.tween`, `scene.add.tween` — and not a bare `add.tween`, mirroring
// `namesSceneFactory` in `tweenCallbacks.ts`. `tweens` is a distinctive identifier and can be matched
// bare; `add` is an ordinary word, and matching it bare would red an unrelated object that happens to
// have a `tween` method. The acceptance fixture for that case is in `tween-add-factory.test.ts`.
const TWEENS_ADD =
  /(\S[^\n]{0,40})?(?:\btweens\s*\.\s*(?:add|addCounter|addMultiple|chain|create)|\.\s*add\s*\.\s*tween)\s*\(/g;

/**
 * Every way this codebase can open a tween, for the coarse *"does this file open one at all?"* filter
 * that 9.3c's teardown scan uses to skip files.
 *
 * \U0001f534 **It said "both ways" and reached THREE of six — found by the §10a adversarial brief.** It
 * matched `tweens.add` (so `add`, `addCounter`, `addMultiple` by prefix) and `.add.tween(`, and missed
 * **`tweens.chain(`** and **`tweens.create(`** entirely — while `TWEENS_ADD` twelve lines above and
 * `TWEEN_METHODS` in `tweenIdentity.ts` both list all five manager methods. A file whose only tween is
 * a `chain` was `continue`d past the teardown requirement and never asked whether it stops anything.
 *
 * \u26a0\ufe0f That is **the S3-3 defect repeating in the same branch**: *"9.3b knew only `add` while the
 * sibling `TWEEN_METHODS` listed five — two files, one branch, disagreeing on what a tween is."*
 * Three constants now, and this was the new arm shipped without a fixture while `TWEENS_ADD` got six.
 * Enumerated explicitly rather than by `add` prefix, so the next method cannot ride in silently.
 */
export const OPENS_A_TWEEN =
  /\btweens\s*\.\s*(?:add|addCounter|addMultiple|chain|create)|\.\s*add\s*\.\s*tween\s*\(/;
/** A newline inside a fixture literal, named so the shell that writes this file cannot eat it. */
const NL = '\n';


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

  it('REJECTS the other FOUR tween-opening methods — not just add (vault C2)', () => {
    // 🔴 A gate-round finding, 2026-08-25: this rule matched `add` alone while the sibling
    // `TWEEN_METHODS` in `tweenCallbacks.ts` already listed five. `addCounter` returned 0 and the
    // scan ran clean over it. Every one of the five opens a tween that owns a handle.
    expect(unbound('  scene.tweens.addCounter({ from: 0, to: 1 });')).toBe(1);
    expect(unbound('  this.tweens.addMultiple([{ targets: o }]);')).toBe(1);
    expect(unbound('  scene.tweens.chain({ tweens: [] });')).toBe(1);
    expect(unbound('  this.tweens.create({ targets: o });')).toBe(1);
    // And held forms of the same four still pass — the rule did not become a blanket.
    expect(unbound('  const c = scene.tweens.addCounter({ from: 0, to: 1 });')).toBe(0);
    expect(unbound('  return this.tweens.chain({ tweens: [] });')).toBe(0);
    // A method that is NOT a tween opener stays out of it.
    expect(unbound('  scene.tweens.killAll();')).toBe(0);
    expect(unbound('  scene.tweens.getTweensOf(o);')).toBe(0);

    // 🔴 **D14, closed 2026-08-25.** The GameObject factory opens a tween with `tweens` appearing
    // nowhere, so this rule could not see it at all. Both forms, unbound and held:
    expect(unbound('  this.add.tween({ targets: o, alpha: 0 });')).toBe(1);
    expect(unbound('  scene.add.tween({ targets: o });')).toBe(1);
    expect(unbound('  const t = this.add.tween({ targets: o });')).toBe(0);
    expect(unbound('  return scene.add.tween({ targets: o });')).toBe(0);
    // ⚠️ And a BARE `add.tween(` on an unrelated object is NOT matched — `add` is an ordinary word,
    // and reddening it would widen the rule past what it is about. `tween-add-factory.test.ts`
    // carries the same acceptance case against the parser arm. Raised by the Codex plan review.
    expect(unbound('  add.tween({ targets: o });')).toBe(0);
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
      // 🔴 Was `code.includes('tweens.add')`, which skipped the whole file for a tween opened
      // through the GameObject factory — 9.3c's half of D14.
      if (!OPENS_A_TWEEN.test(code)) continue;
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

describe('9.3d — the ALIAS-AWARE handle rule, driven by the parser (Codex impl review, 2026-08-25)', () => {
  // 🔴 **The alias repair was only half applied, and the gate log claimed the whole of it.**
  // `isTweenCall` learned `const tm = scene.tweens` on 2026-08-25, which closed the CALLBACK rules.
  // 9.3b and 9.3c were untouched: `TWEENS_ADD` needs the literal word `tweens`, and the 9.3c scan
  // filters files by `code.includes('tweens.add')`, so an aliased opener was not merely unmatched —
  // its whole FILE was excluded from the scan. This rule is alias-aware by construction.
  //
  // It runs BESIDE the patterns, not instead of them (the shape 9.2c already takes).

  it('REJECTS an ALIASED fire-and-forget opener — the shape that passed both handle gates', () => {
    const aliased = 'const tm = scene.tweens;' + NL + 'tm.add({ targets: o, alpha: 0 });';
    // First, the two shipped rules really are blind to it — committed evidence, not an assertion
    // about an assertion. This is the FAILING FIXTURE the claim needed and did not have.
    expect(unbound(blankFor('code+strings', aliased)), 'TWEENS_ADD sees nothing').toBe(0);
    expect(aliased.includes('tweens.add'), "the 9.3c filter excludes the file").toBe(false);
    // And the parser rule catches it.
    const open = openingsIn(aliased);
    expect(open.length, 'the AST found no opener').toBe(1);
    expect(open[0]!.aliased).toBe(true);
    expect(open[0]!.held, 'an aliased fire-and-forget opener must NOT read as held').toBe(false);
  });

  it('ACCEPTS an aliased opener that IS held — the other direction (vault C2)', () => {
    const held = 'const tm = scene.tweens;' + NL + 'const t = tm.add({ targets: o });';
    expect(openingsIn(held).map((o) => o.held)).toEqual([true]);
    expect(openingsIn('const tm = this.tweens;' + NL + 'return tm.chain({ tweens: [] });').map((o) => o.held)).toEqual([true]);
    expect(openingsIn('const tm = scene.tweens;' + NL + 'this.t = tm.addCounter({ from: 0 });').map((o) => o.held)).toEqual([true]);
  });

  it('agrees with the pattern rule on every UNALIASED shape the patterns already pin', () => {
    // 🔴 Two rules that disagree on the ordinary case are worse than one. Each literal below is
    // already pinned by 9.3b's own fixtures; this asserts the parser reaches the same verdict, so a
    // future edit to either cannot silently split them.
    const cases: [string, boolean][] = [
      ['scene.tweens.add({ targets: o });', false],
      ['const t = scene.tweens.add({ targets: o });', true],
      ['return this.tweens.add({ targets: o });', true],
      ['tween = scene.tweens.add({ targets: o });', true],
      ['noop(scene.tweens.add({ targets: o }));', false],
      ['live.add(scene.tweens.add({ targets: o }));', false],
    ];
    for (const [src, wantHeld] of cases) {
      expect(openingsIn(src).map((o) => o.held), src).toEqual([wantHeld]);
      expect(unbound(blankFor('code+strings', src)) === 0, `pattern rule disagrees on: ${src}`).toBe(wantHeld);
    }
  });

  it('no source file opens a tween it does not hold — INCLUDING through an alias', () => {
    const offenders = Object.entries(ALL_SOURCES)
      .flatMap(([file, src]) => openingsIn(src).map((o) => [file, o] as const))
      .filter(([, o]) => !o.held)
      .map(([file, o]) => `${file}: ${o.method}${o.aliased ? ' (through an alias)' : ''}`);
    expect(
      offenders,
      'criterion 9.3, alias-aware: a tween whose handle is discarded cannot be stopped before its ' +
        'target is destroyed. Bind the result and stop it on SHUTDOWN. An `(through an alias)` note ' +
        'means the two PATTERN rules cannot see this one at all.',
    ).toEqual([]);
  });

  it('the parser scan is not vacuous: it found the five live openers', () => {
    const total = Object.values(ALL_SOURCES).reduce((n, src) => n + openingsIn(src).length, 0);
    expect(total, 'the AST reached fewer openers than the tree has').toBeGreaterThanOrEqual(5);
  });
});
