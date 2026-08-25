# Phase 8 — the six gate-owner briefs, finding by finding

Companion to [`phase-08-levels.md`](phase-08-levels.md). Three owners, **two briefs each** *(A7)*,
brief 1's findings withheld from brief 2. Every finding is **applied** or **recorded with a one-line
reason** *(C11)*; none is silently dropped.

**Tally: 27 findings. Applied 26. Recorded, not applied: 1.**

Every claim was re-verified locally before disposition *(C6)* — a subagent's summary is a claim, not
evidence. The one recorded finding is criterion **6.9**, which is not Phase 8's and is reported
**unstable** rather than quietly carried: it passes and fails on the same unchanged commit.

The owners come from [PRD.md § The QA agent protocol](../PRD.md#the-qa-agent-protocol):

| Owner | Criteria |
|---|---|
| `voltagent-qa-sec:qa-expert` ×2 | 8.1, 8.3, 8.4, 8.5 |
| `voltagent-qa-sec:code-reviewer` ×2 | 8.7 (no file > 400, diff review, adversarial pass) |
| `voltagent-qa-sec:performance-engineer` ×2 | 8.7 (frame budget) |

---

## Brief 1 — the checklist pass

### 🔴 The blocker, and the five gates that could not see it

**BLOCKER — `playerInputEnabled` is never reset, so every level after the first opens frozen.**
`GameScene` sets it `false` on the `levelCompleted` edge, and Phaser reuses the scene **instance**
across `scene.start`. Level-02 booted with the character unable to move, and only a page reload
recovered — the whole game after level-01 was unplayable.

**APPLIED** — reset in `init()`, never the constructor, for Phase 1's reason: a constructor runs once
while `init` runs on every start *and* restart.

What makes this the phase's most important finding is not the one-line fix, it is the list of things
that were already green: the e2e spec that advanced to level-02 asserted the **id**, the **readiness
flag**, the **cleared banner** and the **persisted save**, and every one of those is a reading of
*state*. **None of them pressed a movement key.** Neither did the hands-on pass, which watched the
transition and then went back to the menu. Red-proved: with the reset removed, the new assertion
reports *"moved the player 0.0 px"*.

> The lesson, for the vault: a flow test that only reads state after a transition proves the
> transition, not the thing the player does next.

### The other two blockers

| Finding | Disposition |
|---|---|
| **BLOCKER — the spike sweep is EXISTENTIAL.** `reached > 0` passes with every elevated summit hazard strip disabled, because a plain walk cannot reach them: the test proved *a* hazard hurts, not that the authored ones exist | **APPLIED** — generalised `level-entities.test.ts`'s gid-partition from level-01 to all five levels, so every painted hazard cell is accounted for. Red-proved by stripping `hazard` from level-03's row-11 strip: the walk test stays **green**, the partition goes **red** — which is precisely the finding, demonstrated |
| **BLOCKER — a sentry reaches 640 px and the safety bar was 400.** `closestApproach` forced `chasing` only on scavengers, so for a turret it measured **spawn distance** rather than reach | **APPLIED** — `SENTRY_SAFE_PX = Math.max(SAFE_GAP_PX, SENTRY.radius)`, a per-kind margin derived from the enemy's own constant, and `safetyMargin` samples **every tick** instead of reading the end state. Red-proved with a committed 600 px sentry fixture that only the new bar catches: *"expected 600 to be less than 400"* |

### The three HIGH findings

| Finding | Disposition |
|---|---|
| **A refused `localStorage` regressed the player to level-01 forever**, while `writeProgress`'s own comment claimed the opposite *(C9)* | **APPLIED** — one module-level `unwritten` fallback at the seam every reader passes through, so a session whose write cannot land still resumes correctly. (Codex later attacked this fix; see finding #4a in [`../reviews/phase-08-impl.md`](../reviews/phase-08-impl.md)) |
| **ENTER held through "ALL LEVELS COMPLETE" replayed the finished level.** The OS auto-repeat carried into a menu whose `Key` object was a millisecond old with `isDown === false` | **APPLIED** — guarded on the native `KeyboardEvent.repeat` flag in `LevelSelectScene.bindKeys`, with an e2e gate for **both** directions: a held ENTER must not advance, a fresh press must |
| **The ramp could not see enemy COMPOSITION** — `enemy count` blesses a substitution that keeps the total | **APPLIED** — `sentry count` and `scavenger count` added as **free** metrics (the mix is a design choice, not a difficulty axis). Red-proved by swapping two of level-05's sentries |

### The medium and low findings

| Finding | Disposition |
|---|---|
| `levelBuilder.at(col, row)` had no bounds check, so an out-of-range column **wrapped onto the next row** and painted a tile at the far left, one row down — silently, in a `.tmj` that still validates | **APPLIED** — it refuses. Red-proved with `cols: 999` on level-01's wall; all five levels then regenerate **byte-identical** |
| The goal's "buried in a solid" rule asked whether any **one** solid contained the whole exit, and this generator emits a mass as one strip per row — so an exit walled into a two-rect mass validated | **APPLIED** — sampled against the **union** of solids, on a 5×5 grid of fractions. Committed `goal-inside-abutting-solids.fixture` passes the per-solid question and fails the union one. Red-proved by restoring the old form |
| `level-reach.test.ts`'s "asks for at least one deliberate jump" counted surface heights and floor holes **anywhere** in the level — a decorative ledge in a corner satisfies it while the route stays flat | **APPLIED** — replaced with: at `jumpVelocity: 0` the goal must be **UNREACHABLE**. Green on all five levels, red on all five when the shipped jump is restored |
| `world.tickCount` stops with the rest of the sim at completion, so `window.__game.tick` freezes and any `waitTicks` on a finished level hangs | **APPLIED as documentation** — stated in `goal.ts`, where the freeze is decided, because the freeze is correct and the trap is for whoever writes the next spec |
| The level-select scene key was spelled out in four files while a fifth exported a constant nobody used | **APPLIED** — one definition, `LEVEL_SELECT_KEY` in `gameLevelPick.ts`, re-exported where it is routed |
| `tick.ts` sat at exactly **400 of 400** lines | **APPLIED** — `advance()` is a **loop over** the numbered order rather than part of it, so it moved to `advanceSplit.ts` and is re-exported; the same split `world.ts` took. 14 lines of headroom |
| Stale prose named the retired level-01's geometry as current | **APPLIED** — corrected in `groundTiles.ts`, `hazards.ts` and `constants.ts`'s two caps |

---

## Brief 2 — the adversarial pass

Dispatched with brief 1's findings **withheld** *(A7)*, and it earned its keep: thirteen findings, and
the four sharpest are all the same shape — *a gate that is green for a reason other than the one its
name claims*.

### `voltagent-qa-sec:qa-expert`, adversarial

| Finding | Disposition |
|---|---|
| 🔴 **All four ramp properties pass on a level-05 that is a cosmetic reskin of level-04.** Non-vacuity only asks that the five levels differ *somewhere*; direction asks for `>=`; no-backslide and no-cliff both pass a change of **zero** | **APPLIED** — **property 0**: every *step* must raise at least one directional metric. "At least one", because two directional metrics are deliberately held at a measured ceiling |
| 🔴 **`progress-unlock.test.ts`'s closing sweep graded `resolveEntryLevel` by calling `isUnlocked`** — the predicate `resolveEntryLevel` itself uses to choose. True by construction for any implementation that calls it, however wrong the predicate: flip `at - 1` to `at + 1` and the sweep stays green while every level unlocks out of order | **APPLIED** — the rule is written out independently in the test: `at === 0 \|\| completed.has(order[at - 1])` |
| The `jumpVelocity` margin sweep ran under **one** gate seed while its own gate sweeps three | **APPLIED** — `it.each(GATE_SEEDS)`, all three |
| 🔴 **`TICKS_PER_ATTEMPT` was 300, justified by arithmetic** about the `from: 0.5` launch. The `from: 0.25` launch on the widest shipped strip — **5280 px**, in level-03 — needs ~440. The gate was green only because `from: 0.5` needed 293 and fit by **seven ticks** | **APPLIED** — 600, and the comment states the measurement rather than the arithmetic |
| `reportTable`'s line-count assertion (`table.split('\n').length`) is true by construction of the function under test, for any game data | **APPLIED** — deleted. Decoration wearing the shape of a gate *(C2)* |

### `voltagent-qa-sec:code-reviewer`, adversarial

| Finding | Disposition |
|---|---|
| 🔴 **HIGH — `LevelSelectScene` published nothing to `window.__game`**, so with the menu on screen the surface still read `sceneKey: 'Game'`, `ready: true` and a `levelId` for a level that was not loaded. ~40 specs stand on `bootToGame`, which asserts exactly that field — and the Phase 8 spec had quietly worked around it with `scene.isActive` | **APPLIED** — it publishes, and the spec asserts it. The workaround was the tell: a spec routing around the debug surface is a report that the surface is lying |
| **A dropped save entry was not ignored but ERASED** — the next write re-serialised only what survived the read, and that write lands on the next level start | **APPLIED** — `writeProgress` carries unparsed entries through untouched. They still unlock nothing: keeping the bytes is not honouring the claim in them. (This fix introduced Codex finding #1; see the review) |
| **`GOAL_PULSE_MS = 260` and `FADE_MS = 420` re-introduced the exact literal Codex blocked in `UIScene.ts`**: every duration is an integer count of 60 Hz ticks | **APPLIED** — both are tick counts now, converted through `ticksToMs`, halves included |
| 🔴 **Phaser's `Systems.start(data)` only overwrites `settings.data` when `data` is truthy**, so a bare `scene.start('Game')` re-delivers the payload from the **last** start — which since Phase 8 is a concrete `{ levelId }` | **APPLIED** — all four sites pass `{ levelId: null }` explicitly |
| **`GameScene`'s completion comment named `sampleHeldKeys`** as what stops a jump carrying into the next level. It runs *before* `advanceSplit`, so on that frame it cleared nothing | **APPLIED** — the claim was true, the named mechanism wrong, which is worse than no comment *(C9)*. The freeze in `tick()` is what does it, and that is now what the comment says |

### `voltagent-qa-sec:performance-engineer`, adversarial

| Finding | Disposition |
|---|---|
| 🔴 **8.7 read only `workMedianMs`. GPU time was sampled and discarded** — so the one cost a denser level actually incurs was unmeasured. Level-05 paints **3.7x** the tiles | ⚠️ **APPLIED, THEN REWRITTEN 2026-08-25.** The finding stands and is closed; the *remedy* named here does not. "Measures 0.51x against a 2x bound" was a ratio of two UNPAIRED medians-of-medians that was never red-proved, whose clean reading later swung 13x on one commit. It was briefly deleted, then rewritten as `MAX_LEVEL_GPU_DELTA_MS` — a paired absolute delta, chosen on three runs, confirmed on three held-out, red-proved at `tests/e2e/phase-08-gpu-delta.spec.ts`. GPU time is still gated, which is what this finding asked for. Record: [`phase-08-levels-03-gpu-bound.md`](phase-08-levels-03-gpu-bound.md) |
| **A median cannot see the synchronised sentry volley**, and level-05 fires three at once. `workP95Ms` was computed and never read | **APPLIED** — bounded at one whole 60 Hz frame. Level-05 measures 1.10 ms |
| 🔴 **Level CONSTRUCTION was entirely outside the sampled window** — `sample()` starts at the first frame after a 60-tick settle, by which time the O(area) tile walk has finished | **APPLIED** — and the first attempt was wrong in an instructive way: timing `scene.start` → `levelId` reported **4.6 ms for both levels, ratio 1.00x**, which is one animation frame, not construction. `installCreateTimer` wraps `create()` itself: level-01 **2.5 ms**, level-05 **2.6 ms** |
| **Criterion 6.9 (Phase 6's HUD GPU ratio) fails in a full GPU run** — 2.97x and 3.53x — and passes alone: 0.76x and 1.01x, with the off-arm median collapsing to the **0.035 ms timer floor**. The final verification run then **passed it at 1.059x**, with that same 0.034 ms sample still present in the off arm — so it passes and fails on one unchanged commit | 🔴 **RECORDED, NOT APPLIED.** Nothing in the Phase 8 diff touches the HUD draw path and every spec preceding it is unchanged, so it is not attributable to this phase. It belongs to the perf-gate session already scheduled between Phase 8 and Phase 9, beside 7.7's frame-loss half. **It is reported UNSTABLE, not green** — a gate that passes and fails on the same commit has stopped measuring, and the run that happened to pass does not close the question |

### The red proof that was itself flaky

Not a finding, but it belongs here because it is the shape of defect this brief exists to catch. 8.7's
committed red proof read **3.75x, then 2.43x, then 1.63x** — and 1.63x against a 2x bound is **red on
a clean build**. The mutation was too small against a 0.4–0.8 ms baseline, where Chrome's 0.1 ms
`performance.now()` coarsening is a fifth of the signal. At 30 000 copies it reads **8.20x** and
**10.25x**. A red proof that cannot reliably go red is the same defect as a gate that cannot, one
level up *(C2)*.

---

## What the six briefs cost, and what they bought

Two of the three blockers, and both of the "green for the wrong reason" gates, came from **brief 2** —
the brief that asks *how could this be wrong?* rather than *does this meet the criterion?* The
checklist brief found the frozen character; the adversarial brief found the five gates that had
watched it happen and reported success.

That is the *(A7)* argument in one phase: the second brief is not a re-run, and withholding the first
brief's findings is what keeps it from becoming one.
