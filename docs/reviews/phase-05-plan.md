# Phase 5 — Codex plan review (review 1 of 2)

**Ran:** 2026-08-09, before any code was written and **before any spend**.
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** [phase-05-combat.md](../prd/phase-05-combat.md) **and** the session execution plan at
`C:\Users\royko\.claude\plans\docs-prd-phase-05-combat-md-ok-let-s-co-eager-octopus.md`, against
[PRD.md](../PRD.md), [FAL-MODELS.md](../FAL-MODELS.md), [ASSET-MANIFEST.md](../ASSET-MANIFEST.md),
[ASSET-PIPELINE.md](../ASSET-PIPELINE.md) §0a/§5, [STYLE.md](../STYLE.md) §7/§8,
[lessons/phase-05-combat.md](../lessons/phase-05-combat.md),
[LESSONS-APPLIED.md](../LESSONS-APPLIED.md), [docs/qa/](../qa/), [docs/reviews/](.), and
`src/sim/tick.ts`, `src/sim/types.ts`, `src/sim/player.ts`, `src/render/playerView.ts`,
`src/render/cameraRig.ts`, `src/render/animTiming.ts`, `src/game/tilemap.ts`,
`src/scenes/GymScene.ts`, `tools/gen/gates.mjs`, `tools/gen/build-assets.mjs`,
`tests/unit/file-size.test.ts`, `tests/unit/docs-contract.test.ts`.

**Repository state at review time:** Phases 1–4 merged to `main`, Phase 4 merged **reported
failing** with the debt ledger in [phase-05-combat.md §1b](../prd/phase-05-combat.md).
`src/sim/combat.ts` and `src/sim/enemies.ts` did not exist; `src/render/enemyView.ts` and
`enemyHealthBar.ts` did not exist. Step 4 of the tick contract was reserved and empty. No enemy
slug, anchor or sheet existed. `tests/unit/file-size.test.ts` sat at exactly 10 of its 10 permitted
over-400-line files.

**Scope split, recorded rather than implied.** Codex has **no network access**, so it verified **no
fal.ai price, schema or licence claim** in this plan — those are checked separately through
`genmedia`. It also **could not spawn a process** on this machine (`CreateProcessAsUserW failed: 5`,
permanent — see the protocol), so it ran **no typecheck, no test and no build**. Everything below is
**file evidence only**, and Codex stated that limitation itself rather than being asked to.
Per the standing rule, every finding that could be re-verified locally, was — and one of them
(**C3**) turned out to be a real, live contradiction in shipped Phase 2 documentation.

**A first review was launched against an earlier draft of the plan and cancelled.** Reading the
source mid-planning changed the plan materially (G5's scope, M3's reversal, the `resolveState`
trap, the `AnimName` widening), so reviewing the superseded draft would have produced findings
against text that no longer existed. It was re-sent rather than salvaged. **This is the review of
record.**

**Two attempts were made at nothing else.** One invocation, one report.

---

## The review, verbatim

