[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

## §6 gate — agent owners, run 2026-08-13 (session 8)

Three owners, **two blind briefs each** *(A7)*. All six were dispatched **simultaneously**, which is
what actually guarantees brief 2 never saw brief 1 — trusting the orchestrator not to leak it is a
weaker guarantee than making the leak impossible. Every finding below is **applied or recorded with a
reason** *(C11)*.

Owners: `voltagent-qa-sec:qa-expert` (5.1, 5.2, 5.4c, 5.4d, 5.5, 5.6, 5.7, 5.9, 5.10, 5.15, 5.16) ·
`voltagent-qa-sec:code-reviewer` (5.3, 5.12) · `voltagent-qa-sec:performance-engineer` (5.11).

### Verdicts

| # | verdict | the evidence that decides it |
|---|---|---|
| 5.1 | **PASS** | `enemySentry.ts` unchanged this session. Session 7's mutation stands: deleting the fire guard gives **265 shots in 270 ticks against 3**. Coverage gap recorded as **T6**. |
| 5.2 | **PASS**, standing caveat | The criterion holds; the test *named* for it does not sweep `chaseSpeed` live. See **T1**. |
| 5.3 | **PASS**, mutation-proven | Owner ran four mutations through a Vite alias (**no repo file edited**): commit floor → 2 red, hysteresis → 1 red, dead zone → 3 red, patrol clamp → 2 red; sentry cadence → 5 red across the full suite. The hysteresis failure reads `expected 36 to be less than or equal to 1` — **36 reproduces sessions 3 and 4 exactly**, from an independent harness. Also: `rollChance` has **zero production callers**, so there is no per-tick roll to commit in the first place. |
| 5.4c | **PASS**, re-measured | Owner re-ran the real tool rather than inheriting the log: `node tools/gen/sheetGates.mjs brass-courier attack` → `G5 frame 3 (tick 9) lands inside the active window [6, 10)`. |
| 5.4d | **PASS** | `enemy-view.test.ts` hand-computes `(4*60)/18` independently of the production formula *(C2)*, plus a non-vacuity check that a different `simTicks` yields a different fps. |
| 5.5 | **PASS** | `combat.test.ts` walks **every** tick of the 20-tick swing and pins both boundary ticks by name. Three independent mutation classes each have their own assertion. |
| 5.6 | **PASS** | Fixture runs `IFRAME_TICKS * 2` = 90 ticks and pins length, first index **and** last index separately. A length-only check would pass a window shifted by one tick. |
| 5.7 | **PASS** on the unit half | Bar-fill math untouched this session. **Visual half NOT re-observed** — see **T3**. |
| 5.9 | **PASS** | `enemy-tuning.test.ts` 12/12 including `scav0.deadZone`, asserting a behaviour signature computed by stepping the sim, not a knob readout. Weakness recorded as **T4**. |
| 5.10 | **PASS** on what is asserted | Two genuinely different entities, not a symmetric fixture. Standing gap unchanged — see **T2**. |
| 5.11 | **FAILING as a measurement** | The number is real; what it measures is not what the criterion claims. See **P1–P4**. |
| 5.12 | **PASS at `ea0c6e4`, and it was FAILING when this table was written** | The owner measured **0 over 400** and was right about the eight files it checked — but `tick.ts` was **409** at the time, grown by my own `8bfeee5`, and nobody re-swept. Caught by the **Codex implementation review**. Repaired in `ea0c6e4` (`tick.ts` 409 → 307). Gate weaknesses recorded as **T7–T9**. |
| 5.15 | **PASS** | `hazards.ts` untouched. The one place knockback could have disturbed it was checked directly: `applyWorldDamage` still tests `belowKillPlane` **first** and returns before every branch that now carries knockback. |
| 5.16 | **PASS, first run** | Owner hand-traced both fixtures for non-vacuity rather than trusting them: an unfiltered sentry *would* fire on tick 1 (`windowOpen(90,90)` is false, `sentrySees` true), and an unfiltered scavenger *would* patrol monotonically off `xBefore`. Real red/green splits, and the player sits at `x:99999` so the parity trap is avoided. Vacuity in one clause recorded as **T5**. |

### The 5.12 record earlier in this log is STALE and its verdict is BACKWARDS

Finding **F2**, and this is the **second** occurrence of the S10 defect class in this same file.
The verdict row says `5.12 | FAIL`, one section says *"Ten files exceed 400 lines"*, another says
*"FAILING — 8 files over 400"*, and the table that calls itself the correction lists
`GameScene.ts` **657**.

**All of those predate `49a7d30` and `4eb08f3`.**

> 🔴 **And this paragraph was itself FALSE when written — third occurrence, and this one is mine.**
> It said *"the true count at HEAD is ZERO"*. At `78932a0` the count was **ONE**: `src/sim/tick.ts`
> was **409 lines**, having grown 388 → 409 in `8bfeee5`, my own hitstun fix. Caught by the **Codex
> implementation review**, not by me and not by any of the six gate briefs.
>
> **The failure was a sequencing error and it is worth naming exactly:** I ran the 400-line sweep,
> *then* fixed F1 (+21 lines to `tick.ts`), *then* wrote the sweep's result into this log. Each step
> was sound; the order made the record false. **A measurement written down after later edits is not
> a measurement of the tree it claims to describe** — which is precisely the criticism this very
> section levels at the two entries above it.
>
> Repaired in `ea0c6e4`: `createWorld` and `GREY_BOX_SOLIDS` extracted to `src/sim/world.ts` (120
> lines), re-exported so all 17 importers are untouched, `tick.ts` **409 → 307**. The numbered step
> order and its explanation were not touched. **Count re-swept at `ea0c6e4`: 0 over 400.**

```
gates.mjs      562 -> 373   + gatesBrassCap.mjs 191
sheets.mjs     464 -> 254   + sheetsPack.mjs    231
BootScene.ts   438 -> 200   + bootAssets.ts     284
GameScene.ts   657 -> 378   + parallaxRig 34 - gameParallax 45 - gameInput 140
                              - gameLevelDraw 129 - gameAnimations 47 - gameHud 38
```

Verified two ways: the owner reproduced `file-size.test.ts`'s own three globs and its own
`lineCount()` (**170 files scanned, 0 over 400** — correct for the globs it ran, but run before `8bfeee5` grew `tick.ts` to 409; see the correction above), and a wider sweep across `.ts .mjs .js .mts .cjs`
returns only the two vendored `.agents/skills/**` files already judged out of scope.

Last time this log's 5.12 evidence rotted, the verdict was still honest. **This time the verdict
itself was wrong, in the opposite direction.** A stale FAIL is not the safe direction to be wrong in:
it is what a reviewer reads and believes.

### Findings — every one applied or recorded *(C11)*

**Applied this session:**

| | sev | finding | what was done |
|---|---|---|---|
| **F1** | HIGH | **The player could jump out of hitstun.** `movementLocked` gated `dir`, which feeds step 5 only; step 7's jump had no hitstun test. Measured: `vy -48.6, grounded false` on the **first locked tick**, while both docstrings called the window *"not being in control"*. Jumping also took the player off the ground-friction path, partly cancelling knockback. | **FIXED**, `8bfeee5`. Re-probed after: `vy 0, grounded true`. Buffer decision **(b)**, deliberate: step 7's *execution* is gated, the latch untouched, so a press made during hitstun survives and fires the tick the lock lifts. Eating it would have been a balance change to a tuned forgiveness mechanic. A test pins **which tick** the jump returns. |
| **F5** | MED | **`knockbackSettling` skipped friction for hits that applied no impulse.** It keyed on `state === 'hurt' && combatCounter === 1` — every hit. Hazards deliberately apply no knockback, yet collected the exemption: measured `vx -12.00 -> -12.00` where friction gives `-8.31`. | **FIXED**, `8bfeee5`. Gated on `knockbackPending`, one boolean on `PlayerSim`, cleared exactly once so the exemption stays one tick. `window.__game` untouched, still nine fields. Shipped numbers did not move: grounded **7.39 px**, airborne **25.59 px**. |
| **F2** | HIGH | The 5.12 record was stale and its verdict backwards. | **FIXED** — the correction above. |

**Recorded, not fixed — each with its reason:**

| | sev | finding | why not fixed now |
|---|---|---|---|
| **P1** | HIGH | **5.11's `medianMs < 100` has never once been run on anything but a software rasteriser.** The 4.2 ms real-hardware figure came from a separate manual probe, not the spec that gates the criterion. The owner's four fresh runs: **95.5 / 96.4 / 97.0 / 95.6 ms** — passing with 3–5 ms of margin, against session 7's recorded 55.70 / 82.10 on the identical assertion. Two runs had `maxMs` over 100. | The criterion needs redesigning, not patching, and no baseline exists to redesign it against (S4, PRD §7). Six agents were loading this machine during those runs — the same confound that made the first parallax A/B meaningless — so **the 95–97 figure needs a re-measure on a quiet machine before anyone calls it a regression.** |
| **P2** | HIGH | **The dev fleet spawns entirely outside the viewport.** `DEV_FLEET_OFFSET_X` 200 sim units × `RENDER_SCALE` 6 = **1200 screen px**; the visible half-width is 960 px = 160 sim units. **0 of 20** fleet members are on screen at spawn, and exactly **8 of 20** fall inside `detectRadius` 480. Verified independently by arithmetic. | Cross-confirms from an unrelated direction: 20 − 8 = **12**, exactly the Rectangle count the `isSprite` assertion caught earlier this session. The same geometry explains both findings. Changing the fixture changes what every recorded 5.11 number means, so it is a deliberate next-session decision, not a late edit. |
| **P3** | MED | "Worst case" is **asserted, not derived**, and is **scavengers only** — no sentries, no projectiles in flight. `GameScene.ts`'s own comment concedes it is a design claim. Already recorded as S5. | Same reason as P2. |
| **P4** | MED | The criterion ties its number to *enemy count*, but the dominant headless cost is parallax — 64%, and it does not vary with enemy count at all. No A/B has ever isolated what 20 scavengers alone cost. | Same reason as P2. |
| **T1** | MED | **5.2's named tunability test doesn't test its title.** `enemy-ai.test.ts` sweeps only `patrolSpeed`; `chaseSpeed` is compared against two hardcoded constants. The real live sweep is in `enemy-tuning.test.ts` under 5.9's name. | Pre-existing, recorded by sessions 3 and 7, unchanged by this session's diff. The criterion *is* satisfied — by a different file than the one named. |
| **T2** | MED | **Nothing swings the player's attack repeatedly against a live enemy and asserts death.** Both 5.10's and 5.16's tests set `hp = 0` directly. Found independently by **both** qa-expert briefs. | Pre-existing since session 3. Worth stating plainly: **this is the gap that let P1 ship past the entire gate.** First item for whoever next touches death handling. |
| **T3** | LOW | 5.7's visual half (a live scavenger at 2/60 hp against `level-01`) was not re-observed — the owner was barred from binding port 5173 while other agents ran. | Coverage gap in the re-verification, not a suspected regression: the bar-drawing path is untouched this session. |
| **T4** | MED | **5.9's sweep uses `.some()` across only two set-points** — the floor and roughly double. A knob whose only observable effect is at the *floor* passes even if it does nothing in the mid-range a designer would actually use. Saturating a knob to an extreme is not evidence the knob works. | Same shape as the `deadZone` clamp blind spot this session already hit and fixed by adding a third placement. A real weakness; the fix is a mid-range assertion, which is a criterion change. |
| **T5** | MED | **5.16's "neither deals contact damage" is vacuous for the sentry** — `applyWorldDamage` has no sentry-contact path at all, so it is true by construction. Only the "zero shots" half is a real assertion for that enemy type. | Recorded rather than reworded: the criterion's other clauses are non-vacuous and were hand-traced. Reword when a sentry contact path exists, not before. |
| **T6** | MED | **Criterion 5.1's vertical term is untested.** Every sentry fixture in `enemy-ai.test.ts` uses `y: 0` with `playerY: 0`, so `dy` in `withinRadius` is always 0. Delete `dy * dy` — collapsing detection to 1-D — and **not one test goes red**. Verified: 13 non-zero `playerY` fixtures exist and every one is `stepScavenger`; none is a sentry. | `withinRadius` is correct today, so this is missing coverage rather than a defect. Adding the fixture is a one-test change and the cheapest real improvement on this list — first item next session. |
| **T7** | MED | **`file-size.test.ts`'s ceiling is now vacuous.** It asserts `over.length <= 10`; with 0 over it has ten free slots and cannot go red for the next ten regressions. The only remaining guard is a bare-basename `String.includes` across every `docs/qa/*.md` — and this log names all eight formerly-over files, pre-approving them. `GymScene.ts` sits at **399**, `phase-01-boot.spec.ts` at **398**. | ~~**User decision, 2026-08-13: leave the ceiling at 10 and record the weakness.** Tightening to `toBe(0)` changes a gate's tolerance, which is a STOP-and-ask; it was asked and declined.~~ 🔄 **REVERSED 2026-08-14 (D6b): both halves tightened** — ceiling `10 → 7`, basename fallback removed. Red-proved both ways. Full record in *Criterion 5.12* below. |
| **T8** | MED | **`verify-dist`'s identifier checks cannot go red under minification.** Measured against the shipped bundle: `stepScavenger` **0** and `createScavenger` **0** — both unquestionably ship — proving the four identifier greps (`PlaygroundScene`, `ElementEditorScene`, `GymScene`, `spawnDevEnemies`) return 0 whether the code shipped or not. `spawnDevFleet` **does** survive (1 occurrence) and is **not** on the list. | **Partly a correction to the reviewer:** the scene-KEY check *is* real — `verify-dist` iterates backtick, single and double quotes, and the bundle carries backtick-quoted `Game` ×3 and `Boot` ×1, so a shipped `Playground` key would be caught. `__game`/`__phaserGame` are property names and survive minification, so those are real too. Only the four identifier greps are decoration. Benign today (`spawnDevFleet(){}` is an empty stub), so this is a **C2 defect in the gate, not in the bundle** — put to the Codex implementation review rather than changed at gate time. |
| **T9** | MED | **The splits relocated complexity rather than reducing it**, and all 13 new modules have exactly one importer — literally the gaming vector `file-size.test.ts`'s own docstring names. | Recorded in the same breath as "0 over 400", per S9's precedent, because both facts are true. Mitigating and verified: the seams are cohesive, behaviour was preserved (multiset line-diff, **zero executable lines lost**), and **comment/doc lines grew in every split** — BootScene +29, gates +4, sheets +21, GameScene +58, tests +59 — so explanation was not deleted to hit the number, which is the failure mode the rule most fears. |
| **T10** | MED | **5.3's commitment is not observable on screen.** `rust-scavenger-chase` is not in the catalog and `playIfChanged` no-ops on a missing key, so a scavenger committed to a 30-tick chase and one flapping every tick both draw `walk`. `window.__game` carries no enemy state, so no e2e can tell them apart either. | Genuine, and it means any *observational* evidence for 5.3 is vacuous. The criterion's method is **code review**, which was satisfied by mutation runs — so 5.3 stands. Resolved by shipping the chase sheet (post-phase art), not by a code change. |
| **T11** | MED | `releaseRadius > detectRadius` is asserted on the **module constant**, never on the instance; `createScavenger` validates neither, and the only repair lives in a DEV-only scene behind a keypress. An instance with inverted radii is constructible and would strobe. | Not reachable from shipped content — `level-01` uses the defaults. A constructor invariant is the right fix and is a sim change; recorded for next session. |
| **T12** | LOW | `deadZone` has `min: 0` and no invariant. At 0 the facing assignment becomes a genuine per-tick decision. The boundary probe writes its offsets as `deadZone ± 1`, so it tests the knob against itself and cannot express a floor. | Sound as tuned (96 px exceeds anything reachable in one tick), unsound as *tunable*. Same class as T11. |
| **T13** | LOW | The six modules extracted from `GameScene.ts` have **no tests**. `parallaxRig.ts` returning `100 + i` instead of `-100 + i` would draw all three backgrounds *over* the player and every gate would stay green. | The same defect class as "deleting `renderPlayer()` left every Phase 2 test green" — reintroduced by a split. `parallaxRig.ts` is engine-free and directly unit-testable, which is exactly why it was extracted; the test is a next-session item. |
| **T14** | LOW | `isSprite` is recorded once at creation and never re-derived from live visibility. A future `setVisible(false)` would keep `spriteCount` at 20/20 while drawing nothing. | Not present today (no `setVisible` anywhere in `enemyLayer.ts`). Vault 9.4 one layer deeper; recorded as a blind spot. |
| **T15** | LOW | `NO_KEYS` (`gameInput.ts`) is a shared mutable module singleton returned to every keyboard-less scene; the pre-split code gave each scene its own `[]`. | Safe today — nothing mutates the arrays in place — but a footgun the split created. One-line fix, folded into the next touch of that file. |
| **T16** | LOW | `build-world.mjs` cites *"(GameScene.ts ~548-554)"*; that file is now 378 lines. Same doc-rot class as F2, in a file this session touched. | Cosmetic; batched with the next `tools/gen/` edit. |
| **T17** | LOW | `GameScene.ts` `protected groundLayer` is assigned and read nowhere. Pre-existing, but the split was the moment to drop it. | Deliberately not removed mid-gate: deleting a `protected` member touches two subclasses for zero behavioural gain. |
| **T18** | LOW | Mixed line endings inside `src/sim/` — `combat.ts` is CRLF, its neighbours LF. Cost the reviewer one failed mutation batch to discover. | Harmless to `lineCount()`; it will bite the next exact-anchor edit. Recorded so it is diagnosed in seconds rather than minutes. |
| **T19** | LOW | The e2e log carries an unhandled `TypeError: Cannot read properties of null (reading 'glTexture')` from `SubmitterTileSprite.run`. | **Found by me, diagnosed, not a defect.** It is the scene-restart fixture (`phase-01-boot.spec.ts:311`): the page boots fully, GameScene's parallax `TileSprite`s exist, then the spec deliberately invalidates a texture and restarts Boot, so live layers draw one frame against a cleared texture. Confirmed pre-existing — the parallax creation path is behaviourally identical before and after the split. Not adding production guards for a state only a fixture reaches. |

### What the owners could not check

Preserved verbatim, because a gate's blind spots are part of its result *(vault 9.3)*.

- **No e2e was run by any owner** — port 5173 was reserved while six agents were live. The two split
  spec files (`bootHelpers.ts`, `tilemapHelpers.ts`) are verified only by "no `test()` title was
  lost"; they are **unproven at runtime by this gate**. This is the largest blind spot in the 5.12
  result. *(The full suite — **47 passed** — was run by me separately, before the owners were
  dispatched.)*
- **`npm run test:sim-isolated` was forbidden** to every owner (it uninstalls Phaser), so criterion
  1.3's regression was not re-confirmed by them after the sim changes. *(Run by me separately: 892
  tests with Phaser uninstalled, `phaser@4.2.1` restored afterwards.)*
