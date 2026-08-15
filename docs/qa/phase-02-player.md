[← QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-02-player.md) · [Codex reviews](../reviews/)

## Phase 2 — Player controller + Character Playground

**Branch:** `phase-02-player` · **Date:** 2026-08-06

Grey-box movement — run, jump, coyote time, jump buffering — built engine-free under `src/sim/`,
plus the `GameScene` Boot finally routes to and a dev-only `PlaygroundScene` for live tuning.
No art. Primitives only.

### Toolchain, as actually resolved

Unchanged from Phase 1. **No dependency was added.** The frozen list held: `phaser@4.2.1` exact,
plus `vite`, `typescript`, `vitest`, `@playwright/test`. Arcade Physics was considered and rejected
for reasons recorded below, which also meant no `physics` block was added to `gameConfig`.

### Decisions recorded

1. **Boot now routes to Game, and `ready` moved with it.** Phase 1 deliberately terminated in Boot
   and set `ready: true` itself, because there was nowhere to go. Now "the gate passed" and "the game
   is running" are different facts, so `BootScene.create()` ends in `this.scene.start('Game')` and
   `GameScene.create()` sets `ready`. The consequence is deliberate: if `GameScene` fails to
   construct, `ready` stays false with `bootError` null — the third state, a hang, distinguishable
   from both a clean boot and a refusal. Setting `ready` in Boot would report a broken game as good.
2. **`refuseToRoute()` now stops `Game` and `Playground`.** Only observable on a scene RESTART, which
   Phase 1 criterion 1.5 exercises: re-entering Boot while Game is running would otherwise leave a
   refused boot with a game still ticking behind the error screen, still publishing `player` and
   `tick`. A refusal that does not stop the game is cosmetic.
3. **Collision is a static rect list in sim world state** — floor plus two platforms with a gap.
   The gap is load-bearing, not scenery: coyote time can only be observed by walking off something,
   and a world with no ledge makes criterion 2.3 testable only through a "force ungrounded" hook,
   which fakes the precondition it is supposed to prove. Phase 3 replaces the SOURCE of the rects
   with Tiled data; the resolver is untouched.
4. **The Playground uses Q/E and Z/X, not the arrows** — a deliberate deviation from the execution
   plan, which said arrows. The whole point is retuning the feel *while running and jumping*, and the
   arrows are how you run. Rebinding movement to tune movement makes the scene useless for its one job.
5. **The player is `this.add.rectangle`, not a tinted texture.** Tint is WebGL-only in Phaser 4 and
   `gameConfig.type` is `Phaser.AUTO` with a live Canvas fallback, where a tinted `__WHITE` renders
   plain white and the feel check goes silently colourless.
6. **The `window.__game` surface was NOT extended.** It is closed at nine fields by a Phase 1 Codex
   ruling. `tick` and `player` went live; nothing was added. Where a test wanted a value the surface
   does not carry (the Playground's selected knob, the rendered rectangle's position), the test was
   rewritten to measure behaviour instead — see criterion 2.6 below.
7. **`src/render/cameraRig.ts` was deliberately not built.** Phase 2 §5 does not list it, and Phase 1
   deferred camera zoom to Phase 3; committing a zoom here would pre-empt that decision.
8. **A shared `tests/e2e/debugView.ts`.** A second e2e spec declaring `Window.__game` is a hard
   `TS2717` build failure the moment the two shapes differ, and two hand-maintained copies of one
   contract drift. Phase 1's spec now imports the type instead of declaring it.

### API notes this design is built on *(vault C10)*

Five facts below came from **invoking** the skills `phase-02-player.md` §2 names — `physics-arcade`,
`input-keyboard-mouse-touch`, `game-object-components`, `time-and-timers`,
`superpowers:test-driven-development` — before the plan was finalised, not from assuming. Each
replaced a choice that would otherwise have been made wrong. Silence would have read as skipping.

