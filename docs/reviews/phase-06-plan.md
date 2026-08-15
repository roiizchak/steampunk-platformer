# Codex plan review — Phase 6 (Collectibles, HUD, steampunk UI chrome)

← [reviews index](../PRD.md#the-codex-review-protocol) · phase doc: [prd/phase-06-hud.md](../prd/phase-06-hud.md)

**Review 1 of 2.** Run 2026-08-15, `/codex:rescue --wait --fresh`, before the first line of Phase 6
code. Reviewed the phase doc **together with** the concrete implementation plan written for it
(outside the repo, at `~/.claude/plans/docs-prd-phase-06-hud-md-let-s-continue-snoopy-jellyfish.md`).

The prompt carried the mandatory `node_repl` preamble *(PRD.md §The Codex review protocol)*, and
additionally named two documents as **known stale** so the reviewer would not report their contents
as current — the mitigation Phase 5's review asked for after two of six blockers turned out to be
Codex correctly reporting that the repository had no record of work that had been done
*(reviews/phase-05-impl.md:82-89)*:

- `docs/HANDOFF.md` still says "Phase 5 is FAILING". Phase 5 closed and merged; PRD.md marks it done.
- `docs/ASSET-PIPELINE.md` §8's JSON block describes a catalog schema that never shipped.

Node REPL file access succeeded. No files were modified.

---

## The review, verbatim

1. **Medium — unnecessary deliverables.** The goal does not require a new HUD-sheet generation: the repository already ships `health-assembly.png`, catalogs it as `hud-health`, and records that asset as generated with the current `nano-banana-pro`, not the retired model. The concrete plan itself admits the HUD already ships and identifies the reshoot as a separate user decision. [phase-06-hud.md:7] [index.json:25] [phase-04-world.md:1] [implementation plan:11] [implementation plan:32]

   Strictly, the three named test files are also verification machinery rather than behavior required by §1, although the QA protocol still requires equivalent evidence. `UIScene.ts`, `hud.ts`, and simulation-side pickup logic support the stated parallel-scene architecture and global sim boundary, so they are not comparable scope excess. [phase-06-hud.md:39] [PRD.md:58] [PRD.md:336]

   On the generated-art question: the plan partially reruns STYLE §7—dimensions, alpha, and true-size readability—but assumes the one-bar composition transfers to the new generation. STYLE's model-swap gate required visually looking for one health bar; the planned build gate merely counts connected assemblies, so one connected assembly containing two or segmented bars still passes. That assumption is unsafe because the current model is recorded as nondeterministic. [implementation plan:156] [STYLE.md:289] [STYLE.md:298] [STYLE.md:312] [STYLE.md:109] [build-world.mjs:336]

2. **Acceptance criteria that can false-pass, ranked:**

   - **Blocker — 6.1.** It tests the counter text and two digit widths, but never the required collect→scoreboard tween. The counter can update directly from simulation state while the tween never appears. [phase-06-hud.md:8] [phase-06-hud.md:47] [implementation plan:139] [implementation plan:181]

   - **Blocker — 6.4.** The planned unit test validates calculated fill widths and a predicate, not the pixels or Graphics commands actually drawn. The live renderer separately converts that width into a dark "spent" rectangle, so its coordinates, mask, or invocation can be wrong while every proposed unit assertion passes. [phase-06-hud.md:50] [implementation plan:106] [gameHud.ts:24]

   - **High — 6.2.** The E2E plan proves only `hudImage.willRender(uiCamera)` plus that image's position and size. It does not prove that the health Graphics or counter are rendered and pinned, so part of the HUD may disappear or move while 6.2 passes. [phase-06-hud.md:48] [implementation plan:183]

   - **High — 6.3.** The plan explicitly admits that `FIT` keeps `scale.gameSize` fixed and that its viewport-resize test therefore bounds a layout function rather than exercising a real game-size/camera resize. It can pass without proving the resize behavior named by the criterion. [phase-06-hud.md:49] [implementation plan:188] [config.ts:26]

3. **Blocker — vault 6.4.** It requires gating the cue on what is drawn, and the root rule requires measuring the claim against that thing. W4 instead asserts that the engine-free width is within `0.92 × slotW`; W9's supposedly drawn-object assertions cover 6.1–6.3 and 6.7, omitting health rendering entirely. The value asserted as TRUE is the helper result/`fillIsHonest` predicate, not the rectangle ultimately drawn by `Graphics.fillRect`. [phase-06-hud.md:22 (lessons)] [LESSONS-APPLIED.md:14] [implementation plan:110] [implementation plan:176] [gameHud.ts:28]

4. **Blocker — a render-facing collection event containing the collected gear's position and multiplicity.** W2 produces only `gearCollected: boolean`, while W6 assumes a "collect point" exists for positioning the flying icon. Existing tick events are boolean edges and `AdvanceEvents` is the same boolean record, so no earlier phase supplies that coordinate or a lossless sequence when multiple gears are collected. [implementation plan:81] [implementation plan:139] [types.ts:226] [types.ts:262]

5. **High — most likely subtle shipping error: the counter increments but the flying-gear tween intermittently disappears on multi-tick frames.** `GameScene.update()` discards the events returned by the first `advance(..., ticks - 1)` call and retains only the final tick's events. A gear collected during that discarded portion still changes `world.gearsCollected`, so criterion 6.1 sees the correct counter, but `events.gearCollected` never reaches the tween trigger. [GameScene.ts:247] [GameScene.ts:253] [implementation plan:84] [implementation plan:139]

### What Codex could not check — preserved verbatim

> I could not inspect the future regenerated HUD, implementation diff, screenshots, or test results
> because they do not yet exist, and I could not execute any test/build process under the stated
> process-spawn restriction. Node REPL file access succeeded; no files were modified.

---

## Triage

Every finding was re-verified locally against the files it cites before disposition. Codex reads here
but cannot run anything, so its findings are file-evidence until reproduced *(PRD.md:214-217)*.

| # | Finding | Severity | Disposition |
|---|---|---|---|
| **F1** | The HUD re-shoot is not required by §1 — `health-assembly.png` was generated on the **current** `nano-banana-pro`, not a retired model | Medium | **Correct on the fact.** Verified: `docs/generations/phase-04-world.md` gate 4b/G lists the HUD among ten `nano-banana-pro` generations. The phase doc's *"drawn by a model we no longer use"* refers to the HUD **inside the anchor scene image**, not the standalone shipped asset — the plan and the user's decision had both read it the other way. **Re-raised with the user**, with the `HUD_SLOT` re-measure risk stated explicitly; **the user chose to re-shoot anyway, 2026-08-15.** Recorded rather than silently kept *(C11)* |
| **F2** | `buildHud()` counts connected components, not bars | Medium | **Applied.** `build-world.mjs:341-346` throws unless `detectFrames` returns exactly one component — one component containing two bars passes. STYLE §7 gate 0.3 was answered *by looking*, and `STYLE.md:109` records the model as non-deterministic, so a recipe that transferred once is not evidence it transferred again. Every new HUD generation now gets an explicit human look for *"exactly one continuous bar"*, recorded in the generation log; the automated count is a floor, not the gate |
| **F3** | 6.1 never tests the tween | Blocker | **Applied.** The e2e spec now asserts a flying gear object enters UIScene's display list on collect and is gone once it lands. Without it, 6.1 passes on a counter that updates while nothing ever flies — and the plan had deliberately made the tween cosmetic, which is exactly what removed its gate |
| **F4** | 6.4 asserts the computed width, not the drawn rectangle | Blocker | **Applied, and this is the most important finding.** The unit test asserts `healthBarFillWidth`; `gameHud.ts:24-38` then converts that width into a dark *spent* rectangle whose coordinates, colour or invocation can all be wrong while every unit assertion passes. Criterion 6.4 now also reads **canvas pixels** inside the bar slot at 99 % health, red-run by deleting the `fillRect`. That is the root rule — measure the claim against the thing it claims about |
| **F5** | 6.2 checks only the plate image | High | **Applied.** `willRender` + screen-space position asserted for all three HUD objects: plate image, health Graphics, counter text |
| **F6** | 6.3 is inert under `FIT` | High | **Applied.** The plan had already declared the inertness, which Codex correctly points out is not the same as testing it. 6.3 now drives a real `game.scale.resize(w, h)` through the live handle **in addition to** the browser viewport resize |
| **F7** | No render-facing event carries collect position or multiplicity | Blocker | **Applied.** `TickEvents` is a boolean record OR-accumulated by `advance()` (`tick.ts:340-355`), so it cannot carry a coordinate. `GearSim.collectedTick: number \| null` carries position and multiplicity; the boolean edge stays for Phase 7's pickup cue, emitted at step 12 from the tick that produced it *(vault 2.5)* |
| **F8** | `GameScene.update()` discards the first batch's events | Blocker | **Applied as a root-cause fix.** Verified at `GameScene.ts:253-262`: the split batch keeps only the last tick's events. **This is pre-existing and already affects Phase 5** — a hit landing in a dropped tick emits nothing — so it is fixed once in the shared path rather than worked around for gears, with a unit test that forces a multi-tick frame. The `collectedTick` design of F7 makes the tween independent of it regardless |

**Applied: 8. Rejected: 0.**

Two findings changed the design rather than the tests — F7 (`collectedTick`) and F8 (the event
merge) — and F8 turned out to be a defect in shipped Phase 5 code that no Phase 5 gate had found.
