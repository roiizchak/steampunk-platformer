# Phase 3 — Tiled → Phaser tilemap pipeline + Element Editor

← [PRD spine](../PRD.md) · prev: [Phase 2](phase-02-player.md) · next: [Phase 4](phase-04-art.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Levels authored in Tiled, exported as `.tmj`, loaded via Phaser 4 tilemaps, with a working collision
layer. Grey-box tileset. **Publishes the exact grid cell size that Phase 4 art must hit.** Includes
**ElementEditorScene** — the reference project proved it necessary because characters floated above
platforms when art bottoms and collision bottoms disagreed.

### 2. Required skills
`tilemaps` · `cameras` · `v4-new-features` (`TilemapGPULayer`) · `find-docs` ·
`e2e-playwright-testing` (specs) · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`
**Not `physics-arcade`** — see [Phase 2 §2](phase-02-player.md#2-required-skills) and CLAUDE.md
§ Engine gotchas. Tile collision is resolved in `src/sim/`, not by a Phaser physics world.

### 3. Vault-in
**3.1** at least one test loads the **shipped** `.tmj` the player loads — preferably sweeps all of
them; a fixture suite and a registry suite answer different questions *(blocker)* · **3.2** derive
world width from **measured** background pixels, never an aspect label — that mistake left a
side-scroller 10px of scroll room · **3.3** derive behaviour from data, never from a name; grep the
numbers, not just the identifier · **3.4** publish the grid cell size before Phase 4 spends money ·
**A3** the vault has **zero** tilemap coverage — this phase generates new lessons, so keep notes

### 4. Codex plan review
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save verbatim to `docs/reviews/phase-03-plan.md`, then append the triage. Review 2 uses `--wait --resume`.

Ask Codex in particular: **this phase publishes the 32px grid cell size that Phase 4 spends money
against — what else does Phase 4 need published here that this plan does not publish?** A missing
number found now is free; found in Phase 4 it is a re-generation.

### 5. Deliverables
`public/assets/levels/level-01.tmj` (grey-box) · `src/game/tilemap.ts` · `src/scenes/ElementEditorScene.ts` ·
`src/render/cameraRig.ts` · `tests/unit/tilemap-data.test.ts` · `tests/e2e/phase-03-tilemap.spec.ts` ·
`docs/ASSET-PIPELINE.md` updated with the published cell size

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 3.1 | Player lands on the collision layer and does not fall through | e2e | e2e |
| 3.2 | Player cannot pass through a solid tile horizontally | e2e | e2e |
| 3.3 | **Every** `.tmj` in `public/assets/levels/` loads and passes a schema + collision-layer check | unit over shipped data *(3.1)* | `voltagent-qa-sec:qa-expert` |
| 3.4 | Camera follows within bounds; never shows outside the map | e2e | e2e |
| 3.5 | World width derived from the **shipped `.tmj`'s own `width × tilewidth`**, measured not assumed; a test pins the number. *(There is no background art in this phase — 3.2's "measured background pixels" rule binds Phase 4, when real art exists.)* | unit *(3.2)* | `voltagent-qa-sec:qa-expert` |
| 3.6 | **Grid cell size published in ASSET-PIPELINE.md** — replacing the PROPOSED marker | doc review | — |
| 3.6b | **Camera zoom and viewport size published in ASSET-PIPELINE.md.** Phase 4's "readable at true sprite size" gate has no true size without them | doc review | — |
| 3.7 | Element Editor shows and edits a collision strip; the edit persists | `playwright-cli` + hands-on | play |
| 3.8 | No file > 400 lines; diff reviewed; adversarial pass | `voltagent-qa-sec:code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` |
| 3.9 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-03-plan.md` | — |
| 3.10 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-03-impl.md` | codex |

**Regression set:** Phases 1–2, specs 01–02.

### 7. Vault-out
**High value — the vault has nothing here.** Tiled→Phaser 4 gotchas, object-layer conventions,
whether `TilemapGPULayer` was usable, and how art bottoms vs collision bottoms actually behaved.

### 8. Demo
A grey-box level loaded from a Tiled file. The player runs, jumps between platforms, camera follows.
The Element Editor opens and a collision strip can be nudged.