> 1. **Low** — only the four test files (`combat.test.ts`, `enemy-ai.test.ts`,
>    `enemy-health-bar.test.ts`, `phase-05-combat.spec.ts`) are not required by §1's goal itself;
>    they're QA-contract deliverables, not runtime capabilities. `docs/prd/phase-05-combat.md:7,103,108`.
>
> 2. **Blocker/High** — most §6 criteria can false-green: 5.4c (contact frame not proven against
>    real tick window), 5.7 (no drawn `Graphics` assertion), 5.1 (predicate sweep doesn't prove a
>    shot ever fires), 5.2/5.9 (displayed number can move while live enemy uses a stale value — the
>    exact Phase 2 4-knob failure repeats), 5.3 (structural heuristic, can flap patrol/chase), 5.5
>    (sampled ticks don't prove one-hit-per-target or facing), 5.6 (i-frame endpoints unpinned),
>    5.4d (proves algebra reacts, not correctness), 5.10 (no named comparison invariant),
>    5.4b/5.4e/5.12–5.14 (process-only, backfillable). 5.4 and 5.8 are the strongest.
>
> 3. **High** — vault **A5** is claimed but not satisfied: per-slug scale is still derived from a
>    regenerable idle sheet, contradicting A5's preference for a non-regenerated source. `plan:185`,
>    `ASSET-PIPELINE.md:221`, `build-assets.mjs:7`.
>
> 4. **Blocker** — a multi-subject asset/config pipeline. The current builder and `GymScene` are
>    hardcoded to one `SLUG` everywhere (source dir, config, action-prefix lookup, report/profile
>    paths, Gym's `character-bounds.json` load) — no earlier phase produced the multi-slug version
>    this phase assumes. `build-assets.mjs:45,59,65,328`, `GymScene.ts:108,182`.
>
> 5. **Blocker** — a green 5.4c hides the wrong contact frame: `gateReachBand` picks the largest
>    changed-x pixel using a whole-frame noise floor, doesn't isolate the responsible component,
>    doesn't reject noise from unrelated body motion, and never maps the frame to Phaser's real
>    playback interval — reproducing the exact 4.22 failure this phase exists to prevent (damage
>    lands while art still shows wind-up). `gates.mjs:196,201,226`.
>
> 6. **Not accurate** — `gateReachBand` returns one best candidate correctly, but has no per-frame
>    profile, no left-facing handling, no component isolation, no noise rejection, and no
>    tick-alignment mapping; its self-tests don't cover flat/last-frame-peak/multi-frame/tick-alignment
>    cases. 5.4c needs materially more than "two declines." `gates.mjs:179,189,637`.
>
> 7. **Real failure mode; right seam, under-specified.** `resolveState()` does unconditionally
>    overwrite step-4 combat states, so an early return there is correct in principle — but the plan
>    doesn't name one authoritative "timer expired" predicate, risking a stuck or off-by-one-tick
>    state. `tick.ts:183,232`, `player.ts:154,167`.
>
> 8. **True only for ordinary overlap; "acceptable" unproven.** A thin hazard can be tunnelled
>    entirely between two step-4 samples (Phase 2 already flagged this class), the kill-plane/attack
>    ordering within step 4 is undefined, and the plan self-contradicts by putting boundary clamping
>    in step 9 (`resolveCollisions`), not step 4. No §6 criterion tests hazard/kill-plane timing at
>    all. `tick.ts:183,207`, `docs/qa/phase-02-player.md:349`.
>
> 9. **Works for 5.4 (via `window.__phaserGame`), not for 5.7 as written** — the plan's 5.7 evidence
>    is only a unit test of the width predicate, with no drawn-object assertion, despite the
>    precedent (Phase 3 e2e) that this project inspects the live scene tree for exactly this kind of
>    claim. `main.ts:9`, `phase-03-tilemap.spec.ts:13,62`, `PRD.md:395`.
>
> 10. **Blocker** — yes, the plan's "timer unexpired" restates Phase 2's already-defined
>     `counter < duration` window predicate without naming it as the shared authority, and Codex
>     flags that Phase 2's own docs already drift internally on this (`tick.ts` vs `types.ts`
>     disagree on when coyote time starts). No enemy behaviour is specified as a per-tick
>     probability — turret/scavenger logic is deterministic (`tickRoll` is only an optional
>     fallback) — but determinism alone doesn't prove episode commitment since detection can still
>     flip every tick. `tick.ts:48,63,240`, `types.ts:109`, `plan:115`.
>
> Codex could not verify any fal.ai pricing/schema/licence claims (no network access) and ran no
> typecheck/test/build (shell spawning prohibited) — this is file-evidence only, explicitly stated
> by Codex itself.
>
> Files reviewed: `C:\Claude\Steampunk Platformer\docs\prd\phase-05-combat.md`,
> `C:\Users\royko\.claude\plans\docs-prd-phase-05-combat-md-ok-let-s-co-eager-octopus.md`.

---

## Triage

One line per finding. Applied, or rejected with a reason *(vault C11 — silently ignoring one is not
permitted)*. Findings are numbered `C1…C10` in the execution plan's §0; the mapping to Codex's own
answer numbers is given so neither numbering is orphaned.

| ID | Codex answer | Severity | Disposition |
|---|---|---|---|
| **C1** | 5 + 6 | blocker | **APPLIED.** G5 restored to full scope: per-frame reach profile, component isolation, facing handling, and the mapping from frame index to the tick it is actually drawn on, plus self-test fixtures for the flat / last-frame-peak / multi-frame / tick-alignment cases `gates.mjs:637` does not cover. My planning claim that this had shrunk to "a thin wrapper" was wrong and is corrected in the plan rather than quietly dropped. |
| **C2** | 4 | blocker | **APPLIED.** Multi-subject pipeline promoted from a step-6 note to its own named prerequisite (step 6a), covering `build-assets.mjs:45,59,65,328` **and** `GymScene.ts:108,182` — the Gym's single-config load and its action-by-string-surgery, both of which I had missed. |
| **C3** | 10 (first half) | blocker | **APPLIED, and the drift is confirmed locally.** `tick.ts:48-51` states the coyote window starts on *"the first tick after the player walks off a ledge… the ledge tick itself is not one of them."* `types.ts:109-112` states *"`N` means the jump is accepted on the tick the player leaves the ground and on the `N − 1` ticks after it."* **These contradict.** `tick.ts` is the declared authority *(vault 2.2)*, so `types.ts` is wrong. Fixed as step 2's first task, and a single `windowOpen(counter, knob)` predicate is exported and imported by combat's hit window, i-frames, the hurt timer and `resolveState` — before combat can add a fourth private copy of a rule two copies already disagree about. |
| **C4** | 2 | high | **APPLIED per criterion**, in the plan's §6 evidence column. The sharpest instance is 5.2/5.9: a *displayed* number can move while the live enemy reads a stale value, which is the Phase 2 four-knob failure *(A6)* repeating — so the sweep now asserts the enemy's **measured travel**, not a readout. |
| **C5** | 3 | high | **APPLIED.** `scale` derives from the **locked anchor** (immutable, STYLE.md §8), never from a regenerable idle sheet. My draft had claimed A5 while doing the thing A5 forbids. |
| **C6** | 8 | medium | **APPLIED.** The plan's self-contradiction is resolved (the three-edge clamp is step 9 / `resolveCollisions`; damage and hazards are step 4), step 4's internals are **ordered**, hazards use a **swept overlap** rather than a point sample, and **new criterion 5.15** tests hazard and kill-plane timing — which nothing in the gate tested at all. |
| **C7** | 7 | medium | **APPLIED**, folded into C3: the `resolveState` early return gates on the one exported `windowOpen` predicate rather than an ad-hoc comparison. |
| **C8** | 9 | medium | **APPLIED.** 5.7 gains a live scene-tree assertion through `window.__phaserGame`, following the `phase-03-tilemap.spec.ts` precedent. `window.__game` stays closed at nine fields — no tenth field, so no STOP-and-ask is triggered. |
| **C9** | 10 (second half) | medium | **APPLIED.** Codex confirms no enemy behaviour is a per-tick probability — the blocker in vault 5.1 is clear — but correctly notes determinism is not commitment: detection recomputed each tick still flaps on a boundary. Detection now latches with hysteresis, and 5.3's evidence is a **flap test**, not a structural read. |
| **C10** | 1 | low | **RECORDED, NOT APPLIED.** The four test files are QA-contract deliverables, not runtime capabilities — Codex is right about that classification. But `tests/unit/docs-contract.test.ts` and the §6 gate both require them, so removing them from §5 would fail the suite. No change. |

**Net effect on the plan:** three blockers and two high findings changed the work materially — G5's
scope, a new prerequisite step, a pre-existing documentation bug fixed before combat builds on it,
nine rewritten evidence rows, and one new acceptance criterion. One finding was rejected with a
reason. Nothing was silently dropped.

**Still to run:** review 2 (`--wait --resume`) against the diff, criterion 5.14. The phase cannot be
reported done until it has run and every finding of *its* is applied or recorded.
