# Gate owner findings — bug-fix + perf-gate session

← [session QA log](session-bugfix-perf-gates.md) · [QA-LOG index](../QA-LOG.md)

Three owners, **two briefs each** *(vault A7)*. Brief 1 verifies the stated criteria; brief 2 asks
only *"how could this be wrong?"* and is sent **without** brief 1's findings. Every finding is
applied, or recorded with a one-line reason *(C11)*.

| owner | criteria |
|---|---|
| `voltagent-qa-sec:code-reviewer` | S.1–S.4, S.13 |
| `voltagent-qa-sec:qa-expert` | S.5–S.9 |
| `voltagent-qa-sec:performance-engineer` | S.11, S.12 |

---

## Brief 1 — verify the stated criteria

### `voltagent-qa-sec:qa-expert` — S.5–S.9

| # | verdict | finding | disposition |
|---|---|---|---|
| Q1 | **S.5 FAIL** | The three new placement fixtures are covered only by `tilemap-data.test.ts`'s directory sweep, which proves *"rejected, with a reason distinct from every OTHER fixture"* — satisfiable by three rules firing in the wrong order as long as their messages differ. `level-entities.test.ts` already had the per-message `cases` array that is the project's answer to this, and it was not extended. `bad-levels/README.md` states the blind spot in the project's own words. | **APPLIED.** Three rows added, each naming the rule *and* the object type and geometry. Red-proved with the mutation the finding names: swapping the hazard and gear branches turns exactly those two rows red (2 failed, 119 passed) while the sweep stays green. Reverted and the revert verified. |
| Q2 | S.6 PASS | Verified independently by mutating a parsed copy of the shipped `level-03.tmj` to drop a hazard on its sentry's body — refused with the hazard message, while the unmutated file returns `null`. Also confirmed `npm run assets:levels` produces zero drift, so the shipped bytes match the fixed generator. | — |
| Q3 | S.7 PASS | The strict-inequality sweep runs over all five levels with a committed red proof at one pixel of sinking, and separately asserts a spike resting exactly on the floor is **not** flagged. | — |
| Q4 | S.8 PASS | `hurts` counts the `playerHurt` **edge** (`tick.ts:301`, `worldDamage.ts:215`), the project's established hp-loss proxy *(vault 2.5)*, never a diffed hp. Red proof asserts `completed` and `hurts` separately, so "never finished" cannot be mistaken for "finished bleeding". | — |
| Q5 | S.9 PASS | New `GROUND_TOP_ROW - 1` runs in all five generators; `npm run assets:levels` shows zero drift against the shipped bytes. | — |

### `voltagent-qa-sec:code-reviewer` — S.1–S.4, S.13

The owner built a read-only mutation harness and ran the **committed** tests against three source
mutations, touching no repository file.

