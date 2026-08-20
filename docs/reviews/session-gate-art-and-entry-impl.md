# Codex implementation review — the gate-art + gate-entry session

Run 2026-08-20, after the gate-owner agents and after their findings were applied, so the diff Codex
read is the one their fixes produced. The plan review's pair is
[session-gate-art-and-entry-plan.md](session-gate-art-and-entry-plan.md).

⚠️ Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`),
so the review prompt directed it to `node_repl` + `fs.readFileSync`. That restores file **reading**,
not command **execution** — every finding below is file-evidence only and **every one was re-verified
locally by driving the sim before anything was changed.**

---

## The verdict, verbatim

> **BLOCK** — the implementation has two high-severity gate-entry defects, and G.7b's performance
> result does not measure the total cost it claims. No simulation-boundary blocker was found. No
> files were modified.

### Findings

> **1. High — jump is not locked on the arming tick, creating reachable invisible-but-uncontained
> entries.** `entryLocked` is cached before any work that can arm the run-in (`src/sim/tick.ts:166`).
> Step 7 accepts a grounded jump while `entryLocked` is still false (`tick.ts:295`), integrates it
> (`tick.ts:308`), and only then arms at 9d (`tick.ts:342`, `src/sim/goal.ts:327`). The arming-tick
> test mashes only `attackPressed` (`tests/unit/goal-entry.test.ts:134`); the jump-lock test starts
> only after the sequence is already armed (`goal-entry.test.ts:218`). Result: a short arming-tick hop
> can stay vertically overlapping but uncontained, fully faded (`src/render/playerView.ts:132`) while
> not fully inside the trigger (`goal.ts:369`). Fails G.4, G.5's intended coupling, and G.6.
>
> **2. High — the `GOAL_ENTRY_TICKS * 2` ceiling ends one counter episode but doesn't terminate the
> sequence.** At counter 41 the ceiling writes `null` (`goal.ts:364`); if still overlapping and not
> hurt, the next tick immediately rearms to `0` (`goal.ts:327`) — no cooldown/latch. An uncontainable
> player cycles ~41 locked/fading ticks, one free tick, repeat. The regression test only checks the
> longest single armed span, never that the player stays released afterward
> (`tests/unit/goal-entry-cancel.test.ts:101,107,120`) — the clearest case of a test passing while
> the named behavior stays broken.
>
> **3. Medium — G.7b measures marginal cost of 40 co-located identical copies, not one exit's total
> cost.** `(41 exits − 1 exit) / 40` (`tests/e2e/phase-08-gate-perf.spec.ts:275,283`) omits any fixed
> first-gate cost and may be skewed by shared batching/overdraw; only proves `manyGpu > oneGpu`
> (line 299), not linearity. G.7b remains unproved.
>
> **4. Low — stale prose in live contracts**: `goal.ts:14` header, `src/sim/types.ts:323,335`,
> `src/scenes/goalLayer.ts:27` ("drawn rect IS the trigger rect"), `tools/gen/promptWorld.mjs:256`,
> `tests/unit/shipped-gate.test.ts:178`, `docs/HANDOFF.md:29,35` — all still describe the superseded
> equal-size/overlap-only behavior.

### G.1–G.9 summary

> G.1/G.1b source-satisfied (runtime unverified) · G.2 satisfied · G.3 satisfied only for the normal
> grounded route · **G.4 fail** (jump not locked on arm tick) · G.4b satisfied · **G.5 fails
> behaviorally** (alpha can hit 0 before containment) · **G.6 fails** by the jump/ceiling
> reachability path · G.7a policy-satisfied with the documented 428-line `tick.ts` exemption ·
> **G.7b unproved** · G.8 satisfied (12 findings triaged) · G.9 performed here but stays open until
> filed and every finding applied/recorded.

### R1–R9

> R1 **not defensible** — cited coverage omits the arming-tick jump, talking past finding 1. R2–R9
> all judged defensible, with specific citations in the full report above (R6 and R9 particularly
> well-grounded against alternative measures already in `shipped-gate.test.ts` and the QA log).

### Could not check

> Codex could not run git, typecheck, unit/e2e/isolated-sim tests, the build, or a browser; could not
> launch Phaser or reproduce hands-on routes; could not validate the recorded RTX 4080 measurements.
> It could and did read every requested file (including visually inspecting the shipped PNG) via
> `node_repl` + `fs.readFileSync`.

---

## Triage

Every finding re-verified locally first. Two were confirmed by driving the sim, one was confirmed as
a fair objection to an inference, and one was a list of stale sentences.

| # | Sev | Verified locally? | Disposition |
|---|---|---|---|
| **1** | High | **Mechanism yes, harm no** | **APPLIED**, and it took three attempts. |
| **2** | High | **Yes, and worse than described** | **APPLIED** — the ceiling latches now. |
| **3** | Medium | **Fair objection** | **APPLIED** — the spec measures linearity instead of assuming it. |
| **4** | Low | Yes, all six sites | **APPLIED** — all corrected. |
| **R1** | — | Yes, Codex is right | **REOPENED and closed** — R1's reasoning depended on coverage that did not exist. |

### Finding 1 — the arming-tick jump

**The mechanism is real.** `entryLocked` is cached before step 1 and 9d arms at the end of the tick,
so a jump pressed on exactly the arming tick fires. Driven: pressing jump on that tick leaves the
courier airborne with `vy -24.3` and the counter at 0.

**The harm Codex predicted could not be reached.** Holding jump the whole way in, the hop lasts 11
ticks of a 20-tick window, the body lands at counter 11 and is contained by 14, and the level
completes at 20 with **0 ticks drawn at alpha 0 while uncontained**. But *"I could not reach it"* is
not *"it cannot happen"* — the margin is a tuning coincidence, and `runMax`/`jumpVelocity` are live
Playground knobs.

**Two fixes were tried and thrown away before the one that shipped, and both failures are worth more
than the fix:**

1. **A position test at step 7** — `entryLocked || overlapsGoal(world)`. Useless, and instructively
   so: step 7 runs before step 8 integrates the body, so on the arming tick it reads the player's
   PREVIOUS position, reports "not in the doorway", and blocks nothing. Measured: the jump still
   fired, `grounded false`, `vy -24.3`. Reverted.
2. **Refusing to arm off the ground.** It worked — and it took `level-completable.test.ts` red on
   four seeds. The auto-player jumps when the ground ahead runs out, and on every shipped level the
   floor ends just past the exit, so it hops at the threshold, sailed over the doorway, and finished
   at x 3338 with the goal at 1600–1792 and **zero grounded ticks while overlapping**. That gate
   exists for exactly this, and this session's own plan said a completability failure is a real
   defect and not a test to update. Reverted.

**What shipped: the counter freezes while airborne.** The sequence still arms mid-hop, so
`goalEntryDir` still steers the body toward the centre through the air and lands it inside — which
is how an airborne arrival ever completed, and what fix 2 destroyed. But the fade measures *walking
in*, and you do not walk through air, so alpha holds at 1 until the feet are down.

The claim the gate now makes is therefore not *"you cannot jump"* — you can — but the one a player
can actually see: **the courier is never drawn faded while off the ground and outside the door.**
Asserted on the alpha, and watched red with the freeze removed.

### Finding 2 — the ceiling was a blink, not a release

**Confirmed, and the numbers are worse than the description.** Driven against a blocked doorway with
`right` held, over the last 120 ticks of a 300-tick run: **the player was free for 3.** Locked and
invisible for ~41, in control for 1, repeat.

Codex's reading of the test is exactly right and is the most useful sentence in this review: the
assertion measured the longest single armed span, which stayed under the ceiling **because the
ceiling worked**, so it passed while the behaviour it was named for stayed broken.

**APPLIED** — `World.goalEntryBlocked`, set when the ceiling fires and cleared only when the body
stops overlapping the rect. After: **120 free ticks in 120.** The new assertion measures the right
quantity — how much of the window the player owns — and goes red with the latch removed.

`overlapsGoal` is false for a dead player, so a respawn clears the latch too, which is what keeps the
level winnable after the ceiling has fired.

### Finding 3 — marginal cost is not total cost

A fair objection to an inference rather than a defect in code: dividing `(41 − 1) / 40` hides any
fixed first-gate cost and any batching or overdraw path that forty co-located copies take and one
image does not.

**APPLIED, by measuring the thing rather than arguing about it.** The spec now takes the same
estimate at **two** amplifications, 20 and 40, and fails if they disagree by more than 4x — because
if the cost scales with the number drawn, the two agree, and if it does not, the division is not a
per-exit figure and the gate should say so instead of reporting a number.

Measured: **0.0037 ms/exit at 20 copies, 0.0060 ms/exit at 40** — a spread of **1.6x**. The
inference holds and G.7b is proved rather than asserted.

### Finding 4 — stale prose

All six corrected: `goal.ts`'s header state machine (which was missing the hold, the release and the
latch), `goalLayer.ts`'s *"the drawn rect IS the trigger rect"*, `promptWorld.mjs`'s `192 x 288`,
`shipped-gate.test.ts`'s test name, and `HANDOFF.md`. `types.ts`'s two sites were already rewritten
by the same change that added `goalEntryBlocked`.

The one worth keeping is `goalLayer.ts`: the section is now *"the drawn gate is ANCHORED to the
trigger rect"*, because **the part that mattered survived** — the drawing takes its position from
`LevelData.goal` and computes no geometry of its own. Only the equal size was ever coincidental, and
saying so is more useful than deleting the paragraph.

### R1 — Codex is right, and the reopening closed it

R1 recorded that G.4's *"unit + e2e"* method was really unit-only for the lock half, on the grounds
that the unit test drives the production `tick()` end to end so no browser glue is untested. Codex
points out that reasoning talks past finding 1: the unit coverage **omitted the arming tick**, which
is precisely where the lock does not hold.

**R1 is withdrawn as written.** The gap it waved through is now covered by the arming-tick alpha test
above, and the remaining claim — that no browser glue sits between the input snapshot and the lock —
is true but was never the reassurance R1 offered.

---

## What Codex could not check, and what was done about it

Everything in its "could not check" list was run locally at the tip after these fixes:

| | |
|---|---|
| `npm run typecheck` | clean |
| `npm test` | 116 files / 1946 tests, 0 failed |
| `npm run test:sim-isolated` | same, with Phaser uninstalled |
| `npm run test:e2e` | see the QA log's final verification |
| `npm run build` | `verify-dist` clean |
| G.7b's RTX 4080 figures | re-measured, plus the new linearity check |

Its `tick.ts` line count (428) was correct when it read the file and is now **434**; the citation in
`docs/qa/phase-08-gate-entry.md` was updated with it. `src/sim/goal.ts` crossed 400 during these
fixes and was **split** rather than exempted — `goalGeometry.ts` now holds the two predicates, on the
precedent `combat.ts` set with `combatTiming.ts`.
