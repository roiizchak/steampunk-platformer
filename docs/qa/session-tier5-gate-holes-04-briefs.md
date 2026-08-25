# Session — Tier-5 gate holes, part 4: §10a, the QA gate's agent owners

Flat sibling of [`session-tier5-gate-holes.md`](session-tier5-gate-holes.md), split at 395 lines per
CLAUDE.md §6. Holds the owner round and everything it changed.

**Six briefs, three owners, two briefs each, brief 1's findings withheld from brief 2 *(A7)*.**

| criterion | owner | briefs |
|---|---|---|
| 8.7 | `voltagent-qa-sec:code-reviewer` ×2 + `voltagent-qa-sec:performance-engineer` ×2 | 4 |
| 9.2 / 9.3 | `voltagent-qa-sec:code-reviewer` ×2 | 2 |

⚠️ **Stated in the open, as it was last session:** these agents **cannot run Playwright and cannot
plant a mutation in a real `src/` file**. Every brief is source review. Every C1 red proof and every
C12 revert below is this session's own work, run locally, and **not one disposition rests on an
agent's summary.** Two of their findings were verified against the Phaser sources in `node_modules`
before being acted on, precisely because acting on them reversed a decision.

---

## The two findings that INVERTED my conclusions

Both were found by **both** perf briefs, independently, which is the strongest signal the round
produced.

### 🔴 CRITICAL — `skipCull` cannot move a rasteriser-time statistic, so §3a's null result tested nothing

I had deleted `MAX_LEVEL_GPU_RATIO` on the grounds that the mutation the bound names does not order
it. The briefs' claim: that mutation *cannot* order it, for a structural reason.

**Verified locally, in `node_modules/phaser/src/tilemaps/components/`:**

- `CullTiles.js:41-47` — when `skipCull` is true the cull bounds are widened to the whole layer.
- `RunCull.js:47` — the only tiles dropped are those with `index === -1`.

So the ~1355 extra quads are submitted **entirely off-screen**. They cost vertex setup and draw-call
overhead — main-thread work, which is exactly where the mutation *did* land (median 0.50 → 1.20 ms) —
and they generate **zero fragment work**. A GPU timer reading them as free is the timer being right.

**The disproof was already in my own table:** 60 scrims ordered the paired delta on every pair, never
overlapping clean. The statistic works on the class of cost the bound is about. The owner's
pre-approved branch was rewrite-or-delete and I took the wrong arm.

**Disposition: APPLIED — the deletion is reversed.** Full record in
[`phase-08-levels-03-gpu-bound.md`](phase-08-levels-03-gpu-bound.md).

### 🔴 HIGH — §1's block was ~4x too small, and "the phenomenon does not occur" is withdrawn

The briefs' arithmetic, derivable before the experiment ran: `smoothDelta` is a **10-frame mean**
(`TimeStep.js:386`, `deltaSmoothingMax` default 10; `:442`, `smoothStep` default true), so a two-tick
frame needs the *mean* delta over 16.67 ms — sustained sub-60 fps, not one spike. A 40 ms frame plus
nine ~4.3 ms ones is a 7.97 ms mean. And the positive control proved the *block landed*; it never
proved the *histogram can print `2:`*, so a histogram that has never reported ≥2 under any condition
was indistinguishable from one that cannot *(vault C2)*.

**Re-measured 2026-08-25**, 3000 frames per arm, sampling `loop.delta` — the delta `GameScene`
receives — and draining a 1/60 accumulator exactly as `frameClock` does:

| arm | max smoothed delta | max raw delta | tick histogram |
|---|---|---|---|
| clean | 7.9 ms | 30.1 ms | `0:1964  1:1036` — **never 2** |
| 150 ms block, 1 frame in 20 | 20.5 ms | 151.5 ms | `0:998  1:1706  `**`2:296`** |
| 150 ms block, 1 frame in 4 | 49.6 ms | 151.9 ms | `0:5  1:5  `**`2:1554  3:1436`** |
| 150 ms block, `smoothStep: false` | 151.4 ms | 151.4 ms | `0:1770  1:931  2:1  `**`4:114  5:184`** |

Every blocked arm stayed **under** the 200 ms substitution clamp, so the smoothing is the whole
mechanism — and the `smoothStep: false` arm is the positive control the first experiment lacked: it
proves the probe **can** print `2:`, `4:` and `5:`.

