import { describe, expect, it } from 'vitest';

import { DEV_ONLY_MODULES, sentinelSites } from '../../tools/gen/devSeamAst.mjs';

/**
 * **The parser half of the dev-seam gate, on fixtures that can go red** *(vault C2)*.
 *
 * `docs/qa/phase-10-ship.md` § 10.2 records the two mutations this was built for, watched failing
 * against the real `npm run build` and reverted. Those are the authoritative red proofs; they are
 * also manual, and a manual proof is evidence about one afternoon. This is the part that stays.
 *
 * ## What is actually being asserted
 *
 * `sentinelSites()` answers two questions per `devSeam('__DEVSEAM_…__')` call — *which function is
 * it in* and *does reaching it imply `import.meta.env.DEV`* — and the gate turns the answers into
 * the two rules that close the hole the per-file manifest could not see:
 *
 *   1. moving a token between two guarded bodies **in the same file** changes its **site**;
 *   2. deleting a guard while leaving the token in place makes it **undominated**.
 *
 * ⚠️ **Rule 2 does not catch mutation 1** — both ends of that move are guarded — which is why the
 * site is pinned separately and why this file tests them separately.
 *
 * ## Why the fixtures are strings and not files
 *
 * Every shape below is one that exists in `src/` right now, transcribed. A fixture file would drift
 * from the source it stands for; a fixture string beside the assertion that reads it cannot. The
 * *coverage* claim — that these are the shapes `src/` actually uses — is held by the build gate
 * itself, which parses all 27 live sentinels on every build and fails on any it cannot dominate.
 */

const at = (source: string, file = 'src/x.ts') => sentinelSites(source, file);

describe('sentinelSites — dominance', () => {
  it('accepts the early-return shape, which is what most of src/ uses', () => {
    const [seam] = at(`
      export function updateDebugState(patch: object): void {
        if (!import.meta.env.DEV) { return; }
        devSeam('__DEVSEAM_x_a__');
      }
    `);
    expect(seam.guarded, 'if (!DEV) return — everything after it runs only in DEV').toBe(true);
    expect(seam.site).toBe('updateDebugState');
  });

  it('accepts the early return with an EXTRA condition — `!DEV || index !== 0`', () => {
    // `bootAssets.ts`'s real shape. Falling past `!DEV || x` still implies DEV.
    const [seam] = at(`
      function applyBreakAsset(index: number): string {
        if (!import.meta.env.DEV || index !== 0) { return 'u'; }
        devSeam('__DEVSEAM_x_a__');
        return 'v';
      }
    `);
    expect(seam.guarded).toBe(true);
  });

  it('accepts a positive block guard, a `&&` guard and a ternary arm', () => {
    const shapes = [
      `function f() { if (import.meta.env.DEV) { devSeam('__DEVSEAM_x_a__'); } }`,
      `function f() { if (import.meta.env.DEV && dev) { devSeam('__DEVSEAM_x_a__'); } }`,
      `function f() { return import.meta.env.DEV ? (devSeam('__DEVSEAM_x_a__'), 1) : 2; }`,
    ];
    for (const shape of shapes) {
      expect(at(shape)[0].guarded, `not recognised as guarded: ${shape}`).toBe(true);
    }
  });

  it('🔴 REJECTS a bare sentinel — the guard-deleted mutation', () => {
    const [seam] = at(`
      export function hitstopScaleFromSearch(s: string): number {
        devSeam('__DEVSEAM_x_a__');
        return Number(s);
      }
    `);
    expect(
      seam.guarded,
      'a sentinel with no guard over it never folds, so its absence from the bundle proves nothing',
    ).toBe(false);
  });

  it('🔴 REJECTS `DEV || x`, which reaches the body with DEV false', () => {
    const [seam] = at(`function f() { if (import.meta.env.DEV || other) { devSeam('__DEVSEAM_x_a__'); } }`);
    expect(seam.guarded).toBe(false);
  });

  it('🔴 REJECTS the ELSE arm of a DEV guard', () => {
    const [seam] = at(`
      function f() {
        if (import.meta.env.DEV) { noop(); } else { devSeam('__DEVSEAM_x_a__'); }
      }
    `);
    expect(seam.guarded, 'the alternate runs precisely when DEV is false').toBe(false);
  });

  it('🔴 REJECTS a lookalike flag — only `import.meta.env.DEV` counts', () => {
    for (const test of ['process.env.DEV', 'import.meta.env.PROD', 'DEV']) {
      const [seam] = at(`function f() { if (${test}) { devSeam('__DEVSEAM_x_a__'); } }`);
      expect(seam.guarded, `${test} was accepted as the DEV flag`).toBe(false);
    }
  });

  it('exempts a declared DEV-only module, and ONLY a declared one', () => {
    const source = `export function enemyKnobs(w: World) { devSeam('__DEVSEAM_x_a__'); }`;
    const declared = [...DEV_ONLY_MODULES][0];
    expect(declared, 'DEV_ONLY_MODULES is empty, so this asserts nothing').toBeTruthy();
    expect(at(source, declared)[0].guarded).toBe(true);
    expect(at(source, 'src/not/declared.ts')[0].guarded).toBe(false);
  });
});

