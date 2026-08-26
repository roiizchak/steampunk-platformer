/**
 * Criterion 9.3, second half — **every tween handle a file holds, that file tears down.**
 *
 * ## Why this file exists, and what it replaces
 *
 * 9.3 shipped with two rules. 9.3b/9.3d assert the handle is *held*; 9.3c asserted the file contains
 * a teardown. The Codex implementation review of 2026-08-25 returned the second one as a **BLOCKER**,
 * with two independent false greens:
 *
 * > *"The teardown rule still filters with the literal `OPENS_A_TWEEN` regex and merely asks whether
 * > the file contains any `.stop()` or `.destroy()`. Thus `const tm = scene.tweens; const t =
 * > tm.add(…)` with no teardown is skipped, and a file with two tweens passes if any unrelated object
 * > is stopped."*
 *
 * Both are re-verified below against the shipped rule's own text, as committed failing fixtures
 * rather than as claims about it — the first two tests run `OPENS_A_TWEEN` and the literal
 * `/\.stop\(\)|\.destroy\(\)/` beside the new rule and assert the old one is GREEN on source the new
 * one reddens. *(C2: a gate that cannot go red is decoration — and one that goes green on a
 * violation is worse, because it reports the property holds.)*
 *
 * ## Why "held" was never enough
 *
 * Holding a handle is the *precondition* for stopping it, not the act. A handle held and never
 * stopped is the exact state `hudFade.ts:147-151` records paying for: the tween outlives its target,
 * and the only remaining way to reach it is kill-by-target, which 9.3's other half forbids. So the
 * obligation is per HANDLE, and a per-FILE existence test cannot express it.
 *
 * ⚠️ **This runs BESIDE 9.3c, not instead of it** — the shape 9.2c and 9.3d already take. The
 * pattern rule is weaker, not wrong, and a rule with committed fixtures that has never been wrong on
 * this tree is not deleted to make room for a newer one.
 *
 * ⚠️ **The association is by NAME, not by binding** — `tweenTeardown.ts`'s header states the trade
 * and why over-crediting is the safer failure direction here. Reading that note is the difference
 * between trusting this gate and over-trusting it.
 */

import { describe, expect, it } from 'vitest';

import { ALL_SOURCES } from './sourceScan';
import { OPENS_A_TWEEN } from './tween-boundary.test';
import { openingsIn } from './tweenOpenings';
import { stoppedHandles, unTornDown } from './tweenTeardown';
import { parseFile } from './tweenCallbacks';

const NL = '\n';

/** The shipped 9.3c teardown test, verbatim, so the false greens below are measured and not argued. */
const SHIPPED_9_3C = (code: string): boolean =>
  !OPENS_A_TWEEN.test(code) || /\.stop\(\)|\.destroy\(\)/.test(code);

