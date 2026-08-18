# Codex plan review — bug-fix + perf-gate session

← [reviews index](../QA-LOG.md) · plan: `C:\Users\royko\.claude\plans\okay-i-found-3-zesty-kahan.md`

**Run 2026-08-18** with `/codex:rescue --wait --fresh`, before any code was written, per
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol). The prompt carried the
mandatory `node_repl` + `fs.readFileSync` instruction — Codex's sandbox cannot spawn processes on
this machine.

This is not a numbered phase. It is the between-phases session that fixes three user-reported bugs
(Part A) and the two perf gates blocking Phase 9 (Part B).

---

## Verbatim review

1. **Low — scope excess.** The solids-versus-hazards partial-overlap rewrite is unrelated to the reported sentry/gear defect: the existing test only compares solids with hazards and never examines enemies, so it did not "hide" A2 as the plan claims. It is useful gate maintenance, but not required to fix the three bugs or unblock Phase 9. [plan:82-85], [tests/unit/level-entities.test.ts:82]

   The generic expansion from static sentries to every enemy swept over its entire patrol span is likewise stronger than the stated A2 goal, which names specific sentry/hazard and sentry/gear placements. [plan:57-80]

   S.10–S.13 are not feature deliverables, but they are mandatory process work and therefore should not be removed as "unnecessary." [docs/PRD.md:98]

2. **Acceptance criteria with false-green paths, ranked:**

   - **Blocker — S.6.** A low-ground spike run can be impossible to jump while all named automated gates pass. `level-traversal.test.ts` explicitly probes a retired Phase 7 level, not the shipped layouts. The whole-level autoplayer is allowed to take hits, die, and respawn, and its "ground ahead" detector reads solids—not hazards—so it can tank across an unjumpable spike run and still report completion. The hazard sweep only requires that at least one hazard per level damages a walking player. [tests/unit/level-traversal.test.ts:4], [tests/unit/level-completable.test.ts:15], [tests/unit/level-completable.test.ts:90], [tests/unit/level-hazards.test.ts:88]. This is material: the measured limit says 252 px is already impassable, while several inter-mass stretches are much wider. [tools/gen/levels/shared.mjs:30], [tools/gen/levels/level-03.mjs:61]

   - **Blocker — S.8.** It expressly passes if the frame-loss half is "retired and recorded," even if nothing detects the 30 ms/cue mutation. The remaining `MAX_AUDIO_WORK_DELTA_MS` measures median every-frame overhead; it is not evidence against sparse cue stalls affecting about 2% of frames. [plan:136-142], [plan:174], [tests/e2e/perfBudget.ts:365]

   - **Blocker — S.9.** The plan points toward `MAX_HUD_WORK_DELTA_MS` as the model for the replacement, but that is a main-thread statistic. The scrim defect is specifically GPU fill/overdraw the main-thread assertions cannot see; S.9 does not require the replacement to remain a GPU measurement, so it can pass on the wrong quantity. [plan:149-155], [tests/e2e/phase-06-perf.spec.ts:346]

   - **Major — S.3/S.4.** They test whether an enemy body contains the gear's authored point, not whether it overlaps the actual gear body (`GEAR_BOX` 72×72 shipped pixels). An earlier QA finding already recorded that point testing misses faces, corners, and seams. A gear centre just outside the enemy can pass while the visible/gameplay gear remains inside it. [plan:79-80], [src/sim/pickups.ts:50], [docs/qa/phase-06-hud.md:415]

   - **Major — S.1/S.2.** They prove the collision tick, not recovery on the following tick — a patroller that reverses repeatedly at the same x satisfies "turns," "never inside," and `moving === false` while remaining trapped. There is also an immediate existing-test conflict: the Phase 5 fixture represents "ground everywhere" as one solid covering the whole plane; a horizontal-body veto will read that same solid as a wall and break its positive patrol/chase movement tests. [plan:167-168], [tests/unit/enemy-ai-scavenger.test.ts:27], [tests/unit/enemy-ai-scavenger.test.ts:37]

     Shipped data also has a non-neutral case: level 02's first scavenger beat begins at column 32, exactly where the two-column wall at columns 30–31 ends, and the scavenger has a nonzero half-width — the veto will shorten that existing authored beat even if it doesn't fully trap it, and S.1/S.2 don't require preserving the authored span. [tools/gen/levels/level-02.mjs:43], [tools/gen/levels/level-02.mjs:72], [src/sim/enemyPlacement.ts:93]

   - **Low — S.5 and S.10–S.13.** Can all be green while gameplay remains broken, since they test an unrelated geometry relation or process completion. Earlier Phase 8 review already records this limitation for process gates. [docs/reviews/phase-08-plan.md:56]

