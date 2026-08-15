[← Phase 5 QA log index](phase-05-combat.md) · [QA-LOG index](../QA-LOG.md) · [phase doc](../prd/phase-05-combat.md)

## §6 gate — agent owners, run 2026-08-12 (session 7)

**Protocol:** four owners, **two briefs each** *(A7)*, all six agent briefs **dispatched simultaneously
so brief 2 could never see brief 1's findings**. Every finding below is **applied or recorded with a
one-line reason** *(C11)*. Subagents were forbidden from writing here; the orchestrator recorded these
after re-verifying the decisive claims. **Each agent's own "could not check" is preserved** *(9.3)*.

**Two sign-offs were VOID entering this run** — 5.1 and 5.5, signed in session 3 before session 4
changed `stepSentry`. Both were re-run from scratch.

### Verdicts

| # | Owner | Verdict | Basis |
|---|---|---|---|
| 5.1 | qa-expert | **PASS**, re-verified | Both sentry guards survived the barrel split — `enemySentry.ts:89` saturating increment, `:95` fire guard. Mutation-measured by code-reviewer: **deleting `:95` gives 265 shots in 270 ticks** against 3 |
| 5.2 | qa-expert | **PASS**, caveat unchanged | Still passes by `enemy-tuning.test.ts:74-109`, **not** by the test whose title claims it |
| 5.3 | code-reviewer | **PASS**, mutation-measured | Baseline 0 flap changes; single-threshold **36**; inverted asymmetry **36**; commit floor deleted → `:210` red. Reproduces session 3's 36 exactly, so session 4 did not weaken it |
| 5.4c | qa-expert | **PASS — newly measured, first time ever runnable** | `sheetGates.mjs brass-courier attack` → `G4 drift 0px within budget 3px` · `G5 frame 3 (tick 9) lands inside the active window [6, 10)` |
| 5.4d | qa-expert | **PASS** | `deriveFps` imports `attackTotalTicks(ATTACK)`/`HURT_TICKS`/`DEATH_TICKS` from `src/sim/combat.ts`, never retyped; `asset-catalog.test.ts:192-199` re-derives fps for **every** shipped row |
| 5.5 | qa-expert | **PASS**, re-verified | `combat.test.ts:84-121` walks every tick of the 20-tick swing and pins both endpoints by name |
| 5.6 | qa-expert | **PASS** | Fixture runs `IFRAME_TICKS*2` = 90 against a 45-tick window, both endpoints pinned |
| 5.7 | qa-expert | **PASS** — and it had **never actually been run by its owner** | Absent from session 3's owner table despite `qa-expert` being listed. Closed here: unit at 2/100 plus live e2e reading the real `Graphics` command buffer at 2/60 |
| 5.9 | qa-expert | **PASS** | Knobs enumerated live, swept both directions, asserted on behaviour signature not knob readout |
| 5.10 | qa-expert | **PASS**, caveat unchanged | Proves the **ratio** `ceil(maxHp/damage)` 2 vs 3; still **no test swings twice and asserts death** |
| 5.11 | performance-engineer | **MEASURED, NOT SATISFIED** — see below | |
| 5.12 | code-reviewer | **FAILING** — 8 files over 400 | |
| 5.15 | qa-expert | **PASS** | Kill-plane crossing tick pinned; tunnelling band derived from a real trajectory, both halves asserted |

### Findings — every one applied or recorded

