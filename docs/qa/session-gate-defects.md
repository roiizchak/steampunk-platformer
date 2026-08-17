[← QA-LOG index](../QA-LOG.md) · [plan](../handoff/next-session-prompt.md) · [Codex reviews](../reviews/)

## Session — four gate defects on `main`

**Branch:** `fix/gate-defects` · **Date:** 2026-08-17 · **Not a phase**, so no `X.NN` numbering.

Scoped by the owner to exactly four things: three defects in the project's own **gates**, and one
Phase 4 criterion sitting red on `main`. Phase 8 explicitly out of scope.

---

## The headline

**Three of the four gates could not fail for the defect they named**, and that was proved by
measurement rather than argued. So could **two of the three replacements this session's own plan
specified** — which is the more useful result, because it means the plan was wrong in the same way
the original gates were wrong, and only mutation testing separated them.

| gate | claim it made | what the measurement said |
|---|---|---|
| `MAX_BURST_RATIO` (5.11) | catches the ten-sentry volley | blind at **10x** the storm; read 1.71 against a clean 1.86 |
| frames-per-tick (the planned replacement) | would catch it | **also blind** — 1.03 at 10x against a clean 1.06 |
| `MAX_HUD_GPU_RATIO` (6.9) | catches a full-screen scrim | the scrim is **invisible**; the bound sat below its own noise floor |
| per-pair ratios (the planned fix) | survives contention | **worse** than pooled — 1.328 vs 1.319 |
| min-per-arm (tried next) | GPU noise is one-sided | **false** — an off window read 0.095 ms, giving 1.419 |
| `MAX_AUDIO_FRAME_LOSS_RATIO` (7.7) | — | went **red on correct code** mid-session; windows were unequal |
| 400-line rule | a citation is a justification | a **Phase 4** citation covered a **Phase 7** growth |
| 4.23 | the drawn feet meet the surface | the renderer was right; **two assertions were wrong** |

---

## 4.23 — the renderer was never wrong

Full write-up, with the measurement table and the mechanism, is in
[phase-04-art.md](phase-04-art.md) under the dated 2026-08-17 entry, because it is a **Phase 4
criterion regressing after Phase 4 closed**.

Summary: `src/sim/player.ts` zeroes `vy` and moves `y` to the surface in the same landing tick, so
the spec's `simVy === 0` filter did not mean "the sim left the player where it was". Worst gap
**22.18104000003086 px** against a predicted `(1 - alpha) · |dy|` of **22.18104000003090 px**.
Both claims now derive from `GameScene.prevPlayer.y`.

**The red proof caught a bug in the fix.** The first containment formula measured distance from
`simY`, so an `alpha * 1.5` overshoot passed it green. Rewritten to true containment, the same
mutation reports **11.34 px outside the segment**. Watching a gate fail is not ceremony.

---

## 5.11 — `MAX_BURST_RATIO` and the replacement that was also decoration

**The mutation the bound's own comment describes**: a per-enemy allocation storm on
`src/sim/enemyTurn.ts`'s fire branch, so the cost lands only on the tick a sentry shoots. Three runs
per condition, real GPU, same box, same session.

| statistic | clean | storm 1x | storm 10x | separates? |
|---|---|---|---|---|
| `workP95Ms` ratio (`MAX_BURST_RATIO`, bound 6) | 0.82 – 1.86 | 1.25 – 2.00 | 1.38 – 1.71 | **no** |
| frames per tick, ratio | 0.97 – 1.07 | 1.06 – 1.09 | 1.01 – 1.04 | **no** |
| wall-ms per sim tick, fleet | 16.47 – 16.51 | 15.98 – 16.32 | 22.04 – 22.96 | **yes** |
| that, as fleet/baseline | 0.987 – 0.992 | 0.960 – 0.982 | 1.324 – 1.382 | **yes** |

At **ten times** the storm the p95 ratio read **1.71 — lower than a clean run's 1.86**, against a
bound of 6. Deleted, not loosened.

