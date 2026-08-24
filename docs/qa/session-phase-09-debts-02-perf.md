# Session — Phase 9's debts, part 2: the perf work (§1b, §1a)

Flat sibling of [`session-phase-09-debts.md`](session-phase-09-debts.md), split at 451 lines per
CLAUDE.md §6. Batches 1–5 are in the index file; this one holds the two measurement batches.

---

## Batch 6 — §1b, making the four upper bounds independently reachable

### The decision NOT to split the spec into four tests

Measured first, argued second. `phase-09-perf.spec.ts` runs **94 s** on this machine (`chromium-gpu`,
RTX 4080), and effectively all of it is `walkSweep` (4 points × 5 rounds) plus `walkPairs` (10 pairs,
on and off). Four `test()` arms would each have to re-establish both, because the storm population and
the shake drive are page state — so the split costs ~3× the wall clock and buys nothing the two
changes below do not.

### (a) The premise / bound classification

Every assertion in the test, sorted by what it is FOR. This is the table the spec's inline comment
points at.

| assertion | constant | kind | hard or soft |
|---|---|---|---|
| real-GPU check | — | premise: the measurement is on a GPU at all | **hard** |
| Guard 0 / 0b / 0c | — | premise: the particles, the fleet and the shake are DRAWN | **hard** |
| Guard 1, monotonicity | `CLOCK_GRID_MS` | premise: the statistic orders its own mutation | **hard** |
| Guard 2, storm delta | `MIN_STORM_WORK_DELTA_MS` | **premise: the amplifier amplified** | **hard** |
| Guard 2b, half delta | `MIN_HALF_STORM_WORK_DELTA_MS` | premise: the half point clears the clock grid | **hard** |
| Guard 3, cost law | `MIN_COST_EXPONENT` | premise: the divide-back is licensed | **hard** |
| window close | `WINDOW_STALL_MS` | premise: the window closed at all | **hard** |
| absolute frame work | `MAX_EFFECT_FRAME_WORK_MS` | **bound** | `expect.soft` |
| paired delta | `MAX_EFFECT_WORK_DELTA_MS` | **bound** | `expect.soft` |
| per-particle | `MAX_PER_PARTICLE_WORK_MS` | **bound** | `expect.soft` |
| per-pair p95 | `MAX_EFFECT_FRAME_P95_MS` | **bound** | `expect.soft` |

`grep -c "expect.soft(" tests/e2e/phase-09-perf.spec.ts` = **4**. Exactly the four bounds.

🔴 **`MIN_STORM_WORK_DELTA_MS` stays hard, and the Codex plan review (PR-04) is why it is called out
here.** The first draft of this batch classed it as a bound. It is Guard 2 — the amplifier premise.
Soft-fail it and execution runs on into the `exponent` and `perParticle` assertions whose meaning it
licenses: a delta of noise over 1024, reported as a measurement. **A premise that does not stop the
test is not a premise.**

### (b) What `expect.soft` actually buys — measured, not asserted

⚠️ **Reachability, not independence.** The four bounds are algebraically coupled:
`delta = onWork − offWork`, and `perParticle` divides `delta`. What `expect.soft` removes is the
*ordering artefact* — which bound you hear about was decided by which `expect` was written first.

**The demonstration, `PERF_MUTATION=storm8192`, 2026-08-24:**

```
absolute 4.300 ms (bound 2.5)                                              <- FAILED
median work on 4.300 ms, off 0.500 ms, paired delta 3.7000 ms (bound 0.3)  <- FAILED
per particle 0.00044 ms at 8192 (bound 0.003)                              <- passed
p95 on 6.900/7.500/.../7.600 (bound 16)                                    <- passed
cost exponent k 1.057 (floor 0.9)                                          <- premise held
```

**Two bounds reported red in one run.** Before this change, Playwright stopped at the absolute bound
and the operator was told about one of two. That is the whole property §1b asked for, and it is also
the direct evidence for the coupling claim: one mutation, two bounds.

### (c) The per-bound mutations, and the two that cannot have one