| ID | Sev | Finding | Disposition |
|---|---|---|---|
| **S1** | **HIGH** | **The scavenger's chase has no dead zone.** `enemyScavenger.ts:118-120` is `dir = playerX >= x ? 1 : -1` with no tolerance, so a player the scavenger cannot reach — standing directly above it — makes `facing` flip **every single tick**. `enemyView.ts:133` reads `facing` for `flipX`, so the sprite strobes. **Measured against the real sim: 39 facing flips in 40 ticks** with the player 4 px to one side and 300 px up. Worse, `enemy-ai.test.ts:188` re-pins `s.x = 500` every tick and its own docstring names *"the player is above it"* as the real in-game case — **the test pins out exactly the case it names.** No test asserts `.facing`. | **RECORDED, NOT FIXED — blocker-class for session 8.** Confirmed by the orchestrator against the real sim, not taken on report. The fix needs a dead-zone width, which is a **balance decision**, and it is a change to gated combat code late in a long session — the same reasoning that deferred finding A1 rather than patching it ad hoc. **It is a visible defect and must not be shipped unfixed.** |
| **S2** | **HIGH** | **The chase ignores the patrol bounds, and release teleports.** `enemyScavenger.ts:121` returns before the clamp at `:127-133`. **Measured: patrolMax 700, chased to x=900, snapped back to 700 the first tick after release — a 200 px instantaneous jump.** `enemy-ai.test.ts:121` uses `playerX: 99999`, so the chase branch never meets the bounds. | **RECORDED, NOT FIXED — blocker-class for session 8.** Confirmed by the orchestrator. Whether a chase *should* respect patrol bounds is a design question (a scavenger that will not leave its ledge vs one that pursues), so it is the user's call, not a render module's. |
| **S3** | **HIGH** | **5.11's `bodyCount` cannot tell a real Sprite from the `Rectangle` fallback.** `EnemyLayer` tracks `isSprite` alongside `bodies` **for exactly this purpose** (`enemyLayer.ts:39-40`), but the spec's `snapshot()` and delta assertion read only `bodies.length` (`phase-05-combat.spec.ts:80-104`, `:188`). A catalog regression that un-registered `rust-scavenger-walk` would drop all 20 fleet scavengers to plain rectangles, **frame time would plausibly improve**, and 5.11 would still report green. | **RECORDED, NOT FIXED.** This is vault 9.4 exactly — *fast because nothing expensive is drawn* — one layer subtler than an empty scene. The fix is small (assert on `isSprite`, and add a lower bound on `medianMs`) but it is a change to the very spec whose measurement 5.11 is being judged on, and doing that inside the same session that judges it is the wrong order. **First item for session 8.** |
| **S4** | **HIGH** | **The `<100 ms` ceiling does not test the stated target and is simultaneously too tight and too loose.** The criterion and the spec docstring promise **60 fps** (16.6 ms); the assertion permits 100 ms. **And the number is not stable:** the recorded run was `median 55.70 ms / max 63.30`, an independent re-run on the same fixture with zero code changes gave **`median 82.10 ms / max 89.40`** — a ~48 % swing that is already 82–89 % of the cutoff. So it can fire on ordinary noise while still passing a 2× directional regression. | **RECORDED.** The ceiling is documented in-file as a deliberate sanity bound because **no baseline exists** — PRD §7 records the vault has nothing on performance (§B1). Replacing it needs a baseline, which is what this phase's vault-out is supposed to create. See the vault-out entry below. |
| **S5** | MED | **`DEV_FLEET_COUNT = 20` is worst-case by fiat.** `GameScene.ts:42-44` calls it *"a deliberate 10x stress multiple… no authored level approaches"* — a design claim, not a measurement. Nothing in `src/sim/` or the level format caps concurrent enemies, and the only shipped level places **2**. | **RECORDED.** Honest framing: 22 bodies is a *chosen* stress figure, not a derived worst case. It becomes checkable when level-02+ exist. |
| **S6** | MED | **`combat.ts`'s own docstring contradicted `tick.ts`.** It listed *"hazard / kill plane"* as step-4 internal item 2. World-geometry damage actually resolves at **step 9b**, after collision — `tick.ts:21,40-46`, which is the declared authority and states explicitly *"The plan put world-geometry damage in step 4. It cannot go there"*, because a swept hazard test needs both endpoints of the tick's motion. | ✅ **APPLIED.** Corrected in `src/sim/combat.ts`, with a note recording that this was the *"prose is not the authority"* trap in the one file least allowed to carry it. |
| **S7** | MED | **The session's own split introduced a duplicate and a cycle.** `verdict()` was defined identically in **both** `gates.mjs:32` and `gatesSelfTest.mjs:30` — the same restate-don't-import class as recorded finding A2 — and `gates.mjs` re-exported from `gatesSelfTest.mjs` while that file imported back, a **circular import** safe only for as long as `gatesSelfTest.mjs` declared no top-level `const`. One edit from a TDZ crash, and the same fragility already recorded for `motion.mjs`/`motionCombat.mjs`. | ✅ **APPLIED.** `verdict` is now exported once from `gates.mjs`; `fill` moved beside the gates that use it; the re-export is gone, so the edge is one-way. **The first fix attempt broke 23 suites** — other tests imported `fill` from `gates.mjs` — which is why `fill` moved rather than the importers. Both modules' docstrings corrected. `265 suites / 865 tests / 0 failed` after. |
| **S8** | MED | **`file-size.test.ts`'s globs cannot see two files over 400.** `.agents/skills/fal-redesign/runtime/src/upgrade.mjs` (**597**) and `bin/fal-site.mjs` (**413**) are invisible to `src/**/*.ts` · `tools/**/*.mjs` · `tests/**/*.ts`. | **RECORDED, no change.** Judgement: both are **vendored skill runtime, not this project's source**, so the honest count for criterion 5.12 remains **8**. The glob's blindness is real and is recorded here so it is not rediscovered. Within the project tree the blindness is currently harmless — `tools/**/*.ts` and `src/**/*.mjs` match zero files. |
| **S9** | MED | **The phase ADDED to the worst offenders while the split commit advertised a reduction.** Against `main`: `GameScene.ts` **+105** (613 → 657), `sheets.mjs` +22, `sheet-packing.test.ts` +14 — and `file-size.test.ts` stayed green throughout. | **RECORDED.** True and worth stating plainly: 10 → 8 is real, and the phase also grew the largest file by 105 lines. Both facts belong in the 5.12 verdict, which is **FAILING**. |
| **S10** | MED | **The 5.12 evidence table in this log was stale.** It read *"Ten files exceed 400"* and listed `chroma.mjs` 542 (now 55), `prompt.mjs` 586 (now 396), `enemies.ts` "exactly 400" (now 60) — **and that stale table is exactly what keeps `file-size.test.ts:68`'s name-drop check green.** | ✅ **APPLIED.** Corrected below. The *verdict* was always honest (5.12 marked FAIL); the evidence under it had rotted. |
| **S11** | MED | **5.7's e2e cannot catch the defect its unit test was written for.** The live assertion is `0 < fillRect.w < slotW` at hp 2/60 — which a naive `Math.max(MIN, ratio × slotW)` floor **also satisfies**. Only the pure unit test (`enemy-view.test.ts:74-75`, 1hp ≠ 2hp) catches a flattened low end. | **RECORDED.** The two tests are complementary, not redundant, and the e2e must not be mistaken for a superset. Worth a 1hp-vs-2hp live assertion later. |
| **S12** | LOW | No one-counter shape assertion for `Sentry.cooldownCounter` (only the scavenger has one, `enemy-ai.test.ts:229`), and that assertion enforces a **naming convention** (`endsWith('Counter')`) rather than a state-space property — a `chaseTimer` would bypass it. No test oscillates across `releaseRadius`. | **RECORDED.** Neither was reachable by any mutation the reviewer found. |
| **S13** | LOW | The hysteresis invariant is enforced at the **dev knob** (`enemyTuning.ts:119`), not at construction — `createScavenger` accepts inverted radii silently. | **RECORDED.** Caller-enforced invariant in the wrong layer; harmless today because the only writer is the dev panel. |
| **S14** | LOW | 5.6's test lives at `player-combat.test.ts:129-142`; session 3's log cites `combat.test.ts`. Citation drift, test intact. | ✅ **APPLIED** — corrected by this entry. |
| **S15** | LOW | The splits are recorded in **no** `docs/qa/` entry; commit `898c928` was their only record. | ✅ **APPLIED** — recorded below. |

