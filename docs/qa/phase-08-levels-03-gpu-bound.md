# Phase 8 — criterion 8.7, the GPU bound

Flat sibling of [`phase-08-levels.md`](phase-08-levels.md), split at 435 lines per CLAUDE.md §6.
Holds the whole history of the GPU statistic: what shipped, why it was deleted, why that deletion
was wrong, and what replaced it.

---
### 🔴 The GPU ratio was never red-proved — deleted, then that deletion was REVERSED *(2026-08-25)*

**Two corrections in one day, and the second reversed the first. Both are recorded, because the
second is only legible against the first.**

#### What was wrong to begin with

`MAX_LEVEL_GPU_RATIO` shipped here as `median(largeGpu) / median(smallGpu)` against 2x, and the row
above claimed *"every bound red-proved."* **That claim was false for this one bound.** The red-proof
test in `phase-08-perf.spec.ts` asserts on the **work** ratio only — nothing in the phase ever showed
the GPU ratio could fail. The statistic was also the wrong shape: a ratio of two **unpaired**
medians-of-medians, over samples that are already index-aligned pairs from an AB/BA loop and are
simply never subtracted pairwise.

#### The measurement, and the conclusion drawn from it

Three same-page interleaved runs on `angle (nvidia, rtx 4080 ... d3d11)`, three pairs each:

| run | clean ratio | clean pairedDelta | skipCull ratio | skipCull pairedDelta | 60 UI scrims pairedDelta |
|---|---|---|---|---|---|
| 1 | 1.073x | +0.028 ms | 1.075x | +0.029 ms | *(not run)* |
| 2 | 0.097x | −0.243 ms | 0.845x | −0.019 ms | **+0.860 ms** |
| 3 | 1.304x | +0.045 ms | 0.598x | **−0.209 ms** | **+1.027 ms** |

`skipCull` did not move the GPU statistic — in runs 2 and 3 the mutant measured cheaper than clean —
while plainly landing on the main thread (median 0.50 → 1.20 ms, and 0.50 → 0.90 ms). The clean ratio
itself swung 1.073 / 0.097 / 1.304 on one commit, the 0.097 coming from two level-05 windows reading
**0.036 ms**.

⚠️ **That 0.036 was called "`gpuTimer`'s floor" throughout the first draft of this entry. It is an
INFERENCE presented as a fact, and it is downgraded here.** What was observed is two windows reading
the same small value while their neighbours read 10x more. The instability is measured; the mechanism
is a hypothesis nobody tested.

On that evidence the bound was deleted, under the owner's pre-approved branch *"rewrite to a paired
absolute delta, or DELETE if no GPU mutation orders it."*

#### 🔴 Why the deletion was WRONG

**Both perf briefs of the §10a agent round found the same critical flaw independently, and it holds
up: `skipCull` cannot move a rasteriser-time statistic at all.** Verified against the Phaser 4.2.1
sources in `node_modules` before acting — `CullTiles.js:41-47` widens the cull bounds to the whole
layer, and `RunCull.js:47` drops only tiles with `index === -1`. The ~1355 extra quads are therefore
submitted **entirely off-screen**: they cost vertex setup and draw-call overhead and generate **zero
fragment work**. A GPU timer reading them as free is the timer being right.

**So the null result measured the mutation, not the instrument.** And the same table already carried
the disproof: 60 scrims ordered the paired delta on every pair, never overlapping clean. The statistic
works on the class of cost the bound is about. The correct arm of the owner's branch was **rewrite**.

#### What shipped instead: `MAX_LEVEL_GPU_DELTA_MS = 0.5`

`medianPairedDelta(smallGpu, largeGpu)` — level-05 minus level-01 **inside each pair**, then the
median of those differences. Pairing is what kills the drift that made the ratio swing: the two arms
of a pair are seconds apart, the medians-of-medians are a whole run apart.

⚠️ **This changes 8.7's unit from a ratio to milliseconds**, on a box whose own spec header says
absolute figures are not trustworthy. The objection is answered by the delta being a difference taken
*inside* a pair: whatever the machine was doing during that pair is in both terms and subtracts out.
Same argument `medianPairedDelta`'s docstring makes, and the one G.7b shipped on.

