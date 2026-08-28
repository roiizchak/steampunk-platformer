# Session `hud-and-pits` — the gate owners' findings, and what was done with each

Eight briefs: four owners, two each *(A7)*, brief 1's findings **withheld** from brief 2 so the
second reader could not simply agree with the first. They ran **before** the Codex implementation
review, because applying their findings changes the diff Codex reads.

Every finding below is **applied** or **recorded with a one-line reason** *(C11)*. Nothing was
silently dropped. Where a finding was applied *differently* than proposed, the mechanism actually
used is named.

Owners, per the gate table in the session plan:

| Criterion | Owner |
|---|---|
| 3 — the banner still meets the WCAG large-text floor after the move | `voltagent-qa-sec:accessibility-tester` ×2 |
| 4 — the banner reads clearly in a real browser and never covers the player | `voltagent-qa-sec:ui-ux-tester` ×2 |
| 5, 6 — the pit rule, its inventory, and its fixtures | `voltagent-qa-sec:qa-expert` ×2 |
| 13 — diff review | `voltagent-qa-sec:code-reviewer` ×2 |

⚠️ **A subagent's summary is a claim, not evidence** *(§5)*. Every finding below was re-verified
locally against the file it names before it was applied or rejected; three of them did not survive
that check and are recorded as rejected with the reason.

---

## `code-reviewer`, brief 1

| # | Finding | Disposition |
|---|---|---|
| 1 | **The banner is placed in the wrong camera's space.** It is on `GameScene`'s display list; the counter it measures itself against is on `UIScene`'s. `gameEffects.ts` grows `GameScene`'s camera and moves it to `(-margin.x, -margin.y)` so a shake never uncovers the view edge — so a `setScrollFactor(0)` object at `x` draws ~10 px left and 8 px up of where the layout put it, while `UIScene`'s camera sits at the origin. At 852×480 the whole `COUNTER_GAP` is 10.7 px, so the banner all but touched the counter. Invisible to the e2e clearance assertions, which compared bounds in one camera's space against rectangles in the other's. | **Applied** — `helpBannerLayer.ts` places at `final.x - cam.x`, read from the live camera rather than recomputed from `shakeSafeMargin` so it stays correct if the margin is retuned, and zero on any scene that never grew its camera. The e2e probe converts back (see the same owner's brief 2, and the 2026-08-28 follow-up below). |
| 2 | The Playground legend had **no red proof at all** — nothing asserted the dev-scene strings were placed by the same rule. | **Applied** — a case in `session-help-banner.spec.ts` drives `KeyP` and asserts the Playground legend against the same containment rule. It could not use `readHud`, which waits on `scene.isActive('UI')`; dev scenes stop `UIScene`, so the case asserts containment and a non-origin position instead. |
| 3 | `helpBannerLayer.ts` had no teardown gate — a listener left on a dead scene. | **Applied** — the layer drops both listeners and destroys the `Text` on `SCENE_SHUTDOWN`, and `help-banner-layer.test.ts` asserts all three. |
| 4 | **`bannerInk`'s out-of-range guard was false safety.** `(y * img.width + x) * 4` with an `x` past the width is a perfectly valid index in the *next scanline*, so an over-wide region silently counted pixels from the wrong row rather than failing. | **Applied** — out-of-range is now `continue`d, on both axes. |
| 5 | **`bannerInk` assumes a device pixel ratio of 1** and would fail silently at 2. `boundingBox()` is CSS pixels; `screenshot()` is device pixels. `chromium-dpr2` exists in the same config. | **Applied** — asserted, not assumed: `expect(img.width).toBe(page.viewportSize()?.width)`. |

## `code-reviewer`, brief 2

| # | Finding | Disposition |
|---|---|---|
| 1 | Stale records the move invalidates: `docs/evidence/session-tier5/README-banner.md` pins the old 1872 px wrap and "both forms are two rows"; `src/render/helpBanner.ts` said the banner sits below the plate; `gameHud.ts:20` claimed `GameScene.ts` is *over* the 400-line ceiling. | **Applied** — README-banner.md carries a superseded block; both prose claims corrected (`GameScene.ts` is *at* 400, not over). |
| 2 | Further stale records outside the diff: `docs/qa/session-bugfix-tiers.md:57`, `docs/qa/phase-06-hud.md:413`, `docs/HANDOFF.md:991`, `docs/qa/session-tier5-gate-holes-03-sweep.md:214`, `docs/SESSION-PROMPT-next.md:310`. | **Applied** — each carries a one-line supersession pointer to this session's log rather than a rewrite, because they are records of what was true then. |
| 3 | **The layout guard tested truthiness, and a destroyed `GameObject` is truthy.** Phaser's `destroy()` sets `active = false` and leaves every other field readable, so `if (!counter)` would lay out against a corpse — through every dev-scene transition. | **Applied** — the guard is `!counter?.active`, and a case sets `active = false` and asserts the layer retries when it returns. |
| 4 | The banner had **no depth at all** — default 0 — while the player is at 10, enemies at 9, their shots at 11, gears at 8. `setScrollFactor(0)`, so the world slides *over* it. | **Applied** — `HELP_BANNER_DEPTH = 20`, above the whole `GameScene` band with room to grow. |
| 5 | `engineLiterals.ts` said "three" values twice after a fourth was added. | **Applied** — corrected in both places. |
| 6 | **`Math.max(0, wrapPx)` turns wrapping OFF.** `Text.js:392` is `else if (style.wordWrapWidth)`, so zero is falsy and Phaser takes the no-wrap branch — one unwrapped line running off the right of the screen, i.e. a rehearsal of the very full-width strip this session removes. The comment asserted the opposite and the unit test pinned the wrong number beside it. | **Applied** — floor is one em (`Math.max(fontPx, …)`), checked against the vendored engine before changing anything. This is §5's *read the assertion, not the statistic* exactly. |