### What this run proves about the protocol itself

**The adversarial brief earned its place for the third phase running.** Brief 1 for `qa-expert`
returned ten PASSes. The three adversarial passes — none of which saw a checklist result — produced
**S1, S2, S3 and S11**, including **two confirmed gameplay bugs in code that every checklist verdict
had just called PASS**. 5.3 is genuinely well-built and mutation-resistant, *and* the scavenger it
governs strobes its facing 39 times in 40 ticks. Both are true. A checklist pass asks whether the
stated thing works; only an adversarial pass asks what else is in there.

**And two agent reports were WRONG, which is why every decisive claim was re-verified:**

- The `performance-engineer` **checklist** brief reported *"all 22 bodies draw as `Rectangle`
  fallbacks — zero enemy keys in `index.json`"*. **False.** `brass-sentry-idle` and
  `rust-scavenger-walk` are both catalogued as of this session, `GameScene.ts:518` registers every
  catalog key, and a patrolling scavenger asks for `rust-scavenger-walk`. Its own adversarial
  counterpart said the opposite and was right.
- The `qa-expert` **adversarial** brief reported 5.4c and 5.4d as *"never run — no combat sheet is
  packed"*. **False**, and it said honestly that it had run no tests and was reading `docs/HANDOFF.md`.
  **`HANDOFF.md` was stale mid-session by construction** — §13 had not been written yet — so the
  document that exists to orient a reader actively misled one.

