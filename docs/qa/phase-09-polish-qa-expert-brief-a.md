# Phase 9 QA gate - qa-expert BRIEF A (checklist pass) - criteria 9.4 and 9.7

Worktree agent-a865674a3f7beb34f, synced to 8e94016. Tree clean before and after; no repo file was
modified (Bash writes to the repo are blocked by policy here and no Edit tool was available, so the
9.4 red proof was run against an isolated copy in the scratchpad - see "Method").

## Verdict

| # | Criterion | Verdict |
|---|---|---|
| 9.4 | A fade force-settles its end value on stop as well as complete | **PASS** (VERIFIED, red proof executed both directions) |
| 9.7 | Every gate's threshold pinned as a literal, with fixtures both sides | **PASS** - construction fully verified; the e2e fixture arms were read, not executed (Playwright barred by the dispatch) |

Findings: **0 blocker / 0 high / 1 medium / 5 low / 2 informational.**

## Method

- npx vitest run in the worktree: PASS (2073) FAIL (0) - greenness read positively, with the count.
- npx tsc --noEmit: TypeScript: No errors found.
- Phaser behaviour answered from the installed phaser@4.2.1 source under node_modules/phaser/src/
  (the worktree has no node_modules; a junction was created for it), never from memory.
- No Playwright command was run.

---

# 9.4 - PASS

## Does Phaser write the end value? (answered from source, not memory)

- **stop() writes nothing.** node_modules/phaser/src/tweens/tween/BaseTween.js:507-517 - stop()
  dispatches TWEEN_STOP/onStop and calls setPendingRemoveState(). No target property is touched.
  The phase's claim is correct for this path. **VERIFIED.**
- **onCompleteHandler writes nothing** either: BaseTween.js:397-402 sets pending-remove and
  dispatches. So tween.complete() (BaseTween.js:420-435) called mid-flight also leaves the target
  wherever it was. **VERIFIED.**
- **But NATURAL completion does write it** - TweenData.js:305-323, `target[key] = this.start +
  ((this.end - this.start) * v)` with v = ease(1) = 1, executed *before* the complete dispatch.

## 9.4 findings

**F1 - LOW (VERIFIED). The docstring overstates the claim by one path.**
src/scenes/hudGearPop.ts:73-76 and src/scenes/hudFade.ts:153-155 both say Phaser writes the end value
in "neither onStop nor onComplete". True of stop() and of an explicit tween.complete(); **false of
natural completion** for a numeric property (TweenData.js:323). This does not change the code - and
it is worth being precise about why: for hudGearPop the onComplete settle is still load-bearing,
because Phaser never clears a tint, and settle()'s clearTint() (hudGearPop.ts:80-82) is the part
natural completion cannot do. Recommend one sentence, not a code change.

**F2 - LOW (VERIFIED). There are THREE exits, not two.**
hudGearPop.ts:76 says "the two exits are different code paths in Phaser". The third is
BaseTween.destroy() (BaseTween.js:859-876), which nulls this.callbacks and dispatches nothing - and it
is the scene-teardown path: TweenManager.shutdown() -> killAll() -> tween.destroy()
(TweenManager.js:1130-1132, 1032-1038). So on scene shutdown **no settle runs at all**. Unobservable
today, because both settle targets are destroyed by that same shutdown, but the docstring should not
be read as an exhaustive list.

**F3 - MEDIUM (VERIFIED). The one HUD tween that does neither is eleven lines from the one this
phase added.** src/scenes/UIScene.ts:360-371 - the gear-collect flyer tween is **untracked** (no
handle held) and carries **onComplete only**. Its cleanup, flyer.destroy() (UIScene.ts:370), lives
inside onComplete, so any path that stops rather than completes it leaves an orphan flyer stranded
mid-flight at alpha ~0.5. It is **pre-existing** (outside main...HEAD) and unobservable today -
nothing in the codebase stops it, and shutdown destroys the display list - so it does not fail 9.4,
whose subject is the tweens this phase adds. Recorded because it is the exact shape 9.3 and 9.4 exist
to remove, in the file this phase edited, and it is where the next instance of this bug lands.

**F4 - INFORMATIONAL (VERIFIED). No WeakMap<Scene, ...> is needed, and its absence is safe.**
State is keyed on the Scene instance (UIScene.ts:128, `private gearPop?: GearPop`), which does survive
a scene.restart(). It is safe anyway because applyLayout() **unconditionally destroys and re-attaches**
on every call - UIScene.ts:265 this.gearPop?.destroy(), :266 new scale, :267 re-attach - and create()
reaches it via build() (UIScene.ts:134-135, :245). The ordering is also right: the old handle settles
to the OLD baseScale before line 266 writes the new one. A stale handle's stop() is a guarded no-op
(BaseTween.js:509 tests !this.isDestroyed()), and the settle() branch in destroy()
(hudGearPop.ts:117-119) is not taken because stopRunning() returns non-null - so nothing writes to a
destroyed icon.

