# Codex plan review — the bug-fix session, tiers 0–5

**Review 1 of 2: *"is this the right thing to build?"*, not *"is this a correct build of it"*.**
Run before owner approval, per `CLAUDE.md` §4. Verdict: **BLOCKED.**

`docs/reviews/` is **Codex-only**. This file is the review; the implementer's dispositions are
summarised at the foot and live in full in `docs/qa/session-bugfix-tiers.md`.

## How it was run

`/codex:rescue --wait --fresh`. Every prompt carried the standing warning:

> On this machine your sandboxed shell cannot spawn any process (`CreateProcessAsUserW failed: 5`).
> Do NOT use the shell tool. Use the `node_repl` MCP tool with `fs.readFileSync` / `fs.readdirSync`
> for all file access. If that also fails, say so plainly and do not invent findings.

Codex read every file it was asked to plus fifteen more. That restores file **reading**, not command
**execution** — so its findings are **file-evidence only and were re-verified locally before any
disposition.** All seven were confirmed.

## The verdict, in one line

> **The defect inventory is stale against merged source.**

Four items the plan was about to implement were **already fixed on `main`**, and one would have
**reversed a documented design ruling**. The inventory's own §8 lists 13 such items; Codex found four
more in a single pass, which is the measure of how incomplete §8 was.

That verdict is why the approved plan opens with **Batch A0 — reconcile every item against merged
source before any fix** — rather than with a fix.

## Findings

| # | Sev | Finding | Disposition |
|---|---|---|---|
| **X1** | **BLOCKER** | The inventory is stale beyond its own §8. `scavengerAnim` already reads a `moving` readback (`enemyView.ts:85`, `enemyScavenger.ts:327`) and an `idle` exists → **2.4 already fixed**. `releaseAggro` already clears the attack window (`enemyScavenger.ts:144-156`) → **2b.2 already fixed**. `enemyTurn.ts:98` applies `toWorld(SENTRY_MUZZLE, …)` → **2b.3 already fixed**. Aggro is **permanent by design** (`enemyScavenger.ts:128`) → C4 would *reverse a ruling*. | **APPLIED.** All four verified locally. New **Batch A0** reconciles every item before any fix. C4 became a STOP-and-ask, not a fix. |
| **X2** | **BLOCKER** | B2 and B10 are not one fix. Projectile flight is **already step 4a** (`tick.ts:15`, `enemyTurn.ts:65`) — no tick insert needed. Its real problem is **time of impact along one segment**: a player before the wall must still be hit, one behind it must not, and the existing helper returns only a boolean. B10 needs swept **body** collision plus position/velocity resolution — a different policy. | **APPLIED.** B2 stayed inside 4a and gained a sweep result carrying `t`. B10 separated. |
| **X3** | **HIGH** | B1 omits units: `GEAR_BOX` is **12 local units**, solids are world px, and `describeGearProblem` has no scale argument (`tiledPlacement.ts:82-85` multiplies by `RENDER_SCALE`). *"Any overlap means uncollectable"* is also unproven — `pickups.ts` can collect a partially exposed box. One seam fixture is satisfiable by an inclusive point comparison alone. | **APPLIED.** The draft was **wrong by 6×**. B1 now names its policy explicitly and carries three fixtures with independently-mutable extent and scale. |
| **X4** | **HIGH** | B5 and B7 are **balance changes, not refactors**. B7's two facts are true, but the reach-only zone cannot discriminate ordering — no enemy damage occurs there. The discriminating case is an overlapping scavenger whose claw goes live the same tick as a lethal swing. B5's *"already consumed set"* is conflated with the existing per-target `lastHitSwing` dedup (`playerAttack.ts:21-24`). | **APPLIED.** Both reclassified as owner-facing balance decisions with a named discriminating case. |
| **X5** | **HIGH** | The red-gate story is incomplete: B4 and C2 name no discriminating gate; B9 would start green; B10's one-time measurement is not a regression gate. And **"every fix raises the unit count" is false** for docs, asset, e2e, cache and deliberate-non-fix work. | **APPLIED.** Every item now names its mutation. The blanket unit-count rule was **withdrawn** — a false rule invites satisfying it with a fake test. |
| **X6** | **HIGH** | **5.1 is ordered far too late.** Bare-symbol greps over a minified bundle cannot prove guarded module bodies vanished, yet every later batch treats a green build as proof DEV code stayed out — and C5 relies on it. | **APPLIED.** 5.1 moved into Batch A, before any production-facing change. |
| **X7** | **MEDIUM** | C2's core claim holds and also removes C8's foot-slide once friction reaches zero, but it can invalidate a B4 gate that used locomotion state as an oracle. A deceleration ramp beyond that is a **new feel change**, not this defect's root fix. | **APPLIED.** C2 moved before B4; 3.5/C8 folded into one cross-layer regression; the ramp was not built. |

**Seven findings, seven applied. None recorded-as-rejected.**

## What the review was right about, in hindsight

- **X1 was the session's highest-value finding.** A0 went on to find **seven** items that were not
  bugs — four already fixed, two stale, one the design itself — plus four more open for the wrong
  stated cause.
- **X3's 6× unit error** would have shipped a gear validator that refused legal placements.
- **X6's ordering** was load-bearing: A2 proved **half** of 5.1's claim false (scene keys *are* caught;
  module-scope bodies are not), which C5 then depended on.
- **X7's warning about C2's deferral cost** turned out generous. The recorded cost — *"moves every
  locomotion assertion from Phase 2 onward"* — moved **none**.
