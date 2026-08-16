# Phase 6 — what is left, and the decision on each

> ## ✅ RESOLVED 2026-08-16 — this document is now history, not a to-do list.
>
> Every item was worked in the session of 2026-08-16. Outcomes, evidence and the findings from
> eight gate-owner runs and a second Codex implementation review are in
> [qa/phase-06-hud.md §Session 2](../qa/phase-06-hud.md). In brief: **item 1 (the blocker) is
> measured**; items 2, 3, 4, 6, 7, 8, 9 fixed; item 5 **refuted — the hole did not exist**; item 10
> half done with DPR deferred; item 12 triaged with three Phase 4 items closed; item 13 deferred to
> Phase 9 as recommended. Phase 6 is marked ✅ done in PRD.md.
>
> Kept verbatim below because the questions it asked are the reason the answers exist.

← [HANDOFF.md](../HANDOFF.md) §16 · QA log: [qa/phase-06-hud.md](../qa/phase-06-hud.md) ·
reviews: [plan](../reviews/phase-06-plan.md) · [impl](../reviews/phase-06-impl.md)

**Branch `phase-06-hud`, 9 commits, not merged. Phase 6 is NOT done: criterion 6.9's frame-budget
half is unrun.**

State at handoff, all re-run after the last commit: typecheck clean · **1221 unit tests pass** ·
**1221 pass with Phaser uninstalled** (`test:sim-isolated`) · `npm run build` + `verify-dist` ok ·
**48/48 headless e2e** · **17/17 Phase 6 e2e on `chromium-gpu`** · port 5173 clear · Phaser restored.

Read this file, then decide each item below. Nothing here is started.

---

## How to use this document

Every item has **two options and a recommendation**. Item 1 is the only thing that blocks the phase
from being reported done; everything else is a choice about how much to buy before merging.

**Suggested order if you want the short path:** 1 → 11 → 12. **If you want the phase properly
closed:** 1 → 2 → 3 → 4 → 5 → 9 → 11 → 12.

---

## 1. 🔴 Criterion 6.9 — the frame budget. THE BLOCKER.

**What.** Nothing has measured what the HUD costs per frame. Phase 5's perf spec cannot: it is a
*ratio* between two halves of one page that differ only in enemy count, so a **constant** per-frame
cost — which is exactly what `UIScene.render()` and `GearLayer.sync()` are — appears in both the
numerator and the denominator and divides out to ~1×.

**Why it matters.** It is the one criterion that is unrun, and the project's rule is that a phase
with an unrun criterion is reported failing. Until this runs, Phase 6 cannot be marked done.

| | |
|---|---|
| **Option A — measure it properly** | A HUD-on vs HUD-off interleaved A/B on `chromium-gpu`, built on the existing `perfSampler.ts`/`gpuTimer.ts`. Same session, same page, alternating samples. ~1–2 hours. Answers the question and closes 6.9 honestly. |
| **Option B — declare it out of scope** | Amend the phase doc to say the frame budget is measured once, in Phase 9 (Polish), for the whole game rather than per phase. Zero work now, but it is a **scope change to a locked document** and needs your explicit sign-off, not mine. |

**I'd go with A.** The harness already exists and the answer is genuinely unknown — the performance
reviewer could not rule out that a second scene adds a full render pass and GPU batch flush.

---

## 2. The collect tween is never observed actually flying

**What.** The e2e proves a flyer object appears and is later destroyed. It does not prove it moves
*toward the counter*. Deleting the tween's `x`/`y` targets would still pass. *(Codex C3.)*

| | |
|---|---|
| **Option A — assert the trajectory** | Sample the flyer's position once per animation frame and assert it ends within a few px of the counter, and that it moved monotonically toward it. ~30 min. |
| **Option B — leave it** | The flyer is cosmetic; the counter is what the criterion turns on and that IS gated. Record as accepted. |

**I'd go with A.** Codex asked for this test to exist at all (plan finding F3) precisely because a
cosmetic thing with no gate is how the tween nearly shipped broken — and it *did* find a real
off-by-one on its first run.

---

## 3. The UI camera's viewport is never read

**What.** Criterion 6.3 asserts the layout numbers and `hudFits`, never the UI scene camera's actual
`width`/`height`. The no-cropping guarantee currently holds because **no explicit camera is ever
created** — an emergent property, not an assertion. *(Codex C4, and the qa-expert owner independently
from the other direction.)*

| | |
|---|---|
| **Option A — assert the camera** | Read `UIScene.cameras.main.width/height` in the resize e2e and assert it tracks `scale.gameSize`. ~20 min. Directly pins vault 6.2's blocker instead of relying on nobody doing the risky thing. |
| **Option B — leave it** | Nothing in the code creates a sized camera, so there is no live defect. Record as a dormant gap. |