## Is the settle present in both callbacks, on every tween this phase adds or changes?

**Yes - all three.** src/scenes/hudFade.ts:169-176 (fade), :179-187 (lines),
src/scenes/hudGearPop.ts:102-111 (pop). Each holds its handle and stops by handle
(hudFade.ts:198-199, hudGearPop.ts:86-91); hudFade's throw-guard comment about ordering
tweens-before-destroy is preserved (:193-197). The two other tweens in src/ - goalLayer.ts:175 and
UIScene.ts:360 - are **untouched by this phase**; UIScene.ts:360 is F3.

## Red proof - EXECUTED, both directions

Isolated harness (a copy of src/ plus the spec, imports rewritten) so no repo file was touched.
Baseline: Tests 6 passed (6).

Mutation 1 - delete `onStop: settle,` from hudGearPop.ts:109. Occurrence count 1 -> 0, onComplete
left intact. Result:

```
 Test Files  1 failed (1)
      Tests  3 failed | 3 passed (6)
 FAIL  hudGearPop > stopped mid-pop settles to baseScale and clears the tint
 FAIL  hudGearPop > a second pop stops the first, and the icon is back at baseScale before the second config is read
 FAIL  hudGearPop > destroy() stops the running tween and settles, and is safe to call twice
```

Mutation 2 - delete `onComplete: settle,` instead. Result:

```
      Tests  1 failed | 5 passed (6)
 FAIL  hudGearPop > run to completion settles to the same end state
```

Reverted; Tests 6 passed (6), exit 0 (C12). Redness read positively from the "Tests N failed" line
plus named specs, driven from the shell. The **stop** path specifically is covered by three separate
tests, and the subject is the right one: the gear icon survives its own tween (hudGearPop.ts:11-18),
unlike hudFade's targets.

---

# 9.7 - PASS

Every threshold the phase introduces, against vault 9.2's four parts: (1) picked from what is
correct, (2) fixtures both sides, (3) the fixture calls the REAL gate, (4) pinned as a literal in its
own assertion.

