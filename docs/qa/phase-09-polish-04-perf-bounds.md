[← Phase 9 QA log index](phase-09-polish.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-09-polish.md)

---

## 9.5 — the bound-confirmation run sets

Written here because `effectBudget.ts` cites this heading, and because a docstring that cites
evidence which does not exist is worse than one that cites nothing *(C9, finding M3)*.

**There is no selection set for the three ceilings.** `MAX_EFFECT_FRAME_WORK_MS = 2.5`,
`MAX_EFFECT_WORK_DELTA_MS = 0.3` and `MAX_PER_PARTICLE_WORK_MS = 0.003` are derived from the frame
budget (16.67 / 6; 0.003 × 96 rounded up; 16.67 × 2 % / 96 rounded down) and no run had a say in any
of them. What follows is **confirmation only**, and the two sets are disjoint in time, in tree state
and in author.

### Set A — the gate round, 8 runs, `performance-engineer`, 2026-08-21

Taken after that round's sweep design was frozen, with no say in it. **8 / 8 green**, zero inversions
in 80 per-round observations (0→1024: +38 / −0 / =2; 1024→2048: +40 / −0 / =0).

| quantity | held-out range | bound | margin |
|---|---|---|---|
| half gap `d(0→1024)` | 0.40 – 0.70 ms | ≥ 0.2 | 2 – 3.5× |
| storm gap `d(0→2048)` | 0.90 – 1.50 ms | ≥ 0.2 | 4.5 – 7.5× |
| linearity spread | 1.0 – 1.4× | < 4 | ≥ 2.9× |
| per particle | ~0.0005 ms | ≤ 0.003 | ~6× |
| absolute `onWork` | 0.55 – 0.70 ms | ≤ 2.5 | ~3.6× |

### Set B — the fix round, 10 runs, task 11, 2026-08-22

Taken on the byte-frozen tree **after** every change in this section landed, including the shake now
being in every window. `MIN_SHAKEN_FRAME_FRACTION = 0.5` was fixed from the statistic before any of
these ran and none of them had a vote in it either.

**10 / 10 green**, 80–81 s each, `drawn 2048/2048/2048/2048/2048` at the top sweep point on every
round of every run, and the sweep ordered on every gap of all ten.

| quantity | held-out range | bound | margin |
|---|---|---|---|
| half gap `d(0→1024)` | 0.399 – 0.604 ms | ≥ 0.2 | 2.0 – 3.0× |
| storm gap `d(0→2048)` | 1.004 – 1.290 ms | ≥ 0.2 | 5.0 – 6.5× |
| linearity spread | 1.000 – 1.256× | < 4 | ≥ 3.2× |
| per particle | 0.00049 – 0.00063 ms | ≤ 0.003 | ≥ 4.8× |
| absolute `onWork` | 0.600 – 0.750 ms | ≤ 2.5 | 3.3 – 4.2× |
| paired delta at the shipped peak | 0.000 – 0.100 ms | ≤ 0.3 | ≥ 3× |
| `workP95Ms`, every ON window | 0.800 – 3.300 ms (n = 100) | ≤ 16 | ≥ 4.8× |
| **shaken frames** | **100.0 % of every one of 350 windows** | ≥ 50 % | 2× |

Two things worth reading off that table rather than only the margins. The **shaken-frame fraction is
100.0 % on all 350 windows with no spread at all** — which is what a 2-tick landing cycle against a
3-tick shake predicts, so the mechanism is doing what its arithmetic says and not something
approximate that happens to clear a floor. And the **absolute and per-particle figures land inside
set A's ranges** (0.55–0.70 ms and ~0.0005 ms) despite every window now carrying a shake set A's did
not, which is the measurement backing the claim in entry 44 that a shake's cost is under this clock's
grid.

### The fix round's mutation proofs — every new gate watched failing

