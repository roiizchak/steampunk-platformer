# Session — three reported bugs, and the two perf gates that blocked Phase 9

← [QA-LOG index](../QA-LOG.md) · plan review: [session-bugfix-perf-gates-plan.md](../reviews/session-bugfix-perf-gates-plan.md)

**2026-08-18.** Branch `session-bugfix-perf-gates`. Not a numbered phase: the between-phases session
that PRD.md scheduled *"before Phase 9, after Phase 8"*, with three user-reported bugs added to it.

The user played the shipped Phase 8 build and reported three defects. All three were reproduced —
two from a screen recording, all three from the shipped `.tmj` bytes — before any fix was written.

---

## 1. What was wrong, and what the fix actually was

### A1 — enemies walked through walls

`stepScavenger` wrote `x` in two branches and neither tested for a wall. The chase branch consulted
`groundUnder`, which probes **downward** at `y + 1` and vetoes a step over a void; the patrol branch
consulted `solids` not at all. Nothing downstream could correct it either: step 9's
`resolveCollisions` is the **player's**, and enemies move at step 4a with no resolve pass after them.

**The veto is a NEWLY-ENTERED test, not an overlap one, and that distinction is the fix.** The Codex
plan review predicted both things a plain overlap test breaks, and both were confirmed locally before
a line was written:

| predicted | verified |
|---|---|
| the unit fixtures express "ground at every height" as ONE solid spanning the whole plane | `enemy-ai-scavenger.test.ts:35` — `{x:-1e6, y:-1e6, w:2e6, h:2e6}`. Every body in that file is permanently inside a solid. |
| level-02's first scavenger already straddles the wall its beat starts against | wall cols 30–31 = x [2880, 3072]; `patrolMin` col 32 = x 3072; half-width 60 px. Its body spans [3012, 3132] at its own authored bound. |

So `blockedAt` borrows `resolveCollisions`'s own `wasLeft`/`wasRight` rule — one rule for both, not
two that agree on the happy path *(vault 5.3)*. **You cannot be blocked by something you are already
inside**, which is also the only sane answer for a body authored half a pixel into geometry.

### A2 — a sentry stood in spikes, and gears sat inside enemy bodies

Systematic rather than a slip: every level from 03 put the summit spike and the summit gear on the
**same summit a sentry patrols**. Thirteen violations across the five levels.

Measured against the shipped bytes, using the enemy **body** (`SENTRY_BOX` 16×32 local at
`RENDER_SCALE` 6 = 96 × 192 px) rather than the patrol rectangle, since a sentry never moves:

| level | defect |
|---|---|
| 01 | gear #17 `(5616,1296)` inside sentry #9's body `[5568,5664]×[1152,1344]` |
| 02 | scavenger #15's beat starts inside the wall at cols 30–31 |
| 03 | sentry #18 **standing in** hazard #16; gear #28 inside sentry #19's body |
| 04 | sentry #21 **standing in** hazard #19; gear #33 inside sentry #23's body |
| 05 | gears #37 and #40 inside sentry #26 / #28 bodies |

Each sentry's beat was narrowed **symmetrically**, so its actual `x` is unchanged and only the
declared span shrank.

Three decisions in `describePlacementProblem`, each stated in the file:

1. **The body, not the patrol rectangle.** A sentry's beat is 480 px and its body 96 px; testing the
   rectangle would condemn five times the space the creature occupies.
2. **Body-vs-body for gears, never point-in-body.** A gear plays as `GEAR_BOX` — 72 × 72 px — not as
   its authored point. This is the Phase 6 gear-burial blindness whose disposition read *"Phase 8
   owns it"* ([phase-06-hud.md:415](phase-06-hud.md)). Raised by the Codex plan review as a MAJOR
   finding against the first draft, which tested the point.
3. **The beat is swept.** A spike halfway along it is as real as one under the spawn.

### A3 — the low ground was safe to walk

The request was to spike it so crossing is a jump. The plan's first draft named three existing tests
as the arbiters for how wide a run may be. **The Codex plan review found all three blind, and all
three claims were re-verified here:**

| gate | why it cannot see an unjumpable spike run |
|---|---|
| `level-traversal.test.ts` | reads `tests/fixtures/levels/level-01-phase07.tmj`, a frozen **retired** level. It never touches the shipped layouts. |
| `level-completable.test.ts` | its auto-player **takes the hits** — 100 hp plus respawn — and its `groundAhead` reads `level.solids` only, never hazards. It tanks across an impassable run and reports `completed`. |
| `level-hazards.test.ts` | existential: *at least one* hazard per level must hurt. |

