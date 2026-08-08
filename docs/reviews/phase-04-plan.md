# Phase 4 — Codex plan review (review 1 of 2)

**Ran:** 2026-08-08, before any code was written and **before any spend**.
**Invocation:** `/codex:rescue --wait --fresh`, first attempt — carrying the `node_repl` /
`fs.readFileSync` instruction from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** [phase-04-art.md](../prd/phase-04-art.md) and the execution plan at
`C:\Users\royko\.claude\plans\docs-prd-phase-04-art-md-let-s-continue-witty-wreath.md`, against
[PRD.md](../PRD.md), [FAL-MODELS.md](../FAL-MODELS.md), [STYLE.md](../STYLE.md),
[ASSET-PIPELINE.md](../ASSET-PIPELINE.md), [SOURCE-ANALYSIS.md](../SOURCE-ANALYSIS.md),
[lessons/phase-04-art.md](../lessons/phase-04-art.md), [LESSONS-APPLIED.md](../LESSONS-APPLIED.md),
[docs/qa/](../qa/), [docs/reviews/](.), and the Phase 1–3 source and test files.
**Repository state at review time:** Phases 1–3 merged to `main`. `tools/gen/` held only
`make-greybox-level.mjs` and `verify-dist.mjs`; `generate.ts`, `frames.ts`, `chroma.ts` and
`gates.ts` did not exist. `public/assets/` held one 32×32 `placeholder-tile.png`, one
`corrupt-fixture.png`, `index.json` and `levels/level-01.tmj`; `public/assets/config/` did not
exist. `src/scenes/GymScene.ts` did not exist. `GENERATION-LOG.md` recorded 21 generations / $1.68,
**all on the retired `nano-banana-2`** — nothing had been generated on either current endpoint.

**Scope split, recorded rather than implied.** Codex has **no network access** and therefore verified
**no fal.ai price, schema or licence claim** in this phase. It said so plainly and did not guess.
Those claims are verified separately through `genmedia` and, for cost, against the real invoice
*(vault 4.9)*. What Codex reviewed is **internal consistency and ordering**, which is where its
evidence is real.

Two questions beyond the standard five were asked because this phase's mistakes cost money: the
model swaps (which repository claims are still stated as measured fact but were measured on
`nano-banana-2` or Grok), and the cost model (whether any authorised spend is only safe if the
cheaper of two figures disagreeing by ~22× is the real one).

---

## The report, verbatim

1. **[Medium] Two section-5 deliverables exceed the section-1 goal.**

   - The enemy portion of `ASSET-MANIFEST.md` is Phase 5 planning: Phase 4 explicitly generates only player movement art and assigns enemies/combat sheets to Phase 5. [phase-04-art.md:16-27] [phase-04-art.md:106-108]
   - Extending `index.json` for future HUD and audio assets serves Phases 6–7, not Phase 4's character-art/Gym goal. [phase-04-art.md:7-14] [phase-04-art.md:108-109]
   - Tests/tooling are not counted as excess: the global QA and rebuild contracts require them. [PRD.md:64-73] [ASSET-PIPELINE.md:344-353]

2. **[Blocker] Several criteria can pass with broken shipped art, ranked:**

   - **4.13 and the whole gate can pass without the real character animating in `GameScene`.** The plan swaps `Rectangle` → `Sprite`, but section 6 has no criterion asserting the drawn texture/frame changes with sim state. Catalog/config consistency is not runtime integration; earlier phases already proved deleting render sync can leave debug-state tests green. [plan:250-255] [phase-04-art.md:111-138] [phase-02-impl.md:70-77]
   - No section-6 criterion covers the new tileset or three parallax layers — slicing/seam/scroll can be wholly wrong while every criterion passes. [plan:217-232]
   - **4.7 can pass by recomputing fps from a wrong `simTicks`** — its unit equation validates algebra, not whether the supplied duration matches the state. [phase-04-art.md:127] [plan:121-138]
   - **4.10 explicitly allows `INDETERMINATE`** — an audit can make no bounds determination and still pass. [phase-04-art.md:130-133]
   - **4.9 can verify `loop: true` + a motion floor while the wrap visibly snaps** — vault 4.23's real claim (whether the last frame follows the first) is never named as a criterion. [phase-04-art.md:129]
   - **4.3 records dimensions but does not require the resulting character frames to meet the published 96px true-size contract** — a consistently recorded wrong size passes. [phase-04-art.md:123]

