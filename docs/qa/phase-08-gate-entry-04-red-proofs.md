[← gate-entry session log index](phase-08-gate-entry.md) · [QA-LOG index](../QA-LOG.md)

## Red proofs — every new gate watched failing *(C1)*, every mutation confirmed reverted *(C12)*

### The e2e spec — and the harness trap it walked into from the wrong end

**Mutation:** delete `sprite.setAlpha(desc.alpha)` from `gamePlayerDraw.ts`, so the fade is computed
and never reaches the screen. `setAlpha` occurrences **1 → 0**, `cmp` confirms the file changed,
`git diff --quiet` confirms it restored.

**Red:** `1 failed`, naming
`fades to 0 over many frames, plays run throughout, and never pops back`, on
`the courier was never drawn PARTIALLY faded — that is a blink-out, not a fade`. Restored: `3 passed`.

That mutation is the one this spec exists for. `player-view.test.ts` stays **completely green**
through it, because the descriptor is still correct — only nothing applies it. It is the same shape
as Phase 2's *deleting `renderPlayer()` left every test green*.

#### 🔴 Two false reds before that, both the harness rather than the feature

**1. The bound was unmeasurable in this project.** The first version counted *distinct alphas per
animation frame* and required more than five. It failed on the real build with **one**. The headless
project renders at roughly **11 fps** against a fixed 60 Hz sim, so one frame drains five or six
ticks and the entire 20-tick ramp spans about **three animation frames** — there are not five frames
in the window to have five alphas in.

This is the project's oldest measurement trap arriving from the opposite end. Phase 7 learned that
at ~240 fps a percentile over rAF frames cannot see a cost carried by 2 % of frames; here, at ~11
fps, a per-frame sampler cannot see a ramp lasting a third of a second.

**The bound was not lowered to fit the harness — the statistic was replaced** *(the rule from
2026-08-19: a statistic that cannot order its own mutation cannot be fixed by moving the bound)*.
The claim is now:

> every alpha the sprite is ever drawn with is a value **on** the ramp (`1 − k/20` for whole `k`),
> it never increases, and at least one is strictly between 0 and 1.

That holds at 11 fps and at 240 fps, it is what the fade actually claims, and it still refuses an
instant blink, a wrong curve and a pop-back. Pairing each alpha with the counter read in the same
callback was rejected: the sampler and Phaser's update run in an unspecified order within a frame,
so the pair can skew by one tick through no fault of the code under test.

**2. The sampler measured an empty window.** `playToExit` waits on `world.completed`, so a sampler
installed *after* it returns begins life on a finished level. It saw one alpha (`0`), a counter
frozen at 20, and reported *"never drawn partially faded"* — **a true statement about a window it
had entirely missed**, indistinguishable from a real blink-out defect. Fixed by installing the
sampler before the drive. Worth stating plainly: **two of the three shape assertions were red
against a feature that works**, and the difference was five lines of ordering.

### The shipped art — three mutations, three different ways to be wrong

**Target:** `public/assets/objects/gate.png`, mutated as bytes and re-run against
`tests/unit/shipped-gate.test.ts`. Restored with `cmp` confirming byte-for-byte equality after
each.

| | mutation | landed | `Tests N failed` | caught by |
|---|---|---|---|---|
| **A** | **transparent void** — the interior keys away, so the gate ships as a **ring** | yes | **2 failed** | dark-opaque opening · mostly-opaque overall |
| **B** | **slab** — an opaque dark rectangle with no doorway around it | yes | **2 failed** | bright frame flanking the opening · frame-vs-void luminance |
| **C** | **lit interior** — the opening is a lit room, not a dark passage | yes | **2 failed** | dark-opaque opening · frame-vs-void luminance |

Mutation A is the one the whole test file exists for: **a ring is still exactly one connected
component and still 192 × 288**, so `buildGate`'s refusal cannot see it and the asset ships as a
see-through hole the player fades into instead of a dark passage.