3. **Blocker — the plan misuses vault 9.3 and does not satisfy C2.** Recording a blind spot under 9.3 does not convert an undiscriminating gate into a repaired one; the repo already ruled that 7.7 is failing/unrun until it distinguishes the mutation, so "label it and move on" violates the reporting rule. [plan:136-142], [docs/qa/session-gate-defects.md:352], [docs/PRD.md:98]

   It also invokes C2 for Part B without requiring committed failing fixtures for either perf mutation; the testing rule explicitly requires committed fixtures, and the prior session recorded the uncommitted storm/scrim mutations as unresolved methodology debt. [plan:121-123], [docs/TESTING-RULES.md:17], [docs/qa/session-gate-defects.md:291]

4. **Blocker — the plan depends on a shipped-level, damage-free, mass-to-mass hazard-crossing oracle that no earlier phase produces.** The plan calls the existing traversal/completion/hazard tests "arbiters," but traversal is frozen to retired data, the reachability graph is terrain-only, and the exact-world autoplayer explicitly permits damage and death. None proves each newly spiked stretch is jumpable without touching it. [plan:101-112], [tests/unit/level-traversal.test.ts:14], [tests/unit/level-reach.test.ts:22], [tests/unit/level-completable.test.ts:15]

5. **Blocker — the most likely subtle ship is another perf statistic overfit to the same run used to choose it.** The plan chooses the statistic from the new data and accepts same-session red/green separation with no independent confirmation run — the exact pattern that has already failed three ways: 7.7 was selected against a one-frame clean spread before twelve runs overlapped its mutation; 6.9's clean ceiling rose after only two additional samples; and the previous session's planned per-pair statistic was worse than the pooled one. [plan:130-142], [plan:149-155], [tests/e2e/perfBudget.ts:318], [tests/e2e/perfBudget.ts:257], [tests/e2e/phase-06-perf.spec.ts:281]

Codex could read every requested file via `node_repl` but could not run Git, tests, generation, Playwright, the browser, or the perf mutations — runtime recovery from the wall veto, actual level completion, and all claimed timing separations remain unverified.

---

## Triage

Every finding is applied or recorded with a one-line reason *(C11)*. Findings 1, 6 and 7 were
re-verified locally against the source before applying — a review that could not run a command is
file-evidence only.

| # | Severity | Finding | Disposition |
|---|---|---|---|
| 1 | Blocker | S.6 (draft) false-green: all three named A3 arbiters are blind — traversal probes a retired level, the autoplayer tanks damage, `groundAhead` ignores hazards | **APPLIED.** A3 now ships a damage-free shipped-level oracle as its main deliverable; new S.8. Verified locally: `level-traversal.test.ts` reads `tests/fixtures/levels/level-01-phase07.tmj`; `level-completable.test.ts`'s `groundAhead` reads `level.solids` only. |
| 2 | Blocker | Plan depends on a damage-free hazard-crossing oracle no earlier phase produces | **APPLIED.** Same as #1 — the oracle is now built, not assumed. |
| 3 | Blocker | S.8 (draft) allowed "retire and record" as a pass, misusing vault 9.3 against the repo's own reporting rule; C2 cited without committing the perf mutations as fixtures | **APPLIED.** S.11 forbids retirement as a pass; both mutations become committed fixtures. |
| 4 | Blocker | Most likely subtle ship: a perf statistic overfit to the run used to choose it — the same failure three times | **APPLIED.** Part B rule 3: select on one set of runs, confirm on a held-out set. |
| 5 | Blocker | S.9 (draft) did not require the 6.9 replacement to stay a **GPU** statistic | **APPLIED.** S.12 requires it. |
| 6 | Major | S.3/S.4 (draft) tested a gear **point**, not `GEAR_BOX` | **APPLIED.** S.5/S.6 are body-vs-body. Verified locally: `GEAR_BOX = {x:-6,y:-6,w:12,h:12}` at `pickups.ts:60`, 72×72 px at `RENDER_SCALE` 6. |
| 7 | Major | A plain overlap veto breaks the `EVERYWHERE` fixture and shortens or traps level-02's col-32 beat | **APPLIED.** The veto is now "newly entered", mirroring `resolveCollisions`; new S.3 asserts every shipped patrol span is unchanged. Verified locally: `EVERYWHERE` is one `2e6 × 2e6` solid at `enemy-ai-scavenger.test.ts:35`; level-02's wall is cols 30–31 and the beat starts col 32, so the body already overlaps at its bound. |
| 8 | Major | S.1/S.2 prove the collision tick but not **recovery** — an enemy could oscillate in place forever and pass | **APPLIED.** New S.4. |
| 9 | Low | The solids/hazards rewrite is scope excess; it did not hide A2 | **APPLIED, re-justified.** Kept, but because A3 puts hazards flush against solids across all five levels — not because it hid A2. Codex is right that it did not. |

**What Codex could not check**, preserved *(vault 9.3)*: it read every requested file via `node_repl`
but could not run git, tests, generation, Playwright, the browser, or the perf mutations. Runtime
recovery from the veto, actual level completion, and every timing separation were unverified at
review time and are this session's work to establish.
