# Codex implementation review — the flush-seam fix + the diagnostic bundle

**Reviewer:** codex-cli, config default · read-only sandbox · `node_repl` + `fs.readFileSync` only
(its shell cannot spawn processes here). 2026-08-28, against tip `252d9cd`.

**Verdict: BLOCK** — and it was right on all four findings. Every one re-verified locally against
the source before anything was changed; none was taken on the review's word.

| # | finding | disposition |
|---|---|---|
| 1 | `?pin=1` never enforced its documented 500 ms wall-time condition | **Applied.** `STALL_MS` was exported and compared by nothing. The claim is deleted, not the code made to match it: wall time was the *unsound* half, and `MIN_STALL_TICKS` already measures what it was a proxy for. The ms figure is now labelled on screen as shown-never-compared. |
| 2 | `boundsClamp` was an unreachable classifier result | **Applied.** `clampToBounds` now returns whether it fired, the trace carries it, and `classify()` branches on it **above** `geometry`. Without this a player at the world edge was reported `cause=geometry` — the exact label three shipped misses were built on. |
| 3 | `mergeStrips` did not implement its documented survivor-index contract | **Applied.** The inner loop starts at `i + 1` and merges adjacency in either direction; the survivor is `out[i]` by construction. Shipped data was safe only by accident. Levels regenerate **byte-identical**. |
| 4 | a throwing trace observer could leave the world mutated but unstamped | **Applied.** `emitTickTrace` wraps the callback. A diagnostic may not break what it diagnoses. |
| 5 | docs said "four times" while the record said five | **Applied.** The quote is the owner's verbatim wording and stays; the surrounding prose now says so. |

**Red-proofs, all watched failing then reverted green** *(C1, C12)*:

| mutation | result |
|---|---|
| remove the `boundsClamp` branch | `1 failed \| 5 passed (6)` — *the world edge is named, not blamed on the level* |
| remove the `try/catch` in `emitTickTrace` | `1 failed \| 5 passed (6)` — *a throwing observer cannot damage the simulation* |
| restore the geometry-only survivor rule | `1 failed \| 11 passed (12)` — *the survivor moved when the input was permuted* |

Each dropped the pass count by exactly one and named the intended spec — not "the exit code was
non-zero".

**What the review confirmed rather than faulted** — worth as much as the findings: the merge invents
no collision (it reconstructed the unmerged strips and compared tile-aligned unions against all five
shipped `.tmj` files: zero cells added or removed), the seam gate genuinely goes red on a same-top
different-height pair, the 60-tick behavioural window is not vacuous, the synthetic fixture
reproduces the real collision topology, and the 14-step tick contract is unrenumbered.

**Regression after applying all five:** unit **2741/0** (187 files), typecheck clean, build ok
(5 levels + 12 audio byte-identical, no dev symbol in the bundle), sim-isolated 2737 + 4 skipped,
e2e **150 passed**, ports 5173/4173 freed.

---

## The review, verbatim

BLOCK: the seam-removal geometry is sound, but the diagnostic bundle makes two false cause/timing claims.

## Findings

1. **High — `?pin=1` does not enforce its stated 500 ms wall-time condition.**  
   `createStallDetector()` reports after 24 ticks—about 400 ms—but the observer immediately records that incident at [devPinProbe.ts:149](<C:/Claude/Steampunk Platformer/src/scenes/devPinProbe.ts:149>). `STALL_MS` is only accumulated and displayed later at [devPinProbe.ts:159](<C:/Claude/Steampunk Platformer/src/scenes/devPinProbe.ts:159>); it never gates the incident. A dropped-tick frame resets `stallMs` after an incident may already be displayed. Therefore the documented requirement that both 500 ms and 24 ticks be satisfied is false.

2. **Medium — `boundsClamp` is an unreachable classifier result.**  
   `StallCause` advertises `boundsClamp` at [stallAnalysis.ts:33](<C:/Claude/Steampunk Platformer/src/sim/stallAnalysis.ts:33>), but `classify()` has no branch returning it and labels any otherwise-unexplained grounded stop `geometry` at [stallAnalysis.ts:87](<C:/Claude/Steampunk Platformer/src/sim/stallAnalysis.ts:87>). The clamp runs and zeroes velocity at [tick.ts:269](<C:/Claude/Steampunk Platformer/src/sim/tick.ts:269>), but the trace schema carries no clamp attribution ([trace.ts:66](<C:/Claude/Steampunk Platformer/src/sim/trace.ts:66>)). Holding toward a grounded world boundary can therefore produce a false `geometry` incident.