> **Two transferable lessons.** A subagent's summary is a claim, not evidence — *both* of these were
> caught only because the orchestrator re-read the catalog. And **a handoff document is stale from the
> first commit of the session that will rewrite it**; anything reading it mid-session must be told so.

**The orchestrator's own probe was wrong twice before it was right**, which is worth recording rather
than hiding: `createScavenger` takes `y` with **no default**, so omitting it made `withinRadius`
compare against `undefined` and detection silently returned `false` — the scavenger never chased and
the first run looked like a clean refutation of S1. The second attempt put the player outside the
480 px detect radius and failed the same way. **A probe that quietly does nothing looks exactly like a
probe that found nothing.** Both bugs were only confirmed once the fixture was checked for entering
the state it was meant to test.

### 5.11 — the measurement, and it is NOT satisfied

**Vault-out entry for performance, stated precisely because the vault has nothing (§B1):**

> Under headless Chromium + Vite dev server, `workers: 1`, **22 drawn enemy bodies** (2 placed by the
> level + `DEV_FLEET_COUNT` 20), with `rust-scavenger-walk` and `brass-sentry-idle` catalogued so the
> fleet renders as **animated Sprites**: median frame time **55.70 ms** (recorded session 6) and
> **82.10 ms** (independent re-run, session 7), max to **89.40 ms** — **roughly 12–18 fps against a
> 60 Hz (16.7 ms) target**, i.e. **3–5× over budget**, with a **~48 % run-to-run swing** on identical
> code.

**The swing is the most important number here and neither brief drew the connection: session 6's
55.70 ms was measured when the 20-scavenger fleet had no sheet and drew as rectangles. This session
shipped `rust-scavenger/walk`, so those 20 bodies now animate.** Part of the 55.70 → 82.10 movement is
very likely **not noise but the sprite path being exercised for the first time** — i.e. the cost of
this session's own art landing. That is a hypothesis, not a measurement: it is not isolated, and
isolating it needs a run with the catalog row removed. **Do not report the 48 % as pure variance.**

**Confounds, stated rather than assumed away:** headless Chromium (SwiftShader vs a real GPU
rasteriser — direction of bias genuinely unknown), `workers: 1`, **34.5 MB of PNG per boot** with
`mid.png` alone at 9.1 MB (an existing recorded debt), and dev-server rather than production build.

**Criterion 5.11 asks for the frame budget "measured under worst-case enemy count." A number exists
and it is bad. It is reported as measured-and-failing, not as passed.**

### 5.12 — FAILING, with the evidence table corrected (supersedes the stale one above)

