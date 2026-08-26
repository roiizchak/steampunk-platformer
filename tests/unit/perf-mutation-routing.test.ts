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
import { NAMED_MUTATIONS, namedMutation, stormCount } from '../e2e/mutationRegistry';
import { MUTATION_TARGETS, PARAMETRIC_MUTATION_TARGETS } from '../e2e/mutationTargets';

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
// ⚠️ `mutationRegistry.ts` joined this list on 2026-08-25 when `NAMED_MUTATIONS` moved there under
// the 400-line rule. A registry file added WITHOUT being listed here re-opens the vacuity hole in
// silence: it names every mutation because it declares them, so the walk answers its own question.
const DECLARERS = ['effectMutation.ts', 'mutationTargets.ts', 'mutationRegistry.ts'];

/**
 * **Does `src` APPLY `symbol`, as opposed to merely declaring it?**
 *
 * 🔴 **The hole this closes, named by both 9.2/9.3 briefs.** The rule below used a bare
 * `src.includes(t.applies)`, and `phase-09-perf.spec.ts:109` is
 * `const STORM_MUTATION = stormCount(process.env.PERF_MUTATION ?? '')`. The declaration satisfies
 * the check **on its own**: delete the one line at `:183` that actually reads `STORM_MUTATION` and
 * the family goes back to being declared-but-unapplied, the spec runs CLEAN, and this gate reports a
 * pass. That is the `particlescale0` defect — the exact thing this file exists to catch — reproduced
 * inside the catcher. `DECLARERS` closed the cross-file form of it; this closes the same-file form.
 *
 * The fix is to ignore the declaration and ask whether anything ELSE names the symbol. Lines that
 * bind it are dropped, then the search runs over what is left.
 *
 * ⚠️ **Still a text search.** Comments, string and template literals, and every binding form are
 * removed first — the Codex implementation review named the comment case, and it is the sharp one:
 * a `// STORM_MUTATION was applied here` left behind by the very edit that removed the application
 * would keep this gate green. What remains unhandled is a use inside dead code the parser would see
 * as live (an `if (false)` branch, an unreachable statement). A real parse would close that; it is
 * not written because no such shape exists in `tests/e2e/` and the failure would be a MISSED gap
 * rather than a false red. Strictly stronger than `includes`, and nothing more is claimed.
 */
export function appliesSymbol(src: string, symbol: string): boolean {
  // 🔴 Comments and string literals are stripped FIRST. Named by the Codex implementation review:
  // without this, a `// STORM_MUTATION was applied here` left behind by the very edit that removed
  // the application keeps this gate green — which is the `particlescale0` defect wearing the shape
  // of a repair. Block comments, line comments, and both quote forms.
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
  // Then every binding form, GLOBALLY — `const X`, `let X`, `var X`, `function X`, with or without
  // `export`. Removing the binder rather than the whole line is what makes a MULTILINE declaration
  // safe: `const X =` on one line with its initialiser on the next leaves no continuation behind to
  // read as a use, and a second declarator on the same line is not swallowed with it.
  const binds = new RegExp(`(?:export\\s+)?(?:const|let|var|function)\\s+${symbol}\\b`, 'g');
  return stripped.replace(binds, ' ').includes(symbol);
}

/** Built from a char code so the shell that writes these fixtures cannot eat the escape. */
const NEWLINE = String.fromCharCode(10);
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

/**
 * The PARAMETRIC families — `storm<N>` and anything later that is generated from a number.
 *
 * 🔴 **These were outside every check above until 2026-08-25**, because `namedMutation()` returns
 * `''` for a storm and `MUTATION_TARGETS` is keyed by `NamedMutation`. `storm8192` is the recorded
 * red proof for two of the four upper bounds in `phase-09-perf.spec.ts`, so **the mutation doing the
 * most work in that gate was the one nothing checked was wired** — the `particlescale0` failure one
 * level up.
 *
 * The mention check differs from the named one and has to: a parametric member never appears
 * literally in the spec, so this asks whether the spec mentions the SYMBOL the family is applied
 * through. See `ParametricTarget`'s header.
 */
