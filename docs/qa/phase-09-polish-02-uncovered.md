[← Phase 9 QA log index](phase-09-polish.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-09-polish.md)

---

## 9.8 — what the gates do NOT cover (draft, finalised at the gate)

> ✅ **The owner playtested the shipped game and accepts it — 2026-08-23, stated twice.** That is the
> `play`-owned sign-off for the feel questions in this list *(C4)*, and it is recorded as a human
> reading rather than an automated result. Items 1–4 below are **closed by it**: they are all "does
> this read right at play speed", and it does.
>
> ⚠️ **It does NOT close 5, 6 or 7**, which are measurement gaps a player cannot see, nor the four
> `play`-owned items in `SESSION-PROMPT-next.md §4` — 852×480, DPR 2, 240 Hz and the sentry-coverage
> question — because ordinary play cannot reach any of them.

1. **Whether 4 ticks reads as "solid" or "mushy".** No assertion distinguishes 3, 4 and 5 ticks.
   Owner picks blind from clips at three `?hitstop=` scales. **✅ Closed by the 2026-08-23 playtest.**
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