| # | verdict | finding | disposition |
|---|---|---|---|
| C1 | S.1 PASS | Red-proved: `noveto` fails 5 committed tests; the shipped-level sweep reproduced outside vitest gives `violations=0` clean against `violations=3` mutated. Geometry reviewed as sound — the strict `feetY > solid.y` is what stops the floor reading as a wall. | — |
| C2 | **S.2 FAIL as gated** (behaviour passes) | `expect(s.moving).toBe(false)` **survives the `noveto` mutation**: the unvetoed chaser walks through the wall to x 2106, the player is at 2200, and 94 px is inside `ENEMY_DEAD_ZONE` — so it stops for the dead zone and `moving` reads false for the wrong reason. C2 decoration. Separately, the patrol path asserts nothing about `moving` at all. | **APPLIED.** The position is now asserted alongside `moving`, and the patrol describe gained a `moving === false` assertion sampled on the vetoed tick with a non-vacuity counter. Both now fail under `noveto` — the mutation table went from 5 failures to 7. |
| C3 | **S.3 PASS with a material caveat** | The criterion names level-02's col-32 beat, and **that beat no longer exists** — A2 moved it to col 33. With no shipped body overlapping a solid, the shipped-span sweep is **vacuous against the overlap mutation** (`checked=11 short=0`). The `EVERYWHERE` half carries all the discriminating weight. | **APPLIED.** A committed fixture drives `stepScavenger` with a body that *starts* inside a wall and asserts it walks out rather than freezing; it is among the 7 tests that catch the `overlap` mutation. The sweep is kept, with its vacuity stated in the file and its remaining job named — catching a beat SHORTENED by a future veto, which is how the level-02 defect was found. |
| C4 | S.4 PASS | Patrol recovery red-proved by a third mutation (`noturn`). Notes that the chase-recovery test is near-tautological because facing is recommitted before the veto — recorded, not a defect. | — |
| C5 | S.13 PASS | No file over 400. Notes `enemyScavenger.ts` at 397 — the next comment paragraph trips the ratchet. | Recorded. |
| C6 | Low | `scavengerFooting` derived `halfWidthPx`/`heightPx` by multiplying `SCAVENGER_BOX`'s fields directly. Correct **only** because the box happens to be symmetric and sitting on the feet; `toWorld` computes `y = feetY - (box.y + box.h) * scale`. Change the box and the veto's body silently desyncs from `overlapsScavenger`'s — the exact "two representations of one body" the file's own vault 5.3 note argues against. | **APPLIED.** The footing is derived through `toWorld` at a zero origin, and the on-the-feet assumption is now **enforced with a throw**, in the style of `createScavenger`'s cooldown guard. |
| C7 | Low | No red-proof record: the QA log listed green legs only, and *"unit + committed red proof"* is not evidenced by a passing suite. | **APPLIED.** §5b of the session log carries the mutation table, both mutations, and the three assertions that were strengthened because the table showed them surviving. |
| C8 | Cosmetic | One 105-char line against a 100/101-char house norm. | **APPLIED.** Split into two statements. |
| C9 | Latent | A body in a niche narrower than `2 × halfWidth + 2 × speed` and clear of both walls flips facing every tick and never moves. No shipped level has one — 11 patrollers, 4000 ticks, `insideTicks=0`, all beats walked end to end. | **RECORDED, not guarded.** An authorship hazard rather than a live defect; noted in §6 of the session log. |

### `voltagent-qa-sec:performance-engineer` — S.11, S.12

Both criteria verified on the owner's **own** runs, not the runs the bounds were selected from.

| # | verdict | evidence |
|---|---|---|
| P1 | S.11 PASS | mutated 1.0898 / 1.0970 — both correctly RED; clean 1.0014 / 1.0014 — both PASS. No overlap, matching the recorded bands. Confirmed the assertion is live rather than downgraded to a warning, so "retire and record" was genuinely not the fix taken. |
| P2 | S.12 PASS | `scrim3` read 0.3077 ms — RED; three clean runs read 0.0041 / 0.0051 / −0.0031 ms — all PASS. Confirmed the assertion is on the **GPU** column (`0.398ms -> 0.707ms` while main-thread work moved 0.900×), and that `hudDrawGuards.ts`'s non-vacuity checks passed in every run, so a green 6.9 is not "nothing against nothing". No instability flip observed, unlike the old ratio's 0.76×/3.53× on an identical commit. |
| P3 | Caveat, flagged not blocking | **Two of five attempted clean 6.9 runs died before reaching any assertion** — `Cannot read properties of undefined (reading 'bodies')` and `Execution context was destroyed`. Traced to system contention: 31 concurrent `node.exe` processes on the box, which were this session's own parallel agents. No perf statistic was computed in either failure and the next retry passed with plausible numbers. |

**P3 disposition: RECORDED.** The cause is understood and was self-inflicted — three gate owners were
run in parallel while one of them drove Playwright on the GPU project. The lesson is procedural
rather than a code defect: **do not run a perf gate owner concurrently with other agents**, because
the harness competes for the GPU and the box. Both perf specs pass when run alone, which is how the
session's own measurements were taken. Noted here so a recurrence off this machine is not mistaken
for a new defect.

### Owner blind spots, preserved *(vault 9.3)*

- **No owner ran the browser.** Everything above is sim-level or harness-level; a scavenger can stop
  correctly in the sim and still be *drawn* overlapping the wall, because the sprite is wider than
  `SCAVENGER_BOX`. That is S.10's hands-on half and no agent substitutes for it *(vault C4)*.
- The code-reviewer's mutation harness ran the committed tests through a scratchpad vitest config
  rather than the project's own entry point. A maintainer re-proving it should edit
  `enemyGeometry.ts` directly and revert — which is how §5b's table was produced.
- The performance owner did not re-derive the full historical sweep, only corroborated the
  conclusion on fresh runs, and swept `scrim3` alone rather than the whole ladder.
- The qa-expert verified the placement geometry against one shipped level under one synthetic
  mutation, not all five under several mutation shapes.


