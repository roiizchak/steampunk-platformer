# Codex plan review — Phase 12, touch and responsive support

**Converged: `VERDICT: APPROVED` at round 4 of a maximum 5**, in ONE Codex session with context
preserved across rounds, so no point was re-litigated.

| | |
|---|---|
| CLI | `codex-cli 0.150.1` |
| model | `gpt-5.6-sol`, `model_reasoning_effort = "high"` (from `~/.codex/config.toml`; not pinned on the command line) |
| thread | `01a04d6c-8298-7ac0-bd09-c587d45a5aa0` |
| sandbox | `-s read-only` on round 1; `-c sandbox_mode="read-only"` on every resume, because `codex exec resume` rejects `-s` |
| rounds | 1 `REVISE` · 2 `REVISE` · 3 `REVISE` · 4 **`APPROVED`** |
| findings | **24 — 5 BLOCKER, 11 HIGH, 8 MEDIUM/LOW. Every one applied; none rejected.** |

⚠️ **Round 1 was killed by a 15-minute ceiling with zero output** before the run that is recorded
here. The reading list was trimmed and the ceiling raised to 45 minutes. A `codex exec` that produces
no verdict file and no `thread.started` line has failed, not converged.

⚠️ Every prompt carried the `node_repl` + `fs.readFileSync` paragraph required by
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol) — Codex's sandboxed shell
cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`). **So every finding below is
file-evidence only, and every one was re-verified locally against this repo before being acted on.**
The re-verification is what turned three of them from plausible into certain.

## The three that would each have cost a build

| | finding | what it actually was |
|---|---|---|
| R1.1 | **A touch player cannot start the game.** | All three terminal screens are keyboard-only — `TitleScene.ts:333-335` (Enter/Space), `LevelSelectScene.ts:145-167` (UP/W/DOWN/S/ENTER), `gameComplete.ts:119-135` (ANY_KEY_DOWN filtered to Enter). In-play controls alone would have shipped a phone build that still could not be played, and criterion "owner played it on a phone" would have been passable only by reaching for a keyboard. |
| R2.1 | **`attachHud` runs BEFORE `UIScene.create()`.** | `gameHud.ts:60-63` says so in as many words. `ui.touch.bindSession(...)` would have dereferenced `undefined`; optional-chaining it would have silently skipped the only binding and left the FIRST level's controls inert while every relaunch worked. |
| R3.1 | **The `2048 × 2048` crop constant was a forbidden inference — the same mistake twice.** | Round 2 caught that `splitGrid` rejects a width not divisible by 3 (`sheets.mjs:168-172`); the fix hardcoded `2046 × 2048`, which assumes a 1:1 2K plate is 2048². `FAL-MODELS.md:115-122` is explicit: *"Read returned dimensions off the downloaded file, never off the aspect label… **`nano-banana-pro`'s returned dimensions are UNMEASURED**"*, the precedent being `16:9 @ 2K` returning `2752 × 1536`. The art step would have thrown **after** the $0.15 was spent. |

## Two of my own claims were wrong and are withdrawn in the plan

- Round 1's triage claimed a *"full loss-path list"* for pointer release. It was not: scene-level
  `POINTER_UP` was missing, and Phaser dispatches it *"if a pointer is released **anywhere**"*
  (`POINTER_UP_EVENT.js:8-28`). Press RIGHT, slide onto empty canvas, release — the button never sees
  a `pointerup` and the finger stays held forever.
- Criterion 12.12 asserted *"tick unchanged"* under the rotate prompt. `Game` is RUNNING under the
  prompt by design and every tick increments `world.tickCount` (`tick.ts:357-369`), so the criterion
  was **unsatisfiable by a correct implementation**. Rewritten to tap each of the five underlying
  control coordinates and assert no effect, with tick progression allowed.

## The sharpest structural finding

Round 1's deletion-resistance audit found **18 of the original 21 criteria could stay green with the
whole feature deleted**, including the shared-predicate design the plan was pleased with — a pure
layout predicate used as its own oracle passes with nothing drawn at all. Round 2 then found the
restructure fixed *wholesale* deletion but not *seam* deletion. The answer is the 16-row mutation
matrix in the phase document, and the honest admission that criteria 12.7, 12.15, 12.17, 12.18 and
12.20–12.23 are inherently absence-, artifact- or process-shaped and **cannot** be made
wiring-resistant.

---

## Round 1 — Codex, verbatim

```
## Findings

