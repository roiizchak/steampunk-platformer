import { describe, expect, it } from 'vitest';
import {
  CHOICE_FILL,
  HINT_FILL,
  SCRIM_ALPHA,
  SCRIM_COLOUR,
  TITLE_INKS,
} from '../../src/render/titleInk';
import { GAME_WIDTH } from '../../src/game/constants';

/**
 * # The welcome screen's contrast floor — criterion 11.12
 *
 * `contrast-floor.test.ts` is this file's older sibling and holds the gear counter to **3:1**,
 * because the counter is large bold text over an **arbitrary** background and `helpBanner.ts` proved
 * no ink pair can reach 4.5:1 there.
 *
 * The title screen is the case that note names as the way out: *"the only thing that beats it is a
 * scrim that makes the background KNOWN rather than arbitrary."* So this file holds a **stricter**
 * bar — 4.5:1, the small-text bar — and it can, because the scrim bounds what can be behind the
 * glyphs.
 *
 * ## What went red here, for real
 *
 * The hint line shipped as `#8f8776` and measured **3.13:1**. It was copied from
 * `LevelSelectScene`, where the same colour is safe at 5.33:1 — but only because that scene STOPS
 * `Game` and draws over the config's opaque `#12100e`. The colour travelled; the opaque background
 * did not. A gate that only checked colours against `LevelSelectScene`'s background would have
 * called it fine.
 *
 * ⚠️ **A red here is not fixed by lowering `MIN_RATIO`, and not by calling the text "large".**
 * `TITLE_INKS` carries each ink's design size so the size claim is data the test checks, not prose.
 *
 * **The mutations this file names:** restore `HINT_FILL` to `#8f8776`; drop `SCRIM_ALPHA` toward 0;
 * delete a fill's use from `TitleScene.ts`.
 */