---

## Brief 2 — the adversarial brief *(A7)*

Sent **without** brief 1's findings. The instruction was only "how could this be wrong?". Between
them the two briefs found eight defects the checklist pass had not, including two the session's own
red proofs had missed.

### 🔴 A process defect of mine, first

The qa-expert reported an **uncommitted `return null;` short-circuit sitting in
`src/game/tiledPlacement.ts`** — the whole placement validator disabled — and correctly declined to
revert someone else's in-flight work. It was the code-reviewer's mutation, applied and reverted
inside its own run; the qa-expert observed the window between.

Nothing shipped wrong: the file was verified byte-identical to `HEAD` afterwards, and the gate was
re-confirmed live against a committed fixture. But the setup was my error — **I ran a brief that was
permitted to mutate source concurrently with a brief that reads the same working tree.** Two agents,
one tree, one of them mutating, is a trap the project already has a rule for in a different form
*(C12: a mutation can sit applied in a tree that then reports green)*.

**Standing rule from here: a brief permitted to mutate source runs ALONE.** The performance owner
arrived at the same conclusion from the other direction — two of its five runs died on harness
errors under 31 concurrent node processes, all of them this session's own agents.

### `voltagent-qa-sec:code-reviewer` — adversarial

| # | severity | finding | disposition |
|---|---|---|---|
| A1 | **HIGH** | **`heightPx` was completely unmeasured.** Mutating `headY = feetY - heightPx` to `feetY - 1` — a body one pixel tall — left the **whole suite green: 1878 passed, 0 failed.** The one test naming the vertical extent parked its overhang at `y = -HEIGHT - 500`, so it passed for any height in [1, 640]: a fixture positioned so far clear that the property it claimed to measure was unreachable. The bug it cannot catch is the reported one in its vertical form — a ledge at chest height is a wall, and a too-short body walks through it. | **APPLIED.** Three assertions: a chest-height ledge that must block, an overhang clearing the head by exactly one pixel that must not, and a check that the footing reports the body the sim uses. The 1 px mutation now fails, where it previously failed nothing. |
| A2 | **HIGH/MED** | **The gate and the sim disagreed by one `patrolSpeed`.** The patrol arm tested `blocked` *before* the beat clamp, so it probed `patrolMax + patrolSpeed`, while `describePlacementProblem` measures the swept beat and nothing beyond. Measured: a wall face at `patrolMax + halfWidth` passes the gate, and the beat then runs to 8543 against an authored 8544. Worse, a niche flush against the swept box is **accepted by the gate** and strobes `facing` every tick forever — which `ENEMY_DEAD_ZONE`'s own docstring says no frame-index gate can see. This contradicts `tiledPlacement.ts`'s headline claim that gate and sim agree about "inside" *(vault 5.3)*. | **APPLIED.** `nextX` is clamped to the beat **before** the wall test, so the sim asks about the same span the gate validated. |
| A3 | MEDIUM | **Every shipped enemy has exactly zero clearance from its floor**, so a 1 px Element-Editor nudge refuses the level — and refuses it with a message about the wall veto, which would *not* have stopped that body. `tilemap.ts` rewrote the spawn-ground rule **twice** for this exact reason: the editor's primary workflow is nudging a strip a pixel or two. Not one-sided — with the feet 1 px low the sim genuinely breaks too, a patroller freezing at a seam between abutting floor strips. | **APPLIED.** `FOOT_TOLERANCE_PX = 2`, defined once in `enemyGeometry.ts` and used by **both** `blockedAt`'s foot line and the gate's swept box, so they cannot drift apart. |
| A4 | MEDIUM | `blockedAt`'s docstring justified the newly-entered rule with level-02's straddling scavenger — **which this same branch moved**. The body now clears by 36 px. The test file corrects itself 130 lines down; the source, which a reader reaches first, asserted it in the present tense. | **APPLIED.** Past tense, with the correction and a pointer to the committed fixture that now carries the case. |
| A5 | MEDIUM | `scavengerFooting`'s guard promised two things and checked one. The docstring named a non-zero `y` **or an asymmetric `x`** as desyncs; the throw tested only `y`. `blockedAt` probes `x ± halfWidthPx`, symmetric and facing-blind, while `overlapsScavenger` goes through `toWorld`, which offsets by `box.x` and reflects by facing — so `{ x: -5, w: 20 }` gives two bodies 30 px apart, with no throw and no red test. | **APPLIED.** A second throw checks the symmetry. |
| A6 | LOW/MED | **The §5b mutation table did not reproduce.** It reported counts from a two-file run without saying so, and named five of the ten tests the `overlap` mutation actually fails — missing `enemy-view.test.ts` entirely. Since that table *is* the C1/C12 record, it has to state its scope. | **APPLIED.** Re-measured over the whole suite, scope stated, third row added for the height mutation, and the `enemy-view` result explained: the animation layer reads `moving`, so a veto that freezes a patroller shows up there and nowhere else. |
| A7 | LOW | The gate picked the body box by an inline ternary, so a third slug would silently get the scavenger's 120×240 body. `spawnEnemies` two files over uses a `never` default precisely to make that a typecheck error. | **APPLIED.** Exhaustive, with an explicit refusal for an unknown slug. |
| A8 | LOW | The test derived `HALF`/`HEIGHT` from `SCAVENGER_BOX` directly — its own copy of the formula the source had just centralised — so it could not detect the footing/body desync A5 leaves open. | **APPLIED.** Both come from `scavengerFooting` now. |

