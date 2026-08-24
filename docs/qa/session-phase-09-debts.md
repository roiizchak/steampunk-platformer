[← QA-LOG index](../QA-LOG.md) · [next-session prompt](../SESSION-PROMPT-next.md)

## Session — Phase 9's debts (1a–1f) + the stale citations

**Branch:** `session-phase-09-debts` · **Started:** 2026-08-24, off `main` at `3a0a566`
(the docs commit on top of the `a8e4fa1` baseline).

**Scope:** the six debts Phase 9's close recorded (`docs/SESSION-PROMPT-next.md` §1a–§1f) plus §0's
stale `:line` citations. **Out of scope and deliberately so:** the Tier-5 items (§2), the
`brass-sentry/idle` re-shoot (§3), the `play`-owned captures (§4), and Phase 10.

**Baseline this session must not regress:**

| check | baseline 2026-08-24 |
|---|---|
| typecheck | clean |
| unit | 2417 passed / 0 failed (160 files) |
| build | `verify-dist ok: 5 level(s) and 12 audio file(s)`, byte-identical |
| `test:sim-isolated` | 2414 passed / 3 skipped, phaser restored to 4.2.1 |
| e2e | 128 selected, 128 passed |

---

## Owner authorisation on record — §1e, the new architectural rule

`SESSION-PROMPT-next.md` §1e and working rule 8 both mark the game-state-write rule a
**STOP-and-ask**, because closing it means inventing a new architectural rule and 9.2 is not the
criterion that authorises inventing one.

**The owner was asked before any code was written and answered "implement a rule now"** —
2026-08-24, at plan time. That is the approval the STOP requires. It is recorded here so a later
reader does not find an architectural rule with no visible authorisation behind it.

The rule as authorised is written up in Batch 5 below.

---

## The Codex plan review — ran BEFORE approval, verdict BLOCK

Per [PRD.md § The Codex review protocol](../PRD.md) and the workflow's two-review rule, the plan
was reviewed by Codex **before** the owner approved it. Session `01a0348a-5929-7963-911b-290baf329c38`.

**Verdict: BLOCK** — five blockers, one high, one medium, one low. ⚠️ **Codex's sandboxed shell
cannot spawn processes on this machine**, so the prompt directed it to `node_repl` +
`fs.readFileSync` and every finding is file-evidence. **All eight were re-verified locally before
being applied**; none was taken on trust.

| ID | severity | finding | local verification | disposition |
|---|---|---|---|---|
| PR-01 | blocker | "Exactly one criterion row in the whole phase slice" is the wrong repair — Phase 4's log legitimately carries two unbolded rows each for 4.2b, 4.16, 4.27; and the lint's `✅` filter selects **eight** phases, not nine | ✅ confirmed — the rows exist; PRD row 4 reads `⚠️ merged with known debt`; the filter yields 8 | **APPLIED** — Batch 4 parses the designated criterion-verdict table instead, adds Phase 4 as a regression case, and corrects the count |
| PR-02 | blocker | The bracket-access fix would stay false-green: `blankFor('code')` blanks **string contents**, so `tweens['killTweensOf'](x)` reaches the regex as `tweens['            '](x)` and no pattern extension can see it | ✅ confirmed — `sourceScan.ts:43` documents `'code'` as "comments AND string literals blanked" | **APPLIED** — Batch 3 changes the **view** to `code+strings`; fixtures must pass through the production blanking path |
| PR-03 | blocker | A handle-rooted regex cannot enforce the rule (misses `scene.simWorld.player.hp = 0`, aliases, destructuring); **`saveProgress` does not exist**; `playerInputEnabled` is real control state; excluding entity spawn/removal is a hole | ✅ confirmed — `src/game/save.ts:264` is `writeProgress` and no `saveProgress` exists anywhere in `src/`; `gameInput.ts:114` | **APPLIED** — Batch 5 restated by **ownership**, TS compiler API preferred (already a frozen dev dep), real names used, narrow-the-claim fallback made explicit |
| PR-04 | blocker | `MIN_STORM_WORK_DELTA_MS` is **Guard 2**, a premise, not a bound — soft-failing it would let execution continue into the `exponent` and `perParticle` assertions it licenses | ✅ confirmed — `phase-09-perf.spec.ts:291` reads `// ── Guard 2: the amplifier amplified` | **APPLIED** — it stays hard; exactly four assertions go soft |
| PR-05 | blocker | Fixed N does **not** equalise `atLimit()` between combat-on and combat-off arms; a capped emitter returns before emitting, so the measurement can time a **rejected** burst | accepted — consistent with 9.8 entry 43's mechanism and `ParticleEmitter.js:2698-2703` | **APPLIED** — Batch 7 rewritten: matched arms, reserved and verified headroom, admitted-**and-drawn** assertions, event-aligned per-pair deltas as the primary statistic |
| PR-06 | high | A sample-count wait is a differently-shaped sleep; the draw site presses Jump though the player spawns airborne; only `:113` was to be reproduced though three sites change | ✅ confirmed — `src/sim/world.ts:171-172` is `grounded: false, state: 'fall'` | **APPLIED** — per-site conditions, deletion preferred over reshaping, a grounded wait for the draw site, all three reproduced failing |
| PR-07 | medium | Batch 6 refuses to restructure while Batch 7 lands "in the restructured spec"; `PERF_MUTATION` routing across two tests unresolved | ✅ confirmed — module-level selector, one `test()` at `:150` | **APPLIED** — Batch 6 gains a routing/wall-clock prototype step; new criterion **S8** |
| PR-08 | low | "Six batches" announced against seven enumerated | ✅ confirmed | **APPLIED** — seven batches, seven commits |

