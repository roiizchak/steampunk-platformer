[← Phase 9 QA log index](phase-09-polish.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-09-polish.md)

### Corrections to this phase's own predicates, from the same round

36. **`?hitstop=<large safe integer>` froze the game forever, and the predicate's comment claimed
    otherwise.** `Number.isSafeInteger` narrowed entry 19's hole; it did not close it.
    `?hitstop=9007199254740991` was accepted, produced a perfectly **finite** deadline of 3.6 × 10¹⁶
    ticks — about 19 million years at 60 Hz — and the body never moved again. Dying does not release
    it: `combatCounter` is frozen too, so `deathWindowClosed` never becomes true. An overflow guard
    cannot see this because nothing overflows. `MAX_HITSTOP_SCALE` closes it and the comment now says
    what it does *(C9)*.
37. **`impactOf` was keyed on the UNSCALED freeze table, so `?hitstop=N` for N ≥ 2 deleted every
    effect.** `freezePair` writes `tickCount + HITSTOP_TICKS[i] * scale`, so at scale 2 the key asked
    for was 8 / 18 / 12 against a map holding 4 / 9 / 6: no impact sparks, no death steam, no hurt
    vent, no flinch, no flash and no impact shake — at exactly the scales entry 1's blind clip
    comparison uses. The lookup now divides by the scale first, and `scale = 0`'s documented
    "resolves nothing" still falls out for free (`0 / 0` is `NaN`).
38. **Three docstrings misstated Phaser 4.2.1's actual behaviour, read out of the vendored source.**
    (a) `screenShake.ts`'s header said Phaser owned the shake mechanism and that reimplementing it
    here would be a duplicate — `camera.shake()` is called nowhere, the jitter is this project's own,
    and that header was the first thing a reader auditing criterion **9.2** would have been told.
    (b) Both force-settle docstrings said Phaser writes the end value in *neither* callback:
    `TweenData.js` assigns `target[key] = this.current` **before** its `if (complete)` branch, so
    natural completion DOES write it. (c) Neither mentioned the third exit —
    `BaseTween.destroy()` nulls `callbacks` and is reached by `TweenManager.shutdown() → killAll()`,
    so **a scene shutdown is a stop path with no force-settle at all**. `hudGearPop.destroy()` used
    to lean on `onStop` there and now settles directly.
39. **`setTintFill(color)` is REMOVED in Phaser 4 and does not throw.** It survives as a stub that
    logs to `console.error` and returns `undefined`
    (`gameobjects/components/Tint.js:276-280`). A hit flash written the Phaser 3 way would have drawn
    nothing and reported it to a console nobody reads during a spec run. `spriteFlash.ts` carries the
    note and uses `setTint(c).setTintMode(ADD)`; ADD rather than FILL because FILL replaces the pixel
    and turns `hitFlashAlpha`'s decay into a grey silhouette.
40. **`shakeDurationMs` was dead code kept alive by a tautological test** — no production caller, and
    its only general assertion compared it against `ticksToMs(...)`, which is its own body. Deleted,
    along with the "Phaser's camera API takes milliseconds" paragraph that justified it.
41. ~~**`advanceStride` (step 12) is frozen by ACCIDENT, not by design.**~~ **FIXED (fix round 10).**
    Step 12 now takes `motionRan`, gated the way step 13 is and for the same stated reason — **not**
    on `frozen()`, which differs on the arming tick, where the body genuinely did move.

    ⚠️ **The recorded harm was wrong, and driving the fixture is what showed it.** Ungated,
    `advanceStride` cannot fire a footstep from a frozen body, because **a frozen body can never be
    grounded** — and that is structural, not luck: `resolveCollisions` lands a body only when
    `player.y > solid.y` AND `previousY <= solid.y`, and a freeze skips step 8, so the two are the
    same number and the conjunction is unsatisfiable. What it did instead is worse than nothing: it
    reached its own `!grounded` branch and **RESET the stride to 0 on every frozen tick**, so a
    freeze restarts the cadence rather than holding it, and the foot one tick from landing lands
    fifteen ticks later. `hitstop-frozen-counters.test.ts` arms a freeze with no blow behind it —
    writing `hitstopUntil` directly, which is what a parry or a landing freeze would do — and was
    watched red on the revert. The claim is corrected in `playerMotion.ts` and `tick.ts` *(C9)*.