One at a time, alone on the box, `npm run test:e2e -- --project=chromium-gpu -g "the worst case …"`.
Redness read **positively** from `1 failed` plus the named assertion text — never from an exit code,
never through a pipe. The three inherited proofs were **re-run** rather than assumed, because the
harness they run through changed.

| # | Mutation | Where | Result |
|---|---|---|---|
| 1 | `PERF_MUTATION=noshake` — the shake drive installed but not hopping | harness | **FAIL (1)** — *"sweep N=0, round 0: 0.0 % of this window's frames had the camera off its base"* |
| 2 | `camera.setPosition(baseX + x, baseY + y)` → `camera.setPosition(baseX, baseY)` | `src/scenes/gameEffects.ts` | **FAIL (1)** — same assertion, 0.0 %. The SHIPPED-code version of #1, and the one Guard 0c actually names |
| 3 | `PERF_MUTATION=stall` — `scene.scene.pause()` | harness | **FAIL (1)** in **60 s** — *"the 120-tick window did not close … 0 sim ticks and 121 animation frames"*. Unbounded, this is the 600 s hang |
| 4 | `PERF_MUTATION=scale0` (re-run) | harness | **FAIL (1)** — *"pair 0: the effects-on window drew no particles"* |
| 5 | `PERF_MUTATION=fleetscale0` (re-run) | harness | **FAIL (1)** — *"only 0 of 22 enemy bodies were drawn while this window ran"* |
| 6 | `PERF_MUTATION=storm8192` (re-run) | harness | **FAIL (1)** — *"the worst case — 20 enemies and 8192 particles — left the frame budget"*, `absolute 6.550 ms` |

Mutation 2 is the one worth reading twice. `noshake` proves the *guard* can see an absent shake;
mutation 2 proves it sees a **shipped shake that stopped working**, which is the failure the
assertion's sentence claims to cover. Reverted with `git checkout --` and verified per C12:
`grep -c "camera.setPosition(baseX + x, baseY + y);"` back to **1** (it was **0** under the
mutation), `grep -c "SCRATCH MUTATION"` **0**, `git status --short` showing only the intended files.

Asking the standing question of Guard 0c — *if the thing under test did nothing at all, would this
still pass?* — the answer is no, and the reason is mechanical: `applyShake` is the **only** writer of
`camera.x` / `camera.y` anywhere in `src/` (`grep -rn "camera.setPosition\|\.main\.x =" src/` returns
one call site), and the guard compares against `EffectAttachment.base()` rather than against a zero
it read for itself. The camera follow moves `scrollX`/`scrollY` and cannot satisfy it.

### The gate round's findings — every one applied or recorded

| # | Finding | Disposition |
|---|---|---|
| **C1** | the sweep statistic cannot order itself | **APPLIED** before this round — merged as `f829914`; re-confirmed green 10 / 10 in the baseline set and 10 / 10 in set B |
| **M1** | `MIN_HALF_STORM_WORK_DELTA_MS` was a second false red hiding behind the first | **APPLIED** in `f829914` (`halfN` is 1024); confirmed again here — the half gap never approached 0.2 in 20 runs |
| **M2** | 9.5 names shake and the frame carries none, undisclosed | **APPLIED** — the shake is measured (problem 1 above), Guard 0c enforces it, and 9.8 entries 43–45 state what is still narrowed |
| **M3** | two bounds cite run sets not in this log | **APPLIED** — both citations corrected in `effectBudget.ts`, both confirmation sets written up above; the unrecoverable "selection set" figures withdrawn rather than re-cited |
| **M4** | the divide-back's stated licence rests on a claim false on this tree | **APPLIED** — the *"orders monotonically across nine walks"* parenthesis corrected to the per-round evidence in §*"the measurement floor"*; the divide-back is **not** withdrawn, and the brief's reasoning for keeping it is recorded there |
| **N1** | G.7b: 1 failure in 8, GPU arm does not order at all | **RECORDED** — inherited Phase 8 criterion, out of this diff; the numbers are in §*"G.7b"* and the missing half-amplification floor is named there |
| **N2** | criterion 5.11 takes one window per arm | **RECORDED** — inherited Phase 5 criterion; the finding is file evidence (marked INFERRED by its author) and sits in §*"Criterion 5.11"* |
| **N3** | the sweep is mildly superlinear and the log's figure is stale | **APPLIED** — §*"the measurement floor"* now records 1.0–1.4× and states that superlinearity makes the reported ~0.06 ms an upper bound |
| **N4** | the shipped-peak paired delta comes back negative routinely | **RECORDED** — correct behaviour (`MAX_EFFECT_WORK_DELTA_MS` is a ceiling) and already disclosed at `effectBudget.ts`; seen again here, `-0.000` in the fix round's own runs |
| **nit** | the per-particle figure is machine-state dependent to a degree the docs do not admit | **RECORDED** — set B read 0.00049–0.00054 ms at 2048 where the old sweep read ~0.0012 at 1024 on the same box; the printed figure is a reading of this harness on this run, which is what `MAX_PER_PARTICLE_WORK_MS`'s 6× headroom absorbs |
| **9.6** | PASS, checklist verified item by item | no action |

