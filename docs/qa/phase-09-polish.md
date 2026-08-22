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
| 9.4 | A fade force-settles its end value on stop as well as complete | `qa-expert` ×2 | UNRUN — ⚠️ see the substitution note below |
| 9.5 | Frame budget holds under worst case | `performance-engineer` ×2 | **RAN → FAIL** (1 critical, 4 major); **all three remaining problems repaired 2026-08-22** — see §*"9.5 — the gate round FAILED it"*. **Still UNRUN in the sense that matters: the owner agent has not re-run it against the fix.** |
| 9.6 | Measurement distinguishes "fast" from "not drawing" | `performance-engineer` ×2 | **RAN → PASS**, checklist verified item by item; brief 2 outstanding *(A7)* |
| 9.7 | Thresholds pinned as literals, fixtures both sides | `qa-expert` ×2 | UNRUN |
| 9.8 | What the gates do NOT cover is stated here | — | DRAFTED, below |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `code-reviewer` ×2 | UNRUN |
| 9.10 | Codex plan review ran; every finding applied or recorded | — | ✅ **PASS** — [phase-09-plan.md](../reviews/phase-09-plan.md), 4 blockers + 2 highs applied, 3 lows recorded |
| 9.11 | Codex implementation review ran on the diff | codex | UNRUN |

### ⚠️ 9.4's subject: the substitution, and why it is now BOTH

The build substituted the HUD gear pop (`hudGearPop.ts`) for the level-complete fade
(`hudFade.ts`) as 9.4's observable subject, on the argument that the fade's settle is not
independently observable — its only call path, `UIScene.levelComplete(null)`, destroys the fade and
the panel text on the next two lines. The argument is honest and `hudFade.ts` made it in the open.
It was recorded only in a source comment, and the gate table above still said *"a fade"*.

**The two gate briefs then split on exactly that.** Brief A verified the gear pop's settles, found
real reds in both directions, and passed 9.4. Brief B verified the FADE's settles and found that
deleting **both** of its `onStop` callbacks left 2073/2073 green, with `hudFade` occurring in
`tests/` exactly once, as prose. Neither brief was careless: **they verified different subjects, and
only one of them was the subject the criterion names.**

The phase owner ruled 9.4 FAILING, on the grounds that the criterion's named subject was ungated
**and** its stand-in was unwired — deleting `UIScene.ts`'s sole `this.gearPop?.pop()` call site was
also green. Both halves are closed now, and the answer to "not observable in production" turned out
to be a fake scene rather than a substitution: `hudFade.ts` names no Phaser VALUE, so one
`import type` made `showLevelComplete` drivable. See `tests/unit/hud-fade.test.ts` (the fade, both
settles plus the stop-before-destroy ORDER) and `tests/unit/sprite-draw-path.test.ts` (the pop's
call site). Reds recorded in the row table below.

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

