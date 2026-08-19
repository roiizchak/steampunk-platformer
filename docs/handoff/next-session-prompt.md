# Next session — Phase 9, polish

← [HANDOFF.md](../HANDOFF.md) · [PRD.md § The phases](../PRD.md#the-phases)

**Written 2026-08-19, at the end of the bug-fix + perf-gate session.**

The previous version of this file scoped Phase 8 and is superseded — it is kept at
[next-session-prompt-phase-08.md](next-session-prompt-phase-08.md).

---

## Where things stand

**Phases 1–8 are ✅.** The owner played the shipped Phase 8 build and reported three bugs; all three
are fixed, and the two perf gates that were blocking Phase 9 are repaired.

| item | outcome |
|---|---|
| **enemies walked through walls** | fixed in the pure sim — `blockedAt`, a **newly-entered** veto mirroring the player's own `resolveCollisions`. Watched stopping a chaser at a wall face in the running game. |
| **a sentry stood in spikes, gears sat inside enemy bodies** | 13 violations across 4 levels fixed in the generators, plus a **boot gate** (`describePlacementProblem`) with **four** committed failing fixtures. |
| **the low ground was safe to walk** | spiked in all five levels, sized against a **new** gate — `level-hazard-free.test.ts` — because all three gates the plan first named were blind to it. |
| **criterion 7.7** — reported failing since 2026-08-17 | **green.** AB/BA balanced, 20 pairs, clean 0.9927–1.0022 against a mutated 1.0915–1.0961, bound 1.05, floor **measured** between 15 and 20 ms per cue. |
| **criterion 6.9** — floor bracketed, statistic unstable | **`MAX_HUD_GPU_RATIO` deleted** — it could not order its own mutation. Replaced by a paired GPU **delta** at 0.2 ms, plus a new absolute `MAX_HUD_FRAME_WORK_MS = 2.5`. |

**Phase 9 is unblocked.** `PRD.md` says so as of 2026-08-18.

Verified at the end: typecheck · **1882** unit tests · **1882** with Phaser uninstalled · `build` +
`verify-dist` clean · **102** e2e · all five levels played by hand to completion.

**Full evidence:** [`qa/session-bugfix-perf-gates.md`](../qa/session-bugfix-perf-gates.md) ·
[`-02-gate-owners.md`](../qa/session-bugfix-perf-gates-02-gate-owners.md) (6 briefs, 16 findings) ·
[`-03-hands-on.md`](../qa/session-bugfix-perf-gates-03-hands-on.md) ·
[`reviews/session-bugfix-perf-gates-{plan,impl}.md`](../reviews/session-bugfix-perf-gates-impl.md).

---

## 🔴 The three numbers Phase 9 must know before it draws anything

Phase 9 is **polish and particles**. These gates are what will judge it, and each one has a stated
blind spot. Read them as budgets, not as reassurance.

| gate | what it resolves | **what it CANNOT see** |
|---|---|---|
| 6.9 GPU delta, **0.2 ms** | ≥3 full-screen scrims' worth of fill | **any HUD/overlay change under ~0.2 ms of GPU.** A modest overlay, a few translucent particles, one more alpha layer — all read as a pass. |
| 6.9 absolute work, **2.5 ms** | ≥~3 ms/frame of shared main-thread work | ~2 ms/frame of added shared work still passes. |
| 7.7 audio frame loss, **1.05** | ≥~20 ms per cue | a stall smaller than ~20 ms/cue lands inside the gap. |

⚠️ **6.9's per-pair noise is still open, recorded as MAJOR (P4).** About one measurement window in
ten reads 0.7–1.2 ms against a 0.14 ms baseline, on **both** arms and independent of HUD state, so
individual pairs exceed the 0.2 ms bound by up to 5×. The **median of ten** has now survived
**23 clean runs with a worst reading of 0.0835 and nothing above 0.09**, so no false red has ever been
observed — but nothing proves one is impossible. Closing it needs the spike's root cause (OS
scheduling, driver, thermal — unknown) or a statistic robust to a one-in-ten outlier by construction.

**If a Phase 9 perf gate goes red once, re-run it before believing it.** And per this session's new
rule: **pick any new bound on one set of runs and confirm it on a set that had no say.** That
discipline caught an overfit on *both* gates this session, each of which had looked perfect on every
run used to choose it.

---

## The traps that are not visible in the code

**Two mutation styles, and the choice matters.** `tests/e2e/scrimMutation.ts` mutates from the *page*;
`src/game/audio.ts` mutates from a DEV-only query param because a per-cue stall has to sit inside
`playCues`. Prefer the page: a mutation that never enters `src/` cannot leak into `dist/`.

**A mutation must land where the bound can see it.** `addHudWork` attaches to the **Game** scene, not
`UI`, on purpose — on `UI` it appeared in one arm only, tripped the *delta* bound, and never reached
the absolute one it was built to prove. The general form: **whatever both arms run divides out.**

**`stop('UI')` destroys the scene's display list AND its event emitter.** Anything attached to `UI`
must be re-attached after every HUD-on toggle.

**A brief permitted to mutate source runs ALONE.** Running the code-reviewer (which mutates) beside
the qa-expert (which reads the same tree) had the qa-expert correctly report a live `return null;`
short-circuit that was another agent's in-flight mutation. Nothing shipped wrong; the setup was the
error.

**Aggro is permanent by design.** `stepScavenger`: *"nothing here can clear the flag"*. A scavenger
pinned at a wall stares at the player forever even from 851 px away — that is `enemy-ai.test.ts`'s
"never gives up", it predates the veto, and the same thing already happens at a ledge.

---

## Still on the backlog, unchanged

Sentry projectiles pass through solids · sentry `facing` strobes at 60 Hz with no dead zone ·
`releaseAggro` leaves `attackCounter` set, and aggro survives the player's death · 4.27 (anchor
contact geometry) · 10.4/10.6, blocked on the owner's hosting decision · `verify-dist`'s identifier
greps cannot go red under minification.