**Chosen on one set, confirmed on a HELD-OUT set**, `chromium-gpu`, three pairs per run:

| set | run | per-pair delta (ms) | paired delta (ms) |
|---|---|---|---|
| choosing | 1 | 0.1321, 0.0276, 0.0266 | **0.0276** |
| choosing | 2 | 0.0850, 0.0266, 0.0256 | **0.0266** |
| choosing | 3 | 0.0748, 0.0297, 0.0266 | **0.0297** |
| held-out | 4 | 0.0532, 0.0276, 0.0256 | **0.0276** |
| held-out | 5 | 0.0389, 0.0287, 0.0276 | **0.0287** |
| held-out | 6 | 0.0645, 0.0276, 0.0256 | **0.0276** |

0.5 ms sits ~17x above the clean median and ~3.8x above the worst single pair ever observed. It is a
**refusal** bound in the sense `MAX_LEVEL_CREATE_MS` is — chosen to say what is unacceptable (half a
millisecond of extra rasteriser time, ~3 % of a 60 Hz frame) rather than fitted to what was measured.
Contrast the old ratio, whose clean reading spanned 13x; the paired delta spans **1.12x across six
runs**.

#### The red proof — `tests/e2e/phase-08-gpu-delta.spec.ts`

A flat sibling spec (the perf spec was at 334/400), same `PAIRS`, same AB/BA interleave, same
statistic. The amplifier is `addGameScrims` — full-viewport alpha rectangles on the **Game** scene,
which `sampleLevel` rebuilds per arm, so the cost lands in ONE arm. `scrimMutation.ts`'s `addScrims`
draws on `UI`, a parallel scene that survives every `scene.start`, and would have cancelled in both
arms — criterion 7.7's first audio toggle exactly.

⚠️ **60 was tried first and REJECTED, and that is the part worth keeping.** 60 Game-scene scrims read
per-pair **0.2703 / 1.8944 / 0.1495 ms** — a clear 10x lift over clean, but two of three pairs landed
under the bound and the proof reported **green**. The 0.8–1.1 ms figure that made 60 look sufficient
was measured on the *UI* scene, which is not the same amount of paint. 240 reads:

```
run A   per pair 1.7797, 1.9558, 1.6476  ->  paired delta 1.7797  (bound 0.5)   FAILED as intended
run B   per pair 1.7101, 2.0285, 1.6640  ->  paired delta 1.7101  (bound 0.5)   FAILED as intended
```

Every pair over the bound, the worst by 3.3x, against a clean paired delta of 0.027–0.030. The proof
also asserts the amplifier **added the display objects it claims to** — `addGameScrims` returns the
child-count delta — because a flat reading from a scrim that was never drawn is indistinguishable
from a bound that cannot fire.

Clean spec re-run after the proof: **3 passed**, gpu paired delta 0.0276 ms. Both directions, one
bound, one session.

#### What is NOT claimed

The bound says *"level-05's extra painted geometry may not cost half a millisecond of rasteriser time
per frame."* It does **not** say off-screen tile submission is free in general — that was measured on
one RTX 4080 under ANGLE/D3D11, on this level pair only, and a tile-heavy scene on weaker hardware
could plausibly pay for the vertex work `skipCull` adds. `MAX_LEVEL_WORK_RATIO` and
`MAX_LEVEL_WORK_MS` bound that main-thread half, and the surviving work red proof drives the work
ratio well past its 2x bound.

**Seven bounds, and six of the seven carry a committed red proof.** ⚠️ The exception is
`MAX_LEVEL_WORK_P95_MS` (16 ms), which no mutation in this phase reddens on its own — stated plainly
rather than covered by a blanket *"all red-proved"*, which is the sentence that made this whole entry
necessary. `MIN_GPU_SAMPLES`, `installGpuTimer` and `Sample`'s GPU fields are consumed by Phases 5, 6
and 8.

