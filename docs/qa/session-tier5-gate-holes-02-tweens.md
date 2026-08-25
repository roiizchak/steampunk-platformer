# Session — Tier 5 and the gate holes, part 2: the tween boundary

Flat sibling of [session-tier5-gate-holes.md](session-tier5-gate-holes.md), split at 359 lines per CLAUDE.md §6. Batches 1–3 and the recon findings are in the index file.

---

## Batch 4 — §2b, D14: `this.add.tween(config)`, the entry point six rules could not see

`add.tween(config)` is a real Phaser 4.2.1 API — a factory at `phaser.d.ts:26869` and a creator at
`:28201` — that opens a tween with the identifier `tweens` appearing **nowhere in the expression**.
Every tween rule in the project keyed on that identifier.

| rule | where it keyed on `tweens` | closed by |
|---|---|---|
| 9.3b — handle held individually | `TWEENS_ADD` regex | a second alternative |
| 9.3c — a file that opens a tween must stop one | `code.includes('tweens.add')` | new `OPENS_A_TWEEN` |
| **9.3d — parser arm** | `TWEEN_METHODS` lacked `tween` | `namesSceneFactory` |
| 9.2 / 9.2b / 9.2c — callback rules | `TWEEN_CALLS` regex | a second alternative |

⚠️ **The gate log's list was one short, and it is corrected here.**
`session-phase-09-debts-03-gate.md:64` names 9.3b, 9.2, 9.2b, 9.2c and **omits 9.3d**, which is
genuinely bypassed — `isTweenCall` rejected on the method name *before* it ever reached the object
test. `SESSION-PROMPT-next.md:66` had it right. **Six rules, not five.**

### The recorded blocker was smaller than it looked

D14 was carried as *"closing it means resolving what `add` is bound to, a different machine from a
pattern."* It is the same machine. **`tween` is unique to the factory and creator** — `TweenManager`
has no `.tween()` — so the method name alone selects the entry point, and `namesTweenManager` was
already an alias-resolving name test. The change is ~15 lines across four files; the cost was the
fixtures, exactly as predicted.

### The asymmetry that keeps this from being a widening

`namesTweenManager` matches a **bare** `tweens` identifier. `namesSceneFactory` deliberately does
**not** match a bare `add` — it requires a member access (`this.add`, `scene.add`) while still
resolving an alias bound to one.

🔴 **That constraint is the Codex plan review's, and it is the difference between closing a bypass and
widening a rule.** `add` is an ordinary English word; an unrelated object exposing a `tween` method is
not Phaser's factory, and reddening it would strengthen the rule onto code it was never about. Two
acceptance fixtures pin it — one against the parser arm, one against the regex arm.

**This is a bypass closure, not a rule change.** The rule (9.2/9.3) is unchanged; what changed is that
a documented way *around* it no longer exists. Contrast §2a, where growing the enforcement set really
would broaden what the rule reaches — which is why that one needed the owner's ruling.

### Where it lives

The D14 pin test moved out of `tween-boundary.test.ts` into a new sibling,
**`tests/unit/tween-add-factory.test.ts`** (109 lines, 4 tests). That file was at **380/400** and the
fixture family would have burst it — the extraction the plan named, done as part of the work rather
than discovered at the end.

The old test *pinned the absence* and asserted `unbound('this.add.tween(…)') === 0` — i.e. it asserted
**the rule could not see it**. That assertion is now inverted; the absence check is kept but demoted to
informational, because it is no longer what carries the criterion.

### The red proofs *(C1)*

**Parser arm.** Replaced `if (method === 'tween') return namesSceneFactory(...)` with a comment
(`namesSceneFactory` refs 3 → 2):

```
PASS (2) FAIL (2)
  the parser arm SEES `this.add.tween({ onComplete })` — expected +0 to be 1
  an ALIAS of the factory is resolved — expected +0 to be 1
```

The acceptance fixture stayed green throughout, which is correct: it must never red from this
mutation. Restored by editing the line back — **not** `git checkout`, which would also have reverted
the real fix.

**Regex arm.** Removed the `.add.tween` alternative from `TWEENS_ADD`:

```
PASS (17) FAIL (1)
  9.3b — REJECTS the other FOUR tween-opening methods — expected +0 to be 1
```

Restored; 43 passing across the four tween files.

### Verification

typecheck clean. Unit **166 files / 2476 tests** against 165 / 2473: **+1 file, +3 tests** — four new
minus the retired D14 pin. Asserted, not assumed.