**Categories the brief found clean, stated plainly:** combat through a wall (a chaser stopped at a
96 px wall cannot reach — measured, 0 swings in 600 ticks); the tick contract's step order; the
`moving` readback still having one write site; tunnelling a thin wall (needs a negative width at
shipped constants); cast discharge order in the new gate; gear geometry matching `collectGears`; and
the new boot gate itself being non-decoration (an early `return null` turns 7 tests red).

### `voltagent-qa-sec:qa-expert` — adversarial

| # | severity | finding | disposition |
|---|---|---|---|
| B1 | **HIGH** | **"Sized against 480 px, measured on the geometry they actually ship" is not supported.** The two shipped 480 px runs are not flat-ground crossings at all — they are the valley floor between two raised masses, and the policy launches from the elevated walkway, clearing the spikes by **737 px** and landing **305 px past** the far edge. Their width came from the mass spacing and from widening a run off a descent-landing spot, not from approaching a measured ceiling. Across all 18 shipped hazards the tightest clearance anywhere is 316 px. | **APPLIED.** The claim is narrowed in both the QA log and `shared.mjs`: 480 px is what a **flat** run-up clears, and the shipped valley crossings are explicitly not that. Nothing ships near a boundary. |
| B2 | — | **Confirmed the gate is not vacuous on the REAL levels.** Mutating `avoidHazards` into a no-op turned **all 15 shipped-level assertions** red, not merely the fixture's own red proof. `playerHurt` traced to the real collision path, not a stub. | Recorded in §5c. |
| B3 | — | **Confirmed a suspicion, closed.** `hazardAhead` tests a window around the FEET, so a head-height hazard is invisible to the policy — and equally invisible to the game, since `hazardHit` sweeps the feet segment only, never the body AABB. The blind spot matches the engine's own damage rule by construction. | Recorded in §5c. |
| B4 | — | Confirmed the `autoPlay` extraction left `level-completable.test.ts` byte-identical in policy, defaults and asserted fields. | — |
| B5 | LOW | **`GATE_SEEDS` is decorative for the hazard-free gate.** With enemies off nothing RNG-dependent touches movement; the three seeds produce byte-identical trajectories. It triples the assertion count without adding coverage. | **RECORDED** in §5c rather than removed — harmless runtime, and `level-completable.test.ts` carries a vault 8.2 comment explaining why seeds DO matter there, which this file inherited without the reason. |
| B6 | Minor | "All three moved" covers three different edits — a two-column shift, a leftward widening, and one that left the stretch entirely. | **APPLIED.** Spelled out. |

### Owner blind spots, preserved *(vault 9.3)*

- **Neither adversarial brief ran the browser or the e2e suite.** Everything is sim, data or
  harness level. S.10's hands-on half is untouched by any agent *(vault C4)*.
- The code-reviewer did not read the scene wiring — whether `GameScene` builds the footing once per
  level or per tick, and whether it hands the veto the same `solids` the boot gate validated.
- Neither re-ran the generators to confirm they reproduce the shipped `.tmj` bytes (the qa-expert's
  brief-1 pass did, with zero drift).
- `SENTRY_BOX`'s correctness has no sim-side cross-check, because the sentry never moves.
- The qa-expert traced two hazards frame-by-frame and the other sixteen only in aggregate.
