[← Phase 12 QA log index](phase-12-touch.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-12-touch.md)

---

## The agent gate — twelve briefs, and what they cost

Six agent-owned criteria, **two briefs each** *(A7)*, brief 1's findings withheld from brief 2. Every
finding is applied below or recorded with a reason. Nothing was silently dropped *(C11)*.

⚠️ **Every agent claim below was re-verified locally before being acted on.** *A subagent's summary is
a claim, not evidence.*

### 12.4 — the merge (`qa-expert`)

🔴 **`walkHeld: false` survived every gate in the repository.** Brief 2 built the mutation and traced
it: `npm test`, `npm run test:e2e`, `npm run build` and `verify-dist` all green. SHIFT is a shipped
control `gameDev.ts` advertises on the help banner, `walkMax / runMax` is **0.400** — a 60 % speed
change — and the mutation also makes the `walk` player state unreachable via `tick.ts`, which makes
`brass-courier/walk` dead art.

Verified locally: nothing in the repo executed `sampleHeldKeys`. The two files naming `gameInput.ts`
read it as **source text**; `input-merge.test.ts` deliberately does not import it (and says why); no
e2e spec anywhere presses Shift. **Applied** — `readHeldKeys` is now in the engine-free half with a
parametrised gate over all four fields, plus a case asserting each field reads its own list. M18 and
M18b both red.

**Recorded, not applied:**

- **`input$` is early-bound while its two siblings are providers.** Correct today, because
  `this.input$ = createSnapshot()` runs once in `create()` before the binding is built — but a future
  respawn that reassigns the field would kill touch jump and attack while touch movement kept
  working, because movement travels the late-bound path. *Reason: changing it is a design change to a
  Codex-approved binding shape, not a defect repair.*
- **`left` is never pressed in any e2e spec**; `attack` and `pause` are only tapped to assert they do
  nothing. *Reason: the chain is proved behaviourally for `right` and `jump`; two more contact specs
  are worth adding but are not what makes 12.4 true.*
- **No gate catches a TYPE-ONLY Phaser import in `src/scenes/inputMerge.ts`.** `test:sim-isolated`
  runs no `tsc`, and esbuild erases `import type` before resolution. A **value** import does red it.
  *Reason: the narrower invariant is genuinely enforced; the wider one is convention, and saying so
  is the fix.*

### 12.5 — contact identity (`qa-expert`)

🔴 **Three of the four Game-scene lifecycle registrations were unasserted.** The gate said
`toContain(SCENE_PAUSE)`. Verified locally with a repo-wide grep: `SCENE_SLEEP`, `SCENE_SHUTDOWN` and
`SCENE_DESTROY` appeared in no test outside `engine-literals.test.ts`, which pins the *string value*
and not the *subscription*. The teardown gate does not backstop it — it asserts the array reaches
length 0, and the fake's `off` is a silent no-op for a name never registered, so three registrations
and four removals still end at zero. **Applied**: an exact-set assertion. M19 reds it 2/29.

🔴 **Seven of the nine subscriptions were asserted by name only.** Only `POINTER_UP` and `BLUR` were
ever invoked by a test. Wiring the right event name to the wrong handler — the ordinary copy-paste
error in a block of five near-identical `on()` calls — passed everything. `fireGameSceneEvent`
already existed in the harness and was called by **nothing**. **Applied**: six loss paths are now
fired and observed, plus `POINTER_UP_OUTSIDE`, a different branch of Phaser's release dispatch that
had never been driven at all. M20 reds it.

**Recorded, not applied:**

- 🔴 **`GAME_OUT` drops EVERY contact, and on a pillarboxed phone a thumb drifting a few millimetres
  past the canvas edge fires it.** `InputManager.onTouchMove` runs `document.elementFromPoint` per
  finger per move and calls `setCanvasOut` when the topmost element is not the canvas — so the jump
  the *other* hand is holding is cancelled. The brief's fix is to delete the subscription, since a
  finger leaving the canvas still delivers `touchend` and `POINTER_UP` clears it per pointer. **This
  is persuasive and it is the owner's call**: `GAME_OUT` is named in criterion 12.5's own text, and
  narrowing an approved criterion is a STOP-and-ask. Flagged in place at the subscription.
