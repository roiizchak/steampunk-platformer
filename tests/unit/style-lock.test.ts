import { describe, expect, it } from 'vitest';

/**
 * STYLE.md §2–§5 is the locked art direction. The document says changing it "needs approval,
 * not a prompt tweak" — this file is what turns that sentence into a gate.
 *
 * WHY THIS EXISTS. Phase 4's §2 required-skills list carries three skills with opinions about
 * sprite style (`pixel-art-sprites`, `game-asset-generation`, `spritecook-generate-sprites`).
 * Each is useful for sheet layout and frame extraction, and each will happily suggest a
 * different endpoint, a reworded prompt, or "character fills 30% of the screen". That last one
 * is not hypothetical: naming a percentage instead of a countable ratio was tried twice on
 * `nano-banana-2` and ignored both times (STYLE.md §4, vault 4.4). A locked recipe with no
 * mechanical lock is a suggestion.
 *
 * WHAT IS LOCKED, AND WHAT DELIBERATELY IS NOT. Locking all of §2–§5 would fire on every
 * legitimate edit and be disabled within a phase. So the lock is pointed only at the parts that
 * are *verbatim by contract*:
 *
 *   LOCKED    §2 the parameter table  — the exact endpoint and generation parameters
 *   LOCKED    §4 the fenced prompt template — "everything else is verbatim"
 *   LOCKED    §5 the two numbered separation rules — "non-negotiable"
 *
 *   NOT LOCKED  §2b — explicitly a list of things that must change when gate 0 re-probes
 *   NOT LOCKED  §4's [SETTING] values and the [SCALE_RATIO] measurement table — measured on the
 *               retired `nano-banana-2` and due to be re-derived (gate 0.4)
 *   NOT LOCKED  §5's sat/val/hue measurement table — same reason
 *
 * So a gate-0 re-probe updates the document freely. Rewording the prompt does not.
 *
 * HOW TO CHANGE A LOCKED SECTION. Get approval, make the edit, run this suite, and paste the
 * printed hash into LOCKS below with a one-line reason. The failure is the approval checkpoint,
 * which is the whole point — do not update the hash to make a red suite green.
 *
 * File contents come from Vite's `import.meta.glob(..., { query: '?raw' })`, not node:fs — the
 * dependency list is frozen and this needs no `@types/node`, and it keeps the suite runnable
 * with Phaser uninstalled (criterion 1.3). Same technique as `sim-boundary.test.ts`.
 *
 * The hash is FNV-1a, written out rather than imported: node:crypto would need @types/node.
 * It is a change-detector, not a security primitive, and collision resistance is not the job.
 */

const DOCS = import.meta.glob('../../docs/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const BAD_FIXTURES = import.meta.glob('../fixtures/bad-style/**/*.fixture', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function doc(name: string): string {
  const key = Object.keys(DOCS).find((k) => k.endsWith(`/${name}`));
  if (key === undefined) throw new Error(`${name} not found — did it move?`);
  // Normalise line endings only. Whitespace inside a verbatim block is part of the lock.
  return DOCS[key]!.replace(/\r\n/g, '\n');
}

function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Slice a document between two markers. Returns the text BETWEEN them, exclusive.
 * Throws rather than returning empty when a marker is missing: a lock that silently
 * hashes the empty string passes forever (vault C2).
 */
function between(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  if (start < 0) throw new Error(`start marker not found: ${startMarker}`);
  const from = start + startMarker.length;
  const end = source.indexOf(endMarker, from);
  if (end < 0) throw new Error(`end marker not found after ${startMarker}: ${endMarker}`);
  const slice = source.slice(from, end).trim();
  if (slice.length === 0) throw new Error(`empty slice between ${startMarker} and ${endMarker}`);
  return slice;
}

interface LockedSection {
  readonly name: string;
  readonly hash: string;
  readonly extract: (style: string) => string;
}

/**
 * The locked recipe. Each hash was produced by this file's own `fnv1a` against the section as
 * approved. Updating one is a STYLE.md change decision, recorded in QA-LOG.md.
 */