**Why frames-per-tick fails here and works for Phase 7.** Phase 7's window is bounded in ticks and
its defect is a blocking stall inside an audio cue, which starves rAF directly. Here the window is
*also* bounded in ticks, but the stall makes the window take longer in **wall** time while rAF keeps
serving frames throughout — so the frame count barely moves and the tick count is fixed by
construction. Recorded because the plan specified it and the measurement refused it.

**What replaced it**: wall-clock milliseconds per simulated tick — how long the machine needed to
simulate a fixed amount of game time.

- `MAX_FLEET_MS_PER_TICK_RATIO` **1.15**, fleet/baseline. Red at **1.377**.
- `MAX_MS_PER_SIM_TICK` **20** absolute. Red at **21.82**, with the ratio bound temporarily
  neutralised so this assertion was the only one that could fail.

**The absolute bound was drafted at 25 and that was decoration.** `drainTicks` caps catch-up at
`MAX_TICKS_PER_FRAME` = 5, so a per-frame cost **self-balances**: a frame costing C ms drains about
`C / 16.67` ticks and wall-time-per-tick stays ~16.67 however large C gets — until C exceeds
`5 × 16.67 = 83 ms`. At 25 even Phase 5's real parallax defect (71 ms median frames) would have
passed. An 8 ms-per-frame proving stall passed at both 25 and 20.

⚠️ **Stated blind spot.** A *uniform* per-frame stall cannot prove the absolute bound: above 83 ms
per frame a 180-tick window holds only ~36 frames, so `MIN_SAMPLES` (60) rejects it first. Attempted,
observed, recorded.

---

## 6.9 — it was never contention, and the bound was below its own signal

Deviation **D8** recorded 6.9's GPU ratio as failing under full-suite load and passing in isolation,
and blamed the 47 preceding headless tests. **It fails in isolation.** Three consecutive GPU-project
runs of this spec alone, nothing else on the box:

| run | on windows | off windows | pooled median | per-pair median | min/min |
|---|---|---|---|---|---|
| 1 | 0.132, 0.131, 0.131 | 0.131, 0.130, 0.131 | 1.000 | 1.008 | 1.008 |
| 2 | 0.930, 0.134, 0.129 | 0.590, 0.905, 0.133 | **0.227** | 0.970 | 0.970 |
| 3 | 0.317, 0.139, 0.178 | 0.176, 0.135, 0.134 | **1.319 RED** | **1.328 RED** | 1.037 |

The HUD costs **~0.001 ms of GPU on a ~0.131 ms baseline**. Run 2's on-arm median came out four times
*below* its off-arm median, which is not something a HUD can do.

**Two candidate statistics were tried and both refused.** Per-pair ratios — the plan's fix — read
1.328 on run 3, marginally *worse* than pooled, because the contamination is not shared within a
pair. Minimum-per-arm was tried next on the theory that GPU noise is one-sided; three more runs
produced an **off** window of **0.095 ms**, cheaper than any other reading anywhere, giving **1.419**.
Windows read spuriously low as well as high, so the premise was false.

**Then the defect the bound names was built and measured.**

| mutation in `UIScene.create()` | GPU ratio |
|---|---|
| one full-screen 1920×1080 alpha scrim | **0.932, 1.144 — invisible** |
| five stacked scrims | **2.688, 5.641** |
| twenty stacked scrims | **8.459** |

The single scrim — *"a full-screen scrim, an alpha-blended overlay"*, the old comment's own words —
does not move the statistic at all. On an RTX 4080, one full-screen blend over a scene that already
draws three full-screen parallax layers is nothing.

### 🔴 A bound moved UP, against the standing rule, and here is the argument

`MAX_HUD_GPU_RATIO` **1.25 → 2.0**. The project's rule is that a gate is never fixed by loosening it,
and the plan for this session said so explicitly. The rule's *reason* is that a bound loose enough to
survive noise is loose enough to hide the defect it exists to catch. **That reason does not apply
here, because 1.25 already could not catch that defect.** Clean spread is 0.227 – 1.319; the weakest
proven signal is 2.688; 2.0 lies between. Nothing 1.25 could catch is now missed, because 1.25 caught
nothing but its own noise.

