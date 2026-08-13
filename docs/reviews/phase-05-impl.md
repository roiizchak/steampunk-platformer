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

---

# Implementation review — session 8, 2026-08-13, at `78932a0`

`/codex:rescue --wait --resume`, carrying the `node_repl` + `fs.readFileSync` instruction (Codex's
sandbox cannot spawn processes on this machine — `CreateProcessAsUserW failed: 5`, permanent).

**Verdict: BLOCK — 1 blocker, 1 major, plus two corrections to invariants the prompt supplied.**

The prompt listed the already-known gate findings and explicitly asked Codex to tell me if I had got
any of them wrong. **It had, twice.** That is the single most valuable thing this review produced,
and it is an argument for always handing the reviewer your own conclusions to attack rather than
only the diff.

## The review, verbatim

### Blocker

> 1. **Criterion 5.12 is still failing: `tick.ts` is 409 lines.** The file ends at line 409,
>    exceeding the unconditional 400-line invariant: `src/sim/tick.ts:409`. The test correctly counts
>    physical lines and selects files over 400, but only requires the total to remain at most ten, so
>    one offender stays green: `tests/unit/file-size.test.ts:48`, `:62`, `:85`.
>
>    This corrects the known T7 record: the count at `78932a0` is **one**, not zero, and the ceiling
>    has nine free slots rather than ten. The QA log's "ZERO" and "170 files scanned, 0 over" claims
>    are false at this commit: `docs/qa/phase-05-combat.md:1321`, `:1331`, `:1363`. Git-object
>    comparison pins the regression to `8bfeee5`: `tick.ts` grew from 388 to 409 lines. A safe repair
>    is to extract `createWorld` rather than deleting the authoritative tick-order explanation.

### Major

> 2. **Hitstun still permits vertical control through early jump release.** The chosen contract says
>    hitstun "hard-locks movement": `docs/qa/phase-05-combat.md:1038`. Session 8 gates horizontal
>    direction and step-7 jump execution, but still passes live `input.jumpHeld` unconditionally into
>    `stepVertical`: `src/sim/tick.ts:261`, `:274`, `:297`. `stepVertical` treats releasing that
>    button as control input and divides upward velocity by `jumpCutDivisor`: `src/sim/player.ts:258`,
>    `:260`.
>
>    Therefore, if the player is hit while rising and releases jump during the lock, the first locked
>    tick changes `vy` from `-48.6` to `-13.5`: divide by 3, then add 2.7 gravity, using the shipped
>    knobs at `src/sim/player.ts:86` and `:89`. Holding jump instead produces `-45.9`. That is
>    substantial trajectory control while supposedly "not being in control."
>
>    The airborne regression test misses it because it asserts only `vx`, despite leaving `jumpHeld`
>    false during the locked ascent: `tests/unit/player-combat.test.ts:299`, `:308`. Gate only the
>    jump-cut input while locked — gravity should continue — and add an exact airborne-`vy` test.

### Attack points the prompt named — Codex's conclusions

> - **Buffered jump:** The new execution gate is otherwise consistent with the documented window. The
>   latch is armed before the lock check, locked ticks consume the ordinary eight-tick buffer, and a
>   first-locked-tick grounded press remains open when the five-tick lock ends. It does not extend
>   the buffer or coyote window.
> - **`knockbackPending`:** I found no reachable leak. It starts false, is set only after a landed
>   nonlethal impulse, and the following hurt tick forces `dir = 0`, consumes, and clears it before
>   later step-9b death handling. There is currently no respawn path.
> - **GameScene split:** I found no captured-by-value behavior regression. `playerInputEnabled` is
>   read live through a callback, subclass methods are dynamically dispatched through arrow
>   callbacks, and HUD/parallax values are supplied afresh each frame. The Phaser input skill
>   directed me to the installed 4.2.1 source; its scene shutdown destroys all Keys and listeners,
>   eliminating the suspected stale-snapshot listener across restarts: `KeyboardPlugin.js:880`, `:883`.
> - **Dead enemies:** Correct. Both enemy decision loops are hp-gated while projectile advancement
>   remains outside either guard.
> - **Scavenger clamp:** Correct for valid authored bounds. Chase-facing is written only outside the
>   dead zone, patrol-facing changes only in the patrol branch, and both paths hit the final clamp.

### Corrections to supplied invariants

