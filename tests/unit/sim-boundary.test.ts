import { describe, expect, it } from 'vitest';

/**
 * Vault 1.1 (blocker): `src/sim/` imports nothing from the engine, and reaches no clock,
 * no RNG and no DOM. This is what makes the simulation unit-testable at all.
 *
 * Enforced three ways, because no single one is sufficient:
 *
 *   1. IMPORT-EVALUATION of the sim barrel — walks the real module graph, so a *transitive*
 *      Phaser import is caught even though it is invisible to a text scan.
 *   2. STATIC SCAN of the sim's TRANSITIVE SOURCE CLOSURE — catches forbidden globals
 *      (Date.now, Math.random, DOM), which import-evaluation cannot see because they are
 *      runtime calls that may never execute.
 *   3. THE SAME SCANNER pointed at a committed bad fixture, asserted to FAIL — vault C2,
 *      a gate that cannot go red is decoration.
 *
 * The scripted `npm run test:sim-isolated` step is the fourth check, and it is only meaningful
 * because of (1).
 *
 * ⚠️ The closure in (2) is the point. Scanning `src/sim/**` alone enforces the rule exactly one
 * directory deep, and `src/sim/index.ts` already imports from `src/game/` — so a helper one hop
 * outside the directory could hold `Date.now()` and every layer would miss it.
 *
 * File contents come from Vite's `import.meta.glob(..., { query: '?raw' })` rather than
 * node:fs. Deliberate: the Global Constraints freeze the dependency list, and this needs no
 * `@types/node`. It also keeps the suite runnable with Phaser uninstalled, which criterion 1.3
 * requires.
 *
 * ⚠️ The scanner itself — the glob, `blank()`, the closure walk and the rule table — lives in
 * `sourceScan.ts`, shared with `render-boundary.test.ts`. The **assertions stay here**, including
 * the C2 red-proof against the committed bad fixture, which is what covers the shared scanner for
 * both suites. `sourceScan.ts` says why the split was taken.
 */

import { BAD_FIXTURES, FORBIDDEN, SIM_ENTRY, closureFrom, scan } from './sourceScan';

const simClosure = (): Record<string, string> => closureFrom('/src/sim/', [SIM_ENTRY]);

describe('sim boundary (vault 1.1)', () => {
  it('the sim closure is non-empty and reaches beyond src/sim — the scan is not vacuous', () => {
    const closure = simClosure();
    expect(Object.keys(closure).length).toBeGreaterThan(0);
    expect(Object.keys(BAD_FIXTURES).length).toBeGreaterThan(0);

    // src/sim/index.ts re-exports from src/game/constants.ts. If the closure walk silently
    // stopped following imports, this is what notices.
    expect(Object.keys(closure).some((f) => f.includes('/game/'))).toBe(true);
  });

  it('the sim closure imports nothing from Phaser and reaches no clock, RNG or DOM', () => {
    const violations = scan(simClosure());
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('import-evaluates the sim barrel without pulling in Phaser', async () => {
    // If any module in the sim graph imported Phaser — directly or transitively — this await
    // throws once Phaser is uninstalled, which a text scan alone would never notice.
    const sim = await import('../../src/sim/index');

    expect(typeof sim.TICK_HZ).toBe('number');
    expect(sim.TICK_HZ).toBe(60);
    expect(typeof sim.ticksToMs).toBe('function');
    expect(sim.ticksToMs(60)).toBe(1000);
  });

  it('REJECTS the committed bad fixture — proves the scanner can go red (vault C2)', () => {
    const violations = scan(BAD_FIXTURES);
    const caught = new Set(violations.map((v) => v.rule));

    // EVERY rule must be independently demonstrated to fire. If one is ever weakened into a
    // regex that matches nothing, this is what turns red — not a silent loss of coverage.
    for (const rule of FORBIDDEN) {
      expect(caught, `rule "${rule.name}" never fired against the bad fixture`).toContain(rule.name);
    }
  });

  describe('the scanner itself', () => {
    it('ignores violations inside comments and string literals', () => {
      const source = [
        "const url = 'https://example.com'; // Math.random in a comment",
        '/* Date.now\n   in a block */',
        'const msg = "document.body";',
      ].join('\n');

      expect(scan({ 'x.ts': source })).toEqual([]);
    });

    it('is not fooled by a // sequence inside a string literal', () => {
      // The naive `replace(/\/\/.*$/gm, '')` erases from `https:` onward and hides the call.
      const source = "const u = 'https://x'; const r = Math.random();";
      const violations = scan({ 'x.ts': source });

      expect(violations.map((v) => v.rule)).toContain('Math.random');
    });

    it('reports accurate line numbers after a block comment', () => {
      // Removing block comments along with their newlines shifts every later line number.
      const source = ['/* one', '   two', '   three */', 'const r = Math.random();'].join('\n');
      const violations = scan({ 'x.ts': source });

      expect(violations).toHaveLength(1);
      expect(violations[0].line).toBe(4);
    });

    it('catches evasions a dot-separator rule would miss', () => {
      const cases: Record<string, string> = {
        'bracket.ts': "const n = Date['now']();",
        'lazy.ts': "async function f() { const P = await import('phaser'); return P; }",
        'subpath.ts': "async function f() { return import('phaser/dist/phaser.esm.js'); }",
        'bare-dom.ts': 'const d = document;\nconst b = d.body;',
        'global.ts': 'const r = globalThis.Math.random();',
        // `Date()` without `new`, and aliasing, both defeat any member-access pattern.
        'no-new.ts': 'const s = Date();',
        'alias.ts': 'const clock = Date;\nconst n = clock.now();',
        'crypto.ts': 'const b = crypto.getRandomValues(new Uint8Array(4));',
        // Interpolation is code inside a string; blanking the template hides it entirely.
        'template.ts': 'const s = `stamped ${new Date().toISOString()}`;',
      };

      for (const [name, source] of Object.entries(cases)) {
        expect(scan({ [name]: source }).length, `${name} evaded the scanner`).toBeGreaterThan(0);
      }
    });
  });
});
