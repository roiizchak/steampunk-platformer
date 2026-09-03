# Session handoff — the six mobile polish items (2026-09-02)

> Branch `phase-13-mobile-polish`, **not merged**.
> Full record: [qa/session-mobile-polish.md](qa/session-mobile-polish.md) and, for the second device
> round, [qa/session-mobile-polish-02-device-report.md](qa/session-mobile-polish-02-device-report.md).
>
> The owner played the shipped Phase 12 build on a real device and reported six things. All six are
> implemented and gated. A Vercel preview then went to the phone and **two more reports came back**,
> then a third preview and **one more**: the welcome screen's `M mute  ·  [ / ] volume` line, which
> is desktop-only now. 🔴 **Removing a row from the title screen is a LAYOUT change** — the four
> row fractions were solved twice and two adversarial briefs tuned them, so `titleRowSpread` re-derives
> the spacing for three rows rather than slicing the four-row table. Slicing leaves margins of 0.120
> against 0.211.
> — the touch controls sitting inside the phone's gesture zones, and the gear count still off its
> icon. Both fixed and gated. **What is STILL not done is the hands-on pass**, and most of these
> items are "does it look right", which no gate answers *(C4; the owner plays at 60 Hz, this box is
> 240)*.

## 🔴 A game-pixel gate cannot see a CSS-pixel defect

`TOUCH_EDGE_PX` was 64 game px, which is **19–24 CSS px** on every phone this project supports —
inside Android's back-gesture strip. Every assertion in `tests/unit/touch-layout.test.ts` passed,
because every one of them was in game pixels too. It is 128 now, and there is a CSS floor beside
them that converts through the real `liveViewWidth`.

The same shape produced the gear-counter defect three times: the placement is only wrong once a
browser has picked a font, and no gate had a font until `phase-06-hud.spec.ts` grew one.
**⚠️ `TextMetrics.fontSize` is `ascent + descent`, not the font size** (`MeasureText.js:38`),
and Phaser measures the style's test string `|MÉqgy`, not the digits — the two facts behind
attempts two and three. See the round-2 QA log.

## 🔴 Read this before touching the scale code

**Item 6 shipped twice.** `Phaser.Scale.EXPAND` landed in `e542823` and was **replaced** in
`1257de2`. Do not put it back without reading `src/game/viewSize.ts`'s header first.

EXPAND's only clamp is `scale.min`/`scale.max`, and `ScaleManager` feeds those bounds to
`displaySize` — which is **also the CSS style size** (`ScaleManager.js:1088-1140`; `Size.setSize`
re-clamps into the same min/max). Game units and CSS pixels, clamped by one pair of numbers. A `min`
of 1920x1080 therefore forces the canvas to be at least 1920 CSS px wide on a 900 px viewport, and
it was **measured doing exactly that**: a 1920 CSS px canvas in a 1040 px viewport.

What ships is `Phaser.Scale.FIT` — unchanged, five phases of specs still measure it — over a game
size that is a function of the viewport: `liveViewWidth` gives the view the viewport's own aspect at
a fixed `GAME_HEIGHT`, clamped into `[GAME_WIDTH, MAX_GAME_WIDTH]`, so FIT has nothing left to
letterbox inside the ceiling.

⚠️ **`installViewFill`'s equality guard is load-bearing.** `setGameSize` ends in `refresh()`, which
emits `resize` straight back into the handler. Without the guard the first resize is an infinite
loop, not a slow one.

⚠️ **A synthetic `game.scale.resize(w, h)` is no longer reachable.** It emits `resize`, the fill
loop hears it and snaps the view back to what the viewport says. Three specs used to drive it and
now drive `page.setViewportSize` instead. If you write a new one, drive the viewport.

## The traps, and they are not visible in the code

- **The view is no longer 1920 wide.** It is 1920 at exactly 16:9, up to 2560 on a wide viewport,
  and never narrower. **Height is pinned at 1080**, which is what keeps every `gameH / GAME_HEIGHT`
  ratio at exactly 1 — the HUD, the touch layout and the parallax all depend on that. Anything you
  size once in `create()` from a literal will be wrong on the second size.
- **`1024x461` is not 20:9.** It is 2.2213 and rounds the view to **2399**, which reads as 2400 and
  fails an equality. `1000x450` is exact. Three specs learned this the same way.
