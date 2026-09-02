# Session — the six mobile polish items (not a phase)

The owner played the shipped Phase 12 build (`9eba673`) on a real device and reported six things.
None of them touch the sim, the tick contract or progression. Five are presentation-level and small;
**item 6 has real reach**, because it makes the view width variable for the first time.

Branch `phase-13-mobile-polish`, eight commits. Codex plan review ran **before** approval, at the
owner's explicit instruction — five rounds, `REVISE ×4` then `APPROVED`, 33 findings, all applied.

| # | the owner's words | what shipped |
|---|---|---|
| 1 | *"no need to show the width in pixels in production"* | the readout node is INJECTED under `import.meta.env.DEV`; `verify-dist.mjs` sweeps for `rotate-diag` |
| 2 | *"buttons instead of a list … a lock icon"* | `src/scenes/levelButtons.ts` + a generated padlock, on desktop AND touch |
| 3 | *"no need for opacity"* | `PLATE_ALPHA` 0.55 → **0.9**, and a press DIMS to 0.72 instead of brightening |
| 4 | *"the amount of gears is not aligned"* | the descent is MEASURED off the live `Text` and halved, not guessed |
| 5 | *"no need to show volume text on mobile"* | `helpLine` returns empty on touch, above the DEV suffix; the empty path clears `dirty` |
| 6 | *"when put to full screen, it should cover all the screens"* | the view takes the viewport's aspect at a fixed height, clamped |

Owner decisions taken during planning, recorded because three override a measurement or a
documented rationale:

1. **Level select buttons ship on desktop *and* touch**, not touch only.
2. **Touch plates go to 0.9 at rest.** Put to the owner *with* the occlusion measurement (175 of
   878 standing positions, 19.9 %, have a hazard, an enemy or the goal behind a plate) before it was
   taken. See item 3 below — this **abandons** the occlusion criterion rather than weakening it.
3. **The lock icon is generated art via fal**, one padlock with a drawn fallback.

---

## 🔴 Item 6 shipped twice, and the first one was wrong

**`Phaser.Scale.EXPAND` landed in `e542823` and was replaced in `1257de2`.** This is the most
important thing in this log, because the plan was Codex-approved *with EXPAND in it* and the
approved mechanism turned out to be unusable.

### What caught it

`tests/e2e/phase-13-viewfill.spec.ts` — a live post-boot resize gate written because *"every
consumer this change touched is correct on the first frame either way; the defects are all in what
happens on the SECOND size."* It boots at one viewport and RESIZES, which is what a rotation and a
fullscreen toggle actually do.

It failed on its **first run**, and not on the second size: at a 900 × 405 viewport the canvas came
back **1020 CSS px** wide, and at 1040 × 400 it came back **1920 CSS px** — wider than the viewport
itself. A fresh-boot spec at each size would have seen none of it.

### Why EXPAND cannot do this

`ScaleManager.js:1088-1140` computes the game size, clamps it with
`Clamp(canvasWidth, displaySize.minWidth, displaySize.maxWidth)` — and then does:

```js
this.displaySize.setSize(clampedWindowWidth, clampedWindowHeight);
styleWidth = this.displaySize.width;   // → canvas.style.width
```

`displaySize` is **also the CSS style size**, and `Size.setSize` re-clamps into the same min/max.
So the bounds are applied in two different coordinate spaces at once — game units and CSS pixels:

| our config | intended effect | actual side effect |
|---|---|---|
| `min: { width: 1920, height: 1080 }` | the view never narrower than the design size | the canvas is never smaller than **1920 × 1080 CSS px**, on a 900 px viewport |
| `max: { width: 2560, height: 1080 }` | the view never wider than the ceiling | the canvas is capped at **1080 CSS px tall**, on any display taller than that |

The `min` half is what the gate caught. The `max` half was never observed on this machine and is
recorded as **derived, not measured**: at 2560 × 1440 the arithmetic gives `displaySize.setSize(2560,
1440)` against a `maxHeight` of 1080. It is stated as a consequence of the code above, and a future
session with a 1440p display can settle it in one look.

