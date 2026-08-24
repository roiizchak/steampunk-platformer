/**
 * Criterion 9.2 — **no game logic sequenced off a tween completion** — as a GATE.
 *
 * ## Why this file exists
 *
 * It did not, and that is the finding. Phase 9's close round asked its `code-reviewer` owner the
 * adversarial question *"how could this criterion pass while the feature is still broken?"* and the
 * answer was immediate: **there was no gate for the criterion as written.** The `test.describe`
 * block carrying 9.2's number in `tests/e2e/phase-09-polish.spec.ts` holds exactly two tests — the
 * landing shake's envelope, and the three drawn emitters' depth band — and **neither involves a
 * tween at all.** Five `scene.tweens.add(...)` sites live in `src/`; none was covered. Adding
 * `onComplete: () => scene.scene.start('GameScene')` to `hudFade.ts` needed no run to know it would
 * land green.
 *
 * That is the same hole 9.3 had, found the same way, one round earlier — `tween-boundary.test.ts`'s
 * header records *"here there was no gate at all"*. 9.3 got a scan. 9.2 did not, and its verdict
 * rested on a reviewer tabulating five callbacks by hand. **A reviewer reading a diff is what both
 * criteria already proved insufficient**, because the criterion is a property of the TREE and the
 * next callback to be added is not in any diff anyone has read.
 *
 * ## What the rule actually forbids
 *
 * Not *callbacks* — `hudFade`, `hudGearPop` and `hudGearFlyers` all need `onStop`/`onComplete`, and
 * criterion **9.4 positively requires** two of them (a fade must force-settle its end value on stop
 * as well as complete). A gate that banned tween callbacks outright would red on arrival and be
 * deleted within the week.
 *
 * What 9.2 forbids is **SEQUENCING**: letting the game's progression depend on a tween finishing.
 * A tween is wall-clock; the sim is 60 Hz integer ticks. `BaseTween.destroy()` runs **neither**
 * callback (`ENGINE-NOTES.md`), `stop()` is silent for a tween that has already completed, and a
 * scene teardown mid-tween drops the rest — so anything downstream of "the tween finished" can
 * simply never happen. View bookkeeping that is idempotent survives that; game state does not.
 *
 * So the scan reads each tween config and the bodies of the named callbacks it points at, and
 * rejects the operations that MOVE THE GAME ON: a scene transition, an event emission, or the
 * level-completion callback. Everything the five live sites actually do — setting alpha, destroying
 * a sprite, deleting a Set entry — is untouched.
 *
 * ## Why a static scan and not a behavioural test
 *
 * Same reason as 9.3, and it is worth restating because it is the non-obvious half: "no game logic
 * is sequenced off this callback" is **not observable at runtime**. You cannot watch a program not
 * depend on something. `sourceScan.ts` already owns exactly this kind of engine over blanked
 * source, and blanking is load-bearing here too — `hudGearFlyers.ts` discusses `onComplete` in
 * prose at length, and a gate red on arrival gets weakened rather than obeyed.
 *
 * ## The C2 red-proof is committed, and it is driven against LITERALS
 *
 * The rejection tests hand the scanner source written inline, so the proof cannot rot into "the
 * rule fired on something" when the real files change underneath it. Both directions, per (C2):
 * a rule that only ever demonstrates rejection is satisfied by one that rejects everything.
 */

import { describe, expect, it } from 'vitest';
import { ALL_SOURCES, blankFor } from './sourceScan';

/** Tween callback keys. `onStart` is included: it sequences off the tween too, just at the far end. */
const CALLBACK_KEYS = ['onComplete', 'onStop', 'onStart', 'onYoyo', 'onRepeat'] as const;

/**
 * The operations that MOVE THE GAME ON, and so may not hang off a tween finishing.
 *
 * Deliberately narrow and concrete. A broad "touches anything stateful" rule would fire on
 * `flyers.delete(flyer)` — idempotent view bookkeeping the criterion has no quarrel with — and a
 * gate with false reds is a gate that gets edited instead of obeyed.
 */
