[← Phase 9 QA log index](phase-09-polish.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-09-polish.md)

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

## The close round — 2026-08-24, the six owner briefs Phase 9 was owed

**This is the step that was skipped.** Phase 9 was merged and approved on a verbal report; seven of
eleven criteria had been FAILED (or left with *no recorded verdict*), fixed, and never handed back to
their owners. This log priced closing it at *"one gate round: `code-reviewer` ×2 over 9.1, 9.2, 9.3,
9.9 and `qa-expert` ×2 over 9.4, 9.7, plus `performance-engineer` ×2 over 9.5"*. That is what ran.

**Six briefs, dispatched A-then-B, not in pairs.** The three verifying briefs ran in parallel; each
adversarial brief was launched only after its own partner returned, with the first brief's findings
**withheld** *(A7)* — PRD § The QA agent protocol says *"the second brief is run after the first
returns"*, and launching a pair together is a different mechanism wearing the same name. All six ran
under `isolation: "worktree"`.

⚠️ **Every deliverable was written to a path OUTSIDE the agent's worktree.** Last session recovered a
209-line brief from a dead worktree that nobody had copied out. Telling the next dispatcher to
remember is not a fix; giving the agent a path that survives its worktree is. Six briefs, six files,
zero recoveries needed.

### Verdicts

⚠️ **The `#` column here is deliberately bolded, and that is load-bearing.**
`docs-contract.test.ts` satisfies its "a QA-LOG row per criterion" check with a regex anchored on
`^| 9.x |`. The first draft of this table used the bare form — and it **weakened the contract**:
deleting the entire 9.5 row from the gate table above left the suite green, because this table
supplied a matching row. Watched, 2026-08-24. Bolding takes this table out of the regex's reach so
the gate table stays the single source, which is the second time in one session that prose about a
gate degraded the gate. Do not un-bold them.

| # | brief A (verify) | brief B (adversarial) | verdict |
|---|---|---|---|
| **9.1** | PASS | CONSTRUCTED (hypothetical — D1) | **PASS** |
| **9.2** | PASS on the criterion, HIGH finding on its gate | CONSTRUCTED ×2 — **one confirmed, one refuted by execution** | **PASS**, after a gate was built and a defect fixed |
| **9.3** | PASS | CONSTRUCTED (five scan bypasses — D4) | **PASS** |
| **9.4** | **PASS — on the FADE**, both settle paths mutation-proved | NONE FOUND | **PASS** |
| **9.5** | UNDETERMINED-PENDING-EXECUTION, lean PASS | CONSTRUCTED — **already disclosed** (D5) | **PASS, qualified by entries 43 and 44** |
| **9.7** | Construction PASS; redness explicitly NOT verified | NONE FOUND for the 8 examined | **PASS — redness now executed, six proofs below** |
| **9.9** | PASS on the line count; adversarial pass performed | CONSTRUCTED (clauses 2 and 3 have no mechanism — D6) | **PASS** |

**9.4 is the one to read twice.** It was open because an earlier brief verified the **gear pop** — a
substituted subject — and the owner failed it on precisely that split. This round's brief was told in
its dispatch that the subject is the fade, and that assessing the gear pop would repeat the error the
re-run exists to correct. It verified `src/scenes/hudFade.ts` / `tests/unit/hud-fade.test.ts` and
mutation-proved **both** settle paths: deleting `onStop: settleFade` reds *"a fade stopped a third of
the way through still ends at FADE_ALPHA"*; deleting `onComplete: settleFade` reds *"and on natural
completion too."* The adversarial brief then tried three further mutations and checked the test's fake
against real vendored Phaser (`BaseTween`, `Tween`, `TweenData`, `TweenBuilder`) to see whether the
fake's `stop()`/`onComplete` model diverges from the engine in a way that could hide a defect. It does
not, and nothing was found.

### What the round actually changed

**Two real defects, both from the adversarial half, both fixed and gated.**

**D2 — criterion 9.2 had no gate for what it says.** The `test.describe` block carrying its number
holds two tests — the landing shake's envelope and the emitters' depth band — and **neither involves
a tween**. Five `tweens.add` sites live in `src/`; none was covered. This is the same hole 9.3 had one
round earlier, and `tween-boundary.test.ts`'s header records the lesson verbatim: *"here there was no
gate at all."* 9.3 got a scan. 9.2 did not, and its verdict rested on a reviewer tabulating five
callbacks by hand — which is what both criteria already proved insufficient, because the criterion is
a property of the TREE and the next callback to be written is in nobody's diff.