There is no assignment of `min`/`max` that bounds the view without bounding the CSS size the same
way. `min` could be dropped — it is redundant, EXPAND's own arithmetic never produces either axis
below the base — but `max` cannot, and `max` is exactly what the portrait case needs: a 390 × 844
phone yields a `gameSize` of 1920 × **4155** unclamped.

### What ships instead

`Phaser.Scale.FIT` **stays**. `src/game/viewSize.ts` gives the view the viewport's own aspect at a
fixed height, so FIT has nothing left to letterbox inside the ceiling:

```
liveViewWidth(pw, ph) = clamp(round(GAME_HEIGHT * pw / ph), GAME_WIDTH, MAX_GAME_WIDTH)
```

`installViewFill` listens on the ScaleManager's `resize` and calls `setGameSize(width, GAME_HEIGHT)`.
Height is pinned, so every `gameH / GAME_HEIGHT` ratio in `src/render/` stays exactly 1 and the HUD,
the touch layout and the parallax keep their measured sizes. Only the width breathes.

⚠️ **The equality guard is load-bearing.** `setGameSize` ends in `refresh()`, which emits `resize`
(`ScaleManager.js:993`) straight back into the handler. Without the guard the first resize is an
infinite loop, not a slow one. `tests/unit/view-size.test.ts`'s fake re-enters exactly as Phaser
does and carries a call budget, so removing the guard fails as a NAMED assertion rather than as a
hung worker.

### What this cost, and what it did not

Every consumer landed in `e542823` and `72b2b55` — the shake camera, the parallax attachment, the
tap routes, the level guards — is **unchanged**. They all follow a live `gameSize` and none of them
ever named the scale mode. The reversal touched `config.ts`, `main.ts`, one new file, and prose.

**The prose was the expensive part**: 35 lines across 24 files named `EXPAND` by the time the
mechanism changed. All were rewritten in the same commit. `docs/ENGINE-NOTES.md`'s
*"Scale · the backing store is the GAME size, at every DPR"* section is now **amended rather than
superseded** — its measurement was always about FIT and is still exactly true; what moved is that
"the game size" stopped being a constant.

---

## Item 3 — the occlusion bound is ABANDONED, not weakened

`PLATE_ALPHA` 0.55 → 0.9. The rule was that a plate keeps ≥ 60 % of the resting state's residual
transparency. **Resting residual at 0.9 is 0.10 against the measured-readable 0.45 — 22 %, not
60 %.** And `touchMarks.ts` records **0.86 as the value measured to erase the content underneath**;
0.9 is past it.

So the honest record is:

- The 19.9 % measurement **stays in the source**. It is the evidence a future session needs.
- The bound is **withdrawn on owner authority**, not satisfied. `docs/prd/phase-12-touch.md` was
  amended in the same commit.
- **A hands-on hazard-visibility pass replaces it**, and that check is a criterion, not a nicety —
  see the outstanding list at the bottom of this file. It has NOT been done.

⚠️ **The two arms did not mean the same thing by "alpha", and 0.9 made it matter.** `drawPlate`
passes the alpha as `add.rectangle`'s 6th argument — that is `fillAlpha`, which leaves the keyline
opaque, and the keyline is where the plate's WCAG 1.4.11 contrast comes from. `setPressed` called
`setAlpha`, the OBJECT alpha, which multiplies the stroke too. At 0.55/0.72 that was a quiet
wrongness; at 0.9 it is visible. `paintPlate` now feature-detects `setFillStyle` (a Shape has one,
an Image does not) and uses the right one per arm.

---

## Item 2 — the plate is a frame, and that is a contrast decision

Reusing `touchMarks.drawPlate` verbatim would have reopened the defect `LOCKED_COLOUR` was written
to close. `PLATE_FILL 0x6b4b21` at its resting alpha over the config's `#12100e` ground composites
to about `rgb(67,48,24)`, against which `#8f8776` measures **3.52:1** — below the 4.5:1 a 34 px row
font needs at 11.8 CSS px, and a regression from the **5.33:1** the UI/UX gate bought.