- **No live-browser verification of the split scenes.** The five extracted `GameScene` modules are
  verified by typecheck, the unit suite, static reading and the production bundle — **none of which
  draws a frame.**
- **The `medianMs > 0` floor was not mutation-tested.** The perf owner was barred from modifying
  files, so "it is a real but weak guard" is reasoning from code, not an observed red.
- **Real-hardware behaviour** was not reproducible by any owner; their environment is headless-only.
  The 4.2 ms figure rests on my probe, cited, not on their measurement.
- One owner disclosed that an analysis script wrote a stray zero-byte `nul` into the repo root, and
  that it deleted it. Verified independently: `git status --porcelain` shows only the pre-existing
  untracked `.claude/settings.json`.

## Playtest, 2026-08-13 — real Chrome, real GPU, and the retile is REVERTED

Driven with `playwright-cli` against the dev build in **real Chrome** (RTX 4080, D3D11/ANGLE),
`window.__game.ready` waited on, never a sleep-to-pass.

### 🔴 The retile is reverted, and the reason is one I got wrong when I proposed it

When the crop was proposed I costed it as *"the background repeats ~2.65× more often"*. **That
understated it, and the playtest showed why in the first screenshot.**

Cropping to 960 makes `mirrorLoop` yield exactly **1920 — the view width**. The entire texture,
the unique half *and* its mirror, is therefore on screen in **every frame**: the same three-dial
gauge panel is visible twice at once, permanently, in the shipped level. At the full 2546 the same
1920 view shows only **~38 %** of the texture, so a mirrored pair can appear near a seam rather
than always.

