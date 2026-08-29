# QA log — Phase 11 (Welcome screen and volume repair)

Branch `phase-11-welcome`, off `main` at `6da76b7`. Executed 2026-08-28.

The gate table below is the record. Everything under it is the evidence for one row.

---

## Phase 11 — criterion verdicts

<!-- gate-verdicts -->
| # | Criterion | Verdict | Evidence |
|---|---|---|---|
| 11.1 | Volume failure reproduced and root cause proved by measurement | **PASS** | § 11.1. Four-trial experiment against the running page; `code` proven irrelevant and `keyCode` decisive. |
| 11.2 | The owner's own keyboard confirms the repaired keys | **UNRUN — owner-owned** | § What is NOT closed. Needs the owner at the Hebrew layout; no automated evidence can stand in *(C4)*. |
| 11.3 | Volume gate goes RED on the un-fixed code, mutation reverted | **PASS** | § 11.3. `5 failed, 1 passed` mutated; `6 passed` restored. |
| 11.4 | Both keys move the level from a 0.5 baseline and survive a reload | **PARTIAL — automated half PASS, hands-on UNRUN** | § 11.4. Persistence and both directions proven in-browser; the audible half is owner-owned. |
| 11.5 | A held key is exactly one step, Title-active and Game-active | **PASS** | § 11.5. Both arms in `phase-11-audio-keys.spec.ts` and `phase-11-welcome.spec.ts`. |
| 11.6 | `M` / `[` / `]` answer ON the welcome screen | **PARTIAL — automated PASS, hands-on UNRUN** | § 11.6. Two e2e tests green; red-proved by removing the pause. |
| 11.7 | Welcome screen appears and routes into the level menu | **PARTIAL — appearance PASS, routing hands-on UNRUN** | § What is NOT closed. |
| 11.8 | The simulation does not advance under the title | **PASS** | § 11.8. 40-frame in-page sample; red-proved by removing `pause()`. |
| 11.9 | ESC and DEV scene keys cannot leak past the title | **PASS** | § 11.9. Red-proved by the same mutation. |
| 11.10 | Title shows once per page load, incl. a restart while it is up | **PASS** | § 11.10. Three tests, including the re-pause case. |
| 11.11 | Level select still shows correct lock state and gear totals | **UNRUN — owner-owned** | § What is NOT closed. |
| 11.12 | Title readable and correctly laid out at 1920×1080 and on resize | **PASS** | Two briefs against the first design, and **two more against the shipped one** — § 11.12 and § 11.12 re-run. 11 findings: 5 applied, 4 recorded, **2 refuted by measurement**. |
| 11.13 | `sceneKey`/`ready`/`bootError` unmoved; surface still eight fields | **PASS** | § 11.13. Two e2e tests. |
| 11.14 | The diff reviewed adversarially, two briefs | **PASS** | Two briefs ran, findings applied (§ 11.14). The redesign diff on top of them went through the Codex implementation review, [reviews/phase-11-impl.md](../reviews/phase-11-impl.md) Review B. |
| 11.15 | Full e2e suite green at the expected COUNT | **PASS** | `npm run test:e2e` — **184 passed, 0 failed**, exit 0, 26.4 min. Count read positively: 183 before the redesign's new route spec, 184 after. |
| 11.16 | `npm run build` clean and `verify-dist` passes | **PASS** | `verify-dist ok: 5 level(s) and 12 audio file(s) shipped byte-identical, no DEV-only scene key or debug surface in 1 bundle(s)`. |
| 11.17 | No source file over 400 lines | **PASS** | § 11.17. Two files were sitting on the ceiling and both were paid for. |
| 11.18 | Codex plan review ran; every finding applied or recorded | **PASS** | [reviews/phase-11-plan.md](../reviews/phase-11-plan.md). 5 rounds, 22 findings, all applied. |
| 11.19 | Codex implementation review ran on the diff | **PASS** | [reviews/phase-11-impl.md](../reviews/phase-11-impl.md). Two reviews; the second on the redesign, 5 rounds, 10 material findings, all applied. |

### 🔴 What is NOT closed