**I'd go with A.** It is twenty minutes and it converts "we didn't do the dangerous thing" into "the
dangerous thing is now caught".

---

## 4. One "would actually be drawn" assertion is still a flag read

**What.** `phase-06-chrome.spec.ts`'s *"all three HUD objects would actually be drawn"* asserts
`willRender`, which a `Graphics` reports true even with an empty command buffer. Its sibling in
`phase-06-hud.spec.ts` was already converted to read the command buffer. *(Codex C5.)*

| | |
|---|---|
| **Option A — convert it too** | Same change already made once. ~15 min. |
| **Option B — leave it** | The 6.4 pixel test would still catch a deleted `drawHealth`. Record as redundant coverage. |

**I'd go with A.** Cheap, and the fix is already written one file over.

---

## 5. 🔴 A false green the suite still cannot catch

**What.** A unit test file that **fails to import contributes zero tests and the suite reports
PASS**. This phase lost six assertions that way (a test imported a Phaser-touching module) and it
was found only because the total dropped 1218 → 1213 between two runs.

**Why it matters.** This is not a Phase 6 bug. It is a hole in every gate this project has, and it is
the highest-value single thing available.

| | |
|---|---|
| **Option A — add a suite-level gate** | A meta-test that globs `tests/unit/*.test.ts`, and asserts each file's test count is ≥1 against a manifest, or a vitest config change that fails on an unimportable file. ~1 hour, needs a committed failing fixture to prove it can go red. |
| **Option B — leave it** | Record in the QA log (already done) and rely on noticing totals. |

**I'd go with A**, and it is the item I would keep even if you cut everything else. Every future
phase inherits this hole.

---

## 6. Nothing stops `UIScene` when `GameScene` exits to a dev scene