10. 🔴 **This entry claimed the OPPOSITE of the truth and is corrected here.** It read: *"the e2e
    spec asserts `[ox, oy]` exactly equals `shakeOffset(SHAKE.land, tick, w, h)` … a 100× amplitude
    regression reds."* The first half is accurate and the conclusion does not follow.
    `gameEffects.applyShake` writes the camera **from that same function with that same command**, so
    both sides of the equality move together: the assertion is structurally incapable of failing for
    any change inside `screenShake.ts`. What it actually closes is *the scene diverged from
    `shakeOffset`*, which is the mutation the recorded red-proof used (`0.01 * cmd.ax` in
    **`applyShake`**) — a real failure, and not the one the sentence claimed.

    Three mutations inside `shakeOffset` itself were run against the shipped tree and all three left
    2073/2073 green: `0.01 * cmd.ax` (the named 100× regression), `JITTER_Y_FREQ = JITTER_X_FREQ`
    (which defeats the module header's own two-incommensurate-frequencies argument), and `sin → cos`
    on x. `shakeOffset` had **zero** unit coverage.

    **CLOSED by replacing the gate, not by moving a bound.** `tests/unit/screen-shake-offset.test.ts`
    pins the offset against absolute literals at named ticks for two commands, plus the three shape
    properties the literals alone would not explain: the x term must vary tick to tick, the
    normalised pair must not lie on the unit circle (which is exactly "the two axes share a
    frequency"), and the amplitude ratio between `lethal` and `land` must hold. All three mutations
    above now red with named tests; watched, reverted, counts restored. The envelope predicate stays
    a second, looser opinion beside an exact one — and its regime-2 justification, which cited the
    taper behaviour of Phaser's `Shake` effect, has been rewritten to cite `shakeOffset`, the code
    that actually runs.
11. **The camera shake uses `camera.setPosition`, so a lethal shake reveals up to 9.6 px of
    background at one screen edge.** The same trade Phaser's own `Shake` makes. No gate can see it;
    owner's judgement at the hands-on pass.
12. **Roughly a dozen feel numbers are chosen, not measured** — the `playerHurt` spark count, the
    flinch magnitudes and curve, the squash peak, and every emitter lifespan, speed and cone. They
    are listed individually in the Task 2 report and are the retuning surface.

    ⚠️ **When this was written, four of those were not on the screen to retune.**
    `src/render/spriteFeedback.ts` shipped with **zero production consumers** — `flinchOffset`,
    `hitFlashAlpha`, `landSquash`, `iframeAlpha` and `ticksSinceHit` were referenced only by their own
    306-line test file, and the sole symbol any scene pulled through the re-export was the constant
    `ATTACK_CONTACT_FRAME_INDEX`. Blanking all four bodies to neutral values left the game
    byte-identical on screen with the suite green. That is precisely the defect this phase had
    already written down one module over — *"a table nobody reads is the same defect as a burst of
    zero particles"* — and no draw-path half was ever built for it. Wired and gated in the fix round;
    the list entry stands as written now that the numbers are drawn.
13. **`MIN_VISIBLE = 0.1`** — the floor that stops an emitter being neutralised by a near-zero scale
    or alpha — is a chosen number, not a measurement. It is backed by exact literal pins on all six
    start values, so a retune is a visible edit in two places.
14. **The three emitter tints are grey-box choices**, not generated art. `STYLE.md` locks generated
    assets, not render-time tints; the palette question is owed at the hands-on pass.
15. **`lastAirVy` is sampled per frame, not per tick.** The sim carries no landing-velocity field and
    `src/sim/` was out of scope for the scene task. At ~240 fps the last sample before touchdown is
    within one frame of the true impact velocity, so the landing dust magnitude can differ by one
    frame's gravity from the value the sim would have given.
16. ~~**`attachEffects.destroy()` is never called.**~~ **CLOSED in the gate fix round.** The
    reasoning recorded here ("not a leak, just an unreached path") was only half the story: the path
    it left unreachable is `camera.setPosition(baseX, baseY)`, and `baseX`/`baseY` are captured ONCE
    from `scene.cameras.main.x` while `applyShake` writes `baseX + x` **absolutely**. A camera that
    survives a `scene.restart()` mid-shake hands the next `attachEffects` the SHAKEN x as its new
    base, and every frame afterwards carries that constant error — including the frames
    `shakeWithinEnvelope` requires to be exactly at base. `EffectAttachment.base()` was published to
    expose exactly that class of error; leaving the restore uncallable was its other half.
    `attachEffects` now registers `scene.events.once(SHUTDOWN, () => attachment.destroy())` itself —
    the `hudFade` / `goalLayer` idiom, and it costs `GameScene.ts` no line at all, which was the
    stated obstacle. Gated in `tests/unit/sprite-draw-path.test.ts`; watched red by replacing the
    handler body with a no-op.

    🔴 **And the first version of this fix broke six e2e specs, which is the most useful thing that
    happened in the round.** `scene.cameras.main.setPosition(baseX, baseY)` threw *"Cannot read
    properties of undefined (reading 'setPosition')"* **inside Phaser's own `Systems.shutdown`**,
    taking down a `scene.start` mid-transition. `CameraManager` registers `once(SCENE.SHUTDOWN, …)`
    from its own `start()` — before any scene's `create()` — and its handler sets
    `this.main = undefined` and destroys every camera, so a SHUTDOWN listener added in `create()`
    always runs after the cameras are gone. Guarded with `scene.cameras?.main?.setPosition(…)`.

    ⚠️ **That also corrects the hazard this entry was written about.** `CameraManager.shutdown()`
    destroys every camera and `start()` builds a fresh one, so **the main camera does not survive a
    `scene.restart()`** — the "next `attachEffects` captures the SHAKEN x as its new base" scenario
    is not reachable by that route. The restore is for an explicit mid-life `destroy()`, and no
    caller does that today. The finding was still worth applying (the emitters, and reachability),
    but the failure scenario recorded for it was INFERRED and is now known to be wrong.

    **The whole thing is also a note about gate strength.** The unit gate proved the handler was
    *registered*; only the browser could show it *threw*. Recorded as 9.8 entry 33's concrete case.
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

### The gate round's mutation proofs — every new gate watched failing

Shell-driven, one at a time, each reverted with `git checkout --` and the tree confirmed clean
(`git status --short` empty) before the next. Redness read **positively** from
`PASS (n) FAIL (m)` with `m > 0` plus the named failing tests — never from an exit code, and never
through a pipe *(TESTING-RULES §5)*. Where the mutated marker is a substring of its own replacement
the count check is stated as the discriminator that was used instead.

| # | Mutation | File | Result |
|---|---|---|---|
| 1 | `x: cmd.ax * viewportW` → `0.01 * …` (100× regression) | `screenShake.ts` | FAIL (2) — both literal pins |
| 2 | `JITTER_Y_FREQ = 7.233` → `12.9898` | `screenShake.ts` | FAIL (3) — incl. *"the two axes are driven by DIFFERENT frequencies"* |
| 3 | `viewportW * Math.sin` → `Math.cos` | `screenShake.ts` | FAIL (2) |
| 4 | `emitter.explode(burst.count, …)` → `explode(0, …)` | `gameEffects.ts` | FAIL (1) — *"passes burst.count … never a literal"* |
| 5 | `BlendModes.NORMAL` → `ADD` | `gameEffects.ts` | FAIL (1) |
| 6 | `emitting: false` → `true` | `gameEffects.ts` | FAIL (1) |
| 7 | `.reserve(spec.reserve)` → `.reserve(0)` | `gameEffects.ts` | FAIL (1) |
| 8 | drop the square in `perSecondSquared` | `gameEffects.ts` | FAIL (1) |
| 9 | SHUTDOWN handler → no-op | `gameEffects.ts` | FAIL (1) — *"registers its own teardown"* |
| 10 | delete `playerSprite.setScale(squash…)` | `gameEffects.ts` | FAIL (1) |
| 11 | delete `this.gearPop?.pop()` | `UIScene.ts` | FAIL (1) |
| 12 | delete `this.gearPop?.destroy()` from SHUTDOWN | `UIScene.ts` | FAIL (1) |
| 13 | drop the flinch from the drawn position | `gamePlayerDraw.ts` | FAIL (1) |
| 14 | `setAlpha(desc.alpha * iframeAlpha(…))` → `setAlpha(desc.alpha)` | `gamePlayerDraw.ts` | FAIL (1) |
| 15 | delete `setCurrentFrame(frames[ATTACK_CONTACT_FRAME_INDEX])` | `gamePlayerDraw.ts` | FAIL (1) |
| 16 | plant `this.tweens.killTweensOf(this.gearIcon)` | `UIScene.ts` | FAIL (1) |
| 17 | goal pulse back to fire-and-forget | `goalLayer.ts` | FAIL (3) — unheld handle, no stop path, and the pulse by name |
| 18 | delete `onStop: settleFade` | `hudFade.ts` | FAIL (1) |
| 19 | delete `onStop: settleLines` | `hudFade.ts` | FAIL (1) |
| 20 | destroy the targets BEFORE stopping the tweens | `hudFade.ts` | FAIL (1) — the ORDER assertion |
| 21 | `applyHitFlash(sprite, 0)` (enemy flash off) | `enemyLayer.ts` | FAIL (2) |
| 22 | drop the flinch from `bodyX` | `enemyLayer.ts` | FAIL (2) |
| 23 | `impactOf` ignores `hitstopScale` | `spriteFeedback.ts` | FAIL (1) — *"resolves every class at every scale the knob accepts"* |
| 24 | remove the `MAX_HITSTOP_SCALE` bound | `gameLevelPick.ts` | FAIL (2) |
| 25 | remove the `createWorld` hitstopScale guard | `world.ts` | FAIL (1) |
| 26 | `hudGearPop.destroy()` trusts `onStop` again | `hudGearPop.ts` | FAIL (3) — all three exits |
| 27 | a 401-line root `probe.config.ts` | *(new file)* | FAIL (2) — proves the glob now reaches root configs |
| 28 | `hitClass` accepts `playerHurt` | `enemyLayer.ts` | FAIL (1) — *"the attacker is not drawn as the victim"* |

**Twenty-eight for twenty-eight.** Mutations 1, 6 and 15 needed a second attempt each and the first
attempts are worth recording, because both failure modes are the ones §5 warns about: #1's first
pattern matched `shakeWithinEnvelope` as well as `shakeOffset` and would have mutated the predicate
and the function together (a consistent pair — no red, and a "proof" of nothing); #6's first pattern
hit the string inside a **comment** rather than the code, and the suite stayed green, which read
exactly like a gate that does not work.

### The gate round's e2e runs, and the one real failure among them

| Run | Result | Notes |
|---|---|---|
| 1 (invalidated) | — | **My own error, recorded because §5 names it.** I ran `npx vitest` three times during it to check docs gates. *"Only one Playwright run at a time, and nothing heavy beside it"* — six specs failed, and I could not tell load from defect. Diagnosed from the artefacts, not the counts. |
| 2 (clean) | **114 passed / 5 failed** | 1 real (below) + 4 `chromium-gpu` specs that did not repeat. |
| 3 (clean, after the fix) | **119 passed / 0 failed**, 17.6m | Baseline was 117; this round adds 2 e2e tests, so 119 is the count read **positively**, not a selection that missed something. |

**The real failure was mine, and only the browser could see it.** Wiring
`EffectAttachment.destroy()` to SHUTDOWN made an unguarded
`scene.cameras.main.setPosition(…)` reachable — see entry 16 — and it threw inside Phaser's own
`Systems.shutdown`, during a `scene.start` mid level transition. The unit gate proved the handler was
*registered*; nothing in `npm test` could prove it did not throw.

**Then the fixed tree failed a different one, and that spec was right twice.**
`session-gate-entry.spec.ts`'s *"never pops back"* caught the i-frame flicker multiplying the gate
run-in's scripted fade — the drawn alpha fell, rose and fell again, off the `1 - k/20` ramp. Fixed by
suppressing the flicker during the run-in. **And the spec's own sampler was reading the wrong
window**: its three shape claims came from a series recorded since boot, so a hit taken anywhere on
the way to the exit could trip `roseAgain`. `offRamp` did not catch that, purely because
`IFRAME_FLOOR_ALPHA` is 0.35 and `1 - 13/20` is also 0.35 — two unrelated constants colliding.
Both halves fixed; the coincidence is written into `fadeSampler.ts`.

**The four `chromium-gpu` failures in run 2 did not repeat in run 3** and are recorded as unexplained
rather than dismissed. That project runs `headless: false` — a real window on a real GPU — and the
one artefact that survived says *"Execution context was destroyed"*, which is a renderer-level event
and not an assertion. All four are ratio-based A/Bs whose control and treatment both carry this
round's new per-frame work, so a systematic cost from it would divide out rather than move a bound
*(the A/B-toggle lesson)*. If they recur on a quiet box, that reasoning is what to attack first.

**The new browser gate measured something.** `[trigger] … sparks alive 0 frames 0 | steam alive 0
frames 0 | dust alive 14 frames 80` — a landing the player performed put 14 particles in the air and
passed `willRender` on 80 frames, with no storm installed. Sparks and steam at 0 is correct for that
run: nothing was hit.

### Added by the gate round — what four blind agents found this list was missing

The list above is thorough about what the BUILD found and was **materially incomplete about the
scene layer**. Four `code-reviewer` / `qa-expert` briefs, run blind to each other, failed 9.3, 9.4,
9.7 and 9.9; between them they ran ~30 mutations and found that **twenty-one** gates in this phase
passed while measuring nothing. Everything below is either closed in the fix round with its red
recorded, or recorded here as still uncovered.

25. ~~**Nothing asserted that a `gameEffects.render()` trigger path emits a particle.**~~ **CLOSED.**
    `emitter.explode(burst.count, …)` mutated to `explode(0, …)` — every in-game spark, steam and
    dust drawing nothing — left 2073/2073 green and `tsc` clean; deleting `strike()`'s spark loop was
    also green. The e2e could not see it either, for a mechanical reason: `installStorm` calls
    `explode` on handles from `scene.effects.emitters()` and **never routes through
    `gameEffects.emit`**, so 9.5 and 9.6 measure the storm, not the game. And
    `effectBudget.ts` disclosed the narrowing while citing a covering gate that *did not exist*
    ("covered by criterion 9.1's behavioural spec" — 9.1 reads sim fields and camera offsets and
    never observes a particle). Two gates now: a browser test in `phase-09-draw.spec.ts` watches a
    real landing produce real dust with **no storm installed**, sampling per animation frame for the
    peak; and `effects-draw-path.test.ts` pins the count through `emit`. The false citation is
    corrected *(C9)*.
26. ~~**The gear pop was never asserted wired.**~~ **CLOSED** — see the 9.4 note under the gate table.
27. ~~**`hudFade.ts`'s two force-settles had no test.**~~ **CLOSED** — same note.
28. ~~**`shakeOffset` had no unit fixture and the e2e assertion was a tautology.**~~ **CLOSED** — see
    entry 10 above, which claimed the opposite and is corrected there.
29. ~~**The blend mode was ungated — the depth band's twin.**~~ **CLOSED.** `NORMAL → ADD` was green,
    while `createEmitter`'s own comment says of that exact line that ADD *"would cost one flush every
    frame, forever, and be invisible in a screenshot"* — verbatim the `setDepth(13)` argument
    `effects-draw-path.test.ts` was created to close. That file closed depth and tint and left blend
    out. Also closed in the same block: `reserve`, `maxAliveParticles`, `lifespan`, `angle`, the
    `emitting: false` flag (whose mutation turns every emitter into a permanent fountain at `(0, 0)`)
    and the px/tick → px/s conversion ORDER — dropping the square in `perSecondSquared` was green,
    and that helper's docstring says it exists so the order cannot be got wrong.
30. ~~**The contact-frame SNAP was ungated; only the number was.**~~ **CLOSED** in
    `sprite-draw-path.test.ts`. Task 0's trace was blocking precisely because freezing whatever frame
    was last drawn holds a mid-wind-up pose, and nothing told the fixed build from the broken one.
31. ~~**Criterion 9.3 had no gate of any kind**, and two live tweens held no handle.~~ **CLOSED.**
    `tests/unit/tween-boundary.test.ts` scans blanked source for `killTweensOf`/`killAll`, for a
    `tweens.add` whose result is discarded, and for a tween owner with no stop path. Both violations
    are fixed: the goal pulse (a real race — ≈533 ms of yoyo against an object `bindContinue`'s
    `scene.start` destroys) and the gear flyers, which moved to `hudGearFlyers.ts` because `UIScene`
    had no headroom under the 400-line rule for the bookkeeping.
32. **STILL NOT COVERED — the visual result of the sprite feedback.** The flinch displacement, the
    flash colour ramp and the i-frame flicker are now asserted as *applied*, behaviourally for the
    enemies and as source text for the player. Whether a 6-10 px flinch READS as impact, whether the
    ADD-mode flash reads as a hit rather than as a glitch, and whether 3-on/3-off flicker reads as
    invulnerability are all hands-on questions with no metric. Owed at the 9.8 pass, alongside
    entries 1-4.
33. ~~**`gamePlayerDraw.ts` and `gameEffects.ts` are gated as SOURCE TEXT, not behaviour.**~~
    **CLOSED (fix round 10).** The stated blocker did not survive being checked. `gamePlayerDraw.ts`'s
    `import Phaser from 'phaser'` was a VALUE import that named the engine **only in type positions**
    — one word, and the whole file was untestable for it. `gameEffects.ts` genuinely needed two
    values, `Phaser.Scenes.Events.SHUTDOWN` and `Phaser.BlendModes.NORMAL`; both are now pinned
    literals in `src/scenes/engineLiterals.ts`, the `TINT_MODE_ADD` idiom applied twice more, and
    `TINT_MODE_ADD` moved there and is re-exported from `spriteFlash.ts` so no caller changed.
    Both modules are `import type Phaser` now, and `test:sim-isolated` still runs 133 files.

    Two new behavioural suites, seven mutations watched red between them *(C1)*:
    `player-draw-behaviour.test.ts` — delete the flinch terms, `setAlpha(desc.alpha)`, snap to
    `frames[0]`; `effects-behaviour.test.ts` — swap `explode`'s argument order, `setBlendMode(1)`,
    register the teardown on `'destroy'`, write the camera to base while shaking. Every one of those
    was green before. The source-text gates STAY, retargeted at the two claims a fake scene cannot
    make: that there is one implementation of the flash and not two, and that the shared constant is
    used rather than a bare number. `UIScene.ts` still names `Phaser.Display` and remains text-gated.
34. ~~**`TINT_MODE_ADD` is pinned only in the e2e suite.**~~ **CLOSED (fix round 10).**
    `tests/unit/engine-literals.test.ts` pins all THREE transcribed constants against the vendored
    source on every `npm test`, each with a guard declaration from the same file so a match on an
    unrelated `ADD:` cannot pass vacuously, plus an anchor case asserting the literals are the exact
    values (a pin that merely follows its own constant is not a pin). Watched red four ways: each of
    the three literals mutated, and — the mutation that matters — `node_modules`'s own
    `TintModes.js` edited to `ADD: 9` with the literal left alone. The e2e pin stays.

    🔴 **The skip path had a false green, and that is the reason to write this down.** The first
    version asked `createRequire(import.meta.url).resolve('phaser/package.json')`, copying the e2e
    pin. **Node resolution walks UP the directory tree**, so from a git worktree it found the parent
    checkout's install: `test:sim-isolated` reported **2150/2150 green with nothing skipped**, having
    pinned a copy of the engine that run was not using. Resolved from the project root instead, the
    isolated run reports **2147 passed | 3 skipped**, each naming itself on stderr. That is the
    *"detect greenness positively, including the COUNT"* rule arriving from a new direction: the
    count was right, and the run had still checked nothing.
35. **STILL NOT COVERED — the `?hitstop=` knob's upper bound is a judgement, not a measurement.**
    `MAX_HITSTOP_SCALE = 10` is chosen because `lethal` 9 × 10 = 90 ticks stops being a comparison of
    feel. Nothing measures where that line actually is.

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
45. **The storm holds a population; it does not measure a single triggered burst.** `sampleArm` waits
    for the population to land *before* sampling, so the frame that first constructs N particles is
    outside the window by construction. What is inside is the top-up — itself burst-shaped, because
    `EmitterSpec.lifespanTicks` is a scalar, so a whole `explode()` expires on one frame and the whole
    cap is re-exploded on the next, every 18 ticks for sparks, 45 for steam, 22 for dust, through the
    shipped call. Those spikes are what `MAX_EFFECT_FRAME_P95_MS` gates; every other bound in the file
    is a median and blind to them. The shipped *trigger* path deciding **when** to burst is criterion
    9.1's behavioural spec, not 9.5's.

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

---

## 9.5 — the bound-confirmation run sets

Written here because `effectBudget.ts` cites this heading, and because a docstring that cites
evidence which does not exist is worse than one that cites nothing *(C9, finding M3)*.

**There is no selection set for the three ceilings.** `MAX_EFFECT_FRAME_WORK_MS = 2.5`,
`MAX_EFFECT_WORK_DELTA_MS = 0.3` and `MAX_PER_PARTICLE_WORK_MS = 0.003` are derived from the frame
budget (16.67 / 6; 0.003 × 96 rounded up; 16.67 × 2 % / 96 rounded down) and no run had a say in any
of them. What follows is **confirmation only**, and the two sets are disjoint in time, in tree state
and in author.

### Set A — the gate round, 8 runs, `performance-engineer`, 2026-08-21

Taken after that round's sweep design was frozen, with no say in it. **8 / 8 green**, zero inversions
in 80 per-round observations (0→1024: +38 / −0 / =2; 1024→2048: +40 / −0 / =0).

| quantity | held-out range | bound | margin |
|---|---|---|---|
| half gap `d(0→1024)` | 0.40 – 0.70 ms | ≥ 0.2 | 2 – 3.5× |
| storm gap `d(0→2048)` | 0.90 – 1.50 ms | ≥ 0.2 | 4.5 – 7.5× |
| linearity spread | 1.0 – 1.4× | < 4 | ≥ 2.9× |
| per particle | ~0.0005 ms | ≤ 0.003 | ~6× |
| absolute `onWork` | 0.55 – 0.70 ms | ≤ 2.5 | ~3.6× |

### Set B — the fix round, 10 runs, task 11, 2026-08-22

Taken on the byte-frozen tree **after** every change in this section landed, including the shake now
being in every window. `MIN_SHAKEN_FRAME_FRACTION = 0.5` was fixed from the statistic before any of
these ran and none of them had a vote in it either.

**10 / 10 green**, 80–81 s each, `drawn 2048/2048/2048/2048/2048` at the top sweep point on every
round of every run, and the sweep ordered on every gap of all ten.

| quantity | held-out range | bound | margin |
|---|---|---|---|
| half gap `d(0→1024)` | 0.399 – 0.604 ms | ≥ 0.2 | 2.0 – 3.0× |
| storm gap `d(0→2048)` | 1.004 – 1.290 ms | ≥ 0.2 | 5.0 – 6.5× |
| linearity spread | 1.000 – 1.256× | < 4 | ≥ 3.2× |
| per particle | 0.00049 – 0.00063 ms | ≤ 0.003 | ≥ 4.8× |
| absolute `onWork` | 0.600 – 0.750 ms | ≤ 2.5 | 3.3 – 4.2× |
| paired delta at the shipped peak | 0.000 – 0.100 ms | ≤ 0.3 | ≥ 3× |
| `workP95Ms`, every ON window | 0.800 – 3.300 ms (n = 100) | ≤ 16 | ≥ 4.8× |
| **shaken frames** | **100.0 % of every one of 350 windows** | ≥ 50 % | 2× |

Two things worth reading off that table rather than only the margins. The **shaken-frame fraction is
100.0 % on all 350 windows with no spread at all** — which is what a 2-tick landing cycle against a
3-tick shake predicts, so the mechanism is doing what its arithmetic says and not something
approximate that happens to clear a floor. And the **absolute and per-particle figures land inside
set A's ranges** (0.55–0.70 ms and ~0.0005 ms) despite every window now carrying a shake set A's did
not, which is the measurement backing the claim in entry 44 that a shake's cost is under this clock's
grid.

### The fix round's mutation proofs — every new gate watched failing

One at a time, alone on the box, `npm run test:e2e -- --project=chromium-gpu -g "the worst case …"`.
Redness read **positively** from `1 failed` plus the named assertion text — never from an exit code,
never through a pipe. The three inherited proofs were **re-run** rather than assumed, because the
harness they run through changed.

| # | Mutation | Where | Result |
|---|---|---|---|
| 1 | `PERF_MUTATION=noshake` — the shake drive installed but not hopping | harness | **FAIL (1)** — *"sweep N=0, round 0: 0.0 % of this window's frames had the camera off its base"* |
| 2 | `camera.setPosition(baseX + x, baseY + y)` → `camera.setPosition(baseX, baseY)` | `src/scenes/gameEffects.ts` | **FAIL (1)** — same assertion, 0.0 %. The SHIPPED-code version of #1, and the one Guard 0c actually names |
| 3 | `PERF_MUTATION=stall` — `scene.scene.pause()` | harness | **FAIL (1)** in **60 s** — *"the 120-tick window did not close … 0 sim ticks and 121 animation frames"*. Unbounded, this is the 600 s hang |
| 4 | `PERF_MUTATION=scale0` (re-run) | harness | **FAIL (1)** — *"pair 0: the effects-on window drew no particles"* |
| 5 | `PERF_MUTATION=fleetscale0` (re-run) | harness | **FAIL (1)** — *"only 0 of 22 enemy bodies were drawn while this window ran"* |
| 6 | `PERF_MUTATION=storm8192` (re-run) | harness | **FAIL (1)** — *"the worst case — 20 enemies and 8192 particles — left the frame budget"*, `absolute 6.550 ms` |

Mutation 2 is the one worth reading twice. `noshake` proves the *guard* can see an absent shake;
mutation 2 proves it sees a **shipped shake that stopped working**, which is the failure the
assertion's sentence claims to cover. Reverted with `git checkout --` and verified per C12:
`grep -c "camera.setPosition(baseX + x, baseY + y);"` back to **1** (it was **0** under the
mutation), `grep -c "SCRATCH MUTATION"` **0**, `git status --short` showing only the intended files.

Asking the standing question of Guard 0c — *if the thing under test did nothing at all, would this
still pass?* — the answer is no, and the reason is mechanical: `applyShake` is the **only** writer of
`camera.x` / `camera.y` anywhere in `src/` (`grep -rn "camera.setPosition\|\.main\.x =" src/` returns
one call site), and the guard compares against `EffectAttachment.base()` rather than against a zero
it read for itself. The camera follow moves `scrollX`/`scrollY` and cannot satisfy it.

### The gate round's findings — every one applied or recorded

| # | Finding | Disposition |
|---|---|---|
| **C1** | the sweep statistic cannot order itself | **APPLIED** before this round — merged as `f829914`; re-confirmed green 10 / 10 in the baseline set and 10 / 10 in set B |
| **M1** | `MIN_HALF_STORM_WORK_DELTA_MS` was a second false red hiding behind the first | **APPLIED** in `f829914` (`halfN` is 1024); confirmed again here — the half gap never approached 0.2 in 20 runs |
| **M2** | 9.5 names shake and the frame carries none, undisclosed | **APPLIED** — the shake is measured (problem 1 above), Guard 0c enforces it, and 9.8 entries 43–45 state what is still narrowed |
| **M3** | two bounds cite run sets not in this log | **APPLIED** — both citations corrected in `effectBudget.ts`, both confirmation sets written up above; the unrecoverable "selection set" figures withdrawn rather than re-cited |
| **M4** | the divide-back's stated licence rests on a claim false on this tree | **APPLIED** — the *"orders monotonically across nine walks"* parenthesis corrected to the per-round evidence in §*"the measurement floor"*; the divide-back is **not** withdrawn, and the brief's reasoning for keeping it is recorded there |
| **N1** | G.7b: 1 failure in 8, GPU arm does not order at all | **RECORDED** — inherited Phase 8 criterion, out of this diff; the numbers are in §*"G.7b"* and the missing half-amplification floor is named there |
| **N2** | criterion 5.11 takes one window per arm | **RECORDED** — inherited Phase 5 criterion; the finding is file evidence (marked INFERRED by its author) and sits in §*"Criterion 5.11"* |
| **N3** | the sweep is mildly superlinear and the log's figure is stale | **APPLIED** — §*"the measurement floor"* now records 1.0–1.4× and states that superlinearity makes the reported ~0.06 ms an upper bound |
| **N4** | the shipped-peak paired delta comes back negative routinely | **RECORDED** — correct behaviour (`MAX_EFFECT_WORK_DELTA_MS` is a ceiling) and already disclosed at `effectBudget.ts`; seen again here, `-0.000` in the fix round's own runs |
| **nit** | the per-particle figure is machine-state dependent to a degree the docs do not admit | **RECORDED** — set B read 0.00049–0.00054 ms at 2048 where the old sweep read ~0.0012 at 1024 on the same box; the printed figure is a reading of this harness on this run, which is what `MAX_PER_PARTICLE_WORK_MS`'s 6× headroom absorbs |
| **9.6** | PASS, checklist verified item by item | no action |

The gate round's project-wide generalisation — *the failing shape is **reducing each arm to one
unpaired median and then subtracting or dividing**, with a quiet denominator as an aggravator rather
than the cause* — is **accepted and not re-argued here**. It is the right correction to the
"GPU ratios are suspect" version, and the evidence is that 9.5's own Guard 1 had the identical defect
with no ratio and no denominator anywhere in it.

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