The 0.55 alpha exists because 19.9 % of standing positions have something behind a *play* control.
**The menu has no world behind it**, so that justification does not transfer.
`add.rectangle(cx, cy, w, h, 0x000000, 0)` + `setStrokeStyle` means the ground under every label is
still the config ground, so 5.33:1 holds by construction with no constant copied out of `config.ts`
to drift.

| state | keyline | width | vs the ground |
|---|---|---|---|
| unlocked | `0xf7e3b8` | 6 | 15.0:1 |
| locked | `0x8f8776` | 6 | 5.33:1 |
| **selected** | `0xffd873` | **12** | 13.9:1 |

Selection reads on two non-text channels — hue AND width — so it is not colour-alone, and the label
is byte-identical between states. Locked reads on three: keyline, label ink, icon.

**One layout path, not two.** `touchMenuLayout(5, 1920, 1080)` yields rows of 1190 × 160, bigger
than the old 68 px desktop text rows at every viewport and never smaller, so the desktop
`ROW_HEIGHT` arithmetic is deleted rather than kept alive to drift. `touch` still decides exactly
two things: whether tap routes attach at all (criterion 12.7 — desktop gains no hit targets) and
what the hint string says.

---

## Item 4 — a measured number replacing a by-eye one

`hud.ts:193-196` said outright of `DIGIT_DESCENT_FRACTION` 0.105: *"a by-eye number and the by-eye
read is still owed"*. It is now `metrics.descent / metrics.fontSize / 2`, read through
`Text.getTextMetrics()`.

⚠️ **HALF the descent, not the descent.** The first draft passed the full ~0.21, which would have
**doubled** the nudge while calling it measured — moving the digits as far wrong in the other
direction. Caught by the Codex plan review, round 1.

⚠️ **Read AFTER `setFontSize`.** `UIScene` creates the Text with no size and only sizes it in
`applyLayout`, so metrics read at creation describe the wrong size. The gate for this uses an
order-sensitive metrics fake that returns a different descent per font size — a fake that returned
one number could not tell a correct read from a premature one.

0.105 stays as the headless fallback, and its comment now says so rather than promising a read.

---

## Gates and mutations

Every gate was watched failing before it was trusted *(C1)*, and every revert confirmed by "content
changed AND the original count dropped by one" *(C12)*.

### The two that were DECORATION when first written

🔴 **`level-buttons.test.ts`'s "does not touch the label text" case.** It asserts that
`paintLevelButton` never calls `setText` — the thing that replaced the `"> "` prefix. The mutation
that re-introduces the prefix was **GREEN**: neither `TouchFaceLike` nor the fake carried `setText`,
so the mutation called a method that was not there and the gate passed through the exact change it
names *(C2)*. Both now declare and record it. **The thing a gate forbids must be expressible and
observable, or the gate is a sentence about itself.**

🔴 **The caller gate for `keepTapRoutesSized`** (found earlier in the same session).
`toContain('keepTapRoutesSized(')` survives renaming the call to `NOT_CALLED_keepTapRoutesSized(`,
because the mutation's own name contains the needle. Replaced with an escape-free word-boundary
scan. Both were found by *running the mutation the gate names*, not by reading it.

### The matrix

