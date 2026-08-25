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
import { callbackText } from './tweenCallbacks';

/**
 * The operations that MOVE THE GAME ON, and so may not hang off a tween finishing.
 *
 * Deliberately narrow and concrete. A broad "touches anything stateful" rule would fire on
 * `flyers.delete(flyer)` — idempotent view bookkeeping the criterion has no quarrel with — and a
 * gate with false reds is a gate that gets edited instead of obeyed.
 */
const SEQUENCING = [
  // Every ScenePlugin method that moves the game between scenes. The first draft named seven; the
  // Codex implementation review pointed out that `transition`, `run`, `sleep`, `wake`, `setActive`
  // and `remove` are real progression operations too — a gate that lists most of an API is a gate
  // with a documented way round it.
  {
    re: /\bscene\s*\.\s*(?:start|launch|stop|restart|pause|resume|switch|transition|run|sleep|wake|setActive|remove)\s*\(/,
    what: 'a scene transition',
  },
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
 * Every way this codebase can open a tween. `chain` and `addCounter` are Phaser APIs too.
 *
 * 🔴 **`.add.tween(` joined 2026-08-25, closing D14's share of 9.2/9.2b/9.2c.** It requires a member
 * access before `add` rather than matching the bare word — see `namesSceneFactory` in
 * `tweenCallbacks.ts` for why the two halves of this alternation are deliberately asymmetric.
 */
const TWEEN_CALLS =
  /(?:\btweens\s*\.\s*(?:add|addCounter|addMultiple|chain|create)|\.\s*add\s*\.\s*tween)\s*\(/g;

/**
 * A bare identifier used as a callback value: `onComplete: settleFade`.
 *
 * Written as a literal rather than built from `CALLBACK_KEYS` on purpose. Composing it through a
 * template string put a `\b` and four `\s` one editing pass away from silently becoming a backspace
 * character and a bare `s` — which is not a red, it is a rule that quietly matches nothing. Keep the
 * two lists in step by hand; a scan that cannot fire is the failure mode this whole file exists for.
 */
const NAMED_CALLBACK =
  /\b(?:onComplete|onStop|onStart|onYoyo|onRepeat)\s*:\s*([A-Za-z_$][\w$]*)\s*[,}]/g;

/**
 * The text a tween's callbacks can execute.
 *
 * **Two halves, and the docstring is deliberately narrow about both** — an earlier draft of this
 * function claimed to read "every config and named callback" and the Codex implementation review
 * showed that false in eight ways at once (`onComplete() {}` shorthand, `function () {}`, `this.foo`,
 * quoted keys, `{ onComplete }` shorthand, `async () =>`, a multiline expression body truncated at
 * the first newline, and `cfg.onComplete = done` assigned after construction). A gate whose docstring
 * overstates its reach is worse than a narrow one, because the next reader stops looking.
 *
 * **(a) The whole balanced `tweens.*(…)` call.** Not each callback body picked out by shape — the
 * entire argument text. That is what makes every *inline* form fall in automatically: arrow, block,
 * expression, `function`, `async`, shorthand method, quoted key. It also means a sequencing call
 * sitting in the config but outside a callback counts, which is the safe direction.
 *
 * **(b) The declaration body of any bare identifier used as a callback value.** Three of the five
 * live sites pass `settleFade`, `settleLines` and `settle` by name, so (a) alone would see a name and
 * not a body, and would report a clean sweep of a file it had not looked inside.
 *
 * ### What it still does NOT reach — stated, not implied
 *
 * ⚠️ **2026-08-25 correction: "the four holes below are now COVERED" was WRONG, and the adversarial
 * gate brief measured it.** Of the four, ONE is covered by the parser rule; two are not — an imported
 * callback and a config passed as a variable both yield **zero** callback bodies from
 * `tweenCallbacks.ts`, which reads as a clean file rather than an unscanned one — and shadowing still
 * hides a violation, because `declarations()` is file-wide and last-wins, as its own docstring says in
 * the same commit. The sentence below is left standing with this correction above it rather than
 * quietly rewritten, because a claim that was published and believed is worth more as a corrected
 * record than as a tidy one.
 *
 * 🔴 **2026-08-24: the four holes below are partly covered, by a second rule rather than by editing
 * this one.** `9.2c` in this file runs the same `SEQUENCING` patterns over a real parser's
 * extraction (`tweenCallbacks.ts`), and `tween-sim-writes.test.ts` uses it for the sim-write half.
 * This extractor is left exactly as it was: it has committed fixtures, it has never been wrong on
 * this tree, and replacing a proven rule with a new one is how a gate that worked becomes a gate
 * nobody has watched fail. The list below is therefore what THIS function reaches, not what the
 * criterion is gated by.
 *
 * ⚠️ **"…means a real parser, and the project's dependency set is frozen" was RIGHT**, and this
 * session checked it instead of assuming either way. TypeScript 7.0.2 is the Go port:
 * `require('typescript')` exports exactly `version` and `versionMajorMinor` — there is no
 * `createSourceFile`. `typescript/unstable/ast` is a **scanner** with no parser entry point, and
 * `typescript/unstable/sync` is a Program/Checker API that drives the native `tsgo` binary. So the
 * parser is a dependency, and it took an owner decision (2026-08-24) rather than a clever import.
 *
 * A member-expression callback (`onComplete: this.foo`), an imported one, a config built elsewhere
 * and passed as a variable, or a name that shadows another declaration in the same file (the first
 * textual declaration wins; there is no lexical scoping here). Each is recorded rather than closed:
 * closing them means a real parser, and the project's dependency set is frozen. **None occurs on
 * this tree** — checked.
 */
export function callbackCode(code: string): string {
  const out: string[] = [];
  for (const call of code.matchAll(TWEEN_CALLS)) {
    const open = call.index! + call[0].length - 1;
    const args = balanced(code, open);
    out.push(args);
    // (b) — follow every bare-identifier callback to its declaration.
    for (const ref of args.matchAll(NAMED_CALLBACK)) {
      const name = ref[1]!;
      // `String.raw` for the same reason as NAMED_CALLBACK: this needs `${name}` interpolated, so it
      // cannot be a literal, and a plain template would eat every backslash in it.
      const decl = new RegExp(
        String.raw`(?:const|let|var)\s+${name}\s*(?::[^=]*)?=|function\s+${name}\s*\(`,
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

/**
 * 9.2c — the SEQUENCING rule, re-asked of the parser.
 *
 * `callbackCode()` is a regex extractor with four honestly-documented holes: a member-expression
 * callback (`onComplete: this.foo`), an imported one, a config built elsewhere and passed as a
 * variable, and a shadowed name. §1f of the next-session prompt carries them as open debt.
 *
 * 🔴 **They are not closed by deleting that extractor.** It has committed fixtures, it has never
 * been wrong on this tree, and swapping a proven rule for a new one mid-session is how a gate that
 * worked becomes a gate nobody has watched fail. Instead the same SEQUENCING patterns are run over
 * the PARSER's extraction as well. Both must be clean. Where the two disagree the parser reaches
 * further, so a violation hiding in one of those four shapes is now a red rather than a paragraph.
 */
describe('9.2c — the sequencing rule, asked of the parser as well as the regex', () => {
  it('finds no scene transition, event emission or completion callback — via the AST extractor', () => {
    const hits: string[] = [];
    for (const [file, src] of Object.entries(ALL_SOURCES)) {
      const inside = callbackText(src);
      for (const { re, what } of SEQUENCING) if (re.test(inside)) hits.push(`${file}: ${what}`);
    }
    expect(hits, 'the parser sees a sequencing call the regex extractor missed').toEqual([]);
  });

  it('REJECTS the member-expression callback the regex extractor cannot reach (vault C2)', () => {
    // `onComplete: this.foo` — hole one of four, now a red. Driven through the same production
    // helper the check above uses, not against a pattern in isolation.
    const src = `class S {
  foo(): void { this.scene.start('GameScene'); }
  bar(): void { this.tweens.add({ targets: o, onComplete: this.foo }); }
}`;
    const viaAst = SEQUENCING.filter(({ re }) => re.test(callbackText(src))).map((r) => r.what);
    expect(viaAst, 'the parser must see through this.foo').toContain('a scene transition');
    // And the honest comparison: the regex extractor does NOT, which is the debt being closed.
    const viaRegex = SEQUENCING.filter(({ re }) => re.test(callbackCode(blankFor('code', src)))).map((r) => r.what);
    expect(viaRegex, 'recorded, not asserted as acceptable: this is the hole').toEqual([]);
  });

  it('ACCEPTS the live sites through the AST extractor too — the other direction', () => {
    const ok = 'scene.tweens.add({ onComplete: () => { flyers.delete(flyer); flyer.destroy(); } });';
    expect(SEQUENCING.filter(({ re }) => re.test(callbackText(ok)))).toEqual([]);
  });
});