**Disposition: APPLIED.** *"The phenomenon does not occur"* is withdrawn from `ENGINE-NOTES.md` and
from `PRD.md`'s row 9. ⚠️ **The decision is unchanged and the reason is replaced.** Still no criterion
— but the objection is no longer *"unorderable"*, it is **attribution**: the only thing that produces
a multi-tick frame here is a main-thread block, a block is not a property of the game, and a bound
reddened by its amplifier rather than by the code under test is not a gate. The 12 625 production
frames measured across three runs, `ticks` never above 1 including on every one of the worst frames,
stand as the observation that ordinary play does not reach it.

⚠️ **The experimental probe was reverted**, per §1's own rule that a no-criterion outcome lands
measurements and nothing else. Only this table survives.

---

## Gate defects — seven, each red-proved locally

| # | defect | how it was watched red | disposition |
|---|---|---|---|
| 1 | `sim-mutator-manifest`'s vacuity guard guarded the **derivation**, never the manifest | moved all 32 names into `EXCLUDED` with a reason each → **1 failed, 7 passed**: only the new gate fired | APPLIED |
| 2 | its `ACCEPTS` fixture could not go red — the fake source set had no known mutator, so the transitive clause could not have fired **whatever it did** | disabled the clause → the repaired fixture fires; the old form could not | APPLIED |
| 3 | `perf-mutation-routing`'s mention check was satisfied by the spec's own **declaration** at `phase-09-perf.spec.ts:109` | deleted `:183`, the only line that READS `STORM_MUTATION` → red on the real rule; under `includes` it would have run clean | APPLIED |
| 4 | that gate's C2 proof re-implemented `String.includes` instead of driving the predicate | now driven through `appliesSymbol`, plus a declared-but-never-read fixture | APPLIED |
| 5 | `rootOf` (both copies) stopped at TS wrapper nodes: `world!.x = 0` rooted at a node with no `.name` and the write was **silently not a sim write** | removed the unwrap → the new fixture reds | APPLIED |
| 6 | `manifestGaps` used `EXCLUDED[n] === undefined`, so an export named `toString` would resolve on `Object.prototype` and read as excluded | `Object.hasOwn` | APPLIED |
| 7 | `phase-06-viewport`: a 0×0 canvas at the origin satisfies all four edge gaps and both overflow assertions | the filled axis must now cover >99 % of the client area first | APPLIED |

🔴 **Defect 5 is the dangerous direction** — a violation admitted, not a false red. Neither wrapper
form occurs in `src/scenes/` today, which is exactly why nothing would have said so.

### The import cycle

`tweenCallbacks.ts` ↔ `simMutators.ts`, **both value imports** — a real ESM cycle. Nothing had broken
only because `SIM_MUTATORS` is read inside a function body rather than at module evaluation, which is
luck about where a lookup sits rather than a property of the design; and `gen-import-cycles.test.ts`
does not cover `tests/unit/`. New leaf `astWalk.ts` owns `parseFile`, `walk`, `Node` and the shared
`ARRAY_MUTATOR_METHODS` list (which was maintained in two places and would have drifted in one).
`tweenCallbacks.ts` re-exports, so no consumer moved.

### `OPENS_A_TWEEN` was one method short of the manager

It matched `tweens.add` and `.add.tween(` only. Phaser 4.2.1's manager exposes **five** openings —
`add`, `addCounter`, `addMultiple`, `chain`, `create` — so a callback attached through `addCounter`
or `chain` was invisible to 9.3c's file filter. **This is the S3-3 defect repeating in the same
branch**: an enumeration written from the one call site in front of me rather than from the manager's
surface. Now enumerated, with a fixture covering all five plus the D14 form plus a bare-`add` refusal.

---

## Prose that was false, and is now not

