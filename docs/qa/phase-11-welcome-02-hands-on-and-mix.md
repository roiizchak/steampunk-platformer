[← Phase 11 QA log index](phase-11-welcome.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-11-welcome.md)

## 11.12 — the contrast floor, and what the two briefs found

Two briefs *(A7)*, brief 1's findings withheld from brief 2. **Both flagged the audio hint
independently**, which is the strongest signal a brief pair can give.

- **The hint line failed WCAG at 3.13:1** against a 4.5:1 bar. Verified locally with a Rec-709 /
  WCAG relative-luminance script before anything was edited — a brief's summary is a claim, not
  evidence. Lightened `#8f8776` → `#bab19c`, **5.24:1**, keeping a clear step below `CHOICE_FILL`
  so the hierarchy survives the repair.
- The subtitle was marginal at 4.84:1 and went to **6.10:1** in the same pass.
- **The screen advertised a control it did not show the value of.** Nothing in the game displays the
  volume, and at the shipped default of `volume: 1` the first press of `]` clamps and does nothing.
  A player who tries the key this screen just taught them cannot tell "already at maximum" from
  "still broken" — which is exactly the reading the owner reported. `audioHint(muted, volume)`
  renders the live value, and lives in the engine-free module so a unit test can drive it rather
  than a source-text gate proving only that something named `audioHint` is called.

The fills moved to `src/render/titleInk.ts` so the sweep can run with Phaser uninstalled, and the
gate derives each ink's bar from its size rather than assuming all four are small text — the 72 px
heading draws at 31.9 CSS px, through the 24 px large-text door. That correction came from the gate
going red on its own first run.

🔴 **The visual half of this criterion is UNRUN against what ships.** Both briefs looked at a
flat scrim with four lines of text on it. The owner replaced that design on 2026-08-29, and the
contrast numbers carried forward only because the band keeps the same `SCRIM_COLOUR` / `SCRIM_ALPHA`
composite the sweep measures — which is now asserted rather than assumed, by the geometry gate in
`tests/unit/title-drawpath.test.ts`. Layout, hierarchy and readability at 1920×1080 and on resize
need re-running against the shipped screen.

## 11.14 — the adversarial code review of the diff

Two briefs *(A7)*. What they found, each cited in place in the code it changed:

- **`attachTitle` had three branches and no unit test at all**, and `resetTitleLatch` carried the
  docstring *"Test seam: reset the page-lifetime latch"* while nothing imported it. A seam with no
  consumer is the same defect as a decision function with no consumer. `TITLE_KEY` moved to
  `gameTitle.ts` so the module takes Phaser as a type only and runs end to end against a fake — the
  `enemy-feedback.test.ts` idiom, the stronger of the two draw-path shapes.
- **Two keys in one input batch reach `dismiss` twice**, found by reading the engine rather than the
  diff: Phaser drains its whole key queue in a single `KeyboardPlugin.update()` pass. Closed with a
  latch. (That latch has since lost its observable failure — see § The `dismissed` latch.)
- **The title's own `event.repeat` guard was untested.** Every test in `phase-11-audio-keys.spec.ts`
  runs after `bootToGame`, which dismisses the title, so all of them exercise the GAME listener;
  deleting the title's guard left the whole suite green.
- **`prodTitle.ts` contained two docstrings contradicting each other** about which frame is asserted
  first. The code was right and the prose was wrong — corrected rather than the other way round.

## 11.2 hands-on — the owner's own keyboard, 2026-08-29

**The criterion is closed, by the only evidence that could ever close it.** The owner played the
game and confirmed the volume keys respond **on both the Hebrew and the English layout**, in their
own words: *"I tested the game and see if it's working, and here I check that volume buttons is
working. in hebrew and English."*

🔴 **This is what the whole phase was for, and no gate in this repository could have produced it.**
The dispatch defect was invisible to the suite because `tests/e2e/phase-07-audio.spec.ts` already
pressed `BracketLeft` and passed — on a US layout, through the very `keyCode` path that was broken
everywhere else. A green suite and a broken game, for the same reason the vault records under
*(C4)*: an automated pass proves the path the harness drives, not the path the player drives.

It also confirms the **root cause** rather than merely the symptom. The fix moved dispatch from
`event.keyCode` — layout-dependent for punctuation, stable for letters, which is exactly the split
the owner originally reported — to `event.code`, a physical key position. A fix aimed at the wrong
cause could have made the keys work on one layout; working on **both** is the discriminating
observation.

