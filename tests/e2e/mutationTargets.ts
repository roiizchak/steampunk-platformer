/**
 * The mutation → proof-target routing table. Split out of `effectMutation.ts` on 2026-08-24 to keep
 * that file under the 400-line rule (CLAUDE.md §3); it is a **declaration about the specs**, not part
 * of the mutation machinery, so the seam is a real one rather than a convenience.
 */

import type { NamedMutation } from './mutationRegistry';

/**
 * What each mutation is a proof OF — the spec that applies it, and the assertion it must redden.
 *
 * 🔴 **This exists because a name in `NAMED_MUTATIONS` is not a wired proof.** `particlescale0` sat
 * in that array for a whole gate round while `phase-09-perf.spec.ts` applied it nowhere, so the
 * "proof" ran the spec clean and reported `1 passed` — evidence of nothing, wearing the name of
 * evidence. `namedMutation` makes a *typo* loud; it cannot make an *unapplied* mutation loud,
 * because the value it was handed is one it recognises.
 *
 * `tests/unit/perf-mutation-routing.test.ts` asserts every entry here against the real spec sources:
 * the file must exist and must mention the mutation by name. That turns "wired" from a claim in a
 * commit message into something a fast test refuses to let drift.
 *
 * ⚠️ **`assertion` names the bound a mutation is AIMED at, not the only one it can move.** The four
 * upper bounds are algebraically coupled — `delta = on - off` and `perParticle` divides `delta` —
 * so a real cost increase moves all three at once. Which of them reports first was, until 2026-08-24,
 * decided by whichever `expect` came first in one sequential `test()`; that is what `expect.soft`
 * changed. Where a mutation genuinely isolates one bound, the entry says so.
 */
export const MUTATION_TARGETS: Record<NamedMutation, { spec: string; assertion: string }> = {
  scale0: { spec: 'phase-09-draw.spec.ts', assertion: 'the drawn-particle count (9.6) and 9.5 Guard 0' },
  particlescale0: { spec: 'phase-09-draw.spec.ts', assertion: 'the per-particle draw exclusion (9.6)' },
  halfoffscreen: { spec: 'phase-09-draw.spec.ts', assertion: 'the camera-cull half of the count (9.6)' },
  fleetscale0: { spec: 'phase-09-perf.spec.ts', assertion: 'Guard 0b — the enemy fleet is drawn' },
  noshake: { spec: 'phase-09-perf.spec.ts', assertion: 'Guard 0c — a shake is in the sampled window' },
  flatcost: { spec: 'phase-09-perf.spec.ts', assertion: 'Guard 3 — MIN_COST_EXPONENT, the cost law' },
  stall: { spec: 'phase-09-perf.spec.ts', assertion: 'the window-close guard (a PREMISE, not a bound)' },
  p95spike: { spec: 'phase-09-perf.spec.ts', assertion: 'MAX_EFFECT_FRAME_P95_MS — and ONLY it; see installBurstFixture' },
};

/**
 * A **parametric** mutation family — one whose members are generated from a number rather than
 * enumerated, so a `Record<NamedMutation, …>` cannot hold them.
 *
 * 🔴 **Why this shape rather than a second string table.** A parametric family has **no literal name
 * to grep for.** `storm8192` never appears in `phase-09-perf.spec.ts`; the spec reads
 * `stormCount(process.env.PERF_MUTATION ?? '')` into `STORM_MUTATION` and scales the emitters from
 * the number. So the "is it actually wired?" question, which for a named mutation is *"does the spec
 * mention `'flatcost'`?"*, has to become *"does the spec mention the SYMBOL it applies the family
 * through?"* — hence `applies` rather than a name match. Getting this wrong would produce a routing
 * entry that could never match and a gate that reds forever, or one that matches the import line and
 * proves nothing.
 */
export interface ParametricTarget {
  /** The family, for failure messages. */
  family: string;
  /** Matches every member. */
  pattern: RegExp;
  /** A real member — the one actually used as a red proof — so the parser can be shown to accept it. */
  example: string;
  spec: string;
  /** The symbol in `spec` that APPLIES the family. Not the family's name: see the header above. */
  applies: string;
  assertion: string;
}

/**
 * ⚠️ **`storm<N>` was unrouted until 2026-08-25, and it was the worst possible omission to have.**
 *
 * `namedMutation()` returns `''` for any `storm<N>` value — `stormCount()` parses it instead — so the
 * family sat outside `NAMED_MUTATIONS`, outside `MUTATION_TARGETS` and outside
 * `tests/unit/perf-mutation-routing.test.ts` entirely. That matters more than it looks: `storm8192`
 * is the recorded red proof for **two of the four upper bounds** in `phase-09-perf.spec.ts`
 * (`docs/qa/session-phase-09-debts-02-perf.md` §Batch 6). **The two mutations doing the most work in
 * that gate were the two nothing checked were wired** — precisely the `particlescale0` failure the
 * table above exists to prevent, one level up.
 *
 * The previous entry here was `export const STORM_MUTATION_IS_UNROUTED = true`, an honest marker for
 * a gap. Closing the gap means deleting the marker, which is why it was a real exported symbol rather
 * than a comment: a comment can be removed without anything noticing.
 */
export const PARAMETRIC_MUTATION_TARGETS: ParametricTarget[] = [
  {
    family: 'storm<N>',
    pattern: /^storm(\d+)$/,
    example: 'storm8192',
    spec: 'phase-09-perf.spec.ts',
    applies: 'STORM_MUTATION',
    assertion:
      'MAX_EFFECT_FRAME_WORK_MS and MAX_EFFECT_WORK_DELTA_MS — the recorded red proof for two of ' +
      'the four upper bounds. Also licenses Guard 2 (MIN_STORM_WORK_DELTA_MS), the amplifier premise.',
  },
];
