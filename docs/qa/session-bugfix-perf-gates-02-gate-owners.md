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
