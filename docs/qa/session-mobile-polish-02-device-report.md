# Session — mobile polish, round 2: the owner's device report

The Vercel preview went to the owner's phone on 2026-09-02. Two things came back, and one of them
is the third wrong answer to the same question.

> *"looks good but, 1. the buttons too close to the edges of the screen. need to decide where to
> move them so it be easy to tap them 2. the amount of 'coins' is not align to right center of the
> icon. needs to move bit up"*

Sibling of [session-mobile-polish.md](session-mobile-polish.md) — split off because that file was
at 334 lines against the 400 ceiling, and `tests/unit/file-size.test.ts` globs `docs/qa/*.md`
non-recursively, so a sibling is the only shape that works.

---

## Report 1 — the controls sat inside the phone's own gesture zones

`TOUCH_EDGE_PX` **64 → 128**, uniform on all four edges. Owner decision, taken from three offered
insets; the answer was *"double it"*.

🔴 **The defect was invisible to every gate in the project, and the reason is worth keeping.**
`TOUCH_EDGE_PX` is in game pixels. Every assertion in `tests/unit/touch-layout.test.ts` was in game
pixels too — that the boxes are inside the view, that the pairs are anchored to the right corners,
that the layout scales off the view rather than the design size. **64 satisfied all of them.** The
quantity that was wrong is the CSS one, because CSS pixels are what a thumb and an operating
system's gesture handler both measure, and nothing converted.

On a landscape phone the canvas fills the viewport height, so one game pixel is `viewportHeight /
1080` CSS px — about a third. Measured across every viewport `phase-12-viewport.spec.ts` plays at:

| viewport | view width | scale | inset at 64 | inset at 128 |
|---|---|---|---|---|
| iPhone SE landscape, 667×375 | 1921 | 0.347 | 22.2 | 44.4 |
| iPhone 14 landscape, 844×390 | 2337 | 0.361 | 23.1 | 46.2 |
| Pixel 7 landscape, 892×412 | 2338 | 0.382 | 24.4 | 48.8 |
| **iPhone SE landscape, Safari chrome, 667×325** | 2216 | **0.301** | **19.3** | **38.5** |
| iPhone 14 landscape, safe area + chrome, 750×325 | 2492 | 0.301 | 19.3 | 38.5 |
| Pixel 7 landscape, Chrome chrome, 892×356 | 2560 | 0.330 | 21.1 | 42.2 |
| declared minimum, 852×480 | 1920 | 0.444 | 28.4 | 56.8 |
| iPad landscape, 1024×768 | 1920 | 0.533 | 34.1 | 68.3 |

Android's back-gesture strip reaches ~24 CSS px in from each side edge. **At 64 every phone in that
table put a control inside it or on its boundary.**

⚠️ **The worst case is browser chrome, not a chrome-less phone.** The docstring first written for
this change claimed *"44 CSS px at the worst viewport this phase supports (scale 0.347)"*. That is
the iPhone SE with no URL bar. The two 325-height rows are the real floor at **38.5 CSS px**, scale
0.301, and the prose has been corrected to say so. A worst case quoted one notch too optimistic is
how the next inset gets chosen too small.

**The cost, stated:** each end now holds `128 + 160 + 32 + 160 = 480` px, leaving **960 px** of clear
play area at the narrowest view. Gated, so it cannot be eroded silently.

---

## Report 2 — the gear count, wrong for the third time

Measured on the running game rather than reasoned about. At the design view, font 44 px:

```
counter box top   70.4        gear icon centre   88.0
getTextMetrics()  { ascent: 36, descent: 9, fontSize: 45 }
measureText('03') actualBoundingBoxAscent 28, actualBoundingBoxDescent 0
                  → digit ink centre  70.4 + 36 − 14 = 92.4      → 4.4 px LOW
```

### 🔴 `TextMetrics.fontSize` is NOT the font size

`MeasureText.js:38` sets it to **`ascent + descent`** — the glyph box height. At a 44 px font it
reports 45. So the round-1 repair, `metrics.descent / metrics.fontSize / 2`, was `9 / 45 / 2 = 0.1`:
a real measurement divided by the wrong denominator. That alone is not the whole error, because the
0.1 was still *added* to a box-centred `y`, and on this face box-centring is already correct.