1. **BLOCKER — A touch-only player cannot reach gameplay or continue after a level.** The welcome screen accepts only keyboard events, then routes to a keyboard-only level selector. The proposed controls are disabled while `Game` is PAUSED, exactly the state under the welcome screen. Completion also disables player input and binds continuation only to Enter. Thus criterion 12.21 can be “passed” after using a keyboard to bypass the inaccessible screens while the phone experience remains unusable. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:105>) [TitleScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/TitleScene.ts:298>) [LevelSelectScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/LevelSelectScene.ts:145>) [gameComplete.ts](</C:/Claude/Steampunk Platformer/src/scenes/gameComplete.ts:119>) [GameScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/GameScene.ts:291>)  
   **Fix:** Add real touch routes for welcome dismissal, level selection, and completion continuation, then gate a touch-only journey from page load through starting and completing/continuing a level.

2. **BLOCKER — The planned `TouchHeld` record never reaches `sampleHeldKeys`.** The plan says the touch layer owns the record, `sampleHeldKeys` receives it, but the only planned `GameScene` change is adding `input$` to `attachHud`. The actual sampling call still has only three arguments, and the current HUD attachment returns no touch state. The same missing seam prevents the UI layer from observing the protected `playerInputEnabled` flag it is supposed to gate on. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:72>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:87>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:89>) [GameScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/GameScene.ts:194>) [GameScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/GameScene.ts:264>) [gameHud.ts](</C:/Claude/Steampunk Platformer/src/scenes/gameHud.ts:25>)  
   **Fix:** Specify one session coordinator owned by `UIScene`, re-bound on every `Game.create()`, exposing held state to the sampler and receiving an `isPlayerInputEnabled` provider plus the Game-owned menu callback.

3. **HIGH — The release handling is not safe for multi-touch or lifecycle loss.** A single boolean per action fails when two fingers hold the same button: releasing either clears the other. `pointerupoutside` is a scene `InputPlugin` event, not a Game Object event. Touch cancellation is translated into up/out processing, but disabling an interactive object removes it from Phaser’s `_over` lists, so disabling first can suppress the later object-level release. Phaser’s blur path pauses the loop without clearing pointers. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:118>) [InputPlugin.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputPlugin.js:2021>) [InputPlugin.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputPlugin.js:2064>) [InputPlugin.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputPlugin.js:861>) [InputPlugin.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputPlugin.js:873>) [Game.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/core/Game.js:645>)  
   **Fix:** Track `pointer.id → action` and per-action pointer sets; cancel all contacts before disable/hide and on scene pause/sleep/shutdown/destroy, game blur/hidden, `GAME_OUT`, and global `POINTER_UP_OUTSIDE`.

4. **HIGH — Level transitions will construct duplicate controls on the surviving UI scene.** `attachHud` deliberately reuses an already-active `UIScene`, because it survives `scene.start('Game')`; the plan nevertheless constructs a new `TouchControlsLayer` from `attachHud` on every Game entry. The next-level continuation restarts `Game`, so controls, listeners, and old `input$` closures can accumulate. [gameHud.ts](</C:/Claude/Steampunk Platformer/src/scenes/gameHud.ts:49>) [gameHud.ts](</C:/Claude/Steampunk Platformer/src/scenes/gameHud.ts:53>) [gameComplete.ts](</C:/Claude/Steampunk Platformer/src/scenes/gameComplete.ts:133>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:88>)  
   **Fix:** Create exactly one controls layer in `UIScene.create()` and give it an idempotent `bindSession(...)` that cancels contacts and replaces all per-Game references.

