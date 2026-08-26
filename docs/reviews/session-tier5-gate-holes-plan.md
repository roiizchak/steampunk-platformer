# Codex plan review — `session-tier5-gate-holes`

**Model** `gpt-5.6-sol`, high effort · thread `01a0391f-739c-7fe0-8d00-cd19883d8d36` · **three rounds**,
2026-08-25. The implementation half of the pair is
[`session-tier5-gate-holes-impl.md`](session-tier5-gate-holes-impl.md).

⚠️ Same permanent constraint as every review here: **Codex's sandboxed shell cannot spawn processes on
this machine** (`CreateProcessAsUserW failed: 5`). The prompt directed it to `node_repl` +
`fs.readFileSync`, so all evidence is file-only and was **re-verified locally** before the plan was
revised.

| round | verdict | outcome |
|---|---|---|
| 1 | REVISE | **15 findings, 3 critical.** Killed §1's original design and forced three owner decisions. |
| 2 | REVISE | 10 of 15 addressed; **3 new High**, including my own greenness-count error. |
| 3 | REVISE | 5 of 8 resolved; **1 critical — the QA agent owners were missing from the closing gate.** |

**Stopped at three rounds as final arbiter.** The trajectory was convergent (15 → 3 new → 1 new
critical), and round 3's critical was a genuine omission, now closed, rather than a disagreement.

---

## Round 1 — what it killed

**§1a, the catch-up bound.** Three independent objections, each verified locally:

- *"No ticks were dropped"* is **not derivable from the current instrument.** `drainTicks` returns
  `dropped` (`frameClock.ts:49`) and `GameScene.ts:250-252` reads only `.ticks` and `.remainderMs`.
- **A tick-count statistic saturates.** `frameClock.ts:48` clamps every larger backlog to
  `MAX_TICKS_PER_FRAME = 5`, so a block changes the *frequency* of 5-tick frames without moving the
  maximum — the "mutation does not move the statistic" shape that killed the burst bound.
- *"No frame exceeds `MAX_TICKS_PER_FRAME`"* is **redundant** — already at `frame-clock.test.ts:71`
  and `:93`, and a clamped function cannot return six.
- **A busy block can measure itself**: `work` is `performance.now() - frameStart`.

**Three owner decisions were taken on that evidence**, and are binding:

1. §1 becomes a **measurement-design step**, not a promised gate — *"no orderable statistic"* is a
   permitted outcome.
2. §2a **resolves callee import identity BEFORE** growing `SIM_MUTATORS`, so nothing widens.
3. §3a's criterion rewrite is **approved, conditional** on a GPU mutation that orders the new
   statistic — *"if none does, DELETE the gate rather than re-bound it."*

**§2d (`blank()`'s regex mode) was DELETED from the plan** on finding 14: a correct JS
slash-vs-regex classifier is far more than a previous-token tracker, it moves four gate consumers, and
`src/` contains **zero** regex literals, so the defect cannot currently bite.

**One round-1 finding was wrong in my favour and still needed correcting**: it claimed honest catch-up
telemetry *necessarily* needs a ninth `__game` field. It does not — the recorder already reaches the
live scene through `window.__phaserGame` (`combatFrames.ts:116`).

## Round 2 — the three new High findings

- **`add` is not sufficient Phaser identity.** The scanner is name-based, so recognising bare
  `add.tween(…)` false-reds any unrelated object named `add`. → a legal non-Phaser acceptance fixture
  shipped, in `tween-add-factory.test.ts`.
- **My own greenness error.** I carried `2465` forward as the *expected* unit count for a plan that
  adds test files — the exact "a run that selected nothing exits 0" failure this project has been
  bitten by three times. → **every batch states its own count as `baseline + tests added`.**
- **Do not export `COUNTER_GAP`.** An assertion derived from the same implementation constant proves
  nothing. → assert independent geometric non-overlap on `hudLayout()`'s output instead, leaving
  `src/` untouched.

Also accepted in round 2: derive 5.9's sensitivity floor from **one fixed worst-case scenario over the
whole perturbation envelope**, never re-derived per mutated tuning — otherwise each perturbation picks
the window that flatters it and the sweep measures its own scenario generator.

## Round 3 — the critical omission

🔴 **The QA gate's agent owners were missing from the closing gate.** *"A criterion owned by a
`voltagent-qa-sec:*` agent is unrun until that agent has run it — twice, per (A7)."* They run **before**
the Codex implementation review, because applying their findings changes the diff Codex reviews.
Folded in as §10a, and run: six briefs across 8.7, 9.2 and 9.3.

Round 3 also caught **two clauses misfiled into the settled-docs batch** — *"the combat path stays
unmeasured and open"* and row 9's *"9.3's two scan bypasses"* wording. Both depend on outcomes this
session decides, so both moved to the after-the-work batch. And: on a no-statistic outcome, **revert
the experimental code** — a decision function with no consumer is the same defect as a burst of zero
particles.

## Where the plan turned out to be wrong about itself

Four recorded items, re-verified against source. The 2026-08-23 rate held:

| item | the record said | verified |
|---|---|---|
| 5.26 | `hudGearPop.destroy()`'s idle branch has no fixture | ❌ **STALE** — `hud-gear-pop.test.ts:237-247` is that fixture. |
| 5.17 | no e2e took the frozen-clip failure mode | ❌ **FALSE** — `phase-05-combat.spec.ts:204` samples per rAF. The real defect is that its assertion is weaker than its title. |
| PRD row 9 | all three "owed forward" items landed | ⚠️ **HALF WRONG** — the perf-spec split never happened. |
| 5.3 | algebra "accepted and never applied" | ⚠️ **MISLEADING** — `effectSweep.ts:97-108` is an explicit data-backed **refusal**. |
