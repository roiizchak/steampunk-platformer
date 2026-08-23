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

**Every row below is UNRUN until its owner agent has run it, twice, per (A7).**

**Reconciled 2026-08-23** by the bug-fix session (inventory item 0.1), criterion by criterion against
the evidence sections in this file. The table had never been updated after the rounds ran, so it read
UNRUN for seven criteria whose rounds are written up below at `:448`, `:494`, `:529`, `:1063`,
`:1132`, `:1320` and `:1518`. **That was the easy half.** The hard half is that reconciling it
honestly does **not** turn most of those rows green — see §*"The reconciliation, and why Phase 9 is
still not done"* below the table.

| # | Criterion | Owner | Status |
|---|---|---|---|
| 9.1 | Hit-stop lives in the sim as integer ticks, not a tween | `code-reviewer` ×2 | **OWED.** The gate round ran and its mutation proofs are at `:448`; T1's re-mutations by the integrator are at `:108`. But the four blind briefs' write-up at `:529` names 9.3, 9.4, 9.7 and 9.9 as what they failed and does not record a verdict on this one either way. **A round with no recorded verdict is not a pass.** |
| 9.2 | No game logic sequenced off a tween completion | `code-reviewer` ×2 | **OWED.** Same as 9.1 — no verdict recorded by either brief. And its landing-shake gate was afterwards found **flaky ~1 run in 3** and repaired (`:1600`), with the repair's own red watched at `:1663`. The criterion has therefore changed since any brief looked at it. |
| 9.3 | Tweens tracked individually; no kill-by-target | `code-reviewer` ×2 | **RAN ×2 → FAILED.** `:529` — four blind briefs failed it. Findings closed in the fix round with their reds recorded. **No owner brief has re-run it against the fix**, which is the standard 9.5's row already applies to itself. |
| 9.4 | A fade force-settles its end value on stop as well as complete | `qa-expert` ×2 | **RAN ×2 → FAILED** (`:529`), findings closed in the fix round, then **RE-RUN against the fix → PASS** — recovered 2026-08-23, see [`phase-09-polish-qa-expert-brief-a.md`](phase-09-polish-qa-expert-brief-a.md), red proof executed both directions. ⚠️ And see the substitution note below — its observable subject changed mid-phase, so a re-run is against a different subject than the first run was. |
| 9.5 | Frame budget holds under worst case | `performance-engineer` ×2 | **RAN ×2 → FAIL twice.** Brief B (adversarial) FAILED it again on H1: the guard licensing the divide-back could not fire below `k = 3`. **All 11 findings applied or recorded 2026-08-22** — see §*"The 9.5 fix round #2"*. **Still UNRUN in the sense that matters: neither owner brief has re-run it against this fix.** |
| 9.6 | Measurement distinguishes "fast" from "not drawing" | `performance-engineer` ×2 | **RAN ×2 → PASS ×2**, checklist verified item by item by both briefs; brief B's one finding (L1, `inView` was an existence check) applied |
| 9.7 | Thresholds pinned as literals, fixtures both sides | `qa-expert` ×2 | **RAN ×2 → FAILED** (`:529`), findings closed in the fix round, then **RE-RUN against the fix → PASS** — recovered 2026-08-23, see [`phase-09-polish-qa-expert-brief-a.md`](phase-09-polish-qa-expert-brief-a.md); all 24 thresholds tabulated against vault 9.2's four parts. |
| 9.8 | What the gates do NOT cover is stated here | — | ✅ **PASS.** Drafted below and extended through every round (entries 25, 36, 37, 43–45, and the two written at `:1363`). Item 32 was closed by hands-on judgement and then **re-judged on the fixed build** because the first approval did not count (`:1485`, `:1562`). |
| 9.9 | No file > 400 lines; diff reviewed; adversarial pass | `code-reviewer` ×2 | **RAN ×2 → FAILED** (`:529`), findings closed in the fix round, **not re-run against the fix**. The line-count half is separately green and mechanical (`:1550`); the adversarial-pass half is what is owed. |
| 9.10 | Codex plan review ran; every finding applied or recorded | — | ✅ **PASS** — [phase-09-plan.md](../reviews/phase-09-plan.md), 4 blockers + 2 highs applied, 3 lows recorded |
| 9.11 | Codex implementation review ran on the diff | codex | ✅ **PASS** — `:1518`. Triage with a verdict per finding in [phase-09-impl.md](../reviews/phase-09-impl.md); five gates watched failing with the mutation each assertion names, reverted and confirmed per *(C1, C12)*; four verification runs green on the same tree (unit 2151|3, sim-isolated 2151|3, e2e 119, build `verify-dist ok`). |

### The reconciliation, and why Phase 9 is still not done

**Inventory item 0.1 asked for the table to be brought in line with what ran. It now is, and the
answer is not the comfortable one.** Four rows are substantiated; seven are owed.

| verdict | criteria | why |
|---|---|---|
| ✅ **PASS**, substantiated | 9.6 · 9.8 · 9.10 · 9.11 | each has a round with a **recorded verdict** and its evidence section cited in the row |
| **OWED — ran, failed, fixed, never re-run** | 9.3 · 9.4 · 9.5 · 9.7 · 9.9 | the four blind briefs at `:529` failed all of these; the fixes landed with their reds recorded; **no owner brief has looked at the result** |
| **OWED — no verdict either way** | 9.1 · 9.2 | the round ran, but `:529` records verdicts only for 9.3/9.4/9.7/9.9 and neither brief's write-up decides these |

**The standard applied here is the log's own.** 9.5's row was already written as *"RAN ×2 → FAIL
twice … all 11 findings applied or recorded … **still UNRUN in the sense that matters: neither owner
brief has re-run it against this fix**"* — and nothing distinguishes 9.3, 9.4, 9.7 or 9.9 from it.
Applying the standard to one criterion and not to its four siblings would be picking the answer
first.

**So `PRD.md:36` stays `—`.** Phase 9 is not marked done, and `docs-contract.test.ts` stays green for
the reason it always did rather than because the phase earned it. *(Global Constraints: a phase with
a failing or unrun criterion is reported failing, never as done.)*

**What this means about the merge.** The phase was merged to `main` and approved on a verbal report,
and the project's own authority does not corroborate it. That is item 0.1's finding stated plainly.
It is **not** a claim that the work is bad — the mutation proofs at `:448` and `:1320`, the
integrator's own re-mutations at `:104`, and the Codex round at `:1518` are as thorough as anything
in this repository. It is a claim that **the last step of the protocol was skipped**: agent-owned
criteria that FAILED were fixed and never handed back to their owners.