| mutation | gate that went red |
|---|---|
| `report()` drops the DEV guard | `verify-dist.mjs` — `rotate-diag` present in `dist/` |
| the dev node is never appended | the DEV DOM case in `rotate-prompt.test.ts` |
| `PLATE_ALPHA` → 0.55 | `touch-plate-ink.test.ts` resting-value case |
| the greybox press sets object `alpha` | `touch-plate-ink.test.ts` keyline-opacity case |
| the `/2` dropped from the descent | the behavioural UIScene gate (a pure layout test supplying its own fraction never executes it) |
| `UIScene` stops passing the measured fraction | same gate, whose fake's value differs from the 0.105 fallback |
| `UIScene` reads metrics before `setFontSize` | same gate, order-sensitive fake |
| `helpLine`'s touch branch returns the volume string | `volume-readout.test.ts` touch cases |
| the touch return moved BELOW the DEV suffix | `volume-readout.test.ts` DEV-suffix case |
| `dirty = false` removed from the empty path | `help-banner-layer.test.ts` — a second update must not re-layout |
| the recursion guard removed from `installViewFill` | `view-size.test.ts`, 4 cases, via a call budget rather than a hang |
| the ceiling clamp dropped | `view-size.test.ts`, 3 cases |
| the floor dropped | `view-size.test.ts`, 1 case |
| no `apply()` on install | `view-size.test.ts`, 3 cases |
| the `main.ts` call renamed / moved after `installFullscreenOnTap` | the word-boundary wiring gate, 1 case each |
| the view width pinned at the design size | **both** `phase-13-viewfill` specs, all 3 cases |
| `TapRoutes.updateTargets()` no-oped | `phase-13-viewfill-touch.spec.ts` |
| the level-button plate given a visible `fillAlpha` | `level-buttons.test.ts` fill case |
| `alpha` set to 0 instead of `fillAlpha` | the stroke-survives case |
| the lock ART arm blanked | the `{art:true}` case |
| the lock FALLBACK arm blanked | the greybox case — separately, one must not mask the other |
| a `"> "` prefix re-introduced | the label case (see above) |
| the selection stroke width flattened | 2 cases |
| `LOCK_TEXTURE_KEY` changed | the catalog case — which the art arm **cannot** replace, because the fake's `textures.exists` answers true for any key |
| `resizeLevelButton` no-oped | the resize case |

### Assertions DROPPED rather than adapted, and why

The synthetic `game.scale.resize()` path is no longer reachable — it emits `resize`, the fill loop
hears it and snaps the view back to what the viewport says. Three tests were rewritten to drive a
real browser resize, and two of them lost assertions:

- **`phase-06-resize.spec.ts`** (split out of `phase-06-chrome.spec.ts` at the 400-line ceiling) lost
  `layout.scale` and `plate.w` *shrinking*. The old resize shrank the HEIGHT to 720; height is now
  pinned, and `hudLayout` scales off height alone, so the HUD genuinely does not re-lay-out under a
  width change. Asserting that it does would be asserting a falsehood. Both are now asserted
  **invariant** instead, and what survives is the half vault 6.2 is actually about: a UI camera
  built from a literal, checked at both sizes, which now differ by 480 px.
- **`session-help-banner.spec.ts`** lost its *"smallest supported size, where the band is
  narrowest"* arm. The view can no longer be narrower than `GAME_WIDTH`, so 852 × 480 letterboxes at
  a 1920-wide view instead of shrinking the band. Replaced with the **ceiling** case, the other end
  of the range. Its "it genuinely moved" observable changed from `bounds.left` — derived from the
  height-scaled gear counter, and therefore now invariant; it read 624 at both sizes and failed on
  correct behaviour — to `bounds.right`, which is what the extra wrap width actually buys.
- **`phase-12-menu.spec.ts` 12.6c** only inverted: the latched walk plate now DIMS. Both sides are
  still asserted, plus `> 0` so a vanished plate cannot pass.

### The Codex implementation review — 6 findings, all applied

Full text and dispositions: [reviews/session-mobile-polish-impl.md](../reviews/session-mobile-polish-impl.md).
**Nothing was rejected**, and every finding was re-verified locally before it was acted on.

Two are worth carrying beyond this session:

🔴 **A source-text gate that does not strip comments is not a gate.** `view-size.test.ts`'s wiring
case scanned raw source for `installViewFill(` — so `// installViewFill(game.scale);` still
produced a word-boundary match, still satisfied `toContain`, and still appeared before
`installFullscreenOnTap`. The game could revert to fixed-width letterboxing with the whole file
green. `playwright-projects.test.ts` had already learned this **twice** — a line comment, then a
block comment on the same line — and the lesson did not travel to the next source-text gate written.

