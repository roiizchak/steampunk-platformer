# Phase 3 — Codex implementation review (review 2 of 2)

**Ran:** 2026-08-07, after the phase's own tests were green and the four agent-owner briefs had
been applied, before the phase was reported done.
**Invocation:** `/codex:rescue --wait --resume`, continuing the thread that produced
[phase-03-plan.md](phase-03-plan.md), carrying the `node_repl` / `fs.readFileSync` instruction from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** the phase's diff against `main` (11 commits) against
[phase-03-tilemap.md](../prd/phase-03-tilemap.md) and [PRD.md](../PRD.md).

Codex cannot run `git` on this machine, so the changed-file list was supplied in the prompt and it
read each file with `node_repl`. **That is a real limitation of this review and it is stated in its
own "could not check" section**, preserved verbatim below *(vault 9.3)*: it executed nothing — no
build, no vitest, no Playwright, no `dist/` inspection — so every finding is file-evidence and was
**re-verified locally** before being applied, per the standing rule.

---

## The report, verbatim

### Findings, ranked

1. **Blocker for Phase 4 — animation timing numbers still don't exist.** Phase 4 says
   `idle`/`walk`/`run`/`jump` already have simulation timings and requires
   `fps = renderFrames × TICK_HZ / simTicks`, but the sim only exposes `idle | run | jump | fall`
   (no `walk`) and publishes no per-animation `simTicks`. `docs/prd/phase-04-art.md:16`,
   `docs/prd/phase-04-art.md:127`, `src/sim/types.ts:41`, `docs/ASSET-PIPELINE.md:32`

2. **High — Boot validator accepts levels the Phaser scene can't load.** `describeLevelProblem`
   doesn't check for the runtime-required `ground` layer / `greybox` tileset names that `GameScene`
   hardcodes; such a level passes 3.3's unit gate and `verifyLevels` but leaves the game hung
   (`ready=false`, `bootError=null`). Also `allObjects`/`boolProperty` isn't total over malformed
   JSON (a `null` object entry throws) and `verifyLevels` calls it outside its `try`.
   `src/game/tilemap.ts:148,95,107`, `tests/unit/tilemap-data.test.ts:229`,
   `src/scenes/GameScene.ts:279,109`, `src/scenes/bootLevels.ts:57`

3. **Medium — criterion 3.4 never tests the right-hand camera clamp.** The e2e test only holds
   Right and the player wall-stops before reaching the map's right edge, so an oversized right
   bound could pass everything. `tests/e2e/phase-03-tilemap.spec.ts:179,223`,
   `public/assets/levels/level-01.tmj:8714,8820`

4. **Medium — `resolveCollisions` is not correct for a vertically offset `LocalBox`** (fine today
   since `PLAYER_BOX.y === 0`, untested otherwise). `src/sim/player.ts:85,196,226`,
   `tests/unit/player-movement.test.ts:290`

5. **Medium — P10's doc-lock claim is incomplete**; the pinned `3840 × 456` camera-travel number
   isn't actually asserted by the doc-lock test. `docs/reviews/phase-03-plan.md:166`,
   `docs/ASSET-PIPELINE.md:37`, `tests/unit/tilemap-data.test.ts:318`

6. **Medium — ElementEditorScene's Nth-`solid`-object correspondence** uses inconsistent
   solid-detection logic between parser and saver; breaks on duplicate `solid` properties or
   reordering of `world.solids`. `src/game/tilemap.ts:95`, `src/scenes/ElementEditorScene.ts:279,299`

7. **Low — "overlay for every solid" test doesn't prove that**; all three shipped platforms share
   dimensions `256×32`, so the assertion is satisfiable by one overlay.
   `tests/e2e/phase-03-element-editor.spec.ts:68,85`,
   `public/assets/levels/level-01.tmj:8718,8736,8754`

8. **Low — the doubling retune's "feel preserved" claim is inaccurate.** All 8 distance knobs
   consistently doubled, nothing missed — but apex-in-body-heights actually changed (3.13 vs.
   QA-recorded 3.27 before) because body height went 46→96 (2.087×, not 2×).
   `src/sim/player.ts:31,45`, `docs/QA-LOG.md:903,912`

