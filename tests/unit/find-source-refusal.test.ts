import { describe, expect, it } from 'vitest';

import { findSource } from '../../tools/gen/assetSources.mjs';

/**
 * **Criterion 4.12, run at last — the deliberate-removal run it has been owed since Phase 4.**
 *
 * `docs/prd/phase-05-combat.md` has carried this row unchanged through five phases:
 *
 *   > **4.12 UNRUN.** `findSource` throws on a missing input, but nothing watched it fail.
 *   > Needs the deliberate-removal run *(C1)*, then a log line.
 *
 * ⚠️ **`docs/PRD.md`'s Phase 4 row says "4.10/4.12 closed in Phase 5". For 4.12 that was wrong** —
 * criterion 10.11's whole job is to check every prior phase's claims rather than repeat them, and
 * this is what it found. No test called `findSource` at all: `sheet-name-contract.test.ts` covers
 * the NAMING both sides agree on, which is a different property and does not reach either throw.
 *
 * ## Why this matters more than an ordinary error path
 *
 * Vault 4.16 is that a declared input which cannot be found must **fail the build, never
 * substitute**. `_generated/` is gitignored, so on any fresh clone every source sheet is missing —
 * which makes this refusal the single most-exercised failure in the whole pipeline and the one that
 * would be most catastrophic to soften. A build that quietly packed a placeholder would ship art
 * nobody generated, and every gate downstream would measure the placeholder and pass.
 *
 * Two distinct refusals, because they fail at different distances: the directory is missing (no
 * pipeline on this machine) versus the directory is there and this one sheet is not (a declared
 * animation with no art). The second is the dangerous one — a substitution there is invisible.
 */
describe('findSource refuses rather than substitutes (criterion 4.12)', () => {
  it('throws when the generated directory does not exist', () => {
    expect(() => findSource('no/such/generated/root', 'brass-courier', 'idle')).toThrow(
      /does not exist/,
    );
  });

  it('throws when the directory exists but the declared sheet does not', () => {
    // `tests/fixtures` exists; no clip sheet was ever written there. This is the case a build hits
    // when an animation is declared in the catalog before its art is generated.
    expect(() => findSource('tests/fixtures', 'brass-courier', 'idle')).toThrow(
      /no source sheet for declared animation "idle"/,
    );
  });

  it('names the missing PATH, not just the fact of absence', () => {
    // A refusal that does not say what it looked for sends the reader hunting. The message is part
    // of the contract, and vault 4.16's own note is that the previous version told the reader to
    // run `npm run assets:fetch` — a script that does not exist.
    let message = '';
    try {
      findSource('tests/fixtures', 'brass-courier', 'idle');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('tests');
    expect(message).toContain('.png');
    expect(message, 'the refusal no longer cites the vault item it enforces').toContain('4.16');
  });
});