42. ~~**`goalEntryTicks` still spends ticks inside a freeze.**~~ **FIXED (fix round 10) — and it is
    DEFENCE IN DEPTH, not a live fix.** `stepGoalEntry` takes `motionRan` and holds the counter,
    beside the airborne hold that was already there. `tsc` enforces the argument: it is required
    rather than defaulted, so a future call site cannot silently take the old behaviour.

    ⚠️ **The recorded defect was already unreachable**, by the same proof as entry 41: 9d's advance
    sits behind `!world.player.grounded`, and a frozen body is never grounded. Measured rather than
    argued — removing the new guard alone leaves the suite green. So the gate pins the INVARIANT
    (*the run-in banks no ticks from a standing body*) and both arms are recorded in its header:
    **grounded hold removed, `motionRan` kept → green**, the new guard carrying it alone;
    **both removed → red**, `expected 4 to be 3` on frozen tick 1. Not decoration, and honest about
    which of the two lines it is buying.

### Added by the 9.5 fix round — the narrowings criterion 9.5 was FAILED for not stating

🔴 **These three lived in `phase-09-perf.spec.ts`'s header and nowhere else, and one of them —
the shake — was not a narrowing at all but an unmet criterion.** That is the whole of finding M2: 9.8
designates *this log* as a narrowing's home, the spec header is not it, and a narrowing that only a
reader of the spec ever sees is one the gate cannot check. The spec header now summarises and cites
these numbers rather than arguing in parallel with them.

43. **The measured frame carries NO COMBAT, and the absolute bound must be read that way.**
    `installStorm` holds the player invulnerable on every frame of every arm. It has to — without it
    the shipped effects path fires bursts that `atLimit()` **accepts** in cheap arms and **drops** in
    expensive ones, an inversion that stops the sweep ordering at all. The price is that the frame
    `MAX_EFFECT_FRAME_WORK_MS` is asserted on contains no `hurt` or `death` state, no hit-stop, no
    knockback, no i-frame flicker and none of `gameEffects.render()`'s own trigger paths. It is the
    worst **steady-state** frame, not the worst frame the game can produce.
44. **The shake in the window is `land`, the SMALLEST of the four commands.** The load itself is no
    longer missing — see §*"9.5 — the gate round FAILED it"* for the mechanism and the 100 % measured
    coverage — but `light`, `lethal` and `playerHurt` (up to 8 ticks and ±7.6 px against `land`'s 3
    and ±1.5) are unreachable without the combat entry 43 excludes. The argument that this does not
    matter is that a shake's per-frame cost is its **branch**, not its amplitude: two trigonometric
    evaluations plus a non-zero `camera.setPosition`, and `BaseCamera.updateSystem` flips
    `_customViewport` on `_x !== 0 || _y !== 0` at any amplitude. **That is an argument and not a
    measurement**, and nobody — including the gate round — has measured a shake's cost directly,
    because it sits far below the 0.1 ms grid and nothing amplifies it.
    🔴 **Addendum from the second 9.5 fix round (finding L4): the fixture's CADENCE is a narrowing
    too.** `SHAKE_HOP_VY = -1` against `gravity 0.675` lands the player every 2 ticks — 30 landings a
    second — so every measured frame also carries a `landSquash` write (`gameEffects.ts:268-269`) and
    an `arm('land')` every other tick. That is extra cost in **every** arm: it divides out of the
    paired delta and makes the absolute bound stricter, both safe, but the measured frame is not one
    the game can produce.