**User decision: revert.** `ca84554`. The three PNGs came back **byte-identical** to their
pre-retile versions, which also demonstrates `build-world.mjs` is deterministic. Payload returns
21.4 MB.

Nothing performance-related was given up, because the crop never bought any: the interleaved A/B
put it at ratio **2.42** against **2.76** before, and the defect it targeted **does not exist on
real hardware**. The full reasoning is now written into `build-world.mjs` **at the point of
temptation**, not only in the QA log — "crop the parallax to the viewport" is an obvious-looking
optimisation that someone reading the payload size will propose again.

> **The lesson, and it is mine rather than the reviewers':** I costed a visible art change in the
> abstract ("repeats more often") and shipped it on that estimate. One screenshot showed the real
> cost. A trade against *look* cannot be approved from arithmetic — the approval needs the picture.

### `play`-owned criteria

| # | evidence | verdict |
|---|---|---|
| **5.4** | Sampled the **scavenger's drawn frame index once per rAF at paint time** (never the `animationupdate` event, which fires when state advances and can advance several frames inside one rAF). `rust-scavenger-walk`, **11 distinct poses**, indices `[1,2,3,4,5,7,8,9,10,11,12]` — index 6 missing. | **PASS.** Advances far past frame 0. The one missing index matches the player-side real-GPU reading (12,12,10,12,12,12) and is recorded, not hidden. |
| **5.8** | Screenshot at true sprite size against `level-01`'s cool background, scavenger at reduced hp. The bar renders as a **small red sliver** above the sprite — present and honest, but small. | **DEFERRED to the user.** This is a human judgement *(vault C4)* and an agent asserting "legible" would be reporting nothing. The screenshot is the evidence; the call is not mine. |