🔴 **The first run of this loop proved nothing and said so.** The mutation script sat in `/tmp` and
its relative import of `tools/gen/png.mjs` did not resolve, so it threw, no bytes changed, and all
seven tests passed. The `landed=` column — a `cmp` before believing the result — is what caught it;
without it the honest record would have been three false greens read as "the gate cannot catch
these". *(C12, and the second time this session that a red proof was nearly recorded from a run
that mutated nothing.)*

### 🔴 A red gate fixed by correcting the WINDOW, not the bound

`has a solid frame down BOTH jambs` failed on the real asset at **0.574 against a 0.6 bound**. The
tempting move is to lower the bound. The column profile says the bound was never the problem:

```
  col   0    0 % opaque              transparent margin
  col   8  100 % opaque,  95 % bright   the copper PIPE
  col  16   13 % opaque              the GAP between pipe and frame
  col  24   92 % opaque,  22 % bright   the jamb begins
  col  40  100 % opaque,  91 % bright   the jamb proper
  col  56..136  100 % opaque, ~14 % bright   THE OPENING
  col 144  100 % opaque,  87 % bright   the right jamb
  col 176   15 % opaque              the gap again
```

The window `x 0..20` straddled a transparent margin and a pipe gap and **measured neither jamb**.
Replaced with a predicate that does not need to know where the jambs are — *somewhere between the
centre and each edge there is a column that is ≥90 % opaque and ≥60 % bright.* Hardcoding
`24..52` / `144..172` was rejected: that is fitting the test to one generation, and the next
re-shoot moves them.

The distinction is the point. **Moving a bound to clear a red gate is forbidden; correcting a
window that measures the wrong pixels is fixing the test.** Mutation B above then confirms the
replacement still refuses a slab, which the old window would also have done — so nothing was lost.

### The fade curve — three mutations, and only one test does the work

**Target:** `goalEntryAlpha` in `src/render/playerView.ts`. Driven from the shell, never from a
Node script. `GOAL_ENTRY_TICKS` occurrences dropped **2 → 1** on every mutation, and the file was
restored with `cmp` confirming byte-for-byte equality afterwards *(C12)*.

| | mutation | `Tests N failed` | which tests caught it |
|---|---|---|---|
| **A** | delete the fade — `return 1` | **3 failed** | per-tick curve · monotonic · reaches 0 |
| **B** | make it instant — `return 0` | **2 failed** | per-tick curve · monotonic |
| **C** | **quadratic** — `1 - (t/N)²` | **1 failed** | per-tick curve **only** |

🔴 **Mutation C is the one worth keeping.** A quadratic ramp agrees with the linear one at tick 0
*and* at tick `N`, and is monotonically decreasing throughout — so **both endpoint assertions and
the monotonicity assertion pass it**, and the character visibly fades on a different schedule. Only
`pins the alpha at EVERY tick of the ramp` sees it.

That is the concrete form of the rule this project keeps re-learning: *"the endpoints are worthless
on their own."* Mutation B makes the same point from the other side — with an instant fade, the
test named `reaches exactly 0 at GOAL_ENTRY_TICKS` **still passes**, because a sprite that vanished
immediately is also a sprite that is invisible at the end. A gate asserting the end state of a fade
cannot tell a fade from a disappearance, and *"the player is invisible at the end" is true of a
sprite that was never drawn.*

### `level-goal-fits.test.ts` — and the finding that Codex's "future-proofing" objection was wrong

**Mutation:** `level-01.tmj`'s goal rect height `288 → 240`, applied by editing the **parsed JSON**,
not by a text substitution.

🔴 **The planned text mutation would have changed zero bytes.** It grepped `"height":288`; the
shipped file writes `"height": 288`, with a space. Codex's plan review (C5) caught it and it was
verified here before anything ran: **6 matches for the real pattern, 0 for the planned one.** A
"watched it go red" record taken from that run would have been false — which is precisely why the
rule is *content changed AND the original count dropped by one*, and never *the count is now zero*.

