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
 */

// Every source file in the project, so the closure walk can follow an import anywhere.
const ALL_SOURCES = import.meta.glob('../../src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BAD_FIXTURES = import.meta.glob('../fixtures/bad-sim/**/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const SIM_ENTRY = '../../src/sim/index.ts';

/**
 * Rules see one of two views of the source, and getting this wrong silently disables them.
 *
 *   'code'         comments AND string literals blanked. For bare identifiers, where a URL or
 *                  message containing "document" would otherwise be a false positive.
 *   'code+strings' comments blanked, strings kept. For rules whose evidence IS a string — the
 *                  `'phaser'` module specifier, and bracket access like `Date['now']`.
 *
 * The cost of 'code+strings' is that a literal `"Math.random"` in a message would be reported.
 * That is the correct direction to err on a blocker rule: a false red is cheap, a missed
 * violation is the thing the vault says shipped.
 */
interface Rule {
  name: string;
  pattern: RegExp;
  view: 'code' | 'code+strings';
}

const FORBIDDEN: Rule[] = [
  // Covers `from 'phaser'`, `require('phaser')` and lazy `await import('phaser')` — the last
  // of which executes only when called, so neither import-evaluation nor the uninstalled run
  // would ever reach it.
  {
    name: 'Phaser import',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"]phaser['"]/,
    view: 'code+strings',
  },
  // Bracket access (`Date['now']`) evades a plain `Date.now` match, so the separator is
  // `\s*[.[]` rather than a literal dot — which means these rules must see strings.
  { name: 'Date.now', pattern: /\bDate\s*[.[]\s*['"]?now\b/, view: 'code+strings' },
  { name: 'new Date', pattern: /\bnew\s+Date\b/, view: 'code' },
  { name: 'Math.random', pattern: /\bMath\s*[.[]\s*['"]?random\b/, view: 'code+strings' },
  { name: 'performance.now', pattern: /\bperformance\s*[.[]\s*['"]?now\b/, view: 'code+strings' },
  // Bare identifiers, not `window.` — `const d = document;` then `d.body` on the next line
  // evades any rule that requires the trailing accessor.
  { name: 'window', pattern: /\bwindow\b/, view: 'code' },
  { name: 'document', pattern: /\bdocument\b/, view: 'code' },
  // globalThis reaches every one of the above without naming any of them.
  { name: 'globalThis', pattern: /\bglobalThis\b/, view: 'code' },
];

interface Violation {
  file: string;
  rule: string;
  line: number;
}

/**
 * Blank out comments and string literals while PRESERVING line structure.
 *
 * Both properties matter and a naive regex has neither:
 *   - stripping a `//` comment without checking whether it is inside a string erases the rest
 *     of the line, so `const u = 'https://x'; const r = Math.random();` hides a real violation;
 *   - removing block comments along with their newlines shifts every reported line number.
 *
 * Strings are blanked as well as comments so a URL or message containing `document` or
 * `Math.random` is not reported as a violation.
 */
function blank(source: string, blankStrings: boolean): string {
  let out = '';
  let i = 0;
  let mode: 'code' | 'line' | 'block' | 'single' | 'double' | 'template' = 'code';

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (mode === 'code') {
      if (ch === '/' && next === '/') {
        mode = 'line';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === '/' && next === '*') {
        mode = 'block';
        out += '  ';
        i += 2;
        continue;
      }
      if (ch === "'" || ch === '"' || ch === '`') {
        mode = ch === "'" ? 'single' : ch === '"' ? 'double' : 'template';
        out += ch;
        i += 1;
        continue;
      }
      out += ch;
      i += 1;
      continue;
    }

    // Inside a comment or string: keep newlines, blank everything else.
    if (ch === '\n') {
      out += '\n';
      if (mode === 'line') {
        mode = 'code';
      }
      i += 1;
      continue;
    }

    if (mode === 'block' && ch === '*' && next === '/') {
      mode = 'code';
      out += '  ';
      i += 2;
      continue;
    }

    const inString = mode === 'single' || mode === 'double' || mode === 'template';

    if (inString && ch === '\\') {
      out += blankStrings ? '  ' : source.slice(i, i + 2);
      i += 2;
      continue;
    }

    const closes =
      (mode === 'single' && ch === "'") ||
      (mode === 'double' && ch === '"') ||
      (mode === 'template' && ch === '`');

    if (closes) {
      mode = 'code';
    }

    // Comments are always blanked; strings only when asked.
    out += inString && !blankStrings ? ch : ' ';
    i += 1;
  }

  return out;
}

/** Resolve a relative import specifier against the importing key, as glob keys are written. */
function resolveImport(fromKey: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) {
    return null; // bare specifier: a package, not project source
  }

  const parts = fromKey.split('/').slice(0, -1).concat(specifier.split('/'));
  const stack: string[] = [];

  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..' && stack.length > 0 && stack[stack.length - 1] !== '..') {
      // Only collapse against a real segment. Popping a leading '..' would silently rewrite
      // '../../src/...' into 'src/...', which matches no glob key, and the closure would then
      // stop at the sim directory while looking like it had walked everything.
      stack.pop();
    } else {
      stack.push(part);
    }
  }

  const base = stack.join('/');
  const candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}/index.ts`];

  return candidates.find((c) => c in ALL_SOURCES) ?? null;
}

/**
 * Every project source file reachable from the sim entry point by following relative imports.
 * This is what makes the rule apply to the whole sim, not just to one directory.
 */
function simClosure(): Record<string, string> {
  const closure: Record<string, string> = {};
  const queue = [SIM_ENTRY];

  while (queue.length > 0) {
    const key = queue.pop()!;
    if (key in closure || !(key in ALL_SOURCES)) continue;

    const source = ALL_SOURCES[key];
    closure[key] = source;

    // Specifiers live in strings, so read from the comments-blanked-only view: a commented-out
    // import must not drag a file into the closure, but a real one must.
    const code = blank(source, false);
    for (const match of code.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)) {
      const resolved = resolveImport(key, match[1]);
      if (resolved) queue.push(resolved);
    }
  }

  return closure;
}

function scan(sources: Record<string, string>): Violation[] {
  const violations: Violation[] = [];

  for (const [file, source] of Object.entries(sources)) {
    const views = {
      code: blank(source, true).split('\n'),
      'code+strings': blank(source, false).split('\n'),
    };

    for (const rule of FORBIDDEN) {
      views[rule.view].forEach((line, index) => {
        if (rule.pattern.test(line)) {
          violations.push({ file, rule: rule.name, line: index + 1 });
        }
      });
    }
  }

  return violations;
}

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
        'bare.ts': 'const d = document;\nconst b = d.body;',
        'global.ts': 'const r = globalThis.Math.random();',
      };

      for (const [name, source] of Object.entries(cases)) {
        expect(scan({ [name]: source }).length, `${name} evaded the scanner`).toBeGreaterThan(0);
      }
    });
  });
});