| item | why |
|---|---|
| **11.2, 11.4 (audible half), 11.7 (routing), 11.11** | `play`-owned. Per *(C4)* and the `playtest-finds-what-gates-cannot` rule, a hands-on criterion is **never** reported done on automated evidence. 11.2 in particular needs the **Hebrew layout**, which is the only thing that can confirm the real-world defect is the one that was fixed. |
| **The volume STEP SIZE** | Deliberately not fixed. See § The second defect. |
| **The `playToExit` production spec** | **Flaky, and pre-existing.** It fails on `main` at `6da76b7` as well. On 2026-08-29, after the prod harness was repaired for the two-press route, `chromium-prod` ran **6/6 green three times in a row** and then failed this one spec on a fourth run — a wall-clock budget, not a defect this phase introduced. See § The production flake. |

**This phase is therefore reported FAILING, not done.** Four criteria are owner-owned and unrun.

---

## 11.1 — the root cause, and how it was proved

The owner's report was *"M works; the volume up/down keys do not."* Three candidate sites were named
up front. Two of them did not survive contact with the code:

- `src/scenes/engineLiterals.ts` holds **no keycodes at all** — four tint/blend/scene-event literals
  and nothing else.
- `src/game/audioSettings.ts` exports **`stepVolume`**, not `nudgeVolume`; `clampVolume` is
  module-private at line 59, not 119.
- `OPEN_BRACKET: 219` and `CLOSED_BRACKET: 221` **do** exist in `phaser@4.2.1`, so the destructure
  was fine; `WebAudioSoundManager.setMute` and `.setVolume` are structurally identical; and the node
  graph is correct — sound → `masterMuteNode` → `masterVolumeNode` → `destination`.

**The first reproduction found the code working.** Driving the real page, all three keys behaved:

| key | `localStorage['steampunk.audio']` after |
|---|---|
| *(baseline)* | `null` |
| `BracketLeft` | `{"muted":false,"volume":0.9}` |
| `BracketRight` | `{"muted":false,"volume":1}` |
| `m` | `{"muted":true,"volume":1}` |

So the defect was not in the code as exercised by a US-layout press — which is also why the existing
`phase-07-audio.spec.ts:220`, which presses `BracketLeft` and asserts the volume drops, had been
green all along.

**The experiment that settled it** *(C8 — instrument rather than argue)*. Matched keydown/keyup pairs
dispatched at the page with an explicit `code` and `keyCode`:

| trial | `code` | `keyCode` | volume changed? |
|---|---|---|---|
| A | `BracketLeft` ✓ | `0` | **no** |
| B | `Backslash` ✗ | `219` | **YES** |
| C | `BracketLeft` ✓ | `219` | yes |
| D | real CDP press | `219` | yes |
| E | `BracketLeft` ✓ | `186` | **no** |

A *wrong* physical key carrying the right number fired. The *right* physical key carrying a foreign
number did not. **The binding never depended on the key being pressed** — only on a number the
keyboard layout owns. Phaser dispatches at `KeyboardPlugin.js:747`:
`var code = event.keyCode; var key = keys[code];`. `keyCode` is layout-dependent for punctuation and
stable for letters, which is the reported `M`-works / brackets-dead split exactly.

### 🔴 The first run of this experiment was contaminated, and the instrument caught it

Trials C and D initially returned `null` — appearing to show that even a real press did nothing. That
was **my experiment's fault, not the code's**: a synthetic `keydown` with no matching `keyup` leaves
Phaser's `Key.isDown` true forever, and `emitOnRepeat: false` then suppresses every later press of
that keycode, including real ones. Adding the `keyup` produced the clean table above.

Worth recording because it is a general trap: **any test that fires raw keyboard events must release
them**, or it silently poisons everything after it and makes a working build look broken.

## 11.3 — the gate, watched failing

`tests/e2e/phase-11-audio-keys.spec.ts`. Mutation: `gameInput.ts` reverted to
`addKey(OPEN_BRACKET)` etc. Confirmed applied by content change **and** by the original count
dropping — `audioActionForCode` occurrences 2 → 0 *(C12)*.

```
mutated:   5 failed, 1 passed
restored:  6 passed
```

The one test that passed under the mutation is *"one real press is exactly one step"* — the
US-layout path that always worked, and precisely the reason a green suite never saw this defect.

Revert confirmed: `audioActionForCode` back to 2 occurrences, `tsc --noEmit` clean.

## 11.4 — persistence

Proven in-browser from a seeded 0.5 baseline, both directions, surviving a reload.