| | |
|---|---|
| before | `grep -c '"height": 288'` → **6** |
| mutation landed | `cmp` reports the file differs → **yes** |
| after | **5** — dropped by exactly one, not to zero |
| gate red | `Tests 2 failed`, naming `level-01 is EXACTLY body-tall` and `level-01 has a solid whose top edge is flush with the exit bottom` |
| reverted | `git diff --quiet` clean → **byte-for-byte**; count back to **6** |
| green again | `Tests 95 passed` across both files |

**And the mutated level is genuinely unwinnable.** With the 240 px exit,
`level-completable.test.ts` fails on **all three seeds** (8201, 8202, 8203) — the solver plays the
real `tick()` over the real shipped bytes and can never finish. That retires Codex's C11 objection
(*"future-proofing, not current delivery"*) with evidence rather than argument: the failure this
ten-line file prevents is a shipped level that loads, validates, draws its door and cannot be
completed, and **no other gate in this repository sees it** — `level-goal.test.ts` passes it,
because one rect of positive size far from the spawn is all it ever asked for.

---

## The 400-line rule — one exemption, written before it was taken (CLOSED 2026-08-20)

> **🔴 The exemption is SPENT and the citation line is deleted.** Phase 9 needed a home for the
> hit-stop gate, which has to cover steps 5, 6, 7 and 8 together, and moving that block whole into
> `src/sim/playerMotion.ts` took this file back under the limit. The split refused below was the
> wrong split;
> the one that worked was not on the list, because in Phase 8 nothing yet needed a seam through the
> numbered steps themselves. **The ratchet goes back 1 → 0.** Everything under this line is kept as
> written — it is the reasoning that was true when it was taken, and the record of what changed it.

**`src/sim/tick.ts` crossed the limit at 422 lines, up from 398.** The gate's own text says the
way past is *"to split the file or write the justification, in that order of preference"*, so the
split was attempted first and is recorded here as rejected, with the reason.

**What the +24 lines are.** The whole feature's footprint in this file: the widened-9d paragraph in
the contract header (8), the `entryLocked` cached read (3), the attack-edge consumption block (6),
the `dir` ternary gaining a branch (2), and one line each on steps 5, 7 and 9d. Roughly 11 further
lines were **moved out to `goal.ts`** while getting here — every one of them reasoning that
`goal.ts`'s own header already claims (*"the step in `tick.ts` is three lines and a pointer, and the
reasoning lives with the code that implements it"*). That was a real defect in the first draft, not
a line-count trick, and it is why this exemption is for 422 and not 445.

**Why it is not split.** This file is the numbered tick contract **and** the function that
implements it, and their co-location is the entire design premise — *"the code below is a numbered
list rather than a paragraph of arithmetic"*. The one extractable concern was already extracted:
`advance` moved to `advanceSplit.ts` in Phase 8 for exactly this reason, and that file's docstring
says so. The two remaining candidates were examined and both would **contradict a decision written
into this file**:

- **step 13's window advance** → `windows.ts`. Refused: step 13's own comment states that the
  guard in front of `advanceWindow` *"is the step-order rule above and stays here, with the
  numbered order that owns it"*.
- **step 4c's respawn** → `combat.ts`. Refused: the block states the decision is taken in `tick.ts`
  *"where the spawn point lives"*, and `combat.ts` deliberately imports no level data.

Splitting the contract header into a document was also rejected: CLAUDE.md's instruction is *"read
that file's header before changing anything in `src/sim/`"*, and its value is being in the file the
reader already has open.

**The ratchet moves 0 → 1** in `tests/unit/file-size.test.ts`, which is the deliberate act that
gate requires alongside this citation. Not one line of explanation was deleted to reach 422.