5. **HIGH — Criterion 12.3 conflicts with the Phaser-uninstalled gate.** The merge is planned inside `gameInput.ts`, which value-imports Phaser. A unit test importing `sampleHeldKeys` therefore needs Phaser, while `test:sim-isolated` removes Phaser and runs the entire Vitest suite. A source-text test would avoid the import but would not prove the merge behavior. [gameInput.ts](</C:/Claude/Steampunk Platformer/src/scenes/gameInput.ts:1>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:172>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:178>) [package.json](</C:/Claude/Steampunk Platformer/package.json:19>)  
   **Fix:** Extract held-state sampling/merging into an engine-free module with only type imports; have `gameInput.ts` retain the Phaser binding code.

6. **HIGH — The proposed browser configuration cannot prove criteria 12.2 or 12.8.** `hasTouch: true` enables Playwright’s touchscreen, but its public API supports only a single tap; simultaneous multi-contact requires manually dispatched touch events. Separately, the current real-GPU routing matches only Phases 5–9, while the planned `chromium-touch` project is not specified as headed or GPU-backed. A headless Phase 12 performance result contradicts criterion 12.8’s “real GPU” premise. [Playwright types](</C:/Claude/Steampunk Platformer/node_modules/playwright-core/types/types.d.ts:22730>) [Playwright types](</C:/Claude/Steampunk Platformer/node_modules/playwright-core/types/types.d.ts:22737>) [playwright.config.ts](</C:/Claude/Steampunk Platformer/playwright.config.ts:23>) [playwright.config.ts](</C:/Claude/Steampunk Platformer/playwright.config.ts:177>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:177>)  
   **Fix:** Define the raw multi-contact protocol in `touchHarness.ts` and add a disjoint headed `chromium-touch-gpu` route with positive assertions that all controls rendered before timing begins.

7. **HIGH — Criteria 12.5–12.7 use the implementation predicate as their oracle.** Sharing `touchTargetsFit` prevents two copies from drifting, but it also lets the prompt and test agree on the same wrong layout. The pure predicate can stay green if actual Phaser objects are missing, scaled differently, clipped, or positioned differently. This repository explicitly warns that a decision function plus its isolated tests does not prove a production consumer. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:71>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:144>) [CLAUDE.md](</C:/Claude/Steampunk Platformer/CLAUDE.md:83>)  
   **Fix:** Keep the shared layout function for production, but make acceptance measure the five live objects’ bounds and the canvas CSS rectangle independently; derive CSS target sizes and gaps from those measurements.

8. **MEDIUM — The proposed gate rows parse, but the phase-document contract is incomplete.** All 21 rows have four cells and legal owners; both `play` rows include `playwright-cli`, and both Codex rows match the required regexes. However, the plan does not promise:

   - All eight exact section headings.
   - The four always-on skills in §2.
   - Exclusion of `playwright-e2e-testing` and a positive `physics-arcade` requirement.
   - The exact `### 6. QA gate` / `**Regression set:` delimiters.
   - When marked done, the exact QA-log filename and `## Phase 12 ` / `## Vault-out — Phase 12` slice.
   - A unique `<!-- gate-verdicts -->` marker followed by one contiguous table containing exactly one unbolded `| 12.n |` row per criterion.

   [docs-contract.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/docs-contract.test.ts:85>) [docs-contract.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/docs-contract.test.ts:167>) [docs-contract.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/docs-contract.test.ts:194>) [docs-contract.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/docs-contract.test.ts:201>) [docs-contract.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/docs-contract.test.ts:209>) [docs-contract.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/docs-contract.test.ts:270>) [gateVerdicts.ts](</C:/Claude/Steampunk Platformer/tests/unit/gateVerdicts.ts:43>) [gateVerdicts.ts](</C:/Claude/Steampunk Platformer/tests/unit/gateVerdicts.ts:90>)  
   **Fix:** Put the exact document grammar and designated-table grammar into the build order, not merely “this repo’s linted format.”