> - `knockbackPending` did **not** leak into `window.__game`; player publication remains the five
>   selected fields: `src/scenes/GameScene.ts:365`. However, `window.__game` has **eight top-level
>   fields, not nine** — both source and E2E declarations enumerate `sceneKey`, `tick`, `player`,
>   `score`, `health`, `levelId`, `ready`, and `bootError`: `src/debug/globals.ts:23`,
>   `tests/e2e/debugView.ts:14`. The "nine-field" comments are already inaccurate:
>   `src/scenes/GameScene.ts:150`.
> - Your `verify-dist` correction is right for the current build. Quoted scene-key checks and
>   property-name checks are meaningful; the three class-name checks plus `spawnDevEnemies` cannot
>   prove absence after minification, and `spawnDevFleet` is absent from the list:
>   `tools/gen/verify-dist.mjs:84`, `:93`. The robust fix is a Rollup/Vite `generateBundle` assertion
>   that DEV-only source modules contribute zero rendered bytes, rather than adding more identifier
>   greps. Keep the stable scene-key, user-facing-prose, `__game`, and `__phaserGame` checks as
>   defense in depth.

### What Codex could not check

> I could not run unit tests, typecheck, the build, Playwright, or a browser playtest because all of
> those require process creation. I did not retry the shell. File and Git-object inspection through
> `node_repl` succeeded. The working tree contains follow-up modifications, so this report is
> deliberately pinned to the requested `78932a0` commit objects and does not assess those later edits.

## Local re-verification and triage — 4 of 4 dispositioned *(C11)*

Every finding re-verified locally before being applied. **All four confirmed**, continuing this
phase's unbroken record.

| | sev | re-verified how | disposition |
|---|---|---|---|
| 1 | blocker | `wc -l src/sim/tick.ts` → **409**. `git show 8bfeee5^:src/sim/tick.ts \| wc -l` → **388**; `git show 8bfeee5:…` → **409**. Full sweep confirmed exactly one file over. | **APPLIED**, `ea0c6e4`. `createWorld` + `GREY_BOX_SOLIDS` extracted to `src/sim/world.ts` (120 lines), re-exported so all 17 importers are untouched. `tick.ts` **409 → 307**. Sweep: **0 over 400**. The numbered step order and its explanation were not touched. |
| 2 | major | Read the path directly: step 6 calls `stepVertical(player, tuning, input.jumpHeld)` unconditionally and runs **before** step 7's `hitstunLocked` gate; `player.ts` cuts on `jumpCutPending && !jumpHeld && vy < 0`. The agent's red run reproduced Codex's figures exactly — `expected -13.5 to be close to -45.9`. | **APPLIED**, `ea0c6e4`. Now `stepVertical(player, tuning, hitstunLocked \|\| input.jumpHeld)`. Gravity still runs; `jumpCutPending` is **not** cleared, so the cut is still available after the lock lifts — pinned by a test, because a permanent immunity would trade one defect for another. |
| 3 | correction | Counted `GameDebugView` in `src/debug/globals.ts`: `sceneKey, tick, player, score, health, levelId, ready, bootError` = **8**. | **CONFIRMED.** The "nine-field" figure is wrong in CLAUDE.md, PRD.md, `GameScene.ts:150` and several of this session's own commit messages. **Recorded, not fixed:** CLAUDE.md and PRD.md are outside this session's scope lock. The surface is closed either way and nothing leaked into it — the count is wrong, the invariant is not. |
| 4 | correction | Already verified independently before Codex ran: `stepScavenger` and `createScavenger` both grep **0** in the bundle while unquestionably shipping; `` `Game` `` ×3 and `` `Boot` `` ×1 survive backtick-quoted. | **CONFIRMED, and Codex improved the fix.** Rather than adding more identifier greps, assert in a Vite `generateBundle` hook that DEV-only modules contribute **zero rendered bytes**, keeping the scene-key, prose and `__game` checks as defence in depth. **Recorded for the next session** — it is a new build-gate mechanism, not a gate-time edit. |

## What this review says about the process

**Hand the reviewer your own conclusions, not just the diff.** The prompt listed the gate's known
findings and asked Codex to say if any were wrong. Both corrections came from that section, and one
of them — the 409-line blocker — was a **false claim I had written into the QA log myself**, in the
same section where I criticised that log for carrying a stale one. A review given only the diff would
have had no reason to check it.

**The failure was a sequencing error, and it is worth naming exactly.** I ran the 400-line sweep,
*then* fixed F1 (which grew `tick.ts` by 21 lines), *then* wrote the sweep's result into the log. Each
step was sound; the order made the record false. **A measurement written down after later edits is
not a measurement of the tree it claims to describe.**