- **The cancel-before-disable rationale is factually wrong about Phaser.** Three files say
  `disableInteractive()` removes the object from `_over`, *"which suppresses the later object-level
  release"*. `processUpEvents` hit-tests into `_temp`, never `_over`, and emits `POINTER_UP`
  unconditionally. The ORDER is still correct and worth keeping; the reason given for it is not the
  real one. *Reason: a prose correction across three files, recorded here so it is not lost.*
- **`POINTER_UP_OUTSIDE` is unreachable for touch.** `Pointer.touchend` sets `upElement` to the
  element the touch STARTED on, which is always the canvas. Live only for a mouse on a hybrid laptop.
- **`bind()` silently disowns a finger that is still down.** A player who held RIGHT through the exit
  starts the next level standing still until they lift and re-press. *Reason: a design decision —
  keep contacts across a rebind, or not — rather than a defect.*
- **`UIScene` tears down on SHUTDOWN only, and `Systems.destroy()` never emits SHUTDOWN.** Reachable
  only at page teardown today. *Reason: latent; the one-line `DESTROY` subscription belongs with the
  `GAME_OUT` decision above.*

### 12.9 — target size (`accessibility-tester`)

🔴 **BLOCKER, applied. The menu rows were under the floor on every real phone in landscape, with no
prompt.** Two target sets had two different thresholds — a 160 px control needs a scale of 0.275, a
128 px row needs 0.344 — and *everything* that asked "are the targets big enough" asked it about the
controls. Between those two numbers the rows were under-floor, fully interactive and unannounced.

| posture | viewport | scale | row |
|---|---|---|---|
| iPhone SE landscape, the number the spec tested | 667x375 | 0.3472 | 44.4 ✅ |
| iPhone SE landscape, **Safari's real viewport** | 540x365 | 0.3009 | **38.5 ❌** |
| Pixel 7 landscape, **Chrome's real viewport** | 892x356 | 0.3296 | **42.2 ❌** |

`page.setViewportSize()` hands the test the whole screen. A real browser keeps a URL bar, and
`index.html`'s `#game { height: 100% }` means the page never scrolls, so **that bar never collapses**
— the reduced viewport is permanent, not transient. The old margin was **0.44 CSS px, 1.0 %**.

**Applied, both halves.** `TOUCH_MENU_ROW_H_PX` is now `TOUCH_BOX_PX`, so the two target sets share
one threshold by construction and the blind band cannot exist; the band's margins pay for it — five
rows at 160 plus four gaps at 32 is 928 of the 930 that 90 and 60 leave. And `attachTapRoutes` runs
`rotatePromptWanted` — which weighs its own targets **as well as** the play controls. Three
chrome-reduced viewports are now in the matrix.

⚠️ **An earlier version of this paragraph claimed the 200 % browser-zoom title case was repaired by
gating on the route's own targets alone. It was not, and the claim is withdrawn.** That version
re-opened the tap-through the round-1 BLOCKER named; the two-term predicate is what shipped, and it
still blocks a large title zone whenever the play controls would be too small. That is deliberate
— see § 12.10 — but it is not what the sentence said.

Also applied: the locked-row ink (**2.64:1** at 11.8 CSS px — and four of five rows are locked on
first launch, with the word `locked`, the only thing explaining why a tap does nothing, in the ink
the player cannot read), and the hint line (7.6 CSS px, naming UP / DOWN / ENTER to a reader with no
keyboard).

**Recorded, not applied:**

- 🔴 **WCAG 1.3.4 Orientation (AA): the rotate prompt has no override.** A user with rotation lock on,
  a mounted device, or who simply cannot rotate, has no path into the game. 1.3.4 permits a single
  orientation only where it is **essential**, and that determination has to be *made and recorded*.
  **This log is that record**: a 160 px control is **32.5 CSS px** at 390x844, the canvas is 219 px
  tall, and no button size fixes it — a thumb-sized control would eat a third of the visible game. The
  claim is that landscape is essential for this game. It is the owner's to accept or reject.
