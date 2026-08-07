import { describe, expect, it } from 'vitest';

/**
 * The phase documents are executable instructions, not prose. This file gates that claim.
 *
 * WHY THIS EXISTS. Every phase's QA gate has an Owner column, and for two phases those owners
 * were bare nouns — `qa-expert`, `code-reviewer`, `perf` — that read as labels rather than as
 * instructions. Nothing said they were agent types. The 2026-08-07 audit qualified all of them
 * and wrote PRD.md § The QA agent protocol; every check below was run BY HAND during that audit.
 * Running a check by hand once is not a gate. This file is the gate.
 *
 * THE OWNER MAP IS NOT DUPLICATED HERE. It is parsed out of PRD.md at test time, so the
 * protocol section is the single source of truth. Adding a new owner type there makes it legal
 * here automatically; using one in a gate that the PRD does not define fails. Hard-coding the
 * roster in this file would create a second place to update and guarantee they drift.
 *
 * WHAT THIS CANNOT DO. It checks that the documents say the right thing, never that anyone did
 * it. `assertsCompletedPhasesAreEvidenced` gets closest — a phase marked done in the PRD table
 * must have a row per criterion in its own `docs/qa/phase-NN-*.md` log — but a row saying "PASS"
 * is still a claim a human wrote.
 * That is what criterion X.9's adversarial brief and the Codex implementation review are for.
 *
 * File contents come from Vite's `import.meta.glob(..., { query: '?raw' })`, not node:fs: the
 * dependency list is frozen, this needs no `@types/node`, and it keeps the suite runnable with
 * Phaser uninstalled (criterion 1.3). Same technique as `sim-boundary.test.ts`.
 */

const DOCS = import.meta.glob('../../docs/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BAD_FIXTURES = import.meta.glob('../fixtures/bad-docs/**/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const norm = (text: string): string => text.replace(/\r\n/g, '\n');

function doc(suffix: string): string {
  const key = Object.keys(DOCS).find((k) => k.endsWith(suffix));
  if (key === undefined) throw new Error(`document not found: ${suffix}`);
  return norm(DOCS[key]!);
}

/** Every phase document, in phase order, as [label, contents]. */
const PHASES: ReadonlyArray<readonly [string, string]> = Object.keys(DOCS)
  .filter((k) => /\/prd\/phase-\d\d-[a-z]+\.md$/.test(k))
  .sort()
  .map((k) => [k.slice(k.lastIndexOf('/') + 1), norm(DOCS[k]!)] as const);

const PRD = doc('/docs/PRD.md');


/** Text between two markers, exclusive. Throws rather than returning "" — an empty
 *  slice makes every downstream assertion vacuously true (vault C2). */
function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`start marker not found: ${startMarker}`);
  const from = start + startMarker.length;
  const end = source.indexOf(endMarker, from);
  const slice = source.slice(from, end < 0 ? undefined : end).trim();
  if (slice.length === 0) throw new Error(`empty slice after ${startMarker}`);
  return slice;
}

/** A markdown table row split into trimmed cells, backticks and bold markers stripped. */
function cells(row: string): string[] {
  return row
    .split('|')
    .slice(1, -1)
    .map((c) => c.trim().replace(/`/g, '').replace(/\*\*/g, ''));
}

interface GateRow {
  readonly id: string;
  readonly criterion: string;
  readonly method: string;
  readonly owner: string;
}

function gateRows(phase: string): GateRow[] {
  const gate = between(phase, '### 6. QA gate', '**Regression set:');
  return gate
    .split('\n')
    .filter((line) => /^\|\s*\d+\.\d+[a-z]?\s*\|/.test(line))
    .map((line) => {
      const c = cells(line);
      return { id: c[0]!, criterion: c[1]!, method: c[2]!, owner: c[3]! };
    });
}

function requiredSkills(phase: string): string {
  return between(phase, '### 2. Required skills', '### 3.');
}

/**
 * The legal owner values, parsed from PRD.md § The QA agent protocol rather than restated.
 * This is the roster every gate is checked against.
 */
const LEGAL_OWNERS: ReadonlySet<string> = (() => {
  const table = between(PRD, '| Owner in a gate | What it means |', '### The rules');
  const owners = table
    .split('\n')
    .filter((line) => line.startsWith('|') && !line.startsWith('|---'))
    .map((line) => cells(line)[0]!)
    .filter((o) => o.length > 0);
  if (owners.length < 5) throw new Error(`owner map looks truncated: parsed ${owners.length} rows`);
  return new Set(owners);
})();

/** Skills every phase must name, because they apply to every phase. */
const ALWAYS_SKILLS = [
  'superpowers:executing-plans',
  'superpowers:test-driven-development',
  'superpowers:systematic-debugging',
  'superpowers:verification-before-completion',
] as const;

/** Bare nouns that must never appear unqualified — the exact defect the audit found. */
const MUST_BE_QUALIFIED = [
  'qa-expert',
  'code-reviewer',
  'performance-engineer',
  'ui-ux-tester',
  'accessibility-tester',
  'security-auditor',
] as const;

function unqualifiedAgentNouns(text: string): string[] {
  return text
    .split('\n')
    .filter((line) =>
      MUST_BE_QUALIFIED.some((noun) =>
        new RegExp(`(^|[^:a-z-])${noun}(?![a-z-])`).test(line.replace(/`/g, '')),
      ),
    )
    .map((line) => line.trim());
}