`tests/unit/tween-callback-boundary.test.ts` closes it. It forbids **sequencing**, not callbacks:
criterion **9.4 positively requires** `onStop` + `onComplete`, so a gate banning them would contradict
a sibling criterion and would be edited rather than obeyed. It reads each tween config **and the
bodies of the named callbacks it points at** — three of the five live sites pass `settleFade`,
`settleLines` and `settle` by name, so an inline-only scan would report a clean sweep of files it
never opened. Watched red on the **real tree, through that named-reference path**:

| step | `tween-callback-boundary.test.ts` |
|---|---|
| pre | `PASS (6) FAIL (0)` |
| `scene.scene.start('GameScene')` planted inside `settleFade` | `PASS (5) FAIL (1)` — *"../../src/scenes/hudFade.ts: a scene transition"* |
| reverted | `PASS (6) FAIL (0)`, `git diff --stat` empty |

**D3 — `coveredLanding` selected landings its own assertion rejects.** The selector guaranteed more
than two samples in `[L+span, L+TAIL]`; the spec asserts more than two over `[L+span+1, L+TAIL]`,
because `applyShake` reads `tick - 1` so the frame reporting `L+span` is still drawing the last LIVE
tick. A landing with exactly three tail samples, one of them on `L+span`, was **selected and then
failed** *"the tail after the shake must have been sampled"* — a red naming a sampling shortfall while
the game is fine. Unreachable at the steady 3-4 tick frame gap measured 2026-08-22; reachable as soon
as gaps jitter, i.e. on a loaded box — this suite's documented failure mode, and the same class of
flake 9.2 has already been repaired for twice.

Pinned by `tests/unit/covered-landing.test.ts` as a **unit** test over the pure selector, because
reproducing it through Playwright means waiting on a frame-gap distribution nobody controls. It
asserts the **relation** between selector and spec, not the constant — asserting the constant would
have passed happily before the fix. Watched red against the real unfixed selector: `PASS (2) FAIL (1)`
— *"coveredLanding selected landing 100, whose settled tail holds only 2 sample(s)"* — then
`PASS (3) FAIL (0)` after the one-character fix.

### The Playwright proofs — 9.7's open half, executed

Brief A on 9.7 passed the **construction** of all 24 thresholds and said plainly that **no Playwright
ran**, so their **redness** was unproven. No agent in this round ran Playwright either: the suite
shares port 5173 and `test-results/`, only one run may exist at a time, and seven specs once failed
for no reason but three concurrent jobs. So every brief was required to write its requests as exact,
mechanically applicable edits, and **the integrator executed them serially**. That is the project's
standing rule — *re-verify locally what an agent could not run* — and it is what closes this half.

⚠️ **The verdict says who did what.** Brief A's *"I did not execute Playwright"* stands as written.
The owner briefs assessed construction and named their blind spots; **the integrator ran the
mutations.** This is a combined verdict, not an agent-executed one.

| # | mutation (shipped source, or a shipped fixture) | result | named failure |
|---|---|---|---|
| E1 | `src/sim/world.ts` — `hitstopScale: hitstopScale ?? 1` → `: 1` | **1 failed, 3 passed** | *"arm B (?hitstop=0): no tick after T0=62 may hold the body still"* — the query-string arm really does reach the sim end to end |
| E2 | `src/scenes/gameEffects.ts` — `applyShake(camera, tick - 1)` → `tick` | **1 failed, 3 passed** | *"t=90: drawn (0.6116…, -3.4119…) != shakeOffset(SHAKE.land, …)"* — the exact-offset loop reads the LIVE camera and catches a one-tick phase error against `ULP_PX = 1e-9` |
| E3 | `src/scenes/gameEmitters.ts` — `.setDepth(spec.depth)` → `.setDepth(13)` | **1 failed, 3 passed** | *"emitter fx-particle-sparks depth"* at `toBeLessThan(11)` — the drawn-depth read observes what the scene set, not the constant |
| E4 | `PERF_MUTATION=scale0` on `phase-09-draw.spec.ts` | **1 failed, 2 passed** | *"the effects-on arm submitted 0 particles to the batch while holding 96 alive"* — `alive 96 / drawn 0`, exactly the failure 9.6 exists for |
| E5 | `src/scenes/gameEffects.ts` — `arm('land', player.landedTick - 1, tick)` | **1 failed, 3 passed** | *"t=91: drawn (0, 0) != shakeOffset(SHAKE.land, …)"* — **this refutes brief B's 9.2 construction**, see D7 |
| E6 | `src/scenes/gameEffects.ts` — the shipped `applyShake` call deleted | **1 failed** | *"sweep N=0, round 0: 0.0 % of this window's frames had the camera off its base … under 90 % this is a frame budget measured with the third load missing from most of it"* — 9.5's shake-load guard fires on the CURRENT tree |