The gate round's project-wide generalisation — *the failing shape is **reducing each arm to one
unpaired median and then subtracting or dividing**, with a quiet denominator as an aggravator rather
than the cause* — is **accepted and not re-argued here**. It is the right correction to the
"GPU ratios are suspect" version, and the evidence is that 9.5's own Guard 1 had the identical defect
with no ratio and no denominator anywhere in it.

---

## Criterion 5.11 red once in seven, and it is the third GPU-ratio gate to do this

`tests/e2e/phase-05-perf.spec.ts:111` failed once during Phase 9's verification, reporting a GPU ratio
of **7.53×** against `MAX_GPU_RATIO < 5`. It was not attributed until it had been sampled, because
this session had already made that mistake once with G.7b.

| run | baseline GPU median | fleet GPU median | ratio | result |
|---|---|---|---|---|
| in the full GPU project | **0.035 ms** | 0.262 ms | **7.53×** | **fail** |
| alone ×4 | 0.161 / 0.198 / 0.199 / 0.200 ms | 0.333 / 0.322 / 0.358 / 0.355 ms | 2.07 / 1.63 / 1.80 / 1.78× | pass |
| full GPU project, re-run | 0.170 ms | 0.342 ms | 2.01× | pass |

**One failure in seven, and read the denominator.** The fleet arm barely moved (0.262 against
0.322–0.358 — if anything *lower* on the failing run). What collapsed was the **baseline**, from a
steady ~0.17–0.20 ms down to 0.035 ms, a fifth of every other reading. The ratio did not rise because
the fleet got expensive; it rose because the thing it divides by fell into the noise.

**Not a Phase 9 regression.** Phase 9's own two gates passed in the same failing run, and the whole
57-test GPU project passed on re-run.

### The pattern is now three for three

Every GPU-**ratio** gate this project has built has eventually proven noise-dominated:

| gate | fate |
|---|---|
| criterion **6.9**'s GPU ratio | **discarded** 2026-08-19 — ranked five full-screen scrims below a clean run |
| **G.7b** (`phase-08-gate-perf.spec.ts:264`) | **flaky**, ~3 failures in 7 — its own premise check refuses to emit a number |
| criterion **5.11**'s GPU ratio | 1 failure in 7, denominator collapse |

The common shape: **a ratio of two sub-millisecond GPU medians, where the denominator is a quiet
baseline sitting near the timer's resolution.** A quiet baseline is exactly the measurement most
vulnerable to quantisation, and putting it under the division line makes the whole statistic inherit
that vulnerability. The numerator being well-behaved does not save it.