🔴 **The baseline must be seeded BEFORE navigation.** `createAudio()` copies storage into a private
`settings` object at boot and `nudgeVolume` mutates only that copy — it never re-reads
`localStorage`. Writing a baseline *after* boot establishes nothing. Caught by Codex plan review
round 3; independently visible in the 11.1 experiment, where a `muted:true` set earlier kept
reappearing in writes after `localStorage` had been cleared.

## 11.5 / 11.6 — the repeat guard, and the two listeners

`addKey(code, true, false)` supplied `emitOnRepeat: false` for free. A raw `keydown` listener
inherits nothing, and the OS repeats a held key ~30 times a second — so without a guard, resting a
finger on `[` walks the volume to an end stop and writes `localStorage` thirty times a second. The
guard is `event.repeat`, and it is tested in **both** listeners, because the shared map does not
share the guard.

The Game listener additionally keeps `isPlayerInputEnabled()`. Pausing solves the title case but does
nothing for `ElementEditorScene`, which extends `GameScene`, inherits the listener, and binds `[`/`]`
to strip selection — the collision the original guard existed for.

## 11.8 / 11.9 — what pausing buys

`playerInputEnabled = false` only clears `sampleHeldKeys`. `advanceSplit`, completion, enemies, cues,
effects and rendering all keep running, so the player could fall, take damage, die or finish a level
while reading the title.

Pausing stops the simulation **and** the input, because
`KeyboardPlugin.isActive()` is `enabled && scene.sys.canInput()` and `Systems.canInput()` returns
`status > PENDING && status <= RUNNING` — **PAUSED is 6, above RUNNING's 5**. Read from the installed
engine, not assumed.

Mutation — `manager.pause()` removed from `attachTitle`:

```
mutated:   5 failed, 6 passed
restored: 11 passed
```

🔴 **The mutation also reddened the two 11.6 audio tests, which was not predicted.** With `Game`
unpaused, *both* audio listeners are live and one press steps the volume twice (0.5 → 0.3). So the
pause is load-bearing for audio correctness too, not only for the sim and the key leak. Recorded
because it is a coupling a future edit could easily break without noticing.

## 11.10 — the latch

Once per **page load**, by a module-scope latch. The first design tested `requestedLevelId === null`
and was simply wrong: `GameScene.init` does `data?.levelId ?? null`, so the id is `null` whenever
data is absent **or** null — and specs restart `Game` with no data at all. Every such restart would
have reopened the title.

A restart **while the title is still up** re-pauses the new `Game`, rather than being skipped. A
latch that only suppressed relaunching would leave a stale title drawn over a running level.

## 11.13 — the boot contract

The overlay publishes nothing to `window.__game`. Verified in-browser with the title up:
`sceneKey=Game`, `ready=true`, `bootError=null`, and the surface still exactly eight fields. No ninth
field was added and none was needed.

## 11.17 — the line ceiling

`tests/unit/file-size.test.ts` filters `lines > 400` and then asserts **zero** over-limit files, so a
`SIZE-EXEMPTION:` citation does not rescue a new one. Two files were sitting on the ceiling:

| file | before | after | how it was paid for |
|---|---|---|---|
| `src/scenes/GameScene.ts` | 399 | 399 | camera block → `gameCamera.applyCameraRig` |
| `tests/e2e/phase-01-boot.spec.ts` | 398 | 400 | one import + one call; all waiting inside the helper |
| `tests/e2e/prodHarness.ts` | 378 | 381 | production barrier → `prodTitle.ts` |

`applyCameraRig` takes the sprite as a **third argument** because `GameScene.playerSprite` is
private — a two-argument signature was specified first and could not have compiled.

## The second defect — real, and deliberately not fixed *(C11)*

Independent of the layout, and true on any keyboard:

- `stepVolume(1, +1)` clamps back to `1`, so **volume-up is a genuine no-op on a fresh save**.
- One step down from 1.0 is 0.9 linear gain — about **0.9 dB**, at the edge of audibility.
- There is **no HUD feedback** for either.

So even with dispatch repaired, a player at default volume who presses `]` and then `[` may
reasonably report that nothing happens. This is a **separate defect** from the one this phase fixed,
it is not fixed here, and it is a candidate for the next phase. Recorded rather than silently
bundled, because bundling it would have made the dispatch fix impossible to evaluate on its own.

## The production barrier's bound — measured, not chosen *(C1, and the held-out rule)*