## 🔴 The game is too quiet — measured, 2026-08-29

The owner set the volume to 50 % and reported: *"my speaker set is not very audible. I can barely
hear it unless I put my speaker set to 100%."* That is criterion 11.4's audible half, and it
**fails**. It is not a preference — the numbers say so.

### The measurement, end to end from shipped artifacts

`ffmpeg -af volumedetect` on the two masters, and the gains committed in `public/assets/index.json`:

| | content RMS | shipped gain | = heard at master 1.0 |
|---|---|---|---|
| `bed-music` | −24.6 dBFS | 0.0632 (−24.0 dB) | **−48.6 dBFS RMS** |
| `bed-ambience` | −19.2 dBFS | 0.0502 (−26.0 dB) | **−45.2 dBFS RMS** |
| both together | | | **≈ −43.6 dBFS RMS** |

At the master 0.5 the owner tested, another −6 dB: **≈ −49.6 dBFS RMS**. Games and music master to
roughly **−16 to −20 dBFS RMS**. The constant background of this game is about **25 dB below normal**
— not "a little quiet", about a twentieth of normal amplitude. Needing the speakers at 100 % is
exactly what these figures predict.

### Where it comes from, and the hypothesis that measurement KILLED

Two compounding attenuations: the mix weights put the beds 13 and 15 dB down *(a defensible design
decision — they are the only always-on sources)*, and the solved headroom scalar takes ~11 dB off
**everything** so that `WORST_CASE_STACK` — ten one-shots plus both beds, all starting on the same
frame — lands at −3 dBFS.

⚠️ **The obvious suspect was wrong, and re-solving proved it rather than arguing it.** The beds are
modelled in that stack as a **constant block at full scale** for the stack's whole length, which
`build-audio.mjs` itself flags as an over-statement. It looked like the beds were being punished by a
pessimism about themselves. They are not: re-solving with the beds at their measured peak, and again
at their measured RMS, moves the headroom by only **~0.7 dB**. The one-shots dominate the stack.

🔴 **The real cause is that the mix is normalised to a peak nobody ever hears.** Ten one-shots
aligned on one frame is a moment that does not occur in play; every real listening moment sits 10–20
dB below it, and the whole game is attenuated to protect it.

### Not fixed here, and why

The fix changes `MIX_DB` / `TARGET_STACK_DBFS` / `WORST_CASE_STACK` in `tools/gen/build-audio.mjs`,
re-solves every gain in the shipped `index.json`, and moves the number **criterion 7.2** was measured
against. That is a measured, gated decision from Phase 7 and it is outside Phase 11's scope, so it is
a **STOP-and-ask**, not a repair to slip in beside a keyboard fix.

⚠️ **A reproduction of the solver does NOT currently reproduce the shipped gains** — it computes
`bed-music` at 0.1089 against the shipped 0.0632. The difference is almost certainly the trim and
fade `build-audio` applies before it measures peaks, which the reproduction skips. **The table above
does not depend on the reproduction**: it is measured from the shipped `.ogg` files and the committed
gains. But any fix must start by making the solver reproducible, or it will be tuning a number it
cannot predict.

## The mix repair — 2026-08-29

✅ **Fixed, and the fix is a unit correction rather than a tuning.** Full derivation in
`tools/gen/build-audio.mjs` under `BED_MAKEUP_DB`; the short version:

`MIX_DB` is documented as *"relative loudness per cue, in dB"*. For the ten WAV cues it multiplies a
**peak-normalised** signal. For the two OGG beds `decodeWav` cannot read the file, `normalise` falls
back to **1**, and the weight multiplies whatever level the master happens to sit at. One column, two
meanings — and the beds have a measured **19 dB crest factor**, so a `-13` landed about 19 dB lower
than the same number does on a one-shot. The table said 13 and 15 down; they were 32 and 34 down.

### Two hypotheses died to measurement before the third survived

| tried | worth | verdict |
|---|---|---|
| shrink `WORST_CASE_STACK` 9 cues → 6 | **+1.7 dB** | not the cause — the one-shots dominate |
| peak-normalise the beds (the obvious repair) | **+5.5 / +0.0 dB** | not enough, and it is the CEILING: with a 19 dB crest a bed cannot reach a normal RMS by peak-normalising at all |
| mix beds by RMS, one-shots by peak | **+12.05 dB** | shipped |

