# Phase 5 — Enemies, hazards, combat + Enemy Gym

← [PRD spine](../PRD.md) · prev: [Phase 4](phase-04-art.md) · next: [Phase 6](phase-06-hud.md)

> Global Constraints and the Codex review protocol live in [PRD.md](../PRD.md) and apply here in full.

### 1. Goal and scope
Two contrasting enemies — a **static turret** with a visible detection radius, and a **patrolling
scavenger** that chases. Hazards. Player attack, damage, knockback, i-frames. **Enemy health bars.**
Plus enemy behaviour tuning in the Gym. Grey-box behaviour first, art second.

🔴 **This phase now also owns the combat art**, moved here from Phase 4 by the Gate 7 Codex review:
the player's `attack` / `hurt` / `death` sheets and all enemy sheets. They cannot be generated in
Phase 4 because their frame rate is derived from `simTicks` and their contact frames are aligned to
active windows — and both are defined in `src/sim/combat.ts`, which is built here.

📌 **Carried in from Phase 4, found by playtesting, deliberately not fixed there.** The player can
run off the **left edge of `level-01`** and fall out of the world — there is no wall, no kill plane
and no respawn, so the sim keeps integrating downward forever and the only recovery is a reload. It
is recorded rather than patched because a kill plane is a **death** and death is this phase's
`hurt`/`death` state machine; bolting a Phase 4 respawn onto a game with no health model would have
to be undone here. **Whatever fix lands must cover the world's other three edges too** — the same
hole exists wherever a level's collision does not reach its bounds, and `level-01` merely makes the
left one easy to reach. The spike run at cols 24–27 is the paired item: it is non-solid and
non-damaging today, which is correct — you do not stand on spikes — and making it hurt is the same
hazard work.

**Order within this phase is therefore strict: grey-box the combat sim and freeze its timings FIRST,
then generate art against those frozen numbers.** Generating first would author a flat fps, which is
vault **4.22** — *every light attack had 0.43 s of art over a 0.25 s move, so the strike was never
drawn.* All of [ASSET-PIPELINE.md](../ASSET-PIPELINE.md) and [STYLE.md](../STYLE.md) apply to that
art unchanged, including the per-generation log entry with its request id. Endpoint schemas and
prices: [FAL-MODELS.md](../FAL-MODELS.md) §1–§5.

### 1b. The Phase 4 debt ledger — carried in by approval on 2026-08-09

Phase 4 was **approved and merged while reported failing.** That was a deliberate decision, not an
oversight: the remaining items were judged cheaper to close here than to hold the branch for. **They
are listed in full so that "approved" is never later misread as "clean."** Nothing below may be
dropped without saying so out loud.

**🔴 Do this FIRST, before any fal spend in this phase.**

| | item | why it is first |
|---|---|---|
| **4.27** | **No gate measures an anchor image's own contact geometry before art is generated from it.** Phase 4's anchor drew one boot 58 source px above the other; every clip generated from it inherited a floating foot, and it was caught by the user's eye after shipping, not by a test. | **This is priced.** It forced batch V — ~6 clips at ~$1.19, ~$7 of the phase's $6.39 overrun. It is the only Phase 4 rework cause with no gate, so it is the one defect guaranteed to recur. Closing it is the cheapest money this project can save, and it must land **before** the combat/enemy sheets are generated, not after. |

**Also carried, in rough priority order.**