**What closing it costs.** One gate round: `code-reviewer` ×2 over 9.1, 9.2, 9.3, 9.9 and
`qa-expert` ×2 over 9.4, 9.7, plus `performance-engineer` ×2 over 9.5 against the fix round #2/#3
tree — each with two briefs *(A7)*, brief 1's findings withheld from brief 2. That is a session's
work and it is **not** this session's scope, so it is recorded here as owed rather than quietly
absorbed. *A QA-LOG row reading PASS is still a sentence a human wrote* (`QA-LOG.md:262`); this
section exists so nobody writes seven of them.

---

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

    🔴 **What this entry did NOT say, and Codex's implementation review (finding 6) was right that it
    should have: no gate verified the generated texture contained opaque pixels at all.** The
    *choice* of colour was disclosed as by-eye; the *existence* of any colour was ungated, and the
    two are not the same admission. `pen.fillStyle(spec.tint, 1)` -> `(spec.tint, 0)` made every
    particle in the game invisible with the whole suite green, 9.6 included, at `drawn 96 inView 96`
    on a real GPU. **CLOSED 2026-08-22** by `phase-09-draw.spec.ts`'s *"every generated dot is opaque
    at its centre and carries its spec tint"*, which reads the texture through
    `TextureManager.getPixel` and is watched red against both an alpha-0 and a wrong-colour mutation.
    The by-eye disclosure above stands unchanged — a gate can prove the dot is `0xf0b040`, never that
    `0xf0b040` is the right brass.
15. ~~**`lastAirVy` is sampled per frame, not per tick.**~~ **CLOSED 2026-08-22, and the entry
    understated the defect by a wide margin.** It recorded a one-frame magnitude error. Codex's
    implementation review (finding 7) pointed at the edge rather than the value, and running it
    confirmed **total loss**: the landing was inferred from `grounded` changing between `render()`
    calls, and `tick.ts`'s step 13 guarantees a buffered press fires the tick AFTER touchdown while
    step 7 clears `grounded` again — so a frame draining both ticks saw `false -> false` and the
    dust, the squash and the landing shake did not happen at all. Multi-tick frames get *more* common
    on slower hardware, i.e. on the Phase 10 release target. `PlayerSim.landedTick` and
    `landedFallSpeed` are stamped at step 10 beside the `events.landed` edge already decided there;
    `effects-behaviour.test.ts` drives one identical fall at one tick per frame and at two and
    asserts the arms agree. The stated reason not to fix it — *"adding a counter to `PlayerSim` would
    push `src/sim/types.ts` past 400 lines"* — was the 400-line rule distorting ownership, which is
    Codex finding 4's worst instance. `PlayerSim` moved whole to `src/sim/playerSim.ts`: split, not
    exempted.
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

---

## The 9.5 fix round #2 — the guard that licensed the divide-back could not fire

Criterion 9.5 was FAILED a second time by the adversarial `voltagent-qa-sec:performance-engineer`
brief (2 high, 5 medium, 4 low, 26 bounded runs). Its headline finding is the phase's house-style
defect landing in the one place 9.5's reported number depends on it.

### H1 — `MAX_LINEARITY_SPREAD` passed for every cost law from O(1) to O(N^2.99)

`MAX_LINEARITY_SPREAD = 4` was applied to two per-particle estimates taken at `SWEEP_ALIVE`'s top two
points — an amplification ratio of exactly **2x**. Write the cost law as `c·N^k`. Per-particle cost is
then `c·N^(k-1)`, two estimates a ratio `R` apart sit `R^|k-1|` apart, and

```
spread < 4   at R = 2   ⟺   |k - 1| < 2   ⟺   -1 < k < 3
```