9. **MEDIUM — The line-budget claim is only superficially true.** `GameScene.ts` is 399 lines and its current `attachHud` call is one physical line, so that argument can be added without a line. But the missing merge connection requires another call-site change and session state. Current counts are otherwise under the gate: `gameHud` 68, `gameInput` 363, `UIScene` 335, config 69, `index.html` 68, Playwright config 309, and `docs-contract` 374. The sweep also covers every new `src`, `tools`, `tests`, and root config file—not merely “source files”—and the plan budgets none of the new test/tool files. [GameScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/GameScene.ts:399>) [file-size.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/file-size.test.ts:29>) [file-size.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/file-size.test.ts:45>) [file-size.test.ts](</C:/Claude/Steampunk Platformer/tests/unit/file-size.test.ts:324>)  
   **Fix:** Rebudget after defining the actual merge/session wiring and assign explicit ceilings to every new source, test, tool, and config file.

10. **MEDIUM — “Exactly five” is a safe refusal, not a safe extraction design.** `detectFrames` projects opacity into row and column bands. Adjacent faces can merge when keyed pixels bridge a gap; one face can split when it contains a full-height transparent gap. Worse, exactly five rectangles can still mean four correct buttons plus one fragment, and the plan has no mapping/identity check. A result of four or six merely throws and leaves no specified recovery beyond an unspecified retry. [buildChrome.mjs](</C:/Claude/Steampunk Platformer/tools/gen/buildChrome.mjs:134>) [sheets.mjs](</C:/Claude/Steampunk Platformer/tools/gen/sheets.mjs:69>) [sheets.mjs](</C:/Claude/Steampunk Platformer/tools/gen/sheets.mjs:92>) [sheets.mjs](</C:/Claude/Steampunk Platformer/tools/gen/sheets.mjs:127>) [sheets.mjs](</C:/Claude/Steampunk Platformer/tools/gen/sheets.mjs:167>)  
   **Fix:** Specify the blank grid cell and split the 3×2 grid first, then key and validate one connected plate per occupied cell, one empty cell, and semantic face-to-key mapping; define whether 4/6 means prompt repair or owner stop.

11. **LOW — Several repository claims are simply false.**

   - The claimed six-term source grep has zero matches, not “exactly one”; the cited `UIScene` comment contains none of `setInteractive`, `pointerdown`, `activePointer`, `addPointer`, `hitArea`, or `gamepad`. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:12>) [UIScene.ts](</C:/Claude/Steampunk Platformer/src/scenes/UIScene.ts:36>)
   - Five buttons do not map 1:1 to the snapshot’s six booleans: pause is not a sim field, jump writes two fields, and touch supplies no `walkHeld`. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:54>) [types.ts](</C:/Claude/Steampunk Platformer/src/sim/types.ts:94>)
   - The PAUSED hazard is gated by 12.11, not 12.12. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:111>) [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:180>)

   **Fix:** Correct the inventory, describe the actual field mapping, and repair the criterion reference before locking the plan.

## `activePointers: 4`

This is the correct Phaser knob and creates four touch pointers in addition to the reserved mouse pointer. It is enough for the four simultaneous gameplay actions; supporting all five UI buttons simultaneously would require five, but pause immediately leaves gameplay and has no credible simultaneous-use requirement. The cost is three additional `Pointer` instances over the default plus their small per-scene bookkeeping arrays—negligible here. [Config.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/core/Config.js:279>) [InputManager.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputManager.js:155>) [InputManager.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputManager.js:178>) [InputManager.js](</C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputManager.js:469>)

## Edge/level behavior

If wired correctly, the basic merge preserves the intended distinction:

- Zero ticks: the latched edge survives because sampling held state does not clear edges.
- Five ticks: the first tick consumes the boolean edge; held movement/jump state remains true through all five ticks.
- Multiple separate taps before any tick still collapse to one boolean edge, matching the existing latch’s non-queueing semantics.

[input.ts](</C:/Claude/Steampunk Platformer/src/sim/input.ts:4>) [input.ts](</C:/Claude/Steampunk Platformer/src/sim/input.ts:10>) [input.ts](</C:/Claude/Steampunk Platformer/src/sim/input.ts:44>) [tick.ts](</C:/Claude/Steampunk Platformer/src/sim/tick.ts:13>)

That correctness does not rescue the missing wiring or terminal-path defects above.

## Deletion-resistance audit

Based on the planned evidence—not nonexistent implementations—the criteria that can remain green while their touch behavior or production wiring is deleted are:

