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
| 9.5 | **Frame budget holds under the worst STEADY-STATE frame**: max enemies + max particles + a live shake. **Amended by the owner 2026-08-24** — see the note below the table | `voltagent-qa-sec:performance-engineer` *(9.4)* | `voltagent-qa-sec:performance-engineer` |
| 9.6 | Frame-rate measurement distinguishes "fast" from "not drawing" | method review *(9.4)* | `voltagent-qa-sec:performance-engineer` |
| 9.7 | Every gate's threshold pinned as a literal, with fixtures both sides | *(9.2)* | `voltagent-qa-sec:qa-expert` |
| 9.8 | What the gates do **not** cover is stated in the phase QA log | *(9.3)* | — |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `voltagent-qa-sec:code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` |
| 9.10 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-09-plan.md` | — |
| 9.11 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-09-impl.md` | codex |

### ⚠️ Owner amendment, 2026-08-24 — criterion 9.5

**9.5 read *"max enemies + max particles + shake"* until this date.** The Phase 9 close round could
not honestly pass it as written, and the Codex implementation review blocked an attempt to record it
as *"PASS, qualified"* with the reasoning that settled it: **a caveat cannot reverse a criterion's
wording.**

**What the gate actually measures, and why.** `installStorm` holds the player invulnerable on every
frame of every arm — it has to, because without it the shipped effects path fires bursts that
`atLimit()` **accepts** in cheap arms and **drops** in expensive ones, an inversion that stops the
sweep ordering at all. The price is that the measured frame carries no `hurt` or `death` state, no
hit-stop, no knockback, no i-frame flicker, and the shake in the window is `SHAKE.land`, the smallest
of the four commands. All of this was already disclosed in the phase log's 9.8 list as **entries 43
and 44**, including the concession that the defence for it is *"an argument and not a measurement"*.

**The amendment.** The criterion now names the **worst steady-state frame**, which is what is
measured and what is defensible. It is narrowed deliberately and on the record, not quietly widened
to fit.

**What the amendment does NOT do.** It does not claim the combat-triggered path is cheap, and it does
not close that question. A regression confined to the `light` / `lethal` / `playerHurt` arm sites
would still leave this criterion green. That remains **open work**, carried in the phase log; the
concrete design for a combat-enabled variant is in the close round's
`voltagent-qa-sec:performance-engineer` adversarial brief. Reopening it needs no further owner decision — only the work.

*(Global Constraints: contradicting PRD.md needs a STOP-and-ask. This is that ask, answered, with the
question and the alternatives recorded rather than the answer alone.)*


**Regression set:** Phases 1–8, specs 01–08.

### 7. Vault-out
**Highest-value vault-out of the project — §B1 is empty.** Real particle costs, real frame budget,
what actually cost FPS in Phaser 4, and which effects were worth their cost.

### 8. Demo
The game with juice. Hits feel like they land.