So the session **built the oracle** rather than assuming it: `level-hazard-free.test.ts` runs the
shipped levels with enemies off and hazards treated as ground that ends, and asserts every level
finishes with hp never dropping. The policy and the two measured look constants moved to
`levelAutoPlay.ts` so both traversal gates share one definition; `level-completable.test.ts`'s
behaviour is unchanged.

---

## 2. Measurements this session produced

### The hazard-width ceiling, re-measured

`shared.mjs` recorded *"216 px clears standing, 240 needs a run-up, 252 is impassable"*. Re-measured
on the **shipped** levels with the auto-player's full run-up:

| width | result |
|---|---|
| 192 px | crosses, 0 hits |
| 288 px | crosses, 0 hits |
| 384 px | crosses, 0 hits |
| 480 px | crosses, 0 hits |
| **576 px** | **does not** |

**Both numbers are real and they do not contradict each other** — the old one was measured on the
retired level with `level-traversal.test.ts`'s approach, this one on the geometry that ships. Both
are now recorded in `shared.mjs`. The red proof had to be rebuilt at 576 px: at the 384 px the stale
figure implied, **the gate passed**. That is the argument for measuring rather than quoting, and it
cost one wrong red proof to learn.

### Width is not the only thing that matters

**A run placed where a DESCENT lands is unavoidable at any width**, because the policy — and a
player — can only react while grounded. Three shipped runs were exactly that, each found by the new
gate naming the column:

| level | run | landing |
|---|---|---|
| 02 | summit spike col 54 | the climb arrives there |
| 04 | ground cols 66–67 | the drop off platform 56–62 lands at col 66.8 |
| 05 | ground cols 64–65 | the drop lands at col 64.8 |

All three moved. This is recorded in `shared.mjs` beside the width figure, because a future author
sizing a run correctly can still place it fatally.

### Criterion 7.7 — `MAX_AUDIO_FRAME_LOSS_RATIO`, 1.15 → **1.05**

Three things were wrong, and none of them was the bound:

1. **The pairing was discarded** — `median(off) / median(on)` across the whole run, rather than the
   median of the per-pair ratios.
2. **The arm order was fixed** `on`-then-`off`, defended by a comment arguing a constant bias beats
   one that cancels. A constant bias does not cancel; it is attributed to the treatment arm.
3. **Six pairs was too few**, and the held-out run is what proved it (see §3).

At `PAIRS = 10`, one session, GPU project, RTX 4080:

```
clean    0.9927 0.9946 0.9947 0.9948 1.0000 1.0011 1.0022   worst 1.0022
mutated  1.0915 1.0961 1.0961                               best  1.0915
```

**1.05** — 4.8 % above the worst clean, 4.0 % below the best mutated, near the middle of an 8.9 % gap.

**Stated floor:** the mutation costs ~9.4 % of served frames, so this resolves roughly half of it or
worse — about 15 ms per cue. A smaller stall passes.

### Criterion 6.9 — `MAX_HUD_GPU_RATIO` **deleted**, `MAX_HUD_GPU_DELTA_MS = 0.2` in its place

The scrim mutation is committed now, so the sweep the previous session was interrupted part-way
through finally ran. `PAIRS = 10`, AB/BA, one session:

```
           ratio            paired delta (ms)
clean      0.502 - 1.692    -0.0312 .. 0.0835   (16 runs; 13 under 0.031)
1 scrim    1.263 / 1.393     0.0358
2 scrims   1.665 / 3.080     0.0328
3 scrims   1.739 / 1.821     0.0983  0.3082
4 scrims   2.770             0.1725  0.2749
5 scrims   1.678             0.1044
6 scrims   -                 0.3057
8 scrims   2.777             0.2396  0.2412  0.4019
```

**The ratio column is the finding.** Clean runs reach 1.692 while **two** full-screen scrims read
1.665, and **five** scrims read 1.678 — below a clean run. It does not order its own mutation at any
bound. Deleted, not retuned.

**Stated floor, and it is not flattering:** the replacement resolves **six or more** scrims reliably;
three, four and five are borderline, each observed on both sides of the bound; one and two are not
resolved at all. Weaker than hoped, and recorded rather than rounded away — but it is the first
version of this criterion that orders its own mutation.

---

## 3. The finding that matters most: the held-out discipline caught an overfit TWICE

Codex's plan review named this as the single most likely way the session would ship something subtly
wrong — *"another perf statistic overfit to the same run used to choose it"* — and cited the three
times this project has already done it. The plan added the countermeasure: **choose the bound on one
set of runs, confirm it on a set that had no say in the choice.**