- **12.3:** unit-testing the merge directly does not prove `GameScene` calls it with live touch state.
- **12.4:** deleting every touch control helps the “none on desktop” half.
- **12.5–12.6:** pure layout/predicate assertions can pass with no drawn controls.
- **12.7:** prompt deletion should fail a real e2e, but wrong physical target geometry can pass because expected and actual share the predicate.
- **12.8:** deleted controls improve performance.
- **12.9:** deleting the feature preserves the sim boundary.
- **12.10:** a fake scene can instantiate the layer after its production consumer is deleted.
- **12.11:** absent controls are vacuously hidden and noninteractive.
- **12.12:** CSS can block browser gestures after the controls themselves are deleted.
- **12.14:** five valid PNGs can remain shipped but unused.
- **12.15:** budget documents can agree with no runtime feature.
- **12.16:** can pass if mutations target isolated bodies/assertions but never delete production wiring.
- **12.17–12.19:** build hygiene, file size, and a plan review do not prove touch behavior.
- **12.20:** an implementation review is advisory evidence, not a mechanical production-path gate.
- **12.21:** as written, it can use a keyboard for welcome/menu/continuation and still claim “all controls” during one level.

Only **12.1, 12.2, and 12.13** are intrinsically resistant if they use real on-screen touch contacts/screenshots; **12.7** becomes resistant only when it measures the actual overlay against independently measured live bounds. [plan](</C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:168>)

## Could not check

I could not run Vitest, TypeScript, Vite, Playwright, a browser, a GPU measurement, device testing, or the asset generator because process spawning is unavailable as stated. Phase 12 files, generated art, and tests do not exist yet, so their actual behavior and line counts cannot be inspected. All conclusions above are file-evidence review only.

VERDICT: REVISE

```

## Round 2 — Codex, verbatim

```
## Findings

1. **BLOCKER — `bindSession` runs before `TouchSession` exists.** The plan constructs `TouchSession` only in `UIScene.create()`, but calls `ui.touch.bindSession(...)` synchronously from `attachHud` ([plan:94-107](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:94)). The repository explicitly documents that after `scene.launch('UI')`, `UIScene.create()` has not run yet ([gameHud.ts:49-62](<C:/Claude/Steampunk Platformer/src/scenes/gameHud.ts:49>)). A direct call therefore dereferences `undefined`; optional chaining would merely skip the only binding and leave first-launch controls inert.

   Fix — Add a pre-create-safe `UIScene.bindTouchSession()` that stores pending arguments and applies them after `create()`, then test both first launch and the level-select relaunch.

2. **HIGH — The “full loss-path list” still omits the ordinary scene-level `POINTER_UP`.** The plan registers global `POINTER_UP_OUTSIDE` but not `POINTER_UP` ([plan:130-140](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:130)). Phaser emits scene `pointerup` when a pointer is released anywhere inside the canvas ([POINTER_UP_EVENT.js:8-28](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/events/POINTER_UP_EVENT.js:8>)). A finger can press RIGHT, move over empty canvas or another button, and release without the original object receiving `pointerup`; its pointer ID remains in the RIGHT set. The triage’s “full loss-path list” claim is therefore false ([plan:362](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:362)).

   Fix — Clear the pointer’s mapped action on scene-level `POINTER_UP` as well as `POINTER_UP_OUTSIDE`, and gate drag-off/release-over-another-control explicitly.

3. **HIGH — The binding contract still does not supply everything it says it needs.** `bindSession` requires `isPlayerInputEnabled` ([plan:94-100](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:94)), but the changed-files table only passes `input$` and the menu callback through `gameHud` ([plan:166-168](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:166)). The authoritative flag is a protected `GameScene` member ([GameScene.ts:121-124](<C:/Claude/Steampunk Platformer/src/scenes/GameScene.ts:121>)). Likewise, “scene PAUSE/SLEEP” is ambiguous: events on `UIScene` will not report the bound `Game` pausing, because the HUD deliberately remains alive while `Game` is PAUSED ([UIScene.ts:160-180](<C:/Claude/Steampunk Platformer/src/scenes/UIScene.ts:160>)).

   Fix — Pass `() => this.playerInputEnabled` and the bound Game scene explicitly, and specify removal/rebinding of that Game scene’s PAUSE/SLEEP/SHUTDOWN/DESTROY listeners.

