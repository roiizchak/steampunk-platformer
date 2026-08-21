# Phase 9 — Polish, juice, particles — QA log

← [QA-LOG index](../QA-LOG.md) · phase: [phase-09-polish.md](../prd/phase-09-polish.md) ·
reviews: [plan](../reviews/phase-09-plan.md) · impl (owed)

Branch `phase-09-polish`, from `main` at `080e3e8`.

---

## Task 0 — the contact-frame trace (blocking, run before any hit-stop code)

**Why it blocks.** Hit-stop holds **one drawn frame** for 4–9 ticks. `combatTiming.ts:101-107`
warns, from a failure this project's sibling already paid for, that *"spending the full `startup`
puts the contact frame on the last active tick instead of the first"*, and that it is findable
**only** by tracing the sim's state frame against `anims.currentFrame` live. No gate in this phase
can see it. If the freeze holds a wind-up pose, every timing number in the plan is spent holding the
wrong picture.

### Method

`npm run dev` on :5173, driven with the `playwright-cli` skill. A recorder installed in-page sampled
once per animation frame — `window.__game.tick`, `world.player.state`, `world.player.combatCounter`,
`playerSprite.anims.currentAnim.key`, `.currentFrame.index` and `.currentFrame.textureFrame` — then
`F` (attack) was pressed and the series deduped by tick. 668 samples across the swing.

### Result — RED CASE. The contact frame is on the LAST ticks of the active window.

The project's own reach gate, run against the shipped sheet:

```
$ node tools/gen/sheetGates.mjs brass-courier attack
PASS   brass-courier/attack   G4   drift 0px within budget 3px (3px + 0px allowance)
PASS   brass-courier/attack   G5   frame 4 (tick 9) lands inside the active window [6, 10)
```

The live trace, tick by tick. `ATTACK = { startup: 6, active: 4, recovery: 10 }`, so
`attackPhase` puts the live hitbox on `combatCounter ∈ [6, 10)`:

| combatCounter | phase | anims index | **texture frame** |
|---|---|---|---|
| 0–2 | startup | 1 | 0 |
| 3 | startup | 2 | 1 |
| 4–6 | startup → **active at 6** | 3 | 2 |
| 7 | active | 4 | 3 |
| **8** | **active** | **5** | **4 ← contact** |
| **9** | **active (last tick)** | **5** | **4 ← contact** |
| 10–11 | recovery | 6 | 5 |
| 12–19 | recovery | 7–10 | 6–9 |

The attack clip has **10 frames** (`anims index = textureFrame + 1`) spread over a 20-tick swing.

> 🔴 **This line said 12 until 2026-08-20, and the table directly above it always said 10.** It lists
> texture frames 0-9 and anims indices 1-10; `public/assets/index.json` ships `brass-courier-attack`
> at `frameCount: 10, simTicks: 20, fps: 30`, and 20 ticks at 60 Hz is 0.333 s, which is 10 frames at
> 30 fps. Three independent sources agreed and the prose disagreed with all of them. Caught by the
> Task 2 implementer when its dispatch — which had copied the wrong number out of this file — told it
> to read the catalog instead of hard-coding the count. **The contact-frame conclusion is unaffected:**
> contact is texture frame 4, which is `frames[4]`, on `combatCounter` 8-9. *(vault C9 again, and this
> time in the document the code is told to cite.)*

**G5 passes and is still a red flag for this phase.** G5 only asks whether contact falls *inside*
the window. It falls on ticks 8 and 9 — the **last two** of four. A hit normally lands on the
**first** live tick (`combatCounter === 6`), where the drawn pose is texture frame 2, a mid-wind-up.

### Decision — snap to the contact frame on freeze (owner approved, 2026-08-20)

When the freeze begins the sprite is forced to the **contact frame (texture frame 4)** and paused
there; on release the swing resumes. Every timing number in the plan stands unchanged, no art is
regenerated, and no combat knob moves — so `combatTiming.ts`'s balance warning is not triggered.

Rejected alternative: hold whatever frame happens to be drawn. That is the documented failure, it
depends on *where in the window* the hit landed, and nothing in the suite can catch it — it would
surface only at the hands-on pass, after the timing numbers had been tuned around the wrong feel.

### Second finding, free, and it constrains the implementation