Every mutation reverted with `git diff --stat` empty; `phase-09-polish.spec.ts` was re-confirmed at
**4 selected, 4 passed** afterwards. Redness was read positively in every case — the named failing
test plus the count — never from an exit code, and every run went through `npm run test:e2e` so
`portGuard` could clear the dev server Windows leaves behind.

**E6 is the one that discharges brief A on 9.5.** Its top-ranked concern was that this log's mutation
evidence dates from 2026-08-22 while `gameEffects.ts` — the exact file the sharpest proof edits —
changed again on 2026-08-23 (`8c9d0fc`, the shake tick-alignment fix), *after* the write-up. The proof
was re-run against the post-`8c9d0fc` tree and holds.

### Findings, and what was done with each *(C11)*

| id | finding | disposition |
|---|---|---|
| **D1** | 9.1's *negative* half (*"not a tween"*) is carried only by `sim-boundary.test.ts`, which forbids a tween inside `src/sim/`. A freeze re-implemented scene-side as an `addCounter` writing `world.player.{x,y,vx,vy}` would keep every gate green | **RECORDED, not fixed.** The construction requires writing code that does not exist; the criterion is a property of the current tree, which satisfies it — one integer deadline in `src/sim/hitstop.ts` with six real consumers. Gating *"no scene-side write into the sim world"* is a **new architectural rule**, not a Phase 9 criterion, and this phase's own e2e harness does exactly that deliberately (`tests/e2e/effectShake.ts`). Raising it needs the owner |
| **D2** | 9.2 had no gate for the criterion as written | **FIXED** — `tween-callback-boundary.test.ts`, watched red on the real tree |
| **D3** | `coveredLanding`'s tail bound was one tick wider than the assertion consuming it | **FIXED** — `covered-landing.test.ts`, watched red before the fix |
| **D4** | 9.3's scan has five bypasses: `getTweensOf` + destroy inlined (literally how Phaser defines `killTweensOf`), `tweens['killTweensOf']`, `tweens.destroy()`, the four other tween entry points, and `noop(this.tweens.add({…}))` classified as held | **RECORDED, not fixed.** Real limits of a regex scan, and each closure widens the false-RED surface on a rule this vault says gets weakened rather than obeyed when it fires wrongly. **None is present on this tree** — verified. A brittle gate is worse than none; recorded so the next reader knows the scan's reach rather than assuming it total |
| **D5** | 9.5's measured frame carries **no combat**: `installStorm` holds the player invulnerable in every arm, and the shake armed is `SHAKE.land`, smallest of the four commands. `light`, `lethal` and `playerHurt` are never in a sampled window | **ALREADY RECORDED — 9.8 entries 43 and 44**, which state it directly, give the mechanism (`atLimit()` drops rather than evicts, so real bursts invert the sweep), and concede the defence is *"an argument and not a measurement"*. The adversarial brief rediscovered a deliberate, disclosed limitation. **9.5's verdict is qualified by it**, not silently green |
| **D6** | 9.9's clauses two and three — *"diff reviewed; adversarial pass"* — have no mechanism at all | **RECORDED, inherent.** Both are human acts; the line-count clause is the mechanisable one and is green (`file-size.test.ts`). The adversarial pass was performed **by this round** — the clause discharging itself |
| **D7** | 9.2 could pass with a landing shake armed one tick early, because `shakeOffset` is keyed on the absolute tick, so shifting the start leaves the waveform unmoved | **REFUTED BY EXECUTION (E5).** The construction missed that shifting the start shifts *which ticks are live*: the window's tail then draws `(0, 0)` where the oracle expects motion, and the same 1e-9 loop catches it. Recorded because a refuted construction is a result — this gate is now known not to be phase-blind |
| **D8** | Shake **arbitration** read index `tick` (`gameEffects.ts:182`) while shake **drawing** reads `tick - 1` (`:298`). Inventory 3.1 aligned `applyShake` and `landSquash` and left `shouldPreempt` behind, so arbitration judged a running shake one tick more decayed than it was drawn | ✅ **FIXED 2026-08-24, owner-approved as a balance change.** Confirmed independently by the Codex implementation review. The call site now passes `tick - 1`, so arbitration judges the shake it draws. **Direction is the safe one**: energy decays, so reading one tick earlier reads HIGHER, so a small event finds a running big one *harder* to truncate — which is the preemption rule `screenShake.ts`'s header argues for. Gated by `tests/unit/shake-arbitration-index.test.ts` as a **pair**: a decision test proving the index is observable at all (without it the source gate would pin a distinction with no consequence), plus a source gate pinning which index ships. Watched red: `PASS (4) FAIL (0)` → revert the fix → `PASS (3) FAIL (1)` naming *"D8 is back"* → restored → `PASS (4) FAIL (0)`. ⚠️ **A balance change wants a fresh playtest** — the 2026-08-23 acceptance predates it. |
| **D9** | `phase-09-polish.spec.ts`'s `brawlArm` carries `waitFor({kind:'run', n: 8})`, the construct `polishSeries.ts` names as 9.2's flake cause with *"Do not add a `run` wait to a new test"* | ❌ **UPGRADED MID-SESSION: recorded as fragile, then OBSERVED FAILING.** I recorded this as *"it has not flaked across the full-suite runs on record"* — and the very next full sweep failed it: *"No usable hit in 61 ticks … 1 drop(s): [62]"*, a **sampling** shortfall, not a behaviour failure. It passed in isolation minutes later (7 selected, 7 passed), so it is load-sensitive exactly as `polishSeries.ts` predicts: after the first second this harness runs 3-4 ticks per frame, so a run of 8 is satisfiable only out of the opening burst, and a loaded box shortens that burst. **Owed work, no longer a recorded non-fix.** The repair is the one 9.2 already had: ask for the condition the reduction needs, not for contiguity. Not taken this session because 9.5 already blocks the phase and replacing a wait on a green-in-isolation spec is how the last flake was introduced. |
| **D10** | `MAX_LINEARITY_SPREAD` appears in the recovered brief A's 24-threshold table but no longer exists as a live declaration | **RECORDED as a stale citation** in that brief. The threshold was replaced by the cost-exponent statistic in the second 9.5 fix round; the table predates the replacement. No gate reads it |
| **D11** | Six files sit at **exactly** 400 lines with zero headroom, and `gameEffects.ts` cites *"GameScene.ts sits at exactly 400 lines"* as a reason for where a shutdown handler lives — the rule bending the design | **ALREADY RECORDED — 9.8 entry 48**, *"the 400-line rule distorted ownership and APIs in four places, and three of them stand"*. No new action |
| **D12** | Two tracked files exceed 400 lines outside the gate's glob: `.agents/skills/fal-redesign/runtime/src/upgrade.mjs` (597) and `.agents/skills/fal-redesign/runtime/bin/fal-site.mjs` (413) | **RECORDED, not fixed.** Vendored skill runtime and a site helper, neither shipped by this game nor under `src/`, `tests/` or `tools/`. Widening the glob to vendored third-party code would red on arrival. Named here so the glob's boundary is a decision on record rather than an oversight |
| **D13** | `src/scenes/goalLayer.ts` has an alpha pulse with no settle, relevant only if 9.4 is read as covering every alpha tween rather than the named fade | **RECORDED, not fixed.** 9.4 names *"a fade"*; the goal pulse is a yoyo whose end state is its start state, so there is no end value to force-settle. Noted because the reading is not self-evident |
| **D14** | ⚠️ **Self-inflicted, found and fixed within the hour.** Two pieces of prose written for this very round each degraded the gate they described: the A0 note quoted `docs-contract`'s END marker verbatim, so `indexOf` sliced the section down to that sentence and reported all eleven criteria missing while all eleven sat six lines below; and the close round's own Verdicts table used bare `| 9.x |` rows, which **satisfied the contract's per-criterion check** — deleting the entire 9.5 row from the gate table above left the suite green | **BOTH FIXED and both watched.** The markers are now written in split form; the Verdicts table's `#` column is bolded out of the regex's reach. Recorded rather than quietly corrected because the pattern is the point: *documentation about a gate is inside that gate's blast radius*. The mutation was re-run after the fix and reds correctly — *"phase 9 criterion 9.5 has no QA-LOG row"* |