3. **[High] Vault 4.21 is claimed but not actually gated.** It requires every art gate to self-test on synthetic fixtures before judging real art; the plan delivers only `chroma-gate.test.ts`, and criterion 4.5 narrows enforcement to chroma alone. Dimension, seed, frame-count, motion, loop, bounds and seam measurements run without proving their instruments fail. [lessons/phase-04-art.md:100-102] [plan:108-113]

4. **[Blocker] Phase 4 depends on a movement-animation timing contract no earlier phase produced.** Phase 2's state union is only `idle | run | jump | fall` — no `walk`, and no finite per-animation `simTicks`. [types.ts:37-41] Phase 3's own QA log recorded this exact gap and assigned it to Phase 4 gate 0 [qa/phase-03-tilemap.md:306-312], yet criterion 4.7 calls these "Phase 2's movement timings." [phase-04-art.md:127]

5. **[High] Most likely subtle failure: correct fps algebra applied to incorrect state durations** — a small frame skip/snap or persistent foot-slide that survives catalog and rebuild checks. Vault 4.22 already names this failure class. [plan:126-138] [lessons/phase-04-art.md:103-109]

6. **[High — live vault-4.11 violation] One stale model-swap measurement remains.** `SOURCE-ANALYSIS.md` still claims Seedance produces "~97 frames" (4s at 24fps) as a real gain, and repeats that premise in its oversampling argument, while the same document admits Seedance publishes neither fps nor frame count and that determining them needs a real clip + `ffprobe`. The 24fps basis actually belongs to the retired Grok model. [SOURCE-ANALYSIS.md:218-228,247-251,232-237] [FAL-MODELS.md:363-367]

7. **No internal cost blocker found.** The plan authorizes only one unavoidable $1.21 four-second probe before reconciliation, requires the actual invoice, and STOPs before any batch; its own ledger uses the *expensive* Seedance interpretation ($4.84 for four more animations) and still totals ~$10.4 under the $25 ceiling. [plan:192-208,287-302] fal.ai price/invoice claims themselves were not checked (no network access).

8. **[High] "No renumbering" is true, but the walk transition has an unlisted behavioral break.** `walkMax` at step 5 and `walkHeld` at step 11 fit the existing slots without renumbering. [tick.ts:11-24] But: with direction held, the horizontal function clamps `vx` to the new cap immediately, so pressing Shift while running snaps `vx` from `runMax` to `walkMax` in one tick; with direction released, the cap is never applied during friction, so `walk` can be published while `vx` still exceeds `walkMax`. The plan's tests cover only steady-state top speed, not either transition case. [player.ts:132-150] [tick.ts:181-187,232-236] [plan:91-102] Also flagged: `player.ts`'s own step-number comments (4/6/7/10) are already stale against the current authoritative header (11/5/6/9), and the plan doesn't note or fix this. [player.ts:118-133,152-167]

9. **[Blocker] The `simTicks` table does not satisfy vault 4.22.**
   - `jump = 18` is internally consistent with the tick order. [tick.ts:189-236]
   - `fall = 19` is off by one: `airtimeTicks` increments before checking `landed`, so the pinned 37 includes the landing tick, which is already grounded — `37 − 18` misallocates one non-fall tick to the fall animation. [derived.ts:64-79] [tick.ts:213-236]
   - `run`/`walk` are derived from art-measured stride divided by sim speed, not from any Phase-2 state window, with no stated integer-tick rounding rule despite every duration being required to be an integer tick count. [plan:126-138] [PRD.md:60-61]
   - `idle = 90` is explicitly authored (1.5s); back-computing fps from it does not make it simulation-derived — it's a flat authored period wearing a `simTicks` label. [plan:132-138]

   Vault 4.22 requires timing derived from the simulation across the whole class; honest `derivedFrom: 'authored'` provenance labels disclose the violation but don't cure it. [lessons/phase-04-art.md:103-109]

**Not checked (no network access):** all fal.ai pricing, schema, and licence claims, including the Seedance 2 price discrepancy's actual magnitude.

---

## Triage

Every finding applied or rejected with a one-line reason *(C11)*. Findings were applied to the plan
**before** it was approved and before any code was written or any money spent.