Red-proved at **2.688**, reverted, three clean runs green at **0.185 / 0.993 / 1.015**, and **0.937**
under deliberate contention.

⚠️ **Demonstrated floor.** This gate cannot see one full-screen alpha layer. It catches gross
overdraw only. The 34 % margin between bound and weakest signal is thinner than the rest of
`perfBudget.ts` enjoys and is written down rather than rounded away.

---

## 7.7 — found red mid-session, on correct code

Not in the original scope; the plan added an audit of it because the same sampler is involved. The
audit was overtaken by events: **the full regression run failed it**, 478/450/450 frames with audio
against 478/476/465 without, a "loss" of 1.0578× against a 1.02 bound. Nothing was stalling.

`sample()` counts frames only while `tick - firstTick < wantTicks`, but returned `ticks` read the
counter at the bottom of `drain()` — **after** the GPU drain. So `frames` and `ticks` described
different spans, and the stop condition overshoots by however many ticks the last frame drained. Two
windows that both satisfy `ticks >= SAMPLE_TICKS` routinely span different tick counts, and a longer
window serves more frames for reasons unrelated to the arm.

Invisible to any assertion phrased as a ratio of medians. Fatal to one phrased as a ratio of frame
counts. Fixed in `perfSampler.ts` (captured at the stop condition) and 7.7 now gates frames per sim
tick. **Predicted by the Codex plan review from file evidence before it was observed.**

---

## The 400-line rule

**(a)** `src/scenes/GameScene.ts` **432 → 378 lines**, by inlining eight `private` one-line wrappers
that only forwarded to `gameParallax.ts`, `gameHud.ts`, `gamePlayerDraw.ts`, `gameLevelDraw.ts` and
`gameInput.ts`, relocating each docstring to the call site or the module it describes.
`followPlayer`'s six-line body moved into `create()` with its comment. **Not one line of explanation
was deleted.** All eight were `private` with no external caller.

**(b)** The gate could not have caught the crossing: it accepted any file whose path appeared in any
`docs/qa/` log, and `phase-04-art.md` already named `GameScene.ts` while justifying **459** lines on
grounds that say nothing about audio. A citation is now active only if its log line states the
**current** count as `lines=N`, with exactly one such line per path.

**An exact token, not a bare number** — the logs already record `GameScene.ts` at both 459 and 432,
so a naive "path and count appear together" check would false-green a file that grew *back* to a
stale historical size. Raised by the Codex plan review (MAJOR 5).

Ratchet **1 → 0**. That does not delete the escape hatch: the project rule still permits an
over-limit file with a written justification, and the citation check is what enforces the writing.

**Red-proved four ways**, fixtures deleted afterwards, suite confirmed green:

| fixture | result |
|---|---|
| 410-line file, no citation | red — *"no active citation"* |
| citation naming the path, no `lines=` | red — *"no active citation"* |
| citation with a stale `lines=459` against a 410-line file | red — *"does not say lines=410"* |
| citation with the correct `lines=410` | **citation test passes**; only the ratchet trips, as intended |

The fourth is the positive control, and it matters: without it the first three are equally consistent
with a gate that is simply always red.

---

## Hands-on — G8 and G9

Driven with `playwright-cli` against `npm run dev`, **before** the test was touched for 4.23 and
again **after** the `GameScene` split. Screenshots in [../evidence/](../evidence/).

| | measurement |
|---|---|
| standing still, 240 frames | worst gap **exactly 0** |
| after running, camera scrolled 447 px | gap **0** |
| jump arc, 500 frames, 212 settled samples | worst gap **0**, airborne states present |
| after landing | gap **0** |
| after taking hazard damage, camera at 2238 px | gap **0** |
| run / jump / attack | camera scrolled; `attack` state reached |
| damage | hp **100 → 80** |
| gears | score **0 → 3** |
| audio manager · HUD scene · parallax | present · active · 3 layers |

