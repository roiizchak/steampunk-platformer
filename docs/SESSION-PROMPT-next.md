# Next session — the bug-fix session

← [PRD spine](PRD.md) · [HANDOFF](HANDOFF.md) · [qa/phase-09-polish.md](qa/phase-09-polish.md)

> **This session fixes bugs. It does NOT start Phase 10.** Owner's ruling, 2026-08-22. Phase 10 is
> deferred; see §7. `main` is `a085d04`, pushed. Phase 9 is merged and owner-approved.
>
> This list came from a read-only sweep of every `🔴`/`⚠️` comment in `src/`, `tests/`, `tools/`, plus
> all 23 files in `docs/reviews/`, `docs/HANDOFF.md`, `docs/handoff/`, `docs/ENGINE-NOTES.md` and
> `docs/lessons/`. **Every claim marked ✅ was opened and read by the integrator** — the rest are the
> sweep's, and a sweep's summary is a claim, not evidence. **Verify before you fix.**
>
> ⚠️ **One sweep is still outstanding: the `docs/qa/` logs.** Phase 5's findings **R1–R8** are known
> to live there, recorded-not-fixed and never triaged (`docs/handoff/phase-06-owed.md:222-234` calls
> that *"an omission in my planning, not a deliberate deferral"*). **Read `docs/qa/` yourself before
> declaring this list complete.**

**Good news, established rather than assumed:** there is **no `test.skip`, `.only`, `test.fixme`,
`test.todo` or `.failing` anywhere** in `src/`, `tests/` or `tools/` — and no `TODO`, `FIXME`, `HACK`
or `XXX` either. A stray `.only` silently disables its whole file and is indistinguishable from a
pass. There isn't one.

---

## 0. How this session works

The failure mode of a fix session: you fix the symptom, the suite goes green, the defect remains.
Phase 9 found **twenty-two** gates that asked whether a value *came back* rather than whether it
could *do anything*.

1. **Every fix ships with a gate, watched failing first** *(C1)*. Build the mutation the fix's claim
   names — not the convenient one. Confirm the revert by "content changed AND the original count
   dropped by one" *(C12)*, never "the count is now zero".
2. **A bug reported by eye is closed by eye.** Measure pixels or count emissions, then show it. Keep
   the clip.
3. **Fix at the root.** Grep every caller before changing a function.
4. **Work the tiers in order.** If time runs short, the low tiers get dropped — say so explicitly
   rather than reporting the session done.
5. A defect you decide **not** to fix gets a one-line reason in `docs/qa/` *(C11)*. Most items below
   are *already* recorded non-fixes; re-affirming one is a valid outcome, silently skipping is not.
6. ⚠️ **Use `npm run test:e2e`, never `npx playwright test`.** ✅ VERIFIED at
   `tools/dev/free-port.mjs:35-37` + `package.json:17` — the zero-test guard lives **only** in the
   npm script (`globalSetup` runs after `webServer`; `webServer.command` never runs when the URL
   already answers). In Phase 9 the bypass silently zeroed **three consecutive control runs**, one
   deciding whether a merge had broken the game.

---

## TIER 1 — can break a playthrough. Fix these first.

### 1.1 ✅ A gear authored on a seam between two floor tiles is uncollectable

`src/game/tiledEntities.ts:95-101`. The burial check is:

```ts
gx > solid.x && gx < solid.x + solid.width && gy > solid.y && gy < solid.y + solid.height
```

**Strict inequalities against one rect at a time.** A gear at exactly `solid.x + solid.width` — the
seam between two adjacent floor rects — satisfies *neither* rect and passes the check. It then sits
inside collision geometry and can never be picked up. **With the gear cap, that is an uncompletable
level.** On a 96 px grid the seam is the *default* authoring outcome, not an edge case.

Second hole in the same check: it tests the gear's **authored point**, not its real `GEAR_BOX`
(72 × 72 world px). A gear whose box overlaps a solid while its point sits outside also passes.

