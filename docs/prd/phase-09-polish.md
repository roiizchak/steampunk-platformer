# Phase 9 — Polish, juice, particles

← [PRD spine](../PRD.md) · prev: [Phase 8](phase-08-levels.md) · next: [Phase 10](phase-10-ship.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Steam bursts, sparks, screen shake, hit-stop, landing dust, coin sparkle. Feel, not features.

### 2. Required skills
`particles` · `tweens` · `filters-and-postfx` · `cameras` · `render-textures` · `motion-design` ·
`find-docs` · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`

### 3. Vault-in
**9.1** hang game logic on the delta clock and keep tweens decorative — Phaser's tween manager reads
the system clock and does **not** advance under a pumped test clock; killing tweens *by target* kills
every tween on that target, which left menu cards invisible at alpha 0 with a fully green suite
*(blocker)* · **9.2** pick thresholds from what is correct, not what currently passes; fixtures on
both sides; the fixture must call the real gate; pin the threshold as a literal · **9.3** say plainly
what a gate does not cover; prefer an honest recorded number to a gate that cannot fail · **9.4**
**the vault has nothing on particle cost or frame budget** — new ground; beware summary statistics
that cannot distinguish "fast" from "not drawing anything"

### 4. Codex plan review
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save verbatim to `docs/reviews/phase-09-plan.md`, then append the triage. Review 2 uses `--wait --resume`.

Ask Codex in particular: **which piece of game state in this plan is sequenced off a tween completion
rather than off the tick?** *(9.1, blocker — a fully green suite once shipped invisible menu cards.)*
And: **would the proposed frame-budget measurement distinguish "fast" from "not drawing anything"?**
*(9.4.)*

### 5. Deliverables
`src/render/effects.ts` · `src/sim/hitstop.ts` · `src/render/screenShake.ts` ·
`tests/unit/hitstop.test.ts` · `tests/e2e/phase-09-polish.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 9.1 | Hit-stop lives in the sim as integer ticks, not a tween | code review *(9.1)* | `voltagent-qa-sec:code-reviewer` |
| 9.2 | No game logic sequenced off a tween completion | code review *(9.1)* | `voltagent-qa-sec:code-reviewer` |
| 9.3 | Tweens tracked individually; no kill-by-target | code review *(9.1)* | `voltagent-qa-sec:code-reviewer` |
| 9.4 | A fade force-settles its end value on stop as well as complete | unit | `voltagent-qa-sec:qa-expert` |
| 9.5 | **Frame budget holds under worst case**: max enemies + max particles + shake | `voltagent-qa-sec:performance-engineer` *(9.4)* | `voltagent-qa-sec:performance-engineer` |
| 9.6 | Frame-rate measurement distinguishes "fast" from "not drawing" | method review *(9.4)* | `voltagent-qa-sec:performance-engineer` |
| 9.7 | Every gate's threshold pinned as a literal, with fixtures both sides | *(9.2)* | `voltagent-qa-sec:qa-expert` |
| 9.8 | What the gates do **not** cover is stated in QA-LOG | *(9.3)* | — |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `voltagent-qa-sec:code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` |
| 9.10 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-09-plan.md` | — |
| 9.11 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-09-impl.md` | codex |

**Regression set:** Phases 1–8, specs 01–08.

### 7. Vault-out
**Highest-value vault-out of the project — §B1 is empty.** Real particle costs, real frame budget,
what actually cost FPS in Phaser 4, and which effects were worth their cost.

### 8. Demo
The game with juice. Hits feel like they land.
