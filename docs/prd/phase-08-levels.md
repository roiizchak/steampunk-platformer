# Phase 8 — Level design and progression

← [PRD spine](../PRD.md) · prev: [Phase 7](phase-07-audio.md) · next: [Phase 9](phase-09-polish.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
3–5 finished levels, level select, save state, difficulty ramp, and level-complete flow.

### 2. Required skills
`tilemaps` · `scenes` · `data-manager` · `curves-and-paths` ·
`e2e-playwright-testing` (specs) · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`

### 3. Vault-in
**8.1/3.1** at least one test loads **every shipped** `.tmj` — the defect usually lives in one entry,
not the schema · **8.2** seeded RNG, knob sweeps, and separate tune/gate seed sets · **8.3** cross-level
absolute-stat comparisons are suspect · **8.4** anchor prop scale to a human figure in background art ·
**8.5** any global difficulty change is a uniform delta — additive preserves differences,
normalisation preserves neither · **5.7** report the spread, not the headline

### 4. Codex plan review
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save verbatim to `docs/reviews/phase-08-plan.md`, then append the triage. Review 2 uses `--wait --resume`.

Ask Codex in particular: **what makes a level unwinnable that this plan's validation would not
catch?** A schema check passes on a level whose only route is a jump one pixel too high. And:
**is the difficulty ramp reported as a spread or as a single headline number?** *(5.7.)*

### 5. Deliverables
`levels/level-01..05.tmj` · `src/sim/progress.ts` · `src/scenes/LevelSelectScene.ts` ·
`src/game/save.ts` · `tests/unit/progress.test.ts` · `tests/unit/level-data.test.ts` ·
`tests/e2e/phase-08-progression.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 8.1 | **Every** shipped `.tmj` loads, validates, and is completable | unit + e2e *(8.1)* | `voltagent-qa-sec:qa-expert` |
| 8.2 | Full playthrough start → finish without a soft-lock | e2e + `playwright-cli` + hands-on *(C4)* | play |
| 8.3 | Completing a level unlocks the next; save survives reload | unit + e2e | `voltagent-qa-sec:qa-expert` |
| 8.4 | Save schema tolerates a missing/corrupt file without data loss | corrupt it deliberately | `voltagent-qa-sec:qa-expert` |
| 8.5 | Difficulty ramp measured, spread reported — not a single headline number | *(5.7)* | `voltagent-qa-sec:qa-expert` |
| 8.6 | Level-complete flow: align, animate, fade, overlay, continue | `playwright-cli` + hands-on | play |
| 8.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | `voltagent-qa-sec:code-reviewer` ×2 + `voltagent-qa-sec:performance-engineer` | — |
| 8.8 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-08-plan.md` | — |
| 8.9 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-08-impl.md` | codex |

**Regression set:** Phases 1–7, specs 01–07.

### 7. Vault-out
What level-authoring in Tiled was actually like. Where difficulty estimates were wrong. Whether the
shipped-data test caught anything a fixture test would have missed.

### 8. Demo
Play the whole game start to finish. Quit mid-way, reload, resume.