const SEQUENCING = [
  { re: /\bscene\s*\.\s*(?:start|launch|stop|restart|pause|resume|switch)\s*\(/, what: 'a scene transition' },
  { re: /\.\s*emit\s*\(/, what: 'an event emission' },
  { re: /\bonCompleted\s*\(/, what: "the level-completion callback" },
] as const;

/** Every `src/` file, comments and strings blanked so prose about `onComplete` cannot false-red. */
function bodies(): [file: string, code: string][] {
  return Object.entries(ALL_SOURCES).map(([file, src]) => [file, blankFor('code', src)]);
}

/** Read forward from `open` (index of `(` or `{`) to its matching close. Returns the inner text. */
function balanced(code: string, open: number): string {
  const pairs: Record<string, string> = { '(': ')', '{': '}' };
  const close = pairs[code[open]!];
  if (close === undefined) return '';
  let depth = 0;
  for (let i = open; i < code.length; i += 1) {
    const c = code[i]!;
    if (c === code[open]) depth += 1;
    else if (c === close) {
      depth -= 1;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return code.slice(open + 1);
}

/**
 * The text every tween callback in `code` can execute: each callback's inline body, plus — when the
 * callback is passed by name — the body of that name's declaration in the same file.
 *
 * The named-reference half is not optional. Four of the five live sites pass `settleFade`,
 * `settleLines` and `settle` by name; a scan that only read inline arrow bodies would see nothing
 * at any of them and would report a clean sweep of a file it had not looked inside.
 */
export function callbackCode(code: string): string {
  const out: string[] = [];
  for (const key of CALLBACK_KEYS) {
    for (const m of code.matchAll(new RegExp(`\\b${key}\\s*:\\s*`, 'g'))) {
      const at = m.index! + m[0].length;
      const rest = code.slice(at);
      const arrow = /^(?:\([^)]*\)|\w+)\s*=>\s*/.exec(rest);
      if (arrow) {
        const after = at + arrow[0].length;
        // `=> { … }` takes the block; `=> expr` runs to the end of the argument.
        out.push(code[after] === '{' ? balanced(code, after) : rest.slice(arrow[0].length).split('\n')[0]!);
        continue;
      }
      const named = /^([A-Za-z_$][\w$]*)/.exec(rest);
      if (!named) continue;
      const decl = new RegExp(
        `(?:const|let|var)\\s+${named[1]}\\s*(?::[^=]*)?=|function\\s+${named[1]}\\s*\\(`,
      ).exec(code);
      if (!decl) continue;
      const brace = code.indexOf('{', decl.index + decl[0].length);
      if (brace >= 0) out.push(balanced(code, brace));
    }
  }
  return out.join('\n');
}

describe('9.2 — no game logic is sequenced off a tween completion', () => {
  it('the scan is not vacuous: it reads real files, and they really do register tween callbacks', () => {
    const scanned = bodies();
    expect(scanned.length).toBeGreaterThan(40);
    const withCallbacks = scanned.filter(([, code]) => callbackCode(code).trim().length > 0);
    expect(
      withCallbacks.map(([f]) => f).sort(),
      'no file in src/ registers a tween callback — the rule below is asserting about nothing',
    ).not.toEqual([]);
  });

  it('and it reaches INSIDE the named callbacks, not just inline arrow bodies', () => {
    // `hudFade.ts` passes `settleFade` and `settleLines` by NAME. If the extractor cannot follow a
    // name to its declaration it sees an empty body here and reports the file clean without having
    // looked at it — the exact false green this gate exists to prevent, one level down.
    const fade = Object.entries(ALL_SOURCES).find(([f]) => f.endsWith('hudFade.ts'));
    expect(fade, 'hudFade.ts moved — this gate cites it by name').toBeDefined();
    const extracted = callbackCode(blankFor('code', fade![1]));
    expect(
      extracted,
      'the extractor did not follow settleFade/settleLines to their declarations',
    ).toMatch(/setAlpha|alpha\s*=/);
  });

  it('finds no scene transition, event emission or completion callback in any tween callback', () => {
    const hits: string[] = [];
    for (const [file, code] of bodies()) {
      const inside = callbackCode(code);
      for (const { re, what } of SEQUENCING) {
        if (re.test(inside)) hits.push(`${file}: ${what}`);
      }
    }
    expect(
      hits,
      `A tween is wall-clock and the sim is 60 Hz integer ticks. BaseTween.destroy() runs NEITHER ` +
        `callback, stop() is silent for an already-completed tween, and a scene teardown mid-tween ` +
        `drops the rest — so anything downstream of "the tween finished" can simply never happen. ` +
        `Sequence it off the tick series instead (criterion 9.2).`,
    ).toEqual([]);
  });

  it('REJECTS each planted violation — this rule can go red (vault C2)', () => {
    const scan = (src: string): string[] =>
      SEQUENCING.filter(({ re }) => re.test(callbackCode(blankFor('code', src)))).map((r) => r.what);

    // The construction the adversarial brief named, verbatim in shape.
    expect(scan(`scene.tweens.add({ targets: t, alpha: 0, onComplete: () => { scene.scene.start('GameScene'); } });`))
      .toContain('a scene transition');
    // Passed by NAME — the half a naive scan misses.
    expect(scan(`const done = (): void => { events.emit('level:over'); };\nscene.tweens.add({ onStop: done });`))
      .toContain('an event emission');
    // Expression-bodied arrow, no braces.
    expect(scan(`scene.tweens.add({ onComplete: () => onCompleted() });`))
      .toContain("the level-completion callback");
  });

  it('ACCEPTS what the live sites actually do — the other direction (vault C2)', () => {
    // A rule that only ever demonstrates its rejection is satisfied by one that rejects
    // everything, which would make the real files above red for no reason.
    const scan = (src: string): string[] =>
      SEQUENCING.filter(({ re }) => re.test(callbackCode(blankFor('code', src)))).map((r) => r.what);

    // 9.4 positively REQUIRES this shape. A gate that rejected it would contradict a sibling criterion.
    expect(scan(`const settle = (): void => { line.setAlpha(end); };\nscene.tweens.add({ onStop: settle, onComplete: settle });`))
      .toEqual([]);
    // Idempotent view bookkeeping — hudGearFlyers.ts's real onComplete.
    expect(scan(`scene.tweens.add({ onComplete: () => { flyers.delete(flyer); flyer.destroy(); } });`))
      .toEqual([]);
    // A scene transition OUTSIDE any tween is none of 9.2's business.
    expect(scan(`function onKey(): void { scene.scene.start('GameScene'); }`)).toEqual([]);
  });

  it('does NOT fire on prose discussing onComplete — hudGearFlyers.ts has paragraphs of it', () => {
    const prose = blankFor(
      'code',
      "// Each flyer removes its own entry in onComplete, and scene.scene.start() would be wrong here.\nconst a = 1;",
    );
    expect(callbackCode(prose).trim()).toBe('');
  });
});