The first attempt at capturing a held contact frame set `anims.setCurrentFrame(...)` plus
`anims.pause()` from outside the game loop. The screenshot came back showing an **idle** pose:
`gamePlayerDraw.ts` re-derives the animation from sim state **every frame**, so an externally set
frame is overwritten within one frame.

**Consequence:** the freeze's animation pause and contact-frame snap must live **inside** the render
path, recomputed each frame from a sim predicate — the `goalEntryAlpha` no-teardown pattern
(`playerView.ts:115-123`), which is what the plan already specifies. A one-shot call from anywhere
else is silently undone.

### Evidence

The trace table and the gate output above are the evidence, and both are reproducible by the method
described. **No screenshot is filed**: the only image captured showed the overwritten idle pose and
would have been misleading, so it was deleted rather than filed. Visual confirmation that the snap
reads as impact is **owed at the hands-on pass** and is tracked under criterion 9.8.

### Housekeeping

Dev server killed by port after the trace *(C13)*; browser closed.

---

---

## The build — what landed, and what I verified myself

**A subagent's summary is a claim, not evidence.** Every row below was re-run by the integrator in
the agent's own worktree before the merge, and every mutation was driven from the shell with redness
read positively from a `Tests N failed` line plus the named failing test.

| task | merged | unit suite | what I re-mutated myself |
|---|---|---|---|
| T1 — hit-stop in `src/sim/` | `a5114b0` | 1967 / 118 files | the freeze knob · the extend-only guard · **step 8 escaping the gate** (6 tests red) · the `combatCounter === 1` restore (stays green, and that is why the clause went as redundant) |
| T2 — `screenShake` / `effects` / `spriteFeedback` | `eac4ba7` | 2045 / 121 files | `SPARK_CORE_SHARE → 1.0` (empty tail burst) · removing `shakeWithinEnvelope`'s pre-start guard |
| T5 — scene wiring, tweens, gear pop, drawn frame | in review | 2051 / 122 files | pending its fix round |

### The defect class that dominated this phase

Across T1 and T2, **nine gates asked whether a value came back rather than whether it was capable of
doing anything.** They are worth listing together, because no single one of them looks like a pattern:

- `landingDust` returned a burst of **count 0** at exactly its threshold — the "on" side of a
  both-sides fixture passing on something that draws nothing. *Found by the integrator on merge.*
- `impactSparks` with `SPARK_CORE_SHARE = 1.0` returned an **empty tail burst**; every assertion held.
- `hurtVent` with `HURT_VENT_COUNT = 0` emitted nothing — and the brief's required
  `hurtVent < deathSteam` comparison passed *harder*.
- `SPARK_COUNT.playerHurt = 0` emptied both bursts of a player-hurt impact.
- `sparks.scaleStart = 0` and `steam.alphaStart = 0` left all 96 budgeted particles **drawing
  nothing** — the same alpha-0 class the phase's own `iframeAlpha` docstring names.
- `landingDust`'s ramp was pinned only by `toBeGreaterThanOrEqual`, so a **flat** count was
  "monotonic" and a constant 14 passed everything.
- `shakeWithinEnvelope` reported a **full-amplitude** camera offset as inside the envelope for the
  entire pre-start window — no bound at all on the one window the module exists for.
- `shakeEnergy`'s decay curve had **no literal anywhere**, and one of its two fixtures was computed by
  the function under test.
- A block of feel constants (`LAND_SQUASH_SX`, `FLINCH_RETURN_TICKS`, `FLINCH_LIFT`) could be
  neutralised in one mutation with the suite green.

Every one is *(vault C2)*. The lesson for the next phase is a question to ask of each new assertion:
**if the thing under test did nothing at all, would this still pass?**

### Two defects the reviews caught that were mine, not the implementers'

1. **The freeze spent the jump buffer and the coyote window.** The plan's §1.4 required step 13's two
   `advanceWindow` calls to be gated; the brief I derived from the plan dropped the requirement. A
   9-tick `lethal` freeze saturated `jumpBufferTicks` 8 **from inside itself**, so a jump pressed on
   the impact frame was eaten and never fired. Probe, before the fix:

   ```
   t=213 frozen=true  buf=8  sinceGnd=7  y=960.0   <- both saturated INSIDE the freeze
   t=215 frozen=false buf=8  sinceGnd=7  y=960.0   <- release tick: windowOpen(8, 8) false
   t=218 frozen=false buf=8  sinceGnd=0  y=960.0   <- the jump never fires
   ```

   The implementer then corrected *my* fix: I said gate on `frozen(player, tickCount)`; it gated on a
   new `PlayerMotion.ran` instead, because a freeze armed at 9b of tick `T` leaves `frozen()` true for
   the rest of `T` **after step 7 has already run**, so my version would have made both windows one
   tick more generous than step 13's own rule allows.