### And the metrics describe a string the counter never draws

`getTextMetrics()` measures the style's **test string**, `|MÉqgy`. That is the right thing to lay
the box out on — Phaser puts the baseline at `boxTop + ascent` — and the wrong thing to centre
digits by, because `|` and `É` reach higher than a figure and `g`/`y` descend where a figure does
not. **28 against 36 is an 8 px difference on this face**, and no correction factor derived from the
test string alone can recover it.

### The repair: place the box from the ink

Both retired schemes were *nudges applied on top of box-centring*. This one stops nudging:

```
boxTop = plateMiddle − fontPx × (layoutAscent − digitInkAscent / 2) / fontPx
```

`measuredInkCentreFraction(layoutAscent, digitInkAscent, fontPx)` — two measurements of two
different strings, combined once, in one place. `UIScene.digitInkAscent()` reads the digits through
the `Text`'s own 2D context, which already carries the resolved font after `setFontSize`.

**On the shipped face the fraction measures exactly 0.5**, which is why `DIGIT_INK_CENTRE_FRACTION`
is 0.5 as the headless fallback. ⚠️ **That is a coincidence of this font, and the gates say so** —
`hud-counter-ink.test.ts` asserts the arithmetic `(36 − 28/2) / 44` rather than the literal 0.5,
because an equality against the constant could never fail.

### What this could NOT have been caught by, and now is

- `hud-layout` gates prove `hudLayout` honours whatever fraction it is handed. **No font.**
- The source-text gate proves `UIScene` hands it one. **No font.**
- The quantity that was wrong is only knowable in a browser, so `phase-06-hud.spec.ts` now asserts
  it in one: it reads `counter.y`, `getTextMetrics().ascent` and
  `measureText(counter.text).actualBoundingBoxAscent` off the live scene and requires the digits'
  ink centre within **±1 px** of the gear icon centre.

---

## Files

| file | change |
|---|---|
| `src/render/touchLayout.ts` | `TOUCH_EDGE_PX` 64 → 128, with the CSS arithmetic and the corrected worst case in the docstring |
| **NEW** `src/render/counterInk.ts` | `DIGIT_INK_CENTRE_FRACTION`, `measuredInkCentreFraction`, `digitInkAscent`. Split out when `hud.ts` crossed 400 lines; imports nothing, Phaser included — `digitInkAscent` takes its `Text` structurally |
| `src/render/hud.ts` | the counter `y` places the box from the ink; re-exports the two constants so no caller's import moved. 428 → 360 lines |
| `src/scenes/UIScene.ts` | takes both measurements after `setFontSize` and passes `this.layout.counter.fontPx` as the denominator. 417 → 398 lines |
| **NEW** `tests/unit/hud-counter-ink.test.ts` | replaces `hud-counter-descent.test.ts`, which was built entirely on the retired nudge |
| `tests/unit/touch-layout.test.ts` | the CSS-inset floor, converting through the real `liveViewWidth` |
| `tests/unit/sprite-draw-path.test.ts` | the UIScene case now requires both measurements, the right denominator, and both orderings |
| `tests/e2e/phase-06-hud.spec.ts` | the drawn-ink gate |

---

## Gates and mutations

Every mutation is surgical, in production source, applied and reverted through one script that
verifies C12 — content changed **and** the original count dropped by one — in both directions.
Redness is read from `Tests N failed` plus the named case, never from an exit code.

| # | mutation | gate that went red | evidence |
|---|---|---|---|
| M124 | `TOUCH_EDGE_PX` → 64 | `touch-layout.test.ts` › *keeps every control at least 32 CSS px from the edge* | 1 failed / 45 passed |
| M125 | counter `y` regains the `- fontPx / 2` term | `hud-counter-ink.test.ts` › *lands the digits EXACTLY on the icon centre* + *uses the SUPPLIED value* | 2 failed / 44 passed |
| M126 | `measuredInkCentreFraction` drops the `/ 2` | `hud-counter-ink.test.ts`, three cases | 3 failed / 43 passed |
| M127 | `UIScene` passes `metrics.fontSize` as the denominator | `sprite-draw-path.test.ts` › *measures BOTH strings…* | 1 failed / 45 passed |
| M128 | `UIScene` passes `metrics.descent` instead of the digit ink | same case | 1 failed / 45 passed |
| M129 | **the exact arithmetic that shipped**: `- fontPx / 2 + fontPx * 0.1` | `phase-06-hud.spec.ts` › *the DIGITS are level with the gear icon* | `digits at 92.4, icon at 88.0` |

