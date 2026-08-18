# Phase 8 — Level design and progression: QA log

Five levels where there was one, an exit that can be reached, a save file, unlocks, a level menu and
a level-complete flow. No fal spend: Phase 8 is not a generating phase and the exit is greyboxed from
the shipped tileset, per **grey-box before art**.

Companion documents:
[`phase-08-levels-02-gate-owners.md`](phase-08-levels-02-gate-owners.md) (all six briefs, finding by
finding) · [`../reviews/phase-08-plan.md`](../reviews/phase-08-plan.md) and
[`../reviews/phase-08-impl.md`](../reviews/phase-08-impl.md) (Codex) ·
[`../evidence/phase-08/`](../evidence/phase-08/) (the hands-on screenshots).

## Phase 8 — the gate

Every browser measurement below was taken on `chromium-gpu`, renderer
`angle (nvidia, nvidia geforce rtx 4080 (0x00002704) direct3d11 vs_5_0 ps_5_0, d3d11)`, asserted by
`assertRealGpu` in **every** Phase 8 spec including the ones that measure no pixels. No Phase 8 number
comes from headless SwiftShader — *the headless harness is not the frame rate*.

Suite totals, final run: **1788 unit** across 110 files (same count with Phaser uninstalled) ·
**48 headless e2e** · **54 GPU e2e** · `npm run build` and `verify-dist` clean, five levels shipped
byte-identical. The GPU project was run **immediately after** the headless one — the contention
sequence, and the only reason these numbers are trustworthy.