So the guard could only fire for a cost law of `N^3` or steeper. **A cost completely independent of
the particle count — the exact case its own failure message described** (*"the cost does not scale
with the count, so dividing by it is not a per-particle figure"*) — lands at `spread = 2.0` and reads
as healthy. The clean spreads of 1.0–1.3 reported as evidence of linearity are `2^0.0` to `2^0.4`;
every value up to `2^2` would have looked identical.

Two docstrings (`effectBudget.ts` at the per-particle constant, and the spec's stated-limits block)
cited that guard as *"legal only while linear, and the spec asserts the linearity"*. The spec asserted
no such thing. Same shape as the covering gate that did not exist, disclosed in one docstring and
reproduced two docstrings later.

And the sweep is measurably **not** linear: the brief fitted `k ≈ 1.10–1.36` on five runs and 1.18
over 1024→8192, never 1.0. The dangerous region (`k < 1`, where the divide-back *understates* the
shipped cost) sat entirely inside the pass region.

### The ruling — replace the statistic, do not move the bound

Tightening 4 to a smaller number would be moving a bound on a derived quantity chosen to make the
arithmetic come out — the same error one layer along. What the divide-back actually depends on is
measured instead.

**The replacement statistic: the cost exponent `k` itself**, fitted from two sweep deltas
(`effectSweep.ts:costExponent`):

```
k = ln( sweepDelta(0, 8192) / sweepDelta(0, 1024) ) / ln(8192 / 1024)
```

**The band, and why it is a floor with no ceiling.** Per-particle cost is `c·N^(k-1)`, so dividing an
8192-particle delta back to the shipped 96 **over**-states the shipped figure at `k > 1` (safe) and
**under**-states it at `k < 1` (unsafe). That asymmetry is the whole band:

| bound | value | status |
|---|---|---|
| `MIN_COST_EXPONENT` | **0.9** | load-bearing — the divide-back is conservative only above 1 |
| ceiling | **none** | deliberate; see below |

`MIN_COST_EXPONENT` is derived from the claim plus the clock, and **no run had a vote in it** — it was
fixed before the first run of the new gate. The claim is `k ≥ 1`. One adverse `CLOCK_GRID_MS` step on
the low delta (~0.5–0.7 ms) is worth `ln(1 + 0.1/0.6)/ln(8)` ≈ **0.07–0.09** of `k`; the same step on
the high delta (~6 ms) is worth 0.008 and does not matter. 0.1 of `k` is therefore about one clock
step, and 0.9 is sized to survive the **same three-step adverse move of a median** that
`MIN_STORM_WORK_DELTA_MS` and `MIN_HALF_STORM_WORK_DELTA_MS` are set for. ~~The cost of the allowance
is bounded rather than waved away: at the floor exactly, the divide-back under-states by
`(8192/96)^0.1` = **1.5x**, against a `MAX_PER_PARTICLE_WORK_MS` sitting ~4x above the reading.~~
**CORRECTED 2026-08-22 — see entry 47.** That sentence is true only if the cost law really is
`c·N^k`. It was stated unconditionally, and it is the model-dependent half of the argument.

**There is no ceiling, and that is a decision.** Super-linearity makes the divide-back *pessimistic*,
which is the safe direction, and it is already gated — an exponent large enough to matter inflates
`perParticle` into `MAX_PER_PARTICLE_WORK_MS`, which fails. A ceiling would also be **decoration under
C2**: to drive `k` to 1.5 on this harness a fixture must add ~11 ms to the 8192 frame, and a frame
that expensive serves fewer animation frames than the window has sim ticks, so `sampleArm`'s *"the
machine did not keep up with the simulation"* precondition fires first. **No fixture can watch a
ceiling here go red**, so none ships. This is a deliberate deviation from the brief's suggestion that
a ceiling be added as a sanity check, and the reason is written here rather than left implicit.

### The instrument had to widen too — `SWEEP_ALIVE` is now `[0, 1024, 2048, 8192]`

`k` inherits the same arithmetic the old spread had: at a 2x span one clock step on the low delta is
worth `ln(1.2)/ln(2)` = **0.26** of `k`, which is a third of the whole band. Over the 8x span from
`HALF_ALIVE` to `STORM_ALIVE` it is **0.07–0.09**. This is the move `SWEEP_ALIVE`'s own history
already licensed — *"the N values have to separate instead, which is a change of instrument, not of
bound"*. 2048 stays as an ordering point for Guard 1. Cost: five more windows a run, ~10 s a round.

`STORM_ALIVE` is 8192 now, so the divide-back is taken from the *top* of the sweep — at `k > 1` the
higher the amplification the more the reported figure over-states the shipped one, which is the safe
direction. `HALF_ALIVE` is a **named** constant (`SWEEP_ALIVE[1]`) rather than `SWEEP_ALIVE[len-2]`:
that index is what silently drifted the half point from 512 to 1024 while its docstring went on
arguing 512, and a fourth sweep point would have drifted it again — to 2048, *away* from the shipped
96 instead of towards it.

### The selection set — three runs that had a say in nothing, but were looked at first

Clean, `chromium-gpu`, alone on the box, one run at a time, each read out of a redirected file.

| run | `d(0→1024)` | `d(0→8192)` | **k** | per particle @8192 | absolute | result |
|---|---|---|---|---|---|---|
| S1 | 0.700 | 6.900 | **1.100** | 0.00084 | 0.750 | `1 passed` of 1 |
| S2 | 0.700 | 7.100 | **1.114** | 0.00087 | 1.000 | `1 passed` of 1 |
| S3 | 0.700 | 6.700 | **1.086** | 0.00082 | 0.900 | `1 passed` of 1 |

### The HELD-OUT set — three runs with no say in any bound, reported separately

| run | `d(0→1024)` | `d(0→8192)` | **k** | per particle @8192 | absolute | result |
|---|---|---|---|---|---|---|
| H1 | 0.700 | 6.900 | **1.100** | 0.00084 | 0.950 | `1 passed` of 1 |
| H2 | 0.500 | 6.400 | **1.226** | 0.00078 | 0.800 | `1 passed` of 1 |
| H3 | 0.400 | 5.800 | **1.286** | 0.00071 | 0.950 | `1 passed` of 1 |

A seventh clean sweep rode inside the `storm8192` mutation run: **k = 1.086** from 0.700 / 6.700.

An **eighth**, from the full-suite run that closed the Codex implementation round (2026-08-22,
`119 passed` in 16.0m): **k = 1.057** from 0.400 ms at 1024 and 3.600 ms at 8192, `per particle
0.00044` (bound 0.003), `absolute 0.700` (bound 2.5). Still above 1 — which is the reading entry 47
turns on, because an affine cost law cannot produce it.

**Measured `k` over all seven: 1.086 – 1.286, never below 1.** The floor at 0.9 is cleared by
0.19–0.39, which is 3–4 clock steps of adverse movement on the low delta — the low delta would have
to read ~1.1 ms against an observed range of 0.400–0.700. `shaken frames 100.0–100.0 %` on all 280
windows; sweep ordered on every gap of every round of every run.

### Every gate watched failing — the mutation each assertion NAMES

| # | mutation | red? | verbatim |
|---|---|---|---|
| 1 | **`PERF_MUTATION=flatcost`** — a per-frame busy-wait of 1.5 ms whenever the storm is non-empty | **FAIL (1 of 1)** | *"the cost grows as N^0.629 between 1024 particles (2.000 ms) and 8192 (7.400 ms). Below N^1 the per-particle cost FALLS as the count rises…"* |
| 2 | `PERF_MUTATION=particlescale0`, now WIRED into this spec | **FAIL (1 of 1)** | *"pair 0: the effects-on window drew no particles"*, `drawn 0/0/0/0/0` at every sweep point |
| 3 | `PERF_MUTATION=noshake`, against the RAISED floor | **FAIL (1 of 1)** | *"sweep N=0, round 0: 0.0 % of this window's frames had the camera off its base … The fixture predicts 100 %; under 90 % …"* |
| 4 | `PERF_MUTATION=storm8192`, against the WIDENED sweep | **FAIL (1 of 1)** | *"the worst case — 20 enemies and 8192 particles — left the frame budget"*, `absolute 7.400 ms` |
| 5 | scratch: `installStorm`'s emit point → `view.x - 4000` | **FAIL (1 of 3)** in `phase-09-draw.spec.ts` | *"only 0 of the 96 submitted particles were inside the camera's world view"* |

**Mutation 1 is the one worth reading twice.** Every other guard passed on it — `drawn` 1024 / 2048 /
8192 at every sweep point, the ordering check, both premise floors, `absolute 2.450 ≤ 2.5`,
`per particle 0.00090 ≤ 0.003` — and only the exponent fired. **And the guard it replaces PASSES this
fixture**: `perParticle` 0.000903 against `perParticleHalf` 0.001221 is a spread of **1.35**, against
a bound of 4, at the old 2x ratio *and* at the widened one. That is the proof that the defect was the
statistic and not the ratio, rather than an argument for it.

Mutation 5 was a scratch edit, reverted with `git checkout --` and verified per **C12**: content
changed, then `grep -c "const x = view.x + view.width / 2;"` back to **1** (it was **0** under the
mutation) and `grep -c "SCRATCH MUTATION"` **0**. 🔴 That revert also discarded the round's own
uncommitted edits to `effectMutation.ts`, which had to be re-applied and re-typechecked — `git
checkout -- <file>` does not distinguish a scratch mutation from the work beside it.

`scale0`, `fleetscale0` and `stall` were **not** re-run: their code paths are untouched by this diff
and each is recorded failing in the gate round's proof table above. Recorded rather than re-proved.

### Every finding from the brief — applied or recorded

| # | finding | disposition |
|---|---|---|
| **H1** | the linearity guard cannot fire below `k = 3`, and the sweep is not linear | **APPLIED** — statistic replaced with the cost exponent, sweep widened to 8x, band derived and confirmed on a held-out set; both docstrings that claimed the spec asserted linearity corrected |
| **H2** | `particlescale0` runs the 9.5 spec clean and reports `1 passed` | **APPLIED** — wired into `phase-09-perf.spec.ts` **before** `setStorm` builds the population (a constant scale op is emit-only), watched failing, and `NAMED_MUTATIONS` now says in its own docstring that a registered name is not a wired proof |
| **M1** | Guard 2's docstring claims a draw premise it does not have — `scale0` passes it | **APPLIED** — docstring corrected to say it is a RESOLUTION premise, that `preUpdate` keeps ~half the per-particle cost alive under `scale0`, and that Guard 0 is the draw premise a future edit must not weaken |
| **M2** | `MIN_SHAKEN_FRAME_FRACTION = 0.5` is the boundary value of the nearest retune | **APPLIED** — raised to **0.9**, derived from the fixture's predicted 1.0 rather than placed on `land.durationTicks: 3 → 1`'s exact 50 %; re-watched failing under `noshake`; 280 held-out windows read 100.0 % |
| **M3** | the header claims Guard 0/0b re-take three of 9.6's checks, and they re-take one | **APPLIED** — header corrected to name the one, and the `inCameraList` gap marked **INFERRED** (it is inferred to red through the premise floor; it was not watched, and inferred is written down as inferred) |
| **M4** | the absolute bound's docstring names the level, the HUD and the player sprite, and nothing verifies any of them | **APPLIED as a disclosure** — `effectBudget.ts` now states which three loads are asserted and which three are not, that all three make the bound EASIER when absent, and that it is the one bound in the file they can move; added as §9.8 entry 46. **Not closed**: closing it means a fourth counter and a fourth mutation for loads no phase criterion names |
| **M5** | four docstring/code disagreements, all describing sweep points that no longer exist | **APPLIED** — all four corrected. The one that mattered (`MIN_HALF_STORM_WORK_DELTA_MS` justified from a 512 distribution while guarding 1024) is fixed structurally as well as in prose: `HALF_ALIVE` is a named constant now, so the index cannot drift the point again |
| **L1** | `expect(on.inView, 'every submitted particle was outside the camera').toBeGreaterThan(0)` names a failure it cannot detect | **APPLIED** — now a count (`>= MIN_DRAWN_AT_PEAK`) with a message that reads out both numbers; watched failing under mutation 5. Its *distinguishing* range is now proved too — round #3's `PERF_MUTATION=halfoffscreen` reads `drawn 96 inView 48`, red at `Expected >= 64` and GREEN under the restored `> 0` |
| **L2** | effective sensitivity: 4–5x headroom on three bounds, nothing between a 0.9 ms frame and a dropped one | **RECORDED** — every one of them is derived from a claim rather than fitted, and tightening a derived bound toward today's observation is the move this repo forbids; the headroom is the price of that and the readings are printed on every run |
| **L3** | *"the whole shipped feature costs roughly 0.06 ms"* is over-stated ~1.9x | **APPLIED** — withdrawn rather than restated. It multiplied a divided-back figure by 96, which at `k > 1` over-states; over-statement is right for a ceiling and wrong for a reported measurement. `MAX_EFFECT_WORK_DELTA_MS`'s own readings (0.000 or 0.100 ms per pair) are cited instead |
| **L4** | the shake fixture puts the player in a 30-landings-per-second cycle and entry 44 does not say so | **APPLIED** — added to entry 44 below |
| **G.7b / 5.11** | both reduce `Sample.gpuMedianMs` to a ratio of two such medians | **RECORDED, not repaired** — out of scope by instruction; brief B's diagnosis is written up below |

### The two §9.8 entries this round wrote

Both live with their siblings in §*"Added by the 9.5 fix round"* above, not here, so a narrowing has
one home: **new entry 46** (M4 — the level, the HUD and the player sprite are in the frame and
nothing verifies it) and an **addendum to entry 44** (L4 — the shake fixture's 30-landings-a-second
cadence).

### G.7b and criterion 5.11 — brief B's diagnosis, recorded and NOT repaired

Both are inherited criteria (Phase 8 and Phase 5) and out of scope for this diff. Recorded here
because the diagnosis is sharper than the one already above.

**The shape they share, in one sentence:** both take `Sample.gpuMedianMs` — an
`EXT_disjoint_timer_query` median whose run-to-run spread on this machine is comparable to or larger
than the effect being resolved — and both then reduce it to a **ratio of two such medians**, so the
noise enters twice and multiplicatively.

**G.7b: 3 failures in 8 interleaved runs, all three on the linearity spread, none on the premise.**
The 1-exit control spans **0.139–0.220 ms (±0.081)**. The effect the *half* amplification must resolve
is `20 × ~0.003` = **0.06 ms** — smaller than the control's own run-to-run spread. The *full*
amplification's `40 × ~0.003` = 0.19 ms separated on **8 of 8** (min margin 0.072 ms). So: at 40
copies the GPU arm resolves, at 20 it does not, and `perExitGpuHalf` floors to 0 whenever the half arm
lands under the control (2 of 8 runs), putting the spread at an epsilon-divided infinity. Worse, **the
CPU arm does not order on any of the 8 runs** — `1/21/41 exits` read `0.600/0.600/0.600`,
`0.500/0.500/0.500`, `0.600/0.600/0.600` — and on 4 of 8 `perExitWork` was exactly 0.0000, floored, so
`MAX_EXIT_WORK_MS = 0.05` passed because the value came back rather than because it was measured.

**And G.7b's bound is the same constant as H1's**, `MAX_LINEARITY_SPREAD = 4` over the same 2x ratio
(`HALF_COPIES = 20`, `MUTATION_COPIES = 40`) — the identical structural defect in two gates pointing
in opposite directions: in G.7b the half point cannot clear the noise so it **false-reds**; in 9.5 the
ratio was too small to order any cost law below `N^3` so it **false-greened**. A 2x amplification
ratio cannot support a linearity inference in either direction. Whoever takes G.7b on should read
`effectSweep.ts` first: 9.5's answer was to widen the ratio and replace the derived statistic, and the
same two moves apply.

**Criterion 5.11: 20 of 20 green across brief B's runs — its failure did not reproduce, but its cause
did.** `gpuMedianMs` for the same scene, back to back:

| run | baseline GPU | fleet GPU | ratio (bound < 5) |
|---|---|---|---|
| F03 | 0.210 | 0.383 | 1.82x |
| **F05** | 0.220 | **0.050** | **0.23x** |
| **F06** | 0.232 | **0.050** | **0.22x** |
| **F08** | **0.046** | 0.169 | **3.67x** |
| F10 | 0.136 | 0.135 | 0.99x |

Adding twenty on-screen enemies made the GPU **four times cheaper** twice, cost nothing once, and cost
3.67x once. The control alone spans 0.046–0.232 — a **5x swing in the denominator**, and F08 is one
adverse control draw from `MAX_GPU_RATIO = 5`. `gpuTimer.ts:46-56` already records this failure in an
earlier form (a bimodal baseline, 13x, supposedly fixed by moving to the `prerender`/`postrender`
bracket); the bimodality is smaller now and still larger than everything either gate measures.
Neither is repairable by moving a threshold.

### The standing question, asked of the new guard

*If the thing under test did nothing at all, would this still pass?* No, and the reason is mechanical
rather than argued: the exponent is computed from two deltas that Guards 2 and 2b have already floored
above the clock grid, and the one build where "the thing under test does nothing" — a frame whose cost
is independent of the particle count — is committed as `PERF_MUTATION=flatcost` and was watched
producing `k = 0.629` against a floor of 0.9, with every other assertion in the file green.

**This is the fourth rewrite of these perf gates, and each previous one produced the next defect.**
The one this round could not close is L1's distinguishing range, named above rather than left for the
fifth round to find — and closed by round #3 below.

---

## The 9.5/9.6 fix round #3 — L1's distinguishing range, closed

The one item round #2 left open. Its own author stated the gap plainly: *"L1's strengthened bound reds
under the fixture I built, but that fixture would red the old `> 0` form too, so its distinguishing
range — a partially off-camera storm — is unproved."* A strengthened bound proved only against a
mutation the **weak** form also caught has not been shown to be worth its own existence *(vault C2)*.

### The fixture that lives in the gap

`PERF_MUTATION=halfoffscreen`, committed — `tests/e2e/effectOffscreen.ts`, applied by
`phase-09-draw.spec.ts` **before** `setStorm` builds the population, the same ordering trap
`particlescale0` fell into twice. It offsets the storm's emit point **per kind**: `sparks` (32) and
`dust` (16) go 4000 px out, `steam` (48) stays at the view centre. `installStorm`'s loop gained one
term — `emitter.explode(deficit, x + (handle.offsets[kind] ?? 0), y)` — and nothing else moved: same
emitters, same caps, same shipped `explode`.

The 48/48 split is **structural, not tuned**. Both numbers are `EMITTER_SPECS`'s own
`maxAliveParticles`, so the split cannot drift with the harness or the box; `steam` is the kind left
in view because its 45-tick lifespan holds the steadiest population between top-ups; and 4000 px is
two view-widths at zoom 1 against a per-particle drift bounded by `speedMax x lifespanTicks` (162 px
for the fastest kind), so nothing can wander back in.

### Both halves, on the SAME fixture

| form | run | result | verbatim |
|---|---|---|---|
| **new** — `on.inView >= MIN_DRAWN_AT_PEAK` | `PERF_MUTATION=halfoffscreen`, 3 collected | **1 failed, 2 passed** | *"only 48 of the 96 submitted particles were inside the camera's world view"* · `Expected: >= 64` / `Received: 48` |
| **old** — `on.inView > 0`, temporarily restored | `PERF_MUTATION=halfoffscreen`, 3 collected | **3 passed (14.5 s)** | no failure of any kind |

Both runs read the identical sample line:

```
[9.6] ... | off drawn 0 inView 0 alive 0 emitters 3 rendered 3 | on drawn 96 inView 48 alive 96 emitters 3 rendered 3 | enemies drawn 2/2
```

`drawn 96` is what makes the fixture **distinguishing rather than merely red**: `drawn >= 64`,
`emittersDrawing`, `inCameraList` and both enemy assertions all PASS, and the inView count is the only
thing in the file that moves. The strengthening therefore catches a class of failure the `> 0` form
could not see, and it is no longer decoration. **L1 is closed.**

The scratch revert to the weak form was undone and verified per **C12**: content changed, the
`SCRATCH REVERT` marker back to **0** (was 1) and `toBeGreaterThanOrEqual(MIN_DRAWN_AT_PEAK)` back to
**2** (was 1 under the mutation), with `git diff` showing no change to the assertion at all.

### The standing question, asked of the FIXTURE this time

*If the thing under test did nothing at all, would this still pass?* If `setStormOffscreen` were
inert the run would report `inView 96` and pass — so the redness is itself the evidence it applied.
And it applied to exactly the kinds intended, not to "something": 48 is `sparks` + `dust` predicted
from `EMITTER_SPECS` before the run, matched to the particle.

left for the fifth round to find.

---

## 9.8 item 32 — CLOSED by hands-on judgement, 2026-08-22

The item read: *"STILL NOT COVERED — the visual result of the sprite feedback. Whether a 6-10 px
flinch READS as impact, whether the ADD-mode flash reads as a hit rather than as a glitch, and whether
3-on/3-off flicker reads as invulnerability are all hands-on questions with no metric."*

**They still have no metric, and that is the point** *(vault C4)*. The project's own rule is that a
playtest finds what gates cannot, and that a hands-on criterion is never reported done on automated
evidence. So this was not closed by a gate. It was closed by the owner watching it.

**Evidence:** `docs/evidence/phase-09/phase-09-juice-2026-08-22.webm`, one take, captured through `playwright-cli` against the real dev
build on a real GPU, and driven through the shipped keyboard path. Three segments, in order:

1. **Hurt** — the player stands beside the scavenger taking repeated contact hits, hp 100 -> 25.
   Exercises the ADD-mode hit flash, the hurt vent, the flinch offset and the 3-on/3-off i-frame
   flicker.
2. **Kill** — four swings, scavenger 60 -> 40 -> 20 -> 0. Impact sparks and the 4-tick light hit-stop
   on each landed hit, then the 9-tick lethal freeze and the death steam.
3. **Landings** — three drops from `y = 1450`, clearing `DUST_MIN_FALL_PX`, for the landing dust and
   the `land` shake.

**Verdict: APPROVED by the owner** — "looks good". The flinch reads as impact, the flash reads as a
hit rather than a glitch, and the flicker reads as invulnerability.

⚠️ **What this does NOT close.** This is one viewing on one machine at one scale, and the numbers
behind it (`FLINCH_LIFT`, `LAND_SQUASH_SX`, `IFRAME_FLICKER_ON`, `IFRAME_FLOOR_ALPHA`, the four shake
amplitudes) remain a **grey-box judgement pending the art pass**. Every one is pinned as a literal
with a fixture either side, so a retune reds and comes back here for a fresh look — which is the
protection this criterion actually has. The clip is the record of what "good" looked like on
2026-08-22, not a proof that the numbers are right in the abstract.

---

## Criterion 9.11 — the Codex implementation round, and what it cost to close

Triage table with a verdict per finding: `docs/reviews/phase-09-impl.md`. Entries 14, 15, 47, 48 and
49 above are the record; this section is the verification.

**Every gate written or changed in the round was watched failing with the mutation its assertion
names**, verbatim, then reverted and confirmed by "content changed AND the original count dropped by
one" *(C1, C12)*:

| gate | mutation | red |
|---|---|---|
| `phase-09-draw.spec.ts` — the dot is opaque | `particleTexture.ts:48` `fillStyle(spec.tint, 1)` -> `(spec.tint, 0)` | `1 failed, 2 passed` — *"fx-particle-sparks is TRANSPARENT at its centre"*. The two siblings passing IS Codex finding 2. |
| the same, colour half | `fillStyle(spec.tint, 1)` -> `fillStyle(0xffffff, 1)` | `1 failed, 2 passed` — *"fx-particle-sparks was baked in the wrong colour"* |
| `effects-behaviour.test.ts` — the multi-tick landing | the **pre-fix production code itself**: control arm 1 dust + squash, batched arm **0 dust, no squash** | that is finding 7, reproduced |
| `effects-behaviour.test.ts` — the emit window | the pre-fix `(cursor, tick]` window: zero explosions in the production order | entry 49 |
| `hitstop-frozen-counters.test.ts` — outgoing i-frames | `combat.ts` step 4b.1 `if (!held)` -> `if (true)` | *"i-frames advanced on frozen tick 1: expected 31 to be 30"* |

**Verification, all four green on the same tree:**

- `npx vitest run` — **2151 passed | 3 skipped (2154)**, 133 files. Baseline was 2147 | 3; the four
  new tests are the multi-tick landing, the gentle-touchdown squash, the emit window and the outgoing
  i-frame freeze.
- `npm run test:sim-isolated` — **2151 passed | 3 skipped (2154)**, `phaser@4.2.1` reinstalled. The
  round adds a file to `src/sim/` (`playerSim.ts`), so this is the one that matters.
- `npm run test:e2e` — **119 passed** in 16.0m, exit 0 read from a redirected file, count matched
  against the baseline of 119. Net zero: the pixel gate is added and the duplicated `TINT_MODE_ADD`
  pin removed. No re-run was needed — none of the three known-flaky specs fired.
- `npm run build` — `verify-dist ok: 5 level(s) and 11 audio file(s) shipped byte-identical, no
  DEV-only scene key or debug surface in 1 bundle(s)`.

**Nothing is over 400 lines.** `src/sim/types.ts` 320 (was 400) after `PlayerSim` moved to
`playerSim.ts`; `src/sim/tick.ts` 394 (was 400); `src/scenes/gameEffects.ts` 400;
`tests/e2e/phase-09-draw.spec.ts` 400; `tests/unit/effects-behaviour.test.ts` 322 after its fake
scene moved to `tests/unit/effects-fixtures.ts`. Entry 48 records what the rule cost this round.

**A note on capturing it, because it cost time and will again.** The first capture attempt produced no
attacks at all and the keyboard looked broken. It was not: the player had run into the goal, which
armed the level-complete sequence and set `GameScene.playerInputEnabled` to `false`. The game was
behaving exactly as designed. **A dead keyboard in a hands-on session is a game-state question before
it is a harness question** — check `playerInputEnabled` and `goalEntryTicks` first, and reload for a
clean world rather than restarting the scene, which does not reset player health.

---

## 9.8 item 32 — re-judged on the fixed build, and why the first approval did not count

The first clip (`docs/evidence/phase-09/phase-09-juice-2026-08-22.webm`) was approved on 2026-08-22 and
**that approval was invalid through no fault of the owner.** It was captured before the emit-window
fix, so no impact spark, no death plume and no hurt vent had ever fired in the shipped game — only the
landing dust and the camera shake were real. The caption offered with it named all of them.

**The integrator's error, stated plainly:** the effects were inferred from sim state — hp falling,
enemy hp falling, `frozen` flipping — and reported as though they had been seen. Nothing in that
capture confirmed a single particle reached the screen. It is the phase's own defect class, committed
in the evidence produced to close the phase's own hands-on criterion: *asking whether a value came back
rather than whether anything was drawn.*

**Re-captured on the fixed build** (`phase-09-juice-v2-2026-08-22.webm`), same three segments — hurt
100 -> 25, kill 60 -> 0, three landings — and this time the **live particle population was
instrumented rather than assumed**, sampled once per animation frame:

| emitter | peak alive |
|---|---|
| `sparks` | **18** |
| `steam` | **14** |
| `dust` | **14** |

All three non-zero. On the previous build the first two would have read **0**, which is precisely what
the instrumentation exists to say.

**Verdict: APPROVED by the owner on the re-capture** — "looks good".

**The rule this earns, and it belongs beside every other one this phase produced:** *evidence for a
visual criterion must measure the visual result.* A capture that proves the game reached the right
state proves nothing about whether it drew anything, and a caption that lists effects the capturer did
not verify is a false green wearing a video's clothes. The instrumented particle count is now the
minimum bar for this criterion's evidence.

The earlier clip is kept, deliberately, as the before half of the pair.

---

## Criterion 9.2's landing-shake gate was FLAKY — ~1 run in 3 — and the cause was the spec, not the sim (2026-08-22)

`tests/e2e/phase-09-polish.spec.ts` — *"the landing shake stays inside shakeWithinEnvelope and settles
to EXACTLY zero"* — failed two different ways on `bf3b280`: `peak > 0 … Received: 0` in the full-suite
run, and `TimeoutError: page.waitForFunction: Timeout 60000ms` alone. **A flaky gate on the phase's own
criterion cannot be reported passing**, so it was instrumented before anything was changed.

### The measurement that decided it

A per-frame probe recorded `world.tickCount`, `player.grounded`, `player.landedTick` and the applied
camera offset, one row per animation frame:

```
OBSERVED grounded-edge tick = 149   ACTUAL landedTick = 148     (run A)
OBSERVED grounded-edge tick = 150   ACTUAL landedTick = 148     (run B)
t=149 ox=0.39357732567026577 oy=-4.2710252547854894 | shakeOffset(149) = 0.3936, -4.2710   ✅ exact
t=150 ox=0.9688742287151018  oy=-1.9574770869342026 | shakeOffset(150) = 0.9689, -1.9575   ✅ exact
DELTAS 1,1,1,…(×61)…,1,2,1,2,2,2,3,2,3,3,4,3,3,3,4,3,3,4,3,3,3,4,3,3,3,3,3,4,3,4,3,3,4,3
RUN LENGTHS [64,2,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1]
```

The same deltas appear with **no input at all**, so this is the harness, not the game: **1 sim tick per
frame for about the first second after boot, then 3-4 ticks per frame indefinitely** (~18 fps under
SwiftShader).

### Root cause — the spec's driver, twice over. The sim stamp is correct.

`PlayerSim.landedTick` (commit `2d59d5b`) is **right**, and on every frame the harness caught inside the
window the drawn offset equalled `shakeOffset(SHAKE.land, tick, …)` to the bit. The game is fine.

1. **`peak > 0`.** The spec derived the landing tick by comparing `grounded` between two samples. A
   sample taken at `tickCount = N` reflects the ticks *before* `N`, so the inferred edge is one tick
   late at best and **3-4 ticks late at this frame rate** — while `SHAKE.land.durationTicks` is **3**.
   The inferred tick routinely pointed past the end of the shake it was meant to open, and every
   offset in the window was a legitimately settled zero.
2. **The timeout.** `waitFor(page, { kind: 'run', n: 12 })` asks for twelve *consecutive* gap-free
   ticks. After the opening burst the longest run this harness produces is **1**. On a loaded box the
   burst does not happen at all and the wait spends its whole 60 s.

### The fix

`Sample` carries `landedTick` off the same `__phaserGame` route `grounded` already used — **no ninth
`window.__game` field.** A new `WaitSpec` kind `landings` counts touchdowns off the stamp; `startHopping`
drives `HOPS = 6` full-height hops; `coveredLanding` selects the first touchdown the harness actually
sampled inside. **Every clause of that selector is about tick coverage — none reads `ox`/`oy`** — so
`peak > 0` stays falsifiable. The `run 12` wait is gone. Driver and selector live in `polishSeries.ts`,
which is the instrument side of the seam; the spec stayed under 400 lines by splitting, not exempting.

### Two further findings, one fixed and one recorded

- **The observable shake window is `(L, L+span)`, open at the bottom.** `gameEffects.render` arms on the
  frame whose `fresh(L) = [cursor, tick)` contains `L`, and that frame reports `tickCount ≥ L+1`, so the
  offset for tick `L` is **never rendered**: of `land`'s three ticks the renderer can only ever draw two.
  `applyShake(camera, tick)` uses the frame's `tickCount` while the landing squash three lines above it
  uses `tick - 1`. **Recorded, not changed** — a one-tick phase change to a shipped effect is a balance
  decision with its own gate, not part of unflaking a spec.
- **`toEqual` between a browser value and a Node value is not a safe assertion here.** `Math.sin` is
  *implementation-approximated* (ECMA-262 §21.3.2.30) and the two V8 builds disagree: measured in the
  page and in Node for the same argument, `Math.sin(405 * 12.9898)` is `0.9632082153419407` versus
  `…08` — **1 ULP**, and it red-flagged a correct camera on 1 run in 12. (Not the camera arithmetic:
  `effects.base()` is exactly `(0, 0)`, so `(0 + x) - 0 === x`.) Bounded at **1e-9 px**, six orders under
  the 1.536 px / 4.32 px peaks it guards; the `0.01 * cmd.ax` regression misses by 1.46 px.

### Watched failing *(C1, C12)*, verbatim, then reverted

| mutation | count | red on |
|---|---|---|
| `arm('land', …)` → `void player.landedTick;` | `arm(` 3 → 2 | `the camera must actually have MOVED during the shake — Expected: > 0, Received: 0` |
| `setPosition(baseX + 0.01 * x, …)` | `baseX + x, baseY + y` 1 → 0 | `t=90: drawn (0.0061…, -0.0341…) != shakeOffset(…) (0.6116…, -3.4119…) — Expected: < 1e-9, Received: 3.3777976512710315` |
| `player.landedTick = world.tickCount` → self-assign | 1 → 0 | the `landings` wait never satisfied |

All three reverted; `git diff src/` empty.

### Repetition, not one green run

**14 consecutive isolated runs of the fixed gate: 14 green, 0 red** (greenness read positively — the
`ok 1 … settles to EXACTLY zero` line *and* `1 passed`, never through a pipe). Before the fix the same
harness gave 11 green / 1 red in 12 with the ULP bug still present, and pass/pass/FAIL in 3 before that.
Full suite **119 passed**; unit **133 files / 2151 passed | 3 skipped**; build + `verify-dist` green.

### `phase-01-boot.spec.ts:50` — attributed to LOAD, not to Phase 9

The same full-suite run failed criterion 1.4 on a bare 30 s test timeout. It is not Phase 9's:

- Phase 9's branch diff (`080e3e8..bf3b280`) touches **zero** boot-path files — `BootScene.ts`,
  `bootAssets.ts`, `bootLevels.ts`, `main.ts` and `public/assets/index.json` are all unchanged.
- Measured today: **3.6, 3.6, 4.0, 4.0, 4.2 s** isolated, and **5.1 s as test #1 of the 119-test suite**,
  against a 30 s bound. A run that hits 30 s is 6× slower than the same test with nothing beside it.

This is the contention mode `playwright.config.ts` already documents, and the same note forbids the
"fix": **do not raise the bound** — one loose enough to survive a contended box is loose enough to hide
a genuine boot hang *(vault 1.4)*.

---

## Vault-out — Phase 9

**Status: written 2026-08-22, at the close of the phase. All eleven Phase 9 criteria are green;
one INHERITED gate (Phase 8's G.7b) is under repair and is not a Phase 9 criterion.** Vault-in
*(B1)* recorded that the vault had nothing on particle cost or frame budget. It still does not have
what follows, and this is the phase that had to pay for it.

Phase 9 found **twenty-two** gates of a single defect class, plus a shipped-game bug none of them
could see. Sections 1–3 are that class. Sections 4–6 are what the phase learned about measuring.

### 1. The defect class: a gate that asks whether a value CAME BACK, not whether it can DO anything

Every one of the twenty-two has the same shape. Something is counted, or returned, or found present
in a source file — and the gate treats presence as proof of function. The canonical instance is the
one Codex found, and it is worth stating exactly because the suite's own numbers argued the other way:

> Change `pen.fillStyle(spec.tint, 1)` to `pen.fillStyle(spec.tint, 0)` in `particleTexture.ts`.
> **Every particle texture in the game becomes fully transparent.** The unit suite stays 2150/2150
> green, and criterion 9.6 reports `drawn 96 inView 96` — **PASS**, on a real GPU.

The reason is mechanical and generalises: **Phaser submits a fully transparent quad exactly as
happily as an opaque one.** A draw-count gate measures *submission*. Nothing about visibility follows
from it. The three gates that were supposed to cover this each stopped one step short — one scanned
the function's *source text* for `spec.tint`, one read emitter/particle *alpha and scale*, one counted
*alive particles plus emitter `willRender`*. None read a pixel.

Closed by an actual pixel read (`phase-09-draw.spec.ts`), watched red against both that mutation and
`fillStyle(0xffffff, 1)`. **The generalisation: if a gate can be satisfied without the thing existing
on screen, it is not a gate about the screen.**

### 2. A decision function with no consumer is the same defect as a burst of zero particles

`spriteFeedback.ts` shipped with **221 source lines and a 306-line test file** — and **zero production
consumers**. Blanking all four function bodies left the game byte-identical on screen with the suite
green. It satisfied every assertion about itself and drew nothing.

This is the cost of the `src/render/` pattern, and it is worth paying with the guard rather than
avoiding: pulling decisions out of scenes is what makes their edge cases unit-testable, but a
decision nobody applies is invisible to exactly those tests. **Every module in `src/render/` now owes
a draw-path gate.** Two shapes, and the second is stronger — prefer it:

| shape | example | when |
|---|---|---|
| source text | `effects-draw-path.test.ts` | the scene names a Phaser value the test cannot construct |
| behavioural, against a fake scene | `enemy-feedback.test.ts` | the module takes Phaser as a *type* only |

### 3. The bug all twenty-two missed, and why the fixtures hid it

The emit window in `gameEffects.render` was `(cursor, tickCount]` while the stamps it compares against
are taken from the **pre-increment** count. The consequence, unnoticed through the entire phase:

> **No impact spark, death plume or hurt vent had ever fired in the shipped game.**

Two independent things kept it invisible, and each is its own lesson:

- **Every unit fixture bumped the tick count before stamping** — an ordering the game never performs.
  A fixture that sets up its state in a different order than production does is not testing production.
- **The perf gates drove `explode()` on the emitter handles directly**, from `installStorm`, bypassing
  `gameEffects.emit` entirely. So 9.5 and 9.6 measured *the storm*, never *the game*. The narrowing
  was disclosed in a comment that then cited a covering gate **which did not exist**.

Correcting to `fresh = hitTick >= cursor && hitTick < tick` reds six tests. **A disclosure that names
a covering gate must name one you have opened.**

### 4. A render-frame-derived edge is LOST whenever a frame drains several sim ticks

The landing edge was inferred in the render layer, from `grounded` changing between two render calls.
Driven directly:

| frame rate | result |
|---|---|
| 1 sim tick per frame | dust emits, player squashes |
| 2 sim ticks per frame | **zero particles, no squash, no shake** |

A buffered jump lands on one tick and jumps on the next; the jump clears `grounded`, so the renderer
observes `false -> false` and the whole event never happened. **This gets worse on faster release
hardware**, where multi-tick frames are the norm — the opposite of the direction people test in.

**The fix is the general one: stamp the event in the sim (`PlayerSim.landedTick`, step 10) and have
the renderer read the stamp. Never re-derive an edge from two samples of a level.** The same lesson
recurred one layer out when criterion 9.2's own spec inferred the same edge the same way and flaked
one run in three — this harness drains 3–4 ticks per frame while `SHAKE.land` lasts 3, so the inferred
edge routinely pointed *past the end of the shake*, and every offset it read was a legitimately
settled zero.

### 5. Perf: the shape that fails is an UNPAIRED median per arm, subtracted or divided

Four gates in this project have now failed this way — 6.9's GPU ratio (discarded), G.7b, 5.11, and
9.5's Guard 1. The first diagnosis written down was wrong and the correction is the valuable part:
it is **not** "a ratio with a quiet denominator". A quiet denominator is an aggravator. The cause is

> reducing each arm to a single **unpaired** median, then subtracting or dividing, when the effect is
> within a few timer quanta.

`performance.now()` quantises to **0.1 ms** on this machine, and that quantum is the root of nearly
every perf-gate failure recorded here. Guard 1 had **no denominator at all** and false-redded 5 runs
in 6.

**The repair is two things and both are needed:** pair the observations and take the median of
per-round *deltas*; and separate the arms far enough that the effect clears the grid. Pairing alone on
9.5's old sample points still ordered only 4 runs in 6. Sampling harder cannot rescue the old shape —
resolving a 0.06 ms gap against a 0.1 ms grid needs ~225 rounds, about six hours per run.

And two rules that cost real time here:

- **A statistic that cannot order its own mutation is not fixed by moving the bound.** 9.5's linearity
  guard reduced algebraically to `2^|k-1|` and could only fire at N-cubed or steeper. It was replaced,
  not retuned.
- **Never attribute a perf red from one run per arm.** I attributed G.7b to Phase 9 on exactly that,
  and was wrong: the tally across eight runs was 3 fail / 4 pass with the *failing direction
  inconsistent*, and the single-exit baseline ranges 0.036–0.152 ms — wider than the effect.

### 6. Detect GREENNESS positively, including the count

A Playwright run that selected **nothing** reports `expected: 0, unexpected: 0` and exits **0** —
indistinguishable from a clean pass unless you read the count. Every other testing rule in this
project assumes the tests ran; this is the one that checks. Corollaries paid for this phase:

- **A zero exit through a pipe is `tail`'s exit, not the gate's.**
- `test:sim-isolated` reported 2150/2150 with **nothing skipped** while pinning an engine that run was
  not using — `require.resolve` had walked up to the parent checkout's `node_modules`.

### 7. Two smaller ones worth keeping

- **`Math.sin` is implementation-approximated** (ECMA-262 §21.3.2.30). Chromium's V8 and Node's V8
  return values differing by **1 ULP** for the same argument, so a cross-engine `toEqual` on anything
  trigonometric red-flags a correct result about 1 run in 12. Bound it — 9.2 uses 1e-9 px, six orders
  under the peaks it guards.
- **A dead keyboard in a hands-on session is a game-state question before it is a harness question.**
  Input appeared broken during playtest; the player had run into the goal and `playerInputEnabled` was
  false.

### 8. Evidence for a visual criterion must MEASURE the visual result

The first juice clip approved for criterion 9.8 was captured on a build where the emit window bug of
section 3 was still live, so sparks and steam **were not on screen at all**. The caption named them
because the sim state (hp dropping, enemy hp falling) was read and the effects *inferred* from it.
Re-captured with instrumented per-effect particle counts printed as it ran — sparks 18, steam 14,
dust 14 — and the first approval was withdrawn rather than quietly superseded. **A visual criterion is
closed by measuring pixels or counting emissions, never by inferring them from the state that should
have caused them.**