The beds can afford the lift and the one-shots cannot: criterion 7.2 measured the two beds
contributing **5.4 %** of the real summed peak, with their own peaks at 96.2 s and 17.8 s into 120 s
loops — nowhere near a one-shot's onset.

⚠️ **The solver's bed model had to be repaired in the same pass.** It filled a constant block at
**full scale**, called an over-statement in the safe direction. It is not safe once the beds carry a
make-up: the blocks dominate the sum, the scalar collapses, and the make-up is paid for by
attenuating every one-shot — measured, it pulled `footstep` 0.2983 → 0.2019 and still delivered only
+8.6 dB of the +12 granted. It now fills at the measured RMS.

### The result, browser-measured

| | before | after |
|---|---|---|
| `bed-music` | −48.6 dBFS RMS | **−36.6** |
| `bed-ambience` | −45.2 dBFS RMS | **−33.2** |
| together | −43.6 | **−31.6** |
| criterion 7.2 real stack | −4.45 dBFS | **−3.33** (ceiling −1.0) |

🔴 **And the gate that let this ship is replaced, not re-bounded.** It asserted
`max(bed.gain) < min(cue.gain)` — the same unit mismatch, so it was **green for the entire time the
game was inaudible**. It now compares peak against peak, plus an RMS **floor**, because *below the
action* and *inaudible* are two different claims and the old statistic could not express the second.
Watched red both ways: at `BED_MAKEUP_DB = 0` the floor catches the shipped defect at −43.8 dBFS RMS;
at 26 the peak comparison catches beds mixed over the action.

⚠️ **My first replacement was also wrong and is recorded in the test.** It compared bed RMS to cue
peak — the same mismatch pointing the other way — and did **not** catch the loud direction: at
`BED_MAKEUP_DB = 26` the beds reached gain 1.0 and 0.91, plainly over the action, and it passed.

⚠️ **The earlier note claiming the solver is not reproducible was wrong.** Running the real
`npm run assets:audio` rewrote nothing — an empty diff. What did not reproduce was an ad-hoc script
of mine that skipped the trim and fade. The pipeline is reproducible; the reproduction was not.

## The title backdrop — variant B shipped

The owner chose **B**, the rooftop canyon (`✅ B is good`, 2026-08-29), after both plates were shown
composited under the real band. Downscaled 2752×1536 → 1920×1080 with Lanczos, shipped as
`assets/backgrounds/title.png`, catalogued as `title-backdrop`.

🔴 **The backdrop no longer moves, and the drift gate was RETIRED rather than left.** A single
plate cannot drift — it does not tile, so scrolling would expose its own edge. So
`TITLE_DRIFT_PX_PER_TICK`, the `frameClock` drain in `TitleScene.update`, and the gate pinning them
all went together, and a new gate takes the draw path that exists now: the plate is added from the
shared catalog key, sits at depth −100 between the opaque floor and the band, and follows the live
canvas size. **A gate is retired with the thing it guarded, or it becomes decoration.**

## 11.12 re-run — two fresh briefs against the SHIPPED screen

The first pair looked at a flat scrim. The owner replaced that design, so the visual half was re-run
against what actually ships: four captures at 1920×1080, 1280×720, 2560×1080 and 852×480, in
`docs/evidence/phase-11/`. Two briefs *(A7)*, launched in parallel so brief 1's findings could not
reach brief 2 — the withholding is structural, not a promise.

**Eleven findings. Five applied, four recorded, two refuted by measurement.**

### The one both briefs found independently — applied

`TITLE_ROWS` was `[0.34, 0.45, 0.61, 0.72]`: gaps of **0.11 / 0.16 / 0.11**, the middle one 45 %
wider than its neighbours. Both briefs described the same thing without either seeing the other's
report — *"reads as a visible empty band"*, *"looks like a row is missing, not like four rows spread
by hand"*. It **was** a missing row: the second choice line went when ENTER became the only way in,
and the first re-spread shrank the hole rather than closing it, under a comment claiming it had been
avoided. Brief A found the matching half: measured to the glyph box, the heading cleared the top rule
by 0.087 of the height and the hint cleared the bottom rule by **0.050**.

Now `[0.34, 0.455, 0.569, 0.683]` — equal 0.1143 gaps and equal 0.0867 optical margins, **derived**
from the four `designPx` and the band's extent rather than nudged by eye. The geometry gate proves
every glyph box still lands inside the band.

