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
| **C6** | 8 | medium | **APPLIED, then PARTLY REVISED IN IMPLEMENTATION — see the note below.** The plan's self-contradiction is resolved (the three-edge clamp is step 9 / `resolveCollisions`), hazards use a **swept overlap** rather than a point sample, and **new criterion 5.15** tests hazard and kill-plane timing — which nothing in the gate tested at all. The one part that did NOT survive contact with the code is "damage and hazards are step 4": it is step **9b**. |
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

---

## Amendment — C6's step-4 placement did not survive implementation

Recorded here rather than quietly changed, per *(C11)*. Codex's finding stands in full; what changed
is **my disposition of it**, and the reason is that C6 asked for two things that turn out to be
incompatible.

**What the triage said:** world-geometry damage — hazards, the kill plane, enemy contact — resolves
inside **step 4**, ordered i-frame expiry → hazard/kill-plane → attack windows → damage → knockback
→ death. The stated benefit: knockback reaches the same tick's movement, because step 4 runs before
integration.

**Why it cannot:** the same finding requires hazard contact to be **swept**, and a swept test needs
**both endpoints of this tick's motion**. The second endpoint does not exist until step 8 has
integrated and step 9 has resolved. Evaluated at step 4, contact can only be a point sample against
last tick's position — which is precisely the tunnelling defect C6 raised the sweep to prevent. The
ordering and the guarantee cannot both hold.

**What was built:** the guarantee. World-geometry damage runs at **step 9b**, after collision, using
the `previousX`/`previousY` locals step 8 already captures. `src/sim/worldDamage.ts` carries the full
reasoning; `src/sim/tick.ts`'s header records 9b in the numbered contract.

**What it costs, stated plainly:** a hazard's `hurt` state is entered after this tick's movement, so
knockback lands on the following tick — a uniform 16 ms. That is the same price, for the same
reason, as the jump buffer's already-documented one-tick delay. It is a real regression against
C6's stated intent and is accepted deliberately, not overlooked.

**Why 9b and not a renumber:** renumbering this contract is a balance change to a phase that has
spent money on art *(vault 2.2)*. A letter keeps every existing number meaning what Phase 2 through
4 assumed, and 9b genuinely belongs to resolving where the body ended up this tick.

**One benefit fell out of it.** Step 11 derives the movement state *after* 9b, so a `hurt` entered
there is published on the tick it happened. At step 4 it would have been overwritten by this tick's
own movement — the trap `resolveState`'s combat guard (C7) exists to catch.

Gated by `tests/unit/tick-world-damage.test.ts`, whose tunnelling case derives the hazard band from
the real fall trajectory rather than a hand-picked constant, and asserts both halves: that **no tick
ever sampled inside the band**, and that the damage landed anyway. Degrading the sweep to a point
test fails that one spec and no other.

---
---

# Phase 5 — Codex plan review of the SESSION-2 completion plan

**Ran:** 2026-08-10, in session 2, **before any code and before any further spend**.
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** the session-2 completion plan at
`C:\Users\royko\.claude\plans\resume-phase-5-combat-synthetic-starfish.md` (revision 1) against
[phase-05-combat.md](../prd/phase-05-combat.md), [PRD.md](../PRD.md),
[FAL-MODELS.md](../FAL-MODELS.md), [ASSET-PIPELINE.md](../ASSET-PIPELINE.md),
[LESSONS-APPLIED.md](../LESSONS-APPLIED.md), [lessons/phase-05-combat.md](../lessons/phase-05-combat.md),
[qa/phase-05-combat.md](../qa/phase-05-combat.md), [HANDOFF.md](../HANDOFF.md), the review above, and
`build-assets.mjs`, `build-clips.mjs`, `gates.mjs`, `anchorGate.mjs`, `motion.mjs`,
`motionCombat.mjs`, `write-prompts.mjs`, `GymScene.ts`, `enemyLayer.ts`, `animTiming.ts`,
`enemyView.ts`, `projectiles.ts`, `combat.ts`, `file-size.test.ts`, `docs-contract.test.ts`,
`style-lock.test.ts`.

**This is a second plan review, not the implementation review.** Criterion 5.14 — the implementation
review on the diff, `--wait --resume` — is still **UNRUN** and runs last.

