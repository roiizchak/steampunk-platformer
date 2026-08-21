/**
 * The architectural-boundary scanner: raw project source, a comment/string blanker, an import-graph
 * walk, and a rule engine. **No assertions live here** — they live in the two suites that drive it,
 * `sim-boundary.test.ts` and `render-boundary.test.ts`.
 *
 * ## Why it was extracted
 *
 * `src/render/` carries the same architectural rule as `src/sim/` for the one constraint they share
 * — **no Phaser** — and until now nothing enforced it statically. `sim-boundary.test.ts` scans the
 * sim closure only; the three Phase 9 render modules were covered *dynamically* by
 * `npm run test:sim-isolated` and by a hand-run grep, which the Task 2 review recorded as F13: *"it
 * is currently a claim, not a gate."*
 *
 * The alternative to extracting was a second copy of `blank()`, which is 80 lines of hand-written
 * lexer whose whole value is that it has been got right once. Two copies is how the second one
 * drifts. This is a shared fixture module in the idiom `hitstop-fixtures.ts` uses — two real
 * consumers, not the single-consumer `-helpers` dodge `file-size.test.ts` names.
 *
 * ⚠️ **The C2 red-proof stays in `sim-boundary.test.ts`**, pointed at the committed bad fixture, and
 * it covers this scanner for BOTH consumers: every rule below must be independently demonstrated to
 * fire, or that test is red. A shared scanner with one proof beats two scanners with one proof
 * between them.
 */

// Every source file in the project, so the closure walk can follow an import anywhere.
export const ALL_SOURCES = import.meta.glob('../../src/**/*.{ts,tsx,js,jsx,mjs,cjs,mts,cts}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const BAD_FIXTURES = import.meta.glob('../fixtures/bad-sim/**/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export const SIM_ENTRY = '../../src/sim/index.ts';

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
export interface Rule {
  name: string;
  pattern: RegExp;
  view: 'code' | 'code+strings';
}

export const FORBIDDEN: Rule[] = [
  // Covers `from 'phaser'`, `require('phaser')` and lazy `await import('phaser')` — the last
  // of which executes only when called, so neither import-evaluation nor the uninstalled run
  // would ever reach it.
  {
    // Trailing `[/'"]` so a subpath import — `import('phaser/types/...')` — is caught too.
    name: 'Phaser import',
    pattern: /\b(?:from|import|require)\s*\(?\s*['"]phaser(?:['"]|\/)/,
    view: 'code+strings',
  },
  // `Date` as a BARE identifier. Narrower rules miss `Date()` called without `new`, and miss
  // aliasing (`const clock = Date; clock.now()`), which defeats any member-access pattern.
  { name: 'Date', pattern: /\bDate\b/, view: 'code' },
  { name: 'Math.random', pattern: /\bMath\s*[.[]\s*['"]?random\b/, view: 'code+strings' },
  { name: 'performance.now', pattern: /\bperformance\s*[.[]\s*['"]?now\b/, view: 'code+strings' },
  // crypto.getRandomValues is a clock-free RNG the other rules do not name at all.
  { name: 'crypto', pattern: /\bcrypto\b/, view: 'code' },
  // Bare identifiers, not `window.` — `const d = document;` then `d.body` on the next line
  // evades any rule that requires the trailing accessor.
  { name: 'window', pattern: /\bwindow\b/, view: 'code' },
  { name: 'document', pattern: /\bdocument\b/, view: 'code' },
  // globalThis reaches every one of the above without naming any of them.
  { name: 'globalThis', pattern: /\bglobalThis\b/, view: 'code' },
];

export interface Violation {
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
/** Index of the `}` closing a `${` interpolation that starts at `from`, brace-depth aware. */
function findInterpolationEnd(source: string, from: number): number {
  let depth = 1;
  let i = from;

  while (i < source.length && depth > 0) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') depth -= 1;
    if (depth === 0) break;
    i += 1;
  }

  return i;
}

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

    // `${...}` inside a template literal is CODE, not string content. Blanking it would hide
    // `` `${new Date()}` `` from every rule. Hand the interior back to code mode; the closing
    // brace returns to the template.
    if (mode === 'template' && ch === '$' && next === '{') {
      const end = findInterpolationEnd(source, i + 2);
      out += '  ' + source.slice(i + 2, end);
      i = end;
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
  // Must cover every extension the glob admits, plus directory-index forms — otherwise an
  // import the closure cannot resolve is silently dropped and its file goes unscanned.
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
  const candidates = [
    base,
    ...extensions.map((ext) => `${base}${ext}`),
    ...extensions.map((ext) => `${base}/index${ext}`),
  ];

  return candidates.find((c) => c in ALL_SOURCES) ?? null;
}

/**
 * The set of files the boundary rule applies to: the UNION of
 *   (a) every file under `src/sim/`, reachable from the barrel or not, and
 *   (b) every project file transitively imported from the sim entry point.
 *
 * Both halves are load-bearing and each covers the other's blind spot:
 *   - closure alone misses an ORPHAN — `src/sim/scratch.ts` that nothing imports yet could
 *     hold `Date.now()` and stay invisible until the day something imports it;
 *   - directory alone misses a HELPER one hop out, which is the hole this whole rewrite
 *     started from, since `src/sim/index.ts` already imports `../game/constants`.
 *
 * Parameterised over the directory and the barrel so `src/render/` gets the same treatment from
 * the same walk. Both arguments stay: the render modules have no barrel today, but they have the
 * orphan problem the moment one of them stops being imported by a scene.
 *
 * @param dirFragment path fragment naming the directory whose every file seeds the walk.
 * @param entries barrel entry points to seed as well; may be empty.
 */
export function closureFrom(dirFragment: string, entries: readonly string[] = []): Record<string, string> {
  const closure: Record<string, string> = {};
  const queue = [...entries];

  // (a) everything in the directory, whether or not anything imports it.
  for (const key of Object.keys(ALL_SOURCES)) {
    if (key.includes(dirFragment)) {
      queue.push(key);
    }
  }

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

export function scan(sources: Record<string, string>): Violation[] {
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