describe('every PARAMETRIC PERF_MUTATION family is wired to a spec that applies it', () => {
  it('the table is not empty — an empty list would pass every assertion below', () => {
    expect(
      PARAMETRIC_MUTATION_TARGETS.length,
      'no parametric families declared; if storm<N> was removed, remove these tests too',
    ).toBeGreaterThan(0);
  });

  it('every family names a spec that EXISTS and mentions the symbol it is applied through', () => {
    const broken: string[] = [];
    for (const t of PARAMETRIC_MUTATION_TARGETS) {
      const src = reachableFrom(t.spec);
      if (src === null) {
        broken.push(`${t.family}: ${t.spec} does not exist`);
      } else if (!appliesSymbol(src, t.applies)) {
        broken.push(`${t.family}: ${t.spec} never mentions '${t.applies}', so it cannot apply it`);
      }
    }
    expect(
      broken,
      'a parametric family named but never applied runs the spec CLEAN and reports a pass — and ' +
        'unlike a named mutation, no typo guard catches it, because stormCount() accepts any number.',
    ).toEqual([]);
  });

  it("every family's example is accepted by the parser and is NOT a named mutation", () => {
    for (const t of PARAMETRIC_MUTATION_TARGETS) {
      expect(t.pattern.test(t.example), `${t.family}: its own pattern rejects its example`).toBe(true);
      // The two registries must not overlap: a value both parsers claim would route twice and mean
      // different things in each, which is the ambiguity `namedMutation` throws to prevent.
      expect(
        (NAMED_MUTATIONS as readonly string[]).includes(t.example),
        `${t.family}: '${t.example}' is ALSO a named mutation — the two registries overlap`,
      ).toBe(false);
      // And the live parser really recognises it, so the example cannot rot into a value that
      // `namedMutation` would throw on.
      expect(stormCount(t.example), `${t.family}: stormCount() does not parse '${t.example}'`).toBeGreaterThan(0);
      expect(namedMutation(t.example), `${t.family}: namedMutation() should defer to the parametric parser`).toBe('');
    }
  });

  it('REJECTS a family whose symbol the spec does not APPLY — this rule can go red (vault C2)', () => {
    // 🔴 **Driven through `appliesSymbol`, the production predicate.** The previous version of this
    // proof asserted `src.includes('STORM_MUTATION')` directly — it re-implemented the check instead
    // of exercising it, so it would have stayed green through any change to the rule, including the
    // declaration-only hole the predicate was just repaired for. A C2 proof that hard-codes the
    // comparison it is proving is decoration.
    const src = reachableFrom('phase-09-perf.spec.ts')!;
    expect(appliesSymbol(src, 'STORM_MUTATION'), 'the wired family').toBe(true);
    expect(appliesSymbol(src, '__NEVER_APPLIED_FAMILY'), 'an unwired one').toBe(false);

    // 🔴 And the case the bare `includes` could not tell apart: a symbol that is DECLARED and never
    // read. This is the shape `phase-09-perf.spec.ts:109` would have if `:183` were deleted.
    const declaredOnly = [
      'const GHOST_MUTATION = stormCount(process.env.PERF_MUTATION);',
      'test("a spec that never reads it", () => {});',
    ].join(NEWLINE);
    expect(
      appliesSymbol(declaredOnly, 'GHOST_MUTATION'),
      'a declared-but-never-read symbol counted as APPLIED — this is the particlescale0 defect',
    ).toBe(false);
    expect(appliesSymbol(declaredOnly + NEWLINE + 'const peak = GHOST_MUTATION || 1;', 'GHOST_MUTATION'),
      'one real read was not enough to count as applied').toBe(true);

    // 🔴 The three shapes the Codex implementation review named, each of which kept the old
    // line-stripping version green while the mutation was unapplied.
    const decl = String.raw`const G = stormCount(process.env.PERF_MUTATION);`;
    const cases: [string, string][] = [
      ['a line comment', `${decl}${NEWLINE}// G was applied here until 2026-08-25`],
      ['a block comment', `${decl}${NEWLINE}/* see G above */`],
      ['a string literal', `${decl}${NEWLINE}console.log('G');`],
      ['a template literal', `${decl}${NEWLINE}console.log(\`G\`);`],
      ['a MULTILINE declaration', `const G =${NEWLINE}  stormCount(process.env.PERF_MUTATION);`],
    ];
    for (const [why, src] of cases) {
      expect(appliesSymbol(src, 'G'), `${why} counted as APPLYING the mutation`).toBe(false);
    }

    // And the multiline declaration still recognises a real read on a later line, so the stripping
    // did not just swallow the file.
    expect(
      appliesSymbol(`const G =${NEWLINE}  stormCount(process.env.PERF_MUTATION);${NEWLINE}const p = G || 1;`, 'G'),
      'a real read after a multiline declaration was stripped away with it',
    ).toBe(true);
  });
});
