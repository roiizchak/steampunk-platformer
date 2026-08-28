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
| 11.12 | Title readable and correctly laid out at 1920×1080 and on resize | **UNRUN** | Owned by `voltagent-qa-sec:ui-ux-tester`; not yet run. |
| 11.13 | `sceneKey`/`ready`/`bootError` unmoved; surface still eight fields | **PASS** | § 11.13. Two e2e tests. |
| 11.14 | The diff reviewed adversarially, two briefs | **UNRUN** | Owned by `voltagent-qa-sec:code-reviewer`; not yet run. |
| 11.15 | Full e2e suite green at the expected COUNT | **UNRUN** | Full suite not yet run end to end. |
| 11.16 | `npm run build` clean and `verify-dist` passes | **UNRUN** | Not yet run against the finished diff. |
| 11.17 | No source file over 400 lines | **PASS** | § 11.17. Two files were sitting on the ceiling and both were paid for. |
| 11.18 | Codex plan review ran; every finding applied or recorded | **PASS** | [reviews/phase-11-plan.md](../reviews/phase-11-plan.md). 5 rounds, 22 findings, all applied. |
| 11.19 | Codex implementation review ran on the diff | **UNRUN** | Not yet run. |

### 🔴 What is NOT closed

| item | why |
|---|---|
| **11.2, 11.4 (audible half), 11.7 (routing), 11.11** | `play`-owned. Per *(C4)* and the `playtest-finds-what-gates-cannot` rule, a hands-on criterion is **never** reported done on automated evidence. 11.2 in particular needs the **Hebrew layout**, which is the only thing that can confirm the real-world defect is the one that was fixed. |
| **11.12, 11.14** | Agent-owned, two briefs each *(A7)*. Not yet run. |
| **11.15, 11.16, 11.19** | Full suite, build, and the Codex implementation review. Not yet run. |
| **The volume STEP SIZE** | Deliberately not fixed. See § The second defect. |
| **The `playToExit` production spec** | Fails on this branch — and **also on `main` at `6da76b7`**. Pre-existing, not introduced here. See § The production flake. |

**This phase is therefore reported FAILING, not done.** Eight criteria are unrun or partial.

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

**Owed forward:** the volume step size and its missing feedback; the pre-existing `playToExit`
production flake; and the five owner-owned criteria.
