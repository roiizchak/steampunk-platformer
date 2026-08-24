/**
 * Every `PERF_MUTATION` is WIRED to a spec that applies it — as a gate.
 *
 * ## The defect this closes, in the project's own words
 *
 * `effectMutation.ts`'s own header records it: *"`particlescale0` sat in this array for a whole gate
 * round while `phase-09-perf.spec.ts` applied it nowhere, so it ran that spec clean and reported
 * `1 passed`"*. That is the worst shape a proof can take — **not a missing proof, but a green run
 * that looks like one**.
 *
 * `namedMutation` already refuses an unrecognised value, which makes a *typo* loud. It cannot make
 * an *unapplied* mutation loud, because the value it was handed is one it recognises. Only reading
 * the spec sources can do that, and until now nothing did.
 *
 * ## Why a unit test and not an e2e one
 *
 * Running each mutation to see it redden is ~94 s of Playwright per mutation, and a mutation aimed
 * at a bound that another guard reaches first reports the wrong assertion — the exact problem §1b
 * exists for. This asks the cheaper, stricter question: **does the spec named in `MUTATION_TARGETS`
 * exist, and does it mention this mutation at all?** A mutation that fails that cannot possibly be
 * a proof, whatever a green run says.
 *
 * ⚠️ **What it does NOT check**, stated rather than implied: that applying the mutation actually
 * reddens the named assertion. That needs a run, it is recorded per mutation in
 * `docs/qa/session-phase-09-debts.md`, and this test is a floor under it, not a substitute.
 */

import { describe, expect, it } from 'vitest';
import { NAMED_MUTATIONS } from '../e2e/effectMutation';
import { MUTATION_TARGETS } from '../e2e/mutationTargets';

const SPECS = import.meta.glob('../e2e/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

function specSource(name: string): string | null {
  const key = Object.keys(SPECS).find((k) => k.endsWith(`/${name}`));
  return key === undefined ? null : SPECS[key]!;
}

/**
 * The spec's source **plus the sources of the sibling modules it imports**, joined.
 *
 * 🔴 **One level of imports, and that level is not a convenience.** On 2026-08-24 the five
 * `if (MUTATION === …)` blocks moved out of `phase-09-perf.spec.ts` into `perfMutationSetup.ts` (the
 * 400-line rule), and a check that read only the `.spec.ts` went red on all five — correctly, by its
 * own wording, and uselessly, because the mutations were still applied. Reading the spec's own import
 * list is what keeps the question *"is this mutation reachable from that spec?"* rather than the much
 * weaker *"does that one file happen to contain the string?"*.
 *
 * ⚠️ It is deliberately NOT transitive. A mutation applied two hops from the spec is one nobody can
 * follow from the gate to the fixture, and this test would rather say so.
 *
 * 🔴 **`DECLARERS` is excluded, and the first draft of this widening was VACUOUS without it.** The
 * spec imports `effectMutation.ts`, which is where `NAMED_MUTATIONS` lives — so once that file was in
 * the walk, every name was "mentioned" by the array that declares it and a deliberately-unapplied
 * `ghostproof` passed. The check has to read only the files that APPLY a mutation, never the ones
 * that NAME it. Caught by re-running the red proof after changing the predicate, which is the whole
 * reason C1 says to watch a gate fail *again* when its definition moves.
 */
const DECLARERS = ['effectMutation.ts', 'mutationTargets.ts'];

function reachableFrom(name: string): string | null {
  const src = specSource(name);
  if (src === null) return null;
  const parts = [src];
  for (const m of src.matchAll(/from '\.\/([\w-]+)'/g)) {
    const name = `${m[1]!}.ts`;
    if (DECLARERS.includes(name)) continue;
    const dep = specSource(name);
    if (dep !== null) parts.push(dep);
  }
  return parts.join('\n');
}

describe('every PERF_MUTATION is wired to a spec that applies it', () => {
  it('the scan is not vacuous: it really loaded the e2e spec sources', () => {
    // A glob that matched nothing would make every assertion below pass by having no input — the
    // silent-zero shape this repository has now paid for three times.
    expect(Object.keys(SPECS).length, 'no e2e sources were loaded').toBeGreaterThan(5);
    expect(specSource('phase-09-perf.spec.ts'), 'the perf spec moved or was renamed').not.toBeNull();
    // And the import walk really reaches past the spec's own bytes — otherwise the widening below
    // would be inert and every mention would still have to be in the one file.
    expect(
      reachableFrom('phase-09-perf.spec.ts')!.length,
      'the import walk pulled in nothing',
    ).toBeGreaterThan(specSource('phase-09-perf.spec.ts')!.length);
    // And the exclusion is doing work: the registry that DECLARES every name must not be in the walk,
    // or the mention check answers itself.
    expect(
      reachableFrom('phase-09-perf.spec.ts')!.includes('NAMED_MUTATIONS = ['),
      'the declaring registry leaked into the reachable set — every name would pass trivially',
    ).toBe(false);
  });

  it('every name in NAMED_MUTATIONS has a routing entry', () => {
    const missing = NAMED_MUTATIONS.filter((m) => MUTATION_TARGETS[m] === undefined);
    expect(missing, 'a mutation with no declared target cannot be shown to prove anything').toEqual([]);
  });

  it('every routing entry names a spec that EXISTS and MENTIONS the mutation', () => {
    const broken: string[] = [];
    for (const mutation of NAMED_MUTATIONS) {
      const { spec } = MUTATION_TARGETS[mutation];
      const src = reachableFrom(spec);
      if (src === null) {
        broken.push(`${mutation}: ${spec} does not exist`);
      } else if (!src.includes(`'${mutation}'`)) {
        broken.push(`${mutation}: neither ${spec} nor anything it imports mentions it`);
      }
    }
    expect(
      broken,
      'a mutation named but never applied runs the spec CLEAN and reports a pass, which reads as ' +
        'proof and is the opposite of it (effectMutation.ts records this happening for a whole ' +
        'gate round). Apply it in the named spec, or remove it from NAMED_MUTATIONS.',
    ).toEqual([]);
  });

  it('REJECTS an unapplied mutation — this rule can go red (vault C2)', () => {
    // Driven against the production predicate, not a re-implementation: the same `includes` check
    // the real assertion uses, against a source that genuinely does not mention the name.
    const src = reachableFrom('phase-09-perf.spec.ts')!;
    expect(src.includes(`'flatcost'`), 'a wired mutation').toBe(true);
    expect(src.includes(`'__never_applied'`), 'an unwired one').toBe(false);
  });

  it('REJECTS a routing entry pointing at a spec that does not exist', () => {
    expect(specSource('phase-99-does-not-exist.spec.ts')).toBeNull();
  });
});