| # | item | note |
|---|---|---|
| 4.16 | **Ten source files exceed 400 lines**, eight of which crossed during Phase 4. | `tests/unit/file-size.test.ts` mechanises the rule and its ceiling is set at 10 — **adding an eleventh turns the suite red.** Phase 5 adds `combat.ts` and enemy scenes, so this will bite early. Split, do not raise the ceiling. |
| 4.10 | **UNRUN.** `gateReachBand` — the frame-diff box audit — is called only from `selfTest()` and unit fixtures, never against the real sheets. | Right shape, no result. |
| 4.12 | **UNRUN.** `findSource` throws on a missing input, but nothing watched it fail. | Needs the deliberate-removal run *(C1)*, then a log line. |
| — | **`playwright.config.ts` is pinned to `workers: 1`.** | A stopgap. 34.5 MB of PNG per boot (21.4 MB of it parallax; `mid.png` is 9.1 MB) starves a parallel run. **Restore parallelism only after the payload shrinks — never by raising `BOOT_TIMEOUT`**, which would hide the hang state it guards. The suite grows here, so the ~4.3 min serial run gets worse. |
| — | **10.2 MB of `dist/` is art the game never loads** — `anchor.png`, `anchor-original.png` and their provenance sidecars, unreferenced in `src/` and absent from `index.json`. | They sit in `public/` because vault 4.17 wants provenance beside the asset. The convention is right, the location is wrong. `verify-dist.mjs` checks dev-only *symbols*, not unreferenced *weight*. |
| — | **`assets:fetch` / `assets:verify` are promised by ASSET-PIPELINE.md and undefined in `package.json`.** | An error message in `build-assets.mjs` tells the user to run a command that does not exist. This is the **successor to the re-scoped 4.11** — building it is what would make a clean-clone rebuild real. |
| — | **`_generated/` is the only copy of a non-regenerable input** (128 MB of clips; Seedance 2 is not seed-deterministic). | **Archive it outside git.** Losing it freezes the art at its current packing forever. |
| — | **Archiving a clip does not move its job record.** Five paid generations have no `.job.json` — ~$6 of spend with no provenance, a live vault 4.17 violation. | A habit, not a gate. `build-clips.mjs` writes no job records at all, so nothing in the tooling caused it or prevents it. |
| — | **Gym edits made before the async config fetch resolves are silently discarded.** | Fix belongs with disabling the controls until load reaches a terminal state. |
| — | **Runtime fps comes from the catalog, not derived from the sim.** | Not silent drift — `asset-catalog.test.ts` goes red on a retune without a rebuild. Deriving at runtime needs per-cycle strides, which have no catalog field; adding one touches boot validation and every fixture. Codex impl finding 1. |
| — | **`stridePxPerCycle.run` is still provisional**, and **S7 speed is still the derived starting point**, not hand-tuned. | Eleven of twelve run frames measure a single boot in the foot band, so two agreeing methods rest on one frame. Observable if wrong: run foot-slide. |

**The spend lesson that governs this phase.** Phase 4 cost **$31.39 against a $25 ceiling**, and
~77 % of its clips were rework rather than output. The rate itself was not the problem — the defect
rate was. Two rules follow, and they are why 4.27 is at the top of this list:

1. **When two cost sources disagree, budget the pessimistic one and treat the optimistic one as
   absent.** `genmedia pricing` was wrong by ~21×, cheap. It is not a price; do not project on it.
2. **A gate that prevents a re-shoot is worth more than a cheaper endpoint.**