**2026-08-20 — and moved back 1 → 0.** Phase 9 moved steps 5–8 whole into `src/sim/playerMotion.ts`,
numbered comments and all, leaving one-line markers at the call site so `tick.ts` still reads as
fourteen steps in order. That is the seam the two candidates above did not offer: it contradicts no
decision written into the file, because the block carries its own numbering with it and nothing was
renumbered, lettered or inserted. Nothing was deleted to get there either.

⚠️ **No line count is quoted in any of the three sentences above, and that is deliberate.** The first
version of this note said 396 while `wc -l` said 395, and a later fix in the same phase moved the file
again. With the `SIZE-EXEMPTION` citation gone there is nothing left to gate such a number, and
`file-size.test.ts`'s own docstring is the authority on what that means: *"a hardcoded line count in a
comment is a fact with an expiry date and no test"*. The ratchet is the gate; the count is decoration
that had already been wrong twice in three days.

---

## Decisions and deliberate non-fixes

| | Decision | Why |
|---|---|---|
| **Tick contract** | Step 9d's **meaning** widened; nothing renumbered, inserted or lettered. | `tick.ts`'s header guarantees the numbering and the ordering. 9d already owned "the exit", and an exit you walk into for twenty ticks is still the exit. Codex's plan review was asked directly and ruled it not a substantive violation — the obligation is that the header text describe the widened semantics accurately, which it now does. |
| **Auto-run dead zone** | `dir` is 0 within one tick's travel of the centre. | Without it a 9 px/tick body oscillates around the centre forever. |
| **The foot-slide it costs** | For the last few ticks a fast entry plays `run` while standing still. **Accepted, not hidden.** | Alpha is ≤ 0.25 by then and the character is inside a dark opening. `ponytail:`-commented at the branch with its upgrade path (a decel ramp) named. |
| **`run`'s stride** | **Not retuned.** | It is documented as provisional and distrusted. If it reads wrong at gate scale that is *reported* — retuning it is a separate decision with its own foot-plant gate. |
| **`window.__game`** | No 9th field. | Closed at 8 by a Phase 1 Codex ruling. The e2e spec measures the sprite instead — what Phase 2 did when it wanted two fields it could not have. |
| **`level-goal-fits.test.ts`** | Kept, though Codex called it future-proofing. | It is the only guard against the exact-vertical-equality brittleness Codex itself confirmed. The failure it prevents makes a level unwinnable; the test is ten lines. |

---

## Open, for the owner

🔴 **The art-spend ceiling is recorded twice and the two disagree.** `PRD.md`'s Global
Constraints say **$50** (raised from $25 on 2026-08-16). `GENERATION-LOG.md` says
*"Running total after Phase 6: $47.61 of the **$55** ceiling."* This session's $0.15–$0.30 fits
under either reading, so it proceeds and names the contradiction rather than quietly picking a
winner. **Which number is current is the owner's call.**

---

## 2026-08-22 — G.7b was flaky, and its linearity guard was replaced

**Inherited, not a Phase 9 regression.** The criterion is Phase 8's; the repair was taken on the
Phase 9 branch because that is where the full-suite red surfaced. `src/` was not touched — the defect
was in the gate, and nothing in the readings implicates the game.

### The failure, reproduced

Reported failure text, from the full suite:

```
Error: the per-exit cost measured at 20 copies (0.0000 ms) and at 40 (0.0000 ms) disagree by 25.6x.
```

Reproduced on the **first** attempt of this session:

```
       1 exit      work 0.400 ms   gpu 0.166 ms
       41 exits    work 0.400 ms   gpu 0.226 ms
       21 exits    work 0.500 ms   gpu 0.145 ms
       per exit    work 0.0000 ms   gpu 0.0015 ms
       per exit at 20          gpu 0.0000 ms   (linearity check)
Error: the per-exit cost measured at 20 copies (0.0000 ms) and at 40 (0.0015 ms) disagree by 1510.4x.
```