### What playing it actually turned up

- **Knockback reads correctly by hand.** Contact from a scavenger on the right gives `vx -1.85`,
  state `hurt` — shove away from the source, as designed.
- **A dead enemy stays dead and stays drawn.** No corpse activity observed, consistent with 5.16.
- 🔴 **The player wedges against terrain at `x: 3198` with a scavenger in contact and drains
  100 → 35 hp with no way past.** Movement is not blocked by the enemy (enemies have no push), so
  this is terrain plus contact damage. **Not diagnosed, and not a Phase 5 criterion** — recorded
  because it is the kind of thing only playing finds, and because "took 65 damage standing still"
  did not read as a fight. First candidate for the next playtest.

## 5.11 re-measured on a QUIET machine — P1's open question is closed

Finding **P1** left one question open: the perf owner measured **95.5 / 96.4 / 97.0 / 95.6 ms**
against session 7's recorded **55.70 / 82.10**, while six agents were loading this machine. It was
recorded as *"needs a re-measure on a quiet machine before anyone calls it a regression."*

Re-measured at `b988e66`, nothing else running, parallax back at full 5092 px:

```
[5.11] frame budget under 22 drawn enemy bodies: 90 frames, median 82.40ms, max 99.80ms
[5.11] frame budget under 22 drawn enemy bodies: 90 frames, median 82.50ms, max 94.30ms
[5.11] frame budget under 22 drawn enemy bodies: 90 frames, median 82.90ms, max 95.50ms
```