- **`bootToTitle` lands on the LEVEL MENU on a touch device**, not on the title, and the tap zones
  live there — five `Zone`s under `LevelSelect`, none anywhere else. Probed, not assumed.
- **`bootToTitle`'s canvas tap goes FULLSCREEN on a touch device**, after which Chromium refuses
  `setViewportSize` outright: *"To resize minimized/maximized/fullscreen window, restore it to
  normal state first."* Exit fullscreen before resizing.
- **Run `test:e2e` per PROJECT, not as one invocation.** A whole-suite run completed in 32 minutes
  once and then hung past two hours, with the JSON reporter producing **no file at all** — a hang
  costs the entire signal. Per-project runs with a `timeout` localise it and keep every earlier
  project's result.
- **A fake with MORE API than the real object re-routes the code under test**, and one with LESS
  makes a gate unfalsifiable. Both happened here: `setFillStyle` on every face sent the art arm down
  the fill branch, and a missing `setText` made "never calls `setText`" a sentence about itself.

## The Codex implementation review found two defects that PREDATE this branch

Both applied; full dispositions in
[reviews/session-mobile-polish-impl.md](reviews/session-mobile-polish-impl.md).

🔴 **`rotateGuard` called `scale.refresh()` on EVERY FRAME** — it is subscribed to `SCENE_UPDATE`,
and `ScaleManager.refresh()` writes `canvas.style`, forces a layout through
`getBoundingClientRect()` and emits a **global** RESIZE. Every scale listener in the game ran 60
times a second while the title or level menu was up, and item 4 had just added a `setFontSize` call
— a synchronous `MeasureText` — to `UIScene.applyLayout`. The poll stays (iOS Safari does not
reliably fire `window.resize` on a rotation); the engine re-measure is now conditional on the
viewport having actually moved.

🔴 **A source-text gate that does not strip comments is not a gate.** `view-size.test.ts` scanned
raw source for `installViewFill(`, so commenting the call out left every assertion green.
`playwright-projects.test.ts` had already been bitten by this twice. **If you write a source-text
gate, strip both comment kinds first**, and prove it by commenting out the thing it names.

## What is still owed

✅ **The hands-on pass on the owner's device RAN**, three times — 2026-09-01, and twice on
2026-09-02. Nine defects across the three rounds, all fixed, all gated. It closed **12.24**. See
[qa/session-mobile-polish-02-device-report.md](qa/session-mobile-polish-02-device-report.md).

🔴 **The hazard-visibility pass item 3 owes.** `PLATE_ALPHA` 0.9 **abandons** the occlusion
criterion rather than weakening it — 22 % residual against a 60 % rule, past the 0.86 measured to
erase content — on the owner's authority. The replacement check: stand behind the pause plate on
level-01 where a shooting `brass-sentry` sits for nine consecutive standing positions, and under the
jump plate on level-04 where the goal sits for nine more. **If either is unplayable, 0.9 is wrong
and the number comes back down.**

🔴 **WITHDRAWN 2026-09-02 — `max.height` no longer exists.** It was a `Phaser.Scale.EXPAND`
clamp, and EXPAND was abandoned in `1257de2`; `src/game/config.ts` now carries `mode: FIT` and no
`min`/`max` at all, because those bounds reach `displaySize`, which is also the CSS style size. The
height is held at 1080 by `viewSize.ts` passing `GAME_HEIGHT` to `setGameSize`, which is code with a
gate on it rather than a clamp with a derivation. Nothing is owed here.

⚠️ The frame-budget figures in `docs/qa/` were all taken at the design size. They are now a floor
for a widened view rather than the figure for every size. Nothing has re-measured them.

## Verification at the tip

- `npm test` — **3116 passed, 220 files**, 0 failed.
- `npm run test:e2e` — **227 passed, 0 failed, 0 skipped**: `chromium` 106 · `chromium-gpu` 70 ·
  `chromium-dpr2` 8 · `chromium-touch` 34 · `chromium-touch-gpu` 3 · `chromium-prod` 6.
- `npx tsc --noEmit` clean; `npm run build` + `verify-dist` ok.

---

# Session handoff — Phase 12, touch and responsive support