Phase 9's own budget gate deliberately does **not** take this shape — it asserts an amplified absolute
delta and a monotone sweep, and it proves the amplifier amplifies before dividing back. That is the
distinction to carry forward: **amplify and check the amplification, rather than divide by a quiet
control.**

**Recorded, not fixed.** 5.11 is Phase 5's criterion and repairing it is out of Phase 9's scope. It
belongs with G.7b in whatever session takes the perf-gate family on, and the two should be fixed
together, because the diagnosis is the same one.

---

## The 9.5 fix round #2 — the guard that licensed the divide-back could not fire

Criterion 9.5 was FAILED a second time by the adversarial `voltagent-qa-sec:performance-engineer`
brief (2 high, 5 medium, 4 low, 26 bounded runs). Its headline finding is the phase's house-style
defect landing in the one place 9.5's reported number depends on it.

### H1 — `MAX_LINEARITY_SPREAD` passed for every cost law from O(1) to O(N^2.99)

`MAX_LINEARITY_SPREAD = 4` was applied to two per-particle estimates taken at `SWEEP_ALIVE`'s top two
points — an amplification ratio of exactly **2x**. Write the cost law as `c·N^k`. Per-particle cost is
then `c·N^(k-1)`, two estimates a ratio `R` apart sit `R^|k-1|` apart, and

```
spread < 4   at R = 2   ⟺   |k - 1| < 2   ⟺   -1 < k < 3
```

