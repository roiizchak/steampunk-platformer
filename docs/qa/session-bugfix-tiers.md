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
| 1.2 sentry bolts pass through walls | **OPEN**, premise corrected | `src/sim/projectiles.ts:15-16` concedes it. ⚠️ The inventory's *"decide where it slots into the 14-step contract"* is **wrong**: projectile flight is **already step 4a** (`tick.ts:15`; `stepProjectiles` called at `enemyTurn.ts:65`). No tick insert is needed. The real problem is **time of impact along one segment**. |
| 1.3 lifecycle spec contradicts its docstring | **OPEN** | `tests/e2e/phase-06-lifecycle.spec.ts:186` heads a *"🔴 `test.fixme` — it FAILS"* paragraph; `:200` is a plain `test(...)` and the suite passes it. Exactly one of "fixed and undeleted" / "decoration" is true. Settled by hand, not by reading the green. |
| 1.4 body starting inside a solid | **OPEN** | `docs/reviews/session-bugfix-perf-gates-impl.md:75`. Paired change with `resolveCollisions` or none at all. |
| 1b.1 hit-stop chain uncapped | **OPEN**, reclassified | `docs/qa/phase-09-polish.md:394`. ⚠️ Not what the inventory implies: `lastHitSwing` (`playerAttack.ts:21-24,71`) already dedups **per target per swing**. The chain is *distinct* enemies each arming a fresh freeze. **A balance change — the owner's decision.** |
| 1b.2 audio beds restart per level | **OPEN** | `src/game/audio.ts:103-114` — `startBeds` does `sound.add(key)` + `bed.play()` unconditionally, with no `sound.get` check. The recorded excuse (*"no level transition exists yet"*) expired when Phase 8 shipped five levels. |
| 1b.3 the 9b ordering | **OPEN**, gate reclassified | Both stated facts are true. ⚠️ But the reach-only zone **cannot discriminate the ordering** — no enemy damage occurs there, so both orderings behave identically in it. The discriminating case is an **overlapping** scavenger whose claw goes live the same tick as a lethal swing. **A balance change — the owner's decision.** |
| 1b.4 six extracted modules untested | **OPEN** | No file in `tests/unit/` matches `parallax`, `goalLayer`, `gameDev`, `gameInput` or `bootLevels`. |
| 1b.5 nothing kills an enemy by swinging | **OPEN** | `tests/unit/player-attack.test.ts:214` sets `corpse.hp = 0` directly. ⚠️ A test driving real combat **starts green** — the red proof needs the hp transition suppressed inside `applyPlayerAttack`, not a convenient edit elsewhere. |
| 1b.6 `resolveCollisions` tunnelling | **OPEN**, trigger wrong | ⚠️ Phase 8's spikes do **not** make this reachable — hazards are non-solid and already swept. The real question is the narrowest **solid** against the fastest reachable speed. |

### Tier 2 · 2b

| item | class | evidence |
|---|---|---|
| 2.1 / 2.2 courier jump + fall | **OPEN** | One art defect, two symptoms. Re-shoot authorized. |
| 2.3 player runs on the spot | **OPEN** | `src/sim/tick.ts:332` — `resolveState(player, dir !== 0 || player.vx !== 0, …)`. **One call site**, so the fix is one expression. |
| **2.4 chasing scavenger runs in place** | **FIXED** | `src/sim/enemyScavenger.ts:327` — `scavenger.moving = scavenger.x !== xBefore`, a readback recomputed every live tick; `src/render/enemyView.ts:85` `scavengerAnim` reads it and returns `idle`. **The descoped-pose blocker the inventory calls a STOP-and-ask is gone.** |
| 2.5 help banner illegible | **OPEN** | `src/scenes/gameDev.ts:138` — `fontSize: '18px'`, plus `setScrollFactor(0)` on a `GameScene` object. |
| 2.6 exit-gate pulse over an empty doorway | **OPEN** | `src/scenes/goalLayer.ts:136-140` states it itself: *"the completed-it flourish now, not the reached-it one, and it plays over an empty doorway."* |
| 2.7 `SENTRY_MUZZLE` off the IDLE pose | **OPEN** | `src/sim/enemyPlacement.ts:121` — `{ x: 17.8, y: 22.6 }`. |
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
| **OPEN as described** | ~28 | |
| **not yet reconciled** | ~12 | 2b.8 · 4.5 · 4.6 · most of Tier 5 |

**Seven items would have been implemented as bugs that are not bugs**, and one of those would have
reversed a design ruling. Four more would have been implemented from a wrong cause. That is A0's
finding, and it is why it ran first.

---

## Owner decisions this session is blocked on

| item | question |
|---|---|
| **0.2 vite cache** | Deleting `node_modules/.vite` is denied to the agent by security policy. Please clear it, or approve the deletion — criterion 1.4 fails 6/6 until it goes, and the whole e2e suite reads as broken. |
| **2b.1 aggro** | Permanent aggro is written down as the design (`enemyScavenger.ts:128`), and the run-in-place symptom that made it look broken is already fixed. **Reopen it, or keep the ruling?** |
| **1b.1 hit-stop cap** | A crowd walking into one swing can freeze the game for an unbounded chain. Capping it is a feel decision: a **deadline** (one swing freezes until tick T; later hits do not extend it) or a **budget**. And explicitly: does a later *heavier* hit extend the deadline? |
| **1b.3 the 9b ordering** | Player-first (today) means a lethal swing kills an overlapping scavenger and takes no contact damage. Contact-first means you trade the hit. **Pin today's behaviour, or change it?** |

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