⚠️ **`tweenCallbacks.ts` is now at 390/400.** §2a adds identity resolution and a completeness gate to
that same file, so the `tweenIdentity.ts` extraction the plan named is **not optional and must happen
first**.

---

## Batch 5 — §2a, `SIM_MUTATORS`: identity first, then 6 names to 32

**The rule was not "a future export will be invisible". It was already 81 % incomplete.**

Measured with the project's own parser over `src/sim/`:

| | count |
|---|---|
| exported functions | **86** |
| write to one of their own parameters | **26** |
| transitive closure (pass an own param to a known mutator) | **32** |
| listed in `SIM_MUTATORS` | **6** |

`tick(world, input)` — the most obviously param-mutating function in the simulation — was **not one of
the six**.

### Stage 1, and why it had to come first: identity, not collision

`SIM_MUTATORS` is a set of bare identifiers matched against a callee name. Growing it to 32 ordinary
verbs — `tick`, `advance`, `enterState`, `resolveState` — would make **any local helper sharing a
name** illegal. That is enforcement by name collision, structurally broader than the authorised rule
(*"a sim object passed to a `src/sim/` mutator"*), and it is the same shape as the widening a
2026-08-25 repair slipped past review once already.

So `simImports(ast)` now resolves the callee to an actual `src/sim/` import before the rule fires —
alias-aware (`import { damagePlayer as hurt }` records `hurt`) and type-import-aware (a `import type`
cannot be called at runtime). **The owner ruled this ordering explicitly**, on the Codex review's
evidence, and it is load-bearing rather than stylistic.

Two acceptance fixtures pin it: a local `function stepEnemies(w)` is **not** reported, and neither is
a type-only import. The existing red-proof fixtures gained the `import` line they had always implied —
without it they were calls to some unknown local, which the rule now correctly declines to claim.

### Stage 2: a reviewed manifest with a completeness gate, NOT a derived set

The set is not computed and used directly, and the reason is that **the two error directions are not
symmetric**:

- a **missing** name under-reports — a gap, which the tripwire names;
- an **over-inferred** name is a **false red on legal production code**, and this project's history is
  that a false red on a blocker rule gets the gate edited rather than the code fixed.

So `deriveSimMutators()` is a tripwire, not the source of truth. `EXCLUDED` (empty today) carries a
written reason per entry, so a future disagreement is recorded rather than settled by quietly editing
the manifest — the same move as clearing a red hash by editing the hash.

A full interprocedural alias-aware closure was **considered and rejected**, for precision as much as
size: more inference means more false reds in the one direction that hurts.

### The derivation's rule, and the case that shaped it

*Writes to one of its own parameters, **or** hands one of its own parameters to something already
known to be a mutator.*

🔴 **The second clause says "one of its OWN parameters" because of a measured false positive.** The
first draft asked only *"does it call a mutator?"* and reported **`derivedFeel()`**
(`src/sim/derived.ts:95`), which calls `advance(jump.world, …)` on a scratch world it builds itself —
pure from the caller's view. That would have put a pure function into a name-matched rule. Requiring
the argument to be the caller's own parameter drops it and drops nothing real: 33 → 32.

The transitive clause is not decoration — six names have **no direct write at all**: `advance`,
`advanceSplit`, `applyPlayerAttack`, `freezePair`, `nextFloat`, `resolveState`. Five of those six are
exactly the ones the Codex plan review named.

### The red proofs *(C1)*

**Mutation A — a real mutator missing from the manifest.** Deleted `'tick'` from `SIM_MUTATORS`:

```
PASS (6) FAIL (1)
  every derived mutator is either in the manifest or EXCLUDED with a reason
    ... never silently: tick
```

**Mutation B — identity resolution removed.** Deleted `&& imported.has(direct)`:

```
PASS (12) FAIL (1)
  ACCEPTS a LOCAL helper that merely SHARES a name with a sim mutator
    a local helper was reported as a sim mutator purely because of its NAME
```

That is the widening the owner ruled against, demonstrated rather than asserted. Both reverted with
the count restored *(C12)*.

The gate also carries its own synthetic red proof (a fabricated `src/sim/` source) and an acceptance
proof (a function mutating only locals), so each direction of the derivation is demonstrated.

### Verification

typecheck clean. Unit **167 files / 2484 tests** against 166 / 2476: **+1 file, +8 tests.**
🔴 **The whole suite is green with 32 names — no production file false-reds.** That was the risk the
identity work existed to remove, and it is measured rather than assumed.

`simMutators.ts` 195, `tweenCallbacks.ts` 351, `sim-mutator-manifest.test.ts` 110 — all inside the
400-line rule.