⚠️ **Criterion 6.9 is UNSTABLE, and it is Phase 6's, not Phase 8's.** It passed the final full run
at **1.059x** and failed two earlier full runs at **2.97x** and **3.53x**. It is not being reported
green on the strength of one run — see
[Deviations and defects recorded](#deviations-and-defects-recorded).

| # | Criterion | Owner | State | Evidence |
|---|---|---|---|---|
| 8.1 | Every shipped `.tmj` loads, validates, and is completable | `voltagent-qa-sec:qa-expert` ×2 | ✅ | Proved **twice, differently**. `level-reach.test.ts` builds a segment graph and requires BFS from the spawn to reach the goal segment, every edge proved by running the real `tick()` from an achievable position on the source segment. `level-completable.test.ts` then plays each level to `world.completed` in the **exact shipped world** — goal, hazards, enemies, gears, `DEFAULT_TUNING` — under every `GATE_SEED`. `tilemap-data.test.ts` runs the real validator over the shipped bytes; `level-goal.test.ts` pins 9 goal-rule fixtures. |
| 8.2 | Full playthrough start → finish without a soft-lock | play | ✅ | Hands-on with `playwright-cli` on the real GPU: level-01 finished by hand, ENTER to level-02, ESC to the menu, 5 screenshots in `docs/evidence/phase-08/`. Automated half: `level-hazards.test.ts` sweeps every stall point a one-direction hold can reach in all five levels and requires every enemy to stay clear of it — scavengers by 400 px, **sentries by their own 640 px firing radius**. |
| 8.3 | Completing a level unlocks the next; save survives reload | `voltagent-qa-sec:qa-expert` ×2 | ✅ | `progress-unlock.test.ts` (the rule), `save-progress.test.ts` (the bytes, pinned against hand-written JSON rather than a round trip), `level-pick.test.ts` (the wiring), and `phase-08-progress.spec.ts` (a **real page reload** in a real browser). |
| 8.4 | Save schema tolerates a missing/corrupt file without data loss | `voltagent-qa-sec:qa-expert` ×2 | ✅ | A corrupt entry is **dropped, not repaired**, so it fails LOCKED and costs only its own unlock: asserted in the unit suite and again in the browser with `levels['level-03'] = "banana"` beside two valid entries. Reading a corrupt save does not rewrite it. A write that cannot land is held in memory for the session. |
| 8.5 | Difficulty ramp measured, spread reported — not a single headline number | `voltagent-qa-sec:qa-expert` ×2 | ✅ | The per-metric table below, plus four property assertions. **No composite score** *(vault 8.3, 5.7)*. |
| 8.6 | Level-complete flow: align, animate, fade, overlay, continue | play | ✅ | `phase-08-complete.spec.ts` plays level-01 to the exit with real key events and asserts all five steps against the DRAWN objects via `willRender(camera)` — never `visible && alpha`, which `setScale(0)` leaves truthy. Plus the hands-on pass. |
| 8.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | `voltagent-qa-sec:code-reviewer` ×2 + `voltagent-qa-sec:performance-engineer` ×2 | ✅ | Ratchet at **zero exemptions** and watched failing. Frame budget is **seven** bounds, not one: work ratio **1.00–1.20x** against 2x, level-05 work median **0.40–0.70 ms** against an 8 ms absolute ceiling, **GPU** median ratio **0.51–1.06x** against 2x, work p95 **0.60–1.20 ms** against 16 ms, and creation cost **1.04–1.53x** against 4x. Every bound red-proved — see below. |
| 8.8 | Codex plan review ran; every finding applied or recorded | — | ✅ | [`../reviews/phase-08-plan.md`](../reviews/phase-08-plan.md), 11 findings, each with a disposition. |
| 8.9 | Codex implementation review ran on the diff; every finding applied or recorded | codex | ✅ | [`../reviews/phase-08-impl.md`](../reviews/phase-08-impl.md) — the report verbatim, then the triage. **Six findings, all six applied**, two of them (save-version laundering, `__proto__` loss) re-verified by seeding the state and reading storage back before either was called real. Ran **after** the six gate-owner briefs, per CLAUDE.md §4. |

### 8.5 — the ramp, as a spread

Printed by `level-ramp.test.ts` from `LevelData` and the measured `derivedFeel`, never hand-typed.

| metric | dir | level-01 | level-02 | level-03 | level-04 | level-05 | min | max | median |
|---|---|---|---|---|---|---|---|---|---|
| length px | ↑ | 9216 | 10752 | 12288 | 13824 | 15360 | 9216 | 15360 | 12288 |
| hazard total px | ↑ | 192 | 288 | 480 | 672 | 864 | 192 | 864 | 480 |
| enemy count | ↑ | 2 | 3 | 4 | 5 | 6 | 2 | 6 | 4 |
| max rise / apex | ↑ | 0.641 | 0.641 | 0.854 | 0.854 | 0.854 | 0.641 | 0.854 | 0.854 |
| widest gap / clearable | ↑ | 0.667 | 0.667 | 1 | 1 | 1 | 0.667 | 1 | 1 |
| sentry count | — | 1 | 1 | 2 | 2 | 3 | 1 | 3 | 2 |
| scavenger count | — | 1 | 2 | 2 | 3 | 3 | 1 | 3 | 2 |
| gear count | — | 7 | 8 | 9 | 10 | 11 | 7 | 11 | 9 |
| gears off the floor | — | 3 | 3 | 4 | 4 | 5 | 3 | 5 | 4 |
| distinct surface heights | — | 3 | 3 | 4 | 4 | 4 | 3 | 4 | 4 |
| hazard count | — | 1 | 2 | 3 | 4 | 5 | 1 | 5 | 3 |
| painted % | — | 16.8 | 22.8 | 27 | 29.6 | 31.6 | 16.8 | 31.6 | 27 |

**Directional (↑) — must not decrease, and why each one is directional.** `length px`: a longer level
is more to survive without dying, whatever else it holds. `hazard total px`: the total width of
terrain that costs hp, the most direct measure of danger there is. `enemy count`: more things that
move and chase — unlike hazards they follow the player. `max rise / apex`: the tallest single step as
a fraction of the **measured** apex, so it says how close to the player's ceiling the level asks them
to jump rather than how many pixels it is. `widest gap / clearable`: the widest hole as a fraction of
the **simulated** clearable distance — 1.0 means a run-up is mandatory and no margin is left.

**Free (—), and why each one is deliberately free.** `sentry count` / `scavenger count`: the mix of
enemy kinds is a design choice, not a difficulty axis; they are here so `enemy count` cannot bless a
substitution that keeps the total. `gear count` and `gears off the floor`: optional score, not
difficulty — tying them to the ramp would make the last level a collectathon. `distinct surface
heights`: a staircase of six gentle steps is easier than one 4-tile wall and this metric cannot tell
them apart. `hazard count`: splitting one 4-tile strip into two 2-tile strips raises it and lowers the
difficulty; `hazard total px` already carries the danger. `painted %`: density is the LOOK the owner
asked for, reported so the table shows it moving, and a denser level is not a harder one.

Free is **not unwatched**: every metric is subject to the per-metric non-zero spread, the no-backslide
rule (no decrease over 25 % between consecutive levels) and the no-cliff rule (no more than doubling).

Two directional metrics **plateau on purpose** and are held at a measured ceiling: `max rise / apex`
at 0.854 and `widest gap / clearable` at 1.0. Non-decreasing, not strictly increasing — past those the
level stops being hard and starts being impossible.

## Phase 8 — the measurements

### The world, re-pinned

| | level-01 | level-02 | level-03 | level-04 | level-05 |
|---|---|---|---|---|---|
| tiles | 96 × 23 | 112 × 24 | 128 × 25 | 144 × 26 | 160 × 28 |
| px | 9216 × 2208 | 10752 × 2304 | 12288 × 2400 | 13824 × 2496 | 15360 × 2688 |
| ground top row | 20 | 20 | 20 | 20 | 21 |
| floor gaps | 1 × 2t | 2 × 2t | 2 × 3t | 3 × 3t | 4 × 3t |

`ASSET-PIPELINE.md` §0a's extent and camera-travel numbers were re-pinned to the new level-01.
`tests/unit/tilemap-data.test.ts` builds its doc needle from `LEVEL_01.widthPx`, so the prose could not
be left behind.

### 8.7 — the frame budget

Three interleaved pairs, order alternating, median of medians. Same page, seconds apart. Level-05 is
**2.9x** level-01 by area, paints **3.7x** the tiles and runs **3x** the enemies.

| bound | what it catches | measured (spread across every run this session) | final run | limit |
|---|---|---|---|---|
| work median ratio | the dense level costing more CPU per frame | **1.00–1.20x** | **1.00x** | 2x |
| work median, absolute | a cost present in **both** arms, which a ratio divides out | **0.40–0.70 ms** | **0.40 ms** | 8 ms |
| **GPU** median ratio | the cost a denser level actually incurs — 3.7x the painted tiles | **0.51–1.06x** | **1.06x** | 2x |
| work **p95** | the synchronised sentry volley a median cannot see (level-05 fires three at once) | **0.60–1.20 ms** | **0.60 ms** | 16 ms |
| **creation** ratio | the O(area) tile walk, which finishes before the sampling window opens | **1.04–1.53x** | **1.53x** | 4x |
| **creation** absolute | a level slow enough to read as a load screen | **1.7–3.4 ms** (01) · **2.1–3.2 ms** (05) | **1.7 / 2.6 ms** | 400 ms |
| the **red proof** | that the ratio bound can tell a bloated level from a clean one | **8.20–16.50x** | **16.50x** | must exceed 2x |

The **spread is reported, not a single headline** *(vault 5.7)*. It matters here: the GPU ratio was
0.51x in one session and 1.06x in another, both comfortably inside a 2x bound but a factor of two
apart from each other — which is the honest size of the measurement's own noise at these magnitudes,
and the reason a single clean run decides nothing.

**Five bounds, and each one exists because the one before it is blind to something.** The first three
were added by the performance-engineer's adversarial brief; the plan shipped with only the ratio.

- `MAX_LEVEL_WORK_RATIO` is blind to any cost present in **both** arms.
- `MAX_LEVEL_WORK_MS` (8 ms, half a 60 Hz frame) is the absolute one, and it is the same repair
  `MAX_FLEET_WORK_MS`, `MAX_HUD_WORK_DELTA_MS` and `MAX_AUDIO_WORK_DELTA_MS` were for criteria 5.11,
  6.9 and 7.7 in turn. Red-proved with a **uniform 10 ms burn**, which left the ratio at exactly
  **1.00x** while the ms bound caught **12.60 ms** — the clearest demonstration in the phase that a
  ratio is not a budget.
- The **GPU ratio** is the camera cull proved at the rasteriser rather than assumed. Between
  **0.51x and 1.06x** against **3.7x** the painted tiles is what "the camera only draws what is on
  screen" looks like when it is measured instead of stated — the drawn cost tracks the *viewport*,
  not the map.
- The **p95** is bounded at one whole 60 Hz frame rather than half of one, because it is a tail
  figure, not a budget.
- **Creation cost** was measured wrongly first, and the wrong measurement is recorded because it is
  the instructive part: timing `scene.start` → `levelId` reported **4.6 ms for both levels, ratio
  1.00x**. That is one animation frame, not construction. `installCreateTimer` wraps `create()`
  itself.

⚠️ At these magnitudes Chrome's `performance.now()` coarsening (0.1 ms) is a fifth of the signal. That
is why the committed red proof runs the **same** interleaved procedure rather than a cheaper one — a
single-sample clean ratio was observed swinging between 0.83x and 2.00x on consecutive runs.

**And the red proof was itself flaky before it was trusted.** At 4 000 bloat copies it read **3.75x,
then 2.43x, then 1.63x** — and 1.63x against a 2x bound is **red on a clean build**, which makes the
proof indistinguishable from the defect it is proving. `BLOAT_COPIES` is **30 000**, where it reads
**8.20x** and **10.25x**. A red proof that cannot reliably go red is the same defect as a gate that
cannot, one level up *(C2)*.

### 8.7 — the size ratchet

**Zero exemptions**, and watched failing in Stage 0 before any feature work: a field added to
`types.ts` turned `file-size.test.ts` red, and the revert was confirmed by *content changed **and**
the over-limit count dropped by one* — never by "the count is now zero" *(C12)*.

Seven files reached the limit during the phase and **every one was split, never shrunk** — deleting
the explanation to hit the number is the named worst failure mode of the rule:

| file | at | split into |
|---|---|---|
| `src/sim/types.ts` | 399 | `src/sim/events.ts` |
| `src/sim/tick.ts` | 400 | `src/sim/advanceSplit.ts` (`advance()` is a **loop over** the numbered order, not part of it) |
| `tools/gen/make-greybox-level.mjs` | 400 | `levelBuilder.mjs` + `make-levels.mjs` |
| `tests/unit/tilemap-data.test.ts` | 401 | `tests/unit/tilemap-docs.test.ts` |
| `src/scenes/GameScene.ts` | 407 | `publishWorldState` → `src/debug/globals.ts` |
| `tests/e2e/phase-08-complete.spec.ts` | 409, then 411 | `completeHelpers.ts`, then `levelDriver.ts` |
| `tests/unit/save-progress.test.ts` | 400 | `save-progress-durability.test.ts` |
| `tests/e2e/phase-08-perf.spec.ts` | over | `tests/e2e/levelPerf.ts` |

## Deviations and defects recorded

### 🔴 Criterion 6.9 is UNSTABLE, and it is not Phase 8's

Phase 6's HUD GPU ratio, measured across four full `chromium-gpu` runs this session:

| run | GPU ratio | verdict |
|---|---|---|
| full suite, during the adversarial pass | **2.97x** | FAIL against 2x |
| full suite, re-run | **3.53x** | FAIL |
| the 6.9 spec alone | **0.76x**, **1.01x** | pass |
| full suite, final verification | **1.059x** | pass |

**It passes and fails on the same commit**, so neither result is the answer. The tell is in the
final run's own trace, which passed: the HUD-**off** arm's three medians were
`0.381, 0.399, 0.034` ms — the third is the **0.035 ms timer floor**, not a measurement. A ratio
whose denominator intermittently stops being measurable is not a bound, whichever side of 2x it
lands on that day.

Nothing in the Phase 8 diff touches the HUD draw path, and every spec that precedes it in the run is
unchanged, so it is not attributable to this phase. It is contention between specs, and it is exactly
the class of question the standing rule says only a **same-session interleaved A/B** can settle. It
belongs to the perf-gate session already scheduled between Phase 8 and Phase 9, beside 7.7's
frame-loss half.

**It is not being reported green on the strength of the run that happened to pass.** Phase 8's own
frame budget is 8.7, and it holds on all seven of its bounds; 6.9 is Phase 6's, it is unstable, and
it is carried openly into the session that owns it rather than quietly counted as 54/54.

### The deliverable-list deviations, as planned

- **`tests/unit/level-data.test.ts` was not written.** `tilemap-data.test.ts` already *is* the
  shipped-level-data sweep, and a second near-identically-named file is how two suites answer one
  question differently. Read §5 as "extend `tilemap-data.test.ts` + `level-reach.test.ts`".
- **`curves-and-paths` (§2) was not invoked.** The levels are axis-aligned tile strips built by a
  generator; there is no curve or path in the phase for it to act on.
- **§5 omitted** `src/sim/goal.ts`, `events.ts`, `advanceSplit.ts`, `progress.ts`,
  `src/scenes/goalLayer.ts`, `gameComplete.ts`, `hudFade.ts`, `gameLevelPick.ts`, `completionGate.ts`,
  `LevelSelectScene.ts`, `src/game/save.ts`, `tiledGoal.ts`, `levelBuilder.mjs` +
  `levels/level-0N.mjs`, the `index.json` entries, the `SILENT_EDGES` decision, the goal fixtures, the
  frozen level fixture, eight new unit suites, three new e2e specs, and the `playwright.config.ts`
  `chromium-gpu` `testMatch` extension. All shipped; recorded here rather than absorbed silently.

## The gate owners, and Codex

Six gate-owner briefs — three owners, two each *(A7)*, brief 1 withheld from brief 2 — finding by
finding in [`phase-08-levels-02-gate-owners.md`](phase-08-levels-02-gate-owners.md): **27 findings,
26 applied, 1 recorded** (criterion 6.9, above).

Then the Codex implementation review in [`../reviews/phase-08-impl.md`](../reviews/phase-08-impl.md):
**6 findings, all 6 applied.** It ran **after** the owners, because applying owner findings changes
the diff Codex reads — and that ordering paid: Codex's highest-ranked finding was a bug **introduced
by** a gate owner's fix two commits earlier.

## Vault-out — Phase 8

**8.1 — prove completability, do not assert it.** Two independent proofs: a segment graph whose every
edge is proved by running the real `tick()` from an achievable position on the source segment, and a
scripted traversal of the **exact shipped world** — goal, hazards, enemies, gears, `DEFAULT_TUNING` —
under every gate seed. A jump one pixel too high goes red because the edge fails to prove and the goal
drops out of the reachable set.

**8.2 — two disjoint seed sets.** A tune set while authoring routes, a gate set the committed
assertions run under. `tick()` samples the RNG at step 1 and advances enemies at 4a, **before** player
movement, so a traversal with enemies is not seed-independent — a route that only survives its tuning
seed is a route that got lucky.

**8.3 — report the spread, never a headline.** The ramp is a per-metric table across five levels with
min/max/median, and **no composite difficulty score**. Twelve metrics, five directional with the
reason each is directional written down, seven deliberately free with the reason each is free.

**8.4 — anchor prop scale to a human figure.** The goal volume, doorways and platform thicknesses are
stated in character heights (288 px body) and checked in the Stage 6a contract test, not eyeballed.

**8.5 — space the difficulty, do not add a knob.** No global difficulty knob was added; the spacing
half applies and its evidence is the `jumpVelocity` margin sweep — a **uniform additive** reduction
under which the reachability graph must still connect.

**9.4 — a clearable-only test is satisfied by deleting the hazard.** Carried forward from Phase 3 and
it caught a live one: the spike sweep's `reached > 0` passed with every elevated summit strip
disabled. Generalising the gid-partition to all five levels is the repair.

### New, for the vault

**A flow test that reads only STATE after a transition proves the transition, not the game.** Level-02
opened with the character frozen and five separate checks stayed green — the id, the readiness flag,
the cleared banner, the persisted save, and the hands-on pass — because every one of them read state
and **none of them pressed a movement key**. After any scene transition, assert *movement*, in pixels.

**A scene INSTANCE outlives `scene.start`.** Phaser reuses it, so every field a scene mutates during
play must be reset in `init()`, never the constructor. The blocker was one such field; a second
(`completionHandled`) was added later and reset in the same place for the same reason. The audit
question is "what does this scene write to `this` that is not reset in `init()`?".

**A save that is repaired is a save that is given away.** Three separate defects, all in the same
direction: a corrupt entry coerced to `{completed:true}`; a dropped entry **erased** by the next
write; and a version the reader **refuses** re-stamped as one it trusts. The rule that survives all
three: *a reader may drop what it cannot parse, a writer may carry bytes through untouched, and
neither may ever upgrade a claim.* Every save rule needs its hostile input written as a hand-authored
JSON string — a read/write pair agreeing on a wrong encoding passes any round-trip test.

**An object whose position cannot be READ is one no gate can check.** Phaser 4's `Graphics` has no
`getBounds()`, and a `Graphics` drawing world coordinates reports its transform as `(0, 0)` however
far off the drawing is. Criterion 8.6's "align" test could not have been written correctly against
it. The fix belongs in the **code** — a positioned `Container` with children at local coordinates —
not in the test. Before asserting that a thing is drawn in the right place, check the object can
answer the question.

**A ratio is not a budget, and a percentile is not a ratio, and neither can see construction.** Four
of 8.7's five bounds exist because the bound before it was blind: the ratio divides out anything both
arms pay, the absolute ceiling cannot see a tail, the p95 cannot see the GPU, and the sampling window
opens *after* the O(area) work is done. Ask of every performance bound: **what cost does this
arithmetic make invisible?**

**A red proof that cannot reliably go red is the same defect as a gate that cannot.** 8.7's read
3.75x, 2.43x, then 1.63x against a 2x bound. Size the mutation against the **measured noise floor**,
not against intuition — at 0.4–0.8 ms medians, Chrome's 0.1 ms `performance.now()` coarsening is a
fifth of the signal.

**A flaky perf gate is a gate that has stopped measuring, not one that is nearly right.** 6.9 read
2.97x, 3.53x, 0.76x, 1.01x and 1.059x against a 2x bound on **one unchanged commit**. Averaging those
is meaningless; the diagnostic is in the arm that collapsed to the **0.035 ms timer floor**. When a
ratio's denominator can stop being measurable, fix the measurement before arguing about the bound —
and never let the run that happens to pass close the question.

**A spec that routes around the debug surface is reporting that the surface is lying.**
`LevelSelectScene` published nothing, so with the menu on screen `window.__game` still read
`sceneKey: 'Game'`, `ready: true` and a `levelId` for a level that was not loaded. The Phase 8 spec
had quietly worked around it with `scene.isActive`, and that workaround was the finding.

**A wait expressed in ticks cannot outlive the tick counter.** `world.tickCount` stops with the rest
of the sim at completion, so `window.__game.tick` freezes and any `waitTicks` on a finished level
hangs forever. Correct behaviour; a trap for the next spec, so it is stated where the freeze is
decided.