**Plan dispositions:** P1–P8, P11 materially implemented. P9 real but overstates "preserved feel"
(see #8). P10 partly real — travel published but not pinned in tests (see #5).

**QA gate:** 3.1/3.2/3.3(partial)/3.5/3.6/3.6b satisfied; 3.4 missing right-edge coverage; 3.7
mechanically done but hands-on pass still pending per QA-LOG; 3.8 satisfied (largest file 377
lines); 3.9 partial (P10 gap); 3.10 not yet satisfied — `docs/reviews/phase-03-impl.md` doesn't
exist yet. `docs/QA-LOG.md:990,993`, `docs/prd/phase-03-tilemap.md:56`

**Sim boundary:** clean — no Phaser/clock/RNG/DOM in `src/sim/`, no float-second durations, no
authored fps.

**Doc drift:** `docs/prd/phase-03-tilemap.md:39` and `docs/prd/phase-08-levels.md:33` still say
root-level `levels/`, though PRD.md and the actual code correctly use `public/assets/levels/`.

**Could not check:** git diff against main, build, unit/Playwright/mutation runs, or `dist/` bytes —
all require process spawn, which is broken on this machine. Findings are from `node_repl` file
reads of the listed changed files only.

---

## Triage

Every finding **applied** or **rejected with a reason** *(vault C11)*. Each was re-verified locally
first, because this review executed nothing.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| I1 | Blocker *for Phase 4* | Phase 4 needs per-animation `simTicks` and a `walk` state; the sim has neither | **Recorded, not fixed — and re-scoped.** Verified: `PlayerState` is `idle \| run \| jump \| fall` (`src/sim/types.ts:41`). This is a **Phase 4 gate-0 input**, not a Phase 3 deliverable: Phase 3's §5 publishes the *grid and camera* contract, and animation timing derives from Phase 5's combat windows and Phase 4's own frame counts, neither of which exists. Authoring `simTicks` now would be inventing numbers two phases early — the same trap P9 avoided by measuring instead of guessing. **Carried into QA-LOG's "deliberately not fixed" with Phase 4 named as the owner.** |
| I2 | High | A renamed layer passes the boot gate and then throws in `GameScene` → `ready=false`, `bootError=null`, the hang state | **Applied.** `GameScene` now resolves the tileset and tile layer **by position**, not by hardcoded name — which is also what vault 3.3 wanted. `allObjects` filters non-objects, so a `null` entry can no longer throw inside the validator. |
| I3 | Medium | 3.4 never exercises the right or top clamp; an oversized `bounds.w` passes everything | **Applied.** New e2e scrolls the camera far past every edge and asserts `viewFits` plus that the clamps land exactly on the level's own extent. |
| I4 | Medium | `resolveCollisions` is wrong for a vertically offset `LocalBox` | **Applied in substance.** It now goes through `toWorld` (vault 2.10's single conversion) instead of an inline `halfW`, so the horizontal offset is correct for an asymmetric box. `PLAYER_BOX.y` is still 0 and the vertical offset case remains untested — **recorded** rather than speculatively supported. |
| I5 | Medium | The published camera travel is not pinned by the doc-lock test | **Applied.** The lock now derives `3840 × 456` from the shipped level and asserts the doc contains it. Mutation-checked. |
| I6 | Medium | Parser and editor use different "is this solid?" predicates | **Applied.** `isSolidObject` is exported from `tilemap.ts` and imported by the editor. One predicate, one answer. |
| I7 | Low | The overlay test is satisfiable by one rectangle, since three platforms share `256×32` | **Recorded, not fixed.** Real. The stronger assertion is per-strip position, which the editor spec does not currently read; the *live* nudge tests already prove a specific strip moves. **Carried into "deliberately not fixed"** rather than half-fixed. |
| I8 | Low | "Feel preserved" is inaccurate: 3.27 → 3.13 body heights, because the body grew 2.087× not 2× | **Applied to the wording.** The numbers were already recorded correctly and separately in QA-LOG; the prose overstated them. Corrected to say the feel is preserved **in time** (airtime identical) and **scaled in space**, with the ratio shift stated. |
| I9 | — | Doc drift: two phase documents still said root-level `levels/` | **Applied.** Both corrected. |

### On finding I2, and why it matters more than its rank

Codex ranked it High; it is the most valuable finding in this review. `describeLevelProblem`
deliberately reads no names *(vault 3.3)*, and `GameScene` hardcoded two — so the two halves of the
contract disagreed, and the gap between them produced **the one outcome the entire refuse-to-route
design exists to prevent**: not a refusal and not a clean boot, but a hang, reached *from a level the
gate had approved*. The `code-reviewer` gate owner found the same seam independently.

### What this review did not surface, and the `code-reviewer` brief 2 did

Run in parallel with this review, the adversarial `code-reviewer` brief found that the Element
Editor's **primary workflow emitted a level the boot gate rejected** — a defect introduced *by this
phase's own response to an earlier finding*. Both are recorded in
[QA-LOG.md](../QA-LOG.md) under Phase 3. Neither review found the other's headline defect, which is
the case for running both.
