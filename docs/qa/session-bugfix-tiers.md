# Session log — the bug-fix session, tiers 0–5

← [PRD spine](../PRD.md) · [HANDOFF](../HANDOFF.md) · [the inventory](../SESSION-PROMPT-next.md)

Branch `session-bugfix-tiers`. Owner ruling 2026-08-22: all tiers 0–5, fix work solo, courier
re-shoot authorized (~$1.19). The owner was told the scope is larger than one session holds and
reaffirmed it.

**Every criterion in this session's gate is UNRUN until its owner agent has run it, twice, per (A7).**

## This log, split into parts

**This log reached 1617 lines.** On 2026-09-03 the journal below the reconciliation was split into
four flat siblings, per CLAUDE.md §6 — `docs/qa/` splits into **flat siblings**, never a
subdirectory, because `tests/unit/file-size.test.ts` globs `docs/qa/*.md` non-recursively.
The numbering continues from `-02-gate-owners.md`, which was split out earlier.

| Part | What is in it |
|---|---|
| [02 — the gate owners](session-bugfix-tiers-02-gate-owners.md) | the agent-owned criteria, split out before this pass |
| [03 — tiers 0 and 1](session-bugfix-tiers-03-tiers-0-1.md) | A2's half-wrong claim · A3's Phase 9 gate table · B1's gear seam and the six-times inventory error · C2's run cycle · A1/0.2 · C3's release radius · B7's 9b ordering · B9 · B6's restarting music · batch E · the verification sweep |
| [04 — tiers 2 and 3](session-bugfix-tiers-04-tiers-2-3.md) | B3's contradicted docstring · B8's parallax rig · B4 re-affirmed as a non-fix · the C-series (illegible banner, empty doorway, foot-slide, the courier's jump and fall) · 3.8's gear counter |
| [05 — the late records](session-bugfix-tiers-05-late-records.md) | 3.11's repeated-pose gate · the 400-line note · the four items recorded late and what that cost · the Codex S.12 dispositions |
| [06 — the re-shoots](session-bugfix-tiers-06-reshoots.md) | 2.2's fall re-shoot paid, measured and NOT adopted · 3.10 blocked then resolved · 5.2's one-in-four GPU flake |

---

## A0 — the reconciliation

**Why this exists.** The Codex plan review blocked the first draft of the plan with one verdict:
*"the defect inventory is stale against merged source."* Four items the inventory listed as open had
already been fixed, and one would have **reversed a design ruling**. The inventory's own §8 lists 13
stale items; Codex found four more in a single pass, which is the measure of how incomplete §8 was.

So nothing is implemented from the inventory snapshot. Each item is opened against merged `main`
first and classified. **This table is the session's most valuable artefact even if nothing else
lands** — it is what stops the next session re-chasing what is already closed, which this one nearly
did four times.

Legend: **OPEN** · **FIXED** (already, with the line that fixed it) · **STALE** (premise gone) ·
**RULING** (contradicts a recorded decision — STOP-and-ask) · **—** (not yet reconciled).

### Tier 0

| item | class | evidence |
|---|---|---|
| 0.1 Phase 9 gate table says 7 criteria UNRUN | **OPEN** | `docs/qa/phase-09-polish.md:231-241` still reads UNRUN for 9.1–9.4, 9.7, 9.9, 9.11. `docs/PRD.md:36` still shows Phase 9 as `—`. |
| 0.2 dev server boots in 33 s | **OPEN, blocked** | `node_modules/.vite/deps_temp_0c0e666e/` confirmed present. ⚠️ Deleting it is **denied to the agent by security policy** (`rm -rf` deny-pattern; PowerShell `Remove-Item` refused). The owner must clear it. |

### Tier 1 · 1b

| item | class | evidence |
|---|---|---|
| 1.1 gear on a tile seam | **OPEN** | `src/game/tiledEntities.ts:95-101` — strict inequalities, one rect at a time, tested against the authored **point**. ⚠️ The inventory's *"`GEAR_BOX` 72 × 72 world px"* misleads: `GEAR_BOX` is **12 local units**; `tiledPlacement.ts:82-85` reaches world space by `× RENDER_SCALE`, and `describeGearProblem` has **no scale argument**. A fix written from the inventory's number is wrong by 6×. |
| 1.2 sentry bolts pass through walls | **FIXED** — § B2 / 1.2 | `src/sim/projectiles.ts:15-16` concedes it. ⚠️ The inventory's *"decide where it slots into the 14-step contract"* is **wrong**: projectile flight is **already step 4a** (`tick.ts:15`; `stepProjectiles` called at `enemyTurn.ts:65`). No tick insert is needed. The real problem is **time of impact along one segment**. |
| 1.3 lifecycle spec contradicts its docstring | **OPEN** | `tests/e2e/phase-06-lifecycle.spec.ts:186` heads a *"🔴 `test.fixme` — it FAILS"* paragraph; `:200` is a plain `test(...)` and the suite passes it. Exactly one of "fixed and undeleted" / "decoration" is true. Settled by hand, not by reading the green. |
| 1.4 body starting inside a solid | **OPEN** | `docs/reviews/session-bugfix-perf-gates-impl.md:75`. Paired change with `resolveCollisions` or none at all. |
| 1b.1 hit-stop chain uncapped | **FIXED** — owner ruled a deadline; § B5 / 1b.1 | `docs/qa/phase-09-polish.md:394`. ⚠️ Not what the inventory implies: `lastHitSwing` (`playerAttack.ts:21-24,71`) already dedups **per target per swing**. The chain is *distinct* enemies each arming a fresh freeze. **A balance change — the owner's decision.** |
| 1b.2 audio beds restart per level | **OPEN** | `src/game/audio.ts:103-114` — `startBeds` does `sound.add(key)` + `bed.play()` unconditionally, with no `sound.get` check. The recorded excuse (*"no level transition exists yet"*) expired when Phase 8 shipped five levels. |
| 1b.3 the 9b ordering | **OPEN**, gate reclassified | Both stated facts are true. ⚠️ But the reach-only zone **cannot discriminate the ordering** — no enemy damage occurs there, so both orderings behave identically in it. The discriminating case is an **overlapping** scavenger whose claw goes live the same tick as a lethal swing. **A balance change — the owner's decision.** |
| 1b.4 six extracted modules untested | **OPEN** | No file in `tests/unit/` matches `parallax`, `goalLayer`, `gameDev`, `gameInput` or `bootLevels`. |
| 1b.5 nothing kills an enemy by swinging | **OPEN** | `tests/unit/player-attack.test.ts:214` sets `corpse.hp = 0` directly. ⚠️ A test driving real combat **starts green** — the red proof needs the hp transition suppressed inside `applyPlayerAttack`, not a convenient edit elsewhere. |
| 1b.6 `resolveCollisions` tunnelling | **FIXED as an invariant** — § B10 / 1b.6 | ⚠️ Phase 8's spikes do **not** make this reachable — hazards are non-solid and already swept. The real question is the narrowest **solid** against the fastest reachable speed. |

### Tier 2 · 2b

| item | class | evidence |
|---|---|---|
| 2.1 / 2.2 courier jump + fall | **OPEN** | One art defect, two symptoms. Re-shoot authorized. |
| 2.3 player runs on the spot | **OPEN** | `src/sim/tick.ts:332` — `resolveState(player, dir !== 0 || player.vx !== 0, …)`. **One call site**, so the fix is one expression. |
| **2.4 chasing scavenger runs in place** | **FIXED** | `src/sim/enemyScavenger.ts:327` — `scavenger.moving = scavenger.x !== xBefore`, a readback recomputed every live tick; `src/render/enemyView.ts:85` `scavengerAnim` reads it and returns `idle`. **The descoped-pose blocker the inventory calls a STOP-and-ask is gone.** |
| 2.5 help banner illegible | ~~**OPEN**~~ → **CLOSED 2026-08-28** | Was `src/scenes/gameDev.ts:138`, `fontSize: '18px'` plus `setScrollFactor(0)` on a `GameScene` object. The size half was fixed in the tier-5 pass (18 → 44 px, for a formal WCAG large-text figure); the PLACEMENT half — it drew full-width across the level — was fixed in session `hud-and-pits`, which moved it into `src/scenes/helpBannerLayer.ts` beside the gear counter and settled the font at **43**. `setScrollFactor(0)` remains, deliberately, and is now reconciled against the owning camera. See `docs/qa/session-hud-and-pits.md`. |
| 2.6 exit-gate pulse over an empty doorway | **OPEN** | `src/scenes/goalLayer.ts:136-140` states it itself: *"the completed-it flourish now, not the reached-it one, and it plays over an empty doorway."* |
| 2.7 `SENTRY_MUZZLE` off the IDLE pose | **RE-AFFIRMED non-fix, measured** — § C7 / 2.7 | `src/sim/enemyPlacement.ts:121` — `{ x: 17.8, y: 22.6 }`. |
| 2.8 foot-slide during the gate run-in | **OPEN** | `src/sim/goal.ts:134-138`, the repo's only `ponytail:`. Likely closed by 2.3; the deceleration ramp is a separate feel change. |
| 2b.1 aggro is permanent | **RULING** | `src/sim/enemyScavenger.ts:128`: *"Aggro is permanent by design."* `src/sim/enemyTurn.ts:51`: *"Death is the ONLY exit from a chase now that aggro is permanent."* **The 851 px stare is the design.** Hysteresis would reverse a ruling — STOP-and-ask, do not implement. |
| **2b.2 `releaseAggro` leaves `attackCounter` live** | **FIXED** | `src/sim/enemyScavenger.ts:144-156` — R5, *"closed in Phase 6"*, with the reason written out. |
| **2b.3 sentry shot born inside its body** | **FIXED** | `src/sim/enemyTurn.ts:98` — `toWorld(SENTRY_MUZZLE, sentry.x, sentry.y, sentry.facing, world.scale)`. Only 2.7's *pose* question survives. |
| 2b.4 gear-counter contrast | **OPEN** | The sampling method was never written down; write it before re-measuring. |
| 2b.5 flyers smear | **OPEN** | `src/scenes/hudGearFlyers.ts`. |
| 2b.6 DPR ≠ 1 never tested | **OPEN** | No Playwright project at `deviceScaleFactor: 2`. |
| 2b.7 shake exposes raw background | **OPEN** | `src/render/screenShake.ts:13` — `applyShake` writes `camera.setPosition(base + offset)`. |
| 2b.8 three audio defects | **—** | Asset measurements not yet re-taken. |

### Tier 3

| item | class | evidence |
|---|---|---|
| 3.1 shake and squash a tick apart | **OPEN** | `src/scenes/gameEffects.ts:287` `applyShake(camera, tick)` against `:284` `landSquash(… tick - 1 …)`. Exists only in the QA log, never in HANDOFF's outstanding list. |
| 3.2 own strike extends i-frames | **RECORDED** | Kept with a written ruling and a gate pinning current behaviour. A decision to re-take, not an assumed bug. |
| 3.3 particle tints are guesses | **OPEN** | 9.8's by-eye read never done. |
| 3.4 `HUD_PLATE` / `HUD_SLOT` by eye | **OPEN** | Both files state no gate can catch a stale value. |
| 3.5 footstep phase after a wall pin | **OPEN**, closed by 2.3 | `src/sim/player.ts:166-170` says so: *"Fix that and both readings agree."* |
| 3.6 no level-complete sting | **OPEN** | `src/sim/audioCues.ts:87` — `levelCompleted` is in `SILENT_EDGES`. ⚠️ `tests/unit/audio-cue-edges.test.ts` is **exactly 400 lines**, so a tenth cue needs the split first. |
| 3.7 restart preserves an in-flight flyer | **OPEN** | `src/scenes/hudGearFlyers.ts`; its test drives the module directly through a type-only Phaser import. |
| 3.8 three UI items | **OPEN** | `src/render/hud.ts:204` — `padStart(3, '0')`, and `level-01` ships 7 gears. |
| 3.9 hitstun knob reads 6, lock is 5 | **OPEN**, already documented | `src/sim/movementLock.ts:31-37` derives it in full. The *code* is consistent; the **knob's name** is what misleads. |
| 3.10 `brass-sentry/fire` discharge | **OPEN** | Separate fal spend — STOP-and-ask. |
| 3.11 run sheet repeats poses | **OPEN** | `gateMotionFloor` compares every frame to frame 0 and cannot see adjacent duplicates. |
| 3.12 judder diagnosis never proven | **OPEN** | The probe exists to falsify the hypothesis; no comment records its outcome. |
| 3.13 `dropCastShadow` height guard | **OPEN** | No-op on today's art only. |

### Tier 4

| item | class | evidence |
|---|---|---|
| 4.1 *"Three"* against `= 2` | **OPEN** | `src/sim/playerTuning.ts:78` says *"**Three**"*; `:87` is `LOCOMOTION_TICKS_PER_FRAME = 2`. |
| 4.2 pre-re-shoot table presented as current | **OPEN** | `src/sim/playerTuning.ts:145-148` — `run 22.5 px / 3 ticks / speed 7.5`. |
| 4.3 `CLAUDE.md:23` distrusts a dead number | **OPEN** | |
| 4.4 lifecycle spec | duplicate of 1.3 | |
| 4.5 `assets:fetch` / `assets:verify` do not exist | **—** | |
| 4.6 Gym edits discarded before config resolves | **—** | |

### Tier 5 — reconciled so far

| item | class | evidence |
|---|---|---|
| 5.1 `verify-dist` cannot go red | **OPEN**, promoted to Batch A | `tools/gen/verify-dist.mjs:62` concedes the identifiers *"legitimately remain as empty method stubs"*; `:93` greps bare symbols. It protects a non-negotiable, and 2.5 depends on it. |
| **5.14 unclamped scavenger speed** | **STALE** | `src/render/enemyTuning.ts:54` — *"`createScavenger` **now throws** on that relationship."* Its only caller is `src/scenes/devSpawn.ts`, which is dev-only. |
| **5.22 ESC not gated on `isPlayerInputEnabled`** | **STALE** | `src/scenes/gameInput.ts:52-56` states the reason (`PlaygroundScene` leaves input on, `ElementEditorScene` turns it off — the flag would be exactly wrong), and the fitting guard **does** live with the action: `src/scenes/GameScene.ts:339-340` → `gameLevelPick.openLevelSelect`. |
| **5.23 `animTiming.ts` boundary claim false** | **FIXED** | `src/render/animTiming.ts:14-20` already carries the correction in a 🔴 block, and states that the direction that matters — nothing in `src/sim/` imports this — is mechanically enforced by `sim-boundary.test.ts`. |
| 5.19 goal-rect height unvalidated at load | **PARTLY STALE** | `src/sim/goalGeometry.ts:91-94` names `tests/unit/level-goal-fits.test.ts` as the gate and explains why `tiledGoal.ts` deliberately does not learn the rule. The `goal: null` half is not yet reconciled. |
| `setTintFill` engine hazard | **OPEN** | Only comment mentions survive (`engineLiterals.ts:39`, `gamePlayerDraw.ts:89`, `spriteFlash.ts:4`). No live call site — and **nothing greps the tree**, so a second one would be silent. A source-text gate is three lines. |
| 5.2–5.13, 5.15–5.18, 5.20, 5.21, 5.24–5.26 | **—** | Not yet reconciled. |

---

## Reconciliation summary

| class | count | items |
|---|---|---|
| **FIXED already** | 4 | 2.4 · 2b.2 · 2b.3 · 5.23 |
| **STALE premise** | 2 | 5.14 · 5.22 |
| **CONTRADICTS A RULING** | 1 | 2b.1 — permanent aggro is by design |
| **OPEN, but the inventory's stated cause or fix is wrong** | 4 | 1.1 (units wrong by 6×) · 1.2 (already in step 4a, no tick insert) · 1b.3 (its proposed gate cannot discriminate) · 1b.6 (spikes are not the trigger) |
| **OPEN as described** | 38 | |
| **not yet reconciled** | **24** | 2b.8 · 4.5 · 4.6 · 5.2–5.13 · 5.15–5.18 · 5.20 · 5.21 · 5.24–5.26 |

⚠️ **That last row said `~12` and `most of Tier 5` until the S.0 gate owner counted it.** The true
figure is **24 of 73 — a third of the inventory**, and *"most of Tier 5"* is exactly the summary the
plan forbids: every unreached item is named individually, in
[`session-bugfix-tiers-02-gate-owners.md` § S.13](session-bugfix-tiers-02-gate-owners.md). A remainder
under-reported by 2× makes the next session plan against a number wrong in the direction that flatters
this one.

**Seven items would have been implemented as bugs that are not bugs**, and one of those would have
reversed a design ruling. Four more would have been implemented from a wrong cause. That is A0's
finding, and it is why it ran first.

---

## Owner decisions — asked, answered, and where each landed

⚠️ **Every row here was `blocked` when written and all four were resolved during the session.** The
table was not updated as they came in, so it spent most of the day claiming the session was waiting on
decisions that had already been made and shipped. Corrected at the S.1 gate — see *"Why those four
were recorded late"* below, which is the same defect in the same document.

| item | question put to the owner | ruling | where it landed |
|---|---|---|---|
| **0.2 vite cache** | Deleting `node_modules/.vite` is denied to the agent by security policy. Clear it, or approve the deletion? | **Approved**, deletion performed via `fs.rmSync` | § A1 / 0.2 — and the recorded *"stale dep cache"* diagnosis turned out to be **wrong**; the cause is Vite optimising on first page *request* |
| **2b.1 aggro** | Permanent aggro is written down as the design (`enemyScavenger.ts:128`). Reopen it, or keep the ruling? | **Reopen** — a release radius | § C3 / 2b.1. `releaseRadius: 720` > `detectRadius`, enforced by a throw in `createScavenger`; death is no longer the only exit |
| **1b.1 hit-stop cap** | A **deadline** (one swing freezes until tick T; later hits do not extend it) or a **budget**? And does a later *heavier* hit extend it? | **Deadline. Later hits do not extend it — including the lethal one** | § B5 / 1b.1 |
| **1b.3 the 9b ordering** | Player-first (today) means a lethal swing kills an overlapping scavenger and takes no contact damage. Contact-first means you trade the hit. Pin, or change? | **Pin today's behaviour** | § B7 / 1b.3, with the choice stated in `tick.ts`'s 9b header |