`src/game/tiledPlacement.ts:41-42` records the same blindness and says Phase 8 "does now" own it —
**Phase 8 added gear-vs-enemy body-vs-body, not gear-vs-solid.** Latent on today's five
generator-authored levels; live for any hand-authored one.

### 1.2 ✅ Sentry bolts pass straight through walls

`src/sim/projectiles.ts:15-16`, conceded in the comment: *"No gravity, no collision against solids. A
shot that stops at a wall would be a better game and a worse first version."*

Deprioritised as backlog every session since Phase 5. The comment names the cost: the solid list, an
ordering decision against the player's own motion, and a second swept test. **The ordering decision
is the real work** — decide where it slots into the 14-step contract before writing anything, and
remember lettered inserts only.

### 1.3 ✅ The lifecycle spec contradicts its own docstring — resolve before trusting the suite

`tests/e2e/phase-06-lifecycle.spec.ts:186` heads a paragraph
``## 🔴 `test.fixme` — it FAILS, and the failure is a real defect, not a flaky test``, describing a
live bug: on a refusal *after* a successful boot the HUD is never stopped, the console carries
`TypeError: Cannot read properties of null (reading 'glTexture')`, and the render loop throws on
destroyed textures leaving **the HUD frozen on screen over the error screen**.

**Line 200 declares it as a plain `test(...)`, not `test.fixme(...)`** — and the suite runs 118
passed / 1 failed with the one failure being G.7b. So it is *passing*. Exactly one is true:

- the bug was fixed and nobody deleted the paragraph → **delete the paragraph**; or
- the test passes without detecting the bug → **the gate is decoration** *(C2)* and the defect ships.

The docstring says *"**Phase 7 owns it**"*. Phases 7, 8 and 9 have all shipped. **Drive it by hand
before believing either the comment or the green.**

### 1.4 A body that starts inside a solid keeps moving deeper into it

`docs/reviews/session-bugfix-perf-gates-impl.md:75` (finding 2b), verified real. `blockedAt` is
*"newly entered, not overlapping"*.

Deliberate, and the reason is load-bearing: an overlap test breaks the `EVERYWHERE` fixture and would
have trapped a shipped enemy at boot, and it is the same rule `resolveCollisions` uses for the player
— **changing one without the other puts the two bodies on different physics.** Treat as a paired
change or not at all.

---

## TIER 2 — wrong every time a player sees them

| | citation | what a player gets |
|---|---|---|
| 2.1 | measured off the shipped sheets | **The jump clip draws at 69% of idle height** — owner-reported. Detail in §3 |
| 2.2 | `docs/SESSION-11-PROMPT.md:45-50` · `HANDOFF.md:707` | **`brass-courier/fall` judders** — needs 9 frames, re-extraction fails gate G6 on frames 0–4, and *"the sheet shipping today never passed G6 either."* The same batch's `jump` is *"already known-bad"* — **2.1 and this are one art defect with two symptoms.** Unblocks: a keying tolerance (gate change, both-directions revalidation), an `ACCEPTED_EDGE_BLEED` entry (*"I do not think this one is honest yet"*), or a paid re-shoot ~$1.19 (**STOP-and-ask**) |
| 2.3 | `src/sim/player.ts:166-170` | **The player runs on the spot against a wall.** `movingHorizontally = dir !== 0 \|\| vx !== 0`, so holding into a wall cycles the run animation with zero travel. Not fixed *"in an audio phase"* because the term predates Phase 7 and changing it moves every locomotion assertion from Phase 2 on — a scheduling reason, and this is the session for it |
| 2.4 | `docs/HANDOFF.md:709` | **A chasing scavenger runs in place** — inside its dead zone or vetoed by the ledge probe it still returns `chase`, **violating foot-plant by 18 px per frame**, and because aggro is permanent it never stops. The real fix needs a stationary pose the scavenger does not have (`rust-scavenger/idle` was descoped) — **STOP-and-ask** on spend |
| 2.5 | ✅ `src/scenes/gameDev.ts:138` · called unguarded from `GameScene.ts:192` | **The help banner is illegible at the supported minimum.** `fontSize: '18px'` is ~8 physical px at 852×480, confirmed in a playtest screenshot. It also uses `setScrollFactor(0)` on a `GameScene` object, re-creating vault 6.1's pattern outside `UIScene` |
| 2.6 | `src/scenes/goalLayer.ts:137-140` | **The exit-gate pulse plays over an empty doorway** — it fires on `levelCompleted`, **20 ticks after** the player reached the door and one tick after the courier finished fading out. The *completed-it* flourish playing where the *reached-it* one belongs |
| 2.7 | `src/sim/enemyPlacement.ts:116-120` | **`SENTRY_MUZZLE` is measured off the sentry's IDLE pose, not its FIRE pose**, so shots leave from the wrong point whenever the poses differ. Named as **open work** |
| 2.8 | `src/sim/goal.ts:134-138` — **the only `ponytail:` in the repo** | **Foot-slide during the gate run-in**: the player stands still inside the dead zone while `playerView` still reports `run`. The comment names its own upgrade path — *a deceleration ramp over the last few ticks rather than a hard dead zone* |