45. **The storm holds a population; it does not measure a single triggered burst.** `sampleArm` waits
    for the population to land *before* sampling, so the frame that first constructs N particles is
    outside the window by construction. What is inside is the top-up — itself burst-shaped, because
    `EmitterSpec.lifespanTicks` is a scalar, so a whole `explode()` expires on one frame and the whole
    cap is re-exploded on the next, every 18 ticks for sparks, 45 for steam, 22 for dust, through the
    shipped call. Those spikes are what `MAX_EFFECT_FRAME_P95_MS` gates; every other bound in the file
    is a median and blind to them. The shipped *trigger* path deciding **when** to burst is criterion
    9.1's behavioural spec, not 9.5's.
46. **Three of the four loads the absolute bound's claim names are not verified to be in the frame.**
    Added by the second 9.5 fix round, finding M4. The per-arm draw claims taken are
    `counts().opaque` (enemy bodies), `particleCounts().drawn` (particles) and `effectShake.ts`'s
    shake counter. **Nothing observes the tilemap layer, the parallax layers, `UIScene` or the player
    sprite.** All of them make `onWork` cheaper when absent, and `MAX_EFFECT_FRAME_WORK_MS` is the one
    bound in the file that is not a difference — so it is the one bound they can move. It is the same
    defect one layer out from Guard 0b, which exists because the headline assertion named twenty
    enemies nobody checked were drawn. **Disclosed, not closed**: closing it means a fourth counter
    and a fourth committed mutation for loads no phase criterion names.
47. **`MIN_COST_EXPONENT`'s "at most 1.5x understatement" was a model-dependent number stated as an
    unconditional one, and the band it admits is disclosed rather than covered.** Codex
    implementation review finding 5, algebra re-derived rather than taken on trust.

    The claim was: at `k = 0.9` exactly, dividing an 8192-particle delta back to the shipped 96
    under-states the per-particle cost by `(8192/96)^0.1` = 1.56x, against a
    `MAX_PER_PARTICLE_WORK_MS` sitting ~4x above the reading. **That is true under `c·N^k` and only
    under it.** The renderer's real cost is not a pure power:
    `ParticleEmitterWebGLRenderer.js:66-70` early-returns on `particleCount === 0`, so a non-empty
    population pays a draw call, a bind and a flush that do not scale with `N`, and the storm's
    `explode` is called per emitter only when the population is non-empty. That is affine, `a + bN`.
    Codex's numbers check out exactly:

    | | value |
    |---|---|
    | intercept giving `k = 0.9` | `a = 0.2732 × 1024b` -> `k = 0.9001` |
    | reported `d(8192)/8192` | `1.034b` |
    | true `d(96)/96` | `3.914b` |
    | **understatement** | **3.79x** — not 1.5x, and not inside the ~4x headroom |

    **The floor stays at 0.9 and the fit stays a power law**, and the reason is the recorded data
    rather than convenience. An affine law with `a >= 0` has `k -> 1` as `a -> 0` and `k < 1` for
    every `a > 0`: **`k = 1` is the affine family's ceiling.** All seven recorded sweeps measured
    `k = 1.086 - 1.286` — super-linear, outside that family — and fitting `a + bN` through those two
    points returns a **negative** intercept (-0.16 to -0.37 ms), which makes the "true shipped
    figure" `(a + 96b)/96` negative and meaningless. Two points cannot identify a three-parameter
    reality; swapping the fit would replace a model wrong in a known direction with one that does not
    fit the measurements at all. Moving the floor was refused outright — a bound is never fixed by
    loosening it, and nothing here argues for a tighter one either.

    **What is left, stated as the residual:** for `0.9 <= k < 1` the divide-back under-states by
    between 1x and 3.8x depending on the law's shape, and only the low end of that is inside the
    headroom. The floor's job is to catch a run leaving the conservative regime, not to prove how bad
    the regime it admits can be. No run has ever entered the band. Corrected in
    `effectSweep.ts`'s `MIN_COST_EXPONENT` docstring and in the 9.5 fix-round section above.