- **Split-screen and Slide Over are landscape and still say "rotate your device".** iPad 1/3 Split
  View is 375x834 at scale 0.195; the remedy is to resize the window, which the copy never mentions.
  *Reason: real, a one-line copy branch, and outside the phone/tablet postures the phase scoped.*
- **Four constants are shared between production and the assertion** — `TOUCH_MIN_CSS_PX`,
  `TOUCH_MIN_GAP_CSS_PX`, `GAME_WIDTH`, `GAME_HEIGHT`. The measurement itself is genuinely
  non-circular (bounds off the live display list, denominator off `getBoundingClientRect`), but
  editing `44` to `20` would make production and the gate permissive together. *Reason: this wants a
  prose-pin like `tuning-prose.test.ts`, not an invention at the end of a gate.*
- **`measuredTargets` assumes origin (0,0) and unit scale rather than reading `getBounds()`.** True
  today because every zone sets it; the criterion's own word is "bounds".
- **The gap floor is unreachable in production.** It turns over at scale 0.250, always below the size
  floor of 0.275, so `touchTargetsFit`'s second loop can never be the failing term for the shipped
  layout. Asserted, never binding.
- **Android's 48 dp guideline is stricter than the cited 44 px**, and `Pixel 7 landscape` is in the
  matrix. At the new 160 px row height every in-scope Android posture clears 48 dp.
- **`TOUCH_EDGE_PX` is 22.2 CSS px, inside the iOS home-indicator and Android gesture-nav strip.**
  Untested and unrecorded until now. *Reason: needs a real device — it is 12.13's and 12.24's.*

### 12.11 — the frame budget (`performance-engineer`)

✅ **The replacement is BUILT and green in both directions, 2026-08-31.** What follows first is the
analysis that condemned the original statistic — kept, because it is the reasoning the replacement
rests on — and then what replaced it and the three corrections the runs forced.

🔴 **The original statistic was NOT MET, and the reason is the statistic.** Both briefs reached it
independently.

At 240 Hz the frame period is 4.1667 ms. A frame either makes its deadline or costs a whole period,
so served rate is `R / (1 + p)` and red at 0.9 needs **p ≥ 11.1 %**. A *constant* per-frame cost —
which is exactly what extra display-list entries are — never produces a partial `p`: below the
headroom the ratio is **1.000**, above it **0.500**, and nothing lands between. The 10 % bound is
therefore never load-bearing; 0.60, 0.75 and 0.95 would all behave identically.

| substrate | frame budget | 2.7 ms is | the gate says |
|---|---|---|---|
| this box, 240 Hz RTX 4080 | 4.167 ms | 65 % of it | 100.0 % |
| the owner's 60 Hz laptop | 16.667 ms | 16 % of it | 100.0 % |
| a mid-range phone | 16.667 ms | a drop to ~30 fps | 100.0 % |

That is *owner plays on 60 Hz, dev box is 240* in its exact recorded form. **The mutation matrix has
no row that injects a per-frame cost and watches this bound go red, and on this analysis none could.**

**Applied** — three real defects in the surrounding gate, each verified locally:

- `assertRealGpu` had **two sentinels that both passed**: `'no-webgl-context'` (Phaser fell back to
  the CPU Canvas renderer, the exact case the helper exists to refuse) and
  `'no-debug-renderer-info'`. Neither contains any of the four software-renderer substrings.
- The precondition asserted **zones, not faces**. A `Zone` renders nothing, so deleting the
  `setVisible(wanted)` loop leaves five interactive zones, a passing precondition, and an arm drawing
  zero extra pixels — the criterion's own named failure mode passing its own guard.
- The ratio had **no absolute floor**. Halve the frame rate in both arms and it stays 1.0. This is
  Phase 7's G32 finding: `audioCues` left in both arms moved each median 2 ms and the delta stayed
  0.000.

**The replacement is named, not invented**: `tests/e2e/gpuTimer.ts`'s `installGpuTimer` with a paired
**absolute** per-frame delta in milliseconds against a 16.667 ms budget — the shape of
`phase-08-gpu-delta.spec.ts`, which was red-proved on a held-out set. Not built this session, because
choosing its bound needs a selection set and a held-out set and neither exists yet.