4. **HIGH — The rotate prompt leaves undersized controls live underneath it.** Controls are cancelled and disabled only when Game is non-RUNNING or player input is disabled ([plan:187-191](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:187)); the prompt instead appears while a running, enabled game has undersized targets ([plan:200-211](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:200)). Criterion 12.12 repeats only those two disable predicates ([plan:251-253](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:251)). Nothing requires the five Phaser hit areas behind the prompt to stop moving, jumping, or attacking.

   Fix — Include `!touchTargetsFit` in the same cancel-before-disable predicate and assert prompt taps cannot alter the sim.

5. **HIGH — The two Playwright projects are neither fully specified as disjoint nor both touch-capable.** The current base `chromium` project ignores only `GPU_SPECS` and `PROD_SPECS`, so new Phase 12 files remain selected there ([playwright.config.ts:112-159](<C:/Claude/Steampunk Platformer/playwright.config.ts:112>)). The plan merely declares two projects “disjoint” without promising an update to that existing ignore rule ([plan:280-288](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:280)). Worse, only `chromium-touch` explicitly gets `hasTouch: true`; `chromium-touch-gpu` does not, although production controls render only when Phaser detects touch ([plan:202-204](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:202)). Its positive “all five drawn” precondition would therefore fail.

   Fix — Define shared behavior/perf regex constants, exclude both from base Chromium, give both touch projects `hasTouch: true`, and assert exact per-project collection counts.

6. **HIGH — “Three terminal-screen tap routes” is still a name, not a usable touch contract.** The plan only says the three files “call into `touchRoutes`” ([plan:162-170](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:162)). It does not define which live objects are interactive, how a level row is selected, locked-row refusal, or listener teardown. Current visible copy remains keyboard-only on the title ([TitleScene.ts:234-241](<C:/Claude/Steampunk Platformer/src/scenes/TitleScene.ts:234>)), level select ([LevelSelectScene.ts:79-100](<C:/Claude/Steampunk Platformer/src/scenes/LevelSelectScene.ts:79>)), and completion panel ([gameComplete.ts:97-105](<C:/Claude/Steampunk Platformer/src/scenes/gameComplete.ts:97>)). Criterion 12.1 forbids keyboard events but does not forbid tests from invoking scene callbacks directly ([plan:240-245](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:240)).

   Fix — Specify live pointer targets and teardown for all three screens, update prompts to advertise touch, and require 12.1 to dispatch real touch coordinates without direct scene/route calls.

7. **MEDIUM — Grid-first extraction can still validate clipped art.** Splitting before detection prevents cross-cell merging, but “one component per cell” does not prove that foreground stayed clear of a cell boundary; a face crossing an occupied-cell divider can be cut while both cells still contain exactly one component ([plan:220-230](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:220)). The plan also specifies only “1:1 2K,” not exact divisible dimensions, while the repository’s existing grid splitter rejects any width not divisible by three ([sheets.mjs:167-182](<C:/Claude/Steampunk Platformer/tools/gen/sheets.mjs:167>)).

   Fix — Define exact pixel boundaries or supported unequal cells, require chroma gutters, and reject any foreground touching a crop edge before downscaling.

8. **MEDIUM — Deletion resistance improved, but it is not yet seam-resistant.** Criterion 12.5 can test the contact object while actual Phaser event registrations are deleted; 12.16 names only the layout consumer; and 12.19 does not enumerate which production wiring must be mutated ([plan:246-260](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:246)). Individually, 12.7, 12.12, 12.15, 12.17, 12.18, and 12.20–12.23 can still pass with production touch wiring removed because they assert absence, boundaries, artifacts, documentation, size, or review execution rather than live wiring ([plan:248-264](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:248)). Other live-object criteria prevent wholesale deletion, but not deletion of an untested listener, terminal route, or bind call.

   Fix — Add an explicit mutation matrix covering `UIScene.create`, pending bind application, both `GameScene` consumers, every terminal route, every release/lifecycle registration, and Playwright project routing.

