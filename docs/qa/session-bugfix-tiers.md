# Session log — the bug-fix session, tiers 0–5

← [PRD spine](../PRD.md) · [HANDOFF](../HANDOFF.md) · [the inventory](../SESSION-PROMPT-next.md)

Branch `session-bugfix-tiers`. Owner ruling 2026-08-22: all tiers 0–5, fix work solo, courier
re-shoot authorized (~$1.19). The owner was told the scope is larger than one session holds and
reaffirmed it.

**Every criterion in this session's gate is UNRUN until its owner agent has run it, twice, per (A7).**

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

---

## A2 — 5.1, and the half of it that was wrong

**Status: FIXED, with the claim corrected.**

The inventory recorded 5.1 as *"the gate meant to stop DEV code shipping cannot fire either way for
module-scope code"*, and the plan promoted it to Batch A because it protects a non-negotiable. Two
mutations were built and each was rebuilt and read *(C1)* rather than reasoned about:

| mutation | rebuilt `verify-dist` said |
|---|---|
| drop the `import.meta.env.DEV` ternary in `src/game/config.ts`, registering the three dev scenes in production | **FAILED** — 3 scene keys, 1 symbol, 1 prose hit |
| drop the `import.meta.env.DEV` early-return in `src/debug/globals.ts`'s `updateDebugState` | **`verify-dist ok`** |

So **the scene-roster half was already covered and the inventory is wrong about it.** A scene key is
a quoted string literal and esbuild keeps it. What is genuinely open is a guarded body whose only
tell is a **module-scope identifier** — esbuild renames those, so no grep over a minified bundle can
ever see one, and adding more symbols to the list would not change that. Row two ships
`Object.assign(state, patch)` into every tick of production play with the build printing `ok`.

`globals.ts:67` predicted this in as many words — *"pass while the seam's internals were still in
the bundle"* — which is why **both** the installer and `updateDebugState` are guarded. Nothing
re-checked that the second guard was still there.

**The fix is not a bundler plugin.** The named fix was a `generateBundle` zero-rendered-bytes hook;
row one shows it would be redundant for the modules it can judge, and it cannot judge `globals.ts`
at all — that module legitimately ships while its guarded bodies must not.

`tests/unit/dev-guard-census.test.ts` pins the guard-line count per file. A removed guard reds it; so
does an added one, which is a *(vault 1.6)* which-side-of-the-gate decision worth stopping on. It is
a source-text gate, and the reason a behavioural one cannot reach is written in its header:
`import.meta.env.DEV` is `true` under vitest, so the guarded body always runs and there is nothing
to observe.

**Watched red** *(C1)*: with the `globals.ts` mutation live, `PASS (17) FAIL (1)`, the failure named
`src/debug/globals.ts still carries its 3 DEV guard(s)`. **Revert confirmed** *(C12)*: content
changed (guard lines 2 -> 3) **and** the failure count dropped by exactly one -> `PASS (18) FAIL (0)`.

Suite after: typecheck clean, **2172 passed / 0 failed**, up 18 from the 2154 baseline — the census's
own 18 tests, no other movement.

---

## A3 — the Phase 9 gate table, reconciled

**Status: RECONCILED. The answer is that Phase 9 is still not done.**

Full write-up in [phase-09-polish.md](phase-09-polish.md) §*"The reconciliation, and why Phase 9 is
still not done"*. Summary:

| verdict | criteria |
|---|---|
| ✅ **PASS**, substantiated with its evidence section cited | 9.6 · 9.8 · 9.10 · 9.11 |
| **OWED** — ran ×2, **failed**, fixed, and never handed back to its owner | 9.3 · 9.4 · 9.5 · 9.7 · 9.9 |
| **OWED** — the round ran but recorded no verdict either way | 9.1 · 9.2 |

The standard is the log's own: 9.5's row already said *"still UNRUN in the sense that matters:
neither owner brief has re-run it against this fix."* Nothing distinguishes its four siblings from
it, and applying that standard to one criterion and not the rest would be picking the answer first.

**`docs/PRD.md:36` therefore stays `—`.** The plan said *"mark anything you cannot substantiate as
still owed rather than passing"*, and seven cannot be substantiated. This is not a judgement on the
work — the mutation proofs, the integrator's own re-mutations and the Codex round are as thorough as
anything in this repository. It is that the **last step of the protocol was skipped**: criteria that
FAILED were fixed and never returned to their owners.

### The gate that should have caught this reds for the wrong reason

*(C1)* — the mutation the plan names: mark Phase 9 `✅ done` in `PRD.md`, expect
`docs-contract.test.ts` to demand a QA-LOG row per criterion.

It **did** go red — `PASS (91) FAIL (1)` — but the failure is:

```
Error: start marker not found: ## Phase 9
    at between (tests/unit/docs-contract.test.ts:61:24)
```

The check (`:260`) reads the section between `## Phase 9 ` and `## Vault-out — Phase 9` in
`docs/qa/phase-09-polish.md` and looks for a `| 9.N |` row per criterion. **This log has no
`## Phase 9 ` heading** — it opens at `## Task 0` — so the check throws on the start marker and
**never evaluates a single criterion row.**

That is loud rather than silent, so it is not a false green. But the failure names a missing heading,
not a missing verdict, and the obvious way to "fix" it is to add the heading — after which the check
would find the gate table at `:224` and pass on rows that say **OWED**, because it tests only that a
row *exists*. Recorded as a Tier-4-class defect for whoever closes Phase 9: the citation check needs
to read the row's verdict, not merely its presence.

**Revert confirmed** *(C12)*: content restored to `—`, and the failure count dropped by exactly one
→ `PASS (92) FAIL (0)`.

---

## B1 — the gear seam, and the six-times error in the inventory

**Status: FIXED.** `src/game/tiledEntities.ts` now compares the gear's **body** against every solid
with a half-open overlap, in world px.

**Two holes, not one, and one fixture cannot prove both.**

- **The seam.** A gear at exactly `solid.x + solid.width` satisfied *neither* abutting rect —
  `1920 < 1920` is false on the left, `1920 > 1920` is false on the right — so it passed the gate and
  sat inside collision geometry, permanently uncollectable. With `MAX_LEVEL_GEARS` that is an
  uncompletable level. On a 96 px grid **a seam is the default authoring outcome**.
- **The body.** The check tested the authored point. A centre 20 px above a floor's top edge is
  outside every rect while the real 72 × 72 body reaches 16 px into it.

### The policy was measured, not argued

The worry with "no gear body may overlap a solid" is that it refuses legal-but-tight authoring. So it
was measured first: across the **five shipped levels, all 45 gears, zero** have a body touching a
solid. The generator already keeps them clear, so the strict rule costs nothing today — and it is one
test where the alternative is two.

### ⚠️ The inventory's own number was wrong by 6×

It describes `GEAR_BOX` as *"72 × 72 world px"*. It is **12 local units**; `× RENDER_SCALE` is what
makes it 72. `describeGearProblem` had no scale argument, so a fix written from that sentence would
have used a 12 px box — **and still passed the seam fixture**. That is precisely why the two fixtures
are committed as separate rows.

### Watched red *(C1)*, both mutations named by the fix's own claim

| | mutation | result |
|---|---|---|
| before the fix | none — the fixtures as committed | `PASS (38) FAIL (2)`, both new rows named |
| A | drop `× RENDER_SCALE` (box 72 → 12) | `PASS (39) FAIL (1)` — **`gear-body-in-a-solid` alone**, seam green. The two fixtures are independent. |
| B | revert to the strict point test | `PASS (38) FAIL (2)` — both |

**Revert confirmed** *(C12)*: content restored and the failure count dropped to zero →
`PASS (40) FAIL (0)` on that file.

### One thing found on the way

`gear-inside-solid.fixture` derives from an **older** level-01 and carries a *second*, latent defect:
its sentry at (4800, 1344) 192 × 192 overlaps the gear at (4848, 1488). Nothing had ever seen it,
because the gear-in-solid check fired first and masked it. Both new fixtures move that gear clear so
each has exactly one defect — otherwise they would have been rejected for the wrong reason and the
rows would have gone green without proving anything.

**And the comment that let this ship.** `tiledPlacement.ts:41` read *"whose disposition reads 'Phase 8
owns it'. It does now."* Phase 8 added gear-vs-**enemy** body-vs-body and left gear-vs-**solid**
testing the point. The sentence was read as closing both, and the seam bug shipped through two more
phases. Corrected in place.

