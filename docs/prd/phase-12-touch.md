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

**Six edge-anchored buttons**, 160 game px with 32 px gaps: left, right and the walk/run latch
bottom-left, attack and jump bottom-right, pause top-right. `TOUCH_IDS` is the authority on that
list; this sentence said **five** until 2026-08-31, after the owner added the walk/run control.
Not a D-pad and not a stick — the sim's input surface is six booleans with no analog axis. Touch is a second *writer* of the existing `InputSnapshot` through the
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
`tools/gen/buildTouchAtlas.mjs` · `public/assets/ui/touch-*.png` (six) ·
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
| 12.5 | Contact identity: two fingers on one button, releasing one keeps it held; a contact that slides off and releases elsewhere still clears; every loss path (Game PAUSE/SLEEP/SHUTDOWN/DESTROY, BLUR, HIDDEN, scene POINTER_UP and POINTER_UP_OUTSIDE) cancels it; cancellation runs before disable; and the listener registrations themselves are asserted, **including that GAME_OUT is NOT among them** *(amended 2026-09-02, owner decision: GAME_OUT was in this list and was the defect — Phaser fires it whenever `document.elementFromPoint` leaves the canvas, so one thumb a few millimetres past a pillarboxed edge dropped every contact, the other hand's held jump included. Reproduction watched red in `phase-12-gestures.spec.ts` 12.13b before the subscription was removed. A criterion that names a defect as a requirement is the thing to change; the absence is now asserted so a re-added one-line subscription reds)* | `npm test` + `npm run test:e2e` | `voltagent-qa-sec:qa-expert` |
| 12.6 | A level transition rebinds the session idempotently — no duplicate controls, listeners or stale `input$` after `scene.start('Game')` | `npm run test:e2e` | e2e |
| 12.7 | No control drawn or interactive on a non-touch desktop pointer; the Phase 2 movement suite is unregressed | `npm run test:e2e` | e2e |
| 12.8 | **Discrete** touch targets — the play controls and the level-menu rows — have measured bounds fully inside the measured canvas CSS rect and pairwise non-overlapping, at every in-scope viewport. A **whole-screen route** zone — the title and the completion zones — is measured for **coverage** instead: no reachable strip of canvas is left unroutable *(amended 2026-08-31, owner decision)* | `npm run test:e2e` | e2e |
| 12.9 | Every one of those targets is at least 44 CSS px with at least 8 CSS px gaps, derived from the measured bounds and not from the layout predicate; the figure is cited, not estimated | `npm run test:e2e` + measured | `voltagent-qa-sec:accessibility-tester` |
| 12.10 | The rotate prompt appears if and only if any target that would have to be hittable on this screen — the screen's own route **and** the play controls — falls under 44 CSS px *(amended 2026-08-31, owner decision; this is D1, and what the one shared predicate computes)* | `npm run test:e2e` | e2e |
| 12.11 | Frame budget unregressed with controls drawn — headed, real GPU, paired arms in one session, and a positive "every control drawn" assertion before timing begins | `npm run test:e2e` | `voltagent-qa-sec:performance-engineer` |
| 12.12 | Controls hidden and `disableInteractive()`d whenever `Game` is not RUNNING, `playerInputEnabled` is false, or the rotate prompt is up — proved by tapping each underlying control coordinate and asserting no movement, jump, attack or route effect (tick progression continues; a frozen tick is not the claim) | `npm run test:e2e` | e2e |
| 12.13 | A drag starting on a control is not stolen by browser pan, pinch or double-tap zoom — **and a drag that leaves the canvas edge does not drop the contact** *(the fourth check, from this log's own § 12.13; it was always one of the four and the criterion line named three)*. The machine half is pinned in three places, none of which closes the criterion: `tests/unit/gesture-prevention.test.ts` (the source CSS), `verify-dist.mjs` (the same rules in `dist/index.html`) and `tests/e2e/phase-12-gestures.spec.ts` (the browser's own `defaultPrevented`, `visualViewport.scale`, and the contact surviving the edge) | `playwright-cli` + hands-on *(C4)* | play |
| 12.14 | The button art is readable at true on-screen size at **every integer CSS size in the live band, 44 through 48 px** *(amended 2026-08-31, owner decision; it read "at the smallest in-scope viewport" and the gate had already widened past that on its own — `resize.mjs`'s box filter is `Math.floor`-partitioned and therefore NOT monotonic in output size, so a pass at 44 is a pass at one point of a band. It reddened `touch-attack` stroke 2 at **2.740:1 at 47 px** between two sizes both reading 3.318:1)* | `playwright-cli` screenshots | `voltagent-qa-sec:ui-ux-tester` |
| 12.14b | **The occlusion bound is WITHDRAWN, and a hands-on hazard pass replaces it** *(2026-09-01, owner decision)*. `PLATE_ALPHA` is **0.9**. The rule was "a plate keeps ≥ 60 % of the resting state's residual transparency"; 0.9 leaves 0.10 against the measured-readable 0.45 — **22 %** — and is past the **0.86 measured to erase the content underneath**. The 19.9 % measurement (175 of 878 standing positions carry a hazard, an enemy or the goal behind a plate) is unchanged and stays in `touchMarks.ts` as the evidence. What must now be checked by hand on a device: the **level-01 `brass-sentry`** that shoots from behind the pause plate for nine consecutive positions, and the **level-04 goal** under the jump plate for nine more. If either is unplayable, 0.9 comes back down | hands-on on the owner's device, screenshotted with `playwright-cli` | `play` |
| 12.15 | `src/sim/` boundary intact and the whole suite runs with Phaser uninstalled | `npm run test:sim-isolated` | — |
| 12.16 | Draw-path: blanking `touchLayout`'s bodies or deleting its production consumer turns a behavioural fake-scene gate red | `npm test`, watched failing | `voltagent-qa-sec:code-reviewer` |
| 12.17 | Shipped bytes: **six** 160x160 PNGs, alpha present, six distinct **marks**, each bound to its own key *(amended 2026-08-31, owner decision: the six deliberately share one round brass disc, so the distinctness that can be asserted is of the engraved mark, not of the outline)* | `npm test` | — |
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
| M13 | drop `hasTouch: true` from `chromium-touch-gpu`'s `use` block | 12.11's "every control drawn" precondition | **GREEN — hole; gate written** → RED 1/5 |
| M13b | drop `hasTouch: true` from `chromium-touch`'s `use` block | the config-shape gate | RED 1/5 |
| M14 | delete `destroy()`'s removal of the layer's `game.events` subscriptions | 12.5 | RED 1/22 |
| M15 | make the merge ignore the touch record | 12.4 | RED 4/11 |
| M16 | let a second `begin()` on a live pointer re-arm an edge | 12.5 | RED 2/10 |
| M17 | delete the rotate-prompt gate from a tap route's `pointerdown` | 12.9, 12.10 | RED 2/10 |
| M18 | make the keyboard read drop `walkHeld` | 12.4 | RED 3/21 |
| M18b | copy-paste the `left` read into the `right` read | 12.4 | RED 3/21 |
| M19 | drop `SCENE_SLEEP` from the lifecycle registration loop | 12.5 | RED 2/29 |
| M20 | wire `GAME_HIDDEN` to a no-op handler | 12.5 | RED 1/29 |
| M21 | make the plate opaque, hiding the level under every control | 12.14 | **GREEN — hole; gate written** → RED 2/3, after the plate-ink cases became their own file |
| M22 | drop the PROMPT term from the tap gate, re-opening the tap-through | 12.10, 12.12 | RED 1/11 |
| M23 | make the PRESSED plate opaque, hiding the level under the thumb | 12.14 | RED 1/3 |
| M24 | drop the TARGETS term from the tap gate, so a too-small route stays live | 12.9 | **GREEN — hole; gate written** → RED 1/12 |
| M25 | drop the `LevelSelect` start latch, so two fingers start two levels | 12.5 | **GREEN twice — the gate itself was decoration** → RED 1/10 |
| M26 | unlight the plate on any release, ignoring the other finger | 12.5, 12.14 | RED 1/4 |
| M27 | set the pressed alpha to **0.86**, the value measured to erase the level | 12.14 | RED 1/4 |
| M28 | hide `hasTouch: false` behind a block comment claiming `true` | the project-selection gate | RED 1/5 |
| M29 | stack the level rows at half pitch, so every pair overlaps | 12.8, 12.9 | RED 2/21 |
| M30 | make the `LevelSelect` start latch a field initialiser again | 12.6 | RED 1/11 |
| M31 | give `RotatePrompt` the play controls only, so a small route is silently dead | 12.10 | RED 1/9 |
| M32 | stop re-placing the prompt on a design-size change | 12.19 | RED 1/10 |
| M33 | drop the zero-scale guard, so a collapsed canvas emits an `Infinity` font size | 12.19 | RED 1/10 |
| M34 | drop the touch source from `walkHeld`, so a phone always runs again | 12.4 | RED 1/23 |
| M35 | clear the walk latch on a loss path, un-choosing the player's gait | 12.5 | RED 2/31 |
| M36 | unlight the walk plate the moment the finger leaves | 12.14 | RED 1/31 |
| M37 | hang every control on the same face, so one button is drawn six times | 12.17 | RED 1/7 |
| M38 | draw the art fully opaque, undoing the occlusion measurement | 12.14 | RED 1/7 — ⚠️ **rescoped 2026-09-01**: the resting value it defends is now the owner-chosen 0.9, not the measured 0.55. The gate still reds on a value that is not `PLATE_ALPHA`; it no longer certifies occlusion. See 12.14b |
| M39 | leave a re-placed face at its old size when the design size moves | 12.8 | **GREEN twice** → RED 2/9 |
| M40 | copy one shipped face over another | 12.17 | RED 1/4, on the shipped bytes |
| M41 | do not restore the gait onto a freshly activated layer | 12.5 | RED 1/10 |
| M41b | the same, in the browser, across a real level-select round trip | 12.5, 12.6 | RED 1/3 |
| M42 | clear the walk latch on shutdown, as if it belonged to the layer | 12.5 | RED 2/10 |
| M43 | leave the retired layer's walk callback wired to the live session | 12.5 | RED 1/10 |
| M44 | rest the art at 0.69 — inside the old bound, away from the measured 0.55 | 12.14 | RED 1/8 — ⚠️ **superseded 2026-09-01** by 12.14b; the 60 %-residual bound this defended is withdrawn, and the case that carried it now pins the owner-chosen resting value and a visible press step instead |
| M45 | copy one face's central MARK onto another, leaving both discs alone | 12.17 | RED 1/4, at 0.0 % — ♻️ **RE-RUN 2026-09-02 against the gate that replaced it.** The mask used to come from `keylineMarks`; it is a fixed central square now, so the row had to be re-measured rather than assumed to carry over. `touch-walk`'s central square copied onto `touch-left`: **RED 2/15** — the central-square distinctness comparison at **0.0 %** on the `left`/`walk` pair, and byte-for-byte cut-face equality. **This is the distinctness gate's red proof** |
| M46 | ship the faces faded FLAT — ink at the plate's alpha, as before the contrast repair | 12.14, 12.17 | RED 3/7, the ink at **2.43:1** — ⛔ **WITHDRAWN 2026-08-31** (the gate this reddened was deleted with the ink pass) — **SUCCEEDED BY M99**, the same flat-alpha damage against the two-band alpha claim that replaced it |
| M47 | draw the generated face at `PLATE_ALPHA`, double-fading the baked plate | 12.14 | **GREEN — the assertion was an identity** → RED 2/7 — ⛔ **WITHDRAWN 2026-08-31** (the gate this reddened was deleted with the ink pass) — **SUCCEEDED BY M104**: the double-fade is now a draw-time value, and `touch-plate-ink.test.ts` reds on it |
| M48 | toggle walk for every pointer, not on the 0 -> 1 transition | 12.5 | RED 1/8 |
| M49 | open the level menu for every pointer that lands on pause | 12.5 | RED 1/8 |
| M50 | drop a cell descriptor, as the circular count guard allowed | 12.17 | RED 1/7 |
| M51 | dim only the WALK engraving, leaving every highlight outside it | 12.14 | RED 1/7 |
| M53 | sweep every `.png` in the output directory, not just the touch faces | 12.19 | **GREEN — the sweep was inline and ungated** → RED 1/5 |
| M54 | revert the CLI entry guard to the `%20` comparison that never matched | 12.19 | **GREEN — nothing ran the CLI** → RED 1/2 |
| M55 | do not thicken the engraving, leaving only the hairline keyline | 12.14 | **GREEN — nothing pinned the thickening** → RED 1/6 — ⛔ **RETIRED 2026-09-02.** It edits `keylineMarks`’ thickening pass in `touchInk.mjs`, deleted in `949abb1`. There is no engraving pass to not-thicken, so the mutation is unbuildable rather than green. Same call as M82 |
| M56 | paint the keyline over the mark as well as around it | 12.14 | RED 1/6 — ⛔ **RETIRED 2026-09-02.** It paints a keyline that no code draws — `touchInk.mjs` is deleted. Unbuildable, not green |
| M57 | paint the keyline over transparent pixels too | 12.14 | **GREEN twice — the fixture could not reach the guard** → RED 1/6 — ⛔ **RETIRED 2026-09-02.** The transparency guard it removes lives in `keylineMarks`, deleted. Unbuildable, not green — and its lesson (a test can be about the right property and still be unable to observe it) is kept in the prose below |
| M58 | make the OUTER brass opaque, leaving the modal alpha where it was | 12.14 | RED 1/7, at alpha 255 against a baked 165 |
| M59 | fade the whole `walk` engraving except 32 pixels | 12.14, 12.17 | RED 2/7 |
| M60 | erase `walk`'s 4 112 mark pixels to baked brass, keeping two 4x4 ink cells | 12.14, 12.17 | **GREEN — the mask shrank with the damage** → RED 3/8 — ⛔ **WITHDRAWN 2026-08-31** (the gate this reddened was deleted with the ink pass) — **SUCCEEDED BY M103**, the same erasure against byte-for-byte cut-face equality |
| M61 | drop every non-mark pixel of `pause` to alpha 1 — the plate effectively gone | 12.17 | **GREEN — the bound was one-sided** → RED 2/8 — ⛔ **WITHDRAWN 2026-08-31** (the gate this reddened was deleted with the ink pass) — **SUCCEEDED BY M100**, the same one-sided damage against the two-band alpha claim |
| M62 | repaint 2 014 pixels OUTSIDE `left`'s mark dark and opaque | 12.17 | **GREEN — classified as neither ink nor plate** → RED 2/8 — ⛔ **WITHDRAWN 2026-08-31** (the gate this reddened was deleted with the ink pass) — **SUCCEEDED BY M101**, which measures that the two-band claim still cannot order this damage and names the gate that can |
| M63 | set `PLATE_ALPHA_BAKED` to 1 and re-cut the six faces | 12.17 | RED 1/8, and the reproduction gate stays green — which is the split those two gates exist for — ⛔ **RETIRED 2026-09-02, on a measurement.** `PLATE_ALPHA_BAKED` is deleted; the bytes ship unfaded and the fade is a DRAW-TIME value now. **M102 probed it**: raising every non-transparent pixel to full alpha in the six shipped faces *and* the six committed cuts together — a pipeline change faithfully re-cut — is **GREEN 0/15**, and that is the designed split, not a hole. The property did not become ungated, it MOVED, and the gate that holds it at the new site is the one **M104** reds. The residual is M64’s stated limit of a committed oracle, answered by the pinned key/row/col literal |
| M64 | swap the `left` and `right` COLUMNS in `TOUCH_PLATE_CELLS` and re-cut | 12.17 | **GREEN — both oracles moved together** → RED 1/8 |
| M65 | skip the pale halo below the face midpoint, and re-cut | 12.14 | **GREEN at 3.318:1 — one best pixel for a whole glyph** → RED 1/8, `pause` stroke 3 at 1.21:1 — ⛔ **RETIRED 2026-09-02.** It skips a pale halo that `touchInk.mjs` no longer paints, and its red proof was a per-stroke contrast figure the owner has ruled must not be rebuilt (2026-09-02). Unbuildable, not green |
| M66 | mirror the COLUMNS in the builder's grid selection, leaving the descriptors alone | 12.17 | **GREEN — the pinned table is only half the contract** → RED 1/2 |
| M67 | M65 plus an 11-pixel pale bridge, so the damaged glyph stays one component | 12.14 | **GREEN — the halo defined the strokes** → RED 1/1 |
| M68 | collapse every label in `markComponents` to zero | 12.14 | **GREEN — the split had no gate of its own** → RED 3/5 — ⛔ **RETIRED 2026-09-02.** `markComponents` — the stroke splitter — is deleted with `touch-strokes.test.ts`. Unbuildable, not green |
| M69 | keep the mark bit on a transparent pixel, skipping only the paint | 12.14 | **GREEN, and the picture is byte-identical** → RED 1/8 — ⛔ **RETIRED 2026-09-02, and it is the one that cannot come back.** The mutation leaves the six PNGs **byte-identical**, so no statistic computed over the shipped bytes can ever order it; the code it edited is deleted as well. Recorded rather than replaced — replacing it would mean a new contrast statistic, which owner decision 2 of 2026-09-02 forbids |
| M70 | make `main()` ignore the parsed mode and always cut from the plate | 12.17, 12.19 | RED 2/18 — 12 files written where 6 were claimed |
| M71 | route the `--cell` build's output to a fixed key instead of the requested one | 12.17, 12.19 | RED 1/18 |
| M72 | draw 2000 extra copies of each control's OWN face on the touch arm, then re-run the criterion's own paired procedure | 12.11, 12.19 | **GREEN at 40 copies — 0.0563 ms against a 0.5 ms bound**; **GREEN at 800 under sweep load — 0.5007 ms, a 0.0007 ms margin** → RED at 2000: 1.7684 ms, every pair over 1.32 |
| M73 | run the controls' own `TouchSession.refresh()` 6000 extra times per frame on the touch arm | 12.11, 12.19 | **GREEN twice — the `scene.update` hook was inert (Phaser caches `sys.sceneUpdate`), then 300/frame gave 0.0500 ms** → RED at 6000: 0.9000 ms, every pair 0.9000 |
| M74 | measure the contrast sweep at every size in the live band instead of pinning 44 | 12.14, 12.19 | **RED on its first run — `touch-attack` stroke 2 at 2.740:1 at 47 CSS px**, between two sizes both reading 3.318:1. The box filter is not monotonic in output size — ⛔ **RETIRED 2026-09-02.** It sweeps the live 44–48 band with the per-stroke contrast gate, deleted. The band itself is now covered by nothing automated: 12.14 rests on the hands-on pass and `voltagent-qa-sec:ui-ux-tester`, which is what the criterion always required |
| M75 | return `workMedianMs: 0` from the sampler, collapsing BOTH arms' main-thread measurement | 12.11, 12.19 | RED 1/1 — **and only the floor fired.** The delta stayed inside `median-only` +/-0.5 because zero minus zero is zero: the case a paired statistic structurally cannot see |
| M76 | make `--adopt` ignore the override map and recut every face from the plate | 12.17, 12.19 | RED 1/19 — the re-shot cell silently reinstated from the plate |
| M77 | make `familyFailures` return `[]` for every set | 12.17, 12.19 | RED 9/14 — a re-toned cell, a lighter button, a square bezel, six identically non-brass buttons, **a button lit from the wrong side**, **one rotated half a turn**, **one that darkens a band out of the comparison**, and the builder on both its paths |
| M79 | delete the family check from `runBuild`, leaving `familyFailures` intact | 12.17, 12.19 | RED — **only the builder cases.** The decision function's own stayed green, which is exactly the hole: a gated function with an ungated seam |
| M78 | drop `stopSubmitting()` from the clean drain, restoring drain-frame query submission | 12.11, 12.19 | RED 1/1 — **8** queries opened after the window closed, which is also the size of the contamination the repair removed |
| M80 | make `measurePlateRows` always return 3 | 12.17, 12.19 | RED 2/24 — the two-row and four-row sheets. **Every fixture in the suite was a three-row sheet before this gate existed**, so the estimator had no caller that could tell it from the constant it replaced |
| M81 | delete the joint-grid comparison, keeping the three scalars | 12.17, 12.19 | RED 3/24 — the darkened bezel, the half turn and the cross-swap. The scalars see none of the three |
| M82b | load `--cell`'s neighbouring cuts only `if (existsSync)`, as it was | 12.17, 12.19 | RED 1/16 — a directory missing four cuts judged a family of two and wrote the candidate, the check passing because nothing was left to disagree with it |
| M83 | delete the CORE, OCCUPANCY and GRAIN comparisons, keeping the joint grid | 12.17, 12.19 | RED 3/14 — a patina drift confined to the core, a permutation inside one cell, and a cell hollowed out behind an intact edge. **Exactly the three new cases and nothing else**, which is what a statistic added for a named blind spot should red |
| M84 | let one lit pixel make a scanline a row, and drop the margin-remainder rule | 12.17, 12.19 | RED 2/9 — the stray speck and the two-run sheet with a deep margin. With two runs there is ONE step, so the drift check cannot fire and `round(h / pitch)` reads margin as an empty row |
| M85 | refuse AFTER writing: move the family check below the write loop | 12.17, 12.19 | RED 1/5 — the out-of-family candidate landed in both directories and the throw came too late |
| M85b | write `--cell`'s candidate before the family is assembled | 12.17, 12.19 | RED 2/5 — **including the missing-neighbour case**, which M85 alone could not red: that path throws in `requireFile`, upstream of the write loop, so only a write moved above it can prove the refusal is atomic |
| M86 | delete `attachRotatePrompt`'s `SCENE_UPDATE` subscription, leaving only `resize` | 12.13, 12.19 | RED 1/3042 — **the defect the owner found on a phone.** A mobile browser fires `resize` on orientationchange while it still reports the OLD viewport, so the single evaluation ran against portrait and nothing asked again; the prompt stayed up after the device was turned. `UIScene` was unaffected because it polls, which is why five Codex rounds over this file saw nothing |
| M87 | delete the word-wrap width from the rotate prompt's copy | 12.13, 12.19 | RED 1/3042 — the subline is 36 monospace characters at `18 / 0.203 = 89` game px, which is 1922 px on a 1920 px surface. It was cut off at both ends on the **widest** phone in scope and worse on every narrower one |
| M88 | let `RotatePrompt` compare against its own cached `isShowing` instead of the page | 12.13, 12.19 | RED 2/2 e2e + 1/9 unit — **the third cause of the same report.** There is ONE overlay class and MORE THAN ONE prompt: `TitleScene` attaches its own, `UIScene` builds another. With a private flag, the title screen's teardown cleared the class while the UI's prompt still believed the overlay was up, so it vanished the moment play started on a portrait phone |
| M89 | size the overlay's copy without regard for the viewport (64 px, `nowrap`) | 12.13, 12.19 | RED 1/2 — the subline runs **473 px off the left edge** at 320 CSS px. ⚠️ **The first attempt at this mutation stayed GREEN**: `white-space: nowrap` at the shipped 14 px does not overflow a 320 px phone, because a 14 px DOM string simply is not wide enough. Recorded rather than quietly replaced — the gate measures overflow, and the mutation has to produce some |
| M90 | drop the overlay's own readout — replace `this.host.report(diagnosticLine(...))` with a void expression | 12.13, 12.19 | RED 2/11 unit, reverted and confirmed by the occurrence count returning to 1 with the file changed. **The instrument, not a fix.** Four device sessions have ended with the same report while `rotateOverlayWanted` measures correct at every landscape viewport a phone can produce and both wiring paths re-read `window.innerWidth` every frame — so the remaining explanations are a viewport this code does not expect, or a poll that is not running, and a rising count separates them. ⚠️ **RE-SCOPED TO DEV 2026-09-01, owner decision.** The instrument did its job — the answer was a 2.1 px shortfall from the browser's address bar — and a production player has no use for four numbers on a rotate prompt. The readout no longer ships: the node left `index.html` and is now injected by `browserHost().report()` under `import.meta.env.DEV`. M90 still reds in DEV (the new `the DEV diagnostic node` cases in `rotate-prompt.test.ts`, which watch the DOM rather than a string — the fake-host cases stay green if the real host writes nowhere). Its production half is `verify-dist.mjs`'s `rotate-diag` symbol, because the unit suite runs with `DEV === true` and no Vitest case can observe a production bundle |
| M91 | subscribe the fullscreen request to `pointerdown` instead of `pointerup` | 12.13, 12.19 | RED 4/8 — a fullscreen request originating from `pointerdown` is refused as an untrusted gesture on touch devices, so the wrong event is a repair that silently never fires |
| M92 | install the fullscreen listener on `game.canvas` instead of the `#game` wrapper | 12.13, 12.19 | RED 1/8 — Phaser's input never sees a tap on the `#rotate` div, and that tap is the ONLY gesture a stuck player is offered. A canvas listener misses exactly the case the repair exists for |
| M93 | drop `fullscreenTarget: 'game'` from the scale config | 12.13, 12.19 | RED 1/8 — without a target Phaser builds its own `<div>`, moves only the CANVAS into it and fullscreens that, stranding the overlay outside the fullscreen subtree |
| M97 | revert `PLATE_ALPHA` to 0.55 | 12.14b | RED 3/9 — the resting-fill pin, the press-step case and the art-rest case |
| M98 | press a grey-box plate with `setAlpha` instead of `setFillStyle` | 12.14, 12.17 | RED 3/34 — **a defect that was already shipped.** A `Shape`'s `fillAlpha` and its object `alpha` are different numbers (`Shape.js:119`); `drawPlate` sets the fill through `add.rectangle`'s 6th argument and `setPressed` was dimming the whole object, taking the KEYLINE down with it — and the keyline is where the plate's WCAG 1.4.11 contrast comes from. Quiet at 0.55/0.72; visible at 0.9. Found while applying a Codex round-2 finding about the level-select plate |
| M94 | drop the `isTouchDevice` guard from `installFullscreenOnTap` | 12.13, 12.19 | RED 1/9. ⚠️ **Found by the full e2e sweep before the merge, not by reasoning.** Without the guard a plain desktop CLICK on the wrapper threw the browser into fullscreen, and `session-help-banner.spec.ts` — a spec with nothing to do with touch — failed on `page.setViewportSize` with *"To resize minimized/maximized/fullscreen window, restore it to normal state first"*. A repair for a phone broke a desktop spec, and only the whole-suite run could see it |
| M99 | ship the six faces faded FLAT — one alpha everywhere, the keyed field included *(rebuilt from M46 against the gate that replaced it)* | 12.17, 12.19 | RED 2/15 — the two-band alpha claim and byte-for-byte cut-face equality. Every face's fully-transparent count went **5314 → 0**: there is no keyed field left, which is exactly what the two-band claim says there must be |
| M100 | drop every non-mark pixel of `pause` to alpha 1 — the plate effectively gone *(rebuilt from M61)* | 12.17, 12.19 | RED 2/15 — **19 191** pixels moved, `clear` **5281 → 0**. The bound that let M61 through was one-sided; the two-band claim is not, and reds |
| M101 | repaint 2 014 pixels OUTSIDE `left`'s mark dark and OPAQUE *(rebuilt from M62)* | 12.17, 12.19 | RED 1/15 — byte-for-byte cut-face equality **alone**. ⚠️ **The two-band claim stayed GREEN with all three of its counts byte-identical** (5314 clear / 19 873 solid / 413 partial), which is M62's original defect stated precisely: a partition into two alpha bands cannot order damage that changes neither band. The statistic that orders it is not a tuned bound, it is the equality gate that replaced it — *(the §5 rule: a statistic that does not order its own mutation is replaced, not re-bounded)* |
| M102 | raise every non-transparent pixel to full alpha in the six shipped faces **and** the six committed cuts together — a pipeline change faithfully re-cut *(probe, from M63)* | — | **GREEN 0/15, and recorded as a probe rather than a hole.** `PLATE_ALPHA_BAKED` is deleted: the bytes ship unfaded by design and the fade is a draw-time value, so no live gate claims anything about byte alpha beyond the two bands. The property did not become ungated — it moved, and **M104** reds it at the new site. What stays uncovered is M64's already-stated limit of a committed oracle: a builder change that is faithfully re-cut moves both files together. Same shape as M82 — a probe that found the code it aimed at was gone |
| M103 | erase `walk`'s mark to the surrounding plate, keeping two 4×4 ink cells *(rebuilt from M60)* | 12.17, 12.19 | RED 1/15 — **6 367** pixels, byte-for-byte cut-face equality. ⚠️ Distinctness stayed green **and should**: it measures how far two faces differ, so destroying one face's glyph makes it *more* different from the other five, not less. M60's defect — an oracle that shrank with the damage — cannot recur against a committed cut face, because the oracle is no longer read from the file under test |
| M104 | draw the generated face at `PLATE_ALPHA * PLATE_ALPHA`, double-fading it *(rebuilt from M47)* | 12.14, 12.19 | RED 1/40 — `touch-plate-ink.test.ts`'s *"gives the art the SAME translucency the drawn plate was measured at"*. M47's hole was an algebraic identity that held for every value of either constant; the assertion is a comparison against the one constant production draws with now, so a face drawn at anything else reds. Reverted, and the revert confirmed by the original `face.setAlpha(PLATE_ALPHA);` count returning to **1** with the file changed back |
| M105 | delete `touch-action: none` from `index.html`'s `html, body, #game` block | 12.13, 12.19 | RED 1/3 unit — and 🔴 **the `dist/` half was GREEN on its first run, which is why this row is worth its space.** `verify-dist`'s new check asked only whether the shipped file contained `touch-action:none` anywhere with whitespace stripped, and `index.html`'s own explanatory comments SHIP: one of them reads *"`touch-action: none` — without it the browser claims the gesture"*. **The gate was reading the sentence about the rule as the rule.** It now strips CSS comments and reads the `html,body,#game{...}` block, and reds |
| M106 | put `user-scalable=no` back on the viewport meta | 12.13, 12.19 | RED 1/3 unit + `verify-dist` FAILED. An **absence** assertion on purpose: `touch-action` already stops pinch inside the game, and taking zoom from the whole page is the accessibility anti-pattern it was chosen over. A future session that "fixes pinch" this way now gets a red instead of a silent regression |
| M107 | re-subscribe `INPUT_GAME_OUT` to `onLoseEverything` — the defect as shipped | 12.5, 12.13, 12.19 | RED 1/24 unit (*subscribes to EVERY loss path, and to exactly those*) + RED 1/5 e2e (**12.13b**). ⚠️ **12.13b was itself a false green at 10 ticks** and passed against the shipped defect: the player still coasts on the velocity it had when the finger left the canvas, so a dropped contact and a held one are the same number that early. At **30** ticks — the figure 12.5b already pays for the same reason — it separates them and reds. The mutation and the fix are the same line, watched red before it was removed |
| M108 | make 12.12's level-menu coverage test swallow every coordinate (`rows.length > 0 ||`) | 12.12, 12.19 | RED 1/10 — the guard that keeps the repaired 12.12 from being vacuous. The loop now SKIPS a retired coordinate that a live level-menu row covers, so a partition that covered everything would assert nothing; the case asserts the uncovered set is non-empty and names it |
| M109 | drop `this.binding.isGameRunning()` from `controlsLive` | 12.12 | **GREEN 0/10, and recorded as a probe rather than left as a claim.** 12.12 cannot see this term, because the pause route unbinds the layer first — `bind(null)` makes `controlsLive` false whatever the term says, so the mutation is unreachable from this criterion rather than uncaught by it. ⚠️ Whether the term is reachable from ANY path was not established, and that is the open question, not this row. Not chased: it is a pre-existing question in a criterion this session does not own |
| M110 | dispatch NEITHER tap in 12.13e's double-tap, leaving only the driver's own bookkeeping | 12.13, 12.19 | RED 1/5. ⚠️ **Dropping ONE tap stays GREEN** — the other still fires the jump — and that is the row's content: the case asserts the SIM saw the gesture (the player left the ground), not that the driver's JS ran. The first version asserted only its own `['first', 'second']` bookkeeping, which a browser that swallowed the pair as a zoom gesture would satisfy exactly |

**Twenty-two rows exposed twenty-seven green attempts, and every one was a hole rather than a mutation to drop.**
**M102 is the twenty-third green row and the ONE exception**, recorded as a probe rather than a hole for the
reason its own row gives — the same call M82 got, and stated here so the sentence above stays true.

🔴 **Thirteen rows were WITHDRAWN on 2026-08-31, and 12.19 was NOT MET because of it. Closed
2026-09-02.** M46, M47, M55-M57, M60-M63, M65, M68, M69 and M74 each reddened a gate that no longer
exists: the owner's redesign deleted `touchInk.mjs`, `shipped-touch-contrast.test.ts`,
`touch-atlas-ink.test.ts`, `touch-strokes.test.ts` and the two ink-derived assertions in
`shipped-touch.test.ts`. A row that cannot red anything is the same defect M82 was, and pretending
otherwise would repeat exactly the mistake round 20 caught.

**Each of the thirteen was triaged by ONE question — does the code the row edits still exist, and
does a live gate still claim its property?** — never by which mutation was convenient. That is how
the first 22 green rows were found, and it is the only reading of *"build the mutation the bound
actually names"* that survives a redesign.

**Five had a live successor and were rebuilt** — M46 → **M99**, M61 → **M100**, M62 → **M101**,
M60 → **M103**, M47 → **M104** — and all five red. **Eight are RETIRED** — M55, M56, M57, M63, M65,
M68, M69, M74 — because the code they edit is deleted, which makes them **unbuildable, not green**.
M82 is the precedent and the distinction is the whole point: a row reporting `GREEN 0/n` contradicts
the criterion, a row that names an edit to a deleted file does not exist to report anything.

🔴 **What the retirement COSTS is stated, not papered over.** The per-stroke contrast statistic
is gone and is not being rebuilt — owner decision, 2026-09-02, because inventing a statistic after
seeing the art it will judge is the post-data selection this phase kept catching. So the readability
of the six glyphs across the live 44–48 CSS px band has **no automated cover at all**, and 12.14
rests on `voltagent-qa-sec:ui-ux-tester` and a hands-on pass, which is what that criterion always
required. M74 is
the row that used to hold the band; it is retired knowing that.

**The three gates that replaced them now have red proofs, which they did not have before:**

| the gate | its red proof |
|---|---|
| the two-band alpha claim | **M99** RED 2/15 (`clear` 5314 → 0 on all six), **M100** RED 2/15 |
| byte-for-byte cut-face equality | **M101** RED 1/15, **M103** RED 1/15, and M99/M100/M45 alongside |
| central-square distinctness | **M45**, re-run against the fixed-square mask that replaced `keylineMarks`: RED 2/15 at **0.0 %** on the `left`/`walk` pair |

⚠️ **M101 is the row worth reading twice.** It reds the equality gate and leaves the two-band
claim GREEN with all three of its counts byte-identical — which is a measurement, not an inference,
that the two-band partition **cannot order M62's damage**. The §5 rule says a statistic that does
not order its own mutation is replaced rather than re-bounded, and that replacement had already
happened; M101 is the proof it was the right one.

🔴 **M82 is WITHDRAWN from the matrix, and that is not a tidy-up.** 12.19 requires every row here to
red at least one named gate, and M82 sat in the table reporting `GREEN 0/24` — so the criterion was
PASS over a row that contradicted it. Codex round 20, finding 1. M82 replaced a "the merged key set
is exactly six" assertion that could never observe a partial family, because `requireFile` throws
first: it was a **probe that found dead code**, not a mutation of a live gate, and the dead code was
deleted rather than gated. The hole it was aimed at is covered by **M82b**, which reds. The counts
above are of the twenty-two rows that remain.

⚠️ This said *"twenty-seven rows"*: 27 is the number of green ATTEMPTS, and several rows went green
more than once before they reddened — M72 twice, M73 twice. Twenty-two rows carry a GREEN marker that
was later closed, and **M102** carries one that is not closed and is not meant to be. Codex round 18,
finding 7.

🔴 **M75 is the mutation the floor was introduced without.** `MIN_TOUCH_ARM_CPU_MS` replaced a
per-pair "collapse guard" that could not detect a collapse, and 12.19 was PASS with no red proof for
its replacement — Codex round 15, finding 7. Zeroing ONE arm would have reddened the delta bound too
and proved nothing about the floor; zeroing both isolates it exactly, and is the failure a delta is
blind to by construction.

🔴 **M66 and M68 are the same lesson as the burst of zero particles: a decision function needs its
own gate.** The cell binding was pinned as a table and nothing drove the code that reads it; the
stroke split was exercised only through damaged art, so gutting the splitter — every label collapsed
to zero — restored the exact statistic it replaced and all six faces passed under it. Codex
round-13.

🔴 **M69 is the cheapest kind of invisible defect.** The transparent guard skipped the paint and kept
the bit, so the mask claimed 44 pixels the face does not draw and the contrast gate counted them as
coverage. Deleting the repair leaves the six PNGs **byte-identical** — which is why nothing noticed
for two rounds.

🔴 **M64 is the limit of what a committed oracle can defend, and it is worth stating.** The cut
fixtures are written by the same run that writes the shipped PNGs, so they cannot answer for the
CELL BINDING: swap two columns, re-cut, and every gate follows the change — reproduction exact,
contrast and distinctness unmoved — while the left button ships a right-pointing arrow. The
key/row/col table is pinned as a literal in `shipped-touch.test.ts`, which is the one statement in
the repository that cannot move with the art. Codex round-12.

🔴 **M65 is round-8's hole one level down.** Masking the contrast measurement to the mark stopped a
decorative highlight carrying the pass; keeping ONE best pixel for the whole mark still let half a
glyph go dark. Measured: with the pale halo skipped below the midpoint, `walk` loses 938 keyline
pixels, its lower bar is invisible on a dark background, and the per-face statistic reported
**3.318:1** — green. Per connected stroke, `pause`'s third stroke measures 1.21:1.

🔴 **M60, M61 and M62 are one defect three times: every gate was reading its oracle off the file it
was judging.** The alpha invariant decided what was "ink" by luminance and the contrast gate decided
where the "mark" was by opacity — both discovered from the mutated bytes, so damage that removed
pixels from the mask was invisible to the mask. Codex round-11. The CUT FACE is committed now
(`tests/fixtures/touch-cut/` — the downscaled cell before either ink pass; the mask itself is not
committed, production derives it from that input), every gate takes the mask from there, and a
reproduction gate
recomputes the whole pipeline over it and demands the shipped bytes back. **M63 is the reason the
property gates stay**: a pipeline change that is faithfully re-cut leaves the reproduction gate green
and reds the per-pixel alpha invariant.

🔴 **M58 and M59 are the two shapes a "measured" gate lets through.** The plate-alpha check read only
the MODAL translucent alpha, so making 9 717 outer brass pixels fully opaque — a plate that hides the
level it is drawn over — left it green, with contrast and distinctness unchanged. And the contrast
check kept the single best output pixel and asked only that one survive, so an engraving faded to 32
remaining pixels still scored over 3:1. Both were found by the Codex round-10 review, both are now
per-pixel invariants: every ink pixel inside the mark region is opaque, and every brass pixel
anywhere draws at or below `PLATE_ALPHA`.

🔴 **M57, green through two fixtures, and the reason is worth keeping.** The transparency guard in
`keylineMarks` can only fire when the engraving reaches the edge of its disc — with a blob safely at
the centre of a full-width disc, no transparent pixel is ever within `KEYLINE_PX` of dark ink, so
removing the guard changes nothing and the assertion passes either way. Shrinking the disc was not
enough (the mark region's corners fell outside it, but nothing dark was near them). The fixture that
works is a bar running the **full width** of a small disc. A test can be about the right property
and still be unable to observe it, and only the mutation says which.

🔴 **And M55's other half: the region guard beside it was genuinely dead.** `halo` is grown from a
mask only ever set inside the mark, through a `grow` that refuses to leave it, so a second `inMark`
test in the paint loop could never fire. It was deleted rather than kept as a condition no mutation
can reach — the same call as `drawFace`'s redundant `setDisplaySize`.

🔴 **M51, and why M46 was not enough.** M46 flattens every face to one alpha, which proves
only that a flat face fails. The failure the criterion describes is narrower and was live in the
shipped bytes: a mark that has faded into its plate while the face still carries a bright decorative
highlight somewhere else. The whole-face statistic scored `walk` at 3.67:1 on such a highlight while
its own bars measured **1.12:1** — 725 near-black pixels and not one pale one. M51 dims only the
central engraving; the gate now measures the mark mask and reds.

⚠️ **Three rows are unreachable as TOOL edits and are byte mutations instead** — M45, M46
and M51. `shipped-touch.test.ts` reads the **committed PNGs**, so no edit to `buildTouchAtlas.mjs`
can redden it without re-running the builder; that is the point of gating shipped bytes *(vault
3.1)*, not a hole. The tool's own logic is gated separately, behaviourally, by
`touch-atlas-cli.test.ts` (M53, M54) and by `shipped-touch.test.ts`'s cell-descriptor case (M50).

🔴 **M46 and M47, and the difference between them.** M46 was first written against
`buildTouchAtlas.mjs` and went GREEN, which is not a hole: the gate reads the **committed PNGs**, so
no edit to the tool can reach it without re-running the tool. That is the point of gating shipped
bytes *(vault 3.1)*, and the mutation was rewritten as a byte edit — flatten every face to one alpha
— which reds three tests and reproduces the exact 2.43:1 the review reported. M47 was a real hole:
`touch-plate-ink.test.ts` asserted `ART_ALPHA * (PLATE_ALPHA / ART_ALPHA)` is `PLATE_ALPHA`, an
algebraic identity that holds for every value of either constant. The product is now checked where
one factor is a BYTE — the modal plate alpha in the shipped PNGs — and M47 reds two tests.

🔴 **M39, twice.** The first version deleted `setDisplaySize` from `drawFace` and reddened
nothing, because the image fake reported **0 × 0** and every size assertion was already failing
to be about production. Giving the fake its native 160 did not fix it either: at 1920 × 1080 the
box **is** 160, so create and source agree and only a resize was ever measured against a different
number — and a phone is never at the design size. Two new cases (a first draw at half the view, and
a resize) plus the discovery that `create()` ends in `refresh()`, which always takes the size branch
on its first call — making `drawFace`'s own call a line no mutation could reach. It was deleted;
the sizing lives in `refresh()`, where M39 now reds both cases.

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
finger-sized, and six brass controls sit in the corners. Run right and jump at the same time with
two thumbs, hit an enemy with the attack button, and tap pause to get back to the menu. Turn the
phone upright and the game asks you to turn it back.
