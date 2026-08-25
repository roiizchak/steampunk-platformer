/**
 * The red-proofs for `gateVerdicts.ts` — driven against LITERALS, per (C2).
 *
 * The regression test over Phase 4's **real** log lives in `docs-contract.test.ts`, because it needs
 * that file's document glob. The two halves are deliberate: literals prove the rule cannot rot into
 * "it fired on something", and the real log proves the shape it must tolerate is really there.
 */

import { describe, expect, it } from 'vitest';
import { GATE_VERDICTS, criterionRowGaps, gateVerdictTable } from './gateVerdicts';

const TABLE = [
  GATE_VERDICTS,
  '',
  '| # | Criterion | Verdict |',
  '|---|---|---|',
  '| 9.1 | a thing | PASS |',
  '| 9.2 | another | PASS |',
].join('\n');

describe('the designated-table rule can go red, and does not over-reach (vault C2)', () => {
  it('ACCEPTS exactly one row per criterion', () => {
    expect(criterionRowGaps(TABLE, ['9.1', '9.2'], 'fixture')).toEqual([]);
  });

  it('REJECTS a MISSING row — the defect this check has always caught', () => {
    expect(criterionRowGaps(TABLE, ['9.1', '9.3'], 'fixture')).toEqual([
      'fixture criterion 9.3: 0 rows in the gate-verdicts table, expected 1',
    ]);
  });

  it('REJECTS a DUPLICATE row inside the designated table — the defect it could not tell apart', () => {
    const dup = `${TABLE}\n| 9.1 | a thing, again | FAIL |`;
    expect(criterionRowGaps(dup, ['9.1'], 'fixture')).toEqual([
      'fixture criterion 9.1: 2 rows in the gate-verdicts table, expected 1',
    ]);
  });

  it('REJECTS a log that designates no table at all', () => {
    const undesignated = '| # | Criterion | Verdict |\n|---|---|---|\n| 9.1 | a thing | PASS |';
    expect(gateVerdictTable(undesignated)).toBeNull();
    expect(criterionRowGaps(undesignated, ['9.1'], 'fixture')[0]).toContain('no <!-- gate-verdicts --> marker');
  });

  it('IGNORES a later table in the same section — the bypass, closed', () => {
    // 🔴 The whole point. A second table keyed on criterion numbers no longer discharges the
    // requirement, and no longer trips the duplicate rule either. Under the old `.test(section)`
    // rule the row below was enough on its own.
    const withLater = `${TABLE}\n\nSome prose.\n\n| # | close-round verdict |\n|---|---|\n| 9.1 | re-judged |`;
    expect(criterionRowGaps(withLater, ['9.1', '9.2'], 'fixture')).toEqual([]);
  });

  it('the OLD rule was satisfied by that later table ALONE — the bypass, demonstrated', () => {
    // Committed evidence for why this changed, rather than a paragraph asserting it. `9.2` has no
    // row in any designated table here, and the rule the repair replaced reported it evidenced.
    const laterOnly = '| # | close-round verdict |\n|---|---|\n| 9.2 | re-judged |';
    expect(/^\|\s*9\.2\s*\|/m.test(laterOnly), 'the old rule accepted it').toBe(true);
    const onlyNineOne = [GATE_VERDICTS, '', '| # |', '|---|', '| 9.1 |'].join('\n');
    expect(criterionRowGaps(`${onlyNineOne}\n\n${laterOnly}`, ['9.2'], 'fixture')).toEqual([
      'fixture criterion 9.2: 0 rows in the gate-verdicts table, expected 1',
    ]);
  });

  it('ends the table at the first non-row line, so prose below it is not scanned', () => {
    // Without this the "table" would run to the end of the section and the designation would mean
    // nothing — the same defect as reading the whole slice, arrived at by a different route.
    const trailing = `${TABLE}\n\nProse mentioning | 9.3 | in passing.\n\n| 9.4 | a later table |`;
    expect(criterionRowGaps(trailing, ['9.3', '9.4'], 'fixture')).toEqual([
      'fixture criterion 9.3: 0 rows in the gate-verdicts table, expected 1',
      'fixture criterion 9.4: 0 rows in the gate-verdicts table, expected 1',
    ]);
  });

  it('a DUPLICATE marker throws instead of silently preferring the first — 2026-08-25 brief', () => {
    // 🔴 The exact bug class this project already paid for on `between()`'s markers
    // (`docs/qa/phase-09-polish.md` records it), arriving at the new marker by the same route: a
    // documentation-style mention above the real table makes `indexOf` designate a placeholder, so
    // one criterion is validated against fabricated rows while its real failing row is never read.
    const decoy = [GATE_VERDICTS, '', '| # |', '|---|', '| 9.1 | placeholder |'].join('\n');
    const real = [GATE_VERDICTS, '', '| # |', '|---|', '| 9.1 | a |', '| 9.1 | b |'].join('\n');
    expect(() => criterionRowGaps(`${decoy}\n\n${real}`, ['9.1'], 'fixture')).toThrow(/more than once/);
    // And the single-marker case still works — the guard did not become a blanket.
    expect(criterionRowGaps(real, ['9.1'], 'fixture')).toEqual([
      'fixture criterion 9.1: 2 rows in the gate-verdicts table, expected 1',
    ]);
  });

  it('an EMPTY id list is a failure, not a vacuous pass — 2026-08-25 brief', () => {
    // The ids come from parsing the PRD's gate table. A parse that returns nothing is a BROKEN
    // parse, and returning `[]` for it reads exactly like a clean phase. It was masked only by a
    // sibling assertion in another file — a coupling that disappears the moment a run is narrowed
    // with `-t`, which CLAUDE.md itself documents as a normal workflow.
    const failing = [GATE_VERDICTS, '', '| # |', '|---|', '| 9.1 | FAIL |'].join('\n');
    expect(criterionRowGaps(failing, [], 'fixture')).toEqual([
      'fixture: no criterion ids were parsed out of the PRD gate table — nothing was checked',
    ]);
    // One id against the same input is still evaluated normally.
    expect(criterionRowGaps(failing, ['9.1'], 'fixture')).toEqual([]);
  });

  it('a MULTI-DOT criterion id is escaped whole — the trap `.replace` left', () => {
    // `.replace('.', …)` is not global, so only the first dot was escaped and `9.2.1` would have
    // matched `9X2.1`. Latent (every id on this tree has one dot) and repaired rather than left.
    const table = [GATE_VERDICTS, '', '| # |', '|---|', '| 9X2.1 | not the same id |'].join('\n');
    expect(criterionRowGaps(table, ['9.2.1'], 'fixture')).toEqual([
      'fixture criterion 9.2.1: 0 rows in the gate-verdicts table, expected 1',
    ]);
  });
});