**Recorded:** the two arms **share a GPU** — both contexts stay alive and rendering, and Playwright
ships `--disable-backgrounding-occluded-windows` — so system load is `2·base + C` in both samples and
a GPU-bound cost divides out exactly. The arms are interleaved but **not counterbalanced**: window
z-order and focus are fixed and perfectly correlated with arm. And the controls **ship only to touch
devices**, so this gate runs on the one platform the feature is absent from; there is no mobile
timing evidence anywhere in this repo.

#### ✅ What replaced it, and the three things the runs corrected

The criterion-bearing statistics are now **absolute paired per-frame deltas in milliseconds**, GPU
and main thread, in `tests/e2e/touchPerf.ts`, fixed as a policy before any selection run:
`MAX_TOUCH_GPU_DELTA_MS` and `MAX_TOUCH_CPU_DELTA_MS` at **0.5** (3 % of the 60 Hz budget, and the
figure Phase 8 fixed for `MAX_LEVEL_GPU_DELTA_MS`), `MAX_TOUCH_ARM_GPU_MS` and
`MAX_TOUCH_ARM_CPU_MS` at **8** as absolute per-arm ceilings a delta structurally cannot give.
`sampleArm` stops the idle page's game loop and **asserts its tick frozen** across the window, so the
shared-GPU cancellation is observed rather than commanded. The frames-served ratio and the baseline
floor are kept, not swapped out.

**Three corrections, none of which reading the code would have produced:**

| # | what a run showed | the fix |
|---|---|---|
| 1 | every GPU pair NEGATIVE — the touch arm cheaper than the bare one, backwards for an arm drawing six extra faces | `helpLine()` prints ~130 glyphs of 44 px bold text on a keyboard device and ~35 on a touch one. *An A/B toggle bounds only what differs between the arms*, and a genuine +0.5 ms regression would have landed at +0.35 ms and passed. `hideTexts` equalises it — and the first version swept only `UI` while `gameHud.ts:79` builds the banner against **`Game`**, which moved the median -0.119 → -0.107 and was the tell |
| 2 | the red proof could not go red | 40 copies per control moved the delta **0.0563 ms** against a 0.5 ms bound. 800 read 0.706 ms isolated and **0.5007 ms** inside the full sweep — a coin flip, not a proof. **2000**: 1.795 ms, every pair over 1.35 |
| 3 | the held-out sweep FALSE-REDDED the per-pair CPU bound | one pair read exactly **-0.5000 ms** (failing on float dust, `0.5000000238414941`) while the median of the same four read -0.1000. `workMedianMs` is a median over Chrome's 0.1 ms `performance.now()` grid of a quantity that is itself 0.8-0.9 ms, so ±0.5 per pair is ±5 quanta of nine. The criterion-bearing claim moved to the median, and the main thread is **`median-only`** — GPU stays `median-and-pairs`, whose per-pair spread is ±0.2 against a 0.5 bound. ⚠️ The per-pair check first became `MAX_TOUCH_CPU_PAIR_MS = 2`, a "collapse guard" that **could not detect a collapse**: the arms measure 0.8-0.9 ms, so an arm falling to zero yields ~0.9 ms and passes comfortably. It is gone, replaced by `MIN_TOUCH_ARM_CPU_MS`, an absolute floor on each arm's own median — red-proved by **M75** |

#### 🔴 What the gate can actually resolve, measured rather than assumed

After `hideTexts`, both arms' display lists were dumped and diffed: they differ by **exactly the six
control faces**, 160 × 160 at alpha 0.85, plus three objects already invisible. Nothing else. Six
such faces are ~0.5 % of a 1920 × 1080 frame, and M72 measures 4800 of them at 0.706 ms, so **the
whole feature costs on the order of 0.001 ms** against a ±0.2 ms per-pair noise floor between two
browser contexts. The residual -0.06 to -0.18 ms offset is a context-identity artefact and does not
shrink when more is equalised.