describe('9.3e — every HELD tween handle is torn down, by name (Codex impl review BLOCKER)', () => {
  it('REJECTS an ALIASED opener with no teardown — which 9.3c skipped ENTIRELY', () => {
    const src = ['const tm = scene.tweens;', 'const t = tm.add({ targets: o, alpha: 0 });'].join(NL);
    // The shipped rule passes it, and not because it judged it — because `OPENS_A_TWEEN` needs the
    // literal word `tweens` in the opening call, so the whole file fell out of the scan.
    expect(SHIPPED_9_3C(src), '9.3c was already green on this').toBe(true);
    expect(OPENS_A_TWEEN.test(src), 'the file never entered 9.3c at all').toBe(false);
    // And 9.3d is green too: the handle IS held. Held was never the whole property.
    expect(openingsIn(src).map((o) => o.held)).toEqual([true]);
    expect(unTornDown(src)).toEqual(['t']);
  });

  it('REJECTS the SECOND of two tweens when only an unrelated object was destroyed', () => {
    const src = [
      'const a = scene.tweens.add({ targets: o });',
      'const b = scene.tweens.add({ targets: p });',
      'a.stop();',
      'sprite.destroy();',
    ].join(NL);
    // 🔴 The exact shape Codex named: a `.destroy()` on something that is not a tween satisfies the
    // shipped rule for the whole file. Remove `a.stop()` and it still passes.
    expect(SHIPPED_9_3C(src), '9.3c is green on a file that stops one of its two tweens').toBe(true);
    expect(SHIPPED_9_3C(src.replace('a.stop();', '')), '…and on one that stops NEITHER').toBe(true);
    expect(unTornDown(src)).toEqual(['b']);
    expect(unTornDown(src.replace('a.stop();', ''))).toEqual(['a', 'b']);
  });

  it('ACCEPTS both tweens stopped — hudFade.ts’s real shape (vault C2, the other direction)', () => {
    const src = [
      'const fadeTween = scene.tweens.add({ targets: fade });',
      'const linesTween = scene.tweens.add({ targets: lines });',
      'fadeTween.stop();',
      'linesTween.stop();',
    ].join(NL);
    expect(unTornDown(src)).toEqual([]);
  });

  it('ACCEPTS a handle stopped through an ALIAS CHAIN — hudGearPop.ts’s real shape', () => {
    const src = [
      'tween = scene.tweens.add({ targets: icon });',
      'const running = tween;',
      'tween = null;',
      'running?.stop();',
    ].join(NL);
    expect(unTornDown(src), 'the alias closure did not credit `tween`').toEqual([]);
    // Two hops, because one intermediate `const` is what hid `collectGears` from the sim manifest.
    const twoHops = ['const t = scene.tweens.add({});', 'const a = t;', 'const b = a;', 'b.destroy();'].join(NL);
    expect(unTornDown(twoHops)).toEqual([]);
  });

  it('ACCEPTS a member-path handle and a RETURNED one, and rejects the member path unstopped', () => {
    const member = ['this.pulse = scene.tweens.add({ targets: g });', 'this.pulse.stop();'].join(NL);
    expect(unTornDown(member)).toEqual([]);
    expect(unTornDown('this.pulse = scene.tweens.add({ targets: g });')).toEqual(['this.pulse']);
    // A returned handle carries no obligation HERE — the caller's file is scanned by the same rule.
    expect(unTornDown('return scene.tweens.add({ targets: g });')).toEqual([]);
    // …and neither does a fire-and-forget call, which is 9.3b/9.3d's violation and not this one's.
    expect(unTornDown('scene.tweens.add({ targets: g });')).toEqual([]);
  });

  it('does not credit a teardown it cannot NAME, nor one on the wrong method', () => {
    // `live[i].stop()` is unnameable, so it must not silently satisfy `t`'s obligation.
    expect(unTornDown(['const t = scene.tweens.add({});', 'live[0].stop();'].join(NL))).toEqual(['t']);
    expect(unTornDown(['const t = scene.tweens.add({});', 't.pause();'].join(NL))).toEqual(['t']);
    expect(stoppedHandles(parseFile('t.stop();'))).toEqual(new Set(['t']));
  });

  it('no source file holds a tween handle it never tears down', () => {
    const offenders = Object.entries(ALL_SOURCES)
      .flatMap(([file, src]) => unTornDown(src).map((h) => `${file}: ${h}`))
      .sort();
    expect(
      offenders,
      'criterion 9.3: this handle is bound and never stopped or destroyed in its own file. A tween ' +
        'that outlives its target can only be reached by kill-by-target, which 9.3 forbids — see ' +
        'hudFade.ts:147-151. Stop it on SHUTDOWN, or return it and stop it where it is owned.',
    ).toEqual([]);
  });

  it('the scan is not vacuous: it found the tree’s named handles and their teardowns', () => {
    const named = Object.values(ALL_SOURCES).reduce(
      (n, src) => n + openingsIn(src).filter((o) => o.handle !== null).length,
      0,
    );
    // goalLayer `pulse`, hudFade `fadeTween`/`linesTween`, hudGearFlyers `tween`, hudGearPop `tween`.
    expect(named, 'the AST found fewer named handles than the tree has — the scan matched nothing').toBeGreaterThanOrEqual(5);
    const credited = Object.values(ALL_SOURCES).reduce((n, src) => n + stoppedHandles(parseFile(src)).size, 0);
    expect(credited, 'no teardown was credited anywhere — the green above would be vacuous').toBeGreaterThan(0);
  });
});
