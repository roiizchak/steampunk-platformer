import { describe, expect, it } from 'vitest';
import { ALL_SOURCES } from './sourceScan';
import { EXCLUDED, SIM_MUTATORS, deriveSimMutators, manifestGaps } from './simMutators';

/**
 * # The `SIM_MUTATORS` completeness gate
 *
 * `SIM_MUTATORS` feeds criterion 9.2b's argument rule: a tween callback that hands a sim object to a
 * `src/sim/` mutator is writing sim-owned state at one remove. The set was a **hand-maintained name
 * list**, and its own docstring called that a narrowing — *"a new mutating export in `src/sim/` is
 * invisible until it is added here."*
 *
 * 🔴 **Measured 2026-08-25, the narrowing was far worse than that sentence implies.** `src/sim/`
 * exports **86** functions. **26** write to their own parameters; **32** are in the transitive
 * closure. The list held **six**, and `tick(world, input)` — the most obviously param-mutating
 * function in the simulation — **was not one of them.** The rule was ~81 % incomplete on the day it
 * was described as merely missing future additions.
 *
 * ## What this gate does, and what it deliberately does not
 *
 * It **does not replace the manifest with the derivation.** The rule fires on a name at a call site,
 * so the two error directions are not symmetric: a missing name under-reports (a gap), while an
 * over-inferred name is a **false red on legal production code** — and this project's own history is
 * that a false red on a blocker rule gets the gate edited rather than the code fixed.
 *
 * So the derivation is a **tripwire**, not the source of truth. It says when the manifest has fallen
 * behind, by name, and the human decides whether the name belongs or belongs in `EXCLUDED` with a
 * written reason.
 *
 * ## Ordering — why this could not ship before the identity change
 *
 * Growing the set 6 → 32 is only safe because `simImports()` resolves the callee to a `src/sim/`
 * import first. Matched against a bare name, 32 ordinary verbs (`tick`, `advance`, `enterState`,
 * `resolveState`) would make any local helper sharing a name illegal — enforcement by **collision**,
 * structurally broader than the authorised rule. The owner ruled that identity comes first for
 * exactly this reason; `tween-sim-writes.test.ts` carries the acceptance fixture.
 */

describe('SIM_MUTATORS is complete against src/sim/', () => {
  const derivation = deriveSimMutators(ALL_SOURCES);

  it('the derivation is not vacuous — it really parsed src/sim/', () => {
    // A glob that matched nothing, or a parse that yielded nothing, would make every assertion below
    // pass by having no input. The 86 is the denominator the 32 is meaningful against.
    expect(derivation.exportedCount, 'no exported functions found in src/sim/').toBeGreaterThan(60);
    expect(derivation.direct.length, 'no direct parameter-writers found').toBeGreaterThan(20);
    expect(derivation.closure.length, 'the closure is smaller than the direct set').toBeGreaterThanOrEqual(
      derivation.direct.length,
    );
  });

  it('the transitive clause does real work — it finds callers that write nothing themselves', () => {
    // `advance` calls `tick(world, input)` and writes only to a local. A direct-writes-only rule
    // misses it, and it is the entry point the whole simulation runs through.
    const transitiveOnly = derivation.closure.filter((n) => !derivation.direct.includes(n));
    expect(
      transitiveOnly.length,
      'the closure added nothing over direct writers — the transitive clause is inert',
    ).toBeGreaterThan(0);
    expect(transitiveOnly, 'advance() writes only to a local and must still be a mutator').toContain('advance');
  });

  it('every derived mutator is either in the manifest or EXCLUDED with a reason', () => {
    const gaps = manifestGaps(derivation);
    expect(
      gaps,
      'these src/sim/ exports mutate a parameter but are invisible to criterion 9.2b\'s argument ' +
        'rule. Add each to SIM_MUTATORS, or to EXCLUDED with the reason it does not belong — never ' +
        `silently: ${gaps.join(', ')}`,
    ).toEqual([]);
  });

  it('every EXCLUDED entry carries a non-empty reason', () => {
    // An exclusion with an empty reason is the manifest edited quietly, wearing the shape of review.
    const unreasoned = Object.entries(EXCLUDED).filter(([, why]) => why.trim().length < 20);
    expect(unreasoned.map(([n]) => n), 'an exclusion without a real written reason').toEqual([]);
  });

  it('the manifest does not claim names src/sim/ does not export', () => {
    // The other drift direction: a function renamed or deleted leaves a dead entry that can never
    // fire, and the set reads more complete than it is.
    const known = new Set([...derivation.closure, ...Object.keys(EXCLUDED)]);
    const dead = [...SIM_MUTATORS].filter((n) => !known.has(n));
    expect(
      dead,
      `the manifest lists names the derivation does not find in src/sim/ — renamed or removed: ${dead.join(', ')}`,
    ).toEqual([]);
  });

  it('REJECTS a mutator missing from the manifest — this rule can go red (vault C2)', () => {
    // Driven against the production predicate over a synthetic source, so the proof cannot rot into
    // "it fired on something" and needs no fixture file someone later tidies away.
    const fake = {
      '/src/sim/fabricated.ts': 'export function bumpTheThing(w) { w.player.hp -= 1; }',
    };
    const d = deriveSimMutators(fake);
    expect(d.closure, 'the derivation cannot see a plain parameter write').toContain('bumpTheThing');
    expect(manifestGaps(d), 'a mutator absent from the manifest was not reported').toContain('bumpTheThing');
  });

  it('ACCEPTS a function that mutates only its own locals — the derivation is not a blanket', () => {
    // `derivedFeel()` in src/sim/derived.ts is the real case this models: it calls `advance()` on a
    // scratch world it builds itself, so it is pure from the caller's view. An earlier draft of the
    // closure reported it, which would have put a pure function into a name-matched rule.
    const fake = {
      '/src/sim/fabricated.ts': 'export function pure(t) { const w = build(t); advance(w, 1); return w.player.y; }',
    };
    expect(deriveSimMutators(fake).closure, 'a function mutating only a local was reported').toEqual([]);
  });
});
