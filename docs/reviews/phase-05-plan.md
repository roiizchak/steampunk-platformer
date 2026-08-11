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