| bound | mutation | verdict |
|---|---|---|
| `MAX_EFFECT_FRAME_WORK_MS` | `storm8192` (already in the file's header) | ✅ reddens it — 4.300 vs 2.5 |
| `MAX_EFFECT_WORK_DELTA_MS` | `storm8192` | ⚠️ reddens it, but **only together with the absolute bound** |
| `MAX_PER_PARTICLE_WORK_MS` | — | ❌ **no isolating mutation exists — recorded, not papered over** |
| `MAX_EFFECT_FRAME_P95_MS` | **`p95spike`** (authored this batch) | ✅ **reddens it and NOTHING else** |

**`p95spike` — the one genuinely independent proof.** `installBurstFixture` (`effectSweep.ts`) burns
20 ms on one frame in ten, gated on `alive > 0` so the OFF arm is untouched. Three of the four bounds
are medians and a cost paid on a tenth of the frames is invisible to them; `workP95Ms` is not a
median, which is exactly why it exists. Watched red 2026-08-24:

```
p95 on 20.500/20.500/20.500/20.600/... (bound 16)  <- FAILED, all ten pairs
absolute 0.500 ms (bound 2.5)                      <- passed
paired delta 0.0000 ms (bound 0.3)                 <- passed
per particle 0.00063 ms at 8192 (bound 0.003)      <- passed
sweep gaps 0.600 / 0.400 / 4.400 ms                <- Guard 1 held
cost exponent k 1.038 (floor 0.9)                  <- Guard 3 held
shaken frames 100.0 % - drawn 8192 - enemies 22    <- Guards 0/0b/0c held
```

Every premise green, one bound red. `20` and `10` are argued at the constants; the total the fixture
adds is ~240 ms per 120-tick window, three orders of magnitude inside `WINDOW_STALL_MS`.

**❌ `MAX_PER_PARTICLE_WORK_MS` has no mutation of its own, and that is a finding.** `perParticle` is
`stormDelta / STORM_ALIVE`, so reddening it needs the 8192-particle delta to reach ~24.6 ms — a
sevenfold real increase in per-particle draw cost. Nothing can produce that without also reddening the
absolute bound and the delta, because both are downstream of the same milliseconds. **Stated rather
than solved:** this bound is reachable but not isolable, its red is never attributable to it alone,
and no amount of re-bounding changes that. The honest reading of a `perParticle` failure is *"cost
went up somewhere"*, and the two bounds above it will say so first.

### (d) The routing prototype — `MUTATION_TARGETS` and its gate

`NAMED_MUTATIONS` is a list of names. **A name is not a wired proof**: `particlescale0` sat in that
array for a whole gate round while `phase-09-perf.spec.ts` applied it nowhere, so the "proof" ran the
spec clean and reported `1 passed`. `namedMutation` makes a *typo* loud; it cannot make an *unapplied*
mutation loud, because the value it was handed is one it recognises.

`tests/e2e/mutationTargets.ts` now declares, per mutation, the spec that applies it and the assertion
it must redden. `tests/unit/perf-mutation-routing.test.ts` asserts that against the real sources.

**Watched red twice, because the predicate changed between them:**

1. Against the first version (spec source only) — a planted `ghostproof` entry gave
   `PASS (4) FAIL (1)`, *"ghostproof: phase-09-perf.spec.ts never mentions it — this is the
   particlescale0 defect"*. Reverted → `PASS (5) FAIL (0)`, and `grep -c ghostproof` 1 → 0.
2. 🔴 **The extraction to `perfMutationSetup.ts` broke it correctly, and the widening then broke it
   silently.** Moving the five `if (MUTATION === …)` blocks out of the spec (the 400-line rule) made
   the spec-only check red on all five — right by its wording, useless in fact. Widening it to *the
   spec plus one level of its `./` imports* fixed that and made it **vacuous**: the spec imports
   `effectMutation.ts`, which is where `NAMED_MUTATIONS` lives, so every name was "mentioned" by the
   array that declares it and the planted `ghostproof` went **green**. Only re-running the red proof
   after changing the predicate caught it. `DECLARERS` now excludes the two registry files, and a
   committed vacuity assertion checks the exclusion is doing work. Re-watched: `PASS (4) FAIL (1)`,
   *"ghostproof: neither phase-09-perf.spec.ts nor anything it imports mentions it"*; reverted →
   `PASS (5) FAIL (0)`.

That is *(C1)* applying to a predicate as well as to a fix: **when the definition of a gate moves, the
old red proof is no longer evidence.**

### (e) The two-test wall-clock figure Batch 7 needs

One `test()` = 94 s, of which `walkSweep` and `walkPairs` are effectively all. A second `test()` that
establishes its own storm arm therefore costs on the order of another 60–90 s, and the module-level
`PERF_MUTATION` selector reaches **both** tests — so any mutation added for Batch 7 must be routed in
`MUTATION_TARGETS` and named per test, or it runs the other one clean.

### Files

| file | change |
|---|---|
| `tests/e2e/effectSweep.ts` | `installBurstFixture`, `SPIKE_COST_MS`, `SPIKE_EVERY` |
| `tests/e2e/effectMutation.ts` | `p95spike` in `NAMED_MUTATIONS`; `MUTATION_TARGETS` split out (400-line rule) |
| `tests/e2e/mutationTargets.ts` | **new** — the routing table |
| `tests/e2e/perfMutationSetup.ts` | **new** — `applyPerfMutation`, the fixture-ordering seam |
| `tests/e2e/phase-09-perf.spec.ts` | four `expect.soft`; the classification comment; 400 → 379 lines |
| `tests/unit/perf-mutation-routing.test.ts` | **new** — the routing gate, 5 tests |

### Baseline

`phase-09-perf.spec.ts` clean, 2026-08-24: **1 passed (1.5m)**, p95 on ~0.7 ms, absolute 0.400,
delta 0.0500, per-particle 0.00044, k 0.949. Unchanged from before the batch.