### What this does NOT do

- **The manifest is still a human artifact.** The tripwire says when it has fallen behind; it does not
  decide membership.
- **The derivation reads exported `function` declarations only.** `src/sim/` has no exported arrow
  consts — checked, 86 of 86 are plain declarations — so there is no second shape today, and a future
  `export const f = (w) => …` would be invisible to the tripwire. Recorded, not closed.
- **`readonly`-typed parameters are not distinguished**; a write through one is a type error caught by
  `tsc`, not here.

---

## Batch 6 — §1, the catch-up criterion: **NOT WRITTEN, and the reason refutes a recorded finding**

The owner authorised bounding the post-hit-stop catch-up spike, then — on the Codex review's evidence
— ruled that the session must **measure first**, with *"no orderable statistic"* a permitted outcome.

**The outcome is stronger than that, and it is not the one anyone expected: the phenomenon does not
occur at all, and the record that motivated the criterion is wrong.**

### What was measured

`catchUpProbe.ts` split every recorded animation frame by how many sim ticks it drained
(`tick[n] - tick[n-1]`, from `__game.tick` read at the top of each rAF callback) over the same
1200-tick phased fight `phase-09-combat.spec.ts` drives.

| run | frames | histogram (ticks→frames) | maxTicks | catch-up frames |
|---|---|---|---|---|
| clean 1 | 4596 | — | **1** | **0** |
| clean 2 | 4630 | `0:3429  1:1200` | **1** | **0** |
| **40 ms main-thread block every 20th frame** | 3399 | `0:2199  1:1199` | **1** | **0** |

Over 1200 sim ticks, exactly **1200 frames drained one tick each**. Not one frame in **12 625
observed frames across three runs** drained two.

### The instrument was proved able to see the thing it reports as absent

🔴 **A reduction reporting "no catch-up frames" is indistinguishable from one that cannot see them**,
and the conclusion here is consequential enough to demand the difference. `CATCHUP_BLOCK=1` installed
a rAF loop burning the main thread for ~40 ms every 20th frame. The block plainly landed — the worst
frames go from ~5 ms to a wall of ~41 ms — and the tick histogram **did not move**.

That is the finding, not a failure of the probe: a 41 ms frame *should* drain 2 ticks at 16.67 ms each.

### Why it never happens — the mechanism

**Phaser clamps `delta` before `GameScene.update()` ever sees it.** `phaser.d.ts:6840-6845`
documents `rawDelta` as the value to which *"no smoothing, capping, or averaging is applied"* — which
is what `delta` is not. `smoothStep` defaults to **true** (`:6866`), smoothing over a 10-frame moving
average (`deltaSmoothingMax`, default 10, `:6829`), with a `panicMax` cooldown of 120 frames
(`:6837`).

So a single expensive frame is averaged away before `drainTicks(accumulatorMs, delta)` is called, and
the accumulator never reaches two ticks' worth.

🔴 **Consequence for the codebase, worth recording on its own:** `frameClock.ts:48-50`'s
over-the-cap branch — the anti-spiral-of-death code that returns `MAX_TICKS_PER_FRAME` and a non-zero
`dropped` — is **unreachable in production**. It is reachable only from `frame-clock.test.ts`, which
calls `drainTicks` directly. The branch is not wrong and should stay; but the guard it provides is
provided upstream by Phaser, and nothing in the game can currently reach it.

### 🔴 What this refutes

`session-phase-09-debts-02-perf.md` §Batch 7, finding 3, and the header of
`phase-09-combat.spec.ts` state:

> *"The worst combat frame is 22-39 ms and it is not the burst. Those spikes are the sim's
> post-hit-stop tick catch-up draining through `frameClock`'s `MAX_TICKS_PER_FRAME`."*

**The second sentence is false.** Every one of the worst frames drained one tick or zero:

```
55.500 ms  ticks=1  rest      31.500 ms  ticks=1  rest
46.000 ms  ticks=1  fight     28.300 ms  ticks=1  rest
37.300 ms  ticks=1  fight     26.100 ms  ticks=1  rest
                              23.600 ms  ticks=0  rest
```

They ran exactly the same amount of simulation as the 1200 frames whose median cost is a fraction of a
millisecond. The first sentence — *"it is not the burst"* — still stands.

⚠️ **What those frames ARE is still unidentified, and this session does not claim to know.** Seven
outliers in 4630 frames (**0.15 %**), spread across *both* phases, and **the worst one is in REST** —
i.e. the most expensive frame of the run happened while nothing was fighting. GC, a compositor hitch
and a driver stall are all candidates and none is measured. **Refuting an attribution is not the same
as supplying one**, and the difference is recorded rather than papered over.