const LOCKS: readonly LockedSection[] = [
  {
    name: '§2 parameter table — endpoint, seed, resolution, output format',
    hash: '977d024f',
    extract: (s) => between(s, '## 2. Model and parameters — exact', '**Price source'),
  },
  {
    name: '§4 prompt template — verbatim by contract',
    hash: 'da7899b9',
    extract: (s) => between(s, '## 4. Prompt template', '**`[SETTING]` values verified'),
  },
  {
    name: '§5 the two separation rules — non-negotiable',
    hash: '3bbfc045',
    extract: (s) => between(s, '## 5. The two separation rules', 'They are deliberately redundant'),
  },
];

/** The generation parameters a batch must use. Asserted by name so a diff reads as English. */
const LOCKED_PARAMS: ReadonlyArray<readonly [string, string]> = [
  ['Endpoint', 'fal-ai/nano-banana-pro'],
  ['`seed`', '20260804'],
  ['`aspect_ratio`', '16:9'],
  ['`resolution`', '2K'],
  ['`output_format`', 'png'],
  ['`num_images`', '1'],
  ['`limit_generations`', 'true'],
  ['`enable_web_search`', 'false'],
];

/**
 * Sentences the §4 template cannot lose without losing the thing it was tuned to produce.
 * The hash already catches any edit; these exist so the FAILURE NAMES WHAT BROKE. A hash
 * mismatch says "something changed"; these say "the CRITICAL GEOMETRY constraint is gone",
 * which is the difference between a gate and an alarm.
 */
const TEMPLATE_INVARIANTS: ReadonlyArray<readonly [string, string]> = [
  ['the single-health-bar geometry constraint (§6: constrain, never negate)', 'CRITICAL GEOMETRY'],
  ['separation rule one, material', 'RULE ONE, MATERIAL'],
  ['separation rule two, temperature', 'RULE TWO, TEMPERATURE'],
  ['the brass leading edge that marks a platform', 'polished brass leading edge'],
  ['the cool-background constraint', 'cool blue-grey shadow'],
  ['the negative prompt list', 'DO NOT INCLUDE'],
  ['the no-text constraint', 'words, letters'],
  ['the scale slot', '[SCALE_RATIO]'],
  ['the setting slot', '[SETTING]'],
];

