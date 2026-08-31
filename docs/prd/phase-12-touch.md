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
| M38 | draw the art fully opaque, undoing the occlusion measurement | 12.14 | RED 1/7 |
| M39 | leave a re-placed face at its old size when the design size moves | 12.8 | **GREEN twice** → RED 2/9 |
| M40 | copy one shipped face over another | 12.17 | RED 1/4, on the shipped bytes |
| M41 | do not restore the gait onto a freshly activated layer | 12.5 | RED 1/10 |
| M41b | the same, in the browser, across a real level-select round trip | 12.5, 12.6 | RED 1/3 |
| M42 | clear the walk latch on shutdown, as if it belonged to the layer | 12.5 | RED 2/10 |
| M43 | leave the retired layer's walk callback wired to the live session | 12.5 | RED 1/10 |
| M44 | rest the art at 0.69 — inside the old bound, away from the measured 0.55 | 12.14 | RED 1/8 |
| M45 | copy one face's central MARK onto another, leaving both discs alone | 12.17 | RED 1/4, at 0.0 % |
| M46 | ship the faces faded FLAT — ink at the plate's alpha, as before the contrast repair | 12.14, 12.17 | RED 3/7, the ink at **2.43:1** |
| M47 | draw the generated face at `PLATE_ALPHA`, double-fading the baked plate | 12.14 | **GREEN — the assertion was an identity** → RED 2/7 |
| M48 | toggle walk for every pointer, not on the 0 -> 1 transition | 12.5 | RED 1/8 |
| M49 | open the level menu for every pointer that lands on pause | 12.5 | RED 1/8 |
| M50 | drop a cell descriptor, as the circular count guard allowed | 12.17 | RED 1/7 |
| M51 | dim only the WALK engraving, leaving every highlight outside it | 12.14 | RED 1/7 |
| M53 | sweep every `.png` in the output directory, not just the touch faces | 12.19 | **GREEN — the sweep was inline and ungated** → RED 1/5 |
| M54 | revert the CLI entry guard to the `%20` comparison that never matched | 12.19 | **GREEN — nothing ran the CLI** → RED 1/2 |
| M55 | do not thicken the engraving, leaving only the hairline keyline | 12.14 | **GREEN — nothing pinned the thickening** → RED 1/6 |
| M56 | paint the keyline over the mark as well as around it | 12.14 | RED 1/6 |
| M57 | paint the keyline over transparent pixels too | 12.14 | **GREEN twice — the fixture could not reach the guard** → RED 1/6 |
| M58 | make the OUTER brass opaque, leaving the modal alpha where it was | 12.14 | RED 1/7, at alpha 255 against a baked 165 |
| M59 | fade the whole `walk` engraving except 32 pixels | 12.14, 12.17 | RED 2/7 |
| M60 | erase `walk`'s 4 112 mark pixels to baked brass, keeping two 4x4 ink cells | 12.14, 12.17 | **GREEN — the mask shrank with the damage** → RED 3/8 |
| M61 | drop every non-mark pixel of `pause` to alpha 1 — the plate effectively gone | 12.17 | **GREEN — the bound was one-sided** → RED 2/8 |
| M62 | repaint 2 014 pixels OUTSIDE `left`'s mark dark and opaque | 12.17 | **GREEN — classified as neither ink nor plate** → RED 2/8 |
| M63 | set `PLATE_ALPHA_BAKED` to 1 and re-cut the six faces | 12.17 | RED 1/8, and the reproduction gate stays green — which is the split those two gates exist for |
| M64 | swap the `left` and `right` COLUMNS in `TOUCH_PLATE_CELLS` and re-cut | 12.17 | **GREEN — both oracles moved together** → RED 1/8 |
| M65 | skip the pale halo below the face midpoint, and re-cut | 12.14 | **GREEN at 3.318:1 — one best pixel for a whole glyph** → RED 1/8, `pause` stroke 3 at 1.21:1 |
| M66 | mirror the COLUMNS in the builder's grid selection, leaving the descriptors alone | 12.17 | **GREEN — the pinned table is only half the contract** → RED 1/2 |
| M67 | M65 plus an 11-pixel pale bridge, so the damaged glyph stays one component | 12.14 | **GREEN — the halo defined the strokes** → RED 1/1 |
| M68 | collapse every label in `markComponents` to zero | 12.14 | **GREEN — the split had no gate of its own** → RED 3/5 |
| M69 | keep the mark bit on a transparent pixel, skipping only the paint | 12.14 | **GREEN, and the picture is byte-identical** → RED 1/8 |
| M70 | make `main()` ignore the parsed mode and always cut from the plate | 12.17, 12.19 | RED 2/18 — 12 files written where 6 were claimed |
| M71 | route the `--cell` build's output to a fixed key instead of the requested one | 12.17, 12.19 | RED 1/18 |

**Twenty-three rows reddened nothing, and all twenty-three were holes rather than mutations to drop.**

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
finger-sized, and five brass controls sit in the corners. Run right and jump at the same time with
two thumbs, hit an enemy with the attack button, and tap pause to get back to the menu. Turn the
phone upright and the game asks you to turn it back.