## `ui-ux-tester`, brief 1

| # | Finding | Disposition |
|---|---|---|
| D | **`assertPlaced` checks the banner against the plate and the counter and nothing else** — a banner sitting on top of the player sprite satisfied every assertion in the file. And the block genuinely does extend below the plate's bottom edge, so "it is inside the HUD's footprint" is not available as an argument. | **Applied** — `assertClearOfPlayer()` compares the two through the camera, in the page, in one sample, because a scroll value read separately from a player position is two samples of two different frames. |
| — | No screenshot of the fixed state existed; the defect was reported *from* screenshots. | **Applied** — the evidence case photographs all three supported sizes into `docs/evidence/session-hud-and-pits/`, so the evidence is a by-product of a gate that runs rather than a file somebody remembered to make once. |

## `ui-ux-tester`, brief 2

| # | Finding | Disposition |
|---|---|---|
| 4 | **The spec bounded the banner against the SCREEN while the defect is about the PLAY AREA.** Add one word to the legend, the block goes three rows → four → twenty, hangs from y = 24 down to y = 1000 over the entire level — and every assertion still passed, because 1000 < 1080. | **Applied** — `HELP_BANNER_MAX_ROWS = 4` and a ceiling assertion. Deliberately a *ceiling with room in it*, not the row-count equality the owner's "keep every key" decision forbids. |
| 5 | The banner's depth (see `code-reviewer` brief 2 #4, found independently). | **Applied** — same fix. Two owners converging on it is why it is recorded twice. |
| — | **The fix is incomplete and saying otherwise would be false.** Three rows at 43 px is 154.8 px against a 128 px plate, so the banner *does* extend past the plate's bottom edge — arithmetic that follows directly from the owner's "allow 3 lines" decision. | **Recorded, not fixed** — bounded rather than hidden. The intrusion is confined to the column right of the counter instead of spanning the screen, which is the defect the owner reported; the residue is written into `HELP_BANNER_MAX_ROWS`'s block with the measured numbers. |

## `accessibility-tester`, brief 1

| # | Finding | Disposition |
|---|---|---|
| — | The move must not drop the banner out of WCAG's 14 pt bold large-text class; at 44 px it draws at 19.5 physical px at 852×480 against an ≈18.66 px threshold, so the bar stays 3:1 and the shipped ink pair measures 3.80:1. | **Verified, no change** — re-derived independently and matched. `contrast-floor.test.ts` pins it. |
| — | The narrower band must not push the banner under the contrast floor by shrinking the font. | **Applied as a constraint, not a change** — the font cannot shrink below 42.06. It later moved 44 → 43 at the owner's request; see the follow-up section. |

## `accessibility-tester`, brief 2

| # | Finding | Disposition |
|---|---|---|
| 1 | **Predicted that a key and its label would split across rows** in the narrower band — `[ ]` on one row, `volume` on the next — which is a claim about actual break points and is only answerable by printing them. | **Applied, twice.** `readBanner()` now returns `rows: string[]` so a review can see *where* the legend breaks; the prediction was then confirmed by measurement, and `helpLine()`'s key/label pairs are joined with non-breaking spaces so Phaser cannot break inside one. The `  ·  ` separators stay ordinary spaces, and the DEV suffix deliberately keeps ordinary spaces so `verify-dist.mjs`'s `'p play'` / `'o editor'` / `' gym'` sweep still matches. |
| — | Two further attacks on the contrast arithmetic. | **Rejected, with reason** — both rested on misreadings of `glyphContrast`'s sweep (it already searches every background luminance, so a "worst case" it proposed was inside the sweep). Re-derived locally before rejecting. |

## `qa-expert`, brief 1

