import { describe, expect, it } from 'vitest';
import { TITLE_INKS, TITLE_ROWS, audioHint, panelSize } from '../../src/render/titleInk';
import { GAME_HEIGHT, GAME_WIDTH } from '../../src/game/constants';

/**
 * # `TitleScene` spends what `titleInk.ts` declares — criterion 11.12's draw-path half
 *
 * Split out of `title-contrast.test.ts` on 2026-08-29 when the geometry and drift gates added by the
 * Codex implementation review pushed that file to 404 lines, four over the hard ceiling. The seam is
 * the one the original file already named in prose: **above the split, `titleInk.ts` makes claims
 * about itself; here, the scene is checked for actually spending them.** A decision function with no
 * consumer is the same defect as a burst of zero particles — blanking every use of these constants
 * would leave the contrast sweep entirely green and the screen unchanged.
 */

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
  return (
    text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      // 🔴 TRAILING `//` too, not only whole-line ones. `void 0; // make(...)` satisfied every line
      // assertion below while the screen drew nothing — Codex implementation review round 3,
      // finding 4. The `[^:]` guard leaves a `https://` inside a string alone; this scene has none,
      // and the non-vacuity assertion below catches an over-eager strip.
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  );
}

describe('TitleScene spends the inks rather than merely importing them', () => {
  const source = stripComments(Object.values(SCENE_SOURCE)[0] ?? '');

  it('the glob resolved the scene', () => {
    expect(source.length, 'TitleScene.ts read empty — the glob path is wrong').toBeGreaterThan(1000);
    expect(source).toContain('export class TitleScene');
    // Non-vacuity for the stripper: it must remove prose without eating the code.
    expect(source, 'stripComments ate the file').toContain('applyLayout');
  });

  /**
   * 🔴 The stripper gets its own fixture.
   *
   * Restoring the whole-line-only version left every assertion below green, because the real file
   * happens to contain no commented-out draw — so the gate proved nothing about the thing it was
   * added for. Codex implementation review round 4, finding 2. A committed fixture is the §5 answer:
   * *"a gate that cannot go red is decoration"*.
   */
  it('stripComments removes trailing comments and keeps a URL intact', () => {
    expect(
      stripComments("void 0; // make('L   choose a level', CHOICE_STYLE)"),
      'a trailing comment must not satisfy a line assertion',
    ).not.toContain('CHOICE_STYLE');
    expect(stripComments('/* make(x) */ const a = 1;'), 'block comments go too').toBe(' const a = 1;');
    expect(stripComments("const u = 'https://example.com/x';"), 'a URL is not a comment').toContain(
      'https://example.com/x',
    );
    expect(stripComments('const a = 1;\n// whole line\nconst b = 2;')).not.toContain('whole line');
  });

  /**
   * 🔴 **`make` must be the thing that draws.** Every assertion below routes through the local
   * `make` helper, and all of them stay green if `make` is reduced to a no-op that returns a bare
   * object — the styles would still be "passed to a make() call" while the screen drew nothing.
   * Codex implementation review round 2, finding 4. So the helper's own body is pinned first.
   */
  it('make() passes its OWN arguments to this.add.text', () => {
    // 🔴 Not just "the factory is named in the body". `this.add.text(0, 0, '', {})` satisfies that
    // and draws a blank screen with every ink unspent — Codex implementation review round 4,
    // finding 1. The parameters have to be the ones that arrive.
    expect(source, 'make no longer spends its arguments').toMatch(
      /const make = [^;]*this[.]add[.]text[(]0, 0, text, style[)]/,
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
   * The four LINES, named. A bare count of `make()` calls passes if one line is deleted and
   * another duplicated — the screen would lose a choice and the gate would not notice. Codex
   * implementation review round 2, finding 4.
   */
  const LINES: ReadonlyArray<readonly [string, string]> = [
    ['STEAMPUNK PLATFORMER', 'TITLE_STYLE'],
    ['a short climb through the works', 'SUB_STYLE'],
    ['ENTER or TAP   choose a level', 'CHOICE_STYLE'],
  ];

  for (const [text, style] of LINES) {
    it(`the line "${text}" is drawn with ${style}`, () => {
      expect(source, `"${text}" is not drawn`).toContain(`make('${text}', ${style})`);
    });
  }

  it('the audio hint is drawn from the live state, not a fixed string', () => {
    // Half of the claim: the scene routes that line through `audioHint`.
    expect(source).toMatch(/this[.]hint = make[(]audioHint[(][^;]*HINT_STYLE[)]/);
  });

  it('and audioHint actually SPENDS both of its arguments', () => {
    // 🔴 The other half. An `audioHint` that ignored both arguments and returned a fixed '100%'
    // satisfied the source scan above while the readout was a constant again — Codex implementation
    // review round 3, finding 4. This assertion is behavioural, which is why the function moved to
    // the engine-free module: a source-text gate cannot ask what a function RETURNS.
    expect(audioHint(false, 1)).toContain('100%');
    expect(audioHint(false, 0.4)).toContain('40%');
    expect(audioHint(true, 0.4), 'mute must win over the number').toContain('muted');
    expect(audioHint(true, 0.4)).not.toContain('40%');
    // And it is still a hint for the keys it names.
    expect(audioHint(false, 1)).toContain('M mute');
  });

  it('four lines and no more — an extra draw is a layout the row fractions do not place', () => {
    // `applyLayout` positions items against `TITLE_ROWS`, which has FOUR entries; a fifth line would
    // land on its `?? 0.5` fallback, on top of another one. (This said "five" until 2026-08-29, from
    // the design that had a second choice line for `L`.) The declaration reads
    // `const make = (text, style) =>`, so it contributes no `make(` of its own — checked by running
    // this, not assumed.
    const draws = source.match(/make[(]/g) ?? [];
    expect(draws.length, `${draws.length} occurrences of make(`).toBe(4);

    // 🔴 And exactly ONE `this.add.text`, inside `make`. Counting only `make(` let another line
    // be added as a direct `this.add.text(...)` — drawn, unplaced by `applyLayout`'s row table, and
    // invisible to every assertion here. Codex implementation review round 3, finding 4.
    const rawText = source.match(/this[.]add[.]text[(]/g) ?? [];
    expect(rawText.length, `${rawText.length} direct this.add.text calls`).toBe(1);
  });

  /**
   * 🔴 **The sweep's own premise, asserted instead of assumed.**
   *
   * Every contrast figure in this file is measured against `SCRIM_ALPHA` of `SCRIM_COLOUR` — which
   * is what the panel paints, and only where the panel is. Nothing checked that the four rows land
   * on it. Shrinking `panelSize` from 0.56 to 0.30 would have dropped the heading and the hint onto
   * the raw parallax backdrop, where the measured ratios mean nothing, and left this file, both
   * production pixel ratios and all 183 e2e specs green: the panel still covers the centre patch, so
   * neither luminance bound moves. A gate that cannot see the defect it names is decoration.
   * Codex implementation review of the redesign, finding 3.
   *
   * The extent is the glyph BOX, not the row centre — a heading whose centre is inside the band by
   * less than half its own height still has ink outside it.
   */
  it('every row of ink is drawn inside the panel, at the design size', () => {
    const { h } = panelSize(GAME_WIDTH, GAME_HEIGHT);
    const top = GAME_HEIGHT / 2 - h / 2;
    const bottom = GAME_HEIGHT / 2 + h / 2;

    expect(TITLE_ROWS, 'one row fraction per ink, in creation order').toHaveLength(TITLE_INKS.length);

    for (const [index, ink] of TITLE_INKS.entries()) {
      const centre = GAME_HEIGHT * (TITLE_ROWS[index] ?? 0.5);
      const half = ink.designPx / 2;
      expect(centre - half, `${ink.role} overflows the top of the panel`).toBeGreaterThanOrEqual(top);
      expect(centre + half, `${ink.role} overflows the bottom of the panel`).toBeLessThanOrEqual(bottom);
    }
  });

  /**
   * 🔴 The generated plate is DRAWN, sized to the live canvas, and sits under the band.
   *
   * ⚠️ **This replaced a drift gate, it did not lose one.** Until 2026-08-29 the backdrop was three
   * parallax layers and this test pinned their drift to `frameClock.drainTicks` — the fix for a real
   * defect, where a constant named `PER_TICK` was added once per rendered FRAME and the screen moved
   * four times faster on a 240 Hz box than on the owner's 60 Hz one. The owner then chose the
   * generated backdrop, a single plate cannot drift without exposing its own edge, and the drift,
   * its constant and that gate all went together. A gate is retired with the thing it guarded or it
   * becomes decoration; what replaces it guards the draw path that exists now.
   */
  it('the title plate is drawn from the catalog key, under the band, at the live canvas size', () => {
    expect(source, 'the plate must be added from the shared key, not a string literal').toMatch(
      /\.image\(0, 0, TITLE_BACKDROP_KEY\)/,
    );
    // Under the band (drawn at default depth) and above the opaque floor at -200. Both numbers
    // matter: at depth 0 the floor painted straight over the art, which is how the first redesign
    // shipped a screen that looked exactly like the flat one it replaced.
    expect(source, 'the plate sits between the opaque floor and the band').toMatch(
      /\.setDepth\(-100\)/,
    );
    expect(source, 'the opaque floor stays below it').toMatch(/\.setDepth\(-200\)/);
    // 🔴 And it must be RESIZED, or it draws at its own 1920x1080 and leaves bare ground on any
    // other canvas. `setSize` would be the wrong call on an Image — that is a TileSprite's API.
    expect(source, 'the plate must follow the live canvas size').toMatch(
      /backdropImage\?\.setDisplaySize\(width, height\)/,
    );
    // The parallax rig is gone from this scene entirely; a leftover import would still typecheck.
    expect(source, 'no parallax may remain in the title scene').not.toMatch(/[Pp]arallax/);
  });

  /**
   * 🔴 Both halves of the geometry claim have to reach the SCENE, or the test above is a fact about
   * two exported constants and nothing else. Codex implementation review of the redesign, round 3,
   * finding 1, which named all three escapes: a literal panel size, `rows[0]` instead of
   * `rows[index]`, and the shared table imported and then ignored.
   *
   * ⚠️ The negative assertion below was written as `/rows = \[\s*0[.]/` and reached the file as
   * `/rows = [s*0[.]/`, the backslashes eaten in transit. **It still worked**, and the first
   * correction here claimed otherwise: that trailing group is a character class containing a literal
   * `[`, so `rows = [` matches and the inlined-array mutation would still have been caught. It was
   * **overbroad**, not vacuous — it also matched `rows = 0` and anything starting `rows = s`. Codex
   * implementation review of the redesign, round 4, correcting the round-3 note that stood here.
   */
  it('the scene sizes the panel and places the rows from the shared table', () => {
    expect(source, 'the panel must be sized FROM panelSize, not from a literal').toMatch(
      /const \{ w, h \} = panelSize\(width, height\);/,
    );
    expect(source, 'and that result must reach the panel').toMatch(/\.setSize\(w, h\)/);

    expect(source).toMatch(/const rows = TITLE_ROWS;/);
    // Indexed PER ITEM. `rows[0]` stacks all four lines on top of one another while every assertion
    // that reads only the constants stays green.
    expect(source, 'each item must read its OWN row').toMatch(
      /item\.setPosition\(width \/ 2, height \* \(rows\[index\] \?\? 0\.5\)\)/,
    );
    expect(source, 'a re-inlined fraction table would escape the check above').not.toMatch(
      /rows = \[\s*0\./,
    );
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