> ## 👉 Resuming Phase 12? Read [handoff/next-session-prompt-phase-12.md](handoff/next-session-prompt-phase-12.md) first.
>
> Branch `phase-12-touch`, **not merged**. Thirteen Codex implementation-review rounds applied, plus
> the 2026-08-31 close-out session. 3019 unit tests, **218 e2e across five projects**, 79 mutation
> rows and 26 holes found and closed.
>
> **Still reported FAILING**, and the remaining list is short: **12.14 is NOT MET** and **12.13,
> 12.23 and 12.24 are UNRUN**.
>
> - **12.8, 12.10, 12.17 → PASS.** The owner amended all three on 2026-08-31; no gate moved.
> - **12.11 → PASS.** Frames served against a vsync-locked display cannot order its own mutation, so
>   the statistic was replaced with paired per-frame GPU and main-thread deltas, red-proved both ways
>   (M72, M73) and confirmed on a held-out sweep.
> - **12.14 → still NOT MET**, and this is the live decision. The wrench re-shoot succeeded — every
>   stroke of all six faces clears 3:1 at 48 CSS px, `KNOWN_SHORTFALL` is gone — but the
>   `ui-ux-tester` briefs found `pause` (a cog: reads *settings*) and `walk` (two bars: reads as
>   nothing) do not say their actions at any size, and that **48 px is not the worst reachable size**:
>   controls stay live to 44, where `touch-pause` measures **2.91:1** against WCAG's 3:1. Options and
>   a recommendation are in `docs/qa/phase-12-touch.md` § 12.14.
> - **12.13 and 12.24** need the owner's hands on a phone; **12.23** is the Codex implementation
>   review on the final diff.

---

---

## The sessions, split into parts

**This document reached 1604 lines.** On 2026-08-15 the superseded sessions moved to
[`docs/handoff/`](handoff/). **The § numbers did not change.** `src/`, `tests/`, `tools/` and
`playwright.config.ts` cite sections as "HANDOFF.md §14", and every one of those citations still
lands here, on this index, one hop from its section.

**It reached 1477 lines again, and was split the same way on 2026-09-03** — every session below the
live two moved to `docs/handoff/`, and this table moved UP from the middle of the file to here so it
is the first thing a citation-follower sees. The § numbers still did not change. `docs/` is now
gated at 500 lines a file by `tests/unit/file-size.test.ts`, which is why the second split happened
before the document reached its old size.

**The rule going forward:** when a new session supersedes the one before it, the superseded
section moves to `docs/handoff/`. The live sessions stay in this file.

| § | Session | Where |
|---|---|---|
| §1–§7 | session 1 — 2026-08-09 | [handoff/session-01.md](handoff/session-01.md) |
| §8, §9 | sessions 2–3 — 2026-08-10 | [handoff/sessions-02-03.md](handoff/sessions-02-03.md) |
| §10, §11 | sessions 4–5 — 2026-08-11 | [handoff/sessions-04-05.md](handoff/sessions-04-05.md) |
| §12, §12b, §13 | sessions 6–7 — 2026-08-11/12 | [handoff/sessions-06-07.md](handoff/sessions-06-07.md) |
| §14 | session 8 — 2026-08-13 | [handoff/phase-06-and-earlier.md](handoff/phase-06-and-earlier.md) |
| §15 | sessions 9–10 — 2026-08-13/14 | [handoff/phase-06-and-earlier.md](handoff/phase-06-and-earlier.md) |
| §16 | Phase 6, session 1 — 2026-08-15 | [handoff/phase-06-and-earlier.md](handoff/phase-06-and-earlier.md) |
| §17 | **Phase 6, session 2 — 2026-08-16. Phase 6 CLOSED.** | [handoff/phase-06-and-earlier.md](handoff/phase-06-and-earlier.md) |
| §18 | Phase 7 — 2026-08-16 | [handoff/bugfix-perf-gates.md](handoff/bugfix-perf-gates.md) |
| §19 | the bug-fix + perf-gate session — 2026-08-19 | [handoff/bugfix-perf-gates.md](handoff/bugfix-perf-gates.md) |

**The sessions after §19 were never numbered** — the § scheme stopped being used when the sections
started carrying phase names instead. They are listed here by name so this table answers "where did
that section go" for every session, numbered or not.

| Session | Where |
|---|---|
| the gate-art + gate-entry session (Phase 8) | [handoff/phase-08-gate-entry.md](handoff/phase-08-gate-entry.md) |
| Phase 9 — polish, juice, particles | [handoff/phase-09-polish.md](handoff/phase-09-polish.md) |
| Phase 10 — build and ship | [handoff/phase-10-ship.md](handoff/phase-10-ship.md) |
| the HUD banner's placement + the pit rule | [handoff/hud-banner-and-pits.md](handoff/hud-banner-and-pits.md) |
| Phase 11 — the welcome screen and the volume repair | [handoff/phase-11-welcome.md](handoff/phase-11-welcome.md) |
| Phase 12 — touch and responsive support | above, still live |
| the six mobile polish items — 2026-09-02 | above, still live |