`docs/evidence/4-23-feet-standing-2026-08-17.png` and
`docs/evidence/g8-feet-after-split-2026-08-17.png` show the boots on the brass cap.

⚠️ One probe field, `g9.ranRight`, reported `false` — a bug in the probe (it compared a field the
probe never returned), not in the game. The camera scrolling 447 px is what establishes the run.
Recorded rather than quietly dropped.

---

## Verification

| check | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 97 files, **1350 passed** |
| `npm run build` + `verify-dist` | ok — 1 level, 11 audio files byte-identical, no DEV key in the bundle |
| `npx playwright test --project=chromium` | **48 passed** |
| `npx playwright test --project=chromium-gpu`, immediately after | **38 passed** |
| 6.9 under that contention | GPU ratio **0.937** |
| 5.11 under that contention | ms/tick ratio **0.990**, fleet **16.48 ms** |
| dev servers | killed by port *(C13)* |

The contention sequence is the one D8 said reproduced the 6.9 failure. It now passes.

---

## The QA gate — four briefs, and the adversarial ones earned their keep again

Two owners, two briefs each *(A7)*, all four launched in parallel so brief 2 could not see brief 1's
findings. **Every finding below is applied or recorded with a reason** *(C11)*.

The pattern held: the checklist briefs confirmed the work and found one stale docstring between them;
**the adversarial briefs found three defects that would have shipped**, two of them in fixes this
session had already declared finished and red-proved.

### Applied

| # | Owner | Severity | Finding | What was done |
|---|---|---|---|---|
| P1 | perf, brief 1 | MAJOR | `MAX_AUDIO_FRAME_LOSS_RATIO`'s docstring still derived 1.02 from raw frame counts, but the spec now gates a rate. A stale justification — this session's own defect class. | Re-measured (below) and rewritten. |
| P2 | perf, brief 2 | MAJOR | 7.7 **still false-reds**: a clean run at 1.0961 with tick spans matching exactly. The span fix removed one cause, not the exposure. | Re-derived from 12 runs; see below. |
| P3 | perf, brief 2 | MAJOR | 6.9 re-measured at **1.396**, above the 1.319 clean ceiling the bound was set against. Two extra samples raised the observed ceiling. | Spread restated as 0.227–1.396 and explicitly as a *lower bound on the noise*; margin restated 34 % → 26 %. |
| R1 | review, brief 2 | MAJOR | **The containment claim was one-sided.** `renderAlpha(0)` — interpolation off entirely, the ghost defect `interpolate.ts` exists to remove — is inside `[prevY, simY]` on every sample and passed green. So did a halved blend factor. | Replaced by an exact prediction against the scene's own functions. Red-proved at 23.45 px and 11.73 px. |
| R2 | review, brief 2 | MAJOR | **The window was not guaranteed to contain a landing.** 130 rAF frames ≈ 32 ticks against a ~65-tick arc; on a fast run `settled` is fed entirely by pre-jump frames. | Asserts a `fall → grounded` transition and a settled sample after it. |
| R3 | review, brief 1 | MAJOR | The citation docstring claimed a protection the code does not implement — `lines=459` proves a marker was once written at 459, not that it is current. | Corrected to state what actually holds the line, and to name the residual hole. |
| R4 | review, brief 2 | MAJOR | **The citation logic had zero live coverage** — it only runs when a file is over the limit, and the same session ratcheted that to 0. A C2 violation. | `citationProblem` extracted; six committed fixtures incl. a positive control; red-proved. |
| R5 | review, brief 2 | MINOR | `lines=` alone is prose a QA log legitimately writes — **this log writes it** — so a narrative line beside a real path would false-RED a legitimate file. | `SIZE-EXEMPTION:` marker now required. |
| R6 | review, brief 2 | MINOR | The `__phaserGame` precedent was miscited: `phase-05-perf.spec.ts` contains no `getScene` call. | Corrected to `perfSampler.ts`, with the miscitation recorded *(C9)*. |
| R7 | review, brief 2 | MINOR | `Sample.simVy`'s docstring claimed it was reported in failure messages; nothing reads it. | Docstring corrected. |
| R8 | review, brief 2 | MINOR | `ad753eb`'s claim *"not one line of explanation was deleted"* is **false** — the 🔴 paragraph on `sampleHeldKeys` was dropped, not moved. | Restored beside `CITATION_TOKEN`, where it is the argument for the mechanism. The commit claim was wrong and is corrected here. |
| R9 | review, brief 2 | MINOR | `prevY`'s type was never asserted, against §5's *assert the type before the value*; a rename would misreport as a respawn loop. | Type assertions added for `accumMs` and `prevY`. |