**What.** The only `scene.stop('UI')` is in `BootScene.refuseToRoute`. Pressing P/O/G starts a dev
scene, which stops `GameScene` and leaves the HUD frozen on top of it. *(code-reviewer brief 2 #6.)*

| | |
|---|---|
| **Option A — fix it now** | A `SHUTDOWN` handler on `GameScene` that stops `'UI'`. ~15 min, symmetric, and it is the fix a Phase 7 level transition or pause screen would need anyway. |
| **Option B — defer to Phase 7** | Dev-gated today, so no shipped path reaches it. |

**I'd go with A.** It is smaller than the note explaining why it was deferred.

---

## 7. The "gear buried in a solid" check lives in a test, not the validator

**What.** `describeGearProblem` checks bounds and point-ness. "Not buried inside a solid" is asserted
only in a unit test, and only against `level-01`. A hand-authored gear inside the floor of a *future*
level boots fine and is permanently uncollectable. *(code-reviewer brief 2 #8.)*

| | |
|---|---|
| **Option A — move it into the validator** | Add the burial check to `describeGearProblem` with a committed failing fixture. ~30 min. Every level gets it, not just the one that ships. |
| **Option B — leave it** | Only one level exists. Phase 8 adds levels and can own it. |

**I'd go with A** — Phase 8 is exactly when the fixture stops being hypothetical, and the validator is
already the right layer since the bounds check moved there this phase.

---

## 8. The e2e helpers race `UIScene.create()`

**What.** `bootToGame` waits on `window.__game.ready`, which is set in `GameScene.create()` — but
`scene.launch('UI')` is *queued*, so `UIScene.create()` has not run at that instant. Every Phase 6
spec's first `readHud` works because the CDP round-trip outlasts one Phaser step. *(code-reviewer
brief 2 #9.)*

| | |
|---|---|
| **Option A — wait on the HUD explicitly** | Add a `waitForFunction` on `scene.isActive('UI')` plus a defined `hudObjects().plate` inside `readHud`. ~20 min. Removes a latent flake. |
| **Option B — leave it** | Has never flaked in 17 runs. |

**I'd go with A.** Latent flakes in this project have historically been found the expensive way, and
`ready` is the declared terminal condition — it no longer covers the whole game.

---

## 9. Both criterion 6.4 e2e tests bypass the real per-frame call site

**What.** They pause `Game` and call `ui.render()` directly with a synthetic world. If `renderHud()`
were dropped from `GameScene.update()`, the player's real health bar would freeze in production and
every 6.4 test would still pass. *(qa-expert brief 2 #4 — the same shape as the Phase 5 defect that
started all of this, one call site over.)*

| | |
|---|---|
| **Option A — add one real-gameplay test** | Walk into the level's hazard, take real damage, read the drawn bar. ~40 min. Keeps the synthetic tests for the 99 hp case (which is unreachable by playing, since the smallest damage is 20 hp) and adds one that proves the wiring. |
| **Option B — leave it** | The synthetic tests prove the drawing; the counter's tests prove the scene calls into `UIScene` at all. |

**I'd go with A.** This is the closest thing on the list to the original defect repeating itself.

---

## 10. Criterion 6.7 is only tested on a letterboxed viewport

**What.** Centring is asserted at 1400×900 (taller than 16:9). A **pillarboxed** viewport (wider than
16:9, e.g. 2000×900) and a `deviceScaleFactor` other than 1 are both unexercised — and `autoRound`
floors CSS sizes, so DPR 1.25/1.5 (normal on this machine) could round asymmetrically. *(qa-expert
brief 2 #6.)*

| | |
|---|---|
| **Option A — add both cases** | One pillarboxed viewport and one DPR≠1 run. ~30 min. |
| **Option B — add the pillarboxed case only** | Cheap half. DPR is a Phaser-internals question that would need `ENGINE-NOTES.md` research first. |

**I'd go with B** for this session and note DPR as a Phase 9 item — the pillarbox case is the one
that catches a real regression to the double-centring bug.

---

## 11. 🔴 Three brief-2 reviews were not run

**What.** A7 requires **two briefs per agent-owned gate**, and the second is explicitly *not* a re-run
of the first. Run: `code-reviewer` ✅✅, `qa-expert` ✅✅. **Not run: `accessibility-tester`,
`performance-engineer`, `ui-ux-tester` brief 2.**

| | |
|---|---|
| **Option A — run all three** | ~40 min wall-clock in parallel, mostly waiting. Closes the A7 shortfall properly. The performance brief 2 pairs naturally with item 1. |
| **Option B — run performance only** | It is the one attached to the blocker. Record the other two as a knowing shortfall. |

**I'd go with A.** The project's own evidence for A7 is that a dedicated QA pass returned 8/8 PASS on
a diff an adversarial review then found three real defects in — and that happened again this phase,
in both briefs I did run.

---

## 12. Carried debt this phase did NOT close — and should have looked at

**What.** `docs/qa/phase-05-combat.md` says plainly: *"findings R1–R8 are recorded-not-fixed … and
Phase 4's open debt (4.2b, 4.16, 4.27) is not closed by this phase. **Both belong to whoever plans
Phase 6.**"* I did not address either. That is an omission in my planning, not a deliberate deferral.

| | |
|---|---|
| **Option A — triage it now** | Read R1–R8 and Phase 4's 4.2b/4.16/4.27, decide each: still true / fixed incidentally / genuinely deferred to Phase 7. ~45 min of reading. At minimum it stops the debt silently ageing another phase. |
| **Option B — push to Phase 7** | Add one line to the Phase 7 doc making it that phase's inherited debt. |

**I'd go with A**, at least the triage. Phase 4 is still marked "merged with known debt" and that
debt has now been handed forward twice.

---

## 13. Polish items, all optional

From the UI/UX reviewer, none a defect:

- The collect tween lands at alpha 0.25 with **no arrival punctuation** on the counter — two weak
  cues instead of one clear one. A small scale-punch on the counter text would fix it.
- The counter may sit **2–4 px high** relative to the gear icon: Phaser `Text` centres on a full
  ascent+descent box and digits have no descenders. Below what the evidence images could confirm.
- **3-digit zero padding** (`000`) may read as a placeholder if no level ever exceeds 99 gears.
  `level-01` ships 7.

| | |
|---|---|
| **Option A — do them in Phase 9 (Polish)** | That is the phase for it, and the counter question wants more levels to exist first. |
| **Option B — do the counter punch now** | It is the one that affects game feel rather than pixels. |

**I'd go with A.**

---

## 14. Merging, and marking the phase done

**Do not mark Phase 6 ✅ in `PRD.md` until item 1 is resolved.** `docs-contract.test.ts` will then
demand every criterion id appear in the QA log, which it already does.

| | |
|---|---|
| **Option A — finish the owed work, then merge** | The phase is reported done honestly. |
| **Option B — merge now with known debt, like Phase 4** | Phase 4 was merged **while reported failing** and its debt is still open two phases later (item 12). That is the precedent, and it is the argument against repeating it. |

**I'd go with A.**

---

## The short version

| Item | Recommendation | Rough cost |
|---|---|---|
| 1 — frame budget A/B | **Do it** (blocker) | 1–2 h |
| 5 — suite-level false-green gate | **Do it** (highest value) | 1 h |
| 11 — three brief-2 reviews | **Do it** (A7) | 40 min |
| 2, 3, 4, 6, 8, 9 — test and scene fixes | Do them | ~2.5 h total |
| 7 — gear burial in the validator | Do it | 30 min |
| 12 — Phase 4/5 carried debt | Triage at least | 45 min |
| 10 — pillarboxed centring | Half of it | 30 min |
| 13 — polish | Defer to Phase 9 | — |

**If you want one thing: item 1**, because it is the only one blocking the phase.
**If you want two: item 1 and item 5**, because item 5 protects every phase after this one.