---
---

# NEXT SESSION — every phase is done, and one criterion is open on purpose

Written 2026-09-03 at the end of the Phase 12 close-out. **Phases 1–13 are all done and live.**
There is no phase in flight and no blocked work.

## The state

| | |
|---|---|
| branch | `main` |
| live | [steampunk-platformer-jet.vercel.app](https://steampunk-platformer-jet.vercel.app) |
| suite | unit **3146/3146** (873 suites) · sim-isolated 3133 + 13 skipped · e2e **236/236** across all seven projects · build + `verify-dist` ok |
| phases | **1–13 done.** Phase 12 done 2026-09-03 with **24 of 25 PASS** and 12.23 accepted open |

## The one thing that is open, and why it is not a loose end

🔴 **12.23 — the Codex implementation review — is NOT MET, and the owner accepted the phase with it
open.** Rounds 21, 22 and 23 all returned `VERDICT: REVISE` at the three-round cap the owner set;
every finding from all three is applied. **CLAUDE.md §3 says a phase with a failing criterion is
reported failing, and that rule was overridden explicitly.** It is written down in the QA verdict
table, PRD.md's phase row and QA-LOG.md so that no later reader mistakes the acceptance for
convergence. **Phase 12 shipped by decision, not by convergence.** If a future session wants it
closed properly, the next round is 24 and `docs/reviews/phase-12-touch-impl.md` has all 23.

## The traps this close-out paid for

1. 🔴 **A regex cannot tell a read from a discarded read.** Three mutations in a row defeated a
   source-text gate over the audition template's concatenation: a newline separator (M115), a
   callback returning `''` (M117), then a *real* read with `.slice(0, 0)` appended (M118), which
   keeps every token the regex looks for. The concatenation lives in `tools/gen/auditionDocument.mjs`
   now, where a test runs it. **If you find yourself writing a third regex over the same code path,
   stop and make it behavioural.**
2. **A correction applied where the reviewer pointed is half a correction.** Rounds 22 and 23 both
   found a claim fixed in one passage and left standing in another. Grep the claim, not the line.
3. **`INPUT_GAME_OUT` is gone from `touchControlsLayer.ts`** by owner decision — Phaser fires it when
   `document.elementFromPoint` leaves the canvas, so a thumb rolling past the edge dropped the jump
   the other hand was holding. Criterion 12.5's text was amended with it. Confirmed on the device.
4. **`chromium-gpu` is intermittently red on `main`** — three failures in five runs during this
   session, a different `phase-05..09` perf spec each time, unreachable from anything changed. Not
   diagnosed, not this phase's. Green in the recorded run.
5. **`chromium-prod` failed once and passed twice** on identical bytes, on the dev-seam spec.
   Recorded as an unexplained flake, not as a green.
6. **Deploying:** ⚠️ a bare `vercel deploy` targets **PRODUCTION** on this project, and the linked
   `orgId` needs an explicit `--scope rois-projects-f9d9895d` or the deploy returns *Not authorized*.
   Preview deployments sit behind Deployment Protection and redirect to a Vercel login page; the
   phone has to be signed in once. Production is public.

## Debts carried forward, none blocking

- **12.14 has no automated cover and is not getting any.** The per-stroke contrast gate was deleted
  rather than failing, and rebuilding a statistic after seeing the art it would judge is the
  post-data selection this phase kept catching. Owner decision. Its evidence is two `ui-ux-tester`
  briefs and one hands-on pass.
- **`PLATE_ALPHA` 0.9 stays**, and the measurement it overrode stays on the record with it: 22 %
  residual where the rule said 60 %, past the 0.86 measured to erase what is underneath, with 175 of
  878 standing positions carrying something behind a plate. A person looked and said it plays. That
  is what the criterion asks for; it is not the bound being met.
- **`brass-courier/fall` still judders** — a 74 px frame-to-frame height spread. Oldest open art debt.
- **No committed script reproduces the 175/878 sampling.** It exists only as prose in
  `touchMarks.ts:69-76`.