### 2. Required skills
`groups-and-containers` · `events-system` · `animations` · `data-manager` ·
`e2e-playwright-testing` (specs) · `playwright-cli` (drive the running game)
**Always:** `superpowers:executing-plans` · `superpowers:test-driven-development` ·
`superpowers:systematic-debugging` · `superpowers:verification-before-completion`
**Not `physics-arcade`** — see [Phase 2 §2](phase-02-player.md#2-required-skills). Hit detection is
integer-tick sim code against the tick contract, never a Phaser collider.

### 3. Vault-in
**5.1/2.9** a per-tick probability is **not** a behaviour — commit to episodes; one counter plus one
flag, because two counters admit the unrepresentable state. Phaser restarts a looping animation on
every state change, which is how a walk cycle never left frame 0 *(blocker)* · **5.2** equal duty
cycle is not equal difficulty · **5.3** two definitions of one concept is where the bug lives — import
the predicate, never restate it · **5.4** the benchmark is half of every measurement · **5.5** a
measurement of exactly 0 or 100% means asking whether the branch ran · **5.6** pair every golden file
with branch-execution counts · **5.7** tune on one seed set, gate on another; report the spread ·
**5.8** any cross-entity comparison of an absolute stat is suspect; a symmetric fixture is not a test
of a comparison · **5.9** closing a measurement gap is a balance decision, not a repair · **5.10**
global changes as uniform deltas · **5.11** check that waste is waste before removing it · **6.4**
gate the enemy health bar on what is **drawn** — an enemy at 2/100 must not render as empty

### 4. Codex plan review
**Runs now, before any code.** Invoke **`/codex:rescue --wait --fresh`** with the review-1 prompt from
[PRD.md § The Codex review protocol](../PRD.md#the-codex-review-protocol), naming this file.
Save verbatim to `docs/reviews/phase-05-plan.md`, then append the triage. Review 2 uses `--wait --resume`.

Ask Codex in particular: **combat timing is expressed against Phase 2's tick contract — does this plan
restate any timing predicate that Phase 2 already defines?** *(5.3: two definitions of one concept is
where the bug lives.)* And: **which enemy behaviour in this plan is specified as a per-tick
probability rather than a committed episode?** *(5.1, blocker.)*

### 5. Deliverables
`src/sim/combat.ts` · `src/sim/enemies.ts` · `src/render/enemyView.ts` · `src/render/enemyHealthBar.ts` ·
`src/scenes/GymScene.ts` extended · `tests/unit/combat.test.ts` · `tests/unit/enemy-ai.test.ts` ·
`tests/unit/enemy-health-bar.test.ts` · `tests/e2e/phase-05-combat.spec.ts`

### 6. QA gate
| # | Criterion | Method | Owner |
|---|---|---|---|
| 5.1 | Turret fires only inside its radius; radius tunable and the change is observable | unit + sweep | `voltagent-qa-sec:qa-expert` |
| 5.2 | Scavenger patrols, detects, chases; each speed independently tunable | unit + sweep | `voltagent-qa-sec:qa-expert` |
| 5.3 | Enemy decisions commit to **episodes**, not per-tick rolls | code review *(5.1)* | `voltagent-qa-sec:code-reviewer` |
| 5.4 | Enemy walk animation advances past frame 0 during patrol | e2e/observed via `playwright-cli` *(5.1)* | play |
| 5.4b | **Combat sim timings frozen and recorded BEFORE any combat art is generated** | doc + STOP *(4.22)* | — |
| 5.4c | **Contact frame lands inside the active window on every attack sheet** *(moved from Phase 4)* | measured *(4.22)* | `voltagent-qa-sec:qa-expert` |
| 5.4d | Every combat sheet's fps derived as `renderFrames × TICK_HZ / simTicks`, never authored | unit *(4.22)* | `voltagent-qa-sec:qa-expert` |
| 5.4e | Every combat generation logged with its **request id** and reconciled cost | GENERATION-LOG.md | — |
| 5.5 | Attack registers **only** on active frames; wind-up and recovery do not | unit *(4.22)* | `voltagent-qa-sec:qa-expert` |
| 5.6 | i-frames span their full window — fixture longer than the window | unit *(2.7)* | `voltagent-qa-sec:qa-expert` |
| 5.7 | **Enemy health bar never renders empty above 0 HP** | unit *(6.4)* | `voltagent-qa-sec:qa-expert` |
| 5.8 | Enemy health bar legible at true sprite size against a cool background | eyeball; `playwright-cli` screenshot | play |
| 5.9 | Every tuning knob sweeps and the number moves | sweep *(A6)* | `voltagent-qa-sec:qa-expert` |
| 5.10 | Damage comparisons use two **different** entities, not a symmetric fixture | unit *(5.8)* | `voltagent-qa-sec:qa-expert` |
| 5.11 | **Frame budget** measured under worst-case enemy count | `voltagent-qa-sec:performance-engineer` | `voltagent-qa-sec:performance-engineer` |
| 5.12 | No file > 400 lines; diff reviewed; adversarial pass | `voltagent-qa-sec:code-reviewer` ×2 | `voltagent-qa-sec:code-reviewer` |
| 5.13 | **Codex plan review ran; every finding applied or recorded** | `docs/reviews/phase-05-plan.md` | — |
| 5.14 | **Codex implementation review ran on the diff; every finding applied or recorded** | `docs/reviews/phase-05-impl.md` | codex |

**Regression set:** Phases 1–4, specs 01–04.

### 7. Vault-out
Whether episode-committed AI fixed the frame-0 animation problem in practice. Enemy tuning values that
felt fair. What the frame budget actually was — **the vault has nothing on performance (§B1)**, so
this is new ground.

### 8. Demo
Fight both enemies. Watch the turret's radius, get chased by the scavenger, take and deal damage with
knockback, see enemy health bars deplete.