> ⚠️ **This section is itself now stale, 2026-08-13.** Its eight-file table was accurate when
> written and every file in it is now under 400 lines. **The count at HEAD is 0.** See § *The 5.12
> record earlier in this log is STALE* in the session-8 gate section — this is the second time this
> criterion's evidence has rotted in this file, which is why the correction is a pointer at each
> stale claim rather than one note at the end.

**Eight files exceed 400 lines.** The three splits this session were real — export surfaces verified
identical (gates 19/19, prompt 13/13, chroma 15/15, nothing missing or added), and a multiset line
diff showed **zero lines lost** for prompt and chroma, so nothing was "shortened" by deleting
explanation, which `file-size.test.ts:22-26` names as the failure mode to fear most.

| file | lines | | file | lines |
|---|---:|---|---|---:|
| `src/scenes/GameScene.ts` | **657** | | `tools/gen/sheets.mjs` | 464 |
| `tools/gen/gates.mjs` | 562 | | `tests/e2e/phase-01-boot.spec.ts` | 449 |
| `tests/e2e/phase-03-tilemap.spec.ts` | 496 | | `src/scenes/BootScene.ts` | 438 |
| `tests/unit/tilemap-data.test.ts` | 466 | | `tests/unit/sheet-packing.test.ts` | 419 |

**None of these is justified, and this log will not pretend otherwise.** Phase 4's entry already calls
its list *"an open violation of a non-negotiable, not a justified exception"*, and that remains the
honest description.

**`file-size.test.ts` is not evidence for this criterion and should not be cited as such.** It asserts
`over.length <= 10` — **two free slots** at 8 — and its name-drop check is a bare-basename
`String.includes` across *all* `docs/qa/*.md`, so `src/sim/tick.ts` (379) could cross 400 tomorrow and
be "pre-approved" by an unrelated prose mention. It is a ceiling, not an assertion that anything is
fine, and its own comment says so.

**Why `gates.mjs` is still over:** removing exactly the fixtures and `selfTest` leaves **529 lines of
actual gate logic** — already over the cap before anything is extracted. Getting it under 400 requires
moving gate logic itself; the 153-line brass-cap section is the obvious candidate. **`GameScene.ts`
was excluded deliberately**: it is subclassed by `ElementEditorScene` and `PlaygroundScene`, and
`ElementEditorScene` already depends on its key arrays, making it the one split that can break
dev-only scene guarding.

**Splits recorded for the name-drop check and for the record** *(S15)*: `tools/gen/gatesSelfTest.mjs`,
`tools/gen/promptData.mjs`, `tools/gen/chromaKey.mjs`, `tools/gen/chromaComponents.mjs`.

### `play`-owned criteria — 5.4 and 5.8, run 2026-08-12

`play` is **not an agent**. Both were driven by hand in a live browser with `playwright-cli` against
the dev server, after the sheets that unblock them shipped this session. **Neither had ever been run
against real art**; 5.4 was excluded from the e2e spec on the grounds that `rust-scavenger-walk` did
not exist, and 5.8's only prior evidence was a grey-box screenshot.

#### 5.4 — enemy walk animation advances past frame 0 during patrol — **PASS**

**A screenshot cannot prove this.** It is a *timing* claim, and CLAUDE.md's own rule is that an
existence assertion cannot verify one. Sampled **inside the page** via Phaser's `animationupdate`
event, which fires on **every frame change** and carries `frame.index` — a strictly better instrument
than polling per animation frame, and it satisfies *"sample inside the page and return an aggregate"*
without a wait expressed in ticks, which cannot bound a sampling window.

```
sprites with a live animation : brass-sentry-idle, rust-scavenger-walk, brass-courier-idle
animationupdate events        : 41

rust-scavenger-walk   distinct frame indices [1..12] of 12   everLeftFrame0: true
brass-courier-idle    distinct frame indices [1..12] of 12   everLeftFrame0: true
brass-sentry-idle     distinct frame indices [1..8]  of 8    everLeftFrame0: true
```

**The scavenger walked through all twelve of its frames during patrol.** This is the criterion, and it
is the first time it has been answerable — `enemyLayer` drew `Rectangle`s until this phase, and the
frame-0 guard was only ever tested against a **mock scene, never a live Phaser `AnimationState`**.

