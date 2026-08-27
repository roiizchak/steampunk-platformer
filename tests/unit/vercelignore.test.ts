import { describe, expect, it } from 'vitest';

/**
 * **`.vercelignore` decides what the build box can SEE, and nothing local can check it.**
 *
 * ## The deploy this exists because of
 *
 * The first deploy, 2026-08-27, failed on Vercel with every local gate green:
 *
 * ```
 * Downloading 740 deployment files...
 * tests/unit/audio-catalog.test.ts(20,21): error TS2307:
 *   Cannot find module '../../public/assets/index.json'
 * Error: Command "npm run build" exited with 1
 * ```
 *
 * `.vercelignore` uses **gitignore syntax**, in which a pattern with no leading slash matches at
 * **any depth**. The file carried a bare `assets/` — meaning "the Phase 0 reference art at the repo
 * root, 96 MB, never read by the build". It also matched **`public/assets/`**: 48 of the 60 files
 * under `public/`, which is every sprite sheet, tile set, parallax layer, portrait and sound the
 * game loads. The header's own analysis said `public/` must stay, and the rule three lines below it
 * removed most of `public/`.
 *
 * It failed LOUDLY only by luck: `tsconfig.json` includes `tests/`, and the tests import the
 * catalog. Had they not, this would have deployed a game with **no art at all** — a green build, a
 * live URL, a blank canvas.
 *
 * ## Why a unit test can gate this at all
 *
 * It cannot check what Vercel uploads. It can check the property that made the upload wrong, and
 * that property is textual: **every directory pattern must be anchored.** An anchored pattern
 * excludes exactly the directory it names; an unanchored one excludes every directory of that name
 * anywhere in the tree, which is almost never what the author of a build-input exclusion means.
 *
 * Verified with git's own matcher rather than reasoned about:
 *
 * | pattern | hides `public/assets/index.json` | hides `assets/x.png` |
 * |---|---|---|
 * | `assets/` | **YES** | YES |
 * | `/assets/` | no | YES |
 *
 * ⚠️ **What this cannot see**, stated rather than implied *(vault 9.3)*: whether the anchored set is
 * the RIGHT set. Excluding `/tools/` would be correctly anchored and would still break the build.
 * That half is the header's prose analysis and the deploy itself; this half is the mechanical rule
 * that the analysis silently violated.
 */

const VERCELIGNORE = Object.values(
  import.meta.glob('../../.vercelignore', { eager: true, query: '?raw', import: 'default' }),
)[0] as string;

/** Every non-comment, non-blank line. */
const patterns = VERCELIGNORE.split('\n')
  .map((l) => l.trim())
  .filter((l) => l.length > 0 && !l.startsWith('#'));

describe('.vercelignore excludes exactly what it names', () => {
  it('lists patterns at all — the file has not been emptied', () => {
    // Vacuity guard. An empty .vercelignore uploads the whole working tree, `.claude/` included,
    // which is 1.4 GB on this machine and would pass every assertion below.
    expect(patterns.length, '.vercelignore declares no patterns').toBeGreaterThan(5);
  });

  it.each(patterns.filter((p) => p.endsWith('/')))(
    '%s is anchored to the repository root',
    (pattern) => {
      expect(
        pattern.startsWith('/'),
        `"${pattern}" has no leading slash, so it matches a directory of that name at ANY depth — ` +
          `"public/${pattern}" included. That is how the 2026-08-27 deploy uploaded the repository ` +
          "without the game's art: a bare `assets/`, meant for the root reference art, also " +
          'removed `public/assets/`. Write it as `/' +
          pattern +
          '`.',
      ).toBe(true);
    },
  );

  it('never excludes a directory the build reads', () => {
    // The header's prose analysis, made mechanical for the four entries it names. `vite build`
    // copies `public/` verbatim; `verify-dist.mjs` and the dev-seam gate live in `tools/`;
    // `tsconfig.json` includes `tests/` and names `playwright.config.ts`; both typecheck programs
    // and `vercelHeaders.mjs` read `vercel.json`.
    const REQUIRED = ['public', 'tools', 'tests', 'src', 'index.html', 'vercel.json'];
    for (const required of REQUIRED) {
      for (const pattern of patterns) {
        const bare = pattern.replace(/^\/+/, '').replace(/\/+$/, '');
        expect(
          bare === required || bare === `public/${required}`,
          `.vercelignore excludes "${pattern}", which removes "${required}" from the build input. ` +
            'The build would then fail on Vercel and pass locally, which is the worst shape a ' +
            'config error can take.',
        ).toBe(false);
      }
    }
  });
});
