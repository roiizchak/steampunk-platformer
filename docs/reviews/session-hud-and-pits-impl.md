# Codex — IMPLEMENTATION review, session `hud-and-pits`

`-s read-only`, fresh thread, file-evidence only. It ran **after** all eight gate-owner briefs, so
the diff it read already carried their fixes — which is the order the workflow specifies, because
applying agent findings changes what Codex reviews.

⚠️ Its sandbox cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`), so it read
files through `node_repl` + `fs.readFileSync` and ran no commands, no git, no tests. It said so
itself. **Every finding below was re-verified locally against the file it names**, and two of them
did not survive that check unchanged — noted where that happened.

## `VERDICT: REVISE` — 8 findings

| # | Sev | Finding | Disposition *(C11)* |
|---|---|---|---|
| 1 | MEDIUM | **The banner is aligned only when layout runs, but the camera keeps moving.** `dirty` goes false after the camera offset has been sampled once, while `gameEffects.ts` changes `camera.x/y` on every frame of a screen shake — so the banner shakes against a stationary `UIScene` counter, and a resize mid-shake can leave a residual offset once the camera settles. The player-clearance probe also omits the camera's viewport position. | **Applied, both halves.** The layer now stores its placement in screen space and re-applies the camera term on **every** update — two number reads and a `setPosition`; the expensive half (measuring the counter, re-wrapping the text) still runs only when dirty. `assertClearOfPlayer` converts the player with `+ cam.x` / `+ cam.y` as well as scroll and zoom. Verified locally: the banner's own bounds were already converted this way in `bannerHelpers.ts`; this was the half that had been missed. |
| 2 | MEDIUM | **Dev-scene banners stay permanently dirty after a resize.** `UIScene` stops itself because it hardcodes `'Game'` (`UIScene.ts:182`), after which `hudObjects()` never returns a live counter again. Element Editor and dev-scene resize are ungated. | **RECORDED, not fixed.** Verified. The consequence is bounded: the banner keeps its last valid placement and stops *updating* — it does not vanish, mis-position, or throw. It is **dev-only**: `PlaygroundScene`, `ElementEditorScene` and `GymScene` are `import.meta.env.DEV`-guarded and absent from `dist/`, so no player can reach it. The fix Codex proposes — an owner-aware HUD geometry source — is the same change round 2 of the plan review put **out of scope** (making `UIScene.update()`'s owner key dynamic), and doing it here would be widening the session's scope on my own initiative. |
| 3 | MEDIUM | **`columnProfile()` treats any positive overlap as a fully solid column-row**, so a one-pixel intrusion satisfies both rows `isWall()` needs — unsafe in a project whose editor supports one-pixel collision edits. Conversely `fullyCovered()` accepts horizontally adjacent rectangles but rejects vertically adjacent ones whose union covers the cell, while the comment claims general union coverage. | **Applied as truthfulness, not as code.** Both are now stated where they live. `columnProfile` declares its **tile-aligned precondition** — every shipped level is generated from `{ fromCol, toCol }` runs, and tightening would mean picking an arbitrary sub-tile threshold. `fullyCovered` declares that its union is **one-dimensional and deliberately so**: every hazard in this project is exactly one tile tall, and the limit fails in the *safe* direction — a vertically partitioned floor reads as uncovered, which is a false red somebody looks at, not a pit that silently cannot hurt you *(YAGNI)*. |
| 4 | LOW | **`pitDetect.d.mts` no longer describes the runtime contract** — `ColumnProfile` omits `solidRows`, which `detectPits()` requires, so a TypeScript caller could build a declaration-valid profile that crashes. | **Applied.** `solidRows: ReadonlySet<number>[]` added; `reachesGround` explicitly retained with the reason (`columnProfile` still returns it and the gate reports it — removing a returned field is how the two drift apart in the other direction). |
| 5 | MEDIUM | **"Every key remains printed" had no discriminating gate.** The production spec says outright it cannot verify content and delegates the claim to `contrast-floor.test.ts`, which checks only size, weight, stroke and inks. The dev e2e asks for `length > 40` and the word `move`. **Deleting `M mute` or `[ ] volume` would have left every gate green.** | **Applied.** A new case in `hud-layout.test.ts` asserts every control and every key against the **shipped half** of `helpLine()` specifically — split on the DEV suffix, because `helpLine()` returns the DEV superset under vitest, and with the non-breaking spaces normalised first. Watched failing on a deleted key. |
| 6 | LOW | **The 672/768/864/960/1056 ramp is file evidence, not a contract.** `level-ramp.test.ts` treats hazard total as a merely *non-decreasing* metric with a 75 %-of-total single-step cap, so unequal increments pass. And `level-05.mjs`'s own comments still said 864 px / nine tiles against an eleven-tile list. | **Applied, both.** A new `tests/unit/level-hazard-ramp.test.ts` asserts every consecutive pair differs by **exactly one tile**, written as the delta so adding a tile to every level stays legal. `level-05.mjs`'s two stale figures corrected to 1056 px / eleven tiles. (The file was split out because the assertion pushed `level-ramp.test.ts` to 415 lines.) |
| 7 | LOW | **The line-box and wrap-reserve comments overstate what Phaser derives.** `GetTextSize.js:74` is `lineHeight = size.fontSize + strokeThickness`, not a `1.2 × font` default; and "one stroke at the start plus half a stroke at the draw origin" does not add up to the claimed 1.5 strokes. Both allowances are empirical. Also: the pixel ceiling permits 4.2 nominal rows, so it does not quite assert what its name says. | **Applied.** Verified against the vendored source — Codex is right on the mechanism: `size.fontSize` is the **measured** ascent + descent for the resolved face, so the drawn row height is a font metric plus a stroke and our 1.2 is a convention standing in for it. Both comments rewritten to name the numbers as measured allowances. And the row **count** is now asserted directly in `session-help-banner.spec.ts` alongside the pixel ceiling, so the bound is no longer the only thing between the legend and the play area. |
| 8 | LOW | **Stale current-state claims in the record**: the obsolete five-clause pit definition still quoted in the session log; the evidence README still saying live `HELP_FONT_PX` is 44. | **Applied.** The log now quotes the two-clause rule and explains why it is two. The evidence README's "not superseded" block now separates the reasoning (unchanged) from the number (43). |

### Where Codex was wrong, checked before acting

- **"the log claims level-05 remained byte-identical"** — it does claim that, and the claim is
  **true**. `git diff --stat main -- public/assets/levels/` returns `level-02`, `level-03`,
  `level-04` and nothing else; levels 01 and 05 regenerate byte for byte. Codex could not run git,
  which is exactly the limitation its own preamble states. No change made.
- **"the log says one stroke reserve and 13 behavioural tests"** — neither string is in the file.
  Searched for both. The stroke count in the code is two and the split leaves 12; the log makes no
  claim about either. No change made.

### What Codex confirmed from the files

- The first-layout lifecycle is sound: the object starts invisible, retries while the counter is
  absent, becomes visible only after placement, and removes both listeners and the text on shutdown.
- At a stationary camera, the layer's `layout.x - camera.x` and the e2e's `getBounds() + camera.x`
  are mutually consistent. *(Finding 1 is precisely about the non-stationary case.)*
- `HELP_FONT_PX = 43` renders at 19.08 CSS px at 852×480, above the 18.66 px bold large-text
  threshold. `contrast-floor.test.ts` imports and pins the constant; its hardcoded `44` is the gear
  counter's, not the banner's.
- Parsing the raw shipped `.tmj` bytes yields exactly `level-03: [65-69]` and nothing anywhere else,
  and hazard widths of exactly 672 / 768 / 864 / 960 / 1056 px — independently re-derived.
- `pit-damage-tick.test.ts` is worthwhile as a shipped-pit attribution and counterfactual test; a
  discriminating duplicate would need a thin synthetic hazard, which `hazards.test.ts:25` already
  supplies. **This answers the question its own header raised** and is why it was kept as-is.
- `helpBannerFake.ts` is a helper, not a `*.test.ts`, so the split leaves no collected zero-test
  suite.
- No inspected change violates the Phaser-import boundary, the tween-write rule, the eight-field
  debug surface, or the 400-line `GameScene` ceiling.