**Why the criterion exists, confirmed mechanically:** this phase's vault-in *(5.1)* records *"Phaser
restarts a looping animation on every state change, which is how a walk cycle never left frame 0."*
That is exactly `play()`'s documented behaviour — it stops and restarts — and `playIfChanged`
(`src/scenes/playAnim.ts`) is the guard, skipping when `getName()` already matches. The 12 distinct
indices are that guard working in a live scene rather than in a unit fixture.

#### 5.8 — health bar legible at true sprite size against a cool background — **PASS, with a caveat**

Driven to a genuine low-HP state rather than screenshotted full: a live scavenger set to **2/60**, at
camera zoom 1 and true sprite size, against `level-01`'s cool blue-grey boiler wall. **Judged by eye at
3× magnification**, because a downscaled view cannot settle a legibility question.

**Verdict: legible.** The fill reads as a saturated red sliver on a black field — high contrast both
against the bar interior and against the cool background behind it — and it is **visibly non-empty at
2/60**, which is criterion 5.7's `BAR_MIN_FILL_PX` floor confirmed *visually* rather than only as a
predicate. A bar this size at 3.3 % HP would be invisible without that floor.

> ⚠️ **Caveat, and it is a real readability finding.** By capture time the scavenger had closed to
> ~120 px of the player, so the two sprites overlap at true size and the enemy bar renders **across the
> player's head**. At a glance it is ambiguous which entity the bar belongs to. It is not a blocker —
> the bar itself is legible and correctly positioned above its own body — but "legible" and
> "unambiguous" are different properties, and only the first is currently gated. Worth an offset or an
> ownership cue when enemy art is finished.

**Recorded here, not only in the session, because the repository had no record of either run and the
Codex implementation review correctly reported both as UNRUN on that basis.** See
[reviews/phase-05-impl.md](../reviews/phase-05-impl.md) findings 1 and 2, and the note there about a
handoff document being stale from the first commit of the session that will rewrite it.

---

## Playtest, 2026-08-12 — three defects found by hand that the whole gate missed

**Source:** `Recording 2026-08-12 173100.mp4`, 27.7 s of live play, reported by the user after the
§6 gate, both Codex reviews and 46 e2e had all been run and reported. **Every one of the three was
then confirmed in the code**, so these are not impressions — they are located defects with a line
number. None is fixed; all three are session-8 work.

> **This is vault C4 again, and more sharply than Phase 2 recorded it.** The gate had just finished:
> 4 owners × 2 briefs, 15 findings, two Codex reviews, 870 unit tests and 46 e2e green. **Two minutes
> of hands-on play found three defects, two of them one-line root causes.** A criterion is a question
> someone thought to ask; playing the game is what asks the questions nobody wrote down.

### P1 — dead enemies keep acting. **One missing condition, two visible symptoms.**

`src/sim/enemyTurn.ts:29-41` — `stepEnemies` iterates **every** scavenger and **every** sentry with
**no `hp > 0` filter**:

```js
for (const scavenger of world.enemies.scavengers) stepScavenger(scavenger, sighting);
...
for (const sentry of world.enemies.sentries) { if (!stepSentry(sentry, sighting).fired) continue; ... }
```

And `stepSentry` itself never reads `hp` — confirmed, the only occurrences of `hp` in
`src/sim/enemySentry.ts` are the interface (`:31`), the options type (`:49`) and the constructor
(`:55,64,65`). The fire path at `:89-99` gates on the cooldown window alone.

**So a sentry at 0 hp keeps counting its cooldown and keeps firing**, which is exactly what the user
saw. The same missing guard means **a dead scavenger keeps patrolling and chasing** — the
"corpse keeps walking" symptom that finding R4 predicted from the render side and that
`playIfChanged`'s missing-key no-op was only ever a partial mitigation for.

**Why no test caught it:** every combat test asserts hp reaching 0, and none steps the world
*afterwards*. `5.10`'s known caveat — *"no test actually swings twice and asserts death"* — is the
same blind spot seen from the other end. Death is asserted as a **number**, never as a **state the
world then has to behave correctly in**.