48. **The 400-line rule distorted ownership and APIs in four places, and three of them stand.** Codex
    implementation review finding 4, with its citations. The worst instance — the landing edge living
    in the render attachment because `src/sim/types.ts` would have crossed 400 — **is fixed** (entry
    15). The remainder is a real structural observation and NOT a defect, and the tick contract is not
    being restructured to answer it:

    - `tick.ts` no longer contains its own numbered pipeline: steps 5-8 moved to `playerMotion.ts`
      with a `ran` status threaded back into steps 12 and 13 (`tick.ts:91-98, 264-278`).
    - `advance` is re-exported from `advanceSplit.ts` solely because `tick.ts` reached 400
      (`tick.ts:391-400`).
    - `gameEffects.ts` registers its own scene-shutdown listener because `GameScene.ts` has no
      remaining line (`gameEffects.ts:306-321`).

    Each is already argued at its site and each split moved whole concerns with their docstrings
    intact, which is the distinction `file-size.test.ts`'s header draws between splitting and gaming
    the count. Renumbering or re-merging the tick order is a balance change to a phase that has spent
    money on art *(vault 2.2)*, and would be a far larger risk than the observation.

    ⚠️ **The pressure is real and this round paid it again.** Fitting the landing stamp into `tick.ts`
    needed 6 lines back, and they came from two paragraphs that were **second copies**: step 4c's
    account of the missing respawn (the fuller one is on `respawnPlayer` in `combat.ts`) and its
    account of why the player's death releases aggro (now on `releaseAggro` in `enemyScavenger.ts`,
    which is the function it is a rule about). Nothing was deleted — both moved, and one gained the
    sentence `tick.ts` had that `combat.ts` lacked. `tick.ts` is 394 today. **That is the honest cost
    of the rule: a file at exactly 400 makes the next correct change require an unrelated edit, and
    the edit it invites is the one that deletes explanation.** Recorded so the next reader knows the
    trade was made deliberately and where to look for what moved.
49. **The emit window in `gameEffects.render` was off by one, and no strike burst had EVER fired in
    the shipped game.** Not a Codex finding — found while building the proof for finding 7, by running
    the production order against a fake scene.

    `fresh(hitTick)` asked `hitTick > cursor && hitTick <= tickCount`. Every stamp the sim writes
    (`lastHitTick`, and now `landedTick`) is taken from `world.tickCount` **before** step 14
    increments it, and `GameScene.update` renders **after** `advanceSplit` returns — so the tick
    indices that ran in a frame are `[cursor, tickCount)`. The old window asked for
    `(cursor, tickCount]`, which at one tick per frame contains no stamp at all: **not one impact
    spark, death plume or hurt vent, and none of the shakes they arm.** At two or more ticks per frame
    it fired for every tick but the oldest, which is why it looked alive under a load test.

    Three things hid it, and all three are the same lesson:

    - **Every unit fixture bumped `tickCount` BEFORE stamping** — `world.tickCount += 1; freezePair(…,
      world.tickCount); render()` — which is the one ordering the game never performs. Corrected; the
      fixtures now stamp, then increment, then render.
    - **9.5 and 9.6 call `explode()` on the emitter handles directly** (`installStorm`), so the entire
      `render()` decision path is outside the counters that were built to prove particles are drawn.
    - **The landing was the one burst that worked**, and only because it asked `fresh(tick)` — the
      frame's own count, never a stamp — which reduces to "at least one tick ran".

    Gated by `effects-behaviour.test.ts`'s *"emits for a hit stamped on the tick this frame ran, and
    NOT twice"*, which drives the production order and asserts both the emit and the non-repeat.

---

## G.7b — attributed to Phase 9, then disproved by running it again