---

## TIER 3 — visible, lower stakes, all already recorded

| | citation | what |
|---|---|---|
| 3.1 | `docs/qa/phase-09-polish.md:1650-1655` | **The landing shake and squash are drawn a tick apart.** `applyShake` uses the frame's `tickCount`, the squash uses `tick - 1`, so of `SHAKE.land`'s 3 ticks only **2** ever reach the screen — the shake is ~⅓ weak and starts a tick late relative to the squash. ⚠️ **This never reached HANDOFF's outstanding list; it exists only in the QA log.** Decide the phase deliberately; do not just align them, and move 9.2's `(landTick, landTick + span)` window with it |
| 3.2 | `docs/reviews/phase-09-impl.md:18` → `:42` (**RECORDED**) | **The player's own strike extends their i-frames.** Any freeze pauses `iFrameCounter`, including one caused by their own attack (`applyPlayerAttack` passes the player into `freezePair`). 27 actionable invulnerable ticks exist for it to happen in. Kept with a written ruling and a gate pinning current behaviour — **a decision to re-take, not an assumed bug.** If it goes, the gate must be inverted deliberately |
| 3.3 | `src/render/effects.ts:87-95` | **All three particle tints are grey-box guesses.** Criterion 9.8 owes a by-eye read on *"spark colour reading as brass-on-steel rather than generic orange"* — never done |
| 3.4 | `src/render/hud.ts:34-37` · `playerHud.ts:56-59` | `HUD_PLATE {413,128}` and `HUD_SLOT {132,48,239,33}` are by-eye, and **both files state no gate can catch a stale value** — a regenerated HUD silently draws a slightly-wrong plate and health fill |
| 3.5 | `src/sim/player.ts:155-164` · `docs/reviews/phase-07-impl.md:61,64,65` | **Footstep cue loses phase after a wall pin** — reversing away in the same gait restarts the stride count against a mid-cycle animation. C5 notes no test can assert the phase relationship without crossing the sim/render boundary: it is a listening judgement |
| 3.6 | `src/sim/audioCues.ts:76-81` | **No level-complete sting** (`levelCompleted` is in `SILENT_EDGES`). Needs a generated cue (fal spend) and `audio-cue-edges.test.ts` is at **exactly 400 lines**, so a tenth cue needs that file split first |
| 3.7 | `docs/reviews/phase-06-impl.md:126` (**Recorded**) | **A scene restart preserves an in-flight collect flyer** — the gear keeps flying across a freshly restarted level. Its test checks only liveness and child count |
| 3.8 | `docs/handoff/phase-06-owed.md:238-254` (item 13) | **Three UI items deferred to Phase 9 and never done**: no arrival punctuation on the gear counter (two weak cues instead of one clear one); the counter may sit **2–4 px high** (Phaser `Text` centres on ascent+descent, digits have no descenders); **3-digit zero padding `000`** reads as a placeholder when no level exceeds 99 gears (`level-01` ships 7) |
| 3.9 | `src/sim/movementLock.ts:31-35` | The hitstun knob reads **6**; the observed lock is **5 ticks** — `hurt` is armed at 9b and read at step 5 of the next tick, so `counter === 0` is never seen |
| 3.10 | `tools/gen/clipAdoption.mjs:101-105` | The shipped `brass-sentry/fire` clip has a **nearly-absent discharge** — the margin constraint was met by the model largely not firing. Declared *"because it is the round the gates must now judge, not because it is agreed to be better art"* |
| 3.11 | `tools/gen/motion.mjs:206-210` | **The run sheet repeats poses** (~13 distinct, 15 sampled). `gateMotionFloor` compares every frame to frame 0 and **cannot see adjacent duplicates** |
| 3.12 | `src/render/interpolate.ts:36-40` · `src/scenes/devMotionProbe.ts:15-22` | Interpolation costs up to one tick (16.7 ms) of input latency — **and the judder diagnosis it was built to fix was never proven.** The probe exists to falsify the hypothesis *before* building the fix; the fix ships and no comment records the probe's outcome |
| 3.13 | `docs/reviews/phase-04-impl.md:31` | `dropCastShadow`'s height guard **cannot distinguish a real art component ≤4% of the figure from a cast shadow**, so a dropped tool, spark or boot can be silently deleted from a generated frame. No-op on today's art only |