🔴 **Read the 21-exit line.** It measured **0.145 ms** against the 1-exit control's **0.166 ms** —
twenty extra exits made the GPU *faster*. That is the whole defect in one row.

### The statistic that failed, verbatim

```ts
const perExitGpu     = Math.max(0, (manyGpu - oneGpu) / MUTATION_COPIES);   // 40 copies
const perExitGpuHalf = Math.max(0, (halfGpu - oneGpu) / HALF_COPIES);       // 20 copies
const spread = Math.max(a, b) / Math.max(1e-6, Math.min(a, b));
expect(spread).toBeLessThan(MAX_LINEARITY_SPREAD);                          // 4
```

`oneGpu`, `halfGpu` and `manyGpu` are each `median(...)` over three windows sampled **minutes apart**.

### Root cause — three defects, measured

| | Defect | The measurement that proves it |
|---|---|---|
| **1** | **Unpaired medians of a within-noise effect.** 6.9's discarded GPU ratio, 5.11 and 9.5's Guard 1 are the earlier three sightings. | Per-**round paired** deltas at 40 copies, six rounds: **0.924 / 0.063 / 0.063 / −0.071 / 0.146 / 0.164 ms**. One round in six is negative; the spread is ±300 % of the median. |
| **2** | **`spread < 4` at an amplification ratio of 2 cannot fire in the range it polices.** Under `c·N^k` the spread is `R^|k−1|`, so at `R = 2` every law from `O(1)` to `O(N^2.99)` satisfies it. | Already established by 9.5, which retired the identical statistic. Restated here because G.7b was the *source* 9.5's Guard 3 docstring cites. |
| **3** | **The amplifier destroyed and re-created the whole stack between arms** — up to 2560 allocations and their collection immediately before, and often inside, the measured window. | Two selection runs on an unchanged tree disagreed about the cost of 2560 copies by **2x**: work paired delta **3.600 ms** then **1.600 ms**. After pooling, the per-round GPU deltas at 5120 read **2.470 / 2.468 / 2.463**. |

### 9.5's repair transfers by half, and the half that does not is a measurement

**Pairing** transfers unchanged — every delta is now `medianPairedDelta`, the median of per-round
differences. **Widening the arms** transfers — 40 copies became a sweep to 5120, and every reading is
whole milliseconds instead of one step of a 0.1 ms clock.

🔴 **9.5's cost EXPONENT does not transfer, and it was tried before it was rejected.** Fitted on this
gate's readings, `k` swung **0.50 / 0.84 / 1.00 / 1.52** across four runs of an unchanged tree, on the
main-thread and the GPU arm alike. One of those runs (`sel-02`) is a false red against a floor of
0.78, watched. `k` is a ratio of two differences and the smaller one is a few clock steps wide however
far the arms are separated — a floor tight enough to mean anything false-reds, a floor loose enough to
survive means nothing. Under this project's rule the statistic was replaced a **second** time rather
than re-bounded.

### What the sweep showed, and the statistic that came out of it

Paired deltas against the 1-exit control, pooled amplifier:

| copies | 640 | 1280 | 2560 | 5120 |
|---|---|---|---|---|
| gpu | 0.888 | 1.176 | 1.468 | 2.468 ms |
| work | 0.000 | 0.400 | 1.200 | 3.300 ms |

The GPU column is **not proportional to the count**: making *any* copies visible costs ~**0.5 ms** on
its own — a render-state and batch cost of splitting the scene at depth 7 — and only the rest scales.
Dividing a total delta by the count attributes that fixed half-millisecond to individual exits, which
is **Codex's Phase 8 finding 3 arriving as a measurement rather than an objection**.

**So the gate reports the MARGINAL cost and the fixed part cancels.** `perExit` is the gap between the
top two sweep points over the copies added between them, not the top delta over the top count. A
count-independent cost appears in both points and subtracts out, so the statistic is *immune* to the
defect the old guard was *guarding* against.