So the guard could only fire for a cost law of `N^3` or steeper. **A cost completely independent of
the particle count — the exact case its own failure message described** (*"the cost does not scale
with the count, so dividing by it is not a per-particle figure"*) — lands at `spread = 2.0` and reads
as healthy. The clean spreads of 1.0–1.3 reported as evidence of linearity are `2^0.0` to `2^0.4`;
every value up to `2^2` would have looked identical.

Two docstrings (`effectBudget.ts` at the per-particle constant, and the spec's stated-limits block)
cited that guard as *"legal only while linear, and the spec asserts the linearity"*. The spec asserted
no such thing. Same shape as the covering gate that did not exist, disclosed in one docstring and
reproduced two docstrings later.

And the sweep is measurably **not** linear: the brief fitted `k ≈ 1.10–1.36` on five runs and 1.18
over 1024→8192, never 1.0. The dangerous region (`k < 1`, where the divide-back *understates* the
shipped cost) sat entirely inside the pass region.

### The ruling — replace the statistic, do not move the bound

Tightening 4 to a smaller number would be moving a bound on a derived quantity chosen to make the
arithmetic come out — the same error one layer along. What the divide-back actually depends on is
measured instead.

**The replacement statistic: the cost exponent `k` itself**, fitted from two sweep deltas
(`effectSweep.ts:costExponent`):

```
k = ln( sweepDelta(0, 8192) / sweepDelta(0, 1024) ) / ln(8192 / 1024)
```

**The band, and why it is a floor with no ceiling.** Per-particle cost is `c·N^(k-1)`, so dividing an
8192-particle delta back to the shipped 96 **over**-states the shipped figure at `k > 1` (safe) and
**under**-states it at `k < 1` (unsafe). That asymmetry is the whole band:

| bound | value | status |
|---|---|---|
| `MIN_COST_EXPONENT` | **0.9** | load-bearing — the divide-back is conservative only above 1 |
| ceiling | **none** | deliberate; see below |

`MIN_COST_EXPONENT` is derived from the claim plus the clock, and **no run had a vote in it** — it was
fixed before the first run of the new gate. The claim is `k ≥ 1`. One adverse `CLOCK_GRID_MS` step on
the low delta (~0.5–0.7 ms) is worth `ln(1 + 0.1/0.6)/ln(8)` ≈ **0.07–0.09** of `k`; the same step on
the high delta (~6 ms) is worth 0.008 and does not matter. 0.1 of `k` is therefore about one clock
step, and 0.9 is sized to survive the **same three-step adverse move of a median** that
`MIN_STORM_WORK_DELTA_MS` and `MIN_HALF_STORM_WORK_DELTA_MS` are set for. ~~The cost of the allowance
is bounded rather than waved away: at the floor exactly, the divide-back under-states by
`(8192/96)^0.1` = **1.5x**, against a `MAX_PER_PARTICLE_WORK_MS` sitting ~4x above the reading.~~
**CORRECTED 2026-08-22 — see entry 47.** That sentence is true only if the cost law really is
`c·N^k`. It was stated unconditionally, and it is the model-dependent half of the argument.

**There is no ceiling, and that is a decision.** Super-linearity makes the divide-back *pessimistic*,
which is the safe direction, and it is already gated — an exponent large enough to matter inflates
`perParticle` into `MAX_PER_PARTICLE_WORK_MS`, which fails. A ceiling would also be **decoration under
C2**: to drive `k` to 1.5 on this harness a fixture must add ~11 ms to the 8192 frame, and a frame
that expensive serves fewer animation frames than the window has sim ticks, so `sampleArm`'s *"the
machine did not keep up with the simulation"* precondition fires first. **No fixture can watch a
ceiling here go red**, so none ships. This is a deliberate deviation from the brief's suggestion that
a ceiling be added as a sanity check, and the reason is written here rather than left implicit.

### The instrument had to widen too — `SWEEP_ALIVE` is now `[0, 1024, 2048, 8192]`

`k` inherits the same arithmetic the old spread had: at a 2x span one clock step on the low delta is
worth `ln(1.2)/ln(2)` = **0.26** of `k`, which is a third of the whole band. Over the 8x span from
`HALF_ALIVE` to `STORM_ALIVE` it is **0.07–0.09**. This is the move `SWEEP_ALIVE`'s own history
already licensed — *"the N values have to separate instead, which is a change of instrument, not of
bound"*. 2048 stays as an ordering point for Guard 1. Cost: five more windows a run, ~10 s a round.

`STORM_ALIVE` is 8192 now, so the divide-back is taken from the *top* of the sweep — at `k > 1` the
higher the amplification the more the reported figure over-states the shipped one, which is the safe
direction. `HALF_ALIVE` is a **named** constant (`SWEEP_ALIVE[1]`) rather than `SWEEP_ALIVE[len-2]`:
that index is what silently drifted the half point from 512 to 1024 while its docstring went on
arguing 512, and a fourth sweep point would have drifted it again — to 2048, *away* from the shipped
96 instead of towards it.

### The selection set — three runs that had a say in nothing, but were looked at first

Clean, `chromium-gpu`, alone on the box, one run at a time, each read out of a redirected file.

| run | `d(0→1024)` | `d(0→8192)` | **k** | per particle @8192 | absolute | result |
|---|---|---|---|---|---|---|
| S1 | 0.700 | 6.900 | **1.100** | 0.00084 | 0.750 | `1 passed` of 1 |
| S2 | 0.700 | 7.100 | **1.114** | 0.00087 | 1.000 | `1 passed` of 1 |
| S3 | 0.700 | 6.700 | **1.086** | 0.00082 | 0.900 | `1 passed` of 1 |

### The HELD-OUT set — three runs with no say in any bound, reported separately

| run | `d(0→1024)` | `d(0→8192)` | **k** | per particle @8192 | absolute | result |
|---|---|---|---|---|---|---|
| H1 | 0.700 | 6.900 | **1.100** | 0.00084 | 0.950 | `1 passed` of 1 |
| H2 | 0.500 | 6.400 | **1.226** | 0.00078 | 0.800 | `1 passed` of 1 |
| H3 | 0.400 | 5.800 | **1.286** | 0.00071 | 0.950 | `1 passed` of 1 |

A seventh clean sweep rode inside the `storm8192` mutation run: **k = 1.086** from 0.700 / 6.700.

An **eighth**, from the full-suite run that closed the Codex implementation round (2026-08-22,
`119 passed` in 16.0m): **k = 1.057** from 0.400 ms at 1024 and 3.600 ms at 8192, `per particle
0.00044` (bound 0.003), `absolute 0.700` (bound 2.5). Still above 1 — which is the reading entry 47
turns on, because an affine cost law cannot produce it.

**Measured `k` over all seven: 1.086 – 1.286, never below 1.** The floor at 0.9 is cleared by
0.19–0.39, which is 3–4 clock steps of adverse movement on the low delta — the low delta would have
to read ~1.1 ms against an observed range of 0.400–0.700. `shaken frames 100.0–100.0 %` on all 280
windows; sweep ordered on every gap of every round of every run.

### Every gate watched failing — the mutation each assertion NAMES

| # | mutation | red? | verbatim |
|---|---|---|---|
| 1 | **`PERF_MUTATION=flatcost`** — a per-frame busy-wait of 1.5 ms whenever the storm is non-empty | **FAIL (1 of 1)** | *"the cost grows as N^0.629 between 1024 particles (2.000 ms) and 8192 (7.400 ms). Below N^1 the per-particle cost FALLS as the count rises…"* |
| 2 | `PERF_MUTATION=particlescale0`, now WIRED into this spec | **FAIL (1 of 1)** | *"pair 0: the effects-on window drew no particles"*, `drawn 0/0/0/0/0` at every sweep point |
| 3 | `PERF_MUTATION=noshake`, against the RAISED floor | **FAIL (1 of 1)** | *"sweep N=0, round 0: 0.0 % of this window's frames had the camera off its base … The fixture predicts 100 %; under 90 % …"* |
| 4 | `PERF_MUTATION=storm8192`, against the WIDENED sweep | **FAIL (1 of 1)** | *"the worst case — 20 enemies and 8192 particles — left the frame budget"*, `absolute 7.400 ms` |
| 5 | scratch: `installStorm`'s emit point → `view.x - 4000` | **FAIL (1 of 3)** in `phase-09-draw.spec.ts` | *"only 0 of the 96 submitted particles were inside the camera's world view"* |

**Mutation 1 is the one worth reading twice.** Every other guard passed on it — `drawn` 1024 / 2048 /
8192 at every sweep point, the ordering check, both premise floors, `absolute 2.450 ≤ 2.5`,
`per particle 0.00090 ≤ 0.003` — and only the exponent fired. **And the guard it replaces PASSES this
fixture**: `perParticle` 0.000903 against `perParticleHalf` 0.001221 is a spread of **1.35**, against
a bound of 4, at the old 2x ratio *and* at the widened one. That is the proof that the defect was the
statistic and not the ratio, rather than an argument for it.

Mutation 5 was a scratch edit, reverted with `git checkout --` and verified per **C12**: content
changed, then `grep -c "const x = view.x + view.width / 2;"` back to **1** (it was **0** under the
mutation) and `grep -c "SCRATCH MUTATION"` **0**. 🔴 That revert also discarded the round's own
uncommitted edits to `effectMutation.ts`, which had to be re-applied and re-typechecked — `git
checkout -- <file>` does not distinguish a scratch mutation from the work beside it.

`scale0`, `fleetscale0` and `stall` were **not** re-run: their code paths are untouched by this diff
and each is recorded failing in the gate round's proof table above. Recorded rather than re-proved.

### Every finding from the brief — applied or recorded

| # | finding | disposition |
|---|---|---|
| **H1** | the linearity guard cannot fire below `k = 3`, and the sweep is not linear | **APPLIED** — statistic replaced with the cost exponent, sweep widened to 8x, band derived and confirmed on a held-out set; both docstrings that claimed the spec asserted linearity corrected |
| **H2** | `particlescale0` runs the 9.5 spec clean and reports `1 passed` | **APPLIED** — wired into `phase-09-perf.spec.ts` **before** `setStorm` builds the population (a constant scale op is emit-only), watched failing, and `NAMED_MUTATIONS` now says in its own docstring that a registered name is not a wired proof |
| **M1** | Guard 2's docstring claims a draw premise it does not have — `scale0` passes it | **APPLIED** — docstring corrected to say it is a RESOLUTION premise, that `preUpdate` keeps ~half the per-particle cost alive under `scale0`, and that Guard 0 is the draw premise a future edit must not weaken |
| **M2** | `MIN_SHAKEN_FRAME_FRACTION = 0.5` is the boundary value of the nearest retune | **APPLIED** — raised to **0.9**, derived from the fixture's predicted 1.0 rather than placed on `land.durationTicks: 3 → 1`'s exact 50 %; re-watched failing under `noshake`; 280 held-out windows read 100.0 % |
| **M3** | the header claims Guard 0/0b re-take three of 9.6's checks, and they re-take one | **APPLIED** — header corrected to name the one, and the `inCameraList` gap marked **INFERRED** (it is inferred to red through the premise floor; it was not watched, and inferred is written down as inferred) |
| **M4** | the absolute bound's docstring names the level, the HUD and the player sprite, and nothing verifies any of them | **APPLIED as a disclosure** — `effectBudget.ts` now states which three loads are asserted and which three are not, that all three make the bound EASIER when absent, and that it is the one bound in the file they can move; added as §9.8 entry 46. **Not closed**: closing it means a fourth counter and a fourth mutation for loads no phase criterion names |
| **M5** | four docstring/code disagreements, all describing sweep points that no longer exist | **APPLIED** — all four corrected. The one that mattered (`MIN_HALF_STORM_WORK_DELTA_MS` justified from a 512 distribution while guarding 1024) is fixed structurally as well as in prose: `HALF_ALIVE` is a named constant now, so the index cannot drift the point again |
| **L1** | `expect(on.inView, 'every submitted particle was outside the camera').toBeGreaterThan(0)` names a failure it cannot detect | **APPLIED** — now a count (`>= MIN_DRAWN_AT_PEAK`) with a message that reads out both numbers; watched failing under mutation 5. Its *distinguishing* range is now proved too — round #3's `PERF_MUTATION=halfoffscreen` reads `drawn 96 inView 48`, red at `Expected >= 64` and GREEN under the restored `> 0` |
| **L2** | effective sensitivity: 4–5x headroom on three bounds, nothing between a 0.9 ms frame and a dropped one | **RECORDED** — every one of them is derived from a claim rather than fitted, and tightening a derived bound toward today's observation is the move this repo forbids; the headroom is the price of that and the readings are printed on every run |
| **L3** | *"the whole shipped feature costs roughly 0.06 ms"* is over-stated ~1.9x | **APPLIED** — withdrawn rather than restated. It multiplied a divided-back figure by 96, which at `k > 1` over-states; over-statement is right for a ceiling and wrong for a reported measurement. `MAX_EFFECT_WORK_DELTA_MS`'s own readings (0.000 or 0.100 ms per pair) are cited instead |
| **L4** | the shake fixture puts the player in a 30-landings-per-second cycle and entry 44 does not say so | **APPLIED** — added to entry 44 below |
| **G.7b / 5.11** | both reduce `Sample.gpuMedianMs` to a ratio of two such medians | **RECORDED, not repaired** — out of scope by instruction; brief B's diagnosis is written up below |

### The two §9.8 entries this round wrote

Both live with their siblings in §*"Added by the 9.5 fix round"* above, not here, so a narrowing has
one home: **new entry 46** (M4 — the level, the HUD and the player sprite are in the frame and
nothing verifies it) and an **addendum to entry 44** (L4 — the shake fixture's 30-landings-a-second
cadence).

### G.7b and criterion 5.11 — brief B's diagnosis, recorded and NOT repaired

Both are inherited criteria (Phase 8 and Phase 5) and out of scope for this diff. Recorded here
because the diagnosis is sharper than the one already above.

**The shape they share, in one sentence:** both take `Sample.gpuMedianMs` — an
`EXT_disjoint_timer_query` median whose run-to-run spread on this machine is comparable to or larger
than the effect being resolved — and both then reduce it to a **ratio of two such medians**, so the
noise enters twice and multiplicatively.

**G.7b: 3 failures in 8 interleaved runs, all three on the linearity spread, none on the premise.**
The 1-exit control spans **0.139–0.220 ms (±0.081)**. The effect the *half* amplification must resolve
is `20 × ~0.003` = **0.06 ms** — smaller than the control's own run-to-run spread. The *full*
amplification's `40 × ~0.003` = 0.19 ms separated on **8 of 8** (min margin 0.072 ms). So: at 40
copies the GPU arm resolves, at 20 it does not, and `perExitGpuHalf` floors to 0 whenever the half arm
lands under the control (2 of 8 runs), putting the spread at an epsilon-divided infinity. Worse, **the
CPU arm does not order on any of the 8 runs** — `1/21/41 exits` read `0.600/0.600/0.600`,
`0.500/0.500/0.500`, `0.600/0.600/0.600` — and on 4 of 8 `perExitWork` was exactly 0.0000, floored, so
`MAX_EXIT_WORK_MS = 0.05` passed because the value came back rather than because it was measured.

**And G.7b's bound is the same constant as H1's**, `MAX_LINEARITY_SPREAD = 4` over the same 2x ratio
(`HALF_COPIES = 20`, `MUTATION_COPIES = 40`) — the identical structural defect in two gates pointing
in opposite directions: in G.7b the half point cannot clear the noise so it **false-reds**; in 9.5 the
ratio was too small to order any cost law below `N^3` so it **false-greened**. A 2x amplification
ratio cannot support a linearity inference in either direction. Whoever takes G.7b on should read
`effectSweep.ts` first: 9.5's answer was to widen the ratio and replace the derived statistic, and the
same two moves apply.

**Criterion 5.11: 20 of 20 green across brief B's runs — its failure did not reproduce, but its cause
did.** `gpuMedianMs` for the same scene, back to back:

| run | baseline GPU | fleet GPU | ratio (bound < 5) |
|---|---|---|---|
| F03 | 0.210 | 0.383 | 1.82x |
| **F05** | 0.220 | **0.050** | **0.23x** |
| **F06** | 0.232 | **0.050** | **0.22x** |
| **F08** | **0.046** | 0.169 | **3.67x** |
| F10 | 0.136 | 0.135 | 0.99x |

Adding twenty on-screen enemies made the GPU **four times cheaper** twice, cost nothing once, and cost
3.67x once. The control alone spans 0.046–0.232 — a **5x swing in the denominator**, and F08 is one
adverse control draw from `MAX_GPU_RATIO = 5`. `gpuTimer.ts:46-56` already records this failure in an
earlier form (a bimodal baseline, 13x, supposedly fixed by moving to the `prerender`/`postrender`
bracket); the bimodality is smaller now and still larger than everything either gate measures.
Neither is repairable by moving a threshold.

### The standing question, asked of the new guard

*If the thing under test did nothing at all, would this still pass?* No, and the reason is mechanical
rather than argued: the exponent is computed from two deltas that Guards 2 and 2b have already floored
above the clock grid, and the one build where "the thing under test does nothing" — a frame whose cost
is independent of the particle count — is committed as `PERF_MUTATION=flatcost` and was watched
producing `k = 0.629` against a floor of 0.9, with every other assertion in the file green.

**This is the fourth rewrite of these perf gates, and each previous one produced the next defect.**
The one this round could not close is L1's distinguishing range, named above rather than left for the
fifth round to find — and closed by round #3 below.

