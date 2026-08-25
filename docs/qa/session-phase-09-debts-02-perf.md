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

---

## Batch 7 — §1a, the combat path: **the cost bound is RECORDED AS NOT CLOSED**

**Verdict: §1a's headline claim cannot be made on this tree, and the reason was measured rather than
argued.** What shipped instead is the instrument, five probe runs of evidence, and a narrower gate
that asserts only what the measurement supports. *A combat measurement that cannot go red is worse
than the recorded non-closure it replaces* — the plan said so before any of this ran.

### The five probes

| # | change | what came out |
|---|---|---|
| 1 | `brawlArm.startBrawl` (hop only), fleet adjacent, distance-based control | 3 events / 900 ticks, **all `playerHurt`** — no `light`, no `lethal`. A third of the combat path wearing the name of all of it. `startBrawl` never presses attack. |
| 2 | + swing (`L`) + low-hp respawn | 23 events, but the control **collapsed from 2294 frames to 56** and its median rose 0.6 → 1.3 ms. Per-event deltas of 33.5 and 43.2 ms turned out to be the `K` fixture spawning 22 bodies. |
| 3 | phased FIGHT/REST drive, `iFrameCounter` pinned through REST | control restored to 2222 frames. **`spawn frames 0`** — the spawn window was compared against the cycle tick, not the rest-phase tick, and never fired. Seven consecutive `playerHurt` ticks (262-268) shared one 41.9 ms frame as the max of all seven near windows. |
| 4 | spawn window fixed; events clustered at `NEAR_TICKS` | 16 clustered events, control 1980 frames. **`enemyHp 1300 → 364`** — the claw *is* connecting. Max deltas still 22-32 ms. |
| 5 | + per-event MEDIAN delta reported beside the MAX | **`medianOfMedianDeltas` = -0.0000 ms.** |

### The three findings, each measured

**1. 🔴 The shipped emitter caps bound a combat burst at ~85 live particles.** An 8× spark-burst
mutation planted in `src/scenes/gameEffects.ts` (`for (let mut = 0; mut < 8; mut += 1)` around the
`impactSparks` loop) left `alive peak` at **85 — unchanged**. `atLimit()` drops the surplus. **The
combat path cannot be made to cost more from inside the game**, which means no mutation confined to
the arm sites can drive a cost bound red.

**2. 🔴 At 85 particles the cost is below the clock grid, and the statistic moved the WRONG WAY.**
8192 particles cost 4.1 ms on this GPU (`phase-09-perf.spec.ts`, same session), so 85 cost ~0.04 ms —
under `performance.now()`'s 0.1 ms step.

| statistic | clean | under the 8× mutation |
|---|---|---|
| per-event MEDIAN delta | **-0.0000 ms** | **-0.1000 ms** |
| per-event MAX delta (median of) | 3.05 ms | 2.70 ms |

Both went **down** under a mutation that makes the effect eight times larger. That is the project's
own disqualifying condition: *a statistic that does not order its own mutation cannot be fixed by
moving the bound — replace the statistic.* **There is nothing to replace it with.** The only
amplifier available is a storm, and entry 43 is the record of a storm destroying admission ordering.

**3. 🔴 The worst combat frame is 22-39 ms and it is not the burst.** Those spikes are the sim's
post-hit-stop tick catch-up draining through `frameClock`'s `MAX_TICKS_PER_FRAME` — two to three
orders of magnitude above anything 85 particles can cost. A bound on them would be a bound on the
catch-up wearing a burst's name, and it is exactly the shape 6.9's GPU-ratio gate was withdrawn for.

### What DID ship: `tests/e2e/phase-09-combat.spec.ts`

Two tests, **no millisecond bound**, and the header says why in the open. What they assert:

| premise | why it is assertable |
|---|---|
| the recorder returned an array, > 100 frames | type before value |
| ≥ `MIN_EVENTS` (10) landed hits | five probes returned 31-55 raw; 10 is a floor against *"the driver stopped connecting"*, not a fitted bound |
| `lethal` > 0 and `playerHurt` > 0 | both reliably produced across every probe |
| an emitter keyed `'sparks'` exists (`>= 0`) | a rename would otherwise turn the next line into a permanent red that reads like the defect |
| **peak SPARK particles inside a hit's window > 0** | the admission premise |
| control > 100 rest frames | the control did not collapse into the effect |
| aggregate alive > 0 **and drawn > 0** through `willRender` | the drawn half |

⚠️ **Three narrowings, stated rather than implied:**

1. **Two event classes, not three.** `light` — an enemy hit that neither kills nor coincides with the
   player being clawed — measured 0, 0, 0, 2 and 3 across the probes, because a scavenger's claw calls
   `freezePair(player, scavenger, 'playerHurt', …)` and moves BOTH stamps on the same tick.
   Requiring three classes would make the gate flaky for a reason that has nothing to do with the
   game. §1a asked for all three; this delivers two and says so.
2. **The second test is AGGREGATE and it passed the mutation.** It stayed green while test 1 went red,
   because landing dust keeps the three-emitter total above zero. Correct for its own title, recorded
   so nobody reads it as a second combat guard.
3. **One tick is one combat moment.** Simultaneous land-and-take collapses to `playerHurt`.

### The red proof *(C1)*, and why the first draft of it was decoration

Mutation: replace `emit(burst, SPARK_CONE_DEG[impact])` with `void burst` in `gameEffects.ts` — the
impact bursts constructed and then dropped, confined to one of the three arm sites.

```
      peak live particles inside a near window 53 (sparks 0)     <- the SPARK premise FAILED
[1a] raw events 43 (light 0, lethal 14, playerHurt 29)           <- hits still landing
    Expected: > 0   Received: 0
  1 failed, 1 passed
```

🔴 **`peak live particles` was still 53.** The first draft asserted the *three-emitter total*, and
this mutation would have run it **clean** — `combatDrive` hops the player continuously, so landing
dust holds the total above zero with every combat burst dropped. The gate was decoration until the
premise was narrowed to the spark emitter, which only `impactSparks` fills. Found by building the
mutation the claim names rather than the convenient one.

Reverted: `grep -c "void burst"` 1 → 0, `git diff --stat` empty, typecheck clean, **2 passed (38.5s)**.

### Files

| file | what it is |
|---|---|
| `tests/e2e/combatDrive.ts` | **new** — the phased FIGHT/REST driver, 137 lines |
| `tests/e2e/combatFrames.ts` | **new** — the recorder, the event classifier and the reduction, 364 lines |
| `tests/e2e/phase-09-combat.spec.ts` | **new** — the gate, 160 lines, no millisecond bound |
| `tests/e2e/polishSeries.ts` | one stale citation: `tests/e2e/waitFor.spec.ts` → `tests/unit/wait-spec.test.ts` |

### What is still open

**§1a's cost claim.** Closing it needs one of: an amplifier for the combat path that does not go
through the emitter caps; a clock finer than 0.1 ms (`performance.now()` is what the browser gives);
or a decision that the post-hit-stop catch-up spike is the thing worth bounding, which is a different
criterion and would need its own approval. **None of those is a re-bounding of what is here.**
