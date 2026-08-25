/**
 * The `PERF_MUTATION` REGISTRY: the names, the parser that refuses an unrecognised one, and `storm<N>`.
 *
 * Split out of `effectMutation.ts` on 2026-08-25 (the 400-line rule, CLAUDE.md §3). The seam is real —
 * that file APPLIES mutations to a page, this one DECLARES which exist — and it is the same
 * declarer/applier split `mutationTargets.ts` already sits on.
 *
 * ⚠️ **This file is a DECLARER, so it belongs in `perf-mutation-routing.test.ts`'s `DECLARERS`
 * exclusion list.** That test walks a spec's imports asking "does anything mention this mutation?",
 * and a file that names every mutation because it declares them would answer the question for itself
 * — which is exactly how the first version of that walk went vacuous. Adding a registry file without
 * adding it to `DECLARERS` re-opens that hole silently.
 */

/**
 * Read the storm size out of `PERF_MUTATION`, e.g. `storm8192`. Zero when unset or not a storm.
 *
 * The amplification IS the mutation the 9.5 bound names: same emitters, same specs, same code path,
 * more of them. If the measured work moves, the only thing that moved is how many particles the
 * frame carried — which is the quantity the bound is about.
 */
export function stormCount(mutation: string): number {
  const match = /^storm(\d+)$/.exec(mutation);
  return match === null ? 0 : Number(match[1]);
}

/**
 * The non-storm mutations, by exact name. `''` is a clean run.
 *
 * ⚠️ The count is deliberately NOT written here. It said "seven" while the array held eight, because
 * a number in prose beside a list is a second source of truth that drifts the moment the list grows
 * (`p95spike` was added 2026-08-25 and the sentence was not). `NAMED_MUTATIONS.length` is the count.
 *
 * This array is the REGISTRY, not the implementation: `noshake` is applied by `effectShake.ts`,
 * `stall` by `effectCounts.ts`, `flatcost` by `effectSweep.ts`, `halfoffscreen` by `effectOffscreen.ts` — each beside the thing it breaks,
 * as the three above sit beside the emitters they scale. `namedMutation` makes a typo loud.
 *
 * 🔴 **A name here is not a wired proof.** `particlescale0` sat in this array for a whole gate round
 * while `phase-09-perf.spec.ts` applied it nowhere, so it ran that spec clean and reported
 * `1 passed` — `namedMutation`'s own failure mode, reached through a name it recognises.
 */
export const NAMED_MUTATIONS = ['scale0', 'particlescale0', 'halfoffscreen', 'fleetscale0', 'noshake', 'flatcost', 'stall', 'p95spike'] as const;

export type NamedMutation = (typeof NAMED_MUTATIONS)[number];

/**
 * Recognise `PERF_MUTATION`, and **throw on anything it does not recognise**.
 *
 * 🔴 An unknown value used to fall through both parsers to "no mutation", so `PERF_MUTATION=scale-0`,
 * `Scale0`, `storm 8192` or a stray trailing space ran **clean and reported `2 passed`** — and an
 * operator in a hurry reads that as the proof having been run. A red proof that silently did not run
 * is worse than no red proof, because it comes with evidence.
 *
 * This is also the other half of the "one typo from always-on" question: the fixtures are inert with
 * `PERF_MUTATION` unset, and now a typo is loud rather than inert.
 */
export function namedMutation(mutation: string): NamedMutation | '' {
  if (mutation === '' || stormCount(mutation) > 0) {
    return '';
  }
  if (!(NAMED_MUTATIONS as readonly string[]).includes(mutation)) {
    throw new Error(
      `PERF_MUTATION="${mutation}" is not a mutation this spec knows. Expected one of ` +
        `${NAMED_MUTATIONS.join(', ')}, or storm<N>. Refusing to run clean and report green under a ` +
        'name that looks like a proof.',
    );
  }
  return mutation as NamedMutation;
}