| threshold | 1 | 2 - fixtures both sides | 3 | 4 - the literal |
|---|---|---|---|---|
| HITSTOP_TICKS .light 4 / .lethal 9 / .playerHurt 6 (src/sim/hitstop.ts:46-50) | yes, :36-38 | yes - frozen through N, moves at N+1: hitstop.test.ts:48-49, :130-140, :167-172, :212-222 | yes - real freezePair/frozen over full-world tick loops | yes - hitstop.test.ts:36-38, and again e2e at phase-09-polish.spec.ts:160 |
| SHAKE durationTicks 4/7/8/3 and ax/ay (screenShake.ts:73-78) | yes - 7x-62x under Phaser's 0.05, arithmetic checked | yes - shakeSettled false at N-1, true at N and N+1 (screen-shake.test.ts:215-224) | yes - the e2e spec imports the SAME shakeWithinEnvelope/shakeOffset (phase-09-polish.spec.ts:248, :265) | yes - whole table toEqual at screen-shake.test.ts:47-52 |
| shakeEnergy decay curve | yes | yes - peak at t0, >0 at N-1, exactly 0 at N and N+1 (:120-123) | yes | **yes, now** - absolute literals at screen-shake.test.ts:150-159 plus equal-successive-differences at :145-147. The brief's "already shipped one" (a fixture computed by the function under test) is CLOSED; :134-139 records it |
| shakeStartTick offsets | yes - screenShake.ts:104-113 | yes - exact tick, plus the e2e zero window | yes | yes - screen-shake.test.ts:76-79 asserts the derived form AND 104/109 |
| EFFECT_DEPTH 10.1/10.2/10.3 (effects.ts:35-39) | yes - batch-handler argument :20-27 | band both sides >10 and <11 (effects.test.ts:55-65), distinctness :67-69, spec identity :71-75, and the DRAWN side at phase-09-polish.spec.ts:298-311 | yes - drawn depth off __phaserGame; source-text guard at effects-draw-path.test.ts:55-66 | band literals 10/11. See F9 |
| EFFECT_PEAK_ALIVE 96 (effects.ts:160) | yes - sum of caps; atLimit() drops | sum-identity plus per-emitter caps | yes | yes - effects.test.ts:79-89 (toBe(96), 32/48/16) |
| DUST_MIN_FALL_PX 9 (effects.ts:199) | yes | **yes, and the "on" side DRAWS** - null at 8 and 8.999, non-null at 9 with count > 0 (effects.test.ts:187-198) | yes - real landingDust | yes - toBe(9) at :188; ramp pinned :219-233 |
| DUST_MAX_COUNT 14 / DUST_PER_PX 1.6 | yes | cap reached from below: at(17) < 14, at(18) === 14 (:232-233) | yes | yes - :219-223, :240-246 |
| SPARK_CONE_DEG 50/90/50, SPARK_COUNT 10/18/12, SPARK_CORE_SHARE 0.6 | yes | yes - split pinned so neither side can collapse (effects.test.ts:291-304) | yes | yes - :270-275, :286-289, :296-298 |
| DEATH_STEAM_COUNT 14 / HURT_VENT_COUNT 6 | yes | BOTH sides pinned, not just a < b (effects.test.ts:320-328) | yes | yes |
| ATTACK_CONTACT_FRAME_INDEX 4 (spriteFeedback.ts:48) | measured 2026-08-20, stated as such | bounded by the SHIPPED catalog frameCount via ?raw (sprite-feedback.test.ts:59-61, :297-304) | yes - the same constant gamePlayerDraw.ts:81-82 consumes | yes - toBe(4) at :294 |
| i-frame flicker 6 / 3 on / floor 0.35 (spriteFeedback.ts:193-197) | yes - never 0, alpha-0 blocker argument | yes - every phase boundary and both sides of the window close (sprite-feedback.test.ts:239-271) | yes - real iframeAlpha with the sim's IFRAME_TICKS | yes - :240-247, :252-257 |
| LAND_SQUASH_TICKS 3 / LAND_SQUASH_SX 1.18 | yes | yes - >1 at t=2, exactly {1,1} at t=3 and 4 (sprite-feedback.test.ts:195-201) | yes | yes - :206-208 |
| FLINCH_RETURN_TICKS 6 / FLINCH_LIFT 0.25 | yes | yes - not-neutral at +5, neutral at +6 (:104-105) | yes | yes - :98-100, dy included |
| POP_TICKS 7 (hudGearPop.ts:45) | yes | n/a - a duration, not a threshold; the settle has both sides, proven red above | yes | yes - hud-gear-pop.test.ts:171-172 |
| MAX_EFFECT_FRAME_WORK_MS 2.5 (effectBudget.ts:140) | **yes** - 16.67/6 = 2.78 -> 2.5, arithmetic checked; selection set 0.5/0.5/0.6 plus a held-out set, both in the QA log | committed PERF_MUTATION=storm8192 / scale0 / fleetscale0 (effectMutation.ts:22-30) | **yes** - the shipped emitters via EffectAttachment.emitters() (effectMutation.ts:32-38), never a stand-up emitter | yes - phase-09-perf.spec.ts:348-352 |
| MAX_EFFECT_FRAME_P95_MS 16 | yes - one whole 60 Hz frame, explicitly NOT tuned to the observation | as above | yes | yes - :379-384 |
| MAX_EFFECT_WORK_DELTA_MS 0.3 | yes - 0.003 x 96 = 0.288 -> next clock step 0.3; checked | as above | yes | yes - :353-355 |
| MAX_PER_PARTICLE_WORK_MS 0.003 | yes - 16.67 x 2% / 96 = 0.0035 -> 0.003; checked | as above | yes | yes - :356-358 |
| MIN_STORM_WORK_DELTA_MS / MIN_HALF_STORM_WORK_DELTA_MS 0.2 | yes - two clock steps against a five-step and a two-step observed gap | premise checks; can false-red, and the docstrings say so | yes | yes - :295-300, :315-324 |
| MAX_LINEARITY_SPREAD 4 | yes - inherited reasoning | yes | yes | yes - :335-341. See F7 |
| MIN_DRAWN_AT_PEAK 64 (effectBudget.ts:273) | yes - two-thirds of 96, between "broken draws 0" and "working draws 96" | yes - off.drawn === 0 / on.drawn >= 64 in one run, plus scale0 and particlescale0 taking drawn to 0 by two routes (phase-09-draw.spec.ts:167-179) | yes | yes |
| CLOCK_GRID_MS 0.1 | instrument resolution, argued at effectBudget.ts:70-92 | n/a | quantises the ordering check, phase-09-perf.spec.ts:280 | yes |
| ?hitstop=0 - the 9.1 arm-B fixture | n/a | **both arms, same page, same build** - plateau present at scale 1, absent at scale 0 (phase-09-polish.spec.ts:146-171) | yes - real hitstopScaleFromSearch, with its own both-sides unit gate (level-pick.test.ts: 0/1/3 accepted; fractional, negative, NaN, Infinity, absent -> 1) | yes - toBe(6) at :160 |

