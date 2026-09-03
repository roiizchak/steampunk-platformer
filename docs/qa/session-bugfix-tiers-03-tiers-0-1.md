[← bug-fix session log index](session-bugfix-tiers.md) · [QA-LOG index](../QA-LOG.md)

---

## A2 — 5.1, and the half of it that was wrong

**Status: FIXED, with the claim corrected.**

The inventory recorded 5.1 as *"the gate meant to stop DEV code shipping cannot fire either way for
module-scope code"*, and the plan promoted it to Batch A because it protects a non-negotiable. Two
mutations were built and each was rebuilt and read *(C1)* rather than reasoned about:

| mutation | rebuilt `verify-dist` said |
|---|---|
| drop the `import.meta.env.DEV` ternary in `src/game/config.ts`, registering the three dev scenes in production | **FAILED** — 3 scene keys, 1 symbol, 1 prose hit |
| drop the `import.meta.env.DEV` early-return in `src/debug/globals.ts`'s `updateDebugState` | **`verify-dist ok`** |

So **the scene-roster half was already covered and the inventory is wrong about it.** A scene key is
a quoted string literal and esbuild keeps it. What is genuinely open is a guarded body whose only
tell is a **module-scope identifier** — esbuild renames those, so no grep over a minified bundle can
ever see one, and adding more symbols to the list would not change that. Row two ships
`Object.assign(state, patch)` into every tick of production play with the build printing `ok`.

`globals.ts:67` predicted this in as many words — *"pass while the seam's internals were still in
the bundle"* — which is why **both** the installer and `updateDebugState` are guarded. Nothing
re-checked that the second guard was still there.

**The fix is not a bundler plugin.** The named fix was a `generateBundle` zero-rendered-bytes hook;
row one shows it would be redundant for the modules it can judge, and it cannot judge `globals.ts`
at all — that module legitimately ships while its guarded bodies must not.

`tests/unit/dev-guard-census.test.ts` pins the guard-line count per file. A removed guard reds it; so
does an added one, which is a *(vault 1.6)* which-side-of-the-gate decision worth stopping on. It is
a source-text gate, and the reason a behavioural one cannot reach is written in its header:
`import.meta.env.DEV` is `true` under vitest, so the guarded body always runs and there is nothing
to observe.

**Watched red** *(C1)*: with the `globals.ts` mutation live, `PASS (17) FAIL (1)`, the failure named
`src/debug/globals.ts still carries its 3 DEV guard(s)`. **Revert confirmed** *(C12)*: content
changed (guard lines 2 -> 3) **and** the failure count dropped by exactly one -> `PASS (18) FAIL (0)`.

Suite after: typecheck clean, **2172 passed / 0 failed**, up 18 from the 2154 baseline — the census's
own 18 tests, no other movement.

---

## A3 — the Phase 9 gate table, reconciled

**Status: RECONCILED. The answer is that Phase 9 is still not done.**

Full write-up in [phase-09-polish.md](phase-09-polish.md) §*"The reconciliation, and why Phase 9 is
still not done"*. Summary:

| verdict | criteria |
|---|---|
| ✅ **PASS**, substantiated with its evidence section cited | 9.6 · 9.8 · 9.10 · 9.11 |
| **OWED** — ran ×2, **failed**, fixed, and never handed back to its owner | 9.3 · 9.4 · 9.5 · 9.7 · 9.9 |
| **OWED** — the round ran but recorded no verdict either way | 9.1 · 9.2 |

The standard is the log's own: 9.5's row already said *"still UNRUN in the sense that matters:
neither owner brief has re-run it against this fix."* Nothing distinguishes its four siblings from
it, and applying that standard to one criterion and not the rest would be picking the answer first.

**`docs/PRD.md:36` therefore stays `—`.** The plan said *"mark anything you cannot substantiate as
still owed rather than passing"*, and seven cannot be substantiated. This is not a judgement on the
work — the mutation proofs, the integrator's own re-mutations and the Codex round are as thorough as
anything in this repository. It is that the **last step of the protocol was skipped**: criteria that
FAILED were fixed and never returned to their owners.

