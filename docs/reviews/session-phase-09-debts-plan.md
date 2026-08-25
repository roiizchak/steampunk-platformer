# Codex PLAN review — Phase 9's debts session (2026-08-24)

**Verdict: BLOCK.** Eight findings. **All eight re-verified locally and all eight applied before any
code was written**, which is why the session's plan differs from the one Codex was handed.

⚠️ Codex's sandboxed shell cannot spawn processes on this machine (`CreateProcessAsUserW failed: 5`).
The review ran through the `node_repl` MCP tool with `fs.readFileSync`, so **every finding is file
evidence only** and each was re-checked locally before being acted on. The "Could not check" list at
the end is the honest boundary of what this review could see.

## Findings

| ID | severity | finding | verified locally | disposition |
|---|---|---|---|---|
| PR-01 | blocker | "Exactly one row in the slice" is the wrong repair for §1f — Phase 4 legitimately has duplicate rows; the `✅` filter selects **8** phases, not 9 | ✅ `docs/qa/phase-04-art.md` carries two rows each for 4.2b/4.16/4.27; PRD row 4 is `⚠️ merged with known debt`; the filter yields 8 | **APPLIED** — Batch 4 parses a *designated* table, adds Phase 4 as a regression case, corrects the count and records the exclusion as a blind spot |
| PR-02 | blocker | The bracket-access fix stays false-green: `blankFor('code')` blanks string CONTENTS, so no regex can ever see `tweens['killTweensOf']` | ✅ `sourceScan.ts:43` — the `'code'` view blanks comments **and** string literals | **APPLIED** — Batch 3 changes the **view** to `code+strings`, adds quote and optional-chaining coverage, and requires every fixture to pass through the production blanking path |
| PR-03 | blocker | A handle-rooted regex cannot enforce the §1e rule; `saveProgress` does not exist; `playerInputEnabled` is real state; excluding entity spawn/removal is a hole | ✅ `save.ts:264` is `writeProgress`, no `saveProgress` anywhere on the tree; `gameInput.ts:114` | **APPLIED** — Batch 5 restated by **ownership**, a real parser recommended, real API names used, entity spawn/removal included, and a narrow-the-claim fallback made explicit |
| PR-04 | blocker | `MIN_STORM_WORK_DELTA_MS` is **Guard 2, a premise**, not a bound — the plan had classed it as one of the four to soften | ✅ `phase-09-perf.spec.ts:291` — `// ── Guard 2: the amplifier amplified` | **APPLIED** — it stays hard; exactly four assertions go soft |
| PR-05 | blocker | Fixed N does not equalise `atLimit()`; a capped emitter returns before emitting, so a naive combat measurement can time a **rejected** burst | accepted — consistent with entry 43's mechanism and `ParticleEmitter.js:2698-2703` | **APPLIED** — Batch 7 rewritten around matched arms, reserved-and-verified headroom, admitted-and-drawn assertions and event-aligned per-pair deltas. ⚠️ And this finding turned out to be the session's most load-bearing: the shipped caps pin a combat burst at **32 sparks / ~85 particles**, which is why §1a's cost bound could not close at all |
| PR-06 | high | `samples` is a differently-shaped sleep; the draw site presses Jump though the player spawns airborne; only one of the three `run:` sites was to be reproduced failing | ✅ `world.ts:171-172` — the player spawns `grounded: false, state: 'fall'` | **APPLIED** — per-site conditions, deletion preferred over reshaping, a `grounded` wait for the draw site, all three reproduced |
| PR-07 | medium | Batch 6 refused to restructure while Batch 7 lands in "the restructured spec"; `PERF_MUTATION` routing left unresolved | ✅ module-level selector, one `test()` at `:150` | **APPLIED** — Batch 6 gained a routing prototype and a new gate criterion **S8**. Batch 7 ultimately landed in its own spec file, which removes the shared-selector problem entirely |
| PR-08 | low | "Six batches" announced, seven enumerated | ✅ | **APPLIED** — seven throughout |

## Could not check (Codex's own list)

No command execution, so: any test, typecheck or build result; whether the three `run` waits fail
under comparable load; actual `expect.soft` reporter output; the current perf wall-clock; any
fixed-N measurement, held-out stability or combat-statistic ordering; runtime animation-frame
ordering between Phaser's render and the storm top-up; git revision or worktree state.

**Every one of those was a local verification this session owed, and every one was done** — the
measurements are in `docs/qa/session-phase-09-debts-02-perf.md`, the sweep in
`docs/qa/session-phase-09-debts-03-gate.md`.

## What the plan review did NOT catch

Recorded here because a review's misses are worth as much as its findings, and the implementation
round found things this round could have:

- **The inverted `iFrameCounter` pin** — the session's one critical bug. Codex reviewed a plan, and
  the plan did not name a value; the bug was invented during implementation. Caught by the
  adversarial performance brief instead.
- **`declarations()` skipping `ObjectPattern`** — PR-03 named destructuring **explicitly**, the plan
  recorded it APPLIED, and the implementation did not close it. The finding was right and the
  application was incomplete: *a disposition of "applied" is a claim like any other.*
