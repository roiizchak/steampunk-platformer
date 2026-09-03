import { describe, expect, it } from 'vitest';

/**
 * Criterion 12.13's source half: the four CSS rules that stop the BROWSER claiming a gesture the
 * game needs, and the one viewport attribute that must stay absent.
 *
 * 🔴 **Nothing in this repository asserted any of it until 2026-09-02.** A repo-wide search for
 * `touch-action`, `overscroll-behavior`, `user-scalable` or `tap-highlight` outside `node_modules`
 * and `dist` returned exactly one hit, and it was prose in a handoff document. Every one of the
 * three device checks 12.13 names — a drag off a control, a two-finger pinch, a double-tap — is
 * prevented by these five lines, and all five could have been deleted by any refactor with the
 * whole suite green.
 *
 * ## Why the viewport assertion is an ABSENCE
 *
 * `user-scalable=no` is deliberately NOT on the viewport meta (`index.html:72-74`): disabling zoom
 * outright is an accessibility anti-pattern, and `touch-action: none` already stops pinch *inside
 * the game* without taking it away from the rest of the page. So the gate asserts the absence, and
 * a future session that "fixes pinch" by adding `user-scalable=no` gets a red rather than a silent
 * accessibility regression. `maximum-scale` is the same attribute wearing a different name — iOS
 * treats `maximum-scale=1` as `user-scalable=no` — so both are named.
 *
 * ## What this file cannot see
 *
 * It reads the SOURCE `index.html`. A build that dropped the `<style>` block would leave it green,
 * which is why `tools/gen/verify-dist.mjs` asserts the same five things against `dist/index.html`
 * — a game-source gate cannot see a shipped-bytes defect *(vault 3.1)*. And neither of them can
 * see whether the browser actually honoured the rules: that is the e2e half, in
 * `tests/e2e/phase-12-gestures.spec.ts`, and the device half, which is the criterion's owner.
 */
const INDEX = Object.values(
  import.meta.glob('../../index.html', { query: '?raw', import: 'default', eager: true }),
)[0] as string;

/**
 * The rules, and the gesture each one is the only thing standing between and the player.
 *
 * 🔴 **Each is matched as a DECLARATION, not as a substring.** `user-select: none` occurs inside
 * `-webkit-user-select: none`, so a `toContain` for the bare string went on passing with the
 * standard declaration deleted — the prefixed one underneath it satisfied the search. Codex round
 * 21, finding 2, and it is the same nearby-text shape as the mutation that found `verify-dist`
 * reading `index.html`'s shipped CSS *comment* about `touch-action` as if it were the rule. A
 * declaration starts at `{`, `;` or a line break, which is what the `(^|[{;\n])\s*` prefix says.
 */
export const TOUCH_RULES = [
  ['touch-action: none', 'the browser claims the drag and pans or pinch-zooms the page'],
  ['overscroll-behavior: none', 'a downward flick pull-to-refreshes and reloads the game mid-level'],
  ['user-select: none', 'a long press raises the text-selection handles over the controls'],
  ['-webkit-tap-highlight-color: transparent', 'iOS strobes a grey flash on every jump'],
] as const;

/** A regex that matches `prop: value` only where a DECLARATION starts, never mid-property. */
export function declarationRe(rule: string): RegExp {
  return new RegExp(`(^|[{;\n])\\s*${rule.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')}\\s*[;}]`);
}

/** The selector list the rules must sit on: the page, its body, and the wrapper the canvas is in. */
const SELECTOR = 'html,\n      body,\n      #game {';

describe('the browser is stopped from claiming a touch gesture (12.13)', () => {
  it('puts all four touch rules on html, body and #game together', () => {
    const start = INDEX.indexOf(SELECTOR);
    expect(start, 'the html/body/#game rule block is gone or was reformatted').toBeGreaterThan(-1);
    const block = INDEX.slice(start, INDEX.indexOf('}', start));
    for (const [rule, cost] of TOUCH_RULES) {
      expect(
        declarationRe(rule).test(block),
        `\`${rule}\` is not a DECLARATION on html/body/#game — without it, ${cost}`,
      ).toBe(true);
    }
  });

  it('leaves zoom available to the page: no user-scalable, no maximum-scale', () => {
    const meta = /<meta\s+name="viewport"[^>]*>/.exec(INDEX);
    expect(meta, 'there is no viewport meta at all').not.toBeNull();
    // 🔴 An absence, on purpose. See this file's header: `touch-action` already stops pinch inside
    // the game, and taking zoom from the whole page is the accessibility anti-pattern it replaced.
    expect(meta![0], 'user-scalable is back — that is the anti-pattern touch-action replaced').not.toContain(
      'user-scalable',
    );
    expect(meta![0], 'maximum-scale is user-scalable=no on iOS, under another name').not.toContain(
      'maximum-scale',
    );
  });

  it('still targets no canvas rule, so the ScaleManager stays the only writer', () => {
    // Not a gesture claim, but it is the invariant the four rules were added next to, and the one a
    // careless edit to this block would break. `canvas {` anywhere here is vault 1.5's mechanism.
    expect(INDEX, 'a CSS rule targets `canvas` — the ScaleManager owns canvas.style').not.toMatch(
      /(^|[\s,>])canvas\s*\{/m,
    );
  });
});
