# Phase 9 — Codex plan review (review 1)

← [reviews index](../PRD.md#the-codex-review-protocol) · prev: [Phase 8 plan](phase-08-plan.md)

**Run:** `/codex:rescue --wait --fresh`, 2026-08-20, before any Phase 9 code was written.
**Subjects:** `docs/prd/phase-09-polish.md` and the synthesized implementation plan
(`phase-09-plan.md`, session scratchpad).
**Prompt:** the review-1 prompt from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol),
plus the two questions §4 of the phase document names verbatim, plus one integrator question (Q8).
The `node_repl` + `fs.readFileSync` instruction was included; Codex read every named file and its
findings carry file-and-line citations, so the shell defect did not degrade this review.

---

## 1. The reply, verbatim

> 1. **Low — non-goal deliverables.** Section 1 requires capabilities, not section 5's exact file paths. Substantively, `src/render/effects.ts`, `src/render/screenShake.ts`, and both test files are architecture/verification machinery; the actual Phaser effects live in the non-deliverable `src/scenes/gameEffects.ts`. `src/sim/hitstop.ts` is the only directly-required listed path (9.1 requires hit-stop in the sim).
>
> 2. **False-green-capable acceptance criteria, ranked:**
>    - **Blocker — 9.5/9.6.** The anti-decoration check proves particles are alive in emitters, not that they reach the renderer; both perf criteria can pass with invisible/zero-scale/off-camera particles (`willRender(camera)` is the required check per `perfSampler.ts:212`, not existence/visibility/alpha alone).
>    - **Blocker — 9.1.** An integer deadline in `src/sim/` satisfies the wording even if the body still moves — the plan gates only tick steps 5–7 and leaves step 8 (`x += vx`, `y += vy`) unconditional in `tick.ts:314`.
>    - **High — 9.4.** Names a fade but the plan substitutes a tint/scale gear-icon pop; the real fade's handles are stopped individually but not force-settled.
>    - **High — 9.7.** Omits the vault's requirement that the fixture call the real gate; a duplicated test predicate can satisfy 9.7 while production is broken.
>    - Criteria 9.8–9.11 are doc/process checks and prove nothing about runtime behavior.
>
> 3. **High — vault item claimed but not satisfied.** The cited vault requires "a fade" to settle on stop/completion; the plan rejects doing that to `hudFade` and substitutes a gear-icon pop, mislabeling the substitution as satisfying it.
>
> 4. **Blocker — a maximum enemy count.** Criterion 9.5 requires "max enemies," but Phase 5's QA log (`docs/qa/phase-05-combat-08-gate-10.md:121`) found the fleet count is just a chosen multiple — neither sim nor level format caps concurrent enemies, and the plan never supplies this missing bound (it only bounds particles at 96).
>
> 5. **Blocker — hit-stop freezes velocity updates but not motion integration.** The design gates tick steps 5–7 (preserving velocities for knockback) but leaves step 8 unconditional in `tick.ts:314`, so a frozen player/enemy still slides via `x += vx`, `y += vy` every "frozen" tick.
>
> 6. **Low — no gameplay state is tween-sequenced.** Gear count is copied from sim state before any tween spawns (`UIScene.ts:299`); only decorative render-object lifetime (flying-gear destroy, icon pop settle) is tween-completion-sequenced.
>
> 7. **Blocker — no.** `getAliveParticleCount() > 0` proves emitter state, not draw submission; the `sprites`/`opaque` counts reference only `scene.enemies`, not particles. The sampler's own documented counterexample (`setScale(0)`, visible/opaque/counted, draws nothing) requires `willRender(camera)`.
>
> 8. **Blocker ruling — necessary but incomplete.** Freezing `combatCounter`/combat-state expiry and storing `swingStartTick` are both correct and required (otherwise hit-stop is a silent balance change invalidating generated art, and the derived swing identity breaks once the two counters decouple). Attack-edge consumption should stay live, as designed. But the plan is incomplete: `iFrameCounter` advances independently and isn't named for freezing, so player i-frames would still bleed during hit-stop unless it's frozen too. Recording this as a "known leak" instead is not acceptable — it ships the exact balance change `combatTiming.ts` forbids.
>
> **Not checked (no process execution available):** tests, the Task 0 contact-frame trace, actual browser rendering, and performance measurements — review is file-evidence only via `node_repl`/`fs.readFileSync`.
>
> Files referenced: `docs\prd\phase-09-polish.md`, the scratchpad plan, `src\sim\tick.ts`, `src\sim\combat.ts`, `src\sim\playerAttack.ts`, `src\sim\combatTiming.ts`, `src\scenes\UIScene.ts`, `tests\e2e\perfSampler.ts`, `docs\qa\phase-05-combat-08-gate-10.md`.