| | old | new |
|---|---|---|
| deltas | difference of two independently-taken medians | **median of per-round paired differences** |
| amplification | 20 and 40 copies | sweep **0 / 2560 / 5120**, pooled and toggled by `visible` |
| per-exit figure | `delta(40) / 40` — a total over a count | **`(delta(5120) − delta(2560)) / 2560`** — a marginal cost |
| the guard | `spread < 4` over two per-exit estimates | **every sweep gap ≥ `MIN_SWEEP_GAP_*_MS`** (0.3 ms, both arms) |
| red proof | none — the guard was never watched failing | **`PERF_MUTATION=capdraw`**, below |

### 🔴 Watched failing — `PERF_MUTATION=capdraw`

The visible count is capped at 2560, so the top arm asks for 5120 copies and draws 2560. Nothing else
changes: same pool, same display list, same control, every window still over `MIN_SAMPLES`, first gap
still clears its floor. Verbatim:

```
        2561 exits  per-round paired work 1.600/1.700/1.800  gpu 1.404/1.307/1.407  median work 1.700 gpu 1.404 ms
        5121 exits  per-round paired work 1.500/1.900/1.700  gpu 1.349/1.308/1.269  median work 1.700 gpu 1.308 ms
       sweep gaps  0->2560 work 1.700 gpu 1.404 ms, 2560->5120 work -0.000 gpu -0.096 ms  (floors work 0.3, gpu 0.3)

Error: going from 2560 to 5120 extra exits cost the GPU -0.096 ms more, under the 0.3 ms floor. The
frame stopped getting more expensive when more exit was drawn, so dividing a delta by a copy count is
not a per-exit figure and the ceilings below would pass for an exit of any cost at all.

    expect(received).toBeGreaterThanOrEqual(expected)
    Expected: >= 0.3
    Received:    -0.09625600000000012
```

Against a clean band of **0.976 – 1.482 ms** on that same gap over twenty runs, the mutated reading is
**−0.096**. The mutation is a committed, env-gated fixture (`CAPDRAW_LIMIT`), not a source edit, so
there is nothing to revert and nothing to leave applied by accident — the C12 hazard the rule names
does not exist for it. The tree carries no mutation: the twenty clean runs below were taken from it.

### 🔴 And the ceilings ORDER a genuine per-exit regression — `PERF_MUTATION=perexit`

A per-frame main-thread cost of **0.005 ms for every visible copy**: an exit that got more expensive
to draw, which is what `MAX_EXIT_WORK_MS` exists for.

| | clean (green-1) | `perexit` | expected |
|---|---|---|---|
| per exit, work | 0.00188 ms | **0.00605 ms** | 0.00188 + 0.005 = 0.0069 |
| sweep gaps | 2.000 / 4.800 | 17.500 / 15.500 | still ordered, still green |
| frames served | 720 / 720 / 720 | 720 / 175 / 93 | over `MIN_SAMPLES` 60 |

The reported figure tracks the injected cost to within the clock's own resolution, and the gap guards
correctly stay **green** — the cost still scales with the count, so nothing about the inference broke.

⚠️ **The 0.05 ms ceilings themselves are NOT watchable-red on this harness, and that is arithmetic.**
0.05 ms per exit at 5120 copies is **256 ms** added to every frame of the top arm, which serves ~11
frames in a `SAMPLE_TICKS` window against a `MIN_SAMPLES` of 60 — `sampleArm`'s own precondition fires
first, so the ceiling can never be the assertion that reds. At 0.005 ms the top arm is already down to
93 frames. This is recorded, not worked around: the ceilings are a smoke alarm for a catastrophic
change, and what stands behind the number is the gap guard plus the ordering evidence above. **Moving
them was out of scope for this repair and they are byte-identical to Phase 8's.**

### The bound, chosen on one set and confirmed on a HELD-OUT set