| claim | correction |
|---|---|
| `phase-08-levels.md`: *"Six bounds remain, all of them red-proved"* | **Seven** bounds; **six** carry a red proof. `MAX_LEVEL_WORK_P95_MS` does not, and no mutation in the phase reddens it alone. The blanket is the sentence that made the whole GPU entry necessary. |
| *"`gpuTimer`'s floor"* | An **inference presented as fact**. What was observed is two windows reading the same small value while neighbours read 10x more. Downgraded to a hypothesis nobody tested. |
| *"On an RTX 4080 the off-screen quads are free"*, unscoped | Scoped: one GPU, ANGLE/D3D11, this level pair. Weaker hardware could plausibly pay for the vertex work. |
| 6.9's loaded-vs-isolated conclusion, *"far stronger than the four runs above"* | The loaded arm is **n = 1**. Four isolated runs establish the isolated reading is stable; nothing establishes the loaded one is. Restated as a hypothesis with a single supporting observation. |
| — | ⚠️ **And `MAX_HUD_GPU_DELTA_MS = 0.2` is still ARMED** and still known to false-red under load. Recorded, not fixed: it is Phase 6's criterion. |
| `phase-08-levels-02-gate-owners.md:104` said **APPLIED** for a remedy that no longer exists | **APPLIED, THEN REWRITTEN.** The finding stands and is closed; GPU time is still gated, by a different statistic. |
| `index.html` cited `phase-06-chrome.spec.ts` as the gate for the scrollbar fix | That is the spec that **missed** the defect. Corrected to `phase-06-viewport.spec.ts`. |
| `PRD.md:35` *"no bound exists **or will**"* | *"or will"* withdrawn — see the §1 re-measurement above. |
| `hud-layout.test.ts`: its three size cases cover *"the scaling, not one viewport"* | `hudLayout` is **homogeneous of degree 1** and never reads `gameW`, so the scaling is exactly what divides out — the three cases are one assertion written three times. Said plainly, and a new tripwire pins the homogeneity so they become load-bearing on the commit that ends it. Watched red under a minimum-font clamp. |
| a comment naming `gearIcon` where the code widens `counterInk` | corrected |
| five pointers naming `tweenCallbacks.ts` for symbols now in `tweenIdentity.ts` | corrected |

---

## Recorded, not closed

Each of these is a real narrowing with no live failure mode on this tree. Recorded per *(C11)* rather
than fixed, with the reason.

| item | reason |
|---|---|
| **A class field is not an alias source** for 9.2b. `private w = scene.simWorld` then `w.player.hp = 0` in a callback is not matched | every scene holds its world as `world` or `simWorld` — which is what `SIM_HANDLES` is for. No such field exists. |
| **A mutator called through a member expression** — `sim.damagePlayer(world.player, 1)` after a namespace import — is not matched | `src/` has no namespace import of `src/sim/`. Widening the callee match without the same identity resolution is how this rule was over-broadened once already. |
| `perf-mutation-routing`'s mention check is **still a text search** | it cannot tell a live read from a commented-out one. Disclosed in its own header; `appliesSymbol` is strictly stronger than `includes` and nothing more is claimed. |
| the **7 CSS px controls banner** at 852×480 | promoted out of an aside in the capture-round index: at the smallest supported size the on-screen controls hint renders at ~7 CSS px, which is below comfortable legibility. It is a **design** question, not a gate: nothing is off-screen, nothing overlaps, and `hud-spacing.test.ts` passes. Owner's call. |

## Files

| file | change |
|---|---|
| `tests/unit/astWalk.ts` | **new** — the leaf that broke the cycle |
| `tests/unit/hud-spacing.test.ts` | **new** — item 5.20, split out at 424/400 |
| `tests/e2e/phase-08-gpu-delta.spec.ts` | **new** — the GPU bound's red proof |
| `docs/qa/phase-08-levels-03-gpu-bound.md` | **new** — split at 435/400 |
| `tests/unit/simMutators.ts` · `sim-mutator-manifest.test.ts` | vacuity guard, `Object.hasOwn`, repaired fixture, wrapper unwrap |
| `tests/unit/perf-mutation-routing.test.ts` | `appliesSymbol`, and a C2 proof that drives it |
| `tests/unit/tweenCallbacks.ts` · `tweenIdentity.ts` · `tween-*.test.ts` | cycle, `OPENS_A_TWEEN`, wrapper unwrap, pointers |
| `tests/e2e/levelPerf.ts` · `phase-08-perf.spec.ts` | `MAX_LEVEL_GPU_DELTA_MS`, `addGameScrims`, the paired delta |
| `tests/e2e/phase-06-viewport.spec.ts` | the zero-size-canvas premise |
| `docs/ENGINE-NOTES.md` · `docs/PRD.md` · `docs/qa/phase-08-levels*.md` · `index.html` | the corrections above |
