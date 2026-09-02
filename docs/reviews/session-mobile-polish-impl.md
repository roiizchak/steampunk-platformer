# Codex implementation review — the six mobile polish items

Branch `phase-13-mobile-polish`, run 2026-09-02 against the tip after all six items and the full
e2e sweep. File-evidence only: Codex's sandboxed shell cannot spawn processes on this machine
(`CreateProcessAsUserW failed: 5`), so the prompt directed it to the `node_repl` MCP tool with
`fs.readFileSync`. **Every finding below was re-verified locally before it was acted on** — all six
were real.

## Disposition

| # | finding | disposition |
|---|---|---|
| 1 | `rotateGuard` calls `scale.refresh()` on every frame, emitting a global RESIZE 60x a second | **APPLIED.** The engine re-measure is now conditional on the viewport having actually moved, read from `visualViewport` where it exists. `prompt.refresh()` still runs every frame — it is our own arithmetic and it is what clears the overlay. Desktop skips the re-measure entirely: nothing there can show the prompt or has a hit area to re-measure. New gate `tests/unit/rotate-guard.test.ts`, which is also the behavioural gate for `attachRotatePrompt` that Codex correctly noted did not exist. Red on: the unconditional refresh restored (2 cases), the refresh removed entirely (1), the DESTROY subscription dropped (1) |
| 2 | the level-complete overlay does not follow a live resize | **APPLIED.** `LevelCompleteOverlay.resize()`, called from `UIScene.applyLayout`. Its old comment — *"transient, so it does not subscribe to resize"* — was true while the view could not change, and the panel is not transient anyway: it stands until the player dismisses it |
| 3 | `UIScene` and `helpBannerLayer` remove their global resize listener on SHUTDOWN only | **APPLIED.** Both now retire on SHUTDOWN and DESTROY, idempotently. `sprite-draw-path.test.ts`'s teardown case was re-anchored (it sliced from the SHUTDOWN literal, which moved) and extended with the DESTROY assertion |
| 4 | the `installViewFill` wiring gate passes when the call is COMMENTED OUT | **APPLIED.** Both comment kinds stripped before the scan. Proved: commenting the call out now reds 2 cases |
| 5 | prose still teaching the old architecture | **APPLIED.** Seven sites: `touchLayout.ts` (which said the game had *stopped* using FIT — exactly backwards), `canvasScaling.ts`, `main.ts`, `titleInk.ts`, `effectsCamera.ts`, `rotate-prompt.test.ts`, `session-help-banner.spec.ts` |
| 6 | the level-button contrast argument quotes 3.52:1, computed at the RETIRED 0.55 plate alpha | **APPLIED, and strengthened.** At the live `PLATE_ALPHA` 0.9 a filled plate is ~2.47:1 — worse, not better. The header now carries all three rows, and `level-buttons.test.ts` **derives** them from `PLATE_FILL` and `PLATE_ALPHA` rather than restating them, so they cannot drift from the constant again |

**Nothing was rejected.** Regression after: unit **3116 in 220 files**, e2e **227 across all six
projects**, typecheck clean, build + verify-dist ok.

⚠️ Findings 1 and 3 are defects that PREDATE this branch — Phase 12 shipped both. Finding 1 got
worse here: item 4 made `UIScene.applyLayout` call `setFontSize`, which re-runs Phaser's
`MeasureText`, and that was landing on every frame of the title and level-menu screens.

🔴 **Finding 4 is the one worth carrying forward.** A source-text gate that does not strip comments
is not a gate: the code it names can be commented out in place and every assertion still passes.
`playwright-projects.test.ts` had already learned this twice — a line comment, then a block comment
on the same line — and the lesson did not travel to the next source-text gate written.

---

## The review, verbatim

## Findings

1. **HIGH — Rotate handling forces a global Phaser resize on every frame.**  
   [rotateGuard.ts:100–120](<C:/Claude/Steampunk Platformer/src/scenes/rotateGuard.ts:100>) subscribes the same `refresh` function to scene `UPDATE` and calls `scene.scale.refresh()` inside it. Phaser’s [ScaleManager.js:967–993](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/scale/ScaleManager.js:967>) consequently recalculates scale/bounds/orientation and emits global `RESIZE` every frame, even when dimensions are unchanged. That fans into expensive listeners—for example [UIScene.ts:277–309](<C:/Claude/Steampunk Platformer/src/scenes/UIScene.ts:277>) destroys/recreates the gear-pop attachment and remeasures text on every resize. The reentrancy latch prevents stack overflow, but it does not prevent continuous resize churn. The claimed behavioral gate is also absent: [rotateGuard.ts:48–52](<C:/Claude/Steampunk Platformer/src/scenes/rotateGuard.ts:48>) says `attachRotatePrompt` became unit-testable, while [rotate-prompt.test.ts:3–6](<C:/Claude/Steampunk Platformer/tests/unit/rotate-prompt.test.ts:3>) imports only the prompt/predicate layer.  
   **Fix:** Make scene `UPDATE` call only `prompt.refresh()`; reserve `scale.refresh()` for DOM rotation/viewport events, and add a fake-scene gate asserting that frame polling never refreshes the ScaleManager.