### Applied

- **The volume hint read as an empty checkbox.** `[ ] volume` rendered as two adjacent brackets with
  nothing between them — indistinguishable from a missing glyph, on the one screen that teaches the
  keys this phase exists to repair. Now `[ / ] volume`.
- **No capture at the width the code calls smallest supported.** `titleInk.ts` derives its CSS-px
  table against an 852 px window and the narrowest evidence was 1280. Captured.

### Recorded, not applied *(C11)*

- **The band's horizontal edges cut through mechanical shapes** (brief B) — the top edge through the
  coiled hose upper-right, the bottom through the boiler lower-left. B argues this is the owner's
  original complaint rotated 90°. **Not applied, and it is a judgement call rather than a
  measurement:** edges parallel to the frame read as a letterbox, which is an idiom a title card
  already implies; the rejected vertical edges had no such reading. Feathering them would also break
  the contrast sweep's premise — every glyph on a uniform `SCRIM_ALPHA` composite — at exactly the
  rows nearest the edges. **Offered to the owner rather than decided here.**
- **No pointer input** (brief B) — the screen is shaped like a clickable card and a click does
  nothing. Real, and **not cheap**: `bootToTitle` and `dismissTitle` both call
  `page.locator('canvas').click()` to focus the page before sending keys, so a `pointerdown`
  dismissal would fire on the focus click and every title spec would lose the screen before its first
  assertion. Owed forward with that constraint attached.
- **Volume-up is a no-op at the default 100 %, and the hint cannot say so** (brief B). Already an
  open item — see § The second defect. B's fix (flash "already max") is a real improvement and
  belongs with the step-size decision, not smuggled in beside it.
- **The top hairline is translucent and bright backdrop features show through it** (brief A).
  Measured: at the rule row, **67 of 1920 columns** deviate more than 30 lum from the line's mean of
  146 — and they are *brighter*, not the dark scratch the brief described. The mechanism is right and
  is deliberate: `RULE_ALPHA` 0.55 is what keeps the hairline a hairline. Left alone.

### 🔴 Refuted by measurement — a brief's summary is a claim, not evidence

- **"A flat, undetailed strip at the left edge reads as a parallax seam"** (brief A, x 0–220).
  Column-luminance standard deviation over the full height, sampled every 2 px × 6 px:
  **x 0–220 → 38.1**, x 220–440 → 24.2, x 440–660 → 31.7, x 900–1120 → 38.4, x 1700–1920 → 30.1.
  The band called featureless has the **highest** variance of the five. Not a defect.
- **"At wide aspect ratios the parallax visibly tiles and mirrors"** (brief B, rated MEDIUM-HIGH and
  called *"the single strongest piece of evidence"* against the art direction). `Scale.FIT`
  pillarboxes: in `title-2560x1080.png`, columns 0–319 and 2240–2559 hold a uniform page background
  at luminance **16.4**, and the game occupies exactly 1920 px between them — the same frame as the
  1920 capture, not a wider one. **The parallax does not extend at wider aspects at all**, so it
  cannot repeat there. The "duplicate windows and hose loops" are the building's own repeated
  architecture, present identically in the 16:9 capture.

## The redesign — 2026-08-29, and the owner's decision behind it

The first build of the welcome screen was a flat scrim with four lines of text on it. The owner
looked at it and said, verbatim: *"It's not looking good. I want to actually have a background of the
game, for example. Then I see the level menu, and then the game starts."* Four clarifying answers
settled the shape: **parallax layers only** as the backdrop (no level, no player, no HUD); **one way
in, via the menu**; a title backdrop generated on fal is wanted but **needs approval first**; and the
work **folds into Phase 11** rather than opening a phase of its own.

What that changed, and what each change cost to find:

- The backdrop rectangle sits at depth **-200**. At 0 it painted over the parallax at -100..-98 and
  the redesign was invisible in the first screenshot — the layers were there and behind an opaque
  wall.
- The panel is a **full-width band** with two brass hairlines. Inset to 0.72 of the width, its two
  vertical edges cut down through the boiler art and read as a rendering fault rather than a design.
- **`onPlay` is gone.** The menu STOPS `Game` rather than resuming it, so the callback had no caller,
  and an exported callback nobody invokes is the defect this project names for decision functions.