### The V4 sweep, read rather than assumed

**Run twice: once at the mid-session block, and again after the owner's decisions landed.**

| check | mid-session (blocked) | final |
|---|---|---|
| typecheck | clean | clean |
| unit | 2413 / 0, 159 files | **2417 passed / 0 failed, 160 files** |
| build | `verify-dist ok` | `verify-dist ok: 5 level(s) and 12 audio file(s)` byte-identical |
| `test:sim-isolated` | 2410 + 3 skipped | **2414 passed + 3 skipped**, phaser restored to `4.2.1` |
| e2e | ⚠️ 128 selected, **126** passed | ✅ **128 selected, 128 passed** |

Counts rose at every step and none fell. The final e2e run carries **D8's balance change**, so the
128/128 is on the tree that ships, not on the tree before it.

⚠️ **The mid-session run was 126/128 and that is left on the record rather than deleted.** Both
failures were identified and both passed in isolation immediately afterwards (7 selected, 7 passed),
which is the observation that separates load-sensitivity from breakage:

- **`phase-08-perf`** — *"level-05 costs 5.61x level-01 on the GPU … Expected: ≤ 2"*. The **known open
  Tier-5 item 5.2**, whose own record reads *"observed 1 in 4, and the one was the loaded run inside
  the full 128-test sweep."* Reproduced verbatim. Not this session's scope.