| # | Severity | Disposition |
|---|---|---|
| 2 | Blocker | **Applied.** Eight criteria added to §6 — 4.19 the drawn sprite tracks the sim, 4.20 loop-wrap continuity, 4.21 the 96 px true-size contract, 4.22 no foot-slide, 4.23 exact 32 px tileset slicing, 4.24 parallax seam and scroll factors, 4.25 the walk velocity invariant, 4.26 every gate self-tests. 4.10 and 4.7 tightened rather than added. |
| 4 | Blocker | **Applied.** 4.7 said the timings come from "Phase 2's movement timings"; they do not exist. Reworded to name **gate 0** as their producer, which is what CLAUDE.md already said and what [qa/phase-03-tilemap.md](../qa/phase-03-tilemap.md) assigned here. |
| 9 | Blocker | **Applied.** `fall` is now **counted** from the real sim rather than obtained as `37 − 18`; the integer-rounding rule for `run`/`walk` is stated, with fps re-derived from the rounded integer; `idle` is recorded as an explicit C11 exception rather than dressed as derived. See the note below. |
| 3 | High | **Applied.** `tests/unit/art-gates.test.ts` added beside `chroma-gate.test.ts`, and criterion 4.26 widens fixture self-testing from the chroma gate to every gate in `gates.ts`. |
| 5 | High | **Applied.** Criterion 4.22 (no foot-slide) is the physical observable for exactly this failure — correct algebra on a wrong duration shows up as the feet sliding against the ground. |
| 6 | High | **Applied.** A live vault-4.11 violation, and the reason question 6 was asked. Corrected in SOURCE-ANALYSIS.md §6c. See the note below. |
| 8 | High | **Applied.** Both transition cases fixed and given their own tests; the stale step-number comments in `player.ts` corrected against `tick.ts`'s authoritative header. |
| 1 | Medium | **Rejected, with reason.** The enemy manifest and the `index.json` schema extension are named deliverables in [phase-04-art.md](../prd/phase-04-art.md) §5 (`:106-109`), and both were confirmed by user decision this session. Dropping them because they serve Phases 5–7 is precisely the surprise-a-later-phase failure criterion 4.0c exists to prevent — the manifest's stated purpose is *"so Phase 5 and Phase 6 are not surprised by a missing sheet"*. |
| 7 | — | **No action needed.** Confirms no authorised spend depends on the cheaper Seedance figure. Recorded because a reviewer finding nothing is evidence too. |

### On finding 9 — `fall` is counted, not subtracted

Codex could run nothing, so its arithmetic claim is re-verified locally rather than taken on trust,
per the standing rule. The fix does not depend on who is right about the off-by-one: `fall`'s
duration is obtained by **instrumenting the real sim in `src/sim/derived.ts` and counting the ticks
whose published state is `'fall'`**, using the same scratch-world technique that file already uses
for `airtimeTicks` and `apexPx`. `37 − 18 = 19` becomes a prediction to check the count against, not
the source of the number. A derivation that cannot be wrong by one is better than a corrected
subtraction.

`idle` is the honest remainder. There is no simulation window governing a breathing loop, and vault
4.22 exists to stop art outrunning a **timed** move — its blocker evidence is *"every light attack
had 0.43 s of art over a 0.25–0.27 s move, so the strike was never drawn"*. `idle` has no such
window to outrun. It is recorded in [qa/phase-04-art.md](../qa/phase-04-art.md) as a deliberate
non-fix with that reason, per C11, rather than being labelled derived. Codex is right that a
provenance field discloses without curing; the disclosure is the point.

### On finding 6 — the "~97 frames" claim

SOURCE-ANALYSIS.md §6c listed *"A 4-second clip is ~97 frames at 24 fps versus Grok's ~25"* among
Seedance's **gains**, while §6c's own losses list says the opposite: *"The output schema publishes
no `fps` and no `num_frames`… Seedance's frame rate is now an unknown that only a real clip and
`ffprobe` can answer. Do not assume 24 fps."* The 24 fps basis belongs to the **retired Grok
model**, whose schema did publish it. One document, two contradictory claims about the same number,
with the wrong one stated as a gain — a textbook vault-4.11 violation, and one that would have
propagated into the frame-resampling maths. Corrected to unknown-pending-`ffprobe`, and gate 4.2c
already exists to measure it.