### P2 — the death animation never plays, for either enemy

Reported as "misses the animation of death", and it is a direct consequence of the catalog:
**neither `brass-sentry/death` nor `rust-scavenger/death` ships.** Both are blocked at the fragment
gate. `playIfChanged` (`src/scenes/playAnim.ts`) deliberately **no-ops on a missing key so the
previous animation keeps running** — documented as "the intended fallback while the catalog is
partial". Combined with **P1**, a killed enemy therefore keeps playing its *idle* or *walk* cycle and
keeps acting. The two defects compound: the fallback was designed for a body that had **stopped**.

### P3 — hitstun is COSMETIC. Being hit does not interrupt the player.

Reported as "even when he touched me, [it] broke the animation ... and I can actually move and can
attack him." Confirmed:

- `HURT_TICKS = 18` (`src/sim/combat.ts:71`) and `enterCombatState(player, 'hurt')` (`:211`).
- `COMBAT_STATES` (`:156`) and `isCombatState` (`:166`) are consumed in **exactly one place** —
  `src/sim/player.ts:185`, inside `resolveState`, whose only job is to stop **step 11 overwriting the
  state label**.
- **Nothing in the tick order suspends input, movement or the attack edge during `hurt`.** Step 5
  (horizontal accel) and step 4b (the attack edge) run unconditionally; neither consults
  `player.state`. `grep` for any movement gate on `hurt` returns nothing.

**So `hurt` reserves a label for 18 ticks and changes no behaviour.** The player slides and swings
through their own hitstun, which is also why the animation "breaks" — the sheet plays while the
character is being driven by live input.

⚠️ **This is a design decision that was never taken.** Whether hitstun should lock movement, lock
attack, or neither is a **balance call for the user**, not something to patch in. But the current
state is not a considered choice — it is an absence, and the criteria never asked.

### How this lands against the criteria

| criterion | status before | what the playtest shows |
|---|---|---|
| 5.5 | PASS | still true — the *attack window* is correct. It never asked what happens to the **defender** |
| 5.6 | PASS | still true — i-frames span their window. i-frames gate **damage**, not **control**; nobody noticed those are different |
| 5.10 | PASS, caveated | the caveat is now a defect. "No test swings twice and asserts death" is why P1 shipped |
| 5.4 | PASS | the walk cycle does advance — on a **live** enemy. It also advances on a dead one, which is P1/P2 |

**None of these verdicts was wrong. The gate simply had no criterion for "what does the world do
after something dies."** That is the gap to write into Phase 5's vault-out.

### P4 — the run cycle drops frames, and it is 5.11 made visible

Reported as "when the character is running, it is missing frames ... not using the whole 12 frames."

**The sheet is complete.** `brass-courier-run` is catalogued with **12 frames**, `simTicks 27`, and
**fps 26.67** derived as `12 × 60 / 27`. Nothing is missing from the art or the catalog.

**The renderer cannot keep up with it.** Criterion 5.11 measured **12–18 fps** actual. A 26.67 fps
animation sampled by a 12–18 fps render loop **must** skip: at 15 fps each drawn frame advances the
animation by ~1.8 frames, so roughly every other pose is never displayed. `run` is the fastest
animation in the game and therefore the first place the frame budget becomes visible as an art defect.

> **This is the most valuable thing in the playtest.** 5.11's number was abstract — "12–18 fps against
> a 60 fps target" — and the honest question was how much it actually mattered. **It matters enough to
> destroy a 12-frame animation the project paid to generate.** The frame budget is not a
> nice-to-have; it is already costing shipped art. It should be treated as the phase's top
> non-blocking priority, above further art spend.

**Do not "fix" this by lowering the run fps.** The fps is *derived* (`renderFrames × TICK_HZ /
simTicks`) and authoring it down to match a slow renderer would reintroduce vault 4.22's foot-slide —
trading a visible defect for a worse invisible one. **Fix the frame rate, not the number.**

---