🔴 **M129 is the one that matters.** It reproduces the owner's photograph to the tenth of a pixel —
4.4 px low — from a gate that is green on the repair. That is the difference between a fix believed
and a fix demonstrated, and it is the third attempt at this defect.

Two cases exist purely so the bounds can go red:

- The CSS floor is 32, and the **retired 64 breaches it on all seven phone viewports**. It is scoped
  to phones deliberately: an iPad landscape puts 64 at 34.1 CSS px, which clears the floor — so a
  floor tested on a tablet alone would never have caught this report.
- The e2e case asserts the **shipped** arithmetic lands outside the ±1 px bound. ⚠️ It does **not**
  assert that plain box-centring misses, because on this face box-centring is right by arithmetic
  coincidence. An earlier draft asserted exactly that and false-redded on correct code.

## Suite results

| run | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | **3121 passed, 0 failed** |
| `npm run test:sim-isolated` | 3108 passed, 13 skipped (3121) |
| `npm run build` | `verify-dist ok` — 5 levels, 12 audio files byte-identical, no dev surface |
| e2e, per project | `chromium` 106 · `chromium-gpu` 71 · `chromium-dpr2` 8 · `chromium-touch` 34 · `chromium-touch-gpu` 3 · `chromium-prod` 6 = **228 passed, 0 failed** |

⚠️ **Criterion 6.9 failed once in the sweep and it was not a regression.** A leaked server on port
4173 from the previous project's run meant the next run collided; 6.9's GPU delta read 1.2524 ms
under the contention. Freeing both ports and re-running the whole `chromium-gpu` project gave 71
passed. This is the failure mode `docs/TESTING-RULES.md` already names — free 5173 **and** 4173
between projects, not only at the start of a sweep.

## Outstanding

The hands-on pass on the owner's device is still owed, unchanged from
[session-mobile-polish.md § Outstanding](session-mobile-polish.md) — including the hazard-visibility
check that item 3's abandoned occlusion bound left behind. This round adds two items to it:

- the four play controls are reachable under a thumb and no longer fight the back gesture;
- the gear count reads level with its icon **on the phone**, not only in Chromium at the design size.

---

# Round 3 — no audio line on the welcome screen

The second preview went to the phone and came back with one thing, circled in the screenshot:
`M mute  ·  [ / ] volume  100%` on the title screen.

> *"all fixed but, small on the welcome screen only on mobile no needs mute and volume texts."*

Owner decision, 2026-09-02. **Touch only** — desktop keeps the line.

## Why the line existed, and why the reason does not survive a phone

`titleInk.ts:114-127` argues at length that *"a screen that advertises a control owes the player the
control's value"*: at the shipped `volume: 1`, the first press of `]` clamps and does nothing, so a
player who tries the key this screen just taught them cannot tell "already at maximum" from "still
broken". That was found by the criterion 11.12 adversarial brief and it is correct.

It is also entirely about a player who has keys. A phone has none, the device owns its own volume,
and the line names two keyboard keys — so on touch it is not an under-informative readout, it is an
instruction that cannot be followed. `audioHint` now returns `''` for touch, the same shape as
`helpLine`'s touch arm in `gameDev.ts` and for the same reason.

## 🔴 Removing a row is a LAYOUT change, and this is where it would have gone wrong

`TITLE_ROWS` is `[0.34, 0.455, 0.569, 0.683]` and `applyLayout` positions `this.items` **by index**
against it. Deleting the hint leaves three items on the first three fractions — ink spanning 0.34 to
0.569 inside a 0.22–0.78 panel band:

| | margin |
|---|---|
| top | 0.120 |
| bottom | **0.211** |