### 🔴 P1 + P2 — criterion 7.7's frame-loss half is now a KNOWN-WEAK gate

The audit the plan asked for became the session's most uncomfortable result.

Twelve clean runs — nine by the phase owner, three by the adversarial gate owner, idle box:

```
0.9331  0.9514  0.9556  0.9594  0.9682  0.9810
0.9829  0.9937  1.0044  1.0269  1.0395  1.0961
```

**The 30 ms-per-cue proving mutation reads 1.0943 — below the worst clean run.** The 1.0961 was
clean with tick spans matching exactly (120/120/120 both arms), so it is not the span defect
recurring; the audio arm genuinely serves ~10 % fewer frames on some runs and not others.

Phase 7 recorded the clean spread as *"479/479/479 against 479/478/479 — one frame"*. That is not
what twelve runs show, and a bound of 1.02 false-red about **one run in six**.

Raised to **1.15** so it stops crying wolf, and **explicitly labelled as no longer catching its own
proving mutation**. `MAX_AUDIO_WORK_DELTA_MS` is the load-bearing half of 7.7 until this is redone.
**Open work for a future session**, recorded in the constant's docstring: more pairs, a longer
window, or a different statistic — the treatment 5.11's burst bound got here.

### Recorded, not fixed

| Owner | Finding | Reason |
|---|---|---|
| perf b1 | The storm-1× `ms/tick` reading (0.960–0.982) is *below* the clean floor and unexplained. | Sub-noise effect at 1×; the 10× separation is what the bound rests on. Recorded in the table rather than theorised about. |
| perf b1, b2 | Thin samples — 3 clean runs behind `MAX_FLEET_MS_PER_TICK_RATIO` 1.15, and its contention-immunity is argued rather than tested. | Two contention data points exist (0.990, then 0.993 in the final run). The argument *is* the one 6.9 disproved for GPU, and that is now written in the docstring. More sampling is real work for a future session. |
| perf b2 | The storm and scrim mutations are not committed fixtures. | Matches the project's existing convention (prose in `docs/qa/`). The numbers are recorded; the diffs are in this log's prose. Worth revisiting as a project-wide rule, not here. |
| perf b2 | Frames-per-tick's Phase 5 / Phase 7 asymmetry is under-argued. | The mechanism is in `perfBudget.ts`; the *degree* argument (2 of 180 ticks vs 8 dense cues) is here instead of duplicated. |
| review b2 | 4.23 reads the sprite **transform**, not where the boots sit inside the frame — `originY === 1` makes `getBounds().bottom === sprite.y`, so a mispacked sheet draws floating boots with every assertion green. | **True and pre-existing.** Now stated as a limit in the spec. That coverage is `sheet-packing.test.ts` and 4.24; the hands-on screenshot is what joins them. The verdict "the renderer was correct" rests on the screenshot too, not on this gate alone. |
| review b1 | The glob misses `tools/**/*.mts`, root configs, `.tsx`/`.js`. | No live breach. Widening the glob is a separate decision. |
| review b1 | `perfSampler.ts` is at 398 and `GymScene.ts` at 399, two and one lines from red with the ratchet at 0. | True, and intended — that is what a ratchet at 0 feels like. Noted so the next session is not surprised. |

### The gate owners caught the session breaking its own rule