### The disposition

**No criterion is written, and no bound is asserted.** The phenomenon a bound would be about does not
occur, cannot be induced from inside the page, and is prevented upstream by the engine rather than by
anything this project controls.

Per the plan's no-statistic branch, **the experimental code is reverted** — `catchUpProbe.ts` and
`phase-09-catchup.spec.ts` are deleted. Leaving them would ship an instrument with no consumer, which
this project holds to be the same defect as a burst of zero particles. **The measurements above and
the corrections below are the deliverable.**

⚠️ The criterion stays **session-local** exactly as the plan required — no row was added to Phase 9's
gate table, and `docs/qa/phase-09-polish.md` is untouched. Placement was deferred until an orderable
statistic existed, and none does.

---

## Batch 7 — §3a, criterion 8.7's GPU ratio: **DELETED**, and it was never red-proved

Full evidence, tables and the not-claimed section live in **`docs/qa/phase-08-levels.md` § *The GPU
ratio was never red-proved*** — it belongs beside the phase whose record it corrects, not here. This
entry is the session's side of it.

**The plan's hard condition**, verbatim: *"A GPU-specific mutation must demonstrably order the paired
statistic before any bound is fixed. If none does, DELETE the gate rather than re-bound it."*

**What was run.** A throwaway `phase-08-gpuprobe.spec.ts` computing *both* statistics — the shipped
`median(largeGpu)/median(smallGpu)` ratio and `medianPairedDelta(smallGpu, largeGpu)` — from the same
readings, in one page, interleaved with the order alternating. Three runs; the third is a held-out
set that had no say in the conclusion.

| | ordered the paired delta? |
|---|---|
| `skipCull = true` on level-05 — **the mutation the bound names** | ❌ +0.029, −0.019, **−0.209** ms; mutant cheaper than clean in 2 of 3 runs |
| 60 full-screen alpha scrims — **the sensitivity control** | ✅ per-pair `[0.860, 0.865, 0.807]`, `[1.109, 1.027, 1.021]`, never overlapping clean |

The control is why the flat result is a finding rather than a broken timer. And skipCull demonstrably
*landed* — it moved the **main-thread** median 0.50 → 1.20 ms — so this is not a mutation that failed
to apply.

🔴 **The finding that decided it.** The *clean* ratio read **1.073x, 0.097x, 1.304x** on the same
commit. The 0.097 came from two windows reading **0.036 ms**, `gpuTimer`'s floor. That is the same
pathology `phase-08-levels.md` had already diagnosed for criterion **6.9** — and 8.7 was carrying it
undetected, recorded as sound because its Phase 8 runs landed well. **One gate's recorded defect was
sitting unrecognised in another gate two sections down its own log.**

### What landed

- `MAX_LEVEL_GPU_RATIO`, the GPU non-vacuity loop, the GPU medians and the GPU log line — **deleted**
  from `levelPerf.ts` (269 → 254) and `phase-08-perf.spec.ts` (321 → 315, header note added).
- The malformed docstring the plan flagged at `levelPerf.ts:56-68` (*prose, then item `2.` with no
  `1.`*) was that bound's — resolved by the deletion.
- `phase-08-gpuprobe.spec.ts`, `costGpuCull` and `costGpuFill` **reverted**, same rule §1 followed:
  instrumentation with no consumer is the same defect as a burst of zero particles. The measurements
  and the conclusion are what land.
- `docs/qa/phase-08-levels.md` corrected in five places — the 8.7 gate row's *"every bound
  red-proved"*, the bounds table row, the "five bounds" bullet, the closing lesson, and the new
  evidence section. Struck through rather than erased: the sentence that read a **clean** measurement
  as a **proof** is the instructive part.

**Six bounds remain and all six are red-proved.** `installGpuTimer`, `MIN_GPU_SAMPLES` and `Sample`'s
GPU fields are untouched — Phases 6 and 9 still consume them.

⚠️ **Not done, deliberately:** a paired **absolute** GPU bound on level-05 would be red-provable and
stable on these readings, but it is a *different claim* from 8.7's and therefore a new criterion —
**STOP-and-ask**. Recorded in the phase log as an option, not taken.

**Verified:** `phase-08-perf.spec.ts` re-run after the surgery — **3 passed** (work ratio 1.17x,
create 1.32x, red proof 183.40x). Typecheck clean; `file-size` and `docs-contract` green.
