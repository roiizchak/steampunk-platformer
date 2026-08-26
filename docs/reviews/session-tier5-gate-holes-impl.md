# Codex implementation review — `session-tier5-gate-holes`

**Model** `gpt-5.6-sol`, high effort · **fresh thread**, so it saw the diff cold rather than through
its own three plan rounds · **2026-08-25**

**Verdict: BLOCK — 11 findings.** All 11 are dispositioned below; **11 applied, 0 declined**.

⚠️ **Codex's sandboxed shell cannot spawn processes on this machine** (`CreateProcessAsUserW failed:
5`, permanent). The prompt directed it to the `node_repl` MCP tool with `fs.readFileSync`, so every
finding below is **file evidence only**. Each was re-verified locally before being applied, and every
C1 red proof and C12 revert in the disposition column is this session's own work, not Codex's — it
cannot run a test, detect greenness, or watch a mutation go red.

---

## The findings

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | HIGH | `MAX_LEVEL_WORK_P95_MS` had **no red proof**, while `docs/qa/phase-08-levels.md` recorded *"every bound red-proved."* A gate the record itself admits is unproved is decoration *(C2)*. | **APPLIED** — new `tests/e2e/phase-08-p95.spec.ts`. A 24 ms spike on 1 frame in 10, scoped to the level-05 arm, drives the p95 to 24.60–24.70 ms against a bound of 16 while the median (0.70 vs 8) and ratio (1.40 vs 2) stay under theirs, so the red is **attributable to the p95**. |
| 2 | HIGH | `collectGears` writes to a parameter reached through an alias and was **missing from `SIM_MUTATORS`** — the manifest's completeness gate could not see it. | **APPLIED** — fixed-point parameter-alias resolution in `tests/unit/simMutators.ts` (for-of, `const`, chained). `SIM_MUTATORS` 32 → 33. Red proof: the new alias test fails without the closure. |
| 3 | **BLOCKER** | The 9.3 **teardown** rule is not alias-aware and is not per-handle: it filters with the literal `OPENS_A_TWEEN` and merely asks whether the file contains *any* `.stop()`/`.destroy()`. So an aliased opener is skipped entirely, and *"a file with two tweens passes if any unrelated object is stopped."* | **APPLIED** — new `tests/unit/tweenTeardown.ts` + `tests/unit/tween-teardown.test.ts` (rule **9.3e**). `TweenOpening` gained `handle`; teardown is credited per NAME with an alias closure. Both false greens are **committed failing fixtures** that run the shipped rule beside the new one. Red proof below. |
| 4 | HIGH | The 9.2 scanner walked only literal arguments, so `const cfg = {…}; tweens.add(cfg)` returned **zero** callback bodies — reading as a file with no tween callbacks. 9.2 and 9.2b both blind. | **APPLIED** — `argsToScan()` in `tweenCallbacks.ts` resolves an `Identifier` argument one hop through the existing `decls` map. Red proof: reverting to `n.arguments` reds exactly the new fixture (1 failed, 15 passed). |
| 5 | HIGH | The GPU red proof used **full-screen scrims**, which are not the geometry the bound is about; the mutation did not resemble the cost under test. | **APPLIED** — replaced with `addGroundLayerCopies`, which rebuilds the level's **own** tilemap layer N times. 40 copies read a paired delta of **1.3025 ms** against a bound of 0.5. |
| 6 | MEDIUM | `PAIRS = 3` (AB/BA/AB) leaves an **order bias** intact under drift — the third pair is unbalanced. | **APPLIED** — `PAIRS` 3 → 4 in `levelPerf.ts`, and `ROUNDS` 3 → 4 in `exitCostBudget.ts` for the same reason. Also added a **two-sided** GPU bound; the lower side is an arm-collapse validity check, explicitly *not* a performance claim. |
| 7 | MEDIUM | The GPU delta could be computed from **too few samples** to mean anything, with no premise asserting otherwise. | **APPLIED** — `MIN_GPU_SAMPLES` premise asserted before the bound in `phase-08-perf.spec.ts`. |
| 8 | MEDIUM | `appliesSymbol()` matched the symbol inside **comments and string literals**, so a routing gate could be satisfied by a stray mention. | **APPLIED** — strips block comments, line comments and all three quote forms before matching, and removes the binding declaration. Fixtures for each false-positive shape; red-proved by deleting the stripping. |
| 9 | MEDIUM | `await tm.add(…)` read as **held**, excusing the exact fire-and-forget shape 9.3 exists to catch. | **APPLIED** — `await` and the TS wrappers are walked through as TRANSPARENT before the held question is asked. |
| 10 | LOW | The HUD homogeneity tripwire ran at **one** size, so a clamp outside that size was invisible. | **APPLIED** — now runs over every supported size plus 2160/1440/540/360/240. Red proof: a sub-540 clamp reds it. |
| 11 | MEDIUM | The catch-up decision rests on an **unverifiable probe**. *"Exactly as `frameClock` does"* cannot be checked — the probe source was deleted. And *"a main-thread block is not a property of the game"* is too strong: update/render work and GC are main-thread work. **The evidence supports "unattributed," not "non-game."** | **APPLIED, as a correction rather than a rebuild.** Both claims softened in `ENGINE-NOTES.md`, `PRD.md` row 9 and `docs/qa/session-tier5-gate-holes-04-briefs.md`: the probe **replicated** `frameClock`'s arithmetic and did not import `drainTicks`, so the table is evidence about **Phaser's smoothing** and not about our seam; the objection is **attribution by an injected amplifier**. A probe driving the production function belongs to whichever session actually pursues a catch-up bound — recorded, not built, because the no-criterion decision does not turn on it. |

---

## Finding 3's red proof, in full — the one that had to be watched twice

The claim has two halves, so it took two mutations. **The point of the second is that the shipped rule
stays GREEN on it**, which is what makes the finding a false green rather than a gap.

| mutation | shipped 9.3c | new 9.3e | result |
|---|---|---|---|
| `goalLayer.ts`: delete `pulse.stop()` (the file's only teardown) | 🔴 red | 🔴 red — names `goalLayer.ts: pulse` | 3 failed \| 23 passed |
| `hudFade.ts`: delete `linesTween.stop()`, **leaving `fadeTween.stop()`** | ✅ **green** | 🔴 red — names `hudFade.ts: linesTween` | 1 failed \| 25 passed |
| `unTornDown`: `!stopped.has(o.handle)` → `stopped.size === 0` | — | 🔴 red on the two-handle fixture | 1 failed \| 25 passed |

Every revert confirmed by *"content changed AND the original count dropped by one"* *(C12)*: `src/`
back to clean on `git status`, and 26 passed (26) restored each time.

---

## What Codex structurally could not verify, and said so

Its own list, unedited, and it is the reason the dispositions above are re-verified locally:

- It cannot run a test, so it cannot distinguish a gate that passes from one that selected nothing.
- It cannot plant a mutation and watch it go red — every C1 and C12 claim in this session is the
  session's own work.
- It cannot measure anything on the GPU, so findings 1, 5, 6 and 7 are **arguments about the design of
  a measurement**, not measurements. The numbers beside them were taken here.
- It cannot confirm a revert landed. Two false *"applied"* dispositions last session were found by a
  later reviewer, which is why each one above names the artefact that proves it.