3. **Medium — `mergeStrips` does not implement its documented order/identity contract generally.**  
   The comment says the earlier strip survives ([mergeStrips.mjs:38](<C:/Claude/Steampunk Platformer/tools/gen/mergeStrips.mjs:38>)), but the code only merges when `a` is geometrically left of `b` ([mergeStrips.mjs:55](<C:/Claude/Steampunk Platformer/tools/gen/mergeStrips.mjs:55>)). If a right-hand strip appears earlier, a later left-hand strip deletes it via `splice(j, 1)`. With unrelated objects between them, this can also reorder merged components and therefore alter Tiled IDs after permutation.  
   The current shipped spawn contract is nevertheless safe: the first strip begins at `x=0`, so no valid positive-width strip can abut it from the left, and all five shipped spawn points remain on solid object 0.

4. **Low — a registered trace observer can interrupt or mutate simulation.**  
   Trace delivery invokes arbitrary callback code synchronously ([trace.ts:156](<C:/Claude/Steampunk Platformer/src/sim/trace.ts:156>)) before step 14 increments the tick counter ([tick.ts:357](<C:/Claude/Steampunk Platformer/src/sim/tick.ts:357>)). A callback that throws leaves the already-mutated world without its tick increment; a callback that closes over `world` can mutate it despite the primitive-only payload. The current pin-probe callback itself only updates diagnostic state, but the exported seam is not behavior-transparent in every registered path as documented.

## Axis results that held

- **Merge geometry:** For positive rectangles, the restart loop eventually merges every exact same-`y`, same-height abutting chain. It neither merges gaps/overlaps nor misses a reversed-input adjacency. It shallow-clones every input object before changing widths, so it does not mutate the supplied array or its top-level objects. Its geometric partition is permutation-invariant; its returned sequence and survivor identity are not.

- **No invented collision:** I reconstructed the unmerged strips from the level sources and compared their tile-aligned occupied regions with all five shipped `.tmj` solid unions. There were zero added or removed cells.

  - Level 02’s `x=7872,w=384` and `x=8256,w=672` strips become exactly `x=7872,w=1056` ([level-02.tmj:2785](<C:/Claude/Steampunk Platformer/public/assets/levels/level-02.tmj:2785>)).
  - Level 03’s `x=9984,w=768` and `x=10752,w=672` strips become exactly `x=9984,w=1440` ([level-03.tmj:3297](<C:/Claude/Steampunk Platformer/public/assets/levels/level-03.tmj:3297>)).
  - Levels 01, 04, and 05 have unchanged unions and object counts.

- **Regression gate:** The static assertion deliberately ignores height when detecting seams ([no-flush-seams.test.ts:55](<C:/Claude/Steampunk Platformer/tests/unit/no-flush-seams.test.ts:55>)), so it does go red for a same-top, different-height pair. It reads eager raw imports from the shipped directory, not frozen copies.

- **Behavioral window:** It is not vacuous. Even if trace reporting silently failed, the final displacement must exceed 400 px ([no-flush-seams.test.ts:114](<C:/Claude/Steampunk Platformer/tests/unit/no-flush-seams.test.ts:114>)). Both starts are immediately before their former seams and 60 ticks leave enough time to reach the seam, accumulate 24 stalled ticks, and remain short of the next authored obstacle.

- **Synthetic stall fixture:** It reproduces the real collision topology and ordering: left slab followed by right slab, identical top and height, exact boundary, grounded rightward approach ([stall-detector.test.ts:78](<C:/Claude/Steampunk Platformer/tests/unit/stall-detector.test.ts:78>)). Its dimensions differ, but none of those differences alter the horizontal-latch mechanism. Because it bypasses the builder, it would still catch the resolver bug if shipped flush geometry returned.

- **Tick contract:** The numbered order remains step 12 → extracted step 13 → trace → step 14 ([tick.ts:341](<C:/Claude/Steampunk Platformer/src/sim/tick.ts:341>)). The extracted function advances the same two independent counters ([tickWindows.ts:42](<C:/Claude/Steampunk Platformer/src/sim/tickWindows.ts:42>)). Pre-increment trace attribution is correct and consistent with the sim’s zero-based tick stamps.

Documentation also still says the owner reported the defect four times in three scoped files, while the supplied incident record says five.

Could not check: tests, typecheck, build, runtime behavior, git state, branch name, or commit identity. No processes or git commands were run.