/** WCAG relative luminance, sRGB — the same three functions `contrast-floor.test.ts` uses. */
function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(r: number, g: number, b: number): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function ratio(a: number, b: number): number {
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
function hexLuminance(hex: string): number {
  return luminance(
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  );
}

const SCRIM_RGB = [
  (SCRIM_COLOUR >> 16) & 0xff,
  (SCRIM_COLOUR >> 8) & 0xff,
  SCRIM_COLOUR & 0xff,
] as const;

/**
 * The background a glyph actually sits on: the level's pixel seen through the scrim.
 *
 * 🔴 Reads `SCRIM_ALPHA` rather than hard-coding 0.82. The whole bound depends on it, so a future
 * edit that makes the scrim more transparent must be able to turn this file red.
 */
function throughScrim(under: readonly [number, number, number]): number {
  return luminance(
    SCRIM_ALPHA * SCRIM_RGB[0] + (1 - SCRIM_ALPHA) * under[0],
    SCRIM_ALPHA * SCRIM_RGB[1] + (1 - SCRIM_ALPHA) * under[1],
    SCRIM_ALPHA * SCRIM_RGB[2] + (1 - SCRIM_ALPHA) * under[2],
  );
}

/**
 * The bar, **derived from the size rather than declared**.
 *
 * WCAG's large-text allowance is 18 pt (24 px) for a regular weight, or 14 pt bold. Nothing on this
 * screen is bold, so 24 physical px is the only door — and at the smallest supported window that is
 * `24 / (852/1920) = 54` design px. Only the 72 px heading is through it.
 *
 * 🔴 The first version of this file asserted all four were small text and **went red on its first
 * run** against a heading that draws at 31.9 physical px. Deriving the bar is the fix: a size change
 * moves the bar automatically, and nobody can clear a future red by reclassifying the text in prose.
 */
const LARGE_TEXT_PX = 24;
const SMALL_TEXT_RATIO = 4.5;
const LARGE_TEXT_RATIO = 3;

/** The smallest supported window, the same figure `contrast-floor.test.ts` measures against. */
const SMALLEST_WIDTH = 852;

function physicalPx(designPx: number): number {
  return designPx * (SMALLEST_WIDTH / GAME_WIDTH);
}
function barFor(designPx: number): number {
  return physicalPx(designPx) >= LARGE_TEXT_PX ? LARGE_TEXT_RATIO : SMALL_TEXT_RATIO;
}

describe('the welcome screen clears the small-text bar over everything the scrim admits', () => {
  it('the scrim really does bound the background to a narrow interval', () => {
    const brightest = throughScrim([255, 255, 255]);
    const darkest = throughScrim([0, 0, 0]);

    // Non-vacuity in both directions. A scrim at alpha 0 would make `brightest` 1.0 and every
    // assertion below meaningless; a scrim at alpha 1 would make the interval a point and the sweep
    // decorative. Neither is the shipped state.
    expect(brightest, `brightest admissible background is ${brightest.toFixed(4)}`).toBeLessThan(0.1);
    expect(brightest).toBeGreaterThan(darkest);
    expect(darkest).toBeGreaterThan(0);
  });

  it('the three lines a player must READ are all small text — so their bar is 4.5', () => {
    // The heading is decoration a player recognises; the subtitle, the choices and the audio hint
    // are the ones carrying information, and none of them is anywhere near the large-text door.
    for (const ink of TITLE_INKS.filter((i) => i.role !== 'title')) {
      expect(
        physicalPx(ink.designPx),
        `${ink.role} draws at ${physicalPx(ink.designPx).toFixed(1)}px`,
      ).toBeLessThan(LARGE_TEXT_PX);
      expect(barFor(ink.designPx)).toBe(SMALL_TEXT_RATIO);
    }
    // Guards the arithmetic above against a world-contract change.
    expect(GAME_WIDTH).toBe(1920);
  });

  // The sweep. Every underlying grey the level could put behind the scrim, not only the two ends —
  // so the assertion does not depend on the ratio being monotonic in background luminance.
  function worstRatio(fill: string): { worst: number; under: number } {
    const lumInk = hexLuminance(fill);
    let worst = Infinity;
    let under = -1;
    for (let u = 0; u <= 255; u += 1) {
      const r = ratio(lumInk, throughScrim([u, u, u]));
      if (r < worst) {
        worst = r;
        under = u;
      }
    }
    return { worst, under };
  }

  for (const ink of TITLE_INKS) {
    it(`${ink.role} (${ink.fill}) clears its own bar across the whole interval`, () => {
      const { worst, under } = worstRatio(ink.fill);
      expect(
        worst,
        `${ink.role} bottoms out at ${worst.toFixed(2)}:1 with grey ${under} behind the scrim`,
      ).toBeGreaterThanOrEqual(barFor(ink.designPx));
    });
  }

  it('and in fact ALL FOUR clear the strict 4.5 bar, heading included', () => {
    // The heading earns 3:1 by size, but it does not need the allowance — recorded so a later change
    // that would drop it to 3.2:1 has to be a deliberate argument rather than a silent slide into a
    // door that happened to be open.
    for (const ink of TITLE_INKS) {
      const { worst } = worstRatio(ink.fill);
      expect(worst, `${ink.role}: ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(SMALL_TEXT_RATIO);
    }
  });

  it('the hint stays visibly quieter than the choices it sits under', () => {
    // The repair must not flatten the hierarchy into four equally loud lines. A ratio above 1.2
    // between them is a step a reader sees; equality would mean the fix ate the design.
    const step = ratio(hexLuminance(CHOICE_FILL), hexLuminance(HINT_FILL));
    expect(step, `choice:hint is ${step.toFixed(2)}:1`).toBeGreaterThan(1.2);
    expect(hexLuminance(HINT_FILL)).toBeLessThan(hexLuminance(CHOICE_FILL));
  });
});

/**
 * ## The draw-path half
 *
 * Everything above is `titleInk.ts` making claims about itself. *(vault: a decision function with no
 * consumer is the same defect as a burst of zero particles.)* Blanking `TitleScene`'s use of these
 * constants would leave every assertion above green and the screen unchanged on screen, so the scene
 * has to be checked for actually spending them.
 *
 * Source text through `import.meta.glob`, the idiom `effects-draw-path.test.ts` and
 * `docs-contract.test.ts` already use — this project's tests do not reach the filesystem with
 * `node:fs`.
 */
const SCENE_SOURCE = import.meta.glob('../../src/scenes/TitleScene.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

/**
 * 🔴 Strip comments before scanning.
 *
 * A source-text gate that reads comments can be satisfied by **commented-out code** — the exact
 * shape of a change that removes a line from the screen while leaving its text in the file. Codex
 * implementation review round 2, finding 4. Crude on purpose: it only has to defeat `//` and `/* *​/`,
 * and it must not eat a `//` inside a string, of which this scene has none.
 */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('TitleScene spends the inks rather than merely importing them', () => {
  const source = stripComments(Object.values(SCENE_SOURCE)[0] ?? '');

  it('the glob resolved the scene', () => {
    expect(source.length, 'TitleScene.ts read empty — the glob path is wrong').toBeGreaterThan(1000);
    expect(source).toContain('export class TitleScene');
    // Non-vacuity for the stripper itself: it must remove prose without eating the code.
    expect(source, 'stripComments ate the file').toContain('applyLayout');
  });

  /**
   * 🔴 **`make` must be the thing that draws.** Every assertion below routes through the local
   * `make` helper, and all of them stay green if `make` is reduced to a no-op that returns a bare
   * object — the styles would still be "passed to a make() call" while the screen drew nothing.
   * Codex implementation review round 2, finding 4. So the helper's own body is pinned first.
   */
  it('make() is a wrapper around this.add.text, not a name', () => {
    expect(source, 'make no longer reaches the display list').toMatch(
      /const make = [^;]*this[.]add[.]text[(]/,
    );
  });

  /**
   * 🔴 **A style DECLARATION is not a drawn object.** The first version of this block asserted only
   * that each fill appeared in a `color:` position — which stays green if the `make(...)` call that
   * spends the style is deleted and the constant sits in an unused `const`. Codex implementation
   * review, finding 6. So the chain is followed the whole way: fill → style name → a `make()` call.
   */
  const STYLES: ReadonlyArray<readonly [string, string]> = [
    ['TITLE_FILL', 'TITLE_STYLE'],
    ['SUB_FILL', 'SUB_STYLE'],
    ['CHOICE_FILL', 'CHOICE_STYLE'],
    ['HINT_FILL', 'HINT_STYLE'],
  ];

  for (const [fill, style] of STYLES) {
    it(`${fill} reaches a DRAWN object through ${style}`, () => {
      expect(source, `${fill} is not the colour of ${style}`).toMatch(
        new RegExp(`${style} = \\{[^}]*color: ${fill}`),
      );
      // And that style is passed to a make() call — the thing that actually adds text to the scene.
      expect(source, `${style} is declared but never drawn`).toMatch(
        new RegExp(`make[(][^;]*${style}[)]`),
      );
    });
  }

  /**
   * The five LINES, named. A bare count of five `make()` calls passes if one line is deleted and
   * another duplicated — the screen would lose a choice and the gate would not notice. Codex
   * implementation review round 2, finding 4.
   */
  const LINES: ReadonlyArray<readonly [string, string]> = [
    ['STEAMPUNK PLATFORMER', 'TITLE_STYLE'],
    ['a short climb through the works', 'SUB_STYLE'],
    ['ENTER   begin', 'CHOICE_STYLE'],
    ['L   choose a level', 'CHOICE_STYLE'],
  ];

  for (const [text, style] of LINES) {
    it(`the line "${text}" is drawn with ${style}`, () => {
      expect(source, `"${text}" is not drawn`).toContain(`make('${text}', ${style})`);
    });
  }

  it('the audio hint is drawn from the live state, not a fixed string', () => {
    // The one line whose text is computed. It must go through `audioHint`, or the readout that
    // answers "did that key do anything?" is a constant again.
    expect(source).toMatch(/this[.]hint = make[(]audioHint[(][^;]*HINT_STYLE[)]/);
  });

  it('five lines and no more — an extra draw is a layout the row fractions do not place', () => {
    // `applyLayout` positions items against a fixed five-entry `rows` table; a sixth would land at
    // its `?? 0.5` fallback, on top of another line.
    // Five call sites. The declaration reads `const make = (text, style) =>`, so it contributes no
    // `make(` of its own — checked by running this, not assumed.
    const draws = source.match(/make[(]/g) ?? [];
    expect(draws.length, `${draws.length} occurrences of make(`).toBe(5);
  });

  it('the scrim is drawn with the colour and alpha the sweep assumes', () => {
    // Anchored on the factory call, not a bare mention: two constants sitting in a comment or an
    // unused local would satisfy a loose match while nothing painted the scrim.
    expect(source).toMatch(/add[.]rectangle[(][^;]*SCRIM_COLOUR, SCRIM_ALPHA[)]/);
  });

  it('no raw hex colour was inlined back into the scene', () => {
    const inlined = source.match(/color: '#[0-9a-fA-F]{6}'/g) ?? [];
    expect(inlined, `inlined colours: ${inlined.join(', ')}`).toHaveLength(0);
  });
});
