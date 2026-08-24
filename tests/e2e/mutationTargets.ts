/**
 * The mutation → proof-target routing table. Split out of `effectMutation.ts` on 2026-08-24 to keep
 * that file under the 400-line rule (CLAUDE.md §3); it is a **declaration about the specs**, not part
 * of the mutation machinery, so the seam is a real one rather than a convenience.
 */

import type { NamedMutation } from './effectMutation';

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