2. **HIGH — The level-complete visual overlay does not follow the live view.**  
   [hudFade.ts:117–149](<C:/Claude/Steampunk Platformer/src/scenes/hudFade.ts:117>) snapshots width, height, fade size, and text center once. Its rationale says the object exists only for the half-second tween, but [hudFade.ts:205–218](<C:/Claude/Steampunk Platformer/src/scenes/hudFade.ts:205>) leaves it alive until explicit destruction. [UIScene.ts:277–310](<C:/Claude/Steampunk Platformer/src/scenes/UIScene.ts:277>) resizes only normal HUD objects, while [gameComplete.ts:186–202](<C:/Claude/Steampunk Platformer/src/scenes/gameComplete.ts:186>) updates only the invisible tap zone. After a 1920→2400 resize, the fade remains 1920 wide and its text remains centered at x=960, leaving the new right side undimmed. The Phase 13 reader covers backing store, camera, and parallax only at [phase-13-viewfill.spec.ts:33–50](<C:/Claude/Steampunk Platformer/tests/e2e/phase-13-viewfill.spec.ts:33>).  
   **Fix:** Give `LevelCompleteOverlay` a `resize(width, height)` method, invoke it from `UIScene.applyLayout`, and add a live-resize completion-panel assertion.

3. **MEDIUM — Two scene-owned global resize listeners omit the required `DESTROY` teardown.**  
   [UIScene.ts:129–147](<C:/Claude/Steampunk Platformer/src/scenes/UIScene.ts:129>) removes its ScaleManager listener only on `SHUTDOWN`. [helpBannerLayer.ts:144–147](<C:/Claude/Steampunk Platformer/src/scenes/helpBannerLayer.ts:144>) likewise registers only a shutdown cleanup, although its `destroy()` correctly removes the global listener at [helpBannerLayer.ts:292–300](<C:/Claude/Steampunk Platformer/src/scenes/helpBannerLayer.ts:292>). Removing either active scene through `DESTROY` therefore leaves a global callback retaining dead scene objects; a later resize can invoke it.  
   **Fix:** Register the same idempotent cleanup on both `SHUTDOWN` and `DESTROY`.

4. **MEDIUM — The production-wiring gate passes when `installViewFill` is commented out.**  
   [view-size.test.ts:145–169](<C:/Claude/Steampunk Platformer/tests/unit/view-size.test.ts:145>) scans unprocessed source text and separately uses `toContain`. Replacing the real call with `// installViewFill(game.scale);` still produces one word-boundary match, still satisfies `toContain`, and still appears before `installFullscreenOnTap`. The game can therefore revert to fixed-width letterboxing while the entire test remains green.  
   **Fix:** Strip line/block comments before scanning, as other source-wiring gates already do, or parse the source AST.

5. **LOW — Several current comments and test premises still describe the abandoned mechanism.**  
   [touchLayout.ts:10–23](<C:/Claude/Steampunk Platformer/src/render/touchLayout.ts:10>) says the game stopped using FIT and that FIT fixes the backing store at 1920; production still uses FIT over a variable game size. The same fixed-1920 statement remains in [canvasScaling.ts:12–15](<C:/Claude/Steampunk Platformer/src/render/canvasScaling.ts:12>), [main.ts:19–23](<C:/Claude/Steampunk Platformer/src/main.ts:19>), [titleInk.ts:89–92](<C:/Claude/Steampunk Platformer/src/render/titleInk.ts:89>), and [rotate-prompt.test.ts:9–12](<C:/Claude/Steampunk Platformer/tests/unit/rotate-prompt.test.ts:9>). [effectsCamera.ts:31–38](<C:/Claude/Steampunk Platformer/src/scenes/effectsCamera.ts:31>) still attributes the widening to EXPAND. [session-help-banner.spec.ts:217–230](<C:/Claude/Steampunk Platformer/tests/e2e/session-help-banner.spec.ts:217>) retains the obsolete pre-rewrite explanation immediately above its replacement. These comments now teach the opposite of the shipped architecture.  
   **Fix:** Replace current-tense EXPAND/fixed-FIT descriptions with “FIT over a computed live game size,” retaining fixed-1920 wording only where explicitly historical.