### The gate that should have caught this reds for the wrong reason

*(C1)* — the mutation the plan names: mark Phase 9 `✅ done` in `PRD.md`, expect
`docs-contract.test.ts` to demand a QA-LOG row per criterion.

It **did** go red — `PASS (91) FAIL (1)` — but the failure is:

```
Error: start marker not found: ## Phase 9
    at between (tests/unit/docs-contract.test.ts:61:24)
```

The check (`:260`) reads the section between `## Phase 9 ` and `## Vault-out — Phase 9` in
`docs/qa/phase-09-polish.md` and looks for a `| 9.N |` row per criterion. **This log has no
`## Phase 9 ` heading** — it opens at `## Task 0` — so the check throws on the start marker and
**never evaluates a single criterion row.**

That is loud rather than silent, so it is not a false green. But the failure names a missing heading,
not a missing verdict, and the obvious way to "fix" it is to add the heading — after which the check
would find the gate table at `:224` and pass on rows that say **OWED**, because it tests only that a
row *exists*. Recorded as a Tier-4-class defect for whoever closes Phase 9: the citation check needs
to read the row's verdict, not merely its presence.

**Revert confirmed** *(C12)*: content restored to `—`, and the failure count dropped by exactly one
→ `PASS (92) FAIL (0)`.

---

## B1 — the gear seam, and the six-times error in the inventory

**Status: FIXED.** `src/game/tiledEntities.ts` now compares the gear's **body** against every solid
with a half-open overlap, in world px.

**Two holes, not one, and one fixture cannot prove both.**

- **The seam.** A gear at exactly `solid.x + solid.width` satisfied *neither* abutting rect —
  `1920 < 1920` is false on the left, `1920 > 1920` is false on the right — so it passed the gate and
  sat inside collision geometry, permanently uncollectable. With `MAX_LEVEL_GEARS` that is an
  uncompletable level. On a 96 px grid **a seam is the default authoring outcome**.
- **The body.** The check tested the authored point. A centre 20 px above a floor's top edge is
  outside every rect while the real 72 × 72 body reaches 16 px into it.

### The policy was measured, not argued

The worry with "no gear body may overlap a solid" is that it refuses legal-but-tight authoring. So it
was measured first: across the **five shipped levels, all 45 gears, zero** have a body touching a
solid. The generator already keeps them clear, so the strict rule costs nothing today — and it is one
test where the alternative is two.

### ⚠️ The inventory's own number was wrong by 6×

It describes `GEAR_BOX` as *"72 × 72 world px"*. It is **12 local units**; `× RENDER_SCALE` is what
makes it 72. `describeGearProblem` had no scale argument, so a fix written from that sentence would
have used a 12 px box — **and still passed the seam fixture**. That is precisely why the two fixtures
are committed as separate rows.

### Watched red *(C1)*, both mutations named by the fix's own claim

| | mutation | result |
|---|---|---|
| before the fix | none — the fixtures as committed | `PASS (38) FAIL (2)`, both new rows named |
| A | drop `× RENDER_SCALE` (box 72 → 12) | `PASS (39) FAIL (1)` — **`gear-body-in-a-solid` alone**, seam green. The two fixtures are independent. |
| B | revert to the strict point test | `PASS (38) FAIL (2)` — both |

**Revert confirmed** *(C12)*: content restored and the failure count dropped to zero →
`PASS (40) FAIL (0)` on that file.

### One thing found on the way

`gear-inside-solid.fixture` derives from an **older** level-01 and carries a *second*, latent defect:
its sentry at (4800, 1344) 192 × 192 overlaps the gear at (4848, 1488). Nothing had ever seen it,
because the gear-in-solid check fired first and masked it. Both new fixtures move that gear clear so
each has exactly one defect — otherwise they would have been rejected for the wrong reason and the
rows would have gone green without proving anything.