**Not a regression.** 82.4–82.9 ms, spread **0.5 ms** across three runs, and it lands on session 7's
**82.10**. The 95–97 ms reading was machine load, exactly as the confound predicted. This is the
**fourth** time this session that absolute milliseconds from the headless harness moved with
background load — the first killed the original parallax A/B, and it is why the decisive A/B was run
**interleaved**.

**Margin against the 100 ms ceiling is ~17 ms**, and one run's `maxMs` reached **99.80**. `maxMs` is
not asserted, but a ceiling a quiet machine approaches on a single frame is worth stating plainly.

> The rule this earns: **an absolute millisecond threshold in this harness is only meaningful against
> a same-session control.** Cross-session comparison of these numbers is not evidence in either
> direction — which is finding P1's real content, and it survives the re-measure rather than being
> dissolved by it.

## User video playtest, 2026-08-13 — "missing frames" is LOW FRAME RATE, and the sentry fires from its belly

A 6.5 s screen recording (2560x1392, 30 fps) supplied by the user. Frames extracted at full rate
and analysed; the recording is in the session scratchpad, not the repo.

### 🔴 Nothing is dropping frames. The animations do not HAVE enough frames.

A 24-frame montage of consecutive captures during a run shows the pose advancing on essentially
every captured frame — no stalls, no held poses. What is wrong is the rate each animation plays at:

