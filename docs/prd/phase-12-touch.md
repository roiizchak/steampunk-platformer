# Phase 12 — Touch and responsive support

← [PRD spine](../PRD.md) · prev: [Phase 11](phase-11-welcome.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope

Make the shipped game playable on a phone and a tablet, by touch, without disturbing the desktop
presentation, the world contract, or the engine-free simulation.

**The starting point.** A grep of `src/` for `setInteractive`, `pointerdown`, `activePointer`,
`addPointer`, `hitArea` and `gamepad` returns **zero matches**, and `gameConfig` sets no `input`
block at all. On a phone the canvas renders correctly and nothing can drive it.

**And that is bigger than the play scene.** All three terminal screens are keyboard-only —
`TitleScene.ts:333-335` (Enter/NumpadEnter/Space), `LevelSelectScene.ts:145-167`
(UP/W/DOWN/S/ENTER), `gameComplete.ts:119-135` (ANY_KEY_DOWN filtered to Enter). A touch player
cannot start the game, cannot choose a level and cannot continue past one. Shipping in-play controls
alone would produce a phone build that still cannot be played, and an "owner played it on a phone"
criterion passable only by reaching for a keyboard. **The three terminal screens are therefore in
scope**, as a consequence of the goal rather than an expansion of it.

**The measurement the design rests on.** `Phaser.Scale.FIT` holds the backing store at 1920 × 1080 at
every viewport and DPR (`ENGINE-NOTES.md:305-331`, measured), so a target's real size in CSS pixels
is `gamePx × canvasCssWidth / 1920`. At the worst in-scope viewport — iPhone SE landscape, scale
**0.347** — a **160 game px** button is **55.6 CSS px**, clearing the 44 px floor. At phone portrait,
scale **0.203**, a legal 44 CSS px button would cost **217 of 1080 game pixels**: a fifth of the play
area per button. Phone portrait therefore prompts to rotate; portrait **tablet** (0.400) is playable
and in scope.

**Five edge-anchored buttons**, 160 game px with 32 px gaps: left and right bottom-left, attack and
jump bottom-right, pause top-right. Not a D-pad and not a stick — the sim's input surface is six
booleans with no analog axis. Touch is a second *writer* of the existing `InputSnapshot` through the
existing latch doors, never a second control path.

Out of scope: gamepad, haptics, a pause *scene* (pause reuses ESC's existing level-menu route),
gesture controls, PWA/install/fullscreen, and any change to `src/sim/`, the 14-step tick order, the
world contract or `Phaser.Scale.FIT`. **Not** `physics-arcade` — collision remains our own sim.

### 2. Required skills

`input-keyboard-mouse-touch` · `scale-and-responsive` · `sprites-and-images` ·
`game-object-components` · `scenes` · `ui-ux-pro-max` (touch-target sizing) · `fal-workflow` ·
`fal-models-catalog` · `game-asset-generation` (the button plate) · `e2e-playwright-testing` (specs) ·
`playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`

### 3. Vault-in

Full checklist: [lessons/phase-12-touch.md](../lessons/phase-12-touch.md).

**12.1** Ship the path, not just the feature — the whole route to a thing is part of it *(blocker)* ·
**12.2** A decision function used as its own oracle cannot fail *(2.12 + C2, blocker)* ·
**12.3** Never infer a generated image's dimensions from its aspect label *(4.11, blocker)* ·
**12.4** Anything the engine applies per rendered frame or presented pixel is outside the tick rule ·
**12.5** `scene.launch` always queues and shutdown preserves the instance *(blocker)* ·
**12.6** Phaser cleans up its own listeners and nothing else *(9.3)* ·
**12.7** A criterion a correct implementation cannot satisfy is a defect in the gate *(C2)* ·
**12.8** A partition must be total by construction *(C2)* ·
**12.9** Detect greenness positively, including the count *(C2)* ·
**12.10** Grey-box before art; the ceiling before the first generation *(4.2b)* ·
**12.11** Kill every server by port before reporting done *(C13)*.

### 4. Codex plan review

**Ran before any code**, in one session with context preserved across rounds.
`VERDICT: REVISE` ×3, then `VERDICT: APPROVED` at round 4 of a maximum 5.
**24 findings — 5 BLOCKER, 11 HIGH, 8 MEDIUM/LOW — every one applied, none rejected.**
Full transcript and triage: [reviews/phase-12-touch-plan.md](../reviews/phase-12-touch-plan.md).

Three findings would each have cost a build: that a touch player cannot start the game; that
`attachHud` runs before `UIScene.create()` so the binding would dereference `undefined` and leave the
*first* level's controls inert; and that a hardcoded plate-dimension constant was the inference
`FAL-MODELS.md:115-122` forbids — written twice, and it would have thrown *after* the money was
spent. It also found that **18 of the first draft's 21 criteria could stay green with the whole
feature deleted**, which is what the mutation matrix in §6 exists to answer.

### 5. Deliverables

`src/render/touchLayout.ts` · `src/scenes/inputMerge.ts` · `src/scenes/touchControlsLayer.ts` ·
`src/scenes/touchRoutes.ts` · `src/scenes/rotatePrompt.ts` · `tools/gen/promptTouch.mjs` ·
`tools/gen/buildTouchAtlas.mjs` · `public/assets/ui/touch-*.png` (five) ·
`tests/unit/touch-layout.test.ts` · `tests/unit/input-merge.test.ts` ·
`tests/unit/touch-contacts.test.ts` · `tests/unit/touch-draw-path.test.ts` ·
`tests/unit/shipped-touch.test.ts` · `tests/e2e/touchHarness.ts` ·
`tests/e2e/phase-12-touch.spec.ts` · `tests/e2e/phase-12-journey.spec.ts` ·
`tests/e2e/phase-12-viewport.spec.ts` · `tests/e2e/phase-12-perf.spec.ts`
Modified: `GameScene.ts` · `gameHud.ts` · `gameInput.ts` · `UIScene.ts` · `TitleScene.ts` ·
`LevelSelectScene.ts` · `gameComplete.ts` · `config.ts` · `index.html` · `playwright.config.ts` ·
`public/assets/index.json` · `docs/PRD.md` · `tests/unit/docs-contract.test.ts`

### 6. QA gate

| # | Criterion | Method | Owner |
|---|---|---|---|
| 12.1 | Touch-only journey: page load to title to level select to play to complete to continue, driven only by touch contacts dispatched at measured screen coordinates — zero keyboard events, and no direct call to `dismiss`, `play` or `advance` | `npm run test:e2e` | e2e |
| 12.2 | A touch contact on jump produces the same sim intent as SPACE, and the jump fires at a **named tick index** | `npm run test:e2e` | e2e |
| 12.3 | Multi-touch: RIGHT held on contact 1 while JUMP fires on contact 2, both in one tick batch — raw multi-contact dispatch, not Playwright's single-tap `Touchscreen` | `npm run test:e2e` | e2e |
| 12.4 | Touch and keyboard levels merge in `inputMerge`, and `GameScene` calls it with live touch state — proved behaviourally, not by source text | `npm test` + `npm run test:e2e` | `voltagent-qa-sec:qa-expert` |
| 12.5 | Contact identity: two fingers on one button, releasing one keeps it held; a contact that slides off and releases elsewhere still clears; every loss path (Game PAUSE/SLEEP/SHUTDOWN/DESTROY, BLUR, HIDDEN, GAME_OUT, scene POINTER_UP and POINTER_UP_OUTSIDE) cancels it; cancellation runs before disable; and the listener registrations themselves are asserted | `npm test` + `npm run test:e2e` | `voltagent-qa-sec:qa-expert` |
| 12.6 | A level transition rebinds the session idempotently — no duplicate controls, listeners or stale `input$` after `scene.start('Game')` | `npm run test:e2e` | e2e |
| 12.7 | No control drawn or interactive on a non-touch desktop pointer; the Phase 2 movement suite is unregressed | `npm run test:e2e` | e2e |
| 12.8 | Every live touch target's measured bounds — the five play controls and the title, level-menu row and completion zones — lie fully inside the measured canvas CSS rect and are pairwise non-overlapping, at every in-scope viewport | `npm run test:e2e` | e2e |
| 12.9 | Every one of those targets is at least 44 CSS px with at least 8 CSS px gaps, derived from the measured bounds and not from the layout predicate; the figure is cited, not estimated | `npm run test:e2e` + measured | `voltagent-qa-sec:accessibility-tester` |
| 12.10 | The rotate prompt appears if and only if a live measured target falls under 44 CSS px | `npm run test:e2e` | e2e |
| 12.11 | Frame budget unregressed with controls drawn — headed, real GPU, paired arms in one session, and a positive "all five drawn" assertion before timing begins | `npm run test:e2e` | `voltagent-qa-sec:performance-engineer` |
| 12.12 | Controls hidden and `disableInteractive()`d whenever `Game` is not RUNNING, `playerInputEnabled` is false, or the rotate prompt is up — proved by tapping each of the five underlying control coordinates and asserting no movement, jump, attack or route effect (tick progression continues; a frozen tick is not the claim) | `npm run test:e2e` | e2e |
| 12.13 | A drag starting on a control is not stolen by browser pan, pinch or double-tap zoom | `playwright-cli` + hands-on *(C4)* | play |
| 12.14 | The button art is readable at true on-screen size at the smallest in-scope viewport | `playwright-cli` screenshots | `voltagent-qa-sec:ui-ux-tester` |
| 12.15 | `src/sim/` boundary intact and the whole suite runs with Phaser uninstalled | `npm run test:sim-isolated` | — |
| 12.16 | Draw-path: blanking `touchLayout`'s bodies or deleting its production consumer turns a behavioural fake-scene gate red | `npm test`, watched failing | `voltagent-qa-sec:code-reviewer` |
| 12.17 | Shipped bytes: five 160x160 PNGs, alpha present, five distinct silhouettes, each bound to its own key | `npm test` | — |
| 12.18 | Every generation logged with its `request_id`; the touch-UI figure agrees with its $5 ceiling; the art ceiling reads $60 against $55.50 | doc review | — |
| 12.19 | Every new gate watched failing under the mutation it names, mutation confirmed reverted by "content changed AND the original count dropped by one" — and every row of the mutation matrix reds at least one named gate | watched failing | — |
| 12.20 | `dist/` carries no dev-only scene key, debug symbol or user-facing dev prose | `npm run build` | — |
| 12.21 | No source, test, tool or config file over 400 lines without a `SIZE-EXEMPTION:` line | `wc -l` sweep | — |
| 12.22 | Codex **plan** review ran and converged to `VERDICT: APPROVED` before any code | `codex` | codex |
| 12.23 | Codex **implementation** review ran on the final diff, after the gate owners | `codex` | codex |
| 12.24 | Owner played the game by touch on a real device, start to finish, with no keyboard touched | `playwright-cli` + hands-on *(C4)* | play |

**The mutation matrix (12.19).** Deletion resistance is not a claim; every row below is built,
watched red, and reverted. Criteria 12.7, 12.15, 12.17, 12.18 and 12.20–12.23 are inherently
absence-, artifact- or process-shaped and cannot be made wiring-resistant — stated rather than
papered over.

| # | mutation | must red | measured |
|---|---|---|---|
| M1 | delete the `TouchControlsLayer` construction in `UIScene.create()` | 12.2, 12.8, 12.16 | RED 7/9 |
| M2 | delete the pending-binding consumption in `TouchSession.activate()` | 12.1 (cold boot) | RED 4/8 |
| M2b | delete `session.deactivate()` from `attachUiTouch`'s `destroy()` | 12.6 (level-select return) | **GREEN — hole; gate written** → RED 1/5 |
| M3 | delete the `ui.bindTouchSession(...)` call in `attachHud` | 12.2, 12.4 | RED 7/9 |
| M4 | revert `sampleHeldKeys` to its 3-argument form | 12.4 | RED 5/9 |
| M5a | delete the title tap route | 12.1 | RED 1/1 |
| M5b | delete the level-menu row tap routes | 12.1 | RED 1/1 |
| M5c | delete the completion tap route | 12.1 | RED 1/1 |
| M6 | delete the scene `POINTER_UP` registration, leaving `POINTER_UP_OUTSIDE` | 12.5 | RED 2/9 |
| M7 | swap the cancel/disable order | 12.5 | RED 1/22 |
| M8 | drop `!touchTargetsFit` from the disable predicate | 12.12 | RED 2/11 |
| M9 | delete the bound `Game` scene's lifecycle listeners | 12.5 | RED 1/22 |
| M10 | blank `touchLayout`'s function bodies | 12.8, 12.16 | RED 2/25 |
| M11 | shift **one** control 200 px toward its neighbour | 12.8 and 12.9 — a uniform offset preserves gaps and reds only 12.8 | RED 8/11 |
| M11b | shift **all** controls 200 px off-canvas | 12.8 alone | RED 7/11 |
| M12 | remove `TOUCH_ALL_SPECS` from the base `chromium` `testIgnore` | the per-project collection-count assertion | RED 3/4 |
| M13 | drop `hasTouch: true` from `chromium-touch-gpu`'s `use` block | 12.11's "all five drawn" precondition | **GREEN — hole; gate written** → RED 1/5 |
| M13b | drop `hasTouch: true` from `chromium-touch`'s `use` block | the config-shape gate | RED 1/5 |
| M14 | delete `destroy()`'s removal of the layer's `game.events` subscriptions | 12.5 | RED 1/22 |
| M15 | make the merge ignore the touch record | 12.4 | RED 4/11 |
| M16 | let a second `begin()` on a live pointer re-arm an edge | 12.5 | RED 2/10 |

**Two rows reddened nothing, and both were holes rather than mutations to drop.**

🔴 **M2b.** `attachUiTouch`'s teardown had no gate at all. `touch-session.test.ts` drives the session
against a fake layer and never imports `attachUiTouch`; `touch-draw-path.test.ts` drives the layer
directly and never imports the session. The seam between them — the one line that stops the session
writing to a layer about to be destroyed — was visible to neither.
`tests/unit/ui-touch.test.ts` was written for it and reds under the mutation.

🔴 **M13.** No gate read a project's `use` block. `phase-12-perf.spec.ts` builds both arms itself
from `browser.newContext({ hasTouch })`, so the project's value never reaches it — and the spec's
own docstring claimed the opposite, which is corrected in place.
`tests/unit/playwright-projects.test.ts` now reads the blocks, and **M13b** — the same drop on
`chromium-touch`, whose specs *do* use the project context — reds it too.

⚠️ **The runner had a defect of its own, and it is the reason the count guard exists.** A lowercase
drive letter as the child process's `cwd` makes vitest fail to collect with *"Cannot read properties
of undefined (reading `config`)"* and write a report of **one failed suite and zero tests** — which,
read as an exit code or a failure count, is indistinguishable from a mutation that reddened
something. Measured: the identical command selects 10 tests under `C:/…` and 0 under `c:/…`. Nine
rows were briefly and wrongly recorded as holes before the count was read *(the §5 rule: detect
greenness positively, **including the test COUNT**)*.

**Regression set:** the full unit suite (`npm test`), `npm run test:sim-isolated`, `npm run build`
plus `verify-dist`, and the full `npm run test:e2e` — one Playwright run at a time, nothing heavy
beside it, with per-project collection counts read positively rather than inferred from an exit code.

### 7. Vault-out

What this phase learned and owes forward: that the route to a feature is part of the feature, and
asking "what must the player do before reaching this?" would have caught the blocker before Codex
did; that a predicate shared between production and its test is a drift fix and a blindness at once,
so acceptance must measure the live object; that a hardcoded dimension for a generated image is the
same defect however carefully it is derived, and this phase wrote one twice; that `scene.launch`
always queues and shutdown preserves the instance, so "the first time is different" is a false
distinction; that Phaser tears down its own listeners and no others; and that a partition defined by
exclusion leaves a hole a future filename falls through — define one set and subtract.

### 8. Demo

Open the game on a phone in landscape: the welcome screen takes a tap, the level menu's rows are
finger-sized, and five brass controls sit in the corners. Run right and jump at the same time with
two thumbs, hit an enemy with the attack button, and tap pause to get back to the menu. Turn the
phone upright and the game asks you to turn it back.