| # | Finding | Disposition |
|---|---|---|
| 1 | **`floating-platform-wall.json` proved nothing.** The ground under the pit was not continuous: the *left* side rejected the run first, so the floating right neighbour the fixture exists to judge was never reached. It passed for the wrong reason. | **Applied** — the fixture's ground is continuous under the pit, and it now fails if the floating-platform case is lost. |
| 2 | **Three of the detector's five narrowing clauses were dead code** — map-edge, bottomless-neighbour and floating-platform were all subsumed by `reachesGround`, because an out-of-bounds index reads `undefined` and `!undefined` is true, and a column no rectangle covers never has the flag set. **No fixture could ever have discriminated them**, so three committed fixtures were proving nothing while carrying names that said they were. | **Applied** — the detector was restructured to two live clauses (`isWall`, `fullyCovered`). Codex round 3 finding 7 reached the same conclusion independently on the same day, from a different direction. |
| 3 | The meta-gate claimed *"every narrowing clause has a fixture that would fail without it"*, which was false once three clauses were dead. | **Applied** — renamed to *"every shape the rule must reject is still present"*, with the reason the old claim was false written into it. |

## `qa-expert`, brief 2

| # | Finding | Disposition |
|---|---|---|
| 1 | **A gear or goal authored inside a derived spike run is seen by nothing.** `tiledEntities.ts` checks gears against solids only; `tiledGoal.ts` checks the goal against solids, spawn and ground only. | **Applied** — `level-pits.test.ts` asserts it, with the `gear-in-spikes.json` fixture. |
| 2 | Enemy beats should get the same check. | **Rejected, with reason** — `describePlacementProblem` (`tiledPlacement.ts:139`) already refuses an enemy whose *swept* beat crosses a hazard, and it knows the body height `EnemySpawn` does not carry. Re-checking here against a cruder rectangle would be a second definition that agrees on every easy case and diverges on the hard one *(vault 5.3)*. Written into `level-pits.test.ts`'s header as a deliberate non-check. |
| 3 | Nothing rejected overlapping hazard rects, so `hazardHit()`'s first-match behaviour was order-dependent for no reason. | **Applied** — the builder merges per-row interval unions before painting and emission; the gate asserts no two emitted hazard rects overlap, with the `hazards-overlap.json` fixture. |

---

## Follow-up, 2026-08-28 — after the owner watched the e2e run

Not a gate-owner finding; recorded here because it changed the same files and the numbers above.

**The owner asked for the control legend "a bit smaller."** `HELP_FONT_PX` moved **44 → 43**, which
is as far as it can go. `18.66 × 1920 / 852 = 42.06`, so 42 draws at 18.6 physical px at the smallest
supported size and drops the banner out of WCAG's large-text class — at which point the bar becomes
4.5:1, which the *road not taken* case in `contrast-floor.test.ts` shows this palette cannot reach
without going white-on-black. **Anything below 43 is a STYLE.md change and an approval checkpoint,
not a tuning tweak**, and that sentence is now in `HELP_FONT_PX`'s own block.

Two e2e failures surfaced by the change were fixed **at their causes, not by moving the bounds**:

- **The probe compared two coordinate spaces.** `readBanner()` returned `getBounds()`, which answers
  in the object's own space — and the object's `x` is deliberately not where it draws, because of
  `code-reviewer` brief 1 finding 1 above. Every limit it was compared against (`gameSize`, the HUD
  margin, the counter) is screen space, ~10 px away. Converted in the probe, once, so no caller can
  forget. The right-margin assertion had been failing by 1.33 px on a banner drawing exactly where it
  should — and the left and top assertions were 10 px lenient in the other direction.
- **The row ceiling was written from the nominal line-height ratio.** `HELP_LINE_HEIGHT_RATIO` is
  what `helpBannerLayout` uses to centre; it is not what Chrome draws. A four-row block at 1280×720
  measured 158.67 px against a nominal 156.80 — **1.216** per row. New `HELP_LINE_BOX_SLACK = 1.05`
  says that out loud: the ceiling is a **play-area** bound, not a glyph-metrics claim. 5 % rather
  than the measured 1.3 % so a font substitution cannot false-red it, and far below the 25 % an extra
  row would add — so the gate still goes red for the mutation it exists for *(C2)*.
- `wrapPx` now reserves **twice** the stroke, read out of the vendored engine rather than fitted to
  the failure: `GetTextSize.js:41` starts each line width *at* `strokeThickness` and `Text.js:1381`
  draws glyphs from `strokeThickness / 2`, so up to 1.5 strokes of the object's width is outline, and
  `GetTextSize.js:67` runs the result through `Math.ceil`.

`help-banner-layer.test.ts` reached **509 lines** against the 400-line ceiling and was split at the
seam the architecture already draws — `src/render/` decides, `src/scenes/` applies:
`helpBannerFake.ts` (249), `help-banner-layer.test.ts` (236), `help-banner-layout.test.ts` (60).
No assertion was lost: the suite total is unchanged across the split.