| animation | frames | fps | ms per pose |
|---|---:|---:|---:|
| **walk** | 12 | **15.65** | 63.9 |
| **jump / fall** | 6 | **20.00** | 50.0 |
| run | 12 | 26.67 | 37.5 |
| idle | 12 | 8.00 | 125.0 |
| attack | 8 | 24.00 | 41.7 |

**Cinema is 24 fps.** Walk at 15.65 and jump at 20 sit below the rate at which motion fuses, so the
eye resolves individual poses — which is exactly what "missing frames" describes. The user reported
them in the order **walk, run, jump**, and the table matches: walk is worst.

It falls out of the derivation rather than a bug. `simTicks` is stride-locked — a walk cycle must
span 46 ticks to match ground speed — and there are only 12 frames to spread over it:
`12 x 60 / 46 = 15.65`. Nothing is broken; there is not enough art per cycle.

### The fix is FREE for walk, jump and fall — the frames are already paid for

Every source clip is **97 frames, 24 fps, 4.04 s**, on disk under `_generated/video/`. The sampler
(`tools/gen/sampler.mjs`, `chooseCycleWindow`) takes the frame count as a **parameter**, so a denser
sample is a re-run, not a regeneration. Cycle periods measured by autocorrelation of frame-to-frame
distance over the stable middle of each clip:

