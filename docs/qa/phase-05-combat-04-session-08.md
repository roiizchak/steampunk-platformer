[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

# Session 8 — 2026-08-12. **This section supersedes the playtest section above.**

Plan: `C:\Users\royko\.claude\plans\resume-phase-5-combat-whimsical-lightning.md`, reviewed by the
**eighth** Codex plan review (BLOCK, 2 blockers / 4 major / 2 minor, **all eight confirmed locally**
— [reviews/phase-05-plan.md](../reviews/phase-05-plan.md)).

## Four corrections to the inherited brief, all verified in the tree before any code was written

The session-7 handoff and the session-8 prompt built on it were **wrong in four places**. Each was
checked against the code, and each changed the work:

| | the brief said | the tree says |
|---|---|---|
| **C1** | *"step 4b (the attack edge) runs unconditionally"* during `hurt`, so P3 needed to gate both movement and attack | **False.** `canAct` (`combat.ts:298-300`) is `!isCombatState(state)` and already gates the edge at `:286`. **Attacking during `hurt` was never possible.** P3 is movement-only — one condition, not two. |
| **C2** | *"That test does not exist today, and its absence is exactly why P1 shipped"* | **It exists, and it is worse than absent.** `player-attack.test.ts` *"a dead enemy stops threatening"* stepped **30 ticks past hp=0** and asserted only the **player's** hp, on a fixture authored `patrolMin === patrolMax === 1000` so the clamp pinned the corpse. **A false negative, not a gap** — the test ran, passed, and could not see the defect it was named for. |
| **C3** | *"a corpse still needs to be drawn … check what `enemyLayer`/`enemyView` expect of a 0-hp body before choosing"* | **Already resolved; the render side needed no change at all.** `enemyView.ts:49-54` and `:62-67` return `'death'` at `hp <= 0`, and `enemyLayer.ts:125-127` alphas the body to 0.35 with a comment explaining that a corpse vanishing on the frame it dies gives no feedback. Nothing splices or destroys a body anywhere in `src/`. **P1 was purely a sim fix.** |
| **C4** | 5.11's spec needs a `window.__game` field to reach `isSprite` | **No.** TypeScript `private` is erased at runtime, so `__phaserGame.scene.getScene('Game').enemies.isSprite` is reachable through the seam the spec already uses for `bodies`. **The nine-field surface stays closed** and no STOP-and-ask was needed. |

**The lesson is C2's.** A handoff that says *"no test covers this"* is a claim about the repository,
and it was checked and found false. The dangerous case is not the missing test — it is **the test
that exists, runs green, and is structurally incapable of failing.**

## Two things the brief did not know

- 🔴 **Knockback was never built.** Phase 5 §1 names it as scope, `tick.ts:245` and `combat.ts:15,25`
  place step 4 before integration **specifically so knockback reaches the same tick's movement** —
  and nothing has ever written `player.vx` on a hit. The only `vx` writes in `src/sim/` are
  friction/accel in `player.ts` and the world-bounds clamp in `hazards.ts`. **The seam was built and
  left empty for a whole phase**, and no criterion asked.
- **Enemy `y` is frozen at spawn.** `enemyScavenger.ts:70` sets it and nothing writes it again; there
  is no gravity or ground collision for enemies. So a scavenger that chases past its patrol bound
  does not fall — **it floats at ledge height over the gap.** This is what made S2's clamp the
  correct answer rather than merely the conservative one, and it was not visible from the defect
  report.

## User decisions, 2026-08-12

| | decision | note |
|---|---|---|
| **E1** | Attack moves **`Z`/`J` → `F`/`L`** | The user reported the old placement as unnatural. No e2e spec pressed either key, so the rebind was free. |
| **E2** | Hitstun hard-locks movement for **`ATTACK.startup` (6 ticks)**, then control returns while the `hurt` label runs its remaining 12 | Chosen over an authored 8 so the number **reuses a measured constant** rather than inventing one *(vault 5.3)*. |
| **E3** | **Knockback ships**, impulse `walkMax` — **provisionally re-opened** | Codex finding 4 showed ground friction 3.69 cuts a 5.54 impulse to 1.85 px before its first integration, so `walkMax` buys ~2 px. The user chose it **before that was known**; the measured displacement goes back to them. |
| **E4** | Scavenger dead zone **96 px**, holding facing **and** movement | One tile, 12× one tick of `chaseSpeed`. |
| **E5** | **The chase clamps to the patrol bounds** | Makes both the 200 px teleport and the floating scavenger structurally impossible. |
| **E6** | **New criterion 5.16** | Wording and rationale in [prd/phase-05-combat.md](../prd/phase-05-combat.md) §6. |
| **E7** | Full scope, **including the 5.12 splits** | Splits run last, so nothing is split while it is also being edited. |

## P1 — CLOSED

`stepEnemies` now filters `hp > 0` on both loops (`enemyTurn.ts:31`, `:43-45`); `stepProjectiles`
stays **outside** the guard so shots already in flight keep travelling. The guard is at the **call
site**, not inside `stepSentry`/`stepScavenger`, which keeps both step functions pure and stops a
corpse's `cooldownCounter` advancing — `sentryAnim` reads that counter, so a corpse whose counter
kept moving would compete a `fire` pose against its own death pose.

**Watched RED first**, as the whole point of the item: `expected 1 to be +0` on projectile count,
`expected 650 to be 500` on the corpse's `x`.

> 🔴 **A parity coincidence nearly produced a false green, in the very test written to catch a false
> negative.** The first fixture put the player at the corpse's own x. A *live* scavenger there
> oscillates around the player, so on an **even** tick count it lands back where it started — and the
> test passed with the bug present. Both fixtures now keep the player outside the 480 px
> `detectRadius`, so a live scavenger would only **patrol**, and patrol drift is monotonic. **"The
> number did not change" is not evidence unless you know the bug would have changed it.**

## P4 — H3 found, and it is a default nobody chose

`GameScene.ts:522-529` registers every animation with `key`, `frames`, `frameRate` and `repeat` —
and **never sets `skipMissedFrames`**, so it takes Phaser's default of **`true`**. That flag makes the
engine **skip frames when playback lags wall-clock**: a 26.67 fps `run` cycle under a slow renderer
does not slow down, **it drops poses**. That is precisely the reported symptom, and it explains why
`run` — the fastest animation in the game — is where the frame budget first showed as an art defect.

⚠️ **This does not license flipping the flag.** `skipMissedFrames: false` would show every pose while
letting the cycle run *slow*, which is **vault 4.22 foot-slide** — a worse defect because it is
invisible. H3 explains why the symptom is visible; **the fix is still the frame rate.**

### 🔴 P4 DIAGNOSED — the parallax layers are 64 % of the frame budget *(headless)*

> ⚠️ **This section said "SOLVED" and it was overstated. Read
> [P4 on real hardware](#-p4-on-real-hardware--the-defect-is-a-software-rasteriser-artifact) below
> before acting on anything here.** Every number in this section is headless SwiftShader. On a real
> GPU the frame budget is **4.2 ms and 12/12 poses**, and the defect this section attributes to the
> parallax layers **does not occur at all**. The A/B remains a correct measurement of the headless
> harness; it is not a measurement of the shipped game.

A controlled A/B in the identical harness, the fleet spawned exactly as criterion 5.11 spawns it,
`brass-courier-run` sampled while the player held a sustained run:

| | median frame | max | **run frames PAINTED per cycle** |
|---|---:|---:|---|
| parallax **ON** (shipped) | **70.30 ms** | 80.60 ms | **[12, 12, 7, 5, 7]** |
| parallax **OFF** (probe) | **25.50 ms** | 30.20 ms | **[12, 12, 12]** |

**The three background layers cost ~45 ms per frame.** With them removed the frame time drops by
**64 %** and **every one of the twelve run frames is painted, every cycle.** That is P4, start to
finish: the user's *"missing frames … not using the whole 12"* is 5–7 of 12 reaching the screen.

They are three **5092 × 1080 RGBA** `TileSprite`s (`GameScene.ts:546-560`) drawn into a 1920 × 1080
view — 21.3 MB of the 27.9 MB boot payload, and ~66 MB of texture sampled every frame.

**H2 is REFUTED.** The animation is not restarting: its state machine passes through 11–12 of 12
frames per cycle even at 70 ms. Nothing is wrong with the sheet, the catalog, the fps, or
`playIfChanged`. **H3 is the mechanism, not the cause** — `skipMissedFrames: true` is why the cycle
stays in time while dropping poses instead of running slow, which is the correct trade and must not
be flipped.

> 🔴 **Three metrics, and the first two both said "no defect". This is the finding under the finding.**
>
> 1. **Distinct frame indices over the whole sample → 12/12.** Useless: the sample spans ~19 cycles,
>    so the UNION reaches 12 even if every single cycle drops half. It reported perfect coverage.
> 2. **Distinct indices per cycle, off the `animationupdate` event → 11–12 of 12.** Still wrong, and
>    much more convincingly: **the event fires when the animation STATE advances, and Phaser can
>    advance several frames inside one rAF.** Every one fires the event; only the last is drawn.
> 3. **The current frame sampled once per rAF, at paint time → 5–7 of 12.** The truth.
>
> **An event that fires when state advances is not evidence a frame was drawn.** The first two
> metrics would each have closed P4 as "not reproducible" against a defect the user could see with
> their own eyes.

**Not measured:** whether real Chrome with a GPU holds 60 fps. The harness is headless with no
`launchOptions`, therefore SwiftShader, and the interactive-browser run was not available. The A/B
above is valid regardless — both arms ran in the identical environment — but the absolute
millisecond figures are a software-rasteriser number and **must not be quoted as the shipped frame
rate**.

**The fix is not applied**, because every candidate changes shipped art bytes and that is the user's
call: downscale the three sources to something nearer the 1920 px view; or split each into a smaller
tile the `TileSprite` repeats; or drop a layer. **Do NOT lower the run fps** — it is derived, and
authoring it down trades a visible defect for vault 4.22 foot-slide.

### The retile was attempted, and it REFUTED the texture-size hypothesis

User-approved, 2026-08-13: crop each layer to 960 px before the existing `mirrorLoop`, so it wraps at
**1920 × 1080** instead of 5092 × 1080. The `TileSprite` already draws at 1:1 into a 1920-wide window,
so the sharpness-preserving move is a crop and never a second resample. Shipped as `e1aaa92`.

A same-session **interleaved** A/B — A,B,A,B,A,B in one Playwright session, so a load drift partway
through cannot land entirely on one arm:

| | median of medians | run frames PAINTED per cycle |
|---|---:|---|
| retiled parallax **ON** | **90.10 ms** | mostly 4–6 of 12 |
| parallax **OFF** | **37.20 ms** | mostly 8–12 of 12 |

**Ratio 2.42, against 2.76 before the retile.** Shrinking the texture 2.65× moved essentially
nothing. **Texture size was never the mechanism** — the cost is three full-screen alpha-blended
1920 × 1080 draws, and cropping the *source* removes not one *drawn* pixel. The earlier reading of
"the layers are 64 % of the budget" was correct about *the layers*; it was silently assumed to be
about *their size*, and that assumption is now dead.

> The interleaving is why this comparison means anything. The first attempt measured the retiled
> build at 85.80 ms and compared it to the 70.30 ms recorded a day earlier — on a machine that then
> had ~24 concurrent `node.exe` processes on it. **That compares nothing**, and the agent that ran it
> flagged its own confound rather than reporting a regression. Absolute ms figures from this harness
> are not comparable across sessions; only within-session ratios are.

**Kept anyway, on the payload win alone** (user decision, 2026-08-13): 21.4 MB → 7.5 MB of boot
payload, 2.9× smaller, which also relieves the e2e serialization pressure. The cost is real and is
recorded here rather than buried: each layer now holds only 960 px of unique art, so **the background
repeats ~2.65× more often**. That is a visible art change, and it is a hands-on judgement no gate
makes — it belongs in the next playtest.

### 🔴 P4 on real hardware — the defect is a software-rasteriser artifact

Run 2026-08-13, user-approved, in **real Chrome with a real GPU**: `ANGLE (NVIDIA, NVIDIA GeForce RTX
4080 (0x00002704) Direct3D11 vs_5_0 ps_5_0, D3D11)`, confirmed in-page off
`WEBGL_debug_renderer_info` before sampling rather than assumed. Dev build, `window.__game.ready`
waited on, dev fleet spawned, `brass-courier-run` held, 4-second window, the **same** sampling method
as the headless probe: the current animation frame index read once per `requestAnimationFrame` at
paint time, aggregated in-page.

| | headless (SwiftShader) | **real Chrome, RTX 4080** |
|---|---:|---:|
| median frame | 90.10 ms | **4.2 ms** |
| p95 | — | **4.4 ms** |
| max frame | ~95 ms | **4.8 ms** |
| sustained | ~11 fps | **240 fps**, vsync-locked |
| poses painted per cycle | 4–6 of 12 | **12, 12, 10, 12, 12, 12** |

**Reproduced identically three times**, each after a page reload, with `runSamples` 745 and
`completeCycles` 6 every run — not one number moved between runs.

**P4, as measured, does not occur on real hardware.** The renderer never misses a 240 Hz vsync with
three parallax layers, a 20-scavenger fleet and the player running. Five of six cycles paint all
twelve poses; the worst paints ten.

> **What this costs us in confidence, stated plainly.** Every P4 number that existed before today —
> the 12–18 fps in criterion 5.11, the 70.30/25.50 A/B, the "64 % of the frame budget", the
> 5-of-12 pose drop — came from headless Chromium with no `launchOptions`, therefore SwiftShader.
> Three blended full-screen quads is punishing work for a CPU rasteriser and near-free for a GPU, so
> the harness was measuring **itself**, not the game. The W7 plan called for exactly this real-browser
> arm and it was skipped because the browser launch was unavailable; the whole retile was designed,
> executed and shipped against a number that the very first real-hardware reading contradicts by
> **21×**.
>
> The lesson is not "the headless harness is useless" — it is a fine *relative* instrument, and the
> ON/OFF ratio it reports is real. The lesson is that **a performance criterion with an absolute
> threshold cannot be owned by a software rasteriser.** 5.11's `medianMs < 100` was never a budget;
> it was a sanity ceiling on a renderer nobody ships.

**Open questions this does NOT close**, and they must not be quietly folded into the good news:

1. **The user's original report was a real browser.** It was *"missing frames … not using the whole
   12"* on their own machine, which is where the 4080 reading comes from. Either the retile and the
   grey-box fix changed it, or the original observation was of something else — a state flicker, the
   dev fleet, a different scene. **Not resolved. It needs a hands-on playtest, not another probe.**
2. **One cycle in six painted 10 of 12, not 12.** Small, reproducible, and unexplained. It is not the
   5-of-12 catastrophe, and it is not nothing.
3. **240 Hz flatters the result.** A 240 Hz display samples a 26.67 fps animation ~9× per pose. On a
   60 Hz display that margin is 4× smaller. Untested.
4. **This was the DEV build over the Vite dev server**, not `dist/`. The production bundle is
   smaller and drops the dev scenes, so it should only be faster — but "should" is not measured.

## S1 and S2 — CLOSED, and fixing S2 blinded criterion 5.9's sweep

`deadZone` is a **per-scavenger field**, not a module constant, because criterion 5.9's sweep runs
through `enemyKnobs()` over **live entity fields** and a constant is invisible to it — Codex plan
review 8, finding 5. It follows the exact shape `detectRadius` and `releaseRadius` already use, and
`enemyTuning.ts`'s own docstring at `:17-23` already stated that adding a tunable field means adding
it there. The chase clamp is now positional-only and shared by both paths; `facing` is decided per
path, so a chaser pinned at its bound still faces the player.

> 🔴 **Adding the knob turned `enemy-tuning.test.ts` RED — and the cause was this session's own S2
> fix.** `scav0.deadZone moved no observable output in either placement`. Not a dead knob: a blind
> fixture. In the `near` placement the scavenger chases the retreating player straight into
> `patrolMin` and **clamps**, so total travel saturates at `3000 - 2600 = 400` px for *every* value
> of `deadZone`. The clamp is S2's fix. **A gate can be made blind by a correct change to the thing
> it measures**, and only a knob that happened to need close range revealed it.
>
> Repaired by adding a third placement, `contact`, with patrol bounds wider than the scavenger can
> cross in 240 ticks — travel becomes speed-limited rather than clamp-limited — and the player
> starting inside the dead zone. The assertion is `some()` across placements, so a third placement
> can only make the sweep **more** sensitive: **broadening what the gate MEASURES, never loosening
> what it TOLERATES.** Watched red by mutating the dead-zone check to `if (true)`, restored from a
> fresh temp copy, revert verified **by count** (1 → 0 → 1, zero `if (true)` remaining).

> 🔴 **The parity coincidence struck TWICE in one session**, in W1 and again in W2, and both times in
> a test written to catch a false negative. A fixture with the player at the scavenger's own x makes
> a *live* scavenger oscillate `500 → 508 → 500`, so on an **even** tick count it lands home and the
> test passes with the bug present. **"The number did not change" is not evidence unless you know
> the bug would have changed it.**

## Phase 4 debt — 4.10 and 4.12 are RUN, and both PASS

Both were on the §1b ledger and both were confirmed still unrun by the Codex implementation review.
Closed with throwaway scratchpad probes; **no tracked file was changed to close either.**

**4.10 — `gateReachBand` against the REAL shipped sheets.** All nine catalogued sheets swept, each
with its own fresh call, and the gate's internal loop tracks a `best` across every frame rather than
breaking on the first failure (`tools/gen/gates.mjs:211-244`) — so this is a sweep, not an instance,
which is the standing correction to this phase's six stop-at-first-failure incidents. **Re-run
independently by the orchestrator; every number below reproduced exactly.**

| sheet | cell | frame | reachX | band y | movedPx |
|---|---|---:|---:|---|---:|
| `brass-courier-idle` | 288×384 | 7/12 | 199 | 242–254 | 14678 |
| `brass-courier-walk` | 288×384 | 5/12 | 215 | 232–244 | 20455 |
| `brass-courier-run` | 288×384 | 4/12 | 219 | 195–207 | 22741 |
| `brass-courier-jump` | 288×384 | 1/6 | 227 | 216–232 | 22250 |
| `brass-courier-fall` | 288×384 | 1/6 | 230 | 217–233 | 16687 |
| `brass-courier-hurt` | 288×384 | 1/6 | 216 | 237–247 | 21707 |
| `brass-courier-attack` | 288×384 | 3/8 | 269 | 148–152 | 23765 |
| `brass-sentry-idle` | 288×384 | 3/8 | 260 | 237–248 | 19650 |
| `rust-scavenger-walk` | **512**×384 | 6/12 | 403 | 288–293 | 33926 |

**Nine PASS, zero FAIL, zero INDETERMINATE.** The per-slug cell is confirmed live in the audit — the
scavenger is measured at 512, not at a global 288. **G5 does not substitute for this** (Codex impl
finding 6): different audit, different question, and this is the one that had never produced a number.

**4.12 — `findSource`'s deliberate-removal red run *(C1)*.** `_generated/sheets/brass-courier-attack-clip.png`
(1,210,555 bytes) backed up to a fresh temp copy, `findSource` confirmed working on the positive case
first, then the input removed. It threw, from `tools/gen/assetSources.mjs:36`:

```
assets:build: no source sheet for declared animation "attack" — expected
C:\Claude\Steampunk Platformer\_generated\sheets\brass-courier-attack-clip.png.
A declared input that cannot be found fails the build; it is never substituted (vault 4.16).
```

Restored and verified **by count (1 → 0 → 1)**, `cmp` byte-identical, and `findSource` resolving
again afterwards. `_generated/` is gitignored, and `git status --porcelain` stayed empty throughout —
which is exactly why the backup went to the scratchpad and **not** to `git stash`: the tree held two
other agents' uncommitted work at the time.

---