2. **The QA log said the attack clip has 12 frames. It has 10**, and three sources said so — the trace
   table four lines above the claim (texture frames 0-9), `public/assets/index.json`
   (`frameCount: 10, simTicks: 20, fps: 30`), and the arithmetic (20 ticks at 60 Hz is 0.333 s, which
   is 10 frames at 30 fps). Corrected in `2d37cf9`. Found only because a fix-round brief told an agent
   to **read the catalog rather than hard-code the count** — the instruction to distrust the prose is
   what caught the prose. **The contact-frame conclusion is unaffected.**

---

## The e2e environment — three false greens, and what they cost

This section exists because the phase spent a long stretch chasing failures that were not in the code,
and the same traps will be here next phase.

### 1. Playwright's `webServer` outlives its run on Windows

Confirmed by process inspection, not inferred:

```
PID 51392  PPID 48372
  CMD:    node ./node_modules/vite/bin/vite.js --port 5173 --strictPort
  PARENT: cmd.exe /d /s /c "node ./node_modules/vite/bin/vite.js --port 5173 --strictPort"
```

`cmd.exe` is how Playwright spawns `webServer`. With `--strictPort` the **next** invocation cannot
bind, aborts before collecting a single test, reports `expected: 0, unexpected: 0` — and **exits 0**.

**This is vault C13 with a sharper edge than "kill dev servers when you are done": the leak poisons
the *following* measurement, and it poisons it green.** It is invisible to every habit built around
watching a gate fail. Two of this session's control runs were zero-test runs read as clean passes.

**Procedure:** kill vite by name and verify port 5173 is clear before **every** Playwright run,
including two runs a minute apart. Read the outcome from `--reporter=json`'s `stats` block and
**check the test COUNT** — `expected: 0` is an empty run, never a pass.

### 2. A zero exit through a pipe is `tail`'s exit, not the gate's

Hit twice, the second time in the command immediately after writing a warning about it into an agent's
dispatch. `npm run test:sim-isolated 2>&1 | tail -6` returns 0 whatever the suite did.

**The project's "detect redness positively" rule needs its mirror written down: detect GREENNESS
positively too, from the summary line and the test count.**

### 3. Nothing heavy may run beside the e2e suite

Criterion 3.2 (`the player cannot pass through a solid horizontally`) failed with a 30 s timeout on
the phase branch, on `main`, and in the agent's run. It is **not broken**. Run alone with
`--timeout=120000`:

```
EXPECTED  3.2 the player cannot pass through a solid horizontally   duration_ms: 46681
```

`sampleHorizontalRun` awaits 400 animation frames — 1.7 s at 240 fps, but the loaded headless page was
serving roughly **8 fps**, so the sample alone exceeded the test timeout. A hand-driven probe confirmed
a live rAF loop and a console holding nothing but two favicon 404s.

Seven specs failed in the first full run. **All seven were wall-clock-sensitive**, and the cause was
`npm test`, `npm run build` and `npm run test:sim-isolated` running **concurrently** with the suite.
Three of the four behavioural failures did not reproduce on a quiet box.

**Attribution, final: 0 of 7 belong to Phase 9.** The project already knows *"the headless harness is
not the frame rate"*; the corollary is that its measurements are only valid on a quiet machine, and
that only one Playwright run may exist at a time.

---

## QA gate — status

**Every row below is UNRUN until its owner agent has run it, twice, per (A7).** Nothing here is
marked passing yet.

