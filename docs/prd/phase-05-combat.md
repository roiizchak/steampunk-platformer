# Phase 5 — Enemies, hazards, combat + Enemy Gym

← [PRD spine](../PRD.md) · prev: [Phase 4](phase-04-art.md) · next: [Phase 6](phase-06-hud.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Two contrasting enemies — a **static turret** with a visible detection radius, and a **patrolling
scavenger** that chases. Hazards. Player attack, damage, knockback, i-frames. **Enemy health bars.**
Plus enemy behaviour tuning in the Gym. Grey-box behaviour first, art second.

🔴 **This phase now also owns the combat art**, moved here from Phase 4 by the Gate 7 Codex review:
the player's `attack` / `hurt` / `death` sheets and all enemy sheets. They cannot be generated in
Phase 4 because their frame rate is derived from `simTicks` and their contact frames are aligned to
active windows — and both are defined in `src/sim/combat.ts`, which is built here.

**Order within this phase is therefore strict: grey-box the combat sim and freeze its timings FIRST,
then generate art against those frozen numbers.** Generating first would author a flat fps, which is
vault **4.22** — *every light attack had 0.43 s of art over a 0.25 s move, so the strike was never
drawn.* All of [ASSET-PIPELINE.md](../ASSET-PIPELINE.md) and [STYLE.md](../STYLE.md) apply to that
art unchanged, including the per-generation log entry with its request id.

### 2. Required skills
`physics-arcade` · `groups-and-containers` · `events-system` · `animations` · `data-manager`

### 3. Vault-in
**5.1/2.9** a per-tick probability is **not** a behaviour — commit to episodes; one counter plus one
flag, because two counters admit the unrepresentable state. Phaser restarts a looping animation on
every state change, which is how a walk cycle never left frame 0 *(blocker)* · **5.2** equal duty
cycle is not equal difficulty · **5.3** two definitions of one concept is where the bug lives — import
the predicate, never restate it · **5.4** the benchmark is half of every measurement · **5.5** a
measurement of exactly 0 or 100% means asking whether the branch ran · **5.6** pair every golden file
with branch-execution counts · **5.7** tune on one seed set, gate on another; report the spread ·
**5.8** any cross-entity comparison of an absolute stat is suspect; a symmetric fixture is not a test
of a comparison · **5.9** closing a measurement gap is a balance decision, not a repair · **5.10**
global changes as uniform deltas · **5.11** check that waste is waste before removing it · **6.4**
gate the enemy health bar on what is **drawn** — an enemy at 2/100 must not render as empty

### 4. Codex plan review
**Runs now, before any code.** Command and handling rules: [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
Output → `docs/reviews/phase-05-plan.md`.

Ask Codex in particular: **combat timing is expressed against Phase 2's tick contract — does this plan
restate any timing predicate that Phase 2 already defines?** *(5.3: two definitions of one concept is
where the bug lives.)* And: **which enemy behaviour in this plan is specified as a per-tick
probability rather than a committed episode?** *(5.1, blocker.)*

### 5. Deliverables
`src/sim/combat.ts` · `src/sim/enemies.ts` · `src/render/enemyView.ts` · `src/render/enemyHealthBar.ts` ·
`src/scenes/GymScene.ts` extended · `tests/unit/combat.test.ts` · `tests/unit/enemy-ai.test.ts` ·
`tests/unit/enemy-health-bar.test.ts` · `tests/e2e/phase-05-combat.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 5.1 | Turret fires only inside its radius; radius tunable and the change is observable | unit + sweep | qa-expert |
| 5.2 | Scavenger patrols, detects, chases; each speed independently tunable | unit + sweep | qa-expert |
| 5.3 | Enemy decisions commit to **episodes**, not per-tick rolls | code review *(5.1)* | code-reviewer |
| 5.4 | Enemy walk animation advances past frame 0 during patrol | e2e/observed *(5.1)* | play |
| 5.4b | **Combat sim timings frozen and recorded BEFORE any combat art is generated** | doc + STOP *(4.22)* | — |
| 5.4c | **Contact frame lands inside the active window on every attack sheet** *(moved from Phase 4)* | measured *(4.22)* | qa-expert |
| 5.4d | Every combat sheet's fps derived as `renderFrames × TICK_HZ / simTicks`, never authored | unit *(4.22)* | qa-expert |
| 5.4e | Every combat generation logged with its **request id** and reconciled cost | GENERATION-LOG.md | — |
| 5.5 | Attack registers **only** on active frames; wind-up and recovery do not | unit *(4.22)* | qa-expert |
| 5.6 | i-frames span their full window — fixture longer than the window | unit *(2.7)* | qa-expert |
| 5.7 | **Enemy health bar never renders empty above 0 HP** | unit *(6.4)* | qa-expert |
| 5.8 | Enemy health bar legible at true sprite size against a cool background | eyeball | play |
| 5.9 | Every tuning knob sweeps and the number moves | sweep *(A6)* | qa-expert |
| 5.10 | Damage comparisons use two **different** entities, not a symmetric fixture | unit *(5.8)* | qa-expert |
| 5.11 | **Frame budget** measured under worst-case enemy count | `performance-engineer` | perf |
| 5.12 | No file > 400 lines; diff reviewed; adversarial pass | code-reviewer ×2 | code-reviewer |
| 5.13 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-05-plan.md` | — |
| 5.14 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-05-impl.md` | codex |

**Regression set:** Phases 1–4, specs 01–04.

### 7. Vault-out
Whether episode-committed AI fixed the frame-0 animation problem in practice. Enemy tuning values that
felt fair. What the frame budget actually was — **the vault has nothing on performance (§B1)**, so
this is new ground.

### 8. Demo
Fight both enemies. Watch the turret's radius, get chased by the scavenger, take and deal damage with
knockback, see enemy health bars deplete.