That is *"a row has gone missing"* — the exact reading `TITLE_ROWS`' own docstring records, and the
defect **both** criterion 11.12 briefs found independently in the spacing before it. Shipping the
removal alone would have re-opened it and the next screenshot would have said so.

So the rows are re-derived rather than sliced. `titleRowSpread(n)` solves the same equation
`TITLE_ROWS` was solved from, with `n` rows instead of four — equal gaps of the tuned
`(0.683 − 0.34) / 3`, and equal **optical** margins measured to the glyph box, `r ± designPx / 2`:

```
r₁ = (bandTop + bandBottom + h_first/2 − h_last/2 − (n−1)·gap) / 2
```

For three rows that gives `[0.3945, 0.5088, 0.6231]`, margins **0.1411 top and bottom**.

⚠️ **The four-row answer stays the tuned literal.** `titleRows(4)` returns `TITLE_ROWS` itself, so
desktop cannot drift by a rounding error — the derivation agrees with it to within a thousandth
(0.340074 → 0.34, 0.454407 → 0.455), which is the literal's own rounding and nothing more.

🔴 **That early return made its own gate decoration, and running the mutation is what found it.**
With the formula reachable only for `n < 4`, "the derivation reproduces the literal" could never go
red — M133 left it green. The derivation is therefore a **separate exported function**, and the gate
drives `titleRowSpread(4)`. *(C2: a gate that cannot go red is decoration.)*

## Gates

Two arms of one branch, and **neither is evidence alone** — an `audioHint` that returned `''`
unconditionally satisfies the touch case while deleting the line from every device.

| where | project | asserts |
|---|---|---|
| `phase-12-journey.spec.ts` | `chromium-touch` | the drawn Title display list has **3** Text objects and none matches `/volume\|mute/i` |
| `phase-11-title-routes.spec.ts` | `chromium` | it has **4**, and one matches `/M mute.*volume/` |
| `title-drawpath.test.ts` | unit | `audioHint(_, _, true) === ''`, the desktop arm unchanged, the source shape, and the four `titleRowSpread` / `titleRows` cases |

⚠️ **The count is the assertion, not just the absence of the string.** A fourth object created
*empty* would hold a row open — the screen spaced for four and drawing three, which is the
bottom-heavy defect above. Only the count tells those two apart, and M131 proves it: the drawn list
came back `STEAMPUNK PLATFORMER | a short climb through the works | TAP   choose a level | ` with a
trailing empty string.

| # | mutation | gate that went red |
|---|---|---|
| M130 | `if (touch) return ''` → `if (false)` | unit *audioHint returns NOTHING on a touch device*; e2e touch — `the audio hint is still drawn on a phone` |
| M131 | the row is created even when the string is empty | unit *only when there IS one*; e2e touch — 4 drawn, the fourth empty |
| M132 | `titleRows(this.items.length)` → `titleRows(4)` | unit *places the rows from the shared table* |
| M133 | the derivation drops its equal-margin term | unit *reproduces the four-row literal* + *EQUAL optical margins* |
| M133b | `titleRows` slices `TITLE_ROWS` instead of deriving | all three `titleRows` cases |
| M134 | `if (touch)` → `if (true)` — the line goes on **every** device | e2e desktop — `drawn: … | ENTER   choose a level` |

## Suite results

| run | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm test` | **3126 passed, 0 failed** (220 files) |
| `npm run test:sim-isolated` | 3113 passed, 13 skipped (3126) |
| `npm run build` | `verify-dist ok` |
| e2e, per project | `chromium` 107 · `chromium-gpu` 71 · `chromium-dpr2` 8 · `chromium-touch` 34 · `chromium-touch-gpu` 3 · `chromium-prod` 6 = **229 passed, 0 failed** |

⚠️ **`chromium-gpu` failed twice across this session and neither was a regression** — 6.9 once and
6.9 + 9.5 once, both after a long back-to-back run of other projects. Each passed in isolation
(`2 passed` for the two perf specs, the full count `--list` reports) and the whole project then
re-ran at 71/71. This is the §5 rule about one Playwright run at a time and nothing heavy beside it,
observed rather than argued: **a warm box reads as a broken game to a wall-clock-bounded gate.**