---

## TIER 4 — developer-facing defects and prose that contradicts the code · ✅ VERIFIED

This project has already been bitten: Phase 7's plan reached for a retired number and the Codex plan
review (F8) caught that *the number still written down was not the number still read.*

| | citation | says | is |
|---|---|---|---|
| 4.1 | ✅ `src/sim/playerTuning.ts:78` | *"Ticks each drawn locomotion frame is held. **Three**"* | `LOCOMOTION_TICKS_PER_FRAME = 2` on line 87 |
| 4.2 | `src/sim/playerTuning.ts:145-148` | table presented as current: `run 22.5 px / 3 ticks / speed 7.5` | live: `FOOT_PX_PER_FRAME.run = 18.0`, `ticksPerFrame = 2`, `runMax = 9.0`. Those are the **pre-re-shoot** 12-frame figures |
| 4.3 | `CLAUDE.md` line 23 | *"`run`'s stride is still provisional and is the number to distrust"* | still provisional but **dead since session 9** — nothing reads `stridePxPerCycle` for timing. Distrusting it points at the wrong number |
| 4.4 | ✅ `tests/e2e/phase-06-lifecycle.spec.ts:186` | the test is `fixme` and failing | plain `test(...)`, passing — §1.3 |
| 4.5 | `docs/reviews/phase-04-impl.md:26-28` | `ASSET-PIPELINE.md` promises `assets:fetch` and `assets:verify` | **neither exists in `package.json`**, and `build-assets.mjs` prints an error **telling the user to run a command that does not exist.** Left standing as *"a real, unfixed defect"* |
| 4.6 | `docs/reviews/phase-04-impl.md:29` | — | **Gym edits made before the async config fetch resolves are silently discarded** — `loadConfig` replaces the whole edit object and the readout then shows the file's value, so the loss is invisible rather than loud |

`tests/unit/foot-plant.test.ts` passes throughout because it asserts the **relation**
`ticksPerFrame × topSpeed === footPxPerFrame`, not the literals — the prose is entirely unguarded.
**Consider a gate pinning prose to constant.** Dead-but-exported: `MeasuredStrides`, `EnemyStrides`,
`strideTicks`, `stridePxPerCycle` (`animTiming.ts:193`, `:273`, `catalogTimings.d.mts:23`). Deleting
a **file** is STOP-and-ask; removing a dead export is not.

---

## TIER 5 — gate gaps. The suite is weaker than it looks.

> ⚠️ **Re-confirm each is still open before fixing.** Several predate the Codex fix round and the 9.2
> repair. Apply the mutation, watch the suite, then decide.

