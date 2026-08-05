# Phase 6 — Collectibles, HUD, steampunk UI chrome

← [PRD spine](../PRD.md) · prev: [Phase 5](phase-05-combat.md) · next: [Phase 7](phase-07-audio.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Gear pickups with a counter, the player HUD from STYLE.md (portrait medallion + single horizontal
health bar), and the collect→scoreboard tween. HUD lives in a **parallel UIScene**.

### 2. Required skills
`text-and-bitmaptext` · `graphics-and-shapes` · `scenes` · `data-manager` · `ui-ux-pro-max` ·
`fal-prompting` (chroma-keyed HUD sheet)

### 3. Vault-in
**6.1** zero scroll factor pins against pan but **not** against zoom — needs a second non-zooming
camera with reciprocal, exhaustive ignore lists · **6.2** a second camera created at an explicit size
never auto-resizes; build it from the live game size · **6.3** a container's own depth sorts it
against the scene · **6.4** gate the HUD on what is **drawn** — 98/100 drew 315 of 318px and the
action then refused in silence; compress an unready fill into the first 92% · **6.5** a DOM overlay
does not block engine input; hiding an interactive object must also deactivate it · **6.6** reshape to
the device; do not centre the canvas twice · **6.7** `scale.min/max` apply to CSS size and clamp
before the parent comparison · **STYLE.md §6** constrain HUD geometry rather than negating unwanted
elements

### 4. Codex plan review
**Runs now, before any code.** Command and handling rules: [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
Output → `docs/reviews/phase-06-plan.md`.

Ask Codex in particular: **the HUD sheet is generated art — does this plan re-run the STYLE.md §7
verification gates on it, or does it assume the recipe transfers from the scene mockups?** The HUD in
the anchor image was drawn by a model we no longer use. And: **where does the plan assert on a value
that is true rather than on what is drawn?** *(6.4.)*

### 5. Deliverables
`src/scenes/UIScene.ts` · `src/render/hud.ts` · `src/sim/pickups.ts` ·
`public/assets/hud/` (chroma-keyed sheet) · `tests/unit/hud-readiness.test.ts` ·
`tests/unit/pickup-count.test.ts` · `tests/e2e/phase-06-hud.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 6.1 | Pickup increments the counter; counter uses **tabular figures** so it does not jitter | e2e | e2e |
| 6.2 | HUD pinned under camera pan **and** under zoom | e2e *(6.1)* | qa-expert |
| 6.3 | Second camera built from live game size; resize does not crop the HUD | resize test *(6.2)* | qa-expert |
| 6.4 | Health bar never draws full while health < max | unit *(6.4)* | qa-expert |
| 6.5 | HUD legible at minimum supported resolution | screenshot | play |
| 6.6 | Text contrast ≥ 4.5:1 — **WCAG 2.2 SC 1.4.3 (Contrast Minimum), Level AA**, normal-size text | measured | ui-ux-tester |
| 6.6b | HUD sheet has a **catalog entry in `index.json`** under the Phase 4 non-character schema | audit | — |
| 6.7 | Canvas not double-centred; no stray margin offset | inspect *(6.6)* | qa-expert |
| 6.8 | HUD sheet chroma-keyed cleanly; fill mask region correct | inspect | play |
| 6.9 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | code-reviewer ×2 + perf | — |
| 6.10 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-06-plan.md` | — |
| 6.11 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-06-impl.md` | codex |

**Regression set:** Phases 1–5, specs 01–05.

### 7. Vault-out
Whether the two-camera ignore-list rule bit us. Whether the drawn-vs-true gate caught a real case.
How the generated HUD sheet behaved through chroma keying.

### 8. Demo
Collect gears, watch them tween to the counter, take damage and watch the ornate brass bar deplete.
Resize the window; the HUD stays correct.