| # | Criterion | Owner | Status |
|---|---|---|---|
| 9.1 | Hit-stop lives in the sim as integer ticks, not a tween | `code-reviewer` ×2 | UNRUN |
| 9.2 | No game logic sequenced off a tween completion | `code-reviewer` ×2 | UNRUN |
| 9.3 | Tweens tracked individually; no kill-by-target | `code-reviewer` ×2 | UNRUN |
| 9.4 | A fade force-settles its end value on stop as well as complete | `qa-expert` ×2 | UNRUN |
| 9.5 | Frame budget holds under worst case | `performance-engineer` ×2 | UNRUN |
| 9.6 | Measurement distinguishes "fast" from "not drawing" | `performance-engineer` ×2 | UNRUN |
| 9.7 | Thresholds pinned as literals, fixtures both sides | `qa-expert` ×2 | UNRUN |
| 9.8 | What the gates do NOT cover is stated here | — | DRAFTED, below |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `code-reviewer` ×2 | UNRUN |
| 9.10 | Codex plan review ran; every finding applied or recorded | — | ✅ **PASS** — [phase-09-plan.md](../reviews/phase-09-plan.md), 4 blockers + 2 highs applied, 3 lows recorded |
| 9.11 | Codex implementation review ran on the diff | codex | UNRUN |

---

## 9.8 — what the gates do NOT cover (draft, finalised at the gate)

1. **Whether 4 ticks reads as "solid" or "mushy".** No assertion distinguishes 3, 4 and 5 ticks.
   Owner picks blind from clips at three `?hitstop=` scales.
2. **Whether a light hit and a killing blow are distinguishable at play speed**, without a
   side-by-side. The tests prove they differ numerically, not that a player notices.
3. **Whether the freeze reads as impact or as a dropped frame.** The phase's central risk, no metric.
4. **Whether the contact-frame snap reads as impact** rather than as a skipped frame. Owed at the
   hands-on pass; see Task 0.
5. **The shipped particle configuration is below the measurement floor** and is not measured; the
   perf gate covers the amplified storm only, divided back.
6. **"Max enemies" is not a real bound.** `docs/qa/phase-05-combat-08-gate-10.md:121` finding S5,
   still open: *"`DEV_FLEET_COUNT = 20` is a chosen multiple, not a bound — nothing in `src/sim/` or
   the level format caps concurrent enemies."* The gate pins the declared worst case, not the
   possible one.
7. **Batch-flush counts are not measured.** Phaser 4.2.1 exposes no per-frame draw-call counter this
   project already reads. The depth-band claim is argued from render-node mechanics and enforced only
   by a unit assertion that every `EFFECT_DEPTH` lies strictly in `(10, 11)`.
8. **Spark colour reading as brass-on-steel** rather than generic orange — by eye.
9. **The demo criterion — "hits feel like they land" — has no assertion of any kind.**

### Added during the build, from findings ruled "record, do not fix"

⚠️ **Task 8 re-opened this list on the phase owner's ruling and closed six of it.** The entries below
are what remains; each closed one now says what closed it and where its red-proof is. The audit that
enumerated them is `task-08-audit.md`, and every "declined" verdict is in `task-08-report.md` with
its evidence.

10. ~~**`shakeWithinEnvelope`'s running-shake bound is deliberately loose.**~~ **CLOSED (Task 6 F4,
    recorded stale until Task 8).** The predicate is still bounded by peak amplitude — Phaser's Shake
    does not taper — but the e2e spec no longer relies on it for amplitude: `phase-09-polish.spec.ts`
    asserts `[ox, oy]` **exactly equals `shakeOffset(SHAKE.land, tick, w, h)`** for every running
    sample, off the same function `applyShake` writes from. The envelope is now a second, looser
    opinion beside an exact one, and a 100× amplitude regression reds.
11. **The camera shake uses `camera.setPosition`, so a lethal shake reveals up to 9.6 px of
    background at one screen edge.** The same trade Phaser's own `Shake` makes. No gate can see it;
    owner's judgement at the hands-on pass.
12. **Roughly a dozen feel numbers are chosen, not measured** — the `playerHurt` spark count, the
    flinch magnitudes and curve, the squash peak, and every emitter lifespan, speed and cone. They
    are listed individually in the Task 2 report and are the retuning surface.
13. **`MIN_VISIBLE = 0.1`** — the floor that stops an emitter being neutralised by a near-zero scale
    or alpha — is a chosen number, not a measurement. It is backed by exact literal pins on all six
    start values, so a retune is a visible edit in two places.
14. **The three emitter tints are grey-box choices**, not generated art. `STYLE.md` locks generated
    assets, not render-time tints; the palette question is owed at the hands-on pass.