**Mutations demonstrated GREEN:** delete both `onStop` settles in `hudFade.ts` (3.1's fade never
force-settles) · delete `this.gearPop?.pop();` in `UIScene.ts` (its sole call site) · `blend NORMAL →
ADD` (a batch flush every frame, forever, invisible in a screenshot) · `reserve → 0` /
`maxAliveParticles → 10000` · `emitting: false → true` · drop the square in `perSecondSquared`
(gravity 60× weak) · the attack contact-frame **snap** (index pinned, behaviour not) ·
`PARTICLE_RADIUS 6 → 1`.

| | citation | the gap |
|---|---|---|
| 5.1 | `docs/handoff/next-session-prompt.md:90-91` · `docs/handoff/sessions-06-07.md:95-102` | **`verify-dist`'s bare-symbol greps cannot go red under minification.** esbuild removes module-scope dev names entirely — proven by removing the DEV guard, rebuilding, and watching `verify-dist ok` print anyway. **The gate meant to stop DEV code shipping cannot fire either way for module-scope code.** The fix is named and not built (an empty-body assertion, or Codex's `generateBundle` zero-rendered-bytes check, `HANDOFF.md:509-511`) |
| 5.2 | `docs/handoff/next-session-prompt.md:48-53` (**P4 open, MAJOR**) | **6.9's per-pair GPU noise.** ~1 window in 10 reads 0.7–1.2 ms against a 0.14 ms baseline, on *both* arms, independent of HUD state — individual pairs exceed the 0.2 ms bound by up to 5×. 23 clean runs, no false red *observed*, nothing proving one impossible |
| 5.3 | `docs/reviews/phase-09-impl.md:44` (**PARTIALLY APPLIED**) | Codex's algebra accepted as exact (`k = 0.9001`; reported `1.034b` vs true `3.914b` — **3.79×**) and the docstring corrected, but **the cost model and the `k = 0.9` floor were not changed.** If the renderer's cost is affine the reported per-particle figure is wrong by up to ~3.8× |
| 5.4 | `docs/reviews/phase-09-plan.md:55` (finding 4) | Criterion 9.5 says *"max enemies"* and **nothing caps concurrent enemies** — sim or level format. **One verification still owed**: read `docs/qa/phase-05-combat-08-gate-10.md:121` before recording the claim as fact |
| 5.5 | `src/render/spriteFeedback.ts:83-86` | `sheetGates.mjs`'s **G5 is blind to the contact-frame problem** — it asks only whether contact falls *inside* the active window; it lands on the window's **last two ticks**, inside and still the wrong frame to freeze |
| 5.6 | `src/sim/enemySentry.ts:77-81` | **The sentry-facing strobe is unseeable by any gate** — `setFlipX` does not restart an animation, so a frame-index assertion is blind |
| 5.7 | `tools/gen/gates.mjs:324-330` · `edgeGate.mjs:32-36` | **Four named art blind spots, all open** — cross-tile brass continuity, **anatomy (a third limb scores favourably on silhouette metrics)**, facing direction, readability at true sprite size. G6 passes a figure *missing a hand* |
| 5.8 | `tools/gen/buildChrome.mjs:95-105` | **The exit-gate one-component check is not enough and says so** — a doorway whose dark interior keys away returns a *ring*: one component, right size, passes, ships a see-through hole |
| 5.9 | `tests/unit/knob-sweep.test.ts:53-70` | **The sweep silently loses sensitivity whenever physics moves, and blames the knob rather than itself.** Happened three times in one session |
| 5.10 | `docs/reviews/phase-08-plan.md:147` | The soft-lock companion was broadened, but **full soft-lock coverage is a search problem and is not covered** — a shipped level can contain one the suite cannot see |
| 5.11 | `docs/reviews/phase-03-impl.md:94` | `resolveCollisions`'s **vertical-offset `LocalBox` case is untested** — correct today only because `PLAYER_BOX.y === 0`. A non-zero `y` gives silently wrong collision |
| 5.12 | `docs/reviews/phase-03-impl.md:97` | The Element Editor's *"overlay for every solid"* e2e is satisfiable by **one** rectangle (all three shipped platforms are `256×32`) |
| 5.13 | `docs/lessons/phase-02-player.md:24` | **`rollChance`'s `chance > 0` short-circuit is untested — mutation M9 survives.** A zero-probability roll perturbing the shared RNG stream would pass the determinism gate |
| 5.14 | `docs/reviews/session-bugfix-perf-gates-impl.md:76` | `createScavenger` accepts a **speed override nothing clamps** — high enough tunnels a thin wall. Not reachable from shipped data |
| 5.15 | `docs/reviews/phase-04-impl.md:34` | The centroid oracle **rounds to three decimals before an exact assertion** — a latent false **red** |
| 5.16 | `tools/gen/levels/shared.mjs:35-45` | The hazard-width ceiling has **two conflicting figures**, and the two shipped 480 px runs are **not flat crossings**, so 480 is confirmed by nothing shipped |
| 5.17 | `tests/unit/enemy-layer-catalog.test.ts:16-21` | The frame-0 guard's real failure mode — **a looping clip visibly frozen on screen** — is nominated as "Playwright's job" and **no e2e has taken it** |
| 5.18 | `tests/unit/file-size.test.ts:110-115` | Residual hole that **reopens whenever the ratchet is above 0** |
| 5.19 | `src/sim/goalGeometry.ts:91-94` · `src/sim/world.ts:84-86` | Nothing validates goal-rect height at load *"and it is the only one"*; `goal` defaults to `null`, so *"9d no-ops on null"* can silently become *"9d never fires"* |
| 5.20 | `src/scenes/gameDev.ts:126-131` | **No gate checks spacing BETWEEN HUD elements** — found once by a human reading evidence screenshots |
| 5.21 | `tests/e2e/phase-05-perf.spec.ts:152-157` | GPU cost is unmeasurable without `EXT_disjoint_timer_query`; the blind spot *"was recorded as unreachable twice and was reachable both times."* **DO NOT soften into a skip** |
| 5.22 | `src/scenes/gameInput.ts:53-56` | ESC → level menu is **not** gated on `isPlayerInputEnabled` — that flag is not the authority a reader would assume |
| 5.23 | `src/render/animTiming.ts:14-20` | The boundary claim was **false since Phase 5** — this file imports sim values. The enforced direction is checked mechanically; this one is not |
| 5.24 | `tools/gen/png.mjs:258-266` | The determinism claim was **overstated and narrowed** — byte-identical rebuilds hold for a **fixed toolchain** only |
| 5.25 | `docs/reviews/phase-05-impl.md:72` · `docs/handoff/sessions-02-03.md:114-117` | `motion.mjs` ↔ `motionCombat.mjs` have a **circular import with ordering fragility** — the wrong order yields a partially-initialised read that does not throw the way plain Node does. Protected only by a convention nothing enforces |
| 5.26 | `IMPACT_BY_FREEZE` · `hudGearPop.destroy()` · `spriteFeedback.ts:209,:32` | Totality depends on three freeze lengths being distinct with **no `size === 3` assertion** (a retune makes a light hit fire a `hurtVent`) · `destroy()`'s idle branch has no fixture and it is the common one (every resize) · cites the wrong test file *(C9)* |