| | now | source | achievable | verdict |
|---|---|---|---|---|
| **walk** | 12 fr, 15.65 fps | **28 fr/cycle** | **24 fr → 31.3 fps** | **free, and the biggest win** |
| **jump / fall** | 6 fr, 20 fps | 97 fr clip (one-shot) | **12 fr → 40.0 fps** | **free** |
| run | 12 fr, 26.67 fps | **13 fr/cycle** | 13 fr → 28.9 fps | **at the ceiling — needs new art** |

`run`'s source clip holds only ~13 distinct frames per cycle and the sheet already uses 12, so
sampling denser would duplicate poses. Improving it means a fresh generation, i.e. **spend**. At
26.67 fps it is already above the fusion threshold and is the least broken of the three.

⚠️ Check the texture width before choosing 28 over 24 for walk: at a 288 px cell, 24 frames is
6912 px and 28 is 8064 px, which is close to the 8192 px limit some GPUs still enforce.

### 🔴 The sentry fires from the centre of its body, not from the cannon

`src/sim/enemyTurn.ts:61`:

```js
fireProjectile(sentry.x, muzzleY, player.x, chestY, SENTRY.projectileSpeed, SENTRY.damage)
```

`sentry.x` is the body's **centre** and `muzzleY` is `sentry.y - (SENTRY_BOX.h / 2) * scale`, the
vertical **middle**. **There is no muzzle offset anywhere.** The shot is born inside the machine.

Three defects compound into the one thing the user saw:

1. **No muzzle offset** — the above.
2. **No facing** — the sentry had none until `facing` was added this session, so there was no
   direction to offset *along*. The two defects were linked, which is why the muzzle offset could
   not have been written earlier.
3. **No firing animation** — `brass-sentry-fire` was generated and **never adopted**, so the sentry
   plays `idle` while shooting. `enemyView.ts:35` documents "how long the muzzle animation plays
   after a shot leaves" for a sheet that is not in the catalog.

The sim already stores `lastFireDx` / `lastFireDy` with a comment saying they are frozen at fire
time **"so a renderer that recomputed this would not swing the barrel after the shot left"** — and
**no renderer reads either field.** The aiming data exists; the barrel does not.

**Recorded, not fixed — user decision, 2026-08-13.** Fixing it changes sim behaviour after the
Codex 5.14 review signed off, and the user chose to keep this session's gate results intact.

### Four enemy sheets are already paid for and unadopted

`brass-sentry-fire`, `brass-sentry-death`, `rust-scavenger-chase` and `rust-scavenger-death` all
have logged request IDs, surviving `.mp4` sources with retries (3–5 takes each) and 6 extracted
frames each under `_generated/framing-frames/`. **Adopting them costs $0** — extraction, chroma key
and packing are local tooling. The generation log notes an audit judged the sentry clips *"cropped
at the left and right"*, which is where adoption appears to have stopped; that must be re-checked
against the pipeline's own gates before forcing them through.

This also **dissolves finding T10**, which recorded that 5.3's chase commitment is unobservable and
"resolves by shipping the chase sheet (post-phase art)". The chase sheet was already bought.

---