Could not check compilation, browser behavior, generated plate geometry, test collection, performance, or mutation failures: the plan identifies the relevant production and test modules as new deliverables ([plan:142-157](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:142)), and I performed only read-only `node_repl` file inspection as requested.

VERDICT: REVISE
```

## Round 3 — Codex, verbatim

```
The plan is not yet sound enough to implement. Six material problems remain.

1. **BLOCKER — The 2048×2048 premise contradicts this repository’s model record.** The plan hardcodes a 2046×2048 crop because it asserts a 1:1 2K result is 2048×2048 ([plan:291-294](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:291)). The repository explicitly says `nano-banana-pro` dimensions are unmeasured and must be read from the downloaded file, never inferred from the aspect/resolution labels ([FAL-MODELS.md:114-125](<C:/Claude/Steampunk Platformer/docs/FAL-MODELS.md:114>)). The crop fix is therefore based on another unsupported dimension assumption.

   Fix — Decode first, require an acceptable measured aspect ratio, then centre-crop dynamically to `width - width % 3` by `height - height % 2`, recording and asserting the measured dimensions.

2. **BLOCKER — The pending-binding lifecycle is still wrong on a stopped-then-relaunched `UIScene`.** The plan calls first launch pending but level-select relaunch immediate ([plan:109-120](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:109)). Phaser’s `launch()` always queues `start`; it does not synchronously rerun `create()` ([ScenePlugin.js:474-488](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/scene/ScenePlugin.js:474>)). Scene shutdown also deliberately preserves the scene instance and its references for reuse ([Systems.js:760-788](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/scene/Systems.js:760>)). Thus a level-select return is pending too: without a per-activation readiness flag reset on SHUTDOWN, binding either reaches the destroyed old layer or is lost before the new `create()`. The changed-files table also still instructs `ui.touch.bindSession(...)`, contradicting the new public deferral method ([plan:214-218](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:214)).

   Fix — Reset `touchReady` and null/destroy the layer on every UI shutdown, retain the latest pending binding across queued launch, consume it after every `create()`, and change the stale table entry to `ui.bindTouchSession(...)`.

3. **HIGH — Level-select touch targets are far below the plan’s own 44 CSS-pixel floor.** The route contract makes each existing row text object its hit target ([plan:176-180](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:176)). Rows are only 68 game pixels apart ([LevelSelectScene.ts:34-38](<C:/Claude/Steampunk Platformer/src/scenes/LevelSelectScene.ts:34>)), which becomes 23.6 CSS pixels at the plan’s minimum landscape scale of 0.347 ([plan:38-41](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:38)). Even enlarging each hit area to 44 CSS pixels would overlap adjacent rows. The catalog currently contains five rows ([index.json:42-62](<C:/Claude/Steampunk Platformer/public/assets/index.json:42>)), so this needs an actual mobile menu layout, not `setInteractive()` on the existing text.

   Fix — Give the five rows mobile-sized, disjoint hit zones and spacing—approximately the same 160-game-pixel target scale—and extend 12.8/12.9 to measure terminal-screen targets too.

4. **HIGH — Criterion 12.12 is impossible as written, and M8 need not red it.** The prompt state explicitly leaves Game RUNNING ([plan:256-265](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:256)), yet the criterion demands that a touch leave `tick` unchanged ([plan:328-330](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:328)). A running `GameScene.update()` drains fixed ticks ([GameScene.ts:246-273](<C:/Claude/Steampunk Platformer/src/scenes/GameScene.ts:246>)), and every simulated tick increments `world.tickCount` ([tick.ts:357-369](<C:/Claude/Steampunk Platformer/src/sim/tick.ts:357>)). Also, an arbitrary prompt tap may land nowhere near an underlying button, so removing the fit condition can still leave player state unchanged.

   Fix — Tap each of the five underlying control coordinates while the prompt is visible and assert no corresponding movement/jump/attack/route effect, allowing normal no-input tick progression.