The first version of `prodTitle.ts` asserted an absolute `TITLE_SCRIM_MAX_LUMA = 26`, a number I
picked. It **false-redded on its first run**, against a real pre-dismiss luminance of **27.04** —
exactly the failure the §5 rule about bounds chosen on one set of runs exists to describe.

It was replaced with a **self-calibrating ratio**: measure the centre patch before the dismissing
keypress, measure it after, and require the after/before ratio to exceed
`TITLE_SCRIM_MIN_BRIGHTENING = 1.5`. The statistic now orders its own mutation, and no absolute
level has to be guessed.

| run | before | after | ratio |
|---|---|---|---|
| 1 | 27.04 | 68.43 | 2.530 |
| 2 | 27.04 | 68.44 | 2.531 |

Bound 1.5 sits well under both and well over 1.0. Red-proved by suppressing the dismissing keypress:
`1 failed`, restored to green. The probe also clips to a 240 × 135 centre patch rather than decoding
a full frame — the full-frame version was slow enough to push neighbouring specs into their own
timeouts.

## The production flake is PRE-EXISTING — measured on `main`, not assumed

`tests/e2e/phase-10-prod.spec.ts`'s `playToExit` fails in the `chromium-prod` project on this
branch. The obvious reading is that the title broke it. That reading is **wrong**, and the way to
know is to run the same project on the base commit.

| tree | `chromium-prod` result |
|---|---|
| `phase-11-welcome` | 1 failed, 5 passed |
| `main` @ `6da76b7` (checked out, rebuilt, re-run) | **1 failed, 5 passed — the same spec** |

So the phase did not introduce it. Recorded rather than fixed *(C11)*: it is a Phase 10 production
timing defect, it is outside this phase's scope, and it is owed forward.

### What the investigation turned up on the way

Chasing it produced a real engine finding, now written into
[ENGINE-NOTES.md](../ENGINE-NOTES.md) — *"Pausing a scene, and the delta cool-down"*. The chain:

1. Same-session interleaved A/B of resumed tick rate: **21.6 vs 60.3 ticks/s**.
2. Both arms ran at ~20 fps, but at **1.0 vs 3.0 ticks per frame** — so it was the delta, not the
   frame rate.
3. Scene delta read **16.67 ms** where wall clock said **56 ms**.
4. A plain pause + resume on a *warm* loop measured a healthy **55 ms** with `_coolDown: 0`.
5. A full trace showed `game.loop._coolDown` counting **86 → 68 → 48 → 0**, with delta clamped to
   `_target` for as long as it stayed above zero.

**So this is boot behaviour, not pause behaviour** — and the title *absorbs* part of the cool-down
(86 → 68) rather than causing it, which means the player gets **less** slow motion after the title,
not more. Diagnosing this by argument rather than by instrument would have blamed the new scene
*(C8)*.

---

## Vault-out — Phase 11

**An input binding can depend on a number the user's operating system owns.** Nothing local sees it:
every gate, every spec and every hands-on session on a US layout exercises a different code path from
the one the player has. The general form is the same as Phase 10's camera defect — *the thing the
engine does with your value is outside the rule you wrote about your value*.

**A synthetic keydown with no keyup is a trap that outlives the test that fired it.** It leaves
`Key.isDown` true, `emitOnRepeat: false` then eats every later press of that keycode, and the next
measurement reports a working build as broken. The instrument caught it only because the experiment
recorded what the page actually received alongside what changed.

**`playerInputEnabled` is not a pause and never claimed to be.** It clears sampled input. Everything
else in the tick keeps running. Any future "freeze the game" requirement should reach for
`scene.pause()`, and should know that PAUSED sits outside `canInput()`'s accepted range — which is
now load-bearing in two places.

**A bound picked by a person false-reds; a bound the run computes for itself does not.** The absolute
scrim-luminance number failed on its very first honest run. The ratio that replaced it needs no
guess, and it can still go red — which is the whole test of a bound.

**Before blaming the new code for a failing spec, run that spec on the base commit.** The production
`playToExit` failure looked exactly like something the title screen had caused. It fails identically
on `main`. One checkout and one re-run separated a phase defect from an inherited one — the same
move that closed the invisible-blocker report last session.

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

**Owed forward:** the volume step size and its missing feedback; the pre-existing `playToExit`
production flake; and the five owner-owned criteria.