So the gate does **not** claim the controls cost under 0.5 ms — that is true by three orders of
magnitude and needs no gate. It claims no **absolute** half-millisecond regression has appeared on
the touch arm: a filter, a per-frame re-render, a full-screen overdraw, a `refresh()` moved into
`update()`. That is the class of defect 12.11 is about, and it is now written into the spec header
rather than implied.

#### The `performance-engineer` briefs, round 2 *(A7)*

Two briefs, brief 1's findings withheld from brief 2.

**Brief 1 — checklist. Four findings, all applied:**

1. 🔴 **`MAX_TOUCH_CPU_DELTA_MS` had never been watched failing.** The GPU red proof amplifies fill
   rate and asserts only `gpuDelta`; nothing drove the main-thread delta across its bound, so the
   statistic called criterion-bearing rested on prose. *A gate that cannot go red is decoration* —
   and this phase had already shipped that shape twice, at 40 face copies and at a per-pair CPU band
   its own noise saturated. **Applied: M73**, `phase-12-perf-cpu-delta.spec.ts`, which runs the
   controls' **own** `TouchSession.refresh()` `REFRESH_COPIES` extra times per frame. That is the
   exact regression `touchPerf.ts` names, not a busy loop — a stand-in proves the timer sees
   wall-clock work, the mistake Phase 8 paid for with 240 scrims.
2. 🔴 **No absolute ceiling on either arm's own main-thread median** — the CPU twin of
   `MAX_TOUCH_ARM_GPU_MS`, missing. A cost added to *both* arms divides out of a delta (Phase 7's
   G32). **Applied: `MAX_TOUCH_ARM_CPU_MS = 8`**, the figure `perfBudget.ts:179` fixed for
   `MAX_FLEET_WORK_MS` for the same job.
3. **This § was stale** — it still read NOT MET and described the replacement as unbuilt. **Applied**
   (this rewrite).
4. **The spec header said the controls are "ten DRAWN objects"** while the same file's measured
   display-list diff says six. **Applied.**

Brief 1 also recorded, as sound: the M72 proof runs the identical instrument rather than a cheaper
one; the bounds are pre-registered; the isolation is observed and not merely commanded; every
precondition is asserted per arm per pair; the routing is pinned by name; AB/BA is correct for an
even `PAIRS`.

### 12.14 — readability (`ui-ux-tester`)

#### ✅ The re-shoot, and the five corrections that preceded it

**Every figure this row has ever carried was wrong until the one it carries now, and review caught
all five.** Kept because the sequence is the lesson, not the number:

| round | the claim | why it was false |
|---|---|---|
| 8 | 3.47:1 over the WHOLE FACE | `walk` passed on a decorative highlight while its own bars measured **1.12:1** |
| 9 | 3.64:1 on the mark | measured on 160 px SOURCE TEXELS; at the 48 CSS px the smallest viewport presents, the 1 px keyline averaged away and the marks fell to **1.63–2.85:1** |
| 10 | — | the gate rolled its OWN box filter, partitioning the source differently from `resize.mjs`; it measures through the shared `downscale` now |
| 11 | 3.32:1 | the mark mask was discovered from the SHIPPED file, so erasing the engraving and leaving two ink cells standing shrank the mask with the damage and still scored 3.09:1. It comes from the committed cut face now (M60 red 3/8) |
| 13 | 3.32:1 for every stroke | the strokes were labelled on the FINISHED mask, so the halo merged the strokes it was meant to separate. Splitting by pre-halo seeds isolated four fragments of `attack`'s shading, the smallest at **2.86:1** (M67 red 1/1) |

Round 13's split is what found a shortfall in the **art** rather than in a gate, and the owner chose
the re-shoot over accepting it. The cause was the prompt — the plate asks for a glyph *"deeply cut
and filled with dark shadow"*, and that shading is what fragments. Take 4 asked for a flat glyph and
got a **hollow outlined** wrench: nine strokes, five under 3:1, the worst a two-cell fragment at
**1.008:1**. Take 5 states the fill positively and produces **three** strokes, all at 3.318:1 /
3.846:1. `docs/generations/phase-12-touch-plate.md` carries both `request_id`s and the full request
contract; $0.75 of the $5 touch-UI ceiling.

