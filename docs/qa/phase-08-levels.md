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

Suite totals: **1749 unit** (1749 with Phaser uninstalled) · **48 headless e2e** · **53 GPU e2e** ·
`npm run build` and `verify-dist` clean, five levels shipped byte-identical.

| # | Criterion | Owner | State | Evidence |
|---|---|---|---|---|
| 8.1 | Every shipped `.tmj` loads, validates, and is completable | `voltagent-qa-sec:qa-expert` ×2 | ✅ | Proved **twice, differently**. `level-reach.test.ts` builds a segment graph and requires BFS from the spawn to reach the goal segment, every edge proved by running the real `tick()` from an achievable position on the source segment. `level-completable.test.ts` then plays each level to `world.completed` in the **exact shipped world** — goal, hazards, enemies, gears, `DEFAULT_TUNING` — under every `GATE_SEED`. `tilemap-data.test.ts` runs the real validator over the shipped bytes; `level-goal.test.ts` pins 9 goal-rule fixtures. |
| 8.2 | Full playthrough start → finish without a soft-lock | play | ✅ | Hands-on with `playwright-cli` on the real GPU: level-01 finished by hand, ENTER to level-02, ESC to the menu, 5 screenshots in `docs/evidence/phase-08/`. Automated half: `level-hazards.test.ts` sweeps every stall point a one-direction hold can reach in all five levels and requires every enemy to stay clear of it — scavengers by 400 px, **sentries by their own 640 px firing radius**. |
| 8.3 | Completing a level unlocks the next; save survives reload | `voltagent-qa-sec:qa-expert` ×2 | ✅ | `progress-unlock.test.ts` (the rule), `save-progress.test.ts` (the bytes, pinned against hand-written JSON rather than a round trip), `level-pick.test.ts` (the wiring), and `phase-08-progress.spec.ts` (a **real page reload** in a real browser). |
| 8.4 | Save schema tolerates a missing/corrupt file without data loss | `voltagent-qa-sec:qa-expert` ×2 | ✅ | A corrupt entry is **dropped, not repaired**, so it fails LOCKED and costs only its own unlock: asserted in the unit suite and again in the browser with `levels['level-03'] = "banana"` beside two valid entries. Reading a corrupt save does not rewrite it. A write that cannot land is held in memory for the session. |
| 8.5 | Difficulty ramp measured, spread reported — not a single headline number | `voltagent-qa-sec:qa-expert` ×2 | ✅ | The per-metric table below, plus four property assertions. **No composite score** *(vault 8.3, 5.7)*. |
| 8.6 | Level-complete flow: align, animate, fade, overlay, continue | play | ✅ | `phase-08-complete.spec.ts` plays level-01 to the exit with real key events and asserts all five steps against the DRAWN objects via `willRender(camera)` — never `visible && alpha`, which `setScale(0)` leaves truthy. Plus the hands-on pass. |
| 8.7 | No file > 400 lines; diff reviewed; adversarial pass; frame budget | `voltagent-qa-sec:code-reviewer` ×2 + `voltagent-qa-sec:performance-engineer` ×2 | ✅ | Ratchet at **zero exemptions** and watched failing. Frame budget: level-05 vs level-01 **1.00x** against a 2x bound, level-05 **0.50 ms** against an 8 ms absolute ceiling. Both bounds red-proved — see below. |
| 8.8 | Codex plan review ran; every finding applied or recorded | — | ✅ | [`../reviews/phase-08-plan.md`](../reviews/phase-08-plan.md), 11 findings, each with a disposition. |
| 8.9 | Codex implementation review ran on the diff; every finding applied or recorded | codex | ⏳ | [`../reviews/phase-08-impl.md`](../reviews/phase-08-impl.md). |

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

Three interleaved pairs, order alternating, median of medians. Same page, seconds apart.

| arm | work median per frame | verdict |
|---|---|---|
| level-01 (96 × 23, 16.9 % painted, 2 enemies) | 0.40, 0.70, 0.50 → **0.50 ms** | |
| level-05 (160 × 28, 31.8 % painted, 6 enemies) | 0.40, 0.80, 0.50 → **0.50 ms** | ratio **1.00x** against a bound of 2x |

**Both bounds exist because a ratio alone is not a frame budget.** `MAX_LEVEL_WORK_RATIO` is blind to
any cost present in both arms; `MAX_LEVEL_WORK_MS` (8 ms, half a 60 Hz frame) is the absolute one, and
it is the same repair `MAX_FLEET_WORK_MS`, `MAX_HUD_WORK_DELTA_MS` and `MAX_AUDIO_WORK_DELTA_MS` were
for criteria 5.11, 6.9 and 7.7 in turn.

⚠️ At these magnitudes Chrome's `performance.now()` coarsening (0.1 ms) is a fifth of the signal. That
is why the committed red proof runs the **same** interleaved procedure rather than a cheaper one — a
single-sample clean ratio was observed swinging between 0.83x and 2.00x on consecutive runs.

## Vault-out — Phase 8

*(filled at the end of the phase)*