- **`L` is no longer a route.** ENTER, NumpadEnter and SPACE all open the menu.

### `gameHarness.dismissTitle` SKIPS the screen — deliberately, and it costs coverage

~40 specs boot through `bootToGame`. Walking the player's route there was tried and moved two things
those specs depend on: **which level loads** (the menu opens on the furthest UNLOCKED level, boot
resolves the SAVED one — `phase-08-complete` failed with `Expected "ENTER — level-02", Received
"ENTER — level-03"`) and **when the simulation starts** (`phase-09-polish` failed with camera scroll
1.15 instead of 0). Both are real behaviour changes for a player and neither is what those specs are
about, so the harness skips the screen through `__phaserGame` and says so.

🔴 **That leaves a hole, and it is closed by one spec rather than by pretending it does not exist.**
Named by the Codex implementation review of the redesign (finding 2): `LevelSelectScene.play()` could
start `level-01` unconditionally and every saved-level spec would still pass, because none of them
reaches the menu; production would pass too, because it runs a fresh profile where the furthest
unlocked level *is* level-01. `phase-11-title-routes.spec.ts` now walks the whole route with two
levels completed — so the saved level and the highlighted level differ — reads the row the menu
**drew** as selected (the `> ` marker, not the cursor field), and asserts the level that loads is that
one. Watched RED against both mutations: `play()` forced to level-01, and `paint()` marking the row
after the cursor.

### Two gates were wrong rather than the game

**`polishSeries.installRecorder` was installing inside a shake.** Three `phase-09-polish` tests
failed with *"the camera was not at its unshaken base at install"*, received 1.1507766435532787.
Instrumented rather than argued: at install `tick: 2`, `grounded: true`, `landedTick: 0` — **the
spawn is a touchdown**, it arms `SHAKE.land` for three ticks, and the recorder was landing on tick 2
of them. A race that was always there; the welcome screen only changed which side of it we land on.
The recorder now waits past `SHAKE.land.durationTicks`, derived from the table rather than written as
a number.

**`prodTitle` pressed ENTER once and expected a lit level.** All five `chromium-prod` specs failed at
ratio **0.729**. Measured against `dist/`, 5 runs, identical to twelve decimal places every time:
title **27.547**, menu **20.082**, level **60.593** — the menu is *darker* than the title, because the
title now draws art behind its band. Two presses now, with a measured **darkening** bound (0.85)
as the barrier between them, and the existing brightening bound (1.5) unchanged — the observed
level/title ratio fell 2.53 → 2.20 and still clears it, so it was left alone rather than re-tuned to a
tighter fit it does not need. Confirmed on 2 held-out full prod runs, and watched RED by deleting the
`attachTitle` call and rebuilding `dist/`: ratio came back exactly **1.0**.

### The `dismissed` latch has NO live gate, and that is recorded rather than papered over *(C11)*

The Codex review's finding 4 was that the same-batch double-dismiss test fired `L` and `ENTER`, and
`L` stopped dismissing anything when the owner made the menu the only way in — one live key and one
dead one. **Fixing it to SPACE + ENTER was not enough.** Deleting the latch left it green: the
sequence the latch was written against — `[stop Title, stop Game, start LevelSelect, stop Title,
resume Game]`, resurrecting a torn-down `Game` — **needed `onPlay`**, and a double dismiss is now
`scene.stop()` on an already-stopping `Title` plus `scene.start('LevelSelect')` twice, which restarts
the menu to the same state. Nothing observable changes.

So the latch stays as cheap defence, its docstring says plainly that it is ungated and why, and the
test keeps only the end-state claim it can actually prove. A gate that cannot go red for the defect it
names is decoration, and the fix for one is not to keep the name.

### The Codex implementation review of the redesign

Two rounds, 4 + 3 material findings, every one applied or recorded. Round 1: per-frame drift under a
`PER_TICK` name; the harness bypass's coverage hole; the contrast sweep's unguarded geometry premise;
the dead-key double-dismiss test. Round 2: the drift gate not pinning the remainder carry or the
`init` reset; the route test reading the cursor rather than the drawn marker; three comments still
describing the removed route.

`title-contrast.test.ts` reached 404 lines applying these and was split at the seam its own prose
already named — `tests/unit/title-drawpath.test.ts`.

**Owed forward:** the pre-existing `playToExit` production flake. The five owner-owned criteria are
closed, and so is the volume step size — see § The second defect.