describe('STYLE.md locked art direction', () => {
  const style = doc('STYLE.md');

  describe('the locked sections are unchanged', () => {
    for (const lock of LOCKS) {
      it(`${lock.name}`, () => {
        const actual = fnv1a(lock.extract(style));
        expect(
          actual,
          `\n\n  ${lock.name} changed.\n\n` +
            `  If this edit was approved as a STYLE.md change, put ${actual} in LOCKS\n` +
            `  (tests/unit/style-lock.test.ts) and record the reason in QA-LOG.md.\n` +
            `  If it was not approved, revert it. Do not update the hash to go green.\n`,
        ).toBe(lock.hash);
      });
    }
  });

  describe('§2 generation parameters', () => {
    const table = between(style, '## 2. Model and parameters — exact', '**Price source');

    for (const [field, value] of LOCKED_PARAMS) {
      it(`${field} is ${value}`, () => {
        const row = table.split('\n').find((line) => line.startsWith(`| ${field} `));
        expect(row, `no table row for ${field} in §2`).toBeDefined();
        expect(row!).toContain(value);
      });
    }

    it('4K is never the locked resolution — it costs double (§2b)', () => {
      const row = table.split('\n').find((line) => line.startsWith('| `resolution` '));
      expect(row!).not.toContain('4K`');
    });
  });

  describe('§4 prompt template', () => {
    const template = between(style, '## 4. Prompt template', '**`[SETTING]` values verified');

    for (const [what, needle] of TEMPLATE_INVARIANTS) {
      it(`still carries ${what}`, () => {
        expect(template).toContain(needle);
      });
    }

    it('names a countable ratio, never a percentage (vault 4.4)', () => {
      // The model ignored a percentage twice before `one and four fifths` was adopted.
      // A percentage anywhere in the template means the wrong variable is being named.
      const offenders = template
        .split('\n')
        .filter((line) => /\d\s*(%|percent)/i.test(line))
        .map((line) => line.trim());
      expect(offenders, 'a percentage reached the prompt template').toEqual([]);
    });
  });

  describe('endpoints', () => {
    const falModels = doc('FAL-MODELS.md');

    it('every fal endpoint named in STYLE.md is documented in FAL-MODELS.md', () => {
      const named = [...style.matchAll(/`((?:fal-ai|bytedance)\/[a-z0-9/.-]+)`/g)].map((m) => m[1]!);
      expect(named.length, 'no endpoints found in STYLE.md — did the format change?').toBeGreaterThan(0);

      const undocumented = [...new Set(named)].filter((e) => !falModels.includes(e));
      expect(
        undocumented,
        'an endpoint is named in the locked recipe but has no FAL-MODELS.md entry — ' +
          'its price, schema and gotchas are therefore unknown',
      ).toEqual([]);
    });

    it('no retired endpoint is named as a live parameter', () => {
      // `nano-banana-2` is retired (§2b). §2 discusses it in prose — that is the swap record and
      // must stay. What must never happen is it appearing as a VALUE, so scan the table's value
      // cells only. Scanning the whole section would fire on the sentence documenting the swap.
      const paramTable = between(style, '## 2. Model and parameters — exact', '**Price source');
      const offenders = paramTable
        .split('\n')
        .filter((line) => line.startsWith('|') && !line.startsWith('| Field'))
        .filter((line) => (line.split('|')[2] ?? '').includes('nano-banana-2'));
      expect(offenders, 'the retired endpoint is being used as a parameter value').toEqual([]);
    });
  });

  /**
   * Vault C2: a gate that cannot go red is decoration. Each fixture is a copy of the real
   * document with exactly one approved thing broken, committed to the repository, and asserted
   * to be CAUGHT. If a future refactor makes the checks vacuous, these turn red.
   */
  describe('the lock can go red (vault C2)', () => {
    function fixture(name: string): string {
      const key = Object.keys(BAD_FIXTURES).find((k) => k.endsWith(`/${name}.fixture`));
      if (key === undefined) throw new Error(`bad fixture missing: ${name}`);
      return BAD_FIXTURES[key]!.replace(/\r\n/g, '\n');
    }

    it('catches a reworded prompt template', () => {
      const bad = fixture('reworded-template');
      const section = between(bad, '## 4. Prompt template', '**`[SETTING]` values verified');
      expect(fnv1a(section)).not.toBe(LOCKS.find((l) => l.name.startsWith('§4'))!.hash);
    });

    it('catches a dropped CRITICAL GEOMETRY constraint', () => {
      const bad = fixture('dropped-geometry');
      const section = between(bad, '## 4. Prompt template', '**`[SETTING]` values verified');
      expect(section).not.toContain('CRITICAL GEOMETRY');
    });

    it('catches a percentage in the template (vault 4.4)', () => {
      const bad = fixture('percentage-scale');
      const section = between(bad, '## 4. Prompt template', '**`[SETTING]` values verified');
      const offenders = section.split('\n').filter((line) => /\d\s*(%|percent)/i.test(line));
      expect(offenders.length).toBeGreaterThan(0);
    });

    it('catches a swapped endpoint', () => {
      const bad = fixture('swapped-endpoint');
      const table = between(bad, '## 2. Model and parameters — exact', '**Price source');
      const row = table.split('\n').find((line) => line.startsWith('| Endpoint '));
      expect(row!).not.toContain('fal-ai/nano-banana-pro`');
    });

    it('catches web search being switched on', () => {
      const bad = fixture('web-search-on');
      const table = between(bad, '## 2. Model and parameters — exact', '**Price source');
      const row = table.split('\n').find((line) => line.startsWith('| `enable_web_search` '));
      expect(row!).not.toContain('`false`');
    });

    it('catches an undocumented endpoint', () => {
      const bad = fixture('undocumented-endpoint');
      const falModels = doc('FAL-MODELS.md');
      const named = [...bad.matchAll(/`((?:fal-ai|bytedance)\/[a-z0-9/.-]+)`/g)].map((m) => m[1]!);
      const undocumented = [...new Set(named)].filter((e) => !falModels.includes(e));
      expect(undocumented.length).toBeGreaterThan(0);
    });

    it('refuses an empty slice rather than hashing nothing', () => {
      expect(() => between('## 4. Prompt template\n**`[SETTING]` values verified', '## 4. Prompt template', '**`[SETTING]` values verified')).toThrow(
        /empty slice/,
      );
    });

    it('refuses a missing marker rather than passing', () => {
      expect(() => between('nothing here', '## 4. Prompt template', 'x')).toThrow(/start marker not found/);
    });
  });
});