⚠️ **`KNOWN_SHORTFALL` was deleted BEFORE the candidate was adopted.** Its 2.8 floor would otherwise
have let a 2.81 candidate pass the very gate that exists to decide whether the re-shoot worked.

⚠️ **And the candidate was judged by the REAL battery, not a staged copy of part of it.** The plan
called for a re-implemented validator against a temp directory; `shipped-touch.test.ts` enforces the
two-sided alpha band, exact ink reproduction and six-way distinctness besides the contrast sweep, and
a re-implemented subset would have validated the candidate against a different claim. The candidate
was adopted into a committed tree and run through the whole suite, with `git checkout` as an exact
rollback. **Exactly two files changed**; the other five faces are byte-identical, and `--adopt` still
reproduces all six byte for byte because `TOUCH_CELL_SOURCES` records the new source.

#### 🔴 The `ui-ux-tester` briefs, and why 12.14 is still NOT MET *(A7)*

Two briefs on the re-shot faces, brief 1's findings withheld from brief 2. **They disagreed on the
first question, and the disagreement was resolved by looking**, not by preferring a brief: brief 1
called the new wrench a clean family match; brief 2 called it visibly bolder. Brief 2 is right —
`touch-jump` and `touch-pause` draw **hollow outlined** glyphs with a cream interior, and
`touch-attack` now draws a **solid filled** silhouette. *A subagent's summary is a claim, not
evidence*, and that applies to the agreeable one too.

**Verdict: 12.14 remains NOT MET.** Contrast is green and unconditional; readability is not.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **`pause` draws a cog and `walk` draws two stacked bars.** A cog is the universal glyph for *settings*; two bars evoke nothing about locomotion. Neither says its action at any size, so this is not a size problem contrast could ever have caught. **Both briefs found this independently** | **RECORDED, owner decision.** Two more single-cell re-shoots, $0.30, taking the touch-UI figure to $1.05 of $5. Outside the wrench-only scope authorised on 2026-08-31 |
| 2 | 🔴 **The gate measures 48 CSS px; controls go live at 44.** `TRUE_SIZE_PX` is `160 × 325 / 1080 = 48`, from two real-browser measurements, but `touchTargetsFit` shows and enables a control down to `TOUCH_MIN_CSS_PX = 44` and the hit box IS the face box (`touchLayout.ts:156`). The 44-48 px band is reachable and has never been measured — and round 9 recorded contrast falling from 3.32:1 to 1.63-2.85:1 over a few output pixels | 🔴 **MEASURED, and it FAILS. See below.** |
| 3 | The re-shot wrench is a **solid fill** where the other five are **outlines** — the direct consequence of `FLAT_GLYPH`, and nothing gates stroke weight across the set | **RECORDED, owner decision.** At 48 px a filled shape reads *better* than an outline, so this trades set coherence for legibility. Verified by eye on the shipped bytes |
| 4 | `left` and `right` are mirror-image triangles a thumb-width apart — the only pair distinguished by orientation alone | **RECORDED, not fixed.** Position disambiguates them (bottom-left pair) and no brief called it a blocker |
| 5 | The sweep is over a **flat** grey ramp, per 1.4.11's own solid-colour model, while STYLE.md mandates dense dithered detail behind every plate, and M21 found 175/878 sampled positions with a hazard, enemy or goal under a control | **RECORDED.** WCAG's model is flat; a per-pixel-noise statistic is not defined by the standard being cited |
| 6 | The box-filter proxy's error probably runs **optimistic**: production hands a >3× downscale of the whole canvas to the browser at `image-rendering: auto`, which some mobile GPUs do more cheaply than a box average, and the pale keyline halo carrying most of the measured contrast is what would alias away | **RECORDED, and the label sharpened.** The proxy label already existed; what it did not say is which direction the error runs |

⚠️ **Findings 1, 3 and 6 are recorded rather than applied, and each needs an owner call, not a
patch.** Findings 4 and 5 are recorded as accepted. Finding 2 was measured rather than argued.

##### 🔴 Finding 2, measured: at the real live floor the art does NOT clear 3:1

`TRUE_SIZE_PX` was set to **44** and the shipped battery re-run against the shipped bytes:

