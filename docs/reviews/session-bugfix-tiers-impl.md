# Codex implementation review — the bug-fix session, tiers 0–5

**Review 2 of 2: *"is this a correct build of it?"***, run on the 24-commit diff before the session
was reported. Verdict: **BLOCKED.**

`docs/reviews/` is **Codex-only**. Dispositions are summarised at the foot and live in full in
`docs/qa/session-bugfix-tiers.md`.

## How it was run

`/codex:rescue --wait --resume` — resumed rather than fresh, so the reviewer had already seen the plan
it reviewed as review 1. The same standing warning applied:

> On this machine your sandboxed shell cannot spawn any process (`CreateProcessAsUserW failed: 5`).
> Do NOT use the shell tool. Use the `node_repl` MCP tool with `fs.readFileSync` / `fs.readdirSync`
> for all file access.

**File-evidence only. Every finding was re-verified locally before disposition** — and that mattered
here more than in review 1, because two findings were about code the reviewer could not run.

## Findings

| # | Sev | Finding | Disposition |
|---|---|---|---|
| **Y1** | **BLOCKER** | `goalPulseFired` is initialised at its declaration and **never reset in `init()`**, so levels 2–5 draw no arrival flourish at all. `completionHandled` resets at `GameScene.ts:154`; the new latch does not. | **APPLIED.** Real, and mine. `init()`'s own header states the exact rule — *state initialised in the constructor survives a restart and makes the second run differ from the first* — and the latch was added directly below it. Both latches now reset in `init()`. |
| **Y2** | **BLOCKER** | The evidence contract is unmet on the final revision: the 119/0 e2e sweep predates C6, the jump replacement and 3.11. | **APPLIED, and it proved itself.** Re-running found `phase-06-hud` asserting the counter reads `'000'` — a reading item 3.8 changed, re-taken in the unit layer but **not** in e2e. Exactly the regression the finding said the gap would hide. Both sides now derive from `MAX_LEVEL_GEARS`. |
| **Y3** | **HIGH** | The audio fix **reintroduces criterion 7.5's accumulation defect**: `startBeds` counts playing beds but never *removes* stopped ones, so `sound.sounds` grows. Vault 7.5: a stopped track is still in the list. | **APPLIED.** `startBeds` now `sound.remove`s and splices stopped beds before adding replacements. ⚠️ **See the note below — this fix shipped with no test that reached it.** |
| **Y4** | **HIGH** | The adjacent-distinctness gate keeps only the worst pair, so an **accepted** pair can mask a **second, undeclared** repeat. | **APPLIED.** It now evaluates every below-floor pair, with a fixture in which one of two identical pairs is undeclared. |
| **Y5** | MEDIUM | The solid-thickness margin is optimistic against knockback. | **RECORDED, not applied** *(C11)*. True in principle; the shipped worst case (5.58×) clears the bound with room, and knockback is not a fall-speed term. |
| **Y6** | MEDIUM | B2's header names a weaker mutation than its coverage actually has. | **RECORDED, not applied** *(C11)*. The header understates the file; the coverage is real. Not worth a churn commit. |
| **Y7** | LOW | Stale comments in `CLAUDE.md` and `src/sim/player.ts` describing the deleted `dir !== 0` term. | **Recorded APPLIED — and the `player.ts` half was NOT.** See below. |

## ⚠️ Y7 was recorded APPLIED and was not applied

Found later by the **S.0 / S.3 gate owner**, not by this review, and confirmed locally:
`git diff main...HEAD -- src/sim/player.ts` was **empty**. The CLAUDE.md half landed; the `player.ts`
half never did, leaving four comment lines describing machinery `tick.ts:334` had deleted.

**A disposition recorded APPLIED that was not applied is worse than one recorded unfixed.** It is
false gate evidence, and it means **no other Y row was self-certifying** — each had to be re-checked
by hand afterwards. Two more instances of the same defect (`enemyTurn.ts:51`,
`audio-cue-edges.test.ts:339`) were found in that sweep.

## ⚠️ Y3's fix shipped with nothing testing it

Also found by a gate owner (`qa-expert`, brief 2), and confirmed by running the mutation: deleting
`sound.remove(bed)` from the retirement loop left the suite at **`PASS (2260) FAIL (0)`**.
`grep -rn "sound.remove" tests/` returned **zero** matches, and the one e2e that counts `sound.sounds`
drives Boot restarts through `destroyAudio` — a different branch of the same file.

So a HIGH regression could have been reintroduced in full, with every gate green, on a fix whose
disposition already said APPLIED. A source-text gate now reds it; **the behavioural e2e is owed**.

## What this review was right about

Both blockers were real and both were the implementer's. Y1 in particular is the defect the file's own
header warns against, introduced two lines below the warning — the class of mistake a reviewer catches
precisely because they did not write the code and do not share its author's assumption about what was
already handled.
