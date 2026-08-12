# Phase 5 — Codex IMPLEMENTATION review (criterion 5.14)

**Invocation:** `/codex:rescue --wait --resume`, carrying the `node_repl` + `fs.readFileSync`
instruction (the sandboxed shell cannot spawn processes on this machine — `CreateProcessAsUserW
failed: 5`, permanent).
**Run:** 2026-08-12, session 7, against HEAD `de44c69`, after every §6 agent owner had run.
**Verdict: BLOCK — 6 blockers, 2 major, 2 minor.**

This is the second of the two mandatory Codex reviews; the plan review is in
[phase-05-plan.md](phase-05-plan.md). It ran **after** the agent owners, because applying their
findings changes the diff being reviewed.

---

## The review, verbatim

> **BLOCK — Phase 5 is not complete or shippable.** Criteria 5.2, 5.4, 5.8, 5.11, and 5.12 are unsatisfied; inherited criteria 4.10 and 4.12 remain unrun. PRD policy requires such a phase to be reported failing. (`docs/PRD.md:73`)
>
> ## Findings
>
> 1. **BLOCKER — Criterion 5.4 has never been run against the newly shipped walk sheet.** The browser spec explicitly excludes 5.4 because `rust-scavenger-walk` supposedly "does not exist yet," but it now ships as a 12-frame looping catalog row. The unit test only proves stable animation-key selection; it explicitly says the real frame-0 failure requires Playwright. The final QA table omits 5.4 entirely. (`tests/e2e/phase-05-combat.spec.ts:1`, `public/assets/index.json:114`, `tests/unit/enemy-layer-catalog.test.ts:16`, `docs/prd/phase-05-combat.md:144`)
>
> 2. **BLOCKER — Criterion 5.8 remains unrun at true sprite size.** The only repository status says the screenshot was taken on the grey box and must be redone once art lands. No corresponding screenshot or final 5.8 verdict exists, even though the criterion specifically requires a true-size screenshot against a cool background. (`docs/HANDOFF.md:70`, `docs/prd/phase-05-combat.md:152`)
>
> 3. **BLOCKER — The two deferred scavenger defects should block completion.** Chase direction has no dead zone, so an unreachable player can reverse `facing` every tick; rendering consumes that flag directly. Chase also returns before the patrol-bound clamp, allowing the recorded 200px release snap. Both contradict the phase goal of a functioning patroller/chaser, and the QA log itself says S1 "must not be shipped unfixed." (`src/sim/enemyScavenger.ts:117`, `:121`, `src/render/enemyView.ts:123`, `docs/prd/phase-05-combat.md:7`, `docs/qa/phase-05-combat.md:722`)
>
> 4. **BLOCKER — Criterion 5.11 is measured and failing, and its automated assertion can pass a materially deleted render path.** Recorded performance is 55.70–82.10ms median, ~12–18fps against 60fps. The test permits `<100ms` and counts bodies without checking `isSprite`; replacing every fleet sprite with the cheaper Rectangle fallback still satisfies the body-count assertion. (`docs/qa/phase-05-combat.md:771`, `tests/e2e/phase-05-combat.spec.ts:174`, `:231`, `src/scenes/enemyLayer.ts:38`)
>
> 5. **BLOCKER — Criterion 5.12 and the global 400-line rule fail.** Eight over-limit project files exist, none justified. The test only enforces `over.length <= 10`, leaving two free slots, so a green suite does not mean the criterion passes. (`docs/PRD.md:62`, `docs/qa/phase-05-combat.md:796`, `tests/unit/file-size.test.ts:61`, `:78`)
>
> 6. **BLOCKER — Carried debt criteria 4.10 and 4.12 remain unrun.** `gateReachBand` still has no real-sheet call; the new G5 reach-window gate does not substitute for the different 4.10 box-vs-art audit. `findSource`'s deliberate-removal execution and log entry are still absent. (`docs/prd/phase-05-combat.md:35`, `:53`, `tests/unit/art-gates.test.ts:166`, `tools/gen/gatesSelfTest.mjs:134`, `tools/gen/assetSources.mjs:21`)
>
> 7. **MAJOR — Invalid per-action `scale: null` silently bypasses the new provenance contract.** Resolution uses `actionScale ?? scale`, but assigns `scaleSource: 'action'` whenever the value is merely non-`undefined`. JSON containing `"scale": null` silently adopts the slug scale and is persisted as a valid finite action-sourced override; the direct writer test for null doesn't exercise this resolution path. Current committed profiles are valid and migration was otherwise lossless. (`tools/gen/build-assets.mjs:187`, `tools/gen/catalogWrite.mjs:101`, `tests/unit/lift-profile-write.test.ts:130`)
>
> 8. **MAJOR — Two named tests survive deletion of the behavior their names claim.** "patrol and chase speeds are independently tunable" changes only `patrolSpeed`, so deleting `chaseSpeed` use from chase movement leaves it green (separate knob sweep is the real coverage). (`tests/unit/enemy-ai.test.ts:134`, `tests/unit/enemy-tuning.test.ts:74`) "the sentry dies in fewer hits" never attacks either entity — it compares `maxHp` arithmetic only, so deleting enemy damage application entirely leaves it green. (`tests/unit/player-attack.test.ts:165`, `:174`)
>
> 9. **MINOR — The split-cycle fix is complete for the three new splits, but the generator graph isn't cycle-free overall.** A separate `motion → motionCombat → motion` cycle remains: `motion.mjs` imports `COMBAT_MOTIONS` while `motionCombat.mjs` imports `poseSpan` back. Currently load-safe (function declaration), but TDZ-fragile under future edits. (`tools/gen/motion.mjs:57`, `tools/gen/motionCombat.mjs:25`, `tools/gen/gatesSelfTest.mjs:9`)
>
> 10. **MINOR — Corrected size evidence has already drifted.** QA table reports `gates.mjs` as 538 lines; current count is 562. Total offender count remains eight, so the 5.12 verdict is still correct. (`docs/qa/phase-05-combat.md:803`, `tools/gen/gates.mjs:545`, `:553`)
>
> ## Other targeted checks
>
> - `src/sim/` clean: no Phaser/clock/RNG/DOM imports.
> - No gameplay duration authored as float seconds.
> - No shipped animation fps hand-authored in its producer path.
> - No remaining runtime single-global-width assumption found for per-slug cells.
> - `packStrip`'s sweep is not a loosening — both axes still throw before drawing.
> - Padded adoption records are internally consistent.
>
> ## Could not check
>
> Codex explicitly states it could not run Vitest, typecheck, build, Playwright, generator gates, or Git commands (sandbox process spawn is unavailable), so the `265 suites / 865 tests` baseline, browser timings, and gate outputs are repository-recorded claims, not fresh executions in this review. All inspection was read-only via `node_repl`; no files were modified.