1. **Arcade Physics is rejected for the player, for a citable reason.** `Body.velocity` is
   px/**second**, integrated by `World.step` with its own `fps`, `fixedStep` and `timeScale`. Every
   one of those is a `deltaTime` multiply of exactly the kind vault 2.1 forbids, and
   `Phaser.Physics.Arcade` lives in `phaser`, which vault 1.1 forbids `src/sim/` importing at all.
   Phase 1's `gameConfig` has no `physics` block, so `this.physics` was never registered — rejecting
   it cost zero lines.
2. **The jump edge comes from the keyboard event, not `JustDown` polling.**
   `Phaser.Input.Keyboard.JustDown(key)` is a *consuming read* that resets when checked, so two
   readers in one frame lose the edge; polling `isDown` misses a press-and-release that happens
   entirely between two render frames. Both are the loss half of vault 2.4, arriving before the
   snapshot ever sees the press. Keys are registered with **`emitOnRepeat: false`** — the OS repeats
   a held key ~30x/second, and with repeats enabled every one would latch a fresh jump edge and
   holding the button would auto-bunny-hop through the buffer.
3. **`Rectangle` has no `setFlipX`.** Phaser 4's Flip component is mixed into Sprite and Image but
   **not** into Shape. The typechecker caught this, not a test. `desc.flipX` is still computed and
   unit-tested; the scene draws facing as a nose on the leading edge, so the decision stays exercised
   and visible instead of being parked until Phase 4 — where a mirrored hitbox first shows up as art
   that does not match its collision.
4. **Game Objects default to origin `0.5, 0.5`.** Vault 2.10's "+y up from the feet" is therefore not
   free: `playerRenderDesc` returns the origin explicitly and the scene applies `setOrigin(0.5, 1)`
   in one place, or the box floats half its height above the ground it is standing on.
5. **No `TimerEvent` or `Clock` anywhere near movement.** They run on wall-clock ms, honour
   `clock.timeScale`, and `addEvent` is deferred to the next frame's `preUpdate`. The accumulator
   uses only the `delta` argument of `update(time, delta)`, and it lives in the scene, never in
   `src/sim/`.

Sixth, operational: `addCapture('SPACE,LEFT,RIGHT,UP,DOWN,W,A,D')` — without it the browser scrolls
the page on arrows and space, which corrupts a Playwright key drive as well as the player's session.

### Measurements — things that were checked rather than assumed

| What | Measured | Note |
|---|---|---|
| Discrete-integrator apex | **150.30 px** (4.70 tiles) | from `jumpVelocity 16`, `gravity 0.9`, semi-implicit Euler |
| Apex measured in the browser | **150.3 px** | matches the prediction exactly; tolerance was ±2 px |
| Continuous `v²/2g` | 142.22 px | **8.08 px wrong** — vault 2.14's recorded error was 7.4 px |
| Full jump airtime | 65 ticks (1083 ms) | jump held |
| Short hop apex (released after 2 ticks) | 42.8 px (1.3 tiles) | `jumpCutDivisor: 3` |
| Ticks to top speed | 6 ticks (100 ms) | `runAccel 1.1`, `runMax 5.2` |
| Coyote window | 7 ticks (117 ms) | both endpoints asserted against the live knob |
| Jump-buffer window | 8 ticks (133 ms) | same mechanism, same assertions |
| Largest source file | `BootScene.ts` 362 lines | limit is 400; `tick.ts` is 260, `GameScene.ts` 199 |
| `dist/` occurrences of `__game` | **0** | the debug seam is still stripped from the production build |
| Sim suite with Phaser uninstalled | **64/64 pass** | criterion 2.7, via `npm run test:sim-isolated` |
| Character height on screen at zoom 1 | 46 px = **4.3 %** of 1080 | STYLE.md wants ~20 %; camera zoom is Phase 3's decision, unchanged |

**The apex number is the one worth carrying.** Substituting `v²/2g` for the discrete integrator would
have produced an 8.08 px error at a ±2 px tolerance — so the criterion would have failed, and the
temptation would have been to widen the tolerance. `player-movement.test.ts` therefore asserts the gap
still exceeds the tolerance, which means retuning cannot silently make the apex check vacuous.

**Headless visibility (vault B5) was checked, not assumed.** A headless browser can report itself
hidden and pause the engine loop, which would make every e2e movement assertion pass vacuously
against a frozen world. The first test in `phase-02-movement.spec.ts` asserts the tick count advances
before anything else runs. It does; no `disableVisibilityChange` was needed.

### Mutation evidence — every gate watched going red *(vault C1, C2, C3, C12)*

Phase 1 ran no mutation testing and explicitly deferred **C12** to this gate. Thirteen mutations,
each applied to source, run, and restored, with the apply AND the restore confirmed by counting the
exact string both ways.

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| M1 | coyote window guard deleted — the window spends its own arming tick *(Codex F5)* | **RED** — 2 failed / 5 passed | confirmed |
| M2 | landing guard deleted — the jump buffer loses its last tick | **RED** — 2 failed / 5 passed | confirmed |
| M3 | jump-buffer latch condition deleted — a stale press jumps forever | **RED** — 7 specs failed | confirmed |
| M4 | coyote latch condition deleted — no jump after leaving the ground | **RED** — 3 failed / 4 passed | confirmed |
| M5 | edge not cleared on consumption — vault 2.4 **REPLAY** | **RED** — 2 failed / 6 passed | confirmed |
| M6 | edge cleared because a frame ENDED, not because a tick took it — vault 2.4 **DROP** | **RED** — 1 failed / 7 passed | confirmed |
| M7 | per-tick RNG sample removed — vault 2.3 absent, helpers still fine *(Codex F3/F7b)* | **RED** — 2 failed / 7 passed | confirmed |
| M8 | a knob deleted together with its behaviour — the roster tripwire *(Codex F7a)* | **RED** — 3 failed / 11 passed | confirmed |
| M9 | `chance > 0` early-return deleted | **SURVIVED — see below** | confirmed |
| M10 | gravity nudged 5% — the discrete apex prediction must notice *(2.14)* | **RED** — 1 failed / 10 passed | confirmed |
| M11 | feet origin replaced by Phaser's centred default | **RED** — 1 failed / 6 passed | confirmed |
| M12 | flip derived from velocity instead of facing | **RED** — 1 failed / 6 passed | confirmed |
| M13 | `rollChance` PULLS from the stream instead of reading the tick sample | **RED** — 1 failed / 8 passed | confirmed |

**M9 survived, and is recorded rather than hidden *(vault C11)*.** Deleting the `chance > 0`
early-return from `rollChance` leaves `rng.test.ts` fully green. It is redundant *by construction*
here: a roll reads `world.tickRoll` instead of pulling from the stream, so `tickRoll < 0` already
returns false and nothing was going to advance anyway. It stays for two reasons — vault 2.3 states
the gate as a blocker and contradicting a blocker is a STOP-and-ask, not a cleanup; and the property
it protects **is** enforceable, which M13 proves. The line is untested; the guarantee is not.

#### The harness itself was the phase's clearest demonstration of C12

The first mutation harness verified "the mutation applied" by counting the ORIGINAL string and
requiring zero. That check is wrong when the mutant **contains** the original (M6: inserting a line
before `return total;`) and meaningless when the replacement is the **empty string** (M8: deleting a
knob). Both exits happened *after* the write, so the run reported M6 and M8 as "REFUSED" while both
were sitting applied in the working tree — `airFriction` stayed deleted from `DEFAULT_TUNING` and a
stray `input.jumpPressed = false` stayed in `advance()`. **The suite was green at that moment.** Had
the report been trusted, two mutations would have been recorded as cleared while the source was still
mutated. This is exactly the failure C12 names, reproduced without trying.

Two further harness defects, both of which would have manufactured false evidence:

- **Every mutation reported RED for the wrong reason.** A vitest spawned from a Node parent loses its
  runner context: every suite died at import with `TypeError: Cannot read properties of undefined
  (reading 'config')`, printing `Tests  no tests` and exiting non-zero. **A non-zero exit is not
  evidence a gate caught anything.** The fix is vault C13's lesson in a new place — drive the loop
  from the shell that works, and detect redness *positively* from `Tests N failed` plus named failing
  specs, never from an exit code.
- The corrected harness records `loadfail=0` for all thirteen runs, so every RED above is an
  assertion failure with a named failing spec.

The apply/restore check now is: **the file content changed, AND the original string count dropped by
exactly one** — verified in both directions.

Final proof that nothing survived: after all thirteen mutations, `git diff --stat` against the staged
tree reports **only `docs/QA-LOG.md` changed**. Every source file is byte-identical to its pre-mutation
state, and the full suite is 64/64 green.

#### Three more mutations, after the review briefs

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| M14 | `MAX_TICKS_PER_FRAME` cap removed from `drainTicks` | **RED** — 3 failed / 5 passed | confirmed |
| M15 | accumulator remainder discarded instead of carried | **RED** — 5 failed / 3 passed | confirmed |
| M16 | `emitOnRepeat: false` → `true` on every key | **RED** — 1 failed, at full parallelism | confirmed |

### Criteria 2.9 — the two review briefs, and what they found

Both ran on the staged diff, separately, with different questions *(vault A7)*.

**Brief 1 (verify the stated criteria)** returned **PASS on all six** it was assigned — 2.1, 2.2,
2.3, 2.4, 2.6, 2.7 — and re-ran each locally rather than reading it. It also confirmed the four
Global Constraints hold: no float-of-seconds duration in `src/sim/`, no frame-delta multiply inside
it, no file over 400 lines, and `scale` required / validated / never applied to velocity. Five
non-blocking notes; three applied, two accepted:

| Note | Disposition |
|---|---|
| `ticksToMs` in `src/sim/index.ts` is a dead export | **Applied** — now used by `PlaygroundScene` to show tick-count knobs in ms as well as ticks. Nobody has an intuition for "7 ticks" while tuning by hand; 117 ms is comparable to your own thumb. |
| `maxFallSpeed`'s upward perturbation contributes nothing — `longFall` ended before the clamp saturated | **Applied** — the scenario's floor moved to y=2400 and its length to 26 ticks, so the default clamp is reached around tick 19 and BOTH the halved and doubled cases are observable. Re-measured: both now move. |
| The apex oracle is a parallel re-implementation, not an independent one | **Accepted, recorded.** True, and the reason the `v²/2g` guard exists — it asserts the two integrators are still 8.08 px apart, so a shared misconception about the integrator would have to also survive that. A genuinely independent oracle would be a second integrator, which is the same code again. |
| The browser proof of 2.6 covers one knob (`runMax`); the other ten rest on a structural argument | **Accepted, recorded.** The unit sweep covers all eleven exhaustively, and `PlaygroundScene` builds its rows from `Object.keys(tuning)`, so the row list and the swept list cannot diverge. Measuring all eleven through the browser would be eleven times the runtime for no new failure mode. |
| `docs/QA-LOG.md` was unstaged, so a reviewer working from the staged diff could not see it | **Applied** — staged. |

**Brief 2 (how could this be wrong?)** returned **one MEDIUM finding**, three hypotheses it traced
and explicitly ruled out, and three things it could not check. The ruled-out traces are recorded
because they cost real effort and the next reviewer should not repeat them: the buffer/landing
boundary is uniform and correct at every `before` value; `discreteApexRise` does not compare code to
itself in the way the vault's root rule warns about; and no double-jump, stuck state or re-opening
coyote window could be constructed.

| Finding | Disposition |
|---|---|
| **MEDIUM** — the `MAX_TICKS_PER_FRAME` backlog-drop branch has no test and cannot have one inside a `Phaser.Scene` method | **Applied**, and it is the most valuable finding of either brief. The arithmetic moved to `src/game/frameClock.ts` — vault 2.12's own prescription, *"if a scene rule has an edge case, that's the move, not a browser test"* — and `tests/unit/frame-clock.test.ts` now covers the drop branch, the remainder carry, the boundary at exactly the cap, and a NaN/negative/infinite delta. M14 and M15 prove it can go red. It also surfaced a defect the finding did not name: a garbage `delta` (Phaser can emit one after a tab restore) made `ticks` NaN and would have silently stopped the loop for the rest of the session. |
| Could not check: whether Playwright emits OS-style key repeat | **Measured, and it does not** — see below. This one changed a test from decoration into a real gate. |
| Could not check: multi-solid tunnelling in `resolveCollisions` under solids narrower than one tick of travel | **Accepted as a known ceiling** — see *Deliberately not fixed*. |

#### The auto-repeat test was decoration, and the measurement is what showed it

Brief 2 could not verify whether Playwright's `page.keyboard.down()` produces key repeats. Measured:
**a three-second hold emits exactly ONE keydown.** So the test named *"holding jump does not
auto-repeat into a second jump"* could never have failed from the cause it was named for — vault
**C2** exactly, a gate that cannot go red. Phaser's own guard is real (`Key.onDown` emits `DOWN`
only when `!isDown`, or when `emitOnRepeat`), and instrumenting the live Key proved it: during a
synthetic burst, `key.repeats` climbed to 21 while `DOWN` emissions stayed at **1**.

The test now dispatches real repeat events and asserts the guard, and M16 proves it goes red.

#### A parallel-worker false green — vault B5 and C12 in the same failure

The rewritten test **still passed with the mutation applied**, and only on the first attempt. Run
serially it failed correctly. Reproduced deterministically:

| Workers | M16 applied | Result |
|---|---|---|
| 6 (default `fullyParallel`) | yes | **6 passed** — false green |
| 1 (`--workers=1`) | yes | 1 failed — correct |

Cause: the test waited `waitTicks(30)` after the repeat burst and then read the player's position
once. `waitTicks` guarantees *at least* N ticks, not exactly N — and under six workers each
cold-booting Phaser, the poll interval let the tick counter overshoot the entire 65-tick jump arc.
The player jumped, landed, and was back at rest before the assertion read anything.

This is vault **B5**'s *"a new spec broke three unrelated ones is usually contention, not a
regression"* meeting **C12**'s *"a mutation you have not confirmed applied is a false green"* — and
it is worse than either alone, because the mutation **was** confirmed applied, on disk and in the
served bundle. The confirmation was sound; the assertion's timing window was not.

Fixed by dispatching the burst and sampling the player's position **every animation frame inside the
page**, so no round-trip latency and no overshoot: per-frame sampling cannot miss a 65-tick arc.
M16 now fails at full parallelism.

### Criterion 2.11 — the Codex implementation review

Full report and triage in [reviews/phase-02-impl.md](../reviews/phase-02-impl.md). Six findings, **all
six applied**, and it opened with *"Phase 2 is not ready to report complete."* It was right.

| # | Finding | Sev | Applied as |
|---|---|---|---|
| I1 | The buffer does not implement the header's stated window definition, and its tests cannot tell the difference | **High** | The header now states the two windows **separately**; a new test asserts `jumpedAt === landedAt + 1`, pinning the accepting tick rather than its existence |
| I2 | `PlaygroundScene` is registered in production builds | **High** | `scene:` is now `import.meta.env.DEV ? [Boot, Game, Playground] : [Boot, Game]`, and the `P` binding is guarded the same way. Verified in `dist/` |
| I3 | Criterion 2.8 is unrun or unrecorded | **High** | Corrected in the report, not fixed by code — **the phase is reported failing on 2.8** |
| I4 | Movement state is published one tick behind the physics | Medium | `resolveState` moved from step 4 to step 11, after collision; new test + mutation M17 |
| I5 | Deleting `renderPlayer()` leaves every test green | Medium | New e2e reads the actual `Rectangle` through `__phaserGame`; mutation M18 |
| I6 | The accepted reason for keeping the apex oracle does not hold | Low | Added a **closed-form** discrete oracle derived algebraically from the contract |

Three more mutations, run after these fixes, all confirmed applied and restored:

| # | Mutation applied | Result | Restored |
|---|---|---|---|
| M17 | `resolveState` moved back before integration (revert of I4) | **RED** — 1 failed / 12 passed | confirmed |
| M18 | `playerRect.setPosition` deleted from `renderPlayer()` | **RED** — expected 616.2, received 470 (the spawn) | confirmed |
| — | *(M17's first attempt never applied: a syntax error in the harness script. The apply check caught it and reported `resolveStateBeforeIntegrate: false` — C12 doing its job.)* | | |

### The same test-design defect, three times

Three separate tests in this phase were written as *"advance N ticks, then read once"*, and all three
were wrong in the same way. `waitTicks` guarantees **at least** N ticks, never exactly N, and under
parallel workers a single Playwright round trip can cost more wall-clock than the entire window
being measured:

| Test | What the overshoot did |
|---|---|
| the Playground knob sweep | measured distance across a stretch of world the player had already left |
| the key-repeat guard | player jumped, landed and returned to rest before the assertion read — **false green with the mutation applied**, only at 6 workers |
| the jump arc | loop exited after one or two samples and never saw the descent — **false RED on correct code** |

**A wait expressed in ticks cannot bound a sampling window.** All three now sample inside the page,
once per animation frame, and return an aggregate. `gameHarness.ts` carries the warning so the next
spec does not rediscover it.

### QA gate results

| # | Criterion | Result |
|---|---|---|
| 2.1 | Hold Right → x increases monotonically | **PASS** — e2e, with a floor and ceiling from the live knob, plus a separate test that the DRAWN rectangle tracks the sim |
| 2.2 | Jump apex within ±2 px of the discrete-integrator prediction | **PASS** — measured 150.3 px against a predicted 150.30 px |
| 2.3 | Coyote fires in its window and not outside; fixture ≥ 2× the window | **PASS** — sweep to `2N + 2`, both endpoints from the live knob |
| 2.4 | Jump buffer: press before landing jumps; too early does not | **PASS** — both endpoints, plus the exact accepting tick |
| 2.5 | Deleting any latch turns a test red | **PASS** — 18 mutations, 17 red on named assertions, 1 recorded survivor |
| 2.6 | Every Playground knob moves an observable output | **PASS** — 11/11 in the unit sweep with a pinned roster, plus the scene driven in the browser |
| 2.7 | Sim suite runs with Phaser uninstalled | **PASS** — 75/75 with `phaser` removed, restored to 4.2.1 exact |
| 2.8 | Feel check in the browser: weighty, responsive, no input drops | **PASS, with one defect found and fixed** — played by the user; see below |
| 2.9 | No file > 400 lines; diff review and adversarial pass | **PASS** — largest file 387 lines; both briefs ran, findings applied or recorded |
| 2.10 | Codex plan review ran; every finding applied or recorded | **PASS** — 8 applied, 1 acknowledged, 1 rejected with a reason |
| 2.11 | Codex implementation review ran; every finding applied or recorded | **PASS** — 6 findings, 6 applied |

**Regression set:** Phase 1 criteria 1.1–1.7 and `phase-01-boot.spec.ts` — **PASS**, 13/13, with the
three documented success-path assertion amendments. All 20 e2e tests pass, three runs in a row.

### Criterion 2.8 — what playing it found *(vault C4)*

The user played it and reported no problem with weight, responsiveness or dropped input. What they
did report is the thing seventy-five unit tests and twenty browser tests could not have surfaced:

> *"I managed to adjust the settings when I'm on the playground, but for some of them I can't be
> sure it actually works or not because I didn't see any visual change."*

**That is vault A6 stated from the player's chair** — *"a slider that visibly exists reads as a
slider that visibly works."* The knob values themselves always updated on screen; what was missing
was any way to see a knob's EFFECT. Four are invisible while playing by their nature: `coyoteTicks`
and `jumpBufferTicks` are forgiveness windows you only notice at the exact edge of a ledge,
`airFriction` acts only while airborne with nothing held, and `jumpCutDivisor` only if you tap
rather than hold. Turning one of those looked identical to turning a dead knob.

`knob-sweep.test.ts` was green throughout, and correctly so — it proves each knob changes an
internal trajectory fingerprint. **That satisfied the criterion mechanically while missing its
point entirely**, which is the cleanest example in this project so far of why C4 exists.

Fixed by `src/sim/derived.ts` and a second Playground panel: eleven derived numbers — apex in px and
tiles, airtime, short hop, top speed, ticks to top speed, ground stop distance, air drift, terminal
fall speed, and both windows in milliseconds — each produced by running the real simulation in a
scratch world rather than by a formula that could drift from it. They update on the same frame the
knob does. Measured with gravity taken from 0.9 to 0.54: apex moves 150.3 px → 245.1 px (4.70 → 7.66
tiles) and airtime 65 → 81 ticks, both visible without leaving the menu.

`tests/unit/derived-feel.test.ts` now holds the Playground to the standard the sweep cannot:
**for every knob, at least one DISPLAYED number must move.** An internal fingerprint change is no
longer sufficient. The four knobs that motivated it are also asserted individually, so a regression
names which one.

**Phase 2 passes all eleven criteria.**

### What was rejected, and why *(vault C10)*

- **Arcade Physics**, for the player. px/second velocities integrated with `delta` inside
  `World.step` are the exact `deltaTime` multiply vault 2.1 forbids, and it lives in `phaser`, which
  vault 1.1 forbids `src/sim/` importing. Zero-line rejection: Phase 1's config had no `physics` block.
- **`Phaser.Input.Keyboard.JustDown`**, for the jump edge. A consuming read that resets when checked;
  two readers in one frame lose the edge.
- **Arrow keys for the Playground knobs**, which the execution plan specified. They are how you run,
  and the scene exists to retune the feel while running.
- **Extending the `window.__game` surface.** Closed at nine fields by a Phase 1 Codex ruling. Two
  tests wanted values it does not carry; both were rewritten to measure behaviour instead.
- **A tinted texture for the grey-box player.** Tint is WebGL-only; the game runs `Phaser.AUTO`.

### Deliberately not fixed *(vault C11)*

1. **The `chance > 0` gate in `rollChance` is untested** — mutation M9 survives. It is redundant by
   construction because rolls read the per-tick sample rather than advancing the stream. Kept
   because vault 2.3 states it as a blocker; the guarantee it protects is tested by M13.
2. **`resolveCollisions` can tunnel through solids narrower than one tick of travel.** Raised by
   adversarial brief 2, which could not construct a failing input for the current data and said so.
   Measured: the shipped solids are 280 px and 240 px wide against a `runMax` of 5.2 px/tick and a
   `maxFallSpeed` of 17 px/tick, so the margin is ~14× on the tightest axis. Phase 3 introduces
   tilemap geometry at `TILE_SIZE` 32 px, still ~1.9× the worst-case per-tick travel. Revisit if a
   moving platform or a thin hazard is ever authored.
3. **The Playground knob keys drop presses fired faster than one per frame.** Observed only when
   driven by Playwright at machine speed; a human cannot press Q or E twice inside 16 ms. The e2e
   spec waits two ticks between presses rather than the scene queuing them.
4. **Character size on screen is unchanged at 4.3 % of height** against STYLE.md's ~20 %. Camera zoom
   is Phase 3's decision and setting it here would pre-empt it — the same reason Phase 1 deferred it.

---

## Vault-out — Phase 2

What this phase learned that the vault did not already say.

**0. A knob-sweep test can be green while every knob is invisible.** The single most valuable
finding of the phase came from the user playing it for two minutes, not from any gate. All eleven knobs
passed `knob-sweep.test.ts` — each provably changed an internal trajectory — and four of them showed
the player nothing whatsoever when turned. **"The output moved" and "the player can see the output
move" are different claims, and vault A6 is about the second one.** Any tuning UI needs the derived
consequence displayed next to the control, or a working knob and a dead knob are indistinguishable
from the chair. This is C4's *"only playing it found this"* landing on a gate that was specifically
designed to prevent it.

**1. A wait expressed in ticks cannot bound a SAMPLING window.** Three tests in this phase were
written as *"advance N ticks, then read once"*, and all three were wrong. `waitTicks` guarantees at
least N ticks, never exactly N; under parallel Playwright workers one round trip can cost more
wall-clock than the whole window being measured. It produced a **false green with a mutation
applied** (the key-repeat guard, only at 6 workers, correct at 1) and a **false red on correct code**
(the jump arc, which exited before seeing the descent). The fix is structural, not a bigger timeout:
sample inside the page once per animation frame and return an aggregate. This extends vault **B5** —
*"a wait-until loop must check before it steps and must not step in chunks"* — with the sharper form:
**a tick-count bound is not a time bound, and a sampled property needs continuous sampling, not a
bounded wait followed by one read.**

**2. `emitOnRepeat: false` is load-bearing, and Playwright cannot test it by holding a key.**
Measured: `page.keyboard.down()` held for three seconds emits **exactly one** keydown. No repeats at
all. So the obvious test — hold jump, assert one jump — can never fail from the cause it names.
Phaser's guard is real (`Key.onDown` emits `DOWN` only when `!isDown`, or when `emitOnRepeat`), and
instrumenting the live Key proved it: `key.repeats` climbed to 21 while `DOWN` emissions stayed at 1.
Repeat behaviour has to be driven with dispatched `KeyboardEvent`s — and `keyCode` must be attached
with `Object.defineProperty` after construction, because Chromium ignores it in the constructor and
Phaser keys off it.

**3. C12's check was itself wrong in two ways, and both wrote the file before failing.** Verifying a
mutation by counting the ORIGINAL string and requiring zero is wrong when the mutant **contains** the
original, and meaningless when the replacement is the **empty string**. Both exits happened after the
write, so two mutations sat applied in a green tree while the report said "refused". The correct
check is **content changed AND the original count dropped by exactly one**, verified in both
directions. Separately: **a non-zero exit code is not evidence a gate caught anything** — a vitest
spawned from a Node parent loses its runner context and every suite dies at import, printing
`Tests  no tests` and exiting 1. Detect redness positively, from `Tests N failed` plus named failing
specs.

**4. The tick order's two windows needed two sentences, not one.** The plan review predicted an
off-by-one in coyote time (it was there). Fixing it revealed the same defect mirrored in the jump
buffer. Then the implementation review found the *header* was now wrong: the two windows genuinely
differ, because step 7 tests `grounded` as set by step 9 of the previous tick, so a buffered jump
fires the tick **after** touchdown. The tests could not see it because they asked *"did a jump
happen"* rather than *"on which tick"*. **An existence assertion cannot verify a timing claim** — and
a documented invariant needs a test that pins the exact tick, or the documentation drifts from the
code while everything stays green.

**5. `pixelArt`-era Phaser 4 notes for this phase.** `Rectangle` is a Shape and Shapes do **not**
mix in the Flip component — `setFlipX` does not exist on it, which the typechecker caught and no test
would have. Tint is WebGL-only, so a `Phaser.AUTO` game cannot use a tinted texture as a grey-box
primitive. Game Objects default to origin `0.5, 0.5`, so a feet-anchored convention must set
`setOrigin(0.5, 1)` explicitly.

**6. A "DEV ONLY" label in a document is not a build gate.** `PlaygroundScene` was marked DEV ONLY in
PRD.md's file structure and shipped in the production bundle anyway, with every gate green. No test
asserted its absence because Phase 10 owns that check — so the only reader positioned to catch it was
the one reviewing the whole diff against the whole PRD. **Every dev-only artifact needs its
`import.meta.env.DEV` guard written at the moment it is created**, not deferred to the phase that
audits the bundle.

**7. The discrete-vs-continuous apex gap is 8.08 px here** (150.30 discrete, 142.22 from `v²/2g`),
against a ±2 px tolerance and the vault's recorded 7.4 px error. The gap is now asserted to exceed
the tolerance, so retuning cannot silently make criterion 2.2 vacuous. Three derivations must agree:
a closed form (`n·v₀ − g·n(n−1)/2`), an iterative oracle, and the simulation.

**8. Renumber the contract while it is still free.** The state transition sat at step 4, before
integration, so every published state described the previous tick's position — visible on screen,
because the render colour reads `player.state` directly. Moving it to step 11 renumbered the contract
Phase 5 depends on, which is exactly what the plan review warned would be expensive later. It was
free now because nothing consumes the numbering yet. **The moment to fix an ordering contract is the
phase that creates it.**

---

