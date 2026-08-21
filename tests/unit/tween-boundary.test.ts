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

/** Kill-by-target, in every form Phaser offers it. */
const KILL_BY_TARGET = /\b(?:killTweensOf|killAll)\s*\(/;

/**
 * A `tweens.add(...)` whose result is NOT bound to a name.
 *
 * Matched by what comes immediately BEFORE the call: an assignment (`= `), a `return`, or an
 * argument position. Anything else — a bare statement — is fire-and-forget. Deliberately narrow in
 * the direction that errs toward a false RED: this rule blocks a blocker, and a false red costs a
 * minute while a missed violation is what the vault says shipped.
 */
const TWEENS_ADD = /(\S[^\n]{0,40})?\btweens\s*\.\s*add\s*\(/g;

function bodies(): [file: string, code: string][] {
  return Object.entries(ALL_SOURCES).map(([file, src]) => [file, blankFor('code', src)]);
}

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
    const hits = bodies()
      .filter(([, code]) => KILL_BY_TARGET.test(code))
      .map(([file]) => file);
    expect(
      hits,
      `kill-by-target reaches every tween pointed at an object, including ones another feature ` +
        `owns, and it is silent about what it hit. Hold the handle and stop it (criterion 9.3).`,
    ).toEqual([]);
  });

  it('REJECTS a planted call — this rule can go red (vault C2)', () => {
    expect(KILL_BY_TARGET.test('this.tweens.killTweensOf(this.gearIcon);')).toBe(true);
    expect(KILL_BY_TARGET.test('scene.tweens.killAll();')).toBe(true);
  });

  it('does NOT fire on a comment recording its removal — those exist and are deliberate', () => {
    // `hudFade.ts` and `hudGearPop.ts` both name `killTweensOf` in prose. A gate that is red on
    // arrival gets weakened rather than obeyed, so the blanking is load-bearing.
    const prose = blankFor('code', '// This read scene.tweens.killTweensOf(targets), which is\nconst a = 1;');
    expect(KILL_BY_TARGET.test(prose)).toBe(false);
  });
});

describe('9.3b — every tweens.add result is bound to a name', () => {
  const unbound = (code: string): number => {
    let count = 0;
    for (const match of code.matchAll(TWEENS_ADD)) {
      const before = (match[1] ?? '').trimEnd();
      // `= x.tweens.add(`, `return this.tweens.add(`, `f(scene.tweens.add(` are all held.
      if (!/[=(,]$|\breturn$/.test(before.replace(/(this|scene|\w+)\s*\.?\s*$/, '').trimEnd())) {
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