**And the comment that let this ship.** `tiledPlacement.ts:41` read *"whose disposition reads 'Phase 8
owns it'. It does now."* Phase 8 added gear-vs-**enemy** body-vs-body and left gear-vs-**solid**
testing the point. The sentence was read as closing both, and the seam bug shipped through two more
phases. Corrected in place.

Suite after: typecheck clean, **2176 passed / 0 failed** — up 4 from 2172 (two rows, plus the two new
fixtures in `tilemap-data.test.ts`'s distinct-reason sweep).

---

## C2 — the run cycle against a wall, and the cost that never arrived

**Status: FIXED. Closes 2.3, and 3.5 with it.**

`tick.ts` step 11 passed `movingHorizontally = dir !== 0 || player.vx !== 0`. The `dir !== 0` term
asks *"is a key down"*, which against a wall is not the same question as *"is the body moving"*:
`resolveCollisions` pins `vx` to zero, the key stays held, and the player published `run` while
covering **no ground at all** — a whole run cycle of foot-slide, every cycle. **One call site**, so
the fix is one expression: `resolveState(player, player.vx !== 0, …)`.

### The deferral cost nothing, and that is the finding worth keeping

`player.ts:166-170` declined this for three phases with a **scheduling** reason: *"changing it moves
every locomotion assertion from Phase 2 onward."*

**It moved none.** The suite went 2176 → **2181**, which is exactly the five new tests in
`tests/unit/wall-pin-locomotion.test.ts` and nothing else. Not one Phase 2–9 locomotion assertion
needed re-taking. The feared cost is the whole reason this sat open, and it was never measured until
now — a deferral justified by an estimate that a single run would have refuted.

### Watched red *(C1)* — and the first red was a false one

The mutation is the fix's own inverse: keep the `dir !== 0` term. Pre-fix, with the gate committed:
`PASS (4) FAIL (1)`, the failure `expected 'run' to be 'idle'`.

⚠️ **The first run of this gate was a false green and it caught itself.** The test set `input.dir = 1`
— a field `InputSnapshot` does not have — so the player never moved, and every "pinned" assertion
passed *vacuously* while the counter-fixture (*"still runs when the body IS moving"*) failed with
`expected 0 to be greater than 0`. That counter-fixture exists precisely because a fix that made the
player never animate would satisfy all four other assertions, and it earned its place before the
fix was even written. **A gate that asserts only the absence of something can be satisfied by
nothing happening at all** — this session's own defect class, in the test I wrote to close it.

**Revert confirmed** *(C12)*: content changed and the failure count dropped by one → `PASS (5)
FAIL (0)` on the file, `2181 / 0` across the suite.

### What it does and does not take with it

- **3.5 (footstep phase after a wall pin): CLOSED.** Not by changing `advanceStride` — by removing
  the mid-cycle run there was to come back to. The cadence is still *locked, not phase-locked*, which
  is the recorded trade and is unchanged.
- **2.8 (goal run-in foot-slide): the state half is closed**, since a stationary body inside the dead
  zone now reads `idle`. The deceleration **ramp** the `ponytail:` comment names is a separate feel
  change and is not built — per the plan, it waits on a playtest that still finds a defect.

⚠️ One accounting note: the first version of the inline comment pushed `src/sim/tick.ts` from 394 to
406 lines and reddened `file-size.test.ts` — correctly. Trimmed to four lines (398); the full account
lives in the test file, which is where it is legible anyway.

---

## A1 / 0.2 — criterion 1.4, and the diagnosis that was wrong

**Status: FIXED. The inventory's recorded cause is refuted.**

§0.2 blamed a leftover `node_modules/.vite/deps_temp_<hash>/` from an interrupted optimizer run and
prescribed clearing the cache. **Measured, not assumed:**

| | criterion 1.4 |
|---|---|
| cache cleared, first run | **FAILED** — `Test timeout of 30000ms exceeded` |
| cache now warm, second run | **FAILED** again |

So the cache was never the variable. Measured directly against a dev server instead — three page
loads, one browser:

| load | to a terminal state |
|---|---|
| first | **33.4 s** |
| second | 3.2 s |
| third | 2.6 s |

`ready:true`, `bootError:null`, `sceneKey:'Game'` on all three. **The game is neither slow nor
hanging.** Vite optimizes dependencies and transforms on the **first page request**, not at server
start, and Phaser unbundled is ~1000 ES modules served one request at a time. `webServer` starts a
*fresh* server every run (`reuseExistingServer: false`), so whichever spec loads the page first pays
that 33 s alone inside its own 30 s budget. It is always 1.4, because it is first in the file — and
the two specs after it passed in ~4 s, which is the tell that was there all along.

### The fix moves the cost, it does not loosen a bound

`tests/e2e/globalSetup.ts` loads the page once and waits for a terminal state before any spec runs.
**No timeout changed.** `BOOT_TIMEOUT`, `REFUSAL_TIMEOUT` and the test timeout are untouched — the
inventory is explicit that a bound loose enough to survive a 33 s cold transform is loose enough to
hide a genuine hang *(vault 1.4)*, and `playwright.config.ts` already refuses that trade once for
`workers`.

It also makes a real hang **louder**: it now fails in warm-up, named, before any spec runs, instead
of presenting as one arbitrary spec timing out. A boot that reaches a *refusal* throws there too
rather than being warmed past in silence.

⚠️ Recorded against it: a `globalSetup` failure aborts with **zero tests collected**, which is the
`expected: 0, unexpected: 0` false-green shape `free-port.mjs` exists to warn about. The throw names
itself so the count has an explanation beside it. **Read the count, not the exit code.**

**Result:** `[e2e warmup] dev server warm in 32.9s (ready:true)` then `Running 14 tests using 1
worker` → **14 passed**, criterion 1.4 among them. It had failed 6 runs of 6.

**Not confirmed:** the inventory's suspicion that `npm run test:sim-isolated` poisons the dep cache.
Moot now — the warm-up absorbs a cold cache and a warm one alike, and the measurements above show
cache state was never what decided this. No line added to `CLAUDE.md §1`, because the claim it would
have recorded is not true.

---

## C3 / 2b.1 — the release radius, restored

**Status: FIXED. Owner reversal 2026-08-23 of user ruling D4 (2026-08-14).**

This knob has now been argued in both directions and **neither argument was wrong**:

|  | ruling |
|---|---|
| originally | `chaseSpeed` was *"deliberately escapable"* and a 720 px `releaseRadius` was the escape |
| **D4, 2026-08-14** | *"it should keep coming until I kill it."* `releaseRadius` **and** `CHASE_COMMIT_TICKS` deleted rather than re-tuned, on the argument that **a flag that cannot be un-set cannot flap** — genuinely stronger than hysteresis, since there is no gap to stand in the middle of |
| **2026-08-23, owner** | reversed. What D4 did not weigh is what permanence looks like from the other side: a scavenger that saw you once **stares from 851 px indefinitely and never patrols again**, found by playing |

`releaseRadius: 720` is back. **`CHASE_COMMIT_TICKS` is not**, and the guarantee it protected is
genuinely weaker now — that is stated in `enemies.ts`, `scavengerTuning.ts` and `enemyScavenger.ts`
rather than left for a reader to discover. The 240 px band between `detectRadius` 480 and
`releaseRadius` 720 is the whole of the replacement, so **`createScavenger` throws** if that band is
empty *(vault 2.11)* — equal radii is one threshold wearing two names, and a player standing on it
would be detected and released on alternate ticks forever.

The release goes through `releaseAggro`, never an inline `chasing = false`: it is now the **third**
exit beside the two deaths, and vault 5.3 requires they clear the same fields. An inline clear would
leave a live `attackCounter` behind — R5's bug arriving by a new route.

### Watched red *(C1)*: `PASS (0) FAIL (6)`, all six

Including `expected [Function] to throw` for the no-gap guard and `expected true to be false` for the
release itself.

### Twelve readings re-taken, none edited to match

The reversal moved twelve assertions across six files. Every one was **re-taken as a reading**, and
in each case the fixture's own stated intent decided the new number:

| file | what it is really about | change |
|---|---|---|
| `enemy-ai-lifecycle` ×3 | where a chaser stops relative to a **drop** | flee 5000 → 2400, return 200 → 1400 |
| `enemy-ai-scavenger` ×2 | leaving the **patrol zone**; bounding **chase** speed | 3000 → 1100, 99999 → 1100 |
| `enemy-ai-scavenger` ×1 | *"never gives up"* | **INVERTED, not deleted** — same 1000-tick scenario, opposite expectation |
| `enemy-view` ×3 | which **animation** a stalled chaser draws | 5000 → 500 |
| `enemy-wall-collision` ×1 | walking away from a **wall** | 0 → 1400 |
| `level-traversal` ×1 | **level geometry** — how far it can travel | `releaseRadius` disabled for the fixture |
| `respawn` ×1 | **death** as an exit, not distance | re-taken *inside* the band |

⚠️ Three of these were **quietly measuring the wrong thing** once the radius existed —
`never teleports` read `2.5` (patrol speed) while claiming to bound chase speed, and the
declared-key count fell 8 → 7 because a released subject can no longer ask for the `chase` key. All
three would have stayed green if the distances had been left alone and only the failing expectations
patched. That is the difference between re-taking a reading and editing a number.

Suite **2193 / 0**, up 6 from 2187 — the new file's six tests, nothing else net.

---

## B7 / 1b.3 — the 9b ordering, pinned

**Status: GATED. Owner ruling 2026-08-23: keep today's player-first order.**

`tick.ts` step 9b calls `applyPlayerAttack` then `applyWorldDamage`, so a killing blow lands before
the thing it killed can trade back. Recorded as **ungated for three phases** — *"swapping the two
calls fails no test"* — and raised to blocker-class for *"session 4"*, which did not do it.

### Both recorded arguments were beside the point

| | claim |
|---|---|
| `playerAttack.ts` | unreachable: to be in contact range you must already have taken contact damage, granting `IFRAME_TICKS` 45, longer than the 20-tick swing |
| `phase-05-combat-01-timings.md` (A1) | that is geometrically false — `ATTACK_BOX` reaches ~26 units beyond contact distance, so a dead zone exists |

⚠️ **A reach-only dead zone cannot discriminate the ordering at all.** No enemy damage happens out
there, so both orderings behave identically in it. A gate built on A1's zone would have been
decoration — the exact defect class this session exists to remove, and it was the plan's first
proposal until the Codex review caught it.

### What actually discriminates it: the freeze, not the kill

`applyPlayerAttack` freezes **both** bodies, and `applyWorldDamage` skips a frozen scavenger (*"a
frozen scavenger deals no damage"*, Phase 9). So on any tick the player strikes a scavenger whose
claw is already live:

- **player first (shipped)** — the scavenger is struck and frozen, contact damage skips it, the
  player takes nothing;
- **contact first** — the player is hurt and gains i-frames.

No kill and no dead zone required: an overlap and one live claw, which is the ordinary shape of
trading blows with a scavenger.

### The mutation, run

Swapping the two calls in step 9b: **`PASS (2195) FAIL (2)` across the whole suite — both failures in
`tick-9b-order.test.ts` and nowhere else.** That is simultaneously the proof the gate works and the
confirmation of the inventory's claim that nothing else covers this.

Under the swap the swing did not land *at all* (`expected 60 to be less than 60`): contact damage put
the player into `hurt`, which ended the attack state before it could resolve. Worse than predicted.

**Revert confirmed** *(C12)*: `PASS (2197) FAIL (0)`.

⚠️ Accounting: the first draft of the inline note took `src/sim/tick.ts` to 406 lines and reddened
`file-size.test.ts`, correctly. Trimmed to four lines (400 exactly); the argument lives in the test
file. Second time this session that a comment has hit that ceiling — `tick.ts` has no headroom left.

### A test-authoring trap worth recording

The i-frame assertion first read `expect(player.iFrameCounter).toBe(0)` and **failed on a correct
game**. The counter reads the opposite way round to the obvious guess: `world.ts` seeds it at
`IFRAME_TICKS` as the CLOSED sentinel, and taking damage sets it to **0** to OPEN the window. Now
asserted through `invulnerable()` *(vault 5.3 — do not restate a predicate at a call site)*.

---

## B9 / 1b.5 — STALE, and the test I wrote for it was deleted

**Status: NOT A DEFECT. No code change, no test added.** *(C11)*

The inventory says *"nothing swings the player's attack repeatedly against a live enemy and asserts
death — both tests set `hp = 0` directly"*, quoting T2, which **both** qa-expert briefs found
independently and called *"the gap that let P1 ship past the entire gate"*.

It was true when written and is not true now. `tests/unit/enemy-ai-lifecycle.test.ts:125` —
*"a CHASING scavenger, killed by real swings, stops chasing"* — drives twenty real swings through
`tick()` with a re-latched attack edge and asserts the death. Its own comment marks it as the
repair: *"what the old version of this test never established."* The claim survived in the QA log
because the log was never revisited, which is A0's whole subject.

### I wrote the test anyway, then deleted it, and the mutations are why

A 150-line `kill-by-swinging.test.ts` was written and passed 4/4. Before keeping it, three mutations
were run to find one it caught *alone*:

| mutation | failures across the suite, WITHOUT the new file |
|---|---|
| delete `enemy.hp = Math.max(0, enemy.hp - PLAYER_ATTACK_DAMAGE)` | **22** |
| `Math.max(0, …)` → `Math.max(1, …)` — damage lands, death impossible | **11** |
| `PLAYER_ATTACK_DAMAGE` 20 → 1000 — everything dies in one swing | **11** |

Every claim it made was already provable without it: the damage arithmetic, the death, the
proportionality between hp and swings, and the one-hit-per-swing rule (`hitstop.test.ts`'s *"one
swing costs one target one hit"*).

**So it was deleted.** A gate that cannot be the one to go red is not free — it is lines someone
maintains and a reader trusts. *(C2 inverted: a gate that cannot go red is decoration, and so is one
whose red is always somebody else's.)*

The honest outcome of this item is the reconciliation itself, and a QA-log claim corrected.

---

## B6 / 1b.2 — the music restarting at every level boundary

**Status: FIXED.**

`GameScene.create()` calls `createAudio`, which destroyed its predecessor and started both beds from
zero — so **music and ambience cut back to bar 1 at every level transition**. Recorded in Phase 7 as
LOW/RECORDED because *"no level transition exists yet; it becomes real in Phase 8"*. **Phase 8
shipped five levels and transitions.** The reason expired by its own terms and nobody re-read it —
the second item this session where that is the whole story.

### The constraint that shaped the fix

Criterion **7.5** counts `sound.sounds`, and vault 7.5 names the failure exactly: *"a stopped track is
still in `sound.sounds`, so a scene round-trip that stops and re-adds grows the list every time."*
**Beds accumulating is a worse bug than beds restarting**, so *"stop tearing them down"* is not the
fix. *"Start only what is not already playing"* is: `createAudio` now **retires** its predecessor —
unsubscribing the exact unlock handler, per vault 7.5 — and adopts the still-looping beds. The live
set stays at one of each. `destroyAudio`, which `BootScene.init()` calls on every boot, restart and
refusal, is still the real teardown.

### `createAudio` had NO unit test, and the reason is structural

The only file in `tests/` that named it was `file-size.test.ts`, counting its lines. `audio.ts`
imports `Phaser` as a **value** (`Phaser.Sound.Events.UNLOCKED`), so nothing in the unit suite can
import it without breaking `npm run test:sim-isolated`, which runs with Phaser uninstalled.

So the decision moved to `src/game/audioBeds.ts`, pure — `src/render/`'s pattern one layer over — and
`audio.ts` only applies it. That is what made a gate possible at all.

⚠️ Its **draw-path gate** is source-text, not behavioural. CLAUDE.md prefers behavioural and says so;
here it is unreachable for the same reason the module exists. Recorded rather than glossed. It pins
three things a refactor could quietly undo: the `bedsToStart`/`bedsMissing` call sites, the absence of
a second `BED_KEYS` list, and `liveBeds` being module-scope rather than per-manager.

### Watched red *(C1)*

Mutation: make `bedsToStart` ignore what is already playing — the restart behaviour restored.
`PASS (7) FAIL (2)`, and the two are exactly *"starts NOTHING when both are already looping"* and
*"starts only the one that stopped"*. **Revert confirmed** *(C12)*: `PASS (10) FAIL (0)`.

A counter-fixture earns its place here too: *"starts only the one that stopped, not both"* fails an
implementation that returns `[]` whenever **any** bed is playing — which would pass the
level-boundary assertion and leave ambience silent for the rest of the session.

Suite **2207 / 0**, build green. `docs/qa/phase-07-audio-02-gate-owners.md:78` corrected in place.

---

## Batch E / Tier 4 — the prose that contradicted the code

**Status: 4.1, 4.2, 4.3, 4.5 FIXED with a gate. 4.4 closed by B3 (owed). 4.6 not reached.**

| item | was | now |
|---|---|---|
| **4.1** | `playerTuning.ts:78` — *"Ticks each drawn locomotion frame is held. **Three**"* | **Two**, matching `LOCOMOTION_TICKS_PER_FRAME` nine lines below it |
| **4.2** | a table presented as current: `run 22.5 px / 3 ticks / speed 7.5` | **labelled** as the session-10 pre-re-shoot reading, with the live figures stated beside it and derived: `18.0 / 2 = 9.0`, `9.0 / 2 = 4.5` |
| **4.3** | `CLAUDE.md:23` — *"`run`'s stride is still provisional and is the number to distrust"* | `stridePxPerCycle` has been **dead since session 9**; distrust repointed at the live constants, and at the courier jump/fall art that actually is open |
| **4.5** | `ASSET-PIPELINE.md` §10 promised `assets:fetch` / `assets:verify`, and `assetSources.mjs` **printed an error telling the reader to run the first** | both corrected to what the repo can actually do. The scripts are **not** written — nothing has needed them badly enough to ask |

### The gate that stops it recurring

`tests/unit/foot-plant.test.ts` passed throughout, correctly: it asserts the **relation**
`ticksPerFrame × topSpeed === footPxPerFrame`, which held the whole time. The prose was unguarded.

`tests/unit/tuning-prose.test.ts` parses the numbers back out of the docstrings and asserts them
against the constants. **Watched red with the shipped defect itself** — restoring *"**Three**"* gives
`PASS (4) FAIL (1)`, naming the frame-dwell sentence. Revert → `PASS (5) FAIL (0)`.

⚠️ Its own limit is stated in its header: it makes these four numbers executable, not prose in
general. A stale rationale or a citation to a moved file is still invisible to it.

### Dead exports: two removed, one restored within the minute

`MeasuredStrides` and `EnemyStrides` were dead — no importer anywhere — and are gone.

🔴 **`strideTicks` was deleted with them, and put straight back.** The grep that "confirmed" it was
dead had been truncated by a `head -5`, hiding the two files that import it
(`anim-timing.test.ts`, `catalog-timings.test.ts` — the second checking that
`tools/gen/catalogTimings.mjs`'s mirror agrees). `MeasuredStrides`'s claim that it was *"still
exported and tested"* was **correct**, and I had written a comment calling that claim false.

`tsc` and four red tests caught it inside a minute, which is the system working. Recorded because the
near-miss is the lesson and it is this session's own subject inverted: **a deletion justified by a
grep is only as good as the grep, and `head` is not a filter.** Both the restoration and the reason
are written into `animTiming.ts` rather than quietly undone.

Suite **2212 / 0**, build green.

---
