# The bug-fix session — QA gate

Flat sibling of [`session-bugfix-tiers.md`](session-bugfix-tiers.md), which holds the A0
reconciliation table and the per-item record. This file holds **only the gate**: the criteria, who
owns each, what they found, and the disposition of every finding *(C11)*.

**An Owner column is an instruction, not a label** *(CLAUDE.md §3)*. A criterion owned by an agent is
**UNRUN** until that agent has run it **twice** *(A7)* — brief 1 verifying the criterion, brief 2
asking only *"how could this be wrong?"*, **with brief 1's findings withheld from brief 2**.

## How the owner agents were run

Ten agents, five owner types, two briefs each, **every one under `isolation: "worktree"`** — the §9
rule, written after six Phase 8 agents corrupted the shared tree and a commit captured it.

A git worktree shares `.git` but **not** `node_modules`, so none of the ten could run `npm`, `vitest`,
`tsc` or Playwright. That is deliberate here rather than merely tolerated: `test:e2e` shares port
5173 and `test-results/`, and its wall-clock-bounded specs read a busy box as a broken game — ten
concurrent agents each starting a dev server is the exact shape that once failed seven specs for no
reason. Every brief carried the prohibition explicitly.

The consequence is stated rather than hidden: **their findings are file-evidence only**, the same
standing as Codex's, and *"a subagent's summary is a claim, not evidence"* — every finding below was
**re-verified locally** before it was dispositioned. Where a criterion genuinely needs a rendered
frame or a measured run, the agent was instructed to say so rather than round it to PASS, and the
orchestrator ran it.

---

## S.5 · The mechanical non-negotiables — Owner `—`

No agent owns this one; four checked-in gates do. Run 2026-08-23 on the approval revision.

| check | gate | result |
|---|---|---|
| No new dependency | `git diff main...HEAD -- package.json` | **no dependency line changed** at all |
| Phaser pinned exact | `node_modules/phaser/package.json` after `test:sim-isolated` | **4.2.1**, restored |
| `src/sim/` boundary intact | `tests/unit/sim-boundary.test.ts` + `npm run test:sim-isolated` | **2257 passed / 3 skipped (145 files)** with Phaser uninstalled |
| No file over 400 lines without a citation | `tests/unit/file-size.test.ts` | pass |
| Docs contract | `tests/unit/docs-contract.test.ts` | pass |
| Art direction lock | `tests/unit/style-lock.test.ts` | pass — **no hash edited this session** |
| **Tick contract not renumbered** | `git show main:src/sim/tick.ts` step list vs `HEAD` | **byte-identical** |
| `window.__game` still eight fields | `src/debug/globals.ts` `GameDebugView` | **8** — `sceneKey`, `tick`, `player`, `score`, `health`, `levelId`, `ready`, `bootError` |

The four lock suites were run together and read positively: **`PASS (143) FAIL (0)`**.

⚠️ The tick-contract check is the one worth keeping. This session changed **what happens inside**
steps 4a, 7, 9b and 9d, and added a `goalReached` edge — every one of those is a change combat timing
is expressed against. Diffing the *numbered list itself* against `main` is what distinguishes a
lettered insert from a renumber, and it is a two-line check nobody had written down before.

## S.10 · Full sweep, counts read positively — Owner `—`

Against Phase 9's closing baseline. **The count is read, never the exit code** — a run that selected
nothing exits 0.

| check | Phase 9 baseline | this session | verdict |
|---|---|---|---|
| typecheck | clean | **clean** | — |
| unit | 2154 passed / 0 failed (133 files) | **2260 passed / 0 failed (145 files)** | +106 tests, +12 files |
| build | `verify-dist ok`, 5 levels + 11 audio byte-identical | **`verify-dist ok`, 5 levels + 11 audio byte-identical, no DEV-only scene key or debug surface in 1 bundle** | — |
| `test:sim-isolated` | 2151 passed / 3 skipped | **2257 passed / 3 skipped (145 files)** | Phaser restored to 4.2.1 |
| e2e | 118 passed / 1 failed (criterion 1.4) | **held until the ten owner agents finish** — one Playwright run at a time, and nothing heavy beside it | see below |

The e2e arm is deliberately **not** run concurrently with the gate owners. Recorded here rather than
quietly deferred, because a green e2e taken on a loaded box is worth less than no e2e at all.