🔴 **`rotateGuard` was calling `scale.refresh()` on EVERY FRAME**, which emits a global RESIZE:
`updateScale()` writes `canvas.style` and forces a layout through `getBoundingClientRect()`, then
every scale listener in the game runs. `UIScene.applyLayout` is one of them — and **item 4 made it
worse**, because the measured descent added a `setFontSize` call, which synchronously re-runs
Phaser's `MeasureText`. Sixty times a second, on the title and level-menu screens, for a size that
had not moved. The poll itself is not the defect and stays: iOS Safari does not reliably fire
`window.resize` on a rotation. It now reads the viewport cheaply and pays for the engine re-measure
only when the numbers actually changed.

Also applied: the completion overlay now follows a resize (it was built from the view once, under a
comment saying it was transient — true while the view could not change, and it is the panel the
player READS); `UIScene` and `helpBannerLayer` retire on DESTROY as well as SHUTDOWN; seven prose
sites still taught the old architecture, including one in `touchLayout.ts` that said the game had
*stopped* using FIT, which is exactly backwards; and the level-button contrast argument quoted
**3.52:1** computed at the retired 0.55 plate alpha — at the live 0.9 a filled plate is **2.47:1**,
worse rather than better. That table is now **derived** from `PLATE_FILL` and `PLATE_ALPHA` in the
gate rather than restated in a comment, so it cannot drift from the constant again.

### Regression, after everything

- `npm test` — **3116 passed, 220 files**, 0 failed.
- `npx tsc --noEmit` — clean.
- `npm run build` — `verify-dist ok: 5 level(s) and 12 audio file(s) shipped byte-identical, no
  DEV-only scene key or debug surface in 1 bundle(s)`.
- `npm run test:e2e` — **227 passed, 0 failed, 0 skipped**, run per project:
  `chromium` 106 · `chromium-gpu` 70 · `chromium-dpr2` 8 · `chromium-touch` 34 ·
  `chromium-touch-gpu` 3 · `chromium-prod` 6.

⚠️ **Run per project, and that is worth recording.** A single whole-suite invocation completed in
32 minutes on one attempt and then hung past a 2-hour ceiling on the next, with the JSON reporter
producing **no file at all** — so a hang costs the entire signal. Per-project runs with a `timeout`
localise a hang and keep every earlier project's result. The second attempt's hang was not
reproduced: `phase-06-resize.spec.ts`, the newest headed spec, passes alone in 16 s.

---

## The padlock

One image, one generation, **first take adopted**, $0.15.
Full record: [generations/phase-13-padlock.md](../generations/phase-13-padlock.md).

🔴 **The running total in `GENERATION-LOG.md` was STALE by $2.10.** It read *"$55.50 of the `$60`
art ceiling. $4.50 remains"* and had never been updated for the fourteen Phase 12 touch-plate
generations already listed in its own index (3 + 2 + 2 + 5 + 2 at $0.15). Corrected to **$57.75 of
$60** with the arithmetic shown rather than asserted, and the superseded line kept so the correction
is checkable. Everything is **quoted, not invoiced** *(4.9)* — the last invoice reading is
2026-08-09.

---

## Outstanding — what this session did NOT do

🔴 **The hands-on pass on the owner's device has not been run**, and four of the six items are
"does it look right", which no gate answers *(C4; the owner plays at 60 Hz, this box is 240)*. It
needs a Vercel preview, checked in fullscreen:

- no bars left or right; no black band over the sky; the level menu centred with lock icons
- no digits on the rotate prompt; the volume banner gone; the gear count level with its icon
- buttons read solid at 0.9
- **the hazard-visibility pass item 3 owes**: stand behind the pause plate on level-01 where a
  shooting `brass-sentry` sits for nine consecutive standing positions, and under the jump plate on
  level-04 where the goal sits for nine more. **If either is unplayable, 0.9 is wrong and the number
  comes back down.**

⚠️ **`max.height` clamping the CSS height on a display taller than 1080 is derived, not measured.**
See the item 6 table above.

⚠️ **The frame-budget figures in `docs/qa/` were all taken at the design size** and are now a floor
for a widened view rather than the figure for every size. Nothing has re-measured them; recorded as
the open question it is rather than as a number.