---

## 2. Triage

Every finding is applied or recorded with a one-line reason *(C11)*. Codex's findings are
file-evidence only and were **re-verified locally** before triage, per
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).

| # | Severity | Verified locally? | Disposition |
|---|---|---|---|
| **5** | Blocker | ✅ `tick.ts:314-318` — `player.x += player.vx` is unconditional | **APPLIED.** Fatal, and introduced by the plan's own decision to scope the `playerMotion.ts` extraction to steps 5–7. A frozen body would have slid at constant velocity for the whole freeze while every unit test asserting "position unchanged" passed **only** for a body whose `vx` happened to be 0. Plan corrected: the freeze gate covers **steps 5–8**, and the extraction takes 5–8 as originally proposed. Task 1 Step 1's fixture is changed to drive the hit **while running**, so a non-zero `vx` is in flight and the ungated integrate goes red. |
| **2a / 7** | Blocker | ✅ `perfSampler.ts:212-224` uses `willRender(camera)`, with a comment recording it as a prior Codex blocker (5.14) and naming the exact `setScale(0)` hole | **APPLIED.** The plan's anti-decoration check would have re-opened a hole this repo already closed once. `getAliveParticleCount()` is demoted to a supporting signal; the load-bearing 9.6 assertion becomes a per-particle `willRender(camera)` count, and `counts()` is extended to report it. |
| **8** | Blocker (ruling) | ✅ `combat.ts:226` advances `iFrameCounter` via `advanceWindow` inside step 4b | **APPLIED, and the §1.5 question is now closed.** Codex rules the recommendation correct and required, and explicitly rejects "record it as a known leak". Extended: `iFrameCounter` is frozen too. Attack-edge consumption stays live as designed. |
| **4** | Blocker | ⚠️ partially — `docs/qa/phase-05-combat-08-gate-10.md:121` not yet opened by the integrator | **APPLIED as a plan change, pending one verification.** 9.5 says "max enemies + max particles + shake". Particles are bounded by construction at 96; enemies are not bounded at all. Task 7 now pins the enemy arm to `DEV_FLEET_COUNT` (`perfBudget.ts:28`) as the declared worst case and **states in the QA log that no sim-level or level-format cap on concurrent enemies exists**, so "max enemies" means "the largest fleet this project measures", not "the largest possible". Adding a real cap is out of Phase 9's scope. |
| **2c / 3** | High | ✅ `hudFade.ts:161-168` destroys every target immediately after `killTweensOf` | **APPLIED, with a stated limit.** Both are done rather than one: the real fade's two tweens are held individually, `.stop()`ed, **and** force-settled in `onStop` and `onComplete`; and the gear-icon pop carries the observable 9.4 gate. The QA log records plainly that the `hudFade` force-settle is **not independently observable** on today's only call path, so the gear pop is where 9.4 can actually go red. Codex is right that substituting silently was mislabelling. |
| **2d** | High | ✅ vault 9.2's four-part rule is in `docs/lessons/phase-09-polish.md:18-22` | **APPLIED.** Task 7 and Task 1 Step 7 now state all four parts explicitly: pick the threshold from what is correct, commit fixtures on **both** sides, **the fixture must call the real gate**, and pin the threshold as a literal in its own assertion. The red-team task (Task 8) is given "a fixture that duplicates the predicate instead of calling it" as an explicit attack to attempt. |
| **1** | Low | ✅ by inspection of §5 of the phase doc | **RECORDED, not applied.** The deliverable paths are fixed by `docs/prd/phase-09-polish.md:37-38` and `tests/unit/docs-contract.test.ts` lints against the phase documents. The observation that `src/scenes/gameEffects.ts` carries the actual effects while the named deliverables carry the decisions is correct and is the intended layering (`CLAUDE.md §2` — `src/render/` is engine-free). No change. |
| **2e** | Low | ✅ | **RECORDED.** 9.8–9.11 being process checks is true and by design; 9.8's content is drafted in the plan's §7. No change. |
| **6** | Low | ✅ `UIScene.ts:299` copies gear count from sim state before any tween spawns | **RECORDED as a clean answer to §4's first named question.** No gameplay state is sequenced off a tween completion; only decorative render-object lifetime is. This is the answer that goes in the QA log against 9.2. |

**Net:** four blockers applied, two high applied, three low recorded. One blocker (#4) carries a
verification still owed — `docs/qa/phase-05-combat-08-gate-10.md:121` must be read before the QA log
records the "no enemy cap exists" claim as fact.

**What this review could not check**, and what therefore still owes evidence: the Task 0 contact-frame
trace, any test result, any browser rendering, and every performance number. All of it is
process-execution work and is owed to the QA gate, not to this review.
