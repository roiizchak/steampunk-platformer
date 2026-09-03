[← Phase 12 QA log index](phase-12-touch.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-12-touch.md)

---
## The mutation matrix

Every row applied, verified applied by *"content changed AND the original count dropped by one"*,
gated, reverted, and the revert verified. The per-row outcomes are tabulated in
[`docs/prd/phase-12-touch.md` § 6](../prd/phase-12-touch.md#6-qa-gate); what follows is what the run
cost and what it found.

### The close-out regression, 2026-09-03

Every gate, after the last round-23 repair landed at `b83d0fd`. Counts read **positively** — a run
that selected nothing reports `expected: 0, unexpected: 0` and exits 0.

| gate | result |
|---|---|
| unit | **3146 passed / 3146** in 873 suites |
| sim isolation | **3133 passed, 13 skipped / 3146** in 223 files, Phaser uninstalled and restored |
| typecheck | `tsc --noEmit` and `tsconfig.build.json` both clean |
| build | vite ok, dev-seam gate folded 28 sentinel-marked bodies, **`verify-dist` ok** — 5 levels and 14 audio files byte-identical, no dev-only key in the bundle |
| e2e `chromium` | 107 / 107 |
| e2e `chromium-gpu` | 71 / 71 |
| e2e `chromium-touch` | 39 / 39 |
| e2e `chromium-dpr2` | 8 / 8 |
| e2e `chromium-prod` | 6 / 6 |
| e2e `chromium-touch-gpu` | 3 / 3 |
| e2e `webkit` | 2 / 2 |
| **e2e total** | **236 / 236** across all seven projects |

⚠️ **`chromium-prod` failed once, in the sweep, and passed on both re-runs.** The failing case was
*"carries no live dev seam — every flag and key is inert"*, which asserts over the **served** `dist/`.
It was re-run alone (1 passed) and then as the whole project (6 passed) against the same bytes, with
ports 5173 and 4173 freed before each. **It is recorded as an unexplained single flake, not as a
green**: the most likely cause is the prod server binding while the previous project's server was
still releasing the port, which is the failure mode `tools/dev/free-port.mjs` exists for and the
reason its header says to read it before touching any of it. Nothing in this session's diff reaches
that spec.

🔴 **`chromium-gpu` was intermittently red on `main` throughout this session** — three failures in
five runs, a different `phase-05..09` perf spec each time, none of them reachable from any file this
session changed. It is green in the run recorded above. That instability is not this phase's and is
not resolved by this phase; it is written down so the next session does not spend an hour on it.


### Merged and deployed, 2026-09-03

`phase-12-closeout` merged to `main` at **`e54680b`**, pushed, and deployed to production with
`vercel deploy --prod --scope rois-projects-f9d9895d` — deployment
`steampunk-platformer-648fttl40`, live at
[steampunk-platformer-jet.vercel.app](https://steampunk-platformer-jet.vercel.app).

Verified against the live edge rather than assumed:

| checked | result |
|---|---|
| `/` | 200, 8 255 B, `<title>Steampunk Platformer</title>`, CSP header intact |
| `touch-action: none` / `overscroll-behavior: none` | both present in the served HTML |
| viewport meta | `width=device-width, initial-scale=1.0` — **no `user-scalable`, no `maximum-scale`**, which is the deliberate choice 12.13 asserts |
| `bed-music.m4a` / `.ogg` | 200, 1 948 803 B `audio/mp4` and 2 084 163 B `audio/ogg` — both alternates served, which is what keeps iOS booting |
| `level-01.tmj` / `level-04.tmj` | 200, 33 161 B and 55 914 B |
| `touch-jump.png` | 200, 51 833 B |

⚠️ **The one-time deploy trap, twice over.** A bare `vercel deploy` targets **PRODUCTION** on this
project (`docs/qa/phase-10-ship.md` § the near-miss), and the linked `orgId` needs an explicit
`--scope rois-projects-f9d9895d` or the deploy returns *Not authorized* — the second half is new and
cost one failed attempt. **Preview deployments sit behind Deployment Protection** and redirect to a
Vercel login page, which is why the device pass needed the phone signed in once; the production alias
is public.

🔴 **A `user-scalable` grep over the served HTML returns a hit and it is NOT a defect** — the
rationale comment names the attribute in prose while the meta tag does not carry it. The same
nearby-text shape M105 found in `verify-dist`, one artifact over: **read the meta tag, not the file.**


### The device pass the owner still owes — 12.13, 12.14 and 12.14b in one trip

**Written 2026-09-02.** Three criteria need the same phone and the same session; run them together
or the trip is made three times. Production is
[steampunk-platformer-jet.vercel.app](https://steampunk-platformer-jet.vercel.app). **Landscape, in
fullscreen** (tap the wrapper once to enter it).

⚠️ **Say pass or fail in your own words for each.** *"Ran"* is not *"passed"* — reading one as the
other is the failure this log's § 12.24 was written to prevent, and it is why 12.13 and 12.24 were
not closed by the preview rounds that did find real defects.

#### 12.13 — four gestures, on level-01

| # | do this | it passes if |
|---|---|---|
| 1 | Hold **left**. Without lifting, slide the thumb off the button onto bare canvas, then back onto it | the player keeps walking the whole time, and the page never pans or bounces |
| 2 | Hold **jump** with one thumb. With the other, press **right** and drag it off the **physical edge** of the screen, then lift it out there | **the held jump does not drop.** This is the one with a real defect behind it — it was fixed on 2026-09-02 and this is its confirmation |
| 3 | Put two fingers on the play area and **pinch**, out and in, a few times. Repeat over the control cluster | nothing zooms, nothing scrolls, the game keeps running |
| 4 | **Double-tap** the jump plate, fast | no zoom, no grey flash, and the button still answers the next press. ⚠️ **Not "two jumps"** — this said that until 2026-09-03 and it is not achievable: `jumpPressed` is an idempotent within-frame edge and there is no double jump, so the second tap lands while the player is still airborne. Codex round 21, finding 4 |

⚠️ Check 2 is also the only test of `TOUCH_EDGE_PX` = **22.2 CSS px**, which is inside the iOS
home-indicator and Android gesture strips and has never been on a device. If the OS claims that drag
before the page sees it, that is the finding.

#### 12.14 — do the six glyphs say their actions

Look at the six controls at their real size and say what each one is **without being told**:
left arrow, right arrow, up arrow (jump), spanner (attack), boot (walk), four squares (pause — it
opens the level menu). The two to look hardest at are **pause** and **walk**: an earlier review found
neither said its action, the art was re-shot for exactly that, and this is the first time a person
looks at the result on a phone.

Both `ui-ux-tester` briefs already ran against these bytes at 44–48 CSS px on Chromium **and**
WebKit, resting and pressed — see § 12.14. What they could not do is your hardware, your screen's
DPR, and your light.

#### 12.14b — the hazard-visibility pass `PLATE_ALPHA` 0.9 owes

`PLATE_ALPHA` is 0.9. That **abandons** the occlusion bound rather than weakening it: 0.10 residual
against the measured-readable 0.45 is **22 %** where the rule said 60 %, and 0.9 is past the **0.86
measured to erase the content underneath**. You chose it; this is the check that replaces the bound.

| # | do this | it passes if |
|---|---|---|
| 1 | **level-01.** Walk to the raised block on the right where the `brass-sentry` stands — the only one in the level — and stand where it is **behind the top-right pause plate**. It shoots from there across nine consecutive standing positions | you can see it wind up and fire **in time to react** |
| 2 | **level-04.** Walk to the far right end. The goal sits **under the bottom-right jump plate** for nine standing positions | you can see the goal you are walking toward |

🔴 **If either is unplayable, 0.9 is wrong and the number comes back down.** That is the whole
agreement: the measurement is unchanged and stays in `touchMarks.ts:69-90`; what changed is that a
person decides instead of a bound.

---

### 12.14 — the two briefs, and the four findings that were closed by measuring

**2026-09-02.** `voltagent-qa-sec:ui-ux-tester`, two briefs *(A7)*, brief 1's findings withheld from
brief 2. This is the first time either brief has run against the bytes the 2026-08-31 redesign
shipped.

#### Brief 1 — verify the criterion

Drove the running game, solved the viewport that puts a 160-game-px box at each target size, and
confirmed from the live `UI` scene's own objects that the controls were drawn and interactive at
that size before capturing. Measured:

| target | achieved | viewport |
|---|---|---|
| 44 | 44.070 | 537 × 298 |
| 45 | 45.033 | 548 × 304 |
| 46 | 45.997 | 559 × 311 |
| 47 | 47.030 | 573 × 318 |
| 48 | 47.992 | 584 × 324 |

65 screenshots: six full-context frames, 30 true-size per-button crops, 30 nearest-neighbour zooms
of the *same pixels*. **Verdict: all six glyphs read as their action at all five sizes**, including
`attack` at 47 — the size the retired proxy once flagged — and including `pause` and `walk`, the two
an earlier brief found unreadable **against the previous art**.

That earlier finding is not contradicted: the art it judged is gone. `pause` was a cogwheel and is
now a 2×2 grid; `walk` was two bars and is now a boot. Both were re-shot for exactly those findings,
and this is the first pass to see the result.

#### Brief 2 — how could this pass while the feature is broken

Eight ways, ranked. **Four were closed by going and measuring; four are recorded as standing blind
spots**, which is the honest split — a brief's job is to name them, not to be talked out of them.

| # | the way | disposition |
|---|---|---|
| 1 | This criterion has five recorded prior methodology errors, each caught by a different reviewer and never by the method self-catching. Nothing stops a sixth | **RECORDED.** Structural, and true. Brief 1 avoided all five by construction — live game, true on-screen size, all five sizes, per-button crops of the shipped bytes — but nothing *forces* the next run to |
| 2 | The 44–48 band may not be where a tester lands: every documented device scale is **above** it (`touchLayout.ts:26-34` — 0.347 → 55.6 px, 0.400 → 64 px), so a screenshot at a real phone viewport never enters the band the criterion names | **APPLIED, and the residual recorded.** Both passes landed in it deliberately: brief 1 at 44.07–47.99, and the pressed/WebKit pass at exactly 44 and 48 (viewports 528 × 297 and 576 × 324). ⚠️ The finding's other half stands: the band's low end needs a canvas narrower than iPhone SE landscape, so on every documented phone the glyphs are **larger** than what was judged. The band is the conservative worst case, not the typical one, and 44 is where a control stops existing at all |
| 3 | The **pressed** state is never judged. `PLATE_ALPHA_PRESSED` 0.72 leaves 0.28 residual against resting 0.9's 0.10 — nearly 3× more level bleeding through, at the moment a thumb is using the control | **APPLIED.** Captured rest and pressed for all six at 44 and 48 on both engines. The press is proved to have registered rather than assumed: **4 320–4 436 bytes differ** between each rest/pressed pair of a 44 × 44 crop. The marks are opaque, so the extra transparency moves the plate and not the glyph; every one stays legible pressed |
| 4 | Desktop Chromium at `deviceScaleFactor: 1` is a different pipeline from a phone at DPR 2–3 | **RECORDED.** True, and it is the direction of *more* device pixels for the same CSS size — the easier direction, not the harder one. It is exactly what the owner's device pass is for, and it cannot be closed from here |
| 5 | The art is judged over whatever background the tester happened to be on; 19.9 % of standing positions have a hazard, an enemy or the goal behind a plate | **RECORDED.** The two documented worst cases — level-01's `brass-sentry` behind the pause plate, level-04's goal under the jump plate — are **12.14b's** device checks by name, so this is covered by a criterion rather than uncovered |
| 6 | No 12.14 judgement has ever happened on WebKit, and this project shipped a Safari-only defect past 229 green Chromium tests on 2026-09-02 | **APPLIED.** All six glyphs captured on WebKit at 44 and 48, rest and pressed. No rendering difference that affects legibility: the spanner, the 2×2 grid and the boot read the same on both engines |
| 7 | A screenshot could catch a transitional size — the first draw before a resize settles, or mid-orientation-change — that is never the live steady state | **RECORDED.** M39 gates the stale-size case behind it (two cases, watched red), and both passes confirmed the achieved CSS size from the live canvas before capturing rather than assuming the viewport arithmetic |
| 8 | A still frame judged in a quiet room is a different judgement from a glance mid-jump under camera shake and outdoor glare | **RECORDED, and irreducible.** No gate closes it, including a rebuilt one. It is what `play` exists for *(vault C4)* |

🔴 **No replacement contrast statistic was built, proposed or run**, by either brief. That was the
owner's decision of 2026-09-02 and both briefs were told so; brief 2 in particular was told it may
report an uncovered blind spot but not propose the deleted gate back, and it did exactly that.

**Evidence:** [`docs/evidence/phase-12-touch-44px-pressed-webkit.png`](../evidence/phase-12-touch-44px-pressed-webkit.png)
— all six controls at **44 CSS px**, four rows: Chromium rest, Chromium pressed, WebKit rest, WebKit
pressed, each cell the true-size capture at 4×. `pause` has no pressed cell, deliberately.

#### Two findings of the session's own, from doing the work

⚠️ **WebKit has no `Touch` constructor** — `new Touch(...)` throws *"Illegal constructor"*. The e2e
raw-`TouchEvent` driver in `tests/e2e/touchHarness.ts` therefore **cannot run on WebKit at all**, on
the one engine every iOS browser uses. The pressed/WebKit pass worked around it with a mouse
`pointerdown`, which reaches the same `GAMEOBJECT_POINTER_DOWN` handler and the same `paintPlate`
path. Recorded as the gap it is: the `webkit` project stays deliberately narrow, and extending it to
touch would need a different driver, not a wider `testMatch`.

⚠️ **A mouse `pointerdown` on Chromium in a `hasTouch` context trips `installFullscreenOnTap`**, and
the next `setViewportSize` then fails with *"restore it to normal state first"*. That is **M94's
symptom from the other side** — the guard is `isTouchDevice`, which a `hasTouch` desktop context
satisfies. Not a defect (a real desktop has `hasTouch: false`); recorded because it will cost the
next person an hour if it is not written down.

🔴 **And the first pressed-state capture was wrong, which is why it was checked.** `pause` was fifth
in the capture order and pressing it **opens the level menu** (`touchControlsLayer.ts:381`), so its
"pressed" frame came back fully black and every capture after it was taken over the menu rather than
over the level. `pause` is last now and its pressed state is not captured at all: a pressed pause
plate is a scene transition, not a state a player looks at.

---

### 12.13 — the gesture checks, and the defect the first one found

**2026-09-02.** The criterion is owned by `play` and still is; what follows is the half a machine
can hold, built so the device pass confirms behaviour rather than discovers it — which is the
sequence the two rotate-gate defects were reported *twice* for lacking.

#### Three gates, and what each one cannot see

| gate | what it holds | what it is blind to |
|---|---|---|
| `tests/unit/gesture-prevention.test.ts` | the four CSS rules on `html, body, #game`, and that the viewport meta carries **no** `user-scalable` / `maximum-scale` | anything the BUILD does to them |
| `tools/gen/verify-dist.mjs` | the same five things in `dist/index.html` | whether a browser honours them |
| `tests/e2e/phase-12-gestures.spec.ts` | `defaultPrevented` on every `touchmove`; the contact surviving the canvas edge; a drag off the button and back; that a pinch and a double tap reach the sim, route nowhere and leave no contact down — 🔴 **NOT that either fails to zoom**, see § neither the pinch nor the double-tap zoom | how it FEELS, what the OS claimed before the browser saw it, and **native zoom of any kind**: synthetic touches drive no gesture recognition, so both zoom assertions are tripwires rather than gates *(C2)*. Codex round 22 finding 5, and round 23 found this row still crediting them |

🔴 **None of this existed before.** A repo-wide search for `touch-action`, `overscroll-behavior`,
`user-scalable` or `tap-highlight` outside `node_modules` and `dist` returned exactly **one** hit,
and it was prose in a handoff document. Five lines were the whole of the page's gesture defence and
any refactor could have deleted them with the suite green.

⚠️ **Zoom is asserted on the VIEWPORT, never on a gesture event.** Chromium does not synthesise
`gesturestart`/`gesturechange` from synthetic `TouchEvent`s, so a spec waiting for one would pass
against a page that zooms freely.

#### 🔴 The defect: GAME_OUT dropped every contact, and one thumb near the edge triggered it

`InputManager.onTouchMove` runs `document.elementFromPoint` per finger per move and fires `GAME_OUT`
when the topmost element is not the canvas (`InputManager.js:613-624`); after `setCanvasOut`, the
`if (this.isOver)` guard at `:625` drops that finger's later moves as well. `touchControlsLayer`
wired that to `onLoseEverything`, so **a thumb rolling a few millimetres past a pillarboxed canvas
edge dropped every contact — including the jump the other hand was holding.**

Measured before the fix, on the live page: `document.elementFromPoint` returns `CANVAS` at 24 px and
8 px inside the edge and **null** at 12 px outside, and the scene's `gameout` counter goes
**0 → 1** on exactly that move.

The 12.5 adversarial brief argued for deleting the line; this log recorded it for the owner rather
than deciding. **Deleted on owner authority, 2026-09-02**, reproduction first: 12.13b holds RIGHT
and JUMP, walks one finger off the canvas, and reds. Criterion 12.5's own text named `GAME_OUT`
among the loss paths and was amended in the same commit — *a criterion that names a defect as a
requirement is the thing to change* — and the unit gate now asserts the **absence**, so a re-added
one-line subscription reds (M107).

🔴 **And 12.13b was a false green before it was a red.** Written with `waitTicks(page, 10)` it
PASSED against the shipped defect, because at 10 ticks the player is still coasting on the velocity
it had when the finger left and a dropped contact reads the same as a held one. 30 ticks — the
figure criterion 12.5b already pays for exactly this — separates them. A test written to a number
one order of magnitude too small is not a weaker test, it is a green one.

#### The four checks the owner still has to run

They are four, not the three the criterion line named — this log has always listed four:

1. **Drag off a control's edge and back.** Hold `left`, slide the thumb onto bare canvas and back on
   without lifting. The player walks throughout; the page does not pan.
2. **A drag that ends past the canvas edge.** Hold `jump`; with the other thumb drag from `right`
   off the physical edge and lift there. **The held jump must not drop.** This is the case above.
3. **Two-finger pinch**, across the control cluster and over the play area. No zoom, no scroll, the
   game keeps running.
4. **Double-tap the jump plate.** Two fast taps, two jumps, no zoom.

⚠️ `TOUCH_EDGE_PX` is 22.2 CSS px, inside the iOS home-indicator and Android gesture strips, and
has never been tested on a device. Check 2 is where that would show.

---

### 🔴 The `chromium-touch` project was intermittently red on `main`, and the cause was geometry

Found while regressing the GAME_OUT repair, and chased rather than absorbed: a criterion whose e2e
evidence is intermittently red is not solidly PASS.

**Measured 2026-09-02, one Playwright run at a time, ports 5173 and 4173 freed between each:**

| tree | full-project runs | failures |
|---|---|---|
| `main` at `1aa64b5`, this session's work fully stashed (34 tests) | 3 | **3** — twice *12.12 nothing under the pause menu drives the sim*, once *the tap zones move with the view, not with where they were built* (`phase-13-viewfill-touch.spec.ts`) |
| this branch (39 tests) | 9 | **2**, both *12.12* |

The assertion that fails is 12.12's last one: **`a tap on a retired control moved the game somewhere`**
— after ESC opens the level menu, a tap at a retired control's old coordinates sometimes leaves
`sceneKey` somewhere other than `LevelSelect`. It is **not** a timeout: the wait on `LevelSelect` had
already succeeded before that line.

#### The cause, measured rather than guessed

A throwaway probe tapped the six retired coordinates one at a time on `LevelSelect` and read
`sceneKey` after each. Five left it on `LevelSelect`; **`walk` left it on `Game`.** The geometry
says why:

| | game px |
|---|---|
| the retired `walk` coordinate | **(1520, 208)** |
| `LevelSelect` `row-0` | x **364.8 – 1555.2**, y **91 – 251**, `interactive: true` |

`walk` is *inside a live level button*. Tapping it starts level 1 — the menu working exactly as
designed. The intermittency was never randomness in the product: it was whether `row-0` had become
interactive by the time the tap landed, so a **deterministic overlap** presented as a flake.

🔴 **So this was a defect in the TEST, not in the game.** 12.12's claim is *controls hidden and
`disableInteractive()`d*, and the case already proves that per control — all six come back
`interactive: false`, and that assertion never failed. The final line then asserted
`sceneKey === 'LevelSelect'` after tapping all six, which conflates *"the control is dead"* with
*"nothing else lives at that coordinate"*. The second is not this criterion's claim, and it is not
even true.

**Repaired**: the loop now skips a coordinate that a live `LevelSelect` row covers, and asserts on
the rest by name. To keep that from being a way to assert nothing, it first asserts the uncovered
set is **non-empty** — a partition that excluded everything would be the vacuous pass this file has
paid for before. **M108** reds that guard. Measured after the repair: **3 full runs of
`phase-12-touch.spec.ts`, 10/10 each**, where the same file had been 3 for 3 red.

⚠️ **What is NOT claimed.** That the branch's earlier lower failure rate meant anything — 2 in 9
against 3 in 3 is a post-hoc rate comparison on a flake, which is the reading this phase kept
catching, and the real cause turned out to be a race that load changes the odds of. And the other
baseline failure is **not** explained: *the tap zones move with the view, not with where they were
built* (`phase-13-viewfill-touch.spec.ts`) failed once in three baseline runs and has not recurred
in any run since. It is carried forward as an open item with one observation behind it, which is
not enough to name a cause.

🔴 **And one probe went green and is recorded as such.** **M109** — dropping
`this.binding.isGameRunning()` from `controlsLive` — leaves 12.12 at 10/10. The pause route unbinds
the layer first, so `bind(null)` makes the predicate false whatever that term says: the mutation is
unreachable from this criterion rather than uncaught by it. Whether the term is reachable from any
path at all was **not** established. That is the open question, and it is a pre-existing one.

### The 12.19 repair, 2026-09-02

**What was open.** Thirteen rows — M46, M47, M55-M57, M60-M63, M65, M68, M69, M74 — each reddened a
gate that commit `949abb1` deleted with the ink pass (`tools/gen/touchInk.mjs`,
`shipped-touch-contrast.test.ts`, `touch-atlas-ink.test.ts`, `touch-strokes.test.ts`, and the two
ink-derived assertions in `shipped-touch.test.ts`). Three gates replaced them and **none of the
three had ever been watched failing.**

**The triage rule, decided before any mutation was built.** One question per row: *does the code the
row edits still exist, and does a live gate still claim its property?* Not *which mutation is easy to
build against something* — that is how the first 22 green rows happened, and the handoff says so in
as many words. The answer sorts every row into rebuilt or retired, and nothing else.

**Rebuilt — five, all red.**

| new | from | what it does | measured |
|---|---|---|---|
| **M99** | M46 | all six faces flat at one alpha, keyed field included | RED 2/15; `clear` **5314 → 0** on every face |
| **M100** | M61 | every non-mark pixel of `pause` to alpha 1 | RED 2/15; **19 191** pixels, `clear` **5281 → 0** |
| **M101** | M62 | 2 014 pixels outside `left`'s mark, dark and opaque | RED 1/15 — equality only; **two-band GREEN, counts byte-identical** |
| **M103** | M60 | `walk`'s mark erased to plate brass, two 4×4 ink cells kept | RED 1/15; **6 367** pixels |
| **M104** | M47 | the face drawn at `PLATE_ALPHA * PLATE_ALPHA` | RED 1/40 |

and **M45 re-run** against the fixed-central-square mask that replaced `keylineMarks`: `touch-walk`'s
central square copied onto `touch-left`, **RED 2/15 at 0.0 %**. A row does not carry over a redesign
of the gate it names; it is re-measured or it is decoration.

**Retired — eight.** M55, M56, M57, M63, M65, M68, M69, M74. The code each one edits is deleted, so
they are **unbuildable, not green**, and that distinction is the whole reason they can be retired
where M82 had to be: a row reporting `GREEN 0/n` contradicts the criterion; a row naming an edit to a
file that does not exist reports nothing at all. Each row states which deleted gate it reddened.

🔴 **M101 is the measurement, not the mutation, that mattered.** It reds byte-for-byte cut-face
equality and leaves the two-band alpha claim GREEN — with all three of its counts *byte-identical*
(5314 clear / 19 873 solid / 413 partial). So the two-band partition **provably cannot order M62's
damage**, which is the §5 rule's case exactly: a statistic that does not order its own mutation is
replaced, never re-bounded. The replacement had already been made when the ink pass went; M101 is the
evidence it was the right one rather than an assertion that it was.

🔴 **M102 went GREEN and is recorded as a probe, not a hole.** Raising every non-transparent
pixel to full alpha in the six shipped faces *and* the six committed cuts together — a pipeline
change faithfully re-cut, which is M63's mutation as the current build can express it — passes all
15. That is the designed split: `PLATE_ALPHA_BAKED` is deleted, the bytes ship unfaded, and the fade
is a draw-time value whose gate is the one **M104** reds. The property moved; it did not vanish. What
remains uncovered is M64's already-stated limit of a committed oracle — a builder change that is
faithfully re-cut moves both files together — and the independent statement against it is the pinned
key/row/col literal in `shipped-touch.test.ts`. Same call as M82: a probe that found the code it
aimed at was gone.

🔴 **What the retirement costs, said plainly.** The per-stroke contrast statistic is not being
rebuilt — owner decision, 2026-09-02, because inventing a statistic after seeing the art it will
judge is the post-data selection this phase kept catching. M74 is the row that used to sweep the live
44–48 CSS px band. With it retired, **the readability of the six glyphs across that band has no
automated cover at all.** 12.14 rests on `ui-ux-tester` and a hands-on pass, which is what that
criterion always required and never had.

**How the runs were driven.** From the shell, never from a Node parent. Each run reported
`suites / tests / passed / failed` positively from the JSON reporter, with a zero-test run called out
explicitly rather than read as a pass — the lowercase-drive-letter defect below is why. Byte
mutations were verified applied by *"content changed"* (a SHA-256 over all twelve PNGs, plus
`git status` naming the modified files) **and** by the named pixel statistic moving; reverted with
`git checkout --`, and the revert confirmed by the tree hash returning to its original value with
`git status` reporting the files clean. M104, a source edit, used the occurrence count directly:
applied when `face.setAlpha(PLATE_ALPHA);` dropped **1 → 0** with the file changed, reverted when it
returned to **1**.

### The row count

⚠️ **This log and `HANDOFF.md` both said the matrix carried 92 rows. It carried 103, and carries
122 today.** 93 of the original ids were plain numeric, which is the likely source of the off-by-one; the
rest is simply a figure nobody re-derived. `M52`, `M82`, `M95` and `M96` are absent — **`M82` is
retired and must not be reused** — and the tail is not id-sorted (`M79` before `M78`, `M94` after
`M98`). A criterion whose content is *"every row reds at least one named gate"* cannot be checked
against a count of the rows that is wrong, which is why this is recorded rather than quietly fixed.

⚠️ **And the figure moved again inside this session**, which is the point: it was written as 109 while
M105–M110 were being added and had to be corrected twice. A count in prose is a fact with an expiry
date and no test — the same thing `file-size.test.ts`'s docstring says about a line count in a
comment. It is quoted here because 12.19's own wording forces someone to know it, not because it is
trustworthy.