- **`phase-09-polish` 9.1** — *"No usable hit in 61 ticks"*. **D9**, upgraded by that very run from a
  recorded fragility to an observed failure.

**Neither recurred in the final sweep**, which is what a load-sensitive flake does and is exactly why
neither is reported as fixed.

### What this round could NOT check — the blind spots, kept

*(Vault 9.3: a gate's blind spots are part of its result. These are the briefs' own, preserved rather
than resolved.)*

- **No agent ran Playwright, by dispatch.** Six proofs were executed by the integrator instead; every
  e2e claim in this section is the integrator's, not an agent's.
- **Agent mutation work was uneven, and the earlier blanket claim here was wrong.** The `code-reviewer`
  and `performance-engineer` briefs ran **no** mutation of any kind, so their falsifiability claims are
  *read*, not *watched*. The `qa-expert` brief on 9.4 **did** — in an isolated harness in its own
  scratchpad, never touching a repository file, confirming the copy byte-identical afterwards. Every
  mutation against the real tree (D2, D3, E1-E6) was the integrator's. Corrected after the Codex
  implementation review caught this section contradicting 9.4's row.
- **The worktrees had no `node_modules`**, so agent unit runs resolved through the shared checkout,
  and worktree isolation then prevented those agents from confirming that checkout's cleanliness
  themselves. Confirmed here instead: the shared tree stayed clean throughout — `git status --short`
  showing only the unrelated `CLAUDE.md` edit, HEAD unmoved between dispatches.
- **The Phase 9 diff was reviewed targetedly, not line by line.** 9.9's *"diff reviewed"* clause is
  discharged by judgement, as it always has been.
- **Brief B on 9.7 examined 8 thresholds at depth, not all 24** — narrower than *"9.7 holds"*, and it
  said so.
- **Nobody has measured a shake's cost directly** — it sits below the 0.1 ms grid and nothing
  amplifies it. Unchanged from entry 44.
- **9.5 remains measured on the worst STEADY-STATE frame, not the worst frame the game can produce**
  (entries 43, 44). E6 proves the shake load is present and guarded; it does not widen what is loaded.

## The playtest after D8 — 2026-08-24

**D8 shipped a balance change**, and the acceptance on record before it (2026-08-23) could not cover
it: arbitration now judges the shake it draws, so a small event finds a running big one **harder** to
truncate at the window boundary.

**The owner played the shipped game again after the merge and accepts it** — 2026-08-24. That is the
`play`-owned sign-off for the change, recorded as a hands-on result and not as an automated one
*(C4: a playtest finds what gates cannot)*. Two numeric gates cover the change's mechanics
(`shake-arbitration-index.test.ts`) and neither can tell whether the result feels right; this is the
only thing that can.

**Still not settled by it**, because ordinary play cannot reach them: the UI at 852×480, DPR 2, the
240 Hz judder diagnosis, and the sentry-coverage question. Those four are carried in
`docs/SESSION-PROMPT-next.md` §4.