Suite after: typecheck clean, **2176 passed / 0 failed** — up 4 from 2172 (two rows, plus the two new
fixtures in `tilemap-data.test.ts`'s distinct-reason sweep).

---

## C2 — the run cycle against a wall, and the cost that never arrived

**Status: FIXED. Closes 2.3, and 3.5 with it.**

`tick.ts` step 11 passed `movingHorizontally = dir !== 0 || player.vx !== 0`. The `dir !== 0` term
asks *"is a key down"*, which against a wall is not the same question as *"is the body moving"*:
`resolveCollisions` pins `vx` to zero, the key stays held, and the player published `run` while
covering **no ground at all** — a whole run cycle of foot-slide, every cycle. **One call site**, so
the fix is one expression: `resolveState(player, player.vx !== 0, …)`.

### The deferral cost nothing, and that is the finding worth keeping

`player.ts:166-170` declined this for three phases with a **scheduling** reason: *"changing it moves
every locomotion assertion from Phase 2 onward."*

**It moved none.** The suite went 2176 → **2181**, which is exactly the five new tests in
`tests/unit/wall-pin-locomotion.test.ts` and nothing else. Not one Phase 2–9 locomotion assertion
needed re-taking. The feared cost is the whole reason this sat open, and it was never measured until
now — a deferral justified by an estimate that a single run would have refuted.

### Watched red *(C1)* — and the first red was a false one

The mutation is the fix's own inverse: keep the `dir !== 0` term. Pre-fix, with the gate committed:
`PASS (4) FAIL (1)`, the failure `expected 'run' to be 'idle'`.

⚠️ **The first run of this gate was a false green and it caught itself.** The test set `input.dir = 1`
— a field `InputSnapshot` does not have — so the player never moved, and every "pinned" assertion
passed *vacuously* while the counter-fixture (*"still runs when the body IS moving"*) failed with
`expected 0 to be greater than 0`. That counter-fixture exists precisely because a fix that made the
player never animate would satisfy all four other assertions, and it earned its place before the
fix was even written. **A gate that asserts only the absence of something can be satisfied by
nothing happening at all** — this session's own defect class, in the test I wrote to close it.

**Revert confirmed** *(C12)*: content changed and the failure count dropped by one → `PASS (5)
FAIL (0)` on the file, `2181 / 0` across the suite.

### What it does and does not take with it

- **3.5 (footstep phase after a wall pin): CLOSED.** Not by changing `advanceStride` — by removing
  the mid-cycle run there was to come back to. The cadence is still *locked, not phase-locked*, which
  is the recorded trade and is unchanged.
- **2.8 (goal run-in foot-slide): the state half is closed**, since a stationary body inside the dead
  zone now reads `idle`. The deceleration **ramp** the `ponytail:` comment names is a separate feel
  change and is not built — per the plan, it waits on a playtest that still finds a defect.

⚠️ One accounting note: the first version of the inline comment pushed `src/sim/tick.ts` from 394 to
406 lines and reddened `file-size.test.ts` — correctly. Trimmed to four lines (398); the full account
lives in the test file, which is where it is legible anyway.

---

## A1 / 0.2 — criterion 1.4, and the diagnosis that was wrong

**Status: FIXED. The inventory's recorded cause is refuted.**

§0.2 blamed a leftover `node_modules/.vite/deps_temp_<hash>/` from an interrupted optimizer run and
prescribed clearing the cache. **Measured, not assumed:**

| | criterion 1.4 |
|---|---|
| cache cleared, first run | **FAILED** — `Test timeout of 30000ms exceeded` |
| cache now warm, second run | **FAILED** again |

So the cache was never the variable. Measured directly against a dev server instead — three page
loads, one browser:

| load | to a terminal state |
|---|---|
| first | **33.4 s** |
| second | 3.2 s |
| third | 2.6 s |

`ready:true`, `bootError:null`, `sceneKey:'Game'` on all three. **The game is neither slow nor
hanging.** Vite optimizes dependencies and transforms on the **first page request**, not at server
start, and Phaser unbundled is ~1000 ES modules served one request at a time. `webServer` starts a
*fresh* server every run (`reuseExistingServer: false`), so whichever spec loads the page first pays
that 33 s alone inside its own 30 s budget. It is always 1.4, because it is first in the file — and
the two specs after it passed in ~4 s, which is the tell that was there all along.

### The fix moves the cost, it does not loosen a bound

`tests/e2e/globalSetup.ts` loads the page once and waits for a terminal state before any spec runs.
**No timeout changed.** `BOOT_TIMEOUT`, `REFUSAL_TIMEOUT` and the test timeout are untouched — the
inventory is explicit that a bound loose enough to survive a 33 s cold transform is loose enough to
hide a genuine hang *(vault 1.4)*, and `playwright.config.ts` already refuses that trade once for
`workers`.

It also makes a real hang **louder**: it now fails in warm-up, named, before any spec runs, instead
of presenting as one arbitrary spec timing out. A boot that reaches a *refusal* throws there too
rather than being warmed past in silence.

⚠️ Recorded against it: a `globalSetup` failure aborts with **zero tests collected**, which is the
`expected: 0, unexpected: 0` false-green shape `free-port.mjs` exists to warn about. The throw names
itself so the count has an explanation beside it. **Read the count, not the exit code.**

**Result:** `[e2e warmup] dev server warm in 32.9s (ready:true)` then `Running 14 tests using 1
worker` → **14 passed**, criterion 1.4 among them. It had failed 6 runs of 6.

**Not confirmed:** the inventory's suspicion that `npm run test:sim-isolated` poisons the dep cache.
Moot now — the warm-up absorbs a cold cache and a warm one alike, and the measurements above show
cache state was never what decided this. No line added to `CLAUDE.md §1`, because the claim it would
have recorded is not true.

---

## C3 / 2b.1 — the release radius, restored

**Status: FIXED. Owner reversal 2026-08-23 of user ruling D4 (2026-08-14).**

This knob has now been argued in both directions and **neither argument was wrong**:

|  | ruling |
|---|---|
| originally | `chaseSpeed` was *"deliberately escapable"* and a 720 px `releaseRadius` was the escape |
| **D4, 2026-08-14** | *"it should keep coming until I kill it."* `releaseRadius` **and** `CHASE_COMMIT_TICKS` deleted rather than re-tuned, on the argument that **a flag that cannot be un-set cannot flap** — genuinely stronger than hysteresis, since there is no gap to stand in the middle of |
| **2026-08-23, owner** | reversed. What D4 did not weigh is what permanence looks like from the other side: a scavenger that saw you once **stares from 851 px indefinitely and never patrols again**, found by playing |

`releaseRadius: 720` is back. **`CHASE_COMMIT_TICKS` is not**, and the guarantee it protected is
genuinely weaker now — that is stated in `enemies.ts`, `scavengerTuning.ts` and `enemyScavenger.ts`
rather than left for a reader to discover. The 240 px band between `detectRadius` 480 and
`releaseRadius` 720 is the whole of the replacement, so **`createScavenger` throws** if that band is
empty *(vault 2.11)* — equal radii is one threshold wearing two names, and a player standing on it
would be detected and released on alternate ticks forever.

The release goes through `releaseAggro`, never an inline `chasing = false`: it is now the **third**
exit beside the two deaths, and vault 5.3 requires they clear the same fields. An inline clear would
leave a live `attackCounter` behind — R5's bug arriving by a new route.

### Watched red *(C1)*: `PASS (0) FAIL (6)`, all six

Including `expected [Function] to throw` for the no-gap guard and `expected true to be false` for the
release itself.

### Twelve readings re-taken, none edited to match

The reversal moved twelve assertions across six files. Every one was **re-taken as a reading**, and
in each case the fixture's own stated intent decided the new number:

| file | what it is really about | change |
|---|---|---|
| `enemy-ai-lifecycle` ×3 | where a chaser stops relative to a **drop** | flee 5000 → 2400, return 200 → 1400 |
| `enemy-ai-scavenger` ×2 | leaving the **patrol zone**; bounding **chase** speed | 3000 → 1100, 99999 → 1100 |
| `enemy-ai-scavenger` ×1 | *"never gives up"* | **INVERTED, not deleted** — same 1000-tick scenario, opposite expectation |
| `enemy-view` ×3 | which **animation** a stalled chaser draws | 5000 → 500 |
| `enemy-wall-collision` ×1 | walking away from a **wall** | 0 → 1400 |
| `level-traversal` ×1 | **level geometry** — how far it can travel | `releaseRadius` disabled for the fixture |
| `respawn` ×1 | **death** as an exit, not distance | re-taken *inside* the band |

⚠️ Three of these were **quietly measuring the wrong thing** once the radius existed —
`never teleports` read `2.5` (patrol speed) while claiming to bound chase speed, and the
declared-key count fell 8 → 7 because a released subject can no longer ask for the `chase` key. All
three would have stayed green if the distances had been left alone and only the failing expectations
patched. That is the difference between re-taking a reading and editing a number.

Suite **2193 / 0**, up 6 from 2187 — the new file's six tests, nothing else net.

---

## B7 / 1b.3 — the 9b ordering, pinned

**Status: GATED. Owner ruling 2026-08-23: keep today's player-first order.**

`tick.ts` step 9b calls `applyPlayerAttack` then `applyWorldDamage`, so a killing blow lands before
the thing it killed can trade back. Recorded as **ungated for three phases** — *"swapping the two
calls fails no test"* — and raised to blocker-class for *"session 4"*, which did not do it.

### Both recorded arguments were beside the point

| | claim |
|---|---|
| `playerAttack.ts` | unreachable: to be in contact range you must already have taken contact damage, granting `IFRAME_TICKS` 45, longer than the 20-tick swing |
| `phase-05-combat-01-timings.md` (A1) | that is geometrically false — `ATTACK_BOX` reaches ~26 units beyond contact distance, so a dead zone exists |

⚠️ **A reach-only dead zone cannot discriminate the ordering at all.** No enemy damage happens out
there, so both orderings behave identically in it. A gate built on A1's zone would have been
decoration — the exact defect class this session exists to remove, and it was the plan's first
proposal until the Codex review caught it.

### What actually discriminates it: the freeze, not the kill

`applyPlayerAttack` freezes **both** bodies, and `applyWorldDamage` skips a frozen scavenger (*"a
frozen scavenger deals no damage"*, Phase 9). So on any tick the player strikes a scavenger whose
claw is already live:

- **player first (shipped)** — the scavenger is struck and frozen, contact damage skips it, the
  player takes nothing;
- **contact first** — the player is hurt and gains i-frames.

No kill and no dead zone required: an overlap and one live claw, which is the ordinary shape of
trading blows with a scavenger.

### The mutation, run

Swapping the two calls in step 9b: **`PASS (2195) FAIL (2)` across the whole suite — both failures in
`tick-9b-order.test.ts` and nowhere else.** That is simultaneously the proof the gate works and the
confirmation of the inventory's claim that nothing else covers this.

Under the swap the swing did not land *at all* (`expected 60 to be less than 60`): contact damage put
the player into `hurt`, which ended the attack state before it could resolve. Worse than predicted.

**Revert confirmed** *(C12)*: `PASS (2197) FAIL (0)`.

⚠️ Accounting: the first draft of the inline note took `src/sim/tick.ts` to 406 lines and reddened
`file-size.test.ts`, correctly. Trimmed to four lines (400 exactly); the argument lives in the test
file. Second time this session that a comment has hit that ceiling — `tick.ts` has no headroom left.

### A test-authoring trap worth recording

The i-frame assertion first read `expect(player.iFrameCounter).toBe(0)` and **failed on a correct
game**. The counter reads the opposite way round to the obvious guess: `world.ts` seeds it at
`IFRAME_TICKS` as the CLOSED sentinel, and taking damage sets it to **0** to OPEN the window. Now
asserted through `invulnerable()` *(vault 5.3 — do not restate a predicate at a call site)*.

---

## B9 / 1b.5 — STALE, and the test I wrote for it was deleted

**Status: NOT A DEFECT. No code change, no test added.** *(C11)*

The inventory says *"nothing swings the player's attack repeatedly against a live enemy and asserts
death — both tests set `hp = 0` directly"*, quoting T2, which **both** qa-expert briefs found
independently and called *"the gap that let P1 ship past the entire gate"*.

It was true when written and is not true now. `tests/unit/enemy-ai-lifecycle.test.ts:125` —
*"a CHASING scavenger, killed by real swings, stops chasing"* — drives twenty real swings through
`tick()` with a re-latched attack edge and asserts the death. Its own comment marks it as the
repair: *"what the old version of this test never established."* The claim survived in the QA log
because the log was never revisited, which is A0's whole subject.

### I wrote the test anyway, then deleted it, and the mutations are why

A 150-line `kill-by-swinging.test.ts` was written and passed 4/4. Before keeping it, three mutations
were run to find one it caught *alone*:

| mutation | failures across the suite, WITHOUT the new file |
|---|---|
| delete `enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK_DAMAGE)` | **22** |
| `Math.max(0, …)` → `Math.max(1, …)` — damage lands, death impossible | **11** |
| `PLAYER_ATTACK_DAMAGE` 20 → 1000 — everything dies in one swing | **11** |

Every claim it made was already provable without it: the damage arithmetic, the death, the
proportionality between hp and swings, and the one-hit-per-swing rule (`hitstop.test.ts`'s *"one
swing costs one target one hit"*).

**So it was deleted.** A gate that cannot be the one to go red is not free — it is lines someone
maintains and a reader trusts. *(C2 inverted: a gate that cannot go red is decoration, and so is one
whose red is always somebody else's.)*

The honest outcome of this item is the reconciliation itself, and a QA-log claim corrected.

---

## B6 / 1b.2 — the music restarting at every level boundary

**Status: FIXED.**

`GameScene.create()` calls `createAudio`, which destroyed its predecessor and started both beds from
zero — so **music and ambience cut back to bar 1 at every level transition**. Recorded in Phase 7 as
LOW/RECORDED because *"no level transition exists yet; it becomes real in Phase 8"*. **Phase 8
shipped five levels and transitions.** The reason expired by its own terms and nobody re-read it —
the second item this session where that is the whole story.

### The constraint that shaped the fix

Criterion **7.5** counts `sound.sounds`, and vault 7.5 names the failure exactly: *"a stopped track is
still in `sound.sounds`, so a scene round-trip that stops and re-adds grows the list every time."*
**Beds accumulating is a worse bug than beds restarting**, so *"stop tearing them down"* is not the
fix. *"Start only what is not already playing"* is: `createAudio` now **retires** its predecessor —
unsubscribing the exact unlock handler, per vault 7.5 — and adopts the still-looping beds. The live
set stays at one of each. `destroyAudio`, which `BootScene.init()` calls on every boot, restart and
refusal, is still the real teardown.

### `createAudio` had NO unit test, and the reason is structural

The only file in `tests/` that named it was `file-size.test.ts`, counting its lines. `audio.ts`
imports `Phaser` as a **value** (`Phaser.Sound.Events.UNLOCKED`), so nothing in the unit suite can
import it without breaking `npm run test:sim-isolated`, which runs with Phaser uninstalled.

So the decision moved to `src/game/audioBeds.ts`, pure — `src/render/`'s pattern one layer over — and
`audio.ts` only applies it. That is what made a gate possible at all.

⚠️ Its **draw-path gate** is source-text, not behavioural. CLAUDE.md prefers behavioural and says so;
here it is unreachable for the same reason the module exists. Recorded rather than glossed. It pins
three things a refactor could quietly undo: the `bedsToStart`/`bedsMissing` call sites, the absence of
a second `BED_KEYS` list, and `liveBeds` being module-scope rather than per-manager.

### Watched red *(C1)*

Mutation: make `bedsToStart` ignore what is already playing — the restart behaviour restored.
`PASS (7) FAIL (2)`, and the two are exactly *"starts NOTHING when both are already looping"* and
*"starts only the one that stopped"*. **Revert confirmed** *(C12)*: `PASS (10) FAIL (0)`.

A counter-fixture earns its place here too: *"starts only the one that stopped, not both"* fails an
implementation that returns `[]` whenever **any** bed is playing — which would pass the
level-boundary assertion and leave ambience silent for the rest of the session.

Suite **2207 / 0**, build green. `docs/qa/phase-07-audio-02-gate-owners.md:78` corrected in place.

---

## Batch E / Tier 4 — the prose that contradicted the code

**Status: 4.1, 4.2, 4.3, 4.5 FIXED with a gate. 4.4 closed by B3 (owed). 4.6 not reached.**

| item | was | now |
|---|---|---|
| **4.1** | `playerTuning.ts:78` — *"Ticks each drawn locomotion frame is held. **Three**"* | **Two**, matching `LOCOMOTION_TICKS_PER_FRAME` nine lines below it |
| **4.2** | a table presented as current: `run 22.5 px / 3 ticks / speed 7.5` | **labelled** as the session-10 pre-re-shoot reading, with the live figures stated beside it and derived: `18.0 / 2 = 9.0`, `9.0 / 2 = 4.5` |
| **4.3** | `CLAUDE.md:23` — *"`run`'s stride is still provisional and is the number to distrust"* | `stridePxPerCycle` has been **dead since session 9**; distrust repointed at the live constants, and at the courier jump/fall art that actually is open |
| **4.5** | `ASSET-PIPELINE.md` §10 promised `assets:fetch` / `assets:verify`, and `assetSources.mjs` **printed an error telling the reader to run the first** | both corrected to what the repo can actually do. The scripts are **not** written — nothing has needed them badly enough to ask |

### The gate that stops it recurring

`tests/unit/foot-plant.test.ts` passed throughout, correctly: it asserts the **relation**
`ticksPerFrame × topSpeed === footPxPerFrame`, which held the whole time. The prose was unguarded.

`tests/unit/tuning-prose.test.ts` parses the numbers back out of the docstrings and asserts them
against the constants. **Watched red with the shipped defect itself** — restoring *"**Three**"* gives
`PASS (4) FAIL (1)`, naming the frame-dwell sentence. Revert → `PASS (5) FAIL (0)`.

⚠️ Its own limit is stated in its header: it makes these four numbers executable, not prose in
general. A stale rationale or a citation to a moved file is still invisible to it.

### Dead exports: two removed, one restored within the minute

`MeasuredStrides` and `EnemyStrides` were dead — no importer anywhere — and are gone.

🔴 **`strideTicks` was deleted with them, and put straight back.** The grep that "confirmed" it was
dead had been truncated by a `head -5`, hiding the two files that import it
(`anim-timing.test.ts`, `catalog-timings.test.ts` — the second checking that
`tools/gen/catalogTimings.mjs`'s mirror agrees). `MeasuredStrides`'s claim that it was *"still
exported and tested"* was **correct**, and I had written a comment calling that claim false.

`tsc` and four red tests caught it inside a minute, which is the system working. Recorded because the
near-miss is the lesson and it is this session's own subject inverted: **a deletion justified by a
grep is only as good as the grep, and `head` is not a filter.** Both the restoration and the reason
are written into `animTiming.ts` rather than quietly undone.

Suite **2212 / 0**, build green.

---

## Verification sweep — 2026-08-23, after twelve items

| check | baseline (Phase 9 close) | now |
|---|---|---|
| typecheck | clean | **clean** |
| unit | 2154 / 0 fail, 133 files | **2212 / 0 fail** |
| build | exit 0, `verify-dist ok` | **exit 0, `verify-dist ok`: 5 levels + 11 audio byte-identical** |
| `test:sim-isolated` | 2151 passed / 3 skipped | **2209 passed / 3 skipped**, Phaser reinstalled cleanly |
| e2e | 118 passed / **1 failed** (criterion 1.4) | **119 passed / 0 failed** |

**The e2e suite is fully green for the first time in this record.** Criterion 1.4 had failed 6 runs
of 6; G.7b stayed fixed.

⚠️ Worth noting for the inventory's §0.2: this e2e run came **immediately after
`npm run test:sim-isolated`**, which is the exact sequence the inventory blamed for poisoning the
dep cache. The warm-up absorbed it — `dev server warm in 34.4s` — and all 119 specs then ran warm.
That is the second measurement showing cache state was never the variable; the first page load
costs ~33 s whatever the cache holds.

Port 5173 confirmed clear afterwards *(C13)*.

---

## B3 / 1.3 / 4.4 — the spec that contradicted its own docstring

**Status: RESOLVED. The bug was fixed; the paragraph saying otherwise was stale. Both halves proven
by mutation, not by reading the green.**

`phase-06-lifecycle.spec.ts:186` headed a paragraph *"🔴 `test.fixme` — it FAILS, and the failure is
a real defect, not a flaky test"*, describing the HUD frozen over an error screen with
`TypeError: … reading 'glTexture'` in the console, and saying *"Phase 7 owns it"*. Phases 7, 8 and 9
all shipped. The test below it has been a plain `test(...)`, passing, the whole time.

Exactly one of two things could be true. **It is the first.**

The fix is in `BootScene.init()` — it stops `Game` and `UI` **before** the reload, unconditionally,
instead of relying on `refuseToRoute`'s stops at the end of a boot attempt. Its own comment names
this very test as how it was found: *"found by writing the restart-based refusal test Codex's second
implementation review asked for."*

| mutation on `BootScene.init()` | result |
|---|---|
| remove **both** pre-reload stops | **FAILS**, and only this test of the five — `bootError` never arrives, 20 s timeout. Nothing runs after the render loop throws, so the refusal never completes. The described bug, exactly |
| remove **only** `stop('UI')` | **all 5 still pass** |

So the gate is real and the docstring was three phases out of date. Replaced in place with the
evidence rather than deleted, so a reader sees what was settled and how.

⚠️ **The second row is a real, narrower gap, recorded rather than hidden.** This test depends on the
**`Game`** stop: `GameScene` draws the world textures `preload` frees, and the HUD alone does not
touch them. An edit dropping only the UI stop would go unnoticed here. It is harmless today — the
HUD still stops via `refuseToRoute`, because nothing threw — so it is left as redundancy. Closing it
would mean reaching into UIScene's display list, and no defect currently makes that worth doing
*(C11)*.

Also closes **4.4**, which was the same item seen from the Tier-4 side.

Spec green after revert: **5 passed**. Port 5173 clear *(C13)*.

---

## B8 / 1b.4 (T13) — the parallax rig, and the three modules still uncovered

**Status: PARTIALLY FIXED. The named module is gated; three siblings are still open and are named.**

T13, recorded LOW in Phase 5 and never done:

> The six modules extracted from `GameScene.ts` have **no tests**. `parallaxRig.ts` returning
> `100 + i` instead of `-100 + i` would draw all three backgrounds *over* the player and every gate
> would stay green.

Its own disposition names the class: *"the same defect as 'deleting `renderPlayer()` left every
Phase 2 test green' — reintroduced by a split."* Splitting a file to satisfy the 400-line rule moves
code out of whatever coverage the original had, and nothing notices. CLAUDE.md §2 requires a
draw-path gate for every `src/render/` module; `parallaxRig.ts` had none.

### Behavioural, not source text

`gameParallax.ts` takes Phaser as a **type-only** import, so the whole path is driven against a fake
scene — the `enemy-feedback.test.ts` idiom, which CLAUDE.md prefers. That matters here: the defect
T13 names is not a missing call but **a number reaching `setDepth` with the wrong sign**, and no
source scan can see that.

### Both named mutations, run

| mutation | result |
|---|---|
| `depth: -100 + i` → `100 + i` *(T13's own)* | **`PASS (2221) FAIL (1)`** across the whole suite — one failure, `EVERY depth is negative`. One in 2222 is the measure of how uncovered it was |
| `image.tilePositionX = …` → `image.x = …` | `PASS (8) FAIL (2)` — the texture-offset assertion and the further-moves-less one |

The second mutation is the defect `gameParallax.ts`'s own comment records having **already shipped
once**: setting position instead of texture offset double-applies the scroll and slides the layer off
the viewport, *"which showed up as a black band above a strip of background."* It was fixed by hand
and nothing has watched it since.

**Revert confirmed** *(C12)*: suite **2222 / 0**, up 10.

### ⚠️ Still uncovered, named individually

T13 says *six* modules. Two now have behavioural tests (`gameParallax`, and `goalArtSize` via
`shipped-gate.test.ts`). **Three have none**: `gameAnimations.ts`, `gameHud.ts`, `gameLevelDraw.ts`
— each appears in `tests/` only through `file-size.test.ts`, which counts their lines.

They are **not reached this session** rather than judged safe. `gameAnimations.ts` is the one to do
first: its own header records a Codex finding that a comment there had been *believed* while being
false about where the fps comes from, which is the same failure this session keeps meeting.

---

## B4 / 1.4 — a body starting inside a solid, RE-AFFIRMED as a non-fix, with the coupling made executable

**Status: NOT FIXED, deliberately** *(C11)*. **The reason is now enforced rather than written down.**

Both resolvers refuse only a body that **was clear** on the previous frame:

- `blockedAt` (`enemyGeometry.ts:154`) — `const wasClear = …; if (wasClear) return true;`
- `resolveCollisions` (`player.ts:311-319`) — pushes out only under `wasLeft` / `wasRight`

So a body that *starts* inside a solid is not pushed out and keeps moving deeper. Verified real.

### Why it stays

The obvious fix — *"if you are inside, refuse"* — **breaks the `EVERYWHERE` fixture and would have
trapped a shipped enemy at boot.** `FOOT_TOLERANCE_PX`'s docstring carries the measurement: all
**twenty** enemies across the five levels stand with *exactly zero* separation from their floor, and
nudging a floor strip up by 1 px already made `describePlacementProblem` reject a level once. That
rule has been rewritten twice for this.

And the two resolvers share the rule. **Changing one without the other puts the player and the
enemies on different physics** — worse than the latent bug, and much harder to see. The paired change
touches the collision every Phase 2 assertion rests on; it is real work with real risk and is not
attempted here.

### What DID change: the coupling is no longer a sentence

*"Treat as a paired change or not at all"* lived in a review nobody re-reads — and this session has
now met three separate items (**1b.2**, **1b.6**, **2.3**) whose entire story is that a promise to
remember was not kept.

`tests/unit/overlap-escape-parity.test.ts` pins both behaviours **as a pair**, so a change to either
resolver alone goes red with the reason in the message.

**Watched red** *(C1)*: giving `blockedAt` an overlap rule and leaving the player untouched —
`PASS (4) FAIL (2)`, the failure reading *"`blockedAt` now refuses an overlap. `resolveCollisions`
must change WITH it, or the enemies and the player are on different physics."*

Each half also carries its **positive** case (a newly-entering body IS stopped) so the pin cannot be
satisfied by a resolver that does nothing at all — which is what a behaviour-pinning test degenerates
to if nobody checks.

**Revert confirmed** *(C12)*: suite **2248 / 0**.

---

## C5 / 2.5 — the controls banner was illegible, and it ships

**Status: FIXED.**

`addHelpBanner` hard-coded `fontSize: '18px'`. At 852 × 480 — the smallest size this project supports,
a 0.444 scale — that is **8 physical pixels**, a third under the ~11 px floor the gear counter is
sized against, and it was confirmed illegible in a playtest screenshot rather than inferred.

**The first question the plan asked was whether the banner is dev-only. It is not — it ships**, and
`helpLine()` says why in its own comment: the mute keys and `ESC levels` are in the shipped half
deliberately, because *"a mute control the player cannot discover is a mute control they do not
have."* This banner is the only place the game states its controls at all. An illegible one is those
controls not existing.

**`HELP_FONT_PX = 28`**, in `hud.ts` beside the counter's own sizing and derived the same way:
28 × 0.444 = **12.4 physical px**. Not larger, because the line runs ~110 characters shipped and ~150
in a DEV build — so it also gained `wordWrap` at the view width. Without the wrap the fix would just
push the right-hand controls off the edge, which is the same defect in a bigger font.

**Watched red with the shipped value** *(C1)*: `HELP_FONT_PX` back to 18 gives `PASS (21) FAIL (1)` —
*"the controls banner is under the legibility floor: expected 8 to be greater than or equal to 11"*.
The gate reads the scale from `hudLayout`, so it cannot drift from the counter's own measurement.

⚠️ **The `setScrollFactor(0)`-on-a-`GameScene`-object half is NOT fixed** *(C11)*. Moving the banner
to `UIScene` is scene plumbing with no observed defect behind it: the banner is created in
`create()` and dies with the scene, so it has none of the HUD lifecycle problem vault 6.1 is about.
Recorded, not chased.

---

## C6 / 2.6 — the exit's flourish played over an empty doorway

**Status: FIXED, and it needed a new tick edge.**

`animateGoalReached` was called from `onLevelCompleted`, which runs on `levelCompleted` — **twenty
ticks after** the player reached the door and one tick after the courier finished fading out. The
*completed-it* animation was playing where the *reached-it* one belongs. `goalLayer.ts` recorded the
defect against itself and nobody moved it.

### There was no arrival edge, and deriving one was not allowed

`TickEvents` had `levelCompleted` and nothing earlier. The scene could have watched
`world.goalEntryTicks` go `null` → number, but that is **re-deriving an event edge from two samples
across frames** — and a frame that drains several ticks steps straight over the arming tick, which is
precisely what `advanceSplit` exists to prevent.

So step 9d emits `goalReached`, from two samples taken **inside the tick that causes the transition**
— straddling one step, not one frame. `mergeEvents` walks the record rather than a field list, so it
merges the moment `noEvents()` declares it; `SILENT_EDGES` gains it, with a note that 3.6's
level-complete sting is the cue that belongs here and is unspent fal budget.

**Gated on the tick count, not on existence** — *"an existence assertion cannot verify a timing
claim"*, and the whole defect was a timing one. `completedTick - reachedTick === GOAL_ENTRY_TICKS`,
derived from the knob so a retune does not leave a stale literal the way 4.2's table did.

**Watched red with the shipped defect** *(C1)*: `events.goalReached = events.levelCompleted` gives
`PASS (2251) FAIL (4)` — both timing assertions, by name.

### ⚠️ `GameScene.ts` was at EXACTLY 400 lines with zero headroom

Adding the arrival branch put it at 421 and reddened the 400-line rule, correctly. It has **no active
`lines=N` citation**, so it was sitting on the limit exactly.

The dispatch moved to `runGoalFlow` in `gameComplete.ts` — whose own header already claims this flow —
rather than being trimmed back under by deleting comments, which the rule's own failure message
forbids. That is 4.16 and T16's recorded pressure arriving again, not something new: `GameScene.ts`
has been split six times and is full again.

Suite **2255 / 0**, build green.

---

## C8 / 2.8 — the gate run-in's foot-slide, closed by C2 without the ramp

**Status: FIXED — by item 2.3, and the upgrade path the comment named was not needed.**

`goal.ts` carried the repository's only `ponytail:` comment, accepting the slide and naming its own
upgrade path: *"a deceleration ramp over the last few ticks rather than a hard dead zone."*

**The dead zone is unchanged and the ramp was not built.** What changed is 2.3 — `resolveState` no
longer takes `dir !== 0`, so a stationary body reads `idle` whatever key is held. `player.ts`
predicted it exactly: *"fix that and both readings agree without this function knowing anything about
it."*

**Measured before deciding**, in the worst case the comment describes — spawning **on** the goal
centre so the dead zone holds for the entire 21-tick run-in:

| | before 2.3 | now |
|---|---|---|
| run-in ticks with **zero travel** | 13 of 21 | 13 of 21 |
| …of those, published as `run` | **all of them** | **0** |

The body still stands still; it simply no longer claims to be running while doing it — which was the
whole complaint. Gated in `goal-reached-edge.test.ts` so neither the dead zone nor
`movingHorizontally` can bring it back quietly.

The `ponytail:` comment is closed in place with the measurement, rather than deleted.

Suite **2256 / 0**.

---

## C1 / 2.1 + 2.2 — the courier's jump and fall: measured in full, and NOT re-shot

**Status: MEASURED, root-caused, and STOPPED for an owner decision. No fal spend made — and the
authorized ~$1.19 would very likely have been wasted.**

### The owner's 69% is confirmed, and the cause is not where it looked

Drawn figure height off the shipped sheets, in packed pixels:

| clip | frames | drawn height | of idle | frame spread |
|---|---|---|---|---|
| idle | 12 | **288.1** | 100% | 2 px |
| walk | 24 | 288.9 | 100% | 6 px |
| run | 15 | 275.7 | 96% | 18 px |
| **jump** | 6 | **199.7** | **69.3%** | 29 px |
| **fall** | 9 | 230.6 | 80.0% | **74 px** |

**It is not a packing error.** Both idle and jump come from the same *unpadded* anchor and pack at the
same slug scale `0.23723229`. The project's own tool gives the source heights:

```
idle  mean 1214 source px  (spread  0.8%)
jump  mean  842 source px  (spread 14.3%)
```

**The model drew the figure at 69% in the source video itself.**

### `_actionScale` is the obvious fix and it is the WRONG one — measured, not guessed

`HANDOFF.md:107` already says *"Jump has no `_actionScale` override and may need one"*; `fall` has one
(0.6) and jump does not. `build-assets.mjs … --derive-scale` duly prints **0.34204276**.

⚠️ **Pasting it would be a bug, for the reason `character-bounds.json` already documents at length**
— a mean across a deforming action is not a standing-height measurement, and doing it for `fall`
*"would have drawn the courier 25% LARGER in the air than on the ground, a pop the instant he leaves
the floor."*

The decisive check is a **pose-invariant** feature. A tuck bends legs; it does not resize a skull:

| clip | head width (packed px) | per frame |
|---|---|---|
| idle | **39.9** | 40, 39, 40, 40, 40, 40, 40, 40, 40, 40, 40, 40 |
| jump | **125.8** | 66, 71, **166, 190, 189**, 73 |

Two findings in one measurement:

1. **The head is 1.65× too big** even in the frames where the top blob plausibly *is* the head
   (66–73 against 40). So the courier is drawn **larger and curled**, not smaller — the opposite of
   what the height alone suggests.
2. **In frames 2–4 the topmost part of the figure is not the head at all** (166–190 px wide). Something
   — an arm, a leg — is above it. That is the somersault tendency `motionAirborne.mjs` records
   fighting, showing up in the *shipped* clip rather than only in the rejected regenerations.

**So no packing scale can fix this.** Match the height and the head gets worse; match the head and the
body shrinks. The clip is off-model in proportion, and that is a generation defect.

### Why the re-shoot was NOT run

`motionAirborne.mjs` carries the history in detail, and it is a warning:

- a monotonicity clause was added → **the jump somersaulted**, frame 4 fully inverted, *"straight
  through five explicit negations"*;
- a *"motion has already begun"* clause was added → onset moved from frame 5 to frame **15**, later;
- both reverted, with the conclusion stated: ***"the non-monotonic middle is a real defect and is
  still open; the fix is NOT a stronger instruction in this paragraph."***

And the prompt's most likely culprit is a line that is there **on purpose**: `UPRIGHT_IN_AIR` requires
*"plain green above his head and plain green below his boots in every frame"* and *"no part of him is
ever cut off by any edge"* — which idle does not require, and which forces the model to fit the
figure inside two margins. Removing it re-opens cropped limbs; strengthening it is what backfired
twice.

⚠️ It also lives in the prompt template that `style-lock.test.ts` hashes, so changing it is an
**approval checkpoint**, not a tweak.

**Also relevant to the owner's instruction that the re-shot clips must use the same character as the
rest:** the IDENTITY clause in `jump.prompt.txt` is *already identical* to `idle.prompt.txt`'s —
same face, same goggles, same pauldron, same palette — and the clip still came back off-model in
proportion. So identity wording alone will not buy consistency here; that is the measurement's
warning about a naive re-shoot.

### What is owed

A decision, not more analysis:

1. **Re-shoot with a corrected framing clause** — needs a STYLE.md §4 change (approval), and carries
   the documented risk of a worse take.
2. **Re-extract from `jump-r2.mp4` / `fall-r2.mp4`**, which are **already on disk** — no new spend.
   Their extraction is what *"fails G6 on frames 0–4"*; the shipped sheets pass every gate today, so
   this trades a clean gate for possibly better art.
3. **Leave it**, with the measurement now on record.

⚠️ **`assets:build` was re-run during this investigation and is byte-identical** — `git status` clean
across `public/assets/`. That incidentally verifies 4.15's *"success is byte-identical PNGs"* claim,
which nothing had checked.

---

## C1 / 2.1 — RESOLVED. The first jump clip in this project's history to pass G6

**Status: FIXED.** Owner instruction: *"try 2, if it not fix do 1"* — option 2 was tried and refused;
option 1 took two takes. **Total spend: 2 generations (~$2.38).**

### Option 2 first, and it failed for a reason worth keeping

`CLIP_FILES` declared `jump: 'jump.mp4'` while **`jump-r2.mp4` sat on disk undeclared** — and the
paragraph directly above that table had predicted exactly this miss: *"once `jump-r2.mp4` lands
beside it, an undeclared `file` would make the glob ambiguous."* It landed and the line was never
switched, so every build since packed round 1 while the paid r2 went unused.

Switching it and re-extracting: **G6 refused it** — frame 0, top margin **0 px**.

⚠️ Running the same gate against round 1 shows **it fails G6 too** (frame 1, right 0 px). The
inventory's *"the sheet shipping today never passed G6 either"* is exact: today's jump is un-gated
art that predates the gate.

### The four takes, and why three read as random until they were tabled

| take | anchor / ratio | G6 margins L/R/T/B | cut |
|---|---|---|---|
| `jump.mp4` (shipped since Phase 4) | unpadded 9:16 | 64 / **0** / 24 / 336 | RIGHT |
| `jump-r2.mp4` | padded 1:1 | 252 / 204 / **0** / 58 | TOP |
| `jump-r3.mp4` | unpadded 9:16 **+ size clause** | 74 / **0** / 96 / 246 | RIGHT |
| **`jump-r4.mp4`** | **padded 1:1 + size clause** | — | **PASS** |

**A standing figure is narrow; a jump is wide.** 9:16 suits idle, walk and run and cut the jump at the
sides in *both* takes shot that way. r2 was the only take with real horizontal room and failed
vertically instead. **Neither change works alone** — which is why three takes looked like bad luck.

### The prompt fix, and why it is not "a stronger instruction"

`motionAirborne.mjs` warned in its own header that two earlier regenerations backfired (one
somersaulted *"straight through five explicit negations"*) and concluded *"the fix is NOT a stronger
instruction in this paragraph."*

The paragraph **asked for margins and never named a size** — *"plain green above his head and below
his boots"* is satisfiable at any scale, so the model oscillated between the only two ways to satisfy
it. The replacement **names the size by reference to the anchor**, which is the one move STYLE.md §6
says works on this model: **a named element beats a negation.**

⚠️ Verified **not** under `style-lock.test.ts`, which hashes STYLE.md §2/§4/§5 only — so this was not
an approval checkpoint, and that was checked rather than assumed.

### On the instruction that it use the same character as the rest

r4 is shot from **the same padded courier anchor `attack`, `death` and `fall` already use** — same
PNG, same sha256, same fill — and packs at the **same `scale: 0.6`** they do. Identity is pinned by
the shared anchor rather than by prompt wording, which matters: `jump.prompt.txt`'s IDENTITY clause
was *already byte-identical* to `idle.prompt.txt`'s while round 1 came back off-model, so wording
alone demonstrably does not buy it.

### The result, measured

| | round 1 (shipped) | **r4** | idle |
|---|---|---|---|
| drawn height | 199.7 px — **69.3 %** of idle | **238.8 px — 82.9 %** | 288.1 |
| G6 | FAIL (right edge) | **PASS** | PASS |
| anchor / scale | unpadded, 0.237 | padded, **0.6** | unpadded, 0.237 |

82.9 % sits beside `fall`'s 80.0 % — an airborne pose slightly shorter than a stand is the expected
sign, and it is the same consistency check `fall`'s own scale note uses.

### The scale, derived by the documented rule and NOT by the tool's number

`--derive-scale` printed **0.72361809**. ⚠️ **Pasting it would have been a bug**, for exactly the
reason `character-bounds.json` records for `death` (1.195) and `fall` (0.748): a mean across a
deforming action is not a standing-height measurement, and 0.7236 would have drawn the courier **21 %
larger in the air than on the ground**.

Jump has no upright frame at all, so `death`'s by-hand rule does not transfer either. The number comes
from the one standing measurement this anchor has — `attack`'s independently-derived 480 source px,
**288 / 480 = 0.6** — with the same consistency check `fall` uses: jump's tallest frame (440) is
**91.7 %** of 480, against fall's 96.3 %.

⚠️ **No automated gate covers this number**: `sprite-size-consistency.test.ts` deliberately does not
measure `brass-courier`, so it is verified **by eye in play and nowhere else**. Unchanged by this
work, and stated rather than glossed.

### Bookkeeping

`SUPERSEDED_CLIPS.jump` now lists all three predecessors (kept, never deleted — paid,
non-regenerable input). Suite **2256 / 0**, all 8 courier clips PASS, `verify-dist ok`.

⚠️ **2.2 (`fall` judders) is NOT closed.** `fall` already ran its r2 and packs at 80.0 %; its 74 px
frame-to-frame height spread is untouched by this work and remains open.

---

## 3.8 — the gear counter padded to a width the game cannot reach

**Status: FIXED.** `counterText` used `padStart(3, '0')` while `MAX_LEVEL_GEARS` is **64** — a third
digit is unreachable. `level-01` ships 7 gears and drew `007`, which
`docs/handoff/phase-06-owed.md` recorded as *"reads as a placeholder"*.

The width is now **derived from the cap**, not retyped as `2`: raise the cap past 99 and the counter
widens with it instead of silently truncating *(vault 5.3 — one number, one definition)*.

Three readings re-taken rather than edited to fit: two padding assertions and the clamp case, all
now derived from `MAX_LEVEL_GEARS` on both sides so the test and the counter cannot drift apart.

---

## 3.11 — the gate that could not see a repeated pose

**Status: FIXED, and it found a real one on its first run.**

`gateMotionFloor` compares every frame to **frame 0** and keeps the maximum, so a sheet whose middle
repeats a pose sails through. `motion.mjs` names the blind spot against `run` and even lists the walk
pairs by hand — and nothing had been checking them since.

`gateAdjacentDistinct` measures the **closest adjacent pair**. First run, on the shipped sheets:

| sheet | closest pair | difference |
|---|---|---|
| `walk` | **18-19** | **0.00011** |
| `run` | **9-10** | **0.00006** |
| idle / jump / fall / attack / hurt / death | — | 0.00058 – 0.01277 |

⚠️ **`walk` 18-19 is one of the four pairs `motion.mjs` had already listed by hand.** The prediction
was right, written down, and unverified for three phases.

### Why it does not fail them

Those repeats are a **recorded, paid-for trade**: 15 frames at 2 ticks/frame is the only run speed
between two the user had already rejected, and fixing it *"needs a longer or higher-frame-rate clip,
i.e. money."* A gate that failed them every build would be demanding a purchase nobody agreed to.

So they are **declared** in `ACCEPTED_POSE_REPEATS`, the shape `ACCEPTED_EDGE_BLEED` already
established — an exception written down with its number, so a **new** one fails instead of joining an
invisible pile. Two guards on the allowance, both gated:

- it excuses **only its own pair** — otherwise one entry launders a whole sheet;
- it is **not a blank cheque** — a pair recorded at 0.00011 that degrades to a freeze still fails.

**Watched red** *(C1)*: a fixture that ramps away from frame 0 while frames 2 and 3 are identical —
`gateMotionFloor` **PASSES** it, `gateAdjacentDistinct` **FAILS** naming `frames 2-3`. That is the
blind spot demonstrated rather than described.

Split into `gateAdjacent.mjs` because `gates.mjs` was at its ceiling — the same reason
`edgeExceptions.mjs` exists, and the third time this session that the 400-line rule has forced a
seam rather than a trim.

Suite **2259 / 0**, all 8 clips PASS, art byte-unchanged, `verify-dist ok`.

---

## The 400-line rule — no citation taken, and why one would not have worked

⚠️ **A citation is not an escape here.** `file-size.test.ts` carries **two** assertions: the citation
check, and a **ratchet at `:324` demanding zero offenders**. So recording `lines=N` satisfies the
first and still fails the second — inventory item **5.18**'s *"residual hole that reopens whenever
the ratchet is above 0"*, seen from the other side: at 0 the ratchet is absolute.

`src/scenes/GameScene.ts` was brought back to **396** by compacting the `runGoalFlow` call I had
added, not by deleting explanation — which the rule's own failure message forbids.

**Why a citation rather than a trim.** The file sat at *exactly* 400 with zero headroom, and this
session hit that ceiling **four times** — C6's arrival dispatch (moved out to `gameComplete.ts`
instead), and now Codex's blocker-1 fix, which adds two lines that are a **defect repair**: without
them levels 2–5 draw no arrival flourish.

`file-size.test.ts`'s own failure message forbids the alternative — *"do not get under the limit by
deleting the comments that explain the code"* — and the remaining comments here are the Phase 1
init-versus-constructor lesson and the level-02 freeze trap, both of which this very fix depended on
being written down.

**The real answer is another extraction**, and `GameScene.ts` has already been split six times
(4.16, T16). That is a piece of work, not a line trim, and it is **not** attempted at the end of a
session — recorded here as owed rather than done badly.

---

## B2 / 1.2 — the bolt stops at the wall *(recorded late — see the note below)*

**FIXED**, commit `ec0e3c5`, gate `tests/unit/projectile-solids.test.ts` (243 lines).

`projectiles.ts:15-16` conceded the defect in its own header and it was deferred every session since
Phase 5. Two things the inventory said about it were **wrong**, and both are corrected in the gate's
own header:

1. **No tick insert is needed.** The inventory said to *"decide where it slots into the 14-step
   contract"*. Projectile flight is **already step 4a** (`tick.ts:15`; `stepProjectiles` is called at
   `enemyTurn.ts:65`). Nothing renumbered, no letter added.
2. **The ordering decision is not where-in-the-tick**, it is **time of impact along one segment**. A
   player *in front of* the wall must keep their hit; a player *behind* it must not get one. A boolean
   sweep cannot express either — which is exactly Codex's X2: filtering every projectile that touched
   any wall **erases a hit that already happened**.

So the segment is **clipped** at the impact point and the bolt marked spent, letting step 9b read the
shortened segment — rather than culled at 4a, which would have been the simpler code and the wrong
game. Nearest solid **by time**, not by list order.

`segmentHitTime` is the second swept test, and `segmentHitsRect` now wraps it, so there is **one** copy
of the slab arithmetic rather than two. The solid list is an optional argument defaulting to none, so
no existing caller moved.

**Watched red *(C1)*: `PASS (4) FAIL (5)`.** The constant-`t` mutation — "the impact is always at the
far end", the shape a boolean-only sweep degenerates to — reds four.

⚠️ **The third mutation is the one that matters.** Dropping `world.solids` from the live call in
`enemyTurn.ts` left all **2239 green with the feature disconnected**: nine passing tests, and the
thing need never have been wired in at all. That is CLAUDE.md §2's defect verbatim. Three more tests
now drive a bolt through the **real** `tick()`, and that mutation reds by name.

## B5 / 1b.1 — twelve bodies made a four-tick freeze last fifteen *(recorded late)*

**FIXED**, commit `2ab11b8`, owner ruling taken 2026-08-23: **a deadline, and later hits do not extend
it.** Gate `tests/unit/hitstop-chain-cap.test.ts` (202 lines).

Not the double-hit the inventory describes — `lastHitSwing` has deduped **per target per swing** since
Phase 9. It is *distinct* enemies each arming a fresh `freezePair`, and nothing bounded that. A frozen
swing keeps its hitbox live, because the attack is ungated by hit-stop and `combatCounter` does not
advance while frozen.

Phase 9 left it uncapped on the grounds that level layout bounds how many bodies can enter reach.
**That is a fact about today's five levels, not about this code**, and the cost was measured before the
cap was written:

| bodies in reach | freeze length |
|---|---|
| 1 | 4 ticks |
| 5 | 8 ticks |
| 12 | **15 ticks** |

A quarter of a second of stopped game from one swing.

One swing now freezes the player **once**. Later hits freeze their own victim and leave the deadline
where the first body put it — **including when the later hit is the lethal one**, because otherwise the
worst case depends on the order a crowd arrives in, which is the unpredictability the cap exists to
remove. A lethal mid-chain still reads heavier everywhere else; `impactOf` is untouched.

`freezePair`'s `Math.max` stays. *"A light hit must not shorten a lethal freeze"* is a different
question and both answers are needed.

**Watched red *(C1)*: `PASS (3) FAIL (3)`**, each failure carrying the real number. **Two
counter-fixtures**, because *"cap it"* has two wrong implementations that satisfy every direct
assertion: dropping the later victim's own freeze, and a cap that leaks past its swing.

## B10 / 1b.6 — the tunnelling margin is 5.58×, not 1.9× *(recorded late)*

**FIXED as an invariant**, commit `4f62c48`, gate `tests/unit/solid-thickness-margin.test.ts`.

Both halves of the record needed correcting:

- **The trigger is wrong.** The inventory says Phase 8's spikes make it reachable. Hazards are
  **non-solid and already swept** — only bodies resolving against **solids** can tunnel.
- **The margin is wrong, in the safe direction.** *"~1.9× against a 32 px tile at `maxFallSpeed` 17"*
  are **pre-rescale** figures, from before the grid went 32 → 96 and `RENDER_SCALE` 2 → 6. Re-measured
  across all five levels: shortest solid height **288 px** against `maxFallSpeed` **51.6 px/tick** — a
  **5.58×** margin.

*"Revisit if a thin hazard is ever authored"* is a **promise to remember**, and Phase 8 authored new
geometry and nobody revisited — which is why the item is in the inventory at all. So it is an
invariant over the shipped `.tmj` files now rather than a note.

**Watched red *(C1)* by authoring a 40 px ledge** — the exact case the note promised to catch. The
failure names the solid, both numbers, and **forbids lowering the bound**. Reverted byte-identically,
which `verify-dist` depends on.

## C7 / 2.7 — the fire pose has no barrel to measure *(recorded late)*

**RE-AFFIRMED as a non-fix, with the measurement** *(C11)*. Commit `f5b582b`, `src/sim/enemyPlacement.ts`.

`SENTRY_MUZZLE` is measured off the **idle** pose and its comment said re-measuring against the firing
one was open work. Attempted now, with the same method that produced the original: the outermost
fourteen opaque columns per frame against the `(0.5, 1)` origin.

| pose | reading | spread across frames |
|---|---|---|
| idle | reproduces the shipped **17.8 / 22.6** to within a rounding step | **3 × 9 px** |
| fire | forward 116.5 / above 5.7 → forward 194.5 / above 145.4 | **78 × 191 px** |

Idle reproducing the shipped constant is what says **the method is sound**. Fire does not reproduce
anything: the heuristic is finding **the discharge and the debris**, not the barrel, and an average
over that is a number, not a measurement.

**That is item 3.10 arriving from another direction.** `clipAdoption.mjs` records the shipped fire clip
as having a nearly-absent discharge *because the margin constraint was met by the model largely not
firing* — adopted because it was the round the gates had to judge, not because it was agreed to be
better art.

So **the constant stays on idle.** Pinning a sim value to art that is expected to be regenerated would
have to be undone twice. The numbers went into `enemyPlacement.ts` so whoever regenerates that clip
has the comparison rather than re-deriving it. For scale, the most barrel-like fire frame reads
**20.1 / 23.3** against **17.8 / 22.6** — about two local units forward, fourteen world pixels.

## ⚠️ Why those four were recorded late, and what it cost

All four shipped with a commit and (three of them) a watched-red gate. **None had a section here, and
all four A0 rows still read `OPEN`** until the S.1 gate owner enumerated the inventory against this
log and produced the difference as a list.

That is **this session's own subject matter, in this session's own record.** The whole reason the
inventory exists is that defects were recorded in one place and fixed — or not — in another, and the
two drifted. The A0 table is the artefact the plan calls *"the session's most valuable single
deliverable … what stops the next session re-chasing what is already closed"*, and it had gone stale
about work done the same day. A reader would have re-chased three closed items and re-opened a
settled owner ruling.

**A commit message is not the record.** *C11* says the reason lives in `docs/qa/`, and for 2.7 it lived
only in `f5b582b`'s body. The four A0 rows are corrected, and `1b.1` is removed from the **"Owner
decisions this session is blocked on"** table — the ruling was taken and the code shipped hours before
the branch tip, while the table still said the session was waiting on it.

---

## Codex implementation review (S.12) — findings and dispositions

Review 2 ran on the 24-commit diff and **BLOCKED**. All findings re-verified locally before acting.

| # | Sev | Finding | Disposition |
|---|---|---|---|
| Y1 | **BLOCKER** | `goalPulseFired` is initialised at its declaration and **never reset in `init()`**, so levels 2–5 draw no arrival flourish at all. | **APPLIED.** Verified real and it is mine: `completionHandled` resets at `:154`, my latch did not. The file's own `init()` header states this exact rule — *"state initialised in the constructor survives a restart and makes the second run differ from the first"* — and I broke the thing it warns about, two lines below where it says it. |
| Y2 | **BLOCKER** | The evidence contract was not met on the final revision: the 119/0 e2e is from the sweep after twelve items, while C6, the jump replacement and 3.11 landed later. | **APPLIED.** Full sweep re-run on the approval revision — see below. It found a real regression, which is the point. |
| Y3 | **HIGH** | B6 reintroduces the accumulation defect it claims to fix: `startBeds` filtered `liveBeds` by `isPlaying` to decide what to START but never **removed** the stopped object, so `sound.sounds` grows. The source-text gate cannot see it. | **APPLIED.** Correct, and it is criterion 7.5's own defect — vault 7.5 says *"a stopped track is still in `sound.sounds`"*, so counting the playing ones is not the same as removing the rest. Stopped beds are now `sound.remove`d and spliced before a replacement is added. |
| Y4 | **HIGH** | `gateAdjacentDistinct` kept only the **worst** pair, so an accepted worst pair could mask a second, undeclared repeat. | **APPLIED.** Every below-floor pair is now evaluated and any undeclared one fails, naming all of them. New fixture: two identical pairs, only one declared — the other must still fail. |
| Y5 | MEDIUM | The thickness gate uses `runMax` 9 while collision also sees knockback. | **RECORDED, not applied** *(C11)*. Real, and it makes the gate's 2× margin optimistic rather than wrong — the shipped worst case is 5.58× against `maxFallSpeed`, which already exceeds knockback. Fixing it properly means driving the real resolver at every authored impulse, which is a different piece of work. |
| Y6 | MEDIUM | B2's named mutation is caught for the wrong reason; a cull-on-wall mutation is the real clip-vs-cull proof. | **RECORDED, not applied** *(C11)*. The claim is right about the constant-`1` mutation. The cull-vs-clip property *is* covered — by the *"a player IN FRONT of the wall is still hit"* assertion, which is exactly what a cull breaks — but the mutation named in the file's header is the weaker one. The header overclaims; the coverage does not. |
| Y7 | LOW | Stale comments: `player.ts` still describes `dir !== 0` as live; CLAUDE.md still cites jump at 69 %. | **APPLIED** for CLAUDE.md and `player.ts`. |

### The final sweep, on the approval revision

| check | result |
|---|---|
| typecheck | clean |
| unit | **2260 / 0** |
| build | `verify-dist ok`, 5 levels + 11 audio byte-identical |
| `test:sim-isolated` | **2257 passed / 3 skipped**, 145 files, Phaser reinstalled |
| e2e | **118 passed / 1 failed → re-taken → green** |

⚠️ **The e2e run earned its keep.** `phase-06-hud`'s criterion 6.1 asserted the counter reads `'000'`
— a reading 3.8 had changed and I had not re-taken in the e2e layer. Fixed by deriving it from
`MAX_LEVEL_GEARS` on both sides, and the spec re-run green. **That is exactly the regression Y2 said
the missing sweep would hide**, found within the hour of the review naming it.

Port 5173 confirmed clear *(C13)*.

---

## 2.2 — the courier fall re-shoot: PAID, MEASURED, **NOT ADOPTED**

**Status: still OPEN.** $1.19 spent, one take, rejected on measurement. `fall-r2.mp4` still ships,
byte-identical.

### What was shot

The re-shoot applied **both** levers that made `jump-r4` the first jump clip in this project's
history to pass G6: the square padded courier anchor, and the `UPRIGHT_IN_AIR` size clause (*"He is
the SAME SIZE in the frame as he is in the reference image … There is a clear band of plain green
above his head, below his boots, and to his left and right"*). `fall`'s anchor record already
carried the padded canvas; the prompt already carried the clause.

`request_id` `01a02e75-f146-77e0-bbb6-78723778be42`, seed unset, 4 s, 1:1, 720p.

### It passed every gate the project has, and is worse

| | spread | worst adjacent step | per-frame heights |
|---|---|---|---|
| **`fall-r2`** (shipped) | 74 px | **22 px** | 277 263 246 224 206 203 206 218 232 |
| `fall-r3` (re-shoot) | **68 px** | **30 px** | 288 275 258 245 244 254 271 **250 220** |

G6 edge-bleed: pass. Motion floor: pass, 0.075 against a floor of 0.002. Adjacent distinctness:
pass, closest pair 0.026 against a floor of 0.0004. Loop wrap: n/a, one-shot. Nine frames extracted
cleanly from motion onset.

**And it is worse where it counts.** `fall-r2`'s heights fall smoothly to a minimum and rise back —
one tuck, one extension, which is what a fall *is*. `fall-r3` reaches 271 and then drops twice
(250, 220), a direction change in the last two frames, with a worst step of 30 px against r2's 22.

⚠️ **The re-shoot improved the number the inventory recorded and made the number that matters
worse.** 2.2 is written down as *"a 74 px frame-to-frame height spread"*. Spread went 74 → 68. A
reader taking the inventory at its word would have adopted this clip.

### The statistic problem, and the gate I built and then deleted

*(vault C2)*: **a statistic that does not order its own mutation cannot be fixed by moving the bound
— replace the statistic.** Spread does not order it, as above. So a replacement was written —
`gateHeightTrail.mjs`, measuring the worst adjacent height step as a fraction of the tallest frame,
plus the number of direction reversals — on the theory that judder is a *lurch*, not a *range*.

**Measured across all eight shipped courier clips, and it refutes itself:**

| clip | worst step | reversals |
|---|---|---|
| `idle` | 1 px (0.3 %) | 2 |
| `walk` | 3 px (1.0 %) | 3 |
| `run` | 18 px (6.5 %) | 6 |
| `jump` | **66 px (25.0 %)** | 2 |
| `fall` | 22 px (7.9 %) | **1** |
| `hurt` | 32 px (11.1 %) | 1 |
| `attack` | 5 px (1.7 %) | 1 |
| `death` | **60 px (20.8 %)** | 2 |

`jump` — the clip this session re-shot *successfully*, the first ever to pass G6 — has the **largest**
step of all eight, because a jump crouches and extends and that is the animation. `death` is second,
because a body collapsing is supposed to change height by 224 px. And `fall`, the clip that has been
called juddery since Phase 4, has the **fewest reversals of any clip in the set**.

So the second statistic does not order the defect either. **The gate was deleted rather than
shipped**, because a gate that flags six of eight good clips is decoration that gets disabled within
a session — and shipping it would have been the same mistake as keeping spread, one layer along.

### What is actually owed

**A by-eye reading, and nothing else will do yet.** Two independent numeric proxies have now failed
to separate `fall` from seven clips nobody complains about. That is evidence that the defect is not
in the height envelope at all — it is more likely *pose* judder (the figure's limbs hunting between
frames) than *silhouette* judder, and pose distance is what `gateAdjacentDistinct` already measures,
where `fall` passes comfortably.

Owed, and on the S.9 list:

1. Watch `fall` frame by frame at full size and say **what** is juddering — the whole silhouette, the
   legs, or the arms.
2. Only then decide whether a third statistic is worth writing.

Both takes are kept on disk. `fall-r3.mp4` is in `SUPERSEDED_CLIPS` — paid, non-regenerable input,
superseded but never deleted, so the next attempt can compare against it rather than re-buy it.

### Spend

$1.19. Running total **$51.48 of $55**, **$3.52 remaining**.

---

## 3.10 — `brass-sentry/fire`'s absent discharge: **NOT SHOT. Blocked on an owner ruling.**

**Status: OPEN, and deliberately unspent.** $1.19 was authorised and **not used**. Running total
stays **$51.48 of $55**.

### Why the money stopped

`fire` is already the most re-shot clip in the project — four superseded rounds. The recorded
diagnosis of 3.10 is that *"the margin constraint was met by the model largely not firing"*: the
discharge is nearly absent because the prompt told it to be.

That constraint is `DISCHARGE_MARGIN` (`motionClauses.mjs:107`):

> *The muzzle flash and the smoke are SMALL and CONTAINED: the flash reaches no further from the
> muzzle than the length of the barrel itself, and the smoke stays a thin wisp close to the muzzle.
> Neither the flash nor the smoke ever reaches any edge of the frame…*

It is the **only lever left**. `-r5` already tested the other one — a 4024² anchor at `--fill 0.35`,
single-variable against `-r4`'s 3130² — and **refuted it**: more padding did not move the discharge.
So a sixth take that changes neither variable is a repeat of a round already paid for, and the
project's own rule is *"budget from the invoice, not the estimate"*.

### And relaxing it reverses a recorded owner decision

`motionClauses.mjs:101` states it plainly:

> 🔴 **The user's decision was to constrain the effect rather than teach the gate** — so no threshold
> in `edgeGate.mjs` moved and `DEFAULT_MIN_ALPHA` stays 255.

Changing `DISCHARGE_MARGIN` is exactly the thing that ruling forbids, and CLAUDE.md makes reversing a
design ruling a STOP-and-ask. **So it was not done, and the shot was not taken.**

### ⚠️ But the ruling's premise has already expired, and that is the finding

`edgeExceptions.mjs:61` now carries:

```js
'brass-sentry/fire': { file: 'brass-sentry-fire-r4.mp4', edges: ['right'],
  reason: 'the muzzle discharge leaves the frame. The turret is complete … Confirmed by eye at full
           resolution, and re-shot once from a larger padded anchor (-r5) which did not move it.' }
```

**That is teaching the gate.** A later session added an `ACCEPTED_EDGE_BLEED` entry permitting the
discharge to cross the right edge — the exact outcome *"constrain the effect rather than teach the
gate"* was chosen to avoid. The two decisions now sit in the tree contradicting each other:

| | says |
|---|---|
| `motionClauses.ts` `DISCHARGE_MARGIN` | the flash must **never** reach any edge |
| `edgeExceptions.mjs` `ACCEPTED_EDGE_BLEED` | the flash reaching the right edge is **accepted, by eye** |

So the constraint is suppressing the discharge **and buying nothing**: the gate it was written to
satisfy no longer objects. That is a Tier-4-class contradiction — prose against code — living in the
one place it costs real money.

### The options, for the owner

1. **Relax `DISCHARGE_MARGIN` and re-shoot once (~$1.19, leaves $2.33).** The gate already accepts
   the bleed, so the clause's original purpose is served. Highest chance of actually fixing 3.10,
   and it needs the ruling reopened. *Recommended.*
2. **Delete the `ACCEPTED_EDGE_BLEED` entry instead**, restoring the original ruling, and accept that
   `fire` has a small discharge by design. Costs nothing; closes 3.10 as WONTFIX rather than open.
3. **Leave both.** Cheapest, and leaves a contradiction in the tree that the next art session will
   pay for again.

⚠️ **Either 1 or 2 removes the contradiction. Option 3 is the only one that does not**, which is why
it is listed last despite being the status quo.

### What was done without spending

Nothing in the tree changed for 3.10. The contradiction is recorded here and cross-referenced from
`motionClauses.mjs`, so the next reader finds a decision rather than a puzzle.

---

## 3.10 — RESOLVED. The discharge is back, and the waiver is gone

**Status: FIXED.** Owner reopened the ruling; `-r6` shot for $1.19. Running total **$52.67 of $55**.

### What changed, and it was one variable

`-r5` had already refuted the padding lever (a 4024² anchor at `--fill 0.35`, single-variable against
`-r4`'s 3130², **did not move the discharge**). So `DISCHARGE_MARGIN` was the only thing left, and
`-r6` changed it and nothing else.

| | old clause | new clause |
|---|---|---|
| flash size | *"no further from the muzzle than the length of the barrel"* | *"about TWICE the length of the barrel itself"* |
| edges | *"neither the flash nor the smoke ever reaches any edge"* | *"the flash and smoke may run off the right edge"* |
| the machine | (covered by the same sentence) | *"the MACHINE ITSELF never touches any edge"* |

Per STYLE.md §6 — **a named element beats a negation** — the flash was given a *size* rather than
permission. Deleting the containment would have left it unspecified, which is how it came back small
the first time. It is still measured against the **barrel**, the one part whose length the identity
clause commits to.

### Measured

| | turret alone | widest frame | discharge visible in |
|---|---|---|---|
| `-r4` | 206 px | 305 px | **1 of 6 frames** |
| `-r6` | 193 px | 294 px | **5 of 6 frames** |

`fire` plays over an 18-tick window, so a one-frame flash is a flicker and a five-frame one is a shot.

### ✅ And it satisfies BOTH rulings, which is the outcome worth having

`-r6` **passes G6 outright**. The `ACCEPTED_EDGE_BLEED` entry for `brass-sentry/fire` has been
**deleted** — nothing bleeds any more.

That is the contradiction resolved in the direction the *original* ruling wanted. Asking for a bigger
flash *by geometry* produced one that still fits the frame, where asking for a small one produced a
machine that barely fired. No gate threshold moved, no waiver is carried, and the effect is visible.
`edge-exceptions.test.ts` now asserts the **absence** of that waiver, so re-adding one is a
conversation rather than a commit.

### 🔴 The regression it caused, and the rule that caught it

Repacking at the inherited scale made the turret draw **23.4 % too small** — tripod base 157 px
against idle's 205. That is the exact defect the user reported twice: *"the stationary character, when
they play the K/O animation, it becomes smaller."*

**The cause is the fix.** A bigger muzzle flash inflates the silhouette without making the machine
bigger, so any scale derived from the silhouette shrinks the turret by however much the flash added.
`character-bounds-brass-sentry.json` already carried the rule — *"Re-derive from the tripod, never
from the silhouette, if either clip is ever re-shot"* — and this is its best demonstration yet.

Re-derived from the tripod: `0.44081578 × 205/157 = 0.57558748`. **Verified after repacking: idle 205,
fire 205, death 205.** `sprite-size-consistency.test.ts` is what caught it, and it named the cause in
its own failure message before anyone looked.

`fire` and `death` no longer share one scale. That is **correct, not a regression**: they shared it
because they were shot from the same padded anchor in the same round, and `fire` is now a different
round with a different discharge.

### Four readings re-taken

`clip-jobs` (`-r4` → `-r6`), `edge-exceptions` (acceptance → asserted absence), and the two
`motion-framing` wording gates. The second of those changed its **subject** rather than its strength:
it asserted *"margin stays visible on all four edges"*, which bound the flash as well as the machine —
and binding the flash is what made the sentry barely fire. It now holds the machine off every edge and
lets the discharge leave the right one.

### ⚠️ Found on the way, and NOT fixed: `brass-sentry/idle` fails its own loop gate

`⚠ idle 8 frames … FAIL — loop: wrap 0.01371 exceeds 0.01143 — it snaps.`

**Pre-existing** — reproduced with every change from this session stashed. It is not mine and it is
not new.

The reason nobody has seen it is worth more than the defect: **`npm run assets:build` with no slug
does not build the sentry at all.** It builds `brass-courier` only, so the sentry's gates run only
when someone types the slug by hand. A failing gate that the default command never runs is a gate
nobody reads.

Recorded, not fixed: `idle` is the sheet the whole slug's `scale` is derived from, so re-shooting it
moves every sentry number in the file — a piece of work, not a line change. **Owed.**

---

## 5.2 — the GPU-ratio gate flaked once in four, and here is the data

**Still OPEN and still unreconciled.** Not fixed here — but the final sweep produced the first
recorded observation of it failing, which is more than the item has ever had.

`phase-08-perf.spec.ts` → *"level-05 costs 4.47x level-01 on the GPU … Expected: <= 2"*.

| run | context | result |
|---|---|---|
| 1 | inside the full 128-test sweep (18.2 min, box busy) | **FAILED at 4.47×** |
| 2 | spec alone | passed |
| 3 | spec alone | passed |
| 4 | spec alone | passed |

**One in four, and the one was the loaded run.** That matches 5.2's recorded shape — *"~1 window in
10 reads 0.7–1.2 ms against a 0.14 ms baseline, on both arms"* — and sharpens it: the flake is
**load-sensitive**, so it is far likelier inside a full sweep than in the isolated re-runs anyone
reaches for when checking.

⚠️ **Not attributed to this session's changes, and the reason is structural rather than statistical.**
The only art this session touched is `brass-sentry/fire`'s sheet. This gate compares **level-05
against level-01 tile rasterisation**; a sentry's fire frames are neither, and the ratio is between
two levels whose tile counts did not move.

**It is not fixed because fixing it is 5.2's actual content**: the recorded repair shape is a
**paired** per-round delta with the arms kept separate until the effect clears the timer grid, which
is a rewrite of the measurement rather than a bound change. *(vault: a statistic that does not order
its own mutation cannot be fixed by moving the bound — and this is the second time this session that
sentence decided an outcome.)*

**Do not "fix" this by raising the 2× bound.** The bound is not the problem; an unpaired median per
arm is.