6. **LOW — The level-button contrast rationale uses the retired 0.55 plate alpha.**  
   [levelButtons.ts:14–18](<C:/Claude/Steampunk Platformer/src/scenes/levelButtons.ts:14>) and [level-buttons.test.ts:86–95](<C:/Claude/Steampunk Platformer/tests/unit/level-buttons.test.ts:86>) claim a filled plate composites to RGB `(67,48,24)` and yields 3.52:1. Current [touchMarks.ts:97–98](<C:/Claude/Steampunk Platformer/src/scenes/touchMarks.ts:97>) uses alpha 0.9, producing approximately RGB `(98,69,31)` and only about 2.47:1. The actual unfilled implementation remains sound at approximately 5.33:1, but its recorded arithmetic is stale.  
   **Fix:** Recalculate the filled counterfactual using `PLATE_ALPHA`, and derive or gate that number instead of copying it into comments.

## Sections without further findings

- **1 — Core `installViewFill` loop:** No defect found. [viewSize.ts:47–50](<C:/Claude/Steampunk Platformer/src/game/viewSize.ts:47>) always returns an integer; Phaser’s later floor at [ScaleManager.js:771–799](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/scale/ScaleManager.js:771>) cannot change it. The synchronous second pass therefore hits [viewSize.ts:73](<C:/Claude/Steampunk Platformer/src/game/viewSize.ts:73>) and terminates. Zero/hidden sizes fall back to 1920, portrait clamps to 1920, and ultrawide clamps to 2560. A fixed parent ratio cannot alternate between rounded widths.

- **2 — EXPAND diagnosis:** It is true. EXPAND clamps the game canvas through `displaySize.min/max` at [ScaleManager.js:1115–1120](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/scale/ScaleManager.js:1115>), then sends the CSS candidate through the same `displaySize.setSize` at [ScaleManager.js:1131–1137](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/scale/ScaleManager.js:1131>). `Size.setSize` reaches the min/max clamps shown in [Size.js:413–449](<C:/Claude/Steampunk Platformer/node_modules/phaser/src/structs/Size.js:413>). Abandoning EXPAND was technically justified.

- **3 — Other fixed-width consumers:** No additional material shipping consumer found. The page-coordinate helper correctly divides by the live canvas backing width at [touchMeasure.ts:123–134](<C:/Claude/Steampunk Platformer/tests/e2e/touchMeasure.ts:123>).

- **4 — Named lifecycle targets:** `effectsCamera`, parallax, tap-route resize, game-complete routes, and LevelSelect’s attachments ultimately cover both lifecycle events. For example, the effects owner tears down on both at [gameEffects.ts:354–361](<C:/Claude/Steampunk Platformer/src/scenes/gameEffects.ts:354>), and parallax does so at [gameParallax.ts:78–90](<C:/Claude/Steampunk Platformer/src/scenes/gameParallax.ts:78>). `viewSize` is game-global rather than scene-owned.

- **5 — Other listed gates/fakes:** No additional fake-only API rerouting was demonstrated from current source. The Phase 13 touch E2E is narrow—it checks only the furthest-right active Zone—but it can fail and the shared resize helper has separate coverage.

- **6 — Rewritten assertions:** No material quiet drop found in the current files. [phase-06-resize.spec.ts:35–41](<C:/Claude/Steampunk Platformer/tests/e2e/phase-06-resize.spec.ts:35>) explicitly names the two lost height-derived assertions and replaces them with invariant checks at lines 79–105. The help-banner reduction is named at [session-help-banner.spec.ts:232–237](<C:/Claude/Steampunk Platformer/tests/e2e/session-help-banner.spec.ts:232>), and the walk-latch gate still checks opacity in both directions at [phase-12-menu.spec.ts:166–191](<C:/Claude/Steampunk Platformer/tests/e2e/phase-12-menu.spec.ts:166>).

- **8 — Level buttons:** Apart from the stale contrast number, no implementation defect found. Selection changes both hue and stroke width at [levelButtons.ts:70–73](<C:/Claude/Steampunk Platformer/src/scenes/levelButtons.ts:70>) and [levelButtons.ts:174–177](<C:/Claude/Steampunk Platformer/src/scenes/levelButtons.ts:174>); art and fallback locks are repositioned in place at [levelButtons.ts:97–120](<C:/Claude/Steampunk Platformer/src/scenes/levelButtons.ts:97>); resizing creates nothing new. Existing `row.text.text` and `row.plate.lineWidth` readers remain compatible.

- **9 — Generation record:** No arithmetic or invoicing defect found. Phase 12’s `3+2+2+5+2=14` generations cost $2.10; $55.50 + $2.10 + $0.15 = $57.75, leaving $2.25. [GENERATION-LOG.md:296–304](<C:/Claude/Steampunk Platformer/docs/GENERATION-LOG.md:296>) explicitly labels the total quoted, while [phase-13-padlock.md:15–16](<C:/Claude/Steampunk Platformer/docs/generations/phase-13-padlock.md:15>) says the invoice has not been read.

This was file-evidence-only review. I did not run tests, TypeScript, Git commands, the build, or the game.

### Source

- [Phaser Scale Manager documentation](https://docs.phaser.io/phaser/concepts/scale-manager)

VERDICT: REVISE