## 9.7 findings

**F5 - LOW (VERIFIED). A docstring figure that does not follow from the pair it names.**
src/render/screenShake.ts:88-93: "playerHurt (0.004, 0.007) must outrank light (0.003, 0.001) ... and
it does on this one by 2.55x (0.008062 / 0.003162). On max(ax, ay) it would be 1.4x". Computed: hypot
ratio playerHurt/light = **2.550** (correct); max ratio playerHurt/light = **2.333**, not 1.4. The
figure 1.400 is playerHurt/**lethal** on max. So the sentence argues for the euclidean metric using a
number taken from a different pair. The design choice is fine and nothing asserts either number -
this is prose one line below the constants a retune would touch. Fix the number or name the pair.

**F6 - LOW (VERIFIED). A test constant that duplicates a sim knob while claiming not to.**
tests/unit/effects.test.ts:52 - `const MAX_FALL = 51.6;`, commented "The sim's own terminal velocity.
Landing dust is expressed against it, not an invented number." It is a **hard-coded copy** of
src/sim/playerTuning.ts:252's `maxFallSpeed: 51.6`, not an import. Every landingDust ramp literal
(effects.test.ts:219-233, :240-246) is pinned against that copy, and maxFallSpeed is a swept knob
(A6). Retune it and this gate keeps passing against a terminal velocity the game no longer has -
vault 5.3's "two definitions that agree on the happy path". One import closes it.

**F7 - LOW (VERIFIED). MAX_LINEARITY_SPREAD is declared twice, 4 and 4.**
tests/e2e/effectBudget.ts:264 and tests/e2e/phase-08-gate-perf.spec.ts:129. The new one says it takes
the old one's "reason verbatim" but does not import its value. Same class as F6, lower stakes.

**F8 - LOW (INFERRED). The one place this phase can report a stale green.**
tests/unit/effects-draw-path.test.ts:37-41 reads src/scenes/gameEffects.ts through
import.meta.glob(..., { query: '?raw' }). Red-proving its setDepth guard (:59-66) means editing
gameEffects.ts - i.e. mutating a ?raw glob fixture, which is exactly the Phase-9 trap "Vitest caches
?raw glob fixtures: touch the test AND its fixture before re-running". The file carries no such note,
and it is the file whose own header records setDepth(13) passing 2051 green tests. **INFERRED** - I
did not reproduce a stale green for a .ts glob; the recorded instance was a .tmj. One comment line.

**F9 - INFORMATIONAL.** EFFECT_DEPTH's three values are pinned as a **band** (>10 and <11) plus
distinctness plus spec-identity, not as three separate literals. That is the right shape - the band
is the claim, and the identity pass at phase-09-polish.spec.ts:307-311 ties each drawn depth to its
own entry. Recorded so nobody "tightens" it into three literals and loses the band's meaning.

## The rest of brief A's checklist

- **Mutation redness detected positively.** tests/e2e/effectMutation.ts:22-30: the four proofs are one
  shell variable each, and namedMutation THROWS on anything else - "a proof that silently did not run
  is worse than no proof, because it comes with a green suite as evidence". The QA log states the same
  rule for the unit loops (docs/qa/phase-09-polish.md:104-106). VERIFIED by source; the e2e loops
  themselves I did not execute.
- **No waitForTimeout.** None in any file in main...HEAD. The single repo-wide instance is
  tests/e2e/phase-08-progress.spec.ts:122, OUTSIDE this phase's diff. Waits are on
  window.__game.ready (bootToGame) and on positive conditions computed from the tick series
  (phase-09-polish.spec.ts:9-10, polishSeries.ts's waitFor).
- **Type before value.** phase-09-polish.spec.ts:150-152, :188-190, :235, :246, :299;
  phase-09-draw.spec.ts:152-156. VERIFIED.
- **Timing claims assert WHICH TICK.** phase-09-polish.spec.ts:153-161 - six frozen ticks as a COUNT,
  then x must move again at exactly T0+7; screen-shake.test.ts:76-79 - shakeStartTick as the derived
  expression AND as 104/109; every window boundary in hitstop.test.ts, sprite-feedback.test.ts and
  screen-shake.test.ts is asserted at N-1 / N / N+1. VERIFIED.
- **The phase's own recorded blind spots** (docs/qa/phase-09-polish.md:245-281) are consistent with
  what I found: the shipped particle configuration sits below the measurement floor and is covered by
  amplification only, and batch-flush counts are argued rather than measured.

## What this brief did NOT verify

1. Any Playwright execution - barred by the dispatch. The e2e bounds' CONSTRUCTION is verified; their
   REDNESS is not re-verified by me.
2. docs/qa/phase-09-polish.md:112 records T5 (scene wiring, tweens, gear pop) as "pending its fix
   round" in the integrator's own re-mutation column, and no later row supersedes it. My red proof
   above covers the gear-pop settle specifically; the rest of T5 is not mine.

---

# Disposition of F1–F9 — added 2026-08-23, on recovery

⚠️ **This report was never applied.** It was found as an untracked file in an abandoned agent
worktree (`agent-a865674a3f7beb34f`) during a branch cleanup, three days after it was written. That
is a *(C11)* violation with a mechanical cause worth naming: **a worktree agent's deliverable is not
in the repository unless somebody copies it out**, and nothing in the dispatch checked. The report
itself is more than findings — it is the **re-run against the fix** that `phase-09-polish.md`'s 9.4
and 9.7 rows record as never having happened, and it passes both.

| # | Sev | Status 2026-08-23 | Evidence |
|---|---|---|---|
| F1 | LOW | **Already fixed** | `hudGearPop.ts:76` and `hudFade.ts:162` both now open *"An earlier version of this comment said Phaser writes the end value in neither…"* — corrected independently. |
| F2 | LOW | **Already fixed** | `hudGearPop.ts:87` now carries the third exit explicitly: *"`destroy()` runs neither callback."* |
| F3 | MEDIUM | **Already fixed** | The untracked `UIScene` flyer tween is gone — the flyers moved to `hudGearFlyers` with a real teardown, closing inventory 3.7 in the tiers session. |
| F4 | INFO | No action | Records why the absence of a `WeakMap` is safe. Nothing to change. |
| F5 | LOW | **Already fixed** | The `1.4x` figure is no longer in `screenShake.ts` — the prose was rewritten during the shake work. |
| F6 | LOW | **APPLIED, and the finding was WRONG about its own consequence** | See below. |
| F7 | LOW | **Already fixed** | `MAX_LINEARITY_SPREAD` no longer exists as a declaration; `effectSweep.ts` references it only historically. |
| F8 | LOW | **APPLIED** | `effects-draw-path.test.ts` now carries the `?raw` cache warning above its glob. Its mutations edit `gameEffects.ts`, which is this gate's own fixture. |
| F9 | INFO | No action | Records the depth band as deliberately a band. |

## F6 — applied, and its stated consequence measured false

The finding: `effects.test.ts`'s `const MAX_FALL = 51.6` is a hard-coded copy of `playerTuning.ts`'s
swept `maxFallSpeed` *(A6)*. **True.** Its prediction — *"retune it and this gate keeps passing
against a terminal velocity the game no longer has"* — was **measured rather than accepted**:

| | `effects.test.ts` |
|---|---|
| `maxFallSpeed: 51.6 → 40.0`, copy in place | **30 passed / 0 failed** |
| the same mutation, after importing `DEFAULT_TUNING.maxFallSpeed` | **31 passed / 0 failed** |

**The import closes nothing**, because `landingDust`'s `maxFall` only *clamps* `|impactVy|` and the
ramp saturates at `DUST_MAX_COUNT` by `fall = 18`. Every ramp literal in the file is an **absolute**
vy in px/frame far below that clamp, so no `maxFall` above 18 can move one. F6's prescription
(*"one import closes it"*) would have shipped a fix that changes nothing and a note claiming it did —
which is worse than the duplication, because it retires the question.

**What was actually open** is the invariant the copied literal was hiding: *the clamp must stay above
the ramp's saturation point*, or every absolute-vy literal in the file starts measuring the clamp
instead of the ramp. Nothing asserted it. A gate now does, with the saturation point **derived from
the shipped function** rather than from its private constants, so a ramp retune moves it too.

Watched red, per *(C1)*, with the mutation the gate's own claim names:

```
maxFallSpeed: 51.6 → 15.0
AssertionError: maxFallSpeed is 15, at or below the 18 px/frame at which landing dust saturates.
  The clamp is no longer inert, so the absolute-vy literals in this file are measuring the clamp
  instead of the ramp.: expected 15 to be greater than 18
```

Reverted; `git diff src/sim/playerTuning.ts` empty, **PASS (31) FAIL (0)**.

Three definitions of the number became one anyway — the import was kept, and a stray third `51.6`
inside the ramp test's own body was folded into it.
