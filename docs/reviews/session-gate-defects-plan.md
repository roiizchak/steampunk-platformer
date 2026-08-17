[← reviews index](./) · [QA log](../qa/session-gate-defects.md)

# Codex plan review — the four-gate-defects session

**Date:** 2026-08-17 · **Session:** `01a00c01-ebc8-7123-80ff-42b27ff8b5dd` · **Verdict:** 2 BLOCKER,
4 MAJOR, all applied before implementation began.

Run against the written plan before `ExitPlanMode`, per the protocol. File-evidence only — Codex's
sandbox cannot spawn processes on this machine, so the prompt directed it to `node_repl` +
`fs.readFileSync`, and every finding was re-verified locally.

## What it CONFIRMED against file evidence

- **Item 4's root cause.** `src/sim/player.ts:329` sets `player.y = solid.y` and `player.vy = 0`
  together; `src/sim/advanceSplit.ts:69` snapshots immediately before its last tick;
  `GameScene.ts:226` feeds that snapshot to interpolation. So a landing sample can read `vy === 0`
  with `prev.y !== cur.y`. **This was the whole premise of the session's largest item, and it held.**
- **No cross-moment read hazard** in the sampler — drawn and sim values are read synchronously in one
  callback.
- **`window.__game.tick` is already on the closed eight-field surface.**
- **Item 3(a) structurally**: all eight wrappers `private`, no external callers anywhere in `src/` or
  `tests/`, DEV guard preserved, and the split clears 400 with margin. Measured 378.
- **Item 2's pairing premise**: the arms really are sequenced back-to-back within each loop iteration,
  so per-pair ratios are a valid paired statistic. *(They were valid and still did not work — see the
  QA log. Codex was right about the premise and the premise was not enough.)*

## Findings

**BLOCKER 1 — the exact-zero predicate did not prove what it claimed.** The plan proposed treating
equality with any strictly earlier sampled tick as proof that the sim had not moved the player. One
rAF can drain several ticks (`frameClock.ts:43`), and the player can move and return to the same
height. **Applied:** sample `GameScene.prevPlayer.y` directly instead. Simpler than what it replaced.

**BLOCKER 2 — "previous tick's `|vy|` + gravity" rejects a legal takeoff.** From rest the previous
`vy` is 0, so the bound would be `gravity` = 0.675 px while takeoff legitimately moves
`jumpVelocity` = 24.3 px (`tick.ts:253-264`, `playerTuning.ts:251`). **Applied:** the velocity term
was dropped entirely.

**MAJOR 3 — the proposed red proof would not have exercised the branch.** Disabling the teleport snap
changes nothing, because `MAX_LEAP_PX` is twice the maximum legal one-tick travel and the spec's
run-and-jump never reaches it. **Applied:** the mutation became an interpolation overshoot instead.

**MAJOR 4 — the two perf windows are not guaranteed equal.** `sample()` stops once the observed delta
is `>= wantTicks`, and the returned `ticks` was computed *after* the GPU-drain rAFs, so `frames` and
`ticks` described different spans. **Applied**, and then **observed live**: criterion 7.7 went red on
correct code during the session's regression run, exactly as predicted. `perfSampler.ts` now captures
`ticks` at the stop condition.

**MAJOR 5 — the count-bearing citation still admits a false green.** The logs already record
`GameScene.ts` at both 459 and 432, so a naive "path and current count appear together" check would
cover a file that grew *back* to a stale historical size. **Applied:** an exact `lines=N` token, one
canonical citation per path. *(A later gate owner showed this was still not enough — see the QA log's
R3/R5.)*

**MAJOR 6 — the mutation protocol omitted two §5 requirements.** **Applied:** every red proof in this
session detects redness positively from the named spec and assertion, is driven from the local shell,
and is reverted by *content changed AND the original count dropped by one*.

## What it could not check

Every measurement claim: the 14.75 px runs, whether the burst mutation leaves p95 unchanged, the
full-suite-only 6.9 failure, whether per-pair ratios stabilise it, and every threshold. All were
measured locally, and **three of them contradicted the plan** — see the QA log.