**What Codex could not check** *(kept, per vault 9.3 — a gate's blind spots are part of its result)*:
any test, typecheck, build or Playwright result; whether the three `run` waits fail under comparable
load; actual `expect.soft` reporter output; current perf wall-clock, fixed-N measurement, held-out
stability or combat-statistic ordering; runtime animation-frame ordering between Phaser's render and
the storm top-up; git revision or worktree state. **Every one of those is a local verification this
session owes**, and each is carried as a criterion in the gate below.

---

## Batch 1 — the stale `:line` citations. **There were FIVE, not four.**

§0 of the next-session prompt named four stale citations inside `phase-09-polish.md`'s own gate
table: `:1363`, `:1485`, `:1518`, `:1562`. Reading the file found a **fifth** of the same shape.

**The drift is a uniform 76 lines**, which is what made the mapping checkable rather than guessed:
every stale number plus 76 lands exactly on the heading it was written for.

| stale citation | what it was written for | now |
|---|---|---|
| `:1363` | the two §9.8 entries a round wrote | §*"The two §9.8 entries this round wrote"* (`:1439`) |
| `:1485` | item 32 closed by hands-on judgement | §*"9.8 item 32 — CLOSED by hands-on judgement, 2026-08-22"* (`:1561`) |
| `:1562` | item 32 re-judged on the fixed build | §*"9.8 item 32 — re-judged on the fixed build, and why the first approval did not count"* (`:1638`) |
| `:1518` | the Codex implementation round | §*"Criterion 9.11 — the Codex implementation round, and what it cost to close"* (`:1594`) |
| **`:1320`** | **the mutation proofs** — the fifth, named by no finding | §*"Every gate watched failing — the mutation each assertion NAMES"* (`:1396`) |

⚠️ **`:1320` was actively misleading, not merely stale.** It was cited as *"the mutation proofs"* and
landed on the cost-exponent algebra — a reader following it would have found a derivation where they
were promised a redness proof. That is *(C9)* — the wrong thing cited — and it is the reason the
repair is **by heading, never by a re-counted number**: a heading citation cannot drift.

**Checked and left alone:** `:104` and `:448` both still land on their referents (`:104` on
§*"The build — what landed, and what I verified myself"*, whose table column is literally *"what I
re-mutated myself"*; `:448` mid-paragraph on a real redness proof). Both sit **before** the drifted
region. `:104` was nevertheless converted to a heading citation in the same sentence, because leaving
one number among four headings invites the next reader to trust it the same way.

**Verification:** every one of the six cited headings resolves to **exactly one** heading in the file
(checked by count, not by eye — a heading citation that matches two places is the same defect one
step on). Docs gates green: **PASS (103) FAIL (0)** — the count read positively, per the close
session's `PASS (0) FAIL (0)` parse-error precedent.

**No gate.** A citation repair has nothing to assert; the mechanical protection against it recurring
is that headings do not drift.
