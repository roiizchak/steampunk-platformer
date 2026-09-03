[← HANDOFF.md index](../HANDOFF.md)

# History — the bug-fix + perf-gate session

> ## 👉 Resuming? Read [handoff/next-session-prompt.md](../handoff/next-session-prompt.md) first.
>
> **Phases 1–8 are ✅.** The owner played the shipped Phase 8 build, reported three bugs, and scoped
> one session to those plus the two perf gates blocking Phase 9. All five are done.
> **Phase 9 is unblocked.**
>
> That file is the whole brief — including the three perf numbers Phase 9 will be judged against and
> what each of them cannot see. Everything below it is history.
>
> This session's record: [qa/session-bugfix-perf-gates.md](../qa/session-bugfix-perf-gates.md) ·
> [-02-gate-owners.md](../qa/session-bugfix-perf-gates-02-gate-owners.md) ·
> [-03-hands-on.md](../qa/session-bugfix-perf-gates-03-hands-on.md) ·
> [reviews/session-bugfix-perf-gates-plan.md](../reviews/session-bugfix-perf-gates-plan.md) ·
> [reviews/session-bugfix-perf-gates-impl.md](../reviews/session-bugfix-perf-gates-impl.md)

## 19. The bug-fix + perf-gate session — 2026-08-19. **This section supersedes §18.**

Three user-reported bugs and the two perf gates that blocked Phase 9. Verified at the end: typecheck ·
**1882** unit tests · **1882** with Phaser uninstalled · `build` + `verify-dist` clean · **102** e2e ·
**all five levels played by hand to completion, 0 deaths, 0 hazard contacts**.

**What the process caught that the code did not.** The three bugs were the easy part. Six gate-owner
briefs found **16 defects in the session's own work** — including that the enemy body's *height* was
completely unmeasured (the whole suite stayed green with a 1 px tall enemy), and that the boot gate and
the sim disagreed by one `patrolSpeed`. The Codex implementation review then found two more that all
six briefs had missed:

- `FOOT_TOLERANCE_PX` was applied to the hazard and gear tests as well as the solid test, so a spike
  one pixel under a creature's sole **passed the gate** while reading on screen as exactly the
  reported bug.
- 6.9's absolute HUD-work bound **claimed 1 ms in its docstring and permitted 5.557 ms in code**, and
  had never been watched failing — because the only mutation that existed was a scrim, and a scrim
  costs the CPU nothing. It survived a performance owner whose entire job was that spec, because every
  brief read the *statistic* and none read the *assertion*.

**Two new testing rules came out of it**, both in [TESTING-RULES.md](../TESTING-RULES.md) and
[CLAUDE.md §5](../../CLAUDE.md): a perf bound chosen from one set of runs must be **confirmed on a
held-out set** (it caught an overfit on *both* gates), and **a statistic that cannot order its own
mutation cannot be fixed by moving the bound** — replace the statistic.


## 18. Phase 7 — 2026-08-16. **This section supersedes §17.**

**Done and merged, all ten criteria passing.** 7.10 was closed by the owner listening to
`docs/evidence/phase-07-audition.html`; every other criterion is measured on `chromium-gpu` with the
renderer string recorded. Spend `$0.23` of a `$5` ceiling declared before the first generation.

Six gate-owner briefs (two per owner, brief 1 withheld from brief 2) produced **31 findings — 18
applied, 12 recorded, 1 rejected**. Both Codex reviews ran.

**What the gate caught that the code did not:** a footstep every 250 ms while standing still against
a wall; an out-of-phase footstep on every walk↔run change; death playing over hurt across a
multi-tick frame; and boot routing green on audio that never decoded, because Phaser's decode
failure emits no event and increments no counter.

**Two gates that could not go red, and one test with two false greens in four lines** — the full
account is in the QA log. The transferable lesson: **at ~240 fps against a 60 Hz sim, a percentile
over rAF frames cannot see a cost carried by under ~2 % of frames.** That is finding 1 of the next
session's three.

### Left open, deliberately, and now scoped as the next session's entire brief

1. **`MAX_BURST_RATIO` (Phase 5) is probably blind** for the same reason, and its only red-proof is
   a per-frame cost the median catches anyway.
2. **Criterion 6.9 fails under full-suite load**, proven pre-existing by re-running the suite on
   pre-audio `main` in a worktree.
3. **`GameScene.ts` is 432 lines**, and `file-size.test.ts` permitted the crossing on a Phase 4
   citation two phases stale.
4. **Criterion 4.23 is RED on `main`** — the drawn bottom sits **14.75 px** off the sim feet y while
   the player is vertically still. Added to scope by the owner after being shown it. Recorded as
   **D8b**.

🔴 **D8b's "environmental" reading has since weakened and the prompt says so.** Phase 7 recorded it
that way because it began after an `npm ci`. But the installed tree was afterwards checked against
the lockfile and **matches it exactly**, so the current tree is the canonical one — and
`test:sim-isolated` mutates `node_modules` on every run, which is the obvious way the earlier
*passing* tree drifted from it. The likelier story is that **4.23 is genuinely broken and the greens
were masking it.** It is the criterion that says the character's feet meet the ground, and Phase 8
is level design, so it is the right thing to settle first.

---