Both `perfSampler.ts` and `phase-06-perf.spec.ts` went over 400 lines **because of the docstrings
this session added while fixing the 400-line gate**, and the suite was red for it. Then
`phase-04-assets.spec.ts` did the same at 448 after the 4.23 rewrite. Each was split, not shaved:
`setHud` → `hudHelpers.ts`, the drawn-vs-sim sampler → `drawnVsSim.ts`, the run-by-run tables → this
log. **The ratchet at 0 worked exactly as intended, on its own author, three times.**

---

## Final verification, after every finding was applied

| check | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 97 files, **1356 passed** (6 new citation fixtures) |
| `npm run build` + `verify-dist` | ok — no DEV-only scene key or debug surface in the bundle |
| `npx playwright test --project=chromium` | **48 passed** |
| `npx playwright test --project=chromium-gpu`, immediately after | **38 passed** |
| 5.11 under that contention | ms/tick **16.53** fleet vs **16.65** baseline, ratio **0.993** |
| 7.7 under that contention | loss **0.9686** |
| dev servers | killed by port *(C13)* |

---

## Codex implementation review — 2 BLOCKER, 3 MAJOR, 1 MINOR

Session `01a00e61-c274-7452-8cc4-ddc269712508`. Ran **last**, after all four gate owners, per the
protocol. File-evidence only; every finding was re-verified locally before acting.

Full review: [../reviews/session-gate-defects-impl.md](../reviews/session-gate-defects-impl.md).

### 🔴 BLOCKER 1 — `MAX_MS_PER_SIM_TICK` missed a whole band, and the docstring understated it

**Verified locally against the real `drainTicks` arithmetic**, and Codex was exactly right:

| uniform frame cost | ticks/frame | **ms per tick** | frames per 180 ticks |
|---|---|---|---|
| 20 ms | 1.20 | **16.69** | 151 |
| 40 ms | 2.39 | **16.70** | 76 |
| 49 ms | 2.94 | **16.69** | 62 |
| 80 ms | 4.79 | **16.70** | 38 |
| 110 ms | 5.00 | **22.00** | 36 |

A **20–49 ms per-frame regression is invisible to ms-per-tick AND stays above `MIN_SAMPLES`**. The
ratios divide it out because it lands in both arms. So it passed *every* assertion in 5.11.

My docstring admitted a blind spot but placed it above 83 ms; **it starts at 0**. It also called
20 ms "an effective 50 Hz", which is false under this clock. Both corrected.

**Fixed** by adding `MAX_FLEET_WORK_MS` = 8 — the fleet arm's median frame work in milliseconds, the
one assertion that is neither a ratio nor a function of the tick clock. Clean 0.50–0.60 ms, so 13×
margin. **Red-proved at 42.80 ms** with a uniform 40 ms/frame stall, which reached this assertion —
meaning every earlier bound passed it, exactly as Codex predicted.

### 🔴 BLOCKER 2 — criterion 7.7 is REPORTED FAILING, not green-but-weak

Codex is right and I was wrong to label it and move on. CLAUDE.md: *"A phase with a failing or unrun
criterion is reported failing."* 7.7's frame-loss half cannot distinguish its own proving mutation
(1.0943) from a clean run (1.0961). A gate that cannot discriminate is **unrun**, whatever colour the
suite prints.

**Status: criterion 7.7's frame-budget half is FAILING.** The assertion stays in place at 1.15 so it
still catches a gross collapse, `MAX_AUDIO_WORK_DELTA_MS` remains load-bearing, and the constant's
docstring says so — but this is recorded as a failing criterion, not a passing one, and the handoff
leads with it.

Codex also found a methodological cause worth carrying forward: **every pair samples `on` then `off`,
never `off` then `on`**, in 7.7 *and* 6.9. Warm-up and directional drift are therefore attributed to
the treatment arm rather than counterbalanced. Balanced AB/BA ordering is the first thing the
follow-up session should try.

### MAJOR 3 — the landing assertion was a proxy, not the landing