`MIN_SWEEP_GAP_GPU_MS = MIN_SWEEP_GAP_WORK_MS = 0.3`, at roughly a quarter of the smallest reading in
the selection set.

| set | runs | `0→2560` gpu | `2560→5120` gpu | `0→2560` work | `2560→5120` work | outcome |
|---|---|---|---|---|---|---|
| **selection** | 4 clean of 5 | 1.278 – 1.384 | 1.043 – 1.152 | 1.800 – 2.500 | 2.700 – 4.400 | bound set at 0.3 |
| **held out** | 5 | 1.151 – 1.319 | 1.113 – 1.435 | 3.000 – 5.100 | 2.700 – 4.400 | **5/5 green** |
| **flake proof** | 10 | 1.287 – 1.482 | 0.976 – 1.162 | 1.500 – 2.400 | 2.500 – 4.800 | **10/10 green** |

The worst reading any run has produced against the floor is **0.976 ms**, 3.25x above it. The
mutation reads **−0.096**. Nothing sits between them.

**One selection run (`pick-2`) did not produce a reading**: it hung in `perfSampler.sample()` and hit
the 600 s test timeout. It is excluded from the selection band because it measured nothing, and it is
**disclosed rather than dismissed** — see *Open, for the owner* below.

### The flake proof — 10 consecutive green, detected POSITIVELY

Each of `green-1` … `green-10` was checked for three things, never for a zero exit code and never
through a pipe:

```
Running 1 test using 1 worker
  ok 1 [chromium-gpu] › tests\e2e\phase-08-gate-perf.spec.ts:227:3 › G.7b — the frame cost of the
      exit › one exit costs a fraction of a millisecond a frame, measured by amplification (31.3s)
  1 passed (36.0s)
```

The **test count** (`Running 1 test`, `1 passed`) is read as well as the name — a run that selected
nothing reports `expected: 0` and exits 0. No run in the ten printed a `failed` line.

Before the repair the same command reproduced the failure on run 1 of 1.

An **eleventh** run was taken after merging `main` at `8faba6f` (docs only) — green, with gaps
`0→2560 work 1.400 gpu 1.317`, `2560→5120 work 1.800 gpu 1.057`. That 1.400 is the smallest work gap
any of the twenty-one clean runs produced, and it is still **4.7x** above the floor.

### The finding

**One exit costs 0.00038 – 0.00050 ms of GPU and 0.00098 – 0.00188 ms of main-thread work per frame**,
marginal, over twenty runs. Against a 16.67 ms frame that is **0.011 %** at worst, and the ceilings sit
26x above the worst main-thread reading and 100x above the worst GPU one.

### Files

| File | What changed |
|---|---|
| `tests/e2e/phase-08-gate-perf.spec.ts` | the measurement: pooled amplifier, paired deltas, marginal per-exit, two gap guards and the per-round premise guard. 352 lines. |
| `tests/e2e/exitCostBudget.ts` | **new** — every number and both fixtures, split out when the repair took the spec over 400 lines. The seam `perfBudget.ts` and `effectBudget.ts` already use. 217 lines. |

Neither is over 400 lines, so no `SIZE-EXEMPTION` is claimed.

### Open, for the owner

⚠️ **One run in twenty-two hung, and the cause is not established.** `pick-2` sat in
`page.evaluate` inside `perfSampler.sample()` until the 600 s timeout, having produced no reading; the
other twenty-one clean runs and both mutation runs completed in 31–48 s. The likely cause is the one
this project has already recorded — **another Playwright job on the same box** (`tasklist` showed
several other `node.exe` processes throughout the session, and a sibling agent was repairing a
different gate at the same time), which CLAUDE.md §5 names as producing exactly this presentation. It
is possible instead that 5120 stacked copies at 637 Mpx/frame provoked a driver stall. **It did not
recur in the twenty runs taken after it**, but it was not chased to a root cause and the copy count
was not lowered on a hypothesis. Recorded rather than assumed away.