5. **MEDIUM — The Playwright partition recreates the exact “matches neither” hole it claims to prevent.** `TOUCH_SPECS` excludes every filename beginning `perf`, while `TOUCH_PERF_SPECS` accepts only the exact `phase-12-perf.spec.ts` ([plan:390-399](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:390)). Consequently, a future `phase-12-perf-b.spec.ts` matches neither project, contradicting the claim that future Phase 12 specs default to behavior ([plan:401-404](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:401)).

   Fix — Define `TOUCH_ALL_SPECS`, select behavior as ALL minus the exact perf regex, and test the partition with representative current and future filenames.

6. **MEDIUM — Two mutation-row expectations are false, and teardown itself has no mutation.**

   - M2 need not red 12.6: that criterion covers an active `scene.start('Game')` rebind, where the immediate branch remains; deleting only pending binding principally breaks cold/stopped launches ([plan:324](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:324), [plan:361-364](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:361)).
   - M11’s uniform 200-pixel offset preserves target sizes and pairwise gaps, so 12.9 need not fail; only the canvas-containment assertion in 12.8 necessarily fails ([plan:326-328](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:326), [plan:370-373](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:370)).
   - The plan removes old bound-Game listeners during rebinding but never specifies destroying global BLUR/HIDDEN subscriptions when UI itself shuts down ([plan:119-126](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:119), [plan:167-169](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:167)). Phaser removes InputPlugin listeners on scene shutdown ([InputPlugin.js:3098-3142](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/input/InputPlugin.js:3098>)), but that does not clean custom subscriptions on the game’s core emitter.

   Fix — Make M2 target cold and stopped relaunches, change M11 to offset one control so 12.9’s gap fails, and add a mutation proving UI teardown removes every external listener and stale session reference.

I could not execute Playwright, generation, compilation, or mutation runs because process spawning remains unavailable and the review was restricted to `node_repl` file inspection.

VERDICT: REVISE
```

## Round 4 — Codex, verbatim

```
The plan is sound enough to implement. The round-3 corrections are technically coherent:

- Pending binding is now activation-safe: `launch()` queueing, shutdown reset, stale-layer destruction, latest-binding retention, and post-`create()` consumption agree ([plan:118-145](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:118)).
- Art dimensions are measured from the downloaded PNG and cropped dynamically to divisible dimensions, matching the repository’s explicit rule that model dimensions are unmeasured ([plan:327-344](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:327), [FAL-MODELS.md:114-125](<C:/Claude/Steampunk Platformer/docs/FAL-MODELS.md:114>)).
- The level menu now receives genuinely sized, disjoint mobile targets rather than enlarged overlapping text hit areas ([plan:195-209](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:195)).
- The rotate-prompt check now permits normal tick progression and tests all five underlying control coordinates ([plan:285-301](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:285)).
- The Playwright routing forms a total partition: all Phase 12 specs enter `TOUCH_ALL_SPECS`, with the perf subset excluded from behavior and selected by the GPU project ([plan:443-462](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:443)).
- M2/M2b, M11/M11b, and M14 now name mutations that should exercise the intended seams ([plan:409-426](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:409)).

Non-blocking nits:

- The header still calls this “round 2” ([plan:3](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:3)).
- “Constructs exactly once” should read “once per `UIScene` activation,” because the later shutdown/relaunch design intentionally reconstructs it ([plan:104-107](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:104), [plan:127-132](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:127)).
- During implementation, make the completion zone Game-owned—or otherwise explicitly destroy it on advance—because the UI scene survives level-to-level `scene.start('Game')` ([plan:104-107](C:/Users/royko/.claude/plans/execute-phase-12-twinkly-ocean.md:104), [gameComplete.ts:119-137](<C:/Claude/Steampunk Platformer/src/scenes/gameComplete.ts:119>)). The existing teardown requirement makes the intended outcome clear enough that this does not block the plan.

VERDICT: APPROVED
```

---

## Triage

Per-round triage tables — every finding, applied or refused with a reason — live in the plan record
and are reproduced in [qa/phase-12-touch.md](../qa/phase-12-touch.md). **Nothing was rejected:** all
24 findings were applied, which is unusual and is itself worth noting — it reflects that the reviews
were run against a plan rather than against a defended implementation.