15. **`lastAirVy` is sampled per frame, not per tick.** The sim carries no landing-velocity field and
    `src/sim/` was out of scope for the scene task. At ~240 fps the last sample before touchdown is
    within one frame of the true impact velocity, so the landing dust magnitude can differ by one
    frame's gravity from the value the sim would have given.
16. **`attachEffects.destroy()` is never called.** Scene shutdown destroys the emitters and the
    camera, so it is not a leak — but it is an unreached path, kept because `GameScene.ts` has no
    line to spare for the call.
17. **A frozen swing's hitbox stays live, so a second enemy walking into reach re-arms the freeze.**
    Each enemy is still struck only once and level layout bounds how many bodies can enter reach
    inside 4-9 ticks, but nothing caps the chain. Deliberately uncapped: a cap is a design decision
    outside this phase, and `playerAttack.ts` says so at the site.
18. ~~**Nothing *statically* forbids a Phaser import in `src/render/`.**~~ **CLOSED (Task 8).**
    `tests/unit/render-boundary.test.ts` scans the `src/render/` transitive closure with the same
    scanner `sim-boundary.test.ts` uses, now shared through `tests/unit/sourceScan.ts`. Only the
    Phaser rule is applied — no document states the clock/RNG/DOM rule for `src/render/`, and
    inventing one here would be a policy nobody agreed to. Watched failing: adding
    `import type Phaser from 'phaser'` to `src/render/effects.ts` reds *"imports nothing from Phaser,
    in any form"* with `{"rule":"Phaser import","line":30}`; reverted, hash restored. A **type-only**
    import is the form that matters — it erases at compile time, so `test:sim-isolated` cannot see
    it, which is exactly why the dynamic check was never sufficient.

### Closed by Task 8, from elsewhere in the phase's records

