import { describe, expect, it } from 'vitest';

/**
 * Vault 1.1 (blocker): `src/sim/` imports nothing from the engine, and reaches no clock,
 * no RNG and no DOM. This is what makes the simulation unit-testable at all.
 *
 * Enforced three ways, because no single one is sufficient:
 *
 *   1. IMPORT-EVALUATION of the sim barrel — walks the real module graph, so a *transitive*
 *      Phaser import is caught even though it is invisible to a text scan.
 *   2. STATIC SCAN of every file under src/sim/ — catches forbidden globals (Date.now,
 *      Math.random, DOM), which import-evaluation cannot see because they are runtime calls.
 *   3. THE SAME SCANNER pointed at a committed bad fixture, asserted to FAIL — vault C2,
 *      a gate that cannot go red is decoration. In Phase 1, src/sim/ is nearly empty, so
 *      without this the scan would pass vacuously.
 *
 * The scripted `npm rm phaser && vitest run` step in the QA gate is the fourth check, and it
 * is only meaningful because of (1).
 *
 * File contents come from Vite's `import.meta.glob(..., { query: '?raw' })` rather than
 * node:fs. That is deliberate: the Global Constraints freeze the dependency list, and reading
 * files this way needs no `@types/node`. It also keeps this suite runnable with Phaser
 * uninstalled, which criterion 1.3 requires.
 */

const SIM_SOURCES = import.meta.glob('../../src/sim/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BAD_FIXTURES = import.meta.glob('../fixtures/bad-sim/**/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

interface Rule {
  name: string;
  pattern: RegExp;
}

const FORBIDDEN: Rule[] = [
  { name: 'Phaser import', pattern: /\bfrom\s+['"]phaser['"]|\brequire\(\s*['"]phaser['"]/ },
  { name: 'Date.now', pattern: /\bDate\s*\.\s*now\b/ },
  { name: 'new Date', pattern: /\bnew\s+Date\b/ },
  { name: 'Math.random', pattern: /\bMath\s*\.\s*random\b/ },
  { name: 'performance.now', pattern: /\bperformance\s*\.\s*now\b/ },
  { name: 'window', pattern: /\bwindow\s*\./ },
  { name: 'document', pattern: /\bdocument\s*\./ },
];

interface Violation {
  file: string;
  rule: string;
  line: number;
}

/** Strip comments so a rule name mentioned in prose is not itself a violation. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function scan(sources: Record<string, string>): Violation[] {
  const violations: Violation[] = [];

  for (const [file, source] of Object.entries(sources)) {
    stripComments(source)
      .split('\n')
      .forEach((line, index) => {
        for (const rule of FORBIDDEN) {
          if (rule.pattern.test(line)) {
            violations.push({ file, rule: rule.name, line: index + 1 });
          }
        }
      });
  }

  return violations;
}

describe('sim boundary (vault 1.1)', () => {
  it('has real modules to check — the scan is not vacuous', () => {
    expect(Object.keys(SIM_SOURCES).length).toBeGreaterThan(0);
    expect(Object.keys(BAD_FIXTURES).length).toBeGreaterThan(0);
  });

  it('src/sim imports nothing from Phaser and reaches no clock, RNG or DOM', () => {
    const violations = scan(SIM_SOURCES);
    expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  it('import-evaluates the sim barrel without pulling in Phaser', async () => {
    // If any module in the sim graph imported Phaser — directly or transitively — this await
    // throws once Phaser is uninstalled, which a text scan of src/sim/ would never notice.
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

  it('scanner ignores violations that appear only inside comments', () => {
    // src/sim/index.ts's doc comment names Date.now and Math.random in prose. Without comment
    // stripping the suite would be red on its own documentation.
    const violations = scan(SIM_SOURCES);
    expect(violations.filter((v) => v.rule === 'Math.random')).toEqual([]);
  });
});