describe('phase documents are executable instructions', () => {
  it('all ten phase documents were found', () => {
    expect(PHASES.map(([name]) => name)).toHaveLength(10);
  });

  it('PRD.md defines the owner roster the gates are checked against', () => {
    expect([...LEGAL_OWNERS].sort()).toContain('voltagent-qa-sec:qa-expert');
    expect([...LEGAL_OWNERS].sort()).toContain('play');
  });

  describe.each(PHASES)('%s', (_name, phase) => {
    it('has all eight sections', () => {
      for (const heading of [
        '### 1. Goal and scope',
        '### 2. Required skills',
        '### 3. Vault-in',
        '### 4. Codex plan review',
        '### 5. Deliverables',
        '### 6. QA gate',
        '### 7. Vault-out',
        '### 8. Demo',
      ]) {
        expect(phase, `missing ${heading}`).toContain(heading);
      }
    });

    it('every gate owner is defined in the PRD owner map', () => {
      const rows = gateRows(phase);
      expect(rows.length, 'no gate rows parsed — did the table format change?').toBeGreaterThan(0);
      const undefined_ = rows.filter((r) => !LEGAL_OWNERS.has(r.owner)).map((r) => `${r.id} → "${r.owner}"`);
      expect(undefined_, 'gate owner not in PRD.md § The QA agent protocol').toEqual([]);
    });

    it('no bare agent noun survives in the gate', () => {
      const gate = between(phase, '### 6. QA gate', '**Regression set:');
      expect(unqualifiedAgentNouns(gate), 'agent named without its voltagent-qa-sec: prefix').toEqual([]);
    });

    it('every play-owned criterion names playwright-cli', () => {
      const naked = gateRows(phase)
        .filter((r) => r.owner === 'play' && !r.method.includes('playwright-cli'))
        .map((r) => `${r.id}: "${r.method}"`);
      expect(naked, 'a hands-on criterion names no tool to produce its evidence').toEqual([]);
    });

    it('has both Codex review criteria', () => {
      const gate = between(phase, '### 6. QA gate', '**Regression set:');
      expect(gate, 'no Codex plan-review criterion').toMatch(/Codex \*?\*?plan\*?\*? review ran/);
      expect(gate, 'no Codex implementation-review criterion').toMatch(
        /Codex \*?\*?implementation\*?\*? review ran/,
      );
    });

    it('names the always-on skills', () => {
      const skills = requiredSkills(phase);
      for (const skill of ALWAYS_SKILLS) {
        expect(skills, `missing ${skill}`).toContain(skill);
      }
    });

    it('does not require physics-arcade — CLAUDE.md forbids Arcade Physics', () => {
      // It may be NAMED, to say not to use it. It must never be listed as a required skill:
      // `Body.velocity` is px/second integrated with a delta, the multiply vault 2.1 forbids.
      const offenders = requiredSkills(phase)
        .split('\n')
        .filter((line) => line.includes('physics-arcade') && !/\bNot\b/.test(line))
        .map((line) => line.trim());
      expect(offenders, 'physics-arcade listed as a required skill').toEqual([]);
    });
  });

  describe('cross-document', () => {
    it('no phase requires the duplicate Playwright skill', () => {
      // Two near-identical global skills exist. Phase 1 exercised `e2e-playwright-testing` and
      // QA-LOG records which of its rules applied; requiring the other invites silent drift.
      //
      // Scoped to §2 deliberately. CLAUDE.md and QA-LOG.md both NAME `playwright-e2e-testing`
      // in prose, to say it is the one not to use — that is the drift guard itself, and a check
      // that fired on it would be demanding the deletion of its own documentation.
      const offenders = PHASES.filter(([, phase]) =>
        requiredSkills(phase).includes('playwright-e2e-testing'),
      ).map(([name]) => name);
      expect(offenders, 'use `e2e-playwright-testing`; the other is deliberately unused').toEqual([]);
    });

    /**
     * A phase the PRD calls done must have a row for every one of its criteria in its own QA log,
     * `docs/qa/phase-NN-*.md`. This is the closest mechanical stand-in for "a phase with an unrun
     * criterion is reported failing" — it cannot tell whether the row is true, only whether it was
     * written at all. A log that is missing — or named anything other than its phase document —
     * throws out of `doc`, which is the same red.
     */
    it('every phase marked done in the PRD is evidenced criterion-by-criterion in its QA log', () => {
      const table = between(PRD, '## The phases', '### Phase dependency notes');
      const done = table
        .split('\n')
        .filter((line) => line.includes('✅') && /^\|\s*\d+\s*\|/.test(line))
        .map((line) => Number(cells(line)[0]));
      expect(done.length, 'no completed phases found — did the PRD table format change?').toBeGreaterThan(0);

      const gaps: string[] = [];
      for (const n of done) {
        const [name, phase] = PHASES.find(([f]) => f.startsWith(`phase-${String(n).padStart(2, '0')}`))!;
        // The log is addressed by its phase document's own filename, so `docs/qa/` and `docs/prd/`
        // are forced to line up file-for-file: a drifted slug is a missing log, and `doc` throws.
        const section = between(doc(`/docs/qa/${name}`), `## Phase ${n} `, `## Vault-out — Phase ${n}`);
        for (const row of gateRows(phase)) {
          const cited = new RegExp(`^\\|\\s*${row.id.replace('.', '\\.')}\\s*\\|`, 'm').test(section);
          if (!cited) gaps.push(`phase ${n} criterion ${row.id} has no QA-LOG row`);
        }
      }
      expect(gaps).toEqual([]);
    });
  });

  /**
   * Vault C2: a gate that cannot go red is decoration. Each fixture is a real phase document
   * with exactly one thing broken, committed, and asserted to be CAUGHT.
   */
  describe('the contract can go red (vault C2)', () => {
    function fixture(name: string): string {
      const key = Object.keys(BAD_FIXTURES).find((k) => k.endsWith(`/${name}.fixture`));
      if (key === undefined) throw new Error(`bad fixture missing: ${name}`);
      return norm(BAD_FIXTURES[key]!);
    }

    it('catches an owner the PRD does not define', () => {
      const rows = gateRows(fixture('undefined-owner'));
      expect(rows.filter((r) => !LEGAL_OWNERS.has(r.owner)).length).toBeGreaterThan(0);
    });

    it('catches a bare agent noun', () => {
      const gate = between(fixture('bare-noun'), '### 6. QA gate', '**Regression set:');
      expect(unqualifiedAgentNouns(gate).length).toBeGreaterThan(0);
    });

    it('catches a play criterion with no tool named', () => {
      const naked = gateRows(fixture('play-without-tool')).filter(
        (r) => r.owner === 'play' && !r.method.includes('playwright-cli'),
      );
      expect(naked.length).toBeGreaterThan(0);
    });

    it('catches physics-arcade returning to a required-skills list', () => {
      const offenders = requiredSkills(fixture('physics-arcade-back'))
        .split('\n')
        .filter((line) => line.includes('physics-arcade') && !/\bNot\b/.test(line));
      expect(offenders.length).toBeGreaterThan(0);
    });

    it('catches a missing always-on skill', () => {
      const skills = requiredSkills(fixture('missing-always-skill'));
      expect(ALWAYS_SKILLS.filter((s) => !skills.includes(s)).length).toBeGreaterThan(0);
    });

    it('catches a dropped Codex implementation review', () => {
      const gate = between(fixture('no-codex-impl'), '### 6. QA gate', '**Regression set:');
      expect(gate).not.toMatch(/Codex \*?\*?implementation\*?\*? review ran/);
    });

    it('refuses an empty slice rather than passing vacuously', () => {
      expect(() => between('### 6. QA gate\n**Regression set:', '### 6. QA gate', '**Regression set:')).toThrow(
        /empty slice/,
      );
    });

    it('refuses a missing marker rather than passing', () => {
      expect(() => between('nothing here', '### 6. QA gate', 'x')).toThrow(/start marker not found/);
    });
  });
});