`hurt`, `attack`, `death` and a respawn all satisfy "first later state that is neither `jump` nor
`fall`" — combat states bypass the grounded-derived movement state. **Fixed:** the sampler now reads
the sim's own `grounded` flag and the spec asserts a real `!grounded → grounded` transition.

### MAJOR 4 — 6.9's resolution floor is bracketed, not measured — NOT FIXED

Codex is right that the scrim sweep establishes only that **1 layer is invisible and 5 are visible**.
It does not establish where between them the gate starts resolving, so "2.0 loses nothing" is
weaker than stated: a stable 1.25–2.0 regression is now accepted.

**Not fixed.** The 2- and 3-layer measurements were attempted and the run was interrupted; rather
than report a number I do not have, this is recorded as open. Combined with the unbalanced pair
ordering above, 6.9's GPU half needs the same follow-up session as 7.7.

### MAJOR 5 — the citation gate still false-greened, two ways

Both verified in a REPL before fixing:

- `'lines=4100'.includes('lines=410')` → **true**. A 4100-line citation exempted a 410-line file.
- `'src/scenes/Example.tsx'.includes('src/scenes/Example.ts')` → **true**. A `.tsx` citation exempted
  the `.ts` beside it.

A gate written to stop one substring coincidence had introduced two more. **Fixed:** the record is
now parsed (`SIZE-EXEMPTION: <path> lines=N`) with exact path and numeric comparison. Two more
committed fixtures cover both holes.

### MINOR 6 — stale comments the session's own account got wrong

All fixed: `prevPlayer` said "read only by `renderPlayer`" (inlined, and the 4.23 sampler now reads
it); `gamePlayerDraw.ts` said the scene keeps a one-line method (it does not); `phase-06-perf.spec.ts`
said its delta was bounded at 2 ms (it is 1 ms).

### Confirmed by Codex

- Importing `interpolatedPosition` and `renderAlpha` into 4.23 is **appropriate** — the unit suite
  supplies independent hand-computed arithmetic, and the e2e verifies the scene supplies and applies
  the live inputs.
- `perfSampler` captures `ticks` at the same stop condition as `frames` and `elapsedMs`.
- **No behaviour change or weakened DEV guard in the `GameScene` split** — setup order preserved,
  render order preserved, moved helpers retain their internal DEV checks.

### Files that crossed 400 lines again while fixing this

`phase-05-perf.spec.ts` reached 412 when the new bound landed. Split, not shaved: the `[5.11]` report
builder → `perfReport.ts`, and the GPU-renderer assertion → `realGpu.ts`, the latter **deduplicating
three copies** across the Phase 5, 6 and 7 perf specs. That is the fourth time this session's ratchet
caught its own author.

---

## 📅 When the two open items get fixed

**Decided 2026-08-17: a dedicated session BETWEEN Phase 8 and Phase 9. Phase 9 is blocked on it**
([PRD.md § Phase dependency notes](../PRD.md#phase-dependency-notes)).

- **Not in Phase 8.** Level design touches neither the audio frame budget nor the HUD's GPU cost.
  Folding it in makes it a side quest, which is precisely how the four defects this session closed got
  deferred four phases running.
- **Not after Phase 9.** Phase 9 is polish, juice and particles — per-frame cost and full-screen
  effects, which is exactly what these two gates exist to catch. Entering it with both blind is the
  wrong order.
- **One session, not two.** Both items share a suspected root cause: every A/B pair in 6.9 and 7.7
  samples `on` then `off` and never the reverse, so warm-up and directional drift are charged to the
  treatment arm instead of cancelling.
- **Owner:** `voltagent-qa-sec:performance-engineer`, two briefs *(A7)*.

Until then, and stated so no one reads a green suite as a clean bill of health:

| gate | status |
|---|---|
| criterion **7.7**, frame-budget half | 🔴 **REPORTED FAILING.** `MAX_AUDIO_WORK_DELTA_MS` is the load-bearing half. |
| **`MAX_HUD_GPU_RATIO`** | catches **gross overdraw only**; a stable 1.25–2.0× regression passes. |