It fired twice, on both gates.

| gate | chosen from | held-out run | outcome |
|---|---|---|---|
| 7.7 | 6 clean runs at `PAIRS = 6`, worst 1.0054 → bound **1.02** | the 7th clean run read **1.0208** | false red. `PAIRS` raised to 10, bound re-derived at 1.05 |
| 6.9 | 9 clean runs, worst 0.0307 → bound **0.06** | a 10th clean run read **0.0835** | false red. Bound re-derived at 0.2 from all 16 readings |

Both bounds would have shipped green on every run used to select them. Neither would have survived
a week.

**Final held-out confirmation, on runs used for nothing else:**

| gate | clean | mutated |
|---|---|---|
| 7.7 @ 1.05 | 0.9892, 0.9957, 0.9914 — all pass | 1.0950, 1.0764 — both red |
| 6.9 @ 0.2 | −0.0020, 0.0031, 0.0041, 0.0067, 0.0087 — all pass | scrim6 0.3057, scrim8 0.2412 / 0.4019 — all red |

## 4. Both mutations are COMMITTED

The previous perf session built its storm and scrim mutations, measured with them, and left them in
a working copy; the QA log records that as unresolved methodology debt. Both are paid here:

| criterion | mutation | driven by |
|---|---|---|
| 7.7 | 30 ms of main-thread blocking per cue that plays | `PERF_MUTATION=cue-stall`, read DEV-ONLY in `src/game/audio.ts` exactly as `?breakAsset=corrupt` is read. `verify-dist` confirms it is absent from `dist/`. |
| 6.9 | N full-screen 50 %-alpha scrims on the UI scene | `PERF_MUTATION=scrimN`, `tests/e2e/scrimMutation.ts`. It never enters `src/` at all, so it cannot leak into `dist/` however `verify-dist` is written. |

The scrims are re-applied after **every** HUD-on toggle: `stop('UI')` destroys the scene's display
list, so a mutation applied once would vanish from pair 2 onward and quietly measure nothing.

## 5. Gates that were decoration, and what replaced them

| gate | what it was | now |
|---|---|---|
| `level-entities.test.ts` "shipped solids and hazards are disjoint" | **exact rectangle equality**, on `level-01` alone. A partially sunk hazard matched nothing; so did anything at all in levels 02–05. | a real intersection sweep over all five, with its own red proof. It immediately found a level-05 run starting on a platform's last column. |
| `MAX_HUD_GPU_RATIO` | could not order its own mutation | deleted; see §2 |
| the 384 px red proof for the new hazard gate | passed, because it was sized from a stale figure | rebuilt at 576 px from a measurement |

## 6. Deliberate non-fixes, recorded

- **The `level-01-phase07.tmj` fixture is no longer byte-identical to what Phase 7 shipped.** One
  gear moved two cells, to clear the sentry body the new placement rule refuses. It changes none of
  the four shapes that file exists to probe — the pillar at x 3264, the stall at x 3198, the pit, the
  scavenger section at x 4128 — and `level-traversal.test.ts` never reads a gear. Recorded here
  rather than exempting the fixture from a gate the shipped levels must pass.
- **No spike runs were added where the geometry refused them.** A low-ground stretch bounded by a pit
  needs its run-up, and one wholly inside a scavenger's beat is refused by the placement gate. In
  those places none was added, rather than shipping a level that cannot be finished. Only level-03's
  cols 65–69 lies between two raised masses on both sides, so it is the one crossing spiked end to
  end and jumped mass-to-mass.
- **The 8.5 difficulty ramp needed rebalancing** after the additions: it read 7/8/8/10/9 tiles and is
  now 7/8/9/10/11. The ramp gate caught the regression.

## 7. Verification

| leg | result |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | **1873** passed, 112 files |
| `npm run test:sim-isolated` | **1873** passed with Phaser uninstalled |
| `npm run build` | clean; `verify-dist ok: 5 level(s) and 11 audio file(s) byte-identical, no DEV-only scene key or debug surface` |
| `npm run test:e2e` | **102** passed |
| both perf specs, re-run after the 400-line splits | pass |

The 400-line ratchet went red mid-session on `perfBudget.ts` (414) and `phase-06-perf.spec.ts` (442).
Split, not exempted: `perfBudgetRepaired.ts` takes the HUD and audio budgets — the ones that were
reported failing and now carry long measurement records — and `hudDrawGuards.ts` takes 6.9's
non-vacuity assertions.