**Scope split, recorded rather than implied.** Codex again had **no network access** and again
**could not spawn a process** (`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test or
build and verified no fal price or schema claim. Everything below is **file evidence only**, and
Codex stated that limitation itself. **Every one of the ten findings was re-verified locally, and
all ten were CONFIRMED.** Three were blockers that the plan's author had missed entirely.

---

## The review, verbatim

> 1. **High** — bespoke projectile/elevated-fire art is not required. Phase 5 requires a firing
>    turret, combat art, and enemy sheets, but the frozen scope defines exactly nine sheets and only
>    `idle`/`fire`/`death` for the sentry. The generated bolt, trail, impact spark, second
>    `fire-elevated` sheet, and angle-selection logic extend that scope
>    (`docs/prd/phase-05-combat.md:7-15`; `docs/qa/phase-05-combat.md:65-77`; plan `:309-312,330-340`).
>
>    **Medium** — G4/G6 and their supporting infrastructure are not §1 or §6 deliverables.
>    `clipJobs.mjs`, `submit-clips.mjs`, padded-anchor tooling, G4 drift, and G6 edge-bleed are
>    preventive pipeline work. The plan itself explicitly places G4/G6 outside §6; only G5 directly
>    proves criterion 5.4c (plan `:103-114,403-405`; `docs/prd/phase-05-combat.md:128-130`).
>
>    **Low** — part of W16 is housekeeping outside the goal/gate. The stale `animTiming` comment,
>    generation-total correction, and M3 manifest note are not required by §1 or §6 (plan
>    `:359-367`). Conversely, `assets:fetch`/`assets:verify`, the deliberate-removal run, and the Gym
>    async guard are independently binding Phase-4 debt and should not be mistaken for optional scope
>    (`docs/prd/phase-05-combat.md:53-60`).
>
> 2. **Blocker** — 5.12 can green with ten violations. The criterion says "No file > 400 lines," but
>    the cited test expressly allows up to ten such files; it only requires them to be mentioned in a
>    QA log. Therefore `file-size.test.ts` green does not prove 5.12
>    (`docs/prd/phase-05-combat.md:138`; plan `:398`; `tests/unit/file-size.test.ts:61-85`). This
>    reopens the first review's false-green concern.
>
>    **High** — 5.2 does not prove both speeds are independently tunable. Its cited test changes only
>    `patrolSpeed`; `chaseSpeed` is merely compared against two constants, so a stale or ignored live
>    chase-speed knob can pass (plan `:384`; `tests/unit/enemy-ai.test.ts:107-129`). This reopens C4.
>
>    **High** — 5.4c permits a non-answer as evidence. The gate requires every attack contact frame
>    to land inside the active window, but Phase E accepts `INDETERMINATE` being recorded without
>    saying that it fails the phase (`docs/prd/phase-05-combat.md:128`; plan `:202-207,388`). That
>    reopens C1 unless `INDETERMINATE` is explicitly a failing 5.4c result.
>
>    **High** — 5.4d omits the newly added sheet. The plan adds `fire-elevated`, yet W11 still packs
>    and catalogs nine sheets, while the current timing authority only knows sentry `idle`, `fire`,
>    and `death`. The nine covered rows could pass while the tenth sheet has no derived timing (plan
>    `:273-274,322-328,389`; `src/render/animTiming.ts:209-231`).
>
>    **High** — 5.11 has no concrete non-vacuity check. "Must distinguish fast from not drawing" is
>    only an instruction; the evidence column specifies no draw-count, visible-object, or scene-tree
>    assertion. A fast run with missing render objects could still be accepted (plan `:353-357,397`;
>    `docs/LESSONS-APPLIED.md:14-19`).
>
>    **Medium** — 5.7's live assertion is not pinned to low HP. W14 says to inspect the drawn scene
>    tree but does not put the live enemy at 2/60 or another near-empty value. A full-health bar can
>    pass while the low-HP rendering remains empty; the existing unit test checks only the
>    engine-free function (plan `:350-351,393`; `tests/unit/enemy-view.test.ts:32-46,78-81`). This
>    partially reopens C8.
>
> 3. **High** — vault A5. The plan claims to satisfy A5 by deriving scale from a locked anchor, then
>    immediately says the anchor cannot supply the scale and it will instead be derived from packed
>    source frames. That is again a regenerable source, exactly the ordering trap A5 warns about
>    (plan `:232-236`; `docs/LESSONS-APPLIED.md:35`). The repository still records scale provenance
>    as the regenerated idle sheet, and the QA log already identifies that limitation
>    (`public/assets/config/character-bounds.json:2-7`; `docs/qa/phase-05-combat.md:152`). This
>    reopens C5.
>
> 4. **Blocker** — there is no projectile-despawn event for W12's impact spark. Projectiles that
>    leave bounds are silently omitted from the returned array; `TickEvents` contains only
>    jump/landing/attack fields. The plan's claimed "existing despawn event" does not exist (plan
>    `:334-336`; `src/sim/projectiles.ts:82-107`; `src/sim/types.ts:217-240`).
>
>    **Blocker** — no persisted firing angle exists for W13. A projectile captures its vector once at
>    spawn, but `Sentry` stores no angle/vector and `sentryRenderDesc` receives only the sentry and
>    scale. No task preserves the shot-time angle for the following 18-tick animation
>    (`src/sim/projectiles.ts:48-78`; `src/sim/enemies.ts:73-88`;
>    `src/render/enemyView.ts:47-52,106-119`; plan `:338-340`).
>
>    **Blocker** — `build-clips.mjs` cannot currently extract combat one-shots. Its comment promises
>    `motionOnset` as the fallback for future `attack`, but the implementation instead throws whenever
>    a non-cyclic clip has no foot lift, so `attack`, `hurt`, and grounded deaths cannot pass this
>    path; the plan addresses only `VIDEO_DIR` (`tools/gen/build-clips.mjs:231-256`; plan `:224-227`).
>
>    **High** — the live enemy-sprite renderer does not exist, and no work item clearly creates it.
>    `EnemyLayer` still creates rectangles and explicitly says a later step must swap them for
>    sprites, while W14 assumes a live animation frame can be sampled
>    (`src/scenes/enemyLayer.ts:19-28,40-61`; plan `:322-328,346-351`).
>
>    **High** — the plan's counts are internally stale. Fourteen motion records exist before
>    `fire-elevated`; adding it yields fifteen total motions and ten Phase-5 combat/enemy sheets, yet
>    W1 still demands fourteen records and W11 nine catalog rows (`tools/gen/motion.mjs:206,336-337`;
>    `docs/qa/phase-05-combat.md:65-77`; plan `:134-139,273-274,322-328`).
>
>    The checked branch and source-length assertions are otherwise accurate: `.git/HEAD` names
>    `phase-05-combat`, and the cited files end at `build-assets.mjs:368`, `motion.mjs:388`,
>    `anchorGate.mjs:193`, and `GymScene.ts:399`.
>
> 5. **High** — the sentry animation will most likely disagree with the actual bolt trajectory.
>    Projectile aim is frozen once at firing (necessary for a dodgeable non-homing shot), but no
>    shot-time angle survives on the sentry; the plan only says to choose the animation "from the aim
>    angle," and recomputing from the player's current position could switch the barrel animation
>    after the bolt has already left (`src/sim/projectiles.ts:48-78`; `src/sim/enemyTurn.ts:40-53`;
>    `src/sim/enemies.ts:73-88`; plan `:338-340`). That is the likeliest subtle shipment: the game
>    works, but the art telegraphs a different trajectory from the projectile.
>
> 6. **High** — the repository supports correlation, not the claimed root cause. It confirms every
>    existing Phase-5 clip was requested at `9:16` and returned `720×1280`, and that the documented
>    schema default is `auto`; nowhere in the repository's schema record does it say `auto` infers the
>    input image's aspect (`docs/generations/phase-05-clips.md:5-14,68-70`;
>    `docs/FAL-MODELS.md:183-197`). The causal claim is unverified from repository evidence.
>
>    **High** — the planned probe cannot isolate the cause. Batch 1 simultaneously changes the ratio
>    to `auto`, pads the anchor, and changes the prompt margin, so success cannot tell whether
>    explicit `9:16`, insufficient source margin, or prompt/model framing caused the defect (plan
>    `:149-162,263-266,287-302`). The plan itself concedes model recropping is unknown (plan
>    `:289-290,435-438`).
>
>    **Medium** — repository authorities contradict the categorical framing. The current asset
>    pipeline prescribes an explicit `1:1` ratio for this endpoint, while STYLE records sprite
>    generation at `9:16`; neither prescribes `auto` (`docs/ASSET-PIPELINE.md:147-170`;
>    `docs/STYLE.md:219-227`). The existing Phase-5 audit also calls sentry `fire` and `death` good,
>    whereas the new plan says every sentry clip is cropped — that may be a later discovery, but the
>    repository record is presently inconsistent (`docs/generations/phase-05-clips.md:87-97`; plan
>    `:37-44`).
>
>    **Medium** — G6 does not prove semantic completeness. It only catches an occupied bounding box
>    touching an outer edge; a model can omit or reform a muzzle/leg and still leave green margin.
>    `build-clips` also produces RGB chroma frames rather than alpha frames, so the plan does not
>    specify what "opaque bbox" means at that seam (plan `:109,165-176`;
>    `tools/gen/build-clips.mjs:121-126,183-200`).
>
> 7. **High** — W6 depends on art that Batch 2 has not created. W6 declares `fire-elevated` and says
>    any declared-but-missing action fails the build, but that clip is not purchased until Batch 2, so
>    W6 cannot complete its own end-to-end build while all unpaid work remains ahead of spending (plan
>    `:215-231,304-307`).
>
>    **High** — W6 also requires a scale derived from packed source frames, while packing is deferred
>    to W11 after all three spend batches. Its per-slug bounds configuration cannot be finalized in
>    Phase A under the plan's stated provenance (plan `:232-236,320-328`). The spend batches
>    themselves need not swap order — Batch 3 is correctly after Batch 1 because its bolt palette
>    depends on the `fire` discharge — but the "all Phase A lands before a dollar moves" boundary is
>    impossible: at least W6's full validation/finalization must occur after Batch 2 (plan
>    `:287-312`).
>
> **Could not check:** No shell command, typecheck, unit test, browser test, build, FAL schema query,
> or visual inspection of the binary clips/images was run. The repository-wide "exactly ten
> over-limit files" count was not independently recomputed. This is file-evidence only, read through
> `node_repl` with `fs.readFileSync`, per the machine's permanent process-spawn limitation.

---

## Local re-verification

Every claim above was re-checked locally against the working tree before triage, because Codex could
run nothing. **Ten of ten CONFIRMED, none refuted.** The decisive quotes:

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| No projectile event | **CONFIRMED** | `TickEvents` has exactly six booleans — `jumped, landed, leftGround, attackStarted, hitActive, hitLanded`. `hitLanded` is *the player's melee* connecting. `projectiles.ts:99-104` pushes survivors to `alive` and returns; off-bounds shots vanish with no signal. |
| No firing angle on `Sentry` | **CONFIRMED** | Fields are `x, y, radius, cooldown, cooldownCounter, hp, maxHp, lastHitSwing`. `sentryRenderDesc(sentry, scale)` hard-codes `flipX: false` with the comment *"A turret does not turn."* |
| `build-clips.mjs` throws on grounded one-shots | **CONFIRMED** | *"is an airborne one-shot but its feet never leave the ground … must be regenerated."* The comment above it names the gap: *"`motionOnset` remains the fallback for a one-shot that is not airborne at all (there are none today, but `attack` in Phase 5 will be exactly that)."* `motionOnset` is never called in that branch. |
| 5.12 false green | **CONFIRMED** | Two assertions: `expect(unrecorded).toEqual([])` (path **or bare filename** appearing anywhere in `docs/qa/` suffices) and `expect(over.length).toBeLessThanOrEqual(10)`, commented *"A ceiling, not an assertion that everything is fine."* |
| No sprite renderer | **CONFIRMED** | `enemyLayer.ts:19-28`: *"Rectangles, not sprites, until the art exists … **step 6 swaps in `Sprite`s** and starts reading `desc.animKey`."* `enemy-view.test.ts` imports no Phaser at all. |
| Counts stale | **CONFIRMED** | `VIDEO_MOTIONS` = 14 today (5 inline + 9 from `COMBAT_MOTIONS`). |
| `1:1` vs `9:16` | **CONFIRMED, and they are different endpoints** | `ASSET-PIPELINE.md` prescribes `--aspect_ratio "1:1"` for the **video** call; `STYLE.md` records `9:16` for the **nano-banana-pro stills**. No contradiction — but Phase 5 used `9:16` for the video, against its own pipeline document. |
| Prior "good" verdict on sentry clips | **CONFIRMED** | The section is titled *"Eyeball triage, recorded so a later measurement can contradict it"*, status *"EYEBALLED, NOT YET MEASURED"*. It read motion and missed framing. |
| FAL-MODELS silent on `auto` | **CONFIRMED** | It tabulates `auto` as the default and a legal value and never says what it does. |
| `enemy-view.test.ts` is pure | **CONFIRMED** | Zero `Phaser` occurrences; every assertion calls `healthBarFillWidth`, `fillIsHonest`, `sentryAnim`, `scavengerAnim`, `enemyAnimKeys`. |

---

## Triage

One line per finding, `D1…D10`. Applied, or recorded with a reason *(C11 — silently ignoring one is
not permitted)*.

| ID | Codex answer | Severity | Disposition |
|---|---|---|---|
| **D1** | 4 (first) | blocker | **APPLIED, and better than the plan proposed.** The "impact spark off the existing despawn event" hooked nothing that exists. Fixed with **zero sim change**: the renderer already receives the projectile list each tick, so a bolt present last tick and absent this tick has despawned — draw the spark at its last position. Plan W16. |
| **D2** | 4 (second) + 5 | blocker | **APPLIED.** New work item W6: two **integer pixel deltas** (`lastFireDx/lastFireDy`) stored on `Sentry` at spawn — no floats, no angles in the sim — tested to remain unchanged while the player moves during the 18-tick `fire` window. This was also Codex's answer to Q5 and it was right. |
| **D3** | 4 (third) | blocker | **APPLIED.** Promoted to **W1, the first task of the phase**, because it blocks all packing. The session had found only the `VIDEO_DIR` bug and would have hit the throw on the first combat clip. |
| **D4** | 2 (first) | blocker | **APPLIED.** 5.12's evidence column corrected: a green `file-size.test.ts` proves *"≤10 over-limit files, each name-dropped in a QA log"*, not the criterion. Evidence is now the reviewer's diff read **plus** the ten files named with justifications (4.16 debt). |
| **D5** | 4 (fourth) | high | **APPLIED.** New work item W8. Criteria 5.4, 5.8 and 5.11 all depended on a renderer that no task was building. |
| **D6** | 3 | high | **APPLIED.** The contradiction was real: the plan claimed anchor-derived scale and then said packed-frame-derived. The anchor is 2048² against 720×1280 clips, so it **cannot** supply the sheet's scale. The plan no longer claims A5 compliance — it is recorded as a C11 limitation beside the existing one at `qa/phase-05-combat.md:152`. |
| **D7** | 6 (second) | high | **APPLIED.** The probe changed three variables at once. Batch 1's `brass-sentry/fire` now changes **one** — the aspect ratio, to the `1:1` this repository's own pipeline document already prescribes — with the unpadded anchor and the prompt held constant. |
| **D8** | 4 (fifth) | high | **APPLIED.** 14 → 15 motions, 9 → 10 sheets, throughout; plus an amendment to the frozen scope table so the docs do not contradict the build. |
| **D9** | 7 | high | **APPLIED.** `fire-elevated` joins the sentry's action list in Phase C, after Batch 2 buys it; scale finalisation moves to W15. The "all Phase A before a dollar moves" boundary was impossible as written. |
| **D10** | 2 (rest) + 6 (third, fourth) | high/med | **ALL APPLIED.** 5.2 gains a `chaseSpeed` sweep measuring chase travel; **`INDETERMINATE` is stated to be a FAILING 5.4c result**; 5.7's live assertion is pinned at **2/60 HP**; 5.11 gains a counted visible-sprite/projectile assertion; 5.4d covers `fire-elevated`; G6 is respecified against the **chroma-keyed mask** (not "opaque pixels" — `build-clips` emits RGB, not alpha) with its semantic blind spot stated. |
| **D11** | 1 | high/med/low | **RECORDED, NOT APPLIED as a cut.** Codex is right that the projectile bolt and `fire-elevated` exceed the frozen nine-sheet scope — but both are **explicit user decisions taken in this session**, so they are approved expansion; the plan amends the scope table rather than dropping them. On G4/G6 not being §6 deliverables: also correct, and they stay, because PRD §1b's own rule is *"a gate that prevents a re-shoot is worth more than a cheaper endpoint."* |

**One correction to the plan's own framing, made because Codex forced it.** The plan asserted the
repository proved the `aspect_ratio` root cause. It does not — `FAL-MODELS.md:183-197` lists `auto`
and never says what it does; that came from a live `genmedia schema` query, recorded in the QA log as
live evidence. What the repository *does* show is stronger and had been missed:
**`ASSET-PIPELINE.md:147-170` already prescribed `1:1` for this endpoint, and Phase 5 submitted
`9:16` against its own documented pipeline.**

**Net effect:** three blockers and six high findings changed the work materially — one task promoted
to first position, two new work items created, one sim change added, one probe redesigned to isolate
a single variable, six evidence rows rewritten, and one vault claim withdrawn rather than defended.
One finding was recorded with a reason. Nothing was silently dropped.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`. The phase cannot be reported done until it has run
and every finding of *its* is applied or recorded.

---
---

# Phase 5 — Codex plan review of the SESSION-3 execution plan

**Ran:** 2026-08-10, session 3, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction. **Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-quirky-graham.md`
(revision 1) against HANDOFF.md, the phase plan of record, both reviews above, the §6 gate, and the
source each claim named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test or build and verified no fal claim.
File evidence only, stated by Codex itself. **Verdict: BLOCK — 22 findings, 3 blockers.**

## The three blockers, verbatim and re-verified locally

> **Blocker 1** — the plan claims no circular import is created because *"`clipJobs` does not import
> `clipSource`."* But `tools/gen/clipJobs.mjs:32` imports `NAMESPACED_VIDEO_DIR` from
> `clipSource.mjs` and uses it at `:181`. Making `clipSource.mjs` import `CLIP_JOBS` would create
> `clipSource → clipJobs → clipSource`.
>
> **Blocker 5** — `submit-clips.mjs:45` always sets the download path to `${stem}.mp4`, and the plan
> does not include that file. The prescribed re-shoot command can **overwrite the existing canonical
> round-one file** instead of creating `-r3`.
>
> **Blocker 6** — `build-clips.mjs:203-204` creates only `_generated/sheets`, then writes to
> `join(SHEET_DIR, "${action}-clip.png")` at `:251-252`. A namespaced action such as
> `brass-courier/attack` targets `_generated/sheets/brass-courier/attack-clip.png`, but nothing
> creates that subdirectory. **The acceptance can pass immediately before failing at this next
> obstruction.**

Codex also **overturned a claim the plan's author had made**: that a Phaser `Group`'s children Set is
unordered. `node_modules/phaser/src/gameobjects/group/Group.js:106` uses a native JS `Set`, which
**is** insertion-ordered. The accurate objection is *no index-based access*. Corrected, not defended.

## Local re-verification — 3 of 3 blockers CONFIRMED

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| Circular import | **CONFIRMED** | `clipJobs.mjs:32` reads `import { NAMESPACED_VIDEO_DIR } from './clipSource.mjs';`. `clipJobs.mjs:34-39` documents this exact TDZ hazard in its own comment. |
| Paid-clip overwrite | **CONFIRMED** | `submit-clips.mjs:45`: `` const downloadPath = `${VIDEO_OUT_DIR}/${stem}.mp4`; `` — no collision check. Would destroy ~$1.19 of non-regenerable input. |
| Nested output dir | **CONFIRMED** | `build-clips.mjs:204` `mkdirSync(SHEET_DIR…)` only; `:251` `join(SHEET_DIR, \`${action}-clip.png\`)`. |

## Triage

Full disposition table for all 22 findings is in the session-3 plan file. Summary: **21 applied, 1
partly applied with the remainder recorded** (finding 8 — `build-world.mjs:47-73` carries the same
latent glob-ambiguity defect as `findClip` did; it is Phase 3 territory and out of this session's
appetite, recorded here rather than silently left). Nothing was silently dropped.

**Net effect:** the design was inverted (`clipSource` stays a leaf; the declared filename is passed
in at the call site), two files were added to the blocking work item's scope, one work item gained a
hard dependency on another, and six acceptance checks were rewritten because they could have gone
green on broken work.

---
---

# Phase 5 — Codex plan review of the SESSION-4 execution plan

**Ran:** 2026-08-11, session 4, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-pure-crane.md` (revision 1) against
HANDOFF.md §9, the phase plan of record, the three reviews above, the §6 gate,
`docs/qa/phase-05-combat.md`'s agent-owner findings, `docs/generations/phase-05-jump-reshoot.md`, and
the source each claim named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test or build and verified no fal claim.
**But it did more than read this time:** it executed the repository's own pure PNG/chroma functions
in-process through `node_repl`, which is what produced the decisive 78.4 % measurement in blocker 2.

**Verdict: BLOCK — 4 blockers. All four re-verified locally. All four CONFIRMED.**

## The four blockers, verbatim

> **Blocker 1** — *"The padded anchor cannot have the promised geometry. The source is 1536×2752 with
> a 2525 px-high subject (91.8%). Placing it byte-identically into a 2752×2752 canvas leaves its height
> and vertical margins unchanged: it remains 91.8% tall, not ~51%, with 5.1% top headroom — not ~24%.
> The plan simultaneously requires a translation-only, byte-identical blit and an impossible vertical
> reduction."*
>
> **Blocker 2** — *"A-T1's proposed crop→estimate path fails its own historical regression fixture.
> `estimateKeyColour` requires 90% agreement over the one-pixel border. Fresh in-process evaluation of
> `brass-sentry-fire-frame.png` returned only **78.4%** and threw before G6 could report the promised
> left/right failure."*
>
> **Blocker 3** — *"A-T5 does not bypass the five shipped courier motions.
> `configFor('brass-courier').actions` begins `idle, walk, run, jump, fall` before the Phase-5 actions.
> Therefore the proposed work list still re-extracts all five and reaches the known-failing `jump`."*
>
> **Blocker 4** — *"A-T7's 'delete the redundant block' breaks sentry cadence. The first check
> increments the cooldown; the second check prevents firing while it remains open. Deleting lines
> 144–146 makes every visible sentry fire on every tick."*

## Local re-verification — 4 of 4 CONFIRMED

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| Padding geometry impossible | **CONFIRMED** | The anchor is 1536×2752, measured with the repo's own decoder. Padding to 2752² adds **width only**; fill stays 91.8 %, headroom stays 5.1 %. Reaching 65 % fill by translation alone needs a **3884²** canvas. Revision 1 would have spent $1.19 on an anchor without the property under test. |
| `estimateKeyColour` throws at 78.4 % | **CONFIRMED, to the digit** | `estimateKeyColour: only 78.4% of border pixels are within 120 of the median (0,245,4)`. Measured 0.7841. |
| Courier work list still contains `jump` | **CONFIRMED** | `slugConfig.mjs:28` — `actions: ['idle','walk','run','jump','fall','attack','hurt','death']`. |
| `enemies.ts:144` is load-bearing | **CONFIRMED** | `:138` `if (windowOpen(...)) counter += 1` is a **saturating increment**; `:144` `if (counter < cooldown) return {fired:false}` is the **fire guard**. Different jobs, same expression. |

**Blocker 2's resolution is better than the plan it replaced, and Codex forced it.** Border agreement
turns out to *separate* the two cases cleanly, measured across every committed fixture: a uniform
background of **any** colour agrees at **1.0000** — including the off-key `(0,195,64)` field that R3 is
about — while subject-on-the-border drops it to **0.78–0.93**. So the border **median** is the right
key in both cases, and the **agreement floor** is what must be bypassed, not the alpha threshold.
`borderKey(image) = estimateKeyColour(image, { minAgreement: 0 })`.

**The four-direction re-validation, run before the plan was rewritten:**

| direction | with `borderKey` | today (default key) |
|---|---|---|
| real cropped `brass-sentry-fire` | **FAIL** `{left:0,right:0,top:43,bottom:29}` | FAIL |
| real clean Phase 4 `idle` | **PASS** `{30,41,13,6}` key `[3,231,8]` | PASS |
| **R3:** off-key `(0,195,64)`, well framed | **PASS** `{30,30,30,30}` key `[0,195,64]` | **FAIL** ← the false positive |
| **R3 ∩ crop** *(Codex §5)*: off-key **and** at the edge | **FAIL** `{60,0,30,30}` | FAIL |

The fourth row is the one Codex demanded, and it is the one that proves the gate was not loosened: a
clean off-key PASS plus a pure-green cropped FAIL does not cover their intersection.

## A correction Codex forced to the repository record

Codex noticed that `docs/generations/phase-05-jump-reshoot.md:22` calls the courier anchor
*"a **square 2048²** anchor"*. **It is 1536×2752 — ratio 0.558, which is essentially 9:16.**

That is load-bearing. HANDOFF §8 recorded the crop's root cause as *"its square anchor forced into
9:16 lost ~14 % off each side"* — a description that **never applied to the courier at all**. Phase 4's
`jump` was shot at 9:16 **from a 9:16 anchor**, so no reframing occurred, and it still cropped on the
right. The plan's single-axis mechanism was therefore correlation dressed as mechanism, exactly as
Codex said, and it has been replaced with **two** causes: reframing, and motion-induced extension
beyond the anchor's static silhouette — the latter already recorded independently at
`motion.mjs:286,291`, which describes a prior jump translating upward inside its frame until sampled
frames had no head.

## Triage

Full disposition for all four blockers and the eight section findings (§1–§8) is in the session-4 plan
file. Summary: **12 of 12 applied, none rejected, none silently dropped.** The plan was rewritten as
revision 2 rather than patched.

**Net effect:** the probe's canvas arithmetic was corrected (it would have tested nothing), the G6 key
seam was redesigned around a measurement Codex produced, scoping moved from slug-level to action-level,
a proposed "cleanup" that would have shipped a live combat regression was reversed, the mechanism claim
was withdrawn and replaced, eight omitted §6 criteria and the whole §1b debt ledger were restored to the
status table, and the task DAG was corrected for a file collision between two items the plan had called
parallel-safe.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`. The phase cannot be reported done until it has run and
every finding of *its* is applied or recorded.

---
---

# Phase 5 — Codex plan review of the SESSION-5 execution plan

**Ran:** 2026-08-11, session 5, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-glittery-sketch.md` (revision 1)
against HANDOFF.md §10, the phase plan of record, the four reviews above, the §6 gate,
`docs/qa/phase-05-combat.md`, `docs/generations/phase-05-ratio-match.md`, and the source each claim
named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test, build, ffmpeg, Playwright or fal
command. File access through `node_repl` only — **but it again did more than read**, evaluating
`padAnchor.mjs`'s geometry in-process to check the plan's canvas arithmetic. Branch confirmed as
`phase-05-combat`. Codex stated its own limits rather than being asked to.

**Verdict: BLOCK — 4 blockers, 4 major, 1 minor. All re-verified locally.
8 CONFIRMED, 1 PARTLY REFUTED.**

**Three user decisions were declared closed to redesign in the prompt** and Codex respected that:
spend early; re-shoot `brass-sentry/fire` with less muzzle blast rather than modify G6; split only
the files Phase 5 touches and report 5.12 failing.

## The blockers, verbatim

> **Blocker — 5.4d / catalog.** *"`enemyAnimTimings()` tests use invented fixture frame counts, not
> shipped catalog rows; `build-assets.mjs` never writes `index.json` for enemies, while
> `GameScene.ts` reads `sheet.fps` from that catalog."*
>
> **Blocker — dependencies.** *"No per-action padded-anchor job config exists — `CLIP_JOBS` assigns
> one original anchor URL per slug; nothing routes padded anchor URLs into job records before
> `submit-clips.mjs` fires."*
>
> **Blocker — dependencies.** *"`character-bounds-brass-sentry.json` and
> `character-bounds-rust-scavenger.json` don't exist; `build-assets.mjs` throws without them, and
> even `--derive-scale` needs `renderHeightPx` from the config first."*
>
> **Blocker — dependencies.** *"No catalog-writing path exists for enemy sheets — `build-assets`
> writes PNGs/reports/lift profiles but nothing updates `index.json`; Boot never registers enemy
> animations without it."*
>
> **Blocker — most likely wasted spend.** *"The `brass-sentry/fire` padded re-shoot would be
> submitted with the **original unpadded anchor**, because `submit-clips.mjs` reads `anchorUrl` from
> `CLIP_JOBS`, which the plan never updates to point at the padded/uploaded version. This would spend
> $1.19 without exercising the padding treatment it's meant to test."*

Codex also **confirmed the arithmetic revision 1 had guessed at**, evaluated in-process through
`padAnchor.mjs:58-80`: courier **5050²** at `--fill 0.50` → ~25.5 % / 24.5 % margins; scavenger
**3690²** at `--fill 0.45`. The prior session's review found this same arithmetic *impossible* and
saved $1.19; this time it holds, and the measured canvases supersede the plan's estimates.

## Local re-verification — 8 CONFIRMED, 1 PARTLY REFUTED

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| Padded re-shoot submits the **unpadded** anchor | **CONFIRMED** | `clipJobs.mjs:108` `ANCHOR_URLS` is keyed **by slug**, one URL each; `:240` `const anchorUrl = ANCHOR_URLS[slug]`; `submit-clips.mjs:95` emits `--image_url "${job.anchorUrl}"`. No per-record override exists. |
| No per-slug bounds config | **CONFIRMED** | `public/assets/config/` contains exactly `character-bounds.json` and `lift-profile.json`. Neither is per-slug. |
| **Nothing writes `index.json`** | **CONFIRMED, and the docstring is false** | `build-assets.mjs` has exactly three `writeFileSync` calls — `:285` the strip PNG, `:328` the report, `:349` the lift profile. Its own docstring `:5` claims it *"writes both the PNG and the catalog rows"*. HANDOFF.md:251 already recorded the truth. `index.json` carries **five** courier keys and **zero** enemy rows. |
| One shared health-bar `Graphics` | **CONFIRMED** | `enemyLayer.ts:41` `private bars!: Phaser.GameObjects.Graphics`, `:60` one `this.scene.add.graphics()` for **all** enemies. |
| `sync()` skips uncreated bodies | **CONFIRMED** | `enemyLayer.ts:49-56` creates sprites once in `create()`; `:91-109` `sync()` has no growth path. |
| `verify-dist.mjs` checks a fixed list | **CONFIRMED** | `:82-111` enumerates literal scene keys, symbols and prose phrases. A new symbol is not covered until added. |
| `fire-elevated` missing from the buy list | **PARTLY REFUTED** | `slugConfig.mjs:13` omits it **deliberately, with the reason written in place**: *"that art has not been bought yet."* The repository is self-consistent; **the plan's wording was not.** |

## Triage

`E1…E10`, applied or recorded with a reason *(C11)*.

**8 applied, 1 partly refuted and applied as a wording correction, 1 recorded with a reason. Nothing
silently dropped.** The full disposition table is in the session-5 plan file.

**Net effect:** the review **moved three pieces of unbuilt pipeline in front of the spend** and
corrected a padded-anchor path that would have burned the entire batch. Revision 1 would have spent
**$8.33 shooting the unpadded anchors** — testing nothing — and then packed sheets that no catalog
row would ever have registered, leaving `EnemyLayer` drawing Rectangles and criteria 5.4, 5.4d, live
5.7, 5.8 and 5.11 exactly as unreachable as before. The plan was rewritten as **revision 2** rather
than patched, and the user re-confirmed the spend ordering with the new information in hand.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`.

---
---

# Phase 5 — Codex plan review of the SESSION-6 execution plan

**Ran:** 2026-08-11, session 6, **before any code and before any further spend.**
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` / `fs.readFileSync`
instruction from [PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol).
**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-staged-mountain.md` (revision 1)
against HANDOFF.md §11, the phase plan of record, the five reviews above, the §6 gate,
`docs/qa/phase-05-combat.md`, `docs/generations/phase-05-ratio-match.md`, CLAUDE.md, and the source
each claim named.

**Still a PLAN review, not the implementation review.** Criterion 5.14 remains **UNRUN**.

**Scope split.** Codex again had no network and again could not spawn a process
(`CreateProcessAsUserW failed: 5`), so it ran no typecheck, test, build, ffmpeg, Playwright or fal
command. File access through `node_repl` only — **but it again did more than read**, evaluating the
repository's own job tables and the installed Phaser source in-process. Codex stated its own limits
rather than being asked to.

**Verdict: BLOCK — 6 blockers, 3 major. All re-verified locally. All CONFIRMED**, including two the
plan's author had stated wrongly himself.

## The review, verbatim

> **BLOCK**
>
> Do not execute Task 2. The plan still has several pre-spend blockers, including one that makes all
> seven new downloads resolve to the wrong—or no—input during extraction.
>
> **1. Task 3 catalog finding — verified, but the fix is incomplete**
>
> - Confirmed: `brass-courier/attack` and `/death` are silently skipped. `CATALOG_TIMING_SLUGS`
>   contains only the keys of `FIXED_TIMINGS`, currently sentry and scavenger; `build-assets` only
>   creates rows when that set contains the slug. `catalogTimings.mjs:34`, `build-assets.mjs:319`
> - Confirmed: scavenger `walk` and `chase` enter the catalog path, then `timingFor()` throws because
>   only scavenger `death` exists. `catalogTimings.mjs:40`, `catalogTimings.mjs:46`
> - Downstream runtime accepts valid rows: catalog validation accepts the full `SheetEntry` shape,
>   Boot loads and frame-count-checks them, and GameScene registers every catalog sheet.
>   `assetCatalog.ts:132`, `BootScene.ts:102`, `GameScene.ts:467`
> - Enemy action agreement is already correct and mechanically tested: sentry `idle/fire/death`,
>   scavenger `walk/chase/death`. `enemyView.ts:69`, `slug-config.test.ts:73`
>
> Blocker: Task 3's proposed coverage test cannot pass as described. It says every action of every
> slug must resolve, but courier has eight actions; the plan adds timings only for `attack/hurt/death`.
> Its predicted failure list wrongly omits courier `idle/walk/run/jump/fall`. Worse, adding courier to
> the slug-level `CATALOG_TIMING_SLUGS` while supporting only three actions makes a later bare courier
> build throw partway through. `plan:185`, `slugConfig.mjs:23`
>
> Blocker: the clean existing `brass-courier/hurt` clip is never extracted or packed. Task 4 processes
> only the seven purchased clips, but `hurt` remains required and pending. `plan:206`,
> `asset-catalog.test.ts:103`
>
> **2. Spend ordering — still blocked**
>
> The submitted parameters will use the padded anchors after Task 1, and only `walk` and `chase`
> correctly receive `--end_image_url`. That half is sound. `submit-clips.mjs:82`
>
> The fatal problem is filename resolution:
>
> | Key | New download selected from current disk | `CLIP_FILES` still declares |
> |---|---|---|
> | sentry/fire | `brass-sentry-fire-r4.mp4` | `-r3.mp4` |
> | sentry/death | `brass-sentry-death-r3.mp4` | `-r2.mp4` |
> | scavenger/walk | `rust-scavenger-walk-r3.mp4` | `-r2.mp4` |
> | scavenger/chase | `rust-scavenger-chase-r3.mp4` | `-r2.mp4` |
> | scavenger/death | `rust-scavenger-death-r3.mp4` | `-r2.mp4` |
> | courier/attack | `brass-courier-attack-r3.mp4` | `-r2.mp4` |
> | courier/death | `brass-courier-death-r2.mp4` | `null` |
>
> `submit-clips` computes the next free download independently of `job.file`; `findClip` later trusts
> `job.file` exactly. Therefore six actions consume the superseded clip, while courier death becomes
> ambiguous and throws once both files exist. `submit-clips.mjs:27`, `submit-clips.mjs:65`,
> `clipJobs.mjs:170`, `clipSource.mjs:44`
>
> `validateClipJob()` never validates `file` against the rendered download path, so all seven commands
> can look valid while producing files later work ignores. `clipJobs.mjs:235`
>
> Severity: Blocker. Catalog wiring does not alter submitted bytes, but the producer/consumer filename
> contract must be closed before spending or explicitly updated immediately after each successful
> download and before extraction.
>
> **3. Task 4 scale ordering — deadlocked**
>
> - `assets:clips` does not read the bounds config or scale, so `scale: null` does not structurally
>   block extraction.
> - Ordinary `assets:build -- rust-scavenger walk` fails because normal packing requires `scale > 0`.
>   `build-assets.mjs:178`
> - `--derive-scale` hardcodes `findSource('idle')`; it does not derive from the requested `walk`
>   action. `build-assets.mjs:153`
> - Scavenger deliberately has no `idle` action or sheet. `character-bounds-rust-scavenger.json:25`
>
> Thus even after extracting `walk`, `node ... rust-scavenger walk --derive-scale` searches for
> `rust-scavenger-idle-clip.png` and throws.
>
> Severity: Blocker. The scale derivation must be made action-aware, and because that requires changing
> the exactly-400-line `build-assets.mjs`, the file-size split must move ahead of this work.
>
> **4. Expected-failure lock and suite impact**
>
> No command in the written plan repacks `brass-sentry/idle`; its expected-failure lock remains intact.
> `shipped-sheets.test.ts:137`
>
> But `npm test` will not pass when the new rows land:
>
> - `shipped-sheets.test.ts` requires the catalog keys to equal its current exact six-item list. Any
>   new row breaks it.
> - `asset-catalog.test.ts` still declares courier `attack/hurt/death` pending; adding attack/death
>   without updating this test fails both count and pending-art assertions.
> - `enemy-layer-catalog.test.ts` requires shipped enemy keys to remain a proper subset; completing all
>   six intentionally expires and fails that assertion.
> - `slug-config.test.ts` should remain green.
>
> Severity: Blocker — these are required expiry updates, not test loosening.
>
> **5. Tasks 6–7 — W19, 5.11 and 5.7**
>
> Blocker — the 5.7 fixture reopens a previously applied requirement. `createScavenger({ hp: 2 })` sets
> both `hp` and `maxHp` to 2, producing a full 2/2 bar rather than a low-health 2/60 bar, so the
> near-empty rendering can pass while broken. Construct at normal 60 HP and then set only `hp = 2`.
> `enemies.ts:212`, `enemyHealthBar.ts:67`
>
> Major — the plan misstates the current growth failure. The `continue` occurs before bar drawing, so a
> late enemy gets neither body nor bar. `enemyLayer.ts:104`
>
> Major — the 5.11 count remains underspecified. The shipped level already starts with two enemies. The
> assertion must count the delta of enemy body sprites with enemy texture keys and name a fixed
> positive N, or baseline bodies / shared Graphics can satisfy it vacuously.
>
> Installed Phaser finding: `commandBuffer` is public and readable in installed `phaser@4.2.1`;
> `fillRect` appends `[FILL_RECT,x,y,w,h]`. `clear()` empties it, but both renderers only read it — they
> do not consume/reset it — and `sync()` clears/redraws synchronously, so Playwright sees the completed
> non-empty buffer between frames. `Graphics.js:133`
>
> `playIfChanged` is compatible with runtime growth: `addBody` starts the animation once and the
> following sync sees the same key. No new `verify-dist` scene-key or prose entries are required; the
> exported spawn-helper symbol belongs in the bare-symbol list.
>
> **6. Task 8 and criterion 5.12**
>
> Blocker — the ordering argument misses `clipJobs.mjs` at 372. Six new records add at least 30 lines,
> taking it to roughly 402 — an eleventh over-limit file — and Task 3 runs full `npm test` before Task
> 8, so it cannot produce its promised PASS. `clipJobs.mjs:145`, `file-size.test.ts:78`
>
> Fixing Task 4 also necessarily touches the exactly-400-line `build-assets.mjs`, so Task 8 cannot
> remain at position 8.
>
> The barrel approach itself is viable and compatible with `sim-boundary.test.ts` and the
> Phaser-uninstalled import check; a barrel under 400 lines needs no QA-log name. However: the current
> tree has 18 direct importer files, not 22; the split design leaves
> `EnemySpawn`/`EnemySet`/`spawnEnemies`/both boxes/`overlapsScavenger` (lines 299–400) without a stated
> destination while `enemies.ts` is required to be re-exports only; and moving the boxes makes
> provenance references in both character-bounds JSON files stale, which Task 8 doesn't account for.
>
> Severity: Major after the ordering blocker.
>
> **7. Most likely subtle shipment**
>
> The 5.7 browser proof will spawn a "2 HP" scavenger as 2/2 HP, observe a full bar, and report the
> low-health bar correct without ever exercising it — reopening the phase's prior D10 finding. The stale
> `CLIP_FILES` issue is more immediate but usually stops loudly during extraction; the 2/2 health-bar
> fixture can survive the entire stated gate and ship unnoticed.
>
> **Could not check:** process spawning is permanently unavailable, so typecheck/Vitest/build/ffmpeg/
> Playwright/asset commands could not be run; network access is unavailable, so fal.ai pricing, live
> schema, licensing, and uploaded-byte hashes could not be verified; the seven new clips don't exist
> yet, so their extraction/gate outcomes could not be inspected. Findings are source evidence plus
> in-process evaluation of the repo's JS job tables and installed Phaser source; no files were modified.

---

## Local re-verification — all CONFIRMED

Every claim was re-checked against the working tree before triage, because Codex could run nothing.

| Claim | Verdict | Decisive local evidence |
|---|---|---|
| `CLIP_FILES` stale for all seven | **CONFIRMED, to the filename** | `brass-sentry-fire-r3.mp4` is on disk, so the next free path is `-r4`; the record declares `-r3`. The other five declare `-r2` while `-r2` already exists, so each new download becomes `-r3`. `brass-courier/death` declares `null` and two candidates would exist. |
| `--derive-scale` hardcodes `idle` | **CONFIRMED** | `build-assets.mjs:157` — `const { keyed } = keySheet(findSource('idle'));` with the comment *"The canonical standing height comes from `idle`."* `character-bounds-rust-scavenger.json` states the scavenger has no `idle` **by design**. |
| `createScavenger` sets `maxHp: hp` | **CONFIRMED** | `enemies.ts:213-229` — `const hp = options.hp ?? 60;` then `hp, maxHp: hp`. `healthBarFillWidth` returns the full `slotW` when `hp >= maxHp` (`enemyHealthBar.ts:74-76`). A "2 HP" scavenger draws a **full** bar. |
| `clipJobs.mjs` would cross 400 | **CONFIRMED** | `wc -l` = **372**. Six records with the docstrings this file's convention requires add ~30 lines. |
| The `continue` precedes the bar draw | **CONFIRMED** | `enemyLayer.ts:104` `this.bars.clear();` → `:107-109` `continue` → `:122-126` the bar draw. A late enemy gets **neither** body nor bar. Revision 1 said *"bar drawn, no body"* and was **wrong**. |

## Triage

`F1…F9`, applied or recorded with a reason *(C11)*.

| ID | Severity | Disposition |
|---|---|---|
| **F1** | blocker | **APPLIED.** The `CLIP_FILES` contract becomes a tested invariant (new Task 1), and updating it to the ACTUAL downloaded filenames is a **hard gate** before any extraction (Task 2 step 4). |
| **F2** | blocker | **APPLIED.** `--derive-scale` becomes action-aware (Task 4 step 1). |
| **F3** | blocker | **APPLIED.** The 5.7 fixture constructs at 60 HP and sets `hp = 2` only, and asserts `0 < fillW < slotW` — the upper bound is what the `maxHp` trap would otherwise hide. **This reopened D10 and Codex was right to call it the most likely subtle shipment.** |
| **F4** | blocker | **APPLIED.** The 5.12 split moved from position 8 to **Task 0**. |
| **F5** | blocker | **APPLIED.** The coverage test is scoped to (slug, action) pairs this phase packs; catalog gating moves from per-slug to **per-(slug, action)**. |
| **F6** | blocker | **APPLIED.** `shipped-sheets`, `asset-catalog` and `enemy-layer-catalog` assertions are updated as **required expiries, not loosening** (Task 4 step 6). |
| **F7** | blocker | **APPLIED.** `brass-courier/hurt` added to the packing list. |
| **F8** | major | **APPLIED.** The growth-bug rationale corrected in place rather than quietly fixed — a wrong rationale is exactly what finding A1 was about. |
| **F9** | major | **APPLIED.** `enemyPlacement.ts` named as the destination for lines 299-400; importer count corrected to 18; both `character-bounds-*.json` provenance references updated. |

**Net effect:** the review **moved the file-size split to the front of the session**, closed a
producer/consumer contract that would have made all seven paid downloads invisible to the pipeline,
un-deadlocked the scavenger's scale derivation, and caught a 5.7 fixture that would have passed the
entire QA gate while proving nothing. **Revision 1 would have spent $8.33 and extracted the clips it
was buying replacements for, silently, for six of seven keys.** The plan was rewritten as
**revision 2** rather than patched. **9 of 9 applied, none rejected, nothing silently dropped.**

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`.

---

# Phase 5 — Codex plan review of the SESSION-7 execution plan

**Reviewed:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-vectorized-hanrahan.md`, against
`docs/prd/phase-05-combat.md` §1b and §6, and `docs/PRD.md` Global Constraints.
**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` + `fs.readFileSync`
instruction (the sandboxed shell cannot spawn processes on this machine — `CreateProcessAsUserW
failed: 5`, permanent).
**Run:** 2026-08-12, before `ExitPlanMode`, per CLAUDE.md §4 and criterion 5.13.
**Verdict: BLOCK — 4 blockers, 3 major, 1 minor.**

**This is the seventh plan review of this phase.** The plan under review proposed: the global cell
288×384 → 384×384 (decision D1), a declarable per-`(slug, action)` scale (D2), the ceiling raised
$45 → $55 (D3), and config-then-gate ordering with art last (D4).

## The review, verbatim

> # BLOCK — revise the plan before implementation
>
> ## Findings
>
> 1. **BLOCKER — Task 2 cannot reach its promised green commit because `rust-scavenger/walk` also lacks a stride.**
>
>    The plan says only `chase` is blocked on `stridePxPerCycle`, then requires `walk` to be packed, the orphan-coverage test to pass, and Task 2 to commit before Task 4 measures the strides (plan:31, plan:245, plan:249). In fact, both `walk` and `chase` are `null` (`character-bounds-rust-scavenger.json:22`), and the timing tests explicitly classify both as unmeasured (`catalog-timings.test.ts:152`).
>
>    `build-assets` writes the PNG first, then asks `catalogRowFor` for timing (`build-assets.mjs:232`, `build-assets.mjs:256`); missing timing throws (`catalogTimings.mjs:121`). That leaves a PNG without a catalog row, precisely what `catalog-completeness.test.ts` rejects (`catalog-completeness.test.ts:37`).
>
>    Measure/set both strides before writing shipped `walk`/`chase`, or pack them only to scratch until Task 4. As ordered, Task 2 cannot pass its own gate.
>
> 2. **BLOCKER — the proposed scale guard is not executable against the existing profiles, and RED-B is logically false.**
>
>    Existing lift profiles store one root `scale`; their animation entries have neither `scale` nor `scaleSource` (`lift-profile.json:3`, `lift-profile.json:6`). The proposed guard requires every merged entry to have both fields (plan:268), while the writer preserves all old animation entries during a per-action merge (`catalogWrite.mjs:57`). Therefore the first Task-3 build will reject the legacy entries unless the plan explicitly migrates them.
>
>    Separately, removing `attack`'s override does **not** produce the claimed collision. The proposed resolution falls back to `config.scale`; that produces another valid `'slug'` entry with the same scale as every existing slug entry (plan:269, plan:284). The guard has no information from which to infer that this particular action required an override.
>
>    The redesign adds useful finite/source/cross-slug checks, but it is not strictly stronger: it deliberately accepts multi-scale profiles that the current guard rejects (`catalogWrite.mjs:50`). Add explicit legacy migration and tests for every stated invariant, including cross-slug merge and unknown source.
>
> 3. **BLOCKER — Task 5 still leaves criterion 5.12 failing.**
>
>    The phase criterion says "No file > 400 lines" (`docs/prd/phase-05-combat.md:138`). The plan splits four files and accepts merely "strictly below 10," with remaining offenders justified (plan:375, plan:417). That leaves six over-limit files. The existing QA log explicitly warns that a green result does not satisfy 5.12 (`docs/qa/phase-05-combat.md:209`).
>
> 4. **BLOCKER — optional Task 9 invalidates the implementation review.**
>
>    The plan says art after the gate is art the gate has not reviewed (plan:51), runs the implementation review in Task 7 (plan:455), then allows new art in Task 9 (plan:489). If Task 9 runs, review 2 and full verification must rerun on the phase's final diff — otherwise Task 9 must be made explicitly post-phase.
>
> 5. **MAJOR — criterion 5.4 has no durable "advanced past frame 0" procedure** — a screenshot cannot prove frame advancement; needs e2e or Playwright sampling of multiple `currentFrame.index` values.
>
> 6. **MAJOR — the adoption-reversal checklist omits durable supersession records and a courier-specific anchor contract** — `GENERATION-LOG.md:170` and `docs/generations/phase-05-padded-round.md:66,71` still declare the padded courier clips unusable and need a dated supersession entry; `SUPERSEDED_CLIPS` needs `attack-r5`/`death-r4` added explicitly.
>
> 7. **MAJOR — Task 2 can pass without proving its named pure-padding behaviour** — the catalog metadata test compares frame dimensions only, not figure placement, so centroid-alignment could regress silently.
>
> 8. **MINOR — the claimed lift-profile `_comment` diff is unsupported** — for a width-only repack, the expected profile diff is no diff at all; the comment is a constant unrelated to frame width.
>
> ## Claims that check out
>
> - Global width is data in the three bounds files (currently 288), mirrored via `catalogTimings.mjs:146`.
> - The pure-padding claim holds: crop/scale happen before centroid-aligned placement in `sheets.mjs:341-352`; widening by 96 adds exactly 48 to each cell-relative `left`.
> - `frameDifference` scales by exactly 0.75; `gateLoopWrap` is invariant; `gateMotionFloor`'s worst existing peak (0.02046) leaves 7.67x headroom — supports "no shipped verdict flips," not new sheets.
> - Literal disagreement resolved: only `sheet-packing.test.ts:269` is a real shipped-width literal; the 288/384 values in `catalog-timings.test.ts` and `gym-geometry.test.ts` are synthetic/independent fixtures and should stay unchanged.
> - File-size inventory (exactly 10 over 400, `GymScene.ts` at 399) and the `<= 10` cap are accurate.
> - No Phaser/`Date`/`Math.random`/DOM in `src/sim/`; no fractional-second durations; no authored fps (all derived via `deriveFps`).
>
> ## Could not check
>
> Codex could not execute any test suite, build, or Playwright run; could not diff against `main` or check working-tree cleanliness; could not validate fal.ai URLs/prices/schemas or visually judge contact strips; and could not independently establish freshness of gitignored `_generated` snapshot values. No files were modified — this was read-only via `node_repl`/`fs.readFileSync`.

## Local re-verification — the two decisive blockers CONFIRMED

Re-verified by the orchestrator before triage, not taken on Codex's word.

**Blocker 1 — CONFIRMED.** `character-bounds-rust-scavenger.json:22` reads verbatim:

```
"stridePxPerCycle": { "walk": null, "chase": null },
```

**Both are null.** Every prior handoff records `walk` as blocked on cell width and `chase` as blocked
on the stride, as though they were different problems. `walk` hits the pack blocker first, so nobody
ever reached its catalog blocker. **This is the fourth time in this phase that "extraction stops at
the first failure" has hidden a second defect behind the first.**

**Blocker 2 — CONFIRMED.** `lift-profile.json:3` carries a root `"scale": 0.23723229`, and its
animation entries begin `"idle": { "anchor": "feet", …` — **no `scale`, no `scaleSource`.** Since
`upsertLiftProfile` preserves old animation entries on a per-action merge (`catalogWrite.mjs:57`), the
proposed clause-1 check would reject every legacy entry on its first run. Codex's second point is also
correct on inspection: removing an override falls back to `config.scale` and yields a valid
slug-sourced entry, so the plan's RED-B red-run **could not have fired**.

**Blockers 3 and 4 and majors 5–7 are judgement calls about the plan's own claims, not repository
facts, and are accepted as stated.**

## Triage — 8 of 8 applied, none rejected, nothing silently dropped

| ID | Sev | Disposition |
|---|---|---|
| **1** | blocker | **APPLIED.** A stride prerequisite is added to Task 2 with the `build-assets.mjs:232` → `:256` → `catalogTimings.mjs:121` → `catalog-completeness.test.ts:37` chain spelled out, and two legal orders offered (fold Task 4's measurement in, preferred; or pack to scratch only). **The plan's own state table was corrected — `walk` now reads "296 px cell AND a null stride".** |
| **2** | blocker | **APPLIED.** An explicit legacy-migration step is added ahead of the guard change, stamping every existing entry with the root scale and `scaleSource: 'slug'` and verifying the numbers are unchanged. **RED-B was replaced** (`scale: null` / omitted source) and **RED-C added** (cross-slug merge, impossible to trigger today). The false RED-B claim is called out in place rather than deleted. |
| **2b** | blocker | **APPLIED, and this is the important half.** The plan's "strictly stronger" framing is **withdrawn**. The redesign is stronger on three axes and **deliberately narrower on one** — the one-scale rule now binds only slug-sourced entries. That narrowing **is decision D2**, and it must be recorded in the guard's own comment as a deliberate scope reduction with its reason. Disguising a narrowing as a strengthening is exactly the move this project's gate rule exists to prevent. |
| **3** | blocker | **APPLIED.** Task 5's acceptance is rewritten. **Criterion 5.12 is reported FAILING at the end of this session** unless the count reaches zero; four splits are progress on a criterion that has not moved in three sessions, not closure. Closing it fully (three e2e specs plus `BootScene.ts`) is escalated to the user as a scope decision rather than absorbed silently. |
| **4** | blocker | **APPLIED.** Task 9 is made **explicitly post-phase**. Two legal paths, no third: a future session with its own gate, or re-running 5.14 **and** the entire Task 8 verification on the resulting diff, knowingly. |
| **5** | major | **APPLIED.** 5.4 gets a written-out procedure. The `animations` skill, invoked during planning, supplied a better instrument than the polling Codex suggested: **the `animationupdate` event fires on every frame change carrying `frame.index`**, so the spec collects a Set in-page and asserts ≥2 distinct values. It also confirmed the root cause mechanically — `play()` restarts, `play(key, true)` is the guard — which is this phase's own vault-in note *(5.1)*. |
| **6** | major | **APPLIED.** `docs/GENERATION-LOG.md:170` and `docs/generations/phase-05-padded-round.md:66,71` added to the reversal checklist as **dated supersessions, not edits**, and `attack-r5` / `death-r4` are now named explicitly for `SUPERSEDED_CLIPS`. |
| **7** | major | **APPLIED.** Task 2 gains an explicit before/after assertion on the drawn figure's bounding box **relative to its own cell**, because the catalog test compares frame dimensions only. Without it the task's headline claim was untested. |
| **8** | minor | **APPLIED.** Corrected: a width-only repack should produce **no** `lift-profile.json` diff at all. `_comment` is a constant unrelated to frame width. The earlier wrong claim is noted in place. |

**A ninth finding came from the planning skills rather than Codex, and is recorded here because it
would have been a live render bug.** The `sprites-and-images` skill flags that a Sprite constructor
runs `setSizeToFrame` → `setOriginFromFrame`, so widening the frame moves `displayOriginX` from 144 to
192. Checked and **cleared**: `enemyView.ts:113,129`, `playerView.ts:112` and `GymScene.ts:127` all use
**originX 0.5** — the frame centre, which is exactly where `packStrip` puts the figure's centroid — so
the figure does not shift. Vertically `frameHeight` is unchanged and `baselineY = frameHeight`, so an
`originY` of 1 still lands on the contact line.

**Net effect:** the review **reordered Task 2** around a null stride that six sessions of handoffs had
misdescribed, **made an unexecutable guard executable** by forcing a legacy migration, **stopped a
scope narrowing from being presented as a strengthening**, **prevented criterion 5.12 from being
quietly downgraded from "no file over 400 lines" to "fewer than ten"**, and **stopped optional art
spend from invalidating criterion 5.14**. Two of the eight findings contradicted claims this plan's
own author had made — the same pattern as sessions 4 and 6.

**Still to run:** criterion 5.14, the Codex **implementation** review (`--wait --resume`) against the
diff, saved to `docs/reviews/phase-05-impl.md`.

> ⚠️ That line was written in session 7 and is now historical: **5.14 ran**, returned BLOCK with 6
> blockers, and is recorded in [phase-05-impl.md](phase-05-impl.md).

---

# Plan review 8 — session 8, 2026-08-12

**Invocation:** `/codex:rescue --wait --fresh`, carrying the `node_repl` + `fs.readFileSync`
instruction (the sandboxed shell cannot spawn processes on this machine — `CreateProcessAsUserW
failed: 5`, permanent), and **naming `docs/HANDOFF.md` §13 and `docs/qa/phase-05-combat.md` as
known-stale** so the reviewer would not spend findings on them. That instruction is itself an
application of session 7's lesson: *a handoff document is stale from the first commit of the session
that will rewrite it*, and two of session 7's six blockers were Codex correctly reporting exactly that.

**Target:** `C:\Users\royko\.claude\plans\resume-phase-5-combat-whimsical-lightning.md`, against
HEAD `b37ccf9`.
**Verdict: BLOCK — 2 blockers, 4 major, 2 minor.**

**Every finding was re-verified locally and every one was confirmed.** That keeps this phase's record
unbroken: **eight plan reviews plus one implementation review, and not one checkable finding has ever
been refuted.**

---

## The review, verbatim

> BLOCK
>
> 1. **Blocker — W4's prescribed knockback ordering is impossible against the current API and can shove lethal or refused hits.** The plan says to apply knockback "after damage and before the combat-state write," but `damagePlayer()` performs HP reduction and the `hurt`/`death` transition atomically before returning. Applying knockback afterward without checking both its boolean result and surviving HP would also shove during i-frames or after lethal damage. The rule must be `damagePlayer(...) === true && player.hp > 0`, with an i-frame/refused-hit regression added. [plan:218-231] [combat.ts:191-212] [worldDamage.ts:64-85]
>
> 2. **Blocker — W4 voids criterion 5.15, but the rerun matrix omits it.** Criterion 5.15 signs off hazard and kill-plane timing through `applyWorldDamage`; W4 edits that exact step-9b path. The plan's owner list and explicit invalidation list omit 5.15. [phase-05-combat.md:155-159] [worldDamage.ts:54-85] [plan:402-414]
>
> 3. **Major — W4 neither defines nor tests its promised three-source behavior.** Its three planned tests could all exercise one source while projectile, contact, or hazard knockback remains untested. Hazard direction is unspecified since `hazardHit()` returns a rectangle, not an origin. The plan's claim that `hazards.ts:85,88` already stops hazard motion is false — those lines stop bodies at world bounds, not on hazard contact. [plan:223-234] [worldDamage.ts:64-85] [hazards.ts:79-89] [hazards.ts:143-161]
>
> 4. **Major — the proposed knockback can pass while being effectively invisible on the ground.** Damage lands at step 9b, so the next tick runs friction before integration; a 5.54 impulse is cut by 3.69 ground friction to 1.85 px before its first movement and hits zero the following tick. Air friction (0.51) behaves very differently. Plan tests should pin grounded/airborne displacement over the lock window, not just `vx` sign. [player.ts:79-85] [player.ts:211-241] [tick.ts:257-282] [plan:218-238]
>
> 5. **Major — W2's claimed criterion-5.9 sweep cannot be performed as designed.** W2 adds `CHASE_DEAD_ZONE` as a module constant, but 5.9's sweep machinery goes through `enemyKnobs()` over live entity fields; the proposed W2 tests never probe either side of the 96 px boundary either. [plan:179-188] [enemyTuning.ts:17-23] [enemyTuning.ts:68-93]
>
> 6. **Major — `TUNING.walkMax` does not exist.** The Phase 2 default is `DEFAULT_TUNING.walkMax`; live worlds carry `world.tuning` instead. The plan's exact implementation instruction as written does not typecheck; it must pick one of the two. [plan:228-231] [player.ts:79-85] [index.ts:44-54]
>
> 7. **Minor — W2 does not test the facing-preservation part of its refactor.** A test that only asserts the positional clamp can pass even if the two facing assignments remain shared, leaving the scavenger facing away from the player at the chase boundary. [plan:174-185] [enemyScavenger.ts:117-133]
>
> 8. **Minor — W10 asserts a stale comment that the tree already fixed.** The current e2e header already states the walk sheet exists and 5.4 has hands-on evidence; this work item should be dropped or narrowed to just the automated regression addition. [plan:369-377] [phase-05-combat.spec.ts:1-13]
>
> Positive checks that held up:
>
> - All four stated corrections are supported by the tree: `canAct` blocks attacks in combat states, the corpse test is vacuous for movement, rendering already selects death and retains the body at reduced alpha, and `isSprite` is reachable via the existing dev-only `__phaserGame` seam.
> - W2's control-flow refactor is patrol-preserving and fixes chase clamping, provided the facing assignments are genuinely patrol-only.
> - W3's predicate placement respects the tick order: it evaluates before step 4, counters 0–5 lock the six following movement ticks, counter 6 releases control, and attacks stay blocked through `hurt`.
> - W4 correctly places damage at 9b with knockback movement beginning the following tick; "no lethal knockback" is consistent with the documented principle, but finding 1 must define how it's enforced.
> - Criterion 5.16's proposed row would pass `docs-contract.test.ts`.
>
> No files were modified; no processes or tests were run.

---

## Local re-verification and triage — 8 of 8 dispositioned, 8 of 8 CONFIRMED

| ID | Sev | Disposition |
|---|---|---|
| **1** | blocker | ✅ **CONFIRMED AND APPLIED.** `damagePlayer` (`combat.ts:201-213`) reduces `hp` **and** calls `enterCombatState` in one body before returning, so the seam the plan described does not exist. Its own docstring says the **boolean return is the point** and that *"refusal is a normal outcome here, not an error."* The plan would have shoved the player on every hit refused during i-frames — **a free repositioning tool granted by a defensive omission.** Guard corrected to `damagePlayer(...) && player.hp > 0`, and a refused-hit regression added. |
| **2** | blocker | ✅ **CONFIRMED AND APPLIED.** 5.15 signs off hazard and kill-plane timing through `applyWorldDamage`, which is the exact function W4 edits. It was absent from the plan's void list. Added. **This is the second time this phase that the void list was found incomplete** — session 7 had to re-run 5.1 and 5.5 for the same reason. |
| **3** | major | ✅ **CONFIRMED AND APPLIED, and one clause was flatly wrong.** `hazards.ts:79-89` is **`clampToBounds`** — a world-bounds clamp that zeroes `vx` at the left and right edges. It has nothing to do with hazard contact, and the plan cited it as if it did. `hazardHit()` returning a **rectangle rather than an origin** means hazard knockback direction is genuinely undefined and must be stated, not derived. Plan now requires **one test per damage source**. |
| **4** | major | ✅ **CONFIRMED AND APPLIED — and it re-opens a user decision.** Ground friction 3.69 against a 5.54 impulse leaves **1.85 px** before the first integration and zero after; air friction is 0.51, a 7× difference. So `walkMax` buys roughly **2 px** of visible ground knockback. The user chose `walkMax` **before this was known**. Tests now assert **displacement over the lock window, grounded and airborne separately**, and the measured number goes back to the user rather than being silently changed. |
| **5** | major | ✅ **CONFIRMED AND APPLIED.** `enemyKnobs` (`src/render/enemyTuning.ts:68-93`) builds knobs over **live entity fields**; a module constant is invisible to it, so `CHASE_DEAD_ZONE` could never have satisfied 5.9. `deadZone` becomes a per-scavenger field defaulted in `SCAVENGER`, exactly as `detectRadius` and `releaseRadius` already are. Codex additionally caught that the proposed tests **never probed either side of the threshold** — a wrong constant would have passed all of them. Boundary probes at 95 px and 97 px added. |
| **6** | major | ✅ **CONFIRMED AND APPLIED.** The export is `DEFAULT_TUNING` (`player.ts:79`); there is no `TUNING`. The plan's instruction would not have typechecked. |
| **7** | minor | ✅ **CONFIRMED AND APPLIED.** The refactor lifts two `facing` assignments into the patrol branch, and nothing proposed would have failed if they were left shared. A facing-preservation test at the chase boundary added. |
| **8** | minor | ✅ **CONFIRMED AND NARROWED.** `tests/e2e/phase-05-combat.spec.ts:1-13` was already corrected in session 7 and now says so explicitly, including that it misled the previous Codex review. W10 reduced to the automated guard alone. |

### What this review is worth

**Six of the eight findings landed on a single work item — W4, the knockback — and W4 is the only
item in the plan building something that does not exist yet.** The five items repairing known defects
drew two minor findings between them. That is a usable signal: **the reviews are most valuable
against new construction, and least valuable against a fix whose target has already been measured.**

**Finding 1 is the one worth remembering.** The plan's guard was wrong by *omission* — it said what to
do on a successful hit and never said what to do on a refused one, and `damagePlayer` returns a
boolean precisely because refusal is normal. A reviewer reading the plan alone could not have caught
it; it needed the function's own docstring. **A plan that names a function without reading its
contract is guessing**, however carefully the rest of it is argued.

**Finding 4 is the one worth acting on beyond this phase.** A knockback that satisfies
`expect(vx).toBeGreaterThan(0)` while moving the player 2 px is the same failure shape as vault 4.22 —
a number that is correct in the sim and invisible on screen. **Assert the observable, not the
intermediate.**