### Engine hazards documented but ungated (`docs/ENGINE-NOTES.md`)

- **`:125-131`** — at `SHUTDOWN` time `scene.cameras.main` is `undefined`; an unguarded
  `setPosition` throws *inside* `Systems.shutdown`. Guarded by convention only; **no test forces a new
  shutdown handler to use the optional chain.**
- **`:142-148`** — **`setTintFill` is removed in Phaser 4 and does not throw**: it logs, returns
  `undefined`, typechecks at arity 0 and draws nothing. Mitigated by a comment at the one call site;
  **nothing greps the tree**, so a second call site reintroduces it silently.
- **`:174-178`** — `BaseTween.destroy()` runs **neither** callback, and `TweenManager.shutdown()`
  reaches it via `killAll()`, so **scene shutdown is a stop path with no force-settle.**
  `hudGearPop.destroy()` leaned on the callback and was silently a no-op there. Fixed for that one
  instance; the general rule is prose. Note the `hud-gear-pop` fake's `stop()` unconditionally calls
  `cfg.onStop?.()`, which real Phaser does not (`BaseTween.js:507-517`) — **a fixture re-implementing
  the contract it tests is §0's defect class, one layer down.**
- **`:78-85`, `:158-160`, `:52-56`, `:100-104`** — `TilemapGPULayer` installs a no-op Canvas renderer
  (draws nothing while collision tests stay green); tint is WebGL-only under a live `Phaser.AUTO`
  Canvas fallback; `Rectangle` has no `setFlipX`; solidity read from a *name* cannot be caught by a
  rename test. All worked around, none enforced for future code.