`tests/e2e/phase-08-gate-perf.spec.ts:264` ("one exit costs a fraction of a millisecond a frame,
measured by amplification") failed twice on the phase branch and passed on `main`. On that evidence it
was written up here as **the first failure of the session that was not the environment**. That was
wrong, and the way it was wrong is worth more than the gate is.

A Task 6 agent then reported it **passing** on the same branch. Four more runs, back to back, alone on
a quiet box, on `e23ee9f`:

| run | 1 exit GPU | 41 exits GPU | 21 exits GPU | result |
|---|---|---|---|---|
| 1 | 0.036 ms | 0.205 ms | 0.152 ms | pass |
| 2 | 0.099 ms | 0.155 ms | 0.111 ms | pass |
| 3 | 0.098 ms | 0.150 ms | 0.116 ms | pass |
| 4 | **0.133 ms** | **0.135 ms** | 0.111 ms | **fail** |

Counting everything this session: **3 failures and 4 passes on the same branch.** It is a coin flip.

**Read the first column.** The single-exit baseline ranges 0.036 to 0.133 — a spread of 0.097 ms,
which is *wider than the entire effect the gate exists to measure*. Run 4 failed for no reason except
that its baseline landed at the top of that range on the same run its 41-exit figure landed at the
bottom. Nothing about the exit graphic changed between run 3 and run 4.

### What the earlier attribution actually did wrong

It compared **one run per arm** and read the difference as a signal. The project already has this rule
and it was not applied: *a perf bound is chosen on one set of runs and confirmed on a HELD-OUT set* —
both gates repaired on 2026-08-18 false-redded on the first run that had no say in their bound. One
sample per arm from two distributions that overlap almost completely is not a comparison; it is two
draws. The care that went into refusing to attribute the four earlier failures until a control run
existed was then spent on trusting that control run's single sample.

**The `main` arm was never shown to be different.** It was shown to have produced 0.218 once, which is
inside the range the branch produces routinely.

### What is actually true about G.7b

The GPU statistic is **noise-dominated at this amplification on this hardware**, and has been since
before Phase 9. Its own premise check is what fires, and it is right to fire — it refuses to emit a
per-exit figure when 40 extra exits did not measurably cost anything. The gate is honest; the
statistic underneath it cannot carry the question.

This is the same shape as criterion 6.9's discarded GPU ratio. The remedy is the standing one and it
has not changed: **a statistic that cannot order its own mutation cannot be repaired by moving the
bound — replace it.** What has changed is who owns it: this is an **inherited Phase 8 defect**, not a
Phase 9 regression, and the CPU arm of the same gate orders reliably on every run above.

**Phase 9 attribution: cleared.** Recorded as a known-flaky inherited gate, assigned to the phase
gate's `performance-engineer` briefs with the amplification-vs-resolution problem named.

---

## 9.5 — "max enemies" is not a bound

The enemy arm of criterion 9.5 is pinned to `DEV_FLEET_COUNT` (`tests/e2e/perfBudget.ts:28`), and that
is the **declared** worst case, not the largest possible one. Finding **S5**
(`docs/qa/phase-05-combat-08-gate-10.md:121`) is still open: `DEV_FLEET_COUNT = 20` is a chosen 10×
multiple, and **nothing in `src/sim/` or the level format caps concurrent enemies**. So "max enemies"
here means *the largest fleet this project measures*, never *the largest possible*. Adding a real cap
is a design decision and is out of Phase 9's scope.

The particles beside them are different in kind, and the contrast is the point. They are bounded **by
construction** at `EFFECT_PEAK_ALIVE = 96` — 32 + 48 + 16, each emitter's `maxAliveParticles` —
because Phaser's `atLimit()` **drops** an emit request rather than evicting the oldest. The particle
ceiling is a contract; the enemy ceiling is a habit.

## 9.5 — the measurement floor, and why the shipped number is inferred rather than measured

The shipped 96-particle ceiling costs about **0.06 ms** of main-thread work per frame, and
`performance.now()` in this browser quantises to **0.1 ms**. The shipped figure is therefore **below
the grid of the clock that would measure it**: every one of the ten per-pair deltas came back as
either 0.000 or 0.100 ms, and nothing in between exists to be read.

**So the shipped number is not measured. It is inferred.** What is measured is the amplified storm —
**2048** particles through the same emitters, the same specs and the same `explode()` — and what is
reported is that delta divided by the particle count.

> ⚠️ **This paragraph said 1024, and the two below said 512 and 1024, until the fix round.** They
> described the sweep `[0, 64, 128, 256, 512, 1024]` that the gate round replaced with
> `[0, 1024, 2048]`, and a stale figure in a log is how a reader is told a number was measured that
> never was *(C9)*. Corrected here against the runs actually on this tree.

That divide-back is only a measurement while the cost is linear in the count, so the spec asserts
linearity instead of assuming it: two independent per-particle estimates taken at **1024 and at
2048** agreed to within **1.0–1.4×** on the gate round's held-out runs and **1.000–1.256×** on the fix
round's ten, against a 4× bound; and the `storm8192` proof read a **6.050 ms** paired delta for 8192
particles — **0.00074 ms** each at 85× the shipped ceiling, near the top of the 0.0004–0.0008 the
sweep measured (2026-08-22, `absolute 6.550 ms` against `off 0.500`). **The inference
holds and the divide-back stands.** Had the sweep bent, the spec is written to fail rather than
report an extrapolation through a region nothing measured.

🔴 **The spread is above 1 on every gate-round run rather than scattered around it — the sweep is
mildly SUPERLINEAR** (gate-round finding N3). The direction is the safe one: if cost grows faster
than the count, dividing a 2048-particle delta down to 96 **overstates** the shipped figure, so the
reported ~0.06 ms is an upper bound rather than a best estimate. It does not threaten the
divide-back and it is recorded so that nobody reads the agreement as exact.

⚠️ This is the same hazard that made G.7b unmeasurable — a statistic sitting under its clock's
resolution. The difference, and the only thing that makes this one legitimate, is that the amplifier
is **proved to amplify** and the linearity that licenses the divide-back is **asserted rather than
assumed**. G.7b's amplifier does not amplify, which is why its own premise check refuses to emit a
number.

> 🔴 **The parenthesis here used to read *"the sweep orders monotonically across nine walks"*, and on
> `ca3814f` it ordered 1 walk in 6** (gate-round finding M4). That is the half of the sentence a
> reader would have leaned on, and it was the false half. The claim is sound and the evidence is
> different: on the **per-round** reduction the amplifier ordered **+29 / −0 / =1** across 0→1024 on
> the old points and **+40 / −0 / =0** across 1024→2048 on the new ones, with **zero inversions in
> 80 per-round observations** over 8 held-out runs — and Guard 3 *measures* the linearity rather than
> assuming it. Nothing about the amplifier changed; what changed is that the sentence now cites the
> statistic the spec actually computes.

---

## 9.5 — the gate round FAILED it, and what the fix round did (task 11, 2026-08-22)

The `performance-engineer` gate briefs returned **9.5 FAIL / 9.6 PASS** with 1 critical, 4 major, 4
minor and 1 nit. The critical — the sweep statistic that could not order itself — was repaired and
merged as `f829914` before this round started. Three problems remained, and this section is what was
done about each. **Every finding from that report is marked APPLIED or RECORDED at the end.**

### Problem 1 — the criterion names three loads and the measured frame carried two (finding M2)

Criterion 9.5 is *"frame budget holds under worst case: **max enemies + max particles + shake**"*.
`installStorm` sets `player.iFrameCounter = 0` on every frame of every arm, so no hit ever lands, so
`gameEffects` never armed a shake and **no sampled window in the history of this gate contained
one**. The invulnerability itself is legitimate and signed off — without it `atLimit()` admits a
combat burst in a cheap arm and drops it in an expensive one, which inverts the sweep — but the
resulting measurement is not the criterion's worst case.

**The choice taken is the preferred one: the shake is now MEASURED, not narrowed.** The criterion is
met as written and no criterion text was weakened.

**How, and why it does not re-import the inversion.** `attachEffects` arms a shake from four places.
Three of them (`light`, `lethal`, `playerHurt`) emit a burst in the same breath — `impactSparks`,
`deathSteam`, `hurtVent` — and a burst is exactly what must stay out of this measurement. The fourth
is the **touchdown**, and `gameEffects.ts` says so at the line: *"🔴 Armed on EVERY touchdown, not
only the ones the dust threshold accepts."* `landingDust` returns `null` below `DUST_MIN_FALL_PX`
(9 px/tick), so a slow enough landing arms `land` and **emits nothing at all**.

`tests/e2e/effectShake.ts` drives that seam with one `requestAnimationFrame` that writes
`player.vy = -1` whenever the player is grounded. Against `gravity` 0.675 the arithmetic is fixed
rather than tuned:

| tick | `vy` after step 6 | `y` vs the floor | `grounded` after step 9 |
|---|---|---|---|
| A | `-1 + 0.675 = -0.325` | `-0.325`, clear of the solid | **false** — airborne |
| B | `-0.325 + 0.675 = +0.35` | `+0.025`, overlapping again | **true** — touchdown, `arm('land')` |

So the player lands **every second tick**, on a fall of 0.325 px/tick — **28× under** the dust
threshold. `SHAKE.land.durationTicks` is 3 and `shouldPreempt` re-arms on every touchdown, so the
shake never settles. **Measured: 100.0 % of frames in 100.0 % of windows, 35 windows per run, on
every run of both sets below.** The loop runs in *every* arm, so it divides out of the paired delta
while sitting inside `onWork`, which is the term `MAX_EFFECT_FRAME_WORK_MS` — criterion 9.5's own
sentence — asserts.

**Guard 0c** (`effectCounts.ts`, inside `sampleArm`) fails any window whose shaken-frame fraction is
under `MIN_SHAKEN_FRAME_FRACTION`. The floor is **0.5 and is derived from the statistic, not fitted**:
the bound it stands in front of is a *median*, so for the median frame to carry a shake more than
half the window's frames must. It counts frames on which `camera.x/y` differed from
`EffectAttachment.base()` — the **drawn** camera, never a `ShakeState` that merely existed, the same
distinction `drawn` draws against `getAliveParticleCount()` one file over.

**What the shake cost: nothing the clock can see.** With it in, `N=0` medians and `onWork` sit inside
the no-shake baseline's own range (0.5–0.8 ms and 0.5–0.75 ms across 10 runs each). That is expected
and it is *why the small `land` amplitude does not weaken the claim*: `applyShake` runs on every
frame either way, and what a running shake adds is two trigonometric evaluations plus a **non-zero**
`camera.setPosition` — and the non-zero is the part with a render-path consequence, because
`BaseCamera.updateSystem` sets `_customViewport` from `this._x !== 0 || this._y !== 0`. That branch
is amplitude-independent: `land`'s ±1.5 px is exactly as non-zero as `playerHurt`'s ±7.6 px.

**What is still narrowed, and it is 9.8 entry 44:** the *larger* commands. `land` is the smallest of
the four, and `playerHurt`'s 8 ticks cannot be reached without the combat this window excludes by
construction. The cost argument above says that should not matter; it is an argument, and it is
logged as a narrowing rather than left as a claim.

### Problem 2 — two bounds cited run sets that are not in this log (finding M3)

`effectBudget.ts` told the reader that `MAX_EFFECT_FRAME_WORK_MS`'s and `MAX_EFFECT_WORK_DELTA_MS`'s
selection and held-out sets were *"in `docs/qa/phase-09-polish.md`"*. They were not: the gate brief
grepped for both quoted figures and found **zero matches for either**. That is the same C9 shape the
same file already records having been burned by — a citation worse than the gap it discloses.

**Resolved by correcting the citations to what is really there**, because the missing half cannot be
recovered honestly: **there is no selection set.** Both bounds are *derived* — 2.5 is 16.67 / 6
rounded down, 0.3 is `MAX_PER_PARTICLE_WORK_MS × 96` rounded up to a clock step — and no run had a
vote in either. The three readings the docstring quoted (`0.500 / 0.500 / 0.600 ms`) were a sanity
check whose provenance nobody wrote down, so they are **withdrawn rather than re-cited**. What does
exist is confirmation, on two disjoint held-out sets, and it is written down below.

### Problem 3 — the gate HUNG instead of failing, and now it fails in a minute with the reason

The phase owner observed `Error: page.evaluate: Test timeout of 600000ms exceeded` on roughly **1 run
in 6** of the merged repair. The cause is structural and is not the population wait (`setStorm`
already carries a 20 s bound, and its failure message names `page.waitForFunction`, not
`page.evaluate`). It is `perfSampler.sample()`: its in-page promise is resolved by **exactly one
condition**, `window.__game.tick` advancing `tickSpan` ticks, and it carries no deadline of its own.
Anything that stops the simulation stops the spec forever — ten minutes of silence, then a message
naming neither the arm nor the sweep point nor the cause. **A hang gets attributed to the machine; a
red gets fixed.**

**Measured rate, before:** `0 in 11` runs of criterion 9.5 alone on an idle box, 2026-08-22 (one
validation run plus a 10-run loop, all `1 passed`, 80–84 s each). It did **not** reproduce here. The
phase owner's 1-in-7 was measured in a session with other work on the box, which is the condition
`docs/qa/phase-09-polish.md` §*"Nothing heavy may run beside the e2e suite"* already names — so the
honest statement is that the trigger is environmental and the **exposure** is the unbounded wait.

**Measured rate, after:** `0 hangs in 19` further runs — 9 valid in the confirmation loop plus set B's
10 on the frozen tree. (The confirmation loop's tenth run aborted in 2 s with exit **127** and no
Playwright output at all, `playwright` not found: an npm/PATH hiccup while a `tsc` ran beside it, not
a test result, and recorded rather than quietly dropped.) **The repair is not a reduction in the rate
— it is that the failure mode is no longer a hang.** `PERF_MUTATION=stall` produces the exact observed
state on demand, and the gate now reports, in 60 s:

```
Error: sweep N=0, round 0: the 120-tick window did not close within 60000 ms. over 500 ms:
0 sim ticks and 121 animation frames; live 0 of a target 0 (sparks 0/32, steam 0/48, dust 0/16);
ready true, bootError null, visibility visible
```

Those counters are the discriminator, and they are read over a 500 ms stretch driven by `setTimeout`
and **never** by `requestAnimationFrame` — a rAF-terminated probe would hang exactly like the window
it was sent to explain. *"0 sim ticks and 121 animation frames"* says the simulation stopped and the
page did not; the reverse says the page stopped painting; a short `live` count says the storm never
populated, per emitter.

**On the raised sweep point specifically:** the top-up loop is not racing the cap raise.
`setStorm`'s `page.evaluate` is synchronous — it writes `__fxStorm.caps`, then `killAll()`,
`maxAliveParticles` and `reserve()` for all three emitters in one uninterruptible block — so the rAF
that tops up cannot observe a half-applied state. `drawn 2048/2048/2048/2048/2048` on every sweep
round of all **30** clean runs in this session, and the population wait never once fired. **No stall
at 2048 was reproduced and none is now silent: it would name itself**, per emitter, in 60 s.

**Residual, recorded not fixed:** the same unbounded wait is still reachable from every other
`sample()` caller — `phase-05-perf`, `phase-07-perf`, `phase-08-gate-perf`. The bound is in
`windowStall.ts` wrapping the call rather than inside `sample()` because `perfSampler.ts` is at 398
of the 400-line limit and the rule is *split, never exempt*; splitting a file shared by three
inherited phase specs is out of this task's scope. It belongs with G.7b and 5.11 in whatever session
takes the perf-gate family on.