---

## Local re-verification and triage — 10 of 10 dispositioned

**Every finding was re-checked locally**, per the standing rule that Codex's findings are
file-evidence only. Two were **partly refuted on a timing technicality that is itself a finding**;
two were **confirmed against this session's own work** and fixed.

| ID | Sev | Disposition |
|---|---|---|
| **1** | blocker | **REFUTED AS STATED, AND THE UNDERLYING POINT APPLIED.** 5.4 **was** run — after Codex began reading. Driven live with `playwright-cli` against the shipped `rust-scavenger-walk`, sampling **in-page** via the `animationupdate` event, which fires on every frame change and carries `frame.index`: **12 distinct frame indices (1–12)** collected over 41 events, `everLeftFrame0: true`. `brass-sentry-idle` cycled 8, `brass-courier-idle` 12. **Codex was right that the repository contained no record of it** — the evidence existed only in the session. Now recorded in `docs/qa/phase-05-combat.md`. The stale spec exclusion comment it cites is real and is corrected. |
| **2** | blocker | **REFUTED AS STATED, SAME CAUSE, AND APPLIED.** 5.8 was redone at true sprite size before this review: a scavenger driven to **2/60**, screenshotted at native resolution, and **judged by eye at 3× magnification** — red sliver on a black field, high contrast, clearly legible against the cool blue-grey boiler wall, and visibly non-empty, which is 5.7's floor confirmed visually rather than only as a predicate. Again, **the repo held only the stale `HANDOFF.md:70` line**, which is exactly what Codex read. Recorded now, with a caveat Codex could not have seen: the scavenger had closed to ~120 px, so the sprites overlap and the bar renders across the **player's** head — at true size it is ambiguous which entity it belongs to. |
| **3** | blocker | **ACCEPTED — this is a judgement call and Codex's is adopted over the orchestrator's.** S1 and S2 were recorded as "blocker-class for session 8" on the reasoning that they are sim changes needing a balance decision. Codex's counter is stronger: the phase's stated goal is *"a patrolling scavenger that chases"*, the QA log itself says S1 *"must not be shipped unfixed"*, and a defect that strobes a sprite 39 times in 40 ticks is not a deferrable polish item. **They remain unfixed — but the phase is reported FAILING on them, not merely carrying them as debt.** |
| **4** | blocker | **CONFIRMED, already recorded as S3/S4.** No change; it reinforces that 5.11 is reported measured-and-failing rather than passed. |
| **5** | blocker | **CONFIRMED, already recorded.** 5.12 reported FAILING, 8 unjustified files, and the log already states `file-size.test.ts` is not evidence for the criterion. |
| **6** | blocker | **CONFIRMED — and NEW to this session.** 4.10 (`gateReachBand` never run against a real sheet) and 4.12 (`findSource`'s deliberate-removal red run) are on the Phase 4 debt ledger in §1b and were not touched. Codex is also right that **G5 does not substitute for 4.10** — different audit, different question. **RECORDED, NOT FIXED**, and now carried explicitly rather than silently. |
| **7** | major | ✅ **CONFIRMED AND FIXED.** Real hole in the guard built this session. `null !== undefined` is `true`, so `"scale": null` — this project's *"not measured yet"* convention, the same one `stridePxPerCycle` uses — resolved to the **slug** value but was labelled `'action'`, buying an exemption from the one-scale rule it should still obey. Fixed by extracting `resolveActionScale` into `slugConfig.mjs`, a testable leaf; the logic was previously inline in a build script and therefore **unreachable from a test, which is why it survived a red-run that watched the guard throw three different ways.** New `tests/unit/resolve-action-scale.test.ts`, watched go red (both regression assertions fail under the mutation), reverted from a fresh temp copy, revert verified **by count** (1 → 0 → 1). |
| **8** | major | **CONFIRMED, already recorded** as the standing 5.2 and 5.10 caveats. Codex adds the precise mutation for each, which is a genuine sharpening: for 5.10, *deleting enemy damage application entirely* leaves the named test green. Recorded against those criteria. |
| **9** | minor | **CONFIRMED, pre-existing, already on record.** The `motion.mjs` ↔ `motionCombat.mjs` cycle is a known project trap with a documented import-order rule. Codex confirms the three **new** splits are cycle-free, which is what this session was responsible for. No change. |
| **10** | minor | ✅ **CONFIRMED AND FIXED.** `gates.mjs` is **562**, not the 538 recorded — it grew when `fill` was moved into it while fixing the split's circular import. **The evidence table drifted inside the very session that corrected it for drifting**, which is worth stating rather than quietly patching. Corrected. |

### What this review is worth

**Seven Codex reviews on this phase, and every finding that was checkable has now been confirmed or
sharpened.** This one caught a hole in code written the same day, in a guard that had already been
watched go red three ways — because the defect lived in the one part of the path a test could not
reach. That is the argument for keeping the review mandatory in its own right.

**And it exposed a structural problem with reviewing mid-session.** Two of six blockers were Codex
correctly reporting that the **repository** had no record of work that had been done — 5.4 and 5.8.
`docs/HANDOFF.md` still described session 6's state, because the section describing session 7 is
written at the end of session 7. **A handoff document is stale from the first commit of the session
that will rewrite it**, and a reviewer reading it mid-flight is reading a lie of omission. The same
thing misled a `qa-expert` brief earlier the same day. Both are recorded in
`docs/qa/phase-05-combat.md`; the mitigation is to record evidence as it is produced rather than at
the end, and to say plainly in any review prompt which documents are known stale.