---

## 6. G.7b — the inherited perf gate

**Check its state first.** A repair was in flight: `git log --oneline main -5`, look for a
`worktree-agent-*` branch. **Re-verify before merging rather than trusting the report.**

`tests/e2e/phase-08-gate-perf.spec.ts:264`, a **Phase 8** criterion. Fails ~**3 runs in 8**, on `main`
too. Last failure had **both arms reading `0.0000 ms`**:

```
the per-exit cost measured at 20 copies (0.0000 ms) and at 40 (0.0000 ms) disagree by 25.6x.
```

Diagnosis settled in [qa/phase-09-polish.md](qa/phase-09-polish.md) § Vault-out §5: the failing shape
is **an UNPAIRED median per arm, subtracted or divided, when the effect is within a few timer
quanta**. `performance.now()` quantises to **0.1 ms** here. The repair is 9.5's and needs **both**
halves — pair the observations and take the median of per-round *deltas*, **and** separate the arms
far enough that the effect clears the grid. Pairing alone ordered only 4 runs in 6.

**Forbidden:** moving the bound, `test.skip`, deleting the gate.

---

## 7. Explicitly NOT in this session

- **Phase 10.** Deferred. When it starts it is blocked on a question escalated to the owner at
  `docs/reviews/gate-07-docs.md:96-101` and never answered — **where does this game ship to?** A
  hosted playable URL, or a handed-over `dist/`? Vault items 10.4 and 10.5 need a rollback command
  and a CSP configuration, both properties of a destination no document names; **10.6 is marked
  blocked.** Do not ask it this session and do not pick a target on the owner's behalf.
- **New features.** This session fixes what exists.

---

## 8. Already closed — do NOT re-chase these

Documents still describe these as open. They are not. Verified against `src/`.

| still written as open in | actual state |
|---|---|
| `HANDOFF.md:711` — sentry strobes `flipX` at 60 Hz | **Fixed** — `src/sim/enemySentry.ts:72-74`, now shares the scavenger's hold rule |
| `HANDOFF.md:710` — aggro survives your death | **Fixed** — `tick.ts:224-226` calls `releaseAggro` on respawn |
| `HANDOFF.md:653` — `brass-courier/death` cannot pack | **Resolved** — the sheet ships |
| `HANDOFF.md:708` — a 47.9 MB recording tracked in git | **Resolved** — `git ls-files` returns no `.mp4` |
| `HANDOFF.md:519-521` — `file-size.test.ts` asserts `<= 10` not `0` | **Closed** — `:324` now asserts `<= 0` |
| `docs/reviews/phase-05-impl.md:69` — 4.10 / 4.12 | **Closed** — only 4.2b and 4.27 remain (`HANDOFF.md:800-801`) |
| `session-gate-defects-impl.md:50-69` — 6.9 floor bracketed; pairs never counterbalanced | **Closed** — 7.7 rebuilt AB/BA balanced; `MAX_HUD_GPU_RATIO` deleted and replaced |
| `docs/handoff/phase-06-owed.md` items 1–9, 11, 12 | **Resolved 2026-08-16** per its own banner. Only item 10's DPR half (Tier 2.5) and item 13 (Tier 3.8) survive |
| `docs/reviews/phase-06-impl.md:58-60` (C3/C4/C5) | **Closed in round 2** — `:107` |