describe('sentinelSites — the site, which is what closes the same-file hole', () => {
  it('names the enclosing function, so a same-file move is visible', () => {
    // The exact mutation: `globals.ts` keeps the token and the count, and both bodies are guarded.
    const before = at(`
      function updateDebugState() { if (!import.meta.env.DEV) { return; } devSeam('__DEVSEAM_g_u__'); }
      function installDebugGlobals() { if (!import.meta.env.DEV) { return; } devSeam('__DEVSEAM_g_i__'); }
    `);
    const after = at(`
      function updateDebugState() { assign(); }
      function installDebugGlobals() {
        if (!import.meta.env.DEV) { return; }
        devSeam('__DEVSEAM_g_i__');
        devSeam('__DEVSEAM_g_u__');
      }
    `);
    const site = (rows: { token: string; site: string }[], token: string) =>
      rows.find((r) => r.token === token)?.site;

    expect(before.map((r) => r.token).sort()).toEqual(after.map((r) => r.token).sort());
    expect(
      after.every((r) => r.guarded),
      'both ends of the move are guarded — which is why DOMINANCE alone cannot catch it',
    ).toBe(true);
    expect(site(before, '__DEVSEAM_g_u__')).toBe('updateDebugState');
    expect(
      site(after, '__DEVSEAM_g_u__'),
      'the site did not change, so the gate could not tell the token had been re-homed',
    ).toBe('installDebugGlobals');
  });

  it('names a class method, an arrow bound to a const, and module scope', () => {
    expect(
      at(`class S { update() { if (import.meta.env.DEV) { devSeam('__DEVSEAM_x_a__'); } } }`)[0].site,
    ).toBe('update');
    expect(
      at(`const dev = import.meta.env.DEV ? (devSeam('__DEVSEAM_x_a__'), {}) : undefined;`)[0].site,
    ).toBe('dev');
    expect(
      at(`if (import.meta.env.DEV) { devSeam('__DEVSEAM_x_a__'); }`)[0].site,
      "main.ts's handle publication has no enclosing function",
    ).toBe('<module>');
  });
});

describe('sentinelSites — what a text census got wrong', () => {
  it('ignores a commented-out call, a string that merely contains one, and a non-call', () => {
    const source = `
      function f() {
        if (import.meta.env.DEV) {
          // devSeam('__DEVSEAM_x_commented__');
          /* devSeam('__DEVSEAM_x_blockCommented__'); */
          const s = "devSeam('__DEVSEAM_x_inAString__')";
          const t = '__DEVSEAM_x_bareLiteral__';
          devSeam('__DEVSEAM_x_real__');
        }
      }
    `;
    expect(at(source).map((r) => r.token)).toEqual(['__DEVSEAM_x_real__']);
  });
});
