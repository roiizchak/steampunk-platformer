[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

# Session 11 — the locomotion retune that was measured and then NOT applied

**Decision: no speed change. The shipped tune stands.** Recorded because the measurement behind it
cost real work, closes a question that will be asked again, and would otherwise have to be re-derived
by the next person who thinks the game moves too fast.

## The request, and why the obvious answer does not exist

The player, 2026-08-15, after playing the session's art: *"I think we need to slow down the game of
the character and the enemies. I think maybe another 10%. I think the all move is a bit fast."*

**10% is not a value locomotion speed can take.** Planted feet require
`ticksPerFrame × speed === footPxPerFrame` with a WHOLE `ticksPerFrame`, so the only run speeds that
exist are `18 / n` — **18, 9, 6, 4.5**. From today's 9.0 the next one down is 6.0, a **33%** cut.
This is the same wall session 10 hit, from the same request, and it is now hit twice.

Two options were put to the player:

- **A — take the reachable step.** Two integers (`LOCOMOTION_TICKS_PER_FRAME` 2→3,
  `CHASE_TICKS_PER_FRAME` 3→4) plus the authored fps that must move with them. Free, minutes.
- **B — re-cut the three locomotion sheets** at new frame counts so the speed lands near 10%. No new
  art and no money (the clips are on disk), but the foot travel must be **re-measured** on the new
  sheets, and 1–2 hours with a real chance the loop gates fail at a new frame count.

A was chosen deliberately as the cheap probe: ten minutes to find out whether 33% was simply wrong,
rather than arguing arithmetic.

## 🔴 A was built, and it broke the LEVEL — which nobody had predicted as a hard failure

`tests/unit/level-traversal.test.ts` went red on both crossings:

```
the pit between the two floor sections can be crossed with a run-up
  fell or stalled crossing a 288px pit at x 3840; furthest x 4020.525
the spike strip can be cleared with a run-up
  lost 20 hp and reached x 2798 against a 192px strip starting at 2304
```

**Short by roughly 107 px.** The risk had been flagged before the change ("a slower run means you
clear less gap per jump") but as a *possibility*; it is a certainty, and the traversal gate is what
turned it from a guess into a number within one run. **This is the file earning its keep** — a
vertical-apex gate could not see it, and the failure would otherwise have surfaced as an
unplayable level in a playtest.

## The measured ceiling — this is the number worth keeping

Swept with a scratch probe reusing `level-traversal.test.ts`'s own `attempt()`, over the real shipped
`.tmj`, varying `runMax` and scaling every horizontal knob by the same factor `SPEED_SCALE` does:

| `runMax` | vs today | pit (288 px @ 3840) | spikes (192 px @ 2304) |
|---|---|---|---|
| 9.00 | 100% | ✅ | ✅ |
| 8.10 | 90% | ✅ | ✅ |
| **7.80** | **87%** | ✅ | ✅ |
| **7.70** | **86%** | ❌ **falls in** | ✅ |
| 7.20 | 80% | ❌ | ❌ |
| 6.00 | 67% *(option A)* | ❌ | ❌ |

**`level-01` tolerates at most a 13% slowdown, and it is a cliff rather than a slope.** One notch
past 7.80 the jump no longer reaches. The spike strip is the looser of the two constraints (fails at
7.20); **the pit is what binds.**

So the player's instinct was right and A's arithmetic was not: **10% was very nearly the only cut
that fits**, and only B could have reached it.

> ⚠️ **The first sweep reported EVERY row failing, including today's shipped 9.0.** The probe set
> `latchJumpPress` true for one tick and false after, so `jumpCutDivisor: 3` chopped every jump to a
> third of its height. The real harness holds `input.jumpHeld = true` for the whole attempt and
> comments that releasing early *is* the jump cut. **A sweep that fails at the known-good control is
> reporting on the harness, not the subject** — the control row is what caught it, which is the
> argument for always including one.

## Outcome: reverted, and the player accepted the shipped speed

A was reverted in full — six files restored with `git show HEAD:path > path`, never `git checkout`,
and the suite returned to 1134 green. **Nothing was committed.** The player's call on being shown
the 13% ceiling: *"it's still good enough to me."*

**What is now known and must not be re-derived:**

1. Locomotion speed is quantised to `footPxPerFrame / n`. Any request phrased as a percentage has to
   be checked against that set **before** it is agreed to.
2. `level-01` has **13% of headroom** and the binding obstacle is the 288 px pit at x 3840.
3. Anything slower than that is **a level edit**, not a tuning change — which is a different
   decision with a different owner. `level-traversal.test.ts`'s own failure message already says so:
   *"widen the jump only by changing the LEVEL."*
4. The enemy half is cheaper than the player half and was never the blocker: `chase` at
   `18/4 = 4.5` breaks nothing, because no enemy has to clear the pit. If the request ever returns as
   *"the enemies specifically feel fast"*, that half can land alone.

⚠️ **A side effect A would have shipped, recorded so it is priced next time.** The player is cut 33%
and the scavenger 25% — those are the steps that exist, not a choice — so the ratio moves
**0.667 → 0.75** and the ground gained by running drops from 3.0 px/tick to **1.5**. Since aggro is
permanent (session 10), the escape margin is load-bearing, and *any* future slowdown must re-check it
rather than assume it survives.

The scratch probe is not committed. It is reproducible in ten minutes from
`level-traversal.test.ts`'s `attempt()` plus a per-world tuning multiply.

---

# The session-11 QA gate — three owners, two briefs each *(A7)*

Run 2026-08-15 against HEAD `4b305e2`. Three agent owners, brief 1 then brief 2, **brief 1's findings
withheld from brief 2**, fresh agents so nothing carried over. Every finding is applied or recorded
with a reason *(C11)*, and every claim was **re-verified locally** before being acted on — including
one of my own that the checking found overstated.

**Two criteria came back FAIL, and the gate is the only reason either was known.**

## Three real defects in shipped behaviour — all introduced this session

| # | Finding | Disposition |
|---|---|---|
| **B1** | **The attack trigger was one-dimensional.** `Math.abs(playerX - x) <= attackRange`, no `y` term, while every other perception goes through the exported 2-D `withinRadius`. Measured: player 900 px straight up, `dx = 0`, giving 3 swings in 200 ticks, 108 of 200 ticks drawn as `attack`, and a patrol that travelled 50 px instead of 500. Reachable in `level-01` — a solid at `x 6144-6720` sits directly over the scavenger band. | **APPLIED.** Uses `withinRadius`. |
| **B2** | **The same block ran before detection and unconditionally**, so `detectRadius: 0` — documented as *"the AI off-switch several combat fixtures rely on"* — still swung and still dealt damage. | **APPLIED.** Gated on `chasing`, ordered after detection. Costs nothing in play: `detectRadius` 480 is 3.3x `attackRange`. |
| **B3** | **`facing` was written at two sites and only one carried the dead-zone guard.** The swing-commit site was unguarded. Measured at `deadZone: 0`: **144 flips in 300 ticks**. `ENEMY_DEAD_ZONE`'s own docstring says this defect *"has to be prevented rather than detected"* because `setFlipX` restarts nothing and no frame gate can see it. | **APPLIED.** Both sites guarded. |

## The gates that could not go red

| # | Finding | Disposition |
|---|---|---|
| **G1** | **5.4c — `rust-scavenger/attack` had no G5 window at all.** `ATTACK_WINDOWS` held one row, so `attackWindowFor` returned `null`, `runSheetGates` printed `N/A`, and a criterion whose text says *"every attack sheet"* read as satisfied against a table with one entry. Found independently by **both** 5.4c briefs. | **APPLIED — and it FAILED on first run.** See below. |
| **G2** | **5.4d — three mirrors nothing pinned.** `SCAVENGER_ATTACK_TOTAL_TICKS` and the startup/active copies in `sheetGates.mjs`, each carrying a docstring claiming *"pinned equal to the real export by tests/unit/sheet-gates.test.ts"*. **No test pinned any of them.** | **APPLIED.** All three locked in `catalog-timings.test.ts`. |
| **G3** | **5.16's damage clause was vacuous.** The fixture placed the scavenger at patrol `700-1300` against a spawn at `x 400` with `attackRange 144` — unreachable **even alive**, so deleting both death guards left it green. | **APPLIED.** Rewritten to arm a dead scavenger mid-strike on top of the player, **with a live control that must take damage** or the fixture is unreachable geometry again. |
| **G4** | **5.5 — nothing walked `attackIsLive` per tick**, and the closest coverage stopped at the first hit, so it never re-checked recovery. i-frames would swallow a second hit anyway, masking a boundary that stayed live. | **APPLIED.** Full 36-tick walk with named endpoints, plus a whole-swing damage-once assertion. |
| **G5** | **5.11 — the "worst case" was not connected to anything.** The spec hardcoded `DEV_FLEET_COUNT = 20`; `MAX_LEVEL_ENEMIES` appeared **zero times** under `tests/e2e/`. The measured 22 matched the cap by coincidence. The adversarial brief found the sharper half: a level shipping 10 enemies is legal and would make the test measure **30**, a total the production cap forbids. | **APPLIED.** The load is asserted equal to `MAX_LEVEL_ENEMIES`. |
| **G6** | **5.11 — the gate would pass with a fully INVISIBLE fleet, and pass more easily.** `counts()` read body count, a creation-time `isSprite` flag and a POSITION — never `alpha` or `visible` — and a transparent sprite is cheaper to composite, so both ratios come in *lower*. The live trigger is `enemyLayer.ts`'s `setAlpha(... ? 1 : 0.35)`. **This project has shipped this exact shape twice** — grey-box Rectangles standing in for Sprites, and a death fade one frame early that played a whole KO at 35% opacity while the sampler reported every pose painted. Vault 9.4. | **APPLIED.** `counts()` reports `opaque`; the spec asserts it at both ends of the window. **Red-proved**: forcing `setAlpha(0.35)` fails with *"only 0 of the 20 spawned bodies are visible at full alpha"*. |

### G1's consequence: the scavenger's strike was drawn AFTER the damage

Run for the first time, G5 failed against the shipped bytes:

```
FAIL  rust-scavenger/attack  G5  frame 5 (tick 21) misses the active window [14, 20)
                                 — contact is drawn after the strike
```

9 frames over 36 ticks, 4 ticks each; furthest claw extension is **frame 5** (ticks 20-23) and the
window closed at 20. **The player was damaged on ticks 14-19 and the claw reached them on tick 21 —
hit first, drawn second.**

Fixed by moving the **sim** window (`startup` 14 to 18, `recovery` 16 to 12, total still 36) rather
than the art: the art is bought and paid for, the tick counts are free, and 36 must stay divisible by
the sheet's 9 frames. The window is now **centred** on the drawn strike, three ticks of margin either
side. `activeFrames` moves from `[3,4]` to `[4,5]`.

> WARNING — **that retune moved the only window in which this creature can hurt anything, and not one
> test in the suite went red.** The mirror locks (G2) and the shipped-bytes G5 case now both catch
> it, verified by mutation: reverting `startup` to 14 turns exactly those two red, by name.

## Findings applied beyond the FAIL criteria

| # | Finding | Disposition |
|---|---|---|
| **S1** | **`attackIsLive` restated the hit window inline** — six lines below its own comment warning that *"two copies of `counter >= startup && counter < startup + active` would be two definitions that happen to match today"*. It then wrote that expression. | **APPLIED.** Calls `hitWindowOpen`, which is what G5 measures the art against. |
| **S2** | **The `deadZone` knob had a floor and no ceiling.** Five presses past `attackRange` and the gait key flaps: **132 animation restarts in 300 ticks**, measured, with every gate green. | **APPLIED**, per user decision 2026-08-15. `createScavenger` throws on `deadZone >= attackRange` and the knob caps below it — the same shape as the sentry cooldown floor. **Stated limitation: this makes the flap unreachable rather than removing it.** Hysteresis would remove it at source and was declined, because it re-adds the machinery this phase deliberately deleted when aggro became permanent. |
| **S3** | **`behaviourSignature` never measured `facing`**, so the sweep could not see a knob whose entire job is to stop the sprite mirroring. | **APPLIED.** Flips are counted. |
| **S4** | **The knob sweep went blind to `deadZone`** the moment S2's invariant landed — inside the band a swing plants the feet, so the dead zone's effect on travel is masked by construction. Measured **identical to the pixel** at `deadZone` 0, 96 and 143 across all three retreating placements. | **APPLIED.** A fourth placement, `stand`, with the retreat removed — which the file's own `RETREAT` docstring had predicted needing. **Second time a sim change silently cost this sweep its sensitivity, and it reported the knob dead rather than itself blind.** |
| **S5** | **The 5.12 justification table was stale by up to 32 lines**, on rows written one session earlier — and `motion.mjs`'s whole justification was a trim since undone by more than it recovered. | **APPLIED.** The table below is freshly measured. |
| **S6** | **The 7-to-8 ceiling raise leaned on a removable obstacle.** `motionCombat.mjs` "could not" be split because it imported `poseSpan` from `motion.mjs`, closing a cycle. `poseSpan` is a dependency-free string builder. | **APPLIED — the raise is undone by doing the work.** `poseSpan` moved to the leaf `motionClauses.mjs`; **the cycle is gone entirely**, verified by importing `motionCombat.mjs` first — the order that used to truncate — and reading a complete 17-entry table. The file then split per subject. **Every motion record was hashed before and after: byte-identical.** |
| **S7** | Two stale claims in `phase-05-perf.spec.ts`'s blind-spot header: *"none of these are closable without a new dependency"* one line above the one closed with none, and *"nothing in the level format caps concurrent enemies"* after a cap was added. | **APPLIED.** Both corrected in place, struck through rather than deleted. |

## Recorded, not fixed — with the reason *(C11)*

| # | Finding | Why not fixed |
|---|---|---|
| **R1** | **5.3's own flap test cannot go red for any input.** `chasing` has no clearing path inside `stepScavenger`, so `changes <= 1` is a theorem about the code, not a measurement — and its only red-proof is a source mutation, which the file's own docstring admits. | Real, and the fix is a design question rather than an edit: making it input-falsifiable means driving death and respawn through `tick`. **Recorded as open.** The property it asserts is still true; what is false is the claim that the test proves it. |
| **R2** | **The 5.12 ceiling is a count, not a set** — it cannot see one file leaving the list while another joins, and "named in a QA log" is a substring match that pre-approves roughly 48 files already cited for other reasons. | Both true. A membership-set gate is a different design and a bigger change than this gate should absorb mid-QA. **Recorded as the known ceiling of what a line-count test can do**, which its own header already says. |
| **R3** | **Glob blind spots**: root configs, `tools/**/*.d.mts`, `src/**/*.mjs`, `.mts`/`.tsx`. The sanity check (`SOURCES > 30`) is satisfied by one glob alone, so it would not notice. | Re-verified: still nothing near the limit. **Recorded** — finding S8's judgement re-checked rather than assumed to still hold. |
| **R4** | **The frame-0 e2e gate samples a patroller that cannot flap**, and its assertion (`distinctFrames > 1`) is weaker than its title — a walk pinned to frames 0 and 1 passes on a 12-frame sheet. | Real. Left for the phase's own e2e pass rather than edited mid-gate; **recorded with the exact weakness named** so it is not re-derived. |
| **R5** | **`releaseAggro` does not clear `attackCounter`.** A scavenger mid-swing when the player dies carries the window through respawn. | Harmless today only because the respawn point is distant — which is a coincidence, not a design. **Recorded as open.** |
| **R6** | **`attackRange` and `attackCooldown` have no Gym knob**, so the phase's newest mechanic has zero tunability and the 5.9 sweep cannot report them either way. | Real scope gap. Adding knobs mid-gate changes the very surface the sweep measures. **Recorded for the next tuning pass.** |
| **R7** | **5.16 is vacuous for the SENTRY** — it never had a contact-damage mechanic, so "the dead sentry deals no contact damage" is unfalsifiable for one of the two entities it names. | Vault 5.5's shape: a measurement of exactly zero where the branch does not exist. Addressed by the criterion wording change rather than by a test that cannot fail. |
| **R8** | **A7 is structurally compromised for 5.12, permanently.** Brief 1's findings are quoted **verbatim inside `file-size.test.ts`** — the file brief 2 was sent to attack. A second reviewer cannot read it without reading the first's conclusions, and the rule exists precisely because *"a second pass that has read the first one confirms it instead of attacking it."* | **Cannot be fixed without deleting the institutional knowledge those comments carry**, which is the failure mode the same file names first. Recorded as a standing limitation of gating a file that documents its own audit history. **Found by the agent, not by me** — and arguably the most valuable finding of the six reviews, because it is about the process rather than the code. |

## The size table, FRESHLY MEASURED — 7 files over 400

Measured at the end of the gate, not quoted from the previous session. That is S5's whole lesson.

> ⚠️ **This table read "9 files" and listed two that were no longer on it, until the end of the
> session.** `src/sim/enemyScavenger.ts` (464) and `tests/unit/enemy-tuning.test.ts` (401) were split
> after it was written, and it was not re-measured. **S5's own finding, repeated inside the section
> that records S5.** Re-measured against the tree, not against this file.

| lines | path | justification |
|---|---|---|
| 727 | `tests/unit/enemy-ai.test.ts` | The AI's whole behavioural surface; split once already into `enemy-view` and `enemy-health-bar`. |
| 517 | `src/scenes/GameScene.ts` | Phase 4 debt, recorded there. |
| **486** | **`src/sim/player.ts`** | Tuning, the state machine and `toWorld` — the locomotion quantisation record lives here, and now the airborne-window reversal below it. **446 → 486 this session.** |
| 468 | `src/sim/combat.ts` | The combat contract and its documented windows. |
| **436** | **`tools/gen/motion.mjs`** | Mostly literal prompt text; **shortening it changes the generated art.** `poseSpan` left it this session (S6). |
| 407 | `tests/e2e/phase-04-assets.spec.ts` | Phase 4, recorded there. |
| 402 | `tests/unit/sheet-packing.test.ts` | Phase 4, recorded there. |

**No longer over 400, and the ceiling stayed at 7 because of it:** `src/sim/enemyScavenger.ts` 464 →
313, `tests/unit/enemy-tuning.test.ts` 401 → split to `enemy-constructor-guards.test.ts`. The
airborne-window record was kept to a **pointer** in `tilemap-data.test.ts` and `anim-timing.test.ts`,
with the one full copy in `foot-plant.test.ts`, for the same reason: three copies of one explanation
pushed `tilemap-data.test.ts` to 420 and the honest fix was to stop restating it, not to raise the
ceiling.

**Split this session rather than justified:** `tests/unit/tick-world-damage.test.ts` 479 to **352**,
with the claw window moving to `tests/unit/scavenger-claw.test.ts` (160) on the criterion seam; and
`tools/gen/motionCombat.mjs` 426 to **264**, with the scavenger's five records moving to
`tools/gen/motionCombatScavenger.mjs` (195) per subject. Neither is a `-helpers` module that one file
imports, which `file-size.test.ts` names as the way to game this gate.

---

## The airborne window doubled — a REVERSAL, 2026-08-15

The user played the shipped build and asked for one change: *"maybe it's slowing down when I fall or
when I jump, so I can see the animation more easily."* At the shipped tune `jump` ran at **20 fps**
and `fall` at **30 fps**, over an 18-tick rise and an 18-tick fall. Nine drawn frames of `fall`
crossed the screen in 0.3 s.

**What changed, and it is two knobs only:**

| knob | was | now |
|---|---|---|
| `gravity` | 2.7 | **0.675** |
| `jumpVelocity` | 48.6 | **24.3** |
| `maxFallSpeed` | 51.6 | **51.6 — deliberately unchanged** |

Consequences, all measured rather than predicted:

| | was | now |
|---|---|---|
| rise / fall / airtime, ticks | 18 / 18 / 37 | **36 / 36 / 73** |
| `jump` fps (derived, vault 4.22) | 20 | **10** |
| `fall` fps (derived) | 30 | **15** |
| continuous apex `v²/2g`, px | 437.4 | **437.4 — identical** |
| `apexPx` as the discrete sim measures it | 461.7 | **449.5** |
| apex in body heights | 1.60 | **1.56** |

### Why this is a reversal and not a tweak

`tests/unit/foot-plant.test.ts` carried an explicit guard titled *"leaves every VERTICAL knob
untouched, so the tick contract is not a locomotion casualty"*, and `tilemap-data.test.ts` carried
the matching note that *"`tick.ts`'s numbered order is declared authoritative and Phase 5's combat
windows are written against it, so airtime is not a free variable."*

**That stated reason was wrong about what it protected.** The tick contract fixes the ORDER of the
fourteen steps. It says nothing about how many ticks a jump lasts, and every combat window —
`SCAVENGER_ATTACK` 18/6/12, `HURT_LOCK_TICKS`, `IFRAME_TICKS` — is an independent integer that reads
no vertical knob. Nothing downstream of the tick contract moved.

What the guard was *actually* for was collateral damage: session 10 retuned every horizontal knob to
plant the feet, and froze the six vertical knobs as a tripwire so a locomotion fix could not drag the
jump along unnoticed. That purpose is preserved — the four knobs the locomotion retune must not touch
are still frozen, and the two that moved are now held to the **relationship** that made the move safe
(`v²/2g` = 437.4) instead of to a literal. `gravity` and `jumpVelocity` can be re-scaled together
again without editing a test, and cannot be moved apart without failing one.

### Why 36 and not some other number

`simTicks % frameCount === 0` must hold for both one-shot rows. `jump` is 6 drawn frames and `fall`
is 9, so the window must be a whole multiple of 18. 18 → 36 is the next step up, and it is the only
one reachable without re-cutting either sheet.

### Why `maxFallSpeed` was left out of the rescale

Halving it to 25.8 would have weakened `tests/unit/tick-world-damage.test.ts`'s tunnelling fixture,
which is a gate. **Never loosen a gate to make a change fit.** The accepted consequence is that the
`maxFallSpeed / jumpVelocity` ratio doubled: a fall now takes 77 ticks to reach the clamp instead of
20. That is a real feel change, and it is the one the user asked for.

### Four fixtures that broke, all with the SAME root cause

Every one of them was sized for the old gravity and could no longer reach the state it measures.
None was a defect in the change; each was a measuring instrument that had a constant baked into it.

| fixture | what it could no longer reach | fix |
|---|---|---|
| `knob-sweep.test.ts`, `maxFallSpeed` | the clamp — the knob went **dead in the sweep** | `TALL_WORLD` `heightPx` 8000, `longFall` 26 → 100 ticks, `FLOOR_ONLY` y 6000 |
| `tick-world-damage.test.ts` tunnelling probe | enough speed to tunnel | `TALL` bounds 4000, 60 → 90 ticks, both worlds |
| `derived.ts` `DEEP_FALL` | terminal velocity — reported **49.95 against a 51.6 knob** | `DEEP_BOUNDS` `heightPx` 9000 alongside the floor |
| `coyote-time.test.ts` buffered jump | the buffer window before touchdown | the landing tick is now **measured on a probe world**, not derived from geometry |

> 🔴 **The recurring shape, named once.** In three of the four the floor was not the constraint — the
> **KILL PLANE** was. `createWorld` defaults `bounds` to the grey-box 1080 px extent *whatever
> `solids` says*, so a fixture that moves its floor to y 4000 and says nothing about bounds is still
> killing the player at 1080. At `gravity` 2.7 that was invisible because every window was short
> enough. At 0.675 three separate fixtures were caught measuring the world's height instead of the
> tuning. **A fixture that injects `solids` for depth must inject `bounds` too.**

> ⚠️ **And one repair that looked right and was not.** `coyote-time.test.ts`'s first fix derived the
> press moment from the trajectory: `distance-to-floor <= vy × (jumpBufferTicks - 1)`. It has to name
> a floor, and `player.y` is the FEET while the surface the player lands on in that fixture is not
> `GREY_BOX_SOLIDS[0]`. It silently never fired and the test stayed red. Measuring the landing tick
> on an identical throwaway world knows nothing about gravity, floors or spawn heights, so it cannot
> drift from them again — and `ticksToLand()`, ten lines above in the same file, was already doing
> exactly that.

### Red-proofs *(C1, C12)*

| gate | mutation | observed |
|---|---|---|
| apex relationship | `jumpVelocity` 24.3 → 24.0 alone | `holds jump APEX…` fails, *expected 426.67 to be close to 437.4* |
| `maxFallSpeed` exclusion | the same mutation | `records that maxFallSpeed was deliberately left out…` fails, 2.15 vs 2.123 |
| buffered-jump tick semantics | `toBe(landedAt + 1)` → `toBe(landedAt)` | fails, *expected 27 to be 26* — it still tells touchdown from the tick after |
| `DEEP_FALL` depth | *(observed before the fix, not staged)* | `terminalFallSpeed` read 49.95 against 51.6 |

Both mutations verified applied by content-changed **and** original count dropped by one, and both
restored with `cmp` byte-identical against a backup taken immediately before that mutation.

### Traversal re-checked before anything else

Level 01 is still crossable and the standing hop still cannot clear the pit — the same two facts that
vetoed the 33 % locomotion slowdown earlier in this session. Verified before the fixtures were
touched, because a change that breaks the level is not worth repairing tests for.

### Full sweep

`typecheck` clean · **1146 unit tests pass** · `test:sim-isolated` **1146 pass** with Phaser
uninstalled, reinstalled at `4.2.1` exact · `build` + `verify-dist` ok · **e2e 49 passed** · port
5173 clear *(C13)*.
