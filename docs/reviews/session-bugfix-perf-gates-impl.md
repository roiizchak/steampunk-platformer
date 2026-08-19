# Codex implementation review — `session-bugfix-perf-gates`

Review **2 of 2** under [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
Review 1 (the plan) is in [session-bugfix-perf-gates-plan.md](session-bugfix-perf-gates-plan.md).

Run after all six gate-owner briefs and after the hands-on pass, so it reviewed the diff those had
already changed. `node_repl` + `fs.readFileSync` throughout — its sandbox cannot spawn processes on
this machine, permanently. **Every finding below was re-verified locally before being applied.**

---

## The review, verbatim

> 1. **Major — finding 6.** The disposition promises full body-vs-body geometry, but
>    `describePlacementProblem` removes `FOOT_TOLERANCE_PX` from the enemy body and then reuses that
>    shortened rectangle for hazards and gears as well as solids. A gear or hazard overlapping only
>    the lowest two pixels of the real enemy body passes the boot gate. The tolerance is justified
>    only for floor-like solids, not gear/hazard overlap.
>    `docs/reviews/session-bugfix-perf-gates-plan.md:64`,
>    `src/game/tiledPlacement.ts:101,107,117,122`, `src/sim/pickups.ts:60` (GEAR_BOX)
>
> 2. **Major — two disagreements remain.**
>    - Tolerance itself is the same number/units (2 world px) on both sides. The mismatch is that the
>      boot gate applies the shortened body to hazards and gears, while the sim's real scavenger body
>      stays the full `toWorld` rectangle. `src/sim/enemyGeometry.ts:133,143,149`,
>      `src/sim/enemyPlacement.ts:145,164`, `src/game/tiledPlacement.ts:107`
>    - "Inside" still differs deliberately: the gate rejects any overlap across the swept patrol span,
>      while `blockedAt` permits every step whose *previous* body already overlapped that solid. A
>      scavenger starting inside a wall and moving deeper can keep going through it — the boot gate
>      prevents that state in current level data, but the sim rule itself doesn't guard it.
>      `src/game/tiledPlacement.ts:44,57`, `src/sim/enemyGeometry.ts:150`,
>      `tests/unit/enemy-wall-collision.test.ts:209,213`
>    - At shipped speeds a thin wall can't be skipped in one step (body 120px wide vs. 2.5/6px steps),
>      but this isn't structural — `createScavenger` accepts unbounded speed overrides.
>      `src/sim/enemyPlacement.ts:94`, `src/sim/scavengerTuning.ts:77`,
>      `src/sim/scavengerFactory.ts:19,97`
>    - Swept-span scope also differs: the gate validates only the authored patrol beat; chase can
>      leave that span indefinitely, protected only by the per-step veto.
>      `src/game/tiledPlacement.ts:44`, `src/sim/enemyScavenger.ts:258`
>
> 3. **Major — `phase-06-perf.spec.ts`'s new absolute HUD guard.** Docstring claims shared HUD work
>    is bounded at 1 ms, but the assertion actually permits `16.67/3` ≈ 5.56 ms. A mutation adding
>    2 ms/frame to `GearLayer.sync()` or `renderHud()` would violate the named 1 ms budget while
>    staying under the actual coded ceiling in both A/B arms.
>    `tests/e2e/phase-06-perf.spec.ts:360,367,372`
>
> 4. **Major — `level-hazard-free.test.ts`'s header still repeats a withdrawn claim** that shipped
>    layouts were measured/sized against a 480px ceiling. The QA record corrects this: the two shipped
>    480px valleys launch from raised masses and clear spikes by ~737px, with width derived from mass
>    spacing, not the flat-ground ceiling. `shared.mjs` carries the correction; the test docstring
>    doesn't. `tests/unit/level-hazard-free.test.ts:10,14`,
>    `docs/qa/session-bugfix-perf-gates.md:105`, `tools/gen/levels/shared.mjs:35`
>
> 5. **Blocker — 6.9 ships another empirically lucky perf statistic.** Every inspected clean run
>    contains an individual pair exceeding the 0.2ms bound (up to 1.04ms); the median survived only
>    because spikes were sparse and differently signed. The gate-owner record leaves this open, and
>    the project's own testing rules name exactly this mistake as already made three times. Its
>    `scrim3` mutation is non-separating: recorded results include both 0.0983 (passes) and 0.3082
>    (fails). Most likely subtle shipment defect: a clean false red or a Phase-9 GPU regression hidden
>    by the same noise — not the level edits. `tests/e2e/perfBudgetRepaired.ts:42,57,71`,
>    `docs/qa/session-bugfix-perf-gates-02-gate-owners.md:151` (P4), `docs/TESTING-RULES.md:25,34`
>
> Codex could not verify branch identity, run generators, git, tests, the build, Playwright, or a
> browser — all findings above are file-evidence only and need local re-verification, per the review
> protocol.

---

## Triage

| # | severity | verified locally? | disposition |
|---|---|---|---|
| 1 | Major | **yes, and it was real** | **APPLIED.** |
| 2a | Major | yes — same defect as #1 | **APPLIED** with #1. |
| 2b | Major | yes, and it is deliberate | **RECORDED**, not changed. |
| 2c | Major | yes, not reachable from shipped data | **RECORDED.** |
| 2d | Major | yes, and it is the design | **RECORDED**, and the hands-on pass exercised it. |
| 3 | Major | **yes, and it was worse than stated** | **APPLIED**, with a new mutation and a measured bound. |
| 4 | Major | yes | **APPLIED.** |
| 5 | Blocker | partly — the *mechanism* is real, the *conclusion* was not measured far enough | **MEASURED, and the answer is data.** |

### 1 and 2a — the foot tolerance was on the wrong tests

Correct, and it was a real hole. `describePlacementProblem` built one box at
`h = box.h * RENDER_SCALE - FOOT_TOLERANCE_PX` and used it for hazards, gears **and** solids. The
tolerance has exactly one justification, recorded on the constant: every shipped enemy stands with
zero separation from its floor, so a full-height box reads its own floor as an obstruction. That
argument is about **floors**. Nothing legitimately touches an enemy's sole except the ground.

Applied: `swept` (full body) for hazards and gears, `sweptFeetClear` (short by the tolerance) for
solids only.

**Red-proved with a fourth committed fixture** *(vault C2)*. `hazard-under-an-enemy-sole.fixture` is
`enemy-standing-in-a-hazard.fixture` with one number changed — the hazard's `y`, 200 → 255 — so it
overlaps the **bottom pixel** of the sentry's body (feet 256, body 64…256). Reverting the hazard test
to the shortened box turns that row red and leaves all 37 others green: content changed, count down
by exactly one *(vault C12)*.

Nothing shipped was near the hole — the levels are tile-aligned and the live audit measured 204 px of
clearance — but the Element-Editor nudge the tolerance exists to permit is precisely the edit that
would open it.

### 2b — a body that starts inside a solid can move deeper

Verified, and it is the rule as designed. `blockedAt` is "newly entered, not overlapping" for a stated
reason: an overlap test breaks the `EVERYWHERE` fixture (`enemy-ai-scavenger.test.ts:35`) and would
have trapped a shipped enemy at boot. It is the **same rule** `resolveCollisions` uses for the player
(`wasLeft`/`wasRight`), so changing one without the other would put the two bodies on different
physics. Left alone, deliberately, and the committed fixture "a body that starts inside a wall walks
out rather than freezing" pins the half that matters.

### 2c — unbounded speed overrides could tunnel a thin wall

Verified: `createScavenger` accepts a speed override and nothing clamps it. Not reachable from shipped
data — a 120 px body against 2.5/6 px steps cannot skip anything, and every shipped tuning comes from
`scavengerTuning.ts`. Recorded rather than fixed; a speed clamp is a tuning-API change with no
present caller.

### 2d — the gate validates the beat, chase leaves it

Verified and by design: the gate answers *"is the authored placement clean?"*, the veto answers *"may
this step proceed?"*. The hands-on pass exercised exactly this — a **chasing** scavenger, far outside
its beat, stopped dead at a wall face (`docs/qa/session-bugfix-perf-gates-03-hands-on.md`).

### 3 — the absolute HUD bound claimed 1 ms and permitted 5.56

**Verified, and it was worse than Codex could see from the file.** The assertion had *no red proof of
any kind*, because `addScrims` cannot supply one — a scrim costs the CPU nothing, which is the whole
reason 6.9 asserts a GPU delta. So the one bound covering shared HUD work had never been shown capable
of going red at all.

Applied in three parts:

1. **A second committed mutation**, `addHudWork` — N ms of busy-wait per frame attached to the **Game**
   scene, so it runs in both arms and divides out of every ratio and the delta, leaving the absolute
   bound as the only thing that can see it. Codex's scenario, reproduced.
   🔴 The first version attached to `UI` and proved nothing: 1 ms injected read as a **7.600 ms
   delta** and tripped `MAX_HUD_WORK_DELTA_MS` long before the absolute bound.
2. **The ladder, measured:**

   | injected | `onWork` | at 5.557 | at 2.5 |
   |---|---|---|---|
   | clean | 0.400 / 0.500 / 0.500 / 0.600 | pass | pass |
   | 1 ms | 1.300 | pass | pass |
   | 2 ms | 2.450 | pass | pass ← the floor |
   | 3 ms | 3.300 | pass | **FAIL** |
   | 4 ms | 6.600 | **FAIL** | **FAIL** |

3. **`MAX_HUD_FRAME_WORK_MS = 2.5`**, chosen from the clean band's worst (0.9 ms) × ~2.8 — the factor
   this session's own two overfits measured — and **confirmed on three held-out runs** that had no say
   in it: `0.500 / 0.600 / 0.500`. Red proof committed at `hudwork3` (3.400 ms observed).

**Stated floor: about 2 ms of added shared main-thread work per frame still passes.** That is a real
limit, and it is **2.8× better than the 5.557 ms it replaces**, which needed a 4 ms/frame regression
before it noticed anything.

### 4 — the withdrawn 480 px claim

Verified: the qa-expert's finding B1 corrected the QA log and `shared.mjs` and did not reach
`level-hazard-free.test.ts`'s own header, which is the first thing a reader of that gate sees. Applied
— the header now says 480 px is what a **flat** run-up clears, that the shipped valleys launch from
raised masses and clear by 737 px, and that the tightest clearance across all 18 hazards is 316 px.

### 5 — 6.9's per-pair noise: measured further rather than argued

Codex is right that the *mechanism* is real, and it is already on the record: the performance owner's
own adversarial brief raised it as **P4, MAJOR, open**, and it stays open. But the conclusion —
"empirically lucky" — rested on three clean runs, and the answer to that is more runs, not a better
argument.

**Seven more clean runs:** `0.0266  -0.0010  -0.0072  0.0389  0.0824  -0.0143  0.0230`. Worst
**0.0824** — *under* the previous worst of 0.0835. The last three had no say in any bound.

That makes **23 clean runs in total, worst 0.0835, nothing above 0.09**, against a 0.2 ms bound — a
2.4× margin that has held across every run this project has made, with no false red observed.

On `scrim3`: Codex reads 0.0983/0.3082 as a non-separating proving mutation. It is not the proving
mutation — it is the **floor sweep**, and a floor sweep straddling the bound is what finding the floor
looks like. The committed red proof is `scrim5`/`scrim6` (0.67 ms, all ten pairs between 0.53 and
0.98). The record already states the consequence: **a HUD change under ~0.2 ms of GPU reads as a
pass, and Phase 9 is particles.**

**P4 stays open.** 23 runs is evidence, not proof, and closing it needs the spike's root cause (OS
scheduling, driver or thermal — unknown) or a statistic robust to a one-in-ten outlier by
construction.

---

## What Codex could not check

Its own words, and they are accurate: it could not verify branch identity, run the generators, git,
the tests, the build, Playwright or a browser. Findings 1, 3 and 4 were re-verified locally by running
the code; 2b/2c/2d by reading the cited lines against the tests that pin them; 5 by running seven more
clean GPU passes.