```
AssertionError: stroke 1 of touch-pause at alpha 0.85 reaches only 2.91:1 at 44 CSS px
```

So the gate's 48 px figure is not the worst reachable case, and at the worst reachable case one
stroke of `touch-pause` is **2.91:1** against 1.4.11's 3:1. The 48 comes from `160 × 325 / 1080`,
iPhone SE landscape as Safari gives it; `touchTargetsFit` shows and enables a control down to
`TOUCH_MIN_CSS_PX = 44`, and the hit box **is** the face box (`touchLayout.ts:156`), so any browser
whose chrome is taller than Safari's — none of which has been surveyed — lands in a live band the
contrast gate has never measured.

⚠️ **The probe was run on a committed tree and reverted with `git checkout`; `TRUE_SIZE_PX` is
unchanged in the shipped test.** Nothing here was greened by moving a number.

**Three options, and this is an owner call because two of them change shipped behaviour:**

| | what it does | cost |
|---|---|---|
| **A — raise `TOUCH_MIN_CSS_PX` to 48** *(recommended)* | no control is ever live below 48, so the gate's existing measurement becomes the worst case and the criterion's sentence becomes true as written. Still ≥ 44, so **12.9 is unaffected**, and 48 is Android's own dp guideline, which this log already records as stricter than the 44 cited | a device between 44 and 48 CSS px gets the rotate prompt instead of controls it can barely hit — which is what the prompt is for |
| **B — re-shoot `touch-pause` for a heavier mark** | fixes the art rather than the threshold, and would fold into the `pause`-glyph re-shoot finding 1 already asks for | $0.15, and it fixes one face while leaving the band unmeasured for the other five |
| **C — measure at 44 and record the shortfall** | most honest about what is known | leaves a WCAG 1.4.11 failure shipping, and re-introduces the exception table that was just deleted |

Until one is taken, **12.14 is NOT MET on the measurable half as well as the judgement half.**


#### 🔴 The `ui-ux-tester` briefs, ROUND 2 — and the finding that reddened a green gate

Two more briefs *(A7)* against takes 5-7, brief 1's findings withheld from brief 2. Both reached the
pause finding independently, and brief 2 found something no one had looked for.

| # | finding | disposition |
|---|---|---|
| 1 | 🔴 **The pause bars were the universal mark for "this suspends play", and the button does not.** `touchControlsLayer.ts:381` routes it to `openLevelSelect()` — a hard scene teardown that abandons the run, no confirmation, no checkpoint. *Both briefs, independently.* The cogwheel was vaguely wrong; the bars were **confidently** wrong, which is worse | **APPLIED, owner decision.** Take 9: a 2 x 2 grid of squares, which says *the level menu* — where the button actually goes |
| 2 | 🔴 **`downscale` is not monotonic in output size, so pinning one size proved one point of a band.** Destination cells are `Math.floor`-partitioned (`resize.mjs:44-49`), so at `160/44 = 3.636` some cells average three source pixels and some four, and that alias pattern shifts between adjacent target sizes | **APPLIED, and it reddened the gate on its first run.** Swept, `touch-attack` stroke 2 read **2.740:1 at 47 CSS px** between two sizes that both read 3.318:1. `LIVE_SIZES_PX = [44..48]`, worst taken |
| 3 | `TRUE_SIZE_PX = TOUCH_MIN_CSS_PX` means a future lowering of the production floor silently re-founds the contrast claim at a smaller, unreviewed size | **RECORDED, not applied.** *Reason: this wants a prose-pin like `tuning-prose.test.ts`, which is the same repair § 12.9's four-shared-constants finding is already waiting on — one pin for both, not two inventions* |
| 4 | The set is mixed solid-fill and outline, and the heaviest mark is now on the most consequential button | **RECORDED, owner decision.** Widened from the `attack`-only note |
| 5 | A boot names *feet*, not a walk/run **toggle** | **RECORDED.** *Reason: no conventional glyph distinguishes a gait toggle from locomotion; the lit/unlit plate carries the state* |
| 6 | Pressed feedback is alpha-only and happens under the thumb | **RECORDED.** *Reason: a cue outside the box bounds is a layout change, not an art one* |