19. **`hitstopScaleFromSearch` had no gate at all.** The parser that closed Task 6's HIGH finding F1
    was module-private and read `globalThis.location` itself, so mutating `Number.isInteger` to
    `Number.isFinite` left all 2060 tests green with a float duration reaching `src/sim/`. It now
    takes the search string as a parameter — `variantFromSearch`'s shape verbatim — and
    `level-pick.test.ts` drives all seven branches. Two mutations watched red, both named.
    **A live residual was found while gating it:** `Number.isInteger(1e308)` is `true`, so the
    shipped predicate did **not** close F1's third bullet (`?hitstop=1e308` → `hitstopUntil =
    Infinity` → permanently frozen). Now `Number.isSafeInteger`, pinned by its own case.
20. **The `combatCounter === 1` deletion is no longer ungated by construction.** The clause itself
    still cannot have a red — it is provably never read — but the invariant that makes it unreadable
    now does: `hitstop-interactions.test.ts` asserts the counter is **0 on every frozen tick and
    exactly 1 on the release tick**, with the flag sampled where step 5 would read it. Watched
    failing by deleting the `!held` guard on step 4b's counter block, the one edit that would make
    the clause load-bearing again.
21. **9.1b can no longer miss a partial freeze** (Task 6 review F9, recorded as future-proofing).
    The recorder now carries `hitstopUntil` off `__phaserGame` — no ninth `__game` field — and the
    hazard test asserts it holds its `-1` never-frozen sentinel through the window. Nothing clears
    that field and `freezePair` only raises it, so a freeze of any length at any tick is legible
    without tick arithmetic and without depending on which ticks were sampled. **Proved both ways:**
    a hazard-armed freeze with `hitstopUntil = tickCount` — positionally invisible, since that tick's
    motion steps have already run — leaves the four position assertions GREEN with the sentinel check
    neutralised, and reds it when restored.
22. **A constant camera residual is no longer invisible** (Task 6's own post-fix concern 3).
    `EffectAttachment` publishes `base()`, and the recorder takes its zero from there instead of from
    `cam.x` at install, so `ox`/`oy` are the offset the game actually applied rather than the offset
    relative to whatever it was doing when recording started. Watched failing:
    `camera.setPosition(baseX + x + 5, …)` now reds *"the camera was not at its unshaken base at
    install"* with `[5, 0]` — the same mutation the old zero cancelled out entirely.
23. **`waitFor`'s `drop` condition re-arming on the last hit cannot hang** (review F10, recorded as
    deliberate). The behaviour is unchanged and the reason is now asserted rather than argued: every
    hp drop routes through `damagePlayer`, which grants `IFRAME_TICKS`, so drops are never closer
    than 45 ticks against a 14-tick tail. `TAIL_TICKS < IFRAME_TICKS` is pinned in 9.1's body.
24. **The `KNOCKBACK_SPEED` note in `gamePlayerDraw.ts` described a wire that no longer exists.** It
    said the constant is "bound to `DEFAULT_TUNING.walkMax` at module load"; it is a plain
    `export const KNOCKBACK_SPEED = 17.5`, and `playerTuning.ts` says *"Knockback is no longer wired
    to `walkMax`"*. The limitation it records is real — the constant does not scale with `?feel=` —
    the mechanism was not. Corrected *(C9)*.

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
1024 particles through the same emitters, the same specs and the same `explode()` — and what is
reported is that delta divided by the particle count.

That divide-back is only a measurement while the cost is linear in the count, so the spec asserts
linearity instead of assuming it: two independent per-particle estimates taken at 512 and at 1024
agreed to within 1.00–1.25× on every run, against a 4× bound, and the `storm8192` proof read 4.100 ms
for 8192 particles — 0.00044 ms each at 85× the shipped ceiling, inside the 0.0004–0.0008 the sweep
measured. **The inference holds and the divide-back stands.** Had the sweep bent, the spec is written
to fail rather than report an extrapolation through a region nothing measured.

⚠️ This is the same hazard that made G.7b unmeasurable — a statistic sitting under its clock's
resolution. The difference, and the only thing that makes this one legitimate, is that the amplifier
here is **proved to amplify** (the sweep orders monotonically across nine walks) and the linearity that
licenses the divide-back is **asserted rather than assumed**. G.7b's amplifier does not amplify, which
is why its own premise check refuses to emit a number.

---

## Criterion 5.11 red once in seven, and it is the third GPU-ratio gate to do this

`tests/e2e/phase-05-perf.spec.ts:111` failed once during Phase 9's verification, reporting a GPU ratio
of **7.53×** against `MAX_GPU_RATIO < 5`. It was not attributed until it had been sampled, because
this session had already made that mistake once with G.7b.

| run | baseline GPU median | fleet GPU median | ratio | result |
|---|---|---|---|---|
| in the full GPU project | **0.035 ms** | 0.262 ms | **7.53×** | **fail** |
| alone ×4 | 0.161 / 0.198 / 0.199 / 0.200 ms | 0.333 / 0.322 / 0.358 / 0.355 ms | 2.07 / 1.63 / 1.80 / 1.78× | pass |
| full GPU project, re-run | 0.170 ms | 0.342 ms | 2.01× | pass |

**One failure in seven, and read the denominator.** The fleet arm barely moved (0.262 against
0.322–0.358 — if anything *lower* on the failing run). What collapsed was the **baseline**, from a
steady ~0.17–0.20 ms down to 0.035 ms, a fifth of every other reading. The ratio did not rise because
the fleet got expensive; it rose because the thing it divides by fell into the noise.

**Not a Phase 9 regression.** Phase 9's own two gates passed in the same failing run, and the whole
57-test GPU project passed on re-run.

### The pattern is now three for three

Every GPU-**ratio** gate this project has built has eventually proven noise-dominated:

| gate | fate |
|---|---|
| criterion **6.9**'s GPU ratio | **discarded** 2026-08-19 — ranked five full-screen scrims below a clean run |
| **G.7b** (`phase-08-gate-perf.spec.ts:264`) | **flaky**, ~3 failures in 7 — its own premise check refuses to emit a number |
| criterion **5.11**'s GPU ratio | 1 failure in 7, denominator collapse |

The common shape: **a ratio of two sub-millisecond GPU medians, where the denominator is a quiet
baseline sitting near the timer's resolution.** A quiet baseline is exactly the measurement most
vulnerable to quantisation, and putting it under the division line makes the whole statistic inherit
that vulnerability. The numerator being well-behaved does not save it.

Phase 9's own budget gate deliberately does **not** take this shape — it asserts an amplified absolute
delta and a monotone sweep, and it proves the amplifier amplifies before dividing back. That is the
distinction to carry forward: **amplify and check the amplification, rather than divide by a quiet
control.**

**Recorded, not fixed.** 5.11 is Phase 5's criterion and repairing it is out of Phase 9's scope. It
belongs with G.7b in whatever session takes the perf-gate family on, and the two should be fixed
together, because the diagnosis is the same one.