---

## 9. Standing constraints — none negotiable

- **Every agent that can touch files runs under `isolation: "worktree"`.** None merges its own work;
  none commits to `main`. Six Phase 8 agents corrupted the shared tree and a commit captured it.
- **A subagent's summary is a claim, not evidence.** Re-verify locally whatever it could not run.
- **Withhold findings between adversarial briefs** *(A7)*.
- **No new dependency.** `phaser@4.2.1` exact; dev `vite`, `typescript`, `vitest`,
  `@playwright/test`. Anything else: STOP and ask.
- **`src/sim/` imports nothing from Phaser**, no clock, no `Math.random`, no DOM, no Arcade Physics.
  Every duration is an integer count of 60 Hz ticks; every distance is pixels.
- **Do not renumber `src/sim/tick.ts`'s 14-step order.** Lettered inserts only.
- **No source file over 400 lines** without written justification in `docs/qa/`.
- **`window.__game` is closed at eight fields.**
- **STOP and ask** before: a new dependency · deleting a file · a fal batch over 5 generations · a
  ninth `__game` field · contradicting STYLE.md / PRD.md / LESSONS-APPLIED.md · renumbering the tick
  contract · merging to `main`.

### Testing rules

- **Watch every gate fail before trusting it** *(C1)*; confirm the revert by "content changed AND the
  original count dropped by one" *(C12)*.
- **Detect redness positively** from `Tests N failed` plus named specs; **detect greenness positively
  too, including the COUNT.** A zero exit through a pipe is `tail`'s exit, not the gate's.
- Drive mutation loops **from the shell**, never from a Node script.
- **One Playwright run at a time, nothing heavy beside it**, and **`npm run test:e2e`** (§0.6).
- **A perf bound is chosen on one set of runs and confirmed on a HELD-OUT set.** **Never attribute a
  perf red from one run per arm.**
- **The headless harness is not the frame rate** — SwiftShader inflates e2e ms ~21×.
- **Never `waitForTimeout`.** Wait on `window.__game.ready`.
- **Never re-derive an event edge from two samples of a level** — read the sim's stamp.

### Verification

```bash
npm run typecheck · npm test · npm run build · npm run test:sim-isolated · npm run test:e2e
```

Phase 9 closed at: typecheck clean · unit **2154 / 0 fail** (133 files) · build exit 0 with
`verify-dist ok: 5 level(s) and 11 audio file(s) byte-identical` · `test:sim-isolated` **2151 passed /
3 skipped** · e2e **118 passed / 1 failed** (G.7b). **Anything worse is a regression this session
caused.** Every fix should *raise* the unit count — one that lands without raising it probably
shipped without a gate.

---

## 10. Do not re-litigate — already decided

| | decided |
|---|---|
| Hit-stop shape | per-body integer tick counter; both bodies freeze the same count, the world keeps ticking. User ruling |
| The tick contract | 14 numbered steps, authoritative; Phase 9 added 4a/4b/4c and 9b/9c/9d as lettered inserts |
| `_actionScale` lives in the config | on purpose *(vault A5)*. `assets:build` reads it, never computes it |
| The perf failure shape | unpaired median per arm — **not** "a ratio with a quiet denominator". Written down, refuted, corrected |
| G.7b's attribution | **not** Phase 9's. Established across eight runs on both branches |
| The emit window | `hitTick >= cursor && hitTick < tick`. The old `(cursor, tick]` meant no spark, plume or vent ever fired. Do not "simplify" it back |
| Interpolation over extrapolation | costs latency but never has to snap back. The *diagnosis* is open (Tier 3.12); the *choice* is not |
| Process criteria can be green while the game is broken | recorded three times as structural. The `play`-owned criteria exist for exactly this |
