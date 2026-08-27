import { describe, expect, it } from 'vitest';

import { CATCH_ALL_SOURCE, headersFrom } from '../../tools/gen/vercelHeaders.mjs';

/**
 * **Criterion 10.5's own existence gate, and the CSP lookup's two refusals.**
 *
 * ## Why this file exists
 *
 * 10.5 is *"the build configuration typechecked as its own program"*, discharged by
 * `tsconfig.build.json` plus `npm run typecheck:build`. Both of the criterion's gate owners found
 * the same hole from opposite directions: **nothing gated the program's own reach.**
 *
 *  - Delete `"vite.config.ts"` from `tsconfig.build.json`'s include list and everything stays green.
 *    TypeScript does **not** error on a named include that matches nothing — it errors only when
 *    EVERY pattern matches nothing. Measured twice on 2026-08-26, because the opposite was written
 *    down in `.vercelignore` as a fact and acted on.
 *  - Delete the `-p tsconfig.build.json` step from `package.json`'s `build` and the second program
 *    simply stops running. `npm test` would not notice.
 *
 * Either way the criterion reverts to its pre-Phase-10 state with a green suite over it — the exact
 * shape of *"a gate quietly losing the ability to fail"*. So the include list and the two script
 * links are asserted here, in the suite that runs on every commit.
 *
 * ## And the two refusals nobody had watched fail
 *
 * `vercelHeaders.mjs` throws rather than guessing when `vercel.json`'s headers rules are not the
 * single catch-all it knows how to reproduce. Neither throw had ever been exercised: no test
 * constructs such a document, and `productionHeaders()` reads the real file, which is well-formed.
 * A guard nobody has seen fire is decoration *(vault C1, C2)*. `headersFrom()` was split out of
 * `productionHeaders()` for no other reason than to make both reachable from here.
 */

const PKG = Object.values(
  import.meta.glob('../../package.json', { eager: true, query: '?raw', import: 'default' }),
)[0] as string;

const BUILD_TSCONFIG = Object.values(
  import.meta.glob('../../tsconfig.build.json', { eager: true, query: '?raw', import: 'default' }),
)[0] as string;

/**
 * The files the build program must reach. Each is here because it DECIDES something that ships:
 * the browser contract and minifier, the production CSP, and the plugin that refuses a bundle
 * carrying a dev seam.
 */
const REQUIRED_INCLUDES = [
  'vite.config.ts',
  'vercel.json',
  'tools/gen/devSeamGate.mjs',
  'tools/gen/devSeamAst.mjs',
  'tools/gen/vercelHeaders.mjs',
];

describe('the build program (criterion 10.5)', () => {
  it('reaches every file that decides something about the shipped artifact', () => {
    for (const entry of REQUIRED_INCLUDES) {
      expect(
        BUILD_TSCONFIG,
        `tsconfig.build.json no longer includes "${entry}". A named include that matches nothing ` +
          'is NOT a tsc error — only an include list where every pattern misses is. So dropping ' +
          'this entry silently shrinks what criterion 10.5 checks, with the whole suite green.',
      ).toContain(`"${entry}"`);
    }
  });

  it('checks the plugin BODY, not only its declaration', () => {
    // The half that was recorded as met and was not: `allowJs`/`checkJs` are what put the 190-line
    // `.mjs` into the program instead of the 18-line `.d.mts` that merely describes it.
    expect(BUILD_TSCONFIG).toContain('"allowJs": true');
    expect(BUILD_TSCONFIG).toContain('"checkJs": true');
  });

  it('is actually run — by `typecheck:build` and by `build`', () => {
    const scripts = JSON.parse(PKG).scripts as Record<string, string>;
    expect(
      scripts['typecheck:build'],
      'the typecheck:build script no longer points at tsconfig.build.json',
    ).toContain('-p tsconfig.build.json');
    expect(
      scripts.build,
      '`npm run build` no longer runs the build program. Criterion 10.5 is then satisfied only by ' +
        'a script a human has to remember, which is how 4.27 stayed open for two phases.',
    ).toContain('-p tsconfig.build.json');
  });
});

describe('the production header lookup refuses rather than guesses', () => {
  it('returns the catch-all rule’s headers', () => {
    const headers = headersFrom({
      headers: [
        {
          source: CATCH_ALL_SOURCE,
          headers: [{ key: 'Content-Security-Policy', value: "default-src 'self'" }],
        },
      ],
    });
    expect(headers).toEqual({ 'Content-Security-Policy': "default-src 'self'" });
  });

  it('throws when a rule carries a source it cannot reproduce', () => {
    // A route-scoped rule means the local substrate and Vercel would serve different headers on
    // some path — a gate reporting green about a page nobody serves.
    expect(() =>
      headersFrom({
        headers: [{ source: '/assets/(.*)', headers: [{ key: 'X-Test', value: '1' }] }],
      }),
    ).toThrow(/not "\/\(\.\*\)"/);
  });

  it('throws when there is no catch-all rule at all', () => {
    expect(() => headersFrom({})).toThrow(/no headers rule/);
    expect(() => headersFrom({ headers: [] })).toThrow(/no headers rule/);
  });
});
